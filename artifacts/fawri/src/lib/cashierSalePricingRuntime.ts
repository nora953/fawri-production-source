import type {
  CashierMoneyContext,
  CashierPromotionSnapshot,
} from './cashierLocalContracts';
import {
  resolveCashierEffectiveCatalogPrice,
  type CashierPromotionRule,
} from './cashierPromotionRuntime';

export type CashierSalePricingCatalogItem = CashierMoneyContext & {
  product_id: string;
  variant_id?: string;
  product_name: string;
  variant_name?: string;
  sku?: string;
  barcode?: string;
  base_unit_price_minor: number;
  catalog_version: number;
};

export type CashierSalePricingLineInput = {
  product_id: string;
  variant_id?: string;
  quantity: number;
};

export type CashierResolvedSalePricingLine = {
  product_id: string;
  variant_id?: string;
  product_name_snapshot: string;
  variant_name_snapshot?: string;
  sku_snapshot?: string;
  barcode_snapshot?: string;
  catalog_version: number;
  quantity: number;
  base_unit_price_minor: number;
  effective_unit_price_minor: number;
  discount_minor: number;
  line_total_minor: number;
  promotion?: CashierPromotionSnapshot;
};

export type CashierResolvedSalePricing = CashierMoneyContext & {
  priced_at: string;
  subtotal_minor: number;
  discount_minor: number;
  total_minor: number;
  lines: CashierResolvedSalePricingLine[];
};

export class CashierSalePricingError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'CashierSalePricingError';
    this.code = code;
  }
}

function requiredIdentifier(value: unknown, label: string): string {
  const normalized = String(value ?? '').normalize('NFKC').trim();
  if (!normalized || normalized.length > 200) {
    throw new CashierSalePricingError(
      'CASHIER_SALE_PRICING_IDENTIFIER_INVALID',
      `${label} is required`,
    );
  }
  return normalized;
}

function nonNegativeSafeInteger(value: unknown, label: string): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new CashierSalePricingError(
      'CASHIER_SALE_PRICING_AMOUNT_INVALID',
      `${label} must be a non-negative safe integer`,
    );
  }
  return parsed;
}

function positiveSafeInteger(value: unknown, label: string): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new CashierSalePricingError(
      'CASHIER_SALE_PRICING_QUANTITY_INVALID',
      `${label} must be a positive safe integer`,
    );
  }
  return parsed;
}

function safeAdd(left: number, right: number, label: string): number {
  const result = left + right;
  if (!Number.isSafeInteger(result) || result < 0) {
    throw new CashierSalePricingError(
      'CASHIER_SALE_PRICING_TOTAL_OVERFLOW',
      `${label} exceeds the safe integer range`,
    );
  }
  return result;
}

function safeMultiply(left: number, right: number, label: string): number {
  const result = left * right;
  if (!Number.isSafeInteger(result) || result < 0) {
    throw new CashierSalePricingError(
      'CASHIER_SALE_PRICING_TOTAL_OVERFLOW',
      `${label} exceeds the safe integer range`,
    );
  }
  return result;
}

function catalogKey(productId: string, variantId?: string): string {
  return `${productId}\u0000${variantId || ''}`;
}

function normalizeCurrency(value: unknown): string {
  const currency = String(value ?? '').trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) {
    throw new CashierSalePricingError(
      'CASHIER_SALE_PRICING_CURRENCY_INVALID',
      'catalog currency is invalid',
    );
  }
  return currency;
}

function promotionSnapshot(
  resolvedPromotionId: string | undefined,
  promotions: CashierPromotionRule[],
): CashierPromotionSnapshot | undefined {
  if (!resolvedPromotionId) return undefined;
  const rule = promotions.find(candidate => candidate.id === resolvedPromotionId);
  if (!rule) {
    throw new CashierSalePricingError(
      'CASHIER_SALE_PRICING_PROMOTION_MISSING',
      'resolved promotion is missing from the local promotion snapshot',
    );
  }
  return {
    promotion_id: rule.id,
    promotion_name: rule.name,
    effect: rule.effect,
    promotion_version: rule.version,
    ...(rule.percentage_bps !== undefined
      ? { percentage_bps: rule.percentage_bps }
      : {}),
    ...(rule.amount_minor !== undefined ? { amount_minor: rule.amount_minor } : {}),
  };
}

/**
 * Resolve an entire cashier sale from base catalog prices at the instant of sale.
 *
 * The full base subtotal is calculated first and supplied to every promotion
 * resolution, so minimum-subtotal promotions cannot depend on stale catalog
 * projections. The returned pricing result is immutable evidence for the sale
 * transaction; callers should snapshot these values into the committed sale.
 */
export function resolveCashierSalePricing(input: {
  merchantId: string;
  catalog: CashierSalePricingCatalogItem[];
  promotions: CashierPromotionRule[];
  lines: CashierSalePricingLineInput[];
  at?: string | Date | number;
}): CashierResolvedSalePricing {
  const merchantId = requiredIdentifier(input.merchantId, 'merchant id');
  if (!Array.isArray(input.lines) || input.lines.length === 0) {
    throw new CashierSalePricingError(
      'CASHIER_SALE_PRICING_LINES_REQUIRED',
      'at least one sale line is required',
    );
  }

  const catalogByKey = new Map<string, CashierSalePricingCatalogItem>();
  for (const rawItem of input.catalog) {
    const productId = requiredIdentifier(rawItem.product_id, 'product id');
    const variantId = rawItem.variant_id
      ? requiredIdentifier(rawItem.variant_id, 'variant id')
      : undefined;
    const key = catalogKey(productId, variantId);
    if (catalogByKey.has(key)) {
      throw new CashierSalePricingError(
        'CASHIER_SALE_PRICING_CATALOG_AMBIGUOUS',
        'local catalog contains duplicate product/variant identity',
      );
    }
    nonNegativeSafeInteger(rawItem.base_unit_price_minor, 'base unit price');
    if (!Number.isInteger(rawItem.catalog_version) || rawItem.catalog_version <= 0) {
      throw new CashierSalePricingError(
        'CASHIER_SALE_PRICING_CATALOG_VERSION_INVALID',
        'catalog version must be a positive integer',
      );
    }
    normalizeCurrency(rawItem.currency_code);
    if (
      !Number.isInteger(rawItem.currency_fraction_digits) ||
      rawItem.currency_fraction_digits < 0 ||
      rawItem.currency_fraction_digits > 6
    ) {
      throw new CashierSalePricingError(
        'CASHIER_SALE_PRICING_CURRENCY_INVALID',
        'currency fraction digits are invalid',
      );
    }
    catalogByKey.set(key, rawItem);
  }

  const prepared = input.lines.map(line => {
    const productId = requiredIdentifier(line.product_id, 'product id');
    const variantId = line.variant_id
      ? requiredIdentifier(line.variant_id, 'variant id')
      : undefined;
    const quantity = positiveSafeInteger(line.quantity, 'quantity');
    const item = catalogByKey.get(catalogKey(productId, variantId));
    if (!item) {
      throw new CashierSalePricingError(
        'CASHIER_SALE_PRICING_ITEM_NOT_FOUND',
        'sale item is not available in the local base catalog',
      );
    }
    return { productId, variantId, quantity, item };
  });

  let currencyCode: string | undefined;
  let fractionDigits: number | undefined;
  let subtotalMinor = 0;
  for (const entry of prepared) {
    const itemCurrency = normalizeCurrency(entry.item.currency_code);
    if (currencyCode === undefined) {
      currencyCode = itemCurrency;
      fractionDigits = entry.item.currency_fraction_digits;
    } else if (
      currencyCode !== itemCurrency ||
      fractionDigits !== entry.item.currency_fraction_digits
    ) {
      throw new CashierSalePricingError(
        'CASHIER_SALE_PRICING_CURRENCY_MISMATCH',
        'all sale lines must use the same currency context',
      );
    }
    subtotalMinor = safeAdd(
      subtotalMinor,
      safeMultiply(
        entry.item.base_unit_price_minor,
        entry.quantity,
        'base line total',
      ),
      'sale subtotal',
    );
  }

  if (currencyCode === undefined || fractionDigits === undefined) {
    throw new CashierSalePricingError(
      'CASHIER_SALE_PRICING_CURRENCY_REQUIRED',
      'sale currency context is unavailable',
    );
  }

  const at = input.at ?? Date.now();
  const pricedAt =
    typeof at === 'number'
      ? new Date(at).toISOString()
      : at instanceof Date
        ? at.toISOString()
        : new Date(at).toISOString();
  if (pricedAt === 'Invalid Date') {
    throw new CashierSalePricingError(
      'CASHIER_SALE_PRICING_TIME_INVALID',
      'sale pricing time is invalid',
    );
  }

  let discountMinor = 0;
  let totalMinor = 0;
  const lines: CashierResolvedSalePricingLine[] = prepared.map(entry => {
    const resolved = resolveCashierEffectiveCatalogPrice({
      merchantId,
      productId: entry.productId,
      ...(entry.variantId ? { variantId: entry.variantId } : {}),
      baseAmountMinor: entry.item.base_unit_price_minor,
      currencyCode,
      subtotalMinor,
      promotions: input.promotions,
      at,
    });
    const baseLineTotal = safeMultiply(
      entry.item.base_unit_price_minor,
      entry.quantity,
      'base line total',
    );
    const effectiveLineTotal = safeMultiply(
      resolved.effective_amount_minor,
      entry.quantity,
      'effective line total',
    );
    const lineDiscount = baseLineTotal - effectiveLineTotal;
    discountMinor = safeAdd(discountMinor, lineDiscount, 'sale discount');
    totalMinor = safeAdd(totalMinor, effectiveLineTotal, 'sale total');

    return {
      product_id: entry.productId,
      ...(entry.variantId ? { variant_id: entry.variantId } : {}),
      product_name_snapshot: entry.item.product_name,
      ...(entry.item.variant_name
        ? { variant_name_snapshot: entry.item.variant_name }
        : {}),
      ...(entry.item.sku ? { sku_snapshot: entry.item.sku } : {}),
      ...(entry.item.barcode ? { barcode_snapshot: entry.item.barcode } : {}),
      catalog_version: entry.item.catalog_version,
      quantity: entry.quantity,
      base_unit_price_minor: entry.item.base_unit_price_minor,
      effective_unit_price_minor: resolved.effective_amount_minor,
      discount_minor: lineDiscount,
      line_total_minor: effectiveLineTotal,
      ...(resolved.promotion_applied
        ? { promotion: promotionSnapshot(resolved.promotion_id, input.promotions) }
        : {}),
    };
  });

  if (subtotalMinor - discountMinor !== totalMinor) {
    throw new CashierSalePricingError(
      'CASHIER_SALE_PRICING_TOTAL_INCONSISTENT',
      'sale pricing totals are inconsistent',
    );
  }

  return {
    currency_code: currencyCode,
    currency_fraction_digits: fractionDigits,
    priced_at: pricedAt,
    subtotal_minor: subtotalMinor,
    discount_minor: discountMinor,
    total_minor: totalMinor,
    lines,
  };
}
