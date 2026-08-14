// @ts-nocheck
import assert from "node:assert/strict";
import test from "node:test";
import { pool } from "@workspace/db";
import { PostgresKnowledgeManagementRuntime } from "../src/services/knowledge/postgresKnowledgeManagementRuntime.js";
import { deleteMerchantKnowledgePostgresData } from "../src/services/knowledge/postgresKnowledgeLifecycle.js";

const merchantIds = [
  "knowledge-lifecycle-merchant-a",
  "knowledge-lifecycle-merchant-b",
];

const fakeEmbedding = {
  providerId: "knowledge-lifecycle-fake",
  model: "knowledge-lifecycle-fake-v1",
  dimensions: 2,
  async embed() {
    return [1, 0];
  },
};

async function seedMerchant(id: string, phone: string): Promise<void> {
  await pool.query(`DELETE FROM accounts WHERE id = $1`, [id]);
  await pool.query(
    `INSERT INTO accounts
       (id, kind, phone, password_hash, state, language, phone_verified,
        password_version, security_version, session_version, created_at, updated_at)
     VALUES
       ($1, 'merchant', $2, 'knowledge-lifecycle-test-hash', 'active', 'ar', true,
        1, 1, 1, NOW(), NOW())`,
    [id, phone],
  );
  await pool.query(
    `INSERT INTO merchants
       (id, account_id, profile_kind, owner_name, store_name, activity_type,
        status, account_status, onboarding_status, trial_status, signup_source,
        created_at, updated_at)
     VALUES
       ($1, $1, 'merchant', $2, $3, 'retail',
        'approved', 'approved', 'channel_connected', 'eligible', 'direct',
        NOW(), NOW())`,
    [id, `Owner ${id}`, `Store ${id}`],
  );
}

async function seedKnowledge(merchantId: string): Promise<void> {
  const management = new PostgresKnowledgeManagementRuntime({
    embeddingProvider: fakeEmbedding,
  });

  await management.createSavedAnswer({
    merchantId,
    category: "custom",
    questionPattern: `سؤال محفوظ ${merchantId}`,
    answerText: `جواب محفوظ ${merchantId}`,
    language: "ar",
  });

  const request = await management.createTrainingRequest({
    merchantId,
    customerText: `سؤال تعليمي ${merchantId}`,
    detectedIntent: "custom_faq",
    detectedLanguage: "ar",
    reason: "knowledge_gap",
  });

  await management.approveTrainingRequest({
    merchantId,
    id: request.id,
    expectedVersion: request.version,
    approvedAnswer: `جواب معتمد ${merchantId}`,
    keywords: ["اختبار", "معتمد"],
  });
}

async function tenantCount(table: string, merchantId: string): Promise<number> {
  const result = await pool.query(
    `SELECT COUNT(*)::int AS count FROM ${table} WHERE merchant_id = $1`,
    [merchantId],
  );
  return result.rows[0].count;
}

test("merchant Knowledge lifecycle deletion is PostgreSQL-authoritative and tenant-scoped", async (t) => {
  assert.ok(process.env.DATABASE_URL, "DATABASE_URL is required");

  await seedMerchant(merchantIds[0], "07990000011");
  await seedMerchant(merchantIds[1], "07990000012");
  await seedKnowledge(merchantIds[0]);
  await seedKnowledge(merchantIds[1]);

  t.after(async () => {
    await pool.query(`DELETE FROM accounts WHERE id = ANY($1::text[])`, [merchantIds]);
    await pool.end();
  });

  const beforeB = {
    saved: await tenantCount("saved_answers", merchantIds[1]),
    training: await tenantCount("training_requests", merchantIds[1]),
    learned: await tenantCount("learned_answers", merchantIds[1]),
    audit: await tenantCount("knowledge_audit_events", merchantIds[1]),
    embeddings: await tenantCount("knowledge_embeddings", merchantIds[1]),
  };

  const deleted = await deleteMerchantKnowledgePostgresData(merchantIds[0]);
  assert.deepEqual(deleted, {
    savedAnswers: 1,
    trainingRequests: 1,
    learnedAnswers: 1,
  });

  for (const table of [
    "saved_answers",
    "training_requests",
    "learned_answers",
    "knowledge_audit_events",
    "knowledge_embeddings",
  ]) {
    assert.equal(
      await tenantCount(table, merchantIds[0]),
      0,
      `${table} must be empty for the deleted merchant`,
    );
  }

  assert.deepEqual(
    {
      saved: await tenantCount("saved_answers", merchantIds[1]),
      training: await tenantCount("training_requests", merchantIds[1]),
      learned: await tenantCount("learned_answers", merchantIds[1]),
      audit: await tenantCount("knowledge_audit_events", merchantIds[1]),
      embeddings: await tenantCount("knowledge_embeddings", merchantIds[1]),
    },
    beforeB,
    "Knowledge deletion must not cross merchant tenant boundaries",
  );
});
