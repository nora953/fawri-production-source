import type { NextFunction, Request, Response } from "express";
import { FAWRI_METRICS } from "./metrics";
import { processMetricsRegistry } from "./runtime";
import type { EarlyWarningWindow } from "../services/earlyWarningPostgresAuthority";

const MAX_EVENTS = 50_000;
const PROCESS_STARTED_AT = new Date().toISOString();
const WINDOW_MS: Record<EarlyWarningWindow, number> = {
  "1h": 60 * 60 * 1_000,
  "24h": 24 * 60 * 60 * 1_000,
  "7d": 7 * 24 * 60 * 60 * 1_000,
  "30d": 30 * 24 * 60 * 60 * 1_000,
};

type HttpOperation =
  | "auth"
  | "admin"
  | "support"
  | "catalog"
  | "conversations"
  | "orders"
  | "channels"
  | "knowledge"
  | "settings"
  | "meta_webhook"
  | "ops"
  | "health"
  | "other";

type RequestEvent = {
  at: number;
  durationMs: number;
  statusCode: number;
  operation: HttpOperation;
  requestBytes: number | null;
  responseBytes: number | null;
};

const events: RequestEvent[] = [];

function numericHeader(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function operationFor(request: Request): HttpOperation {
  const path = String(request.originalUrl || request.path || "").split("?", 1)[0];
  if (path.startsWith("/api/meta/webhook")) return "meta_webhook";
  if (path.startsWith("/api/auth/admin") || path.startsWith("/api/auth/admins")) return "admin";
  if (path.startsWith("/api/auth/support")) return "support";
  if (path.startsWith("/api/auth")) return "auth";
  if (path.startsWith("/api/catalog") || path.startsWith("/api/inventory")) return "catalog";
  if (path.startsWith("/api/conversations")) return "conversations";
  if (path.startsWith("/api/orders")) return "orders";
  if (path.startsWith("/api/channels") || path.startsWith("/api/meta")) return "channels";
  if (path.startsWith("/api/knowledge")) return "knowledge";
  if (path.startsWith("/api/settings")) return "settings";
  if (path.startsWith("/ops")) return "ops";
  if (path === "/healthz") return "health";
  return "other";
}

function outcome(statusCode: number): "success" | "rejected" | "failure" {
  if (statusCode >= 500) return "failure";
  if (statusCode >= 400) return "rejected";
  return "success";
}

function percentile(sorted: number[], quantile: number): number | null {
  if (sorted.length === 0) return null;
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * quantile) - 1));
  return Math.round(sorted[index] * 100) / 100;
}

function prune(nowMs: number): void {
  const oldestAllowed = nowMs - WINDOW_MS["30d"];
  while (events.length > 0 && events[0]!.at < oldestAllowed) events.shift();
  if (events.length > MAX_EVENTS) events.splice(0, events.length - MAX_EVENTS);
}

export function recordHttpTelemetry(request: Request, response: Response, next: NextFunction): void {
  const started = process.hrtime.bigint();
  const operation = operationFor(request);
  const requestBytes = numericHeader(request.header("content-length"));

  response.once("finish", () => {
    const elapsedNs = process.hrtime.bigint() - started;
    const durationMs = Number(elapsedNs) / 1_000_000;
    const statusCode = Number(response.statusCode || 0);
    const result = outcome(statusCode);
    const responseBytes = numericHeader(response.getHeader("content-length"));
    const nowMs = Date.now();

    events.push({
      at: nowMs,
      durationMs,
      statusCode,
      operation,
      requestBytes,
      responseBytes,
    });
    prune(nowMs);

    try {
      processMetricsRegistry.increment(FAWRI_METRICS.httpRequestsTotal, {
        operation,
        outcome: result,
      });
      if (statusCode >= 500) {
        processMetricsRegistry.increment(FAWRI_METRICS.httpErrorsTotal, {
          operation,
          outcome: "failure",
        });
      }
    } catch {
      // Telemetry must never change request behavior.
    }
  });

  next();
}

export type HttpTelemetrySnapshot = {
  coverage: "current_process";
  process_started_at: string;
  retained_events: number;
  capped: boolean;
  requests: number;
  rejected: number;
  errors: number;
  error_rate: number | null;
  p50_latency_ms: number | null;
  p95_latency_ms: number | null;
  p99_latency_ms: number | null;
  request_bytes: number | null;
  response_bytes: number | null;
  by_operation: Array<{
    operation: HttpOperation;
    requests: number;
    errors: number;
    p95_latency_ms: number | null;
  }>;
};

export function getHttpTelemetrySnapshot(
  window: EarlyWarningWindow,
  nowMs = Date.now(),
): HttpTelemetrySnapshot {
  prune(nowMs);
  const since = nowMs - WINDOW_MS[window];
  const selected = events.filter((event) => event.at >= since);
  const latencies = selected.map((event) => event.durationMs).sort((a, b) => a - b);
  const errors = selected.filter((event) => event.statusCode >= 500).length;
  const rejected = selected.filter((event) => event.statusCode >= 400 && event.statusCode < 500).length;
  const requestByteValues = selected.map((event) => event.requestBytes).filter((value): value is number => value !== null);
  const responseByteValues = selected.map((event) => event.responseBytes).filter((value): value is number => value !== null);
  const operations = [...new Set(selected.map((event) => event.operation))].sort();

  return {
    coverage: "current_process",
    process_started_at: PROCESS_STARTED_AT,
    retained_events: events.length,
    capped: events.length >= MAX_EVENTS,
    requests: selected.length,
    rejected,
    errors,
    error_rate: selected.length > 0 ? errors / selected.length : null,
    p50_latency_ms: percentile(latencies, 0.5),
    p95_latency_ms: percentile(latencies, 0.95),
    p99_latency_ms: percentile(latencies, 0.99),
    request_bytes: requestByteValues.length > 0 ? requestByteValues.reduce((sum, value) => sum + value, 0) : null,
    response_bytes: responseByteValues.length > 0 ? responseByteValues.reduce((sum, value) => sum + value, 0) : null,
    by_operation: operations.map((operation) => {
      const operationEvents = selected.filter((event) => event.operation === operation);
      const operationLatencies = operationEvents
        .map((event) => event.durationMs)
        .sort((a, b) => a - b);
      return {
        operation,
        requests: operationEvents.length,
        errors: operationEvents.filter((event) => event.statusCode >= 500).length,
        p95_latency_ms: percentile(operationLatencies, 0.95),
      };
    }),
  };
}
