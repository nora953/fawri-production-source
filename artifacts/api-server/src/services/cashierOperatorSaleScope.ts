import type { CashierOperatorContext } from './postgresCashierStaffAuthority';
import { CashierSyncError } from './postgresCashierSyncAuthority';
import {
  operationalQueryRows,
  withMerchantOperationalTransaction,
} from './operationalPostgresAuthority';

type SaleAttributionRow = {
  station_id: string;
  staff_id: string;
  shift_id: string;
};

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function requiredIdentifier(value: unknown, field: string): string {
  const normalized = String(value ?? '').normalize('NFKC').trim();
  if (!normalized || normalized.length > 200) {
    throw new CashierSyncError(
      'CASHIER_OPERATOR_SYNC_INVALID',
      `${field} is invalid`,
      400,
      { field },
    );
  }
  return normalized;
}

function compensationSaleId(
  body: unknown,
  kind: 'return' | 'void',
): string {
  const raw = record(body);
  if (!Array.isArray(raw.envelopes)) {
    throw new CashierSyncError(
      'CASHIER_OPERATOR_SYNC_INVALID',
      'cashier sync envelopes are required',
      400,
    );
  }
  const candidates = raw.envelopes
    .map(record)
    .filter((envelope) =>
      kind === 'return'
        ? envelope.entity_type === 'return' && envelope.operation === 'append'
        : envelope.entity_type === 'sale' && envelope.operation === 'void',
    );
  if (candidates.length !== 1) {
    throw new CashierSyncError(
      'CASHIER_OPERATOR_SYNC_KIND_MISMATCH',
      `operator ${kind} endpoint requires one ${kind} operation`,
      403,
    );
  }
  return requiredIdentifier(
    record(candidates[0].payload).sale_id,
    `${kind}.sale_id`,
  );
}

/**
 * A return/void grant controls the action, while sale.view_* controls which
 * original sales the operator may act on. Ordinary cashiers are restricted to
 * their own current shift; sale.view_all is the explicit cross-operator grant.
 */
export async function assertCashierOperatorCompensationScope(input: {
  context: CashierOperatorContext;
  body: unknown;
  kind: 'return' | 'void';
}): Promise<void> {
  const { context } = input;
  if (context.permissions.includes('sale.view_all')) return;
  if (!context.permissions.includes('sale.view_own')) {
    throw new CashierSyncError(
      'CASHIER_OPERATOR_PERMISSION_REQUIRED',
      'cashier operator sale visibility permission is required',
      403,
      { required_permission: 'sale.view_own' },
    );
  }
  const saleId = compensationSaleId(input.body, input.kind);
  const rows = await withMerchantOperationalTransaction(
    context.merchant_id,
    (client) =>
      operationalQueryRows<SaleAttributionRow>(
        client,
        `SELECT station_id, staff_id, shift_id
           FROM cashier_operation_attribution
          WHERE merchant_id = $1
            AND sale_id = $2
            AND operation_kind = 'sale'
          ORDER BY created_at
          LIMIT 1`,
        [context.merchant_id, saleId],
      ),
  );
  const attribution = rows[0];
  if (
    !attribution ||
    attribution.station_id !== context.station_id ||
    attribution.staff_id !== context.staff_id ||
    attribution.shift_id !== context.shift_id
  ) {
    throw new CashierSyncError(
      'CASHIER_OPERATOR_SALE_SCOPE_FORBIDDEN',
      'cashier operator cannot compensate a sale outside the active shift scope',
      403,
    );
  }
}
