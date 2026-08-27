import assert from 'node:assert/strict';
import test from 'node:test';

import {
  formatDateInputMask,
  formatKnownDateTimeInput,
  formatTimeInputMask,
} from '../src/lib/dateTimeInputMask.ts';

test('date input inserts separators while the merchant types digits', () => {
  assert.equal(formatDateInputMask('2026'), '2026');
  assert.equal(formatDateInputMask('20260'), '2026/0');
  assert.equal(formatDateInputMask('202608'), '2026/08');
  assert.equal(formatDateInputMask('20260827'), '2026/08/27');
  assert.equal(formatDateInputMask('2026/08/27'), '2026/08/27');
  assert.equal(formatDateInputMask('٢٠٢٦٠٨٢٧'), '2026/08/27');
});

test('time input inserts the colon while the merchant types digits', () => {
  assert.equal(formatTimeInputMask('15'), '15');
  assert.equal(formatTimeInputMask('153'), '15:3');
  assert.equal(formatTimeInputMask('1530'), '15:30');
  assert.equal(formatTimeInputMask('15:30'), '15:30');
  assert.equal(formatTimeInputMask('١٥٣٠'), '15:30');
});

test('masking is limited to known date and time placeholders', () => {
  assert.equal(formatKnownDateTimeInput('20260827', 'YYYY/MM/DD'), '2026/08/27');
  assert.equal(formatKnownDateTimeInput('1530', 'HH:mm'), '15:30');
  assert.equal(formatKnownDateTimeInput('123456', 'SKU'), '123456');
});
