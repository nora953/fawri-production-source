import assert from "node:assert/strict";
import test from "node:test";

import {
  OnlineOrderPricingError,
  priceOnlineOrderWithTarget,
} from "../src/services/postgresOnlineOrderPricing";
import type { OperationalQueryTarget } from "../src/services/operationalPostgresAuthority";

function fixture(params?: {
  products?: Record<string, unknown>[];
  variants?: Record<string, unknown>[];
  promotions?: Record<string, unknown>[];
}) {
  const target: OperationalQueryTarget = {
    async query<T extends Record<string, unknown>>(sql: string) {
      if (sql.includes("FROM merchants")) {
        return { rows: [{ id: "merchant-a", currency_code: "IQD" }] as T[] };
      }
      if (sql.includes("FROM products")) {
        return {
          rows: (params?.products ?? [{
            id: "product-a",
            merchant_id: "merchant-a",
            name: "قميص",
            current_price_iqd: 10_000,
            variant_stock_mode: false,
            version: 3,
            status: "available",
            metadata: {},
          }]) as T[],
        };
      }
      if (sql.includes("FROM product_variants")) {
        return { rows: (params?.variants ?? []) as T[] };
      }
      if (sql.includes("FROM commerce_promotions")) {
        return { rows: (params?.promotions ?? []) as T[] };
      }
      throw new Error(`unexpected SQL: ${sql}`);
    },
  };
  return target;
}

test("pricing ignores caller prices and resolves canonical catalog totals", async () => {
  const result = await priceOnlineOrderWithTarget(fixture(), {
    merchantId: "merchant-a",
    requestedItems: [
      { product_id: "product-a", quantity: 2 },
      { product_id: "product-a", quantity: 1 },
    ],
    at: "2026-09-19T12:00:00.000Z",
  });

  assert.equal(result.currency_code, "IQD");
  assert.equal(result.lines.length, 1);
  assert.equal(result.lines[0].quantity, 3);
  assert.equal(result.lines[0].unit_price_minor, 10_000);
  assert.equal(result.subtotal_minor, 30_000);
});

test("pricing applies canonical promotion using base order subtotal", async () => {
  const result = await priceOnlineOrderWithTarget(
    fixture({
      promotions: [{
        id: "promo-a",
        merchant_id: "merchant-a",
        name: "خصم",
        scope: "catalog_item",
        effect: "percentage_off",
        product_id: "product-a",
        variant_id: null,
        percentage_bps: 1000,
        amount_minor: null,
        currency_code: "IQD",
        minimum_subtotal_minor: 20_000,
        starts_at: "2026-09-19T00:00:00.000Z",
        ends_at: "2026-09-20T00:00:00.000Z",
        schedule_timezone: "Asia/Baghdad",
        priority: 1,
        enabled: true,
        version: 4,
      }],
    }),
    {
      merchantId: "merchant-a",
      requestedItems: [{ product_id: "product-a", quantity: 2 }],
      at: "2026-09-19T12:00:00.000Z",
    },
  );

  assert.equal(result.base_subtotal_minor, 20_000);
  assert.equal(result.subtotal_minor, 18_000);
  assert.equal(result.lines[0].promotion?.id, "promo-a");
});

test("variant product requires exact canonical variant and price", async () => {
  const result = await priceOnlineOrderWithTarget(
    fixture({
      products: [{
        id: "product-a",
        merchant_id: "merchant-a",
        name: "قميص",
        current_price_iqd: 10_000,
        variant_stock_mode: true,
        version: 3,
        status: "available",
        metadata: {},
      }],
      variants: [{
        id: "variant-red",
        product_id: "product-a",
        merchant_id: "merchant-a",
        name: "أحمر",
        color: "أحمر",
        size: null,
        sku: "RED",
        barcode: null,
        price_adjustment_iqd: 2_000,
        price_override_iqd: null,
        version: 2,
      }],
    }),
    {
      merchantId: "merchant-a",
      requestedItems: [{
        product_id: "product-a",
        variant_id: "variant-red",
        quantity: 1,
      }],
    },
  );

  assert.equal(result.lines[0].unit_price_minor, 12_000);
  assert.equal(result.lines[0].variant_id, "variant-red");
});

test("inventory-untracked items are rejected from this physical fulfillment flow", async () => {
  const target = fixture({
    products: [{
      id: "product-a",
      merchant_id: "merchant-a",
      name: "خدمة",
      current_price_iqd: 10_000,
      variant_stock_mode: false,
      version: 1,
      status: "available",
      metadata: {
        fawri_catalog_v2: {
          version: 1,
          item_type: "service",
          track_inventory: false,
          service_details: {
            buffer_minutes: 0,
            booking_required: true,
            price_type: "fixed",
            location_mode: "merchant",
          },
        },
      },
    }],
  });

  await assert.rejects(
    () => priceOnlineOrderWithTarget(target, {
      merchantId: "merchant-a",
      requestedItems: [{ product_id: "product-a", quantity: 1 }],
    }),
    (error: unknown) =>
      error instanceof OnlineOrderPricingError &&
      error.code === "ONLINE_ORDER_PRICING_INVENTORY_PRODUCT_REQUIRED",
  );
});
