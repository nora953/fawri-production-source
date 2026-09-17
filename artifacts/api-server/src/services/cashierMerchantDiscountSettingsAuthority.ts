import type { CashierManualDiscountKind } from './cashierDiscountPolicy';
import { CashierDiscountPolicyAuthorityError } from './cashierDiscountPolicyAuthority';
import {
  operationalQueryRows,
  type OperationalQueryTarget,
} from './operationalPostgresAuthority';

export type MerchantCashierDiscountSetting = {
  discount_kind: CashierManualDiscountKind;
  version: number;
};

type MerchantDiscountSettingRow = {
  discount_kind: CashierManualDiscountKind;
  version: number | string;
};

export const DEFAULT_MERCHANT_CASHIER_DISCOUNT_KIND: CashierManualDiscountKind = 'amount';

function schemaMissing(error: unknown): boolean {
  return String((error as { code?: unknown })?.code || '') === '42P01';
}

function normalizeKind(value: unknown): CashierManualDiscountKind {
  if (value === 'amount' || value === 'percentage') return value;
  throw new CashierDiscountPolicyAuthorityError(
    'CASHIER_DISCOUNT_KIND_INVALID',
    'cashier discount kind must be amount or percentage',
    400,
  );
}

function normalizeExpectedVersion(value: unknown): number {
  const version = Number(value);
  if (!Number.isSafeInteger(version) || version < 0) {
    throw new CashierDiscountPolicyAuthorityError(
      'CASHIER_DISCOUNT_KIND_VERSION_REQUIRED',
      'a non-negative expected_version is required',
      400,
    );
  }
  return version;
}

async function invalidatePendingDiscountOverrideApprovals(
  target: OperationalQueryTarget,
  merchantId: string,
): Promise<void> {
  try {
    await target.query(
      `DELETE FROM merchant_cashier_discount_override_approvals
        WHERE merchant_id = $1 AND consumed_at IS NULL`,
      [merchantId],
    );
  } catch (error) {
    // Some deployments can have the merchant setting schema before the optional
    // override authority schema. There is nothing to invalidate in that state.
    if (!schemaMissing(error)) throw error;
  }
}

export async function loadMerchantCashierDiscountSetting(
  target: OperationalQueryTarget,
  merchantId: string,
  lock = false,
): Promise<MerchantCashierDiscountSetting> {
  let rows: MerchantDiscountSettingRow[];
  try {
    rows = await operationalQueryRows<MerchantDiscountSettingRow>(
      target,
      `SELECT discount_kind, version
         FROM merchant_cashier_discount_settings
        WHERE merchant_id = $1
        LIMIT 1${lock ? ' FOR UPDATE' : ''}`,
      [merchantId],
    );
  } catch (error) {
    if (schemaMissing(error)) {
      throw new CashierDiscountPolicyAuthorityError(
        'CASHIER_DISCOUNT_SETTINGS_SCHEMA_REQUIRED',
        'merchant cashier discount settings schema has not been applied',
        503,
      );
    }
    throw error;
  }
  const row = rows[0];
  if (!row) {
    return {
      discount_kind: DEFAULT_MERCHANT_CASHIER_DISCOUNT_KIND,
      version: 0,
    };
  }
  return {
    discount_kind: normalizeKind(row.discount_kind),
    version: Number(row.version),
  };
}

export async function updateMerchantCashierDiscountSetting(
  target: OperationalQueryTarget,
  input: {
    merchantId: string;
    expectedVersion: unknown;
    discountKind: unknown;
  },
): Promise<MerchantCashierDiscountSetting> {
  const expectedVersion = normalizeExpectedVersion(input.expectedVersion);
  const discountKind = normalizeKind(input.discountKind);
  const current = await loadMerchantCashierDiscountSetting(target, input.merchantId, true);
  if (current.version !== expectedVersion) {
    throw new CashierDiscountPolicyAuthorityError(
      'CASHIER_DISCOUNT_KIND_VERSION_CONFLICT',
      'merchant cashier discount kind changed concurrently',
      409,
    );
  }

  let rows: MerchantDiscountSettingRow[];
  if (current.version === 0) {
    rows = await operationalQueryRows<MerchantDiscountSettingRow>(
      target,
      `INSERT INTO merchant_cashier_discount_settings (
         merchant_id, discount_kind, version, created_at, updated_at
       ) VALUES ($1,$2,1,now(),now())
       ON CONFLICT (merchant_id) DO NOTHING
       RETURNING discount_kind, version`,
      [input.merchantId, discountKind],
    );
  } else {
    rows = await operationalQueryRows<MerchantDiscountSettingRow>(
      target,
      `UPDATE merchant_cashier_discount_settings
          SET discount_kind = $2,
              version = version + 1,
              updated_at = now()
        WHERE merchant_id = $1 AND version = $3
        RETURNING discount_kind, version`,
      [input.merchantId, discountKind, expectedVersion],
    );
  }

  const row = rows[0];
  if (!row) {
    throw new CashierDiscountPolicyAuthorityError(
      'CASHIER_DISCOUNT_KIND_VERSION_CONFLICT',
      'merchant cashier discount kind changed concurrently',
      409,
    );
  }

  if (current.discount_kind !== discountKind) {
    await invalidatePendingDiscountOverrideApprovals(target, input.merchantId);
  }

  return {
    discount_kind: normalizeKind(row.discount_kind),
    version: Number(row.version),
  };
}

export function assertMerchantCashierDiscountKind(
  configured: CashierManualDiscountKind,
  requested: CashierManualDiscountKind | undefined,
  field = 'discount_kind',
): CashierManualDiscountKind {
  if (!requested || requested !== configured) {
    throw new CashierDiscountPolicyAuthorityError(
      'CASHIER_DISCOUNT_KIND_MISMATCH',
      'requested discount kind does not match the merchant discount setting',
      409,
    );
  }
  return configured;
}