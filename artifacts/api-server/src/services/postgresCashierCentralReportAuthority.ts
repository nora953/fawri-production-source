import {
  operationalPostgresAuthorityRequired,
  operationalQueryRows,
  withMerchantOperationalTransaction,
} from "./operationalPostgresAuthority";
import { CashierStaffAuthorityError } from "./postgresCashierStaffAuthority";

const MAX_REPORT_SALES = 50_000;
const DEFAULT_TOP_PRODUCTS = 10;

type CashierOrderRow = {
  id: string;
  metadata: Record<string, unknown> | null;
  staff_id: string | null;
  staff_name: string | null;
  station_id: string | null;
  station_name: string | null;
  branch_key: string | null;
  branch_label: string | null;
};

type SaleLine = {
  line_id: string;
  product_id: string;
  variant_id?: string;
  product_name: string;
  variant_name?: string;
  quantity: number;
  line_total_minor: number;
  unit_cost_minor?: number;
};

type ReturnLine = {
  original_line_id: string;
  quantity: number;
  refund_minor: number;
};

type Compensation = {
  kind: "return" | "void";
  snapshot: Record<string, unknown>;
};

type ParsedSale = {
  sale_id: string;
  currency_code: string;
  currency_fraction_digits: number;
  total_minor: number;
  lines: SaleLine[];
  compensations: Compensation[];
};

export type CashierCentralProductRow = {
  product_id: string;
  variant_id?: string;
  product_name: string;
  variant_name?: string;
  net_units: number;
  net_revenue_minor: number;
};

export type CashierCentralCurrencyReport = {
  currency_code: string;
  currency_fraction_digits: number;
  sale_count: number;
  active_sale_count: number;
  voided_sale_count: number;
  return_count: number;
  gross_revenue_minor: number;
  refunds_minor: number;
  net_revenue_minor: number;
  sold_units: number;
  returned_units: number;
  net_units: number;
  average_ticket_minor: number;
  profit_status: "available" | "partial" | "unavailable";
  gross_profit_minor?: number;
  cost_known_net_units: number;
  cost_unknown_net_units: number;
  top_products: CashierCentralProductRow[];
};

export type CashierCentralReport = {
  sale_count: number;
  by_currency: CashierCentralCurrencyReport[];
};

export type CashierCentralReportResult = {
  from?: string;
  to?: string;
  generated_at: string;
  sales_scanned: number;
  report: CashierCentralReport;
  by_staff: Array<{
    staff_id: string | null;
    staff_name: string;
    report: CashierCentralReport;
  }>;
  by_station: Array<{
    station_id: string | null;
    station_name: string;
    branch_key?: string;
    branch_label?: string;
    report: CashierCentralReport;
  }>;
};

type ProductAccumulator = CashierCentralProductRow;

type CurrencyAccumulator = Omit<
  CashierCentralCurrencyReport,
  "average_ticket_minor" | "profit_status" | "gross_profit_minor" | "top_products"
> & {
  profit_minor: number;
  products: Map<string, ProductAccumulator>;
};

type ReportAccumulator = {
  sale_count: number;
  currencies: Map<string, CurrencyAccumulator>;
};

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function safeInteger(value: unknown, field: string, allowZero = true): number {
  const parsed = Number(value);
  if (
    !Number.isSafeInteger(parsed) ||
    parsed < 0 ||
    (!allowZero && parsed === 0)
  ) {
    throw new CashierStaffAuthorityError(
      "CASHIER_REPORT_EVIDENCE_INVALID",
      `cashier report evidence contains invalid ${field}`,
      409,
    );
  }
  return parsed;
}

function safeAdd(current: number, delta: number, field: string): number {
  const next = current + delta;
  if (!Number.isSafeInteger(next)) {
    throw new CashierStaffAuthorityError(
      "CASHIER_REPORT_OVERFLOW",
      `cashier report ${field} overflowed safe integer range`,
      409,
    );
  }
  return next;
}

function text(value: unknown, field: string, maxLength = 300): string {
  const normalized = String(value ?? "").normalize("NFKC").trim();
  if (!normalized || normalized.length > maxLength) {
    throw new CashierStaffAuthorityError(
      "CASHIER_REPORT_EVIDENCE_INVALID",
      `cashier report evidence contains invalid ${field}`,
      409,
    );
  }
  return normalized;
}

function optionalText(value: unknown, field: string, maxLength = 300): string | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  return text(value, field, maxLength);
}

function currencyCode(value: unknown): string {
  const code = String(value ?? "").trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(code)) {
    throw new CashierStaffAuthorityError(
      "CASHIER_REPORT_EVIDENCE_INVALID",
      "cashier report evidence contains invalid currency",
      409,
    );
  }
  return code;
}

function parseInstant(value: unknown, field: string): string {
  const parsed = new Date(String(value ?? ""));
  if (!Number.isFinite(parsed.getTime())) {
    throw new CashierStaffAuthorityError(
      "CASHIER_REPORT_RANGE_INVALID",
      `${field} must be a valid timestamp`,
      400,
    );
  }
  return parsed.toISOString();
}

function parseRange(input: { from?: unknown; to?: unknown }): {
  from?: string;
  to?: string;
} {
  const from = input.from === undefined ? undefined : parseInstant(input.from, "from");
  const to = input.to === undefined ? undefined : parseInstant(input.to, "to");
  if (from && to && from >= to) {
    throw new CashierStaffAuthorityError(
      "CASHIER_REPORT_RANGE_INVALID",
      "cashier report from must be earlier than to",
      400,
    );
  }
  return { ...(from ? { from } : {}), ...(to ? { to } : {}) };
}

function parseSaleLine(value: unknown): SaleLine {
  const raw = record(value);
  return {
    line_id: text(raw.line_id, "line_id"),
    product_id: text(raw.product_id, "product_id"),
    ...(raw.variant_id ? { variant_id: text(raw.variant_id, "variant_id") } : {}),
    product_name: text(raw.product_name_snapshot, "product_name_snapshot"),
    ...(raw.variant_name_snapshot
      ? { variant_name: text(raw.variant_name_snapshot, "variant_name_snapshot") }
      : {}),
    quantity: safeInteger(raw.quantity, "quantity", false),
    line_total_minor: safeInteger(raw.line_total_minor, "line_total_minor"),
    ...(raw.unit_cost_minor !== undefined
      ? { unit_cost_minor: safeInteger(raw.unit_cost_minor, "unit_cost_minor") }
      : {}),
  };
}

function parseCompensation(value: unknown): Compensation {
  const raw = record(value);
  const kind = String(raw.kind || "");
  if (kind !== "return" && kind !== "void") {
    throw new CashierStaffAuthorityError(
      "CASHIER_REPORT_EVIDENCE_INVALID",
      "cashier report compensation evidence is invalid",
      409,
    );
  }
  return { kind, snapshot: record(raw.snapshot) };
}

function parseSale(row: CashierOrderRow): ParsedSale {
  const cashier = record(record(row.metadata).cashier_sync);
  const snapshot = record(cashier.sale_snapshot);
  if (String(snapshot.source || "") !== "cashier") {
    throw new CashierStaffAuthorityError(
      "CASHIER_REPORT_EVIDENCE_INVALID",
      "cashier report sale source is invalid",
      409,
    );
  }
  if (!Array.isArray(snapshot.lines) || snapshot.lines.length === 0) {
    throw new CashierStaffAuthorityError(
      "CASHIER_REPORT_EVIDENCE_INVALID",
      "cashier report sale lines are missing",
      409,
    );
  }
  const fractionDigits = safeInteger(
    snapshot.currency_fraction_digits,
    "currency_fraction_digits",
  );
  if (fractionDigits > 6) {
    throw new CashierStaffAuthorityError(
      "CASHIER_REPORT_EVIDENCE_INVALID",
      "cashier report currency precision is invalid",
      409,
    );
  }
  const saleId = text(snapshot.sale_id, "sale_id");
  if (saleId !== row.id) {
    throw new CashierStaffAuthorityError(
      "CASHIER_REPORT_EVIDENCE_INVALID",
      "cashier report sale identity is inconsistent",
      409,
    );
  }
  return {
    sale_id: saleId,
    currency_code: currencyCode(snapshot.currency_code),
    currency_fraction_digits: fractionDigits,
    total_minor: safeInteger(snapshot.total_minor, "total_minor"),
    lines: snapshot.lines.map(parseSaleLine),
    compensations: Array.isArray(cashier.compensations)
      ? cashier.compensations.map(parseCompensation)
      : [],
  };
}

function returnedByLine(sale: ParsedSale): Map<string, { quantity: number; refund: number }> {
  const result = new Map<string, { quantity: number; refund: number }>();
  for (const compensation of sale.compensations) {
    if (compensation.kind !== "return") continue;
    const lines = Array.isArray(compensation.snapshot.lines)
      ? compensation.snapshot.lines
      : [];
    for (const value of lines) {
      const raw = record(value);
      const lineId = text(raw.original_line_id, "return.original_line_id");
      const quantity = safeInteger(raw.quantity, "return.quantity", false);
      const refund = safeInteger(raw.refund_minor, "return.refund_minor");
      const current = result.get(lineId) || { quantity: 0, refund: 0 };
      result.set(lineId, {
        quantity: safeAdd(current.quantity, quantity, "returned units"),
        refund: safeAdd(current.refund, refund, "refunds"),
      });
    }
  }
  return result;
}

function compensationTotals(sale: ParsedSale): {
  voided: boolean;
  returnCount: number;
  refunds: number;
} {
  let voided = false;
  let returnCount = 0;
  let refunds = 0;
  for (const compensation of sale.compensations) {
    if (compensation.kind === "return") {
      returnCount += 1;
      refunds = safeAdd(
        refunds,
        safeInteger(compensation.snapshot.refund_total_minor, "return.refund_total_minor"),
        "refunds",
      );
    } else {
      voided = true;
      refunds = safeAdd(
        refunds,
        safeInteger(compensation.snapshot.refund_total_minor, "void.refund_total_minor"),
        "refunds",
      );
    }
  }
  if (voided && returnCount > 0) {
    throw new CashierStaffAuthorityError(
      "CASHIER_REPORT_EVIDENCE_INVALID",
      "cashier sale cannot contain both return and void evidence",
      409,
    );
  }
  return { voided, returnCount, refunds };
}

function currencyKey(sale: ParsedSale): string {
  return `${sale.currency_code}:${sale.currency_fraction_digits}`;
}

function createCurrency(sale: ParsedSale): CurrencyAccumulator {
  return {
    currency_code: sale.currency_code,
    currency_fraction_digits: sale.currency_fraction_digits,
    sale_count: 0,
    active_sale_count: 0,
    voided_sale_count: 0,
    return_count: 0,
    gross_revenue_minor: 0,
    refunds_minor: 0,
    net_revenue_minor: 0,
    sold_units: 0,
    returned_units: 0,
    net_units: 0,
    cost_known_net_units: 0,
    cost_unknown_net_units: 0,
    profit_minor: 0,
    products: new Map(),
  };
}

function productKey(line: SaleLine): string {
  return `${line.product_id}\u0000${line.variant_id || ""}`;
}

function addProduct(
  currency: CurrencyAccumulator,
  line: SaleLine,
  netUnits: number,
  netRevenue: number,
): void {
  if (netUnits <= 0 && netRevenue <= 0) return;
  const key = productKey(line);
  const row = currency.products.get(key) || {
    product_id: line.product_id,
    ...(line.variant_id ? { variant_id: line.variant_id } : {}),
    product_name: line.product_name,
    ...(line.variant_name ? { variant_name: line.variant_name } : {}),
    net_units: 0,
    net_revenue_minor: 0,
  };
  row.net_units = safeAdd(row.net_units, netUnits, "product units");
  row.net_revenue_minor = safeAdd(
    row.net_revenue_minor,
    netRevenue,
    "product revenue",
  );
  currency.products.set(key, row);
}

function applySale(report: ReportAccumulator, sale: ParsedSale): void {
  report.sale_count += 1;
  const key = currencyKey(sale);
  const currency = report.currencies.get(key) || createCurrency(sale);
  const returned = returnedByLine(sale);
  const compensation = compensationTotals(sale);

  currency.sale_count += 1;
  currency.gross_revenue_minor = safeAdd(
    currency.gross_revenue_minor,
    sale.total_minor,
    "gross revenue",
  );
  currency.refunds_minor = safeAdd(
    currency.refunds_minor,
    compensation.refunds,
    "refunds",
  );
  if (compensation.voided) currency.voided_sale_count += 1;
  else currency.active_sale_count += 1;
  currency.return_count += compensation.returnCount;

  let saleNetRevenue = 0;
  for (const line of sale.lines) {
    const lineReturn = returned.get(line.line_id) || { quantity: 0, refund: 0 };
    if (lineReturn.quantity > line.quantity || lineReturn.refund > line.line_total_minor) {
      throw new CashierStaffAuthorityError(
        "CASHIER_REPORT_EVIDENCE_INVALID",
        "cashier return evidence exceeds original sale line",
        409,
      );
    }
    const netUnits = compensation.voided
      ? 0
      : line.quantity - lineReturn.quantity;
    const netRevenue = compensation.voided
      ? 0
      : line.line_total_minor - lineReturn.refund;

    currency.sold_units = safeAdd(currency.sold_units, line.quantity, "sold units");
    currency.returned_units = safeAdd(
      currency.returned_units,
      compensation.voided ? line.quantity : lineReturn.quantity,
      "returned units",
    );
    currency.net_units = safeAdd(currency.net_units, netUnits, "net units");
    saleNetRevenue = safeAdd(saleNetRevenue, netRevenue, "net revenue");

    if (netUnits > 0) {
      if (line.unit_cost_minor === undefined) {
        currency.cost_unknown_net_units = safeAdd(
          currency.cost_unknown_net_units,
          netUnits,
          "unknown cost units",
        );
      } else {
        currency.cost_known_net_units = safeAdd(
          currency.cost_known_net_units,
          netUnits,
          "known cost units",
        );
        const cost = line.unit_cost_minor * netUnits;
        if (!Number.isSafeInteger(cost)) {
          throw new CashierStaffAuthorityError(
            "CASHIER_REPORT_OVERFLOW",
            "cashier report cost overflowed safe integer range",
            409,
          );
        }
        currency.profit_minor = safeAdd(
          currency.profit_minor,
          netRevenue - cost,
          "profit",
        );
      }
    }
    addProduct(currency, line, netUnits, netRevenue);
  }
  currency.net_revenue_minor = safeAdd(
    currency.net_revenue_minor,
    saleNetRevenue,
    "net revenue",
  );
  report.currencies.set(key, currency);
}

function finalizeCurrency(
  value: CurrencyAccumulator,
  topProductsLimit = DEFAULT_TOP_PRODUCTS,
): CashierCentralCurrencyReport {
  const profitStatus: CashierCentralCurrencyReport["profit_status"] =
    value.cost_unknown_net_units === 0
      ? "available"
      : value.cost_known_net_units > 0
        ? "partial"
        : "unavailable";
  return {
    currency_code: value.currency_code,
    currency_fraction_digits: value.currency_fraction_digits,
    sale_count: value.sale_count,
    active_sale_count: value.active_sale_count,
    voided_sale_count: value.voided_sale_count,
    return_count: value.return_count,
    gross_revenue_minor: value.gross_revenue_minor,
    refunds_minor: value.refunds_minor,
    net_revenue_minor: value.net_revenue_minor,
    sold_units: value.sold_units,
    returned_units: value.returned_units,
    net_units: value.net_units,
    average_ticket_minor:
      value.active_sale_count > 0
        ? Math.round(value.net_revenue_minor / value.active_sale_count)
        : 0,
    profit_status: profitStatus,
    ...(profitStatus !== "unavailable"
      ? { gross_profit_minor: value.profit_minor }
      : {}),
    cost_known_net_units: value.cost_known_net_units,
    cost_unknown_net_units: value.cost_unknown_net_units,
    top_products: [...value.products.values()]
      .sort(
        (left, right) =>
          right.net_revenue_minor - left.net_revenue_minor ||
          right.net_units - left.net_units ||
          left.product_name.localeCompare(right.product_name),
      )
      .slice(0, topProductsLimit),
  };
}

function newReport(): ReportAccumulator {
  return { sale_count: 0, currencies: new Map() };
}

function finalizeReport(value: ReportAccumulator): CashierCentralReport {
  return {
    sale_count: value.sale_count,
    by_currency: [...value.currencies.values()]
      .map((currency) => finalizeCurrency(currency))
      .sort((left, right) => left.currency_code.localeCompare(right.currency_code)),
  };
}

function staffGroupKey(row: CashierOrderRow): string {
  return row.staff_id || "__legacy_unattributed__";
}

function stationGroupKey(row: CashierOrderRow): string {
  return row.station_id || "__legacy_unattributed__";
}

export async function buildCashierCentralReportAuthoritative(input: {
  merchantId: unknown;
  from?: unknown;
  to?: unknown;
}): Promise<CashierCentralReportResult> {
  if (!operationalPostgresAuthorityRequired()) {
    throw new CashierStaffAuthorityError(
      "CASHIER_REPORT_POSTGRES_REQUIRED",
      "central cashier reporting requires PostgreSQL authority",
      503,
    );
  }
  const merchantId = text(input.merchantId, "merchant_id", 200);
  const range = parseRange(input);

  return withMerchantOperationalTransaction(merchantId, async (client) => {
    const rows = await operationalQueryRows<CashierOrderRow>(
      client,
      `SELECT o.id,
              o.metadata,
              attribution.staff_id,
              staff.display_name AS staff_name,
              attribution.station_id,
              station.name AS station_name,
              station.branch_key,
              station.branch_label
         FROM orders o
         LEFT JOIN cashier_operation_attribution attribution
           ON attribution.merchant_id = o.merchant_id
          AND attribution.sale_id = o.id
          AND attribution.operation_kind = 'sale'
         LEFT JOIN merchant_cashier_staff staff
           ON staff.merchant_id = o.merchant_id
          AND staff.id = attribution.staff_id
         LEFT JOIN merchant_cashier_stations station
           ON station.merchant_id = o.merchant_id
          AND station.id = attribution.station_id
        WHERE o.merchant_id = $1
          AND o.source_channel = 'cashier'
          AND ($2::timestamptz IS NULL OR o.created_at >= $2::timestamptz)
          AND ($3::timestamptz IS NULL OR o.created_at < $3::timestamptz)
        ORDER BY o.created_at DESC, o.id
        LIMIT $4`,
      [merchantId, range.from || null, range.to || null, MAX_REPORT_SALES + 1],
    );
    if (rows.length > MAX_REPORT_SALES) {
      throw new CashierStaffAuthorityError(
        "CASHIER_REPORT_RANGE_TOO_LARGE",
        "cashier report range contains too many sales; choose a smaller period",
        413,
        { max_sales: MAX_REPORT_SALES },
      );
    }

    const total = newReport();
    const staffGroups = new Map<
      string,
      { staff_id: string | null; staff_name: string; report: ReportAccumulator }
    >();
    const stationGroups = new Map<
      string,
      {
        station_id: string | null;
        station_name: string;
        branch_key?: string;
        branch_label?: string;
        report: ReportAccumulator;
      }
    >();

    for (const row of rows) {
      const sale = parseSale(row);
      applySale(total, sale);

      const staffKey = staffGroupKey(row);
      const staffGroup = staffGroups.get(staffKey) || {
        staff_id: row.staff_id,
        staff_name: row.staff_name || "Unattributed legacy cashier",
        report: newReport(),
      };
      applySale(staffGroup.report, sale);
      staffGroups.set(staffKey, staffGroup);

      const stationKey = stationGroupKey(row);
      const stationGroup = stationGroups.get(stationKey) || {
        station_id: row.station_id,
        station_name: row.station_name || "Unattributed legacy station",
        ...(row.branch_key ? { branch_key: row.branch_key } : {}),
        ...(row.branch_label ? { branch_label: row.branch_label } : {}),
        report: newReport(),
      };
      applySale(stationGroup.report, sale);
      stationGroups.set(stationKey, stationGroup);
    }

    return {
      ...range,
      generated_at: new Date().toISOString(),
      sales_scanned: rows.length,
      report: finalizeReport(total),
      by_staff: [...staffGroups.values()]
        .map((group) => ({
          staff_id: group.staff_id,
          staff_name: group.staff_name,
          report: finalizeReport(group.report),
        }))
        .sort((left, right) => left.staff_name.localeCompare(right.staff_name)),
      by_station: [...stationGroups.values()]
        .map((group) => ({
          station_id: group.station_id,
          station_name: group.station_name,
          ...(group.branch_key ? { branch_key: group.branch_key } : {}),
          ...(group.branch_label ? { branch_label: group.branch_label } : {}),
          report: finalizeReport(group.report),
        }))
        .sort((left, right) => left.station_name.localeCompare(right.station_name)),
    };
  });
}
