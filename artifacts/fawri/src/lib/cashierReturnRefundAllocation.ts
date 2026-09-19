import type { CashierSaleSnapshot } from './cashierLocalContracts';

export const CASHIER_RETURN_REFUND_ALLOCATION_VERSION = 2 as const;

function nonNegativeSafeInteger(value: unknown, field: string): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new Error(`CASHIER_RETURN_REFUND_INVALID_${field.toUpperCase()}`);
  }
  return parsed;
}

function positiveSafeInteger(value: unknown, field: string): number {
  const parsed = nonNegativeSafeInteger(value, field);
  if (parsed === 0) {
    throw new Error(`CASHIER_RETURN_REFUND_INVALID_${field.toUpperCase()}`);
  }
  return parsed;
}

function safeAdd(left: number, right: number, field: string): number {
  const result = left + right;
  if (!Number.isSafeInteger(result) || result < 0) {
    throw new Error(`CASHIER_RETURN_REFUND_OVERFLOW_${field.toUpperCase()}`);
  }
  return result;
}

function safeMultiply(left: number, right: number, field: string): number {
  const result = left * right;
  if (!Number.isSafeInteger(result) || result < 0) {
    throw new Error(`CASHIER_RETURN_REFUND_OVERFLOW_${field.toUpperCase()}`);
  }
  return result;
}

/**
 * Allocates the amount actually charged after sale-level manual discount back
 * across immutable sale lines. Allocation intentionally mirrors cashier report
 * attribution so the sum of all line revenues equals sale.total_minor exactly.
 */
export function cashierAdjustedLineRevenueById(
  sale: CashierSaleSnapshot,
): Map<string, number> {
  if (!Array.isArray(sale.lines) || sale.lines.length === 0) {
    throw new Error('CASHIER_RETURN_REFUND_INVALID_SALE_LINES');
  }

  let preManualDiscountTotal = 0;
  const lineTotals = sale.lines.map((line) => {
    const quantity = positiveSafeInteger(line.quantity, 'line_quantity');
    const unitPrice = nonNegativeSafeInteger(
      line.effective_unit_price_minor,
      'effective_unit_price',
    );
    const lineTotal = nonNegativeSafeInteger(line.line_total_minor, 'line_total');
    if (lineTotal !== safeMultiply(unitPrice, quantity, 'line_total')) {
      throw new Error('CASHIER_RETURN_REFUND_INVALID_LINE_TOTAL');
    }
    preManualDiscountTotal = safeAdd(
      preManualDiscountTotal,
      lineTotal,
      'sale_total',
    );
    return lineTotal;
  });

  const saleTotal = nonNegativeSafeInteger(sale.total_minor, 'sale_total');
  if (saleTotal > preManualDiscountTotal) {
    throw new Error('CASHIER_RETURN_REFUND_INVALID_SALE_TOTAL');
  }

  let remainingBase = BigInt(preManualDiscountTotal);
  let remainingDiscount = BigInt(preManualDiscountTotal - saleTotal);
  const adjusted = new Map<string, number>();

  sale.lines.forEach((line, index) => {
    const lineBase = BigInt(lineTotals[index]);
    const allocatedDiscount =
      remainingDiscount === 0n
        ? 0n
        : index === sale.lines.length - 1
          ? remainingDiscount
          : remainingBase > 0n
            ? (remainingDiscount * lineBase) / remainingBase
            : 0n;
    if (allocatedDiscount < 0n || allocatedDiscount > lineBase) {
      throw new Error('CASHIER_RETURN_REFUND_INVALID_ALLOCATION');
    }
    const charged = Number(lineBase - allocatedDiscount);
    if (!Number.isSafeInteger(charged) || charged < 0) {
      throw new Error('CASHIER_RETURN_REFUND_OVERFLOW_ALLOCATION');
    }
    adjusted.set(line.line_id, charged);
    remainingBase -= lineBase;
    remainingDiscount -= allocatedDiscount;
  });

  if (remainingBase !== 0n || remainingDiscount !== 0n) {
    throw new Error('CASHIER_RETURN_REFUND_INVALID_ALLOCATION');
  }
  return adjusted;
}

export function cashierRemainingRefundMinor(
  sale: CashierSaleSnapshot,
): number {
  const saleTotal = nonNegativeSafeInteger(sale.total_minor, 'sale_total');
  let refunded = 0;
  for (const snapshot of sale.returns || []) {
    refunded = safeAdd(
      refunded,
      nonNegativeSafeInteger(snapshot.refund_total_minor, 'refund_total'),
      'refund_total',
    );
  }
  return Math.max(0, saleTotal - refunded);
}

/**
 * Returns the exact refundable amount for the next quantity of one sale line.
 * Cumulative floor allocation makes repeated partial returns deterministic and
 * guarantees that returning the whole sale refunds exactly sale.total_minor.
 */
export function cashierReturnRefundMinor(input: {
  sale: CashierSaleSnapshot;
  lineId: string;
  alreadyReturnedQuantity: number;
  returnQuantity: number;
}): number {
  const line = input.sale.lines.find((candidate) => candidate.line_id === input.lineId);
  if (!line) throw new Error('CASHIER_RETURN_REFUND_LINE_NOT_FOUND');

  const lineQuantity = positiveSafeInteger(line.quantity, 'line_quantity');
  const alreadyReturned = nonNegativeSafeInteger(
    input.alreadyReturnedQuantity,
    'already_returned_quantity',
  );
  const returnQuantity = nonNegativeSafeInteger(
    input.returnQuantity,
    'return_quantity',
  );
  const returnedAfter = safeAdd(
    alreadyReturned,
    returnQuantity,
    'returned_quantity',
  );
  if (returnedAfter > lineQuantity) {
    throw new Error('CASHIER_RETURN_REFUND_QUANTITY_EXCEEDS_SOLD');
  }
  if (returnQuantity === 0) return 0;

  const chargedLineRevenue = cashierAdjustedLineRevenueById(input.sale).get(
    input.lineId,
  );
  if (chargedLineRevenue === undefined) {
    throw new Error('CASHIER_RETURN_REFUND_LINE_NOT_FOUND');
  }

  const quantityBig = BigInt(lineQuantity);
  const revenueBig = BigInt(chargedLineRevenue);
  const before =
    (revenueBig * BigInt(alreadyReturned)) / quantityBig;
  const after =
    (revenueBig * BigInt(returnedAfter)) / quantityBig;
  const refund = Number(after - before);
  if (!Number.isSafeInteger(refund) || refund < 0) {
    throw new Error('CASHIER_RETURN_REFUND_OVERFLOW_ALLOCATION');
  }
  return refund;
}
