import type {
  CashierReturnSnapshot,
  CashierSaleSnapshot,
  CashierSaleVoidSnapshot,
} from './cashierLocalContracts';

export type CashierHistoryEvent = {
  event_id: string;
  kind: 'sale' | 'return' | 'void';
  sale_id: string;
  operation_id: string;
  occurred_at: string;
  currency_code: string;
  currency_fraction_digits: number;
  amount_minor: number;
  sale_status: CashierSaleSnapshot['status'];
};

export type CashierHistoryCurrencySummary = {
  currency_code: string;
  currency_fraction_digits: number;
  gross_sales_minor: number;
  returned_minor: number;
  voided_minor: number;
  net_sales_minor: number;
  sale_count: number;
  return_count: number;
  void_count: number;
};

export class CashierHistoryError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'CashierHistoryError';
    this.code = code;
  }
}

function safeNonNegative(value: unknown, label: string): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new CashierHistoryError(
      'CASHIER_HISTORY_AMOUNT_INVALID',
      `${label} must be a non-negative safe integer`,
    );
  }
  return parsed;
}

function validInstant(value: unknown, label: string): string {
  const text = String(value ?? '').trim();
  const time = new Date(text).getTime();
  if (!text || !Number.isFinite(time)) {
    throw new CashierHistoryError(
      'CASHIER_HISTORY_TIME_INVALID',
      `${label} is invalid`,
    );
  }
  return new Date(time).toISOString();
}

function requiredId(value: unknown, label: string): string {
  const normalized = String(value ?? '').normalize('NFKC').trim();
  if (!normalized || normalized.length > 250) {
    throw new CashierHistoryError(
      'CASHIER_HISTORY_ID_INVALID',
      `${label} is invalid`,
    );
  }
  return normalized;
}

function returnEvent(
  sale: CashierSaleSnapshot,
  snapshot: CashierReturnSnapshot,
): CashierHistoryEvent {
  if (
    snapshot.currency_code !== sale.currency_code ||
    snapshot.currency_fraction_digits !== sale.currency_fraction_digits
  ) {
    throw new CashierHistoryError(
      'CASHIER_HISTORY_CURRENCY_MISMATCH',
      'return currency does not match the original sale',
    );
  }
  return {
    event_id: requiredId(snapshot.return_id, 'return id'),
    kind: 'return',
    sale_id: requiredId(sale.sale_id, 'sale id'),
    operation_id: requiredId(snapshot.operation_id, 'return operation id'),
    occurred_at: validInstant(snapshot.occurred_at, 'return time'),
    currency_code: sale.currency_code,
    currency_fraction_digits: sale.currency_fraction_digits,
    amount_minor: -safeNonNegative(snapshot.refund_total_minor, 'return refund'),
    sale_status: sale.status,
  };
}

function voidEvent(
  sale: CashierSaleSnapshot,
  snapshot: CashierSaleVoidSnapshot,
): CashierHistoryEvent {
  if (
    snapshot.currency_code !== sale.currency_code ||
    snapshot.currency_fraction_digits !== sale.currency_fraction_digits
  ) {
    throw new CashierHistoryError(
      'CASHIER_HISTORY_CURRENCY_MISMATCH',
      'void currency does not match the original sale',
    );
  }
  return {
    event_id: `void:${requiredId(snapshot.operation_id, 'void operation id')}`,
    kind: 'void',
    sale_id: requiredId(sale.sale_id, 'sale id'),
    operation_id: snapshot.operation_id,
    occurred_at: validInstant(snapshot.occurred_at, 'void time'),
    currency_code: sale.currency_code,
    currency_fraction_digits: sale.currency_fraction_digits,
    amount_minor: -safeNonNegative(snapshot.refund_total_minor, 'void refund'),
    sale_status: sale.status,
  };
}

/**
 * Build an append-only local history view from immutable sale evidence.
 * Money from different currencies is never merged into one total.
 */
export function buildCashierLocalHistory(
  sales: CashierSaleSnapshot[],
): CashierHistoryEvent[] {
  const events: CashierHistoryEvent[] = [];
  const eventIds = new Set<string>();

  for (const sale of sales) {
    const saleId = requiredId(sale.sale_id, 'sale id');
    const saleEvent: CashierHistoryEvent = {
      event_id: saleId,
      kind: 'sale',
      sale_id: saleId,
      operation_id: requiredId(sale.operation_id, 'sale operation id'),
      occurred_at: validInstant(sale.occurred_at, 'sale time'),
      currency_code: String(sale.currency_code || '').toUpperCase(),
      currency_fraction_digits: Number(sale.currency_fraction_digits),
      amount_minor: safeNonNegative(sale.total_minor, 'sale total'),
      sale_status: sale.status,
    };
    const localEvents = [
      saleEvent,
      ...(sale.returns || []).map(snapshot => returnEvent(sale, snapshot)),
      ...(sale.void ? [voidEvent(sale, sale.void)] : []),
    ];
    for (const event of localEvents) {
      if (eventIds.has(event.event_id)) {
        throw new CashierHistoryError(
          'CASHIER_HISTORY_EVENT_DUPLICATE',
          'history contains a duplicate event id',
        );
      }
      eventIds.add(event.event_id);
      events.push(event);
    }
  }

  return events.sort((left, right) => {
    const byTime = right.occurred_at.localeCompare(left.occurred_at);
    return byTime || right.event_id.localeCompare(left.event_id);
  });
}

export function summarizeCashierLocalHistory(
  events: CashierHistoryEvent[],
): CashierHistoryCurrencySummary[] {
  const summaries = new Map<string, CashierHistoryCurrencySummary>();
  for (const event of events) {
    const key = `${event.currency_code}:${event.currency_fraction_digits}`;
    let summary = summaries.get(key);
    if (!summary) {
      summary = {
        currency_code: event.currency_code,
        currency_fraction_digits: event.currency_fraction_digits,
        gross_sales_minor: 0,
        returned_minor: 0,
        voided_minor: 0,
        net_sales_minor: 0,
        sale_count: 0,
        return_count: 0,
        void_count: 0,
      };
      summaries.set(key, summary);
    }
    if (event.kind === 'sale') {
      summary.gross_sales_minor += event.amount_minor;
      summary.sale_count += 1;
    } else if (event.kind === 'return') {
      summary.returned_minor += Math.abs(event.amount_minor);
      summary.return_count += 1;
    } else {
      summary.voided_minor += Math.abs(event.amount_minor);
      summary.void_count += 1;
    }
    summary.net_sales_minor =
      summary.gross_sales_minor - summary.returned_minor - summary.voided_minor;
    if (
      !Number.isSafeInteger(summary.gross_sales_minor) ||
      !Number.isSafeInteger(summary.returned_minor) ||
      !Number.isSafeInteger(summary.voided_minor) ||
      !Number.isSafeInteger(summary.net_sales_minor)
    ) {
      throw new CashierHistoryError(
        'CASHIER_HISTORY_TOTAL_OVERFLOW',
        'history totals exceed the safe integer range',
      );
    }
  }
  return [...summaries.values()].sort((left, right) =>
    left.currency_code.localeCompare(right.currency_code),
  );
}
