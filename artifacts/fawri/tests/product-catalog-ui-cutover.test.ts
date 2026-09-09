import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  adjustCatalogInventory,
  CatalogApiError,
  createCatalogProduct,
  currentProductFromConflict,
  deleteCatalogProduct,
  idempotencyAttemptForRequest,
  importCatalogProducts,
  listCatalogProducts,
  setCatalogInventory,
  updateCatalogProduct,
  type CatalogFetch,
  type CatalogProduct,
  type CatalogProductInput,
} from '../src/lib/catalogUiApi.ts';
import {
  catalogProductFormFromProduct,
  catalogProductInputFromForm,
  createEmptyCatalogImageDraft,
  createEmptyCatalogOptionDraft,
  createEmptyCatalogVariantDraft,
  validateCatalogProductForm,
} from '../src/lib/catalogProductEditor.ts';

const productsRoute = await readFile(
  new URL('../src/pages/dashboard/ProductsPage.tsx', import.meta.url),
  'utf8',
);
const productsWorkspace = await readFile(
  new URL('../src/pages/dashboard/ProductsWorkspacePage.tsx', import.meta.url),
  'utf8',
);
const catalogPage = await readFile(
  new URL('../src/pages/dashboard/CommerceCatalogSimplifiedPage.tsx', import.meta.url),
  'utf8',
);
const productDetails = await readFile(
  new URL('../src/components/catalog/CatalogProductDetailsEditor.tsx', import.meta.url),
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
  item_type: 'product',
  track_inventory: true,
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

const variantProduct: CatalogProduct = {
  ...product,
  id: 'prd-variants',
  sku: 'TEE-PARENT',
  barcode: undefined,
  stock_quantity: 5,
  image_refs: [
    {
      id: 'img-product',
      url: 'https://cdn.example.test/tee.jpg',
      alt: 'T-shirt',
    },
  ],
  variants: [
    {
      id: 'var-black-m',
      name: 'Black / M',
      sku: 'TEE-BLK-M',
      barcode: '100001',
      price_iqd: 13000,
      stock_quantity: 2,
      options: { Color: 'Black', Size: 'M' },
      image_refs: [
        {
          id: 'img-variant',
          storage_key: 'catalog/merchant/tee-black-m.jpg',
          alt: 'Black medium',
        },
      ],
      created_at: '2026-08-08T00:00:00.000Z',
      updated_at: '2026-08-08T00:00:00.000Z',
    },
    {
      id: 'var-blue-l',
      name: 'Blue / L',
      sku: 'TEE-BLU-L',
      barcode: '100002',
      stock_quantity: 3,
      options: { Color: 'Blue', Size: 'L' },
      image_refs: [],
      created_at: '2026-08-08T00:00:00.000Z',
      updated_at: '2026-08-08T00:00:00.000Z',
    },
  ],
};

const input: CatalogProductInput = {
  item_type: 'product',
  track_inventory: true,
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

test('active products route reaches the canonical simplified commerce workspace', () => {
  assert.match(productsRoute, /export \{ default \} from ['"]\.\/ProductsWorkspacePage['"]/);
  assert.match(productsWorkspace, /import CommerceCatalogPage from ['"]\.\/CommerceCatalogSimplifiedPage['"]/);
  assert.match(productsWorkspace, /<CommerceCatalogPage \/>/);
  assert.match(catalogPage, /CatalogEditorShell/);
  assert.match(catalogPage, /CatalogProductDetailsEditor/);
});

test('active catalog money follows merchant currency scale instead of a fixed IQD UI', () => {
  assert.match(catalogPage, /getCatalogCommerceContext/);
  assert.match(catalogPage, /catalogMoneyFormForDisplay/);
  assert.match(catalogPage, /catalogMoneyFormForAuthority/);
  assert.match(catalogPage, /validateCatalogMoneyForm/);
  assert.match(catalogPage, /formatMerchantNumber/);
  assert.match(catalogPage, /merchantCurrencyLabel/);
  assert.match(catalogPage, /catalogEffectivePriceRange/);
  assert.match(catalogPage, /currency_fraction_digits/);
  assert.doesNotMatch(catalogPage, /t\.products_currency/);
});

test('canonical load uses only GET /api/catalog/products', async () => {
  const { fetcher, calls } = capturedFetch({ ok: true, products: [product] });
  const result = await listCatalogProducts(fetcher);
  assert.deepEqual(result, [product]);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].input, '/api/catalog/products');
  assert.equal(calls[0].init.method, undefined);
});

test('product without variants still serializes canonical product stock for CRUD', () => {
  const form = catalogProductFormFromProduct(product);
  assert.equal(validateCatalogProductForm(form), null);
  const serialized = catalogProductInputFromForm(form, product);
  assert.equal(serialized.stock_quantity, 10);
  assert.deepEqual(serialized.variants, []);
  assert.deepEqual(serialized.image_refs, []);
});

test('variant editor round-trips options, SKU/barcode, price, stock and image refs', () => {
  const form = catalogProductFormFromProduct(variantProduct);
  assert.equal(validateCatalogProductForm(form), null);
  assert.equal(form.variants.length, 2);
  assert.equal(form.variants[0].sku, 'TEE-BLK-M');
  assert.equal(form.variants[0].barcode, '100001');
  assert.equal(form.variants[0].price_iqd, '13000');
  assert.equal(form.image_refs[0].url, 'https://cdn.example.test/tee.jpg');

  const serialized = catalogProductInputFromForm(form, variantProduct);
  assert.equal('stock_quantity' in serialized, false, 'variant-managed product must omit root stock authority');
  assert.equal(serialized.variants?.length, 2);
  assert.deepEqual(serialized.variants?.[0].options, { Color: 'Black', Size: 'M' });
  assert.equal(serialized.variants?.[0].sku, 'TEE-BLK-M');
  assert.equal(serialized.variants?.[0].barcode, '100001');
  assert.equal(serialized.variants?.[0].price_iqd, 13000);
  assert.equal(serialized.variants?.[0].stock_quantity, 2);
  assert.deepEqual(serialized.variants?.[0].image_refs, [
    {
      id: 'img-variant',
      storage_key: 'catalog/merchant/tee-black-m.jpg',
      alt: 'Black medium',
    },
  ]);
});

test('variant add/edit/remove stays generic and removal is represented by the saved variants array', () => {
  const form = catalogProductFormFromProduct(variantProduct);
  form.variants[0].options[0].value = 'Jet Black';
  form.variants = form.variants.slice(0, 1);

  const added = createEmptyCatalogVariantDraft();
  added.name = 'Green / XL';
  added.sku = 'TEE-GRN-XL';
  added.barcode = '100003';
  added.price_iqd = '14000';
  added.stock_quantity = '4';
  const color = createEmptyCatalogOptionDraft();
  color.name = 'Color';
  color.value = 'Green';
  const size = createEmptyCatalogOptionDraft();
  size.name = 'Size';
  size.value = 'XL';
  added.options = [color, size];
  const image = createEmptyCatalogImageDraft();
  image.url = 'https://cdn.example.test/green-xl.jpg';
  added.image_refs = [image];
  form.variants.push(added);

  assert.equal(validateCatalogProductForm(form), null);
  const serialized = catalogProductInputFromForm(form, variantProduct);
  assert.equal(serialized.variants?.length, 2);
  assert.equal(serialized.variants?.some(variant => variant.id === 'var-blue-l'), false);
  assert.deepEqual(serialized.variants?.[0].options, { Color: 'Jet Black', Size: 'M' });
  assert.deepEqual(serialized.variants?.[1].options, { Color: 'Green', Size: 'XL' });
  assert.equal(serialized.variants?.[1].stock_quantity, 4);
});

test('image editor requires a URL or storage key and never creates browser storage authority', () => {
  const form = catalogProductFormFromProduct(product);
  const image = createEmptyCatalogImageDraft();
  image.alt = 'Alt without locator';
  form.image_refs = [image];
  assert.equal(validateCatalogProductForm(form), 'image_reference');

  assert.match(catalogPage, /CatalogImageUploadEditor/);
  assert.doesNotMatch(catalogPage, /base64|FileReader|createObjectURL/);
  assert.doesNotMatch(catalogPage, /localStorage|sessionStorage/);
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

  const createAwait = catalogPage.indexOf('const created = await createCatalogProduct');
  const createStateWrite = catalogPage.indexOf('setItems(currentItems => upsert(currentItems, created))');
  assert.ok(createAwait >= 0 && createStateWrite > createAwait);
});

test('create failure rejects before React state can claim success', async () => {
  const { fetcher } = capturedFetch(
    { ok: false, code: 'CATALOG_SKU_DUPLICATE', error: 'duplicate sku' },
    409,
  );
  await assert.rejects(
    () => createCatalogProduct(input, 'catalog-create-test-key', fetcher),
    (error: unknown) =>
      error instanceof CatalogApiError && error.code === 'CATALOG_SKU_DUPLICATE',
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
  assert.match(catalogPage, /createAttempt\.current/);
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
  assert.match(catalogPage, /getCatalogProduct\(productId\)/);
  assert.match(catalogPage, /versionConflict/);
});

test('delete sends expected_version and removes UI state only after server success', async () => {
  const { fetcher, calls } = capturedFetch({
    ok: true,
    deleted_product_id: product.id,
    deleted_version: product.version,
  });
  await deleteCatalogProduct(product.id, product.version, fetcher);
  assert.equal(calls[0].init.method, 'DELETE');
  assert.deepEqual(JSON.parse(String(calls[0].init.body)), { expected_version: 4 });

  const deleteAwait = catalogPage.indexOf('await deleteCatalogProduct(product.id, product.version)');
  const deleteStateWrite = catalogPage.indexOf('setItems(current => current.filter(item => item.id !== product.id))');
  assert.ok(deleteAwait >= 0 && deleteStateWrite > deleteAwait);
});

test('inventory set is server-authoritative and variant-scoped when supplied', async () => {
  const updated = { ...variantProduct, version: 5 };
  const { fetcher, calls } = capturedFetch({ ok: true, product: updated });
  const result = await setCatalogInventory({
    productId: variantProduct.id,
    expectedVersion: variantProduct.version,
    variantId: variantProduct.variants[0].id,
    quantity: 7,
  }, fetcher);

  assert.equal(result.version, 5);
  assert.equal(calls[0].input, `/api/inventory/products/${variantProduct.id}/set`);
  assert.deepEqual(JSON.parse(String(calls[0].init.body)), {
    expected_version: 4,
    quantity: 7,
    variant_id: 'var-black-m',
  });
});

test('inventory adjust uses canonical idempotency and expected_version contract', async () => {
  const updated = { ...variantProduct, version: 5 };
  const { fetcher, calls } = capturedFetch({ ok: true, replayed: false, product: updated });
  await adjustCatalogInventory({
    productId: variantProduct.id,
    expectedVersion: variantProduct.version,
    variantId: variantProduct.variants[1].id,
    delta: -1,
    reason: 'merchant catalog inventory UX',
  }, 'catalog-adjust-test-key', fetcher);

  assert.equal(calls[0].input, `/api/inventory/products/${variantProduct.id}/adjust`);
  assert.equal(new Headers(calls[0].init.headers).get('Idempotency-Key'), 'catalog-adjust-test-key');
});

test('variant-managed inventory UI never exposes a product-level mutation path', () => {
  const variantBranch = catalogPage.indexOf('detailsProduct.variants.length > 0 ? detailsProduct.variants.map');
  const simpleBranch = catalogPage.indexOf('}) : (() => {', variantBranch);
  const variantSet = catalogPage.indexOf('setInventory(detailsProduct, variant)', variantBranch);
  const variantAdjust = catalogPage.indexOf('adjustInventory(detailsProduct, delta, variant)', variantBranch);
  const productSet = catalogPage.indexOf('setInventory(detailsProduct)', variantBranch);
  const productAdjust = catalogPage.indexOf('adjustInventory(detailsProduct, delta)', variantBranch);

  assert.ok(variantBranch >= 0, 'details modal must branch on variant-managed inventory');
  assert.ok(simpleBranch > variantBranch, 'simple-product controls must stay in the fallback branch');
  assert.ok(variantSet > variantBranch && variantSet < simpleBranch, 'variant set must stay variant-scoped');
  assert.ok(variantAdjust > variantBranch && variantAdjust < simpleBranch, 'variant adjust must stay variant-scoped');
  assert.ok(productSet > simpleBranch, 'product-level set must exist only in the simple-product fallback');
  assert.ok(productAdjust > simpleBranch, 'product-level adjust must exist only in the simple-product fallback');
  assert.match(catalogPage, /CatalogProductDetailsEditor/);
  assert.match(productDetails, /catalogProductStockIsVariantManaged/);
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
  assert.equal(new Headers(calls[0].init.headers).get('Idempotency-Key'), 'catalog-import-test-key');
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

test('load failure is not rendered as an empty catalog', () => {
  assert.match(catalogPage, /setLoadError\(true\)/);
  assert.match(catalogPage, /loadError \?/);
  assert.doesNotMatch(catalogPage, /catch[\s\S]{0,300}setItems\(\[\]\)/);
});

test('legacy write sync and browser storage authority are absent from active catalog UI', () => {
  for (const source of [catalogPage, importPage]) {
    assert.doesNotMatch(source, /['"]\/api\/products['"]/);
    assert.doesNotMatch(source, /\/api\/bot\/products\/sync/);
    assert.doesNotMatch(source, /\bsaveProducts\b/);
    assert.doesNotMatch(source, /\bgetProducts\b/);
    assert.doesNotMatch(source, /localStorage/);
    assert.doesNotMatch(source, /sessionStorage/);
  }
  assert.match(catalogPage, /listCatalogProducts\(\)/);
  assert.match(importPage, /importCatalogProducts\(products, attempt\.key\)/);
});

test('cross-merchant identity is never supplied by the catalog client as authority', () => {
  assert.doesNotMatch(catalogPage, /merchant_id\s*:/);
  assert.doesNotMatch(importPage, /merchant_id\s*:/);
  assert.doesNotMatch(catalogPage, /merchantId=/);
  assert.doesNotMatch(importPage, /merchantId=/);
});
