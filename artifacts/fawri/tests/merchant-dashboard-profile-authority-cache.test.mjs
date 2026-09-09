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

function route(source, pattern, label) {
  const match = source.match(pattern)?.[0];
  assert.ok(match, `${label} route must exist`);
  return match;
}

function assertNoStoreBefore(source, laterPattern, label) {
  const headerIndex = source.indexOf('res.setHeader("Cache-Control", "no-store")');
  const laterIndex = source.search(laterPattern);
  assert.ok(headerIndex >= 0, `${label} must set Cache-Control: no-store`);
  assert.ok(laterIndex >= 0, `${label} authority operation must exist`);
  assert.ok(
    headerIndex < laterIndex,
    `${label} must become non-cacheable before authority work or early errors`,
  );
}

test('merchant auth authority reads are explicitly non-cacheable on every response path', () => {
  const source = read('artifacts/api-server/src/routes/auth-session-routes.ts');

  const sessionsRoute = route(
    source,
    /router\.get\("\/sessions", requireSecureMerchantSession,[\s\S]*?\n\}\);/,
    'merchant /api/auth/sessions',
  );
  assertNoStoreBefore(sessionsRoute, /getAuthContext\(res\)!/, 'merchant /api/auth/sessions');
  assert.match(sessionsRoute, /listActiveSessions\([\s\S]*context\.account\.id/);

  const lifecycleRoute = route(
    source,
    /router\.get\("\/lifecycle",[\s\S]*?\n\}\);/,
    'merchant /api/auth/lifecycle',
  );
  assertNoStoreBefore(lifecycleRoute, /getSessionToken\(req, "merchant"\)/, 'merchant /api/auth/lifecycle');
  assert.match(lifecycleRoute, /findMerchantByIdAuthoritative\(/);

  const merchantProfileRoute = route(
    source,
    /router\.get\("\/me", requireSecureMerchantSession,[\s\S]*?\n\}\);/,
    'merchant /api/auth/me',
  );
  assertNoStoreBefore(merchantProfileRoute, /getAuthContext\(res\)!/, 'merchant /api/auth/me');
  assert.match(
    merchantProfileRoute,
    /findMerchantByIdAuthoritative\(context\.account\.id\)/,
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
