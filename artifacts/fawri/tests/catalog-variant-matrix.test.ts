import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  catalogVariantCombinationCount,
  catalogVariantOptionSetsFromVariants,
  createCatalogVariantOptionSetDraft,
  regenerateCatalogVariantDrafts,
} from '../src/lib/catalogVariantMatrix.ts';
import { createEmptyCatalogVariantDraft } from '../src/lib/catalogProductEditor.ts';

const editorSource = await readFile(
  new URL('../src/components/catalog/CatalogProductDetailsEditor.tsx', import.meta.url),
  'utf8',
);

test('option sets generate the cartesian variant matrix', () => {
  const sets = [
    createCatalogVariantOptionSetDraft('Color', ['Black', 'White']),
    createCatalogVariantOptionSetDraft('Size', ['S', 'M', 'L']),
  ];

  assert.equal(catalogVariantCombinationCount(sets), 6);
  const variants = regenerateCatalogVariantDrafts(sets, [], true);
  assert.equal(variants.length, 6);
  assert.deepEqual(
    variants.map(variant => variant.name),
    ['Black / S', 'Black / M', 'Black / L', 'White / S', 'White / M', 'White / L'],
  );
  assert.deepEqual(
    variants[0].options.map(option => [option.name, option.value]),
    [['Color', 'Black'], ['Size', 'S']],
  );
});

test('matching generated combinations preserve canonical variant identity and merchant overrides', () => {
  const existing = createEmptyCatalogVariantDraft();
  existing.id = 'var-black-m';
  existing.name = 'Black / M';
  existing.sku = 'TEE-BLK-M';
  existing.barcode = '123456';
  existing.price_iqd = '22000';
  existing.stock_quantity = '7';
  existing.options = [
    { key: 'color', name: 'Color', value: 'Black' },
    { key: 'size', name: 'Size', value: 'M' },
  ];

  const sets = [
    createCatalogVariantOptionSetDraft('Color', ['Black']),
    createCatalogVariantOptionSetDraft('Size', ['M', 'L']),
  ];
  const variants = regenerateCatalogVariantDrafts(sets, [existing], true);

  assert.equal(variants.length, 2);
  assert.equal(variants[0].id, 'var-black-m');
  assert.equal(variants[0].sku, 'TEE-BLK-M');
  assert.equal(variants[0].barcode, '123456');
  assert.equal(variants[0].price_iqd, '22000');
  assert.equal(variants[0].stock_quantity, '7');
  assert.equal(variants[1].id, undefined);
  assert.equal(variants[1].stock_quantity, '0');
});

test('editing one option value with unchanged matrix size keeps row identity', () => {
  const existing = createEmptyCatalogVariantDraft();
  existing.id = 'var-original';
  existing.name = 'Black';
  existing.sku = 'COLOR-001';
  existing.stock_quantity = '4';
  existing.options = [{ key: 'color', name: 'Color', value: 'Black' }];

  const variants = regenerateCatalogVariantDrafts(
    [createCatalogVariantOptionSetDraft('Color', ['Jet Black'])],
    [existing],
    true,
  );

  assert.equal(variants[0].id, 'var-original');
  assert.equal(variants[0].sku, 'COLOR-001');
  assert.equal(variants[0].stock_quantity, '4');
  assert.equal(variants[0].name, 'Jet Black');
  assert.equal(variants[0].options[0].value, 'Jet Black');
});

test('existing structured variants rebuild reusable option sets without duplicates', () => {
  const first = createEmptyCatalogVariantDraft();
  first.options = [
    { key: 'c1', name: 'Color', value: 'Black' },
    { key: 's1', name: 'Size', value: 'M' },
  ];
  const second = createEmptyCatalogVariantDraft();
  second.options = [
    { key: 'c2', name: 'color', value: 'White' },
    { key: 's2', name: 'Size', value: 'M' },
  ];

  const sets = catalogVariantOptionSetsFromVariants([first, second]);
  assert.equal(sets.length, 2);
  assert.deepEqual(sets[0].values, ['Black', 'White']);
  assert.deepEqual(sets[1].values, ['M']);
});

test('merchant variant editor uses option matrices and progressive disclosure', () => {
  assert.match(editorSource, /generatedVariants/);
  assert.match(editorSource, /catalogVariantCombinationCount/);
  assert.match(editorSource, /regenerateCatalogVariantDrafts/);
  assert.match(editorSource, /More details|تفاصيل إضافية|وردەکاری زیاتر/);
  assert.match(editorSource, /MAX_VARIANTS = 100/);
});
