import assert from 'node:assert/strict';
import test from 'node:test';

import {
  merchantMoneyMajorInputToMinor,
  merchantMoneyMinorToMajorInput,
  merchantSafeFractionDigits,
} from '../src/lib/moneyUi.ts';

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
