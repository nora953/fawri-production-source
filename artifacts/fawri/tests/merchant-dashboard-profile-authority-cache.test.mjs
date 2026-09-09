import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(here, '../../..');

function read(relativePath) {
  return readFileSync(path.join(repositoryRoot, relativePath), 'utf8');
}

test('merchant profile authority is session-derived and explicitly non-cacheable', () => {
  const source = read('artifacts/api-server/src/routes/auth-session-routes.ts');
  const merchantProfileRoute = source.match(
    /router\.get\("\/me", requireSecureMerchantSession,[\s\S]*?\n\}\);/,
  )?.[0];

  assert.ok(merchantProfileRoute, 'merchant /api/auth/me route must exist');
  assert.match(merchantProfileRoute, /getAuthContext\(res\)!/);
  assert.match(
    merchantProfileRoute,
    /findMerchantByIdAuthoritative\(context\.account\.id\)/,
  );
  assert.match(
    merchantProfileRoute,
    /res\.setHeader\("Cache-Control", "no-store"\)/,
  );
  assert.match(merchantProfileRoute, /payload\(account\)/);
});

test('dashboard profile acceptance remains bound to lifecycle merchant identity', () => {
  const layout = read('artifacts/fawri/src/components/layout/DashboardLayout.tsx');

  assert.match(layout, /lifecycleMerchantId = lifecycle\.lifecycle\.merchant_id/);
  assert.match(layout, /const updated = await refreshCurrentMerchantFromApi\(\)/);
  assert.match(layout, /updated\.id !== lifecycleMerchantId/);
  assert.match(layout, /cached\.id === lifecycleMerchantId/);
  assert.match(layout, /cached\.is_admin !== true/);
  assert.match(layout, /cached\.status === 'approved'/);
});
