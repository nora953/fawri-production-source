import assert from 'node:assert/strict';
import fs from './helpers/contract-source.mjs';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const cashierMain = fs.readFileSync(
  fileURLToPath(new URL('../src/cashierMain.tsx', import.meta.url)),
  'utf8',
);
const cashierPos = fs.readFileSync(
  fileURLToPath(new URL('../src/pages/CashierPosPage.tsx', import.meta.url)),
  'utf8',
);
const refreshSignal = fs.readFileSync(
  fileURLToPath(new URL('../src/lib/cashierCatalogRefresh.ts', import.meta.url)),
  'utf8',
);

test('cashier reconciles cloud catalog on open/focus and refreshes mounted POS state', () => {
  assert.match(cashierMain, /await syncCashierOperatorCatalogFromCloud\(\);\s*publishCashierCatalogRefresh\(\);/);
  assert.match(cashierMain, /const handleFocus = \(\) => \{[\s\S]*?void attempt\(true, false, false\);/);
  assert.match(cashierMain, /window\.setTimeout\(\(\) => \{\s*void attempt\(true, false, false\);/);
  assert.match(cashierPos, /subscribeCashierCatalogRefresh\(\(\) => \{[\s\S]*?refreshCatalog\(runtime, query, false\)/);
  assert.match(refreshSignal, /window\.dispatchEvent\(new CustomEvent\(CASHIER_CATALOG_REFRESH_EVENT\)\)/);
});
