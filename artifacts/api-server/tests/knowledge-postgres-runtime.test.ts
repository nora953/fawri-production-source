// @ts-nocheck
import assert from "node:assert/strict";
import test from "node:test";
import {
  configureKnowledgeEmbeddingProvider,
  getKnowledgeDecisionEngine,
  getKnowledgeEmbeddingActivationReadiness,
  KnowledgeDecisionEngine,
  resetKnowledgeDecisionEngineForTests,
} from "../src/services/ai/knowledgeDecisionEngine.js";
import {
  KnowledgeRuntimeGateError,
  PostgresKnowledgeFactResolver,
  PostgresKnowledgeRuntime,
  PostgresMerchantKnowledgePolicyResolver,
  setPostgresKnowledgeSqlClientForTests,
} from "../src/services/knowledge/postgresKnowledgeRuntime.js";

function policyRow(overrides = {}) {
  return {
    merchant_id: "merchant-a",
    store_name: "Store A",
    merchant_status: "approved",
    account_status: "approved",
    settings_version: 3,
    auto_reply_enabled: true,
    reply_language: "auto",
    delivery_enabled: true,
    delivery_fee_iqd: 5000,
    free_delivery_threshold_iqd: null,
    delivery_estimated_days_min: 1,
    delivery_estimated_days_max: 3,
    delivery_areas: ["Baghdad"],
    delivery_notes: "",
    cash_on_delivery_enabled: true,
    electronic_payment_enabled: false,
    payment_methods: ["cash_on_delivery"],
    payment_instructions: "",
    ...overrides,
  };
}

function vectorRow(overrides = {}) {
  return {
    merchant_id: "merchant-a",
    knowledge_kind: "saved_answer",
    knowledge_id: "saved-a",
    language: "ar",
    embedding_model: "fake-embedding-v1",
    content_hash: "a".repeat(64),
    dimensions: 2,
    embedding: [1, 0],
    embedding_updated_at: "2026-08-07T18:00:00.000Z",
    question: "سياسة الاستبدال",
    answer: "الاستبدال خلال 7 أيام.",
    source_language: "ar",
    source_provenance: "merchant_approved",
    source_active: true,
    source_version: 2,
    source_updated_at: "2026-08-07T17:00:00.000Z",
    approval_status: null,
    safe_to_auto_reply: null,
    ...overrides,
  };
}

class FakeSqlClient {
  queries = [];
  constructor(handler) {
    this.handler = handler;
  }
  async query(sql, values = []) {
    this.queries.push({ sql, values: [...values] });
    return { rows: await this.handler(sql, values) };
  }
  async transaction(operation) {
    return operation(this);
  }
}

const fakeEmbedding = {
  providerId: "fake-embedding",
  model: "fake-embedding-v1",
  dimensions: 2,
  async embed() {
    return [1, 0];
  },
};

test("production embedding activation is provider-neutral, explicit, and process-locked", () => {
  resetKnowledgeDecisionEngineForTests();
  assert.deepEqual(getKnowledgeEmbeddingActivationReadiness(), {
    ready: false,
    providerId: null,
    model: null,
    dimensions: null,
    reasonCode: "KNOWLEDGE_VECTOR_UNAVAILABLE",
  });

  configureKnowledgeEmbeddingProvider(fakeEmbedding);
  assert.deepEqual(getKnowledgeEmbeddingActivationReadiness(), {
    ready: true,
    providerId: "fake-embedding",
    model: "fake-embedding-v1",
    dimensions: 2,
    reasonCode: null,
  });

  assert.throws(
    () => configureKnowledgeEmbeddingProvider({ ...fakeEmbedding, model: "fake-embedding-v2" }),
    (error) =>
      error instanceof KnowledgeRuntimeGateError &&
      error.code === "KNOWLEDGE_VECTOR_ACTIVATION_LOCKED",
  );
  resetKnowledgeDecisionEngineForTests();
});

test("configured embedding provider is wired into the production singleton", async () => {
  resetKnowledgeDecisionEngineForTests();
  const sql = new FakeSqlClient(async (query) => {
    if (query.includes("FROM merchants m") && query.includes("JOIN merchant_settings")) {
      return [policyRow()];
    }
    if (query.includes("knowledge_embeddings")) return [vectorRow()];
    if (query.includes("FROM saved_answers")) return [];
    return [];
  });
  setPostgresKnowledgeSqlClientForTests(sql);
  configureKnowledgeEmbeddingProvider(fakeEmbedding);

  try {
    const result = await getKnowledgeDecisionEngine().decide({
      merchantId: "merchant-a",
      customerText: "سياسة الاستبدال",
      languageHint: "ar",
    });
    assert.equal(result.action, "reply");
    assert.equal(result.stage, "semantic_retrieval");
    assert.equal(result.matchedRecordId, "saved-a");
    assert.equal(
      sql.queries.some((item) =>
        item.values[0] === "merchant-a" &&
        item.values[1] === "fake-embedding-v1" &&
        item.values[2] === "ar"),
      true,
    );
  } finally {
    resetKnowledgeDecisionEngineForTests();
    setPostgresKnowledgeSqlClientForTests(null);
  }
});

test("invalid production embedding configuration fails closed before activation", () => {
  resetKnowledgeDecisionEngineForTests();
  for (const provider of [
    { ...fakeEmbedding, providerId: "" },
    { ...fakeEmbedding, model: "disabled" },
    { ...fakeEmbedding, dimensions: 0 },
    { ...fakeEmbedding, dimensions: 4097 },
  ]) {
    assert.throws(
      () => configureKnowledgeEmbeddingProvider(provider),
      (error) =>
        error instanceof KnowledgeRuntimeGateError &&
        error.code === "KNOWLEDGE_VECTOR_CONFIG_INVALID",
    );
    assert.equal(getKnowledgeEmbeddingActivationReadiness().ready, false);
  }
  resetKnowledgeDecisionEngineForTests();
});

test("merchant policy is server-resolved and denies retrieval before knowledge use", async () => {
  const sql = new FakeSqlClient(async () => [policyRow({ auto_reply_enabled: false })]);
  const policyResolver = new PostgresMerchantKnowledgePolicyResolver(sql);
  let retrievalCalls = 0;
  const runtime = {
    authorityId: "postgresql_knowledge_authority_v1",
    legacyFallbackEnabled: false,
    async findApprovedSavedAnswer() { retrievalCalls += 1; return null; },
    async listApprovedSemanticDocuments() { retrievalCalls += 1; return []; },
    async retrieveSemanticMatch() { retrievalCalls += 1; return null; },
    async createTrainingRequest() { throw new Error("training should not run"); },
    async recordGeneratedCandidate() { throw new Error("AI should not run"); },
    async appendAudit() {},
  };
  const engine = new KnowledgeDecisionEngine({
    runtime,
    policyResolver,
    factResolver: { async resolve() { throw new Error("facts should not run"); } },
  });

  const result = await engine.decide({
    merchantId: "merchant-a",
    customerText: "hello",
    merchantPolicy: { allowGeneratedAutoReply: true, businessName: "browser override" },
  });

  assert.equal(result.reasonCode, "MERCHANT_AUTO_REPLY_DISABLED");
  assert.equal(result.action, "handoff");
  assert.equal(retrievalCalls, 0);
  assert.equal(sql.queries.length, 1);
  assert.match(sql.queries[0].sql, /WHERE m\.id = \$1/);
  assert.deepEqual(sql.queries[0].values, ["merchant-a"]);
});

test("merchant policy rejects invalid version and cross-tenant rows", async () => {
  for (const row of [policyRow({ settings_version: 0 }), policyRow({ merchant_id: "merchant-b" })]) {
    const resolver = new PostgresMerchantKnowledgePolicyResolver(
      new FakeSqlClient(async () => [row]),
    );
    await assert.rejects(
      () => resolver.resolve("merchant-a"),
      (error) => error instanceof KnowledgeRuntimeGateError,
    );
  }
});

test("fact resolver reads tenant-scoped PostgreSQL merchant settings", async () => {
  const sql = new FakeSqlClient(async () => [policyRow()]);
  const resolver = new PostgresKnowledgeFactResolver(sql);
  const fact = await resolver.resolve({
    merchantId: "merchant-a",
    customerText: "كم مدة التوصيل؟",
    language: "ar",
  });

  assert.equal(fact?.factType, "delivery_policy");
  assert.equal(fact?.confidence, 1);
  assert.equal(fact?.recordId, "merchant-a:settings:3");
  assert.match(fact?.answerText || "", /1-3/);
  assert.match(sql.queries[0].sql, /JOIN merchant_settings ms ON ms\.merchant_id = m\.id/);
  assert.deepEqual(sql.queries[0].values, ["merchant-a"]);
});

test("fact resolver fails closed for ambiguous authoritative fact requests", async () => {
  const resolver = new PostgresKnowledgeFactResolver(
    new FakeSqlClient(async () => [policyRow()]),
  );
  await assert.rejects(
    () => resolver.resolve({
      merchantId: "merchant-a",
      customerText: "ما هي طرق الدفع ومدة التوصيل؟",
      language: "ar",
    }),
    (error) =>
      error instanceof KnowledgeRuntimeGateError &&
      error.code === "KNOWLEDGE_FACT_AMBIGUOUS",
  );
});

test("vector retrieval applies tenant/model/language filters before scoring and returns approved provenance", async () => {
  const sql = new FakeSqlClient(async (query) => {
    if (query.includes("knowledge_embeddings")) return [vectorRow()];
    return [];
  });
  const runtime = new PostgresKnowledgeRuntime({
    sqlClient: sql,
    embeddingProvider: fakeEmbedding,
  });
  const match = await runtime.retrieveSemanticMatch({
    merchantId: "merchant-a",
    query: "هل أقدر أستبدل؟",
    language: "ar",
  });

  assert.equal(match?.document.id, "saved-a");
  assert.equal(match?.document.source, "merchant_approved");
  assert.equal(match?.score, 1);
  assert.match(sql.queries[0].sql, /WHERE e\.merchant_id = \$1/);
  assert.match(sql.queries[0].sql, /e\.embedding_model = \$2/);
  assert.match(sql.queries[0].sql, /e\.language = \$3/);
  assert.deepEqual(sql.queries[0].values, ["merchant-a", "fake-embedding-v1", "ar"]);
});

test("vector retrieval rejects cross-tenant, wrong model/dimensions/language, invalid provenance, and stale/corrupt state", async () => {
  const cases = [
    { row: vectorRow({ merchant_id: "merchant-b" }), code: "KNOWLEDGE_TENANT_VIOLATION" },
    { row: vectorRow({ source_provenance: "openai_generated" }), code: "KNOWLEDGE_PROVENANCE_INVALID" },
    { row: vectorRow({ embedding_model: "fake-embedding-v0" }), code: "KNOWLEDGE_PROVENANCE_INVALID" },
    { row: vectorRow({ dimensions: 3 }), code: "KNOWLEDGE_PROVENANCE_INVALID" },
    { row: vectorRow({ source_language: "en" }), code: "KNOWLEDGE_PROVENANCE_INVALID" },
    {
      row: vectorRow({
        embedding_updated_at: "2026-08-07T16:00:00.000Z",
        source_updated_at: "2026-08-07T17:00:00.000Z",
      }),
      code: "KNOWLEDGE_VECTOR_STALE",
    },
    { row: vectorRow({ content_hash: "not-a-hash" }), code: "KNOWLEDGE_PROVENANCE_INVALID" },
    { row: vectorRow({ embedding: [1, Number.NaN] }), code: "KNOWLEDGE_VECTOR_INVALID" },
    { row: vectorRow({ embedding: [0, 0] }), code: "KNOWLEDGE_VECTOR_INVALID" },
  ];

  for (const item of cases) {
    const runtime = new PostgresKnowledgeRuntime({
      sqlClient: new FakeSqlClient(async () => [item.row]),
      embeddingProvider: fakeEmbedding,
    });
    await assert.rejects(
      () => runtime.retrieveSemanticMatch({
        merchantId: "merchant-a",
        query: "استبدال",
        language: "ar",
      }),
      (error) =>
        error instanceof KnowledgeRuntimeGateError && error.code === item.code,
    );
  }
});

test("provider transport failure becomes vector unavailable before database retrieval", async () => {
  const sql = new FakeSqlClient(async () => []);
  const runtime = new PostgresKnowledgeRuntime({
    sqlClient: sql,
    embeddingProvider: {
      ...fakeEmbedding,
      async embed() {
        throw new Error("fake provider unavailable");
      },
    },
  });

  await assert.rejects(
    () => runtime.retrieveSemanticMatch({
      merchantId: "merchant-a",
      query: "استبدال",
      language: "ar",
    }),
    (error) =>
      error instanceof KnowledgeRuntimeGateError &&
      error.code === "KNOWLEDGE_VECTOR_UNAVAILABLE",
  );
  assert.equal(sql.queries.length, 0);
});

test("malformed provider query vectors fail closed", async () => {
  for (const embedding of [[1], [1, Number.NaN], [Number.POSITIVE_INFINITY, 0]]) {
    const runtime = new PostgresKnowledgeRuntime({
      sqlClient: new FakeSqlClient(async () => []),
      embeddingProvider: {
        ...fakeEmbedding,
        async embed() { return embedding; },
      },
    });
    await assert.rejects(
      () => runtime.retrieveSemanticMatch({
        merchantId: "merchant-a",
        query: "استبدال",
        language: "ar",
      }),
      (error) =>
        error instanceof KnowledgeRuntimeGateError &&
        error.code === "KNOWLEDGE_VECTOR_INVALID",
    );
  }
});

test("model migration cannot mix incompatible vector spaces", async () => {
  const sql = new FakeSqlClient(async () => [
    vectorRow({ knowledge_id: "saved-current" }),
    vectorRow({
      knowledge_id: "saved-old",
      embedding_model: "fake-embedding-v0",
      dimensions: 3,
      embedding: [1, 0, 0],
      content_hash: "b".repeat(64),
    }),
  ]);
  const runtime = new PostgresKnowledgeRuntime({
    sqlClient: sql,
    embeddingProvider: fakeEmbedding,
  });

  await assert.rejects(
    () => runtime.retrieveSemanticMatch({
      merchantId: "merchant-a",
      query: "استبدال",
      language: "ar",
    }),
    (error) =>
      error instanceof KnowledgeRuntimeGateError &&
      error.code === "KNOWLEDGE_PROVENANCE_INVALID",
  );
  assert.deepEqual(sql.queries[0].values, ["merchant-a", "fake-embedding-v1", "ar"]);
});

test("ambiguous vector matches fail closed instead of choosing a guess", async () => {
  const runtime = new PostgresKnowledgeRuntime({
    sqlClient: new FakeSqlClient(async () => [
      vectorRow({ knowledge_id: "saved-a", embedding: [0.9, 0.44] }),
      vectorRow({ knowledge_id: "saved-b", embedding: [0.89, 0.46], content_hash: "b".repeat(64) }),
    ]),
    embeddingProvider: fakeEmbedding,
  });

  await assert.rejects(
    () => runtime.retrieveSemanticMatch({
      merchantId: "merchant-a",
      query: "استبدال",
      language: "ar",
      threshold: 0.5,
    }),
    (error) =>
      error instanceof KnowledgeRuntimeGateError &&
      error.code === "KNOWLEDGE_VECTOR_AMBIGUOUS",
  );
});

test("missing production vector provider fails closed without lexical or legacy fallback", async () => {
  const runtime = new PostgresKnowledgeRuntime({
    sqlClient: new FakeSqlClient(async () => []),
  });
  await assert.rejects(
    () => runtime.retrieveSemanticMatch({
      merchantId: "merchant-a",
      query: "unknown question",
      language: "en",
    }),
    (error) =>
      error instanceof KnowledgeRuntimeGateError &&
      error.code === "KNOWLEDGE_VECTOR_UNAVAILABLE",
  );
});

test("production decision path propagates vector failure instead of silently using lexical fallback", async () => {
  let lexicalCalls = 0;
  const runtime = {
    authorityId: "postgresql_knowledge_authority_v1",
    legacyFallbackEnabled: false,
    async findApprovedSavedAnswer() { return null; },
    async retrieveSemanticMatch() {
      throw new KnowledgeRuntimeGateError(
        "KNOWLEDGE_VECTOR_UNAVAILABLE",
        "knowledge vector provider is unavailable",
      );
    },
    async listApprovedSemanticDocuments() { lexicalCalls += 1; return []; },
    async createTrainingRequest() { throw new Error("training should not run"); },
    async recordGeneratedCandidate() { throw new Error("AI should not run"); },
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
          policy: { allowGeneratedAutoReply: false },
        };
      },
    },
  });

  await assert.rejects(
    () => engine.decide({
      merchantId: "merchant-a",
      customerText: "general unknown question",
      languageHint: "en",
    }),
    (error) =>
      error instanceof KnowledgeRuntimeGateError &&
      error.code === "KNOWLEDGE_VECTOR_UNAVAILABLE",
  );
  assert.equal(lexicalCalls, 0);
});

test("explicit PostgreSQL runtime prevents legacy repository fallback and uses no live AI transport", async () => {
  let legacyCalls = 0;
  const legacyRepository = new Proxy({}, {
    get() {
      return () => { legacyCalls += 1; throw new Error("legacy fallback invoked"); };
    },
  });
  let trainingWrites = 0;
  const runtime = {
    authorityId: "postgresql_knowledge_authority_v1",
    legacyFallbackEnabled: false,
    async findApprovedSavedAnswer() { return null; },
    async retrieveSemanticMatch() { return null; },
    async listApprovedSemanticDocuments() { return []; },
    async createTrainingRequest(input) {
      trainingWrites += 1;
      return {
        id: "training-pg",
        merchantId: input.merchantId,
        customerTextPreview: "redacted",
        customerTextHash: "a".repeat(64),
        detectedIntent: "gap",
        detectedLanguage: "en",
        reason: input.reason,
        suggestedReply: null,
        suggestedReplySource: null,
        status: "pending_merchant_reply",
        rejectionReason: null,
        version: 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
    },
    async recordGeneratedCandidate() { throw new Error("AI candidate should not exist"); },
    async appendAudit() {},
  };
  const engine = new KnowledgeDecisionEngine({
    repository: legacyRepository,
    runtime,
    factResolver: { async resolve() { return null; } },
    policyResolver: {
      async resolve(merchantId) {
        return {
          merchantId,
          policyVersion: 1,
          allowKnowledgeUse: true,
          policy: { allowGeneratedAutoReply: false },
        };
      },
    },
  });

  const result = await engine.decide({
    merchantId: "merchant-a",
    customerText: "general unknown question",
    languageHint: "en",
  });
  assert.equal(result.action, "handoff");
  assert.equal(result.trainingRequestId, "training-pg");
  assert.equal(engine.authorityId, "postgresql_knowledge_authority_v1");
  assert.equal(engine.legacyFallbackEnabled, false);
  assert.equal(engine.liveAiTransportEnabled, false);
  assert.equal(legacyCalls, 0);
  assert.equal(trainingWrites, 1);
});

test("audit persistence contains digest/length but never raw customer text", async () => {
  const sql = new FakeSqlClient(async () => []);
  const runtime = new PostgresKnowledgeRuntime({
    sqlClient: sql,
    embeddingProvider: fakeEmbedding,
  });
  const secret = "customer-secret@example.com 07701234567";
  await runtime.appendAudit({
    merchantId: "merchant-a",
    action: "knowledge_decision",
    entityType: "decision",
    entityId: "request-a",
    actor: "system",
    outcome: "handoff",
    customerTextHash: "c".repeat(64),
    customerTextLength: secret.length,
    injectionSignals: [],
    metadata: { reasonCode: "NO_TRUSTED_ANSWER" },
  });

  const serializedValues = JSON.stringify(sql.queries.map((item) => item.values));
  assert.equal(serializedValues.includes(secret), false);
  assert.equal(serializedValues.includes("customer-secret@example.com"), false);
  assert.match(serializedValues, /cccccccc/);
});
