import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const endShift = fs.readFileSync(
  new URL('../src/components/cashier/CashierEndShiftButton.tsx', import.meta.url),
  'utf8',
);
const commerceFixes = fs.readFileSync(
  new URL('../src/styles/merchantCommerceUxFixes.css', import.meta.url),
  'utf8',
);

test('English end-shift actions mirror the reviewed Arabic and Sorani physical order', () => {
  // The component keeps the reviewed Arabic/Sorani baseline: Cancel first in an LTR
  // action grid means Cancel is physically left and End shift physically right.
  assert.match(
    endShift,
    /<div className="mt-5 grid grid-cols-2 gap-3" dir="ltr">[\s\S]*labels\.cancel[\s\S]*labels\.confirm/,
  );

  // English alone mirrors the action grid, placing End shift on the left and Cancel
  // on the right without changing button semantics or DOM order.
  assert.match(
    commerceFixes,
    /html\[lang="en"\]\[data-cashier-view="pos"\] \[role="dialog"\] form > \.mt-5\.grid\.grid-cols-2\.gap-3 \{[\s\S]*direction: rtl !important;/,
  );
  assert.doesNotMatch(
    commerceFixes,
    /html\[lang="(?:ar|ku)"\][^\n]*\[role="dialog"\][\s\S]*direction: rtl !important;/,
  );
});
