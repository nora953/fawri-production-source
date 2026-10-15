import assert from "node:assert/strict";
import test from "node:test";
import { KnowledgeDecisionEngine } from "../src/services/ai/knowledgeDecisionEngine.js";

test("constrained AI can create a merchant-review draft without becoming an automatic customer reply", async () => {
  let recordedCandidate = null;
  const runtime = {
    authorityId: "draft-only-test-runtime",
    legacyFallbackEnabled: false,
    async findApprovedSavedAnswer() { return null; },
    async listApprovedSemanticDocuments() { return []; },
    async retrieveSemanticMatch() { return null; },
    async createTrainingRequest() {
      throw new Error("AI candidate path should use recordGeneratedCandidate");
    },
    async recordGeneratedCandidate(input) {
      recordedCandidate = input;
      return {
        trainingRequest: {
          id: "training-ai-1",
          merchantId: input.merchantId,
          customerTextPreview: "preview",
          customerTextHash: "a".repeat(64),
          detectedIntent: input.intent,
          detectedLanguage: input.language,
          reason: input.reason,
          suggestedReply: input.answerText,
          suggestedReplySource: "openai_generated",
          status: "pending_review",
          rejectionReason: null,
          version: 1,
          createdAt: "2026-09-24T00:00:00.000Z",
          updatedAt: "2026-09-24T00:00:00.000Z",
        },
        learnedAnswer: {
          id: "learned-ai-1",
          merchantId: input.merchantId,
          intent: input.intent,
          language: input.language,
          examples: ["preview"],
          keywords: [],
          answerText: input.answerText,
          source: "openai_generated",
          approvalStatus: "pending_review",
          confidence: input.confidence,
          safeToAutoReply: false,
          trainingRequestId: "training-ai-1",
          version: 1,
          createdAt: "2026-09-24T00:00:00.000Z",
          updatedAt: "2026-09-24T00:00:00.000Z",
        },
      };
    },
    async appendAudit() {},
  };

  const engine = new KnowledgeDecisionEngine({
    runtime,
    factResolver: { async resolve() { return null; } },
    policyResolver: {
      async resolve(merchantId) {
        return {
          merchantId,
          policyVersion: 1,
          allowKnowledgeUse: true,
          policy: {
            businessName: "Store A",
            allowGeneratedAutoReply: true,
          },
        };
      },
    },
    allowGeneratedAutoReply: true,
    aiProvider: {
      providerId: "test-constrained-ai",
      async generate() {
        return {
          answerText: "Suggested professional answer for merchant review.",
          language: "en",
          confidence: 0.95,
          risk: "low",
          canAnswer: true,
          reason: "approved-context-only",
          source: "openai_generated",
          groundingRecordIds: [],
          providerId: "test-constrained-ai",
          model: "test-model",
        };
      },
    },
  });

  const result = await engine.decide({
    merchantId: "merchant-a",
    customerText: "Can you explain your return process?",
    languageHint: "en",
  });

  assert.equal(recordedCandidate?.answerText, "Suggested professional answer for merchant review.");
  assert.equal(result.action, "handoff");
  assert.equal(result.stage, "ai_fallback");
  assert.equal(result.answerText?.includes("team member"), true);
  assert.equal(result.requiresMerchantApproval, true);
  assert.equal(result.reasonCode, "AI_CANDIDATE_REQUIRES_MERCHANT_APPROVAL");
  assert.equal(result.trainingRequestId, "training-ai-1");
  assert.equal(result.matchedRecordId, "learned-ai-1");
});
