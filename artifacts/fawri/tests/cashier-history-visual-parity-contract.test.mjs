import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const historyPage = fs.readFileSync(
  new URL('../src/pages/CashierHistoryPage.tsx', import.meta.url),
  'utf8',
);
const commerceFixes = fs.readFileSync(
  new URL('../src/styles/merchantCommerceUxFixes.css', import.meta.url),
  'utf8',
);

test('cashier history compensation actions mirror the reviewed Arabic/Sorani and English order', () => {
  assert.match(
    historyPage,
    /\{labels\.voidSale\}[\s\S]*\{labels\.returnSelected\}/,
  );
  assert.match(
    commerceFixes,
    /html\[data-cashier-view="history"\] #cashier-root main section:last-child > div > div\.p-4 > \.mt-4\.flex\.flex-wrap\.items-center\.justify-between\.gap-3\.border-t \{[\s\S]*flex-direction: row-reverse;/,
  );
  assert.match(
    commerceFixes,
    /html\[data-cashier-view="history"\] #cashier-root main section:last-child > div > div\.p-4 > \.mt-4\.flex\.flex-wrap\.items-center\.justify-between\.gap-3\.border-t > div:last-child \{[\s\S]*flex-direction: row-reverse;/,
  );
});
