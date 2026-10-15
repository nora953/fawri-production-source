import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = (path: string) =>
  readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8');

test('retired admin bearer storage is never used as session authority', () => {
  const store = source('lib/store.ts');

  assert.doesNotMatch(
    store,
    /sessionStorage\.getItem\(LEGACY_ADMIN_SESSION_TOKEN_KEY\)/,
  );
  assert.doesNotMatch(
    store,
    /sessionStorage\.setItem\(LEGACY_ADMIN_SESSION_TOKEN_KEY/,
  );
  assert.match(store, /Auth v2 credentials live exclusively in the HttpOnly admin session cookie/);
});

test('admin request headers carry device binding without bearer credentials', () => {
  const store = source('lib/store.ts');

  assert.match(store, /'X-Fawri-Device-Id': getAdminDeviceId\(\)/);
  assert.doesNotMatch(store, /Authorization:\s*`Bearer/);
});

test('legacy UI presence checks cannot disappear when auth cutover removes the old token', () => {
  const store = source('lib/store.ts');
  const launcher = source('components/admin/EmergencyReadAccessLauncher.tsx');

  assert.match(
    store,
    /window\.location\.pathname\.startsWith\('\/admin'\)[\s\S]*auth-v2-cookie-session/,
  );
  assert.match(launcher, /getAdminSessionToken\(\)/);
  assert.match(
    launcher,
    /\/api\/auth\/admin\/emergency-read-access\/overview/,
  );
});

test('admin logout revokes the HttpOnly Auth v2 session through the canonical endpoint', () => {
  const store = source('lib/store.ts');

  assert.match(store, /fetch\('\/api\/auth\/admin\/logout'/);
  assert.match(store, /const isAdminRoute =/);
  assert.match(store, /if \(isAdminRoute\) \{/);
  assert.match(store, /clearAdminSession\(\);/);
});

test('browser transport strips historical bearer headers and keeps device binding', () => {
  const cutover = source('lib/authClientCutover.ts');

  assert.match(cutover, /headers\.delete\('Authorization'\)/);
  assert.match(cutover, /headers\.set\('X-Fawri-Device-Id'/);
  assert.match(cutover, /credentials: 'same-origin'/);
});
