import crypto from 'node:crypto';
import { verifyPassword } from './authPasswordService';
import {
  disabledStoredCashierDiscountPolicy,
  loadCashierDiscountPolicies,
} from './cashierDiscountPolicyAuthority';
import type { CashierOperatorContext } from './postgresCashierStaffAuthority';
import { CashierStaffAuthorityError } from './postgresCashierStaffAuthority';
import {
  operationalQueryRows,
  withMerchantOperationalTransaction,
  type OperationalQueryTarget,
} from './operationalPostgresAuthority';

const APPROVAL_TTL_MINUTES = 5;
const PIN_FAILURE_LIMIT = 5;
const PIN_LOCK_MS = 15 * 60 * 1000;

type DbInstant = Date | string;

type ApproverRow = {
  id: string;
  display_name: string;
  role: string;
  status: string;
  pin_hash: string;
  failed_pin_attempts: number | string;
  pin_locked_until: DbInstant | null;
  revoked_at: DbInstant | null;
};

type ApprovalRow = {
  id: string;
  merchant_id: string;
  station_id: string;
  operator_staff_id: string;
  approver_staff_id: string;
  operation_id: string;
  manual_discount_minor: number | string;
  manual_discount_reason: string;
  expires_at: DbInstant;
  consumed_at: DbInstant | null;
  created_at: DbInstant;
};

export type CashierDiscountOverrideApproverView = {
  id: string;
  display_name: string;
};

export type CashierDiscountOverrideApprovalView = {
  approval_id: string;
  approver_staff_id: string;
  expires_at: string;
};

function schemaMissing(error: unknown): boolean {
  return String((error as { code?: unknown })?.code || '') === '42P01';
}

function conflict(error: unknown): boolean {
  return String((error as { code?: unknown })?.code || '') === '23505';
}

function identifier(value: unknown, field: string, maxLength = 200): string {
  const normalized = String(value ?? '').normalize('NFKC').trim();
  if (!normalized || normalized.length > maxLength || /[\u0000-\u001f\u007f]/.test(normalized)) {
    throw new CashierStaffAuthorityError(
      'CASHIER_DISCOUNT_OVERRIDE_INPUT_INVALID',
      `${field} is invalid`,
      400,
      { field },
    );
  }
  return normalized;
}

function positiveMoney(value: unknown, field: string): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new CashierStaffAuthorityError(
      'CASHIER_DISCOUNT_OVERRIDE_INPUT_INVALID',
      `${field} is invalid`,
      400,
      { field },
    );
  }
  return parsed;
}

function normalizedReason(value: unknown): string {
  const reason = String(value ?? '').normalize('NFKC').trim();
  if (!reason || reason.length > 200 || /[\u0000-\u001f\u007f]/.test(reason)) {
    throw new CashierStaffAuthorityError(
      'CASHIER_MANUAL_DISCOUNT_REASON_REQUIRED',
      'manual discount reason is required',
      409,
    );
  }
  return reason;
}

function pin(value: unknown): string {
  const normalized = String(value ?? '').trim();
  if (!/^\d{4,8}$/.test(normalized)) {
    throw new CashierStaffAuthorityError(
      'CASHIER_OPERATOR_INVALID',
      'cashier operator credentials are invalid',
      401,
    );
  }
  return normalized;
}

function toMillis(value: DbInstant): number {
  const millis = value instanceof Date ? value.getTime() : new Date(value).getTime();
  if (!Number.isFinite(millis)) {
    throw new CashierStaffAuthorityError(
      'CASHIER_DISCOUNT_OVERRIDE_STATE_INVALID',
      'cashier discount override timestamp is invalid',
      500,
    );
  }
  return millis;
}

function toIso(value: DbInstant): string {
  return new Date(toMillis(value)).toISOString();
}

async function loadApprover(
  target: OperationalQueryTarget,
  merchantId: string,
  staffId: string,
  forUpdate = false,
): Promise<ApproverRow | null> {
  const rows = await operationalQueryRows<ApproverRow>(
    target,
    `SELECT id, display_name, role, status, pin_hash, failed_pin_attempts,
            pin_locked_until, revoked_at
       FROM merchant_cashier_staff
      WHERE merchant_id = $1 AND id = $2
      LIMIT 1${forUpdate ? ' FOR UPDATE' : ''}`,
    [merchantId, staffId],
  );
  return rows[0] || null;
}

async function assertApproverAuthority(
  target: OperationalQueryTarget,
  merchantId: string,
  approver: ApproverRow,
): Promise<void> {
  if (approver.status !== 'active' || approver.revoked_at || approver.role !== 'manager') {
    throw new CashierStaffAuthorityError(
      'CASHIER_DISCOUNT_OVERRIDE_APPROVER_REQUIRED',
      'an active manager is required to approve this discount',
      403,
    );
  }
  const permissionRows = await operationalQueryRows<{ permission: string }>(
    target,
    `SELECT permission
       FROM merchant_cashier_staff_permissions
      WHERE merchant_id = $1 AND staff_id = $2 AND permission = 'sale.discount_override'
      LIMIT 1`,
    [merchantId, approver.id],
  );
  if (permissionRows.length !== 1) {
    throw new CashierStaffAuthorityError(
      'CASHIER_DISCOUNT_OVERRIDE_PERMISSION_REQUIRED',
      'manager discount override permission is required',
      403,
    );
  }
  const policies = await loadCashierDiscountPolicies(target, merchantId, approver.id);
  const policy = policies.get(approver.id) || disabledStoredCashierDiscountPolicy();
  if (!policy.enabled || !policy.can_approve_override) {
    throw new CashierStaffAuthorityError(
      'CASHIER_DISCOUNT_OVERRIDE_PERMISSION_REQUIRED',
      'manager discount override authority is disabled',
      403,
    );
  }
}

async function verifyApproverPin(
  target: OperationalQueryTarget,
  merchantId: string,
  approver: ApproverRow,
  pinValue: unknown,
): Promise<void> {
  const enteredPin = pin(pinValue);
  const lockedUntil = approver.pin_locked_until ? toMillis(approver.pin_locked_until) : 0;
  if (lockedUntil > Date.now()) {
    throw new CashierStaffAuthorityError(
      'CASHIER_PIN_LOCKED',
      'cashier PIN is temporarily locked',
      429,
      { retry_after_seconds: Math.max(1, Math.ceil((lockedUntil - Date.now()) / 1000)) },
    );
  }
  if (!verifyPassword(enteredPin, approver.pin_hash)) {
    const failed = Number(approver.failed_pin_attempts) + 1;
    const locksNow = failed >= PIN_FAILURE_LIMIT;
    const lockUntil = locksNow ? new Date(Date.now() + PIN_LOCK_MS) : null;
    await target.query(
      `UPDATE merchant_cashier_staff
          SET failed_pin_attempts = $3,
              pin_locked_until = $4,
              updated_at = now()
        WHERE merchant_id = $1 AND id = $2`,
      [merchantId, approver.id, locksNow ? 0 : failed, lockUntil],
    );
    throw new CashierStaffAuthorityError(
      locksNow ? 'CASHIER_PIN_LOCKED' : 'CASHIER_OPERATOR_INVALID',
      locksNow ? 'cashier PIN is temporarily locked' : 'cashier operator credentials are invalid',
      locksNow ? 429 : 401,
      locksNow ? { retry_after_seconds: Math.ceil(PIN_LOCK_MS / 1000) } : undefined,
    );
  }
  await target.query(
    `UPDATE merchant_cashier_staff
        SET failed_pin_attempts = 0, pin_locked_until = NULL, updated_at = now()
      WHERE merchant_id = $1 AND id = $2`,
    [merchantId, approver.id],
  );
}

export async function listCashierDiscountOverrideApproversAuthoritative(
  context: CashierOperatorContext,
): Promise<CashierDiscountOverrideApproverView[]> {
  if (!context.permissions.includes('sale.discount')) return [];
  return withMerchantOperationalTransaction(context.merchant_id, async (client) => {
    try {
      return await operationalQueryRows<CashierDiscountOverrideApproverView>(
        client,
        `SELECT DISTINCT s.id, s.display_name
           FROM merchant_cashier_staff AS s
           JOIN merchant_cashier_staff_permissions AS p
             ON p.merchant_id = s.merchant_id
            AND p.staff_id = s.id
            AND p.permission = 'sale.discount_override'
           JOIN merchant_cashier_staff_discount_policies AS d
             ON d.merchant_id = s.merchant_id
            AND d.staff_id = s.id
          WHERE s.merchant_id = $1
            AND s.id <> $2
            AND s.status = 'active'
            AND s.revoked_at IS NULL
            AND s.role = 'manager'
            AND d.enabled = true
            AND d.can_approve_override = true
          ORDER BY s.display_name, s.id`,
        [context.merchant_id, context.staff_id],
      );
    } catch (error) {
      if (schemaMissing(error)) return [];
      throw error;
    }
  });
}

export async function issueCashierDiscountOverrideApprovalAuthoritative(input: {
  context: CashierOperatorContext;
  approverStaffId: unknown;
  pin: unknown;
  operationId: unknown;
  manualDiscountMinor: unknown;
  reason: unknown;
}): Promise<CashierDiscountOverrideApprovalView> {
  if (!input.context.permissions.includes('sale.discount')) {
    throw new CashierStaffAuthorityError(
      'CASHIER_MANUAL_DISCOUNT_PERMISSION_REQUIRED',
      'cashier operator is not allowed to apply manual discounts',
      403,
    );
  }
  const approverStaffId = identifier(input.approverStaffId, 'approver_staff_id');
  const operationId = identifier(input.operationId, 'operation_id');
  const manualDiscountMinor = positiveMoney(input.manualDiscountMinor, 'manual_discount_minor');
  const reason = normalizedReason(input.reason);
  if (approverStaffId === input.context.staff_id) {
    throw new CashierStaffAuthorityError(
      'CASHIER_DISCOUNT_OVERRIDE_SELF_APPROVAL_FORBIDDEN',
      'cashier operators cannot approve their own discount override',
      403,
    );
  }

  return withMerchantOperationalTransaction(input.context.merchant_id, async (client) => {
    const requesterPolicies = await loadCashierDiscountPolicies(
      client,
      input.context.merchant_id,
      input.context.staff_id,
    );
    const requesterPolicy = requesterPolicies.get(input.context.staff_id)
      || disabledStoredCashierDiscountPolicy();
    if (!requesterPolicy.enabled) {
      throw new CashierStaffAuthorityError(
        'CASHIER_MANUAL_DISCOUNT_PERMISSION_REQUIRED',
        'manual discount policy is disabled for this operator',
        403,
      );
    }

    const approver = await loadApprover(
      client,
      input.context.merchant_id,
      approverStaffId,
      true,
    );
    if (!approver) {
      throw new CashierStaffAuthorityError(
        'CASHIER_DISCOUNT_OVERRIDE_APPROVER_REQUIRED',
        'an active manager is required to approve this discount',
        403,
      );
    }
    await assertApproverAuthority(client, input.context.merchant_id, approver);
    await verifyApproverPin(client, input.context.merchant_id, approver, input.pin);

    const approvalId = `cashier_discount_override_${crypto.randomUUID()}`;
    let rows: ApprovalRow[];
    try {
      rows = await operationalQueryRows<ApprovalRow>(
        client,
        `INSERT INTO merchant_cashier_discount_override_approvals (
           id, merchant_id, station_id, operator_staff_id, approver_staff_id,
           operation_id, manual_discount_minor, manual_discount_reason,
           expires_at, consumed_at, created_at
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,now() + interval '${APPROVAL_TTL_MINUTES} minutes',NULL,now())
         RETURNING id, merchant_id, station_id, operator_staff_id, approver_staff_id,
                   operation_id, manual_discount_minor, manual_discount_reason,
                   expires_at, consumed_at, created_at`,
        [
          approvalId,
          input.context.merchant_id,
          input.context.station_id,
          input.context.staff_id,
          approverStaffId,
          operationId,
          manualDiscountMinor,
          reason,
        ],
      );
    } catch (error) {
      if (schemaMissing(error)) {
        throw new CashierStaffAuthorityError(
          'CASHIER_DISCOUNT_OVERRIDE_SCHEMA_REQUIRED',
          'cashier discount override schema has not been applied',
          503,
        );
      }
      if (conflict(error)) {
        throw new CashierStaffAuthorityError(
          'CASHIER_DISCOUNT_OVERRIDE_OPERATION_CONFLICT',
          'this cashier sale operation already has a discount approval request',
          409,
        );
      }
      throw error;
    }
    const row = rows[0];
    if (!row) {
      throw new CashierStaffAuthorityError(
        'CASHIER_DISCOUNT_OVERRIDE_WRITE_FAILED',
        'manager discount override approval could not be stored',
        500,
      );
    }
    return {
      approval_id: row.id,
      approver_staff_id: row.approver_staff_id,
      expires_at: toIso(row.expires_at),
    };
  });
}

export async function consumeCashierDiscountOverrideApproval(
  target: OperationalQueryTarget,
  input: {
    merchantId: string;
    stationId: string;
    operatorStaffId: string;
    operationId: string;
    approvalId: string;
    manualDiscountMinor: number;
    reason: string;
  },
): Promise<void> {
  let rows: ApprovalRow[];
  try {
    rows = await operationalQueryRows<ApprovalRow>(
      target,
      `SELECT id, merchant_id, station_id, operator_staff_id, approver_staff_id,
              operation_id, manual_discount_minor, manual_discount_reason,
              expires_at, consumed_at, created_at
         FROM merchant_cashier_discount_override_approvals
        WHERE merchant_id = $1 AND id = $2 AND operation_id = $3
        LIMIT 1
        FOR UPDATE`,
      [input.merchantId, input.approvalId, input.operationId],
    );
  } catch (error) {
    if (schemaMissing(error)) {
      throw new CashierStaffAuthorityError(
        'CASHIER_DISCOUNT_OVERRIDE_SCHEMA_REQUIRED',
        'cashier discount override schema has not been applied',
        503,
      );
    }
    throw error;
  }
  const approval = rows[0];
  if (
    !approval ||
    approval.station_id !== input.stationId ||
    approval.operator_staff_id !== input.operatorStaffId ||
    Number(approval.manual_discount_minor) !== input.manualDiscountMinor ||
    approval.manual_discount_reason !== input.reason
  ) {
    throw new CashierStaffAuthorityError(
      'CASHIER_DISCOUNT_OVERRIDE_INVALID',
      'manager discount override approval does not match this sale',
      403,
    );
  }

  // Once an approval has been consumed it remains valid only for this exact
  // operation id. This preserves safe idempotent retry after a lost response.
  if (approval.consumed_at) return;

  if (toMillis(approval.expires_at) <= Date.now()) {
    throw new CashierStaffAuthorityError(
      'CASHIER_DISCOUNT_OVERRIDE_EXPIRED',
      'manager discount override approval has expired',
      403,
    );
  }

  const approver = await loadApprover(target, input.merchantId, approval.approver_staff_id, true);
  if (!approver) {
    throw new CashierStaffAuthorityError(
      'CASHIER_DISCOUNT_OVERRIDE_APPROVER_REQUIRED',
      'manager discount override approver is unavailable',
      403,
    );
  }
  await assertApproverAuthority(target, input.merchantId, approver);

  await target.query(
    `UPDATE merchant_cashier_discount_override_approvals
        SET consumed_at = now()
      WHERE merchant_id = $1 AND id = $2 AND operation_id = $3 AND consumed_at IS NULL`,
    [input.merchantId, approval.id, input.operationId],
  );
}
