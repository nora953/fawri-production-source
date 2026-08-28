import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../', import.meta.url);
const read = (relative) => readFile(new URL(relative, root), 'utf8');

test('conversation server authority derives tenant identity from the authenticated session', async () => {
  const route = await read('../api-server/src/routes/conversation-operations.ts');

  assert.match(route, /router\.get\(\s*["']\/conversations["']/);
  assert.match(route, /requireMerchantSession/);
  assert.match(route, /getMerchantIdFromSession\(res\)/);
  assert.match(route, /listServerConversationsAuthoritative\(merchantId\)/);
});

test('merchant conversations page does not depend on local merchant cache to load server data', async () => {
  const page = await read('src/pages/dashboard/ConversationsPage.tsx');

  assert.doesNotMatch(page, /getCurrentMerchant/);
  assert.doesNotMatch(page, /if \(!merchant\) return null/);
  assert.match(page, /fetch\('\/api\/conversations'/);
  assert.match(page, /credentials:\s*'same-origin'/);
  assert.match(page, /cache:\s*'no-store'/);
});

test('conversation polling only applies the newest authority read', async () => {
  const page = await read('src/pages/dashboard/ConversationsPage.tsx');

  assert.match(page, /loadRequestIdRef/);
  assert.match(page, /const requestId = \+\+loadRequestIdRef\.current/);
  assert.match(page, /requestId !== loadRequestIdRef\.current/);
});

test('conversation loading, unavailable, stale, selection, and empty states remain truthful', async () => {
  const page = await read('src/pages/dashboard/ConversationsPage.tsx');

  assert.match(page, /loadStatus/);
  assert.match(page, /'loading'/);
  assert.match(page, /'ready'/);
  assert.match(page, /'unavailable'/);
  assert.match(page, /loadStatus === 'loading'/);
  assert.match(page, /loadStatus === 'unavailable'/);
  assert.match(page, /loadStatus === 'ready' && conversations\.length === 0/);
  assert.match(page, /authorityCopy\.retry/);
  assert.match(page, /authorityCopy\.staleBody/);
  assert.match(page, /authorityCopy\.selectTitle/);
  assert.match(page, /authorityCopy\.selectBody/);
});

test('conversation authority copy exists in Arabic, English, and Sorani Kurdish', async () => {
  const copy = await read('src/lib/translations/features/pages/dashboard/ConversationsPage.ts');

  for (const key of [
    'loading',
    'unavailableTitle',
    'unavailableBody',
    'staleBody',
    'retry',
    'selectTitle',
    'selectBody',
  ]) {
    const matches = copy.match(new RegExp(`${key}:\\s*'`, 'g')) || [];
    assert.equal(matches.length, 3, `${key} must exist for Arabic, English, and Sorani Kurdish`);
  }
});
