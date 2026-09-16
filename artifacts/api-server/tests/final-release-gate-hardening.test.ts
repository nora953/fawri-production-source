import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const current = path.dirname(fileURLToPath(import.meta.url));

function source(relativePath: string): string {
  return fs.readFileSync(path.resolve(current, relativePath), "utf8");
}

test("final production boundary retires unresolved legacy auth before shared router", () => {
  const app = source("../src/app.ts");
  const guard = source("../src/middleware/legacyProductionFallbackGuard.ts");

  const authV2 = app.indexOf('app.use("/api/auth", authSecurityRouter)');
  const compatibility = app.indexOf("app.use(enforceAuthCutoverCompatibility)");
  const finalGate = app.lastIndexOf("app.use(enforceLegacyAuthProductionCutoverGate)");
  const sharedLegacy = app.indexOf('app.use("/api", router)');

  assert.ok(authV2 >= 0 && compatibility > authV2);
  assert.ok(finalGate > compatibility && finalGate < sharedLegacy);
  assert.match(guard, /operationalPostgresAuthorityRequired\(\)/);
  assert.match(guard, /req\.originalUrl \|\| req\.path/);
  assert.match(guard, /LEGACY_AUTH_ROUTE_RETIRED/);
});

test("Support legacy routers are explicitly gated after PostgreSQL interceptors", () => {
  const app = source("../src/app.ts");
  const authSecurity = source("../src/routes/auth-security.ts");

  assert.ok(
    app.indexOf('app.use("/api/auth", authSecurityRouter)') <
      app.indexOf('"/api/auth/support-images"'),
  );
  assert.match(
    app,
    /"\/api\/auth\/support-images",\s*enforceLegacyAuthProductionCutoverGate,\s*supportImagesRouter/,
  );
  assert.match(
    app,
    /"\/api\/auth\/admin\/support-preview",\s*enforceLegacyAuthProductionCutoverGate,\s*supportPreviewRouter/,
  );
  assert.ok(
    authSecurity.indexOf("router.use(supportPostgresRoutes as any)") <
      authSecurity.indexOf("router.use(publicRoutes as any)"),
  );
});

test("Emergency read access is Auth v2 and PostgreSQL authoritative before gated legacy routes", () => {
  const app = source("../src/app.ts");
  const authSecurity = source("../src/routes/auth-security.ts");
  const router = source("../src/routes/auth-emergency-postgres-routes.ts");
  const authority = source("../src/services/postgresEmergencyReadAccessAuthority.ts");
  const snapshot = source("../src/services/postgresEmergencySnapshot.ts");

  const emergency = authSecurity.indexOf("router.use(emergencyPostgresRoutes as any)");
  const publicLegacy = authSecurity.indexOf("router.use(publicRoutes as any)");
  const adminLegacy = authSecurity.indexOf("router.use(adminRoutes as any)");
  assert.ok(emergency >= 0 && emergency < publicLegacy && emergency < adminLegacy);

  assert.match(
    app,
    /"\/api\/auth\/admin\/emergency-read-access",\s*enforceLegacyAuthProductionCutoverGate,\s*emergencyReadDirectoryRouter/,
  );
  assert.match(
    app,
    /"\/api\/auth\/emergency-read-access",\s*enforceLegacyAuthProductionCutoverGate,\s*emergencyMerchantNoticesRouter/,
  );

  for (const code of [router, authority, snapshot]) {
    assert.equal(code.includes("readEmergencyAccessDb"), false);
    assert.equal(code.includes("supportPreviewSessions"), false);
    assert.equal(code.includes("ensureDb("), false);
    assert.equal(code.includes("readJson("), false);
    assert.equal(code.includes("writeJson("), false);
    assert.equal(code.includes("getBearerToken"), false);
  }

  assert.match(router, /requireSecureAdminSession/);
  assert.match(router, /requireSecureMerchantSession/);
  assert.match(authority, /emergency_authorizations/);
  assert.match(authority, /emergency_access_requests/);
  assert.match(authority, /emergency_owner_alerts/);
  assert.match(authority, /emergency_merchant_notices/);
  assert.match(authority, /audit_events/);
  assert.match(authority, /previous_hash/);
  assert.match(authority, /event_hash/);
});

test("Emergency PostgreSQL snapshot allowlists channels and excludes credential secrets", () => {
  const snapshot = source("../src/services/postgresEmergencySnapshot.ts");
  assert.match(snapshot, /FROM merchant_channels/);
  assert.equal(snapshot.includes("credential_ciphertext"), false);
  assert.equal(snapshot.includes("credential_nonce"), false);
  assert.equal(snapshot.includes("credential_auth_tag"), false);
  assert.equal(snapshot.includes("credential_key_id"), false);
  assert.equal(snapshot.includes("password_hash"), false);
});

test("server-derived compatibility credentials are issued only after Auth v2 validation", () => {
  const compatibility = source("../src/middleware/authCutoverCompatibility.ts");
  assert.match(
    compatibility,
    /function injectMerchantCompatibility[\s\S]*requireSecureMerchantSession\(req, res,[\s\S]*internalMerchantCredential\(merchantId\)/,
  );
  assert.match(
    compatibility,
    /function injectAdminCompatibility[\s\S]*requireSecureAdminSession\(req, res,[\s\S]*internalAdminCredential\(/,
  );
  assert.match(compatibility, /clearLegacyMerchantCookie\(req, res\)/);
  assert.match(compatibility, /LEGACY_ADMIN_BEARER_DISABLED/);
});

test("legacy runtime JSON persistence is disabled when PostgreSQL authority is required", () => {
  const runtime = source("../src/routes/indexModulePart1.ts");
  assert.match(
    runtime,
    /export function loadRuntimeDb\(\) \{\s*if \(operationalPostgresAuthorityRequired\(\)\) return;/,
  );
  assert.match(
    runtime,
    /export function saveRuntimeDb\(\) \{\s*if \(operationalPostgresAuthorityRequired\(\)\) return;/,
  );
});

test("legacy Support lifecycle timers are stopped in PostgreSQL required mode", () => {
  const runtime = source("../src/services/postgresSupportRuntimeCutover.ts");
  assert.match(runtime, /clearInterval\(supportLifecycleTimer\)/);
  assert.match(runtime, /clearInterval\(subscriptionLifecycleTimer\)/);
  assert.match(runtime, /refreshSupportLifecyclePostgresCanonical/);
});

test("launch readiness exposes all known external blockers instead of claiming launch-ready", () => {
  const readiness = source("../src/services/productionReleaseReadiness.ts");
  for (const code of [
    "SAAS_BILLING_PRODUCTION_PROVIDER_UNAVAILABLE",
    "PRODUCTION_BACKUP_RESTORE_EXTERNAL_PROOF_REQUIRED",
    "SUPPORT_IMAGE_DURABLE_STORAGE_EXTERNAL_PROOF_REQUIRED",
  ]) {
    assert.match(readiness, new RegExp(code));
  }
  assert.match(readiness, /area:[\s\S]*"storage"/);
});
