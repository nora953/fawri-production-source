import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const apiRoot = path.resolve(testDirectory, "..");

async function source(relativePath) {
  return readFile(path.join(apiRoot, relativePath), "utf8");
}

test("operational middleware uses PostgreSQL-aware merchant authority for protected APIs and OAuth callback", async () => {
  const middleware = await source("src/middleware/merchantOperationalAccess.ts");

  assert.match(
    middleware,
    /getMerchantOperationalDecisionAuthoritative/,
    "middleware must import the authoritative merchant operational decision",
  );
  assert.doesNotMatch(
    middleware,
    /\bgetMerchantOperationalDecision\s*\(/,
    "middleware must not call the legacy merchants.json decision directly",
  );

  const authoritativeCalls = middleware.match(
    /getMerchantOperationalDecisionAuthoritative\s*\(/g,
  );
  assert.equal(
    authoritativeCalls?.length,
    2,
    "protected API gate and OAuth callback gate must both use authoritative access",
  );
  assert.match(
    middleware,
    /\.catch\(next\)/,
    "async authority failures must flow through Express error handling",
  );
});

test("authoritative merchant access switches to PostgreSQL when operational authority is required", async () => {
  const service = await source("src/services/merchantOperationalAccess.ts");

  assert.match(service, /operationalPostgresAuthorityRequired\s*\(\)/);
  assert.match(service, /findMerchantByIdAuthoritative\s*\(/);
  assert.match(
    service,
    /if\s*\(!operationalPostgresAuthorityRequired\(\)\)\s*\{\s*return getMerchantOperationalDecision\(merchantId\);/s,
  );
  assert.match(service, /MERCHANT_ACCESS_STATE_UNAVAILABLE/);
});

test("merchant notification endpoints are intercepted by PostgreSQL authority before legacy auth fallback", async () => {
  const route = await source("src/routes/merchant-notifications-pg.ts");
  const authSecurity = await source("src/routes/auth-security.ts");
  const app = await source("src/app.ts");
  const legacyGuard = await source("src/middleware/legacyProductionFallbackGuard.ts");

  assert.match(route, /operationalPostgresAuthorityRequired\(\)/);
  assert.match(route, /requireSecureMerchantSession/);
  assert.match(route, /listMerchantNotificationsPostgresCanonical/);
  assert.match(route, /markMerchantNotificationReadPostgresCanonical/);
  assert.match(route, /router\.get\(\s*"\/notifications"/s);
  assert.match(route, /router\.patch\(\s*"\/notifications\/:id\/read"/s);
  assert.doesNotMatch(route, /ensureDb|merchant_notifications|merchants\.json|\.\/auth"/);

  assert.match(authSecurity, /import merchantNotificationsPgRouter from "\.\/merchant-notifications-pg"/);
  assert.match(authSecurity, /router\.use\(merchantNotificationsPgRouter as any\)/);

  const secureMount = app.indexOf('app.use("/api/auth", authSecurityRouter)');
  const legacyCutoverGate = app.lastIndexOf("app.use(enforceLegacyAuthProductionCutoverGate)");
  assert.ok(secureMount >= 0, "secure auth router must be mounted");
  assert.ok(
    legacyCutoverGate > secureMount,
    "PostgreSQL notification routes must run before unresolved legacy auth routes are retired",
  );
  assert.match(legacyGuard, /operationalPostgresAuthorityRequired\(\)/);
  assert.match(legacyGuard, /LEGACY_AUTH_ROUTE_RETIRED/);
});
