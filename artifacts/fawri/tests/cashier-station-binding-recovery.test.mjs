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

test('invalid station credentials clear only station binding fields', () => {
  assert.match(recovery, /CASHIER_STATION_CREDENTIAL_INVALID/);
  assert.match(recovery, /CASHIER_STATION_PAIRING_REQUIRED/);
  for (const field of [
    'station_id',
    'station_name',
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
