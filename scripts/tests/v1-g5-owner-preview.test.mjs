import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { request } from "node:http";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { createOwnerPreview } from "../run-fawri-owner-preview.mjs";

test("owner preview keeps the built V1 and synthetic APIs behind the isolated origin gate", async () => {
  const token = randomBytes(32).toString("hex");
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const authorization = `Basic ${Buffer.from(`owner:${token}`).toString("base64")}`;
  let now = 0;
  const expiresAt = 30_000;
  const dist = fileURLToPath(new URL("../../artifacts/fawri/dist/public/", import.meta.url));
  const server = await createOwnerPreview({ dist, tokenHash, expiresAt, now: () => now });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const { port } = server.address();
  function get(path, { headers = { authorization }, method = "GET" } = {}) {
    return new Promise((resolve, reject) => {
      const req = request({ host: "127.0.0.1", port, path, headers, method }, res => {
        res.setEncoding("utf8");
        let body = "";
        res.on("data", chunk => { body += chunk; });
        res.on("end", () => resolve({ status: res.statusCode, headers: res.headers, body }));
        res.on("error", reject);
      });
      req.on("error", reject);
      req.end();
    });
  }

  try {
    assert.equal((await get("/dashboard", { headers: {} })).status, 401);
    assert.equal((await get("/dashboard", { headers: { authorization, host: "fawrireply.com" } })).status, 404);
    assert.equal((await get("/dashboard", { headers: { authorization, host: "fixture.onrender.com" } })).status, 404);
    const page = await get("/dashboard");
    assert.equal(page.status, 200);
    assert.equal(page.headers["cache-control"], "private, no-store");
    assert.match(page.headers["content-security-policy"], /connect-src 'self'; worker-src 'none'/);
    const assetPath = page.body.match(/<script\b[^>]*\bsrc="(\/assets\/[\w.-]+\.js)"/)?.[1];
    assert.ok(assetPath);
    assert.equal((await get(assetPath, { headers: {} })).status, 401);
    assert.equal((await get(assetPath)).headers["content-type"], "application/javascript");
    assert.equal((await get("/api/auth/me", { headers: {} })).status, 401);
    assert.equal(JSON.parse((await get("/api/auth/me")).body).merchant.id, "fawri-preview-merchant");
    assert.equal(JSON.parse((await get("/api/auth/lifecycle")).body).lifecycle.merchant_id, "fawri-preview-merchant");
    assert.equal((await get("/api/orders", { method: "POST" })).status, 405);
    for (const path of ["/signup", "/api/auth/signup", "/api/auth/sessions", "/api/cashier/subscription",
      "/cashier.html", "/cashier-sw.js", "/dashboard/cashiers", "/assets/%2e%2e/index.html"]) {
      assert.equal((await get(path)).status, 404, path);
    }
    now = expiresAt;
    assert.equal((await get("/dashboard")).status, 404);
    assert.equal((await get(assetPath)).status, 404);
    assert.equal((await get("/api/auth/me")).status, 404);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});
