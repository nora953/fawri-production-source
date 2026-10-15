import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

const staffAuthority = read(
  "artifacts/api-server/src/services/postgresCashierStaffAuthority.ts",
);
const bindingAuthority = read(
  "artifacts/api-server/src/services/cashierLocationBindingAuthority.ts",
);
const stationConfigurationAuthority = read(
  "artifacts/api-server/src/services/cashierStationConfigurationAuthority.ts",
);
const cashierRoutes = read(
  "artifacts/api-server/src/routes/cashier-staff-operations.ts",
);
const clientSession = read(
  "artifacts/fawri/src/lib/cashierOperatorSessionRuntime.ts",
);
const policyRefresh = read(
  "artifacts/fawri/src/lib/cashierOperatorPolicyRefresh.ts",
);

test("cashier station creation binds a canonical merchant location", () => {
  assert.match(
    staffAuthority,
    /resolveCashierLocationForBranch\(client,[\s\S]*branchKey[\s\S]*branchLabel/,
  );
  assert.match(
    staffAuthority,
    /INSERT INTO merchant_cashier_stations \([\s\S]*location_id/,
  );
  assert.match(
    bindingAuthority,
    /online_fulfillment_enabled[\s\S]*FALSE/,
  );
});

test("cashier authentication fails closed without location identity", () => {
  assert.match(
    staffAuthority,
    /CASHIER_LOCATION_BINDING_REQUIRED/,
  );
  assert.match(
    staffAuthority,
    /s\.location_id, s\.branch_key/,
  );
  assert.match(
    staffAuthority,
    /st\.location_id, st\.branch_key/,
  );
});

test("pairing and client session persist the exact location id", () => {
  assert.match(
    staffAuthority,
    /location_id: requireStationLocationId\(station\.location_id\)/,
  );
  assert.match(clientSession, /location_id\?: string/);
  assert.match(clientSession, /location_id: string/);
  assert.match(clientSession, /const locationId = String\(payload\.location_id/);
  assert.match(clientSession, /location_id: locationId/);
  assert.match(
    clientSession,
    /context\.location_id !== binding\.location_id/,
  );
});


test("branch changes rebind location and revoke stale station runtime", () => {
  assert.match(
    staffAuthority,
    /const targetLocation =[\s\S]*resolveCashierLocationForBranch/,
  );
  assert.match(
    staffAuthority,
    /add\("location_id", targetLocation\.id\)/,
  );
  assert.match(
    staffAuthority,
    /credential_version = credential_version \+ 1/,
  );
  assert.match(
    staffAuthority,
    /station_location_changed/,
  );
  assert.match(
    staffAuthority,
    /merchant_cashier_stations_offline_location_unique/,
  );
});


test("policy refresh cannot silently change cashier location", () => {
  assert.match(policyRefresh, /location_id: text\(operator\.location_id\)/);
  assert.match(
    policyRefresh,
    /context\.location_id === session\.context\.location_id/,
  );
  assert.match(
    policyRefresh,
    /identity\.location_id !== context\.location_id/,
  );
  assert.match(policyRefresh, /location_id: context\.location_id/);
});


test("merchant cashier management exposes canonical location selection", () => {
  assert.match(bindingAuthority, /resolveCashierLocationById/);
  assert.match(staffAuthority, /listCashierLocationsAuthoritative/);
  assert.match(staffAuthority, /locationId\?: unknown/);
  assert.match(staffAuthority, /resolveCashierLocationById\(client, \{ merchantId, locationId \}\)/);
  assert.match(cashierRoutes, /"\/cashier\/management\/locations"/);
  assert.match(cashierRoutes, /locationId: req\.body\?\.location_id/);
});

test("station management keeps the canonical location immutable after creation", () => {
  assert.match(
    stationConfigurationAuthority,
    /CASHIER_STATION_LOCATION_IMMUTABLE/,
  );
  assert.match(
    stationConfigurationAuthority,
    /cashier station location cannot be changed after creation/,
  );
  assert.match(
    stationConfigurationAuthority,
    /merchant_cashier_stations_offline_location_unique/,
  );
});
