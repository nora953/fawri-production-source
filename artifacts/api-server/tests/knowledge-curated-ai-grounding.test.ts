// @ts-nocheck
import assert from "node:assert/strict";
import test from "node:test";
import { ConstrainedOpenAiProvider } from "../src/services/ai/constrainedOpenAiProvider.js";
import { KnowledgeDecisionEngine } from "../src/services/ai/knowledgeDecisionEngine.js";
import { PostgresFawriEncyclopediaResolver } from "../src/services/knowledge/fawriEncyclopedia.js";
import { KNOWLEDGE_SYSTEM_RULES } from "../src/services/knowledge/promptInjection.js";

class FakeSql {
  constructor(activityType = "إلكترونيات") {
    this.activityType = activityType;
    this.queries = [];
  }
  async query(sql, values = []) {
    this.queries.push({ sql, values });
    if (sql.includes("FROM merchants")) {
      return { rows: [{ activity_type: this.activityType }] };
    }
    return { rows: [] };
  }
}

function emptyRuntime() {
  return {
    authorityId: "curated-grounding-test-runtime",
    legacyFallbackEnabled: false,
    async findApprovedSavedAnswer() { return null; },
    async retrieveSemanticMatch() { return null; },
    async listApprovedSemanticDocuments() { return []; },
    async createTrainingRequest() {
      throw new Error("trusted curated synthesis must not create training");
    },
    async recordGeneratedCandidate() {
      throw new Error("trusted curated synthesis must not create review candidate");
    },
    async appendAudit() {},
  };
}

function policy() {
  return {
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
  };
}

const curatedContext = [
  {
    id: "fawri-electronics-fast-charging",
    scope: "activity",
    activityKey: "electronics",
    question: "what is required for fast charging",
    answer: "Fast charging depends on compatibility among the device, charger, cable, and charging standard.",
    language: "en",
    confidence: 0.67,
  },
  {
    id: "fawri-electronics-watts-volts-amps",
    scope: "activity",
    activityKey: "electronics",
    question: "watts vs volts vs amps",
    answer: "Watts describe electrical power, while volts describe electrical potential and amps describe current.",
    language: "en",
    confidence: 0.51,
  },
];

test("encyclopedia exposes a bounded relevant context for broader activity questions", async () => {
  const sql = new FakeSql("إلكترونيات");
  const resolver = new PostgresFawriEncyclopediaResolver(sql);

  const context = await resolver.listRelevantContext({
    merchantId: "merchant-a",
    customerText: "شنو الواط بالشاحن وهل اي شاحن سريع يشتغل بسرعة؟",
    language: "ar",
    limit: 4,
  });

  assert.ok(context.length >= 2);
  assert.ok(context.length <= 4);
  const ids = new Set(context.map((item) => item.id));
  assert.equal(ids.has("fawri-electronics-watts-volts-amps"), true);
  assert.equal(ids.has("fawri-electronics-fast-charging"), true);
  assert.equal(context.every((item) => item.language === "ar"), true);
  assert.deepEqual(sql.queries[0].values, ["merchant-a"]);
});

test("operational questions never expose curated context to AI", async () => {
  const sql = new FakeSql("إلكترونيات");
  const resolver = new PostgresFawriEncyclopediaResolver(sql);

  const context = await resolver.listRelevantContext({
    merchantId: "merchant-a",
    customerText: "كم سعر هاتف X وهل متوفر؟",
    language: "ar",
  });

  assert.deepEqual(context, []);
  assert.equal(sql.queries.length, 0);
});

test("constrained AI can synthesize a first-activation answer grounded only in Fawri-curated knowledge", async () => {
  let receivedCurated = [];
  const engine = new KnowledgeDecisionEngine({
    runtime: emptyRuntime(),
    factResolver: { async resolve() { return null; } },
    policyResolver: policy(),
    encyclopediaResolver: {
      async resolve() { return null; },
      async listRelevantContext() { return curatedContext; },
    },
    allowGeneratedAutoReply: true,
    aiProvider: {
      providerId: "test-curated-ai",
      async generate(request) {
        receivedCurated = request.curatedKnowledge || [];
        assert.equal(request.approvedKnowledge.length, 0);
        return {
          answerText: "Fast charging depends on the device, charger, cable, and charging standard. Watts describe electrical power.",
          language: "en",
          confidence: 0.95,
          risk: "low",
          canAnswer: true,
          reason: "combined trusted curated guidance",
          source: "openai_generated",
          groundingRecordIds: [
            "fawri-electronics-fast-charging",
            "fawri-electronics-watts-volts-amps",
          ],
          providerId: "test-curated-ai",
          model: "test-model",
        };
      },
    },
  });

  const result = await engine.decide({
    merchantId: "merchant-a",
    customerText: "How do watts and fast charging relate when choosing a charger?",
    languageHint: "en",
  });

  assert.equal(receivedCurated.length, 2);
  assert.equal(result.action, "reply");
  assert.equal(result.stage, "ai_fallback");
  assert.equal(result.requiresMerchantApproval, false);
  assert.equal(result.reasonCode, "CONSTRAINED_AI_GROUNDED_CURATED_REPLY");
  assert.deepEqual(result.groundingRecordIds, [
    "fawri-electronics-fast-charging",
    "fawri-electronics-watts-volts-amps",
  ]);
});

test("unknown curated grounding IDs fail closed instead of becoming automatic replies", async () => {
  let recorded = 0;
  const runtime = emptyRuntime();
  runtime.recordGeneratedCandidate = async (input) => {
    recorded += 1;
    return {
      trainingRequest: {
        id: "training-curated-1",
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
        id: "learned-curated-1",
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
        trainingRequestId: "training-curated-1",
        version: 1,
        createdAt: "2026-09-24T00:00:00.000Z",
        updatedAt: "2026-09-24T00:00:00.000Z",
      },
    };
  };

  const engine = new KnowledgeDecisionEngine({
    runtime,
    factResolver: { async resolve() { return null; } },
    policyResolver: policy(),
    encyclopediaResolver: {
      async resolve() { return null; },
      async listRelevantContext() { return curatedContext; },
    },
    allowGeneratedAutoReply: true,
    aiProvider: {
      providerId: "test-curated-ai",
      async generate() {
        return {
          answerText: "Unsupported claim.",
          language: "en",
          confidence: 0.99,
          risk: "low",
          canAnswer: true,
          reason: "bad grounding",
          source: "openai_generated",
          groundingRecordIds: ["fawri-not-supplied"],
        };
      },
    },
  });

  const result = await engine.decide({
    merchantId: "merchant-a",
    customerText: "Explain charger concepts.",
    languageHint: "en",
  });

  assert.equal(recorded, 1);
  assert.equal(result.action, "handoff");
  assert.equal(result.requiresMerchantApproval, true);
});

test("OpenAI envelope separates merchant-approved authority from Fawri-curated general knowledge", async () => {
  let body;
  const provider = new ConstrainedOpenAiProvider({
    apiKey: "test-key",
    model: "test-model",
    fetchImpl: async (_url, init) => {
      body = JSON.parse(String(init?.body || "{}"));
      return {
        ok: true,
        async json() {
          return {
            output_text: JSON.stringify({
              can_answer: true,
              answer: "Fast charging depends on compatible equipment.",
              language: "en",
              confidence: 0.94,
              risk: "low",
              reason: "curated guidance",
              supporting_ids: ["fawri-electronics-fast-charging"],
            }),
          };
        },
      };
    },
  });

  const candidate = await provider.generate({
    merchantId: "merchant-a",
    language: "en",
    systemRules: KNOWLEDGE_SYSTEM_RULES,
    merchantPolicy: { businessName: "Store A" },
    approvedKnowledge: [],
    curatedKnowledge: [curatedContext[0]],
    customerText: "How does fast charging work?",
    conversationHistory: [],
    injectionSignals: [],
  });

  const developerText = body.input[1].content[0].text;
  assert.match(developerText, /"approved_knowledge":\[\]/);
  assert.match(developerText, /"fawri_curated_knowledge":\[/);
  assert.match(developerText, /fawri-electronics-fast-charging/);
  assert.match(body.input[0].content[0].text, /general guidance only/);
  assert.deepEqual(candidate?.groundingRecordIds, [
    "fawri-electronics-fast-charging",
  ]);
});
