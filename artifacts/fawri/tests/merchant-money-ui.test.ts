import test from 'node:test';
import assert from 'node:assert/strict';

import {
  formatMerchantIqd,
  formatMerchantMoneyMinor,
  formatMerchantNumber,
  merchantCurrencyLabel,
} from '../src/lib/moneyUi';

test('merchant money uses Latin digits and a standard ASCII thousands comma', () => {
  assert.equal(formatMerchantNumber(5_000), '5,000');
  assert.equal(formatMerchantNumber(1_234_567), '1,234,567');
  assert.equal(formatMerchantMoneyMinor(5_000, 'IQD', 0, 'ar'), '5,000\u00a0د.ع');
  assert.equal(formatMerchantIqd(10_000, 'ar'), '10,000\u00a0د.ع');
  assert.equal(formatMerchantIqd(10_000, 'en'), '10,000\u00a0IQD');
});

test('merchant money never emits the Arabic thousands separator', () => {
  const formatted = formatMerchantMoneyMinor(1_250_000, 'IQD', 0, 'ar');
  assert.equal(formatted.includes('٬'), false);
  assert.equal(formatted.includes(','), true);
});

test('non-IQD currencies keep their explicit currency code', () => {
  assert.equal(merchantCurrencyLabel('usd', 'ar'), 'USD');
  assert.equal(formatMerchantMoneyMinor(12_345, 'USD', 2, 'en'), '123.45\u00a0USD');
});
