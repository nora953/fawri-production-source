import { verifyPassword } from "./authPasswordService";
import { evaluateMerchantOperationalAccess } from "./merchantOperationalAccess";
import {
  operationalPostgresAuthorityRequired,
  operationalQueryRows,
  withMerchantOperationalTransaction,
  type OperationalQueryTarget,
} from "./operationalPostgresAuthority";
import {
  CashierStaffAuthorityError,
  getCashierPinValidationError,
  type CashierOperatorContext,
} from "./postgresCashierStaffAuthority";

const PIN_FAILURE_LIMIT = 5;
const PIN_LOCK_MS = 15 * 60 * 1000;

type DbInstant = Date | string;

type MerchantOperationalRow = {
  id: string;
  phone_verified: boolean;
  merchant_status: string;
  account_status: string;
};

type StaffPinRow = {
  pin_hash: string;
  status: string;
  failed_pin_attempts: number;
  pin_locked_until: DbInstant | null;
};

async function assertMerchantOperationalAccess(
  target: OperationalQueryTarget,
  merchantId: string,
): Promise<void> {
  const rows = await operationalQueryRows<MerchantOperationalRow>(
    target,
    `SELECT a.id,
            a.phone_verified,
            m.status::text AS merchant_status,
            m.account_status::text AS account_status
       FROM accounts AS a
       JOIN merchants AS m ON m.id = a.id AND m.account_id = a.id
      WHERE a.id = $1 AND a.kind = 'merchant'
      LIMIT 1
      FOR UPDATE OF a, m`,
    [merchantId],
  );
  const row = rows[0];
  const decision = evaluateMerchantOperationalAccess(
    row
      ? {
          id: row.id,
          is_admin: false,
          otp_verified: row.phone_verified,
          status: row.merchant_status,
          account_status: row.account_status,
        }
      : undefined,
  );
  if (!decision.allowed) {
    throw new CashierStaffAuthorityError(
      decision.code,
      decision.error,
      decision.statusCode,
    );
  }
}

function cashierPin(value: unknown): string {
  const validationError = getCashierPinValidationError(value);
  if (validationError) {
    throw new CashierStaffAuthorityError(
      validationError.code,
      validationError.message,
      400,
    );
  }
  return String(value).trim();
}

function toMillis(value: DbInstant): number {
  return value instanceof Date ? value.getTime() : new Date(value).getTime();
}

export async function logoutCashierOperatorWithPinAuthoritative(input: {
  context: CashierOperatorContext;
  pin: unknown;
}): Promise<void> {
  if (!operationalPostgresAuthorityRequired()) {
    throw new CashierStaffAuthorityError(
      "CASHIER_STAFF_POSTGRES_REQUIRED",
      "cashier staff authority requires PostgreSQL operational authority",
      503,
    );
  }

  const context = input.context;
  const pin = cashierPin(input.pin);

  const decision = await withMerchantOperationalTransaction(
    context.merchant_id,
    async (client) => {
      await assertMerchantOperationalAccess(client, context.merchant_id);

      const sessions = await operationalQueryRows<{ id: string; shift_id: string }>(
        client,
        `SELECT os.id, os.shift_id
           FROM cashier_operator_sessions AS os
           JOIN cashier_shifts AS sh
             ON sh.id = os.shift_id
            AND sh.merchant_id = os.merchant_id
            AND sh.station_id = os.station_id
            AND sh.staff_id = os.staff_id
          WHERE os.id = $1
            AND os.merchant_id = $2
            AND os.station_id = $3
            AND os.staff_id = $4
            AND os.shift_id = $5
            AND os.status = 'active'
            AND sh.status = 'open'
          LIMIT 1
          FOR UPDATE OF os, sh`,
        [
          context.operator_session_id,
          context.merchant_id,
          context.station_id,
          context.staff_id,
          context.shift_id,
        ],
      );
      if (!sessions[0]) {
        return {
          ok: false as const,
          error: new CashierStaffAuthorityError(
            "CASHIER_OPERATOR_SESSION_INVALID",
            "cashier operator session is invalid or expired",
            401,
          ),
        };
      }

      const staffRows = await operationalQueryRows<StaffPinRow>(
        client,
        `SELECT pin_hash, status::text AS status, failed_pin_attempts, pin_locked_until
           FROM merchant_cashier_staff
          WHERE merchant_id = $1 AND id = $2
          LIMIT 1
          FOR UPDATE`,
        [context.merchant_id, context.staff_id],
      );
      const staff = staffRows[0];
      if (!staff || staff.status !== "active") {
        return {
          ok: false as const,
          error: new CashierStaffAuthorityError(
            "CASHIER_OPERATOR_INVALID",
            "cashier operator credentials are invalid",
            401,
          ),
        };
      }

      const lockedUntil = staff.pin_locked_until
        ? toMillis(staff.pin_locked_until)
        : 0;
      if (lockedUntil > Date.now()) {
        return {
          ok: false as const,
          error: new CashierStaffAuthorityError(
            "CASHIER_PIN_LOCKED",
            "cashier PIN is temporarily locked",
            429,
            {
              retry_after_seconds: Math.max(
                1,
                Math.ceil((lockedUntil - Date.now()) / 1000),
              ),
            },
          ),
        };
      }

      if (!verifyPassword(pin, staff.pin_hash)) {
        const failed = Number(staff.failed_pin_attempts) + 1;
        const locksNow = failed >= PIN_FAILURE_LIMIT;
        const lockUntil = locksNow
          ? new Date(Date.now() + PIN_LOCK_MS)
          : null;
        await client.query(
          `UPDATE merchant_cashier_staff
              SET failed_pin_attempts = $3,
                  pin_locked_until = $4,
                  updated_at = now()
            WHERE merchant_id = $1 AND id = $2`,
          [
            context.merchant_id,
            context.staff_id,
            locksNow ? 0 : failed,
            lockUntil,
          ],
        );
        return {
          ok: false as const,
          error: new CashierStaffAuthorityError(
            locksNow ? "CASHIER_PIN_LOCKED" : "CASHIER_OPERATOR_INVALID",
            locksNow
              ? "cashier PIN is temporarily locked"
              : "cashier operator credentials are invalid",
            locksNow ? 429 : 401,
            locksNow
              ? { retry_after_seconds: Math.ceil(PIN_LOCK_MS / 1000) }
              : undefined,
          ),
        };
      }

      await client.query(
        `UPDATE merchant_cashier_staff
            SET failed_pin_attempts = 0,
                pin_locked_until = NULL,
                updated_at = now()
          WHERE merchant_id = $1 AND id = $2`,
        [context.merchant_id, context.staff_id],
      );
      await client.query(
        `UPDATE cashier_operator_sessions
            SET status = 'revoked', revoked_at = now()
          WHERE id = $1 AND merchant_id = $2 AND station_id = $3
            AND staff_id = $4 AND shift_id = $5 AND status = 'active'`,
        [
          context.operator_session_id,
          context.merchant_id,
          context.station_id,
          context.staff_id,
          context.shift_id,
        ],
      );
      await client.query(
        `UPDATE cashier_shifts
            SET status = 'closed', ended_at = now(), close_reason = 'operator_logout'
          WHERE id = $1 AND merchant_id = $2 AND station_id = $3
            AND staff_id = $4 AND status = 'open'`,
        [
          context.shift_id,
          context.merchant_id,
          context.station_id,
          context.staff_id,
        ],
      );

      return { ok: true as const };
    },
  );

  if (!decision.ok) throw decision.error;
}
