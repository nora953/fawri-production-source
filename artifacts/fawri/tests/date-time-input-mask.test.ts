import assert from 'node:assert/strict';
import test from 'node:test';

import {
  dateInputValueForAuthority,
  dateInputValueForDisplay,
  formatDateInputMask,
  formatKnownDateTimeInput,
  formatTimeInputMask,
  placeholderForDisplay,
  valueForKnownDateTimeInputAuthority,
  valueForKnownDateTimeInputDisplay,
} from '../src/lib/dateTimeInputMask.ts';

test('date input inserts day-first separators while the merchant types digits', () => {
  assert.equal(formatDateInputMask('11'), '11');
  assert.equal(formatDateInputMask('111'), '11/1');
  assert.equal(formatDateInputMask('1111'), '11/11');
  assert.equal(formatDateInputMask('11112026'), '11/11/2026');
  assert.equal(formatDateInputMask('11/11/2026'), '11/11/2026');
  assert.equal(formatDateInputMask('١١١١٢٠٢٦'), '11/11/2026');
});

test('day-first date display converts to the existing year-first authority format', () => {
  assert.equal(dateInputValueForAuthority('11/11/2026'), '2026/11/11');
  assert.equal(dateInputValueForAuthority('11112026'), '2026/11/11');
  assert.equal(dateInputValueForDisplay('2026/11/11'), '11/11/2026');
  assert.equal(valueForKnownDateTimeInputAuthority('11112026', 'YYYY/MM/DD'), '2026/11/11');
  assert.equal(valueForKnownDateTimeInputDisplay('2026/11/11', 'YYYY/MM/DD'), '11/11/2026');
  assert.equal(placeholderForDisplay('YYYY/MM/DD'), 'DD/MM/YYYY');
});

test('time input inserts the colon while the merchant types digits', () => {
  assert.equal(formatTimeInputMask('15'), '15');
  assert.equal(formatTimeInputMask('153'), '15:3');
  assert.equal(formatTimeInputMask('1530'), '15:30');
  assert.equal(formatTimeInputMask('15:30'), '15:30');
  assert.equal(formatTimeInputMask('١٥٣٠'), '15:30');
});

test('masking is limited to known date and time placeholders', () => {
  assert.equal(formatKnownDateTimeInput('11112026', 'YYYY/MM/DD'), '11/11/2026');
  assert.equal(formatKnownDateTimeInput('1530', 'HH:mm'), '15:30');
  assert.equal(formatKnownDateTimeInput('123456', 'SKU'), '123456');
});
