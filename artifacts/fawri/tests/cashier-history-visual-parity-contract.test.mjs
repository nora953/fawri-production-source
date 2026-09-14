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

test('Arabic history Return all and receipt reprint match the reviewed Void sale outline style', () => {
  assert.match(
    commerceFixes,
    /html\[lang="ar"\]\[data-cashier-view="history"\][\s\S]*div:first-child > div:last-child > button,[\s\S]*\.mb-3\.flex\.items-center\.justify-between\.gap-3 > button \{[\s\S]*border: 1px solid #fecaca !important;[\s\S]*background: #ffffff !important;[\s\S]*color: #b91c1c !important;[\s\S]*border-radius: 0\.75rem !important;[\s\S]*padding: 0\.625rem 1rem !important;[\s\S]*font-size: 0\.875rem !important;[\s\S]*font-weight: 700 !important;/,
  );
  assert.match(
    commerceFixes,
    /html\[lang="ar"\]\[data-cashier-view="history"\][\s\S]*button:hover[\s\S]*background: #fef2f2 !important;/,
  );
});
