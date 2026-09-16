import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const read = relative => fs.readFileSync(new URL(relative, import.meta.url), 'utf8');

const parity = read('../src/lib/catalogEditorSoraniSemanticParity.ts');
const parityCss = read('../src/pages/dashboard/catalogEditorSoraniProductParity.css');
const languageCss = read('../src/pages/dashboard/catalogEditorLanguageParity.css');
const main = read('../src/main.tsx');
const workspace = read('../src/pages/dashboard/ProductsWorkspacePage.tsx');

test('Sorani product editor keeps approved semantic parity with Arabic golden reference', () => {
  assert.match(parity, /noItems: 'هێشتا هیچ بابەتێک نییە'/);
  assert.match(parity, /loadFailed: 'نەتوانرا کەتەلۆگ لە سێرڤەر بار بکرێت\.'/);
  assert.match(parity, /secureCrypto: 'نەتوانرا نیشانەیەکی پارێزراو بۆ کردارەکە دروست بکرێت\.'/);
  assert.match(parity, /reportingCostHint: 'ئارەزوومەندانە، تەنها بۆ ڕاپۆرت و هەژمارکردنی قازانجە و بە کڕیار پیشان نادرێت\.'/);
  assert.match(parity, /optionNamePlaceholder: 'نموونە: ڕەنگ، گنجایش، تام'/);
  assert.match(parity, /noVariants: 'هەڵبژاردەیەک وەک ڕەنگ، گنجایش، تام یان قەبارە زیاد بکە، پاشان هەموو بەهاکان لە یەک ڕیز بنووسە\.'/);
  assert.match(parity, /تەنها لە کاتی پێویستدا بەها جیاوازەکان بنووسە\./);
  assert.match(parity, /uploading: 'باردەکرێتە سەرەوە\.\.\.'/);
  assert.match(parity, /drop: 'وێنەکان بۆ ئێرە ڕابکێشە و دایانبخە، یان کلیک بکە بۆ هەڵبژاردن'/);
});

test('Sorani compact single-option table keeps approved product wording', () => {
  assert.match(parityCss, /content: ['"]سڕینەوە['"]/);
  assert.match(languageCss, /html\[lang="ku"\]/);
  assert.doesNotMatch(parityCss, /html\[lang=["']ar["']\]/);
  assert.doesNotMatch(parityCss, /html\[lang=["']en["']\]/);
});

test('Sorani product parity is loaded before the catalog editor renders', () => {
  assert.match(main, /applyCatalogEditorSoraniSemanticParity\(\)/);
  assert.match(workspace, /catalogEditorSoraniProductParity\.css/);
});

test('Sorani semantic parity cannot mutate locked Arabic or English dictionaries', () => {
  assert.doesNotMatch(parity, /COMMERCE_CATALOG_COPY\.ar/);
  assert.doesNotMatch(parity, /COMMERCE_CATALOG_COPY\.en/);
  assert.doesNotMatch(parity, /CATALOG_PRODUCT_DETAILS_COPY\.ar/);
  assert.doesNotMatch(parity, /CATALOG_PRODUCT_DETAILS_COPY\.en/);
  assert.doesNotMatch(parity, /CATALOG_IMAGE_UPLOAD_COPY\.ar/);
  assert.doesNotMatch(parity, /CATALOG_IMAGE_UPLOAD_COPY\.en/);
});
