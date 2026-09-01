import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');

const moneyUi = fs.readFileSync(path.join(root, 'src/lib/moneyUi.ts'), 'utf8');
const catalogCss = fs.readFileSync(path.join(root, 'src/styles/catalogSummaryCards.css'), 'utf8');

test('Arabic and Kurdish IQD catalog money keeps amount before canonical dinar label', () => {
  assert.ok(moneyUi.includes("if (currency === 'IQD') return lang === 'en' ? 'IQD' : 'د.ع';"));
  assert.ok(!moneyUi.includes("return 'ع.د'"));
  assert.ok(moneyUi.includes("const compactArabicIqd = currencyCodeNormalized === 'IQD' && lang !== 'en';"));
  assert.ok(moneyUi.includes('return `\\u2066${number}\\u2069\\u00a0\\u2067${currency}\\u2069`;'));
});

test('catalog CSS does not override bidi direction for the complete price', () => {
  assert.doesNotMatch(catalogCss, /unicode-bidi:\s*(?:bidi-override|plaintext)\s*!important/);
  assert.doesNotMatch(catalogCss, /p\[dir="ltr"\]\.font-extrabold[\s\S]*direction:\s*(?:ltr|rtl)\s*!important/);
});
