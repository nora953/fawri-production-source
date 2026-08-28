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
  assert.match(checkoutRequest, /provider/);
  assert.match(checkoutRequest, /idempotency_key/);
  assert.doesNotMatch(checkoutRequest, /(?:amount_iqd|monthly_price_iqd|price_iqd)\s*:/);
  assert.match(panel, /order\.amount_iqd\.toLocaleString/);
  assert.match(panel, /superqi_sandbox/);
  assert.match(panel, /fastpay/);
  assert.match(panel, /merchant_setup_required/);
  assert.match(panel, /catalog\.providers/);
  assert.match(panel, /window\.location\.assign\(redirectUrl\)/);
  assert.match(panel, /checkout\?\.redirect_url/);
  assert.doesNotMatch(panel, /[?&]paid=true/);
});

test('billing catalog and order history fail independently and visibly', async () => {
  const panel = await read('src/components/SaasBillingPanel.tsx');

  assert.match(panel, /Promise\.allSettled/);
  assert.match(panel, /catalogStatus/);
  assert.match(panel, /ordersStatus/);
  assert.match(panel, /setCatalogStatus\('unavailable'\)/);
  assert.match(panel, /setOrdersStatus\('unavailable'\)/);
  assert.match(panel, /text\.authorityUnavailableTitle/);
  assert.match(panel, /text\.authorityUnavailableBody/);
  assert.match(panel, /text\.retry/);
  assert.match(panel, /text\.recentUnavailable/);
  assert.match(panel, /text\.recentEmpty/);
  assert.doesNotMatch(panel, /if \(loading \|\| !catalog\) return null/);

  const catalogRequest = panel.slice(
    panel.indexOf("fetch('/api/auth/billing/catalog'"),
    panel.indexOf("fetch('/api/auth/billing/orders'"),
  );
  assert.match(catalogRequest, /credentials:\s*'include'/);
  assert.match(catalogRequest, /cache:\s*'no-store'/);

  const ordersStart = panel.indexOf("fetch('/api/auth/billing/orders'");
  const ordersEnd = panel.indexOf(']);', ordersStart);
  const ordersRequest = panel.slice(ordersStart, ordersEnd);
  assert.match(ordersRequest, /credentials:\s*'include'/);
  assert.match(ordersRequest, /cache:\s*'no-store'/);
});

test('billing authority state copy exists in all supported languages', async () => {
  const copy = await read('src/lib/translations/saasBilling.ts');

  for (const key of [
    'authorityUnavailableTitle',
    'authorityUnavailableBody',
    'retry',
    'recentUnavailable',
    'recentEmpty',
  ]) {
    const matches = copy.match(new RegExp(`${key}:`, 'g')) || [];
    assert.equal(matches.length, 3, `${key} must exist for Arabic, English, and Sorani Kurdish`);
  }
});
