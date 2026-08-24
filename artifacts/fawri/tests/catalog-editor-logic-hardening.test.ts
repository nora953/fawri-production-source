import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  buildCatalogVariantCombinations,
  catalogVariantCombinationCount,
  catalogVariantMatrixCoverage,
  catalogVariantOptionNameAvailable,
  catalogVariantOptionSetDefinitionsAreValid,
  catalogVariantValueAvailable,
  createCatalogVariantOptionSetDraft,
  regenerateCatalogVariantDrafts,
} from '../src/lib/catalogVariantMatrix.ts';
import {
  catalogProductInputFromForm,
  createEmptyCatalogProductForm,
  createEmptyCatalogVariantDraft,
} from '../src/lib/catalogProductEditor.ts';

const itemTypeEditorSource = await readFile(
  new URL('../src/components/catalog/CatalogItemTypeEditor.tsx', import.meta.url),
  'utf8',
);
const variantEditorSource = await readFile(
  new URL('../src/components/catalog/CatalogProductDetailsEditor.tsx', import.meta.url),
  'utf8',
);
const fullscreenCss = await readFile(
  new URL('../src/pages/dashboard/catalogEditorFullscreen.css', import.meta.url),
  'utf8',
);
const workspaceSource = await readFile(
  new URL('../src/pages/dashboard/ProductsWorkspacePage.tsx', import.meta.url),
  'utf8',
);

test('two option dimensions generate the complete cartesian matrix', () => {
  const sets = [
    createCatalogVariantOptionSetDraft('Color', ['Black', 'White']),
    createCatalogVariantOptionSetDraft('Size', ['S', 'M', 'L']),
  ];
  assert.equal(catalogVariantCombinationCount(sets), 6);
  assert.deepEqual(
    buildCatalogVariantCombinations(sets),
    [
      { Color: 'Black', Size: 'S' },
      { Color: 'Black', Size: 'M' },
      { Color: 'Black', Size: 'L' },
      { Color: 'White', Size: 'S' },
      { Color: 'White', Size: 'M' },
      { Color: 'White', Size: 'L' },
    ],
  );
});

test('expanding a sparse matrix preserves exact saved variants and custom names only', () => {
  const small = createEmptyCatalogVariantDraft();
  small.id = 'var-small';
  small.name = 'صغير';
  small.sku = 'VAR-B-S';
  small.price_iqd = '12000';
  small.stock_quantity = '3';
  small.options = [
    { key: 'c1', name: 'Color', value: 'black' },
    { key: 's1', name: 'Size', value: 'S' },
  ];

  const large = createEmptyCatalogVariantDraft();
  large.id = 'var-large';
  large.name = 'كبير';
  large.price_iqd = '15000';
  large.stock_quantity = '1';
  large.options = [
    { key: 'c2', name: 'Color', value: 'red' },
    { key: 's2', name: 'Size', value: 'L' },
  ];

  const sets = [
    createCatalogVariantOptionSetDraft('Color', ['black', 'red', 'أزرق']),
    createCatalogVariantOptionSetDraft('Size', ['S', 'L', 'XL']),
  ];
  const generated = regenerateCatalogVariantDrafts(sets, [small, large], true);

  assert.equal(generated.length, 9);
  const preservedSmall = generated.find(item => item.id === 'var-small');
  const preservedLarge = generated.find(item => item.id === 'var-large');
  assert.equal(preservedSmall?.name, 'صغير');
  assert.equal(preservedSmall?.sku, 'VAR-B-S');
  assert.equal(preservedSmall?.price_iqd, '12000');
  assert.equal(preservedSmall?.stock_quantity, '3');
  assert.equal(preservedLarge?.name, 'كبير');
  assert.equal(preservedLarge?.price_iqd, '15000');
  assert.equal(preservedLarge?.stock_quantity, '1');
  assert.equal(generated.filter(item => item.id).length, 2);
  assert.equal(generated.filter(item => !item.id).every(item => item.stock_quantity === '0'), true);
});

test('complete matrix rename keeps canonical row identity while updating automatic names', () => {
  const first = createEmptyCatalogVariantDraft();
  first.id = 'v1';
  first.name = 'Black / S';
  first.sku = 'SKU-1';
  first.options = [
    { key: 'c1', name: 'Color', value: 'Black' },
    { key: 's1', name: 'Size', value: 'S' },
  ];
  const second = createEmptyCatalogVariantDraft();
  second.id = 'v2';
  second.name = 'White / S';
  second.options = [
    { key: 'c2', name: 'Color', value: 'White' },
    { key: 's2', name: 'Size', value: 'S' },
  ];

  const renamed = regenerateCatalogVariantDrafts(
    [
      createCatalogVariantOptionSetDraft('Shade', ['Jet Black', 'Snow']),
      createCatalogVariantOptionSetDraft('Size', ['S']),
    ],
    [first, second],
    true,
  );

  assert.equal(renamed[0].id, 'v1');
  assert.equal(renamed[0].sku, 'SKU-1');
  assert.equal(renamed[0].name, 'Jet Black / S');
  assert.equal(renamed[1].id, 'v2');
  assert.equal(renamed[1].name, 'Snow / S');
});

test('sparse matrices never use positional fallback to copy identity into unrelated combinations', () => {
  const existing = createEmptyCatalogVariantDraft();
  existing.id = 'only-black-s';
  existing.name = 'Small';
  existing.sku = 'KEEP-ME';
  existing.options = [
    { key: 'c', name: 'Color', value: 'Black' },
    { key: 's', name: 'Size', value: 'S' },
  ];

  const generated = regenerateCatalogVariantDrafts(
    [
      createCatalogVariantOptionSetDraft('Color', ['Black', 'White']),
      createCatalogVariantOptionSetDraft('Size', ['S', 'M']),
    ],
    [existing],
    true,
  );

  assert.equal(generated.length, 4);
  assert.equal(generated[0].id, 'only-black-s');
  assert.equal(generated.slice(1).some(item => item.id === 'only-black-s'), false);
  assert.equal(generated.slice(1).some(item => item.sku === 'KEEP-ME'), false);
});

test('matrix coverage reports legacy sparse combinations truthfully', () => {
  const first = createEmptyCatalogVariantDraft();
  first.options = [
    { key: 'c1', name: 'Color', value: 'Black' },
    { key: 's1', name: 'Size', value: 'S' },
  ];
  const second = createEmptyCatalogVariantDraft();
  second.options = [
    { key: 'c2', name: 'Color', value: 'Red' },
    { key: 's2', name: 'Size', value: 'L' },
  ];
  const sets = [
    createCatalogVariantOptionSetDraft('Color', ['Black', 'Red']),
    createCatalogVariantOptionSetDraft('Size', ['S', 'L']),
  ];
  assert.deepEqual(catalogVariantMatrixCoverage(sets, [first, second]), {
    expectedCount: 4,
    existingCount: 2,
    missingCount: 2,
    complete: false,
  });
});

test('duplicate option names and duplicate values fail closed', () => {
  const duplicateNames = [
    createCatalogVariantOptionSetDraft('Color', ['Black']),
    createCatalogVariantOptionSetDraft('color', ['Blue']),
  ];
  assert.equal(catalogVariantOptionSetDefinitionsAreValid(duplicateNames), false);
  assert.equal(catalogVariantCombinationCount(duplicateNames), 0);
  assert.deepEqual(buildCatalogVariantCombinations(duplicateNames), []);

  const set = createCatalogVariantOptionSetDraft('Size', ['M']);
  assert.equal(catalogVariantValueAvailable(set, 'm'), false);
  assert.equal(catalogVariantOptionNameAvailable([set], 'size'), false);
});

test('service serialization ignores preserved product-only draft data', () => {
  const form = createEmptyCatalogProductForm();
  const variant = createEmptyCatalogVariantDraft();
  variant.name = 'Black / S';
  variant.sku = 'VAR-1';
  variant.stock_quantity = '4';
  variant.options = [
    { key: 'c', name: 'Color', value: 'Black' },
    { key: 's', name: 'Size', value: 'S' },
  ];
  form.name = 'Consultation';
  form.item_type = 'service';
  form.track_inventory = true;
  form.sku = 'PRODUCT-SKU';
  form.barcode = '123456';
  form.quantity = '99';
  form.weight_kg = '1.5';
  form.variants = [variant];
  form.service_price_type = 'custom';

  const input = catalogProductInputFromForm(form);
  assert.equal(input.item_type, 'service');
  assert.equal(input.track_inventory, false);
  assert.equal(input.sku, '');
  assert.equal(input.barcode, '');
  assert.deepEqual(input.variants, []);
  assert.equal(input.stock_quantity, 0);
  assert.equal(input.weight_g, null);
  assert.equal(input.price_iqd, 0);
});

test('type switching source preserves product draft fields instead of destroying them', () => {
  assert.doesNotMatch(itemTypeEditorSource, /variants:\s*\[\]/);
  assert.doesNotMatch(itemTypeEditorSource, /sku:\s*''/);
  assert.doesNotMatch(itemTypeEditorSource, /barcode:\s*''/);
  assert.doesNotMatch(itemTypeEditorSource, /quantity:\s*'0'/);
  assert.match(itemTypeEditorSource, /item_type:\s*'service'/);
  assert.match(itemTypeEditorSource, /item_type:\s*'product'/);
});

test('variant editor exposes labels, inherited price, safe sparse completion, and bidi isolation', () => {
  assert.match(variantEditorSource, /incompleteMatrix/);
  assert.match(variantEditorSource, /completeMissing/);
  assert.match(variantEditorSource, /inheritedPrice/);
  assert.match(variantEditorSource, /variantSku/);
  assert.match(variantEditorSource, /variantQuantity/);
  assert.match(variantEditorSource, /<bdi>/);
  assert.match(variantEditorSource, /MAX_VARIANTS = 100/);
});

test('catalog create/edit workspace is full-screen and responsive', () => {
  assert.match(workspaceSource, /catalogEditorFullscreen\.css/);
  assert.match(fullscreenCss, /height:\s*100dvh/);
  assert.match(fullscreenCss, /max-width:\s*none/);
  assert.match(fullscreenCss, /grid-template-columns:\s*repeat\(2/);
  assert.match(fullscreenCss, /@media \(max-width: 900px\)/);
});
