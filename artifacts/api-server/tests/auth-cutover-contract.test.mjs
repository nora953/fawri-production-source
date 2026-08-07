import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const apiRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function source(relativePath) {
  return readFile(path.join(apiRoot, relativePath), "utf8");
}

test("secure auth router precedes legacy business compatibility", async () => {
  const app = await source("src/app.ts");
  const secureMount = app.indexOf('app.use("/api/auth", authSecurityRouter)');
  const originGuard = app.indexOf('app.use("/api/auth", enforceAuthOrigin)');
  const bridge = app.indexOf("app.use(enforceAuthCutoverCompatibility)");
  const legacyRoot = app.indexOf('app.use("/api", router)');
  assert.ok(secureMount >= 0, "secure auth router must be mounted");
  assert.ok(originGuard > secureMount, "legacy auth business routes need origin protection");
  assert.ok(bridge > originGuard, "compatibility bridge must run after secure auth router");
  assert.ok(legacyRoot > bridge, "legacy business router must run only after v2 validation bridge");
});

test("client legacy credentials are not accepted as auth authority", async () => {
  const bridge = await source("src/middleware/authCutoverCompatibility.ts");
  assert.match(bridge, /LEGACY_ADMIN_BEARER_DISABLED/);
  assert.match(bridge, /delete req\.cookies\[LEGACY_MERCHANT_COOKIE\]/);
  assert.match(bridge, /requireSecureAdminSession/);
  assert.match(bridge, /requireSecureMerchantSession/);
  assert.match(bridge, /ROLE_SESSION_CONFUSION/);
  assert.match(bridge, /LEGACY_AUTH_ENDPOINT_DISABLED/);
  assert.match(bridge, /FAWRI_AUTH_SSE_REVALIDATE_MS/);
});

test("merchant operational authority uses the secure server session context", async () => {
  const middleware = await source("src/middleware/merchantOperationalAccess.ts");
  assert.match(middleware, /from "\.\/authSession"/);
  assert.doesNotMatch(
    middleware,
    /getMerchantIdFromSession,\s*requireMerchantSession,\s*verifyMerchantOAuthState,?\s*}\s*from "\.\.\/routes\/auth"/s,
  );
});

test("production password pepper fails closed", async () => {
  const passwordService = await source("src/services/authPasswordService.ts");
  assert.match(passwordService, /NODE_ENV === "production"/);
  assert.match(passwordService, /CONFIGURED_PASSWORD_SALT\.length < 32/);
  assert.match(passwordService, /FAWRI_PASSWORD_SALT must be explicitly configured/);
});
