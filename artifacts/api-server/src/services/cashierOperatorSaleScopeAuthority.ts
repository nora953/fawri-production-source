import type { CashierOperatorContext } from "../middleware/cashierStaffSession";
import {
  operationalQueryRows,
  withMerchantOperationalTransaction,
} from "./operationalPostgresAuthority";
import { CashierStaffAuthorityError } from "./postgresCashierStaffAuthority";

type SaleAttributionRow = {
  sale_id: string;
  station_id: string;
  staff_id: string;
  shift_id: string;
  device_id: string;
};

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function identifier(value: unknown, field: string, maxLength = 200): string {
  const normalized = String(value ?? "").normalize("NFKC").trim();
  if (!normalized || normalized.length > maxLength) {
    throw new CashierStaffAuthorityError(
      "CASHIER_OPERATOR_SYNC_INVALID",
      `${field} is invalid`,
      400,
    );
  }
  return normalized;
}

function compensationSaleId(
  body: unknown,
  kind: "return" | "void",
): string {
  const raw = record(body);
  if (!Array.isArray(raw.envelopes)) {
    throw new CashierStaffAuthorityError(
      "CASHIER_OPERATOR_SYNC_INVALID",
      "cashier sync envelopes are required",
      400,
    );
  }
  const candidates = raw.envelopes
    .map(record)
    .filter((envelope) =>
      kind === "return"
        ? envelope.entity_type === "return" && envelope.operation === "append"
        : envelope.entity_type === "sale" && envelope.operation === "void",
    );
  if (candidates.length !== 1) {
    throw new CashierStaffAuthorityError(
      "CASHIER_OPERATOR_SYNC_INVALID",
      "cashier compensation operation evidence is invalid",
      400,
    );
  }
  return identifier(record(candidates[0].payload).sale_id, "sale_id");
}

export async function assertCashierOperatorCompensationSaleScope(input: {
  context: CashierOperatorContext;
  body: unknown;
  kind: "return" | "void";
}): Promise<string> {
  const saleId = compensationSaleId(input.body, input.kind);
  const context = input.context;

  await withMerchantOperationalTransaction(context.merchant_id, async (client) => {
    const rows = await operationalQueryRows<SaleAttributionRow>(
      client,
      `SELECT sale_id, station_id, staff_id, shift_id, device_id
         FROM cashier_operation_attribution
        WHERE merchant_id = $1
          AND sale_id = $2
          AND operation_kind = 'sale'
        ORDER BY created_at
        LIMIT 2`,
      [context.merchant_id, saleId],
    );
    if (rows.length !== 1) {
      throw new CashierStaffAuthorityError(
        "CASHIER_OPERATOR_SALE_SCOPE_FORBIDDEN",
        "cashier sale is unavailable to the active operator",
        403,
      );
    }

    const sale = rows[0];
    if (
      sale.station_id !== context.station_id ||
      sale.device_id !== context.device_id
    ) {
      throw new CashierStaffAuthorityError(
        "CASHIER_OPERATOR_SALE_SCOPE_FORBIDDEN",
        "cashier sale belongs to another station or device",
        403,
      );
    }

    if (context.permissions.includes("sale.view_all")) return;
    if (
      context.permissions.includes("sale.view_own") &&
      sale.staff_id === context.staff_id &&
      sale.shift_id === context.shift_id
    ) {
      return;
    }

    throw new CashierStaffAuthorityError(
      "CASHIER_OPERATOR_SALE_SCOPE_FORBIDDEN",
      "cashier sale is outside the active employee and shift scope",
      403,
    );
  });

  return saleId;
}
