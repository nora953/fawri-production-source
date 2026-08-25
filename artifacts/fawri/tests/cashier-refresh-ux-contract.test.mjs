import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const pos = fs.readFileSync(new URL('../src/pages/CashierPosPage.tsx', import.meta.url), 'utf8');
const catalog = fs.readFileSync(new URL('../src/pages/dashboard/CommerceCatalogPage.tsx', import.meta.url), 'utf8');

test('automatic cashier catalog refresh stays silent and preserves unchanged catalog state', () => {
  assert.match(pos, /refreshCatalog\(runtime, query, false\)/);
  assert.match(pos, /catalogMatches\(current, next\) \? current : next/);
  assert.match(pos, /if \(visible\) setSearching\(true\)/);
  assert.match(pos, /if \(visible\) setSearching\(false\)/);
});

test('cashier and catalog do not use Arabic thousands separators for merchant money', () => {
  assert.doesNotMatch(pos, /Intl\.NumberFormat\('ar-IQ'/);
  assert.doesNotMatch(catalog, /price_iqd\.toLocaleString\(lang === 'en' \? 'en-US' : 'ar-IQ'\)/);
  assert.match(pos, /formatMerchantMoneyMinor/);
  assert.match(catalog, /formatMerchantIqd/);
});

test('catalog price inputs keep currency inline instead of absolutely overlaying the input', () => {
  assert.match(catalog, /className="flex items-center gap-2" dir="ltr"/);
  assert.doesNotMatch(catalog, /pointer-events-none absolute end-3 top-1\/2/);
});
