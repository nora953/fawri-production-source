import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../', import.meta.url);

async function source(path) {
  return readFile(new URL(path, root), 'utf8');
}

test('live cashier entry and manual sync use the operator-aware outbox authority', async () => {
  const entry = await source('src/cashierMain.tsx');
  const page = await source('src/pages/CashierCatalogSyncPage.tsx');

  assert.match(entry, /syncCashierOperatorOutboxToCloud/);
  assert.match(entry, /syncCashierOperatorCatalogFromCloud/);
  assert.doesNotMatch(entry, /syncCashierOutboxToCloud/);
  assert.match(page, /syncCashierOperatorOutboxToCloud/);
  assert.match(page, /syncCashierOperatorCatalogFromCloud/);
  assert.doesNotMatch(page, /syncCashierOutboxToCloud/);
});

test('operator outbox binds every upload to the active merchant station staff shift and device', async () => {
  const sync = await source('src/lib/cashierOperatorCloudSync.ts');

  assert.match(sync, /getCashierOperationBinding\(operationId\)/);
  assert.match(sync, /binding\.merchant_id === session\.context\.merchant_id/);
  assert.match(sync, /binding\.station_id === session\.context\.station_id/);
  assert.match(sync, /binding\.staff_id === session\.context\.staff_id/);
  assert.match(sync, /binding\.shift_id === session\.context\.shift_id/);
  assert.match(sync, /binding\.device_id === session\.context\.device_id/);
  assert.match(sync, /CASHIER_OPERATOR_OPERATION_BINDING_MISSING/);
  assert.match(sync, /CASHIER_OPERATOR_OPERATION_BINDING_CONFLICT/);
  assert.match(sync, /credentials:\s*'omit'/);
  assert.match(sync, /`\/api\/cashier\/operator\/sync\/\$\{kind\}`/);
});

test('operator outbox ACK is complete before local durable operation deletion', async () => {
  const sync = await source('src/lib/cashierOperatorCloudSync.ts');

  assert.match(sync, /payload\.operation_id/);
  assert.match(sync, /payload\.device_sequence/);
  assert.match(sync, /payload\.order_id/);
  assert.match(sync, /payload\.accepted_entity_ids/);
  assert.match(sync, /payload\.compensation_kind/);
  assert.match(sync, /CASHIER_OPERATOR_ACK_INVALID/);

  const fetchCall = sync.indexOf("fetch(`/api/cashier/operator/sync/${kind}`");
  const operationAck = sync.indexOf('payload.operation_id', fetchCall);
  const sequenceAck = sync.indexOf('payload.device_sequence', fetchCall);
  const orderAck = sync.indexOf('payload.order_id', fetchCall);
  const entityAck = sync.indexOf('payload.accepted_entity_ids', fetchCall);
  const compensationAck = sync.indexOf('payload.compensation_kind', fetchCall);
  const localAck = sync.indexOf('await authority.acknowledgeSynced([operationId])');

  assert.ok(fetchCall >= 0, 'operator outbox must use the operator sync endpoint');
  assert.ok(operationAck > fetchCall, 'operation identity must be validated after the server response');
  assert.ok(sequenceAck > operationAck, 'device sequence must be part of ACK validation');
  assert.ok(orderAck > sequenceAck, 'canonical order identity must be part of ACK validation');
  assert.ok(entityAck > orderAck, 'every envelope entity must be acknowledged');
  assert.ok(compensationAck > entityAck, 'return/void kind must be confirmed by the server ACK');
  assert.ok(localAck > compensationAck, 'local outbox deletion must happen only after complete ACK validation');
});

test('operator outbox keeps a full boundary operation intact instead of uploading a partial group', async () => {
  const sync = await source('src/lib/cashierOperatorCloudSync.ts');

  assert.match(sync, /function completeOperationWindow/);
  assert.match(sync, /pending\.length < MAX_PENDING_ENVELOPES/);
  assert.match(sync, /CASHIER_OPERATOR_OPERATION_TOO_LARGE/);
  assert.match(sync, /return pending\.slice\(0, firstBoundaryIndex\)/);
});
