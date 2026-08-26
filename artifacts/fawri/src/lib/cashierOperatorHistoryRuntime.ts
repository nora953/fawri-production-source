import {
  createCashierHistoryRuntime,
  type CashierHistoryRuntime,
  type CashierHistorySnapshot,
} from './cashierHistoryRuntime';
import type {
  CashierReturnSaleInput,
  CashierSaleSnapshot,
  CashierVoidSaleInput,
} from './cashierLocalContracts';
import {
  getCashierOperationBindings,
  type CashierOperationBinding,
} from './cashierOperatorLocalSecurity';
import {
  bindCashierOperationToCurrentOperator,
  cashierOperatorCan,
  getCashierOperatorSession,
  type CashierOperatorSession,
} from './cashierOperatorSessionRuntime';
import { syncCashierOperatorOutboxToCloud } from './cashierOperatorCloudSync';

export class CashierOperatorHistoryError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'CashierOperatorHistoryError';
    this.code = code;
  }
}

function canSeeSale(
  session: CashierOperatorSession,
  sale: CashierSaleSnapshot,
  bindings: Map<string, CashierOperationBinding>,
): boolean {
  const binding = bindings.get(sale.operation_id);
  if (!binding) return false;
  if (
    binding.merchant_id !== session.context.merchant_id ||
    binding.station_id !== session.context.station_id ||
    binding.device_id !== session.context.device_id
  ) {
    return false;
  }
  if (cashierOperatorCan(session, 'sale.view_all')) return true;
  return (
    cashierOperatorCan(session, 'sale.view_own') &&
    binding.staff_id === session.context.staff_id &&
    binding.shift_id === session.context.shift_id
  );
}

async function filterSnapshot(
  session: CashierOperatorSession,
  snapshot: CashierHistorySnapshot,
): Promise<CashierHistorySnapshot> {
  const bindings = await getCashierOperationBindings(
    snapshot.sales.map((sale) => sale.operation_id),
  );
  const sales = snapshot.sales.filter((sale) =>
    canSeeSale(session, sale, bindings),
  );
  const visibleOperationIds = new Set<string>();
  for (const sale of sales) {
    visibleOperationIds.add(sale.operation_id);
    for (const item of sale.returns || []) visibleOperationIds.add(item.operation_id);
    if (sale.void) visibleOperationIds.add(sale.void.operation_id);
  }
  return {
    sales,
    pending_operation_ids: snapshot.pending_operation_ids.filter((id) =>
      visibleOperationIds.has(id),
    ),
  };
}

async function visibleSaleOrThrow(
  base: CashierHistoryRuntime,
  session: CashierOperatorSession,
  saleId: string,
): Promise<CashierSaleSnapshot> {
  const snapshot = await filterSnapshot(session, await base.snapshot(200));
  const sale = snapshot.sales.find((item) => item.sale_id === saleId);
  if (!sale) {
    throw new CashierOperatorHistoryError(
      'CASHIER_OPERATOR_SALE_SCOPE_FORBIDDEN',
      'This sale is outside the active operator scope',
    );
  }
  return sale;
}

export async function createCashierOperatorHistoryRuntime(): Promise<CashierHistoryRuntime> {
  const session = await getCashierOperatorSession();
  if (!session) {
    throw new CashierOperatorHistoryError(
      'CASHIER_OPERATOR_LOGIN_REQUIRED',
      'Cashier operator login is required',
    );
  }
  if (
    !cashierOperatorCan(session, 'sale.view_own') &&
    !cashierOperatorCan(session, 'sale.view_all')
  ) {
    throw new CashierOperatorHistoryError(
      'CASHIER_OPERATOR_PERMISSION_REQUIRED',
      'Sale history permission is required',
    );
  }
  const base = await createCashierHistoryRuntime();
  return {
    ...base,
    async snapshot(limit) {
      return filterSnapshot(session, await base.snapshot(limit));
    },
    async returnSale(input: CashierReturnSaleInput) {
      if (!cashierOperatorCan(session, 'sale.return')) {
        throw new CashierOperatorHistoryError(
          'CASHIER_OPERATOR_PERMISSION_REQUIRED',
          'Return permission is required',
        );
      }
      await visibleSaleOrThrow(base, session, input.sale_id);
      await bindCashierOperationToCurrentOperator(input.operation_id, 'return');
      return base.returnSale(input);
    },
    async voidSale(input: CashierVoidSaleInput) {
      if (!cashierOperatorCan(session, 'sale.void')) {
        throw new CashierOperatorHistoryError(
          'CASHIER_OPERATOR_PERMISSION_REQUIRED',
          'Void permission is required',
        );
      }
      await visibleSaleOrThrow(base, session, input.sale_id);
      await bindCashierOperationToCurrentOperator(input.operation_id, 'void');
      return base.voidSale(input);
    },
    syncPending() {
      return syncCashierOperatorOutboxToCloud();
    },
  };
}
