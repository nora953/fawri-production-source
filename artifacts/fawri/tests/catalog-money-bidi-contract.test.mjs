import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');

const moneyUi = fs.readFileSync(path.join(root, 'src/lib/moneyUi.ts'), 'utf8');
const catalogPage = fs.readFileSync(path.join(root, 'src/pages/dashboard/CommerceCatalogSimplifiedPage.tsx'), 'utf8');
const catalogCss = fs.readFileSync(path.join(root, 'src/styles/catalogSummaryCards.css'), 'utf8');

test('Arabic and Kurdish IQD catalog money keeps amount before canonical dinar label', () => {
  assert.ok(moneyUi.includes("if (currency === 'IQD') return lang === 'en' ? 'IQD' : 'د.ع';"));
  assert.ok(!moneyUi.includes("return 'ع.د'"));
  assert.ok(moneyUi.includes("const compactArabicIqd = currencyCodeNormalized === 'IQD' && lang !== 'en';"));
});

test('catalog renders amount and merchant currency as separate fixed-order visual runs', () => {
  assert.ok(catalogPage.includes("import { formatMerchantNumber, merchantCurrencyLabel } from '@/lib/moneyUi';"));
  assert.ok(catalogPage.includes('className="inline-flex items-baseline gap-1 whitespace-nowrap" dir="ltr"'));
  assert.ok(catalogPage.includes('<span dir="ltr">{number}</span>'));
  assert.ok(catalogPage.includes("<span dir={lang === 'en' ? 'ltr' : 'rtl'}>{currency}</span>"));
});

test('catalog CSS pins split money to amount first and canonical IQD token second', () => {
  assert.match(catalogCss, /p\[dir="ltr"\] > span\.inline-flex\[dir="ltr"\][\s\S]*flex-direction:\s*row\s*!important/);
  assert.match(catalogCss, /span:first-child[\s\S]*order:\s*1/);
  assert.match(catalogCss, /span:last-child[\s\S]*direction:\s*ltr\s*!important[\s\S]*order:\s*2/);
});
