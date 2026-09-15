import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import type { CatalogProduct } from '../src/lib/catalogUiApi.ts';
import {
  catalogProductFormFromProduct,
  catalogProductInputFromForm,
  createEmptyCatalogProductForm,
  createEmptyCatalogVariantDraft,
  validateCatalogProductForm,
} from '../src/lib/catalogProductEditor.ts';

const productsPage = await readFile(
  new URL('../src/pages/dashboard/ProductsPage.tsx', import.meta.url),
  'utf8',
);

const baseProduct: CatalogProduct = {
  id: 'prd-measure',
  merchant_id: 'merchant-a',
  name: 'Measured item',
  price_iqd: 10000,
  stock_quantity: 2,
  low_stock_threshold: 1,
  status: 'available',
  allow_fawri_reply: true,
  image_refs: [],
  variants: [],
  created_at: '2026-08-10T00:00:00.000Z',
  updated_at: '2026-08-10T00:00:00.000Z',
  version: 1,
};

test('empty measurement fields remain optional and serialize as unknown nulls', () => {
  const form = createEmptyCatalogProductForm();
  form.name = 'Optional measurements';
  form.current_price = '10000';
  form.quantity = '1';
  assert.equal(validateCatalogProductForm(form), null);
  const input = catalogProductInputFromForm(form);
  assert.equal(input.weight_g, null);
  assert.equal(input.length_mm, null);
  assert.equal(input.width_mm, null);
  assert.equal(input.height_mm, null);
});

test('merchant kg/cm values convert deterministically to integer g/mm', () => {
  const form = createEmptyCatalogProductForm();
  form.name = 'Converted measurements';
  form.current_price = '10000';
  form.quantity = '1';
  form.weight_kg = '1.275';
  form.length_cm = '32.5';
  form.width_cm = '20';
  form.height_cm = '8.4';
  assert.equal(validateCatalogProductForm(form), null);
  const input = catalogProductInputFromForm(form);
  assert.equal(input.weight_g, 1275);
  assert.equal(input.length_mm, 325);
  assert.equal(input.width_mm, 200);
  assert.equal(input.height_mm, 84);
});

test('canonical server measurements map back to merchant-facing units without loss', () => {
  const form = catalogProductFormFromProduct({
    ...baseProduct,
    weight_g: 1275,
    length_mm: 325,
    width_mm: 200,
    height_mm: 84,
  });
  assert.equal(form.weight_kg, '1.275');
  assert.equal(form.length_cm, '32.5');
  assert.equal(form.width_cm, '20');
  assert.equal(form.height_cm, '8.4');
  const input = catalogProductInputFromForm(form, baseProduct);
  assert.equal(input.weight_g, 1275);
  assert.equal(input.length_mm, 325);
  assert.equal(input.width_mm, 200);
  assert.equal(input.height_mm, 84);
});

test('partial dimensions and excessive decimal precision are rejected before save', () => {
  const form = createEmptyCatalogProductForm();
  form.name = 'Invalid dimensions';
  form.current_price = '10000';
  form.quantity = '1';
  form.length_cm = '10';
  assert.equal(validateCatalogProductForm(form), 'partial_dimensions');

  form.width_cm = '20';
  form.height_cm = '30';
  form.weight_kg = '1.2345';
  assert.equal(validateCatalogProductForm(form), 'measurement');
});

test('variant empty measurements express inheritance and complete overrides serialize independently', () => {
  const form = catalogProductFormFromProduct({
    ...baseProduct,
    weight_g: 2000,
    length_mm: 400,
    width_mm: 300,
    height_mm: 200,
  });
  const variant = createEmptyCatalogVariantDraft();
  variant.name = 'Large';
  variant.stock_quantity = '2';
  variant.options = [];
  form.variants = [variant];
  assert.equal(validateCatalogProductForm(form), null);
  let input = catalogProductInputFromForm(form, baseProduct);
  assert.equal(input.variants?.[0].weight_g, null);
  assert.equal(input.variants?.[0].length_mm, null);

  form.variants[0].weight_kg = '2.5';
  form.variants[0].length_cm = '50';
  form.variants[0].width_cm = '32';
  form.variants[0].height_cm = '21';
  assert.equal(validateCatalogProductForm(form), null);
  input = catalogProductInputFromForm(form, baseProduct);
  assert.equal(input.variants?.[0].weight_g, 2500);
  assert.deepEqual(
    [input.variants?.[0].length_mm, input.variants?.[0].width_mm, input.variants?.[0].height_mm],
    [500, 320, 210],
  );
});

test('ProductsPage exposes optional localized measurement UI without delivery pricing logic', () => {
  assert.match(productsPage, /physicalDetails/);
  assert.match(productsPage, /weightKg/);
  assert.match(productsPage, /dimensionsCm/);
  assert.match(productsPage, /variantMeasurementsHint/);
  assert.doesNotMatch(productsPage, /delivery fee|delivery_fee|governorate pricing|manual quote/i);
});
