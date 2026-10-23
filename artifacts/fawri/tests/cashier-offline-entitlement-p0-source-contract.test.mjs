import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const offline = fs.readFileSync(
  path.join(here, "../src/lib/cashierOfflineEntitlementAuthority.ts"),
  "utf8",
);
const operator = fs.readFileSync(
  path.join(here, "../src/lib/cashierOperatorSessionRuntime.ts"),
  "utf8",
);

// Source-contract guards for existing P0 fail-closed behavior. These do NOT
// establish cryptographic authenticity of the cached entitlement; that
// separate release blocker remains open until signed envelopes are deployed.
test("offline sales require cached merchant and station identity match", () => {
  const sale = offline.slice(offline.indexOf("export async function assertCashierSaleEntitlementFromCache("));
  assert.ok(sale.length > 500);
  assert.match(sale, /!authority\s*\|\|\s*authority\.merchant_id !== merchantId\s*\|\|\s*authority\.station_id !== stationId/);
  assert.match(sale, /CASHIER_ENTITLEMENT_REFRESH_REQUIRED/);
});

test("offline sale cutoff is checked before cache state update", () => {
  const sale = offline.slice(offline.indexOf("export async function assertCashierSaleEntitlementFromCache("));
  const cutoff = sale.indexOf("estimatedNow >= graceUntilMs");
  const update = sale.indexOf("const updated: CashierCachedEntitlementAuthority");
  assert.ok(cutoff >= 0 && update > cutoff, "expired entitlement must be rejected before cache mutation");
  assert.match(sale, /CASHIER_SUBSCRIPTION_RESTRICTED/);
});

test("offline clock rollback and stale online snapshots remain rejected", () => {
  assert.match(offline, /nowLocal \+ CLOCK_ROLLBACK_TOLERANCE_MS < authority\.last_local_time_ms/);
  assert.match(offline, /CASHIER_DEVICE_CLOCK_ROLLBACK/);
  assert.match(offline, /existing\.version > version/);
  assert.match(offline, /CASHIER_ENTITLEMENT_STALE_SNAPSHOT/);
});

test("operator login persists entitlement before storing a usable session", () => {
  const login = operator.slice(operator.indexOf("const session: CashierOperatorSession = {"));
  assert.ok(login.length > 0, "operator login session assignment must exist");
  const persist = login.indexOf("await persistEntitlementFromPayload(payload, context.station_id, context)");
  const storage = login.indexOf("sessionStorage.setItem(OPERATOR_STORAGE_KEY");
  assert.ok(persist >= 0 && storage > persist, "do not store login session before entitlement persistence");
});
