import {
  operationalPostgresAuthorityRequired,
  operationalQueryRows,
  withMerchantOperationalTransaction,
} from "./operationalPostgresAuthority";
import { CashierStaffAuthorityError } from "./postgresCashierStaffAuthority";

const MAX_ACTIVITY_OPERATIONS = 500;

export type CashierCentralActivityRow = {
  operation_count: number;
  sale_count: number;
  return_count: number;
  void_count: number;
};

export type CashierCentralStaffActivityRow = CashierCentralActivityRow & {
  staff_id: string;
  staff_name: string;
};

export type CashierCentralStationActivityRow = CashierCentralActivityRow & {
  station_id: string;
  station_name: string;
  location_id: string;
  location_name: string;
  branch_key?: string;
  branch_label?: string;
};

export type CashierCentralLocationActivityRow = CashierCentralActivityRow & {
  location_id: string;
  location_name: string;
};

export type CashierCentralOperationActivityRow = {
  operation_id: string;
  sale_id: string;
  operation_kind: "sale" | "return" | "void";
  staff_id: string;
  staff_name: string;
  station_id: string;
  station_name: string;
  branch_key?: string;
  branch_label?: string;
  shift_id: string;
  occurred_at: string;
  amount_minor?: number;
  currency_code?: string;
  currency_fraction_digits?: number;
};

export type CashierCentralActivityResult = {
  by_staff: CashierCentralStaffActivityRow[];
  by_station: CashierCentralStationActivityRow[];
  by_location: CashierCentralLocationActivityRow[];
  operations: CashierCentralOperationActivityRow[];
  operation_detail_limit: number;
};

type StaffRow = {
  staff_id: string;
  staff_name: string | null;
  operation_count: number | string;
  sale_count: number | string;
  return_count: number | string;
  void_count: number | string;
};

type StationRow = {
  station_id: string;
  station_name: string | null;
  location_id: string;
  location_name: string | null;
  branch_key: string | null;
  branch_label: string | null;
  operation_count: number | string;
  sale_count: number | string;
  return_count: number | string;
  void_count: number | string;
};

type LocationRow = {
  location_id: string;
  location_name: string | null;
  operation_count: number | string;
  sale_count: number | string;
  return_count: number | string;
  void_count: number | string;
};

type OperationRow = {
  operation_id: string;
  sale_id: string;
  operation_kind: string;
  staff_id: string;
  staff_name: string | null;
  station_id: string;
  station_name: string | null;
  branch_key: string | null;
  branch_label: string | null;
  shift_id: string;
  occurred_at: Date | string;
  amount_minor: string | number | null;
  currency_code: string | null;
  currency_fraction_digits: string | number | null;
};

function identifier(value: unknown, field: string, maxLength = 200): string {
  const normalized = String(value ?? "").normalize("NFKC").trim();
  if (!normalized || normalized.length > maxLength) {
    throw new CashierStaffAuthorityError("CASHIER_REPORT_RANGE_INVALID", `${field} is invalid`, 400);
  }
  return normalized;
}

function instant(value: unknown, field: string): string | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  const parsed = new Date(String(value));
  if (!Number.isFinite(parsed.getTime())) {
    throw new CashierStaffAuthorityError("CASHIER_REPORT_RANGE_INVALID", `${field} must be a valid timestamp`, 400);
  }
  return parsed.toISOString();
}

function requiredInstant(value: unknown, field: string): string {
  const parsed = new Date(String(value ?? ""));
  if (!Number.isFinite(parsed.getTime())) {
    throw new CashierStaffAuthorityError("CASHIER_REPORT_EVIDENCE_INVALID", `${field} is invalid`, 409);
  }
  return parsed.toISOString();
}

function count(value: unknown, field: string): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new CashierStaffAuthorityError("CASHIER_REPORT_EVIDENCE_INVALID", `cashier activity contains invalid ${field}`, 409);
  }
  return parsed;
}

function optionalMoneyInteger(value: unknown, field: string): number | undefined {
  if (value === null || value === undefined || value === "") return undefined;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new CashierStaffAuthorityError("CASHIER_REPORT_EVIDENCE_INVALID", `${field} is invalid`, 409);
  }
  return parsed;
}

function counts(row: { operation_count: number | string; sale_count: number | string; return_count: number | string; void_count: number | string }): CashierCentralActivityRow {
  const result = {
    operation_count: count(row.operation_count, "operation_count"),
    sale_count: count(row.sale_count, "sale_count"),
    return_count: count(row.return_count, "return_count"),
    void_count: count(row.void_count, "void_count"),
  };
  if (result.operation_count !== result.sale_count + result.return_count + result.void_count) {
    throw new CashierStaffAuthorityError("CASHIER_REPORT_EVIDENCE_INVALID", "cashier activity counts are inconsistent", 409);
  }
  return result;
}

function operationKind(value: unknown): "sale" | "return" | "void" {
  const kind = String(value || "");
  if (kind !== "sale" && kind !== "return" && kind !== "void") {
    throw new CashierStaffAuthorityError("CASHIER_REPORT_EVIDENCE_INVALID", "cashier activity operation kind is invalid", 409);
  }
  return kind;
}

export async function buildCashierCentralActivityAuthoritative(input: {
  merchantId: unknown;
  from?: unknown;
  to?: unknown;
}): Promise<CashierCentralActivityResult> {
  if (!operationalPostgresAuthorityRequired()) {
    throw new CashierStaffAuthorityError("CASHIER_REPORT_POSTGRES_REQUIRED", "central cashier activity requires PostgreSQL authority", 503);
  }
  const merchantId = identifier(input.merchantId, "merchant_id");
  const from = instant(input.from, "from");
  const to = instant(input.to, "to");
  if (from && to && from >= to) {
    throw new CashierStaffAuthorityError("CASHIER_REPORT_RANGE_INVALID", "cashier activity from must be earlier than to", 400);
  }

  return withMerchantOperationalTransaction(merchantId, async (client) => {
    const [staffRows, stationRows, locationRows, operationRows] = await Promise.all([
      operationalQueryRows<StaffRow>(
        client,
        `SELECT attribution.staff_id,
                staff.display_name AS staff_name,
                COUNT(*)::int AS operation_count,
                (COUNT(*) FILTER (WHERE attribution.operation_kind = 'sale'))::int AS sale_count,
                (COUNT(*) FILTER (WHERE attribution.operation_kind = 'return'))::int AS return_count,
                (COUNT(*) FILTER (WHERE attribution.operation_kind = 'void'))::int AS void_count
           FROM cashier_operation_attribution attribution
           LEFT JOIN merchant_cashier_staff staff
             ON staff.merchant_id = attribution.merchant_id AND staff.id = attribution.staff_id
          WHERE attribution.merchant_id = $1
            AND ($2::timestamptz IS NULL OR attribution.occurred_at >= $2::timestamptz)
            AND ($3::timestamptz IS NULL OR attribution.occurred_at < $3::timestamptz)
          GROUP BY attribution.staff_id, staff.display_name
          ORDER BY staff.display_name NULLS LAST, attribution.staff_id`,
        [merchantId, from || null, to || null],
      ),
      operationalQueryRows<StationRow>(
        client,
        `SELECT attribution.station_id,
                station.name AS station_name,
                station.branch_key,
                station.branch_label,
                COUNT(*)::int AS operation_count,
                (COUNT(*) FILTER (WHERE attribution.operation_kind = 'sale'))::int AS sale_count,
                (COUNT(*) FILTER (WHERE attribution.operation_kind = 'return'))::int AS return_count,
                (COUNT(*) FILTER (WHERE attribution.operation_kind = 'void'))::int AS void_count
           FROM cashier_operation_attribution attribution
           LEFT JOIN merchant_cashier_stations station
             ON station.merchant_id = attribution.merchant_id AND station.id = attribution.station_id
          WHERE attribution.merchant_id = $1
            AND ($2::timestamptz IS NULL OR attribution.occurred_at >= $2::timestamptz)
            AND ($3::timestamptz IS NULL OR attribution.occurred_at < $3::timestamptz)
          GROUP BY attribution.station_id, station.name, station.branch_key, station.branch_label
          ORDER BY station.name NULLS LAST, attribution.station_id`,
        [merchantId, from || null, to || null],
      ),
      operationalQueryRows<LocationRow>(
        client,
        `SELECT attribution.location_id,
                location.name AS location_name,
                COUNT(*)::int AS operation_count,
                (COUNT(*) FILTER (WHERE attribution.operation_kind = 'sale'))::int AS sale_count,
                (COUNT(*) FILTER (WHERE attribution.operation_kind = 'return'))::int AS return_count,
                (COUNT(*) FILTER (WHERE attribution.operation_kind = 'void'))::int AS void_count
           FROM cashier_operation_attribution attribution
           LEFT JOIN merchant_locations location
             ON location.merchant_id = attribution.merchant_id
            AND location.id = attribution.location_id
          WHERE attribution.merchant_id = $1
            AND attribution.location_id IS NOT NULL
            AND ($2::timestamptz IS NULL OR attribution.occurred_at >= $2::timestamptz)
            AND ($3::timestamptz IS NULL OR attribution.occurred_at < $3::timestamptz)
          GROUP BY attribution.location_id, location.name
          ORDER BY location.name NULLS LAST, attribution.location_id`,
        [merchantId, from || null, to || null],
      ),
      operationalQueryRows<OperationRow>(
        client,
        `SELECT attribution.operation_id,
                attribution.sale_id,
                attribution.operation_kind,
                attribution.staff_id,
                staff.display_name AS staff_name,
                attribution.station_id,
                station.name AS station_name,
                attribution.location_id,
                location.name AS location_name,
                station.branch_key,
                station.branch_label,
                attribution.shift_id,
                attribution.occurred_at,
                CASE
                  WHEN attribution.operation_kind = 'sale'
                    THEN orders.metadata->'cashier_sync'->'sale_snapshot'->>'total_minor'
                  ELSE compensation.entry->'snapshot'->>'refund_total_minor'
                END AS amount_minor,
                CASE
                  WHEN attribution.operation_kind = 'sale'
                    THEN orders.metadata->'cashier_sync'->'sale_snapshot'->>'currency_code'
                  ELSE compensation.entry->'snapshot'->>'currency_code'
                END AS currency_code,
                CASE
                  WHEN attribution.operation_kind = 'sale'
                    THEN orders.metadata->'cashier_sync'->'sale_snapshot'->>'currency_fraction_digits'
                  ELSE compensation.entry->'snapshot'->>'currency_fraction_digits'
                END AS currency_fraction_digits
           FROM cashier_operation_attribution attribution
           LEFT JOIN merchant_cashier_staff staff
             ON staff.merchant_id = attribution.merchant_id AND staff.id = attribution.staff_id
           LEFT JOIN merchant_cashier_stations station
             ON station.merchant_id = attribution.merchant_id AND station.id = attribution.station_id
           LEFT JOIN merchant_locations location
             ON location.merchant_id = attribution.merchant_id AND location.id = attribution.location_id
           LEFT JOIN orders
             ON orders.merchant_id = attribution.merchant_id
            AND orders.id = attribution.sale_id
            AND orders.source_channel = 'cashier'
           LEFT JOIN LATERAL (
             SELECT entry
               FROM jsonb_array_elements(
                 CASE
                   WHEN jsonb_typeof(orders.metadata->'cashier_sync'->'compensations') = 'array'
                     THEN orders.metadata->'cashier_sync'->'compensations'
                   ELSE '[]'::jsonb
                 END
               ) AS entry
              WHERE entry->>'operation_id' = attribution.operation_id
              LIMIT 1
           ) compensation ON attribution.operation_kind IN ('return', 'void')
          WHERE attribution.merchant_id = $1
            AND ($2::timestamptz IS NULL OR attribution.occurred_at >= $2::timestamptz)
            AND ($3::timestamptz IS NULL OR attribution.occurred_at < $3::timestamptz)
          ORDER BY attribution.occurred_at DESC, attribution.operation_id
          LIMIT ${MAX_ACTIVITY_OPERATIONS}`,
        [merchantId, from || null, to || null],
      ),
    ]);

    return {
      by_staff: staffRows.map(row => ({ staff_id: identifier(row.staff_id, "staff_id"), staff_name: row.staff_name || "", ...counts(row) })),
      by_station: stationRows.map(row => ({
        station_id: identifier(row.station_id, "station_id"), station_name: row.station_name || "",
        ...(row.branch_key ? { branch_key: row.branch_key } : {}), ...(row.branch_label ? { branch_label: row.branch_label } : {}), ...counts(row),
      })),
      by_location: locationRows.map(row => ({
        location_id: identifier(row.location_id, "location_id"),
        location_name: row.location_name || "",
        ...counts(row),
      })),
      operations: operationRows.map(row => {
        const amount = optionalMoneyInteger(row.amount_minor, "activity.amount_minor");
        const digits = optionalMoneyInteger(row.currency_fraction_digits, "activity.currency_fraction_digits");
        const code = row.currency_code ? String(row.currency_code).trim().toUpperCase() : "";
        if (code && !/^[A-Z]{3}$/.test(code)) {
          throw new CashierStaffAuthorityError("CASHIER_REPORT_EVIDENCE_INVALID", "activity currency code is invalid", 409);
        }
        if (digits !== undefined && digits > 6) {
          throw new CashierStaffAuthorityError("CASHIER_REPORT_EVIDENCE_INVALID", "activity currency fraction digits are invalid", 409);
        }
        return {
          operation_id: identifier(row.operation_id, "operation_id"),
          sale_id: identifier(row.sale_id, "sale_id"),
          operation_kind: operationKind(row.operation_kind),
          staff_id: identifier(row.staff_id, "staff_id"),
          staff_name: row.staff_name || "",
          station_id: identifier(row.station_id, "station_id"),
          station_name: row.station_name || "",
          location_id: identifier(row.location_id, "location_id"),
          location_name: row.location_name || "",
          ...(row.branch_key ? { branch_key: row.branch_key } : {}),
          ...(row.branch_label ? { branch_label: row.branch_label } : {}),
          shift_id: identifier(row.shift_id, "shift_id"),
          occurred_at: requiredInstant(row.occurred_at, "occurred_at"),
          ...(amount !== undefined ? { amount_minor: amount } : {}),
          ...(code ? { currency_code: code } : {}),
          ...(digits !== undefined ? { currency_fraction_digits: digits } : {}),
        } satisfies CashierCentralOperationActivityRow;
      }),
      operation_detail_limit: MAX_ACTIVITY_OPERATIONS,
    };
  });
}
