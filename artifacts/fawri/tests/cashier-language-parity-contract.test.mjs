import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const read = relative => fs.readFileSync(new URL(relative, import.meta.url), 'utf8');

const uiCopy = read('../src/lib/cashierUiCopy.ts');
const enhancementCopy = read('../src/lib/cashierPosEnhancementCopy.ts');
const receiptCopy = read('../src/lib/cashierReceiptPrinting.ts');
const operatorGate = read('../src/components/cashier/CashierOperatorGate.tsx');
const endShift = read('../src/components/cashier/CashierEndShiftButton.tsx');
const reports = read('../src/pages/CashierReportsPage.tsx');
const pos = read('../src/pages/CashierPosPage.tsx');
const history = read('../src/pages/CashierHistoryPage.tsx');
const syncPage = read('../src/pages/CashierCatalogSyncPage.tsx');
const checkout = read('../src/components/cashier/CashierCheckoutModal.tsx');
const main = read('../src/cashierMain.tsx');
const i18n = read('../src/lib/i18n.tsx');

const LANGS = ['ar', 'ku', 'en'];

function languageBlocks(source, label) {
  const starts = Object.fromEntries(
    LANGS.map(lang => [lang, source.indexOf(`\n  ${lang}: {`)]),
  );
  for (const lang of LANGS) {
    assert.ok(starts[lang] >= 0, `${label} must define ${lang}`);
  }
  assert.ok(starts.ar < starts.ku && starts.ku < starts.en, `${label} language blocks must stay ordered ar/ku/en`);

  const endings = [
    source.indexOf('\n};', starts.en),
    source.indexOf('\n} as const;', starts.en),
    source.indexOf('\n} as const satisfies', starts.en),
  ].filter(index => index >= 0);
  assert.ok(endings.length > 0, `${label} must close its language authority`);
  const end = Math.min(...endings);

  return {
    ar: source.slice(starts.ar, starts.ku),
    ku: source.slice(starts.ku, starts.en),
    en: source.slice(starts.en, end),
  };
}

function keysAtIndent(source, spaces) {
  const expression = new RegExp(`^ {${spaces}}([A-Za-z][A-Za-z0-9_]*):`, 'gm');
  return [...source.matchAll(expression)].map(match => match[1]);
}

function sortedUnique(values) {
  return [...new Set(values)].sort();
}

function sectionBody(block, section, label) {
  const marker = `    ${section}: {`;
  const start = block.indexOf(marker);
  assert.ok(start >= 0, `${label} must include ${section}`);
  const afterStart = start + marker.length;
  const remainder = block.slice(afterStart);
  const nextSection = remainder.search(/^    [A-Za-z][A-Za-z0-9_]*: \{/m);
  return nextSection >= 0 ? remainder.slice(0, nextSection) : remainder;
}

function assertFlatLanguageParity(source, label) {
  const blocks = languageBlocks(source, label);
  const reference = sortedUnique(keysAtIndent(blocks.ar, 4));
  assert.ok(reference.length > 0, `${label} Arabic reference must contain copy keys`);
  for (const lang of ['ku', 'en']) {
    assert.deepEqual(
      sortedUnique(keysAtIndent(blocks[lang], 4)),
      reference,
      `${label} ${lang} keys must exactly match Arabic`,
    );
  }
}

function assertSectionLanguageParity(source, label, sections) {
  const blocks = languageBlocks(source, label);
  const referenceSections = sortedUnique(keysAtIndent(blocks.ar, 4));
  assert.deepEqual(referenceSections, [...sections].sort(), `${label} Arabic sections changed unexpectedly`);

  for (const lang of ['ku', 'en']) {
    assert.deepEqual(
      sortedUnique(keysAtIndent(blocks[lang], 4)),
      referenceSections,
      `${label} ${lang} sections must exactly match Arabic`,
    );
  }

  for (const section of sections) {
    const referenceKeys = sortedUnique(keysAtIndent(sectionBody(blocks.ar, section, `${label}:ar`), 6));
    assert.ok(referenceKeys.length > 0, `${label}.${section} Arabic reference must contain copy keys`);
    for (const lang of ['ku', 'en']) {
      const translatedKeys = sortedUnique(keysAtIndent(sectionBody(blocks[lang], section, `${label}:${lang}`), 6));
      assert.deepEqual(
        translatedKeys,
        referenceKeys,
        `${label}.${section} ${lang} keys must exactly match Arabic`,
      );
    }
  }
}

test('Arabic is the canonical cashier copy authority for Kurdish Sorani and English', () => {
  assertSectionLanguageParity(uiCopy, 'CASHIER_UI_COPY', ['runtime', 'pos', 'history', 'sync']);
  assertFlatLanguageParity(enhancementCopy, 'CASHIER_POS_ENHANCEMENT_COPY');
  assertFlatLanguageParity(receiptCopy, 'CASHIER_RECEIPT_COPY');
  assertFlatLanguageParity(operatorGate, 'CashierOperatorGate COPY');
  assertFlatLanguageParity(endShift, 'CashierEndShiftButton COPY');
  assertFlatLanguageParity(reports, 'CashierReportsPage COPY');
});

test('reviewed Sorani cashier terminology stays local and consistent', () => {
  const uiKu = languageBlocks(uiCopy, 'CASHIER_UI_COPY').ku;
  const receiptKu = languageBlocks(receiptCopy, 'CASHIER_RECEIPT_COPY').ku;
  const operatorKu = languageBlocks(operatorGate, 'CashierOperatorGate COPY').ku;
  const endShiftKu = languageBlocks(endShift, 'CashierEndShiftButton COPY').ku;

  assert.match(operatorKu, /شەفت/);
  assert.doesNotMatch(operatorKu, /مناوبە/);
  assert.match(endShiftKu, /شەفت/);
  assert.doesNotMatch(endShiftKu, /مناوبە/);
  assert.match(endShiftKu, /hint: 'کۆدی PINی کارمەندی ئێستا بنووسە بۆ پشتڕاستکردنەوەی کۆتایی شەفت\.'/);
  assert.doesNotMatch(endShiftKu, /PIN ـی کارمەندی ئێستا/);

  assert.match(uiKu, /productsServices: 'بەرهەمەکان و خزمەتەکان'/);
  assert.match(uiKu, /service: 'خزمەت'/);
  assert.match(uiKu, /product: 'بەرهەم'/);
  assert.doesNotMatch(uiKu, /service: 'خزمەتگوزاری'/);
  assert.doesNotMatch(uiKu, /productsServices: 'بەرهەم و خزمەتگوزارییەکان'/);

  assert.match(uiKu, /inventoryUntracked: 'بەدواداچوونی کۆگا چالاک نییە'/);
  assert.match(uiKu, /cash: 'نەقد'/);
  assert.doesNotMatch(uiKu, /cash: 'نەقدی'/);

  assert.match(receiptKu, /paper80: '80 ملم'/);
  assert.match(receiptKu, /paper58: '58 ملم'/);
  assert.doesNotMatch(receiptKu, /paper(?:80|58): '\d+ مم'/);
});

test('all operational cashier surfaces inherit the active Arabic Sorani or English direction', () => {
  assert.match(i18n, /return lang === 'en' \? 'ltr' : 'rtl'/);
  assert.match(main, /<I18nProvider>[\s\S]*<CashierOperatorGate[\s\S]*\{operationalPage\}/);

  assert.match(pos, /const \{ lang, dir \} = useI18n\(\)/);
  assert.match(pos, /dir=\{dir\}/);
  assert.match(history, /const \{ lang, dir \} = useI18n\(\)/);
  assert.match(history, /dir=\{dir\}/);
  assert.match(reports, /const \{ lang, dir \} = useI18n\(\)/);
  assert.match(reports, /dir=\{dir\}/);
  assert.match(syncPage, /const \{ lang, dir \} = useI18n\(\)/);
  assert.match(syncPage, /dir=\{dir\}/);
  assert.match(operatorGate, /const \{ lang, dir \} = useI18n\(\)/);
  assert.match(operatorGate, /dir=\{dir\}/);
  assert.match(endShift, /const \{ lang, dir \} = useI18n\(\)/);
  assert.match(endShift, /dir=\{dir\}/);
  assert.match(checkout, /dir: 'rtl' \| 'ltr'/);
  assert.match(checkout, /dir=\{dir\}/);
});

test('cashier operational routing keeps diagnostics outside the language parity surface', () => {
  assert.match(main, /const operationalPage = sync \? \(/);
  assert.match(main, /<CashierCatalogSyncPage \/>/);
  assert.match(main, /<CashierReportsPage \/>/);
  assert.match(main, /<CashierHistoryPage \/>/);
  assert.match(main, /<CashierPosPage \/>/);
  assert.match(main, /diagnostics \? \([\s\S]*<CashierLocalShellPage \/>[\s\S]*\) : \([\s\S]*<I18nProvider>/);
});
