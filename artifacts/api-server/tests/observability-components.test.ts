import assert from "node:assert/strict";
import { once } from "node:events";
import test from "node:test";
import express from "express";
import { DEFAULT_ALERT_RULES, assertSafeAlertRules } from "../src/observability/alerts";
import { createHealthSnapshot } from "../src/observability/health";
import { FAWRI_METRICS, MetricsRegistry } from "../src/observability/metrics";
import { createReadinessSnapshot } from "../src/observability/readiness";
import { createObservabilityRouter } from "../src/observability/router";

const fixedNow = () => new Date("2026-08-08T00:00:00.000Z");

test("health snapshot exposes only bounded service metadata", () => {
  const snapshot = createHealthSnapshot({
    service: "fawri-api",
    version: "test-sha",
    now: fixedNow,
    uptimeSeconds: () => 12.9,
  });

  assert.deepEqual(snapshot, {
    status: "ok",
    service: "fawri-api",
    version: "test-sha",
    timestamp: "2026-08-08T00:00:00.000Z",
    uptime_seconds: 12,
  });
});

test("health fails closed instead of echoing unsafe metadata", () => {
  const snapshot = createHealthSnapshot({
    service: "customer@example.com",
    version: "postgresql://user:secret@db/prod",
    now: fixedNow,
    uptimeSeconds: () => 1,
  });

  assert.deepEqual(snapshot, {
    status: "unhealthy",
    timestamp: "2026-08-08T00:00:00.000Z",
  });
  assert.equal(JSON.stringify(snapshot).includes("customer@example.com"), false);
  assert.equal(JSON.stringify(snapshot).includes("secret"), false);
});

test("readiness reports dependency failures without exposing thrown messages", async () => {
  const snapshot = await createReadinessSnapshot(
    [
      { name: "database", check: () => undefined },
      {
        name: "object_storage",
        check: () => {
          throw new Error("Bearer fake-secret customer payload");
        },
      },
    ],
    fixedNow,
  );

  assert.equal(snapshot.status, "not_ready");
  assert.equal(snapshot.checks[1]?.error_code, "dependency_unavailable");
  assert.equal(JSON.stringify(snapshot).includes("fake-secret"), false);
  assert.equal(JSON.stringify(snapshot).includes("customer payload"), false);
});

test("readiness with no configured dependencies fails closed", async () => {
  const snapshot = await createReadinessSnapshot([], fixedNow);
  assert.equal(snapshot.status, "not_ready");
  assert.deepEqual(snapshot.checks, [
    {
      name: "readiness_configuration",
      status: "down",
      duration_ms: 0,
      error_code: "configuration_invalid",
    },
  ]);
});

test("readiness invalid or duplicate names fail closed without echoing them", async () => {
  const snapshot = await createReadinessSnapshot(
    [
      { name: "database", check: () => undefined },
      { name: "database", check: () => undefined },
    ],
    fixedNow,
  );
  assert.equal(snapshot.status, "not_ready");
  assert.equal(snapshot.checks[0]?.name, "readiness_configuration");
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

test("metrics reject unregistered names, PII, secrets, and high-cardinality identifiers", () => {
  const registry = new MetricsRegistry();
  assert.throws(() => registry.increment("fawri_dynamic_customer_123"), /not registered/);
  assert.throws(
    () => registry.increment(FAWRI_METRICS.queueDepth, { merchant_id: "merchant_123" }),
    /not allowed/,
  );
  assert.throws(
    () => registry.increment(FAWRI_METRICS.loginFailuresTotal, { operation: "user@example.com" }),
    /Unsafe metric label value/,
  );
  assert.throws(
    () => registry.increment(FAWRI_METRICS.loginFailuresTotal, { operation: "123456789012" }),
    /Unsafe metric label value/,
  );
  assert.throws(
    () => registry.increment(FAWRI_METRICS.httpErrorsTotal, { channel: "tenant_a" }),
    /Unknown channel/,
  );
});

test("metrics render deterministic Prometheus text using bounded internal labels", () => {
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

test("default alert rules are static, validated, and contain no dynamic payload fields", () => {
  assert.doesNotThrow(() => assertSafeAlertRules(DEFAULT_ALERT_RULES));
  const serialized = JSON.stringify(DEFAULT_ALERT_RULES);
  assert.equal(serialized.includes("customer"), false);
  assert.equal(serialized.includes("secret"), false);
  assert.equal(serialized.includes("token"), false);
  assert.equal(serialized.includes("http://"), false);
  assert.equal(serialized.includes("https://"), false);
});

test("router denies metrics by default and returns generic fail-closed probe responses", async (t) => {
  const metrics = new MetricsRegistry();
  metrics.setGauge(FAWRI_METRICS.queueDepth, 1, { queue: "meta_inbound" });

  const app = express();
  app.use(
    createObservabilityRouter({
      service: "unsafe service name",
      version: "safe-version",
      now: fixedNow,
      uptimeSeconds: () => 1,
      readinessChecks: [],
      metrics,
    }),
  );

  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => new Promise<void>((resolve) => server.close(() => resolve())));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const base = `http://127.0.0.1:${address.port}`;

  const health = await fetch(`${base}/health`);
  assert.equal(health.status, 503);
  assert.deepEqual(await health.json(), {
    status: "unhealthy",
    timestamp: "2026-08-08T00:00:00.000Z",
  });

  const readiness = await fetch(`${base}/readiness`);
  assert.equal(readiness.status, 503);
  assert.equal((await readiness.json()).status, "not_ready");

  const deniedMetrics = await fetch(`${base}/metrics`);
  assert.equal(deniedMetrics.status, 503);
  assert.equal(await deniedMetrics.text(), "");
});

test("router serves metrics only when an explicit access predicate allows it", async (t) => {
  const metrics = new MetricsRegistry();
  metrics.setGauge(FAWRI_METRICS.queueDepth, 2, { queue: "meta_inbound" });
  const app = express();
  app.use(
    createObservabilityRouter({
      service: "fawri-api",
      version: "test-sha",
      now: fixedNow,
      uptimeSeconds: () => 1,
      readinessChecks: [{ name: "database", check: () => undefined }],
      metrics,
      allowMetrics: (request) => request.headers["x-observability-probe"] === "allowed",
    }),
  );

  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => new Promise<void>((resolve) => server.close(() => resolve())));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const response = await fetch(`http://127.0.0.1:${address.port}/metrics`, {
    headers: { "x-observability-probe": "allowed" },
  });
  assert.equal(response.status, 200);
  assert.match(await response.text(), /fawri_queue_depth/);
});
