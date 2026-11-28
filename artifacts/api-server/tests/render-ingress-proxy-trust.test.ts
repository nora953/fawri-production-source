import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import { configureRenderIngressProxyTrust } from "../src/services/renderIngressProxyTrust";

test("Render web ingress trusts exactly one hop, not an attacker-controlled entire proxy chain", async t => {
  const app = express();
  configureRenderIngressProxyTrust(app, {
    RENDER_SERVICE_TYPE: "web",
    RENDER_SERVICE_ID: "srv-dbv0kvm8bjmc73av6fm0",
  } as NodeJS.ProcessEnv);
  assert.equal(app.get("trust proxy"), 1);
  app.get("/ip", (req, res) => res.json({ ip: req.ip }));

  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>(resolve => server.once("listening", resolve));
  t.after(() => new Promise<void>((resolve, reject) =>
    server.close(error => error ? reject(error) : resolve())));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const response = await fetch(`http://127.0.0.1:${address.port}/ip`, {
    headers: {
      // Leftmost value could be user-supplied; rightmost is appended by the
      // trusted immediate Render ingress in the actual hosted arrangement.
      "X-Forwarded-For": "198.51.100.7, 203.0.113.19",
    },
  });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ip: "203.0.113.19" });
});

test("non-Render, non-web, or malformed service IDs do not grant proxy trust", () => {
  for (const env of [
    {},
    { RENDER_SERVICE_TYPE: "worker", RENDER_SERVICE_ID: "srv-dbv0kvm8bjmc73av6fm0" },
    { RENDER_SERVICE_TYPE: "web", RENDER_SERVICE_ID: "untrusted" },
    { RENDER_SERVICE_TYPE: "web", RENDER_SERVICE_ID: "srv-" },
  ]) {
    const app = express();
    configureRenderIngressProxyTrust(app, env as NodeJS.ProcessEnv);
    assert.equal(app.get("trust proxy"), false);
  }
});
