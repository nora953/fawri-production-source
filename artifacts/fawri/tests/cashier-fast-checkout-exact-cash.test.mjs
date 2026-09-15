import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source = await readFile(
  new URL('../src/components/cashier/CashierCheckoutModal.tsx', import.meta.url),
  'utf8',
);

test('cash checkout defaults to exact tender and tracks total changes until cashier edits', () => {
  assert.match(source, /const cashTouchedRef = useRef\(false\)/);
  assert.match(source, /const previousExactTotalRef = useRef<number \| null>\(null\)/);
  assert.match(
    source,
    /previousExactTotalRef\.current !== finalTotalMinor[\s\S]*!cashTouchedRef\.current[\s\S]*onExactCash\(\)/,
  );
  assert.match(
    source,
    /onChange=\{event => \{[\s\S]*cashTouchedRef\.current = true;[\s\S]*onCashTenderChange\(event\.target\.value\)/,
  );
  assert.match(
    source,
    /cashTouchedRef\.current = false;[\s\S]*previousExactTotalRef\.current = finalTotalMinor;[\s\S]*onExactCash\(\)/,
  );
});

test('Enter confirms only safe ready cash checkout and ignores other checkout inputs', () => {
  assert.match(source, /event\.key !== 'Enter'/);
  assert.match(source, /event\.repeat/);
  assert.match(source, /committing/);
  assert.match(source, /overrideApprovalLoading/);
  assert.match(source, /!canSubmit/);
  assert.match(source, /paymentMethod !== 'cash'/);
  assert.match(source, /tag === 'textarea' \|\| tag === 'select' \|\| tag === 'button'/);
  assert.match(source, /tag === 'input' && target\.id !== 'cashier-cash-received'/);
  assert.match(source, /event\.preventDefault\(\);[\s\S]*event\.stopPropagation\(\);[\s\S]*onSubmit\(\)/);
});

test('Escape remains fail-safe while commit or manager approval is active', () => {
  assert.match(
    source,
    /event\.key === 'Escape'[\s\S]*!committing && !overrideApprovalLoading[\s\S]*onClose\(\)/,
  );
});
