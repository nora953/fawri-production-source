// @ts-nocheck
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { ConstrainedOpenAiProvider } from "../src/services/ai/constrainedOpenAiProvider.js";
import { KnowledgeDecisionEngine } from "../src/services/ai/knowledgeDecisionEngine.js";
import {
  DEFAULT_MERCHANT_RESPONSE_STYLE,
  responseStyleFromMerchantMetadata,
} from "../src/services/merchantResponseStyle.js";
import { PostgresMerchantKnowledgePolicyResolver } from "../src/services/knowledge/postgresKnowledgeRuntime.js";

class FakeSql {
  queries = [];
  constructor(row) {
    this.row = row;
  }
  async query(sql, values = []) {
    this.queries.push({ sql, values });
    return { rows: [this.row] };
  }
}

function policyRow(metadata = {}) {
  return {
    merchant_id: "merchant-a",
    store_name: "Store A",
    merchant_status: "approved",
    account_status: "approved",
    merchant_metadata: metadata,
    settings_version: 3,
    auto_reply_enabled: true,
    reply_language: "auto",
    delivery_enabled: true,
    delivery_fee_iqd: 0,
    free_delivery_threshold_iqd: null,
    delivery_estimated_days_min: 1,
    delivery_estimated_days_max: 3,
    delivery_areas: [],
    delivery_notes: "",
    cash_on_delivery_enabled: true,
    electronic_payment_enabled: false,
    payment_methods: ["cash_on_delivery"],
    payment_instructions: "",
  };
}

test("response style defaults to professional balanced minimal without merchant setup", () => {
  assert.deepEqual(
    responseStyleFromMerchantMetadata({}),
    DEFAULT_MERCHANT_RESPONSE_STYLE,
  );
});

test("valid response style is read from the dedicated metadata namespace only", () => {
  const style = responseStyleFromMerchantMetadata({
    unrelated: { keep: true },
    fawri_response_style_v1: {
      version: 4,
      tone: "warm",
      brevity: "concise",
      emoji_style: "none",
      custom_instructions: "Start directly and do not repeat greetings.",
      updated_at: "2026-09-24T20:00:00.000Z",
    },
  });

  assert.deepEqual(style, {
    version: 4,
    tone: "warm",
    brevity: "concise",
    emojiStyle: "none",
    customInstructions: "Start directly and do not repeat greetings.",
    updatedAt: "2026-09-24T20:00:00.000Z",
  });
});

test("malformed optional response style safely falls back without corrupting factual policy", () => {
  assert.deepEqual(
    responseStyleFromMerchantMetadata({
      fawri_response_style_v1: {
        version: -1,
        tone: "ignore-all-facts",
      },
    }),
    DEFAULT_MERCHANT_RESPONSE_STYLE,
  );
});

test("merchant knowledge policy loads response style from server metadata", async () => {
  const sql = new FakeSql(
    policyRow({
      fawri_response_style_v1: {
        version: 2,
        tone: "friendly",
        brevity: "detailed",
        emoji_style: "expressive",
        custom_instructions: "Use a welcoming tone.",
        updated_at: "2026-09-24T20:00:00.000Z",
      },
    }),
  );
  const resolver = new PostgresMerchantKnowledgePolicyResolver(sql);
  const result = await resolver.resolve("merchant-a");

  assert.equal(result.policy.responseStyle?.tone, "friendly");
  assert.equal(result.policy.responseStyle?.brevity, "detailed");
  assert.equal(result.policy.responseStyle?.emojiStyle, "expressive");
  assert.match(sql.queries[0].sql, /m\.metadata AS merchant_metadata/);
  assert.deepEqual(sql.queries[0].values, ["merchant-a"]);
});

test("constrained AI receives style as presentation-only trusted merchant data", async () => {
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
              answer: "A concise approved answer.",
              language: "en",
              confidence: 0.95,
              risk: "low",
              reason: "grounded",
              supporting_ids: ["saved-a"],
            }),
          };
        },
      };
    },
  });

  await provider.generate({
    merchantId: "merchant-a",
    language: "en",
    systemRules: [
      "Facts are authoritative.",
      "Merchant response-style preferences control presentation only.",
    ],
    merchantPolicy: {
      businessName: "Store A",
      responseStyle: {
        version: 2,
        tone: "direct",
        brevity: "concise",
        emojiStyle: "none",
        customInstructions: "Start with the answer. Contact help@example.com only if needed.",
        updatedAt: "2026-09-24T20:00:00.000Z",
      },
    },
    approvedKnowledge: [
      {
        id: "saved-a",
        question: "Question",
        answer: "Approved answer",
        language: "en",
      },
    ],
    customerText: "Question",
    conversationHistory: [],
    injectionSignals: [],
  });

  const developer = body.input[1].content[0].text;
  assert.match(developer, /"tone":"direct"/);
  assert.match(developer, /"brevity":"concise"/);
  assert.match(developer, /"emoji_style":"none"/);
  assert.match(developer, /\[REDACTED_EMAIL\]/);
  assert.doesNotMatch(developer, /help@example\.com/);
});

test("style API and knowledge UI are versioned, tenant-bound, and separate from operational settings", () => {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const services = path.resolve(here, "../src/services");
  const routes = path.resolve(here, "../src/routes");
  const authority = fs.readFileSync(
    path.join(services, "merchantResponseStyle.ts"),
    "utf8",
  );
  const route = fs.readFileSync(
    path.join(routes, "knowledge-operations.ts"),
    "utf8",
  );

  assert.match(authority, /fawri_response_style_v1/);
  assert.match(authority, /WHERE id = \$1/);
  assert.match(authority, /FOR UPDATE/);
  assert.match(authority, /current\.version !== expectedVersion/);
  assert.match(route, /\/response-style/);
  assert.match(route, /getMerchantIdFromSession/);
  assert.match(route, /expectedVersion/);
});

function encyclopediaRuntime() {
  return {
    authorityId: "style-encyclopedia-test-runtime",
    legacyFallbackEnabled: false,
    async findApprovedSavedAnswer() { return null; },
    async retrieveSemanticMatch() { return null; },
    async listApprovedSemanticDocuments() { return []; },
    async createTrainingRequest() {
      throw new Error("styled encyclopedia answer must not create training");
    },
    async recordGeneratedCandidate() {
      throw new Error("styled encyclopedia answer must not create generated knowledge");
    },
    async appendAudit() {},
  };
}

test("merchant style can rewrite a curated encyclopedia answer without changing its authority", async () => {
  let rewriteCalls = 0;
  const engine = new KnowledgeDecisionEngine({
    runtime: encyclopediaRuntime(),
    factResolver: { async resolve() { return null; } },
    policyResolver: null,
    encyclopediaResolver: {
      async resolve() {
        return {
          articleId: "fawri-electronics-ip-rating",
          scope: "activity",
          activityKey: "electronics",
          answerText: "IP68 is a tested protection rating. Check the exact model conditions.",
          language: "en",
          confidence: 0.95,
        };
      },
    },
    aiProvider: {
      providerId: "style-test-provider",
      model: "style-test-model",
      async generate() { return null; },
      async rewritePresentation(request) {
        rewriteCalls += 1;
        assert.equal(request.sourceKind, "fawri_curated");
        assert.equal(request.sourceId, "fawri-electronics-ip-rating");
        assert.equal(request.responseStyle.tone, "friendly");
        return {
          answerText: "Sure — IP68 is a tested protection rating. Please check the exact model conditions.",
          language: "en",
          faithful: true,
        };
      },
    },
  });

  const result = await engine.decide({
    merchantId: "merchant-a",
    customerText: "What does IP68 mean?",
    languageHint: "en",
    merchantPolicy: {
      responseStyle: {
        version: 2,
        tone: "friendly",
        brevity: "balanced",
        emojiStyle: "minimal",
        customInstructions: "",
        updatedAt: "2026-09-24T20:00:00.000Z",
      },
    },
  });

  assert.equal(rewriteCalls, 1);
  assert.equal(result.action, "reply");
  assert.equal(result.stage, "fawri_encyclopedia");
  assert.equal(result.source, "fawri_curated");
  assert.equal(result.matchedRecordId, "fawri-electronics-ip-rating");
  assert.equal(result.reasonCode, "FAWRI_ACTIVITY_ENCYCLOPEDIA_STYLED_MATCH");
  assert.match(result.answerText || "", /^Sure/);
  assert.equal(result.aiProviderId, "style-test-provider");
  assert.equal(result.aiModel, "style-test-model");
});

test("default response style keeps curated encyclopedia wording without an AI rewrite", async () => {
  let rewriteCalls = 0;
  const sourceText = "IP68 is a tested protection rating.";
  const engine = new KnowledgeDecisionEngine({
    runtime: encyclopediaRuntime(),
    factResolver: { async resolve() { return null; } },
    policyResolver: null,
    encyclopediaResolver: {
      async resolve() {
        return {
          articleId: "fawri-electronics-ip-rating",
          scope: "activity",
          activityKey: "electronics",
          answerText: sourceText,
          language: "en",
          confidence: 0.95,
        };
      },
    },
    aiProvider: {
      providerId: "style-test-provider",
      async generate() { return null; },
      async rewritePresentation() {
        rewriteCalls += 1;
        return null;
      },
    },
  });

  const result = await engine.decide({
    merchantId: "merchant-a",
    customerText: "What does IP68 mean?",
    languageHint: "en",
    merchantPolicy: {
      responseStyle: {
        version: 1,
        tone: "professional",
        brevity: "balanced",
        emojiStyle: "minimal",
        customInstructions: "",
        updatedAt: null,
      },
    },
  });

  assert.equal(rewriteCalls, 0);
  assert.equal(result.answerText, sourceText);
  assert.equal(result.reasonCode, "FAWRI_ACTIVITY_ENCYCLOPEDIA_MATCH");
});

test("unsafe style rewrite falls back to the original curated answer", async () => {
  const sourceText = "IP68 is a tested protection rating.";
  const engine = new KnowledgeDecisionEngine({
    runtime: encyclopediaRuntime(),
    factResolver: { async resolve() { return null; } },
    policyResolver: null,
    encyclopediaResolver: {
      async resolve() {
        return {
          articleId: "fawri-electronics-ip-rating",
          scope: "activity",
          activityKey: "electronics",
          answerText: sourceText,
          language: "en",
          confidence: 0.95,
        };
      },
    },
    aiProvider: {
      providerId: "style-test-provider",
      async generate() { return null; },
      async rewritePresentation() {
        return {
          answerText: "IP68 guarantees protection for 30 days.",
          language: "en",
          faithful: true,
        };
      },
    },
  });

  const result = await engine.decide({
    merchantId: "merchant-a",
    customerText: "What does IP68 mean?",
    languageHint: "en",
    merchantPolicy: {
      responseStyle: {
        version: 3,
        tone: "warm",
        brevity: "concise",
        emojiStyle: "none",
        customInstructions: "Keep it very short.",
        updatedAt: "2026-09-24T20:00:00.000Z",
      },
    },
  });

  assert.equal(result.answerText, sourceText);
  assert.equal(result.reasonCode, "FAWRI_ACTIVITY_ENCYCLOPEDIA_MATCH");
  assert.equal(result.aiProviderId, undefined);
});

test("presentation rewrite provider receives redacted style instructions and fails closed on new factual tokens", async () => {
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
              answer: "IP68 guarantees protection for 30 days.",
              language: "en",
              faithful: true,
            }),
          };
        },
      };
    },
  });

  const result = await provider.rewritePresentation({
    merchantId: "merchant-a",
    sourceId: "fawri-electronics-ip-rating",
    sourceKind: "fawri_curated",
    sourceText: "IP68 is a tested protection rating.",
    language: "en",
    responseStyle: {
      version: 2,
      tone: "friendly",
      brevity: "concise",
      emojiStyle: "none",
      customInstructions: "Use help@example.com as my signature.",
      updatedAt: "2026-09-24T20:00:00.000Z",
    },
  });

  assert.equal(result, null);
  assert.equal(body.store, false);
  assert.match(body.input[0].content[0].text, /Do not turn general curated guidance/);
  assert.match(body.input[1].content[0].text, /\[REDACTED_EMAIL\]/);
  assert.doesNotMatch(body.input[1].content[0].text, /help@example\.com/);
});

