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
            variant_id: "variant-black",
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


test("trusted product hint can ground a name-only merchant catalog product", async () => {
  const sql = {
    async query(query: string) {
      if (query.includes("FROM products")) {
        return {
          rows: [
            {
              id: "product-name-only",
              merchant_id: "merchant-a",
              name: "Black Athletic Shoe Alternative",
              category: null,
              description: null,
              sku: null,
              status: "available",
              allow_fawri_reply: true,
              version: 1,
            },
          ],
        };
      }

      if (query.includes("FROM product_variants")) {
        return { rows: [] };
      }

      if (query.includes("FROM product_variant_options")) {
        return { rows: [] };
      }

      return { rows: [] };
    },
  };

  const resolver = new PostgresMerchantCatalogContextResolver(sql);

  const result = await resolver.listRelevantContext({
    merchantId: "merchant-a",
    customerText: "Do you have something like this?",
    language: "en",
    trustedProductIdHint: "product-name-only",
    limit: 1,
  });

  assert.equal(result.length, 1);
  assert.equal(result[0]?.productId, "product-name-only");
  assert.equal(result[0]?.name, "Black Athletic Shoe Alternative");
  assert.equal(result[0]?.id, "catalog-product:product-name-only");
  assert.match(
    result[0]?.factualText || "",
    /Black Athletic Shoe Alternative/,
  );
});

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


test("catalog context reuses a trusted product and variant reference on a natural follow-up", async () => {
  const sql = new CatalogSql();
  const resolver = new PostgresMerchantCatalogContextResolver(sql);

  const context = await resolver.listRelevantContext({
    merchantId: "merchant-a",
    customerText: "Does it support Power Delivery?",
    language: "en",
    trustedProductIdHint: "product-65w",
    trustedVariantIdHint: "variant-black",
  });

  assert.equal(context.length, 1);
  assert.equal(context[0].id, "catalog-variant:product-65w:variant-black");
  assert.equal(context[0].productId, "product-65w");
  assert.equal(context[0].variantId, "variant-black");
  assert.equal(context[0].variantName, "Black");
  assert.equal(context[0].variantSku, "PM65-BLK");
  assert.deepEqual(context[0].selectedOptions, {
    color: "Black",
    Plug: "EU",
  });
  assert.match(context[0].factualText, /Selected variant: Black/);
  assert.match(context[0].factualText, /Selected option Plug: EU/);
});

test("catalog grounding never handles current price, stock, warranty, or return-policy questions", async () => {
  for (const customerText of [
    "How much is the PowerMax 65W Charger?",
    "Is the PowerMax 65W Charger in stock?",
    "What is the weight of the PowerMax 65W Charger?",
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


test("catalog context can accompany already-resolved live facts without gaining operational authority", async () => {
  const sql = new CatalogSql();
  const resolver = new PostgresMerchantCatalogContextResolver(sql);

  const context = await resolver.listRelevantContext({
    merchantId: "merchant-a",
    customerText:
      "Does the PowerMax 65W Charger support Power Delivery, what is its price, and is it in stock?",
    language: "en",
    allowOperationalContext: true,
  });

  assert.equal(context.length, 1);
  assert.equal(context[0].id, "catalog-product:product-65w");
  assert.match(context[0].description || "", /Power Delivery/);
  assert.equal(context[0].factualText.includes("25,000"), false);
  assert.equal(context[0].factualText.toLowerCase().includes("in stock"), false);
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
            "fawri-electronics-fast-charging",
            "catalog-product:product-65w",
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
    "fawri-electronics-fast-charging",
    "catalog-product:product-65w",
  ]);
  assert.equal(result.matchedRecordId, "catalog-product:product-65w");
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


test("catalog grounding recognizes one-letter sizes only as standalone tokens", async () => {
  class SizeCatalogSql {
    constructor() {
      this.queries = [];
    }
    async query(sql, values = []) {
      this.queries.push({ sql, values });
      if (sql.includes("FROM products")) {
        return {
          rows: [
            {
              id: "shirt-a",
              merchant_id: "merchant-a",
              name: "Classic Shirt",
              sku: "SHIRT",
              code: null,
              barcode: null,
              external_ref: null,
              category: "Shirts",
              description: "Cotton shirt available in standard sizes.",
              version: 1,
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
              id: "variant-s",
              merchant_id: "merchant-a",
              product_id: "shirt-a",
              external_ref: null,
              name: "",
              color: null,
              size: "S",
              sku: "SHIRT-S",
              barcode: null,
              version: 1,
            },
            {
              id: "variant-m",
              merchant_id: "merchant-a",
              product_id: "shirt-a",
              external_ref: null,
              name: "",
              color: null,
              size: "M",
              sku: "SHIRT-M",
              barcode: null,
              version: 1,
            },
          ],
        };
      }
      if (sql.includes("FROM catalog_variant_options")) {
        return { rows: [] };
      }
      return { rows: [] };
    }
  }

  const sql = new SizeCatalogSql();
  const resolver = new PostgresMerchantCatalogContextResolver(sql);

  const exact = await resolver.listRelevantContext({
    merchantId: "merchant-a",
    customerText: "Does the Classic Shirt M use cotton?",
    language: "en",
  });

  assert.equal(exact.length, 1);
  assert.equal(exact[0].id, "catalog-variant:shirt-a:variant-m");
  assert.equal(exact[0].variantId, "variant-m");
  assert.deepEqual(exact[0].selectedOptions, { size: "M" });

  const notStandalone = await resolver.listRelevantContext({
    merchantId: "merchant-a",
    customerText: "Is the Classic Shirt premium cotton?",
    language: "en",
  });

  assert.equal(notStandalone.length, 1);
  assert.equal(notStandalone[0].id, "catalog-product:shirt-a");
  assert.equal(notStandalone[0].variantId, undefined);
});

test("trusted visual alternative is presented as similar and becomes the reply catalog reference", async () => {
  let receivedCatalog = [];
  let receivedTrustedProductIdHint;

  const engine = new KnowledgeDecisionEngine({
    runtime: emptyRuntime(),
    factResolver: { async resolve() { return null; } },
    policyResolver: policy(),
    catalogContextResolver: {
      async listRelevantContext(request) {
        receivedTrustedProductIdHint = request.trustedProductIdHint;
        return request.trustedProductIdHint === "product-65w"
          ? catalogContext
          : [];
      },
    },
    encyclopediaResolver: {
      async resolve() {
        return null;
      },
      async listRelevantContext() {
        return [];
      },
    },
    allowGeneratedAutoReply: true,
    aiProvider: {
      providerId: "test-visual-alternative-ai",
      async generate(request) {
        receivedCatalog = request.catalogKnowledge || [];
        return {
          answerText:
            "We have a similar option: the PowerMax 65W Charger.",
          language: "en",
          confidence: 0.96,
          risk: "low",
          canAnswer: true,
          reason: "trusted merchant visual alternative",
          source: "openai_generated",
          groundingRecordIds: ["catalog-product:product-65w"],
          providerId: "test-visual-alternative-ai",
          model: "test-model",
        };
      },
    },
  });

  const result = await engine.decide({
    merchantId: "merchant-a",
    customerText: "Do you have something like this?",
    languageHint: "en",
    trustedVisualAlternative: {
      productId: "product-65w",
      confidence: 0.82,
    },
  } as Parameters<typeof engine.decide>[0] & {
    trustedVisualAlternative: {
      productId: string;
      variantId?: string;
      confidence: number;
    };
  });

  assert.equal(receivedTrustedProductIdHint, "product-65w");
  assert.equal(receivedCatalog.length, 1);
  assert.equal(result.action, "reply");
  assert.match(result.answerText || "", /similar/i);
  assert.equal(result.matchedRecordId, "catalog-product:product-65w");
});

test("trusted visual alternative bypasses unrelated saved-answer interception and reaches merchant catalog grounding", async () => {
  let savedAnswerLookupCount = 0;
  let receivedTrustedProductIdHint;

  const runtime = {
    ...emptyRuntime(),
    async findApprovedSavedAnswer() {
      savedAnswerLookupCount += 1;
      return {
        id: "unrelated-approved-answer",
        merchantId: "merchant-a",
        question: "generic similar product question",
        answerText: "This unrelated approved answer must not intercept visual catalog context.",
        language: "en",
        confidence: 1,
      };
    },
  };

  const engine = new KnowledgeDecisionEngine({
    runtime,
    factResolver: {
      async resolve() {
        return null;
      },
    },
    policyResolver: policy(),
    catalogContextResolver: {
      async listRelevantContext(request) {
        receivedTrustedProductIdHint = request.trustedProductIdHint;
        return request.trustedProductIdHint === "product-65w"
          ? catalogContext
          : [];
      },
    },
    encyclopediaResolver: {
      async resolve() {
        return null;
      },
      async listRelevantContext() {
        return [];
      },
    },
    allowGeneratedAutoReply: true,
    aiProvider: {
      providerId: "test-visual-alternative-priority-ai",
      async generate(request) {
        assert.equal(request.catalogKnowledge?.length, 1);
        return {
          answerText:
            "We have a similar option: the PowerMax 65W Charger.",
          language: "en",
          confidence: 0.96,
          risk: "low",
          canAnswer: true,
          reason: "trusted visual alternative merchant catalog grounding",
          source: "openai_generated",
          groundingRecordIds: ["catalog-product:product-65w"],
          providerId: "test-visual-alternative-priority-ai",
          model: "test-model",
        };
      },
    },
  });

  const result = await engine.decide({
    merchantId: "merchant-a",
    customerText: "Do you have something like this?",
    languageHint: "en",
    trustedVisualAlternative: {
      productId: "product-65w",
      confidence: 0.82,
    },
  });

  assert.equal(savedAnswerLookupCount, 0);
  assert.equal(receivedTrustedProductIdHint, "product-65w");
  assert.equal(result.action, "reply");
  assert.equal(result.matchedRecordId, "catalog-product:product-65w");
  assert.match(result.answerText || "", /similar/i);
});

test("trusted visual alternative bypasses unrelated semantic interception and reaches merchant catalog grounding", async () => {
  let semanticLookupCount = 0;
  let receivedTrustedProductIdHint;

  const runtime = {
    ...emptyRuntime(),
    async retrieveSemanticMatch() {
      semanticLookupCount += 1;
      return {
        score: 0.99,
        document: {
          id: "unrelated-semantic-answer",
          merchantId: "merchant-a",
          question: "generic similar product question",
          answer:
            "This unrelated semantic answer must not intercept visual catalog context.",
          language: "en",
          confidence: 0.99,
        },
      };
    },
  };

  const engine = new KnowledgeDecisionEngine({
    runtime,
    factResolver: {
      async resolve() {
        return null;
      },
    },
    policyResolver: policy(),
    catalogContextResolver: {
      async listRelevantContext(request) {
        receivedTrustedProductIdHint = request.trustedProductIdHint;
        return request.trustedProductIdHint === "product-65w"
          ? catalogContext
          : [];
      },
    },
    encyclopediaResolver: {
      async resolve() {
        return null;
      },
      async listRelevantContext() {
        return [];
      },
    },
    allowGeneratedAutoReply: true,
    aiProvider: {
      providerId: "test-visual-alternative-semantic-priority-ai",
      async generate(request) {
        assert.equal(request.catalogKnowledge?.length, 1);
        return {
          answerText:
            "We have a similar option: the PowerMax 65W Charger.",
          language: "en",
          confidence: 0.96,
          risk: "low",
          canAnswer: true,
          reason: "trusted visual alternative merchant catalog grounding",
          source: "openai_generated",
          groundingRecordIds: ["catalog-product:product-65w"],
          providerId: "test-visual-alternative-semantic-priority-ai",
          model: "test-model",
        };
      },
    },
  });

  const result = await engine.decide({
    merchantId: "merchant-a",
    customerText: "Do you have something like this?",
    languageHint: "en",
    trustedVisualAlternative: {
      productId: "product-65w",
      confidence: 0.82,
    },
  });

  assert.equal(semanticLookupCount, 0);
  assert.equal(receivedTrustedProductIdHint, "product-65w");
  assert.equal(result.action, "reply");
  assert.equal(result.matchedRecordId, "catalog-product:product-65w");
  assert.match(result.answerText || "", /similar/i);
});

test("trusted visual alternative has a safe deterministic catalog reply when AI is unavailable", async () => {
  const engine = new KnowledgeDecisionEngine({
    runtime: emptyRuntime(),
    factResolver: {
      async resolve() {
        return null;
      },
    },
    policyResolver: policy(),
    catalogContextResolver: {
      async listRelevantContext(request) {
        assert.equal(request.trustedProductIdHint, "product-65w");
        return catalogContext;
      },
    },
    encyclopediaResolver: {
      async resolve() {
        return null;
      },
      async listRelevantContext() {
        return [];
      },
    },
    allowGeneratedAutoReply: true,
    // Intentionally no aiProvider: production must remain safe when AI is disabled.
  });

  const result = await engine.decide({
    merchantId: "merchant-a",
    customerText: "Do you have something like this?",
    languageHint: "en",
    trustedVisualAlternative: {
      productId: "product-65w",
      confidence: 0.82,
    },
  });

  assert.equal(result.action, "reply");
  assert.equal(result.matchedRecordId, "catalog-product:product-65w");
  assert.match(result.answerText || "", /similar/i);
  assert.match(result.answerText || "", /PowerMax 65W Charger/i);
  assert.equal(result.requiresMerchantApproval, false);
});

test("deterministic visual alternative reply refuses a catalog product that does not match the trusted product id", async () => {
  let trainingCreated = false;

  const runtime = {
    ...emptyRuntime(),
    async createTrainingRequest() {
      trainingCreated = true;
      return { id: "training-visual-alt-mismatch" };
    },
  };

  const engine = new KnowledgeDecisionEngine({
    runtime,
    factResolver: {
      async resolve() {
        return null;
      },
    },
    policyResolver: policy(),
    catalogContextResolver: {
      async listRelevantContext() {
        return [
          {
            ...catalogContext[0],
            id: "catalog-product:different-product",
            productId: "different-product",
            name: "Different Product",
            factualText: "Product name: Different Product",
          },
        ];
      },
    },
    encyclopediaResolver: {
      async resolve() {
        return null;
      },
      async listRelevantContext() {
        return [];
      },
    },
    allowGeneratedAutoReply: true,
  });

  const result = await engine.decide({
    merchantId: "merchant-a",
    customerText: "Do you have something like this?",
    languageHint: "en",
    trustedVisualAlternative: {
      productId: "product-65w",
      confidence: 0.82,
    },
  });

  assert.equal(trainingCreated, true);
  assert.notEqual(result.action, "reply");
  assert.equal(result.matchedRecordId, null);
  assert.notEqual(
    result.reasonCode,
    "TRUSTED_VISUAL_ALTERNATIVE_CATALOG_REPLY",
  );
});

test("trusted visual alternative never auto-replies with AI wording that claims exact image identity", async () => {
  const engine = new KnowledgeDecisionEngine({
    runtime: emptyRuntime(),
    factResolver: {
      async resolve() {
        return null;
      },
    },
    policyResolver: policy(),
    catalogContextResolver: {
      async listRelevantContext(request) {
        assert.equal(request.trustedProductIdHint, "product-65w");
        return catalogContext;
      },
    },
    encyclopediaResolver: {
      async resolve() {
        return null;
      },
      async listRelevantContext() {
        return [];
      },
    },
    allowGeneratedAutoReply: true,
    aiProvider: {
      providerId: "test-visual-alternative-exact-identity-ai",
      async generate() {
        return {
          answerText:
            "Yes, this is the PowerMax 65W Charger.",
          language: "en",
          confidence: 0.99,
          risk: "low",
          canAnswer: true,
          reason: "incorrect exact identity claim",
          source: "openai_generated",
          groundingRecordIds: ["catalog-product:product-65w"],
          providerId:
            "test-visual-alternative-exact-identity-ai",
          model: "test-model",
        };
      },
    },
  });

  const result = await engine.decide({
    merchantId: "merchant-a",
    customerText: "Do you have something like this?",
    languageHint: "en",
    trustedVisualAlternative: {
      productId: "product-65w",
      confidence: 0.82,
    },
  });

  // A visual alternative is reference-only evidence. Even a fully grounded,
  // high-confidence AI candidate must not turn it into exact image identity.
  assert.notEqual(
    result.action === "reply" &&
      result.answerText ===
        "Yes, this is the PowerMax 65W Charger.",
    true,
  );
});

test("trusted visual alternative exact-identity wording is rejected across supported languages", async () => {
  const cases = [
    {
      language: "ar" as const,
      customerText: "هذا نفس المنتج؟",
      unsafeAnswer: "نعم، هذا هو شاحن PowerMax 65W.",
    },
    {
      language: "ku" as const,
      customerText: "ئەمە هەمان بەرهەمە؟",
      unsafeAnswer: "بەڵێ، ئەمە PowerMax 65W Charger ـە.",
    },
  ];

  for (const item of cases) {
    const engine = new KnowledgeDecisionEngine({
      runtime: emptyRuntime(),
      factResolver: {
        async resolve() {
          return null;
        },
      },
      policyResolver: policy(),
      catalogContextResolver: {
        async listRelevantContext(request) {
          assert.equal(request.trustedProductIdHint, "product-65w");
          return catalogContext;
        },
      },
      encyclopediaResolver: {
        async resolve() {
          return null;
        },
        async listRelevantContext() {
          return [];
        },
      },
      allowGeneratedAutoReply: true,
      aiProvider: {
        providerId: `test-visual-alternative-${item.language}-identity-ai`,
        async generate() {
          return {
            answerText: item.unsafeAnswer,
            language: item.language,
            confidence: 0.99,
            risk: "low",
            canAnswer: true,
            reason: "incorrect exact identity claim",
            source: "openai_generated",
            groundingRecordIds: ["catalog-product:product-65w"],
            providerId:
              `test-visual-alternative-${item.language}-identity-ai`,
            model: "test-model",
          };
        },
      },
    });

    const result = await engine.decide({
      merchantId: "merchant-a",
      customerText: item.customerText,
      languageHint: item.language,
      trustedVisualAlternative: {
        productId: "product-65w",
        confidence: 0.82,
      },
    });

    assert.notEqual(
      result.action === "reply" &&
        result.answerText === item.unsafeAnswer,
      true,
      `unsafe exact identity reply escaped for ${item.language}`,
    );
  }
});

test("trusted visual alternative keeps qualified similar wording eligible for auto-reply", async () => {
  const cases = [
    {
      language: "ar" as const,
      customerText: "عدكم مثل هذا؟",
      safeAnswer: "نعم، عندنا خيار مشابه: PowerMax 65W Charger.",
    },
    {
      language: "ku" as const,
      customerText: "هاوشێوەی ئەمەتان هەیە؟",
      safeAnswer:
        "بەڵێ، هەڵبژاردەیەکی هاوشێوەمان هەیە: PowerMax 65W Charger.",
    },
    {
      language: "en" as const,
      customerText: "Do you have something like this?",
      safeAnswer:
        "Yes, we have a similar option: PowerMax 65W Charger.",
    },
  ];

  for (const item of cases) {
    const engine = new KnowledgeDecisionEngine({
      runtime: emptyRuntime(),
      factResolver: {
        async resolve() {
          return null;
        },
      },
      policyResolver: policy(),
      catalogContextResolver: {
        async listRelevantContext() {
          return catalogContext;
        },
      },
      encyclopediaResolver: {
        async resolve() {
          return null;
        },
        async listRelevantContext() {
          return [];
        },
      },
      allowGeneratedAutoReply: true,
      aiProvider: {
        providerId: `test-visual-alternative-${item.language}-safe-ai`,
        async generate() {
          return {
            answerText: item.safeAnswer,
            language: item.language,
            confidence: 0.99,
            risk: "low",
            canAnswer: true,
            reason: "qualified similar product",
            source: "openai_generated",
            groundingRecordIds: ["catalog-product:product-65w"],
            providerId:
              `test-visual-alternative-${item.language}-safe-ai`,
            model: "test-model",
          };
        },
      },
    });

    const result = await engine.decide({
      merchantId: "merchant-a",
      customerText: item.customerText,
      languageHint: item.language,
      trustedVisualAlternative: {
        productId: "product-65w",
        confidence: 0.82,
      },
    });

    assert.equal(result.action, "reply");
    assert.equal(result.answerText, item.safeAnswer);
    assert.equal(
      result.matchedRecordId,
      "catalog-product:product-65w",
    );
  }
});

test("trusted visual alternative rejects mixed exact-identity and similarity wording", async () => {
  const runtime = emptyRuntime();

  const engine = new KnowledgeDecisionEngine({
    runtime,
    factResolver: {
      async resolve() {
        return null;
      },
    },
    policyResolver: policy(),
    catalogContextResolver: {
      async listRelevantContext(request) {
        assert.equal(request.trustedProductIdHint, "product-65w");
        return catalogContext;
      },
    },
    encyclopediaResolver: {
      async resolve() {
        return null;
      },
      async listRelevantContext() {
        return [];
      },
    },
    allowGeneratedAutoReply: true,
    aiProvider: {
      providerId: "test-visual-alternative-mixed-identity-ai",
      async generate() {
        return {
          answerText:
            "This is the same PowerMax 65W Charger; it has a similar design.",
          language: "en",
          confidence: 0.95,
          risk: "low",
          canAnswer: true,
          reason: "mixed exact identity and similarity claim",
          source: "openai_generated",
          groundingRecordIds: ["catalog-product:product-65w"],
          providerId: "test-visual-alternative-mixed-identity-ai",
          model: "test-model",
        };
      },
    },
  });

  const result = await engine.decide({
    merchantId: "merchant-1",
    customerText: "Do you have something like this?",
    languageHint: "en",
    trustedVisualAlternative: {
      productId: "product-65w",
      confidence: 0.9,
    },
  });

  assert.equal(result.action, "reply");
  assert.equal(result.source, "merchant_approved");
  assert.equal(
    result.reasonCode,
    "TRUSTED_VISUAL_ALTERNATIVE_CATALOG_REPLY",
  );
  assert.match(result.answerText, /\bsimilar\b/i);
  assert.doesNotMatch(result.answerText, /\b(?:same|exact)\b/i);
});

test("trusted visual alternative rejects mixed exact-identity and similarity wording in Arabic and Kurdish", async () => {
  const cases = [
    {
      language: "ar" as const,
      customerText: "عدكم مثل هذا؟",
      unsafeAnswer:
        "نعم، هذا هو نفس PowerMax 65W Charger وعندنا خيار مشابه.",
    },
    {
      language: "ku" as const,
      customerText: "هاوشێوەی ئەمەتان هەیە؟",
      unsafeAnswer:
        "بەڵێ، ئەمە هەمان PowerMax 65W Charger ـە و هەڵبژاردەیەکی هاوشێوەیە.",
    },
  ];

  for (const item of cases) {
    const engine = new KnowledgeDecisionEngine({
      runtime: emptyRuntime(),
      factResolver: {
        async resolve() {
          return null;
        },
      },
      policyResolver: policy(),
      catalogContextResolver: {
        async listRelevantContext() {
          return catalogContext;
        },
      },
      encyclopediaResolver: {
        async resolve() {
          return null;
        },
        async listRelevantContext() {
          return [];
        },
      },
      allowGeneratedAutoReply: true,
      aiProvider: {
        providerId: `test-visual-alternative-mixed-${item.language}-ai`,
        async generate() {
          return {
            answerText: item.unsafeAnswer,
            language: item.language,
            confidence: 0.99,
            risk: "low",
            canAnswer: true,
            reason: "mixed exact identity and similarity claim",
            source: "openai_generated",
            groundingRecordIds: ["catalog-product:product-65w"],
            providerId:
              `test-visual-alternative-mixed-${item.language}-ai`,
            model: "test-model",
          };
        },
      },
    });

    const result = await engine.decide({
      merchantId: "merchant-a",
      customerText: item.customerText,
      languageHint: item.language,
      trustedVisualAlternative: {
        productId: "product-65w",
        confidence: 0.82,
      },
    });

    assert.equal(
      result.action === "reply" &&
        result.answerText === item.unsafeAnswer,
      false,
      `mixed exact identity escaped for ${item.language}`,
    );
    assert.equal(
      result.reasonCode,
      "TRUSTED_VISUAL_ALTERNATIVE_CATALOG_REPLY",
    );
  }
});

test("exact catalog conversation identity outranks a simultaneous trusted visual alternative", async () => {
  const exactAnswer = "The PowerMax 65W Charger is the product we are discussing.";

  const engine = new KnowledgeDecisionEngine({
    runtime: emptyRuntime(),
    factResolver: {
      async resolve(request) {
        assert.equal(request.trustedProductIdHint, "product-65w");
        return null;
      },
    },
    policyResolver: policy(),
    catalogContextResolver: {
      async listRelevantContext(request) {
        assert.equal(request.trustedProductIdHint, "product-65w");
        return catalogContext;
      },
    },
    encyclopediaResolver: {
      async resolve() {
        return null;
      },
      async listRelevantContext() {
        return [];
      },
    },
    allowGeneratedAutoReply: true,
    aiProvider: {
      providerId: "test-exact-conversation-outranks-visual-alternative",
      async generate() {
        return {
          answerText: exactAnswer,
          language: "en",
          confidence: 0.99,
          risk: "low",
          canAnswer: true,
          reason: "exact trusted conversation product",
          source: "openai_generated",
          groundingRecordIds: ["catalog-product:product-65w"],
          providerId: "test-exact-conversation-outranks-visual-alternative",
          model: "test-model",
        };
      },
    },
  });

  const result = await engine.decide({
    merchantId: "merchant-a",
    customerText: "Tell me about it.",
    languageHint: "en",
    recentMessages: [
      {
        sender: "fawri",
        text: "PowerMax 65W Charger",
        createdAt: "2026-10-05T00:00:00.000Z",
        matchedRecordId: "catalog-product:product-65w",
      },
    ],
    trustedVisualAlternative: {
      productId: "other-product",
      confidence: 0.82,
    },
  });

  assert.equal(result.action, "reply");
  assert.equal(result.answerText, exactAnswer);
  assert.equal(result.matchedRecordId, "catalog-product:product-65w");
});

test("visual alternative stock intent uses separate trusted alternative identity", async () => {
  let factResolverCalled = false;

  const engine = new KnowledgeDecisionEngine({
    runtime: emptyRuntime(),
    factResolver: {
      async resolve(request) {
        factResolverCalled = true;

        // A visual alternative must never masquerade as exact conversation identity.
        assert.equal(request.trustedProductIdHint, undefined);
        assert.equal(request.trustedVariantIdHint, undefined);

        // It gets its own server-trusted capability for operational availability.
        assert.equal(
          request.trustedVisualAlternativeProductId,
          "product-65w",
        );
        assert.equal(
          request.trustedVisualAlternativeVariantId,
          undefined,
        );

        throw new Error("VISUAL_ALTERNATIVE_FACT_CAPABILITY_PROVEN");
      },
    },
    policyResolver: policy(),
    catalogContextResolver: {
      async listRelevantContext(request) {
        assert.equal(request.trustedProductIdHint, "product-65w");
        return catalogContext;
      },
    },
    encyclopediaResolver: {
      async resolve() {
        return null;
      },
      async listRelevantContext() {
        return [];
      },
    },
    allowGeneratedAutoReply: true,
  });

  await assert.rejects(
    engine.decide({
      merchantId: "merchant-a",
      customerText: "عدكم مثل هذا متوفر؟",
      languageHint: "ar",
      trustedVisualAlternative: {
        productId: "product-65w",
        confidence: 0.82,
      },
    }),
    /VISUAL_ALTERNATIVE_FACT_CAPABILITY_PROVEN/,
  );

  assert.equal(factResolverCalled, true);
});

test("visual alternative stock reply preserves similar-product semantics", async () => {
  const engine = new KnowledgeDecisionEngine({
    runtime: emptyRuntime(),
    factResolver: {
      async resolve(input) {
        assert.equal(input.trustedProductIdHint, undefined);
        assert.equal(
          input.trustedVisualAlternativeProductId,
          "product-visual-stock-semantic",
        );
        return {
          answerText: "قميص رياضي أسود متوفر حاليًا.",
          language: "ar",
          confidence: 1,
          factType: "product_stock",
          recordId: "stock:product-visual-stock-semantic",
          contextRecordId:
            "catalog-product:product-visual-stock-semantic",
        };
      },
    },
    policyResolver: policy(),
    catalogContextResolver: {
      async listRelevantContext() {
        return [];
      },
    },
    encyclopediaResolver: {
      async resolve() {
        return null;
      },
      async listRelevantContext() {
        return [];
      },
    },
    allowGeneratedAutoReply: true,
  });

  const result = await engine.decide({
    merchantId: "merchant-1",
    customerText: "عدكم مثل هذا متوفر؟",
    languageHint: "ar",
    trustedVisualAlternative: {
      productId: "product-visual-stock-semantic",
      confidence: 0.91,
    },
  });

  assert.equal(result.action, "reply");
  assert.equal(result.stage, "database_fact");
  assert.match(result.answerText || "", /مشابه|بديل|خيار قريب/);
  assert.match(result.answerText || "", /قميص رياضي أسود متوفر حاليًا/);
  assert.equal(
    result.matchedRecordId,
    "catalog-product:product-visual-stock-semantic",
  );
});

test("visual alternatives keep ranked candidates available for stock fallback", async () => {
  const seen: string[] = [];

  const engine = new KnowledgeDecisionEngine({
    runtime: emptyRuntime(),
    factResolver: {
      async resolve(input) {
        assert.equal(input.trustedProductIdHint, undefined);

        const productId = input.trustedVisualAlternativeProductId;
        if (productId) seen.push(productId);

        if (productId === "visual-alt-out") {
          return {
            answerText: "الخيار الأول غير متوفر حاليًا.",
            language: "ar",
            confidence: 1,
            factType: "product_stock",
            recordId: "stock:visual-alt-out",
            contextRecordId: "catalog-product:visual-alt-out",
            availability: {
              trackInventory: true,
              availableQuantity: 0,
              requestedQuantity: null,
              fulfillable: false,
            },
          };
        }

        if (productId === "visual-alt-available") {
          return {
            answerText: "الخيار الثاني متوفر حاليًا.",
            language: "ar",
            confidence: 1,
            factType: "product_stock",
            recordId: "stock:visual-alt-available",
            contextRecordId: "catalog-product:visual-alt-available",
            availability: {
              trackInventory: true,
              availableQuantity: 8,
              requestedQuantity: null,
              fulfillable: true,
            },
          };
        }

        return null;
      },
    },
    policyResolver: policy(),
    catalogContextResolver: {
      async listRelevantContext() {
        return [];
      },
    },
    encyclopediaResolver: {
      async resolve() {
        return null;
      },
      async listRelevantContext() {
        return [];
      },
    },
    allowGeneratedAutoReply: true,
  });

  const result = await engine.decide({
    merchantId: "merchant-a",
    customerText: "عدكم مثل هذا متوفر؟",
    languageHint: "ar",

    // Backward-compatible primary candidate.
    trustedVisualAlternative: {
      productId: "visual-alt-out",
      confidence: 0.96,
    },

    // Required ranked candidate set: first unavailable, second available.
    trustedVisualAlternatives: [
      {
        productId: "visual-alt-out",
        confidence: 0.96,
      },
      {
        productId: "visual-alt-available",
        confidence: 0.91,
      },
    ],
  });

  assert.deepEqual(seen, [
    "visual-alt-out",
    "visual-alt-available",
  ]);

  assert.equal(result.action, "reply");
  assert.match(result.answerText || "", /مشابه|بديل|خيار قريب/);
  assert.match(result.answerText || "", /الخيار الثاني متوفر حاليًا/);
  assert.equal(
    result.matchedRecordId,
    "catalog-product:visual-alt-available",
  );
});

test("visual stock fallback keeps top-ranked shortage when no alternative is fulfillable", async () => {
  const seen: string[] = [];

  const engine = new KnowledgeDecisionEngine({
    runtime: emptyRuntime(),
    factResolver: {
      async resolve(input) {
        const productId = input.trustedVisualAlternativeProductId;
        if (productId) seen.push(productId);

        if (!productId) return null;

        return {
          answerText:
            productId === "visual-alt-first"
              ? "الخيار الأول غير متوفر بالكمية المطلوبة."
              : "الخيار الثاني غير متوفر بالكمية المطلوبة.",
          language: "ar",
          confidence: 1,
          factType: "product_stock",
          recordId: `stock:${productId}`,
          contextRecordId: `catalog-product:${productId}`,
          availability: {
            trackInventory: true,
            availableQuantity: productId === "visual-alt-first" ? 2 : 1,
            requestedQuantity: 3,
            fulfillable: false,
          },
        };
      },
    },
    policyResolver: policy(),
    catalogContextResolver: {
      async listRelevantContext() {
        return [];
      },
    },
    encyclopediaResolver: {
      async resolve() {
        return null;
      },
      async listRelevantContext() {
        return [];
      },
    },
    allowGeneratedAutoReply: true,
  });

  const result = await engine.decide({
    merchantId: "merchant-a",
    customerText: "أريد 3 قطع مثل هذا، متوفر؟",
    languageHint: "ar",
    trustedVisualAlternative: {
      productId: "visual-alt-first",
      confidence: 0.96,
    },
    trustedVisualAlternatives: [
      { productId: "visual-alt-first", confidence: 0.96 },
      { productId: "visual-alt-second", confidence: 0.91 },
    ],
  });

  assert.deepEqual(seen, ["visual-alt-first", "visual-alt-second"]);
  assert.equal(result.action, "reply");
  assert.match(result.answerText || "", /الخيار الأول غير متوفر/);
  assert.equal(result.matchedRecordId, "catalog-product:visual-alt-first");
});

test("visual stock fallback never infers availability from answer text", async () => {
  const seen: string[] = [];

  const engine = new KnowledgeDecisionEngine({
    runtime: emptyRuntime(),
    factResolver: {
      async resolve(input) {
        const productId = input.trustedVisualAlternativeProductId;
        if (productId) seen.push(productId);

        if (productId === "visual-alt-no-metadata") {
          return {
            answerText: "هذا الخيار غير متوفر حاليًا.",
            language: "ar",
            confidence: 1,
            factType: "product_stock",
            recordId: "stock:visual-alt-no-metadata",
            contextRecordId: "catalog-product:visual-alt-no-metadata",
          };
        }

        throw new Error("fallback must not be inferred from answer text");
      },
    },
    policyResolver: policy(),
    catalogContextResolver: {
      async listRelevantContext() {
        return [];
      },
    },
    encyclopediaResolver: {
      async resolve() {
        return null;
      },
      async listRelevantContext() {
        return [];
      },
    },
    allowGeneratedAutoReply: true,
  });

  const result = await engine.decide({
    merchantId: "merchant-a",
    customerText: "عدكم مثل هذا متوفر؟",
    languageHint: "ar",
    trustedVisualAlternative: {
      productId: "visual-alt-no-metadata",
      confidence: 0.96,
    },
    trustedVisualAlternatives: [
      { productId: "visual-alt-no-metadata", confidence: 0.96 },
      { productId: "must-not-run", confidence: 0.91 },
    ],
  });

  assert.deepEqual(seen, ["visual-alt-no-metadata"]);
  assert.equal(result.action, "reply");
  assert.equal(
    result.matchedRecordId,
    "catalog-product:visual-alt-no-metadata",
  );
});

test("exact conversation identity prevents ranked visual stock fallback", async () => {
  const seenVisualAlternatives: string[] = [];

  const engine = new KnowledgeDecisionEngine({
    runtime: emptyRuntime(),
    factResolver: {
      async resolve(input) {
        assert.equal(input.trustedProductIdHint, "exact-product");
        assert.equal(input.trustedVisualAlternativeProductId, undefined);

        if (input.trustedVisualAlternativeProductId) {
          seenVisualAlternatives.push(
            input.trustedVisualAlternativeProductId,
          );
        }

        return {
          answerText: "المنتج المحدد متوفر حاليًا.",
          language: "ar",
          confidence: 1,
          factType: "product_stock",
          recordId: "stock:exact-product",
          contextRecordId: "catalog-product:exact-product",
          availability: {
            trackInventory: true,
            availableQuantity: 1,
            requestedQuantity: 3,
            fulfillable: false,
          },
        };
      },
    },
    policyResolver: policy(),
    catalogContextResolver: {
      async listRelevantContext() {
        return [];
      },
    },
    encyclopediaResolver: {
      async resolve() {
        return null;
      },
      async listRelevantContext() {
        return [];
      },
    },
    allowGeneratedAutoReply: true,
  });

  const result = await engine.decide({
    merchantId: "merchant-a",
    customerText: "متوفر؟",
    languageHint: "ar",
    recentMessages: [
      {
        sender: "fawri",
        text: "هذا هو المنتج المحدد.",
        createdAt: "2026-10-05T00:00:00.000Z",
        matchedRecordId: "catalog-product:exact-product",
      },
    ],
    trustedVisualAlternative: {
      productId: "visual-alt-first",
      confidence: 0.96,
    },
    trustedVisualAlternatives: [
      { productId: "visual-alt-first", confidence: 0.96 },
      { productId: "visual-alt-second", confidence: 0.91 },
    ],
  });

  assert.deepEqual(seenVisualAlternatives, []);
  assert.equal(result.action, "reply");
  assert.equal(result.matchedRecordId, "catalog-product:exact-product");
});

test("malformed ranked visual alternative set fails closed instead of partially trusting remaining candidates", async () => {
  const resolvedVisualIds: string[] = [];

  const engine = new KnowledgeDecisionEngine({
    runtime: emptyRuntime(),
    factResolver: {
      async resolve(input) {
        if (input.trustedVisualAlternativeProductId) {
          resolvedVisualIds.push(input.trustedVisualAlternativeProductId);
        }
        return null;
      },
    },
    policyResolver: policy(),
    catalogContextResolver: {
      async listRelevantContext() {
        return [];
      },
    },
    encyclopediaResolver: {
      async resolve() {
        return null;
      },
      async listRelevantContext() {
        return [];
      },
    },
    allowGeneratedAutoReply: true,
  });

  await assert.rejects(
    () =>
      engine.decide({
        merchantId: "merchant-a",
        customerText: "Do you have 3 like this?",
        languageHint: "en",
        trustedVisualAlternative: {
          productId: "product-singular-valid",
          confidence: 0.95,
        },
        trustedVisualAlternatives: [
          {
            productId: "product-valid-first",
            confidence: 0.91,
          },
          {
            productId: "",
            confidence: 0.88,
          },
          {
            productId: "product-valid-third",
            confidence: 0.82,
          },
        ],
      }),
    /trusted catalog synthesis must not create training/,
  );

  assert.deepEqual(
    resolvedVisualIds,
    [],
    "one malformed member must invalidate the entire trusted ranked set",
  );
});
