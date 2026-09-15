import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(here, '../../..');

function read(relativePath) {
  return readFileSync(path.join(repositoryRoot, relativePath), 'utf8');
}

function between(source, start, end) {
  const startIndex = source.indexOf(start);
  assert.notEqual(startIndex, -1, `missing start marker: ${start}`);
  const endIndex = source.indexOf(end, startIndex + start.length);
  assert.notEqual(endIndex, -1, `missing end marker: ${end}`);
  return source.slice(startIndex, endIndex);
}

test('catalog import price conversion uses fresh merchant commerce authority', () => {
  const page = read('artifacts/fawri/src/pages/dashboard/ImportProductsPage.tsx');
  const importBody = between(page, '  const handleImport = async () => {', '  const downloadTemplate = () => {');

  assert.match(page, /catalogMajorAmountToMinor/);
  assert.match(page, /getCatalogCommerceContext/);
  assert.match(
    page,
    /function parseCatalogPrice\(value: unknown, fractionDigits: number\): number \| null \{[\s\S]*catalogMajorAmountToMinor\(normalized, fractionDigits\)/,
  );
  assert.match(
    page,
    /const validateAndBuildImport = \(fractionDigits: number\):/,
  );
  assert.match(
    page,
    /const price = mapping\.price[\s\S]*parseCatalogPrice\(row\[mapping\.price\], fractionDigits\)/,
  );
  assert.match(importBody, /const context = await getCatalogCommerceContext\(\)/);
  assert.match(
    importBody,
    /validateAndBuildImport\(\s*context\.currency_fraction_digits,\s*\)/,
  );
  assert.match(importBody, /await importCatalogProducts\(products, attempt\.key\)/);
  assert.ok(
    importBody.indexOf('await getCatalogCommerceContext()') <
      importBody.indexOf('await importCatalogProducts(products, attempt.key)'),
    'commerce authority must resolve before the import mutation',
  );
});

test('catalog import keeps inventory quantities integer while money supports localized decimals', () => {
  const page = read('artifacts/fawri/src/pages/dashboard/ImportProductsPage.tsx');

  assert.match(page, /\.replace\(\/\[,٬\\s\]\/g, ''\)/);
  assert.match(page, /\.replace\(\/٫\/g, '\.'\)/);
  assert.match(page, /\.replace\(\/\[٠-٩\]\/g/);
  assert.match(page, /\.replace\(\/\[۰-۹\]\/g/);
  assert.match(
    page,
    /const quantity = mapping\.quantity[\s\S]*parseNonNegativeInteger\(row\[mapping\.quantity\]\)/,
  );
  assert.match(page, /price_iqd: price/);
});

test('shared catalog money helper covers IQD USD and KWD canonical minor units', () => {
  const money = read('artifacts/fawri/src/lib/catalogPromotionUiApi.ts');

  assert.match(
    money,
    /export function catalogMajorAmountToMinor\([\s\S]*fractionDigits/,
  );

  const existingMoneyTests = read('artifacts/fawri/tests/catalog-promotion-ui.test.ts');
  assert.match(existingMoneyTests, /catalogMajorAmountToMinor\('15000', 0\), 15000/);
  assert.match(existingMoneyTests, /catalogMajorAmountToMinor\('10\.50', 2\), 1050/);
  assert.match(existingMoneyTests, /catalogMajorAmountToMinor\('1\.234', 3\), 1234/);
  assert.match(existingMoneyTests, /catalogMajorAmountToMinor\('١٠٫٥٠', 2\), 1050/);
});

test('catalog import does not send a browser-selected merchant authority override', () => {
  const page = read('artifacts/fawri/src/pages/dashboard/ImportProductsPage.tsx');
  const importBody = between(page, '  const handleImport = async () => {', '  const downloadTemplate = () => {');

  assert.doesNotMatch(importBody, /merchant_id|merchantId/);
  assert.match(importBody, /await importCatalogProducts\(products, attempt\.key\)/);
});
