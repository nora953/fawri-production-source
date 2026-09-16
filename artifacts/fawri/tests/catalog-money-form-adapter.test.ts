import test from 'node:test';
import assert from 'node:assert/strict';

import {
  catalogMoneyFormForAuthority,
  catalogMoneyFormForDisplay,
  validateCatalogMoneyForm,
} from '../src/lib/catalogMoneyFormAdapter';
import {
  createEmptyCatalogProductForm,
  createEmptyCatalogVariantDraft,
} from '../src/lib/catalogProductEditor';

test('IQD catalog money remains unchanged at zero fraction digits', () => {
  const form = {
    ...createEmptyCatalogProductForm(),
    current_price: '15000',
    original_price: '20000',
    cost_iqd: '9000',
  };

  assert.equal(validateCatalogMoneyForm(form, 0), null);
  const authority = catalogMoneyFormForAuthority(form, 0);
  assert.ok(authority);
  assert.equal(authority.current_price, '15000');
  assert.equal(authority.original_price, '20000');
  assert.equal(authority.cost_iqd, '9000');

  const display = catalogMoneyFormForDisplay(authority, 0);
  assert.equal(display.current_price, '15000');
  assert.equal(display.original_price, '20000');
  assert.equal(display.cost_iqd, '9000');
});

test('two-fraction currencies round-trip catalog product and variant money as minor units', () => {
  const variant = {
    ...createEmptyCatalogVariantDraft(),
    name: 'Large',
    price_iqd: '7.25',
    cost_iqd: '4.10',
  };
  const form = {
    ...createEmptyCatalogProductForm(),
    current_price: '19.99',
    original_price: '25.50',
    cost_iqd: '12.34',
    variants: [variant],
  };

  assert.equal(validateCatalogMoneyForm(form, 2), null);
  const authority = catalogMoneyFormForAuthority(form, 2);
  assert.ok(authority);
  assert.equal(authority.current_price, '1999');
  assert.equal(authority.original_price, '2550');
  assert.equal(authority.cost_iqd, '1234');
  assert.equal(authority.variants[0]?.price_iqd, '725');
  assert.equal(authority.variants[0]?.cost_iqd, '410');

  const display = catalogMoneyFormForDisplay(authority, 2);
  assert.equal(display.current_price, '19.99');
  assert.equal(display.original_price, '25.50');
  assert.equal(display.cost_iqd, '12.34');
  assert.equal(display.variants[0]?.price_iqd, '7.25');
  assert.equal(display.variants[0]?.cost_iqd, '4.10');
});

test('catalog money fails closed when precision exceeds the merchant currency scale', () => {
  const form = {
    ...createEmptyCatalogProductForm(),
    current_price: '19.999',
  };

  assert.equal(validateCatalogMoneyForm(form, 2), 'price');
  assert.equal(catalogMoneyFormForAuthority(form, 2), null);
});

test('comparison price is validated after currency scaling', () => {
  const form = {
    ...createEmptyCatalogProductForm(),
    current_price: '20.00',
    original_price: '19.99',
  };

  assert.equal(validateCatalogMoneyForm(form, 2), 'compare_price');
});
