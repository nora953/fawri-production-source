import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const read = relative => fs.readFileSync(new URL(relative, import.meta.url), 'utf8');

const englishParity = read('../src/lib/catalogEditorEnglishSemanticParity.ts');
const languageParityCss = read('../src/pages/dashboard/catalogEditorLanguageParity.css');
const itemTypeEditor = read('../src/components/catalog/CatalogItemTypeEditor.tsx');

test('English service editor keeps approved service wording', () => {
  assert.match(englishParity, /serviceDetailsHint: 'This information helps Fawri give customers accurate details about the service\.'/);
  assert.match(englishParity, /bookingRequiredHint: 'Enable it if the customer needs to request an appointment or book the service in advance\.'/);
  assert.match(englishParity, /priceCustom: 'On request'/);
  assert.match(englishParity, /locationMerchant: 'At the merchant location'/);
  assert.match(englishParity, /locationCustomer: 'At the customer location'/);
  assert.match(englishParity, /locationFlexible: 'Multiple service locations'/);
  assert.match(englishParity, /locationFlexibleHint: 'Choose at least two locations where this service can be provided\.'/);
});

test('English service editor keeps the approved Arabic-reference structure', () => {
  assert.match(itemTypeEditor, /className=\{lang === 'ku'[\s\S]*?'w-full min-w-0 space-y-4 rounded-2xl border bg-muted\/10 p-4'\}/);
  assert.match(itemTypeEditor, /\{lang === 'ku' && serviceDetails\}[\s\S]*?\{lang !== 'ku' && serviceDetails\}/);
  assert.match(languageParityCss, /html\[lang="en"\][^{]*catalog-editor-body-grid:has\(> \[data-catalog-service-details="true"\]\) > \[data-catalog-item-type-editor="true"\][^{]*\{\s*order: 0;/s);
  assert.match(languageParityCss, /html\[lang="en"\][^{]*md\\:grid-cols-3:has\(\[data-catalog-primary-input="true"\]\)[^{]*\{\s*order: 1;/s);
  assert.match(languageParityCss, /html\[lang="en"\][^{]*\[data-catalog-service-details="true"\][^{]*\{\s*order: 2;/s);
});

test('English service editor keeps approved service-specific labels and alignment', () => {
  assert.match(languageParityCss, /Add the service information once; Fawri uses it in the cashier, replies, and to assist customers\./);
  assert.match(languageParityCss, /content: "Price"/);
  assert.match(languageParityCss, /content: "Price starts from"/);
  assert.match(languageParityCss, /content: "Available for request"/);
  assert.match(languageParityCss, /content: "Set whether this service is currently available to customers\."/);
  assert.match(languageParityCss, /html\[lang="en"\][^{]*data-catalog-service-details="true"[^{]*div:nth-child\(4\) > select[^{]*\{\s*margin-top: 0\.5rem !important;/s);
});
