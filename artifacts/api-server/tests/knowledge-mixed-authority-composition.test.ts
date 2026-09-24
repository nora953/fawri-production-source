// @ts-nocheck
import assert from "node:assert/strict";
import test from "node:test";
import { ConstrainedOpenAiProvider } from "../src/services/ai/constrainedOpenAiProvider.js";
import { KnowledgeDecisionEngine } from "../src/services/ai/knowledgeDecisionEngine.js";
import { KNOWLEDGE_SYSTEM_RULES } from "../src/services/knowledge/promptInjection.js";

function catalogContext() {
  return [
    {
      id: "catalog-product:product-65w",
      productId: "product-65w",
      name: "PowerMax 65W Charger",
      category: "USB-C chargers",
      description:
        "65W USB-C charger with Power Delivery support and two USB-C ports.",
      sku: "PM65",
      options: [{ name: "color", values: ["Black"] }],
      factualText:
        "Product name: PowerMax 65W Charger\nCategory: USB-C chargers\nDescription: 65W USB-C charger with Power Delivery support and two USB-C ports.\nSKU: PM65\nAvailable option color: Black",
      confidence: 1,
    },
  ];
}

function curatedContext(confidence = 0.76) {
  return [
    {
      id: "fawri-electronics-fast-charging",
      scope: "activity",
      activityKey: "electronics",
      question: "what is required for fast charging",
      answer:
        "Fast charging depends on compatibility among the device, charger, cable, and charging standard.",
      language: "en",
      confidence,
    },
  ];
}

function liveFact() {
  return {
    answerText:
      "PowerMax 65W Charger is 25,000 IQD.\nPowerMax 65W Charger is currently available.",
    language: "en",
    confidence: 1,
    factType: "combined_product_price_product_stock",
    recordId: "product-65w:live",
    contextRecordId: "catalog-product:product-65w",
  };
}

function runtime(options = {}) {
  let trainingCount = 0;
  let generatedCandidateCount = 0;
  return {
    authorityId: "mixed-authority-test-runtime",
    legacyFallbackEnabled: false,
    get trainingCount() {
      return trainingCount;
    },
    get generatedCandidateCount() {
      return generatedCandidateCount;
    },
    async findApprovedSavedAnswer() {
      return null;
    },
    async retrieveSemanticMatch() {
      return null;
    },
    async listApprovedSemanticDocuments() {
      return [];
    },
    async createTrainingRequest(input) {
      trainingCount += 1;
      if (options.throwOnTraining) {
        throw new Error("trusted mixed composition must not create training");
      }
      return {
        id: `training-mixed-${trainingCount}`,
        merchantId: input.merchantId,
        customerTextPreview: "preview",
        customerTextHash: "a".repeat(64),
        detectedIntent: input.detectedIntent || null,
        detectedLanguage: input.detectedLanguage || null,
        reason: input.reason,
        suggestedReply: null,
        suggestedReplySource: null,
        status: "pending_merchant_reply",
        rejectionReason: null,
        version: 1,
        createdAt: "2026-09-24T00:00:00.000Z",
        updatedAt: "2026-09-24T00:00:00.000Z",
      };
    },
    async recordGeneratedCandidate() {
      generatedCandidateCount += 1;
      throw new Error(
        "mixed live-authority candidates must never become reusable learned knowledge",
      );
    },
    async appendAudit() {},
  };
}

function policy(allowGeneratedAutoReply = true) {
  return {
    async resolve(merchantId) {
      return {
        merchantId,
        policyVersion: 1,
        allowKnowledgeUse: true,
        policy: {
          businessName: "Store A",
          allowGeneratedAutoReply,
        },
      };
    },
  };
}

test("mixed product question combines live price/stock, catalog specification, and curated guidance", async () => {
  const testRuntime = runtime({ throwOnTraining: true });
  let receivedOperational = [];
  let receivedCatalog = [];
  let receivedCurated = [];
  let catalogAllowOperational;
  let curatedAllowOperational;

  const engine = new KnowledgeDecisionEngine({
    runtime: testRuntime,
    factResolver: {
      async resolve() {
        return liveFact();
      },
    },
    policyResolver: policy(true),
    catalogContextResolver: {
      async listRelevantContext(input) {
        catalogAllowOperational = input.allowOperationalContext;
        return catalogContext();
      },
    },
    encyclopediaResolver: {
      async resolve() {
        throw new Error("direct encyclopedia reply must not win over a live fact");
      },
      async listRelevantContext(input) {
        curatedAllowOperational = input.allowOperationalContext;
        return curatedContext();
      },
    },
    allowGeneratedAutoReply: true,
    aiProvider: {
      providerId: "test-mixed-ai",
      async generate(request) {
        receivedOperational = request.operationalFacts || [];
        receivedCatalog = request.catalogKnowledge || [];
        receivedCurated = request.curatedKnowledge || [];
        assert.equal(request.approvedKnowledge.length, 0);
        const operationalId = receivedOperational[0].id;
        return {
          answerText:
            "The PowerMax 65W Charger supports Power Delivery and is 25,000 IQD. It is currently available. Fast charging still depends on device and cable compatibility.",
          language: "en",
          confidence: 0.97,
          risk: "low",
          canAnswer: true,
          reason: "all requested parts grounded",
          source: "openai_generated",
          groundingRecordIds: [
            "fawri-electronics-fast-charging",
            operationalId,
            "catalog-product:product-65w",
          ],
          providerId: "test-mixed-ai",
          model: "test-model",
        };
      },
    },
  });

  const result = await engine.decide({
    merchantId: "merchant-a",
    customerText:
      "Does the PowerMax 65W Charger support Power Delivery, what is the price, and is it available?",
    languageHint: "en",
  });

  assert.equal(catalogAllowOperational, true);
  assert.equal(curatedAllowOperational, true);
  assert.equal(receivedOperational.length, 1);
  assert.equal(receivedOperational[0].factType, "combined_product_price_product_stock");
  assert.match(receivedOperational[0].answer, /25,000 IQD/);
  assert.equal(receivedCatalog.length, 1);
  assert.equal(receivedCurated.length, 1);
  assert.equal(result.action, "reply");
  assert.equal(result.stage, "ai_fallback");
  assert.equal(result.reasonCode, "CONSTRAINED_AI_GROUNDED_OPERATIONAL_MIXED_REPLY");
  assert.equal(result.matchedRecordId, "catalog-product:product-65w");
  assert.equal(result.requiresMerchantApproval, false);
  assert.equal(testRuntime.trainingCount, 0);
  assert.equal(testRuntime.generatedCandidateCount, 0);
});

test("pure price question stays deterministic when there is no strong non-operational need", async () => {
  const testRuntime = runtime({ throwOnTraining: true });
  let aiCalls = 0;
  const engine = new KnowledgeDecisionEngine({
    runtime: testRuntime,
    factResolver: {
      async resolve() {
        return {
          ...liveFact(),
          answerText: "PowerMax 65W Charger is 25,000 IQD.",
          factType: "product_price",
        };
      },
    },
    policyResolver: policy(true),
    catalogContextResolver: {
      async listRelevantContext() {
        return catalogContext();
      },
    },
    encyclopediaResolver: {
      async resolve() {
        return null;
      },
      async listRelevantContext() {
        return curatedContext(0.31);
      },
    },
    allowGeneratedAutoReply: true,
    aiProvider: {
      providerId: "test-mixed-ai",
      async generate() {
        aiCalls += 1;
        return null;
      },
    },
  });

  const result = await engine.decide({
    merchantId: "merchant-a",
    customerText: "What is the price of PowerMax 65W Charger?",
    languageHint: "en",
  });

  assert.equal(aiCalls, 0);
  assert.equal(result.action, "reply");
  assert.equal(result.stage, "database_fact");
  assert.equal(result.source, "database_fact");
  assert.equal(result.reasonCode, "DATABASE_FACT_PRODUCT_PRICE");
  assert.match(result.answerText || "", /25,000 IQD/);
});

test("unsafe or incomplete mixed composition fails closed without learning live facts", async () => {
  const testRuntime = runtime();
  let operationalId = "";
  const engine = new KnowledgeDecisionEngine({
    runtime: testRuntime,
    factResolver: {
      async resolve() {
        return liveFact();
      },
    },
    policyResolver: policy(true),
    catalogContextResolver: {
      async listRelevantContext() {
        return catalogContext();
      },
    },
    encyclopediaResolver: {
      async resolve() {
        return null;
      },
      async listRelevantContext() {
        return curatedContext();
      },
    },
    allowGeneratedAutoReply: true,
    aiProvider: {
      providerId: "test-mixed-ai",
      async generate(request) {
        operationalId = request.operationalFacts[0].id;
        return {
          answerText:
            "The PowerMax 65W Charger supports Power Delivery and costs 30,000 IQD.",
          language: "en",
          confidence: 0.98,
          risk: "low",
          canAnswer: true,
          reason: "invented live price",
          source: "openai_generated",
          groundingRecordIds: [
            operationalId,
            "catalog-product:product-65w",
          ],
        };
      },
    },
  });

  const result = await engine.decide({
    merchantId: "merchant-a",
    customerText:
      "Does the PowerMax 65W Charger support Power Delivery and what is the price?",
    languageHint: "en",
  });

  assert.ok(operationalId.startsWith("live-fact:"));
  assert.equal(result.action, "handoff");
  assert.equal(result.stage, "handoff");
  assert.equal(
    result.reasonCode,
    "MIXED_AUTHORITY_COMPOSITION_REQUIRES_HANDOFF",
  );
  assert.equal(testRuntime.trainingCount, 1);
  assert.equal(testRuntime.generatedCandidateCount, 0);
});

test("mixed composition cannot silently omit the live operational grounding", async () => {
  const testRuntime = runtime();
  const engine = new KnowledgeDecisionEngine({
    runtime: testRuntime,
    factResolver: {
      async resolve() {
        return liveFact();
      },
    },
    policyResolver: policy(true),
    catalogContextResolver: {
      async listRelevantContext() {
        return catalogContext();
      },
    },
    encyclopediaResolver: {
      async resolve() {
        return null;
      },
      async listRelevantContext() {
        return curatedContext();
      },
    },
    allowGeneratedAutoReply: true,
    aiProvider: {
      providerId: "test-mixed-ai",
      async generate() {
        return {
          answerText:
            "The PowerMax 65W Charger supports Power Delivery. Fast charging depends on compatibility.",
          language: "en",
          confidence: 0.96,
          risk: "low",
          canAnswer: true,
          reason: "omitted live price and availability",
          source: "openai_generated",
          groundingRecordIds: [
            "catalog-product:product-65w",
            "fawri-electronics-fast-charging",
          ],
        };
      },
    },
  });

  const result = await engine.decide({
    merchantId: "merchant-a",
    customerText:
      "Does the PowerMax 65W Charger support Power Delivery, what is the price, and is it available?",
    languageHint: "en",
  });

  assert.equal(result.action, "handoff");
  assert.equal(
    result.reasonCode,
    "MIXED_AUTHORITY_COMPOSITION_REQUIRES_HANDOFF",
  );
  assert.equal(testRuntime.trainingCount, 1);
  assert.equal(testRuntime.generatedCandidateCount, 0);
});

test("OpenAI envelope keeps live operational facts separate from catalog and curated context", async () => {
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
              answer:
                "The PowerMax 65W Charger supports Power Delivery and is 25,000 IQD.",
              language: "en",
              confidence: 0.95,
              risk: "low",
              reason: "mixed trusted evidence",
              supporting_ids: [
                "live-fact:product_price:test",
                "catalog-product:product-65w",
              ],
            }),
          };
        },
      };
    },
  });

  await provider.generate({
    merchantId: "merchant-a",
    language: "en",
    systemRules: KNOWLEDGE_SYSTEM_RULES,
    merchantPolicy: { businessName: "Store A" },
    approvedKnowledge: [],
    operationalFacts: [
      {
        id: "live-fact:product_price:test",
        factType: "product_price",
        answer: "PowerMax 65W Charger is 25,000 IQD.",
        language: "en",
      },
    ],
    catalogKnowledge: catalogContext(),
    curatedKnowledge: curatedContext(),
    customerText:
      "Does the PowerMax 65W Charger support Power Delivery and what is the price?",
    conversationHistory: [],
    injectionSignals: [],
  });

  const developerText = body.input[1].content[0].text;
  assert.match(developerText, /"operational_facts":\[/);
  assert.match(developerText, /live-fact:product_price:test/);
  assert.match(developerText, /"merchant_catalog_knowledge":\[/);
  assert.match(developerText, /"fawri_curated_knowledge":\[/);
  assert.match(
    body.input[0].content[0].text,
    /Live operational facts are the highest factual authority/,
  );
});
