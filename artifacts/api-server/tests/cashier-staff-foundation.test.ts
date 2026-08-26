import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  CASHIER_STAFF_PERMISSIONS,
  cashierStaffMayReceiveCatalogCost,
  cashierStaffMayViewProfit,
  normalizeCashierStaffPermissions,
  recommendedCashierStaffPermissions,
} from '../src/services/cashierStaffPolicy';

const schemaPath = new URL(
  '../../../lib/db/src/schema/cashier-staff.ts',
  import.meta.url,
);
const indexPath = new URL('../../../lib/db/src/schema/index.ts', import.meta.url);
const migrationPath = new URL(
  '../../../lib/db/drizzle/0013_cashier_staff_station_authority.sql',
  import.meta.url,
);
const journalPath = new URL('../../../lib/db/drizzle/meta/_journal.json', import.meta.url);
const enumsPath = new URL('../../../lib/db/src/schema/enums.ts', import.meta.url);

test('cashier and manager presets expose only implemented non-sensitive cashier capabilities', () => {
  assert.deepEqual(recommendedCashierStaffPermissions('cashier'), [
    'sale.create',
    'sale.view_own',
  ]);
  assert.deepEqual(recommendedCashierStaffPermissions('manager'), [
    'sale.create',
    'sale.view_own',
    'sale.view_all',
    'sale.return',
    'sale.void',
    'reports.sales',
  ]);
  for (const role of ['cashier', 'manager'] as const) {
    const permissions = recommendedCashierStaffPermissions(role);
    assert.equal(cashierStaffMayViewProfit(permissions), false);
    assert.equal(cashierStaffMayReceiveCatalogCost(permissions), false);
    assert.equal(permissions.includes('inventory.adjust'), false);
    assert.equal(permissions.includes('shifts.manage'), false);
    assert.equal(permissions.includes('staff.manage'), false);
    assert.equal(permissions.includes('stations.manage'), false);
  }
});

test('sensitive permissions require explicit merchant grants', () => {
  const explicit = normalizeCashierStaffPermissions([
    'sale.create',
    'reports.profit',
    'catalog.cost',
  ]);
  assert.equal(cashierStaffMayViewProfit(explicit), true);
  assert.equal(cashierStaffMayReceiveCatalogCost(explicit), true);
  assert.throws(
    () => normalizeCashierStaffPermissions(['merchant.owner']),
    /cashier staff permission is invalid/,
  );
});

test('permission normalization is deterministic and complete', () => {
  const reversed = normalizeCashierStaffPermissions([
    ...CASHIER_STAFF_PERMISSIONS,
  ].reverse());
  assert.deepEqual(reversed, [...CASHIER_STAFF_PERMISSIONS]);
});

test('PostgreSQL foundation is tenant-scoped and separates staff from merchant accounts', async () => {
  const [schema, index, migration, journal, enums] = await Promise.all([
    readFile(schemaPath, 'utf8'),
    readFile(indexPath, 'utf8'),
    readFile(migrationPath, 'utf8'),
    readFile(journalPath, 'utf8'),
    readFile(enumsPath, 'utf8'),
  ]);

  for (const table of [
    'merchant_cashier_staff',
    'merchant_cashier_staff_permissions',
    'merchant_cashier_stations',
    'cashier_station_pairing_challenges',
    'cashier_station_credentials',
    'cashier_shifts',
    'cashier_operator_sessions',
  ]) {
    assert.match(schema, new RegExp(`"${table}"`));
    assert.match(migration, new RegExp(`CREATE TABLE "${table}"`));
  }

  assert.match(index, /export \* from "\.\/cashier-staff"/);
  assert.match(journal, /0013_cashier_staff_station_authority/);
  assert.match(
    schema,
    /cashier_station_credentials_station_merchant_fk/,
    'station credentials must prove station and merchant together',
  );
  assert.match(
    schema,
    /cashier_operator_sessions_shift_identity_fk/,
    'operator sessions must prove shift, merchant, station, and staff together',
  );
  assert.match(
    schema,
    /merchant_cashier_stations_offline_branch_unique/,
    'only one active offline inventory authority is allowed per merchant branch',
  );
  assert.match(schema, /pinHash: text\("pin_hash"\)\.notNull\(\)/);
  assert.doesNotMatch(schema, /pin: text\("pin"\)/);

  const sessionEnum = enums.match(
    /sessionKindEnum[\s\S]*?\]\);/,
  )?.[0] || '';
  assert.match(sessionEnum, /"merchant"/);
  assert.match(sessionEnum, /"admin"/);
  assert.doesNotMatch(sessionEnum, /cashier|staff|operator/);

  for (const permission of CASHIER_STAFF_PERMISSIONS) {
    assert.ok(
      schema.includes(permission),
      `schema must allow cashier permission ${permission}`,
    );
  }
});
