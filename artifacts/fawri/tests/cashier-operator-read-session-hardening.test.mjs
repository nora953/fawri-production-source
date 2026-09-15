import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../', import.meta.url);

async function source(path) {
  return readFile(new URL(path, root), 'utf8');
}

test('history snapshot rechecks current local operator visibility before exposing sales', async () => {
  const runtime = await source('src/lib/cashierOperatorHistoryRuntime.ts');
  const snapshotStart = runtime.indexOf('async snapshot(limit)');
  const sessionRead = runtime.indexOf('const currentSession = await getCashierOperatorSession()', snapshotStart);
  const loginRequired = runtime.indexOf('CASHIER_OPERATOR_LOGIN_REQUIRED', sessionRead);
  const visibilityOwn = runtime.indexOf("cashierOperatorCan(currentSession, 'sale.view_own')", sessionRead);
  const visibilityAll = runtime.indexOf("cashierOperatorCan(currentSession, 'sale.view_all')", sessionRead);
  const filtered = runtime.indexOf('filterSnapshot(currentSession, await base.snapshot(limit))', sessionRead);

  assert.ok(snapshotStart >= 0, 'operator history snapshot wrapper must exist');
  assert.ok(sessionRead > snapshotStart, 'history reads must reread the current local session');
  assert.ok(loginRequired > sessionRead, 'expired/missing history session must fail closed');
  assert.ok(visibilityOwn > sessionRead, 'current own-sale visibility must be checked');
  assert.ok(visibilityAll > sessionRead, 'current all-sale visibility must be checked');
  assert.ok(filtered > visibilityOwn && filtered > visibilityAll, 'history filtering must use the current session');
});

test('report build rechecks current local operator permissions before server or offline report', async () => {
  const runtime = await source('src/lib/cashierOperatorReportsRuntime.ts');
  const buildStart = runtime.indexOf('async buildReport(options = {})');
  const sessionRead = runtime.indexOf('const currentSession = await getCashierOperatorSession()', buildStart);
  const loginRequired = runtime.indexOf('CASHIER_OPERATOR_LOGIN_REQUIRED', sessionRead);
  const reportsPermission = runtime.indexOf("cashierOperatorCan(currentSession, 'reports.sales')", sessionRead);
  const ownPermission = runtime.indexOf("cashierOperatorCan(currentSession, 'sale.view_own')", sessionRead);
  const allPermission = runtime.indexOf("cashierOperatorCan(currentSession, 'sale.view_all')", sessionRead);
  const profitPermission = runtime.indexOf("cashierOperatorCan(currentSession, 'reports.profit')", sessionRead);
  const server = runtime.indexOf('serverReport(currentSession, options)', sessionRead);
  const binding = runtime.indexOf('bindingVisible(currentSession, bindings.get(sale.operation_id))', sessionRead);

  assert.ok(buildStart >= 0, 'operator report build wrapper must exist');
  assert.ok(sessionRead > buildStart, 'report reads must reread the current local session');
  assert.ok(loginRequired > sessionRead, 'expired/missing report session must fail closed');
  assert.ok(reportsPermission > sessionRead, 'reports.sales must be checked on the current session');
  assert.ok(ownPermission > sessionRead && allPermission > sessionRead, 'sale visibility must be checked on the current session');
  assert.ok(profitPermission > sessionRead, 'reports.profit must be recalculated from the current session');
  assert.ok(server > profitPermission, 'server report must use the current session');
  assert.ok(binding > server, 'offline local filtering must also use the current session');
});
