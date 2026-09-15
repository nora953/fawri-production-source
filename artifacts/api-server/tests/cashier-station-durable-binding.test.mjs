import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const apiRoot = path.resolve(here, "..");
const lifecycle = fs.readFileSync(
  path.join(apiRoot, "src/services/cashierRuntimeExpiryReconciliation.ts"),
  "utf8",
);
const middleware = fs.readFileSync(
  path.join(apiRoot, "src/middleware/cashierStaffSession.ts"),
  "utf8",
);
const authority = fs.readFileSync(
  path.join(apiRoot, "src/services/postgresCashierStaffAuthority.ts"),
  "utf8",
);

test("durable station refresh restores only the current active device binding", () => {
  assert.match(lifecycle, /refreshDurableCashierStationCredentialAuthoritative/);
  assert.match(lifecycle, /c\.status IN \('active', 'expired'\)/);
  assert.match(lifecycle, /s\.status = 'active'/);
  assert.match(lifecycle, /s\.paired_device_id = \$2/);
  assert.match(lifecycle, /s\.credential_version = c\.version/);
  assert.doesNotMatch(lifecycle, /c\.status IN \([^)]*revoked/);

  const refresh = middleware.indexOf(
    "refreshDurableCashierStationCredentialAuthoritative",
  );
  const stationAuth = middleware.indexOf(
    "authenticateCashierStationAuthoritative",
    refresh,
  );
  const operatorAuth = middleware.indexOf(
    "authenticateCashierOperatorAuthoritative",
    stationAuth,
  );
  assert.ok(refresh >= 0, "station credential refresh must be installed");
  assert.ok(stationAuth > refresh, "station refresh must run before station auth");
  assert.ok(operatorAuth > stationAuth, "operator auth must remain protected");
});

test("explicit station revocation and operator-session expiry remain authoritative", () => {
  assert.match(
    authority,
    /UPDATE cashier_station_credentials[\s\S]*SET status = 'revoked', revoked_at = now\(\)/,
  );
  assert.match(authority, /c\.status = 'active'/);
  assert.match(authority, /os\.status = 'active'/);
  assert.match(authority, /os\.expires_at > now\(\)/);
});
