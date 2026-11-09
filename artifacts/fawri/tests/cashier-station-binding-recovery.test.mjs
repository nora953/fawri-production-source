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
const runtime = fs.readFileSync(
  path.join(root, 'src/lib/cashierOperatorSessionRuntime.ts'),
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
    assert.match(runtime, new RegExp(`delete next\\.${field}`));
  }
  assert.doesNotMatch(runtime, /delete next\.device_id/);
  assert.doesNotMatch(runtime, /delete next\.cloud_merchant_id/);
  assert.doesNotMatch(recovery, /clear\(\)/);
});

test('delayed invalid-credential denial can only clear captured binding in one IDB transaction',()=>{
  assert.match(recovery, /clearInvalidCashierStationBinding\(\s*expected: CashierStationBinding/);
  assert.match(recovery, /return clearCashierStationBindingIfMatches\(expected\)/);
  assert.match(runtime, /export async function clearCashierStationBindingIfMatches/);
  assert.match(runtime, /openBootstrapDatabase\(true\)/);
  assert.match(runtime, /database.transaction\(BOOTSTRAP_STORE, 'readwrite'\)/);
  for(const term of [
    'current.cloud_merchant_id !== expected.merchant_id',
    'current.device_id !== expected.device_id',
    'current.station_id !== expected.station_id',
    'current.station_token !== expected.station_token',
    'current.location_id !== expected.location_id',
    'current.branch_key !== expected.branch_key',
    'current.station_credential_expires_at !== expected.credential_expires_at',
  ])assert.ok(runtime.includes(term),'guard captured request identity: '+term);
  assert.match(gate, /attemptedBinding = binding/);
  assert.match(gate, /recoverStationBinding\(error, attemptedBinding\)/);
  assert.match(gate, /recoverStationBinding\(error, state\.binding\)/);
  assert.match(gate, /if \(!await clearInvalidCashierStationBinding\(attemptedBinding\)\) return false/);
  assert.doesNotMatch(gate, /clearInvalidCashierStationBinding\(\)/);
});

test('cashier gate self-recovers to pairing instead of generic error', () => {
  assert.match(gate, /isCashierStationBindingInvalidError/);
  assert.match(gate, /clearInvalidCashierStationBinding/);
  assert.match(gate, /setState\(\{ kind: 'pair', binding: null \}\)/);
  assert.match(gate, /if \(await recoverStationBinding\(error, attemptedBinding\)\) return;/);
  assert.match(gate, /if \(await recoverStationBinding\(error, state\.binding\)\) return;/);
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

test('legacy network recovery and expiry refresh use atomic native identity compare-and-swap',()=>{
  const runtime=fs.readFileSync(
    path.join(root,'src/lib/cashierOperatorSessionRuntime.ts'),'utf8',
  );
  assert.match(runtime,/export async function writeCashierDeviceIdentityIfUnchanged/);
  assert.match(runtime,/database.transaction\(BOOTSTRAP_STORE, 'readwrite'\)/);
  assert.match(runtime,/JSON.stringify\(current\) !== JSON.stringify\(expected\)/);
  assert.match(runtime,/await completion/);
  assert.match(recovery,/return writeCashierDeviceIdentityIfUnchanged\(identity, next\)/);
  assert.match(recovery,/await writeCashierDeviceIdentityIfUnchanged\(identity, \{/);
});

test('legacy binding recovery runs before the cashier gate and does not generate a new pairing credential', () => {
  assert.match(
    recovery,
    /export async function refreshDurableCashierStationBindingMetadata[\s\S]*if \(!identity\.location_id\)[\s\S]*recoverLegacyCashierStationBinding\(\)/,
  );
  assert.doesNotMatch(recovery, /\/api\/cashier\/station\/pair/);
  assert.doesNotMatch(recovery, /pairing_code/);

  const refresh = entry.indexOf(
    'await refreshDurableCashierStationBindingMetadata()',
  );
  const render = entry.indexOf("createRoot(document.getElementById('cashier-root')!)");
  assert.ok(refresh >= 0 && render > refresh);
});
