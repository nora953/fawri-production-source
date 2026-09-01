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

test('catalog CSS does not override bidi direction for the complete price', () => {
  assert.doesNotMatch(catalogCss, /unicode-bidi:\s*(?:bidi-override|plaintext)\s*!important/);
  assert.doesNotMatch(catalogCss, /p\[dir="ltr"\]\.font-extrabold[\s\S]*direction:\s*(?:ltr|rtl)\s*!important/);
});
