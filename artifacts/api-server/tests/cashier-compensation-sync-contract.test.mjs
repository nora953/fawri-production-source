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

test('return reconciliation derives charged-value refund and restock from immutable original sale evidence', async () => {
  const source = await apiSource(
    'src/services/postgresCashierCompensationSyncAuthority.ts',
  );

  assert.match(source, /metadata\.sale_snapshot/);
  assert.match(source, /reason_code = 'cashier_sale_sync'/);
  assert.match(source, /validateOriginalInventoryEvidence/);
  assert.match(source, /CASHIER_RETURN_REFUND_ALLOCATION_VERSION = 2/);
  assert.match(source, /refund_allocation_version/);
  assert.match(source, /requested\.effective_unit_price_minor !== line\.effective_unit_price_minor/);
  assert.match(source, /allocatedReturnRefundMinor/);
  assert.match(source, /refundedAmount\(previousCompensations\)/);
  assert.match(source, /Math\.min\(allocatedRefund, remainingSaleRefundMinor\)/);
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

test('operator browser classifies return and void and ACKs only after complete server acceptance', async () => {
  const source = await webSource('src/lib/cashierOperatorCloudSync.ts');

  assert.match(source, /kind: 'sale' \| 'return' \| 'void'/);
  assert.match(source, /operationKind\(envelopes\)/);
  assert.match(source, /`\/api\/cashier\/operator\/sync\/\$\{kind\}`/);
  assert.match(source, /payload\.compensation_kind/);
  assert.match(source, /compensationKind !== kind/);
  assert.match(source, /payload\.accepted_entity_ids/);
  assert.match(source, /CASHIER_OPERATOR_ACK_INVALID/);
  assert.match(source, /authority\.acknowledgeSynced\(\[operationId\]\)/);

  const fetchCall = source.indexOf('fetch(`/api/cashier/operator/sync/${kind}`');
  const responseAccepted = source.indexOf('payload.ok !== true', fetchCall);
  const entityAckValidation = source.indexOf('acceptedEntityIds.length !== expectedEntityIds.length', responseAccepted);
  const compensationAckValidation = source.indexOf("kind !== 'sale' && compensationKind !== kind", entityAckValidation);
  const localAck = source.indexOf('authority.acknowledgeSynced([operationId])');

  assert.ok(fetchCall >= 0, 'operator outbox uploader must call the operator sync endpoint');
  assert.ok(responseAccepted > fetchCall, 'server success must be checked after upload');
  assert.ok(entityAckValidation > responseAccepted, 'complete entity acknowledgement must be verified');
  assert.ok(compensationAckValidation > entityAckValidation, 'return/void kind must be verified before ACK');
  assert.ok(localAck > compensationAckValidation, 'local outbox must be deleted only after full operator ACK');
});
