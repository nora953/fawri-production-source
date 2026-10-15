import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL('../src/pages/dashboard/CashierManagementPage.tsx', import.meta.url), 'utf8');

test('cashier management modal contains keyboard focus and restores the opener', () => {
  assert.match(source, /const dialogRef = useRef<HTMLDivElement>\(null\)/);
  assert.match(source, /restoreFocusRef\.current = document\.activeElement/);
  assert.match(source, /return \(\) => restoreFocusRef\.current\?\.focus\(\)/);
  assert.match(source, /event\.key === 'Escape'/);
  assert.match(source, /event\.key !== 'Tab'/);
  assert.match(source, /last\.focus\(\)/);
  assert.match(source, /first\.focus\(\)/);
  assert.match(source, /role="dialog"/);
  assert.match(source, /aria-modal="true"/);
  assert.match(source, /tabIndex=\{-1\}/);
});
