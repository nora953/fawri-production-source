import test from 'node:test';
import assert from 'node:assert/strict';

import {
  formatMerchantIqd,
  formatMerchantMoneyMinor,
  formatMerchantNumber,
  merchantCurrencyLabel,
  merchantMoneyMajorInputToMinor,
  merchantMoneyMinorToMajorInput,
  merchantSafeFractionDigits,
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

test('cashier discount money conversion supports zero-decimal currencies such as IQD', () => {
  assert.equal(merchantSafeFractionDigits(0), 0);
  assert.equal(merchantMoneyMajorInputToMinor('1250', 0), 1250);
  assert.equal(merchantMoneyMinorToMajorInput(1250, 0), '1250');
  assert.equal(merchantMoneyMajorInputToMinor('1.0', 0), null);
});

test('cashier discount money conversion preserves two-decimal currency precision', () => {
  assert.equal(merchantMoneyMajorInputToMinor('12.34', 2), 1234);
  assert.equal(merchantMoneyMajorInputToMinor('12,34', 2), 1234);
  assert.equal(merchantMoneyMajorInputToMinor('12.3', 2), 1230);
  assert.equal(merchantMoneyMinorToMajorInput(1234, 2), '12.34');
  assert.equal(merchantMoneyMinorToMajorInput(1200, 2), '12');
});

test('cashier discount money conversion preserves three-decimal currency precision', () => {
  assert.equal(merchantMoneyMajorInputToMinor('1.234', 3), 1234);
  assert.equal(merchantMoneyMajorInputToMinor('1.2', 3), 1200);
  assert.equal(merchantMoneyMinorToMajorInput(1234, 3), '1.234');
  assert.equal(merchantMoneyMinorToMajorInput(1200, 3), '1.2');
  assert.equal(merchantMoneyMajorInputToMinor('1.2345', 3), null);
});

test('cashier discount money conversion rejects malformed, negative and unsafe values', () => {
  for (const value of ['', ' ', '-1', '1..2', 'abc', '1,2,3']) {
    assert.equal(merchantMoneyMajorInputToMinor(value, 2), null);
  }
  assert.equal(
    merchantMoneyMajorInputToMinor(String(Number.MAX_SAFE_INTEGER), 2),
    null,
  );
  assert.equal(merchantMoneyMinorToMajorInput(-1, 2), '');
  assert.equal(merchantMoneyMinorToMajorInput(Number.MAX_SAFE_INTEGER + 1, 2), '');
});
