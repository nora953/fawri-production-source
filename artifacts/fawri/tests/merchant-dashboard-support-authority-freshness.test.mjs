import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../', import.meta.url);

async function source(path) {
  return readFile(new URL(path, root), 'utf8');
}

test('support authority is derived from the authenticated merchant session', async () => {
  const routes = await source('../api-server/src/routes/auth-support-postgres-routes.ts');

  assert.match(routes, /router\.get\(\s*"\/support\/tickets"/);
  assert.match(routes, /requireSecureMerchantSession/);
  assert.match(routes, /listMerchantSupportTicketsPostgres\(merchantId\(res\)\)/);
  assert.match(
    routes,
    /function merchantId\(res: Response\): string \{[\s\S]*getAuthContext\(res\)\?\.merchantProfile\?\.merchantId/,
  );
});

test('support reads use same-origin no-store authority and only newest read can apply', async () => {
  const page = await source('src/pages/dashboard/SupportPage.tsx');

  assert.match(page, /fetch\('\/api\/auth\/support\/tickets', \{[\s\S]*credentials: 'same-origin'/);
  assert.match(page, /cache: 'no-store'/);
  assert.match(page, /const requestId = \+\+loadRequestIdRef\.current/);
  assert.match(page, /if \(requestId !== loadRequestIdRef\.current\) return;/);
  assert.match(page, /loadRequestIdRef\.current \+= 1/);
});

test('silent support refresh failure becomes stale instead of silently trusting old data', async () => {
  const page = await source('src/pages/dashboard/SupportPage.tsx');

  assert.match(page, /hasConfirmedAuthorityRef\.current/);
  assert.match(page, /setStaleAuthority\(true\)/);
  assert.match(page, /setStaleAuthority\(false\)/);
  assert.match(page, /staleAuthority && tickets\.length > 0/);
  assert.match(page, /loadError \|\| \(staleAuthority && tickets\.length === 0\)/);

  const unavailableIndex = page.indexOf("loadError || (staleAuthority && tickets.length === 0)");
  const emptyIndex = page.indexOf("tickets.length === 0 ? (");
  assert.ok(unavailableIndex >= 0 && emptyIndex > unavailableIndex);
});

test('support mutations fail closed while authority freshness is unconfirmed', async () => {
  const page = await source('src/pages/dashboard/SupportPage.tsx');

  assert.match(page, /const mutationsAllowed = !loading && !loadError && !staleAuthority/);
  assert.match(page, /if \(!mutationsAllowed\) return;/);
  assert.match(page, /!mutationsAllowed \|\|[\s\S]*latestInspectionRequest/);
  assert.match(page, /disabled=\{replying \|\| !mutationsAllowed\}/);
  assert.match(page, /disabled=\{!mutationsAllowed \|\| replying \|\| !reply\.trim\(\)\}/);
});

test('support freshness copy exists in Arabic, Sorani Kurdish, and English', async () => {
  const copy = await source('src/lib/translations/features/pages/dashboard/SupportPage.ts');

  assert.match(copy, /SUPPORT_PAGE_AUTHORITY_TEXT/);
  assert.match(copy, /ar:\s*\{/);
  assert.match(copy, /ku:\s*\{/);
  assert.match(copy, /en:\s*\{/);
  assert.match(copy, /staleTitle:/);
  assert.match(copy, /staleBody:/);
  assert.match(copy, /unavailableTitle:/);
  assert.match(copy, /unavailableBody:/);
});
