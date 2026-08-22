import assert from "node:assert/strict";
import test from "node:test";

import {
  commercePromotionLifecycleAt,
  resolveEffectiveCatalogPrice,
  resolveEffectiveDeliveryFee,
  type CommercePromotionRule,
} from "../src/services/commercePromotionRuntime";

function promotion(
  patch: Partial<CommercePromotionRule> = {},
): CommercePromotionRule {
  return {
    id: "promo-1",
    merchant_id: "merchant-1",
    name: "September offer",
    scope: "catalog_item",
    effect: "percentage_off",
    product_id: "product-1",
    percentage_bps: 2000,
    currency_code: "IQD",
    starts_at: "2026-09-01T06:00:00.000Z",
    ends_at: "2026-09-08T06:00:00.000Z",
    schedule_timezone: "Asia/Baghdad",
    priority: 0,
    enabled: true,
    version: 1,
    ...patch,
  };
}

test("promotion lifecycle is derived from time and does not rewrite base price", () => {
  const rule = promotion();
  assert.equal(
    commercePromotionLifecycleAt(rule, "2026-08-31T23:59:59.000Z"),
    "scheduled",
  );
  assert.equal(
    commercePromotionLifecycleAt(rule, "2026-09-01T06:00:00.000Z"),
    "active",
  );
  assert.equal(
    commercePromotionLifecycleAt(rule, "2026-09-08T06:00:00.000Z"),
    "expired",
  );
});

test("active percentage discount resolves effective price while preserving base", () => {
  const result = resolveEffectiveCatalogPrice({
    merchantId: "merchant-1",
    productId: "product-1",
    baseAmountMinor: 50_000,
    currencyCode: "IQD",
    promotions: [promotion()],
    at: "2026-09-04T12:00:00.000Z",
  });
  assert.equal(result.base_amount_minor, 50_000);
  assert.equal(result.effective_amount_minor, 40_000);
  assert.equal(result.discount_amount_minor, 10_000);
  assert.equal(result.promotion_applied, true);
  assert.equal(result.promotion_id, "promo-1");
});

test("expired promotion automatically falls back to original price", () => {
  const result = resolveEffectiveCatalogPrice({
    merchantId: "merchant-1",
    productId: "product-1",
    baseAmountMinor: 50_000,
    currencyCode: "IQD",
    promotions: [promotion()],
    at: "2026-09-09T00:00:00.000Z",
  });
  assert.equal(result.effective_amount_minor, 50_000);
  assert.equal(result.discount_amount_minor, 0);
  assert.equal(result.promotion_applied, false);
});

test("fixed amount and fixed price promotions never mutate base amount", () => {
  const amountOff = resolveEffectiveCatalogPrice({
    merchantId: "merchant-1",
    productId: "product-1",
    baseAmountMinor: 50_000,
    currencyCode: "IQD",
    promotions: [
      promotion({
        effect: "fixed_amount_off",
        percentage_bps: undefined,
        amount_minor: 7_500,
      }),
    ],
    at: "2026-09-04T12:00:00.000Z",
  });
  assert.equal(amountOff.base_amount_minor, 50_000);
  assert.equal(amountOff.effective_amount_minor, 42_500);

  const fixedPrice = resolveEffectiveCatalogPrice({
    merchantId: "merchant-1",
    productId: "product-1",
    baseAmountMinor: 50_000,
    currencyCode: "IQD",
    promotions: [
      promotion({
        effect: "fixed_price",
        percentage_bps: undefined,
        amount_minor: 35_000,
      }),
    ],
    at: "2026-09-04T12:00:00.000Z",
  });
  assert.equal(fixedPrice.base_amount_minor, 50_000);
  assert.equal(fixedPrice.effective_amount_minor, 35_000);
});

test("variant-specific promotion wins over product-level promotion", () => {
  const result = resolveEffectiveCatalogPrice({
    merchantId: "merchant-1",
    productId: "product-1",
    variantId: "variant-red",
    baseAmountMinor: 50_000,
    currencyCode: "IQD",
    promotions: [
      promotion({ id: "product-promo", percentage_bps: 1000, priority: 100 }),
      promotion({
        id: "variant-promo",
        variant_id: "variant-red",
        percentage_bps: 2000,
        priority: 0,
      }),
    ],
    at: "2026-09-04T12:00:00.000Z",
  });
  assert.equal(result.promotion_id, "variant-promo");
  assert.equal(result.effective_amount_minor, 40_000);
});

test("same-precedence overlapping promotions fail closed", () => {
  assert.throws(
    () =>
      resolveEffectiveCatalogPrice({
        merchantId: "merchant-1",
        productId: "product-1",
        baseAmountMinor: 50_000,
        currencyCode: "IQD",
        promotions: [
          promotion({ id: "promo-a" }),
          promotion({ id: "promo-b" }),
        ],
        at: "2026-09-04T12:00:00.000Z",
      }),
    (error: unknown) =>
      (error as { code?: string })?.code === "COMMERCE_PROMOTION_CONFLICT",
  );
});

test("scheduled free-delivery promotion supports optional minimum subtotal", () => {
  const delivery = promotion({
    id: "delivery-promo",
    scope: "delivery",
    effect: "free_delivery",
    product_id: undefined,
    variant_id: undefined,
    percentage_bps: undefined,
    amount_minor: undefined,
    minimum_subtotal_minor: 30_000,
  });

  const below = resolveEffectiveDeliveryFee({
    merchantId: "merchant-1",
    baseFeeMinor: 5_000,
    subtotalMinor: 20_000,
    currencyCode: "IQD",
    promotions: [delivery],
    at: "2026-09-04T12:00:00.000Z",
  });
  assert.equal(below.effective_fee_minor, 5_000);
  assert.equal(below.promotion_applied, false);

  const eligible = resolveEffectiveDeliveryFee({
    merchantId: "merchant-1",
    baseFeeMinor: 5_000,
    subtotalMinor: 30_000,
    currencyCode: "IQD",
    promotions: [delivery],
    at: "2026-09-04T12:00:00.000Z",
  });
  assert.equal(eligible.effective_fee_minor, 0);
  assert.equal(eligible.promotion_applied, true);
  assert.equal(eligible.promotion_id, "delivery-promo");
});

test("promotion currency must match merchant pricing currency", () => {
  const result = resolveEffectiveCatalogPrice({
    merchantId: "merchant-1",
    productId: "product-1",
    baseAmountMinor: 50_000,
    currencyCode: "USD",
    promotions: [promotion({ currency_code: "IQD" })],
    at: "2026-09-04T12:00:00.000Z",
  });
  assert.equal(result.effective_amount_minor, 50_000);
  assert.equal(result.promotion_applied, false);
});
