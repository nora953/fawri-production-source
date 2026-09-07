import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const apiRoot = new URL('../', import.meta.url);
const webRoot = new URL('../../fawri/', import.meta.url);

async function apiSource(path) {
  return readFile(new URL(path, apiRoot), 'utf8');
}

async function webSource(path) {
  return readFile(new URL(path, webRoot), 'utf8');
}

test('cashier catalog snapshot is derived only from the authenticated merchant context', async () => {
  const authority = await apiSource(
    'src/services/cashierOperatorCommerceAuthority.ts',
  );

  assert.match(
    authority,
    /listCatalogProductsAuthoritative\(context\.merchant_id\)/,
  );
  assert.match(
    authority,
    /listCommercePromotionsAuthoritative\(context\.merchant_id\)/,
  );
  assert.match(authority, /merchant_id: context\.merchant_id/);
});

test('cashier browser refuses cross-merchant catalog payloads before replacing local catalog', async () => {
  const cloudSync = await webSource('src/lib/cashierOperatorCloudSync.ts');

  assert.match(
    cloudSync,
    /text\(payload\.merchant_id\) !== session\.context\.merchant_id/,
  );
  assert.match(
    cloudSync,
    /productMerchantId !== input\.merchantId/,
  );
  assert.match(cloudSync, /CASHIER_OPERATOR_CATALOG_TENANT_MISMATCH/);
  assert.match(
    cloudSync,
    /identity\.cloud_merchant_id !== session\.context\.merchant_id/,
  );

  const responseTenantCheck = cloudSync.indexOf(
    'text(payload.merchant_id) !== session.context.merchant_id',
  );
  const replaceSnapshot = cloudSync.indexOf(
    'await replaceLocalCommerceSnapshot({',
  );
  assert.ok(responseTenantCheck >= 0, 'catalog response tenant must be checked');
  assert.ok(
    replaceSnapshot > responseTenantCheck,
    'local catalog replacement must happen only after tenant validation',
  );
});

test('cashier sale cannot resolve or mutate a product owned by another merchant', async () => {
  const operatorAuthority = await apiSource(
    'src/services/cashierOperatorCommerceAuthority.ts',
  );
  const saleAuthority = await apiSource(
    'src/services/postgresCashierSyncAuthority.ts',
  );

  assert.match(
    operatorAuthority,
    /identity\.cloudMerchantId !== context\.merchant_id/,
  );
  assert.match(operatorAuthority, /CASHIER_SYNC_TENANT_MISMATCH/);
  assert.match(
    operatorAuthority,
    /merchantId: input\.context\.merchant_id/,
  );

  assert.match(
    saleAuthority,
    /FROM products[\s\S]{0,180}WHERE merchant_id = \$1 AND id = \$2 AND deleted_at IS NULL/,
  );
  assert.match(
    saleAuthority,
    /FROM product_variants[\s\S]{0,180}WHERE merchant_id = \$1 AND product_id = \$2/,
  );
  assert.match(
    saleAuthority,
    /UPDATE products[\s\S]{0,260}WHERE merchant_id = \$1 AND id = \$2/,
  );
});

test('a paired cashier device cannot silently rebind to another merchant', async () => {
  const sessionRuntime = await webSource(
    'src/lib/cashierOperatorSessionRuntime.ts',
  );

  assert.match(
    sessionRuntime,
    /identity\.cloud_merchant_id && identity\.cloud_merchant_id !== merchantId/,
  );
  assert.match(sessionRuntime, /CASHIER_DEVICE_MERCHANT_MISMATCH/);
});
