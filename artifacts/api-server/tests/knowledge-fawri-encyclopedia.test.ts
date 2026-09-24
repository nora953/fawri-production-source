// @ts-nocheck
import assert from "node:assert/strict";
import test from "node:test";
import { KnowledgeDecisionEngine } from "../src/services/ai/knowledgeDecisionEngine.js";
import {
  FAWRI_ENCYCLOPEDIA_ARTICLE_IDS,
  PostgresFawriEncyclopediaResolver,
} from "../src/services/knowledge/fawriEncyclopedia.js";

class FakeSql {
  constructor(activityType = "ملابس") {
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

function emptyRuntime(savedAnswer = null) {
  return {
    authorityId: "encyclopedia-test-runtime",
    legacyFallbackEnabled: false,
    async findApprovedSavedAnswer() { return savedAnswer; },
    async retrieveSemanticMatch() { return null; },
    async listApprovedSemanticDocuments() { return []; },
    async createTrainingRequest() {
      throw new Error("encyclopedia path must not create training");
    },
    async recordGeneratedCandidate() {
      throw new Error("encyclopedia path must not create generated candidates");
    },
    async appendAudit() {},
  };
}

test("bootstrap encyclopedia contains general plus all five launch activity packs", () => {
  const ids = new Set(FAWRI_ENCYCLOPEDIA_ARTICLE_IDS);
  for (const id of [
    "fawri-global-sku",
    "fawri-fashion-sizing",
    "fawri-electronics-ram-storage",
    "fawri-food-date-labels",
    "fawri-perfume-edt-edp",
    "fawri-jewelry-925",
  ]) {
    assert.equal(ids.has(id), true, id);
  }
});

test("fashion merchant gets a professional Arabic sizing answer from the activity encyclopedia", async () => {
  const sql = new FakeSql("ملابس");
  const resolver = new PostgresFawriEncyclopediaResolver(sql);

  const result = await resolver.resolve({
    merchantId: "merchant-fashion",
    customerText: "شلون اعرف مقاسي",
    language: "ar",
  });

  assert.equal(result?.articleId, "fawri-fashion-sizing");
  assert.equal(result?.scope, "activity");
  assert.equal(result?.activityKey, "fashion");
  assert.match(result?.answerText || "", /جدول مقاسات المنتج/);
  assert.deepEqual(sql.queries[0].values, ["merchant-fashion"]);
});

test("electronics merchant does not receive perfume-pack answers", async () => {
  const sql = new FakeSql("إلكترونيات");
  const resolver = new PostgresFawriEncyclopediaResolver(sql);

  const result = await resolver.resolve({
    merchantId: "merchant-electronics",
    customerText: "ما الفرق بين edt و edp",
    language: "ar",
  });

  assert.equal(result, null);
});

test("custom activities still receive global encyclopedia knowledge", async () => {
  const sql = new FakeSql("مكتبة وقرطاسية");
  const resolver = new PostgresFawriEncyclopediaResolver(sql);

  const result = await resolver.resolve({
    merchantId: "merchant-custom",
    customerText: "شنو معنى sku",
    language: "ar",
  });

  assert.equal(result?.articleId, "fawri-global-sku");
  assert.equal(result?.scope, "global");
  assert.equal(result?.activityKey, null);
});

test("authoritative operational questions never fall through to the encyclopedia", async () => {
  const sql = new FakeSql("إلكترونيات");
  const resolver = new PostgresFawriEncyclopediaResolver(sql);

  const result = await resolver.resolve({
    merchantId: "merchant-electronics",
    customerText: "شنو سعر هاتف X هسه؟",
    language: "ar",
  });

  assert.equal(result, null);
  assert.equal(sql.queries.length, 0);
});

test("merchant-approved knowledge keeps priority over the Fawri encyclopedia", async () => {
  let encyclopediaCalls = 0;
  const engine = new KnowledgeDecisionEngine({
    runtime: emptyRuntime({
      id: "saved-size",
      merchantId: "merchant-a",
      category: "custom",
      questionPattern: "شلون اعرف مقاسي",
      answerText: "استخدم جدول المقاسات الخاص بمتجرنا الموجود مع كل منتج.",
      language: "ar",
      source: "merchant_approved",
      active: true,
      version: 1,
      createdAt: "2026-09-24T00:00:00.000Z",
      updatedAt: "2026-09-24T00:00:00.000Z",
    }),
    factResolver: { async resolve() { return null; } },
    policyResolver: null,
    encyclopediaResolver: {
      async resolve() {
        encyclopediaCalls += 1;
        return {
          articleId: "fawri-fashion-sizing",
          scope: "activity",
          activityKey: "fashion",
          answerText: "generic answer",
          language: "ar",
          confidence: 1,
        };
      },
    },
  });

  const result = await engine.decide({
    merchantId: "merchant-a",
    customerText: "شلون اعرف مقاسي",
    languageHint: "ar",
  });

  assert.equal(result.stage, "approved_saved_answer");
  assert.equal(result.source, "merchant_approved");
  assert.equal(encyclopediaCalls, 0);
});

test("encyclopedia answers before AI fallback when merchant-specific knowledge has no match", async () => {
  let aiCalls = 0;
  const engine = new KnowledgeDecisionEngine({
    runtime: emptyRuntime(),
    factResolver: { async resolve() { return null; } },
    policyResolver: null,
    encyclopediaResolver: {
      async resolve() {
        return {
          articleId: "fawri-electronics-ram-storage",
          scope: "activity",
          activityKey: "electronics",
          answerText: "RAM is temporary working memory; storage is persistent space.",
          language: "en",
          confidence: 0.95,
        };
      },
    },
    aiProvider: {
      providerId: "must-not-run",
      async generate() {
        aiCalls += 1;
        throw new Error("AI must not run when curated knowledge resolves the question");
      },
    },
  });

  const result = await engine.decide({
    merchantId: "merchant-a",
    customerText: "What is the difference between RAM and storage?",
    languageHint: "en",
  });

  assert.equal(aiCalls, 0);
  assert.equal(result.action, "reply");
  assert.equal(result.stage, "fawri_encyclopedia");
  assert.equal(result.source, "fawri_curated");
  assert.equal(result.matchedRecordId, "fawri-electronics-ram-storage");
  assert.equal(result.requiresMerchantApproval, false);
});
