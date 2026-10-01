import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

test("merchant deletion honors RLS for quiescence, purge and physical cleanup", { timeout: 60_000 }, async () => {
  const originalUrl = process.env.DATABASE_URL;
  const originalAuthority = process.env.FAWRI_OPERATIONAL_POSTGRES_AUTHORITY;
  const originalData = process.env.FAWRI_DATA_DIR;
  const targetUrl = new URL(originalUrl);
  assert.ok(["127.0.0.1", "localhost"].includes(targetUrl.hostname));
  assert.ok(["/fawri_ci", "/fawri_final_audit"].includes(targetUrl.pathname));
  const { Pool } = createRequire(import.meta.resolve("@workspace/db"))("pg");
  const admin = new Pool({ connectionString: originalUrl, connectionTimeoutMillis: 5_000 });
  const suffix = randomUUID().replaceAll("-", "").slice(0, 12);
  const role = `deletion_rls_${suffix}`;
  const owner = `deletion-owner-${suffix}`;
  const merchants = [0, 1, 2].map(i => `deletion-${i}-${suffix}`);
  const dataRoot = fs.mkdtempSync(path.join(os.tmpdir(), "fawri-deletion-rls-"));
  let runtimePool;
  let roleCreated = false;
  try {
    await admin.query(`CREATE ROLE ${role} NOLOGIN NOSUPERUSER NOBYPASSRLS NOINHERIT`);
    roleCreated = true;
    await admin.query(`GRANT USAGE ON SCHEMA public TO ${role}`);
    await admin.query(`GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ${role}`);
    await admin.query(`GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO ${role}`);
    await admin.query("INSERT INTO accounts(id,kind,phone,password_hash,state) VALUES($1,'admin',$2,'synthetic','active')", [owner, `+1888${Date.now().toString().slice(-8)}9`]);
    await admin.query("INSERT INTO admin_profiles(id,account_id,profile_kind,display_name,role,enabled,must_change_password) VALUES($1,$1,'admin','Synthetic owner','owner_admin',true,false)", [owner]);
    for (const [i, id] of merchants.entries()) {
      await admin.query("INSERT INTO accounts(id,kind,phone,password_hash,state) VALUES($1,'merchant',$2,'synthetic','suspended')", [id, `+1888${Date.now().toString().slice(-8)}${i}`]);
      await admin.query("INSERT INTO merchants(id,account_id,owner_name,store_name,activity_type,status,account_status) VALUES($1,$1,'Synthetic','Synthetic','retail','suspended','suspended')", [id]);
      await admin.query("INSERT INTO products(id,merchant_id,name) VALUES($1,$2,'Private synthetic product')", [`product-${id}`, id]);
      await admin.query("INSERT INTO saved_answers(id,merchant_id,category,question_pattern,normalized_question,answer_text,language) VALUES($1,$2,'custom','Synthetic?','synthetic','Private synthetic answer','en')", [`answer-${id}`, id]);
    }
    await admin.query("INSERT INTO background_jobs(id,type,dedupe_key,merchant_id,status) VALUES($1,'audit.test',$1,$2,'queued')", [`job-${suffix}`, merchants[2]]);
    targetUrl.searchParams.set("options", `-c role=${role}`);
    process.env.DATABASE_URL = targetUrl.toString();
    process.env.FAWRI_OPERATIONAL_POSTGRES_AUTHORITY = "required";
    process.env.FAWRI_DATA_DIR = dataRoot;
    runtimePool = (await import("@workspace/db")).pool;
    runtimePool.options.max = 1;
    runtimePool.options.connectionTimeoutMillis = 5_000;
    assert.equal((await runtimePool.query("SELECT current_user AS name")).rows[0].name, role);
    const { assertProductionDatabaseRlsReady } = await import("../src/services/postgresRuntimeRlsSecurity.ts");
    await assertProductionDatabaseRlsReady({ NODE_ENV: "production", FAWRI_DEPLOYMENT_MODE: "production", FAWRI_OPERATIONAL_POSTGRES_AUTHORITY: "required" });
    assert.equal((await runtimePool.query("SELECT count(*)::int AS count FROM products")).rows[0].count, 0);
    const management = await import("../src/services/postgresMerchantManagementAuthority.ts");
    const media = await import("../src/services/catalogMediaStorage.ts");
    const cleanup = await import("../src/services/merchantPhysicalMediaCleanup.ts");
    const images = [];
    for (const id of merchants.slice(0, 2)) {
      const upload = await media.storeCatalogImage({ merchantId: id, buffer: Buffer.from([0xff, 0xd8, 0xff, 0xd9]), suppliedMime: "image/jpeg" });
      images.push(path.join(dataRoot, "catalog-media", upload.storage_key));
      await admin.query("INSERT INTO catalog_image_references(id,merchant_id,product_id,storage_key,ordinal) VALUES($1,$2,$3,$4,0)", [`image-${id}`, id, `product-${id}`, upload.storage_key]);
    }
    const requests = [];
    for (const merchantId of [merchants[0], merchants[2]]) {
      requests.push(await management.createDeletionRequestPostgres({ merchantId, actorAdminId: owner, reason: "policy_violation", details: "Synthetic RLS regression" }));
    }
    await assert.rejects(
      cleanup.completeMerchantDeletionWithPhysicalMediaCleanup({ merchantId: merchants[2], deletionRequestId: requests[1].id, actorAdminId: owner }),
      { code: "MERCHANT_DELETION_OPERATIONS_PENDING" },
      "RLS must not hide an active job from the pre-deletion guard",
    );
    assert.equal((await admin.query("SELECT state FROM accounts WHERE id=$1", [merchants[2]])).rows[0].state, "suspended");
    const result = await cleanup.completeMerchantDeletionWithPhysicalMediaCleanup({ merchantId: merchants[0], deletionRequestId: requests[0].id, actorAdminId: owner });
    assert.equal(result.ok, true);
    for (const table of ["products", "saved_answers", "catalog_image_references"]) {
      assert.equal((await admin.query(`SELECT count(*)::int AS count FROM ${table} WHERE merchant_id=$1`, [merchants[0]])).rows[0].count, 0, `${table} must be purged`);
      assert.equal((await admin.query(`SELECT count(*)::int AS count FROM ${table} WHERE merchant_id=$1`, [merchants[1]])).rows[0].count, 1, `${table} must preserve the other tenant`);
    }
    assert.equal(fs.existsSync(images[0]), false);
    assert.equal(fs.existsSync(images[1]), true);
    assert.equal((await admin.query("SELECT state FROM accounts WHERE id=$1", [merchants[0]])).rows[0].state, "closed");
    assert.equal((await runtimePool.query("SELECT count(*)::int AS count FROM products")).rows[0].count, 0, "pooled connection must not retain tenant context");
  } finally {
    await runtimePool?.end();
    process.env.DATABASE_URL = originalUrl;
    if (originalAuthority === undefined) delete process.env.FAWRI_OPERATIONAL_POSTGRES_AUTHORITY;
    else process.env.FAWRI_OPERATIONAL_POSTGRES_AUTHORITY = originalAuthority;
    if (originalData === undefined) delete process.env.FAWRI_DATA_DIR;
    else process.env.FAWRI_DATA_DIR = originalData;
    fs.rmSync(dataRoot, { recursive: true, force: true });
    try {
      if (roleCreated) {
        await admin.query(`DROP OWNED BY ${role}`);
        await admin.query(`DROP ROLE ${role}`);
      }
    } finally { await admin.end(); }
  }
});
