// @ts-nocheck
import assert from "node:assert/strict";
import test from "node:test";
import { learnFromMerchantManualReply } from "../src/services/merchantManualKnowledgeLearning.js";

function pendingRequest(overrides = {}) {
  return {
    id: "training-a",
    merchantId: "merchant-a",
    customerTextPreview: "Do you offer gift wrapping?",
    customerTextHash: "a".repeat(64),
    detectedIntent: "knowledge_gap",
    detectedLanguage: "en",
    reason: "no_trusted_answer",
    suggestedReply: null,
    suggestedReplySource: null,
    status: "pending_merchant_reply",
    rejectionReason: null,
    version: 1,
    createdAt: "2026-09-24T00:00:00.000Z",
    updatedAt: "2026-09-24T00:00:00.000Z",
    ...overrides,
  };
}

function runtimeFor(request) {
  let approvals = 0;
  return {
    runtime: {
      async getTrainingRequest() {
        return request;
      },
      async approveTrainingRequest(input) {
        approvals += 1;
        return {
          request: {
            ...request,
            status: "approved",
            suggestedReply: input.approvedAnswer,
            suggestedReplySource: "merchant_draft",
            version: request.version + 1,
          },
          learnedAnswer: {
            id: "learned-a",
            merchantId: request.merchantId,
            intent: request.detectedIntent,
            language: request.detectedLanguage,
            examples: [request.customerTextPreview],
            keywords: [],
            answerText: input.approvedAnswer,
            source: "merchant_approved",
            approvalStatus: "approved",
            confidence: 1,
            safeToAutoReply: true,
            trainingRequestId: request.id,
            version: 1,
            createdAt: "2026-09-24T00:00:00.000Z",
            updatedAt: "2026-09-24T00:00:00.000Z",
          },
        };
      },
    },
    approvals: () => approvals,
  };
}

test("a reusable merchant manual answer becomes approved knowledge without a second approval step", async () => {
  const fake = runtimeFor(pendingRequest());
  const result = await learnFromMerchantManualReply({
    merchantId: "merchant-a",
    trainingRequestId: "training-a",
    merchantReply: "Yes. Gift wrapping is available on request.",
    runtime: fake.runtime,
  });

  assert.equal(fake.approvals(), 1);
  assert.deepEqual(result, {
    learned: true,
    reasonCode: "MANUAL_REPLY_LEARNED",
    trainingRequestId: "training-a",
    learnedAnswerId: "learned-a",
  });
});

test("operational facts never become reusable knowledge from a manual reply", async () => {
  const fake = runtimeFor(
    pendingRequest({
      detectedIntent: "knowledge_gap",
      customerTextPreview: "What is the current price of product ABC?",
    }),
  );
  const result = await learnFromMerchantManualReply({
    merchantId: "merchant-a",
    trainingRequestId: "training-a",
    merchantReply: "It is 25,000 IQD today.",
    runtime: fake.runtime,
  });

  assert.equal(fake.approvals(), 0);
  assert.equal(result.learned, false);
  assert.equal(result.reasonCode, "AUTHORITATIVE_FACT_NOT_REUSABLE");
});

test("one-off discounts and exceptions are not generalized from a merchant reply", async () => {
  const fake = runtimeFor(
    pendingRequest({
      customerTextPreview: "Can you give me a special price?",
    }),
  );
  const result = await learnFromMerchantManualReply({
    merchantId: "merchant-a",
    trainingRequestId: "training-a",
    merchantReply: "I can give you a discount this time.",
    runtime: fake.runtime,
  });

  assert.equal(fake.approvals(), 0);
  assert.equal(result.learned, false);
  assert.equal(result.reasonCode, "CASE_SPECIFIC_REPLY_NOT_REUSABLE");
});

test("manual replies containing sensitive contact data are not generalized", async () => {
  const fake = runtimeFor(pendingRequest());
  const result = await learnFromMerchantManualReply({
    merchantId: "merchant-a",
    trainingRequestId: "training-a",
    merchantReply: "Contact us at help@example.com for this request.",
    runtime: fake.runtime,
  });

  assert.equal(fake.approvals(), 0);
  assert.equal(result.learned, false);
  assert.equal(result.reasonCode, "SENSITIVE_REPLY_NOT_REUSABLE");
});

test("security and authoritative fallback training intents are fail-closed", async () => {
  for (const detectedIntent of ["prompt_injection", "authoritative_fact_unavailable"]) {
    const fake = runtimeFor(pendingRequest({ detectedIntent }));
    const result = await learnFromMerchantManualReply({
      merchantId: "merchant-a",
      trainingRequestId: "training-a",
      merchantReply: "Manual answer.",
      runtime: fake.runtime,
    });
    assert.equal(fake.approvals(), 0);
    assert.equal(result.learned, false);
    assert.equal(result.reasonCode, "TRAINING_INTENT_NOT_REUSABLE");
  }
});

test("already resolved training is not silently rewritten by later manual messages", async () => {
  const fake = runtimeFor(pendingRequest({ status: "approved" }));
  const result = await learnFromMerchantManualReply({
    merchantId: "merchant-a",
    trainingRequestId: "training-a",
    merchantReply: "Another message.",
    runtime: fake.runtime,
  });

  assert.equal(fake.approvals(), 0);
  assert.equal(result.learned, false);
  assert.equal(result.reasonCode, "TRAINING_REQUEST_NOT_PENDING");
});
