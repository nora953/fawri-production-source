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

function settings() {
  return {
    merchant_id: "merchant-a",
    store_name: "Store A",
    merchant_status: "approved",
    account_status: "approved",
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

test("Knowledge asks for area in per-area mode and resolves explicit tenant rate", async () => {
  const sql = new FakeSql(async (query) => {
    if (query.includes("JOIN merchant_settings")) return [settings()];
    if (query.includes("FROM merchant_delivery_area_rates")) return [rate()];
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

test("Knowledge rejects a cross-tenant area row returned by the SQL adapter", async () => {
  const sql = new FakeSql(async (query) => {
    if (query.includes("JOIN merchant_settings")) return [settings()];
    if (query.includes("FROM merchant_delivery_area_rates")) return [rate({ merchant_id: "merchant-b" })];
    return [];
  });
  const resolver = new PostgresOperationalFactResolver(sql);
  await assert.rejects(
    () => resolver.resolve({ merchantId: "merchant-a", customerText: "التوصيل للمنصور", language: "ar" }),
    (error) => error instanceof KnowledgeRuntimeGateError && error.code === "KNOWLEDGE_TENANT_VIOLATION",
  );
});
