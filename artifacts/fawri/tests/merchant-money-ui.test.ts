import test from 'node:test';
import assert from 'node:assert/strict';

import {
  formatMerchantIqd,
  formatMerchantMoneyMinor,
  formatMerchantNumber,
  merchantCurrencyLabel,
} from '../src/lib/moneyUi';

test('merchant money localizes Arabic IQD digits while generic numbers stay Latin', () => {
  assert.equal(formatMerchantNumber(5_000), '5,000');
  assert.equal(formatMerchantNumber(1_234_567), '1,234,567');
  assert.equal(formatMerchantMoneyMinor(5_000, 'IQD', 0, 'ar'), '٥٠٠٠\u00a0د.ع');
  assert.equal(formatMerchantIqd(10_000, 'ar'), '١٠٠٠٠\u00a0د.ع');
  assert.equal(formatMerchantIqd(10_000, 'en'), '10,000\u00a0IQD');
});

test('Arabic IQD avoids thousands separators while English IQD keeps ASCII grouping', () => {
  const arabic = formatMerchantMoneyMinor(1_250_000, 'IQD', 0, 'ar');
  assert.equal(arabic.includes('٬'), false);
  assert.equal(arabic.includes(','), false);
  assert.equal(arabic, '١٢٥٠٠٠٠\u00a0د.ع');

  const english = formatMerchantMoneyMinor(1_250_000, 'IQD', 0, 'en');
  assert.equal(english.includes('٬'), false);
  assert.equal(english.includes(','), true);
  assert.equal(english, '1,250,000\u00a0IQD');
});

test('non-IQD currencies keep their explicit currency code', () => {
  assert.equal(merchantCurrencyLabel('usd', 'ar'), 'USD');
  assert.equal(formatMerchantMoneyMinor(12_345, 'USD', 2, 'en'), '123.45\u00a0USD');
});
