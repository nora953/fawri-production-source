import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import { enforceMetaWebhookSecurity, type MetaRawBodyRequest } from "../src/middleware/metaWebhookSecurity";

test("Meta signature guard covers every path accepted by the Express webhook route", async () => {
  const previous = process.env.META_APP_SECRET;
  process.env.META_APP_SECRET = "synthetic-path-regression-secret";
  const app = express();
  app.use(express.json({ verify(req, _res, buffer) {
    (req as MetaRawBodyRequest).rawBody = Buffer.from(buffer);
  } }));
  app.use(enforceMetaWebhookSecurity);
  app.post("/api/meta/webhook", (_req, res) => res.json({ reachedWebhook: true }));
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>(resolve => server.once("listening", resolve));
  try {
    const address = server.address();
    assert.ok(address && typeof address === "object");
    for (const pathname of ["/api/meta/webhook", "/api/meta/webhook/", "/API/META/WEBHOOK", "/Api/Meta/Webhook/?source=AbC"]) {
      const response = await fetch(`http://127.0.0.1:${address.port}${pathname}`, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ object: "page", entry: [] }),
      });
      assert.equal(response.status, 401, pathname);
      assert.equal((await response.json()).code, "META_WEBHOOK_SIGNATURE_REQUIRED");
    }
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    if (previous === undefined) delete process.env.META_APP_SECRET;
    else process.env.META_APP_SECRET = previous;
  }
});
