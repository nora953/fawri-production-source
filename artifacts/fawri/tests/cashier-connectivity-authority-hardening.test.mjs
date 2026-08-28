import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const fawriRoot = new URL('../', import.meta.url);

async function source(path) {
  return readFile(new URL(path, fawriRoot), 'utf8');
}

test('cashier connectivity authority combines browser and actual cashier API transport evidence', async () => {
  const authority = await source('src/lib/cashierConnectivity.ts');

  assert.match(authority, /CashierConnectivityState/);
  assert.match(authority, /network_failure/);
  assert.match(authority, /network_response/);
  assert.match(authority, /readNativeNavigatorOnline/);
  assert.match(authority, /url\.pathname\.startsWith\('\/api\/cashier\/'\)/);
  assert.match(authority, /window\.fetch = wrappedFetch/);
  assert.match(authority, /cause instanceof TypeError/);
  assert.match(authority, /markCashierNetworkFailure\(\)/);
  assert.match(authority, /markCashierNetworkResponse\(\)/);
});

test('cashier connectivity bridge makes existing navigator consumers read authoritative transport truth', async () => {
  const authority = await source('src/lib/cashierConnectivity.ts');

  assert.match(authority, /Object\.defineProperty\(navigator, 'onLine'/);
  assert.match(authority, /get: \(\) => currentState\.online/);
  assert.match(authority, /broadcastingCompatibilityEvent/);
  assert.match(authority, /new Event\(next\.online \? 'online' : 'offline'\)/);
  assert.match(authority, /next\.source !== 'browser'/);
});

test('cashier entry installs connectivity authority before rendering and keeps retry eligibility on native browser signal', async () => {
  const entry = await source('src/cashierMain.tsx');

  assert.match(entry, /installCashierConnectivityAuthority/);
  assert.match(entry, /cashierNetworkAttemptAllowed/);
  assert.match(entry, /if \(!cashierNetworkAttemptAllowed\(\)\)/);

  const installIndex = entry.indexOf('installCashierConnectivityAuthority();');
  const renderIndex = entry.indexOf("createRoot(document.getElementById('cashier-root')!).render");
  assert.ok(installIndex >= 0 && renderIndex > installIndex);
});

test('POS, History and Reports remain on one navigator contract now owned by cashier connectivity authority', async () => {
  const pos = await source('src/pages/CashierPosPage.tsx');
  const history = await source('src/pages/CashierHistoryPage.tsx');
  const reports = await source('src/lib/cashierOperatorReportsRuntime.ts');

  assert.match(pos, /navigator\.onLine/);
  assert.match(history, /navigator\.onLine/);
  assert.match(reports, /navigator\.onLine/);
});

test('connectivity observation does not weaken operator-session HTTP rejection semantics', async () => {
  const session = await source('src/lib/cashierOperatorSessionRuntime.ts');

  assert.match(session, /response\.status === 401/);
  assert.match(session, /sessionStorage\.removeItem\(OPERATOR_STORAGE_KEY\)/);
  assert.match(session, /CASHIER_OPERATOR_VALIDATE_FAILED/);
});
