import {
  operationalPostgresAuthorityRequired,
  operationalQueryRows,
  withMerchantOperationalTransaction,
} from "./operationalPostgresAuthority";
import { CashierStaffAuthorityError } from "./postgresCashierStaffAuthority";

const MAX_REPORT_SALES = 50_000;
const DEFAULT_TOP_PRODUCTS = 10;

export type CashierCentralReportEvidenceRow = {
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
  effective_unit_price_minor: number;
  line_total_minor: number;
  unit_cost_minor?: number;
};

type ReturnLine = {
  original_line_id: string;
  product_id: string;
  variant_id?: string;
  quantity: number;
  effective_unit_price_minor: number;
  refund_minor: number;
};

type Compensation = {
  kind: "return" | "void";
  operation_id: string;
  occurred_at: string;
  snapshot: Record<string, unknown>;
};

type ParsedSale = {
  sale_id: string;
  operation_id: string;
  occurred_at: string;
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

type CurrencyAccumulator = Omit<
  CashierCentralCurrencyReport,
  "average_ticket_minor" | "profit_status" | "gross_profit_minor" | "top_products"
> & {
  profit_minor: number;
  products: Map<string, CashierCentralProductRow>;
};

type ReportAccumulator = {
  sale_count: number;
  currencies: Map<string, CurrencyAccumulator>;
};

type ReportRange = {
  from?: string;
  to?: string;
};

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function nonNegativeInteger(value: unknown, field: string, allowZero = true): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0 || (!allowZero && parsed === 0)) {
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

function safeMultiply(left: number, right: number, field: string): number {
  const value = left * right;
  if (!Number.isSafeInteger(value)) {
    throw new CashierStaffAuthorityError(
      "CASHIER_REPORT_OVERFLOW",
      `cashier report ${field} overflowed safe integer range`,
      409,
    );
  }
  return value;
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

function evidenceInstant(value: unknown, field: string): string {
  const parsed = new Date(String(value ?? ""));
  if (!Number.isFinite(parsed.getTime())) {
    throw new CashierStaffAuthorityError(
      "CASHIER_REPORT_EVIDENCE_INVALID",
      `cashier report evidence contains invalid ${field}`,
      409,
    );
  }
  return parsed.toISOString();
}

function rangeInstant(value: unknown, field: string): string | undefined {
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

function parseRange(input: { from?: unknown; to?: unknown }): ReportRange {
  const from = rangeInstant(input.from, "from");
  const to = rangeInstant(input.to, "to");
  if (from && to && from >= to) {
    throw new CashierStaffAuthorityError(
      "CASHIER_REPORT_RANGE_INVALID",
      "cashier report from must be earlier than to",
      400,
    );
  }
  return { ...(from ? { from } : {}), ...(to ? { to } : {}) };
}

function inRange(instant: string, range: ReportRange): boolean {
  if (range.from && instant < range.from) return false;
  if (range.to && instant >= range.to) return false;
  return true;
}

function parseSaleLine(value: unknown): SaleLine {
  const raw = record(value);
  const quantity = nonNegativeInteger(raw.quantity, "quantity", false);
  const effectiveUnitPrice = nonNegativeInteger(
    raw.effective_unit_price_minor,
    "effective_unit_price_minor",
  );
  const lineTotal = nonNegativeInteger(raw.line_total_minor, "line_total_minor");
  if (safeMultiply(effectiveUnitPrice, quantity, "line total") !== lineTotal) {
    throw new CashierStaffAuthorityError(
      "CASHIER_REPORT_EVIDENCE_INVALID",
      "cashier report sale line total is inconsistent",
      409,
    );
  }
  return {
    line_id: text(raw.line_id, "line_id"),
    product_id: text(raw.product_id, "product_id"),
    ...(raw.variant_id ? { variant_id: text(raw.variant_id, "variant_id") } : {}),
    product_name: text(raw.product_name_snapshot, "product_name_snapshot"),
    ...(raw.variant_name_snapshot
      ? { variant_name: text(raw.variant_name_snapshot, "variant_name_snapshot") }
      : {}),
    quantity,
    effective_unit_price_minor: effectiveUnitPrice,
    line_total_minor: lineTotal,
    ...(raw.unit_cost_minor !== undefined
      ? { unit_cost_minor: nonNegativeInteger(raw.unit_cost_minor, "unit_cost_minor") }
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
  return {
    kind,
    operation_id: text(raw.operation_id, "compensation.operation_id"),
    occurred_at: evidenceInstant(raw.occurred_at, "compensation.occurred_at"),
    snapshot: record(raw.snapshot),
  };
}

function parseReturnLines(compensation: Compensation): ReturnLine[] {
  const values = compensation.snapshot.lines;
  if (!Array.isArray(values) || values.length === 0) {
    throw new CashierStaffAuthorityError(
      "CASHIER_REPORT_EVIDENCE_INVALID",
      "cashier return lines are missing",
      409,
    );
  }
  return values.map((value) => {
    const raw = record(value);
    return {
      original_line_id: text(raw.original_line_id, "return.original_line_id"),
      product_id: text(raw.product_id, "return.product_id"),
      ...(raw.variant_id ? { variant_id: text(raw.variant_id, "return.variant_id") } : {}),
      quantity: nonNegativeInteger(raw.quantity, "return.quantity", false),
      effective_unit_price_minor: nonNegativeInteger(
        raw.effective_unit_price_minor,
        "return.effective_unit_price_minor",
      ),
      refund_minor: nonNegativeInteger(raw.refund_minor, "return.refund_minor"),
    };
  });
}

function originalLineById(sale: ParsedSale, lineId: string): SaleLine {
  const line = sale.lines.find((candidate) => candidate.line_id === lineId);
  if (!line) {
    throw new CashierStaffAuthorityError(
      "CASHIER_REPORT_EVIDENCE_INVALID",
      "cashier return references an unknown sale line",
      409,
    );
  }
  return line;
}

function validateSaleEvidence(sale: ParsedSale): void {
  const lineIds = new Set<string>();
  const itemKeys = new Set<string>();
  let saleTotal = 0;
  for (const line of sale.lines) {
    const itemKey = `${line.product_id}\u0000${line.variant_id || ""}`;
    if (lineIds.has(line.line_id) || itemKeys.has(itemKey)) {
      throw new CashierStaffAuthorityError(
        "CASHIER_REPORT_EVIDENCE_INVALID",
        "cashier sale contains duplicate line evidence",
        409,
      );
    }
    lineIds.add(line.line_id);
    itemKeys.add(itemKey);
    saleTotal = safeAdd(saleTotal, line.line_total_minor, "sale total");
  }
  if (saleTotal !== sale.total_minor) {
    throw new CashierStaffAuthorityError(
      "CASHIER_REPORT_EVIDENCE_INVALID",
      "cashier sale total does not match line evidence",
      409,
    );
  }

  const compensationIds = new Set<string>();
  const returnedByLine = new Map<string, number>();
  let voidCount = 0;
  let returnCount = 0;
  for (const compensation of sale.compensations) {
    if (
      compensation.operation_id === sale.operation_id ||
      compensationIds.has(compensation.operation_id)
    ) {
      throw new CashierStaffAuthorityError(
        "CASHIER_REPORT_EVIDENCE_INVALID",
        "cashier compensation operation identity is duplicated",
        409,
      );
    }
    compensationIds.add(compensation.operation_id);

    const snapshotSaleId = text(
      compensation.snapshot.sale_id,
      `${compensation.kind}.sale_id`,
    );
    if (snapshotSaleId !== sale.sale_id) {
      throw new CashierStaffAuthorityError(
        "CASHIER_REPORT_EVIDENCE_INVALID",
        "cashier compensation references a different sale",
        409,
      );
    }
    if (
      currencyCode(compensation.snapshot.currency_code) !== sale.currency_code ||
      nonNegativeInteger(
        compensation.snapshot.currency_fraction_digits,
        `${compensation.kind}.currency_fraction_digits`,
      ) !== sale.currency_fraction_digits
    ) {
      throw new CashierStaffAuthorityError(
        "CASHIER_REPORT_EVIDENCE_INVALID",
        "cashier compensation currency does not match original sale",
        409,
      );
    }

    if (compensation.kind === "void") {
      voidCount += 1;
      const refund = nonNegativeInteger(
        compensation.snapshot.refund_total_minor,
        "void.refund_total_minor",
      );
      if (refund !== sale.total_minor) {
        throw new CashierStaffAuthorityError(
          "CASHIER_REPORT_EVIDENCE_INVALID",
          "cashier void total does not match original sale",
          409,
        );
      }
      continue;
    }

    returnCount += 1;
    const returnLines = parseReturnLines(compensation);
    const returnLineIds = new Set<string>();
    let refundTotal = 0;
    for (const returned of returnLines) {
      if (returnLineIds.has(returned.original_line_id)) {
        throw new CashierStaffAuthorityError(
          "CASHIER_REPORT_EVIDENCE_INVALID",
          "cashier return contains duplicate line evidence",
          409,
        );
      }
      returnLineIds.add(returned.original_line_id);
      const original = originalLineById(sale, returned.original_line_id);
      if (
        returned.product_id !== original.product_id ||
        returned.variant_id !== original.variant_id ||
        returned.effective_unit_price_minor !== original.effective_unit_price_minor ||
        returned.refund_minor !==
          safeMultiply(
            original.effective_unit_price_minor,
            returned.quantity,
            "return refund",
          )
      ) {
        throw new CashierStaffAuthorityError(
          "CASHIER_REPORT_EVIDENCE_INVALID",
          "cashier return line does not match original sale evidence",
          409,
        );
      }
      const returnedBefore = returnedByLine.get(original.line_id) || 0;
      const returnedAfter = safeAdd(
        returnedBefore,
        returned.quantity,
        "cumulative return quantity",
      );
      if (returnedAfter > original.quantity) {
        throw new CashierStaffAuthorityError(
          "CASHIER_REPORT_EVIDENCE_INVALID",
          "cashier cumulative return exceeds original sold quantity",
          409,
        );
      }
      returnedByLine.set(original.line_id, returnedAfter);
      refundTotal = safeAdd(refundTotal, returned.refund_minor, "return refund total");
    }
    if (
      refundTotal !==
      nonNegativeInteger(
        compensation.snapshot.refund_total_minor,
        "return.refund_total_minor",
      )
    ) {
      throw new CashierStaffAuthorityError(
        "CASHIER_REPORT_EVIDENCE_INVALID",
        "cashier return total is inconsistent",
        409,
      );
    }
  }

  if (voidCount > 1 || (voidCount > 0 && returnCount > 0)) {
    throw new CashierStaffAuthorityError(
      "CASHIER_REPORT_EVIDENCE_INVALID",
      "cashier sale compensation lifecycle is inconsistent",
      409,
    );
  }
}

function parseSale(row: CashierCentralReportEvidenceRow): ParsedSale {
  const cashier = record(record(row.metadata).cashier_sync);
  const snapshot = record(cashier.sale_snapshot);
  if (
    String(snapshot.source || "") !== "cashier" ||
    String(snapshot.status || "") !== "completed"
  ) {
    throw new CashierStaffAuthorityError(
      "CASHIER_REPORT_EVIDENCE_INVALID",
      "cashier report sale lifecycle is invalid",
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
  const fractionDigits = nonNegativeInteger(
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
  const sale: ParsedSale = {
    sale_id: saleId,
    operation_id: text(snapshot.operation_id, "sale.operation_id"),
    occurred_at: evidenceInstant(snapshot.occurred_at, "sale.occurred_at"),
    currency_code: currencyCode(snapshot.currency_code),
    currency_fraction_digits: fractionDigits,
    total_minor: nonNegativeInteger(snapshot.total_minor, "total_minor"),
    lines: snapshot.lines.map(parseSaleLine),
    compensations: Array.isArray(cashier.compensations)
      ? cashier.compensations.map(parseCompensation)
      : [],
  };
  validateSaleEvidence(sale);
  return sale;
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

function reportCurrency(report: ReportAccumulator, sale: ParsedSale): CurrencyAccumulator {
  const key = currencyKey(sale);
  const current = report.currencies.get(key) || createCurrency(sale);
  report.currencies.set(key, current);
  return current;
}

function productKey(line: SaleLine): string {
  return `${line.product_id}\u0000${line.variant_id || ""}`;
}

function addProductDelta(
  currency: CurrencyAccumulator,
  line: SaleLine,
  units: number,
  revenue: number,
): void {
  if (units === 0 && revenue === 0) return;
  const key = productKey(line);
  const row = currency.products.get(key) || {
    product_id: line.product_id,
    ...(line.variant_id ? { variant_id: line.variant_id } : {}),
    product_name: line.product_name,
    ...(line.variant_name ? { variant_name: line.variant_name } : {}),
    net_units: 0,
    net_revenue_minor: 0,
  };
  row.net_units = safeAdd(row.net_units, units, "product units");
  row.net_revenue_minor = safeAdd(
    row.net_revenue_minor,
    revenue,
    "product revenue",
  );
  currency.products.set(key, row);
}

function addCostContribution(
  currency: CurrencyAccumulator,
  line: SaleLine,
  quantity: number,
  revenueContribution: number,
  direction: 1 | -1,
): void {
  // These counters intentionally track all units whose cost affects the period,
  // not algebraic net units. That keeps profit completeness truthful for a
  // return-only period where the monetary contribution itself is negative.
  if (line.unit_cost_minor === undefined) {
    currency.cost_unknown_net_units = safeAdd(
      currency.cost_unknown_net_units,
      quantity,
      "unknown cost affected units",
    );
    return;
  }
  currency.cost_known_net_units = safeAdd(
    currency.cost_known_net_units,
    quantity,
    "known cost affected units",
  );
  const cost = safeMultiply(line.unit_cost_minor, quantity, "cost");
  const profitContribution = revenueContribution - cost;
  currency.profit_minor = safeAdd(
    currency.profit_minor,
    direction * profitContribution,
    "profit",
  );
}

function applySaleOperation(
  report: ReportAccumulator,
  sale: ParsedSale,
  range: ReportRange,
): void {
  if (!inRange(sale.occurred_at, range)) return;
  report.sale_count = safeAdd(report.sale_count, 1, "sale count");
  const currency = reportCurrency(report, sale);
  currency.sale_count = safeAdd(currency.sale_count, 1, "currency sale count");
  currency.active_sale_count = safeAdd(
    currency.active_sale_count,
    1,
    "active sale count",
  );
  currency.gross_revenue_minor = safeAdd(
    currency.gross_revenue_minor,
    sale.total_minor,
    "gross revenue",
  );
  currency.net_revenue_minor = safeAdd(
    currency.net_revenue_minor,
    sale.total_minor,
    "net revenue",
  );
  for (const line of sale.lines) {
    currency.sold_units = safeAdd(currency.sold_units, line.quantity, "sold units");
    currency.net_units = safeAdd(currency.net_units, line.quantity, "net units");
    addProductDelta(currency, line, line.quantity, line.line_total_minor);
    addCostContribution(currency, line, line.quantity, line.line_total_minor, 1);
  }
}

function applyReturnOperation(
  report: ReportAccumulator,
  sale: ParsedSale,
  compensation: Compensation,
  range: ReportRange,
): void {
  if (!inRange(compensation.occurred_at, range)) return;
  const currency = reportCurrency(report, sale);
  const lines = parseReturnLines(compensation);
  let refundTotal = 0;
  for (const returned of lines) {
    const original = originalLineById(sale, returned.original_line_id);
    refundTotal = safeAdd(refundTotal, returned.refund_minor, "refunds");
    currency.returned_units = safeAdd(
      currency.returned_units,
      returned.quantity,
      "returned units",
    );
    currency.net_units = safeAdd(
      currency.net_units,
      -returned.quantity,
      "net units",
    );
    currency.net_revenue_minor = safeAdd(
      currency.net_revenue_minor,
      -returned.refund_minor,
      "net revenue",
    );
    addProductDelta(
      currency,
      original,
      -returned.quantity,
      -returned.refund_minor,
    );
    addCostContribution(
      currency,
      original,
      returned.quantity,
      returned.refund_minor,
      -1,
    );
  }
  currency.return_count = safeAdd(currency.return_count, 1, "return count");
  currency.refunds_minor = safeAdd(currency.refunds_minor, refundTotal, "refunds");
}

function applyVoidOperation(
  report: ReportAccumulator,
  sale: ParsedSale,
  compensation: Compensation,
  range: ReportRange,
): void {
  if (!inRange(compensation.occurred_at, range)) return;
  const currency = reportCurrency(report, sale);
  const refund = nonNegativeInteger(
    compensation.snapshot.refund_total_minor,
    "void.refund_total_minor",
  );
  currency.voided_sale_count = safeAdd(
    currency.voided_sale_count,
    1,
    "void count",
  );
  if (inRange(sale.occurred_at, range)) {
    currency.active_sale_count = safeAdd(
      currency.active_sale_count,
      -1,
      "active sale count",
    );
  }
  currency.refunds_minor = safeAdd(currency.refunds_minor, refund, "refunds");
  currency.net_revenue_minor = safeAdd(
    currency.net_revenue_minor,
    -refund,
    "net revenue",
  );
  for (const line of sale.lines) {
    currency.returned_units = safeAdd(
      currency.returned_units,
      line.quantity,
      "returned units",
    );
    currency.net_units = safeAdd(currency.net_units, -line.quantity, "net units");
    addProductDelta(currency, line, -line.quantity, -line.line_total_minor);
    addCostContribution(currency, line, line.quantity, line.line_total_minor, -1);
  }
}

function applyPeriodEvidence(
  report: ReportAccumulator,
  sale: ParsedSale,
  range: ReportRange,
): void {
  applySaleOperation(report, sale, range);
  for (const compensation of sale.compensations) {
    if (compensation.kind === "return") {
      applyReturnOperation(report, sale, compensation, range);
    } else {
      applyVoidOperation(report, sale, compensation, range);
    }
  }
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
      value.sale_count > 0
        ? Math.round(value.gross_revenue_minor / value.sale_count)
        : 0,
    profit_status: profitStatus,
    ...(profitStatus !== "unavailable"
      ? { gross_profit_minor: value.profit_minor }
      : {}),
    cost_known_net_units: value.cost_known_net_units,
    cost_unknown_net_units: value.cost_unknown_net_units,
    top_products: [...value.products.values()]
      .filter((product) => product.net_units > 0 || product.net_revenue_minor > 0)
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

function staffGroupKey(row: CashierCentralReportEvidenceRow): string {
  return row.staff_id || "__legacy_unattributed__";
}

function stationGroupKey(row: CashierCentralReportEvidenceRow): string {
  return row.station_id || "__legacy_unattributed__";
}

function buildResultFromRows(
  rows: CashierCentralReportEvidenceRow[],
  range: ReportRange,
  generatedAt: string,
): CashierCentralReportResult {
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
  const seenSaleIds = new Set<string>();

  for (const row of rows) {
    if (seenSaleIds.has(row.id)) {
      throw new CashierStaffAuthorityError(
        "CASHIER_REPORT_EVIDENCE_INVALID",
        "cashier sale has duplicate sale attribution evidence",
        409,
      );
    }
    seenSaleIds.add(row.id);
    const sale = parseSale(row);
    applyPeriodEvidence(total, sale, range);

    const staffKey = staffGroupKey(row);
    const staffGroup = staffGroups.get(staffKey) || {
      staff_id: row.staff_id,
      staff_name: row.staff_name || "Unattributed legacy cashier",
      report: newReport(),
    };
    applyPeriodEvidence(staffGroup.report, sale, range);
    staffGroups.set(staffKey, staffGroup);

    const stationKey = stationGroupKey(row);
    const stationGroup = stationGroups.get(stationKey) || {
      station_id: row.station_id,
      station_name: row.station_name || "Unattributed legacy station",
      ...(row.branch_key ? { branch_key: row.branch_key } : {}),
      ...(row.branch_label ? { branch_label: row.branch_label } : {}),
      report: newReport(),
    };
    applyPeriodEvidence(stationGroup.report, sale, range);
    stationGroups.set(stationKey, stationGroup);
  }

  return {
    ...range,
    generated_at: generatedAt,
    sales_scanned: rows.length,
    report: finalizeReport(total),
    by_staff: [...staffGroups.values()]
      .map((group) => ({
        staff_id: group.staff_id,
        staff_name: group.staff_name,
        report: finalizeReport(group.report),
      }))
      .filter((group) => group.report.by_currency.length > 0)
      .sort((left, right) => left.staff_name.localeCompare(right.staff_name)),
    by_station: [...stationGroups.values()]
      .map((group) => ({
        station_id: group.station_id,
        station_name: group.station_name,
        ...(group.branch_key ? { branch_key: group.branch_key } : {}),
        ...(group.branch_label ? { branch_label: group.branch_label } : {}),
        report: finalizeReport(group.report),
      }))
      .filter((group) => group.report.by_currency.length > 0)
      .sort((left, right) => left.station_name.localeCompare(right.station_name)),
  };
}

/** Pure evidence reducer used by focused accounting tests. */
export function buildCashierCentralReportFromEvidenceRows(input: {
  rows: CashierCentralReportEvidenceRow[];
  from?: unknown;
  to?: unknown;
  generatedAt?: string;
}): CashierCentralReportResult {
  const range = parseRange(input);
  return buildResultFromRows(
    input.rows,
    range,
    input.generatedAt || new Date().toISOString(),
  );
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
    const rows = await operationalQueryRows<CashierCentralReportEvidenceRow>(
      client,
      `SELECT o.id,
              o.metadata,
              sale_attribution.staff_id,
              staff.display_name AS staff_name,
              sale_attribution.station_id,
              station.name AS station_name,
              station.branch_key,
              station.branch_label
         FROM orders o
         LEFT JOIN cashier_operation_attribution sale_attribution
           ON sale_attribution.merchant_id = o.merchant_id
          AND sale_attribution.sale_id = o.id
          AND sale_attribution.operation_kind = 'sale'
         LEFT JOIN merchant_cashier_staff staff
           ON staff.merchant_id = o.merchant_id
          AND staff.id = sale_attribution.staff_id
         LEFT JOIN merchant_cashier_stations station
           ON station.merchant_id = o.merchant_id
          AND station.id = sale_attribution.station_id
        WHERE o.merchant_id = $1
          AND o.source_channel = 'cashier'
          AND (
            (
              ($2::text IS NULL OR o.metadata->'cashier_sync'->'sale_snapshot'->>'occurred_at' >= $2::text)
              AND ($3::text IS NULL OR o.metadata->'cashier_sync'->'sale_snapshot'->>'occurred_at' < $3::text)
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
               WHERE ($2::text IS NULL OR compensation->>'occurred_at' >= $2::text)
                 AND ($3::text IS NULL OR compensation->>'occurred_at' < $3::text)
            )
          )
        ORDER BY o.metadata->'cashier_sync'->'sale_snapshot'->>'occurred_at' DESC, o.id
        LIMIT $4`,
      [merchantId, range.from || null, range.to || null, MAX_REPORT_SALES + 1],
    );
    if (rows.length > MAX_REPORT_SALES) {
      throw new CashierStaffAuthorityError(
        "CASHIER_REPORT_RANGE_TOO_LARGE",
        "cashier report range contains too many affected sales; choose a smaller period",
        413,
        { max_sales: MAX_REPORT_SALES },
      );
    }
    return buildResultFromRows(rows, range, new Date().toISOString());
  });
}
