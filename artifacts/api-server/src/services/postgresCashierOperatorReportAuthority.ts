import type { CashierOperatorContext } from "./postgresCashierStaffAuthority";
import { CashierStaffAuthorityError } from "./postgresCashierStaffAuthority";
import {
  operationalPostgresAuthorityRequired,
  operationalQueryRows,
  withMerchantOperationalTransaction,
} from "./operationalPostgresAuthority";
import {
  buildCashierCentralReportFromEvidenceRows,
  type CashierCentralCurrencyReport,
  type CashierCentralReport,
  type CashierCentralReportEvidenceRow,
} from "./postgresCashierCentralReportAuthority";

const MAX_OPERATOR_REPORT_SALES = 50_000;

type ReportRange = {
  from?: string;
  to?: string;
};

export type CashierOperatorServerReportResult = {
  from?: string;
  to?: string;
  generated_at: string;
  sales_scanned: number;
  source: "server_cashier";
  scope: "own_shift" | "station";
  can_view_profit: boolean;
  report: CashierCentralReport;
};

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

function range(input: { from?: unknown; to?: unknown }): ReportRange {
  const from = instant(input.from, "from");
  const to = instant(input.to, "to");
  if (from && to && from >= to) {
    throw new CashierStaffAuthorityError(
      "CASHIER_REPORT_RANGE_INVALID",
      "cashier report from must be earlier than to",
      400,
    );
  }
  return { ...(from ? { from } : {}), ...(to ? { to } : {}) };
}

function redactProfit(report: CashierCentralReport): CashierCentralReport {
  return {
    ...report,
    by_currency: report.by_currency.map(
      (currency): CashierCentralCurrencyReport => ({
        ...currency,
        profit_status: "unavailable",
        gross_profit_minor: undefined,
        cost_known_net_units: 0,
        cost_unknown_net_units: 0,
      }),
    ),
  };
}

/**
 * Online operator reporting is server-derived so reports.profit can expose an
 * aggregate profit result without ever sending raw product cost to a cashier
 * device. sale.view_all widens the report to the current paired station/device;
 * otherwise the report is restricted to the active employee shift.
 */
export async function buildCashierOperatorReportAuthoritative(input: {
  context: CashierOperatorContext;
  from?: unknown;
  to?: unknown;
}): Promise<CashierOperatorServerReportResult> {
  if (!operationalPostgresAuthorityRequired()) {
    throw new CashierStaffAuthorityError(
      "CASHIER_REPORT_POSTGRES_REQUIRED",
      "cashier operator reporting requires PostgreSQL authority",
      503,
    );
  }
  const { context } = input;
  const canViewAll = context.permissions.includes("sale.view_all");
  const canViewOwn = context.permissions.includes("sale.view_own");
  if (!canViewAll && !canViewOwn) {
    throw new CashierStaffAuthorityError(
      "CASHIER_OPERATOR_PERMISSION_REQUIRED",
      "cashier report requires sale visibility permission",
      403,
      { required_permission: "sale.view_own" },
    );
  }
  const reportRange = range(input);

  return withMerchantOperationalTransaction(context.merchant_id, async (client) => {
    const rows = await operationalQueryRows<CashierCentralReportEvidenceRow>(
      client,
      `SELECT o.id,
              o.metadata,
              sale_attribution.staff_id,
              NULL::text AS staff_name,
              sale_attribution.station_id,
              NULL::text AS station_name,
              NULL::text AS branch_key,
              NULL::text AS branch_label
         FROM orders o
         JOIN cashier_operation_attribution sale_attribution
           ON sale_attribution.merchant_id = o.merchant_id
          AND sale_attribution.sale_id = o.id
          AND sale_attribution.operation_kind = 'sale'
        WHERE o.merchant_id = $1
          AND o.source_channel = 'cashier'
          AND sale_attribution.station_id = $2
          AND sale_attribution.device_id = $3
          AND (
            $4::boolean
            OR (
              sale_attribution.staff_id = $5
              AND sale_attribution.shift_id = $6
            )
          )
          AND (
            (
              ($7::text IS NULL OR o.created_at >= ($7::text)::timestamptz)
              AND ($8::text IS NULL OR o.created_at < ($8::text)::timestamptz)
            )
            OR EXISTS (
              SELECT 1
                FROM jsonb_array_elements(
                  CASE
                    WHEN jsonb_typeof(o.metadata->'cashier_sync'->'compensations') = 'array'
                      THEN o.metadata->'cashier_sync'->'compensations'
                    ELSE '[]'::jsonb
                  END
                ) AS compensation
               WHERE ($7::text IS NULL OR compensation->>'occurred_at' >= $7::text)
                 AND ($8::text IS NULL OR compensation->>'occurred_at' < $8::text)
            )
          )
        ORDER BY o.created_at DESC, o.id
        LIMIT $9`,
      [
        context.merchant_id,
        context.station_id,
        context.device_id,
        canViewAll,
        context.staff_id,
        context.shift_id,
        reportRange.from || null,
        reportRange.to || null,
        MAX_OPERATOR_REPORT_SALES + 1,
      ],
    );
    if (rows.length > MAX_OPERATOR_REPORT_SALES) {
      throw new CashierStaffAuthorityError(
        "CASHIER_REPORT_RANGE_TOO_LARGE",
        "cashier report range contains too many affected sales; choose a smaller period",
        413,
        { max_sales: MAX_OPERATOR_REPORT_SALES },
      );
    }

    const result = buildCashierCentralReportFromEvidenceRows({
      rows,
      ...reportRange,
      generatedAt: new Date().toISOString(),
    });
    const canViewProfit = context.permissions.includes("reports.profit");
    return {
      ...reportRange,
      generated_at: result.generated_at,
      sales_scanned: result.sales_scanned,
      source: "server_cashier",
      scope: canViewAll ? "station" : "own_shift",
      can_view_profit: canViewProfit,
      report: canViewProfit ? result.report : redactProfit(result.report),
    };
  });
}
