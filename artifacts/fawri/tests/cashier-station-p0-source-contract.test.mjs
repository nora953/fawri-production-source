import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const source = fs.readFileSync(
  path.join(here, "../../api-server/src/services/postgresCashierStaffAuthority.ts"),
  "utf8",
);

const validationSource = fs.readFileSync(
  path.join(here, "../../api-server/src/services/cashierStaffAuthorityValidation.ts"),
  "utf8",
);

// Source-contract regression only: disposable PostgreSQL/HTTP behavior must be
// exercised separately before accepting the P0 runtime remediation.
test("station disable/revoke invalidates active pairing challenges in the same transaction", () => {
  const update = source.slice(
    source.indexOf("export async function updateCashierStationAuthoritative("),
    source.indexOf("export async function beginCashierStationPairingAuthoritative("),
  );
  assert.ok(update.length > 0, "station update function must be found");
  assert.match(
    update,
    /if \(locationChanged \|\| status === "disabled" \|\| status === "revoked"\)\s*\{\s*await client\.query\(\s*`UPDATE cashier_station_pairing_challenges\s+SET status = 'revoked', revoked_at = now\(\)\s+WHERE merchant_id = \$1 AND station_id = \$2 AND status = 'active'`/,
    "disable, revoke, and location change must all invalidate outstanding pairing challenges",
  );
  assert.ok(
    update.indexOf("UPDATE merchant_cashier_stations") <
      update.indexOf("UPDATE cashier_station_pairing_challenges"),
    "challenge revocation must follow the station update in its transaction",
  );
});

test("station create and update require boolean offline inventory authority", () => {
  assert.match(
    validationSource,
    /function offlineAuthorityFlag\(value: unknown\): boolean\s*\{\s*if \(typeof value !== "boolean"\)/,
  );
  assert.match(
    source,
    /const offlineInventoryAuthority = input\.offlineInventoryAuthority === undefined \? false : offlineAuthorityFlag\(input\.offlineInventoryAuthority\);/,
  );
  assert.match(
    source,
    /input\.offlineInventoryAuthority === undefined\s*\? undefined\s*:\s*offlineAuthorityFlag\(input\.offlineInventoryAuthority\)/,
  );
  assert.doesNotMatch(
    source,
    /Boolean\(input\.offlineInventoryAuthority\)/,
    "truthy strings such as 'false' must never enable offline authority",
  );
});

test("pairing redemption locks the station before the challenge and revalidates under lock", () => {
  const redeem = source.slice(
    source.indexOf("export async function redeemCashierStationPairingAuthoritative("),
    source.indexOf("export async function ", source.indexOf("export async function redeemCashierStationPairingAuthoritative(") + 1),
  );
  assert.ok(redeem.length > 0, "pairing redemption function must be found");
  const stationLock = redeem.indexOf("const station = await getStationRow(");
  const challengeLock = redeem.indexOf("const challenges = await operationalQueryRows<PairingRow>(");
  assert.ok(stationLock >= 0 && challengeLock > stationLock,
    "station must be locked before the challenge row");
  assert.match(redeem.slice(challengeLock), /FOR UPDATE/);
  assert.match(redeem.slice(challengeLock), /challenge\.status !== "active"/,
    "challenge must be revalidated after acquiring the challenge lock");
  assert.match(redeem.slice(0, stationLock), /const discovered = await operationalQueryRows<PairingRow>/);
  assert.doesNotMatch(redeem.slice(0, stationLock), /FOR UPDATE/,
    "initial tenant discovery must not lock the challenge");
});
