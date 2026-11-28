import assert from "node:assert/strict";
import { test } from "node:test";
import express from "express";
import { createPublicPrelaunchGate } from "../src/middleware/publicPrelaunchGate";

const approved = { FAWRI_PUBLIC_PRELAUNCH_ONLY: "1", FAWRI_PUBLIC_BUSINESS_OPERATOR: 'Example <operator>', FAWRI_PUBLIC_BUSINESS_PHONE: "+12025550123" };
async function withServer(env: NodeJS.ProcessEnv, run: (base: string) => Promise<void>) {
  const app = express();
  app.use(createPublicPrelaunchGate(env));
  app.use((_req, res) => { res.status(204).end(); });
  const server = app.listen(0, "127.0.0.1");
  try {
    await new Promise<void>((resolve, reject) => { server.once("listening", resolve); server.once("error", reject); });
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    await run("http://127.0.0.1:" + address.port);
  } finally {
    server.closeAllConnections();
    await new Promise<void>(resolve => { server.close(() => resolve()); });
  }
}

test("approved root is static, escaped, and contains no registration action", async () => {
  await withServer(approved, async base => {
    const response = await fetch(base + "/");
    assert.equal(response.status, 200);
    assert.match(response.headers.get("content-type") || "", /text\/html/);
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.match(response.headers.get("content-security-policy") || "", /default-src 'none'/);
    const body = await response.text();
    assert.match(body, /Example &lt;operator&gt;/);
    assert.match(body, /tel:\+12025550123/);
    assert.match(body, /registration and commercial services are not open/i);
    assert.doesNotMatch(body, /<script|<form|<operator>|href=["']\/signup/i);
    assert.equal((await fetch(base + "/", { method: "HEAD" })).status, 200);
  });
});

test("all application paths and non-read methods fail closed, probes alone pass", async () => {
  await withServer(approved, async base => {
    for (const path of ["/signup", "/login", "/admin", "/dashboard", "/api", "/api/auth/google/begin", "/api/orders", "/ops/readiness", "/assets/app.js", "/api/media/123", "/privacy", "/terms", "/%61pi", "/READYZ", "/readyz/"]) {
      assert.equal((await fetch(base + path)).status, 503, path);
    }
    for (const method of ["POST", "PUT", "PATCH", "DELETE", "OPTIONS"]) {
      for (const path of ["/", "/readyz", "/api/auth/google/complete"]) {
        assert.equal((await fetch(base + path, { method })).status, 503, method + path);
      }
    }
    for (const path of ["/healthz", "/readyz"]) {
      assert.equal((await fetch(base + path)).status, 204);
    }
  });
});

test("missing or malformed contact and unknown enabled mode never open the application", async () => {
  for (const env of [
    { FAWRI_PUBLIC_PRELAUNCH_ONLY: "1" },
    { ...approved, FAWRI_PUBLIC_BUSINESS_PHONE: 'javascript:alert(1)' },
    { ...approved, FAWRI_PUBLIC_PRELAUNCH_ONLY: "true" },
  ]) {
    await withServer(env, async base => {
      assert.equal((await fetch(base + "/")).status, 503);
      assert.equal((await fetch(base + "/api/auth")).status, 503);
    });
  }
});

test("default-off remains transparent to the existing application", async () => {
  for (const env of [{}, { FAWRI_PUBLIC_PRELAUNCH_ONLY: "0" }]) {
    await withServer(env, async base => {
      assert.equal((await fetch(base + "/api/auth")).status, 204);
    });
  }
});
