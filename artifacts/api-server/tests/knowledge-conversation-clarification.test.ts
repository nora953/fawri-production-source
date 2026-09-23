import assert from "node:assert/strict";
import test from "node:test";
import { KnowledgeDecisionEngine } from "../src/services/ai/knowledgeDecisionEngine.js";
import {
  KnowledgeRuntimeGateError,
} from "../src/services/knowledge/postgresKnowledgeRuntime.js";

function runtime() {
  return {
    authorityId: "clarification-test-runtime",
    legacyFallbackEnabled: false,
    async findApprovedSavedAnswer() {
      throw new Error("saved answers must not be reached during active clarification");
    },
    async listApprovedSemanticDocuments() {
      throw new Error("semantic retrieval must not be reached during active clarification");
    },
    async createTrainingRequest() {
      throw new Error("clarification must not create a training request");
    },
    async recordGeneratedCandidate() {
      throw new Error("AI candidate recording must not be reached");
    },
    async appendAudit() {
      return undefined;
    },
  };
}

test("variant-required authority error becomes an Arabic clarification without handoff", async () => {
  const engine = new KnowledgeDecisionEngine({
    runtime: runtime(),
    policyResolver: null,
    factResolver: {
      async resolve() {
        throw new KnowledgeRuntimeGateError(
          "KNOWLEDGE_VARIANT_REQUIRED",
          "variant required",
          409,
        );
      },
    },
  });

  const result = await engine.decide({
    merchantId: "merchant-a",
    customerText: "سعر هاتف ألف",
    languageHint: "ar",
  });

  assert.equal(result.action, "reply");
  assert.equal(result.stage, "clarification");
  assert.equal(result.reasonCode, "KNOWLEDGE_VARIANT_REQUIRED");
  assert.match(result.answerText || "", /لون|حجم|خيار/);
  assert.equal(result.trainingRequestId, null);
});

test("location-context authority error becomes a Kurdish clarification", async () => {
  const engine = new KnowledgeDecisionEngine({
    runtime: runtime(),
    policyResolver: null,
    factResolver: {
      async resolve() {
        throw new KnowledgeRuntimeGateError(
          "KNOWLEDGE_LOCATION_CONTEXT_REQUIRED",
          "location required",
          409,
        );
      },
    },
  });

  const result = await engine.decide({
    merchantId: "merchant-a",
    customerText: "ئەم بەرهەمە بەردەستە؟",
    languageHint: "ku",
  });

  assert.equal(result.action, "reply");
  assert.equal(result.stage, "clarification");
  assert.equal(result.reasonCode, "KNOWLEDGE_LOCATION_CONTEXT_REQUIRED");
  assert.match(result.answerText || "", /ناوچە/);
});

test("customer follow-up is combined with the prior authoritative question after clarification", async () => {
  let captured = "";
  const engine = new KnowledgeDecisionEngine({
    runtime: {
      ...runtime(),
      async findApprovedSavedAnswer() { return null; },
      async listApprovedSemanticDocuments() { return []; },
    },
    policyResolver: null,
    factResolver: {
      async resolve(input) {
        captured = input.customerText;
        if (input.customerText.includes("سعر هاتف ألف") && input.customerText.includes("أحمر")) {
          return {
            answerText: "سعر هاتف ألف الأحمر هو 260,000 دينار.",
            language: "ar" as const,
            confidence: 1,
            factType: "product_price",
            recordId: "variant-red",
          };
        }
        return null;
      },
    },
  });

  const result = await engine.decide({
    merchantId: "merchant-a",
    customerText: "أحمر",
    languageHint: "ar",
    recentMessages: [
      {
        sender: "customer",
        text: "سعر هاتف ألف",
        createdAt: "2026-09-24T00:00:00.000Z",
      },
      {
        sender: "fawri",
        text: "أي لون أو حجم أو خيار تقصد بالضبط؟",
        createdAt: "2026-09-24T00:00:01.000Z",
        reasonCode: "KNOWLEDGE_VARIANT_REQUIRED",
      },
    ],
  });

  assert.match(captured, /سعر هاتف ألف/);
  assert.match(captured, /أحمر/);
  assert.equal(result.action, "reply");
  assert.equal(result.stage, "database_fact");
  assert.equal(result.matchedRecordId, "variant-red");
});

test("unresolved follow-up repeats the active clarification instead of falling through", async () => {
  const engine = new KnowledgeDecisionEngine({
    runtime: runtime(),
    policyResolver: null,
    factResolver: {
      async resolve() {
        return null;
      },
    },
  });

  const result = await engine.decide({
    merchantId: "merchant-a",
    customerText: "ما أدري",
    languageHint: "ar",
    recentMessages: [
      {
        sender: "customer",
        text: "سعر هاتف ألف",
        createdAt: "2026-09-24T00:00:00.000Z",
      },
      {
        sender: "fawri",
        text: "أي لون أو حجم أو خيار تقصد بالضبط؟",
        createdAt: "2026-09-24T00:00:01.000Z",
        reasonCode: "KNOWLEDGE_VARIANT_REQUIRED",
      },
    ],
  });

  assert.equal(result.action, "reply");
  assert.equal(result.stage, "clarification");
  assert.equal(result.reasonCode, "KNOWLEDGE_VARIANT_REQUIRED");
});

test("a new authoritative question ignores the previous clarification context", async () => {
  let captured = "";
  const engine = new KnowledgeDecisionEngine({
    runtime: {
      ...runtime(),
      async findApprovedSavedAnswer() { return null; },
      async listApprovedSemanticDocuments() { return []; },
    },
    policyResolver: null,
    factResolver: {
      async resolve(input) {
        captured = input.customerText;
        return {
          answerText: "التوصيل متاح.",
          language: "ar" as const,
          confidence: 1,
          factType: "delivery_policy",
          recordId: "settings-a",
        };
      },
    },
  });

  const result = await engine.decide({
    merchantId: "merchant-a",
    customerText: "كم التوصيل؟",
    languageHint: "ar",
    recentMessages: [
      {
        sender: "customer",
        text: "سعر هاتف ألف",
        createdAt: "2026-09-24T00:00:00.000Z",
      },
      {
        sender: "fawri",
        text: "أي لون تقصد؟",
        createdAt: "2026-09-24T00:00:01.000Z",
        reasonCode: "KNOWLEDGE_VARIANT_REQUIRED",
      },
    ],
  });

  assert.equal(captured, "كم التوصيل؟");
  assert.equal(result.stage, "database_fact");
});

test("non-clarification authority failures stay fail-closed", async () => {
  const engine = new KnowledgeDecisionEngine({
    runtime: runtime(),
    policyResolver: null,
    factResolver: {
      async resolve() {
        throw new KnowledgeRuntimeGateError(
          "KNOWLEDGE_DATABASE_UNAVAILABLE",
          "database unavailable",
          503,
        );
      },
    },
  });

  await assert.rejects(
    () =>
      engine.decide({
        merchantId: "merchant-a",
        customerText: "سعر هاتف ألف",
        languageHint: "ar",
      }),
    (error: unknown) =>
      error instanceof KnowledgeRuntimeGateError &&
      error.code === "KNOWLEDGE_DATABASE_UNAVAILABLE",
  );
});
