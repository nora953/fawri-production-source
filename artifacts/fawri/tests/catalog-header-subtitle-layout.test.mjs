import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const source = await readFile(
  new URL('../src/pages/dashboard/CommerceCatalogSimplifiedPage.tsx', import.meta.url),
  'utf8',
);

test('catalog subtitle stays on one desktop line while remaining responsive on narrow screens', () => {
  assert.match(
    source,
    /<p className="mt-1 max-w-3xl text-sm leading-6 text-muted-foreground xl:max-w-none xl:whitespace-nowrap">\{copy\.subtitle\}<\/p>/,
  );
  assert.doesNotMatch(
    source,
    /<p className="[^"]*whitespace-nowrap(?![^"]*xl:whitespace-nowrap)[^"]*">\{copy\.subtitle\}<\/p>/,
  );
});
