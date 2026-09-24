import assert from "node:assert/strict";
import test from "node:test";
import { KnowledgeDecisionEngine } from "../src/services/ai/knowledgeDecisionEngine.js";

function runtimeWithSemantic(document) {
  return {
    authorityId: "cross-language-test-runtime",
    legacyFallbackEnabled: false,
    async findApprovedSavedAnswer() { return null; },
    async retrieveSemanticMatch() {
      return document ? { document, score: 0.94 } : null;
    },
    async listApprovedSemanticDocuments() { return document ? [document] : []; },
    async createTrainingRequest() { throw new Error("translation path must not create training"); },
    async recordGeneratedCandidate() { throw new Error("translation path must not create generated knowledge"); },
    async appendAudit() {},
  };
}

test("approved Arabic knowledge can answer an English customer through faithful translation", async () => {
  let calls = 0;
  const engine = new KnowledgeDecisionEngine({
    runtime: runtimeWithSemantic({
      id: "saved-warranty-ar",
      merchantId: "merchant-a",
      question: "شنو ضمان هذا المنتج؟",
      answer: "ضمان هذا المنتج سنة واحدة بسعر 250,000 IQD.",
      language: "ar",
      source: "merchant_approved",
      kind: "saved_answer",
    }),
    factResolver: { async resolve() { return null; } },
    policyResolver: null,
    translationProvider: {
      providerId: "test-translator",
      model: "test-model",
      async translate(request) {
        calls += 1;
        assert.equal(request.sourceLanguage, "ar");
        assert.equal(request.targetLanguage, "en");
        assert.equal(request.recordId, "saved-warranty-ar");
        return {
          answerText: "This product has a one-year warranty and costs 250,000 IQD.",
          language: "en",
          faithful: true,
        };
      },
    },
  });

  const result = await engine.decide({
    merchantId: "merchant-a",
    customerText: "Does this product have a warranty?",
    languageHint: "en",
  });

  assert.equal(calls, 1);
  assert.equal(result.action, "reply");
  assert.equal(result.stage, "semantic_retrieval");
  assert.equal(result.language, "en");
  assert.equal(result.source, "merchant_approved");
  assert.equal(result.matchedRecordId, "saved-warranty-ar");
  assert.equal(result.reasonCode, "MERCHANT_APPROVED_TRANSLATED_SEMANTIC_MATCH");
  assert.equal(result.requiresMerchantApproval, false);
  assert.equal(result.aiProviderId, "test-translator");
  assert.equal(result.aiModel, "test-model");
});

test("same-language approved knowledge returns directly without translation", async () => {
  let calls = 0;
  const engine = new KnowledgeDecisionEngine({
    runtime: runtimeWithSemantic({
      id: "saved-ar",
      merchantId: "merchant-a",
      question: "سياسة الاستبدال",
      answer: "الاستبدال خلال 7 أيام.",
      language: "ar",
      source: "merchant_approved",
      kind: "saved_answer",
    }),
    factResolver: { async resolve() { return null; } },
    policyResolver: null,
    translationProvider: {
      providerId: "test-translator",
      model: "test-model",
      async translate() { calls += 1; return null; },
    },
  });
  const result = await engine.decide({
    merchantId: "merchant-a",
    customerText: "سياسة الاستبدال",
    languageHint: "ar",
  });
  assert.equal(calls, 0);
  assert.equal(result.action, "reply");
  assert.equal(result.answerText, "الاستبدال خلال 7 أيام.");
  assert.equal(result.reasonCode, "MERCHANT_APPROVED_SEMANTIC_MATCH");
  assert.equal(result.aiProviderId, undefined);
});

test("cross-language approved knowledge hands off when faithful translation is unavailable", async () => {
  const engine = new KnowledgeDecisionEngine({
    runtime: runtimeWithSemantic({
      id: "saved-ku",
      merchantId: "merchant-a",
      question: "گەڕاندنەوە",
      answer: "گەڕاندنەوە لە ماوەی 7 ڕۆژدا.",
      language: "ku",
      source: "merchant_approved",
      kind: "saved_answer",
    }),
    factResolver: { async resolve() { return null; } },
    policyResolver: null,
    translationProvider: {
      providerId: "test-translator",
      model: "test-model",
      async translate() { return null; },
    },
  });
  const result = await engine.decide({
    merchantId: "merchant-a",
    customerText: "What is the return policy?",
    languageHint: "en",
  });
  assert.equal(result.action, "handoff");
  assert.equal(result.reasonCode, "APPROVED_TRANSLATION_UNAVAILABLE");
  assert.equal(result.source, null);
});
