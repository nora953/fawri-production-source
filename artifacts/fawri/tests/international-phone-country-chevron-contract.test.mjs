import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source = await readFile(
  new URL('../src/components/InternationalPhoneField.tsx', import.meta.url),
  'utf8',
);

test('country select uses the approved 14px custom chevron instead of browser appearance', () => {
  assert.match(source, /appearance-none/);
  assert.match(source, /bg-\[length:14px_14px\]/);
  assert.match(source, /width='14' height='14'/);
  assert.match(source, /stroke-width='2\.2'/);
});

test('country select mirrors the Early Warning chevron spacing for RTL and LTR', () => {
  assert.match(source, /rtl:bg-\[position:left_0\.65rem_center\]/);
  assert.match(source, /rtl:pl-8 rtl:pr-3 rtl:text-right/);
  assert.match(source, /ltr:bg-\[position:right_0\.65rem_center\]/);
  assert.match(source, /ltr:pl-3 ltr:pr-8 ltr:text-left/);
});
