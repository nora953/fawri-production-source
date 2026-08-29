import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(here, '..', '..', '..');

function read(relativePath) {
  return fs.readFileSync(path.join(repositoryRoot, relativePath), 'utf8');
}

test('merchant settings server authority is session-derived and version protected', () => {
  const source = read('artifacts/api-server/src/routes/merchant-settings.ts');

  assert.match(source, /router\.get\(\s*"\/settings",\s*requireMerchantSession/);
  assert.match(source, /router\.patch\(\s*"\/settings",\s*requireMerchantSession/);
  assert.match(source, /getMerchantIdFromSession\(res\)/);
  assert.match(source, /getMerchantOperationalSettingsAuthoritative/);
  assert.match(source, /updateMerchantOperationalSettingsAuthoritative/);
  assert.match(source, /expectedVersion:\s*req\.body\?\.expected_version/);
});

test('settings reads require canonical no-store same-origin responses and validate records', () => {
  const source = read('artifacts/fawri/src/pages/dashboard/ServerSettingsPage.tsx');

  assert.match(source, /fetch\('\/api\/settings',\s*\{[\s\S]*credentials:\s*'same-origin'/);
  assert.match(source, /cache:\s*'no-store'/);
  assert.match(source, /headers:\s*\{\s*Accept:\s*'application\/json'\s*\}/);
  assert.match(source, /function isMerchantSettings\(value: unknown\): value is MerchantSettings/);
  assert.match(source, /!isMerchantSettings\(data\.settings\)/);
});

test('settings authority only applies the newest read and language changes do not refetch operational state', () => {
  const source = read('artifacts/fawri/src/pages/dashboard/ServerSettingsPage.tsx');

  assert.match(source, /const loadRequestIdRef = useRef\(0\)/);
  assert.match(source, /const requestId = \+\+loadRequestIdRef\.current/);
  assert.match(source, /if \(requestId !== loadRequestIdRef\.current\) return/);
  assert.match(source, /loadRequestIdRef\.current \+= 1/);
  assert.match(source, /useEffect\(\(\) => \{[\s\S]*void loadSettings\(\);[\s\S]*\}, \[\]\);/);
  assert.doesNotMatch(source, /\}, \[language\]\);/);
});

test('failed settings refresh preserves stale data but fails closed for edits and persistence', () => {
  const source = read('artifacts/fawri/src/pages/dashboard/ServerSettingsPage.tsx');

  assert.match(source, /type AuthorityStatus = 'loading' \| 'ready' \| 'unavailable'/);
  assert.match(source, /setAuthorityStatus\('unavailable'\)/);
  assert.doesNotMatch(source, /setSettings\(null\)|setDraft\(null\)|setRegional\(null\)/);
  assert.match(source, /authorityStatus !== 'ready'\) return/);
  assert.match(source, /disabled=\{!dirty \|\| saving \|\| loading \|\| authorityStatus !== 'ready'\}/);
  assert.match(source, /<fieldset disabled=\{authorityStatus !== 'ready' \|\| saving\}/);
});

test('settings mutation validates confirmed server state and retains optimistic conflict protection', () => {
  const source = read('artifacts/fawri/src/pages/dashboard/ServerSettingsPage.tsx');

  assert.match(source, /method:\s*'PATCH'/);
  assert.match(source, /credentials:\s*'same-origin'/);
  assert.match(source, /expected_version:\s*settings\.version/);
  assert.match(source, /MERCHANT_SETTINGS_VERSION_CONFLICT/);
  assert.match(source, /isMerchantSettings\(data\.current_settings\)/);
  assert.match(source, /!isMerchantSettings\(data\.settings\)/);
  assert.match(source, /await loadSettings\(true\)/);
});
