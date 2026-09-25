import assert from "node:assert/strict";
import test from "node:test";
import {
  KnowledgeDecisionEngine,
  type KnowledgeDecisionRuntime,
} from "../src/services/ai/knowledgeDecisionEngine.js";
import type {
  LearnedAnswerRecord,
  SemanticDocument,
  TrainingRequestRecord,
} from "../src/services/knowledge/types.js";

const approvedDoc: SemanticDocument = {
  id: "approved-return-policy",
  merchantId: "merchant-a",
  question: "What is the return policy?",
  answer: "Returns are accepted within 7 days with the receipt.",
  language: "en",
  source: "merchant_approved",
  kind: "saved_answer",
};

function baseRuntime(): KnowledgeDecisionRuntime {
  return {
    authorityId: "grounded-ai-test-runtime",
    legacyFallbackEnabled: false,
    async findApprovedSavedAnswer() { return null; },
    async retrieveSemanticMatch() { return null; },
    async listApprovedSemanticDocuments() { return [approvedDoc]; },
    async createTrainingRequest(): Promise<TrainingRequestRecord> {
      throw new Error("grounded automatic reply must not create a training request");
    },
    async recordGeneratedCandidate(): Promise<{
      trainingRequest: TrainingRequestRecord;
      learnedAnswer: LearnedAnswerRecord;
    }> {
      throw new Error("grounded automatic reply must not create a pending-review candidate");
    },
    async appendAudit() {},
  };
}

function policy() {
  return {
    async resolve(merchantId: string) {
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
  };
}

function reviewFallbackRuntime() {
  let recorded = 0;
  const runtime: KnowledgeDecisionRuntime = {
    ...baseRuntime(),
    async recordGeneratedCandidate(input) {
    recorded += 1;
    return {
      trainingRequest: {
        id: "training-1",
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
        id: "learned-1",
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
        trainingRequestId: "training-1",
        version: 1,
        createdAt: "2026-09-24T00:00:00.000Z",
        updatedAt: "2026-09-24T00:00:00.000Z",
      },
    };
    },
  };
  return { runtime, recorded: () => recorded };
}

test("low-risk AI synthesis grounded only in approved merchant records auto-replies without merchant approval", async () => {
  const engine = new KnowledgeDecisionEngine({
    runtime: baseRuntime(),
    factResolver: { async resolve() { return null; } },
    policyResolver: policy(),
    allowGeneratedAutoReply: true,
    aiProvider: {
      providerId: "test-constrained-ai",
      async generate() {
        return {
          answerText: "Certainly. You can return the item within 7 days as long as you have the receipt.",
          language: "en",
          confidence: 0.96,
          risk: "low",
          canAnswer: true,
          reason: "fully supported by approved return policy",
          source: "openai_generated",
          groundingRecordIds: ["approved-return-policy"],
          providerId: "test-constrained-ai",
          model: "test-model",
        };
      },
    },
  });

  const result = await engine.decide({
    merchantId: "merchant-a",
    customerText: "Could you explain how returns work?",
    languageHint: "en",
  });

  assert.equal(result.action, "reply");
  assert.equal(result.stage, "ai_fallback");
  assert.equal(result.requiresMerchantApproval, false);
  assert.equal(result.trainingRequestId, null);
  assert.equal(result.matchedRecordId, "approved-return-policy");
  assert.deepEqual(result.groundingRecordIds, ["approved-return-policy"]);
  assert.equal(result.reasonCode, "CONSTRAINED_AI_GROUNDED_APPROVED_REPLY");
  assert.match(result.answerText || "", /7 days/);
});

test("AI synthesis citing an unknown record cannot auto-reply", async () => {
  const fallback = reviewFallbackRuntime();
  const engine = new KnowledgeDecisionEngine({
    runtime: fallback.runtime,
    factResolver: { async resolve() { return null; } },
    policyResolver: policy(),
    allowGeneratedAutoReply: true,
    aiProvider: {
      providerId: "test-constrained-ai",
      async generate() {
        return {
          answerText: "Unsupported answer.",
          language: "en",
          confidence: 0.99,
          risk: "low",
          canAnswer: true,
          reason: "claims grounding",
          source: "openai_generated",
          groundingRecordIds: ["not-approved-here"],
        };
      },
    },
  });

  const result = await engine.decide({
    merchantId: "merchant-a",
    customerText: "Could you explain how returns work?",
    languageHint: "en",
  });

  assert.equal(fallback.recorded(), 1);
  assert.equal(result.action, "handoff");
  assert.equal(result.requiresMerchantApproval, true);
  assert.equal(result.reasonCode, "AI_CANDIDATE_REQUIRES_MERCHANT_APPROVAL");
});

test("AI synthesis cannot invent a new number even when it cites an approved record", async () => {
  const fallback = reviewFallbackRuntime();
  const engine = new KnowledgeDecisionEngine({
    runtime: fallback.runtime,
    factResolver: { async resolve() { return null; } },
    policyResolver: policy(),
    allowGeneratedAutoReply: true,
    aiProvider: {
      providerId: "test-constrained-ai",
      async generate() {
        return {
          answerText: "You can return the item within 30 days with the receipt.",
          language: "en",
          confidence: 0.99,
          risk: "low",
          canAnswer: true,
          reason: "unsupported changed number",
          source: "openai_generated",
          groundingRecordIds: ["approved-return-policy"],
        };
      },
    },
  });

  const result = await engine.decide({
    merchantId: "merchant-a",
    customerText: "Could you explain how returns work?",
    languageHint: "en",
  });

  assert.equal(fallback.recorded(), 1);
  assert.equal(result.action, "handoff");
  assert.equal(result.requiresMerchantApproval, true);
});

test("grounded AI still hands off when risk is not low", async () => {
  const fallback = reviewFallbackRuntime();
  const engine = new KnowledgeDecisionEngine({
    runtime: fallback.runtime,
    factResolver: { async resolve() { return null; } },
    policyResolver: policy(),
    allowGeneratedAutoReply: true,
    aiProvider: {
      providerId: "test-constrained-ai",
      async generate() {
        return {
          answerText: "You can return the item within 7 days with the receipt.",
          language: "en",
          confidence: 0.99,
          risk: "medium",
          canAnswer: true,
          reason: "medium risk",
          source: "openai_generated",
          groundingRecordIds: ["approved-return-policy"],
        };
      },
    },
  });

  const result = await engine.decide({
    merchantId: "merchant-a",
    customerText: "Could you explain how returns work?",
    languageHint: "en",
  });

  assert.equal(fallback.recorded(), 1);
  assert.equal(result.action, "handoff");
  assert.equal(result.requiresMerchantApproval, true);
});


test("valid grounding IDs cannot authorize unsupported high-risk textual claims", async () => {
  const cases = [
    ["Outer material: cotton.", "This is a waterproof cotton jacket."],
    ["USB-C charger, 65W.", "This charger is safe for every laptop."],
    ["Gold-plated jewelry.", "This jewelry is hypoallergenic."],
    ["Fragrance contains vanilla notes.", "It is suitable for sensitive skin."],
    ["Outer material: cotton.", "It is compatible with every device."],
    ["Outer material: cotton.", "It is certified for professional use."],
    ["Outer material: cotton.", "It includes a two-year warranty."],
    ["Outer material: cotton.", "You have a right to return it at any time."],
    ["Outer material: cotton.", "It is extremely durable."],
    ["Outer material: cotton.", "It is 100% authentic."],
    ["Outer material: cotton.", "It is made in Italy."],
    ["Outer material: cotton.", "It comes with a protective case."],
    ["Outer material: cotton.", "I recommend it as better than the alternatives."],
  ];

  for (const [evidence, unsupportedAnswer] of cases) {
    const record: SemanticDocument = {
      id: "approved-risk-evidence",
      merchantId: "merchant-a",
      question: "Tell me about this item",
      answer: evidence,
      language: "en",
      source: "merchant_approved",
      kind: "saved_answer",
    };
    const runtime: KnowledgeDecisionRuntime = {
      authorityId: "semantic-risk-test-runtime",
      legacyFallbackEnabled: false,
      async findApprovedSavedAnswer() { return null; },
      async retrieveSemanticMatch() { return null; },
      async listApprovedSemanticDocuments() { return [record]; },
      async createTrainingRequest() {
        return {
          id: "training-risk",
          merchantId: "merchant-a",
          customerTextPreview: "preview",
          customerTextHash: "a".repeat(64),
          detectedIntent: "general",
          detectedLanguage: "en",
          reason: "ai_candidate_requires_review",
          suggestedReply: unsupportedAnswer,
          suggestedReplySource: "openai_generated",
          status: "pending_review",
          rejectionReason: null,
          version: 1,
          createdAt: "2026-09-25T00:00:00.000Z",
          updatedAt: "2026-09-25T00:00:00.000Z",
        };
      },
      async recordGeneratedCandidate(input) {
        return {
          trainingRequest: await this.createTrainingRequest(),
          learnedAnswer: {
            id: "learned-risk",
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
            trainingRequestId: "training-risk",
            version: 1,
            createdAt: "2026-09-25T00:00:00.000Z",
            updatedAt: "2026-09-25T00:00:00.000Z",
          },
        };
      },
      async appendAudit() {},
    };
    const engine = new KnowledgeDecisionEngine({
      runtime,
      factResolver: { async resolve() { return null; } },
      policyResolver: policy(),
      allowGeneratedAutoReply: true,
      aiProvider: {
        providerId: "test-constrained-ai",
        async generate() {
          return {
            answerText: unsupportedAnswer,
            language: "en",
            confidence: 0.99,
            risk: "low",
            canAnswer: true,
            reason: "claims grounding",
            source: "openai_generated",
            groundingRecordIds: [record.id],
          };
        },
      },
    });

    const result = await engine.decide({
      merchantId: "merchant-a",
      customerText: "Tell me about this item",
      languageHint: "en",
    });

    assert.equal(
      result.action,
      "handoff",
      `unsupported claim escaped evidence boundary: ${unsupportedAnswer}`,
    );
    assert.equal(result.reasonCode, "AI_CANDIDATE_REQUIRES_MERCHANT_APPROVAL");
  }
});

test("high-risk claim polarity cannot be strengthened from negative evidence", async () => {
  const record: SemanticDocument = {
    id: "approved-negative-waterproof",
    merchantId: "merchant-a",
    question: "Is it waterproof?",
    answer: "This jacket is not waterproof.",
    language: "en",
    source: "merchant_approved",
    kind: "saved_answer",
  };
  const fallback = reviewFallbackRuntime();
  fallback.runtime.listApprovedSemanticDocuments = async () => [record];

  const engine = new KnowledgeDecisionEngine({
    runtime: fallback.runtime,
    factResolver: { async resolve() { return null; } },
    policyResolver: policy(),
    allowGeneratedAutoReply: true,
    aiProvider: {
      providerId: "test-constrained-ai",
      async generate() {
        return {
          answerText: "This jacket is waterproof.",
          language: "en",
          confidence: 0.99,
          risk: "low",
          canAnswer: true,
          reason: "claims grounding",
          source: "openai_generated",
          groundingRecordIds: [record.id],
        };
      },
    },
  });

  const result = await engine.decide({
    merchantId: "merchant-a",
    customerText: "Is it waterproof?",
    languageHint: "en",
  });
  assert.equal(result.action, "handoff");
  assert.equal(result.reasonCode, "AI_CANDIDATE_REQUIRES_MERCHANT_APPROVAL");
});
