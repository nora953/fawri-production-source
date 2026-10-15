import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const orderRoutes = await readFile(
  new URL('../src/routes/order-operations.ts', import.meta.url),
  'utf8',
);
const cashierSyncAuthority = await readFile(
  new URL('../src/services/postgresCashierSyncAuthority.ts', import.meta.url),
  'utf8',
);

test('cashier sales remain durable internal evidence instead of merchant orders', () => {
  assert.match(cashierSyncAuthority, /source_channel\s*=\s*'cashier'/);
  assert.match(cashierSyncAuthority, /INSERT INTO orders[\s\S]*'cashier'/);

  assert.match(orderRoutes, /function isMerchantOrder/);
  assert.match(
    orderRoutes,
    /source_channel[\s\S]{0,160}!={1,2}\s*["']cashier["']/,
    'merchant order boundary must exclude cashier sale evidence',
  );
  assert.match(orderRoutes, /orders\.filter\(isMerchantOrder\)/);
});

test('cashier evidence cannot be opened or mutated through merchant Order API', () => {
  assert.match(orderRoutes, /function assertMerchantOrder/);
  assert.match(orderRoutes, /"ORDER_NOT_FOUND"/);
  assert.match(orderRoutes, /async function getMerchantOrder/);

  const preflights = orderRoutes.match(/await getMerchantOrder\(merchantId, orderId\);/g) || [];
  assert.equal(
    preflights.length,
    5,
    'status, payment status, confirm, reject, and conflict resolution must all preflight merchant-order visibility',
  );

  assert.match(
    orderRoutes,
    /router\.get\([\s\S]*?"\/order\/:orderId"[\s\S]*?getMerchantOrder\(/,
    'direct order reads must use the same merchant-order boundary',
  );
});
