import {
  CashierPromotionError,
  resolveCashierEffectiveCatalogPrice,
  resolveCashierEffectiveDeliveryFee,
  type CashierPromotionRule,
} from './cashierPromotionRuntime';

export type CashierPromotionSmokeReport = {
  ok: true;
  percentage_price: number;
  minimum_subtotal_blocked: true;
  variant_specificity_won: true;
  fixed_amount_floor_zero: true;
  fixed_price_non_reduction_ignored: true;
  scheduled_promotion_ignored: true;
  equal_precedence_conflict_failed_closed: true;
  free_delivery_applied: true;
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`Cashier promotion smoke failed: ${message}`);
}

const merchantId = 'merchant-1';
const productId = 'product-1';
const variantId = 'variant-1';
const currencyCode = 'IQD';
const at = '2026-08-23T12:00:00.000Z';

function rule(
  overrides: Partial<CashierPromotionRule> & Pick<CashierPromotionRule, 'id' | 'effect'>,
): CashierPromotionRule {
  return {
    id: overrides.id,
    merchant_id: merchantId,
    name: overrides.name || overrides.id,
    scope: overrides.scope || 'catalog_item',
    effect: overrides.effect,
    product_id:
      overrides.scope === 'delivery' ? undefined : overrides.product_id || productId,
    ...(overrides.variant_id ? { variant_id: overrides.variant_id } : {}),
    ...(overrides.percentage_bps !== undefined
      ? { percentage_bps: overrides.percentage_bps }
      : {}),
    ...(overrides.amount_minor !== undefined
      ? { amount_minor: overrides.amount_minor }
      : {}),
    currency_code: overrides.currency_code || currencyCode,
    ...(overrides.minimum_subtotal_minor !== undefined
      ? { minimum_subtotal_minor: overrides.minimum_subtotal_minor }
      : {}),
    starts_at: overrides.starts_at || '2026-08-23T00:00:00.000Z',
    ends_at: overrides.ends_at || '2026-08-24T00:00:00.000Z',
    schedule_timezone: overrides.schedule_timezone || 'Asia/Baghdad',
    priority: overrides.priority ?? 0,
    enabled: overrides.enabled ?? true,
    version: overrides.version ?? 1,
  };
}

export function runCashierPromotionSmoke(): CashierPromotionSmokeReport {
  const percentage = resolveCashierEffectiveCatalogPrice({
    merchantId,
    productId,
    baseAmountMinor: 10_000,
    currencyCode,
    promotions: [rule({ id: 'p10', effect: 'percentage_off', percentage_bps: 1_000 })],
    at,
  });
  assert(percentage.effective_amount_minor === 9_000, '10% price must resolve to 9000');

  const minimumBlocked = resolveCashierEffectiveCatalogPrice({
    merchantId,
    productId,
    baseAmountMinor: 10_000,
    subtotalMinor: 19_999,
    currencyCode,
    promotions: [
      rule({
        id: 'min',
        effect: 'fixed_amount_off',
        amount_minor: 1_000,
        minimum_subtotal_minor: 20_000,
      }),
    ],
    at,
  });
  assert(!minimumBlocked.promotion_applied, 'minimum subtotal must fail closed below threshold');

  const specificity = resolveCashierEffectiveCatalogPrice({
    merchantId,
    productId,
    variantId,
    baseAmountMinor: 10_000,
    currencyCode,
    promotions: [
      rule({ id: 'product-high-priority', effect: 'fixed_price', amount_minor: 7_000, priority: 100 }),
      rule({
        id: 'variant-low-priority',
        effect: 'fixed_price',
        amount_minor: 8_000,
        variant_id: variantId,
        priority: 1,
      }),
    ],
    at,
  });
  assert(
    specificity.promotion_id === 'variant-low-priority' &&
      specificity.effective_amount_minor === 8_000,
    'variant specificity must outrank product priority',
  );

  const floorZero = resolveCashierEffectiveCatalogPrice({
    merchantId,
    productId,
    baseAmountMinor: 5_000,
    currencyCode,
    promotions: [
      rule({ id: 'floor', effect: 'fixed_amount_off', amount_minor: 7_000 }),
    ],
    at,
  });
  assert(floorZero.effective_amount_minor === 0, 'fixed amount discount must floor at zero');

  const nonReduction = resolveCashierEffectiveCatalogPrice({
    merchantId,
    productId,
    baseAmountMinor: 5_000,
    currencyCode,
    promotions: [rule({ id: 'too-high', effect: 'fixed_price', amount_minor: 6_000 })],
    at,
  });
  assert(!nonReduction.promotion_applied, 'fixed price that raises price must be ignored');

  const scheduled = resolveCashierEffectiveCatalogPrice({
    merchantId,
    productId,
    baseAmountMinor: 5_000,
    currencyCode,
    promotions: [
      rule({
        id: 'future',
        effect: 'fixed_price',
        amount_minor: 4_000,
        starts_at: '2026-08-24T00:00:00.000Z',
        ends_at: '2026-08-25T00:00:00.000Z',
      }),
    ],
    at,
  });
  assert(!scheduled.promotion_applied, 'scheduled promotion must not apply early');

  let conflictFailedClosed = false;
  try {
    resolveCashierEffectiveCatalogPrice({
      merchantId,
      productId,
      baseAmountMinor: 10_000,
      currencyCode,
      promotions: [
        rule({ id: 'conflict-a', effect: 'fixed_price', amount_minor: 8_000, priority: 10 }),
        rule({ id: 'conflict-b', effect: 'fixed_price', amount_minor: 7_000, priority: 10 }),
      ],
      at,
    });
  } catch (error) {
    conflictFailedClosed =
      error instanceof CashierPromotionError && error.code === 'CASHIER_PROMOTION_CONFLICT';
  }
  assert(conflictFailedClosed, 'equal-precedence conflict must fail closed');

  const delivery = resolveCashierEffectiveDeliveryFee({
    merchantId,
    baseFeeMinor: 2_000,
    subtotalMinor: 25_000,
    currencyCode,
    promotions: [
      rule({
        id: 'delivery-free',
        scope: 'delivery',
        effect: 'free_delivery',
        minimum_subtotal_minor: 20_000,
      }),
    ],
    at,
  });
  assert(
    delivery.promotion_applied && delivery.effective_fee_minor === 0,
    'eligible free delivery must resolve to zero',
  );

  return {
    ok: true,
    percentage_price: percentage.effective_amount_minor,
    minimum_subtotal_blocked: true,
    variant_specificity_won: true,
    fixed_amount_floor_zero: true,
    fixed_price_non_reduction_ignored: true,
    scheduled_promotion_ignored: true,
    equal_precedence_conflict_failed_closed: true,
    free_delivery_applied: true,
  };
}
