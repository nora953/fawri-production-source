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
  createOpenAiKnowledgeEmbeddingProvider,
  getOpenAiKnowledgeEmbeddingReadiness,
  OPENAI_KNOWLEDGE_EMBEDDING_DIMENSIONS,
  OPENAI_KNOWLEDGE_EMBEDDING_MODEL,
  OPENAI_KNOWLEDGE_EMBEDDING_PROVIDER_ID,
} from "../src/services/knowledge/openAiKnowledgeEmbeddingProvider.js";
import { KnowledgeRuntimeGateError } from "../src/services/knowledge/postgresKnowledgeRuntime.js";

function validVector() {
  const vector = Array(OPENAI_KNOWLEDGE_EMBEDDING_DIMENSIONS).fill(0);
  vector[0] = 1;
  return vector;
}

function validPayload(overrides = {}) {
  return {
    object: "list",
    model: OPENAI_KNOWLEDGE_EMBEDDING_MODEL,
    data: [
      {
        object: "embedding",
        index: 0,
        embedding: validVector(),
      },
    ],
    ...overrides,
  };
}

function response({ ok = true, status = 200, payload = validPayload(), jsonError = null } = {}) {
  return {
    ok,
    status,
    async json() {
      if (jsonError) throw jsonError;
      return payload;
    },
  };
}

function assertGateCode(code) {
  return (error) => error instanceof KnowledgeRuntimeGateError && error.code === code;
}

test("OpenAI embedding contract is fixed to the owner-approved model and default dimensions", () => {
  assert.equal(OPENAI_KNOWLEDGE_EMBEDDING_PROVIDER_ID, "openai");
  assert.equal(OPENAI_KNOWLEDGE_EMBEDDING_MODEL, "text-embedding-3-small");
  assert.equal(OPENAI_KNOWLEDGE_EMBEDDING_DIMENSIONS, 1536);

  const readiness = getOpenAiKnowledgeEmbeddingReadiness({ apiKey: "test-key" });
  assert.deepEqual(readiness, {
    ready: true,
    providerId: "openai",
    model: "text-embedding-3-small",
    dimensions: 1536,
    credentialConfigured: true,
    reasonCode: null,
  });
});

test("valid OpenAI response passes and request uses POST /v1/embeddings without dimension shortening", async () => {
  let capturedUrl = "";
  let capturedInit;
  const provider = createOpenAiKnowledgeEmbeddingProvider({
    apiKey: "test-key",
    maxRetries: 0,
    fetchImpl: async (url, init) => {
      capturedUrl = String(url);
      capturedInit = init;
      return response();
    },
  });

  const vector = await provider.embed("customer text");
  assert.equal(vector.length, 1536);
  assert.equal(vector[0], 1);
  assert.equal(capturedUrl, "https://api.openai.com/v1/embeddings");
  assert.equal(capturedInit?.method, "POST");
  assert.equal(capturedInit?.headers.Authorization, "Bearer test-key");
  const body = JSON.parse(String(capturedInit?.body || "{}"));
  assert.equal(body.model, "text-embedding-3-small");
  assert.equal(body.input, "customer text");
  assert.equal(body.encoding_format, "float");
  assert.equal(Object.hasOwn(body, "dimensions"), false);
});

test("missing OPENAI_API_KEY fails closed before provider construction", () => {
  const readiness = getOpenAiKnowledgeEmbeddingReadiness({ apiKey: "" });
  assert.equal(readiness.ready, false);
  assert.equal(readiness.credentialConfigured, false);
  assert.equal(readiness.reasonCode, "KNOWLEDGE_VECTOR_CONFIG_INVALID");
  assert.throws(
    () => createOpenAiKnowledgeEmbeddingProvider({ apiKey: "" }),
    assertGateCode("KNOWLEDGE_VECTOR_CONFIG_INVALID"),
  );
});

test("401 and 403 fail closed without retry", async () => {
  for (const status of [401, 403]) {
    let calls = 0;
    const provider = createOpenAiKnowledgeEmbeddingProvider({
      apiKey: "test-key",
      maxRetries: 3,
      retryBaseDelayMs: 0,
      fetchImpl: async () => {
        calls += 1;
        return response({ ok: false, status });
      },
    });
    await assert.rejects(
      () => provider.embed("customer text"),
      assertGateCode("KNOWLEDGE_VECTOR_UNAVAILABLE"),
    );
    assert.equal(calls, 1);
  }
});

test("429 retries are bounded and fail closed", async () => {
  let calls = 0;
  const provider = createOpenAiKnowledgeEmbeddingProvider({
    apiKey: "test-key",
    maxRetries: 2,
    retryBaseDelayMs: 0,
    fetchImpl: async () => {
      calls += 1;
      return response({ ok: false, status: 429 });
    },
  });
  await assert.rejects(
    () => provider.embed("customer text"),
    assertGateCode("KNOWLEDGE_VECTOR_UNAVAILABLE"),
  );
  assert.equal(calls, 3);
});

test("5xx retries are bounded and can recover on a later safe attempt", async () => {
  let calls = 0;
  const provider = createOpenAiKnowledgeEmbeddingProvider({
    apiKey: "test-key",
    maxRetries: 2,
    retryBaseDelayMs: 0,
    fetchImpl: async () => {
      calls += 1;
      if (calls < 3) return response({ ok: false, status: 503 });
      return response();
    },
  });
  const vector = await provider.embed("customer text");
  assert.equal(calls, 3);
  assert.equal(vector.length, 1536);
});

test("timeout uses AbortController and fails closed", async () => {
  let sawAbortSignal = false;
  const provider = createOpenAiKnowledgeEmbeddingProvider({
    apiKey: "test-key",
    timeoutMs: 5,
    maxRetries: 0,
    fetchImpl: async (_url, init) =>
      new Promise((_resolve, reject) => {
        const signal = init?.signal;
        sawAbortSignal = Boolean(signal);
        signal?.addEventListener(
          "abort",
          () => {
            const error = new Error("aborted transport");
            error.name = "AbortError";
            reject(error);
          },
          { once: true },
        );
      }),
  });

  await assert.rejects(
    () => provider.embed("customer text"),
    assertGateCode("KNOWLEDGE_VECTOR_UNAVAILABLE"),
  );
  assert.equal(sawAbortSignal, true);
});

test("malformed JSON fails closed without retry", async () => {
  let calls = 0;
  const provider = createOpenAiKnowledgeEmbeddingProvider({
    apiKey: "test-key",
    maxRetries: 3,
    retryBaseDelayMs: 0,
    fetchImpl: async () => {
      calls += 1;
      return response({ jsonError: new SyntaxError("bad json") });
    },
  });
  await assert.rejects(
    () => provider.embed("customer text"),
    assertGateCode("KNOWLEDGE_VECTOR_INVALID"),
  );
  assert.equal(calls, 1);
});

test("missing embedding and wrong response count/type fail closed", async () => {
  const payloads = [
    validPayload({ data: [] }),
    validPayload({ data: [{ object: "not-embedding", index: 0, embedding: validVector() }] }),
    validPayload({
      data: [
        { object: "embedding", index: 0, embedding: validVector() },
        { object: "embedding", index: 1, embedding: validVector() },
      ],
    }),
  ];

  for (const payload of payloads) {
    const provider = createOpenAiKnowledgeEmbeddingProvider({
      apiKey: "test-key",
      maxRetries: 0,
      fetchImpl: async () => response({ payload }),
    });
    await assert.rejects(
      () => provider.embed("customer text"),
      assertGateCode("KNOWLEDGE_VECTOR_INVALID"),
    );
  }
});

test("wrong dimensions fail closed", async () => {
  const provider = createOpenAiKnowledgeEmbeddingProvider({
    apiKey: "test-key",
    maxRetries: 0,
    fetchImpl: async () =>
      response({
        payload: validPayload({
          data: [{ object: "embedding", index: 0, embedding: [1, 0] }],
        }),
      }),
  });
  await assert.rejects(
    () => provider.embed("customer text"),
    assertGateCode("KNOWLEDGE_VECTOR_INVALID"),
  );
});

test("NaN, Infinity, and zero vectors fail closed", async () => {
  const vectors = [validVector(), validVector(), Array(1536).fill(0)];
  vectors[0][3] = Number.NaN;
  vectors[1][7] = Number.POSITIVE_INFINITY;

  for (const embedding of vectors) {
    const provider = createOpenAiKnowledgeEmbeddingProvider({
      apiKey: "test-key",
      maxRetries: 0,
      fetchImpl: async () =>
        response({
          payload: validPayload({
            data: [{ object: "embedding", index: 0, embedding }],
          }),
        }),
    });
    await assert.rejects(
      () => provider.embed("customer text"),
      assertGateCode("KNOWLEDGE_VECTOR_INVALID"),
    );
  }
});

test("wrong model or readiness config cannot satisfy the OpenAI production contract", async () => {
  assert.equal(
    getOpenAiKnowledgeEmbeddingReadiness({ apiKey: "test-key", model: "text-embedding-3-large" })
      .ready,
    false,
  );
  assert.equal(
    getOpenAiKnowledgeEmbeddingReadiness({ apiKey: "test-key", dimensions: 256 }).ready,
    false,
  );
  assert.equal(
    getOpenAiKnowledgeEmbeddingReadiness({ apiKey: "test-key", providerId: "other" }).ready,
    false,
  );

  const provider = createOpenAiKnowledgeEmbeddingProvider({
    apiKey: "test-key",
    maxRetries: 0,
    fetchImpl: async () => response({ payload: validPayload({ model: "text-embedding-3-large" }) }),
  });
  await assert.rejects(
    () => provider.embed("customer text"),
    assertGateCode("KNOWLEDGE_VECTOR_INVALID"),
  );
});

test("OpenAI provider must be registered before singleton creation and activation remains process-locked", () => {
  resetKnowledgeDecisionEngineForTests();
  const provider = createOpenAiKnowledgeEmbeddingProvider({
    apiKey: "test-key",
    fetchImpl: async () => response(),
  });

  configureKnowledgeEmbeddingProvider(provider);
  assert.deepEqual(getKnowledgeEmbeddingActivationReadiness(), {
    ready: true,
    providerId: "openai",
    model: "text-embedding-3-small",
    dimensions: 1536,
    reasonCode: null,
  });
  getKnowledgeDecisionEngine();
  assert.throws(
    () => configureKnowledgeEmbeddingProvider(provider),
    assertGateCode("KNOWLEDGE_VECTOR_ACTIVATION_LOCKED"),
  );
  resetKnowledgeDecisionEngineForTests();

  getKnowledgeDecisionEngine();
  assert.throws(
    () => configureKnowledgeEmbeddingProvider(provider),
    assertGateCode("KNOWLEDGE_VECTOR_ACTIVATION_LOCKED"),
  );
  resetKnowledgeDecisionEngineForTests();
});

test("production decision path never silently falls back to lexical retrieval after vector failure", async () => {
  let lexicalCalls = 0;
  const runtime = {
    authorityId: "postgresql_knowledge_authority_v1",
    legacyFallbackEnabled: false,
    async findApprovedSavedAnswer() {
      return null;
    },
    async retrieveSemanticMatch() {
      throw new KnowledgeRuntimeGateError(
        "KNOWLEDGE_VECTOR_UNAVAILABLE",
        "knowledge vector provider is unavailable",
      );
    },
    async listApprovedSemanticDocuments() {
      lexicalCalls += 1;
      return [];
    },
    async createTrainingRequest() {
      throw new Error("training should not run");
    },
    async recordGeneratedCandidate() {
      throw new Error("AI should not run");
    },
    async appendAudit() {},
  };
  const engine = new KnowledgeDecisionEngine({
    runtime,
    factResolver: { async resolve() { return null; } },
    policyResolver: null,
  });

  await assert.rejects(
    () =>
      engine.decide({
        merchantId: "merchant-a",
        customerText: "replacement policy",
        languageHint: "en",
      }),
    assertGateCode("KNOWLEDGE_VECTOR_UNAVAILABLE"),
  );
  assert.equal(lexicalCalls, 0);
});

test("API key and customer text never appear in provider errors or logs", async () => {
  const secret = "sk-test-secret-never-log";
  const customerText = "private customer text never log";
  const logged = [];
  const originals = {
    log: console.log,
    warn: console.warn,
    error: console.error,
  };
  console.log = (...args) => logged.push(args.join(" "));
  console.warn = (...args) => logged.push(args.join(" "));
  console.error = (...args) => logged.push(args.join(" "));

  try {
    const provider = createOpenAiKnowledgeEmbeddingProvider({
      apiKey: secret,
      maxRetries: 0,
      fetchImpl: async () => {
        throw new Error(`transport exposed ${secret} ${customerText}`);
      },
    });
    let capturedError;
    await assert.rejects(
      async () => {
        try {
          await provider.embed(customerText);
        } catch (error) {
          capturedError = error;
          throw error;
        }
      },
      assertGateCode("KNOWLEDGE_VECTOR_UNAVAILABLE"),
    );
    const serializedError = String(capturedError?.stack || capturedError || "");
    assert.doesNotMatch(serializedError, /sk-test-secret-never-log/);
    assert.doesNotMatch(serializedError, /private customer text never log/);
    assert.equal(logged.length, 0);
  } finally {
    console.log = originals.log;
    console.warn = originals.warn;
    console.error = originals.error;
  }
});
