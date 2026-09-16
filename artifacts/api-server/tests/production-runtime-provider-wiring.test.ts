import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import type { AwsKmsMetaCredentialKeyProvider } from "../src/services/awsKmsMetaCredentialKeyProvider";
import {
  configureKnowledgeEmbeddingProvider,
  getKnowledgeDecisionEngine,
  getKnowledgeEmbeddingActivationReadiness,
  resetKnowledgeDecisionEngineForTests,
} from "../src/services/ai/knowledgeDecisionEngine";
import {
  configureMetaChannelCredentialKeyProvider,
  connectMetaChannel,
  readMetaChannelCredential,
} from "../src/services/metaChannelRuntime";
import { createEnvironmentMetaCredentialKeyProvider } from "../src/services/metaCredentialVault";
import {
  createOpenAiKnowledgeEmbeddingProvider,
  OPENAI_KNOWLEDGE_EMBEDDING_DIMENSIONS,
  OPENAI_KNOWLEDGE_EMBEDDING_MODEL,
} from "../src/services/knowledge/openAiKnowledgeEmbeddingProvider";
import {
  bootstrapRuntimeAndLoadApplication,
  type RuntimeProviderBootstrapDependencies,
} from "../src/services/runtimeProviderBootstrap";

function errorCode(error: unknown): unknown {
  return (error as { code?: unknown } | undefined)?.code;
}

function fakeAwsProvider(id = "aws-dek-current"): {
  provider: AwsKmsMetaCredentialKeyProvider;
  disposed: () => number;
} {
  const key = Buffer.alloc(32, 7);
  let disposeCount = 0;
  const provider: AwsKmsMetaCredentialKeyProvider = {
    current() {
      if (disposeCount) {
        throw Object.assign(new Error("provider disposed"), {
          code: "META_CREDENTIAL_EXTERNAL_PROVIDER_UNAVAILABLE",
        });
      }
      return { id, key };
    },
    resolve(requestedKeyId) {
      if (disposeCount || requestedKeyId !== id) return null;
      return { id, key };
    },
    readiness() {
      return {
        provider: "external",
        provider_id: "aws-kms",
        available: disposeCount === 0,
        production_eligible: disposeCount === 0,
        current_key_id: id,
        decrypt_key_ids: [id],
      };
    },
    dispose() {
      if (disposeCount) return;
      disposeCount += 1;
      key.fill(0);
    },
  };
  return { provider, disposed: () => disposeCount };
}

async function withProcessEnv<T>(
  values: Record<string, string | undefined>,
  callback: () => Promise<T>,
): Promise<T> {
  const previous = Object.fromEntries(
    Object.keys(values).map((key) => [key, process.env[key]]),
  ) as Record<string, string | undefined>;
  try {
    for (const [key, value] of Object.entries(values)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    return await callback();
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

function tempDataDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "fawri-provider-wiring-"));
}

test("aws-kms selection injects the cached provider before application load and Meta token persistence/read", async () => {
  const dir = tempDataDir();
  const aws = fakeAwsProvider();
  const events: string[] = [];
  const legacyEnvironmentKey = Buffer.alloc(32, 9).toString("base64");

  try {
    await withProcessEnv(
      {
        FAWRI_DATA_DIR: dir,
        FAWRI_META_TOKEN_KEY_ID: "environment-dek",
        FAWRI_META_TOKEN_KEY_BASE64: legacyEnvironmentKey,
      },
      async () => {
        const result = await bootstrapRuntimeAndLoadApplication({
          env: {
            FAWRI_META_CREDENTIAL_PROVIDER: "aws-kms",
          } as NodeJS.ProcessEnv,
          dependencies: {
            bootstrapAwsKms: async () => {
              events.push("aws-bootstrap");
              return aws.provider;
            },
            assertAwsKmsReady: () => {
              events.push("aws-ready");
            },
            configureMetaCredentialProvider: (provider) => {
              events.push(provider ? "meta-configure" : "meta-clear");
              configureMetaChannelCredentialKeyProvider(provider);
            },
          },
          loadApplication: async () => {
            events.push("app-load");
            connectMetaChannel({
              merchantId: "merchant-1",
              platform: "messenger",
              pageId: "page-1",
              pageName: "Page One",
              accessToken: "meta-token-not-real",
            });
            return "app";
          },
        });

        assert.equal(result.application, "app");
        assert.deepEqual(events.slice(0, 4), [
          "aws-bootstrap",
          "aws-ready",
          "meta-configure",
          "app-load",
        ]);
        const stored = JSON.parse(
          fs.readFileSync(path.join(dir, "meta-channels.json"), "utf8"),
        ) as { channels: Array<{ credential?: { key_id?: string } }> };
        assert.equal(stored.channels[0]?.credential?.key_id, "aws-dek-current");
        assert.equal(
          readMetaChannelCredential({
            merchantId: "merchant-1",
            platform: "messenger",
            pageId: "page-1",
          }),
          "meta-token-not-real",
        );

        result.runtime.dispose();
        assert.equal(aws.disposed(), 1);
        assert.equal(events.at(-1), "meta-clear");
      },
    );
  } finally {
    configureMetaChannelCredentialKeyProvider(null);
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("aws-kms selection with missing configuration fails startup closed", async () => {
  let applicationLoaded = false;
  await assert.rejects(
    () =>
      bootstrapRuntimeAndLoadApplication({
        env: {
          FAWRI_META_CREDENTIAL_PROVIDER: "aws-kms",
        } as NodeJS.ProcessEnv,
        loadApplication: async () => {
          applicationLoaded = true;
          return "app";
        },
      }),
    (error: unknown) => {
      assert.equal(errorCode(error), "META_CREDENTIAL_AWS_KMS_CONFIG_INVALID");
      assert.equal(String((error as Error).message).includes("wrapped"), false);
      return true;
    },
  );
  assert.equal(applicationLoaded, false);
});

test("aws-kms unavailability never downgrades to the environment provider", async () => {
  let applicationLoaded = false;
  await withProcessEnv(
    {
      FAWRI_META_TOKEN_KEY_ID: "environment-dek",
      FAWRI_META_TOKEN_KEY_BASE64: Buffer.alloc(32, 3).toString("base64"),
    },
    async () => {
      await assert.rejects(
        () =>
          bootstrapRuntimeAndLoadApplication({
            env: {
              FAWRI_META_CREDENTIAL_PROVIDER: "aws-kms",
            } as NodeJS.ProcessEnv,
            dependencies: {
              bootstrapAwsKms: async () => {
                throw Object.assign(new Error("wrapped-dek-secret-must-not-leak"), {
                  code: "META_CREDENTIAL_AWS_KMS_BOOTSTRAP_FAILED",
                });
              },
            },
            loadApplication: async () => {
              applicationLoaded = true;
              return "app";
            },
          }),
        (error: unknown) => {
          assert.equal(errorCode(error), "META_CREDENTIAL_AWS_KMS_BOOTSTRAP_FAILED");
          assert.equal(
            String((error as Error).message).includes("wrapped-dek-secret-must-not-leak"),
            false,
          );
          return true;
        },
      );
    },
  );
  assert.equal(applicationLoaded, false);
});

test("no explicit production provider preserves the current non-production behavior", async () => {
  const never = () => {
    throw new Error("production provider dependency must not be called");
  };
  const result = await bootstrapRuntimeAndLoadApplication({
    env: {} as NodeJS.ProcessEnv,
    dependencies: {
      bootstrapAwsKms: never as RuntimeProviderBootstrapDependencies["bootstrapAwsKms"],
      assertAwsKmsReady: never,
      createOpenAi: never,
      configureKnowledge: never,
      configureMetaCredentialProvider: never,
    },
    loadApplication: async () => "app",
  });
  assert.deepEqual(result.runtime.selections, {
    metaCredentialProvider: "environment",
    knowledgeEmbeddingProvider: "disabled",
  });
  assert.equal(
    createEnvironmentMetaCredentialKeyProvider().readiness?.().production_eligible,
    false,
  );
  result.runtime.dispose();
});

test("openai selection configures the fixed embedding provider before the Knowledge singleton", async () => {
  resetKnowledgeDecisionEngineForTests();
  try {
    const result = await bootstrapRuntimeAndLoadApplication({
      env: {
        FAWRI_KNOWLEDGE_EMBEDDING_PROVIDER: "openai",
        OPENAI_API_KEY: "test-openai-key-not-real",
      } as NodeJS.ProcessEnv,
      loadApplication: async () => {
        const readiness = getKnowledgeEmbeddingActivationReadiness();
        assert.equal(readiness.ready, true);
        assert.equal(readiness.providerId, "openai");
        assert.equal(readiness.model, OPENAI_KNOWLEDGE_EMBEDDING_MODEL);
        assert.equal(readiness.dimensions, OPENAI_KNOWLEDGE_EMBEDDING_DIMENSIONS);
        getKnowledgeDecisionEngine();
        return "app";
      },
    });
    assert.equal(result.application, "app");
    result.runtime.dispose();
  } finally {
    resetKnowledgeDecisionEngineForTests();
  }
});

test("openai selection with a missing API key fails before application load", async () => {
  resetKnowledgeDecisionEngineForTests();
  let applicationLoaded = false;
  try {
    await assert.rejects(
      () =>
        bootstrapRuntimeAndLoadApplication({
          env: {
            FAWRI_KNOWLEDGE_EMBEDDING_PROVIDER: "openai",
            OPENAI_API_KEY: "",
          } as NodeJS.ProcessEnv,
          loadApplication: async () => {
            applicationLoaded = true;
            return "app";
          },
        }),
      (error: unknown) => {
        assert.equal(errorCode(error), "KNOWLEDGE_VECTOR_CONFIG_INVALID");
        assert.equal(String((error as Error).message).includes("test-openai"), false);
        return true;
      },
    );
    assert.equal(applicationLoaded, false);
  } finally {
    resetKnowledgeDecisionEngineForTests();
  }
});

test("invalid explicitly selected OpenAI provider configuration fails closed without disabled or lexical fallback", async () => {
  resetKnowledgeDecisionEngineForTests();
  let applicationLoaded = false;
  try {
    await assert.rejects(
      () =>
        bootstrapRuntimeAndLoadApplication({
          env: {
            FAWRI_KNOWLEDGE_EMBEDDING_PROVIDER: "openai",
            OPENAI_API_KEY: "test-openai-key-not-real",
          } as NodeJS.ProcessEnv,
          dependencies: {
            createOpenAi: () => ({
              providerId: "openai",
              model: "disabled",
              dimensions: 0,
              async embed() {
                return [];
              },
            }),
          },
          loadApplication: async () => {
            applicationLoaded = true;
            return "app";
          },
        }),
      (error: unknown) => {
        assert.equal(errorCode(error), "KNOWLEDGE_VECTOR_CONFIG_INVALID");
        return true;
      },
    );
    assert.equal(applicationLoaded, false);
    assert.equal(getKnowledgeEmbeddingActivationReadiness().ready, false);
  } finally {
    resetKnowledgeDecisionEngineForTests();
  }
});

test("AWS KMS and OpenAI initialize in deterministic order in the same process", async () => {
  resetKnowledgeDecisionEngineForTests();
  configureMetaChannelCredentialKeyProvider(null);
  const aws = fakeAwsProvider("aws-combined-dek");
  const events: string[] = [];
  try {
    const result = await bootstrapRuntimeAndLoadApplication({
      env: {
        FAWRI_META_CREDENTIAL_PROVIDER: "aws-kms",
        FAWRI_KNOWLEDGE_EMBEDDING_PROVIDER: "openai",
        OPENAI_API_KEY: "test-openai-key-not-real",
      } as NodeJS.ProcessEnv,
      dependencies: {
        bootstrapAwsKms: async () => {
          events.push("aws-bootstrap");
          return aws.provider;
        },
        assertAwsKmsReady: () => {
          events.push("aws-ready");
        },
        createOpenAi: (apiKey) => {
          events.push("openai-create");
          return createOpenAiKnowledgeEmbeddingProvider({ apiKey });
        },
        configureKnowledge: (provider) => {
          events.push("openai-configure");
          assert.equal(getKnowledgeEmbeddingActivationReadiness().ready, false);
          configureKnowledgeEmbeddingProvider(provider);
        },
        configureMetaCredentialProvider: (provider) => {
          events.push(provider ? "meta-configure" : "meta-clear");
          configureMetaChannelCredentialKeyProvider(provider);
        },
      },
      loadApplication: async () => {
        events.push("app-load");
        assert.equal(getKnowledgeEmbeddingActivationReadiness().ready, true);
        return "app";
      },
    });

    assert.deepEqual(events.slice(0, 6), [
      "aws-bootstrap",
      "aws-ready",
      "openai-create",
      "openai-configure",
      "meta-configure",
      "app-load",
    ]);
    result.runtime.dispose();
    assert.equal(aws.disposed(), 1);
  } finally {
    configureMetaChannelCredentialKeyProvider(null);
    resetKnowledgeDecisionEngineForTests();
  }
});
