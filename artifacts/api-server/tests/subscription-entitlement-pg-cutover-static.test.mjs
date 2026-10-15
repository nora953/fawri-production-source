import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
function source(relative) {
  return fs.readFileSync(path.join(root, relative), "utf8");
}

test("auth v2 mounts PostgreSQL subscription authority before legacy business routes", () => {
  const authSecurity = source("src/routes/auth-security.ts");
  const mount = authSecurity.indexOf("subscriptionEntitlementPgRouter");
  const legacyPublic = authSecurity.indexOf("router.use(publicRoutes");
  assert.ok(mount >= 0, "PostgreSQL subscription router is not mounted");
  assert.ok(legacyPublic > mount, "PostgreSQL subscription router must precede legacy auth routers");

  const routes = source("src/routes/subscription-entitlement-pg.ts");
  assert.match(routes, /subscriptionPostgresAuthorityRequired/);
  assert.match(routes, /getCurrentSubscriptionPostgres/);
  assert.match(routes, /activateEmergencyCreditPostgres/);
  assert.match(routes, /applySubscriptionPlanOperationPostgres/);
  assert.match(routes, /applySubscriptionActionPostgres/);
  assert.match(routes, /LEGACY_SUBSCRIPTION_MIGRATION_ENDPOINT_DISABLED/);
});

test("live Meta entitlement paths route through authority switches", () => {
  const core = source("src/services/metaWebhookWorkerCore.ts");
  const worker = source("src/services/metaWebhookWorker.ts");
  const guard = source("src/middleware/merchantWebhookSubscriptionAccess.ts");

  assert.match(core, /reserveMerchantAutoReplyAuthoritative/);
  assert.match(core, /releaseMerchantAutoReplyReservationAuthoritative/);
  assert.doesNotMatch(core, /from "\.\/merchantReplyEntitlement"/);
  assert.doesNotMatch(core, /from "\.\/merchantReplyReservationRelease"/);

  assert.match(worker, /refundMerchantAutoReplyAuthoritative/);
  assert.doesNotMatch(worker, /from "\.\/merchantReplyRefund"/);

  assert.match(guard, /reserveMerchantAutoReplyAuthoritative/);
  assert.doesNotMatch(guard, /from "\.\.\/services\/merchantReplyEntitlement"/);
});

test("required authority wrappers are explicit and never fall back after PostgreSQL selection", () => {
  const reserve = source("src/services/merchantReplyEntitlementAuthority.ts");
  const release = source("src/services/merchantReplyReservationReleaseAuthority.ts");
  const refund = source("src/services/merchantReplyRefundAuthority.ts");
  const pg = source("src/services/postgresSubscriptionEntitlement.ts");

  for (const authority of [reserve, release, refund]) {
    assert.match(authority, /subscriptionPostgresAuthorityRequired\(\)/);
  }
  assert.match(pg, /FAWRI_SUBSCRIPTION_POSTGRES_AUTHORITY/);
  assert.match(pg, /reply_ledger/);
  assert.match(pg, /pg_advisory_xact_lock/);
});
