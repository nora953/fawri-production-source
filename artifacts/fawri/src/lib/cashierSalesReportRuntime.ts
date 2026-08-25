import type {
  CashierSaleLineSnapshot,
  CashierSaleSnapshot,
} from './cashierLocalContracts';

type CostAwareSaleLine = CashierSaleLineSnapshot & {
  /** Optional sale-time cost snapshot. Added by the catalog/cashier cost cutover. */
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

function validInstant(value: string | Date | undefined, label: string): Date | undefined {
  if (value === undefined) return undefined;
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) {
    throw new Error(`CASHIER_REPORT_INVALID_${label.toUpperCase()}`);
  }
  return date;
}

function saleInstant(sale: CashierSaleSnapshot): Date {
  const date = new Date(sale.occurred_at);
  if (!Number.isFinite(date.getTime())) {
    throw new Error('CASHIER_REPORT_INVALID_SALE_TIME');
  }
  return date;
}

function lineKey(line: Pick<CashierSaleLineSnapshot, 'product_id' | 'variant_id'>): string {
  return `${line.product_id}\u0000${line.variant_id || ''}`;
}

function returnedQuantity(sale: CashierSaleSnapshot, lineId: string): number {
  return (sale.returns || []).reduce(
    (total, snapshot) =>
      total +
      snapshot.lines
        .filter(line => line.original_line_id === lineId)
        .reduce(
          (sum, line) => sum + safeNonNegativeInteger(line.quantity, 'return_quantity'),
          0,
        ),
    0,
  );
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

function safeAdd(current: number, delta: number, label: string): number {
  const next = current + delta;
  if (!Number.isSafeInteger(next)) {
    throw new Error(`CASHIER_REPORT_OVERFLOW_${label.toUpperCase()}`);
  }
  return next;
}

function addProductRow(
  accumulator: CurrencyAccumulator,
  line: CashierSaleLineSnapshot,
  netUnits: number,
  netRevenueMinor: number,
): void {
  if (netUnits <= 0 && netRevenueMinor <= 0) return;
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
  row.net_units = safeAdd(row.net_units, netUnits, 'product_units');
  row.net_revenue_minor = safeAdd(
    row.net_revenue_minor,
    netRevenueMinor,
    'product_revenue',
  );
  accumulator.products.set(key, row);
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
    accumulator.active_sale_count > 0
      ? Math.round(accumulator.net_revenue_minor / accumulator.active_sale_count)
      : 0;
  const topProducts = [...accumulator.products.values()]
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
 * Build cashier sales reporting strictly from immutable local sale evidence.
 *
 * - Currencies are never merged.
 * - Returns reduce revenue/units using original sale-time pricing.
 * - A void makes the sale net-zero.
 * - Profit is reported only for net units that have a sale-time cost snapshot.
 *   Missing costs are surfaced as partial/unavailable instead of invented as zero.
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
    const occurredAt = saleInstant(sale);
    if (from && occurredAt.getTime() < from.getTime()) continue;
    if (to && occurredAt.getTime() >= to.getTime()) continue;

    const key = reportCurrencyKey(sale);
    const accumulator = currencies.get(key) || createCurrencyAccumulator(sale);
    currencies.set(key, accumulator);
    includedSales += 1;
    accumulator.sale_count += 1;

    const saleTotal = safeNonNegativeInteger(sale.total_minor, 'sale_total');
    accumulator.gross_revenue_minor = safeAdd(
      accumulator.gross_revenue_minor,
      saleTotal,
      'gross_revenue',
    );

    const isVoided = sale.status === 'voided' || Boolean(sale.void);
    const returnRefund = (sale.returns || []).reduce(
      (sum, snapshot) =>
        safeAdd(
          sum,
          safeNonNegativeInteger(snapshot.refund_total_minor, 'return_refund'),
          'return_refund',
        ),
      0,
    );
    const voidRefund = sale.void
      ? safeNonNegativeInteger(sale.void.refund_total_minor, 'void_refund')
      : 0;
    const refund = isVoided ? Math.max(saleTotal, voidRefund) : returnRefund;
    if (refund > saleTotal) {
      throw new Error('CASHIER_REPORT_REFUND_EXCEEDS_SALE');
    }

    accumulator.refunds_minor = safeAdd(
      accumulator.refunds_minor,
      refund,
      'refunds',
    );
    accumulator.net_revenue_minor = safeAdd(
      accumulator.net_revenue_minor,
      saleTotal - refund,
      'net_revenue',
    );
    accumulator.return_count += (sale.returns || []).length;
    if (isVoided) accumulator.voided_sale_count += 1;
    else accumulator.active_sale_count += 1;

    for (const rawLine of sale.lines) {
      const line = rawLine as CostAwareSaleLine;
      const sold = safeNonNegativeInteger(line.quantity, 'sold_quantity');
      const returned = isVoided ? sold : returnedQuantity(sale, line.line_id);
      if (returned > sold) {
        throw new Error('CASHIER_REPORT_RETURN_EXCEEDS_SALE');
      }
      const netUnits = sold - returned;
      const unitRevenue = safeNonNegativeInteger(
        line.effective_unit_price_minor,
        'effective_price',
      );
      const netRevenue = unitRevenue * netUnits;
      if (!Number.isSafeInteger(netRevenue)) {
        throw new Error('CASHIER_REPORT_OVERFLOW_LINE_REVENUE');
      }

      accumulator.sold_units = safeAdd(accumulator.sold_units, sold, 'sold_units');
      accumulator.returned_units = safeAdd(
        accumulator.returned_units,
        returned,
        'returned_units',
      );
      accumulator.net_units = safeAdd(accumulator.net_units, netUnits, 'net_units');
      addProductRow(accumulator, line, netUnits, netRevenue);

      if (netUnits === 0) continue;
      if (line.unit_cost_minor === undefined || line.unit_cost_minor === null) {
        accumulator.cost_unknown_net_units = safeAdd(
          accumulator.cost_unknown_net_units,
          netUnits,
          'unknown_cost_units',
        );
        continue;
      }
      const unitCost = safeNonNegativeInteger(line.unit_cost_minor, 'unit_cost');
      accumulator.cost_known_net_units = safeAdd(
        accumulator.cost_known_net_units,
        netUnits,
        'known_cost_units',
      );
      const profit = (unitRevenue - unitCost) * netUnits;
      if (!Number.isSafeInteger(profit)) {
        throw new Error('CASHIER_REPORT_OVERFLOW_PROFIT');
      }
      accumulator.profit_minor = safeAdd(
        accumulator.profit_minor,
        profit,
        'profit',
      );
    }
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
