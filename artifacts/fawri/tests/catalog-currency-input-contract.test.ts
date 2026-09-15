import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const pageSource = await readFile(
  new URL('../src/pages/dashboard/CommerceCatalogSimplifiedPage.tsx', import.meta.url),
  'utf8',
);
const detailsSource = await readFile(
  new URL('../src/components/catalog/CatalogProductDetailsEditor.tsx', import.meta.url),
  'utf8',
);

test('catalog price inputs are currency-neutral and use the merchant currency scale', () => {
  assert.match(pageSource, /const moneyStep = catalogCurrencyStep\(fractionDigits\)/);
  assert.match(pageSource, /step=\{moneyStep\} inputMode="decimal" dir="ltr" value=\{form\.current_price\}/);
  assert.doesNotMatch(pageSource, /value=\{form\.original_price\}/);
  assert.match(pageSource, /input\.compare_at_price_iqd = null/);
  assert.match(pageSource, /CatalogProductDetailsEditor[^>]*moneyStep=\{moneyStep\}/s);
  assert.doesNotMatch(pageSource, /<span[^>]*>\{copy\.currency\}<\/span>/);
});

test('product, variant, and grouped money overrides share the same currency scale', () => {
  assert.match(detailsSource, /moneyStep: string/);
  assert.match(detailsSource, /<Input[^>]*step=\{moneyStep\}[^>]*value=\{form\.cost_iqd\}/s);
  assert.match(detailsSource, /<Input[^>]*step=\{moneyStep\}[^>]*value=\{variant\.price_iqd\}/s);
  assert.match(detailsSource, /<Input[^>]*step=\{moneyStep\}[^>]*value=\{variant\.cost_iqd\}/s);
  assert.match(detailsSource, /<Input[^>]*step=\{moneyStep\}[^>]*value=\{draft\.sale\}/s);
  assert.match(detailsSource, /<Input[^>]*step=\{moneyStep\}[^>]*value=\{draft\.cost\}/s);
});

test('money-entry helper text does not hardcode IQD or dinar symbols', () => {
  const moneyHints = [
    ...detailsSource.matchAll(/inherited(?:Sale|Cost):[^\n]+/g),
    ...detailsSource.matchAll(/inheritanceHint:[^\n]+/g),
  ].map(match => match[0]).join('\n');

  assert.doesNotMatch(moneyHints, /IQD|د\.ع|دينار/);
});
