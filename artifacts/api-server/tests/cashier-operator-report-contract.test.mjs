import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const route = await readFile(
  new URL('../src/routes/cashier-operator-commerce.ts', import.meta.url),
  'utf8',
);
const reportAuthority = await readFile(
  new URL('../src/services/postgresCashierOperatorReportAuthority.ts', import.meta.url),
  'utf8',
);
const scopeAuthority = await readFile(
  new URL('../src/services/cashierOperatorSaleScope.ts', import.meta.url),
  'utf8',
);

test('operator report is server-authenticated by reports.sales permission', () => {
  assert.match(
    route,
    /"\/cashier\/operator\/report"[\s\S]{0,160}requireCashierOperatorSession\("reports\.sales"\)/,
  );
  assert.match(route, /buildCashierOperatorReportAuthoritative/);
  assert.match(route, /context: operatorContext\(res\)/);
  assert.match(route, /from: req\.query\.from/);
  assert.match(route, /to: req\.query\.to/);
});

test('operator server report is always restricted to the paired station and device', () => {
  assert.match(reportAuthority, /sale_attribution\.station_id = \$2/);
  assert.match(reportAuthority, /sale_attribution\.device_id = \$3/);
  assert.match(reportAuthority, /context\.station_id/);
  assert.match(reportAuthority, /context\.device_id/);
  assert.match(reportAuthority, /scope: canViewAll \? "station" : "own_shift"/);
});

test('sale.view_all widens employee visibility only inside the current station', () => {
  assert.match(reportAuthority, /const canViewAll = context\.permissions\.includes\("sale\.view_all"\)/);
  assert.match(
    reportAuthority,
    /\$4::boolean[\s\S]*sale_attribution\.staff_id = \$5[\s\S]*sale_attribution\.shift_id = \$6/,
  );
  const stationCheck = reportAuthority.indexOf('sale_attribution.station_id = $2');
  const viewAllCheck = reportAuthority.indexOf('$4::boolean');
  assert.ok(stationCheck >= 0 && viewAllCheck > stationCheck);
});

test('reports.profit returns aggregate profit only and never raw cost evidence', () => {
  assert.match(reportAuthority, /context\.permissions\.includes\("reports\.profit"\)/);
  assert.match(reportAuthority, /can_view_profit: canViewProfit/);
  assert.match(reportAuthority, /canViewProfit \? result\.report : redactProfit/);
  assert.doesNotMatch(reportAuthority, /SELECT[\s\S]*cost_iqd/);
  assert.doesNotMatch(reportAuthority, /cost_evidence/);
  assert.doesNotMatch(reportAuthority, /unit_cost_minor[^\n]*AS/);
});

test('operators without profit permission receive a profit-redacted report', () => {
  assert.match(reportAuthority, /profit_status: "unavailable"/);
  assert.match(reportAuthority, /gross_profit_minor: undefined/);
  assert.match(reportAuthority, /cost_known_net_units: 0/);
  assert.match(reportAuthority, /cost_unknown_net_units: 0/);
});

test('operator report selects old sales when durable compensation evidence occurs in range', () => {
  assert.match(reportAuthority, /jsonb_array_elements/);
  assert.match(reportAuthority, /cashier_sync/);
  assert.match(reportAuthority, /compensations/);
  assert.match(reportAuthority, /compensation->>'occurred_at'/);
});

test('return and void scope cannot cross the paired station even with sale.view_all', () => {
  assert.match(scopeAuthority, /SELECT station_id, staff_id, shift_id, device_id/);
  assert.match(scopeAuthority, /attribution\.station_id !== context\.station_id/);
  assert.match(scopeAuthority, /attribution\.device_id !== context\.device_id/);
  const stationGuard = scopeAuthority.indexOf('attribution.station_id !== context.station_id');
  const viewAllReturn = scopeAuthority.indexOf('if (canViewAll) return');
  assert.ok(stationGuard >= 0 && viewAllReturn > stationGuard);
});
