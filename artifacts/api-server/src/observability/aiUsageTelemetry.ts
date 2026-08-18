import type { AiTokenUsage } from "../services/knowledge/types";
import type { EarlyWarningWindow } from "../services/earlyWarningPostgresAuthority";

const MAX_EVENTS = 50_000;
const PROCESS_STARTED_AT = new Date().toISOString();
const WINDOW_MS: Record<EarlyWarningWindow, number> = {
  "1h": 60 * 60 * 1_000,
  "24h": 24 * 60 * 60 * 1_000,
  "7d": 7 * 24 * 60 * 60 * 1_000,
  "30d": 30 * 24 * 60 * 60 * 1_000,
};

export type AiCallOutcome =
  | "success"
  | "provider_error"
  | "timeout"
  | "transport_error"
  | "invalid_response";

type AiUsageEvent = {
  at: number;
  merchantId: string;
  providerId: string;
  model: string;
  latencyMs: number;
  outcome: AiCallOutcome;
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
};

const events: AiUsageEvent[] = [];

function boundedIdentifier(value: unknown, maximum: number): string {
  return String(value ?? "").trim().slice(0, maximum);
}

function prune(nowMs: number): void {
  const oldestAllowed = nowMs - WINDOW_MS["30d"];
  while (events.length > 0 && events[0]!.at < oldestAllowed) events.shift();
  if (events.length > MAX_EVENTS) events.splice(0, events.length - MAX_EVENTS);
}

function normalizedUsage(usage: AiTokenUsage | undefined): {
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
} | null {
  if (!usage) {
    return { inputTokens: null, outputTokens: null, totalTokens: null };
  }
  const inputTokens = Number(usage.inputTokens);
  const outputTokens = Number(usage.outputTokens);
  const totalTokens = Number(usage.totalTokens);
  if (
    !Number.isInteger(inputTokens) ||
    inputTokens < 0 ||
    !Number.isInteger(outputTokens) ||
    outputTokens < 0 ||
    !Number.isInteger(totalTokens) ||
    totalTokens < inputTokens + outputTokens
  ) {
    return null;
  }
  return { inputTokens, outputTokens, totalTokens };
}

export function recordAiUsageTelemetry(input: {
  merchantId: string;
  providerId: string;
  model: string;
  latencyMs: number;
  outcome?: AiCallOutcome;
  usage?: AiTokenUsage;
}): void {
  const merchantId = boundedIdentifier(input.merchantId, 160);
  const providerId = boundedIdentifier(input.providerId, 120);
  const model = boundedIdentifier(input.model, 160);
  const latencyMs = Number(input.latencyMs);
  const usage = normalizedUsage(input.usage);
  const outcome = input.outcome || "success";
  if (
    !merchantId ||
    !providerId ||
    !model ||
    !Number.isFinite(latencyMs) ||
    latencyMs < 0 ||
    !usage ||
    ![
      "success",
      "provider_error",
      "timeout",
      "transport_error",
      "invalid_response",
    ].includes(outcome)
  ) {
    return;
  }

  const nowMs = Date.now();
  events.push({
    at: nowMs,
    merchantId,
    providerId,
    model,
    latencyMs,
    outcome,
    ...usage,
  });
  prune(nowMs);
}

export type AiUsageTelemetrySnapshot = {
  coverage: "current_process";
  process_started_at: string;
  retained_events: number;
  capped: boolean;
  calls: number;
  successful_calls: number;
  failed_calls: number;
  timeouts: number;
  token_reported_calls: number;
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
  average_latency_ms: number | null;
  error_rate: number | null;
  providers: Array<{
    provider_id: string;
    model: string;
    calls: number;
    failed_calls: number;
    total_tokens: number;
  }>;
  merchants: Array<{
    merchant_id: string;
    calls: number;
    failed_calls: number;
    input_tokens: number;
    output_tokens: number;
    total_tokens: number;
  }>;
};

export function getAiUsageTelemetrySnapshot(
  window: EarlyWarningWindow,
  nowMs = Date.now(),
): AiUsageTelemetrySnapshot {
  prune(nowMs);
  const since = nowMs - WINDOW_MS[window];
  const selected = events.filter((event) => event.at >= since);
  const successfulCalls = selected.filter((event) => event.outcome === "success").length;
  const failedCalls = selected.length - successfulCalls;
  const tokenReported = selected.filter((event) => event.totalTokens !== null);
  const sum = (key: "inputTokens" | "outputTokens" | "totalTokens") =>
    tokenReported.reduce((total, event) => total + (event[key] ?? 0), 0);
  const providerKeys = [...new Set(selected.map((event) => `${event.providerId}\u0000${event.model}`))].sort();
  const merchantIds = [...new Set(selected.map((event) => event.merchantId))].sort();

  return {
    coverage: "current_process",
    process_started_at: PROCESS_STARTED_AT,
    retained_events: events.length,
    capped: events.length >= MAX_EVENTS,
    calls: selected.length,
    successful_calls: successfulCalls,
    failed_calls: failedCalls,
    timeouts: selected.filter((event) => event.outcome === "timeout").length,
    token_reported_calls: tokenReported.length,
    input_tokens: sum("inputTokens"),
    output_tokens: sum("outputTokens"),
    total_tokens: sum("totalTokens"),
    average_latency_ms:
      selected.length > 0
        ? Math.round(
            (selected.reduce((total, event) => total + event.latencyMs, 0) / selected.length) * 100,
          ) / 100
        : null,
    error_rate: selected.length > 0 ? failedCalls / selected.length : null,
    providers: providerKeys.map((key) => {
      const [providerId, model] = key.split("\u0000");
      const matches = selected.filter(
        (event) => event.providerId === providerId && event.model === model,
      );
      return {
        provider_id: providerId || "unknown",
        model: model || "unknown",
        calls: matches.length,
        failed_calls: matches.filter((event) => event.outcome !== "success").length,
        total_tokens: matches.reduce((total, event) => total + (event.totalTokens ?? 0), 0),
      };
    }),
    merchants: merchantIds.map((merchantId) => {
      const matches = selected.filter((event) => event.merchantId === merchantId);
      return {
        merchant_id: merchantId,
        calls: matches.length,
        failed_calls: matches.filter((event) => event.outcome !== "success").length,
        input_tokens: matches.reduce((total, event) => total + (event.inputTokens ?? 0), 0),
        output_tokens: matches.reduce((total, event) => total + (event.outputTokens ?? 0), 0),
        total_tokens: matches.reduce((total, event) => total + (event.totalTokens ?? 0), 0),
      };
    }),
  };
}

export function resetAiUsageTelemetryForTests(): void {
  events.splice(0, events.length);
}
