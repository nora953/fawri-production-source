import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');

const moneyUi = fs.readFileSync(path.join(root, 'src/lib/moneyUi.ts'), 'utf8');
const catalogCss = fs.readFileSync(path.join(root, 'src/styles/catalogSummaryCards.css'), 'utf8');

test('Arabic and Kurdish force only the currency token into stable LTR visual order', () => {
  assert.match(moneyUi, /if \(lang === 'en'\) return currency;/);
  assert.match(moneyUi, /return `\\u202D\$\{currency\}\\u202C`;/);
  assert.match(moneyUi, /return `\$\{number\}\\u00a0\$\{currency\}`;/);
});

test('catalog CSS does not override bidi direction for the complete price', () => {
  assert.doesNotMatch(catalogCss, /unicode-bidi:\s*(?:bidi-override|plaintext)\s*!important/);
  assert.doesNotMatch(catalogCss, /p\[dir="ltr"\]\.font-extrabold[\s\S]*direction:\s*(?:ltr|rtl)\s*!important/);
});
