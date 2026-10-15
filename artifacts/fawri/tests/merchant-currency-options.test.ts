import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  SUPPORTED_MERCHANT_CURRENCIES,
  merchantCurrencyOptions,
} from '../src/lib/supportedMerchantCurrencies';

const settingsCardSource = await readFile(
  new URL('../src/pages/dashboard/MerchantCurrencySettingsCard.tsx', import.meta.url),
  'utf8',
);

test('merchant currency choices provide broad current country coverage without duplicates', () => {
  assert.ok(SUPPORTED_MERCHANT_CURRENCIES.length >= 150);
  assert.equal(
    new Set(SUPPORTED_MERCHANT_CURRENCIES).size,
    SUPPORTED_MERCHANT_CURRENCIES.length,
  );

  for (const code of [
    'IQD', 'USD', 'EUR', 'GBP', 'AED', 'SAR', 'JOD', 'JPY', 'CNY', 'INR',
    'CAD', 'AUD', 'BRL', 'MXN', 'ZAR', 'NGN', 'XAF', 'XOF', 'XCD', 'XCG', 'ZWG',
  ]) {
    assert.ok(SUPPORTED_MERCHANT_CURRENCIES.includes(code as never), code);
  }
});

test('merchant currency choices exclude known withdrawn currencies and non-country fund units', () => {
  for (const code of ['BGN', 'HRK', 'ANG', 'ZWL', 'CUC', 'SLL', 'XDR', 'XAU', 'XAD']) {
    assert.equal(SUPPORTED_MERCHANT_CURRENCIES.includes(code as never), false, code);
  }
});

test('every selectable merchant currency is supported by the runtime currency formatter', () => {
  for (const code of SUPPORTED_MERCHANT_CURRENCIES) {
    const options = new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: code,
    }).resolvedOptions();
    assert.equal(options.currency, code);
    assert.ok(Number.isInteger(options.maximumFractionDigits));
    assert.ok(options.maximumFractionDigits >= 0 && options.maximumFractionDigits <= 6);
  }
});

test('legacy current currency remains visible without becoming a new supported choice', () => {
  const options = merchantCurrencyOptions('BGN');
  assert.equal(options[0], 'BGN');
  assert.equal(SUPPORTED_MERCHANT_CURRENCIES.includes('BGN' as never), false);
});

test('store currency fields share the standard settings field geometry', () => {
  assert.match(settingsCardSource, /merchantCurrencyOptions\(context\?\.currency_code\)/);
  assert.match(settingsCardSource, /grid items-start gap-4 md:grid-cols-3/);
  assert.ok((settingsCardSource.match(/space-y-2 text-sm font-medium/g) || []).length >= 3);
  assert.match(settingsCardSource, /<Input\s+value=\{context\.country_code\}[\s\S]*?readOnly/);
  assert.match(settingsCardSource, /<Input\s+value=\{context\.timezone\}[\s\S]*?readOnly/);
  assert.doesNotMatch(settingsCardSource, /flex h-11 items-center rounded-md border bg-muted\/20 px-3/);
});
