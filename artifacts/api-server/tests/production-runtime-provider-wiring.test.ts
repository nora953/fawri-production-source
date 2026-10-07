import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import type { AwsKmsMetaCredentialKeyProvider } from "../src/services/awsKmsMetaCredentialKeyProvider";
import {
  configureKnowledgeAiProvider,
  configureKnowledgeEmbeddingProvider,
  configureKnowledgeTranslationProvider,
  getKnowledgeAiActivationReadiness,
  getKnowledgeDecisionEngine,
  getKnowledgeEmbeddingActivationReadiness,
  getKnowledgeTranslationActivationReadiness,
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
  createOpenAiApprovedKnowledgeTranslationProvider,
} from "../src/services/knowledge/openAiApprovedKnowledgeTranslationProvider";
import {
  createConstrainedOpenAiProvider,
} from "../src/services/ai/constrainedOpenAiProvider";
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

test("explicit disabled knowledge embedding provider is accepted for staging", async () => {
  const never = () => {
    throw new Error("disabled knowledge embedding provider must not initialize OpenAI");
  };

  const result = await bootstrapRuntimeAndLoadApplication({
    env: {
      FAWRI_KNOWLEDGE_EMBEDDING_PROVIDER: "disabled",
    } as NodeJS.ProcessEnv,
    dependencies: {
      createOpenAi: never,
      configureKnowledge: never,
    },
    loadApplication: async () => "staging-app",
  });

  assert.equal(result.application, "staging-app");
  assert.equal(result.runtime.selections.knowledgeEmbeddingProvider, "disabled");
  result.runtime.dispose();
});

test("production core can bootstrap with Meta disabled before cutover", async () => {
  let awsBootstrapCalled = false;
  const result = await bootstrapRuntimeAndLoadApplication({
    env: {
      NODE_ENV: "production",
      FAWRI_META_CUTOVER_READY: "0",
      FAWRI_META_CREDENTIAL_PROVIDER: "disabled",
    } as NodeJS.ProcessEnv,
    dependencies: {
      bootstrapAwsKms: async () => {
        awsBootstrapCalled = true;
        return fakeAwsProvider().provider;
      },
    },
    loadApplication: async () => "core-app",
  });

  assert.equal(result.application, "core-app");
  assert.equal(result.runtime.selections.metaCredentialProvider, "disabled");
  assert.equal(awsBootstrapCalled, false);
  result.runtime.dispose();
});

test("production Meta cutover fails closed without AWS KMS credential provider", async () => {
  let applicationLoaded = false;
  await assert.rejects(
    () =>
      bootstrapRuntimeAndLoadApplication({
        env: {
          NODE_ENV: "production",
          FAWRI_META_CUTOVER_READY: "1",
          FAWRI_META_CREDENTIAL_PROVIDER: "disabled",
        } as NodeJS.ProcessEnv,
        loadApplication: async () => {
          applicationLoaded = true;
          return "app";
        },
      }),
    (error: unknown) => {
      assert.equal(errorCode(error), "META_CREDENTIAL_PROVIDER_REQUIRED");
      return true;
    },
  );
  assert.equal(applicationLoaded, false);
});

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
      createOpenAiTranslation: never,
      configureKnowledgeTranslation: never,
      createOpenAiAi: never,
      configureKnowledgeAi: never,
      configureMetaCredentialProvider: never,
    },
    loadApplication: async () => "app",
  });
  assert.deepEqual(result.runtime.selections, {
    metaCredentialProvider: "environment",
    knowledgeEmbeddingProvider: "disabled",
    knowledgeTranslationProvider: "disabled",
    knowledgeAiProvider: "disabled",
    metaImageProvider: "disabled",
    metaAudioProvider: "disabled",
    metaVideoProvider: "disabled",
  });
  assert.equal(
    createEnvironmentMetaCredentialKeyProvider().readiness?.().production_eligible,
    false,
  );
  result.runtime.dispose();
});


test("Meta video provider remains disabled unless explicitly selected", async () => {
  const never = () => { throw new Error("video must stay disabled"); };
  const result = await bootstrapRuntimeAndLoadApplication({
    env: { OPENAI_API_KEY: "x", FAWRI_OPENAI_VIDEO_MODEL: "vision" } as NodeJS.ProcessEnv,
    dependencies: { createOpenAiMetaVideo: never, configureMetaVideo: never },
    loadApplication: async () => "app",
  });
  assert.equal(result.runtime.selections.metaVideoProvider, "disabled");
  result.runtime.dispose();
});

test("Meta video provider requires explicit selection and releases on dispose", async () => {
  const events:string[]=[]; const service={async understand(){return null;}};
  const result=await bootstrapRuntimeAndLoadApplication({
    env:{FAWRI_META_VIDEO_PROVIDER:"openai",OPENAI_API_KEY:"key",FAWRI_OPENAI_VIDEO_MODEL:"video-model"} as NodeJS.ProcessEnv,
    dependencies:{
      createOpenAiMetaVideo:(key,model)=>{events.push(`create:${key}:${model}`);return service;},
      configureMetaVideo:()=>{events.push("configure");},
      releaseMetaVideo:()=>{events.push("release");return true;},
    },
    loadApplication:async()=>{events.push("app-load");return "app";},
  });
  assert.equal(result.runtime.selections.metaVideoProvider,"openai");
  assert.deepEqual(events,["create:key:video-model","configure","app-load"]);
  result.runtime.dispose(); assert.equal(events.at(-1),"release");
});

test("Meta audio provider remains disabled unless explicitly selected", async () => {
  const never = () => {
    throw new Error("Meta audio provider must not be configured");
  };
  const result = await bootstrapRuntimeAndLoadApplication({
    env: {
      OPENAI_API_KEY: "test-openai-key-not-real",
      FAWRI_OPENAI_AUDIO_MODEL: "test-audio-model",
    } as NodeJS.ProcessEnv,
    dependencies: {
      createOpenAiMetaAudio: never,
      configureMetaAudio: never,
    },
    loadApplication: async () => "app",
  });
  assert.equal(result.runtime.selections.metaAudioProvider, "disabled");
  result.runtime.dispose();
});

test("Meta audio OpenAI provider requires explicit selection and dedicated model", async () => {
  const events: string[] = [];
  const service = { async understand() { return null; } };
  const result = await bootstrapRuntimeAndLoadApplication({
    env: {
      FAWRI_META_AUDIO_PROVIDER: "openai",
      OPENAI_API_KEY: "test-openai-key-not-real",
      FAWRI_OPENAI_MODEL: "generic-model",
      FAWRI_OPENAI_AUDIO_MODEL: "audio-model",
    } as NodeJS.ProcessEnv,
    dependencies: {
      createOpenAiMetaAudio: (apiKey, model) => {
        events.push(`create:${apiKey}:${model}`);
        return service;
      },
      configureMetaAudio: (configured) => {
        events.push("configure");
        assert.equal(configured, service);
      },
      releaseMetaAudio: (configured) => {
        events.push("release");
        assert.equal(configured, service);
        return true;
      },
    },
    loadApplication: async () => {
      events.push("app-load");
      return "app";
    },
  });
  assert.equal(result.runtime.selections.metaAudioProvider, "openai");
  assert.deepEqual(events, [
    "create:test-openai-key-not-real:audio-model",
    "configure",
    "app-load",
  ]);
  result.runtime.dispose();
  assert.equal(events.at(-1), "release");
});

test("explicit Meta audio selection with missing configuration fails before application load", async () => {
  let applicationLoaded = false;
  await assert.rejects(
    () => bootstrapRuntimeAndLoadApplication({
      env: {
        FAWRI_META_AUDIO_PROVIDER: "openai",
        OPENAI_API_KEY: "",
        FAWRI_OPENAI_AUDIO_MODEL: "",
        FAWRI_OPENAI_MODEL: "",
      } as NodeJS.ProcessEnv,
      loadApplication: async () => {
        applicationLoaded = true;
        return "app";
      },
    }),
    (error: unknown) => {
      assert.equal(errorCode(error), "META_AUDIO_PROVIDER_CONFIG_INVALID");
      return true;
    },
  );
  assert.equal(applicationLoaded, false);
});

test("Meta image provider remains disabled unless explicitly selected", async () => {
  const never = () => {
    throw new Error("Meta image provider must not be configured");
  };

  const result = await bootstrapRuntimeAndLoadApplication({
    env: {
      OPENAI_API_KEY: "test-openai-key-not-real",
      FAWRI_OPENAI_MODEL: "test-model",
    } as NodeJS.ProcessEnv,
    dependencies: {
      createOpenAiMetaImage: never,
      configureMetaImage: never,
    },
    loadApplication: async () => "app",
  });

  assert.equal(result.runtime.selections.metaImageProvider, "disabled");
  result.runtime.dispose();
});

test("Meta image OpenAI provider requires explicit selection", async () => {
  const events: string[] = [];
  const service = {
    async understand() {
      return null;
    },
  };

  const result = await bootstrapRuntimeAndLoadApplication({
    env: {
      FAWRI_META_IMAGE_PROVIDER: "openai",
      OPENAI_API_KEY: "test-openai-key-not-real",
      FAWRI_OPENAI_MODEL: "test-image-model",
    } as NodeJS.ProcessEnv,
    dependencies: {
      createOpenAiMetaImage: (apiKey, model) => {
        events.push(`create:${apiKey}:${model}`);
        return service;
      },
      configureMetaImage: (configured) => {
        events.push("configure");
        assert.equal(configured, service);
      },
    },
    loadApplication: async () => {
      events.push("app-load");
      return "app";
    },
  });

  assert.equal(result.runtime.selections.metaImageProvider, "openai");
  assert.deepEqual(events, [
    "create:test-openai-key-not-real:test-image-model",
    "configure",
    "app-load",
  ]);

  result.runtime.dispose();
});


test("explicit Meta image OpenAI selection with missing configuration fails before application load", async () => {
  let applicationLoaded = false;

  await assert.rejects(
    () =>
      bootstrapRuntimeAndLoadApplication({
        env: {
          FAWRI_META_IMAGE_PROVIDER: "openai",
          OPENAI_API_KEY: "",
          FAWRI_OPENAI_MODEL: "",
        } as NodeJS.ProcessEnv,
        loadApplication: async () => {
          applicationLoaded = true;
          return "app";
        },
      }),
    (error: unknown) => {
      assert.equal(
        errorCode(error),
        "META_IMAGE_PROVIDER_CONFIG_INVALID",
      );
      return true;
    },
  );

  assert.equal(applicationLoaded, false);
});


test("disposing runtime releases configured Meta image service for a later bootstrap", async () => {
  const service1 = {
    async understand() {
      return null;
    },
  };

  const service2 = {
    async understand() {
      return null;
    },
  };

  const first = await bootstrapRuntimeAndLoadApplication({
    env: {
      FAWRI_META_IMAGE_PROVIDER: "openai",
      OPENAI_API_KEY: "test-openai-key-not-real",
      FAWRI_OPENAI_MODEL: "test-image-model",
    } as NodeJS.ProcessEnv,
    dependencies: {
      createOpenAiMetaImage: () => service1,
    },
    loadApplication: async () => "first",
  });

  first.runtime.dispose();

  const second = await bootstrapRuntimeAndLoadApplication({
    env: {
      FAWRI_META_IMAGE_PROVIDER: "openai",
      OPENAI_API_KEY: "test-openai-key-not-real",
      FAWRI_OPENAI_MODEL: "test-image-model",
    } as NodeJS.ProcessEnv,
    dependencies: {
      createOpenAiMetaImage: () => service2,
    },
    loadApplication: async () => "second",
  });

  assert.equal(second.application, "second");
  second.runtime.dispose();
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

test("openai translation selection configures approved translation before Knowledge singleton creation", async () => {
  resetKnowledgeDecisionEngineForTests();
  try {
    const result = await bootstrapRuntimeAndLoadApplication({
      env: {
        FAWRI_KNOWLEDGE_TRANSLATION_PROVIDER: "openai",
        OPENAI_API_KEY: "test-openai-key-not-real",
        FAWRI_OPENAI_MODEL: "test-translation-model",
      } as NodeJS.ProcessEnv,
      dependencies: {
        createOpenAiTranslation: (apiKey, model) =>
          createOpenAiApprovedKnowledgeTranslationProvider({
            apiKey,
            model,
            fetchImpl: async () => {
              throw new Error("transport must not run during provider bootstrap");
            },
          }),
      },
      loadApplication: async () => {
        assert.deepEqual(getKnowledgeTranslationActivationReadiness(), {
          ready: true,
          providerId: "openai_approved_translation_v1",
          model: "test-translation-model",
          reasonCode: null,
        });
        assert.equal(getKnowledgeDecisionEngine().liveAiTransportEnabled, true);
        return "app";
      },
    });
    assert.equal(result.application, "app");
    result.runtime.dispose();
  } finally {
    resetKnowledgeDecisionEngineForTests();
  }
});

test("openai constrained AI selection wires draft-generation transport before Knowledge singleton creation", async () => {
  resetKnowledgeDecisionEngineForTests();
  try {
    const result = await bootstrapRuntimeAndLoadApplication({
      env: {
        FAWRI_KNOWLEDGE_AI_PROVIDER: "openai",
        OPENAI_API_KEY: "test-openai-key-not-real",
        FAWRI_OPENAI_MODEL: "test-ai-model",
      } as NodeJS.ProcessEnv,
      dependencies: {
        createOpenAiAi: (apiKey, model) =>
          createConstrainedOpenAiProvider({
            apiKey,
            model,
            fetchImpl: async () => {
              throw new Error("transport must not run during bootstrap");
            },
          }),
      },
      loadApplication: async () => {
        assert.deepEqual(getKnowledgeAiActivationReadiness(), {
          ready: true,
          providerId: "openai_responses_constrained_v1",
          model: "test-ai-model",
          reasonCode: null,
        });
        assert.equal(getKnowledgeDecisionEngine().liveAiTransportEnabled, true);
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
        FAWRI_KNOWLEDGE_TRANSLATION_PROVIDER: "openai",
        OPENAI_API_KEY: "test-openai-key-not-real",
        FAWRI_OPENAI_MODEL: "test-translation-model",
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
        createOpenAiTranslation: (apiKey, model) => {
          events.push("translation-create");
          return createOpenAiApprovedKnowledgeTranslationProvider({
            apiKey,
            model,
            fetchImpl: async () => {
              throw new Error("transport must not run during provider bootstrap");
            },
          });
        },
        configureKnowledgeTranslation: (provider) => {
          events.push("translation-configure");
          assert.equal(getKnowledgeTranslationActivationReadiness().ready, false);
          configureKnowledgeTranslationProvider(provider);
        },
        configureMetaCredentialProvider: (provider) => {
          events.push(provider ? "meta-configure" : "meta-clear");
          configureMetaChannelCredentialKeyProvider(provider);
        },
      },
      loadApplication: async () => {
        events.push("app-load");
        assert.equal(getKnowledgeEmbeddingActivationReadiness().ready, true);
        assert.equal(getKnowledgeTranslationActivationReadiness().ready, true);
        return "app";
      },
    });

    assert.deepEqual(events.slice(0, 8), [
      "aws-bootstrap",
      "aws-ready",
      "openai-create",
      "openai-configure",
      "translation-create",
      "translation-configure",
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
