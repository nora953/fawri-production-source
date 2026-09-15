import assert from 'node:assert/strict';
import test from 'node:test';
import type { CashierCommitSaleResult } from '../src/lib/cashierLocalContracts';
import { CashierSaleCommitSingleFlight } from '../src/lib/cashierSaleCommitSingleFlight';

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function result(operationId: string): CashierCommitSaleResult {
  return {
    sale: {
      sale_id: `sale:${operationId}`,
      operation_id: operationId,
      local_merchant_id: 'merchant-local',
      device_id: 'device-1',
      device_sequence: 1,
      source: 'cashier',
      status: 'completed',
      lines: [],
      subtotal_minor: 100,
      discount_minor: 0,
      total_minor: 100,
      currency_code: 'IQD',
      currency_fraction_digits: 0,
      payment_method: 'cash',
      payment_status: 'paid',
      occurred_at: '2026-09-10T00:00:00.000Z',
    },
    inventory_movements: [],
    outbox: [],
  };
}

test('duplicate rapid sale submits share exactly one in-flight commit', async () => {
  const registry = new CashierSaleCommitSingleFlight();
  const gate = deferred();
  let runs = 0;

  const first = registry.run('merchant\u0000operation-1', async () => {
    runs += 1;
    await gate.promise;
    return result('operation-1');
  });
  const second = registry.run('merchant\u0000operation-1', async () => {
    runs += 1;
    return result('should-not-run');
  });
  const third = registry.run('merchant\u0000operation-1', async () => {
    runs += 1;
    return result('should-not-run-either');
  });

  assert.strictEqual(first, second);
  assert.strictEqual(first, third);
  assert.equal(runs, 0);

  gate.resolve();
  const values = await Promise.all([first, second, third]);
  assert.equal(runs, 1);
  assert.deepEqual(values.map(value => value.sale.operation_id), [
    'operation-1',
    'operation-1',
    'operation-1',
  ]);
});

test('failed sale flight is released so an explicit retry can run', async () => {
  const registry = new CashierSaleCommitSingleFlight();
  let runs = 0;

  await assert.rejects(
    registry.run('merchant\u0000operation-2', async () => {
      runs += 1;
      throw new Error('first failure');
    }),
    /first failure/,
  );

  const retried = await registry.run('merchant\u0000operation-2', async () => {
    runs += 1;
    return result('operation-2');
  });

  assert.equal(runs, 2);
  assert.equal(retried.sale.operation_id, 'operation-2');
});
