import {
  KnowledgeRuntimeGateError,
  type KnowledgeEmbeddingProvider,
} from "./postgresKnowledgeRuntime.js";

export const OPENAI_KNOWLEDGE_EMBEDDING_PROVIDER_ID = "openai" as const;
export const OPENAI_KNOWLEDGE_EMBEDDING_MODEL = "text-embedding-3-small" as const;
export const OPENAI_KNOWLEDGE_EMBEDDING_DIMENSIONS = 1_536 as const;

const OPENAI_EMBEDDINGS_ENDPOINT = "https://api.openai.com/v1/embeddings";
const DEFAULT_TIMEOUT_MS = 8_000;
const DEFAULT_MAX_RETRIES = 2;
const DEFAULT_RETRY_BASE_DELAY_MS = 200;
const MAX_TIMEOUT_MS = 30_000;
const MAX_RETRIES = 3;
const MAX_RETRY_BASE_DELAY_MS = 5_000;

export type OpenAiKnowledgeEmbeddingProviderOptions = {
  apiKey?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  maxRetries?: number;
  retryBaseDelayMs?: number;
  sleepImpl?: (milliseconds: number) => Promise<void>;
};

export type OpenAiKnowledgeEmbeddingReadiness = {
  ready: boolean;
  providerId: typeof OPENAI_KNOWLEDGE_EMBEDDING_PROVIDER_ID;
  model: typeof OPENAI_KNOWLEDGE_EMBEDDING_MODEL;
  dimensions: typeof OPENAI_KNOWLEDGE_EMBEDDING_DIMENSIONS;
  credentialConfigured: boolean;
  reasonCode: "KNOWLEDGE_VECTOR_CONFIG_INVALID" | null;
};

export type OpenAiKnowledgeEmbeddingReadinessOptions = {
  apiKey?: string;
  providerId?: string;
  model?: string;
  dimensions?: number;
};

function configError(): never {
  throw new KnowledgeRuntimeGateError(
    "KNOWLEDGE_VECTOR_CONFIG_INVALID",
    "knowledge vector provider configuration is invalid",
  );
}

function unavailableError(): never {
  throw new KnowledgeRuntimeGateError(
    "KNOWLEDGE_VECTOR_UNAVAILABLE",
    "knowledge vector provider is unavailable",
  );
}

function invalidVectorError(): never {
  throw new KnowledgeRuntimeGateError(
    "KNOWLEDGE_VECTOR_INVALID",
    "knowledge vector state is invalid",
  );
}

function resolvedApiKey(explicitApiKey: string | undefined): string {
  const raw = explicitApiKey === undefined ? process.env.OPENAI_API_KEY : explicitApiKey;
  return String(raw ?? "").trim();
}

function boundedInteger(
  value: number | undefined,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  const resolved = value ?? fallback;
  if (!Number.isInteger(resolved) || resolved < minimum || resolved > maximum) {
    configError();
  }
  return resolved;
}

function isTransientStatus(status: number): boolean {
  return status === 429 || (status >= 500 && status <= 599);
}

function validateEmbeddingResponse(payload: unknown): number[] {
  if (!payload || typeof payload !== "object") invalidVectorError();
  const response = payload as {
    object?: unknown;
    model?: unknown;
    data?: unknown;
  };
  if (
    response.object !== "list" ||
    response.model !== OPENAI_KNOWLEDGE_EMBEDDING_MODEL ||
    !Array.isArray(response.data) ||
    response.data.length !== 1
  ) {
    invalidVectorError();
  }

  const entry = response.data[0];
  if (!entry || typeof entry !== "object") invalidVectorError();
  const item = entry as {
    object?: unknown;
    index?: unknown;
    embedding?: unknown;
  };
  if (
    item.object !== "embedding" ||
    item.index !== 0 ||
    !Array.isArray(item.embedding) ||
    item.embedding.length !== OPENAI_KNOWLEDGE_EMBEDDING_DIMENSIONS
  ) {
    invalidVectorError();
  }

  let magnitudeSquared = 0;
  const vector = item.embedding.map((value) => {
    if (typeof value !== "number" || !Number.isFinite(value)) invalidVectorError();
    magnitudeSquared += value * value;
    if (!Number.isFinite(magnitudeSquared)) invalidVectorError();
    return value;
  });
  if (magnitudeSquared <= 0) invalidVectorError();
  return vector;
}

async function defaultSleep(milliseconds: number): Promise<void> {
  if (milliseconds <= 0) return;
  await new Promise<void>((resolve) => setTimeout(resolve, milliseconds));
}

export function getOpenAiKnowledgeEmbeddingReadiness(
  options: OpenAiKnowledgeEmbeddingReadinessOptions = {},
): OpenAiKnowledgeEmbeddingReadiness {
  const apiKey = resolvedApiKey(options.apiKey);
  const providerId = options.providerId ?? OPENAI_KNOWLEDGE_EMBEDDING_PROVIDER_ID;
  const model = options.model ?? OPENAI_KNOWLEDGE_EMBEDDING_MODEL;
  const dimensions = options.dimensions ?? OPENAI_KNOWLEDGE_EMBEDDING_DIMENSIONS;
  const ready =
    Boolean(apiKey) &&
    providerId === OPENAI_KNOWLEDGE_EMBEDDING_PROVIDER_ID &&
    model === OPENAI_KNOWLEDGE_EMBEDDING_MODEL &&
    dimensions === OPENAI_KNOWLEDGE_EMBEDDING_DIMENSIONS;

  return {
    ready,
    providerId: OPENAI_KNOWLEDGE_EMBEDDING_PROVIDER_ID,
    model: OPENAI_KNOWLEDGE_EMBEDDING_MODEL,
    dimensions: OPENAI_KNOWLEDGE_EMBEDDING_DIMENSIONS,
    credentialConfigured: Boolean(apiKey),
    reasonCode: ready ? null : "KNOWLEDGE_VECTOR_CONFIG_INVALID",
  };
}

export class OpenAiKnowledgeEmbeddingProvider implements KnowledgeEmbeddingProvider {
  readonly providerId = OPENAI_KNOWLEDGE_EMBEDDING_PROVIDER_ID;
  readonly model = OPENAI_KNOWLEDGE_EMBEDDING_MODEL;
  readonly dimensions = OPENAI_KNOWLEDGE_EMBEDDING_DIMENSIONS;

  private readonly apiKey: string;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;
  private readonly maxRetries: number;
  private readonly retryBaseDelayMs: number;
  private readonly sleepImpl: (milliseconds: number) => Promise<void>;

  constructor(options: OpenAiKnowledgeEmbeddingProviderOptions = {}) {
    this.apiKey = resolvedApiKey(options.apiKey);
    if (!this.apiKey) configError();
    this.fetchImpl = options.fetchImpl || fetch;
    this.timeoutMs = boundedInteger(options.timeoutMs, DEFAULT_TIMEOUT_MS, 1, MAX_TIMEOUT_MS);
    this.maxRetries = boundedInteger(options.maxRetries, DEFAULT_MAX_RETRIES, 0, MAX_RETRIES);
    this.retryBaseDelayMs = boundedInteger(
      options.retryBaseDelayMs,
      DEFAULT_RETRY_BASE_DELAY_MS,
      0,
      MAX_RETRY_BASE_DELAY_MS,
    );
    this.sleepImpl = options.sleepImpl || defaultSleep;
  }

  async embed(text: string): Promise<readonly number[]> {
    if (typeof text !== "string" || !text.trim()) invalidVectorError();

    for (let attempt = 0; attempt <= this.maxRetries; attempt += 1) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeoutMs);
      let retry = false;

      try {
        const response = await this.fetchImpl(OPENAI_EMBEDDINGS_ENDPOINT, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: OPENAI_KNOWLEDGE_EMBEDDING_MODEL,
            input: text,
            encoding_format: "float",
          }),
          signal: controller.signal,
        });

        if (!response.ok) {
          retry = isTransientStatus(response.status) && attempt < this.maxRetries;
          if (!retry) unavailableError();
        } else {
          let payload: unknown;
          try {
            payload = await response.json();
          } catch {
            invalidVectorError();
          }
          return validateEmbeddingResponse(payload);
        }
      } catch (error) {
        if (error instanceof KnowledgeRuntimeGateError) throw error;
        retry = attempt < this.maxRetries;
        if (!retry) unavailableError();
      } finally {
        clearTimeout(timer);
      }

      if (retry) {
        const delay = Math.min(this.retryBaseDelayMs * 2 ** attempt, MAX_RETRY_BASE_DELAY_MS);
        await this.sleepImpl(delay);
      }
    }

    unavailableError();
  }
}

export function createOpenAiKnowledgeEmbeddingProvider(
  options: OpenAiKnowledgeEmbeddingProviderOptions = {},
): OpenAiKnowledgeEmbeddingProvider {
  const readiness = getOpenAiKnowledgeEmbeddingReadiness({ apiKey: options.apiKey });
  if (!readiness.ready) configError();
  return new OpenAiKnowledgeEmbeddingProvider(options);
}
