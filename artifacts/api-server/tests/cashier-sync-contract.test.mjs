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

test('cashier sale sync is merchant-authenticated and mounted before legacy API fallback', async () => {
  const route = await apiSource('src/routes/cashier-sync-operations.ts');
  const app = await apiSource('src/app.ts');

  assert.match(route, /router\.post\(\s*["']\/cashier\/sync\/sale["']/);
  assert.match(route, /requireMerchantSession/);
  assert.match(route, /getMerchantIdFromSession\(res\)/);
  assert.match(route, /syncCashierSaleAuthoritative/);

  const mount = app.indexOf('app.use("/api", cashierSyncOperationsRouter)');
  const legacy = app.indexOf('app.use("/api", router)');
  assert.ok(mount >= 0, 'cashier sync router must be mounted');
  assert.ok(legacy > mount, 'cashier sync must resolve before legacy API fallback');
});

test('cashier sale reconciliation is one PostgreSQL transaction with durable replay before inventory', async () => {
  const source = await apiSource('src/services/postgresCashierSyncAuthority.ts');

  assert.match(source, /withMerchantOperationalTransaction\(merchantId/);
  assert.match(source, /pg_advisory_xact_lock/);
  assert.match(source, /source_channel = 'cashier'/);
  assert.match(source, /request_hash/);
  assert.match(source, /CASHIER_SYNC_IDEMPOTENCY_CONFLICT/);
  assert.match(source, /movement\.delta !== -line\.quantity/);
  assert.match(source, /INSERT INTO inventory_mutations/);
  assert.match(source, /INSERT INTO orders/);
  assert.match(source, /INSERT INTO order_items/);

  const replayRead = source.indexOf('const existing = await loadExistingOrder');
  const replayReturn = source.indexOf('replayed: true', replayRead);
  const inventoryLoop = source.indexOf('for (const line of bundle.sale.lines)', replayRead);
  const orderInsert = source.indexOf('await insertCanonicalOrder(client, bundle)', inventoryLoop);

  assert.ok(replayRead >= 0, 'existing cashier sale must be checked');
  assert.ok(replayReturn > replayRead, 'matching existing sale must return an idempotent replay');
  assert.ok(inventoryLoop > replayReturn, 'replay must resolve before any inventory mutation');
  assert.ok(orderInsert > inventoryLoop, 'canonical order must be committed in the same transaction after inventory validation');
});

test('server derives stock decrement from sale lines and rejects extra or missing movement evidence', async () => {
  const source = await apiSource('src/services/postgresCashierSyncAuthority.ts');

  assert.match(source, /after = before - line\.quantity/);
  assert.match(source, /movement\.delta !== -line\.quantity/);
  assert.match(source, /bundle\.movements\.delete\(itemKey\(line\.product_id, line\.variant_id\)\)/);
  assert.match(source, /bundle\.movements\.size !== 0/);
  assert.match(source, /CASHIER_SYNC_NEGATIVE_STOCK/);
  assert.match(source, /CASHIER_SYNC_MOVEMENT_MISMATCH/);
});

test('browser deletes a local outbox operation only after a complete server acknowledgement', async () => {
  const source = await webSource('src/lib/cashierCloudOutboxSync.ts');

  assert.match(source, /listPendingSync\(MAX_PENDING_ENVELOPES\)/);
  assert.match(source, /'\/api\/cashier\/sync\/sale'/);
  assert.match(source, /'\/api\/cashier\/sync\/compensation'/);
  assert.match(source, /response = await fetch\(endpoint/);
  assert.match(source, /accepted_entity_ids/);
  assert.match(source, /CASHIER_OUTBOX_ACK_INVALID/);
  assert.match(source, /acknowledgeSynced\(\[operation\.operationId\]\)/);

  const fetchCall = source.indexOf('response = await fetch(endpoint');
  const responseAccepted = source.indexOf('payload?.ok !== true', fetchCall);
  const entityAckValidation = source.indexOf('acceptedEntityIds.size !== expectedEntityIds.size', responseAccepted);
  const localAck = source.indexOf('acknowledgeSynced([operation.operationId])');

  assert.ok(fetchCall >= 0, 'outbox uploader must call the selected cashier sync endpoint');
  assert.ok(responseAccepted > fetchCall, 'server success must be checked after upload');
  assert.ok(entityAckValidation > responseAccepted, 'complete entity acknowledgement must be verified');
  assert.ok(localAck > entityAckValidation, 'local outbox acknowledgement must happen only after full server ACK');
});

test('cashier keeps one manual sync action and auto-syncs real POS operations while online', async () => {
  const page = await webSource('src/pages/CashierCatalogSyncPage.tsx');
  const copy = await webSource('src/lib/cashierUiCopy.ts');
  const entry = await webSource('src/cashierMain.tsx');

  assert.match(page, /syncCashierOutboxToCloud/);
  assert.match(page, /labels\.syncNow/);
  assert.match(copy, /syncNow:\s*'مزامنة الآن'/);
  assert.match(copy, /syncNow:\s*'ئێستا هاوکات بکە'/);
  assert.match(copy, /syncNow:\s*'Sync now'/);
  assert.match(page, /pending_after/);

  assert.match(entry, /if \(!diagnostics\) \{\s*installAuthClientCutover\(\);\s*\}/);
  assert.match(entry, /syncCashierOutboxToCloud/);
  assert.match(entry, /syncCashierCatalogFromCloud/);
  assert.match(entry, /publishCashierDashboardRefresh/);
  assert.match(entry, /window\.addEventListener\('online', handleOnline\)/);
  assert.match(entry, /window\.setInterval/);
  assert.match(entry, /AUTO_SYNC_RETRY_BACKOFF_MS/);
  assert.match(entry, /result\.pending_after === 0/);
  assert.match(entry, /!diagnostics && !sync && !demoRequested/);
  assert.match(entry, /storedCashierCopy\(\)\.runtime/);

  const upload = entry.indexOf('const result = await syncCashierOutboxToCloud()');
  const dashboardRefresh = entry.indexOf('publishCashierDashboardRefresh()', upload);
  const catalogRefresh = entry.indexOf('await syncCashierCatalogFromCloud()', upload);

  assert.ok(upload >= 0, 'normal POS auto-sync must reuse the durable outbox uploader');
  assert.ok(dashboardRefresh > upload, 'dashboard refresh may only publish after an upload attempt returns');
  assert.ok(catalogRefresh > dashboardRefresh, 'reconnect reconciliation must happen only after outbox processing');
});