import assert from "node:assert/strict";
import test from "node:test";

import { resolveCommerceDeliveryQuote } from "../src/services/commerceDeliveryPricing";
import type { CommercePromotionRule } from "../src/services/commercePromotionRuntime";
import type { DeliveryPricingPolicy } from "../src/services/deliveryPricing";

const policy: DeliveryPricingPolicy = {
  merchant_id: "merchant-1",
  settings_version: 3,
  enabled: true,
  pricing_mode: "flat",
  flat_fee_iqd: 5_000,
  free_delivery_threshold_iqd: 50_000,
  estimated_days_min: 1,
  estimated_days_max: 3,
  areas: [],
  area_rates: [],
};

const freeDeliveryPromotion: CommercePromotionRule = {
  id: "promo-delivery",
  merchant_id: "merchant-1",
  name: "Weekend free delivery",
  scope: "delivery",
  effect: "free_delivery",
  currency_code: "IQD",
  minimum_subtotal_minor: 30_000,
  starts_at: "2026-09-01T00:00:00.000Z",
  ends_at: "2026-09-08T00:00:00.000Z",
  schedule_timezone: "Asia/Baghdad",
  priority: 0,
  enabled: true,
  version: 1,
};

test("scheduled promotion makes remaining delivery fee free inside its window", () => {
  const quote = resolveCommerceDeliveryQuote({
    policy,
    subtotal_iqd: 30_000,
    currency_code: "IQD",
    promotions: [freeDeliveryPromotion],
    at: "2026-09-04T12:00:00.000Z",
  });
  assert.equal(quote.pre_promotion_fee_iqd, 5_000);
  assert.equal(quote.effective_fee_iqd, 0);
  assert.equal(quote.free_delivery_applied, true);
  assert.equal(quote.total_iqd, 30_000);
  assert.equal(quote.promotion_applied, true);
  assert.equal(quote.promotion_id, "promo-delivery");
});

test("expired delivery promotion automatically restores normal delivery fee", () => {
  const quote = resolveCommerceDeliveryQuote({
    policy,
    subtotal_iqd: 30_000,
    currency_code: "IQD",
    promotions: [freeDeliveryPromotion],
    at: "2026-09-09T00:00:00.000Z",
  });
  assert.equal(quote.effective_fee_iqd, 5_000);
  assert.equal(quote.total_iqd, 35_000);
  assert.equal(quote.promotion_applied, false);
});

test("permanent free-delivery threshold wins without false campaign attribution", () => {
  const quote = resolveCommerceDeliveryQuote({
    policy,
    subtotal_iqd: 50_000,
    currency_code: "IQD",
    promotions: [freeDeliveryPromotion],
    at: "2026-09-04T12:00:00.000Z",
  });
  assert.equal(quote.free_delivery_applied, true);
  assert.equal(quote.effective_fee_iqd, 0);
  assert.equal(quote.pre_promotion_fee_iqd, 0);
  assert.equal(quote.promotion_applied, false);
});
