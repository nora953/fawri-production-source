import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');

const moneyUi = fs.readFileSync(path.join(root, 'src/lib/moneyUi.ts'), 'utf8');
const catalogCss = fs.readFileSync(path.join(root, 'src/styles/catalogSummaryCards.css'), 'utf8');

test('merchant money formatter stays direction-neutral', () => {
  assert.match(moneyUi, /return `\$\{number\}\\u00a0\$\{currency\}`;/);
  assert.doesNotMatch(moneyUi, /\\u202D|\\u202E|\\u2066|\\u2067|\\u2068|\\u2069/);
});

test('Arabic and Kurdish catalog prices resolve in RTL without changing English', () => {
  assert.match(catalogCss, /\[dir="rtl"\]/);
  assert.match(catalogCss, /p\[dir="ltr"\]\.font-extrabold/);
  assert.match(catalogCss, /unicode-bidi:\s*plaintext\s*!important/);
  assert.match(catalogCss, /direction:\s*rtl\s*!important/);
  assert.doesNotMatch(catalogCss, /unicode-bidi:\s*bidi-override\s*!important/);
});
