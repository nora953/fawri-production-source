import assert from "node:assert/strict";
import test from "node:test";
import { createHealthSnapshot } from "../src/observability/health";
import { FAWRI_METRICS, MetricsRegistry } from "../src/observability/metrics";
import { createReadinessSnapshot } from "../src/observability/readiness";

test("health snapshot exposes only bounded service metadata", () => {
  const snapshot = createHealthSnapshot({
    service: "fawri-api",
    version: "test-sha",
    now: () => new Date("2026-08-07T00:00:00.000Z"),
    uptimeSeconds: () => 12.9,
  });

  assert.deepEqual(snapshot, {
    status: "ok",
    service: "fawri-api",
    version: "test-sha",
    timestamp: "2026-08-07T00:00:00.000Z",
    uptime_seconds: 12,
  });
});

test("readiness reports dependency failures without exposing thrown messages", async () => {
  const snapshot = await createReadinessSnapshot(
    [
      { name: "database", check: () => undefined },
      {
        name: "object_storage",
        check: () => {
          throw new Error("secret endpoint and customer payload");
        },
      },
    ],
    () => new Date("2026-08-07T00:00:00.000Z"),
  );

  assert.equal(snapshot.status, "not_ready");
  assert.equal(snapshot.checks[1]?.error_code, "dependency_unavailable");
  assert.equal(JSON.stringify(snapshot).includes("secret endpoint"), false);
});

test("readiness timeouts fail closed", async () => {
  const snapshot = await createReadinessSnapshot([
    {
      name: "queue",
      timeoutMs: 5,
      check: () => new Promise((resolve) => setTimeout(resolve, 50)),
    },
  ]);
  assert.equal(snapshot.status, "not_ready");
  assert.equal(snapshot.checks[0]?.error_code, "timeout");
});

test("metrics reject high-cardinality or PII labels", () => {
  const registry = new MetricsRegistry();
  assert.throws(
    () => registry.increment(FAWRI_METRICS.queueDepth, { merchant_id: "merchant-123" }),
    /not allowed/,
  );
  assert.throws(
    () => registry.increment(FAWRI_METRICS.loginFailuresTotal, { operation: "user@example.com" }),
    /Unsafe metric label value/,
  );
});

test("metrics render deterministic Prometheus text", () => {
  const registry = new MetricsRegistry();
  registry.setGauge(FAWRI_METRICS.queueDepth, 7, { queue: "meta_inbound" });
  registry.increment(FAWRI_METRICS.webhookSignatureFailuresTotal, {
    channel: "meta",
    reason_code: "invalid_signature",
  });

  assert.equal(
    registry.toPrometheusText(),
    [
      'fawri_queue_depth{queue="meta_inbound"} 7',
      'fawri_webhook_signature_failures_total{channel="meta",reason_code="invalid_signature"} 1',
      "",
    ].join("\n"),
  );
});
