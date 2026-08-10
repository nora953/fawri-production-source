import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../', import.meta.url);
const read = (relative: string) => readFile(new URL(relative, root), 'utf8');

test('subscription page uses server billing catalog and does not invent paid state', async () => {
  const page = await read('src/pages/dashboard/SubscriptionPage.tsx');
  const panel = await read('src/components/SaasBillingPanel.tsx');

  assert.match(page, /SaasBillingPanel/);
  assert.match(panel, /\/api\/auth\/billing\/catalog/);
  assert.match(panel, /\/api\/auth\/billing\/orders/);
  assert.match(panel, /\/api\/auth\/billing\/checkout/);
  assert.match(panel, /checkout_available/);
  assert.match(panel, /idempotency_key/);
  assert.doesNotMatch(panel, /paid:\s*true/);
  assert.doesNotMatch(panel, /amount_iqd\s*:/);
});
