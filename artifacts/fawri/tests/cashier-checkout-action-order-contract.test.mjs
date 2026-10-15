import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const checkout = fs.readFileSync(
  new URL('../src/components/cashier/CashierCheckoutModal.tsx', import.meta.url),
  'utf8',
);
const commerceFixes = fs.readFileSync(
  new URL('../src/styles/merchantCommerceUxFixes.css', import.meta.url),
  'utf8',
);

test('English checkout actions mirror the reviewed Arabic and Sorani physical order', () => {
  // The component baseline keeps Back first in an LTR footer grid, which is the
  // reviewed Arabic/Sorani physical order: Back left, Confirm sale right.
  assert.match(
    checkout,
    /<footer\s+dir="ltr"[\s\S]*extra\.cancelCheckout[\s\S]*extra\.confirmSale/,
  );

  // English alone mirrors the footer grid. The first 0.8fr track therefore sits
  // on the right for Back, while the larger 1.2fr Confirm sale track sits left.
  assert.match(
    commerceFixes,
    /html\[lang="en"\]\[data-cashier-view="pos"\] \[data-cashier-checkout="open"\] > section > footer \{[\s\S]*direction: rtl !important;/,
  );

  assert.doesNotMatch(
    commerceFixes,
    /html\[lang="(?:ar|ku)"\][^\n]*\[data-cashier-checkout="open"\][\s\S]*direction: rtl !important;/,
  );
});
