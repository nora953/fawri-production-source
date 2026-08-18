import assert from "node:assert/strict";
import test from "node:test";

import {
  getAiUsageTelemetrySnapshot,
  recordAiUsageTelemetry,
  resetAiUsageTelemetryForTests,
  type AiUsageTelemetrySnapshot,
} from "../src/observability/aiUsageTelemetry";
import {
  EARLY_WARNING_THRESHOLDS,
  evaluateRuntimeEarlyWarnings,
  mergeEarlyWarningHealth,
} from "../src/observability/earlyWarningEvaluation";
import type { HttpTelemetrySnapshot } from "../src/observability/requestTelemetry";
import { ConstrainedOpenAiProvider } from "../src/services/ai/constrainedOpenAiProvider";

function healthyHttp(): HttpTelemetrySnapshot {
  return {
    coverage: "current_process",
    process_started_at: "2026-08-18T00:00:00.000Z",
    retained_events: 10,
    capped: false,
    requests: 10,
    rejected: 0,
    errors: 0,
    error_rate: 0,
    p50_latency_ms: 20,
    p95_latency_ms: 50,
    p99_latency_ms: 60,
    request_bytes: 100,
    response_bytes: 200,
    by_operation: [],
  };
}

function healthyAi(): AiUsageTelemetrySnapshot {
  return {
    coverage: "current_process",
    process_started_at: "2026-08-18T00:00:00.000Z",
    retained_events: 0,
    capped: false,
    calls: 0,
    successful_calls: 0,
    failed_calls: 0,
    timeouts: 0,
    token_reported_calls: 0,
    input_tokens: 0,
    output_tokens: 0,
    total_tokens: 0,
    average_latency_ms: null,
    error_rate: null,
    providers: [],
    merchants: [],
  };
}

test("AI telemetry counts attempts, failures, tokens, and merchant rollups without payload text", () => {
  resetAiUsageTelemetryForTests();
  recordAiUsageTelemetry({
    merchantId: "merchant-test-a",
    providerId: "provider_test",
    model: "model_test",
    latencyMs: 120,
    outcome: "success",
    usage: { inputTokens: 30, outputTokens: 10, totalTokens: 40 },
  });
  recordAiUsageTelemetry({
    merchantId: "merchant-test-a",
    providerId: "provider_test",
    model: "model_test",
    latencyMs: 250,
    outcome: "provider_error",
  });

  const snapshot = getAiUsageTelemetrySnapshot("1h");
  assert.equal(snapshot.calls, 2);
  assert.equal(snapshot.successful_calls, 1);
  assert.equal(snapshot.failed_calls, 1);
  assert.equal(snapshot.token_reported_calls, 1);
  assert.equal(snapshot.total_tokens, 40);
  assert.equal(snapshot.merchants[0]?.merchant_id, "merchant-test-a");
  assert.equal(snapshot.merchants[0]?.failed_calls, 1);
  assert.equal(JSON.stringify(snapshot).includes("customer_text"), false);
});

test("runtime evaluator raises deterministic HTTP and AI warnings only after minimum sample sizes", () => {
  const http = healthyHttp();
  http.requests = EARLY_WARNING_THRESHOLDS.httpMinimumRequests;
  http.errors = Math.ceil(http.requests * EARLY_WARNING_THRESHOLDS.httpCriticalErrorRate);
  http.error_rate = http.errors / http.requests;
  http.p95_latency_ms = EARLY_WARNING_THRESHOLDS.httpCriticalP95Ms;

  const ai = healthyAi();
  ai.calls = EARLY_WARNING_THRESHOLDS.aiMinimumCalls;
  ai.successful_calls = 1;
  ai.failed_calls = ai.calls - 1;
  ai.error_rate = ai.failed_calls / ai.calls;
  ai.average_latency_ms = EARLY_WARNING_THRESHOLDS.aiCriticalAverageLatencyMs;
  ai.timeouts = 1;

  const result = evaluateRuntimeEarlyWarnings({ http, ai });
  assert.equal(result.health, "critical");
  assert.ok(result.incidents.some((incident) => incident.code === "HTTP_5XX_RATE_HIGH"));
  assert.ok(result.incidents.some((incident) => incident.code === "HTTP_P95_LATENCY_HIGH"));
  assert.ok(result.incidents.some((incident) => incident.code === "AI_PROVIDER_ERROR_RATE_HIGH"));
  assert.ok(result.incidents.some((incident) => incident.code === "AI_PROVIDER_LATENCY_HIGH"));
  assert.ok(result.incidents.some((incident) => incident.code === "AI_PROVIDER_TIMEOUTS"));
});

test("runtime evaluator remains healthy for low-volume isolated failures", () => {
  const http = healthyHttp();
  http.requests = 1;
  http.errors = 1;
  http.error_rate = 1;

  const result = evaluateRuntimeEarlyWarnings({ http, ai: healthyAi() });
  assert.equal(result.health, "healthy");
  assert.equal(result.incidents.length, 0);
  assert.equal(mergeEarlyWarningHealth("warning", result.health), "warning");
});

test("constrained provider records provider token usage from a successful response", async () => {
  resetAiUsageTelemetryForTests();
  const fetchImpl = (async () =>
    new Response(
      JSON.stringify({
        output_text: JSON.stringify({
          can_answer: true,
          answer: "Safe bounded answer",
          language: "en",
          confidence: 0.9,
          risk: "low",
          reason: "test",
        }),
        usage: {
          input_tokens: 21,
          output_tokens: 7,
          total_tokens: 28,
        },
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    )) as typeof fetch;

  const provider = new ConstrainedOpenAiProvider({
    apiKey: "test-key",
    model: "test-model",
    fetchImpl,
  });
  const result = await provider.generate({
    merchantId: "merchant-test-b",
    language: "en",
    systemRules: ["Stay within approved knowledge."],
    merchantPolicy: { businessName: "Test Store" },
    approvedKnowledge: [],
    customerText: "test question",
    injectionSignals: [],
  });

  assert.equal(result?.usage?.totalTokens, 28);
  const telemetry = getAiUsageTelemetrySnapshot("1h");
  assert.equal(telemetry.calls, 1);
  assert.equal(telemetry.successful_calls, 1);
  assert.equal(telemetry.total_tokens, 28);
});

test("constrained provider records non-2xx provider failures without inventing token usage", async () => {
  resetAiUsageTelemetryForTests();
  const fetchImpl = (async () => new Response("", { status: 503 })) as typeof fetch;
  const provider = new ConstrainedOpenAiProvider({
    apiKey: "test-key",
    model: "test-model",
    fetchImpl,
  });

  const result = await provider.generate({
    merchantId: "merchant-test-c",
    language: "en",
    systemRules: ["Stay within approved knowledge."],
    merchantPolicy: {},
    approvedKnowledge: [],
    customerText: "test question",
    injectionSignals: [],
  });

  assert.equal(result, null);
  const telemetry = getAiUsageTelemetrySnapshot("1h");
  assert.equal(telemetry.calls, 1);
  assert.equal(telemetry.failed_calls, 1);
  assert.equal(telemetry.token_reported_calls, 0);
  assert.equal(telemetry.total_tokens, 0);
});
