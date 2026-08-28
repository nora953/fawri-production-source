import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../', import.meta.url);
const read = (relative) => readFile(new URL(relative, root), 'utf8');

test('unread notification count never converts authority failure into zero', async () => {
  const hook = await read('src/hooks/useMerchantNotifications.ts');

  assert.match(hook, /MerchantNotificationCountState/);
  assert.match(hook, /'loading'/);
  assert.match(hook, /'unavailable'/);
  assert.match(hook, /cache:\s*'no-store'/);
  assert.match(hook, /credentials:\s*'same-origin'/);
  assert.match(hook, /Array\.isArray\(data\.notifications\)/);
  assert.doesNotMatch(hook, /!response\.ok[^\n]*[\s\S]{0,120}setCount\(0\)/);
  assert.match(hook, /setCount\('unavailable'\)/);
});

test('unread notification count applies only the newest authority read', async () => {
  const hook = await read('src/hooks/useMerchantNotifications.ts');

  assert.match(hook, /loadRequestIdRef/);
  assert.match(hook, /const requestId = \+\+loadRequestIdRef\.current/);
  assert.match(hook, /requestId !== loadRequestIdRef\.current/);
  assert.match(hook, /loadRequestIdRef\.current \+= 1/);
});

test('desktop and mobile navigation expose unavailable notification authority', async () => {
  const [sidebar, bottomNav] = await Promise.all([
    read('src/components/layout/Sidebar.tsx'),
    read('src/components/layout/BottomNav.tsx'),
  ]);

  for (const source of [sidebar, bottomNav]) {
    assert.match(source, /MerchantNotificationCountState/);
    assert.match(source, /count === ['"]unavailable['"]/);
    assert.match(source, /notifications_load_error/);
    assert.match(source, />!<|\{unavailable \? ['"]!['"]/);
  }
});
