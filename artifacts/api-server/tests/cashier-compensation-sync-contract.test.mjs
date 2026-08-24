import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const apiRoot = new URL('../', import.meta.url);
const webRoot = new URL('../../fawri/', import.meta.url);

async function apiSource(path) {
  return readFile(new URL(path, apiRoot), 'utf8');
}

async function webSource(path) {
  return readFile(new URL(path, webRoot), 'utf8');
}

test('cashier compensation sync is merchant-authenticated and separate from sale sync', async () => {
  const route = await apiSource('src/routes/cashier-sync-operations.ts');

  assert.match(route, /router\.post\(\s*["']\/cashier\/sync\/compensation["']/);
  assert.match(route, /requireMerchantSession/);
  assert.match(route, /getMerchantIdFromSession\(res\)/);
  assert.match(route, /syncCashierCompensationAuthoritative/);
  assert.match(route, /router\.post\(\s*["']\/cashier\/sync\/sale["']/);
});

test('cashier compensation replays before inventory and uses one PostgreSQL transaction', async () => {
  const source = await apiSource(
    'src/services/postgresCashierCompensationSyncAuthority.ts',
  );

  assert.match(source, /withMerchantOperationalTransaction\(merchantId/);
  assert.match(source, /pg_advisory_xact_lock/);
  assert.match(source, /findOperationUsage/);
  assert.match(source, /replayed: true/);
  assert.match(source, /request_hash/);
  assert.match(source, /CASHIER_SYNC_IDEMPOTENCY_CONFLICT/);
  assert.match(source, /assertDeviceSequenceUnused/);

  const usage = source.indexOf('const operationUsage = await findOperationUsage');
  const replay = source.indexOf('if (replay) return replay', usage);
  const originalInventory = source.indexOf(
    'const originalMutations = await loadOriginalInventoryMutations',
    replay,
  );
  const apply = source.indexOf('inventoryMutationCount = await applyReturn', originalInventory);

  assert.ok(usage >= 0, 'operation replay evidence must be checked');
  assert.ok(replay > usage, 'matching operation must return before mutation');
  assert.ok(originalInventory > replay, 'original inventory evidence is read only after replay resolution');
  assert.ok(apply > originalInventory, 'compensation is applied after original evidence is loaded');
});

test('return reconciliation derives refund and restock from immutable original sale evidence', async () => {
  const source = await apiSource(
    'src/services/postgresCashierCompensationSyncAuthority.ts',
  );

  assert.match(source, /metadata\.sale_snapshot/);
  assert.match(source, /reason_code = 'cashier_sale_sync'/);
  assert.match(source, /validateOriginalInventoryEvidence/);
  assert.match(source, /requested\.effective_unit_price_minor !== line\.effective_unit_price_minor/);
  assert.match(source, /safeMultiply\(\s*line\.effective_unit_price_minor,\s*requested\.quantity/);
  assert.match(source, /returnedQuantity\(previousCompensations, line\.line_id\)/);
  assert.match(source, /requested\.quantity > remaining/);
  assert.match(source, /cashier_return_sync/);
  assert.match(source, /bundle\.movements\.size !== 0/);
});

test('void reconciliation restores original tracked stock without bypassing terminal order lifecycle', async () => {
  const source = await apiSource(
    'src/services/postgresCashierCompensationSyncAuthority.ts',
  );

  assert.match(source, /snapshot\.refund_total_minor !== originalSale\.total_minor/);
  assert.match(source, /previousCompensations\.length > 0/);
  assert.match(source, /assertMovementMatches/);
  assert.match(source, /cashier_void_sync/);
  assert.match(source, /current_sale_status: "voided"/);
  assert.match(source, /compensations: nextCompensations/);
  assert.doesNotMatch(source, /SET status = 'cancelled'/);
  assert.doesNotMatch(source, /cancelled_at/);
  assert.match(source, /delivered as terminal/);
});

test('browser classifies return and void outbox operations and ACKs only after complete server acceptance', async () => {
  const source = await webSource('src/lib/cashierCloudOutboxSync.ts');

  assert.match(source, /type CashierOperationKind = 'sale' \| 'return' \| 'void'/);
  assert.match(source, /function classifyOperation/);
  assert.match(source, /return 'return'/);
  assert.match(source, /return 'void'/);
  assert.match(source, /'\/api\/cashier\/sync\/compensation'/);
  assert.match(source, /payload\.compensation_kind !== input\.kind/);
  assert.match(source, /accepted_entity_ids/);
  assert.match(source, /acknowledgeSynced\(\[operation\.operationId\]\)/);

  const fetchCall = source.indexOf('response = await fetch(endpoint');
  const responseAccepted = source.indexOf('payload?.ok !== true', fetchCall);
  const entityAckValidation = source.indexOf(
    'acceptedEntityIds.size !== expectedEntityIds.size',
    responseAccepted,
  );
  const localAck = source.indexOf('acknowledgeSynced([operation.operationId])');

  assert.ok(fetchCall >= 0, 'outbox uploader must call the selected sync endpoint');
  assert.ok(responseAccepted > fetchCall, 'server success must be checked after upload');
  assert.ok(entityAckValidation > responseAccepted, 'complete entity acknowledgement must be verified');
  assert.ok(localAck > entityAckValidation, 'local outbox must be deleted only after full ACK');
});
