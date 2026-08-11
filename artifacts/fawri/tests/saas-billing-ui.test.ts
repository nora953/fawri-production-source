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

  const checkoutStart = panel.indexOf("fetch('/api/auth/billing/checkout'");
  const checkoutEnd = panel.indexOf('const data =', checkoutStart);
  assert.ok(checkoutStart >= 0 && checkoutEnd > checkoutStart, 'checkout request block missing');
  const checkoutRequest = panel.slice(checkoutStart, checkoutEnd);
  assert.match(checkoutRequest, /operation/);
  assert.match(checkoutRequest, /plan/);
  assert.match(checkoutRequest, /idempotency_key/);
  assert.doesNotMatch(checkoutRequest, /(?:amount_iqd|monthly_price_iqd|price_iqd)\s*:/);
  assert.match(panel, /order\.amount_iqd\.toLocaleString/);
  assert.match(panel, /superqi_sandbox/);
  assert.match(panel, /window\.location\.assign\(redirectUrl\)/);
  assert.match(panel, /checkout\?\.redirect_url/);
  assert.doesNotMatch(panel, /[?&]paid=true/);
});
