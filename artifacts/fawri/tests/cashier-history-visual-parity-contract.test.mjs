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

test('Arabic history reprint Return all and Void sale share the reviewed light-gray secondary surface', () => {
  assert.match(
    commerceFixes,
    /html\[lang="ar"\]\[data-cashier-view="history"\][\s\S]*div:first-child > div:last-child > button,[\s\S]*\.mb-3\.flex\.items-center\.justify-between\.gap-3 > button,[\s\S]*\.border-t > div:last-child > button:first-child \{[\s\S]*border: 1px solid #fecaca !important;[\s\S]*background: #f8fafc !important;[\s\S]*color: #b91c1c !important;[\s\S]*border-radius: 0\.75rem !important;[\s\S]*padding: 0\.625rem 1rem !important;[\s\S]*font-size: 0\.875rem !important;[\s\S]*font-weight: 700 !important;/,
  );
  assert.match(
    commerceFixes,
    /html\[lang="ar"\]\[data-cashier-view="history"\][\s\S]*button:first-child:hover \{[\s\S]*background: #f1f5f9 !important;/,
  );
});

test('Arabic history detail sync chip matches the outlined pill shape without forcing equal size', () => {
  assert.match(
    commerceFixes,
    /html\[lang="ar"\]\[data-cashier-view="history"\][\s\S]*div\.mb-1\.flex\.flex-wrap\.items-center\.gap-2 > span:last-child \{[\s\S]*border-style: solid !important;[\s\S]*border-width: 1px !important;[\s\S]*border-radius: 9999px !important;/,
  );
  assert.match(
    commerceFixes,
    /span:last-child\.bg-emerald-50 \{[\s\S]*border-color: #a7f3d0 !important;/,
  );
  assert.match(
    commerceFixes,
    /span:last-child\.bg-amber-50 \{[\s\S]*border-color: #fde68a !important;/,
  );
  assert.doesNotMatch(
    commerceFixes,
    /span:last-child \{[\s\S]{0,250}(padding|font-size):/,
  );
});

test('Arabic history sale-list sync state uses a compact outlined pill', () => {
  assert.match(
    commerceFixes,
    /html\[lang="ar"\]\[data-cashier-view="history"\] #cashier-root main section:first-child > div\.p-2 > button > div\.flex\.items-end\.justify-between\.gap-3 > span \{[\s\S]*border: 1px solid #a7f3d0 !important;[\s\S]*border-radius: 9999px !important;[\s\S]*padding: 0\.125rem 0\.5rem !important;/,
  );
  assert.match(
    commerceFixes,
    /span\.text-amber-700 \{[\s\S]*border-color: #fde68a !important;/,
  );
});
