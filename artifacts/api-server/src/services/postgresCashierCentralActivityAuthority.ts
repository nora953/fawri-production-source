import {
  operationalPostgresAuthorityRequired,
  operationalQueryRows,
  withMerchantOperationalTransaction,
} from "./operationalPostgresAuthority";
import { CashierStaffAuthorityError } from "./postgresCashierStaffAuthority";

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
  branch_key?: string;
  branch_label?: string;
};

export type CashierCentralActivityResult = {
  by_staff: CashierCentralStaffActivityRow[];
  by_station: CashierCentralStationActivityRow[];
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
  branch_key: string | null;
  branch_label: string | null;
  operation_count: number | string;
  sale_count: number | string;
  return_count: number | string;
  void_count: number | string;
};

function identifier(value: unknown, field: string, maxLength = 200): string {
  const normalized = String(value ?? "").normalize("NFKC").trim();
  if (!normalized || normalized.length > maxLength) {
    throw new CashierStaffAuthorityError(
      "CASHIER_REPORT_RANGE_INVALID",
      `${field} is invalid`,
      400,
    );
  }
  return normalized;
}

function instant(value: unknown, field: string): string | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  const parsed = new Date(String(value));
  if (!Number.isFinite(parsed.getTime())) {
    throw new CashierStaffAuthorityError(
      "CASHIER_REPORT_RANGE_INVALID",
      `${field} must be a valid timestamp`,
      400,
    );
  }
  return parsed.toISOString();
}

function count(value: unknown, field: string): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new CashierStaffAuthorityError(
      "CASHIER_REPORT_EVIDENCE_INVALID",
      `cashier activity contains invalid ${field}`,
      409,
    );
  }
  return parsed;
}

function counts(row: {
  operation_count: number | string;
  sale_count: number | string;
  return_count: number | string;
  void_count: number | string;
}): CashierCentralActivityRow {
  const result = {
    operation_count: count(row.operation_count, "operation_count"),
    sale_count: count(row.sale_count, "sale_count"),
    return_count: count(row.return_count, "return_count"),
    void_count: count(row.void_count, "void_count"),
  };
  if (
    result.operation_count !==
    result.sale_count + result.return_count + result.void_count
  ) {
    throw new CashierStaffAuthorityError(
      "CASHIER_REPORT_EVIDENCE_INVALID",
      "cashier activity counts are inconsistent",
      409,
    );
  }
  return result;
}

export async function buildCashierCentralActivityAuthoritative(input: {
  merchantId: unknown;
  from?: unknown;
  to?: unknown;
}): Promise<CashierCentralActivityResult> {
  if (!operationalPostgresAuthorityRequired()) {
    throw new CashierStaffAuthorityError(
      "CASHIER_REPORT_POSTGRES_REQUIRED",
      "central cashier activity requires PostgreSQL authority",
      503,
    );
  }
  const merchantId = identifier(input.merchantId, "merchant_id");
  const from = instant(input.from, "from");
  const to = instant(input.to, "to");
  if (from && to && from >= to) {
    throw new CashierStaffAuthorityError(
      "CASHIER_REPORT_RANGE_INVALID",
      "cashier activity from must be earlier than to",
      400,
    );
  }

  return withMerchantOperationalTransaction(merchantId, async (client) => {
    const [staffRows, stationRows] = await Promise.all([
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
             ON staff.merchant_id = attribution.merchant_id
            AND staff.id = attribution.staff_id
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
             ON station.merchant_id = attribution.merchant_id
            AND station.id = attribution.station_id
          WHERE attribution.merchant_id = $1
            AND ($2::timestamptz IS NULL OR attribution.occurred_at >= $2::timestamptz)
            AND ($3::timestamptz IS NULL OR attribution.occurred_at < $3::timestamptz)
          GROUP BY attribution.station_id, station.name, station.branch_key, station.branch_label
          ORDER BY station.name NULLS LAST, attribution.station_id`,
        [merchantId, from || null, to || null],
      ),
    ]);

    return {
      by_staff: staffRows.map((row) => ({
        staff_id: identifier(row.staff_id, "staff_id"),
        staff_name: row.staff_name || "Former cashier staff",
        ...counts(row),
      })),
      by_station: stationRows.map((row) => ({
        station_id: identifier(row.station_id, "station_id"),
        station_name: row.station_name || "Former cashier station",
        ...(row.branch_key ? { branch_key: row.branch_key } : {}),
        ...(row.branch_label ? { branch_label: row.branch_label } : {}),
        ...counts(row),
      })),
    };
  });
}
