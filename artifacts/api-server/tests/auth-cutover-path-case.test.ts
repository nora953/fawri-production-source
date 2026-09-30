import assert from "node:assert/strict";
import test from "node:test";
import express from "express";

process.env.NODE_ENV = "test";
process.env.FAWRI_OPERATIONAL_POSTGRES_AUTHORITY = "required";
process.env.FAWRI_AUTH_SECURITY_SECRET = "synthetic-cutover-path-test-secret-not-for-production";

const { enforceAuthCutoverCompatibility } = await import("../src/middleware/authCutoverCompatibility");
const { enforceLegacyAuthProductionCutoverGate } = await import("../src/middleware/legacyProductionFallbackGuard");

test("cutover guards match Express case-insensitive routes without rewriting resource IDs", async (t) => {
  for (const guard of [enforceAuthCutoverCompatibility, enforceLegacyAuthProductionCutoverGate]) {
    await t.test(guard.name, async () => {
      const app = express();
      app.use(guard);
      app.post("/api/auth/admin/session/logout", (_req, res) => res.json({ reachedRetiredRoute: true }));
      app.get("/api/catalog/:id", (req, res) => res.json({ id: req.params.id, url: req.originalUrl }));
      const server = app.listen(0, "127.0.0.1");
      await new Promise<void>((resolve) => server.once("listening", resolve));
      try {
        const address = server.address();
        assert.ok(address && typeof address === "object");
        const base = `http://127.0.0.1:${address.port}`;
        for (const path of [
          "/api/auth/admin/session/logout",
          "/API/auth/admin/session/logout",
          "/Api/AuTh/AdMiN/SeSsIoN/LoGoUt/",
          "/API/AUTH/admin/session/logout?returnTo=AbC",
        ]) {
          for (const bearer of [false, true]) {
            const response = await fetch(base + path, {
              method: "POST",
              headers: bearer ? { authorization: "Bearer synthetic-invalid-token" } : {},
            });
            const body = await response.json();
            const bridge = guard === enforceAuthCutoverCompatibility;
            assert.equal(response.status, bridge && bearer ? 401 : 410, path);
            assert.equal(body.code, bridge
              ? bearer ? "LEGACY_ADMIN_BEARER_DISABLED" : "LEGACY_AUTH_ENDPOINT_DISABLED"
              : "LEGACY_AUTH_ROUTE_RETIRED", path);
            assert.equal(body.reachedRetiredRoute, undefined);
          }
        }
        const response = await fetch(base + "/api/catalog/AbC123?cursor=XyZ");
        assert.equal(response.status, 200);
        assert.deepEqual(await response.json(), { id: "AbC123", url: "/api/catalog/AbC123?cursor=XyZ" });
      } finally {
        server.closeAllConnections();
        await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
      }
    });
  }
});
