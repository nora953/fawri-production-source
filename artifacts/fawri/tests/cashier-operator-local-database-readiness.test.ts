import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CashierOperatorLocalDatabaseReadinessError,
  ensureCashierOperatorLocalDatabaseReady,
} from '../src/lib/cashierOperatorLocalDatabaseReadiness';

test('blocked operator-local IndexedDB upgrade fails closed instead of hanging', async () => {
  const originalDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'indexedDB');

  const request: Record<string, unknown> = {
    onupgradeneeded: null,
    onblocked: null,
    onerror: null,
    onsuccess: null,
  };
  const fakeIndexedDb = {
    open() {
      queueMicrotask(() => {
        const handler = request.onblocked;
        if (typeof handler === 'function') handler();
      });
      return request;
    },
  };

  Object.defineProperty(globalThis, 'indexedDB', {
    configurable: true,
    value: fakeIndexedDb,
  });

  try {
    await assert.rejects(
      ensureCashierOperatorLocalDatabaseReady(),
      (error: unknown) => {
        assert.ok(error instanceof CashierOperatorLocalDatabaseReadinessError);
        assert.equal(error.code, 'CASHIER_OPERATOR_LOCAL_DATABASE_BLOCKED');
        return true;
      },
    );
  } finally {
    if (originalDescriptor) {
      Object.defineProperty(globalThis, 'indexedDB', originalDescriptor);
    } else {
      delete (globalThis as { indexedDB?: unknown }).indexedDB;
    }
  }
});
