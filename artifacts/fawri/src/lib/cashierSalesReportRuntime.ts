import type {
  CashierReturnSnapshot,
  CashierSaleLineSnapshot,
  CashierSaleSnapshot,
} from './cashierLocalContracts';
import {
  CASHIER_RETURN_REFUND_ALLOCATION_VERSION,
  cashierReturnRefundMinor,
} from './cashierReturnRefundAllocation';

type CostAwareSaleLine = CashierSaleLineSnapshot & {
  /** Optional owner-only sale-time cost snapshot. Staff devices normally omit it. */
  unit_cost_minor?: number;
};

export type CashierReportProfitStatus = 'available' | 'partial' | 'unavailable';

export type CashierSalesReportProductRow = {
  product_id: string;
  variant_id?: string;
  product_name: string;
  variant_name?: string;
  net_units: number;
  net_revenue_minor: number;
};

export type CashierSalesCurrencyReport = {
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
  profit_status: CashierReportProfitStatus;
  gross_profit_minor?: number;
  cost_known_net_units: number;
  cost_unknown_net_units: number;
  top_products: CashierSalesReportProductRow[];
};

export type CashierSalesReport = {
  from?: string;
  to?: string;
  sale_count: number;
  by_currency: CashierSalesCurrencyReport[];
};

export type CashierSalesReportOptions = {
  from?: string | Date;
  to?: string | Date;
  topProductsLimit?: number;
};

type ProductAccumulator = CashierSalesReportProductRow;

type CurrencyAccumulator = Omit<
  CashierSalesCurrencyReport,
  'average_ticket_minor' | 'profit_status' | 'gross_profit_minor' | 'top_products'
> & {
  profit_minor: number;
  products: Map<string, ProductAccumulator>;
};

function safeNonNegativeInteger(value: unknown, label: string): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new Error(`CASHIER_REPORT_INVALID_${label.toUpperCase()}`);
  }
  return parsed;
}

function safePositiveInteger(value: unknown, label: string): number {
  const parsed = safeNonNegativeInteger(value, label);
  if (parsed === 0) throw new Error(`CASHIER_REPORT_INVALID_${label.toUpperCase()}`);
  return parsed;
}

function safeAdd(current: number, delta: number, label: string): number {
  const next = current + delta;
  if (!Number.isSafeInteger(next)) {
    throw new Error(`CASHIER_REPORT_OVERFLOW_${label.toUpperCase()}`);
  }
  return next;
}

function safeMultiply(left: number, right: number, label: string): number {
  const value = left * right;
  if (!Number.isSafeInteger(value)) {
    throw new Error(`CASHIER_REPORT_OVERFLOW_${label.toUpperCase()}`);
  }
  return value;
}

function manualDiscountMinor(sale: CashierSaleSnapshot): number {
  return safeNonNegativeInteger(sale.manual_discount_minor ?? 0, 'manual_discount');
}

/**
 * Allocate a sale-level manual discount across immutable sale lines without
 * floating point. The resulting line revenues always sum to sale.total_minor,
 * preserving truthful product revenue/profit attribution while the sale-level
 * total remains the authoritative amount actually charged.
 */
function adjustedLineRevenueById(sale: CashierSaleSnapshot): Map<string, number> {
  let preDiscountTotal = 0;
  for (const line of sale.lines) {
    preDiscountTotal = safeAdd(
      preDiscountTotal,
      safeNonNegativeInteger(line.line_total_minor, 'line_total'),
      'pre_discount_total',
    );
  }
  const manualDiscount = manualDiscountMinor(sale);
  if (manualDiscount > preDiscountTotal) {
    throw new Error('CASHIER_REPORT_INVALID_SALE_TOTAL');
  }

  let remainingBase = BigInt(preDiscountTotal);
  let remainingDiscount = BigInt(manualDiscount);
  const adjusted = new Map<string, number>();

  sale.lines.forEach((line, index) => {
    const lineTotal = safeNonNegativeInteger(line.line_total_minor, 'line_total');
    const lineBase = BigInt(lineTotal);
    let allocatedDiscount = 0n;
    if (remainingDiscount > 0n) {
      allocatedDiscount =
        index === sale.lines.length - 1
          ? remainingDiscount
          : remainingBase > 0n
            ? (remainingDiscount * lineBase) / remainingBase
            : 0n;
    }
    if (allocatedDiscount < 0n || allocatedDiscount > lineBase) {
      throw new Error('CASHIER_REPORT_INVALID_SALE_TOTAL');
    }
    const adjustedRevenueBig = lineBase - allocatedDiscount;
    const adjustedRevenue = Number(adjustedRevenueBig);
    if (!Number.isSafeInteger(adjustedRevenue) || adjustedRevenue < 0) {
      throw new Error('CASHIER_REPORT_OVERFLOW_LINE_REVENUE');
    }
    adjusted.set(line.line_id, adjustedRevenue);
    remainingBase -= lineBase;
    remainingDiscount -= allocatedDiscount;
  });

  if (remainingDiscount !== 0n || remainingBase !== 0n) {
    throw new Error('CASHIER_REPORT_INVALID_SALE_TOTAL');
  }
  return adjusted;
}

function validInstant(value: string | Date | undefined, label: string): Date | undefined {
  if (value === undefined) return undefined;
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) {
    throw new Error(`CASHIER_REPORT_INVALID_${label.toUpperCase()}`);
  }
  return date;
}

function requiredInstant(value: string, label: string): Date {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) {
    throw new Error(`CASHIER_REPORT_INVALID_${label.toUpperCase()}`);
  }
  return date;
}

function inRange(date: Date, from?: Date, to?: Date): boolean {
  if (from && date.getTime() < from.getTime()) return false;
  if (to && date.getTime() >= to.getTime()) return false;
  return true;
}

function lineKey(line: Pick<CashierSaleLineSnapshot, 'product_id' | 'variant_id'>): string {
  return `${line.product_id}\u0000${line.variant_id || ''}`;
}

function reportCurrencyKey(sale: CashierSaleSnapshot): string {
  const code = String(sale.currency_code || '').trim().toUpperCase();
  const digits = Number(sale.currency_fraction_digits);
  if (!/^[A-Z]{3}$/.test(code) || !Number.isInteger(digits) || digits < 0 || digits > 6) {
    throw new Error('CASHIER_REPORT_INVALID_CURRENCY');
  }
  return `${code}:${digits}`;
}

function createCurrencyAccumulator(sale: CashierSaleSnapshot): CurrencyAccumulator {
  return {
    currency_code: String(sale.currency_code).toUpperCase(),
    currency_fraction_digits: Number(sale.currency_fraction_digits),
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

function currencyFor(
  currencies: Map<string, CurrencyAccumulator>,
  sale: CashierSaleSnapshot,
): CurrencyAccumulator {
  const key = reportCurrencyKey(sale);
  const accumulator = currencies.get(key) || createCurrencyAccumulator(sale);
  currencies.set(key, accumulator);
  return accumulator;
}

function addProductRow(
  accumulator: CurrencyAccumulator,
  line: CashierSaleLineSnapshot,
  unitsDelta: number,
  revenueDelta: number,
): void {
  if (unitsDelta === 0 && revenueDelta === 0) return;
  const key = lineKey(line);
  const existing = accumulator.products.get(key);
  const row: ProductAccumulator = existing || {
    product_id: line.product_id,
    ...(line.variant_id ? { variant_id: line.variant_id } : {}),
    product_name: line.product_name_snapshot,
    ...(line.variant_name_snapshot
      ? { variant_name: line.variant_name_snapshot }
      : {}),
    net_units: 0,
    net_revenue_minor: 0,
  };
  row.net_units = safeAdd(row.net_units, unitsDelta, 'product_units');
  row.net_revenue_minor = safeAdd(
    row.net_revenue_minor,
    revenueDelta,
    'product_revenue',
  );
  accumulator.products.set(key, row);
}

function addCostContribution(
  accumulator: CurrencyAccumulator,
  line: CostAwareSaleLine,
  quantity: number,
  revenueContribution: number,
  direction: 1 | -1,
): void {
  if (line.unit_cost_minor === undefined || line.unit_cost_minor === null) {
    accumulator.cost_unknown_net_units = safeAdd(
      accumulator.cost_unknown_net_units,
      quantity,
      'unknown_cost_units',
    );
    return;
  }
  const cost = safeNonNegativeInteger(line.unit_cost_minor, 'unit_cost');
  accumulator.cost_known_net_units = safeAdd(
    accumulator.cost_known_net_units,
    quantity,
    'known_cost_units',
  );
  const profit = revenueContribution - safeMultiply(cost, quantity, 'cost');
  accumulator.profit_minor = safeAdd(
    accumulator.profit_minor,
    direction * profit,
    'profit',
  );
}

function validateSale(sale: CashierSaleSnapshot): void {
  if (sale.source !== 'cashier' || !Array.isArray(sale.lines) || sale.lines.length === 0) {
    throw new Error('CASHIER_REPORT_INVALID_SALE');
  }
  reportCurrencyKey(sale);
  const lineIds = new Set<string>();
  const itemKeys = new Set<string>();
  let totalBeforeManualDiscount = 0;
  for (const line of sale.lines) {
    const quantity = safePositiveInteger(line.quantity, 'sold_quantity');
    const price = safeNonNegativeInteger(
      line.effective_unit_price_minor,
      'effective_price',
    );
    const lineTotal = safeNonNegativeInteger(line.line_total_minor, 'line_total');
    if (lineTotal !== safeMultiply(price, quantity, 'line_revenue')) {
      throw new Error('CASHIER_REPORT_INVALID_LINE_TOTAL');
    }
    if (lineIds.has(line.line_id) || itemKeys.has(lineKey(line))) {
      throw new Error('CASHIER_REPORT_DUPLICATE_SALE_LINE');
    }
    lineIds.add(line.line_id);
    itemKeys.add(lineKey(line));
    totalBeforeManualDiscount = safeAdd(
      totalBeforeManualDiscount,
      lineTotal,
      'sale_total',
    );
    if (line.unit_cost_minor !== undefined) {
      safeNonNegativeInteger(line.unit_cost_minor, 'unit_cost');
    }
  }
  const manualDiscount = manualDiscountMinor(sale);
  const saleTotal = safeNonNegativeInteger(sale.total_minor, 'sale_total');
  if (
    manualDiscount > totalBeforeManualDiscount ||
    totalBeforeManualDiscount - manualDiscount !== saleTotal
  ) {
    throw new Error('CASHIER_REPORT_INVALID_SALE_TOTAL');
  }

  const returns = sale.returns || [];
  if (sale.void && returns.length > 0) {
    throw new Error('CASHIER_REPORT_VOID_AFTER_RETURN');
  }
  if (sale.status === 'voided' && !sale.void) {
    throw new Error('CASHIER_REPORT_VOID_EVIDENCE_MISSING');
  }
  const operationIds = new Set<string>([sale.operation_id]);
  const returnedByLine = new Map<string, number>();
  for (const snapshot of returns) {
    if (operationIds.has(snapshot.operation_id)) {
      throw new Error('CASHIER_REPORT_DUPLICATE_OPERATION');
    }
    operationIds.add(snapshot.operation_id);
    validateReturnSnapshot(sale, snapshot, returnedByLine);
  }
  if (sale.void) {
    if (operationIds.has(sale.void.operation_id)) {
      throw new Error('CASHIER_REPORT_DUPLICATE_OPERATION');
    }
    if (
      sale.void.sale_id !== sale.sale_id ||
      sale.void.currency_code !== sale.currency_code ||
      sale.void.currency_fraction_digits !== sale.currency_fraction_digits ||
      safeNonNegativeInteger(sale.void.refund_total_minor, 'void_refund') !== sale.total_minor
    ) {
      throw new Error('CASHIER_REPORT_INVALID_VOID');
    }
    requiredInstant(sale.void.occurred_at, 'void_time');
  }
  requiredInstant(sale.occurred_at, 'sale_time');
}

function validateReturnSnapshot(
  sale: CashierSaleSnapshot,
  snapshot: CashierReturnSnapshot,
  returnedByLine: Map<string, number>,
): void {
  if (
    snapshot.sale_id !== sale.sale_id ||
    snapshot.currency_code !== sale.currency_code ||
    snapshot.currency_fraction_digits !== sale.currency_fraction_digits ||
    !Array.isArray(snapshot.lines) ||
    snapshot.lines.length === 0
  ) {
    throw new Error('CASHIER_REPORT_INVALID_RETURN');
  }
  requiredInstant(snapshot.occurred_at, 'return_time');
  const lineIds = new Set<string>();
  let refundTotal = 0;
  for (const returned of snapshot.lines) {
    if (lineIds.has(returned.original_line_id)) {
      throw new Error('CASHIER_REPORT_DUPLICATE_RETURN_LINE');
    }
    lineIds.add(returned.original_line_id);
    const original = sale.lines.find(
      line => line.line_id === returned.original_line_id,
    );
    if (!original) throw new Error('CASHIER_REPORT_RETURN_LINE_NOT_FOUND');
    const quantity = safePositiveInteger(returned.quantity, 'return_quantity');
    const refund = safeNonNegativeInteger(returned.refund_minor, 'return_refund');
    const originalPrice = safeNonNegativeInteger(
      original.effective_unit_price_minor,
      'effective_price',
    );
    const allocationVersion = snapshot.refund_allocation_version;
    if (
      allocationVersion !== undefined &&
      allocationVersion !== CASHIER_RETURN_REFUND_ALLOCATION_VERSION
    ) {
      throw new Error('CASHIER_REPORT_RETURN_ALLOCATION_VERSION_UNSUPPORTED');
    }
    const alreadyReturned = returnedByLine.get(original.line_id) || 0;
    const cumulative = safeAdd(alreadyReturned, quantity, 'returned_quantity');
    if (cumulative > original.quantity) {
      throw new Error('CASHIER_REPORT_RETURN_EXCEEDS_SALE');
    }
    const expectedRefund =
      allocationVersion === CASHIER_RETURN_REFUND_ALLOCATION_VERSION
        ? cashierReturnRefundMinor({
            sale,
            lineId: original.line_id,
            alreadyReturnedQuantity: alreadyReturned,
            returnQuantity: quantity,
          })
        : safeMultiply(originalPrice, quantity, 'return_refund');
    if (
      returned.product_id !== original.product_id ||
      returned.variant_id !== original.variant_id ||
      returned.effective_unit_price_minor !== originalPrice ||
      refund !== expectedRefund
    ) {
      throw new Error('CASHIER_REPORT_RETURN_MISMATCH');
    }
    returnedByLine.set(original.line_id, cumulative);
    refundTotal = safeAdd(refundTotal, refund, 'return_refund');
  }
  if (refundTotal !== safeNonNegativeInteger(snapshot.refund_total_minor, 'return_refund')) {
    throw new Error('CASHIER_REPORT_INVALID_RETURN_TOTAL');
  }
}

function applySale(
  currencies: Map<string, CurrencyAccumulator>,
  sale: CashierSaleSnapshot,
  from?: Date,
  to?: Date,
): boolean {
  const occurredAt = requiredInstant(sale.occurred_at, 'sale_time');
  if (!inRange(occurredAt, from, to)) return false;
  const accumulator = currencyFor(currencies, sale);
  accumulator.sale_count = safeAdd(accumulator.sale_count, 1, 'sale_count');
  accumulator.active_sale_count = safeAdd(
    accumulator.active_sale_count,
    1,
    'active_sale_count',
  );
  const saleTotal = safeNonNegativeInteger(sale.total_minor, 'sale_total');
  accumulator.gross_revenue_minor = safeAdd(
    accumulator.gross_revenue_minor,
    saleTotal,
    'gross_revenue',
  );
  accumulator.net_revenue_minor = safeAdd(
    accumulator.net_revenue_minor,
    saleTotal,
    'net_revenue',
  );
  const adjustedRevenue = adjustedLineRevenueById(sale);
  for (const rawLine of sale.lines) {
    const line = rawLine as CostAwareSaleLine;
    const quantity = safePositiveInteger(line.quantity, 'sold_quantity');
    const revenue = adjustedRevenue.get(line.line_id);
    if (revenue === undefined) {
      throw new Error('CASHIER_REPORT_INVALID_SALE_TOTAL');
    }
    accumulator.sold_units = safeAdd(accumulator.sold_units, quantity, 'sold_units');
    accumulator.net_units = safeAdd(accumulator.net_units, quantity, 'net_units');
    addProductRow(accumulator, line, quantity, revenue);
    addCostContribution(accumulator, line, quantity, revenue, 1);
  }
  return true;
}

function applyReturn(
  currencies: Map<string, CurrencyAccumulator>,
  sale: CashierSaleSnapshot,
  snapshot: CashierReturnSnapshot,
  from?: Date,
  to?: Date,
): void {
  const occurredAt = requiredInstant(snapshot.occurred_at, 'return_time');
  if (!inRange(occurredAt, from, to)) return;
  const accumulator = currencyFor(currencies, sale);
  accumulator.return_count = safeAdd(accumulator.return_count, 1, 'return_count');
  const refundTotal = safeNonNegativeInteger(snapshot.refund_total_minor, 'return_refund');
  accumulator.refunds_minor = safeAdd(
    accumulator.refunds_minor,
    refundTotal,
    'refunds',
  );
  accumulator.net_revenue_minor = safeAdd(
    accumulator.net_revenue_minor,
    -refundTotal,
    'net_revenue',
  );
  for (const returned of snapshot.lines) {
    const original = sale.lines.find(
      line => line.line_id === returned.original_line_id,
    ) as CostAwareSaleLine | undefined;
    if (!original) throw new Error('CASHIER_REPORT_RETURN_LINE_NOT_FOUND');
    const quantity = safePositiveInteger(returned.quantity, 'return_quantity');
    const refund = safeNonNegativeInteger(returned.refund_minor, 'return_refund');
    accumulator.returned_units = safeAdd(
      accumulator.returned_units,
      quantity,
      'returned_units',
    );
    accumulator.net_units = safeAdd(accumulator.net_units, -quantity, 'net_units');
    addProductRow(accumulator, original, -quantity, -refund);
    addCostContribution(accumulator, original, quantity, refund, -1);
  }
}

function applyVoid(
  currencies: Map<string, CurrencyAccumulator>,
  sale: CashierSaleSnapshot,
  saleInRange: boolean,
  from?: Date,
  to?: Date,
): void {
  if (!sale.void) return;
  const occurredAt = requiredInstant(sale.void.occurred_at, 'void_time');
  if (!inRange(occurredAt, from, to)) return;
  const accumulator = currencyFor(currencies, sale);
  accumulator.voided_sale_count = safeAdd(
    accumulator.voided_sale_count,
    1,
    'voided_sale_count',
  );
  if (saleInRange) {
    accumulator.active_sale_count = safeAdd(
      accumulator.active_sale_count,
      -1,
      'active_sale_count',
    );
  }
  const refund = safeNonNegativeInteger(sale.void.refund_total_minor, 'void_refund');
  accumulator.refunds_minor = safeAdd(accumulator.refunds_minor, refund, 'refunds');
  accumulator.net_revenue_minor = safeAdd(
    accumulator.net_revenue_minor,
    -refund,
    'net_revenue',
  );
  const adjustedRevenue = adjustedLineRevenueById(sale);
  for (const rawLine of sale.lines) {
    const line = rawLine as CostAwareSaleLine;
    const quantity = safePositiveInteger(line.quantity, 'sold_quantity');
    const revenue = adjustedRevenue.get(line.line_id);
    if (revenue === undefined) {
      throw new Error('CASHIER_REPORT_INVALID_SALE_TOTAL');
    }
    accumulator.returned_units = safeAdd(
      accumulator.returned_units,
      quantity,
      'returned_units',
    );
    accumulator.net_units = safeAdd(accumulator.net_units, -quantity, 'net_units');
    addProductRow(accumulator, line, -quantity, -revenue);
    addCostContribution(accumulator, line, quantity, revenue, -1);
  }
}

function finalizeCurrency(
  accumulator: CurrencyAccumulator,
  topProductsLimit: number,
): CashierSalesCurrencyReport {
  const profitStatus: CashierReportProfitStatus =
    accumulator.cost_unknown_net_units === 0
      ? 'available'
      : accumulator.cost_known_net_units > 0
        ? 'partial'
        : 'unavailable';
  const averageTicketMinor =
    accumulator.sale_count > 0
      ? Math.round(accumulator.gross_revenue_minor / accumulator.sale_count)
      : 0;
  const topProducts = [...accumulator.products.values()]
    .filter(item => item.net_units > 0 || item.net_revenue_minor > 0)
    .sort(
      (left, right) =>
        right.net_revenue_minor - left.net_revenue_minor ||
        right.net_units - left.net_units ||
        left.product_name.localeCompare(right.product_name),
    )
    .slice(0, topProductsLimit);

  return {
    currency_code: accumulator.currency_code,
    currency_fraction_digits: accumulator.currency_fraction_digits,
    sale_count: accumulator.sale_count,
    active_sale_count: accumulator.active_sale_count,
    voided_sale_count: accumulator.voided_sale_count,
    return_count: accumulator.return_count,
    gross_revenue_minor: accumulator.gross_revenue_minor,
    refunds_minor: accumulator.refunds_minor,
    net_revenue_minor: accumulator.net_revenue_minor,
    sold_units: accumulator.sold_units,
    returned_units: accumulator.returned_units,
    net_units: accumulator.net_units,
    average_ticket_minor: averageTicketMinor,
    profit_status: profitStatus,
    ...(profitStatus !== 'unavailable'
      ? { gross_profit_minor: accumulator.profit_minor }
      : {}),
    cost_known_net_units: accumulator.cost_known_net_units,
    cost_unknown_net_units: accumulator.cost_unknown_net_units,
    top_products: topProducts,
  };
}

/**
 * Build cashier reporting from immutable local sale evidence using operation
 * time. A sale contributes when sold; each return/void contributes when that
 * compensation was executed. This keeps historical ranges stable and makes a
 * return-only day visible without rewriting the original sale date.
 */
export function buildCashierSalesReport(
  sales: CashierSaleSnapshot[],
  options: CashierSalesReportOptions = {},
): CashierSalesReport {
  const from = validInstant(options.from, 'from');
  const to = validInstant(options.to, 'to');
  if (from && to && from.getTime() >= to.getTime()) {
    throw new Error('CASHIER_REPORT_INVALID_RANGE');
  }
  const topProductsLimit = Math.max(
    1,
    Math.min(50, Math.trunc(options.topProductsLimit || 5)),
  );
  const currencies = new Map<string, CurrencyAccumulator>();
  let includedSales = 0;

  for (const sale of sales) {
    validateSale(sale);
    const saleInRange = applySale(currencies, sale, from, to);
    if (saleInRange) includedSales += 1;
    for (const snapshot of sale.returns || []) {
      applyReturn(currencies, sale, snapshot, from, to);
    }
    applyVoid(currencies, sale, saleInRange, from, to);
  }

  return {
    ...(from ? { from: from.toISOString() } : {}),
    ...(to ? { to: to.toISOString() } : {}),
    sale_count: includedSales,
    by_currency: [...currencies.values()]
      .map(item => finalizeCurrency(item, topProductsLimit))
      .sort((left, right) => left.currency_code.localeCompare(right.currency_code)),
  };
}
