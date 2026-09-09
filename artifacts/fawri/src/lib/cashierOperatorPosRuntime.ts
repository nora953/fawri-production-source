import {
  IndexedDbCashierAuthority,
} from './cashierIndexedDbAuthority';
import {
  cashierDiscountLimitMinor,
  loadCurrentCashierDiscountPolicy,
} from './cashierDiscountPolicyClient';
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

async function assertManualDiscountPermission(
  runtime: CashierPosRuntime,
  input: CashierCommitSaleInput,
): Promise<void> {
  const discount = Number(input.manual_discount_minor || 0);
  if (!Number.isSafeInteger(discount) || discount < 0) {
    throw new CashierOperatorPosError(
      'CASHIER_MANUAL_DISCOUNT_INVALID',
      'Manual discount is invalid',
    );
  }
  if (discount === 0) return;
  const reason = String(input.manual_discount_reason || '').normalize('NFKC').trim();
  if (!reason || reason.length > 200) {
    throw new CashierOperatorPosError(
      'CASHIER_MANUAL_DISCOUNT_REASON_REQUIRED',
      'A manual discount reason is required',
    );
  }
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    throw new CashierOperatorPosError(
      'CASHIER_MANUAL_DISCOUNT_ONLINE_REQUIRED',
      'Manual discounts require an online authority check',
    );
  }
  const [policy, pricing] = await Promise.all([
    loadCurrentCashierDiscountPolicy(),
    runtime.quote(input.lines),
  ]);
  if (!policy.enabled) {
    throw new CashierOperatorPosError(
      'CASHIER_MANUAL_DISCOUNT_PERMISSION_REQUIRED',
      'This operator is not allowed to apply manual discounts',
    );
  }
  const limit = cashierDiscountLimitMinor({
    postPromotionTotalMinor: pricing.total_minor,
    policy,
  });
  if (discount > limit) {
    throw new CashierOperatorPosError(
      'CASHIER_MANUAL_DISCOUNT_OVERRIDE_REQUIRED',
      'Manual discount exceeds this operator limit and requires manager approval',
    );
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
      await assertManualDiscountPermission(base, input);
      await bindCashierOperationToCurrentOperator(input.operation_id, 'sale');
      return base.commitSale(input);
    },
  };
}
