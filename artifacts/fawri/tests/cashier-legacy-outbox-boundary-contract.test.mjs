import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../', import.meta.url);
const source = path => readFile(new URL(path, root), 'utf8');

test('legacy outbox reads a lookahead envelope and refuses truncated boundary before upload', async () => {
  const indexedDb = await source('src/lib/cashierIndexedDbAuthority.ts');
  const sync = await source('src/lib/cashierCloudOutboxSync.ts');
  assert.match(indexedDb, /Math\.min\(1001, Math\.floor\(limit \|\| 100\)\)/);
  const read = sync.indexOf('listPendingSync(MAX_PENDING_ENVELOPES + 1)');
  const boundary = sync.indexOf('CASHIER_OUTBOX_BATCH_BOUNDARY_INCOMPLETE', read);
  const upload = sync.indexOf('await uploadOperation(', boundary);
  const ack = sync.indexOf('await authority.acknowledgeSynced(', boundary);
  assert.ok(read >= 0 && boundary > read, 'lookahead must precede boundary rejection');
  assert.ok(upload > boundary && ack > upload, 'reject partial batch before upload or ACK');
  assert.match(sync.slice(read, boundary), /last\.operation_id === next\.operation_id/);
  assert.match(sync.slice(read, boundary), /last\.device_sequence === next\.device_sequence/);
});
