import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source = new URL('../src/lib/cashierIndexedDbAuthority.ts', import.meta.url);

test('SEQ-R2 opt-in v2 independent adjustment refuses before any IndexedDB write transaction', async () => {
  const code = await readFile(source, 'utf8');
  const config = code.match(/export type IndexedDbCashierConfig = \{([\s\S]*?)\n\};/)?.[1] || '';
  assert.match(config, /v2AdjustmentGuard\?: 'refuse-independent-adjustments'/);
  assert.match(code, /this\.refuseV2IndependentAdjustments = config\.v2AdjustmentGuard === 'refuse-independent-adjustments'/);
  const start = code.indexOf('  async adjustInventory(');
  const end = code.indexOf('\n  async ', start + 5);
  const method = code.slice(start, end < 0 ? undefined : end);
  const guard = method.indexOf('if (this.refuseV2IndependentAdjustments)');
  const refusal = method.indexOf('CASHIER_V2_INDEPENDENT_ADJUSTMENT_UNSUPPORTED');
  const database = method.indexOf('await this.databasePromise');
  const transaction = method.indexOf('database.transaction(');
  const sequence = method.indexOf('nextDeviceSequence(meta)');
  const stock = method.indexOf('catalog.put(record)');
  const movement = method.indexOf('movements.put(movement)');
  const outbox = method.indexOf('outbox.put(');
  assert.ok(guard >= 0 && refusal > guard);
  for (const [name, index] of Object.entries({ database, transaction, sequence, stock, movement, outbox })) {
    assert.ok(index > refusal, name + ' must occur after the refusal');
  }
  assert.match(method.slice(guard, database), /throw new CashierIndexedDbError/);
  assert.doesNotMatch(method.slice(guard, database), /\.put\(|nextDeviceSequence|database\.transaction/);
});
