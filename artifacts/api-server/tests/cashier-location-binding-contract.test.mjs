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
const clientSession = read(
  "artifacts/fawri/src/lib/cashierOperatorSessionRuntime.ts",
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
