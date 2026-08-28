import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const fawriRoot = new URL('../', import.meta.url);

async function source(path) {
  return readFile(new URL(path, fawriRoot), 'utf8');
}

test('cashier connectivity authority combines browser and actual network evidence', async () => {
  const authority = await source('src/lib/cashierConnectivity.ts');

  assert.match(authority, /CashierConnectivityState/);
  assert.match(authority, /navigator\.onLine !== false/);
  assert.match(authority, /markCashierNetworkFailure/);
  assert.match(authority, /markCashierNetworkResponse/);
  assert.match(authority, /subscribeCashierConnectivity/);
  assert.match(authority, /network_failure/);
  assert.match(authority, /network_response/);
});

test('operator validation records transport truth without weakening 401 rejection', async () => {
  const session = await source('src/lib/cashierOperatorSessionRuntime.ts');

  assert.match(session, /cashierNetworkAttemptAllowed/);
  assert.match(session, /markCashierNetworkFailure/);
  assert.match(session, /markCashierNetworkResponse/);
  assert.match(session, /response = await fetch\('\/api\/cashier\/operator\/me'/);
  assert.match(session, /response\.status === 401/);
  assert.match(session, /sessionStorage\.removeItem\(OPERATOR_STORAGE_KEY\)/);
});

test('policy refresh updates the same connectivity authority', async () => {
  const policy = await source('src/lib/cashierOperatorPolicyRefresh.ts');

  assert.match(policy, /cashierNetworkAttemptAllowed/);
  assert.match(policy, /markCashierNetworkFailure/);
  assert.match(policy, /markCashierNetworkResponse/);
  assert.match(policy, /\/api\/cashier\/operator\/me/);
});

test('POS and History consume shared cashier connectivity instead of raw navigator status', async () => {
  const pos = await source('src/pages/CashierPosPage.tsx');
  const history = await source('src/pages/CashierHistoryPage.tsx');

  for (const page of [pos, history]) {
    assert.match(page, /cashierConnectivityIsOnline/);
    assert.match(page, /subscribeCashierConnectivity/);
    assert.doesNotMatch(page, /setOnline\(navigator\.onLine\)/);
    assert.doesNotMatch(page, /useState\(\(\) => navigator\.onLine\)/);
  }
  assert.match(history, /cashierNetworkAttemptAllowed/);
  assert.doesNotMatch(history, /if \(navigator\.onLine === false\) return;/);
});

test('cashier auto sync uses shared connectivity truth for UI and coarse browser signal only for retry eligibility', async () => {
  const entry = await source('src/cashierMain.tsx');

  assert.match(entry, /cashierConnectivityIsOnline/);
  assert.match(entry, /cashierNetworkAttemptAllowed/);
  assert.match(entry, /function cashierIsOnline\(\): boolean/);
  assert.doesNotMatch(entry, /return navigator\.onLine !== false;/);
});
