import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../', import.meta.url);
const read = (relative) => readFile(new URL(relative, root), 'utf8');

test('merchant lifecycle exposes the authoritative merchant identity', async () => {
  const route = await read('../api-server/src/routes/auth-session-routes.ts');
  const lifecycle = await read('src/lib/merchantLifecycle.ts');

  assert.match(route, /merchant_id:\s*validated\.session\.account_id/);
  assert.match(lifecycle, /merchant_id:\s*string/);
  assert.match(lifecycle, /result\.lifecycle\.merchant_id/);
  assert.match(lifecycle, /merchant_id:\s*merchantId/);
});

test('dashboard binds cached and refreshed profiles to the lifecycle merchant identity', async () => {
  const layout = await read('src/components/layout/DashboardLayout.tsx');

  assert.match(layout, /lifecycleMerchantId\s*=\s*lifecycle\.lifecycle\.merchant_id/);
  assert.match(layout, /profileMerchantId/);
  assert.match(layout, /profileMerchantId\s*!==\s*lifecycleMerchantId/);
  assert.match(layout, /updated\.id\s*!==\s*lifecycleMerchantId/);
  assert.match(layout, /cached\.id\s*===\s*lifecycleMerchantId/);
  assert.match(layout, /setCheckingAccess\(true\)/);
});
