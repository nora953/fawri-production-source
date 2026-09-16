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

  const measurementsStart = productDetails.indexOf('function Measurements({');
  const measurementsEnd = productDetails.indexOf(
    'export function CatalogProductDetailsEditor',
    measurementsStart,
  );

  assert.ok(measurementsStart >= 0, 'measurement component must remain present');
  assert.ok(measurementsEnd > measurementsStart, 'measurement component must stay isolated before the product editor');

  const measurements = productDetails.slice(measurementsStart, measurementsEnd);

  for (const field of ['weight', 'length', 'width', 'height']) {
    assert.match(
      measurements,
      new RegExp(`<label className="space-y-1 text-xs font-semibold"><span>\\{labels\\.${field}\\}</span><Input`),
      `${field} measurement must keep the common label/input structure`,
    );
  }

  const commonInputGeometry =
    measurements.match(/className="h-10 rounded-xl text-center tabular-nums"/g) || [];

  assert.equal(
    commonInputGeometry.length,
    4,
    'all four measurement inputs must keep the same control geometry',
  );
});
