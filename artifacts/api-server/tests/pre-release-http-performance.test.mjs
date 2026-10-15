import assert from "node:assert/strict";
import { once } from "node:events";
import { performance } from "node:perf_hooks";
import test from "node:test";

const CONCURRENCY = 25;
const REQUESTS = 250;
const P95_BUDGET_MS = 250;
const TOTAL_BUDGET_MS = 5_000;

function percentile(values, quantile) {
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * quantile) - 1));
  return sorted[index];
}

test("baseline HTTP stack stays responsive under bounded concurrent load", async (t) => {
  process.env.NODE_ENV = "test";
  process.env.LOG_LEVEL = "silent";
  const { default: app } = await import("../src/app.ts");
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => new Promise((resolve) => server.close(() => resolve())));

  const address = server.address();
  assert.ok(address && typeof address === "object");
  const url = `http://127.0.0.1:${address.port}/healthz`;

  // Warm the runtime so module/JIT startup does not pollute the request budget.
  for (let i = 0; i < 10; i += 1) {
    const response = await fetch(url);
    assert.equal(response.status, 200);
    await response.arrayBuffer();
  }

  const latencies = [];
  let next = 0;
  const started = performance.now();

  async function worker() {
    while (true) {
      const index = next++;
      if (index >= REQUESTS) return;
      const requestStarted = performance.now();
      const response = await fetch(url);
      await response.arrayBuffer();
      latencies.push(performance.now() - requestStarted);
      assert.equal(response.status, 200);
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));
  const elapsedMs = performance.now() - started;
  const p95Ms = percentile(latencies, 0.95);

  assert.equal(latencies.length, REQUESTS);
  assert.ok(
    p95Ms <= P95_BUDGET_MS,
    `baseline HTTP p95 ${p95Ms.toFixed(1)}ms exceeded ${P95_BUDGET_MS}ms budget`,
  );
  assert.ok(
    elapsedMs <= TOTAL_BUDGET_MS,
    `baseline HTTP batch ${elapsedMs.toFixed(1)}ms exceeded ${TOTAL_BUDGET_MS}ms budget`,
  );
});
