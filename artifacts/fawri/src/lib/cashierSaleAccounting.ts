export type CashierSaleAccountingLine = {
  line_id: string;
  quantity: number;
  effective_unit_price_minor: number;
  line_total_minor?: number;
};

export type CashierSaleLineAllocation = {
  line_id: string;
  quantity: number;
  basis_total_minor: number;
  allocated_net_minor: number;
};

export class CashierSaleAccountingError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'CashierSaleAccountingError';
    this.code = code;
  }
}

const MAX_SAFE_BIGINT = BigInt(Number.MAX_SAFE_INTEGER);

function nonNegativeSafeInteger(value: unknown, field: string): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new CashierSaleAccountingError(
      'CASHIER_SALE_ACCOUNTING_INVALID',
      `${field} must be a non-negative safe integer`,
    );
  }
  return parsed;
}

function positiveSafeInteger(value: unknown, field: string): number {
  const parsed = nonNegativeSafeInteger(value, field);
  if (parsed === 0) {
    throw new CashierSaleAccountingError(
      'CASHIER_SALE_ACCOUNTING_INVALID',
      `${field} must be a positive safe integer`,
    );
  }
  return parsed;
}

function safeNumber(value: bigint, field: string): number {
  if (value < 0n || value > MAX_SAFE_BIGINT) {
    throw new CashierSaleAccountingError(
      'CASHIER_SALE_ACCOUNTING_OVERFLOW',
      `${field} exceeds the safe integer range`,
    );
  }
  return Number(value);
}

/**
 * Allocate the final amount actually paid across immutable sale lines.
 *
 * Each line basis is its post-promotion effective price. A bill-level manual
 * discount is therefore distributed proportionally across those bases. The
 * cumulative-floor method makes rounding deterministic and guarantees that
 * all line allocations sum exactly to saleTotalMinor.
 */
export function allocateCashierSaleNetByLine(
  lines: CashierSaleAccountingLine[],
  saleTotalMinor: unknown,
): CashierSaleLineAllocation[] {
  if (!Array.isArray(lines) || lines.length === 0) {
    throw new CashierSaleAccountingError(
      'CASHIER_SALE_ACCOUNTING_INVALID',
      'sale lines are required',
    );
  }
  const total = nonNegativeSafeInteger(saleTotalMinor, 'sale total');
  const seen = new Set<string>();
  const normalized = lines.map((line) => {
    const lineId = String(line.line_id || '').trim();
    if (!lineId || seen.has(lineId)) {
      throw new CashierSaleAccountingError(
        'CASHIER_SALE_ACCOUNTING_INVALID',
        'sale line identity is missing or duplicated',
      );
    }
    seen.add(lineId);
    const quantity = positiveSafeInteger(line.quantity, 'line quantity');
    const effective = nonNegativeSafeInteger(
      line.effective_unit_price_minor,
      'effective unit price',
    );
    const basis = BigInt(effective) * BigInt(quantity);
    const basisNumber = safeNumber(basis, 'line basis');
    if (line.line_total_minor !== undefined) {
      const stated = nonNegativeSafeInteger(line.line_total_minor, 'line total');
      if (stated !== basisNumber) {
        throw new CashierSaleAccountingError(
          'CASHIER_SALE_ACCOUNTING_INVALID',
          'sale line total does not match effective unit price and quantity',
        );
      }
    }
    return { line_id: lineId, quantity, basis };
  });

  const totalBasis = normalized.reduce((sum, line) => sum + line.basis, 0n);
  safeNumber(totalBasis, 'sale basis');
  const totalBig = BigInt(total);
  if (totalBig > totalBasis) {
    throw new CashierSaleAccountingError(
      'CASHIER_SALE_ACCOUNTING_INVALID',
      'sale total exceeds the post-promotion line basis',
    );
  }
  if (totalBasis === 0n) {
    if (totalBig !== 0n) {
      throw new CashierSaleAccountingError(
        'CASHIER_SALE_ACCOUNTING_INVALID',
        'a zero-value line basis cannot carry a positive sale total',
      );
    }
    return normalized.map((line) => ({
      line_id: line.line_id,
      quantity: line.quantity,
      basis_total_minor: 0,
      allocated_net_minor: 0,
    }));
  }

  let cumulativeBasis = 0n;
  let previouslyAllocated = 0n;
  const allocations = normalized.map((line) => {
    cumulativeBasis += line.basis;
    const cumulativeAllocated = (totalBig * cumulativeBasis) / totalBasis;
    const allocated = cumulativeAllocated - previouslyAllocated;
    previouslyAllocated = cumulativeAllocated;
    return {
      line_id: line.line_id,
      quantity: line.quantity,
      basis_total_minor: safeNumber(line.basis, 'line basis'),
      allocated_net_minor: safeNumber(allocated, 'line allocation'),
    };
  });

  if (previouslyAllocated !== totalBig) {
    throw new CashierSaleAccountingError(
      'CASHIER_SALE_ACCOUNTING_INVALID',
      'sale allocation did not reconcile to the sale total',
    );
  }
  return allocations;
}

/**
 * Calculate the exact refund for the next returned quantity of one sale line.
 * Cumulative proportional allocation guarantees repeated partial returns add
 * up to the line's exact paid amount, including integer-rounding remainders.
 */
export function cashierRefundForAllocatedLine(input: {
  allocatedNetMinor: unknown;
  soldQuantity: unknown;
  returnedBeforeQuantity: unknown;
  returnQuantity: unknown;
}): number {
  const allocated = nonNegativeSafeInteger(
    input.allocatedNetMinor,
    'allocated line total',
  );
  const sold = positiveSafeInteger(input.soldQuantity, 'sold quantity');
  const returnedBefore = nonNegativeSafeInteger(
    input.returnedBeforeQuantity,
    'returned quantity',
  );
  const returning = positiveSafeInteger(input.returnQuantity, 'return quantity');
  const returnedAfter = returnedBefore + returning;
  if (!Number.isSafeInteger(returnedAfter) || returnedAfter > sold) {
    throw new CashierSaleAccountingError(
      'CASHIER_SALE_ACCOUNTING_RETURN_EXCEEDS_SOLD',
      'return quantity exceeds the remaining sold quantity',
    );
  }

  const allocatedBig = BigInt(allocated);
  const soldBig = BigInt(sold);
  const before = (allocatedBig * BigInt(returnedBefore)) / soldBig;
  const after = (allocatedBig * BigInt(returnedAfter)) / soldBig;
  return safeNumber(after - before, 'return refund');
}
