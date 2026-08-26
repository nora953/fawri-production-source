import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const workspace = fs.readFileSync(new URL('../src/pages/dashboard/ProductsWorkspacePage.tsx', import.meta.url), 'utf8');
const productDetails = fs.readFileSync(new URL('../src/components/catalog/CatalogProductDetailsEditor.tsx', import.meta.url), 'utf8');
const alignment = fs.readFileSync(new URL('../src/pages/dashboard/catalogMeasurementAlignment.css', import.meta.url), 'utf8');

test('measurement inputs share one vertical rhythm without changing the established width split', () => {
  assert.match(workspace, /catalogMeasurementAlignment\.css/);
  assert.match(productDetails, /lg:grid-cols-\[minmax\(0,1fr\)_minmax\(0,3fr\)\]/);
  assert.match(alignment, /grid-template-rows:\s*1\.25rem 3rem/);
  assert.match(alignment, /row-gap:\s*0\.5rem/);
  assert.match(alignment, /margin-top:\s*0 !important/);
  assert.match(alignment, /min-height:\s*1\.25rem/);
  assert.match(alignment, /min-height:\s*3rem/);
});
