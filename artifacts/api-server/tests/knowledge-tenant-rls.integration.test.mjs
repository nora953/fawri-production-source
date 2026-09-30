import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";
import test from "node:test";

test("default knowledge services preserve tenant RLS with a reused restricted connection", { timeout: 60_000 }, async () => {
  assert.ok(process.env.DATABASE_URL, "a disposable DATABASE_URL is required");
  const require = createRequire(import.meta.resolve("@workspace/db"));
  const { Pool } = require("pg");
  const originalUrl = process.env.DATABASE_URL;
  const targetUrl = new URL(originalUrl);
  assert.ok(["127.0.0.1", "localhost"].includes(targetUrl.hostname), "only local disposable PostgreSQL is permitted");
  assert.ok(["/fawri_ci", "/fawri_final_audit"].includes(targetUrl.pathname), "only the named disposable databases are permitted");
  const admin = new Pool({ connectionString: originalUrl, connectionTimeoutMillis: 5_000 });
  const suffix = randomUUID().replaceAll("-", "").slice(0, 12);
  const role = `knowledge_rls_${suffix}`;
  const tenants = [`knowledge-a-${suffix}`, `knowledge-b-${suffix}`];
  let runtimePool;
  let roleCreated = false;
  try {
    await admin.query(`CREATE ROLE ${role} NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS`);
    roleCreated = true;
    await admin.query(`GRANT USAGE ON SCHEMA public TO ${role}`);
    await admin.query(`GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ${role}`);
    for (const [index, id] of tenants.entries()) {
      await admin.query("INSERT INTO accounts(id,kind,phone,password_hash) VALUES($1,'merchant',$2,'synthetic-test-hash')",
        [id, `+1999${Date.now().toString().slice(-8)}${index}`]);
      await admin.query(`INSERT INTO merchants(id,account_id,owner_name,store_name,activity_type,status,account_status)
        VALUES($1,$1,'RLS test',$1,'electronics','approved','approved')`, [id]);
      await admin.query("INSERT INTO merchant_settings(merchant_id) VALUES($1)", [id]);
      await admin.query(`INSERT INTO saved_answers(id,merchant_id,category,question_pattern,normalized_question,answer_text,language)
        VALUES($1,$2,'custom','Gift wrapping?','gift wrapping','Yes','en')`, [`saved-${id}`, id]);
    }

    // Authenticate with the disposable CI administrator, but start EVERY runtime
    // connection as the restricted role. The application's real default pool and
    // SQL adapter are used; no fake query client or database owner bypass is used.
    const runtimeUrl = new URL(originalUrl);
    runtimeUrl.searchParams.set("options", `-c role=${role}`);
    process.env.DATABASE_URL = runtimeUrl.toString();
    const db = await import("@workspace/db");
    runtimePool = db.pool;
    runtimePool.options.max = 1;
    runtimePool.options.connectionTimeoutMillis = 5_000;
    assert.equal((await runtimePool.query("SELECT current_user AS name")).rows[0].name, role);
    const { assertProductionDatabaseRlsReady } = await import("../src/services/postgresRuntimeRlsSecurity.ts");
    await assertProductionDatabaseRlsReady({ NODE_ENV: "production", FAWRI_OPERATIONAL_POSTGRES_AUTHORITY: "required" });
    const knowledge = await import("../src/services/knowledge/postgresKnowledgeRuntime.ts");
    const { PostgresKnowledgeManagementRuntime } = await import("../src/services/knowledge/postgresKnowledgeManagementRuntime.ts");
    const { deleteMerchantKnowledgePostgresData } = await import("../src/services/knowledge/postgresKnowledgeLifecycle.ts");
    const embeddingProvider = { providerId: "rls-test", model: "rls-test-v1", dimensions: 2, async embed() { return [1, 0]; } };
    const management = new PostgresKnowledgeManagementRuntime({ embeddingProvider });
    const runtime = new knowledge.PostgresKnowledgeRuntime({ embeddingProvider });

    const lists = await Promise.all(tenants.map(id => management.listSavedAnswers(id)));
    assert.deepEqual(lists.map(rows => rows.map(row => row.merchantId)), tenants.map(id => [id]));
    const created = await Promise.all(tenants.map(merchantId => management.createSavedAnswer({
      merchantId, category: "custom", questionPattern: "Gift bag?", answerText: "A paper bag", language: "en",
    })));
    assert.deepEqual(created.map(row => row.merchantId), tenants);
    const semantic = await runtime.retrieveSemanticMatch({ merchantId: tenants[1], query: "Gift bag?", language: "en" });
    assert.equal(semantic?.document.id, created[1].id);
    assert.equal(semantic?.document.merchantId, tenants[1]);
    assert.equal((await runtime.listApprovedSemanticDocuments(tenants[0])).length, 2);
    const found = await runtime.findApprovedSavedAnswer({ merchantId: tenants[0], customerText: "Gift wrapping?", language: "en" });
    assert.equal(found?.merchantId, tenants[0]);
    const policy = await new knowledge.PostgresMerchantKnowledgePolicyResolver().resolve(tenants[1]);
    assert.equal(policy.merchantId, tenants[1]);
    const training = await runtime.createTrainingRequest({ merchantId: tenants[0], customerText: "Can you gift wrap?", reason: "knowledge_gap" });
    assert.equal(training.merchantId, tenants[0]);
    assert.equal((await management.getTrainingRequest(tenants[1], training.id)), null);

    const sql = knowledge.getPostgresKnowledgeSqlClient();
    await assert.rejects(() => sql.query("SELECT 1"), { code: "KNOWLEDGE_MERCHANT_REQUIRED" });
    const scopedA = knowledge.knowledgeSqlForMerchant(sql, tenants[0]);
    const scopedB = knowledge.knowledgeSqlForMerchant(sql, tenants[1]);
    await assert.rejects(() => scopedA.transaction(async tx => {
      await tx.query(`INSERT INTO saved_answers(id,merchant_id,category,question_pattern,normalized_question,answer_text,language)
        VALUES($1,$2,'custom','Rollback?','rollback','No','en')`, [`rollback-${suffix}`, tenants[0]]);
      throw new Error("intentional rollback");
    }), /intentional rollback/);
    await assert.rejects(() => scopedA.query(`INSERT INTO saved_answers(id,merchant_id,category,question_pattern,normalized_question,answer_text,language)
      VALUES($1,$2,'custom','Wrong tenant?','wrong tenant','No','en')`, [`wrong-${suffix}`, tenants[1]]), /row-level security/i);
    const rowsB = await scopedB.query("SELECT merchant_id FROM saved_answers");
    assert.equal(rowsB.rows.length, 2);
    assert.ok(rowsB.rows.every(row => row.merchant_id === tenants[1]));
    assert.equal((await admin.query("SELECT count(*)::int AS count FROM saved_answers WHERE id=$1", [`rollback-${suffix}`])).rows[0].count, 0);
    assert.equal((await runtimePool.query("SELECT count(*)::int AS count FROM saved_answers")).rows[0].count, 0,
      "tenant context must not survive transaction completion on a reused connection");
    const deleted = await deleteMerchantKnowledgePostgresData(tenants[0]);
    assert.equal(deleted.savedAnswers, 2);
    assert.equal(deleted.trainingRequests, 1);
    assert.equal((await management.listSavedAnswers(tenants[1])).length, 2);
  } finally {
    if (runtimePool) await runtimePool.end();
    process.env.DATABASE_URL = originalUrl;
    try {
      if (roleCreated) {
        for (const table of ["knowledge_embeddings", "learned_answers", "training_requests", "saved_answers", "knowledge_audit_events"])
          await admin.query(`DELETE FROM ${table} WHERE merchant_id = ANY($1::text[])`, [tenants]);
        await admin.query("DELETE FROM accounts WHERE id = ANY($1::text[])", [tenants]);
        await admin.query(`DROP OWNED BY ${role}`);
        await admin.query(`DROP ROLE ${role}`);
      }
    } finally { await admin.end(); }
  }
});
