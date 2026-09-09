import assert from 'node:assert/strict';
import test from 'node:test';
import { consumeCashierDiscountOverrideApproval } from '../src/services/cashierDiscountOverrideAuthority';
import { CashierStaffAuthorityError } from '../src/services/postgresCashierStaffAuthority';
import type { OperationalQueryTarget } from '../src/services/operationalPostgresAuthority';

type ApprovalFixture = {
  consumedAt?: string | null;
};

function authorityTarget(fixture: ApprovalFixture = {}): {
  target: OperationalQueryTarget;
  updates: string[];
} {
  const updates: string[] = [];
  const target: OperationalQueryTarget = {
    async query<T extends Record<string, unknown> = Record<string, unknown>>(
      sql: string,
      _values: unknown[] = [],
    ) {
      const compact = sql.replace(/\s+/g, ' ').trim();
      if (compact.includes('FROM merchant_cashier_discount_override_approvals')) {
        return {
          rows: [{
            id: 'approval-1',
            merchant_id: 'merchant-1',
            station_id: 'station-1',
            operator_staff_id: 'cashier-1',
            approver_staff_id: 'manager-1',
            operation_id: 'operation-1',
            manual_discount_minor: 250,
            manual_discount_reason: 'customer recovery',
            created_at: '2026-09-09T10:00:00.000Z',
            expires_at: '2026-09-09T10:05:00.000Z',
            consumed_at: fixture.consumedAt ?? null,
          }] as unknown as T[],
        };
      }
      if (compact.includes('FROM merchant_cashier_staff ') && compact.includes('WHERE merchant_id')) {
        return {
          rows: [{
            id: 'manager-1',
            display_name: 'Manager One',
            role: 'manager',
            status: 'active',
            pin_hash: 'unused-during-consume',
            failed_pin_attempts: 0,
            pin_locked_until: null,
            revoked_at: null,
          }] as unknown as T[],
        };
      }
      if (compact.includes('FROM merchant_cashier_staff_permissions')) {
        return {
          rows: [{ permission: 'sale.discount_override' }] as unknown as T[],
        };
      }
      if (compact.includes('FROM merchant_cashier_staff_discount_policies')) {
        return {
          rows: [{
            merchant_id: 'merchant-1',
            staff_id: 'manager-1',
            enabled: true,
            max_percentage_bps: 10000,
            max_amount_minor: null,
            can_approve_override: true,
            version: 3,
          }] as unknown as T[],
        };
      }
      if (compact.startsWith('UPDATE merchant_cashier_discount_override_approvals')) {
        updates.push(compact);
        return { rows: [] as T[] };
      }
      throw new Error(`Unexpected SQL in override runtime test: ${compact}`);
    },
  };
  return { target, updates };
}

const baseInput = {
  merchantId: 'merchant-1',
  stationId: 'station-1',
  operatorStaffId: 'cashier-1',
  operationId: 'operation-1',
  approvalId: 'approval-1',
  manualDiscountMinor: 250,
  reason: 'customer recovery',
};

test('approved local sale remains syncable after approval wall-clock expiry', async () => {
  const { target, updates } = authorityTarget();
  await consumeCashierDiscountOverrideApproval(target, {
    ...baseInput,
    // The sale happened during the five-minute manager approval window. The
    // test executes much later, proving sync wall-clock time is not authority.
    saleOccurredAt: '2026-09-09T10:03:00.000Z',
  });
  assert.equal(updates.length, 1);
  assert.match(updates[0], /SET consumed_at = now\(\)/);
});

test('sale created after the manager approval window fails closed', async () => {
  const { target, updates } = authorityTarget();
  await assert.rejects(
    consumeCashierDiscountOverrideApproval(target, {
      ...baseInput,
      saleOccurredAt: '2026-09-09T10:05:00.001Z',
    }),
    (error: unknown) => {
      assert.ok(error instanceof CashierStaffAuthorityError);
      assert.equal(error.code, 'CASHIER_DISCOUNT_OVERRIDE_EXPIRED');
      assert.equal(error.status, 403);
      return true;
    },
  );
  assert.equal(updates.length, 0);
});

test('consumed exact-operation retry still validates the original sale window', async () => {
  const { target, updates } = authorityTarget({
    consumedAt: '2026-09-09T10:03:10.000Z',
  });
  await consumeCashierDiscountOverrideApproval(target, {
    ...baseInput,
    saleOccurredAt: '2026-09-09T10:03:00.000Z',
  });
  assert.equal(updates.length, 0);
});
