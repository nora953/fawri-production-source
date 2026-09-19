import assert from "node:assert/strict";
import test from "node:test";

import { PostgresOperationalFactResolver } from "../src/services/knowledge/postgresOperationalFactResolver";
import type { KnowledgeSqlExecutor } from "../src/services/knowledge/postgresKnowledgeRuntime";

function productRow(quantity: number, currency = "IQD", currentPrice = 15000) {
  return {
    id: "prd-shirt",
    merchant_id: "merchant-a",
    external_ref: null,
    code: null,
    name: "قميص",
    sku: null,
    barcode: null,
    current_price_iqd: currentPrice,
    quantity,
    low_stock_threshold: 2,
    variant_stock_mode: false,
    weight_g: null,
    length_mm: null,
    width_mm: null,
    height_mm: null,
    metadata: {},
    version: 1,
    status: quantity > 0 ? "available" : "out_of_stock",
    allow_fawri_reply: true,
    updated_at: new Date(),
    merchant_currency_code: currency,
  };
}

function serviceRow() {
  return {
    id: "svc-facial",
    merchant_id: "merchant-a",
    external_ref: null,
    code: null,
    name: "تنظيف بشرة",
    sku: null,
    barcode: null,
    current_price_iqd: 25000,
    quantity: 0,
    low_stock_threshold: 0,
    variant_stock_mode: false,
    weight_g: null,
    length_mm: null,
    width_mm: null,
    height_mm: null,
    metadata: {
      fawri_catalog_v2: {
        version: 1,
        item_type: "service",
        track_inventory: false,
        service_details: {
          duration_minutes: 60,
          buffer_minutes: 10,
          booking_required: true,
          price_type: "from",
          location_mode: "merchant",
        },
      },
    },
    version: 1,
    status: "available",
    allow_fawri_reply: true,
    updated_at: new Date(),
    merchant_currency_code: "IQD",
  };
}

function percentagePromotion(params: {
  percentageBps: number;
  startsAt?: Date;
  endsAt?: Date;
}) {
  const now = Date.now();
  return {
    id: "promo-weekend",
    merchant_id: "merchant-a",
    name: "عرض نهاية الأسبوع",
    scope: "catalog_item",
    effect: "percentage_off",
    product_id: "prd-shirt",
    variant_id: null,
    percentage_bps: params.percentageBps,
    amount_minor: null,
    currency_code: "IQD",
    minimum_subtotal_minor: null,
    starts_at: params.startsAt || new Date(now - 60_000),
    ends_at: params.endsAt || new Date(now + 60_000),
    schedule_timezone: "Asia/Baghdad",
    priority: 0,
    enabled: true,
    version: 1,
  };
}

function sqlWithProducts(
  rows: Record<string, unknown>[],
  promotions: Record<string, unknown>[] = [],
  locations: Record<string, unknown>[] = [
    { location_id: "location-main", quantity: 11 },
  ],
): KnowledgeSqlExecutor {
  return {
    async query(sql) {
      if (sql.includes("FROM products")) return { rows };
      if (sql.includes("FROM commerce_promotions")) return { rows: promotions };
      if (sql.includes("FROM merchant_locations")) return { rows: locations };
      throw new Error(`unexpected SQL in test: ${sql}`);
    },
  };
}

test("PostgreSQL stock answer does not expose total inventory", async () => {
  const resolver = new PostgresOperationalFactResolver(sqlWithProducts([productRow(11)]));
  const result = await resolver.resolve({
    merchantId: "merchant-a",
    customerText: "هل قميص متوفر",
    language: "ar",
  });
  assert.equal(result?.answerText, "قميص متوفر حاليًا.");
  assert.equal(result?.answerText.includes("11"), false);
});

test("PostgreSQL stock answer uses location inventory and never exposes partial stock", async () => {
  const enough = new PostgresOperationalFactResolver(
    sqlWithProducts(
      [productRow(999)],
      [],
      [{ location_id: "location-main", quantity: 11 }],
    ),
  );
  const enoughResult = await enough.resolve({
    merchantId: "merchant-a",
    customerText: "اريد 3 قطع قميص هل متوفر",
    language: "ar",
  });
  assert.equal(enoughResult?.answerText, "نعم، 3 من قميص متوفرة حاليًا.");
  assert.equal(enoughResult?.answerText.includes("11"), false);

  const shortage = new PostgresOperationalFactResolver(
    sqlWithProducts(
      [productRow(999)],
      [],
      [{ location_id: "location-main", quantity: 2 }],
    ),
  );
  const shortageResult = await shortage.resolve({
    merchantId: "merchant-a",
    customerText: "اريد 3 قطع قميص هل متوفر",
    language: "ar",
  });
  assert.equal(
    shortageResult?.answerText,
    "لا، الكمية المطلوبة من قميص غير متوفرة حاليًا.",
  );
  assert.equal(shortageResult?.answerText.includes("2"), false);
});

test("multi-location stock question fails closed without routing context", async () => {
  const resolver = new PostgresOperationalFactResolver(
    sqlWithProducts(
      [productRow(999)],
      [],
      [
        { location_id: "location-a", quantity: 20 },
        { location_id: "location-b", quantity: 20 },
      ],
    ),
  );

  await assert.rejects(
    () =>
      resolver.resolve({
        merchantId: "merchant-a",
        customerText: "هل قميص متوفر",
        language: "ar",
      }),
    (error: unknown) =>
      error instanceof Error &&
      "code" in error &&
      error.code === "KNOWLEDGE_LOCATION_CONTEXT_REQUIRED",
  );
});

test("service availability is independent of inventory quantity", async () => {
  const resolver = new PostgresOperationalFactResolver(sqlWithProducts([serviceRow()]));
  const result = await resolver.resolve({
    merchantId: "merchant-a",
    customerText: "هل تنظيف بشرة متوفر",
    language: "ar",
  });
  assert.equal(result?.factType, "service_availability");
  assert.equal(result?.answerText, "تنظيف بشرة متوفر حاليًا.");
});

test("service price wording honors starts-from pricing", async () => {
  const resolver = new PostgresOperationalFactResolver(sqlWithProducts([serviceRow()]));
  const result = await resolver.resolve({
    merchantId: "merchant-a",
    customerText: "شكد سعر تنظيف بشرة",
    language: "ar",
  });
  assert.equal(result?.factType, "service_price");
  assert.equal(result?.answerText, "سعر تنظيف بشرة يبدأ من 25,000 دينار.");
});

test("active catalog promotion is applied to the price Fawri discloses", async () => {
  const resolver = new PostgresOperationalFactResolver(
    sqlWithProducts([productRow(11)], [percentagePromotion({ percentageBps: 1000 })]),
  );
  const result = await resolver.resolve({
    merchantId: "merchant-a",
    customerText: "شكد سعر قميص",
    language: "ar",
  });
  assert.equal(result?.factType, "product_price");
  assert.equal(
    result?.answerText,
    "سعر قميص حاليًا ضمن العرض 13,500 دينار بدل 15,000 دينار.",
  );
  assert.match(String(result?.recordId), /promo-weekend/);
});

test("expired promotion cannot leak a stale discounted price", async () => {
  const now = Date.now();
  const resolver = new PostgresOperationalFactResolver(
    sqlWithProducts(
      [productRow(11)],
      [
        percentagePromotion({
          percentageBps: 1000,
          startsAt: new Date(now - 120_000),
          endsAt: new Date(now - 60_000),
        }),
      ],
    ),
  );
  const result = await resolver.resolve({
    merchantId: "merchant-a",
    customerText: "شكد سعر قميص",
    language: "ar",
  });
  assert.equal(result?.answerText, "سعر قميص هو 15,000 دينار.");
  assert.equal(String(result?.recordId).includes("promotion:"), false);
});

test("Fawri catalog price disclosure follows the merchant currency scale", async () => {
  const resolver = new PostgresOperationalFactResolver(
    sqlWithProducts([productRow(11, "USD", 1_999)]),
  );
  const result = await resolver.resolve({
    merchantId: "merchant-a",
    customerText: "price قميص",
    language: "en",
  });
  assert.equal(result?.factType, "product_price");
  assert.equal(result?.answerText, "قميص is 19.99 USD.");
});
