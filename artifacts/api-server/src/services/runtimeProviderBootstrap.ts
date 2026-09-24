import {
  assertAwsKmsMetaCredentialProviderReady,
  bootstrapAwsKmsMetaCredentialKeyProviderFromEnvironment,
  type AwsKmsMetaCredentialKeyProvider,
} from "./awsKmsMetaCredentialKeyProvider";
import {
  configureKnowledgeAiProvider,
  configureKnowledgeEmbeddingProvider,
  configureKnowledgeTranslationProvider,
} from "./ai/knowledgeDecisionEngine";
import {
  createConstrainedOpenAiProvider,
} from "./ai/constrainedOpenAiProvider";
import {
  createOpenAiKnowledgeEmbeddingProvider,
} from "./knowledge/openAiKnowledgeEmbeddingProvider";
import {
  createOpenAiApprovedKnowledgeTranslationProvider,
} from "./knowledge/openAiApprovedKnowledgeTranslationProvider";
import type { KnowledgeEmbeddingProvider } from "./knowledge/postgresKnowledgeRuntime";
import type {
  AiFallbackProvider,
  ApprovedKnowledgeTranslationProvider,
} from "./knowledge/types";
import {
  configureMetaChannelCredentialKeyProvider,
} from "./metaChannelRuntime";
import {
  configurePostgresMetaChannelCredentialKeyProvider,
} from "./postgresMetaChannelAuthority";
import {
  configurePostgresDurableJobCredentialKeyProvider,
} from "./postgresDurableJobQueue";
import type { MetaCredentialKeyProvider } from "./metaCredentialVault";

export type MetaCredentialProviderSelection = "environment" | "aws-kms";
export type KnowledgeEmbeddingProviderSelection = "disabled" | "openai";
export type KnowledgeTranslationProviderSelection = "disabled" | "openai";
export type KnowledgeAiProviderSelection = "disabled" | "openai";

export type RuntimeProviderSelections = {
  metaCredentialProvider: MetaCredentialProviderSelection;
  knowledgeEmbeddingProvider: KnowledgeEmbeddingProviderSelection;
  knowledgeTranslationProvider: KnowledgeTranslationProviderSelection;
  knowledgeAiProvider: KnowledgeAiProviderSelection;
};

export type RuntimeProviderHandle = {
  selections: RuntimeProviderSelections;
  dispose(): void;
};

export type RuntimeProviderBootstrapDependencies = {
  bootstrapAwsKms(env: NodeJS.ProcessEnv): Promise<AwsKmsMetaCredentialKeyProvider>;
  assertAwsKmsReady(provider: MetaCredentialKeyProvider): unknown;
  createOpenAi(apiKey: string | undefined): KnowledgeEmbeddingProvider;
  configureKnowledge(provider: KnowledgeEmbeddingProvider): void;
  createOpenAiTranslation(
    apiKey: string | undefined,
    model: string | undefined,
  ): ApprovedKnowledgeTranslationProvider;
  configureKnowledgeTranslation(provider: ApprovedKnowledgeTranslationProvider): void;
  createOpenAiAi(
    apiKey: string | undefined,
    model: string | undefined,
  ): AiFallbackProvider;
  configureKnowledgeAi(provider: AiFallbackProvider): void;
  configureMetaCredentialProvider(provider: MetaCredentialKeyProvider | null): void;
};

function text(value: unknown): string {
  return String(value ?? "").trim();
}

function safeErrorCode(error: unknown): string | null {
  const raw =
    error && typeof error === "object"
      ? text((error as { code?: unknown }).code)
      : "";
  return /^[A-Z][A-Z0-9_]{2,159}$/.test(raw) ? raw : null;
}

function fail(code: string, message: string): Error & { code: string } {
  return Object.assign(new Error(message), { code });
}

function sanitizedInitializationError(error: unknown): Error & { code: string } {
  return fail(
    safeErrorCode(error) || "RUNTIME_PROVIDER_INITIALIZATION_FAILED",
    "production runtime provider initialization failed",
  );
}

function readMetaCredentialProviderSelection(
  env: NodeJS.ProcessEnv,
): MetaCredentialProviderSelection {
  const selected = text(env.FAWRI_META_CREDENTIAL_PROVIDER).toLowerCase();
  const production = text(env.NODE_ENV).toLowerCase() === "production";
  if (!selected) {
    if (production) {
      throw fail(
        "META_CREDENTIAL_PROVIDER_REQUIRED",
        "AWS KMS Meta credential provider selection is required in production",
      );
    }
    return "environment";
  }
  if (selected === "aws-kms") return "aws-kms";
  throw fail(
    "META_CREDENTIAL_PROVIDER_CONFIG_INVALID",
    "Meta credential provider selection is invalid",
  );
}

function readKnowledgeEmbeddingProviderSelection(
  env: NodeJS.ProcessEnv,
): KnowledgeEmbeddingProviderSelection {
  const selected = text(env.FAWRI_KNOWLEDGE_EMBEDDING_PROVIDER).toLowerCase();
  if (!selected) return "disabled";
  if (selected === "openai") return "openai";
  throw fail(
    "KNOWLEDGE_VECTOR_PROVIDER_CONFIG_INVALID",
    "Knowledge embedding provider selection is invalid",
  );
}

function readKnowledgeAiProviderSelection(
  env: NodeJS.ProcessEnv,
): KnowledgeAiProviderSelection {
  const selected = text(env.FAWRI_KNOWLEDGE_AI_PROVIDER).toLowerCase();
  if (!selected) return "disabled";
  if (selected === "openai") return "openai";
  throw fail(
    "KNOWLEDGE_AI_PROVIDER_CONFIG_INVALID",
    "Knowledge AI provider selection is invalid",
  );
}

function readKnowledgeTranslationProviderSelection(
  env: NodeJS.ProcessEnv,
): KnowledgeTranslationProviderSelection {
  const selected = text(env.FAWRI_KNOWLEDGE_TRANSLATION_PROVIDER).toLowerCase();
  if (!selected) return "disabled";
  if (selected === "openai") return "openai";
  throw fail(
    "KNOWLEDGE_TRANSLATION_PROVIDER_CONFIG_INVALID",
    "Knowledge translation provider selection is invalid",
  );
}

function configureMetaCredentialProvider(
  provider: MetaCredentialKeyProvider | null,
): void {
  configureMetaChannelCredentialKeyProvider(provider);
  configurePostgresMetaChannelCredentialKeyProvider(provider);
  configurePostgresDurableJobCredentialKeyProvider(provider);
}

function defaultDependencies(): RuntimeProviderBootstrapDependencies {
  return {
    bootstrapAwsKms: (env) =>
      bootstrapAwsKmsMetaCredentialKeyProviderFromEnvironment({ env }),
    assertAwsKmsReady: assertAwsKmsMetaCredentialProviderReady,
    createOpenAi: (apiKey) =>
      createOpenAiKnowledgeEmbeddingProvider({ apiKey }),
    configureKnowledge: configureKnowledgeEmbeddingProvider,
    createOpenAiTranslation: (apiKey, model) =>
      createOpenAiApprovedKnowledgeTranslationProvider({ apiKey, model }),
    configureKnowledgeTranslation: configureKnowledgeTranslationProvider,
    createOpenAiAi: (apiKey, model) =>
      createConstrainedOpenAiProvider({ apiKey, model }),
    configureKnowledgeAi: configureKnowledgeAiProvider,
    configureMetaCredentialProvider,
  };
}

export async function initializeRuntimeProviders(input: {
  env?: NodeJS.ProcessEnv;
  dependencies?: Partial<RuntimeProviderBootstrapDependencies>;
} = {}): Promise<RuntimeProviderHandle> {
  const env = input.env || process.env;
  const dependencies = {
    ...defaultDependencies(),
    ...input.dependencies,
  };
  const selections: RuntimeProviderSelections = {
    metaCredentialProvider: readMetaCredentialProviderSelection(env),
    knowledgeEmbeddingProvider: readKnowledgeEmbeddingProviderSelection(env),
    knowledgeTranslationProvider: readKnowledgeTranslationProviderSelection(env),
    knowledgeAiProvider: readKnowledgeAiProviderSelection(env),
  };

  let awsProvider: AwsKmsMetaCredentialKeyProvider | null = null;
  let metaProviderConfigured = false;

  try {
    if (selections.metaCredentialProvider === "aws-kms") {
      awsProvider = await dependencies.bootstrapAwsKms(env);
      dependencies.assertAwsKmsReady(awsProvider);
    }

    if (selections.knowledgeEmbeddingProvider === "openai") {
      const provider = dependencies.createOpenAi(env.OPENAI_API_KEY);
      dependencies.configureKnowledge(provider);
    }

    if (selections.knowledgeTranslationProvider === "openai") {
      const provider = dependencies.createOpenAiTranslation(
        env.OPENAI_API_KEY,
        env.FAWRI_OPENAI_MODEL,
      );
      dependencies.configureKnowledgeTranslation(provider);
    }

    if (selections.knowledgeAiProvider === "openai") {
      const provider = dependencies.createOpenAiAi(
        env.OPENAI_API_KEY,
        env.FAWRI_OPENAI_MODEL,
      );
      dependencies.configureKnowledgeAi(provider);
    }

    if (awsProvider) {
      dependencies.configureMetaCredentialProvider(awsProvider);
      metaProviderConfigured = true;
    }
  } catch (error) {
    if (metaProviderConfigured) {
      dependencies.configureMetaCredentialProvider(null);
    }
    awsProvider?.dispose();
    throw sanitizedInitializationError(error);
  }

  let disposed = false;
  return {
    selections,
    dispose() {
      if (disposed) return;
      disposed = true;
      if (metaProviderConfigured) {
        dependencies.configureMetaCredentialProvider(null);
        metaProviderConfigured = false;
      }
      awsProvider?.dispose();
    },
  };
}

export async function bootstrapRuntimeAndLoadApplication<T>(input: {
  env?: NodeJS.ProcessEnv;
  dependencies?: Partial<RuntimeProviderBootstrapDependencies>;
  loadApplication(): Promise<T>;
}): Promise<{ application: T; runtime: RuntimeProviderHandle }> {
  const runtime = await initializeRuntimeProviders({
    env: input.env,
    dependencies: input.dependencies,
  });
  try {
    const application = await input.loadApplication();
    return { application, runtime };
  } catch (error) {
    runtime.dispose();
    throw error;
  }
}
