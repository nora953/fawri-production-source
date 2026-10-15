// @ts-nocheck
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { pool } from "@workspace/db";
import { KnowledgeDecisionEngine } from "../src/services/ai/knowledgeDecisionEngine.js";
import { learnFromMerchantManualReply } from "../src/services/merchantManualKnowledgeLearning.js";
import { PostgresKnowledgeManagementRuntime } from "../src/services/knowledge/postgresKnowledgeManagementRuntime.js";
import { PostgresKnowledgeRuntime } from "../src/services/knowledge/postgresKnowledgeRuntime.js";

const fakeEmbedding = {
  providerId: "knowledge-learning-cycle-test",
  model: "knowledge-learning-cycle-test-v1",
  dimensions: 2,
  async embed(text: string) {
    const normalized = String(text || "").toLowerCase();
    if (normalized.includes("gift") || normalized.includes("wrap")) {
      return [1, 0];
    }
    return [0, 1];
  },
};

test(
  "merchant knowledge gap becomes reusable approved knowledge without crossing tenant boundary",
  { timeout: 60_000 },
  async (t) => {
    assert.ok(process.env.DATABASE_URL, "DATABASE_URL is required");

    const parsed = new URL(process.env.DATABASE_URL);
    assert.ok(
      ["127.0.0.1", "localhost"].includes(parsed.hostname),
      "only local disposable PostgreSQL is permitted",
    );
    assert.ok(
      ["/fawri_ci", "/fawri_final_audit"].includes(parsed.pathname),
      "only disposable CI databases are permitted",
    );

    const suffix = randomUUID().replaceAll("-", "").slice(0, 12);
    const merchantA = `knowledge-cycle-a-${suffix}`;
    const merchantB = `knowledge-cycle-b-${suffix}`;
    const merchants = [merchantA, merchantB];

    t.after(async () => {
      await pool.query(
        `DELETE FROM accounts WHERE id = ANY($1::text[])`,
        [merchants],
      );
      await pool.end();
    });

    for (const [index, merchantId] of merchants.entries()) {
      await pool.query(
        `INSERT INTO accounts
           (id, kind, phone, password_hash, state, language, phone_verified,
            password_version, security_version, session_version, created_at, updated_at)
         VALUES
           ($1, 'merchant', $2, 'knowledge-cycle-test-hash', 'active', 'en', true,
            1, 1, 1, NOW(), NOW())`,
        [merchantId, `+1555000${String(index + 1).padStart(4, "0")}`],
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
        [merchantId, `Owner ${merchantId}`, `Store ${merchantId}`],
      );

      await pool.query(
        `INSERT INTO merchant_settings (merchant_id) VALUES ($1)`,
        [merchantId],
      );
    }

    const runtime = new PostgresKnowledgeRuntime({
      embeddingProvider: fakeEmbedding,
      semanticThreshold: 0.58,
    });

    const management = new PostgresKnowledgeManagementRuntime({
      embeddingProvider: fakeEmbedding,
    });

    const engine = new KnowledgeDecisionEngine({
      runtime,
      embeddingProvider: fakeEmbedding,
      factResolver: { async resolve() { return null; } },
      policyResolver: null,
      semanticThreshold: 0.58,
    });

    const firstQuestion = "Do you offer gift wrapping?";

    const firstDecision = await engine.decide({
      merchantId: merchantA,
      customerText: firstQuestion,
      languageHint: "en",
    });

    assert.equal(firstDecision.action, "handoff");
    assert.equal(firstDecision.reasonCode, "NO_TRUSTED_ANSWER");
    assert.ok(firstDecision.trainingRequestId);

    const trainingId = firstDecision.trainingRequestId;

    const training = await management.getTrainingRequest(
      merchantA,
      trainingId,
    );

    assert.ok(training);
    assert.equal(training.merchantId, merchantA);
    assert.equal(training.detectedIntent, "knowledge_gap");
    assert.equal(training.status, "pending_merchant_reply");

    assert.equal(
      await management.getTrainingRequest(merchantB, trainingId),
      null,
      "another merchant must not see the training request",
    );

    const merchantAnswer =
      "Yes. Gift wrapping is available on request.";

    const learned = await learnFromMerchantManualReply({
      merchantId: merchantA,
      trainingRequestId: trainingId,
      merchantReply: merchantAnswer,
      runtime: management,
    });

    assert.equal(learned.learned, true);
    assert.equal(learned.reasonCode, "MANUAL_REPLY_LEARNED");
    assert.equal(learned.trainingRequestId, trainingId);
    assert.ok(learned.learnedAnswerId);

    const approved = await management.getTrainingRequest(
      merchantA,
      trainingId,
    );

    assert.ok(approved);
    assert.equal(approved.status, "approved");

    const learnedRow = await pool.query(
      `SELECT merchant_id, training_request_id, answer_text,
              source, approval_status, safe_to_auto_reply
         FROM learned_answers
        WHERE id = $1`,
      [learned.learnedAnswerId],
    );

    assert.equal(learnedRow.rows.length, 1);
    assert.equal(learnedRow.rows[0].merchant_id, merchantA);
    assert.equal(learnedRow.rows[0].training_request_id, trainingId);
    assert.equal(learnedRow.rows[0].answer_text, merchantAnswer);
    assert.equal(learnedRow.rows[0].source, "merchant_approved");
    assert.equal(learnedRow.rows[0].approval_status, "approved");
    assert.equal(learnedRow.rows[0].safe_to_auto_reply, true);

    const laterDecision = await engine.decide({
      merchantId: merchantA,
      customerText: "Do you provide gift wrapping?",
      languageHint: "en",
    });

    assert.equal(laterDecision.action, "reply");
    assert.equal(laterDecision.stage, "semantic_retrieval");
    assert.equal(laterDecision.source, "merchant_approved");
    assert.equal(laterDecision.answerText, merchantAnswer);
    assert.equal(laterDecision.requiresMerchantApproval, false);
    assert.equal(laterDecision.trainingRequestId, null);
    assert.equal(laterDecision.matchedRecordId, learned.learnedAnswerId);

    const otherMerchantDecision = await engine.decide({
      merchantId: merchantB,
      customerText: "Do you provide gift wrapping?",
      languageHint: "en",
    });

    assert.equal(otherMerchantDecision.action, "handoff");
    assert.equal(otherMerchantDecision.reasonCode, "NO_TRUSTED_ANSWER");
    assert.notEqual(
      otherMerchantDecision.matchedRecordId,
      learned.learnedAnswerId,
    );

    const leaked = await pool.query(
      `SELECT COUNT(*)::int AS count
         FROM learned_answers
        WHERE merchant_id = $1
          AND id = $2`,
      [merchantB, learned.learnedAnswerId],
    );

    assert.equal(
      leaked.rows[0].count,
      0,
      "learned knowledge must remain private to its merchant tenant",
    );
  },
);
