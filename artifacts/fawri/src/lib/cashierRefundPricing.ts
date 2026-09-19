import type { CashierSaleSnapshot } from './cashierLocalContracts';

export const CASHIER_REFUND_PRICING_VERSION = 2 as const;

function safeNonNegativeInteger(value: unknown, field: string): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new Error(`CASHIER_REFUND_PRICING_INVALID_${field.toUpperCase()}`);
  }
  return parsed;
}

function safePositiveInteger(value: unknown, field: string): number {
  const parsed = safeNonNegativeInteger(value, field);
  if (parsed === 0) {
    throw new Error(`CASHIER_REFUND_PRICING_INVALID_${field.toUpperCase()}`);
  }
  return parsed;
}

function safeAdd(left: number, right: number, field: string): number {
  const result = left + right;
  if (!Number.isSafeInteger(result) || result < 0) {
    throw new Error(`CASHIER_REFUND_PRICING_OVERFLOW_${field.toUpperCase()}`);
  }
  return result;
}

/**
 * Allocate the sale-level manual discount deterministically across immutable
 * sale lines. The result always sums exactly to sale.total_minor.
 */
export function cashierAdjustedLineRevenueById(
  sale: Pick<CashierSaleSnapshot, 'lines' | 'manual_discount_minor' | 'total_minor'>,
): Map<string, number> {
  let preDiscountTotal = 0;
  for (const line of sale.lines) {
    preDiscountTotal = safeAdd(
      preDiscountTotal,
      safeNonNegativeInteger(line.line_total_minor, 'line_total'),
      'pre_discount_total',
    );
  }
  const manualDiscount = safeNonNegativeInteger(
    sale.manual_discount_minor ?? 0,
    'manual_discount',
  );
  const saleTotal = safeNonNegativeInteger(sale.total_minor, 'sale_total');
  if (
    manualDiscount > preDiscountTotal ||
    preDiscountTotal - manualDiscount !== saleTotal
  ) {
    throw new Error('CASHIER_REFUND_PRICING_INVALID_SALE_TOTAL');
  }

  let remainingBase = BigInt(preDiscountTotal);
  let remainingDiscount = BigInt(manualDiscount);
  const adjusted = new Map<string, number>();

  sale.lines.forEach((line, index) => {
    const lineTotal = safeNonNegativeInteger(line.line_total_minor, 'line_total');
    const lineBase = BigInt(lineTotal);
    const allocatedDiscount =
      remainingDiscount > 0n
        ? index === sale.lines.length - 1
          ? remainingDiscount
          : remainingBase > 0n
            ? (remainingDiscount * lineBase) / remainingBase
            : 0n
        : 0n;
    if (allocatedDiscount < 0n || allocatedDiscount > lineBase) {
      throw new Error('CASHIER_REFUND_PRICING_INVALID_SALE_TOTAL');
    }
    const adjustedRevenue = Number(lineBase - allocatedDiscount);
    if (!Number.isSafeInteger(adjustedRevenue) || adjustedRevenue < 0) {
      throw new Error('CASHIER_REFUND_PRICING_OVERFLOW_LINE_REVENUE');
    }
    adjusted.set(line.line_id, adjustedRevenue);
    remainingBase -= lineBase;
    remainingDiscount -= allocatedDiscount;
  });

  if (remainingBase !== 0n || remainingDiscount !== 0n) {
    throw new Error('CASHIER_REFUND_PRICING_INVALID_SALE_TOTAL');
  }
  return adjusted;
}

/**
 * Return the exact net amount attributable to the next returned units on one
 * sale line. Prefix allocation guarantees repeated partial returns sum exactly
 * to the line's post-manual-discount revenue with no rounding leakage.
 */
export function cashierNetReturnRefundMinor(
  sale: Pick<CashierSaleSnapshot, 'lines' | 'manual_discount_minor' | 'total_minor'>,
  originalLineId: string,
  alreadyReturned: number,
  quantity: number,
): number {
  const line = sale.lines.find(item => item.line_id === originalLineId);
  if (!line) throw new Error('CASHIER_REFUND_PRICING_LINE_NOT_FOUND');
  const soldQuantity = safePositiveInteger(line.quantity, 'sold_quantity');
  const returnedBefore = safeNonNegativeInteger(alreadyReturned, 'returned_before');
  const returnQuantity = safePositiveInteger(quantity, 'return_quantity');
  const returnedAfter = safeAdd(returnedBefore, returnQuantity, 'returned_after');
  if (returnedBefore > soldQuantity || returnedAfter > soldQuantity) {
    throw new Error('CASHIER_REFUND_PRICING_RETURN_EXCEEDS_SALE');
  }

  const adjustedRevenue = cashierAdjustedLineRevenueById(sale).get(originalLineId);
  if (adjustedRevenue === undefined) {
    throw new Error('CASHIER_REFUND_PRICING_LINE_NOT_FOUND');
  }
  const total = BigInt(adjustedRevenue);
  const units = BigInt(soldQuantity);
  const prefixBefore = (total * BigInt(returnedBefore)) / units;
  const prefixAfter = (total * BigInt(returnedAfter)) / units;
  const refund = Number(prefixAfter - prefixBefore);
  if (!Number.isSafeInteger(refund) || refund < 0) {
    throw new Error('CASHIER_REFUND_PRICING_OVERFLOW_REFUND');
  }
  return refund;
}
