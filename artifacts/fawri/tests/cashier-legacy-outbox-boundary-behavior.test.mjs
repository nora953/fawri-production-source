import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source = await readFile(new URL('../src/lib/cashierCloudOutboxSync.ts', import.meta.url), 'utf8');
const start = source.indexOf('    const batch = await authority.listPendingSync(MAX_PENDING_ENVELOPES + 1);');
const end = source.indexOf('    const operations = groupPending(pending);', start);
assert.ok(start >= 0 && end > start, 'legacy outbox batch boundary guard must exist');
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
const executeBoundary = new AsyncFunction('authority', 'MAX_PENDING_ENVELOPES', 'CashierCloudOutboxSyncError', source.slice(start, end) + '\nreturn pending;');

class SyncError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

const envelope = (operation_id, device_sequence) => ({ operation_id, device_sequence });

async function check(batch) {
  const calls = [];
  const authority = { listPendingSync: async limit => {
    calls.push(limit);
    return batch.slice(0, limit);
  } };
  try {
    return { pending: await executeBoundary(authority, 1000, SyncError), calls };
  } catch (error) {
    return { error, calls };
  }
}

test('1000 complete envelopes are accepted without false boundary failure', async () => {
  const result = await check(Array.from({ length: 1000 }, (_, i) => envelope('op-' + i, i + 1)));
  assert.equal(result.pending?.length, 1000);
  assert.deepEqual(result.calls, [1001]);
});

test('1001st envelope of the same operation rejects the entire batch', async () => {
  const batch = Array.from({ length: 999 }, (_, i) => envelope('op-' + i, i + 1));
  batch.push(envelope('boundary', 1000), envelope('boundary', 1000));
  const result = await check(batch);
  assert.equal(result.error?.code, 'CASHIER_OUTBOX_BATCH_BOUNDARY_INCOMPLETE');
  assert.deepEqual(result.calls, [1001]);
});

test('different operation at lookahead boundary permits first 1000 only', async () => {
  const batch = Array.from({ length: 1001 }, (_, i) => envelope('op-' + i, i + 1));
  const result = await check(batch);
  assert.equal(result.pending?.length, 1000);
  assert.deepEqual(result.calls, [1001]);
});

test('reused device sequence across the boundary fails closed', async () => {
  const batch = Array.from({ length: 1001 }, (_, i) => envelope('op-' + i, i < 1000 ? i + 1 : 1000));
  const result = await check(batch);
  assert.equal(result.error?.code, 'CASHIER_OUTBOX_BATCH_BOUNDARY_INCOMPLETE');
});
