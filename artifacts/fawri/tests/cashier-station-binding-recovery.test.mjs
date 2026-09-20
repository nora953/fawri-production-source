import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const recovery = fs.readFileSync(
  path.join(root, 'src/lib/cashierStationBindingRecovery.ts'),
  'utf8',
);
const gate = fs.readFileSync(
  path.join(root, 'src/components/cashier/CashierOperatorGate.tsx'),
  'utf8',
);
const entry = fs.readFileSync(
  path.join(root, 'src/cashierMain.tsx'),
  'utf8',
);

test('invalid station credentials clear only station binding fields', () => {
  assert.match(recovery, /CASHIER_STATION_CREDENTIAL_INVALID/);
  assert.match(recovery, /CASHIER_STATION_PAIRING_REQUIRED/);
  for (const field of [
    'station_id',
    'station_name',
    'location_id',
    'branch_key',
    'branch_label',
    'offline_inventory_authority',
    'station_token',
    'station_credential_expires_at',
  ]) {
    assert.match(recovery, new RegExp(`delete next\\.${field}`));
  }
  assert.doesNotMatch(recovery, /delete next\.device_id/);
  assert.doesNotMatch(recovery, /delete next\.cloud_merchant_id/);
  assert.doesNotMatch(recovery, /clear\(\)/);
});

test('cashier gate self-recovers to pairing instead of generic error', () => {
  assert.match(gate, /isCashierStationBindingInvalidError/);
  assert.match(gate, /clearInvalidCashierStationBinding/);
  assert.match(gate, /setState\(\{ kind: 'pair', binding: null \}\)/);
  assert.match(gate, /if \(await recoverStationBinding\(error\)\) return;/);
});

test('paired-device metadata is made non-expiring before the cashier gate renders', () => {
  assert.match(recovery, /refreshDurableCashierStationBindingMetadata/);
  assert.match(recovery, /identity\.station_token/);
  assert.match(
    recovery,
    /DURABLE_STATION_METADATA_EXPIRES_AT = '9999-12-31T23:59:59\.999Z'/,
  );
  assert.match(
    recovery,
    /station_credential_expires_at: DURABLE_STATION_METADATA_EXPIRES_AT/,
  );
  assert.doesNotMatch(recovery, /DURABLE_STATION_METADATA_TTL_MS/);

  const refresh = entry.indexOf(
    'await refreshDurableCashierStationBindingMetadata()',
  );
  const render = entry.indexOf("createRoot(document.getElementById('cashier-root')!)");
  assert.ok(refresh >= 0, 'durable station metadata refresh must run at startup');
  assert.ok(render > refresh, 'station metadata must refresh before the gate renders');
});


test('legacy paired devices hydrate canonical location from the existing station credential', () => {
  assert.match(recovery, /recoverLegacyCashierStationBinding/);
  assert.match(recovery, /!identity\.location_id/);
  assert.match(recovery, /fetch\('\/api\/cashier\/station\/me'/);
  assert.match(recovery, /'X-Fawri-Cashier-Station-Token': identity\.station_token/);
  assert.match(recovery, /'X-Fawri-Cashier-Device-Id': identity\.device_id/);
  assert.match(recovery, /merchantId !== identity\.cloud_merchant_id/);
  assert.match(recovery, /stationId !== identity\.station_id/);
  assert.match(recovery, /deviceId !== identity\.device_id/);
  assert.match(recovery, /location_id: locationId/);
  assert.match(recovery, /station_credential_expires_at: DURABLE_STATION_METADATA_EXPIRES_AT/);
});

test('legacy binding recovery runs before the cashier gate and does not generate a new pairing credential', () => {
  const recoveryCall = recovery.indexOf('recoverLegacyCashierStationBinding()');
  const refreshExport = recovery.indexOf('export async function refreshDurableCashierStationBindingMetadata');
  assert.ok(refreshExport >= 0 && recoveryCall > refreshExport);
  assert.doesNotMatch(recovery, /\/api\/cashier\/station\/pair/);
  assert.doesNotMatch(recovery, /pairing_code/);

  const refresh = entry.indexOf(
    'await refreshDurableCashierStationBindingMetadata()',
  );
  const render = entry.indexOf("createRoot(document.getElementById('cashier-root')!)");
  assert.ok(refresh >= 0 && render > refresh);
});
