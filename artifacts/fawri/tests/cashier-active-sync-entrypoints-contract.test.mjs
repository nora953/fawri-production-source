import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../src/', import.meta.url);

for (const entry of ['cashierMain.tsx', 'pages/CashierCatalogSyncPage.tsx']) {
  test(`cashier entrypoint ${entry} retains operator-aware outbox synchronization`, async () => {
    const source = await readFile(new URL(entry, root), 'utf8');
    assert.match(source, /syncCashierOperatorOutboxToCloud/);
    assert.match(source, /cashierOperatorCloudSync/);
    assert.doesNotMatch(source, /syncCashierOutboxToCloud|cashierCloudOutboxSync/);
  });
}

test('operator-aware sync retains a complete-operation boundary guard', async () => {
  const source = await readFile(new URL('lib/cashierOperatorCloudSync.ts', root), 'utf8');
  assert.match(source, /function completeOperationWindow\(/);
  assert.match(source, /CASHIER_OPERATOR_OPERATION_TOO_LARGE/);
  assert.match(source, /pending\.slice\(0, firstBoundaryIndex\)/);
});
