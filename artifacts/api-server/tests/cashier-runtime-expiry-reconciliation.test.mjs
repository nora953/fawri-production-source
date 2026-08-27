import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const apiRoot = path.resolve(here, "..");
const service = fs.readFileSync(
  path.join(apiRoot, "src/services/cashierRuntimeExpiryReconciliation.ts"),
  "utf8",
);
const router = fs.readFileSync(
  path.join(apiRoot, "src/routes/cashier-sync-operations.ts"),
  "utf8",
);

test("cashier runtime materializes time-derived terminal states only", () => {
  for (const table of [
    "cashier_station_pairing_challenges",
    "cashier_station_credentials",
    "cashier_operator_sessions",
  ]) {
    assert.match(service, new RegExp(`UPDATE ${table}`));
  }
  assert.match(service, /SET status = 'expired'/);
  assert.match(service, /status = 'active'/);
  assert.match(service, /expires_at <= now\(\)/);
  assert.doesNotMatch(service, /UPDATE cashier_shifts/);
  assert.doesNotMatch(service, /merchant_cashier_staff\s+SET/);
  assert.doesNotMatch(service, /merchant_cashier_stations\s+SET/);
});

test("every cashier route passes expiry reconciliation before cashier routers", () => {
  assert.match(router, /router\.use\(reconcileCashierRuntime\)/);
  assert.match(router, /reconcileCashierRuntimeExpirationsAuthoritative/);
  assert.ok(
    router.indexOf("router.use(reconcileCashierRuntime)") <
      router.indexOf("router.use(cashierStaffOperationsRouter)"),
    "expiry reconciliation must run before cashier staff routes",
  );
  assert.ok(
    router.indexOf("router.use(reconcileCashierRuntime)") <
      router.indexOf("router.use(cashierOperatorCommerceRouter)"),
    "expiry reconciliation must run before operator commerce routes",
  );
});
