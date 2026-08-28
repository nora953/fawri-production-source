import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const fawriRoot = new URL('../', import.meta.url);

async function source(path) {
  return readFile(new URL(path, fawriRoot), 'utf8');
}

test('cashier connectivity authority combines browser and actual cashier API transport evidence', async () => {
  const authority = await source('src/lib/cashierConnectivity.ts');

  assert.match(authority, /nativeNavigatorOnlineReader/);
  assert.match(authority, /Object\.defineProperty\(navigator, 'onLine'/);
  assert.match(authority, /window\.fetch = wrappedFetch/);
  assert.match(authority, /pathname\.startsWith\('\/api\/cashier\/'\)/);
  assert.match(authority, /markCashierNetworkFailure/);
  assert.match(authority, /markCashierNetworkResponse/);
});

test('cashier connectivity bridge makes existing navigator consumers read authoritative transport truth', async () => {
  const authority = await source('src/lib/cashierConnectivity.ts');

  assert.match(authority, /get: \(\) => currentState\.online/);
  assert.match(authority, /new Event\(next\.online \? 'online' : 'offline'\)/);
  assert.match(authority, /broadcastingCompatibilityEvent/);
});

test('cashier entry installs connectivity authority before rendering and keeps retry eligibility on native browser signal', async () => {
  const entry = await source('src/cashierMain.tsx');

  assert.match(entry, /installCashierConnectivityAuthority\(\);/);
  assert.match(entry, /if \(!cashierNetworkAttemptAllowed\(\)\)/);
  assert.ok(
    entry.indexOf('installCashierConnectivityAuthority();') <
      entry.indexOf("createRoot(document.getElementById('cashier-root')!).render"),
    'connectivity authority must be installed before cashier React pages render',
  );
});

test('POS, History and Reports remain on one navigator contract now owned by cashier connectivity authority', async () => {
  const pos = await source('src/pages/CashierPosPage.tsx');
  const history = await source('src/pages/CashierHistoryPage.tsx');
  const reports = await source('src/lib/cashierOperatorReportsRuntime.ts');

  assert.match(pos, /useState\(\(\) => navigator\.onLine\)/);
  assert.match(history, /useState\(\(\) => navigator\.onLine\)/);
  assert.match(history, /if \(navigator\.onLine === false\) return;/);
  assert.match(reports, /if \(navigator\.onLine !== false\)/);
});

test('connectivity observation does not weaken operator-session HTTP rejection semantics', async () => {
  const session = await source('src/lib/cashierOperatorSessionRuntime.ts');
  const policy = await source('src/lib/cashierOperatorPolicyRefresh.ts');

  assert.match(session, /response\.status === 401/);
  assert.match(session, /sessionStorage\.removeItem\(OPERATOR_STORAGE_KEY\)/);
  assert.match(policy, /if \(response\.status === 401\)/);
  assert.match(policy, /invalidateCashierOperatorSession\(\)/);
});
