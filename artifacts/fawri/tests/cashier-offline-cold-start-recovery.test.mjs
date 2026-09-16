import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../', import.meta.url);

async function source(path) {
  return readFile(new URL(path, root), 'utf8');
}

test('cashier service worker atomically caches the executable asset graph for cold start', async () => {
  const sw = await source('public/cashier-sw.js');

  assert.match(sw, /CACHE_VERSION = 'v3'/);
  assert.match(sw, /async function installAtomicCashierShell\(\)/);
  assert.match(sw, /const shellResponse = await fetchRequired\('\/cashier\.html'\)/);
  assert.match(sw, /const entryAssets = htmlAssetPaths\(shellText\)/);
  assert.match(sw, /const assetResponses = await collectAssetGraph\(entryAssets\)/);
  assert.match(sw, /await caches\.delete\(CACHE_NAME\)/);
  assert.match(sw, /await cache\.put\('\/cashier\.html', shellResponse\.clone\(\)\)/);
  assert.match(sw, /javascriptDependencyPaths/);
  assert.match(sw, /cssDependencyPaths/);
  assert.match(sw, /installAtomicCashierShell\(\)\.then\(\(\) => self\.skipWaiting\(\)\)/);
  assert.match(sw, /request\.mode === 'navigate' && url\.pathname === '\/cashier\.html'/);
  assert.match(sw, /networkWithCacheFallback\(request, '\/cashier\.html'\)/);
});

test('offline operator resume is bounded to the current device station shift and original expiry', async () => {
  const resume = await source('src/lib/cashierOfflineOperatorResume.ts');

  assert.match(resume, /OFFLINE_OPERATOR_RECORD_ID = 'offline-operator-session'/);
  assert.match(resume, /navigator\.onLine !== false/);
  assert.match(resume, /new Date\(session\.context\.operator_expires_at\)\.getTime\(\)/);
  assert.match(resume, /expiresAt <= Date\.now\(\)/);
  assert.match(resume, /session\.context\.merchant_id === binding\.merchant_id/);
  assert.match(resume, /session\.context\.station_id === binding\.station_id/);
  assert.match(resume, /session\.context\.device_id === binding\.device_id/);
  assert.match(resume, /session\.context\.station_token === binding\.station_token/);
  assert.match(resume, /sessionStorage\.setItem\(OPERATOR_STORAGE_KEY, JSON\.stringify\(record\.session\)\)/);
});

test('offline resume lease is cleared on logout/session change and cashier authorization failures', async () => {
  const resume = await source('src/lib/cashierOfflineOperatorResume.ts');

  assert.match(resume, /fawri:cashier-operator-session-changed/);
  assert.match(resume, /fawri:cashier-operator-session-invalidated/);
  assert.match(resume, /url\.pathname\.startsWith\('\/api\/cashier\/'\)/);
  assert.match(resume, /response\.status === 401 \|\| response\.status === 403/);
  assert.match(resume, /void clearCashierOfflineOperatorResume\(\)/);
});

test('cashier restores the bounded offline shift before rendering the operator gate', async () => {
  const main = await source('src/cashierMain.tsx');
  const connectivityInstall = main.indexOf('installCashierConnectivityAuthority();');
  const resumeInstall = main.indexOf('installCashierOfflineOperatorResume();');
  const bootstrap = main.indexOf('async function bootstrapCashier');
  const restore = main.indexOf('await restoreCashierOfflineOperatorSession()', bootstrap);
  const render = main.indexOf("createRoot(document.getElementById('cashier-root')!).render", bootstrap);

  assert.ok(connectivityInstall >= 0);
  assert.ok(resumeInstall > connectivityInstall);
  assert.ok(bootstrap >= 0);
  assert.ok(restore > bootstrap);
  assert.ok(render > restore, 'offline shift must be restored before CashierOperatorGate renders');
});

test('offline shell diagnostics require the same v3 service worker generation', async () => {
  const shell = await source('src/lib/cashierOfflineAppShell.ts');
  assert.match(shell, /CASHIER_SW_VERSION = 'v3'/);
  assert.match(shell, /controllerVersion === CASHIER_SW_VERSION/);
  assert.match(shell, /ready_for_cold_start/);
});
