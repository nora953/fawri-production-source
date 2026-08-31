import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const productDetails = fs.readFileSync(new URL('../src/components/catalog/CatalogProductDetailsEditor.tsx', import.meta.url), 'utf8');

test('measurement inputs share one responsive grid and one control rhythm', () => {
  assert.match(
    productDetails,
    /<p className="mt-2 text-xs leading-5 text-muted-foreground">\{labels\.advancedHint\}<\/p>/,
  );
  assert.match(
    productDetails,
    /<div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">/,
  );

  for (const field of ['weight', 'length', 'width', 'height']) {
    assert.match(
      productDetails,
      new RegExp(`<label className="space-y-1 text-xs font-semibold"><span>\\{labels\\.${field}\\}</span><Input[^>]*className="h-10 rounded-xl text-center tabular-nums" \\/></label>`),
      `${field} measurement must keep the common label/input geometry`,
    );
  }
});
