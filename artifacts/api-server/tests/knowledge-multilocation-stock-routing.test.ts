// @ts-nocheck
import assert from "node:assert/strict";
import test from "node:test";
import { PostgresOperationalFactResolver } from "../src/services/knowledge/postgresOperationalFactResolver.js";
import { KnowledgeRuntimeGateError } from "../src/services/knowledge/postgresKnowledgeRuntime.js";

class FakeSql {
  queries = [];
  constructor(handler) {
    this.handler = handler;
  }
  async query(sql, values = []) {
    this.queries.push({ sql, values: [...values] });
    return { rows: await this.handler(sql, values) };
  }
}

function product(overrides = {}) {
  return {
    id: "product-a",
    merchant_id: "merchant-a",
    external_ref: "EXT-A",
    code: "P100",
    name: "Phone Alpha",
    sku: "SKU-A",
    barcode: "123456789",
    current_price_iqd: 250000,
    quantity: 99,
    low_stock_threshold: 1,
    variant_stock_mode: false,
    version: 3,
    status: "available",
    allow_fawri_reply: true,
    updated_at: "2026-09-20T00:00:00.000Z",
    merchant_currency_code: "IQD",
    ...overrides,
  };
}

function routingRows({
  stale = false,
  stalePolicy = "reroute_then_pending",
} = {}) {
  const freshAt = stale
    ? "2026-01-01T00:00:00.000Z"
    : new Date(Date.now() + 60_000).toISOString();

  return async (query) => {
    if (query.includes("FROM products")) {
      return [product()];
    }

    if (query.includes("SELECT ml.id AS location_id")) {
      return [
        { location_id: "loc-a", quantity: 0 },
        { location_id: "loc-b", quantity: 5 },
      ];
    }

    if (query.includes("FROM merchant_settings")) {
      return [{
        merchant_id: "merchant-a",
        version: 1,
        delivery_enabled: true,
        delivery_pricing_mode: "per_area",
        delivery_fee_iqd: 0,
        free_delivery_threshold_iqd: null,
        delivery_areas: ["Zayouna"],
        delivery_estimated_days_min: 1,
        delivery_estimated_days_max: 2,
        inventory_freshness_max_age_minutes: 5,
        inventory_stale_policy: stalePolicy,
      }];
    }

    if (query.includes("FROM merchant_delivery_area_rates")) {
      return [{
        id: "area-zayouna",
        merchant_id: "merchant-a",
        area_name: "Zayouna",
        normalized_area_name: "zayouna",
        fee_iqd: 0,
        enabled: true,
      }];
    }

    if (query.includes("FROM merchant_location_delivery_areas")) {
      return [{
        merchant_id: "merchant-a",
        location_id: "loc-b",
        delivery_area_rate_id: "area-zayouna",
      }];
    }

    if (
      query.includes("FROM merchant_locations") &&
      query.includes("online_fulfillment_enabled")
    ) {
      return [
        {
          id: "loc-a",
          merchant_id: "merchant-a",
          online_fulfillment_enabled: true,
          operational_status: "open",
          accept_online_orders_while_closed: false,
          merchant_priority: 10,
          latitude: null,
          longitude: null,
          inventory_fresh_at: freshAt,
        },
        {
          id: "loc-b",
          merchant_id: "merchant-a",
          online_fulfillment_enabled: true,
          operational_status: "open",
          accept_online_orders_while_closed: false,
          merchant_priority: 20,
          latitude: null,
          longitude: null,
          inventory_fresh_at: freshAt,
        },
      ];
    }

    if (query.includes("FROM location_inventory_levels")) {
      return [
        {
          merchant_id: "merchant-a",
          location_id: "loc-a",
          product_id: "product-a",
          variant_id: null,
          quantity: 0,
        },
        {
          merchant_id: "merchant-a",
          location_id: "loc-b",
          product_id: "product-a",
          variant_id: null,
          quantity: 5,
        },
      ];
    }

    if (query.includes("FROM commerce_promotions")) {
      return [];
    }

    return [];
  };
}

test("multi-location stock availability routes through the customer service area", async () => {
  const sql = new FakeSql(routingRows());
  const resolver = new PostgresOperationalFactResolver(sql);

  const result = await resolver.resolve({
    merchantId: "merchant-a",
    customerText: "Is Phone Alpha available in Zayouna?",
    language: "en",
  });

  assert.equal(result?.factType, "product_stock");
  assert.equal(result?.recordId, "product-a:location:loc-b");
  assert.match(result?.answerText || "", /available/i);
  assert.ok(
    sql.queries.some(({ sql: query }) =>
      query.includes("FROM merchant_location_delivery_areas"),
    ),
  );
  assert.ok(
    sql.queries.some(({ sql: query }) =>
      query.includes("FROM location_inventory_levels"),
    ),
  );
});

test("multi-location stock availability fails closed when routed inventory is stale", async () => {
  const sql = new FakeSql(routingRows({ stale: true }));
  const resolver = new PostgresOperationalFactResolver(sql);

  await assert.rejects(
    () =>
      resolver.resolve({
        merchantId: "merchant-a",
        customerText: "Is Phone Alpha available in Zayouna?",
        language: "en",
      }),
    (error) =>
      error instanceof KnowledgeRuntimeGateError &&
      error.code === "KNOWLEDGE_LOCATION_INVENTORY_STALE",
  );
});


test("multi-location stock may use stale inventory only when merchant explicitly allows it", async () => {
  const sql = new FakeSql(
    routingRows({ stale: true, stalePolicy: "allow_stale" }),
  );
  const resolver = new PostgresOperationalFactResolver(sql);

  const result = await resolver.resolve({
    merchantId: "merchant-a",
    customerText: "Is Phone Alpha available in Zayouna?",
    language: "en",
  });

  assert.equal(result?.factType, "product_stock");
  assert.equal(result?.recordId, "product-a:location:loc-b");
  assert.match(result?.answerText || "", /available/i);
});

test("fresh-only policy keeps stale bot stock replies fail-closed", async () => {
  const sql = new FakeSql(
    routingRows({ stale: true, stalePolicy: "fresh_only" }),
  );
  const resolver = new PostgresOperationalFactResolver(sql);

  await assert.rejects(
    () =>
      resolver.resolve({
        merchantId: "merchant-a",
        customerText: "Is Phone Alpha available in Zayouna?",
        language: "en",
      }),
    (error) =>
      error instanceof KnowledgeRuntimeGateError &&
      error.code === "KNOWLEDGE_LOCATION_INVENTORY_STALE",
  );
});
