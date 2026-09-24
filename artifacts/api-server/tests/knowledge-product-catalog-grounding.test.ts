// @ts-nocheck
import assert from "node:assert/strict";
import test from "node:test";
import { ConstrainedOpenAiProvider } from "../src/services/ai/constrainedOpenAiProvider.js";
import { KnowledgeDecisionEngine } from "../src/services/ai/knowledgeDecisionEngine.js";
import { PostgresMerchantCatalogContextResolver } from "../src/services/knowledge/productCatalogContext.js";
import { KNOWLEDGE_SYSTEM_RULES } from "../src/services/knowledge/promptInjection.js";

class CatalogSql {
  constructor() {
    this.queries = [];
  }

  async query(sql, values = []) {
    this.queries.push({ sql, values });

    if (sql.includes("FROM products")) {
      return {
        rows: [
          {
            id: "product-65w",
            merchant_id: "merchant-a",
            name: "PowerMax 65W Charger",
            sku: "PM65",
            code: null,
            barcode: null,
            external_ref: null,
            category: "USB-C chargers",
            description:
              "65W USB-C charger with Power Delivery support and two USB-C ports.",
            version: 3,
            status: "available",
            allow_fawri_reply: true,
          },
        ],
      };
    }

    if (sql.includes("FROM product_variants")) {
      return {
        rows: [
          {
            id: "variant-black",
            merchant_id: "merchant-a",
            product_id: "product-65w",
            name: "Black",
            color: "Black",
            size: null,
            sku: "PM65-BLK",
            version: 1,
          },
        ],
      };
    }

    if (sql.includes("FROM catalog_variant_options")) {
      return {
        rows: [
          {
            merchant_id: "merchant-a",
            product_id: "product-65w",
            option_name: "Plug",
            option_value: "EU",
            ordinal: 0,
          },
        ],
      };
    }

    return { rows: [] };
  }
}

function emptyRuntime() {
  return {
    authorityId: "catalog-grounding-test-runtime",
    legacyFallbackEnabled: false,
    async findApprovedSavedAnswer() { return null; },
    async retrieveSemanticMatch() { return null; },
    async listApprovedSemanticDocuments() { return []; },
    async createTrainingRequest() {
      throw new Error("trusted catalog synthesis must not create training");
    },
    async recordGeneratedCandidate() {
      throw new Error("trusted catalog synthesis must not create review candidate");
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

const catalogContext = [
  {
    id: "catalog-product:product-65w",
    productId: "product-65w",
    name: "PowerMax 65W Charger",
    category: "USB-C chargers",
    description:
      "65W USB-C charger with Power Delivery support and two USB-C ports.",
    sku: "PM65",
    options: [
      { name: "color", values: ["Black"] },
      { name: "Plug", values: ["EU"] },
    ],
    factualText:
      "Product name: PowerMax 65W Charger\nCategory: USB-C chargers\nDescription: 65W USB-C charger with Power Delivery support and two USB-C ports.\nSKU: PM65\nOption color: Black\nOption Plug: EU",
    confidence: 1,
  },
];

const curatedContext = [
  {
    id: "fawri-electronics-fast-charging",
    scope: "activity",
    activityKey: "electronics",
    question: "what is required for fast charging",
    answer:
      "Fast charging depends on compatibility among the device, charger, cable, and charging standard.",
    language: "en",
    confidence: 0.67,
  },
];

test("catalog context exposes only the matched merchant product's non-operational facts", async () => {
  const sql = new CatalogSql();
  const resolver = new PostgresMerchantCatalogContextResolver(sql);

  const context = await resolver.listRelevantContext({
    merchantId: "merchant-a",
    customerText: "Does the PowerMax 65W Charger support Power Delivery and what plug options are there?",
    language: "en",
  });

  assert.equal(context.length, 1);
  assert.equal(context[0].id, "catalog-product:product-65w");
  assert.equal(context[0].description.includes("Power Delivery"), true);
  assert.deepEqual(context[0].options, [
    { name: "color", values: ["Black"] },
    { name: "Plug", values: ["EU"] },
  ]);
  assert.equal(context[0].factualText.includes("price"), false);
  assert.equal(context[0].factualText.includes("stock"), false);
  assert.deepEqual(sql.queries[0].values, ["merchant-a"]);
});

test("catalog grounding never handles current price, stock, warranty, or return-policy questions", async () => {
  for (const customerText of [
    "How much is the PowerMax 65W Charger?",
    "Is the PowerMax 65W Charger in stock?",
    "What warranty does the PowerMax 65W Charger have?",
    "Can I return the PowerMax 65W Charger?",
  ]) {
    const sql = new CatalogSql();
    const resolver = new PostgresMerchantCatalogContextResolver(sql);
    const context = await resolver.listRelevantContext({
      merchantId: "merchant-a",
      customerText,
      language: "en",
    });
    assert.deepEqual(context, []);
    assert.equal(sql.queries.length, 0);
  }
});

test("constrained AI can combine exact merchant product facts with curated general knowledge", async () => {
  let receivedCatalog = [];
  let receivedCurated = [];
  let directEncyclopediaCalls = 0;

  const engine = new KnowledgeDecisionEngine({
    runtime: emptyRuntime(),
    factResolver: { async resolve() { return null; } },
    policyResolver: policy(),
    catalogContextResolver: {
      async listRelevantContext() {
        return catalogContext;
      },
    },
    encyclopediaResolver: {
      async resolve() {
        directEncyclopediaCalls += 1;
        return {
          articleId: "should-not-win",
          scope: "activity",
          activityKey: "electronics",
          answerText: "General answer.",
          language: "en",
          confidence: 0.9,
        };
      },
      async listRelevantContext() {
        return curatedContext;
      },
    },
    allowGeneratedAutoReply: true,
    aiProvider: {
      providerId: "test-catalog-ai",
      async generate(request) {
        receivedCatalog = request.catalogKnowledge || [];
        receivedCurated = request.curatedKnowledge || [];
        return {
          answerText:
            "The PowerMax 65W Charger supports Power Delivery. Fast charging still depends on device and cable compatibility.",
          language: "en",
          confidence: 0.96,
          risk: "low",
          canAnswer: true,
          reason: "combined trusted product facts and curated guidance",
          source: "openai_generated",
          groundingRecordIds: [
            "catalog-product:product-65w",
            "fawri-electronics-fast-charging",
          ],
          providerId: "test-catalog-ai",
          model: "test-model",
        };
      },
    },
  });

  const result = await engine.decide({
    merchantId: "merchant-a",
    customerText:
      "Does the PowerMax 65W Charger support fast charging and what should I check for compatibility?",
    languageHint: "en",
  });

  assert.equal(directEncyclopediaCalls, 0);
  assert.equal(receivedCatalog.length, 1);
  assert.equal(receivedCurated.length, 1);
  assert.equal(result.action, "reply");
  assert.equal(result.stage, "ai_fallback");
  assert.equal(result.requiresMerchantApproval, false);
  assert.equal(
    result.reasonCode,
    "CONSTRAINED_AI_GROUNDED_CATALOG_MIXED_TRUSTED_REPLY",
  );
  assert.deepEqual(result.groundingRecordIds, [
    "catalog-product:product-65w",
    "fawri-electronics-fast-charging",
  ]);
});

test("OpenAI envelope keeps merchant catalog facts separate from curated and approved knowledge", async () => {
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
              answer: "The PowerMax 65W Charger supports Power Delivery.",
              language: "en",
              confidence: 0.95,
              risk: "low",
              reason: "catalog fact",
              supporting_ids: ["catalog-product:product-65w"],
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
    curatedKnowledge: [],
    catalogKnowledge: catalogContext,
    customerText: "Does the PowerMax 65W Charger support Power Delivery?",
    conversationHistory: [],
    injectionSignals: [],
  });

  const developerText = body.input[1].content[0].text;
  assert.match(developerText, /"approved_knowledge":\[\]/);
  assert.match(developerText, /"fawri_curated_knowledge":\[\]/);
  assert.match(developerText, /"merchant_catalog_knowledge":\[/);
  assert.match(developerText, /catalog-product:product-65w/);
  assert.match(developerText, /Power Delivery/);
  assert.match(body.input[0].content[0].text, /not authority for current price/);
  assert.deepEqual(candidate?.groundingRecordIds, [
    "catalog-product:product-65w",
  ]);
});
