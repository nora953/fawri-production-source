import {
  IndexedDbCashierAuthority,
} from './cashierIndexedDbAuthority';
import {
  createCashierPosRuntime,
  type CashierPosRuntime,
} from './cashierPosBaseRuntime';
import type { CashierCommitSaleInput } from './cashierLocalContracts';
import {
  bindCashierOperationToCurrentOperator,
  cashierOperatorCan,
  getCashierOperatorSession,
  type CashierOperatorSession,
} from './cashierOperatorSessionRuntime';

export class CashierOperatorPosError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'CashierOperatorPosError';
    this.code = code;
  }
}

async function assertOfflineInventoryPermission(
  runtime: CashierPosRuntime,
  input: CashierCommitSaleInput,
  session: CashierOperatorSession,
): Promise<void> {
  if (typeof navigator === 'undefined' || navigator.onLine !== false) return;
  if (session.context.offline_inventory_authority) return;

  const authority = new IndexedDbCashierAuthority({
    localMerchantId: runtime.localMerchantId,
    cloudMerchantId: session.context.merchant_id,
    deviceId: runtime.deviceId,
    databaseName: `fawri-cashier-${runtime.localMerchantId}-v1`,
  });
  try {
    for (const line of input.lines) {
      const item = await authority.getCatalogItem(line.product_id, line.variant_id);
      if (item?.track_inventory) {
        throw new CashierOperatorPosError(
          'CASHIER_OFFLINE_INVENTORY_AUTHORITY_REQUIRED',
          'This station cannot sell tracked inventory while offline',
        );
      }
    }
  } finally {
    await authority.close().catch(() => undefined);
  }
}

export async function createCashierOperatorPosRuntime(options?: {
  demoMode?: boolean;
}): Promise<CashierPosRuntime> {
  if (options?.demoMode) return createCashierPosRuntime(options);
  const session = await getCashierOperatorSession();
  if (!session) {
    throw new CashierOperatorPosError(
      'CASHIER_OPERATOR_LOGIN_REQUIRED',
      'Cashier operator login is required',
    );
  }
  if (!cashierOperatorCan(session, 'sale.create')) {
    throw new CashierOperatorPosError(
      'CASHIER_OPERATOR_PERMISSION_REQUIRED',
      'This operator is not allowed to create sales',
    );
  }
  const base = await createCashierPosRuntime(options);
  return {
    ...base,
    async commitSale(input) {
      const currentSession = await getCashierOperatorSession();
      if (!currentSession) {
        throw new CashierOperatorPosError(
          'CASHIER_OPERATOR_LOGIN_REQUIRED',
          'Cashier operator login is required',
        );
      }
      if (!cashierOperatorCan(currentSession, 'sale.create')) {
        throw new CashierOperatorPosError(
          'CASHIER_OPERATOR_PERMISSION_REQUIRED',
          'This operator is not allowed to create sales',
        );
      }
      await assertOfflineInventoryPermission(base, input, currentSession);
      await bindCashierOperationToCurrentOperator(input.operation_id, 'sale');
      return base.commitSale(input);
    },
  };
}
