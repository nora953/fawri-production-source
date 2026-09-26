import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source = await readFile(
  new URL('../src/components/InternationalPhoneField.tsx', import.meta.url),
  'utf8',
);

test('international phone field reserves more horizontal space for the national number', () => {
  assert.match(
    source,
    /sm:grid-cols-\[minmax\(0,2fr\)_minmax\(0,3fr\)\]/,
  );
  assert.match(source, /min-w-\[4\.75rem\]/);
  assert.match(source, /h-full min-w-0 flex-1/);
});

test('long national numbers use one readable compact text step without the old 16+ shrink', () => {
  assert.match(
    source,
    /phoneInput\.replace\(\/\\\\D\/g, ''\)\.length >= 13/,
  );
  assert.match(source, /'text-xs tracking-tight'/);
  assert.doesNotMatch(source, /length >= 16/);
  assert.doesNotMatch(source, /text-\[11px\]/);
});
