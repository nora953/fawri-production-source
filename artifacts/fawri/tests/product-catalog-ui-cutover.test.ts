import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  CatalogApiError,
  createCatalogProduct,
  currentProductFromConflict,
  deleteCatalogProduct,
  idempotencyAttemptForRequest,
  importCatalogProducts,
  listCatalogProducts,
  updateCatalogProduct,
  type CatalogFetch,
  type CatalogProduct,
  type CatalogProductInput,
} from '../src/lib/catalogUiApi.ts';

const productsPage = await readFile(
  new URL('../src/pages/dashboard/ProductsPage.tsx', import.meta.url),
  'utf8',
);
const importPage = await readFile(
  new URL('../src/pages/dashboard/ImportProductsPage.tsx', import.meta.url),
  'utf8',
);

const product: CatalogProduct = {
  id: 'prd-1',
  merchant_id: 'merchant-server-only',
  external_ref: 'EXT-1',
  name: 'Catalog Product',
  description: 'Description',
  category: 'General',
  sku: 'SKU-1',
  barcode: 'BAR-1',
  price_iqd: 12000,
  compare_at_price_iqd: 15000,
  stock_quantity: 10,
  low_stock_threshold: 5,
  status: 'available',
  allow_fawri_reply: true,
  image_refs: [],
  variants: [],
  created_at: '2026-08-08T00:00:00.000Z',
  updated_at: '2026-08-08T00:00:00.000Z',
  version: 4,
};

const input: CatalogProductInput = {
  name: 'Catalog Product',
  description: 'Description',
  category: 'General',
  sku: 'SKU-1',
  barcode: 'BAR-1',
  price_iqd: 12000,
  compare_at_price_iqd: 15000,
  stock_quantity: 10,
  status: 'available',
  allow_fawri_reply: true,
};

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function capturedFetch(
  body: unknown,
  status = 200,
): {
  fetcher: CatalogFetch;
  calls: Array<{ input: string; init: RequestInit }>;
} {
  const calls: Array<{ input: string; init: RequestInit }> = [];
  const fetcher: CatalogFetch = async (request, init = {}) => {
    calls.push({ input: String(request), init });
    return response(body, status);
  };
  return { fetcher, calls };
}

test('canonical load uses only GET /api/catalog/products', async () => {
  const { fetcher, calls } = capturedFetch({ ok: true, products: [product] });
  const result = await listCatalogProducts(fetcher);
  assert.deepEqual(result, [product]);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].input, '/api/catalog/products');
  assert.equal(calls[0].init.method, undefined);
});

test('create success uses canonical endpoint and server result', async () => {
  const { fetcher, calls } = capturedFetch({ ok: true, replayed: false, product }, 201);
  const result = await createCatalogProduct(input, 'catalog-create-test-key', fetcher);
  assert.equal(result.id, product.id);
  assert.equal(calls[0].input, '/api/catalog/products');
  assert.equal(calls[0].init.method, 'POST');
  assert.equal(new Headers(calls[0].init.headers).get('Idempotency-Key'), 'catalog-create-test-key');
  const sent = JSON.parse(String(calls[0].init.body));
  assert.equal(sent.price_iqd, 12000);
  assert.equal(sent.compare_at_price_iqd, 15000);
  assert.equal(sent.stock_quantity, 10);
  assert.equal('merchant_id' in sent, false);
});

test('create failure rejects and ProductsPage cannot mark it saved before await succeeds', async () => {
  const { fetcher } = capturedFetch(
    { ok: false, code: 'CATALOG_SKU_DUPLICATE', error: 'duplicate sku' },
    409,
  );
  await assert.rejects(
    () => createCatalogProduct(input, 'catalog-create-test-key', fetcher),
    (error: unknown) =>
      error instanceof CatalogApiError && error.code === 'CATALOG_SKU_DUPLICATE',
  );

  const createAwait = productsPage.indexOf('const created = await createCatalogProduct');
  const createStateWrite = productsPage.indexOf(
    'setProducts(existing => upsertServerProduct(existing, created))',
  );
  assert.ok(createAwait >= 0, 'ProductsPage must await canonical create');
  assert.ok(
    createStateWrite > createAwait,
    'React product state must update only after canonical create succeeds',
  );
});

test('idempotent create retry reuses a strong key only for the same request', () => {
  const first = idempotencyAttemptForRequest(null, 'catalog-create', input);
  const retry = idempotencyAttemptForRequest(first, 'catalog-create', { ...input });
  const changed = idempotencyAttemptForRequest(first, 'catalog-create', {
    ...input,
    price_iqd: 13000,
  });

  assert.equal(retry.key, first.key);
  assert.notEqual(changed.key, first.key);
  assert.match(first.key, /^catalog-create-/);
  assert.ok(first.key.length >= 40, 'idempotency key must contain cryptographic entropy');
  assert.match(productsPage, /createAttemptRef\.current/);
});

test('edit sends expected_version and never sends client merchant authority', async () => {
  const updated = { ...product, version: 5, name: 'Updated Product' };
  const { fetcher, calls } = capturedFetch({ ok: true, product: updated });
  const result = await updateCatalogProduct(product.id, product.version, {
    ...input,
    name: 'Updated Product',
  }, fetcher);

  assert.equal(result.version, 5);
  assert.equal(calls[0].input, `/api/catalog/products/${product.id}`);
  assert.equal(calls[0].init.method, 'PATCH');
  const sent = JSON.parse(String(calls[0].init.body));
  assert.equal(sent.expected_version, 4);
  assert.equal('merchant_id' in sent, false);
});

test('version conflict exposes current server product for replacement/reload', () => {
  const current = { ...product, version: 7, name: 'Server Current' };
  const error = new CatalogApiError(
    'CATALOG_VERSION_CONFLICT',
    'product was changed by another request',
    409,
    {
      expected_version: 4,
      current_version: 7,
      current_product: current,
    },
  );

  assert.deepEqual(currentProductFromConflict(error), current);
  assert.match(productsPage, /getCatalogProduct\(productId\)/);
  assert.match(productsPage, /versionConflict/);
});

test('delete sends expected_version and removes UI state only after server success', async () => {
  const { fetcher, calls } = capturedFetch({
    ok: true,
    deleted_product_id: product.id,
    deleted_version: product.version,
  });
  await deleteCatalogProduct(product.id, product.version, fetcher);
  assert.equal(calls[0].init.method, 'DELETE');
  const sent = JSON.parse(String(calls[0].init.body));
  assert.deepEqual(sent, { expected_version: 4 });

  const deleteAwait = productsPage.indexOf('await deleteCatalogProduct(product.id, product.version)');
  const deleteStateWrite = productsPage.indexOf(
    'setProducts(existing => existing.filter(item => item.id !== product.id))',
  );
  assert.ok(deleteStateWrite > deleteAwait);
});

test('import success uses canonical atomic endpoint with idempotency key', async () => {
  const { fetcher, calls } = capturedFetch({
    ok: true,
    replayed: false,
    created_count: 1,
    products: [product],
  }, 201);
  const created = await importCatalogProducts([input], 'catalog-import-test-key', fetcher);
  assert.equal(created.length, 1);
  assert.equal(calls[0].input, '/api/catalog/products/import');
  assert.equal(calls[0].init.method, 'POST');
  assert.equal(new Headers(calls[0].init.headers).get('Idempotency-Key'), 'catalog-import-test-key');
  const sent = JSON.parse(String(calls[0].init.body));
  assert.deepEqual(sent.products, [input]);
  assert.equal('merchant_id' in sent.products[0], false);
});

test('import validation failure is visible and stops before canonical import call', () => {
  assert.match(importPage, /external reference, SKU, or barcode is required/);
  assert.match(importPage, /setValidationErrors\(errors\)/);
  const validationGate = importPage.indexOf('if (errors.length > 0)');
  const importCall = importPage.indexOf('const created = await importCatalogProducts');
  assert.ok(validationGate >= 0 && importCall > validationGate);
  assert.doesNotMatch(importPage, /existingSkus/);
  assert.doesNotMatch(importPage, /skippedCount/);
});

test('legacy write/sync and browser storage authority are absent from catalog UI', () => {
  for (const source of [productsPage, importPage]) {
    assert.doesNotMatch(source, /['"]\/api\/products['"]/);
    assert.doesNotMatch(source, /\/api\/bot\/products\/sync/);
    assert.doesNotMatch(source, /\bsaveProducts\b/);
    assert.doesNotMatch(source, /\bgetProducts\b/);
    assert.doesNotMatch(source, /localStorage/);
    assert.doesNotMatch(source, /sessionStorage/);
  }
  assert.match(productsPage, /listCatalogProducts\(\)/);
  assert.match(importPage, /importCatalogProducts\(products, attempt\.key\)/);
});

test('cross-merchant identity is never supplied by the catalog client as authority', () => {
  assert.doesNotMatch(productsPage, /merchant_id\s*:/);
  assert.doesNotMatch(importPage, /merchant_id\s*:/);
  assert.doesNotMatch(productsPage, /merchantId=/);
  assert.doesNotMatch(importPage, /merchantId=/);
});
