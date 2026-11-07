import assert from "node:assert/strict";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import { gzipSync } from "node:zlib";
import test from "node:test";
import express, { type ErrorRequestHandler } from "express";

// Loopback-only compatibility/regression proof for the Express-resolved parser.
// No application startup, credentials, database or external provider is involved.
test("HTTP parser preserves compressed JSON verification and recovers after malformed input", { timeout: 10000 }, async (t) => {
  const app = express();
  let verified: Buffer | undefined;
  app.use(express.json({ verify(_req, _res, body) { verified = Buffer.from(body); } }));
  app.use(express.urlencoded({ extended: true }));
  app.post("/body", (req, res) => res.json(req.body));
  app.get("/health", (_req, res) => res.json({ ok: true }));
  const errors: ErrorRequestHandler = (error, _req, res, _next) => {
    res.status(Number(error.status) || 500).json({ rejected: true });
  };
  app.use(errors);
  const server = app.listen(0, "127.0.0.1");
  t.after(() => { server.closeAllConnections(); server.close(); });
  await once(server, "listening");
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const post = (body: Buffer | string, type: string, encoding?: string) => fetch(`${base}/body`, {
    method: "POST", headers: { "Content-Type": type, ...(encoding ? { "Content-Encoding": encoding } : {}) },
    body, signal: AbortSignal.timeout(2000),
  });
  const json = JSON.stringify({ operation: "synthetic", quantity: 1, label: "فوري" });
  const compressed = await post(gzipSync(json), "application/json", "gzip");
  assert.equal(compressed.status, 200);
  assert.deepEqual(await compressed.json(), JSON.parse(json));
  assert.equal(verified?.toString("utf8"), json, "raw-body verification must retain decoded bytes");
  const malformed = await post(Buffer.from("invalid-compressed-fixture"), "application/json", "gzip");
  assert.equal(malformed.status, 400);
  await malformed.arrayBuffer();
  const charset = await post(gzipSync(json), "application/json; charset=unknown-fixture", "gzip");
  assert.equal(charset.status, 415);
  await charset.arrayBuffer();
  const form = await post("item[quantity]=1&item[label]=synthetic", "application/x-www-form-urlencoded");
  assert.equal(form.status, 200);
  assert.deepEqual(await form.json(), { item: { quantity: "1", label: "synthetic" } });
  const plain = await post(json, "application/json");
  assert.equal(plain.status, 200);
  assert.deepEqual(await plain.json(), JSON.parse(json));
  const health = await fetch(`${base}/health`, { signal: AbortSignal.timeout(2000) });
  assert.equal(health.status, 200);
  assert.deepEqual(await health.json(), { ok: true });
});
