import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const css = fs.readFileSync(
  path.join(root, 'src/styles/cashierPos.css'),
  'utf8',
);

test('cashier catalog cards contain long merchant identifiers without overlap', () => {
  assert.match(css, /section:first-child > div:last-child \{[\s\S]*overflow-x: hidden !important/);
  assert.match(css, /section:first-child > div:last-child > div\.grid > button \{[\s\S]*min-width: 0;[\s\S]*overflow: hidden/);
  assert.match(css, /grid-template-columns: minmax\(0, 1fr\) auto/);
  assert.match(css, /text-overflow: ellipsis/);
  assert.match(css, /-webkit-line-clamp: 2/);
});
