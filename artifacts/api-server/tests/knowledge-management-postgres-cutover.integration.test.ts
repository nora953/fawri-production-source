// @ts-nocheck
import assert from "node:assert/strict";
import test from "node:test";
import { pool } from "@workspace/db";
import { KnowledgeDecisionEngine } from "../src/services/ai/knowledgeDecisionEngine.js";
import {
  PostgresKnowledgeManagementRuntime,
} from "../src/services/knowledge/postgresKnowledgeManagementRuntime.js";
import {
  PostgresKnowledgeRuntime,
} from "../src/services/knowledge/postgresKnowledgeRuntime.js";

const merchantIds = [
  "knowledge-cutover-merchant-a",
  "knowledge-cutover-merchant-b",
];

const fakeEmbedding = {
  providerId: "knowledge-cutover-fake",
  model: "knowledge-cutover-fake-v1",
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
       ($1, 'merchant', $2, 'knowledge-cutover-test-hash', 'active', 'ar', true,
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

function decisionEngine(): KnowledgeDecisionEngine {
  return new KnowledgeDecisionEngine({
    runtime: new PostgresKnowledgeRuntime({ embeddingProvider: fakeEmbedding }),
    policyResolver: null,
    factResolver: { async resolve() { return null; } },
  });
}

test("merchant Knowledge management and decision runtime share one PostgreSQL authority", async (t) => {
  assert.ok(process.env.DATABASE_URL, "DATABASE_URL is required");

  await seedMerchant(merchantIds[0], "07990000001");
  await seedMerchant(merchantIds[1], "07990000002");

  t.after(async () => {
    await pool.query(`DELETE FROM accounts WHERE id = ANY($1::text[])`, [merchantIds]);
    await pool.end();
  });

  const managementA = new PostgresKnowledgeManagementRuntime({
    embeddingProvider: fakeEmbedding,
  });
  const engineA = decisionEngine();

  await t.test("Saved Answer written by merchant management is immediately visible to decision runtime", async () => {
    const saved = await managementA.createSavedAnswer({
      merchantId: merchantIds[0],
      category: "return_exchange",
      questionPattern: "ما هي سياسة الاستبدال؟",
      answerText: "الاستبدال متاح خلال سبعة أيام.",
      language: "ar",
    });

    const persisted = await pool.query(
      `SELECT merchant_id, normalized_question, source, active, version
         FROM saved_answers
        WHERE id = $1 AND merchant_id = $2`,
      [saved.id, merchantIds[0]],
    );
    assert.equal(persisted.rowCount, 1);
    assert.equal(persisted.rows[0].source, "merchant_approved");
    assert.equal(persisted.rows[0].active, true);
    assert.equal(persisted.rows[0].version, 1);

    const embedding = await pool.query(
      `SELECT knowledge_kind, knowledge_id, embedding_model, dimensions
         FROM knowledge_embeddings
        WHERE merchant_id = $1 AND knowledge_kind = 'saved_answer' AND knowledge_id = $2`,
      [merchantIds[0], saved.id],
    );
    assert.equal(embedding.rowCount, 1);
    assert.equal(embedding.rows[0].embedding_model, fakeEmbedding.model);
    assert.equal(embedding.rows[0].dimensions, fakeEmbedding.dimensions);

    const decision = await engineA.decide({
      merchantId: merchantIds[0],
      customerText: "ما هي سياسة الاستبدال؟",
      languageHint: "ar",
    });
    assert.equal(decision.action, "reply");
    assert.equal(decision.stage, "approved_saved_answer");
    assert.equal(decision.matchedRecordId, saved.id);
    assert.equal(decision.answerText, "الاستبدال متاح خلال سبعة أيام.");
  });

  await t.test("Saved Answer management rejects invalid categories without creating a row", async () => {
    await assert.rejects(
      () =>
        managementA.createSavedAnswer({
          merchantId: merchantIds[0],
          category: "shipping",
          questionPattern: "هل توجد فئة غير قانونية؟",
          answerText: "يجب ألا تحفظ هذه الإجابة.",
          language: "ar",
        }),
      (error: unknown) =>
        (error as { code?: string }).code === "INVALID_SAVED_ANSWER_CATEGORY",
    );

    const invalid = await pool.query(
      `SELECT id FROM saved_answers
        WHERE merchant_id = $1 AND question_pattern = $2`,
      [merchantIds[0], "هل توجد فئة غير قانونية؟"],
    );
    assert.equal(invalid.rowCount, 0);
  });

  await t.test("Saved Answer management pagination exposes every record without overlap", async () => {
    const extraOne = await managementA.createSavedAnswer({
      merchantId: merchantIds[0],
      category: "delivery",
      questionPattern: "متى يصل الطلب؟",
      answerText: "يصل الطلب حسب منطقة التوصيل.",
      language: "ar",
    });
    const extraTwo = await managementA.createSavedAnswer({
      merchantId: merchantIds[0],
      category: "payment",
      questionPattern: "ما طرق الدفع؟",
      answerText: "طرق الدفع المعتمدة تظهر عند إتمام الطلب.",
      language: "ar",
    });

    const firstPage = await managementA.listSavedAnswersPage(merchantIds[0], {
      limit: 2,
    });
    assert.equal(firstPage.answers.length, 2);
    assert.ok(firstPage.nextCursor);

    const secondPage = await managementA.listSavedAnswersPage(merchantIds[0], {
      limit: 2,
      beforeUpdatedAt: firstPage.nextCursor!.updatedAt,
      beforeId: firstPage.nextCursor!.id,
    });
    assert.equal(secondPage.answers.length, 1);
    assert.equal(secondPage.nextCursor, null);

    const pagedIds = [...firstPage.answers, ...secondPage.answers].map((item) => item.id);
    assert.equal(new Set(pagedIds).size, 3);
    assert.ok(pagedIds.includes(extraOne.id));
    assert.ok(pagedIds.includes(extraTwo.id));

    const fullList = await managementA.listSavedAnswers(merchantIds[0]);
    assert.deepEqual(
      [...pagedIds].sort(),
      fullList.map((item) => item.id).sort(),
    );

    const searchOlderRecord = await managementA.listSavedAnswersPage(merchantIds[0], {
      limit: 1,
      search: "سياسة الاستبدال",
    });
    assert.equal(searchOlderRecord.answers.length, 1);
    assert.equal(searchOlderRecord.answers[0].questionPattern, "ما هي سياسة الاستبدال؟");
    assert.equal(searchOlderRecord.nextCursor, null);

    const categorySearch = await managementA.listSavedAnswersPage(merchantIds[0], {
      limit: 1,
      search: "لا يطابق النص",
      categories: ["delivery"],
    });
    assert.equal(categorySearch.answers.length, 1);
    assert.equal(categorySearch.answers[0].id, extraOne.id);
    assert.equal(categorySearch.nextCursor, null);

    const literalWildcardSearch = await managementA.listSavedAnswersPage(merchantIds[0], {
      limit: 10,
      search: "%",
    });
    assert.equal(literalWildcardSearch.answers.length, 0);
    assert.equal(literalWildcardSearch.nextCursor, null);
  });

  await t.test("Training Request created by decision runtime is visible and approvable by merchant management", async () => {
    const managementB = new PostgresKnowledgeManagementRuntime({
      embeddingProvider: fakeEmbedding,
    });
    const engineB = decisionEngine();

    const firstDecision = await engineB.decide({
      merchantId: merchantIds[1],
      customerText: "هل يمكن إضافة بطاقة تهنئة للهدية؟",
      languageHint: "ar",
    });
    assert.equal(firstDecision.action, "handoff");
    assert.equal(firstDecision.reasonCode, "NO_TRUSTED_ANSWER");
    assert.ok(firstDecision.trainingRequestId);

    const requests = await managementB.listTrainingRequests(merchantIds[1]);
    const request = requests.find((item) => item.id === firstDecision.trainingRequestId);
    assert.ok(request, "merchant management must see the PostgreSQL training request");
    assert.equal(request.status, "pending_merchant_reply");

    const approved = await managementB.approveTrainingRequest({
      merchantId: merchantIds[1],
      id: request.id,
      expectedVersion: request.version,
      approvedAnswer: "نعم، يمكن إضافة بطاقة تهنئة للهدية.",
      keywords: ["هدية", "تهنئة"],
    });
    assert.equal(approved.request.status, "approved");
    assert.equal(approved.learnedAnswer.source, "merchant_approved");
    assert.equal(approved.learnedAnswer.approvalStatus, "approved");
    assert.equal(approved.learnedAnswer.safeToAutoReply, true);

    const learnedEmbedding = await pool.query(
      `SELECT knowledge_kind, knowledge_id, embedding_model, dimensions
         FROM knowledge_embeddings
        WHERE merchant_id = $1 AND knowledge_kind = 'learned_answer' AND knowledge_id = $2`,
      [merchantIds[1], approved.learnedAnswer.id],
    );
    assert.equal(learnedEmbedding.rowCount, 1);

    const secondDecision = await engineB.decide({
      merchantId: merchantIds[1],
      customerText: "هل يمكن إضافة بطاقة تهنئة للهدية؟",
      languageHint: "ar",
    });
    assert.equal(secondDecision.action, "reply");
    assert.equal(secondDecision.stage, "semantic_retrieval");
    assert.equal(secondDecision.matchedRecordId, approved.learnedAnswer.id);
    assert.equal(secondDecision.answerText, "نعم، يمكن إضافة بطاقة تهنئة للهدية.");

    const revoked = await managementB.revokeTrainingApproval({
      merchantId: merchantIds[1],
      id: approved.request.id,
      expectedVersion: approved.request.version,
    });
    assert.equal(revoked.status, "rejected");
    assert.equal(revoked.rejectionReason, "merchant_revoked_approval");

    const revokedLearned = await pool.query(
      `SELECT approval_status, safe_to_auto_reply
         FROM learned_answers
        WHERE merchant_id = $1 AND training_request_id = $2`,
      [merchantIds[1], approved.request.id],
    );
    assert.equal(revokedLearned.rowCount, 1);
    assert.equal(revokedLearned.rows[0].approval_status, "rejected");
    assert.equal(revokedLearned.rows[0].safe_to_auto_reply, false);

    const revokedEmbedding = await pool.query(
      `SELECT id
         FROM knowledge_embeddings
        WHERE merchant_id = $1
          AND knowledge_kind = 'learned_answer'
          AND knowledge_id = $2`,
      [merchantIds[1], approved.learnedAnswer.id],
    );
    assert.equal(revokedEmbedding.rowCount, 0);

    const afterRevocation = await engineB.decide({
      merchantId: merchantIds[1],
      customerText: "هل يمكن إضافة بطاقة تهنئة للهدية؟",
      languageHint: "ar",
    });
    assert.equal(afterRevocation.action, "handoff");
    assert.equal(afterRevocation.matchedRecordId, null);
    assert.notEqual(afterRevocation.answerText, approved.learnedAnswer.answerText);
  });

  await t.test("Training Request management pagination and filters cover the full authority", async () => {
    const first = await managementA.createTrainingRequest({
      merchantId: merchantIds[0],
      customerText: "هل يوجد توصيل سريع؟",
      detectedIntent: "delivery_speed",
      detectedLanguage: "ar",
      reason: "knowledge_gap",
    });
    const second = await managementA.createTrainingRequest({
      merchantId: merchantIds[0],
      customerText: "هل تقبلون الدفع نقداً؟",
      detectedIntent: "payment_cash",
      detectedLanguage: "ar",
      reason: "knowledge_gap",
    });
    const third = await managementA.createTrainingRequest({
      merchantId: merchantIds[0],
      customerText: "هل يوجد ضمان إضافي؟",
      detectedIntent: "warranty_extra",
      detectedLanguage: "ar",
      reason: "knowledge_gap",
    });

    const firstPage = await managementA.listTrainingRequestsPage(merchantIds[0], {
      limit: 2,
    });
    assert.equal(firstPage.requests.length, 2);
    assert.ok(firstPage.nextCursor);

    const secondPage = await managementA.listTrainingRequestsPage(merchantIds[0], {
      limit: 2,
      beforeUpdatedAt: firstPage.nextCursor!.updatedAt,
      beforeId: firstPage.nextCursor!.id,
    });
    assert.equal(secondPage.requests.length, 1);
    assert.equal(secondPage.nextCursor, null);

    const pagedIds = [...firstPage.requests, ...secondPage.requests].map((item) => item.id);
    assert.equal(new Set(pagedIds).size, 3);
    assert.ok(pagedIds.includes(first.id));
    assert.ok(pagedIds.includes(second.id));
    assert.ok(pagedIds.includes(third.id));

    const searchPage = await managementA.listTrainingRequestsPage(merchantIds[0], {
      limit: 10,
      search: "نقداً",
    });
    assert.deepEqual(searchPage.requests.map((item) => item.id), [second.id]);

    const pendingPage = await managementA.listTrainingRequestsPage(merchantIds[0], {
      limit: 10,
      status: "pending_merchant_reply",
    });
    assert.equal(pendingPage.requests.length, 3);

    const approvedFirst = await managementA.approveTrainingRequest({
      merchantId: merchantIds[0],
      id: first.id,
      expectedVersion: first.version,
      approvedAnswer: "نعم، يوجد توصيل سريع في المناطق المدعومة.",
    });
    const approvedSecond = await managementA.approveTrainingRequest({
      merchantId: merchantIds[0],
      id: second.id,
      expectedVersion: second.version,
      approvedAnswer: "نعم، يمكن الدفع نقداً عند توفر هذه الطريقة.",
    });
    const approvedThird = await managementA.approveTrainingRequest({
      merchantId: merchantIds[0],
      id: third.id,
      expectedVersion: third.version,
      approvedAnswer: "الضمان الإضافي يعتمد على المنتج.",
    });

    const learnedFirstPage = await managementA.listLearnedAnswersPage(merchantIds[0], {
      limit: 2,
    });
    assert.equal(learnedFirstPage.answers.length, 2);
    assert.ok(learnedFirstPage.nextCursor);

    const learnedSecondPage = await managementA.listLearnedAnswersPage(merchantIds[0], {
      limit: 2,
      beforeUpdatedAt: learnedFirstPage.nextCursor!.updatedAt,
      beforeId: learnedFirstPage.nextCursor!.id,
    });
    assert.equal(learnedSecondPage.answers.length, 1);
    assert.equal(learnedSecondPage.nextCursor, null);

    const learnedIds = [
      ...learnedFirstPage.answers,
      ...learnedSecondPage.answers,
    ].map((item) => item.id);
    assert.equal(new Set(learnedIds).size, 3);
    assert.ok(learnedIds.includes(approvedFirst.learnedAnswer.id));
    assert.ok(learnedIds.includes(approvedSecond.learnedAnswer.id));
    assert.ok(learnedIds.includes(approvedThird.learnedAnswer.id));

    const learnedCompatibilityList = await managementA.listLearnedAnswers(merchantIds[0]);
    assert.deepEqual(
      [...learnedIds].sort(),
      learnedCompatibilityList.map((item) => item.id).sort(),
    );
  });

  await t.test("tenant isolation prevents Knowledge records crossing merchants", async () => {
    const managementAList = await managementA.listSavedAnswers(merchantIds[0]);
    const managementBList = await new PostgresKnowledgeManagementRuntime({
      embeddingProvider: fakeEmbedding,
    }).listSavedAnswers(merchantIds[1]);

    assert.equal(managementAList.length, 3);
    assert.equal(managementBList.length, 0);
    assert.ok(managementAList.every((item) => item.merchantId === merchantIds[0]));
  });
});
