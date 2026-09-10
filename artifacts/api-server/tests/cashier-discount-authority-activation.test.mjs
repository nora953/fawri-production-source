import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const script = fs.readFileSync(
  new URL('../../../lib/db/scripts/activate-cashier-discount-authority.mjs', import.meta.url),
  'utf8',
);

test('activation is explicit, database-targeted and defaults to preflight', () => {
  assert.match(script, /FAWRI_EXPECT_DATABASE/);
  assert.match(script, /process\.argv\.includes\('--apply'\)/);
  assert.match(script, /FAWRI_ALLOW_CASHIER_DISCOUNT_AUTHORITY_ACTIVATION/);
  assert.match(script, /BEGIN READ ONLY/);
  assert.match(script, /database_writes_performed: false/);
});

test('activation is bound to two explicit reviewed staff identities and roles', () => {
  assert.match(script, /FAWRI_CASHIER_DISCOUNT_STAFF_ID/);
  assert.match(script, /FAWRI_CASHIER_OVERRIDE_MANAGER_ID/);
  assert.match(script, /FAWRI_EXPECT_CASHIER_DISPLAY_NAME/);
  assert.match(script, /FAWRI_EXPECT_MANAGER_DISPLAY_NAME/);
  assert.match(script, /assert\.equal\(cashier\.role, 'cashier'/);
  assert.match(script, /assert\.equal\(manager\.role, 'manager'/);
  assert.match(script, /assert\.notEqual\(cashierStaffId, managerStaffId/);
});

test('activation requires canonical 0015 and a live paired station', () => {
  assert.match(script, /1787715600000/);
  assert.match(script, /canonical 0015_cashier_discount_override_authority is not recorded/);
  assert.match(script, /cashier_station_credentials/);
  assert.match(script, /expires_at > now\(\)/);
  assert.match(script, /merchant has no live paired cashier station/);
});

test('activation grants cashier 10-percent-style authority separately from manager approval authority', () => {
  assert.match(script, /FAWRI_CASHIER_MAX_PERCENTAGE_BPS/);
  assert.match(script, /permissions: \['sale\.discount'\]/);
  assert.match(script, /permissions: \['sale\.discount', 'sale\.discount_override'\]/);
  assert.match(script, /manager: \{[\s\S]*max_percentage_bps: 0,[\s\S]*can_approve_override: true/);
  assert.match(script, /cashier: \{[\s\S]*can_approve_override: false/);
});

test('activation touches only discount authority and keeps session snapshots coherent', () => {
  assert.match(script, /permission IN \('sale\.discount','sale\.discount_override'\)/);
  assert.match(script, /ON CONFLICT \(merchant_id, staff_id\) DO UPDATE/);
  assert.match(script, /SET version = version \+ 1, updated_at = now\(\)/);
  assert.match(script, /SET permission_snapshot = \$3::jsonb/);
  assert.match(script, /WHERE merchant_id = \$1 AND staff_id = \$2 AND status = 'active'/);
  assert.doesNotMatch(script, /pin_hash|pin_locked_until|failed_pin_attempts/);
});
