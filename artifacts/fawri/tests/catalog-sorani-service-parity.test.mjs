import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const read = relative => fs.readFileSync(new URL(relative, import.meta.url), 'utf8');

const parity = read('../src/lib/catalogEditorSoraniSemanticParity.ts');
const languageCss = read('../src/pages/dashboard/catalogEditorLanguageParity.css');
const serviceAlignmentCss = read('../src/pages/dashboard/catalogEditorSoraniServiceAlignment.css');
const itemTypeEditor = read('../src/components/catalog/CatalogItemTypeEditor.tsx');
const workspace = read('../src/pages/dashboard/ProductsWorkspacePage.tsx');

test('Sorani service wording matches the approved Arabic meaning', () => {
  assert.match(parity, /serviceDetailsHint: 'ئەم زانیارییانە یارمەتی فەوری دەدەن زانیاریی ورد لەبارەی خزمەتگوزارییەکە بە کڕیار بدات\.'/);
  assert.match(parity, /locationFlexible: 'زیاتر لە شوێنێک بۆ پێشکەشکردنی خزمەتگوزاری'/);
  assert.match(parity, /locationFlexibleHint: 'لانیکەم دوو شوێن هەڵبژێرە کە خزمەتگوزارییەکە لێیان پێشکەش دەکرێت\.'/);
});

test('Sorani service uses the approved structural flow', () => {
  assert.match(itemTypeEditor, /className="w-full min-w-0 space-y-4 rounded-2xl border bg-muted\/10 p-4"/);
  assert.doesNotMatch(itemTypeEditor, /\{lang === 'ku' && serviceDetails\}/);
  assert.match(itemTypeEditor, /\n\s*<\/div>\n\n\s*\{serviceDetails\}\n\s*<\/>/);
  assert.match(languageCss, /html\[lang="ku"\][^{]*catalog-editor-body-grid:has\(> \[data-catalog-service-details="true"\]\) > \[data-catalog-item-type-editor="true"\][^{]*\{\s*order: 0;/s);
  assert.match(languageCss, /html\[lang="ku"\][^{]*md\\:grid-cols-3:has\(\[data-catalog-primary-input="true"\]\)[^{]*\{\s*order: 1;/s);
  assert.match(languageCss, /html\[lang="ku"\][^{]*\[data-catalog-service-details="true"\][^{]*\{\s*order: 2;/s);
});

test('Sorani service has service-specific subtitle, price and availability wording', () => {
  assert.match(languageCss, /زانیاریی خزمەتگوزارییەکە تەنها جارێک زیاد بکە؛ فەوری لە کاشێر و وەڵامەکان و بۆ یارمەتیدانی کڕیاران بەکاری دەهێنێت\./);
  assert.match(languageCss, /content: "نرخ"/);
  assert.match(languageCss, /content: "نرخ دەستپێدەکات لە"/);
  assert.match(languageCss, /content: "بۆ داواکردن بەردەستە"/);
  assert.match(languageCss, /دیاری بکە ئایا ئەم خزمەتگوزارییە لە ئێستادا بۆ کڕیاران بەردەستە\./);
});

test('Sorani service location control stays aligned with the other three fields', () => {
  assert.match(serviceAlignmentCss, /html\[lang="ku"\][^{]*data-catalog-service-details="true"[^{]*div:nth-child\(4\) > select[^{]*\{\s*margin-top: 0\.5rem !important;/s);
  assert.match(workspace, /catalogEditorSoraniServiceAlignment\.css/);
  assert.doesNotMatch(serviceAlignmentCss, /html\[lang=["']ar["']\]/);
  assert.doesNotMatch(serviceAlignmentCss, /html\[lang=["']en["']\]/);
});

test('Sorani service parity cannot mutate locked Arabic or English dictionaries', () => {
  assert.doesNotMatch(parity, /COMMERCE_CATALOG_COPY\.ar/);
  assert.doesNotMatch(parity, /COMMERCE_CATALOG_COPY\.en/);
  assert.doesNotMatch(parity, /CATALOG_ITEM_TYPE_COPY\.ar/);
  assert.doesNotMatch(parity, /CATALOG_ITEM_TYPE_COPY\.en/);
  assert.doesNotMatch(languageCss, /html\[lang="ar"\]/);
});
