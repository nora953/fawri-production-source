import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
Object.assign(globalThis, { React });
import { renderToStaticMarkup } from 'react-dom/server';

import { CatalogItemTypeEditor } from '../src/components/catalog/CatalogItemTypeEditor';
import { CatalogProductDetailsEditor } from '../src/components/catalog/CatalogProductDetailsEditor';
import { I18nProvider } from '../src/lib/i18n';
import {
  CATALOG_ITEM_TYPE_COPY,
  CATALOG_PRODUCT_DETAILS_COPY,
  COMMERCE_CATALOG_COPY,
} from '../src/lib/translations/features/catalog/catalogEditorCopy';
import type { CatalogProductFormState } from '../src/lib/catalogProductEditor';
import type { Lang } from '../src/lib/types';

const storageState = { lang: 'ar' as Lang };
Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  value: {
    getItem: () => storageState.lang,
    setItem: () => undefined,
    removeItem: () => undefined,
    clear: () => undefined,
    key: () => null,
    length: 0,
  },
});

function formFixture(): CatalogProductFormState {
  return {
    item_type: 'product',
    track_inventory: true,
    service_duration_minutes: '',
    service_buffer_minutes: '0',
    service_booking_required: true,
    service_price_type: 'fixed',
    service_location_mode: 'merchant',
    name: 'Mixer',
    sku: 'FWR-MIXER',
    barcode: '',
    category: 'Electronics',
    description: 'Mixer',
    original_price: '',
    current_price: '49000',
    cost_iqd: '25000',
    quantity: '23',
    weight_kg: '',
    length_cm: '',
    width_cm: '',
    height_cm: '',
    status: 'available',
    allow_fawri_reply: true,
    image_refs: [],
    variants: [{
      key: 'variant-red',
      name: 'Red',
      sku: 'FWR-RED',
      barcode: '',
      price_iqd: '',
      cost_iqd: '',
      stock_quantity: '11',
      weight_kg: '',
      length_cm: '',
      width_cm: '',
      height_cm: '',
      image_refs: [],
      options: [{ key: 'color-red', name: 'Color', value: 'Red' }],
    }],
  };
}

function sortedKeys(value: object) {
  return Object.keys(value).sort();
}

function renderDetails(lang: Lang) {
  storageState.lang = lang;
  return renderToStaticMarkup(
    <I18nProvider>
      <CatalogProductDetailsEditor
        lang={lang}
        form={formFixture()}
        editing
        moneyStep="1"
        onChange={() => undefined}
      />
    </I18nProvider>,
  );
}

function renderItemType(lang: Lang) {
  storageState.lang = lang;
  return renderToStaticMarkup(
    <CatalogItemTypeEditor lang={lang} form={formFixture()} onChange={() => undefined} />,
  );
}

test('catalog dictionaries have identical key sets across ar/en/ku', () => {
  for (const dictionary of [COMMERCE_CATALOG_COPY, CATALOG_ITEM_TYPE_COPY, CATALOG_PRODUCT_DETAILS_COPY]) {
    assert.deepEqual(sortedKeys(dictionary.ar), sortedKeys(dictionary.en));
    assert.deepEqual(sortedKeys(dictionary.ar), sortedKeys(dictionary.ku));
  }
});

test('rendered variant headers are canonical in all three languages', () => {
  const ar = renderDetails('ar');
  const en = renderDetails('en');
  const ku = renderDetails('ku');

  assert.match(ar, /النوع/);
  assert.match(ar, /الإجراء/);
  assert.doesNotMatch(ar, /التركيبة/);

  assert.match(en, /Variant/);
  assert.match(en, /Action/);
  assert.doesNotMatch(en, /Product combinations|Combination image/);

  assert.match(ku, /جۆر/);
  assert.match(ku, /کردار/);
  assert.doesNotMatch(ku, /تێکەڵ/);
});

test('Sorani rendered item-type copy contains no Arabic booking fallback', () => {
  const ku = renderItemType('ku');
  assert.match(ku, /کاتگرتن/);
  assert.doesNotMatch(ku, /حجز/);
});

test('all rendered product-details roots use the same full-width layout contract', () => {
  for (const lang of ['ar', 'en', 'ku'] as const) {
    assert.match(renderDetails(lang), /w-full min-w-0 space-y-4/);
  }
});
