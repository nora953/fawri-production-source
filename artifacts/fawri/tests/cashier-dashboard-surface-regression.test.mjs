import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../../../', import.meta.url);

async function source(relativePath) {
  return readFile(new URL(relativePath, root), 'utf8');
}

test('merchant dashboard permanently exposes cashier staff management and central reports', async () => {
  const [app, sidebar, bottomNav] = await Promise.all([
    source('artifacts/fawri/src/App.tsx'),
    source('artifacts/fawri/src/components/layout/Sidebar.tsx'),
    source('artifacts/fawri/src/components/layout/BottomNav.tsx'),
  ]);

  for (const file of [app, sidebar, bottomNav]) {
    assert.match(file, /\/dashboard\/cashiers/);
    assert.match(file, /\/dashboard\/cashiers\/reports/);
  }

  assert.match(app, /CashierManagementPage/);
  assert.match(app, /CashierCentralReportsPage/);
  assert.match(sidebar, /Cashiers & Staff/);
  assert.match(sidebar, /Cashier Reports/);
});

test('cashier dashboard surfaces remain backed by real staff and report pages', async () => {
  const [management, reports] = await Promise.all([
    source('artifacts/fawri/src/pages/dashboard/CashierManagementPage.tsx'),
    source('artifacts/fawri/src/pages/dashboard/CashierCentralReportsPage.tsx'),
  ]);

  assert.match(management, /\/api\/cashier\/management\/staff/);
  assert.match(management, /\/api\/cashier\/management\/stations/);
  assert.match(reports, /\/api\/cashier\/management\/report/);
});

test('cashier API keeps staff authority and permission-bound operator commerce mounted', async () => {
  const [syncRouter, staffRouter, operatorRouter] = await Promise.all([
    source('artifacts/api-server/src/routes/cashier-sync-operations.ts'),
    source('artifacts/api-server/src/routes/cashier-staff-operations.ts'),
    source('artifacts/api-server/src/routes/cashier-operator-commerce.ts'),
  ]);

  assert.match(syncRouter, /router\.use\(cashierStaffOperationsRouter\)/);
  assert.match(syncRouter, /router\.use\(cashierOperatorCommerceRouter\)/);
  assert.match(staffRouter, /\/cashier\/management\/report/);
  assert.match(staffRouter, /\/cashier\/management\/staff/);
  assert.match(operatorRouter, /requireCashierOperatorSession/);
});

test('cashier staff PostgreSQL schema and operator gate remain part of the canonical runtime', async () => {
  const [schemaIndex, cashierMain] = await Promise.all([
    source('lib/db/src/schema/index.ts'),
    source('artifacts/fawri/src/cashierMain.tsx'),
  ]);

  assert.match(schemaIndex, /export \* from "\.\/cashier-staff"/);
  assert.match(schemaIndex, /export \* from "\.\/cashier-operation-attribution"/);
  assert.match(cashierMain, /CashierOperatorGate/);
});


test('central cashier operation details use server-side filters with truthful truncation counts', async () => {
  const [reports, route, activity] = await Promise.all([
    source('artifacts/fawri/src/pages/dashboard/CashierCentralReportsPage.tsx'),
    source('artifacts/api-server/src/routes/cashier-staff-operations.ts'),
    source('artifacts/api-server/src/services/postgresCashierCentralActivityAuthority.ts'),
  ]);

  assert.match(reports, /const \[locationFilter, setLocationFilter\] = useState\('all'\)/);
  assert.match(reports, /params\.set\('detail_staff_id'/);
  assert.match(reports, /params\.set\('detail_location_id'/);
  assert.match(reports, /params\.set\('detail_station_id'/);
  assert.match(reports, /params\.set\('detail_operation_kind'/);
  assert.match(reports, /result\?\.activity\.by_location/);
  assert.doesNotMatch(reports, /activity\.operations \|\| \[\]\)\.filter/);
  assert.match(reports, /operation_matching_count/);
  assert.match(reports, /detailsAreLimited/);
  assert.match(reports, /detailsLimited\.replace\('\{limit\}'/);

  assert.match(route, /detailStaffId: req\.query\.detail_staff_id/);
  assert.match(route, /detailLocationId: req\.query\.detail_location_id/);
  assert.match(route, /detailStationId: req\.query\.detail_station_id/);
  assert.match(route, /detailOperationKind: req\.query\.detail_operation_kind/);

  assert.match(activity, /COUNT\(\*\) OVER\(\)::int AS matching_count/);
  assert.match(activity, /attribution\.staff_id = \$4::text/);
  assert.match(activity, /__legacy_location__/);
  assert.match(activity, /attribution\.station_id = \$6::text/);
  assert.match(activity, /attribution\.operation_kind = \$7::text/);
  assert.match(activity, /operation_matching_count:/);
});
