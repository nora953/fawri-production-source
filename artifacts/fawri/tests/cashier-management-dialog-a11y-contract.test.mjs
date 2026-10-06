import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const source = fs.readFileSync(
  path.join(root, 'artifacts/fawri/src/pages/dashboard/CashierManagementPage.tsx'),
  'utf8',
);

test('cashier management modals use the shared accessible dialog primitive', () => {
  assert.match(source, /DialogContent/);
  assert.match(source, /DialogTitle className="sr-only"/);
  assert.match(source, /onOpenChange=\{\(open\) => \{ if \(!open && !busy\) onClose\(\); \}\}/);
  assert.match(source, /onEscapeKeyDown=\{\(event\) => \{ if \(busy\) event\.preventDefault\(\); \}\}/);
  assert.doesNotMatch(source, /role="dialog" aria-modal="true"/);
  assert.doesNotMatch(source, /aria-label=\{closeLabel\}/);
});
