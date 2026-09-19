import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const apiRoot = new URL('../', import.meta.url);
const repoRoot = new URL('../../../', import.meta.url);

async function apiSource(path) {
  return readFile(new URL(path, apiRoot), 'utf8');
}

async function repoSource(path) {
  return readFile(new URL(path, repoRoot), 'utf8');
}

test('sale.view_own keeps the employee sales visible across shifts in local history', async () => {
  const history = await repoSource('artifacts/fawri/src/lib/cashierOperatorHistoryRuntime.ts');

  assert.match(history, /binding\.merchant_id !== session\.context\.merchant_id/);
  assert.match(history, /binding\.station_id !== session\.context\.station_id/);
  assert.match(history, /binding\.device_id !== session\.context\.device_id/);
  assert.match(history, /cashierOperatorCan\(session, 'sale\.view_all'\)/);
  assert.match(history, /cashierOperatorCan\(session, 'sale\.view_own'\)/);
  assert.match(history, /binding\.staff_id === session\.context\.staff_id/);
  assert.doesNotMatch(
    history,
    /binding\.shift_id === session\.context\.shift_id/,
    'sale.view_own must not hide the same employee sales after starting a new shift',
  );
});

test('online and offline reports use the same own-employee scope across shifts', async () => {
  const server = await apiSource('src/services/postgresCashierOperatorReportAuthority.ts');
  const client = await repoSource('artifacts/fawri/src/lib/cashierOperatorReportsRuntime.ts');

  assert.match(server, /scope: "own_staff" \| "station"/);
  assert.match(server, /sale_attribution\.station_id = \$2/);
  assert.match(server, /sale_attribution\.device_id = \$3/);
  assert.match(server, /OR sale_attribution\.staff_id = \$5/);
  assert.doesNotMatch(
    server,
    /sale_attribution\.shift_id\s*=/,
    'server sale.view_own report must span the employee previous shifts',
  );
  assert.match(server, /scope: canViewAll \? "station" : "own_staff"/);

  assert.match(client, /scope\?: 'own_staff' \| 'station'/);
  assert.match(client, /binding\.merchant_id !== session\.context\.merchant_id/);
  assert.match(client, /binding\.station_id !== session\.context\.station_id/);
  assert.match(client, /binding\.device_id !== session\.context\.device_id/);
  assert.match(client, /binding\.staff_id === session\.context\.staff_id/);
  assert.doesNotMatch(
    client,
    /binding\.shift_id === session\.context\.shift_id/,
    'offline report fallback must span the employee previous shifts too',
  );
  assert.match(client, /scope !== 'own_staff' && scope !== 'station'/);
  assert.match(client, /\? 'station' : 'own_staff'/);
});


test('online and offline operator reports keep the same top-product limit', async () => {
  const server = await apiSource('src/services/postgresCashierCentralReportAuthority.ts');
  const client = await repoSource('artifacts/fawri/src/lib/cashierOperatorReportsRuntime.ts');

  assert.match(server, /const DEFAULT_TOP_PRODUCTS = 10/);
  assert.match(client, /const OPERATOR_REPORT_TOP_PRODUCTS = 10/);
  assert.match(client, /topProductsLimit: OPERATOR_REPORT_TOP_PRODUCTS/);
});
