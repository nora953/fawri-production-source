import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import express from 'express';
import {
  firstCommercialPosDisabled,
  isFirstCommercialPosRoute,
  enforceFirstCommercialPosCutover,
} from '../src/middleware/firstCommercialPosCutover.ts';

const appSource = await readFile(new URL('../src/app.ts', import.meta.url), 'utf8');
const webhookSource = await readFile(
  new URL('../src/services/superQiSandboxWebhook.ts', import.meta.url), 'utf8',
);

test('production POS shutdown is unconditional; development remains testable', () => {
  assert.equal(firstCommercialPosDisabled({ NODE_ENV: 'production' }), true);
  assert.equal(firstCommercialPosDisabled({
    NODE_ENV: 'production', FAWRI_V1_POS_DISABLED: '0',
  }), true, 'cannot reopen excluded POS by production env flip');
  assert.equal(firstCommercialPosDisabled({ NODE_ENV: 'development' }), false);
  assert.equal(firstCommercialPosDisabled({
    NODE_ENV: 'development', FAWRI_V1_POS_DISABLED: '1',
  }), true);
  assert.equal(isFirstCommercialPosRoute('/api/cashier/subscription'), true);
  assert.equal(isFirstCommercialPosRoute('/api/cashier/operator/sync/sale'), true);
  assert.equal(isFirstCommercialPosRoute('/api/cashier/station/pair'), true);
  assert.equal(isFirstCommercialPosRoute('/api/admin/merchants/merchant-1/cashier/subscription'), true);
  assert.equal(isFirstCommercialPosRoute('/api/auth/admin/merchants/m1/cashier/subscription'), true);
  assert.equal(isFirstCommercialPosRoute('/api/%63ashier/sync/sale'), true);
  assert.equal(isFirstCommercialPosRoute('/cashier.html'), true);
  assert.equal(isFirstCommercialPosRoute('/manifest.webmanifest'), true);
  assert.equal(isFirstCommercialPosRoute('/api/billing/checkout'), false);
  assert.equal(isFirstCommercialPosRoute('/api/billing/providers/superqi/webhook'), false);
  assert.equal(isFirstCommercialPosRoute('/api/reports/online'), false);
  assert.equal(isFirstCommercialPosRoute('/api/order/abc'), false);
  assert.equal(isFirstCommercialPosRoute('/cashier-sw.js'), false,
    'retirement worker must remain reachable to deactivate legacy offline SW');
});

test('real HTTP denies all direct POS methods before handler while orders and SaaS remain reachable', async () => {
  const savedEnv = {
    NODE_ENV: process.env.NODE_ENV,
    FAWRI_V1_POS_DISABLED: process.env.FAWRI_V1_POS_DISABLED,
  };
  process.env.NODE_ENV = 'production';
  process.env.FAWRI_V1_POS_DISABLED = '0';
  const mockApp = express();
  let downstreamHitCount = 0;
  mockApp.use(enforceFirstCommercialPosCutover);
  mockApp.use((req, res) => {
    downstreamHitCount++;
    res.json({ ok: true, path: req.path });
  });
  const server = createServer(mockApp);
  try {
    await new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', resolve);
    });
    const base = 'http://127.0.0.1:' + server.address().port;
    const blocked = [
      ['GET', '/api/cashier/subscription'],
      ['POST', '/api/cashier/billing/checkout'],
      ['POST', '/api/cashier/sync/sale'],
      ['POST', '/api/cashier/operator/sync/return'],
      ['POST', '/api/cashier/station/pair'],
      ['POST', '/api/cashier/management/staff'],
      ['GET', '/api/admin/merchants/test-merchant/cashier/subscription'],
      ['GET', '/api/auth/admin/merchants/test-merchant/cashier/subscription'],
      ['POST', '/api/%63ashier/operator/sync/sale'],
    ];
    for (const [method, pathname] of blocked) {
      const response = await fetch(base + pathname, { method });
      const body = await response.json();
      assert.equal(response.status, 403, method + ' ' + pathname);
      assert.equal(body.code, 'FAWRI_V1_POS_NOT_OFFERED', pathname);
      assert.match(response.headers.get('cache-control') || '', /no-store/);
    }
    for (const path of ['/cashier.html', '/manifest.webmanifest']) {
      const response = await fetch(base + path);
      assert.equal(response.status, 410, 'must not serve POS HTML or installation manifest');
    }
    assert.equal(downstreamHitCount, 0, 'all POS routes denied before ANY handler');
    const allowed = [
      ['GET', '/api/reports/online'],
      ['POST', '/api/billing/checkout'],
      ['POST', '/api/billing/providers/superqi/webhook'],
      ['GET', '/api/order/example'],
      ['GET', '/cashier-sw.js'],
    ];
    for (const [method, pathname] of allowed) {
      const response = await fetch(base + pathname, { method });
      assert.equal(response.status, 200, 'unrelated merchant route / retirement worker must survive');
      assert.equal((await response.json()).ok, true);
    }
    assert.equal(downstreamHitCount, allowed.length);
  } finally {
    await new Promise(resolve => server.close(resolve));
    for (const [key, value] of Object.entries(savedEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});

test('actual mounted app cuts off POS before auth, business handlers and static fallback', () => {
  const guard = appSource.indexOf('app.use(enforceFirstCommercialPosCutover);');
  const firstAuth = appSource.indexOf('app.use("/api/auth", authSecurityRouter);');
  const firstCashier = appSource.indexOf('app.use("/api", cashierSubscriptionOperationsRouter);');
  const legacy = appSource.indexOf('app.use("/api", router);');
  const staticMount = appSource.indexOf('app.use(express.static(webDistDir,');
  assert.ok(guard >= 0 && guard < firstAuth && guard < firstCashier &&
    guard < legacy && guard < staticMount,
    'one global mounted denial must protect modern + legacy + built static routes');
});

test('verified legacy POS money is retained without activating cashier seats', () => {
  const admitted = webhookSource.indexOf('fawri_admit_verified_payment_receipt(');
  const held = webhookSource.indexOf('order.authority === "cashier_subscription" && firstCommercialPosDisabled()');
  const apply = webhookSource.indexOf('await applyVerifiedCashierBillingProviderEvent(commonEvent');
  const saas = webhookSource.indexOf('await applyVerifiedSaasBillingProviderEvent(commonEvent');
  assert.ok(admitted >= 0 && admitted < held && held < apply && saas > held,
    'provider receipt admission must precede deny; SaaS plan branch must remain intact');
  assert.match(webhookSource,/FAWRI_V1_POS_PAYMENT_HELD_FOR_RECONCILIATION/);
  assert.match(webhookSource,/503,/);
  assert.doesNotMatch(webhookSource,/indexedDB\.deleteDatabase|DELETE FROM cashier_/);
});
