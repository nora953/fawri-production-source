import {
  operationalQueryRows,
  type OperationalQueryTarget,
} from './operationalPostgresAuthority';
import {
  DISABLED_CASHIER_MANUAL_DISCOUNT_POLICY,
  normalizeCashierManualDiscountPolicy,
  type CashierManualDiscountPolicy,
} from './cashierDiscountPolicy';

export type CashierStoredDiscountPolicy = CashierManualDiscountPolicy & {
  version: number;
};

type DiscountPolicyRow = Record<string, unknown> & {
  merchant_id: string;
  staff_id: string;
  enabled: boolean;
  max_percentage_bps: number;
  max_amount_minor: number | string | null;
  can_approve_override: boolean;
  version: number | string;
};

export class CashierDiscountPolicyAuthorityError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, message: string, status = 409) {
    super(message);
    this.name = 'CashierDiscountPolicyAuthorityError';
    this.code = code;
    this.status = status;
  }
}

function storedPolicy(row: DiscountPolicyRow): CashierStoredDiscountPolicy {
  const policy = normalizeCashierManualDiscountPolicy({
    enabled: row.enabled,
    max_percentage_bps: Number(row.max_percentage_bps),
    max_amount_minor:
      row.max_amount_minor === null ? null : Number(row.max_amount_minor),
    can_approve_override: row.can_approve_override,
  });
  const version = Number(row.version);
  if (!Number.isSafeInteger(version) || version < 1) {
    throw new CashierDiscountPolicyAuthorityError(
      'CASHIER_DISCOUNT_POLICY_STATE_INVALID',
      'cashier discount policy version is invalid',
      500,
    );
  }
  return { ...policy, version };
}

function schemaMissing(error: unknown): boolean {
  return String((error as { code?: unknown })?.code || '') === '42P01';
}

export function disabledStoredCashierDiscountPolicy(): CashierStoredDiscountPolicy {
  return {
    ...DISABLED_CASHIER_MANUAL_DISCOUNT_POLICY,
    version: 0,
  };
}

export async function loadCashierDiscountPolicies(
  target: OperationalQueryTarget,
  merchantId: string,
  staffId?: string,
): Promise<Map<string, CashierStoredDiscountPolicy>> {
  let rows: DiscountPolicyRow[];
  try {
    rows = await operationalQueryRows<DiscountPolicyRow>(
      target,
      `SELECT merchant_id, staff_id, enabled, max_percentage_bps,
              max_amount_minor, can_approve_override, version
         FROM merchant_cashier_staff_discount_policies
        WHERE merchant_id = $1
          AND ($2::text IS NULL OR staff_id = $2)
        ORDER BY staff_id`,
      [merchantId, staffId || null],
    );
  } catch (error) {
    // Deployment is intentionally fail-closed before the additive schema is applied.
    if (schemaMissing(error)) return new Map();
    throw error;
  }
  const result = new Map<string, CashierStoredDiscountPolicy>();
  for (const row of rows) result.set(row.staff_id, storedPolicy(row));
  return result;
}

export async function upsertCashierDiscountPolicy(
  target: OperationalQueryTarget,
  input: {
    merchantId: string;
    staffId: string;
    policy: unknown;
  },
): Promise<CashierStoredDiscountPolicy> {
  const policy = normalizeCashierManualDiscountPolicy(input.policy);
  let rows: DiscountPolicyRow[];
  try {
    rows = await operationalQueryRows<DiscountPolicyRow>(
      target,
      `INSERT INTO merchant_cashier_staff_discount_policies (
         merchant_id, staff_id, enabled, max_percentage_bps,
         max_amount_minor, can_approve_override, version, created_at, updated_at
       ) VALUES ($1,$2,$3,$4,$5,$6,1,now(),now())
       ON CONFLICT (merchant_id, staff_id)
       DO UPDATE SET
         enabled = EXCLUDED.enabled,
         max_percentage_bps = EXCLUDED.max_percentage_bps,
         max_amount_minor = EXCLUDED.max_amount_minor,
         can_approve_override = EXCLUDED.can_approve_override,
         version = merchant_cashier_staff_discount_policies.version + 1,
         updated_at = now()
       RETURNING merchant_id, staff_id, enabled, max_percentage_bps,
                 max_amount_minor, can_approve_override, version`,
      [
        input.merchantId,
        input.staffId,
        policy.enabled,
        policy.max_percentage_bps,
        policy.max_amount_minor,
        policy.can_approve_override,
      ],
    );
  } catch (error) {
    if (schemaMissing(error)) {
      throw new CashierDiscountPolicyAuthorityError(
        'CASHIER_DISCOUNT_POLICY_SCHEMA_REQUIRED',
        'cashier discount policy schema has not been applied',
        503,
      );
    }
    throw error;
  }
  const row = rows[0];
  if (!row) {
    throw new CashierDiscountPolicyAuthorityError(
      'CASHIER_DISCOUNT_POLICY_WRITE_FAILED',
      'cashier discount policy could not be stored',
      500,
    );
  }
  return storedPolicy(row);
}

export async function deleteCashierDiscountPolicy(
  target: OperationalQueryTarget,
  merchantId: string,
  staffId: string,
): Promise<void> {
  try {
    await target.query(
      `DELETE FROM merchant_cashier_staff_discount_policies
        WHERE merchant_id = $1 AND staff_id = $2`,
      [merchantId, staffId],
    );
  } catch (error) {
    if (schemaMissing(error)) return;
    throw error;
  }
}
