import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const current = path.dirname(fileURLToPath(import.meta.url));

function source(relativePath: string): string {
  return fs.readFileSync(path.resolve(current, relativePath), "utf8");
}

test("merchant management PostgreSQL router remains ahead of legacy auth routes", () => {
  const authSecurity = source("../src/routes/auth-security.ts");
  const pgRouter = authSecurity.indexOf(
    "router.use(merchantManagementPostgresRoutes as any)",
  );
  const publicLegacy = authSecurity.indexOf("router.use(publicRoutes as any)");
  const adminLegacy = authSecurity.indexOf("router.use(adminRoutes as any)");

  assert.ok(pgRouter >= 0, "merchant management PostgreSQL router must be mounted");
  assert.ok(pgRouter < publicLegacy, "merchant management PostgreSQL router must precede public legacy routes");
  assert.ok(pgRouter < adminLegacy, "merchant management PostgreSQL router must precede admin legacy routes");
});

test("merchant management router covers all legacy management surfaces and fails closed", () => {
  const router = source("../src/routes/auth-merchant-management-postgres-routes.ts");

  for (const fragment of [
    '"/merchants"',
    '"/merchants/:id/status"',
    '"/merchants/:id/note"',
    '"/merchants/:id/deletion-requests"',
    '"/merchants/:id/delete"',
    '"/admin/deletion-requests"',
    '"/admin/local-data-migration"',
    '"/admin/logs"',
    '"/admin/channels"',
  ]) {
    assert.ok(router.includes(fragment), `missing PostgreSQL route ${fragment}`);
  }

  assert.match(router, /adminAuthPostgresCutoverMode\(\)/);
  assert.match(router, /mode === "incomplete"/);
  assert.match(router, /AUTH_POSTGRES_CUTOVER_INCOMPLETE/);
  assert.equal(router.includes("ensureDb("), false);
  assert.equal(router.includes("writeDb("), false);
  assert.equal(router.includes("authAccountRepository"), false);
  assert.equal(router.includes("authSecurityStore"), false);
});

test("merchant lifecycle PostgreSQL authority does not depend on legacy JSON stores", () => {
  const management = source("../src/services/postgresMerchantManagementAuthority.ts");
  const retention = source("../src/services/postgresMerchantRetentionAuthority.ts");

  for (const code of [management, retention]) {
    assert.equal(code.includes("merchants.json"), false);
    assert.equal(code.includes("ensureDb("), false);
    assert.equal(code.includes("writeDb("), false);
    assert.equal(code.includes("authAccountRepository"), false);
  }

  assert.match(management, /MERCHANT_DELETION_OPERATIONS_PENDING/);
  assert.match(management, /state = 'closed'/);
  assert.match(management, /phone = NULL/);
  assert.match(management, /merchant_deletion_requests/);
  assert.match(management, /audit_events/);
});

test("legacy retention schedulers are disabled before JSON access in PostgreSQL mode", () => {
  const scheduler = source("../src/services/merchantRetentionScheduler.ts");
  const policy = source("../src/services/merchantRetentionPolicy.ts");

  assert.match(
    scheduler,
    /export function startMerchantRetentionScheduler\(\): void \{\s*if \(operationalPostgresAuthorityRequired\(\)\) return;/,
  );
  assert.match(
    policy,
    /export function refreshMerchantRetentionPolicy[\s\S]{0,180}if \(operationalPostgresAuthorityRequired\(\)\)/,
  );
  assert.match(policy, /refreshAllMerchantRetentionPostgres/);
});

test("retention middleware uses Auth v2 PostgreSQL authority and guards canonical catalog writes", () => {
  const middleware = source("../src/middleware/merchantRetentionAccess.ts");
  const guard = source("../src/routes/retention-guard.ts");

  assert.match(middleware, /requireSecureMerchantSession/);
  assert.match(middleware, /getMerchantRetentionAccessPostgres/);
  assert.match(middleware, /pathname === "\/catalog\/products"/);
  assert.match(middleware, /pathname\.startsWith\("\/catalog\/products\/"\)/);
  assert.match(middleware, /pathname\.startsWith\("\/inventory\/"\)/);
  assert.match(middleware, /PRODUCTS_READ_ONLY/);
  assert.equal(
    /enforcePostgresRetentionAccess[\s\S]{0,500}req\.headers\.authorization/.test(
      middleware,
    ),
    false,
    "Authorization headers must not bypass merchant retention when a v2 merchant cookie exists",
  );

  assert.match(guard, /requireSecureMerchantSession/);
  assert.match(guard, /getMerchantRetentionAccessPostgres/);
});

test("closed merchant tombstones are the only accounts allowed without a phone", () => {
  const accounts = source("../../../lib/db/src/schema/accounts.ts");
  const managementSchema = source("../../../lib/db/src/schema/merchant-management.ts");

  assert.match(accounts, /phone: text\("phone"\)/);
  assert.match(accounts, /accounts_active_phone_required_check/);
  assert.match(accounts, /state.*closed[\s\S]{0,100}phone.*IS NOT NULL/);
  assert.match(managementSchema, /merchant_admin_notes/);
  assert.match(managementSchema, /merchant_channel_overrides/);
  assert.match(managementSchema, /merchant_deletion_requests/);
});
