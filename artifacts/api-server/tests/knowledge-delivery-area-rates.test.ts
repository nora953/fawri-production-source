// @ts-nocheck
import assert from "node:assert/strict";
import test from "node:test";
import { PostgresOperationalFactResolver } from "../src/services/knowledge/postgresOperationalFactResolver.js";
import { KnowledgeRuntimeGateError } from "../src/services/knowledge/postgresKnowledgeRuntime.js";
import { normalizeDeliveryAreaName } from "../src/services/deliveryPricing.js";

class FakeSql {
  queries = [];
  constructor(handler) { this.handler = handler; }
  async query(sql, values = []) {
    this.queries.push({ sql, values: [...values] });
    return { rows: await this.handler(sql, values) };
  }
}

function settings(overrides = {}) {
  return {
    merchant_id: "merchant-a",
    store_name: "Store A",
    merchant_status: "approved",
    account_status: "approved",
    merchant_currency_code: "IQD",
    settings_version: 4,
    auto_reply_enabled: true,
    delivery_enabled: true,
    delivery_pricing_mode: "per_area",
    delivery_fee_iqd: 0,
    free_delivery_threshold_iqd: 50000,
    delivery_areas: [],
    delivery_estimated_days_min: 1,
    delivery_estimated_days_max: 3,
    cash_on_delivery_enabled: true,
    electronic_payment_enabled: false,
    payment_methods: ["cash_on_delivery"],
    ...overrides,
  };
}

function rate(overrides = {}) {
  return {
    id: "rate-mansour",
    merchant_id: "merchant-a",
    area_name: "المنصور",
    normalized_area_name: normalizeDeliveryAreaName("المنصور"),
    fee_iqd: 5000,
    enabled: true,
    ...overrides,
  };
}

function freeDeliveryPromotion() {
  const now = Date.now();
  return {
    id: "promo-free-delivery",
    merchant_id: "merchant-a",
    name: "توصيل مجاني اليوم",
    scope: "delivery",
    effect: "free_delivery",
    product_id: null,
    variant_id: null,
    percentage_bps: null,
    amount_minor: null,
    currency_code: "IQD",
    minimum_subtotal_minor: null,
    starts_at: new Date(now - 60_000),
    ends_at: new Date(now + 60_000),
    schedule_timezone: "Asia/Baghdad",
    priority: 0,
    enabled: true,
    version: 1,
  };
}

test("Knowledge asks for area in per-area mode and resolves explicit tenant rate", async () => {
  const sql = new FakeSql(async (query) => {
    if (query.includes("JOIN merchant_settings")) return [settings()];
    if (query.includes("FROM merchant_delivery_area_rates")) return [rate()];
    if (query.includes("FROM commerce_promotions")) return [];
    return [];
  });
  const resolver = new PostgresOperationalFactResolver(sql);
  const generic = await resolver.resolve({ merchantId: "merchant-a", customerText: "شكد التوصيل؟", language: "ar" });
  assert.equal(generic?.factType, "delivery_policy");
  assert.match(generic?.answerText || "", /منطقتك|منطقة|المنطقة/);

  const explicit = await resolver.resolve({ merchantId: "merchant-a", customerText: "شكد التوصيل للمنصور؟", language: "ar" });
  assert.equal(explicit?.recordId, "rate-mansour");
  assert.match(explicit?.answerText || "", /5,000/);
  assert.match(explicit?.answerText || "", /50,000/);
});

test("Knowledge formats delivery minor units using the merchant currency", async () => {
  const sql = new FakeSql(async (query) => {
    if (query.includes("JOIN merchant_settings")) {
      return [settings({
        merchant_currency_code: "USD",
        free_delivery_threshold_iqd: 5_000,
      })];
    }
    if (query.includes("FROM merchant_delivery_area_rates")) {
      return [rate({ fee_iqd: 1_999 })];
    }
    if (query.includes("FROM commerce_promotions")) return [];
    return [];
  });
  const resolver = new PostgresOperationalFactResolver(sql);
  const result = await resolver.resolve({
    merchantId: "merchant-a",
    customerText: "delivery to المنصور",
    language: "en",
  });

  assert.equal(result?.factType, "delivery_policy");
  assert.match(result?.answerText || "", /19\.99 USD/);
  assert.match(result?.answerText || "", /50\.00 USD/);
  assert.equal((result?.answerText || "").includes("IQD"), false);
});

test("active free-delivery promotion is applied to the delivery fact Fawri discloses", async () => {
  const sql = new FakeSql(async (query) => {
    if (query.includes("JOIN merchant_settings")) return [
      settings({ free_delivery_threshold_iqd: null }),
    ];
    if (query.includes("FROM merchant_delivery_area_rates")) return [rate()];
    if (query.includes("FROM commerce_promotions")) return [freeDeliveryPromotion()];
    return [];
  });
  const resolver = new PostgresOperationalFactResolver(sql);
  const result = await resolver.resolve({
    merchantId: "merchant-a",
    customerText: "شكد التوصيل للمنصور؟",
    language: "ar",
  });

  assert.equal(result?.factType, "delivery_policy");
  assert.equal(result?.recordId, "promo-free-delivery");
  assert.match(result?.answerText || "", /مجاني/);
  assert.equal((result?.answerText || "").includes("5,000"), false);
});

test("Knowledge rejects a cross-tenant area row returned by the SQL adapter", async () => {
  const sql = new FakeSql(async (query) => {
    if (query.includes("JOIN merchant_settings")) return [settings()];
    if (query.includes("FROM merchant_delivery_area_rates")) return [rate({ merchant_id: "merchant-b" })];
    if (query.includes("FROM commerce_promotions")) return [];
    return [];
  });
  const resolver = new PostgresOperationalFactResolver(sql);
  await assert.rejects(
    () => resolver.resolve({ merchantId: "merchant-a", customerText: "التوصيل للمنصور", language: "ar" }),
    (error) => error instanceof KnowledgeRuntimeGateError && error.code === "KNOWLEDGE_TENANT_VIOLATION",
  );
});
