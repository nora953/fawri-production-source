import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const root = fileURLToPath(new URL('../', import.meta.url));
const dist = path.join(root, 'dist/public');

test('actual V1 production bundle excludes executable cashier HTML and offline install target', async () => {
  await stat(path.join(dist, 'index.html'));
  await assert.rejects(stat(path.join(dist, 'cashier.html')),
    'new commercial release cannot include independent cashier entry');
  const worker = await readFile(path.join(dist, 'cashier-sw.js'), 'utf8');
  assert.match(worker, /FAWRI commercial V1: POS retired/);
  assert.match(worker, /self\.registration\.unregister/);
  assert.doesNotMatch(worker, /installAtomicCashierShell|FAWRI_CASHIER_WARM_CACHE/);
  assert.doesNotMatch(worker, /^\s*(?:await\s+)?(?:caches\.delete|indexedDB\.deleteDatabase|localStorage\.clear)/m,
    'do not delete offline financial evidence or local caches during retirement');
  const manifest = JSON.parse(await readFile(path.join(dist, 'manifest.webmanifest'), 'utf8'));
  assert.equal(manifest.start_url, '/');
  assert.doesNotMatch(JSON.stringify(manifest), /cashier\.html|cashier local/i);
});

test('production build hardcodes POS disablement and must not include cashier as a second app', async () => {
  const config = await readFile(path.join(root, 'vite.config.ts'), 'utf8');
  const app = await readFile(path.join(root, 'src/App.tsx'), 'utf8');
  const entry = await readFile(path.join(root, 'src/cashierMain.tsx'), 'utf8');
  const subscriptions = await readFile(path.join(root, 'src/pages/dashboard/SubscriptionPage.tsx'), 'utf8');
  const features = await readFile(path.join(root, 'src/hooks/useMerchantFeatureEntitlements.ts'), 'utf8');
  const reports = await readFile(path.join(root, 'src/pages/dashboard/ReportsPage.tsx'), 'utf8');
  assert.match(config, /'import\.meta\.env\.VITE_FAWRI_V1_POS_DISABLED'/);
  assert.match(config, /JSON\.stringify\(!isServe \? '1' : '0'\)/);
  assert.match(config, /retirePosForCommercialBuild/);
  assert.match(config, /\.\.\.\(isServe \? \{ cashier:/);
  assert.match(app, /firstCommercialPosDisabled \? <NotFound \/>/);
  assert.match(entry, /if \(cashierV1Disabled\)/);
  assert.match(entry, /if \(!cashierV1Disabled\)/);
  assert.match(subscriptions, /VITE_FAWRI_V1_POS_DISABLED !== '1'/);
  assert.match(features, /VITE_FAWRI_V1_POS_DISABLED === '1'/);
  assert.match(reports, /VITE_FAWRI_V1_POS_DISABLED === '1'/);
});

test('merchant order and SaaS billing controls remain in the first-commercial app', async () => {
  const app = await readFile(path.join(root, 'src/App.tsx'), 'utf8');
  assert.match(app, /<Route path="\/dashboard\/orders">/);
  assert.match(app, /<Route path="\/dashboard\/products">/);
  assert.match(app, /<Route path="\/dashboard\/subscription">/);
  assert.match(app, /<Route path="\/dashboard\/conversations">/);
});
