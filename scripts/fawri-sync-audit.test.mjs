import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import vm from 'node:vm';
import test from 'node:test';

// Execute the committed function bodies, replacing imports with explicit inert
// dependencies. No application import, DB connection, provider or browser I/O.
// This is a mocked runtime audit, not PostgreSQL/IndexedDB integration proof.
function load(path, names, dependencies = {}) {
  const raw = readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
  const code = stripTypeScriptTypes(raw, { mode: 'transform' })
    .replace(/^import\s[\s\S]*?;\s*$/gm, '')
    .replace(/^export\s+/gm, '');
  return vm.runInNewContext(`(() => { ${code}\nreturn { ${names.join(',')} }; })()`,
    { crypto, Date, Map, Set, ...dependencies }, { filename: path, timeout: 2000 });
}

const operatorPath = 'artifacts/fawri/src/lib/cashierOperatorCloudSync.ts';
const timelinePath = 'artifacts/api-server/src/services/cashierHistoricalOperationAuthority.ts';
const context = { merchant_id: 'merchant', station_id: 'station', staff_id: 'staff',
  shift_id: 'current-shift', device_id: 'device' };
const session = { context };
const envelope = (id, sequence) => ({ schema_version: 1, operation_id: id,
  device_id: 'device', device_sequence: sequence, entity_type: 'return',
  entity_id: `${id}-return`, operation: 'append', occurred_at: '2026-10-12T00:00:00Z', payload: {} });
const receipt = (e, overrides = {}) => ({ ok: true, operation_id: e.operation_id,
  device_sequence: e.device_sequence, order_id: 'original-sale', compensation_kind: 'return',
  accepted_entity_ids: [e.entity_id], ...overrides });

function outboxHarness(initial, respond, bindingOverrides = {}) {
  let pending = structuredClone(initial);
  const uploads = [], deleted = [];
  let closed = false;
  class Authority {
    async listPendingSync() { return structuredClone(pending); }
    async acknowledgeSynced(ids) {
      deleted.push(...ids);
      pending = pending.filter(e => !ids.includes(e.operation_id));
    }
    async close() { closed = true; }
  }
  const api = load(operatorPath, ['syncCashierOperatorOutboxToCloud', 'postOperation',
    'completeOperationWindow'], {
    navigator: { onLine: true }, IndexedDbCashierAuthority: Authority,
    getCashierOperatorSession: async () => session,
    getOrCreateCashierDeviceIdentity: async () => ({ cloud_merchant_id: 'merchant',
      local_merchant_id: 'local', device_id: 'device' }),
    getCashierOperationBinding: async id => ({ ...context, operation_kind: 'return',
      ...bindingOverrides[id] }),
    cashierOperatorHeaders: () => ({ 'Content-Type': 'application/json' }),
    fetch: async (url, options) => {
      const body = JSON.parse(options.body); uploads.push(body.operation_id);
      return respond(body, uploads.length);
    },
  });
  return { api, uploads, deleted, pending: () => pending, closed: () => closed };
}

for (const [name, patch] of [
  ['wrong operation', { operation_id: 'other' }],
  ['wrong sequence', { device_sequence: 99 }],
  ['missing order', { order_id: '' }],
  ['missing entity', { accepted_entity_ids: [] }],
  ['duplicate extra entity', { accepted_entity_ids: ['one-return', 'one-return'] }],
  ['wrong compensation kind', { compensation_kind: 'void' }],
]) {
  test(`runtime outbox retains operation on ${name} ACK`, async () => {
    const e = envelope('one', 1);
    const h = outboxHarness([e], async () => ({ ok: true, status: 200,
      json: async () => receipt(e, patch) }));
    await assert.rejects(h.api.syncCashierOperatorOutboxToCloud(),
      err => err.code === 'CASHIER_OPERATOR_ACK_INVALID');
    assert.deepEqual(h.deleted, []); assert.equal(h.pending().length, 1);
    assert.equal(h.closed(), true);
  });
}

test('runtime outbox retains an operation when transport throws', async () => {
  const h = outboxHarness([envelope('one', 1)], async () => { throw new Error('network ambiguity'); });
  await assert.rejects(h.api.syncCashierOperatorOutboxToCloud(), /network ambiguity/);
  assert.equal(h.pending().length, 1); assert.deepEqual(h.deleted, []);
  assert.equal(h.closed(), true);
});

test('runtime outbox commits first ACK and retains later rejected operations', async () => {
  const first = envelope('one', 1), second = envelope('two', 2);
  const h = outboxHarness([first, second], async (body, number) => number === 1
    ? { ok: true, status: 200, json: async () => receipt(first) }
    : { ok: false, status: 409, json: async () => ({ ok: false, code: 'STOCK_CONFLICT' }) });
  await assert.rejects(h.api.syncCashierOperatorOutboxToCloud(), err => err.code === 'STOCK_CONFLICT');
  assert.deepEqual(h.deleted, ['one']); assert.equal(h.pending()[0].operation_id, 'two');
});

test('runtime complete idempotent replay ACK deletes once', async () => {
  const e = envelope('one', 1);
  const h = outboxHarness([e], async () => ({ ok: true, status: 200,
    json: async () => receipt(e, { replayed: true }) }));
  const result = await h.api.syncCashierOperatorOutboxToCloud();
  assert.equal(result.replayed_operations, 1); assert.equal(result.acknowledged_operations, 1);
  assert.deepEqual(h.deleted, ['one']); assert.equal(h.pending().length, 0);
});

test('runtime prior-shift binding prevents upload even for same station staff and device', async () => {
  const h = outboxHarness([envelope('one', 1)], async () => { throw new Error('must not fetch'); },
    { one: { shift_id: 'previous-shift' } });
  await assert.rejects(h.api.syncCashierOperatorOutboxToCloud(),
    err => err.code === 'CASHIER_OPERATOR_OPERATION_BINDING_CONFLICT');
  assert.deepEqual(h.uploads, []); assert.deepEqual(h.deleted, []); assert.equal(h.pending().length, 1);
});

test('runtime full envelope window defers the final operation intact', () => {
  const h = outboxHarness([], async () => { throw new Error('must not fetch'); });
  const pending = Array.from({ length: 999 }, (_, i) => envelope(`op${i}`, i + 1));
  pending.push(envelope('boundary', 1000));
  const complete = h.api.completeOperationWindow(pending);
  assert.equal(complete.length, 999); assert.equal(complete.some(e => e.operation_id === 'boundary'), false);
});

function timelineHarness(rows = []) {
  const state = structuredClone(rows);
  const target = { async query(sql, p) {
    if (sql.includes('INSERT INTO cashier_device_operation_timeline')) {
      state.push({ device_sequence: p[6], operation_id: p[7], operation_kind: p[8],
        station_id: p[4], subscription_id: p[2], billing_order_id: p[3], occurred_at: p[9] });
      return { rows: [] };
    }
    let matches = state.slice();
    if (sql.includes('device_sequence = $3')) matches = matches.filter(x => x.device_sequence === p[2]);
    if (sql.includes('device_sequence < $3')) matches = matches.filter(x => x.device_sequence < p[2]);
    if (sql.includes('device_sequence > $3')) matches = matches.filter(x => x.device_sequence > p[2]);
    matches.sort((a, b) => sql.includes('ASC') ? a.device_sequence - b.device_sequence
      : b.device_sequence - a.device_sequence);
    return { rows: matches.slice(0, 1) };
  } };
  const api = load(timelinePath, ['recordCashierOperationTimelineInTransaction'], {
    operationalQueryRows: async (target, sql, p) => (await target.query(sql, p)).rows,
  });
  const accept = (sequence, id = `op${sequence}`, at = '2026-10-12T00:00:00Z') =>
    api.recordCashierOperationTimelineInTransaction({ target, merchantId: 'merchant', deviceId: 'device',
      deviceSequence: sequence, operationId: id, operationKind: 'sale', occurredAt: at,
      authority: { allowed: true, stationId: 'station', subscriptionId: 'subscription', billingOrderId: 'billing' },
      now: new Date('2026-10-12T00:01:00Z') });
  return { accept, state };
}

test('runtime timeline exact replay does not insert a second record', async () => {
  const h = timelineHarness(); assert.equal((await h.accept(1)).allowed, true);
  const replay = await h.accept(1); assert.equal(replay.allowed, true); assert.equal(replay.replayed, true);
  assert.equal(h.state.length, 1);
});

test('runtime timeline reused sequence with changed operation is rejected', async () => {
  const h = timelineHarness(); await h.accept(1);
  assert.equal((await h.accept(1, 'changed')).code, 'CASHIER_OPERATION_SEQUENCE_CONFLICT');
});

test('runtime observation: sequence gap accepted; later missing operation cannot backfill', async () => {
  const h = timelineHarness(); await h.accept(1);
  assert.equal((await h.accept(3)).allowed, true);
  assert.equal((await h.accept(2)).code, 'CASHIER_OPERATION_SEQUENCE_CONFLICT');
  assert.deepEqual(h.state.map(x => x.device_sequence), [1, 3]);
});

test('runtime timeline rejects clock ahead beyond five minutes', async () => {
  const h = timelineHarness();
  assert.equal((await h.accept(1, 'ahead', '2026-10-12T00:06:01Z')).code, 'CASHIER_OPERATION_CLOCK_AHEAD');
  assert.equal(h.state.length, 0);
});

test('runtime timeline rejects clock rollback beyond two minutes', async () => {
  const h = timelineHarness(); await h.accept(1);
  assert.equal((await h.accept(2, 'rollback', '2026-10-11T23:57:59Z')).code, 'CASHIER_OPERATION_CLOCK_ROLLBACK');
  assert.equal(h.state.length, 1);
});

const salePath = 'artifacts/api-server/src/services/postgresCashierSyncAuthority.ts';
function saleBody() {
  const sale = { sale_id: 'sale', operation_id: 'op', local_merchant_id: 'local',
    cloud_merchant_id: 'merchant', device_id: 'device', device_sequence: 1,
    source: 'cashier', status: 'completed', lines: [{ line_id: 'line', product_id: 'product',
      product_name_snapshot: 'Product', catalog_version: 1, quantity: 1,
      base_unit_price_minor: 1000, effective_unit_price_minor: 1000,
      discount_minor: 0, line_total_minor: 1000 }], subtotal_minor: 1000,
    discount_minor: 0, total_minor: 1000, currency_code: 'IQD', currency_fraction_digits: 0,
    payment_method: 'cash', payment_status: 'paid', occurred_at: '2026-10-12T00:00:00Z' };
  return { cloud_merchant_id: 'merchant', local_merchant_id: 'local', device_id: 'device',
    device_sequence: 1, operation_id: 'op', envelopes: [{ schema_version: 1,
      operation_id: 'op', device_id: 'device', device_sequence: 1, entity_type: 'sale',
      entity_id: 'sale', operation: 'append', occurred_at: sale.occurred_at, payload: sale }] };
}

function saleHarness() {
  const queries = [];
  let stored;
  const api = load(salePath, ['validateCashierSaleSyncBundle', 'syncCashierSaleAuthoritative'], {
    operationalPostgresAuthorityRequired: () => true,
    withMerchantOperationalTransaction: async (merchant, work) => work({
      query: async sql => { queries.push(sql); return { rows: [] }; },
    }),
    evaluateCashierHistoricalOperationAuthorityInTransaction: async () => ({ allowed: true, stationId: 'station' }),
    recordCashierOperationTimelineInTransaction: async () => ({ allowed: true, replayed: true }),
    operationalQueryRows: async (_target, sql) => {
      queries.push(sql);
      if (sql.includes('FROM merchant_cashier_stations')) return [{ location_id: 'location' }];
      if (sql.includes('FROM orders')) return [stored];
      throw new Error('Unexpected inventory query on replay');
    },
  });
  const original = saleBody();
  const hash = api.validateCashierSaleSyncBundle(original).requestHash;
  stored = { id: 'sale', source_channel: 'cashier', fulfillment_location_id: 'location',
    metadata: { cashier_sync: { operation_id: 'op', request_hash: hash,
      device_id: 'device', device_sequence: '1', location_id: 'location' } } };
  return { api, original, queries };
}

test('runtime server identical sale retry returns replay before inventory access', async () => {
  const h = saleHarness();
  const result = await h.api.syncCashierSaleAuthoritative({ merchantId: 'merchant', body: h.original });
  assert.equal(result.replayed, true); assert.equal(result.inventory_mutation_count, 0);
  assert.equal(h.queries.some(sql => /INSERT INTO|UPDATE products|location_inventory_levels/.test(sql)), false);
});

test('runtime server same operation changed note is rejected by request hash', async () => {
  const h = saleHarness(); h.original.envelopes[0].payload.note = 'changed';
  await assert.rejects(h.api.syncCashierSaleAuthoritative({ merchantId: 'merchant', body: h.original }),
    err => err.code === 'CASHIER_SYNC_IDEMPOTENCY_CONFLICT');
});

test('runtime server same operation changed coherent quantity and totals is rejected', async () => {
  const h = saleHarness(), sale = h.original.envelopes[0].payload;
  sale.lines[0].quantity = 2; sale.lines[0].line_total_minor = 2000;
  sale.subtotal_minor = 2000; sale.total_minor = 2000;
  await assert.rejects(h.api.syncCashierSaleAuthoritative({ merchantId: 'merchant', body: h.original }),
    err => err.code === 'CASHIER_SYNC_IDEMPOTENCY_CONFLICT');
});

test('runtime server cross-tenant request is denied before transaction', async () => {
  const h = saleHarness();
  await assert.rejects(h.api.syncCashierSaleAuthoritative({ merchantId: 'other', body: h.original }),
    err => err.code === 'CASHIER_SYNC_TENANT_MISMATCH');
  assert.equal(h.queries.length, 0);
});

test('runtime sale parser rejects inconsistent total and unsafe integer multiplication', () => {
  const h = saleHarness();
  const wrong = structuredClone(h.original); wrong.envelopes[0].payload.total_minor = 999;
  assert.throws(() => h.api.validateCashierSaleSyncBundle(wrong), err => err.code === 'CASHIER_SYNC_INVALID');
  const huge = structuredClone(h.original); huge.envelopes[0].payload.lines[0].quantity = Number.MAX_SAFE_INTEGER;
  assert.throws(() => h.api.validateCashierSaleSyncBundle(huge), err => err.code === 'CASHIER_SYNC_INVALID');
});

test('runtime sale parser rejects incorrect cash change and unsupported currency', () => {
  const h = saleHarness();
  const cash = structuredClone(h.original);
  Object.assign(cash.envelopes[0].payload, { cash_tendered_minor: 1500, change_due_minor: 400 });
  assert.throws(() => h.api.validateCashierSaleSyncBundle(cash), err => err.code === 'CASHIER_SYNC_CASH_CHANGE_INVALID');
  const foreign = structuredClone(h.original); foreign.envelopes[0].payload.currency_code = 'USD';
  assert.throws(() => h.api.validateCashierSaleSyncBundle(foreign), err => err.code === 'CASHIER_SYNC_CURRENCY_UNSUPPORTED');
});

test('runtime server normalized hash is stable across object key ordering', () => {
  const h = saleHarness();
  const reordered = Object.fromEntries(Object.entries(h.original).reverse());
  assert.equal(h.api.validateCashierSaleSyncBundle(reordered).requestHash,
    h.api.validateCashierSaleSyncBundle(h.original).requestHash);
});

const offlinePath = 'artifacts/fawri/src/lib/cashierOfflineEntitlementAuthority.ts';
function offlineHarness(now = Date.parse('2026-10-12T00:00:00Z')) {
  class Clock extends Date { static now() { return now; } }
  const api = load(offlinePath, ['validAuthority', 'estimatedServerNow'], { Date: Clock });
  const authority = { id: 'cashier-entitlement-authority-v1', merchant_id: 'merchant', station_id: 'station',
    subscription_id: 'subscription', state: 'active', licensed_seats: 1, version: 1,
    billing_period_end: '2026-10-13T00:00:00Z', grace_until: '2026-10-20T00:00:00Z',
    server_time: '2026-10-12T00:00:00Z', observed_local_time_ms: now, last_local_time_ms: now,
    last_estimated_server_time_ms: now };
  return { api, authority, now };
}

test('runtime offline cache rejects grace before billing expiry', () => {
  const h = offlineHarness(); h.authority.grace_until = h.authority.billing_period_end;
  assert.equal(h.api.validAuthority(h.authority), null);
});

test('runtime observation: structurally valid cache accepts edited far-future grace without signature', () => {
  const h = offlineHarness(); h.authority.grace_until = '2036-10-20T00:00:00Z';
  assert.notEqual(h.api.validAuthority(h.authority), null);
});

test('runtime offline clock helper rejects wall clock rollback greater than two minutes', () => {
  const h = offlineHarness(); h.authority.last_local_time_ms = h.now + 120001;
  assert.throws(() => h.api.estimatedServerNow(h.authority), err => err.code === 'CASHIER_DEVICE_CLOCK_ROLLBACK');
});

test('runtime offline clock estimate never falls below durable prior server estimate after restart', () => {
  const h = offlineHarness(); h.authority.last_estimated_server_time_ms = h.now + 60000;
  assert.equal(h.api.estimatedServerNow(h.authority), h.now + 60000);
});
