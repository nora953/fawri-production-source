import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { getCashierPinValidationError } from "../src/services/postgresCashierStaffAuthority";

const authorityPath = new URL(
  "../src/services/postgresCashierStaffAuthority.ts",
  import.meta.url,
);
const middlewarePath = new URL(
  "../src/middleware/cashierStaffSession.ts",
  import.meta.url,
);
const routesPath = new URL(
  "../src/routes/cashier-staff-operations.ts",
  import.meta.url,
);
const syncRoutesPath = new URL(
  "../src/routes/cashier-sync-operations.ts",
  import.meta.url,
);

const [authority, middleware, routes, syncRoutes] = await Promise.all([
  readFile(authorityPath, "utf8"),
  readFile(middlewarePath, "utf8"),
  readFile(routesPath, "utf8"),
  readFile(syncRoutesPath, "utf8"),
]);

test("cashier PIN contract accepts only 4 to 8 digits", () => {
  assert.equal(getCashierPinValidationError("1234"), null);
  assert.equal(getCashierPinValidationError("12345678"), null);
  assert.equal(getCashierPinValidationError("123")?.code, "CASHIER_PIN_INVALID");
  assert.equal(getCashierPinValidationError("123456789")?.code, "CASHIER_PIN_INVALID");
  assert.equal(getCashierPinValidationError("12a4")?.code, "CASHIER_PIN_INVALID");
});

test("staff PIN and station/operator credentials persist only hashes", () => {
  assert.match(authority, /hashPassword\(pin\)/);
  assert.match(authority, /code_hash/);
  assert.match(authority, /token_hash/);
  assert.match(authority, /hashSecret\(pairingCode\)/);
  assert.match(authority, /hashSecret\(stationToken\)/);
  assert.match(authority, /hashSecret\(operatorToken\)/);
  assert.doesNotMatch(authority, /INSERT INTO merchant_cashier_staff[\s\S]{0,500}\bpin\b/);
});

test("pairing is one-time and rotates prior station runtime", () => {
  assert.match(authority, /status = 'revoked', revoked_at = now\(\)[\s\S]*cashier_station_pairing_challenges/);
  assert.match(authority, /revokeStationRuntime\([\s\S]*"station_repaired"/);
  assert.match(authority, /credential_version = \$4/);
  assert.match(authority, /status = 'used', used_at = now\(\), used_by_device_id/);
});

test("operator authentication is bound to station credential, device, shift, staff version, and permissions", () => {
  assert.match(authority, /c\.token_hash = \$1/);
  assert.match(authority, /os\.token_hash = \$2/);
  assert.match(authority, /c\.device_id = \$3/);
  assert.match(authority, /os\.staff_version = s\.version/);
  assert.match(authority, /sh\.status = 'open'/);
  assert.match(authority, /input\.requiredPermission/);
  assert.match(authority, /CASHIER_OPERATOR_PERMISSION_REQUIRED/);
});

test("PIN failures are committed and lock repeated guesses", () => {
  assert.match(authority, /PIN_FAILURE_LIMIT = 5/);
  assert.match(authority, /PIN_LOCK_MS = 15 \* 60 \* 1000/);
  assert.match(authority, /failed_pin_attempts = \$3/);
  assert.match(authority, /pin_locked_until = \$4/);
  assert.match(authority, /if \(!decision\.ok\) throw decision\.error/);
});

test("merchant management routes and station/operator routes use separate authorities", () => {
  assert.match(routes, /\/cashier\/management\/staff/);
  assert.match(routes, /\/cashier\/management\/stations/);
  assert.match(routes, /requireMerchantAuthority/);
  assert.match(routes, /\/cashier\/station\/pair/);
  assert.match(routes, /requireCashierStationCredential/);
  assert.match(routes, /\/cashier\/operator\/login/);
  assert.match(routes, /requireCashierOperatorSession\(\)/);
});

test("offline inventory authority accepts only an actual boolean at the merchant API boundary", () => {
  assert.match(routes, /function optionalBoolean\(value: unknown, field: string\)/);
  assert.match(routes, /typeof value !== "boolean"/);
  assert.match(routes, /offlineInventoryAuthority: optionalBoolean\([\s\S]{0,140}"offline_inventory_authority"/);
  assert.doesNotMatch(
    routes,
    /offlineInventoryAuthority:\s*req\.body\?\.offline_inventory_authority/,
  );
});

test("cashier credentials come from dedicated headers and never merchant account sessions", () => {
  assert.match(middleware, /x-fawri-cashier-station-token/);
  assert.match(middleware, /x-fawri-cashier-operator-token/);
  assert.match(middleware, /x-fawri-cashier-device-id/);
  assert.doesNotMatch(middleware, /MERCHANT_SESSION_COOKIE|ADMIN_SESSION_COOKIE/);
  assert.doesNotMatch(middleware, /req\.body\?\.(?:station_token|operator_token)/);
});

test("existing sale sync remains merchant-session protected until client credential cutover", () => {
  assert.match(syncRoutes, /router\.use\(cashierStaffOperationsRouter\)/);
  assert.match(
    syncRoutes,
    /"\/cashier\/sync\/sale",\s*requireMerchantSession/,
  );
  assert.match(
    syncRoutes,
    /"\/cashier\/sync\/compensation",\s*requireMerchantSession/,
  );
});
