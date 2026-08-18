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

type AiUsageEvent = {
  at: number;
  merchantId: string;
  providerId: string;
  model: string;
  latencyMs: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
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

export function recordAiUsageTelemetry(input: {
  merchantId: string;
  providerId: string;
  model: string;
  latencyMs: number;
  usage: AiTokenUsage;
}): void {
  const merchantId = boundedIdentifier(input.merchantId, 160);
  const providerId = boundedIdentifier(input.providerId, 120);
  const model = boundedIdentifier(input.model, 160);
  const latencyMs = Number(input.latencyMs);
  const inputTokens = Number(input.usage.inputTokens);
  const outputTokens = Number(input.usage.outputTokens);
  const totalTokens = Number(input.usage.totalTokens);
  if (
    !merchantId ||
    !providerId ||
    !model ||
    !Number.isFinite(latencyMs) ||
    latencyMs < 0 ||
    !Number.isInteger(inputTokens) ||
    inputTokens < 0 ||
    !Number.isInteger(outputTokens) ||
    outputTokens < 0 ||
    !Number.isInteger(totalTokens) ||
    totalTokens < inputTokens + outputTokens
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
    inputTokens,
    outputTokens,
    totalTokens,
  });
  prune(nowMs);
}

export type AiUsageTelemetrySnapshot = {
  coverage: "current_process";
  process_started_at: string;
  retained_events: number;
  capped: boolean;
  calls: number;
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
  average_latency_ms: number | null;
  providers: Array<{
    provider_id: string;
    model: string;
    calls: number;
    total_tokens: number;
  }>;
  merchants: Array<{
    merchant_id: string;
    calls: number;
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
  const sum = (key: "inputTokens" | "outputTokens" | "totalTokens") =>
    selected.reduce((total, event) => total + event[key], 0);
  const providerKeys = [...new Set(selected.map((event) => `${event.providerId}\u0000${event.model}`))].sort();
  const merchantIds = [...new Set(selected.map((event) => event.merchantId))].sort();

  return {
    coverage: "current_process",
    process_started_at: PROCESS_STARTED_AT,
    retained_events: events.length,
    capped: events.length >= MAX_EVENTS,
    calls: selected.length,
    input_tokens: sum("inputTokens"),
    output_tokens: sum("outputTokens"),
    total_tokens: sum("totalTokens"),
    average_latency_ms:
      selected.length > 0
        ? Math.round(
            (selected.reduce((total, event) => total + event.latencyMs, 0) / selected.length) * 100,
          ) / 100
        : null,
    providers: providerKeys.map((key) => {
      const [providerId, model] = key.split("\u0000");
      const matches = selected.filter(
        (event) => event.providerId === providerId && event.model === model,
      );
      return {
        provider_id: providerId || "unknown",
        model: model || "unknown",
        calls: matches.length,
        total_tokens: matches.reduce((total, event) => total + event.totalTokens, 0),
      };
    }),
    merchants: merchantIds.map((merchantId) => {
      const matches = selected.filter((event) => event.merchantId === merchantId);
      return {
        merchant_id: merchantId,
        calls: matches.length,
        input_tokens: matches.reduce((total, event) => total + event.inputTokens, 0),
        output_tokens: matches.reduce((total, event) => total + event.outputTokens, 0),
        total_tokens: matches.reduce((total, event) => total + event.totalTokens, 0),
      };
    }),
  };
}
