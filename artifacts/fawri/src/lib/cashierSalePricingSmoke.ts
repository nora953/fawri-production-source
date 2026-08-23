import {
  CashierSalePricingError,
  resolveCashierSalePricing,
  type CashierSalePricingCatalogItem,
} from './cashierSalePricingRuntime';
import type { CashierPromotionRule } from './cashierPromotionRuntime';

export type CashierSalePricingSmokeReport = {
  ok: true;
  base_before_schedule: number;
  discounted_during_schedule: number;
  full_subtotal_minimum_applied: true;
  promotion_snapshot_captured: true;
  invalid_time_failed_closed: true;
  mixed_currency_failed_closed: true;
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`Cashier sale pricing smoke failed: ${message}`);
}

const merchantId = 'merchant-1';
const catalog: CashierSalePricingCatalogItem[] = [
  {
    product_id: 'product-1',
    product_name: 'Product One',
    currency_code: 'IQD',
    currency_fraction_digits: 0,
    base_unit_price_minor: 10_000,
    catalog_version: 7,
  },
];

const scheduledPromotion: CashierPromotionRule = {
  id: 'scheduled-10pct',
  merchant_id: merchantId,
  name: 'Scheduled 10%',
  scope: 'catalog_item',
  effect: 'percentage_off',
  product_id: 'product-1',
  percentage_bps: 1_000,
  currency_code: 'IQD',
  starts_at: '2026-08-23T12:00:00.000Z',
  ends_at: '2026-08-24T12:00:00.000Z',
  schedule_timezone: 'Asia/Baghdad',
  priority: 1,
  enabled: true,
  version: 3,
};

export function runCashierSalePricingSmoke(): CashierSalePricingSmokeReport {
  const before = resolveCashierSalePricing({
    merchantId,
    catalog,
    promotions: [scheduledPromotion],
    lines: [{ product_id: 'product-1', quantity: 1 }],
    at: '2026-08-23T11:59:59.000Z',
  });
  assert(before.total_minor === 10_000, 'future promotion must not alter the sale price');
  assert(!before.lines[0].promotion, 'future promotion must not be snapshotted');

  const during = resolveCashierSalePricing({
    merchantId,
    catalog,
    promotions: [scheduledPromotion],
    lines: [{ product_id: 'product-1', quantity: 1 }],
    at: '2026-08-23T12:00:01.000Z',
  });
  assert(during.total_minor === 9_000, 'active 10% promotion must price at 9000');
  assert(
    during.lines[0].promotion?.promotion_id === scheduledPromotion.id &&
      during.lines[0].promotion?.promotion_version === 3 &&
      during.lines[0].promotion?.percentage_bps === 1_000,
    'applied promotion evidence must be captured in the sale line snapshot',
  );

  const thresholdPromotion: CashierPromotionRule = {
    ...scheduledPromotion,
    id: 'threshold-fixed',
    name: 'Threshold fixed discount',
    effect: 'fixed_amount_off',
    percentage_bps: undefined,
    amount_minor: 1_000,
    minimum_subtotal_minor: 20_000,
  };
  const threshold = resolveCashierSalePricing({
    merchantId,
    catalog,
    promotions: [thresholdPromotion],
    lines: [{ product_id: 'product-1', quantity: 2 }],
    at: '2026-08-23T12:00:01.000Z',
  });
  assert(threshold.subtotal_minor === 20_000, 'base subtotal must be calculated before discounts');
  assert(threshold.total_minor === 18_000, 'full sale subtotal must satisfy the promotion threshold');

  let invalidTimeFailedClosed = false;
  try {
    resolveCashierSalePricing({
      merchantId,
      catalog,
      promotions: [],
      lines: [{ product_id: 'product-1', quantity: 1 }],
      at: 'not-a-date',
    });
  } catch (error) {
    invalidTimeFailedClosed =
      error instanceof CashierSalePricingError &&
      error.code === 'CASHIER_SALE_PRICING_TIME_INVALID';
  }
  assert(invalidTimeFailedClosed, 'invalid sale time must fail closed with a stable error code');

  let mixedCurrencyFailedClosed = false;
  try {
    resolveCashierSalePricing({
      merchantId,
      catalog: [
        ...catalog,
        {
          product_id: 'product-usd',
          product_name: 'USD Product',
          currency_code: 'USD',
          currency_fraction_digits: 2,
          base_unit_price_minor: 500,
          catalog_version: 1,
        },
      ],
      promotions: [],
      lines: [
        { product_id: 'product-1', quantity: 1 },
        { product_id: 'product-usd', quantity: 1 },
      ],
      at: '2026-08-23T12:00:01.000Z',
    });
  } catch (error) {
    mixedCurrencyFailedClosed =
      error instanceof CashierSalePricingError &&
      error.code === 'CASHIER_SALE_PRICING_CURRENCY_MISMATCH';
  }
  assert(mixedCurrencyFailedClosed, 'mixed-currency sale must fail closed');

  return {
    ok: true,
    base_before_schedule: before.total_minor,
    discounted_during_schedule: during.total_minor,
    full_subtotal_minimum_applied: true,
    promotion_snapshot_captured: true,
    invalid_time_failed_closed: true,
    mixed_currency_failed_closed: true,
  };
}
