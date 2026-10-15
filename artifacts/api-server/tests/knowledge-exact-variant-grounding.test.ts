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
    name: "هاتف ألف",
    sku: "SKU-A",
    barcode: "123456789",
    current_price_iqd: 250000,
    quantity: 10,
    low_stock_threshold: 1,
    variant_stock_mode: false,
    weight_g: 180,
    length_mm: 150,
    width_mm: 70,
    height_mm: 8,
    metadata: {},
    version: 3,
    status: "available",
    allow_fawri_reply: true,
    updated_at: "2026-09-24T00:00:00.000Z",
    merchant_currency_code: "IQD",
    ...overrides,
  };
}

function variants() {
  return [
    {
      id: "variant-128",
      product_id: "product-a",
      merchant_id: "merchant-a",
      external_ref: null,
      name: "",
      color: "Black",
      size: null,
      sku: "SKU-128",
      barcode: null,
      quantity: 4,
      price_adjustment_iqd: 0,
      price_override_iqd: 260000,
      option_signature: "1111111111111111",
      weight_g: 200,
      length_mm: 150,
      width_mm: 70,
      height_mm: 8,
      version: 2,
      updated_at: "2026-09-24T00:00:00.000Z",
    },
    {
      id: "variant-256",
      product_id: "product-a",
      merchant_id: "merchant-a",
      external_ref: null,
      name: "",
      color: "Black",
      size: null,
      sku: "SKU-256",
      barcode: null,
      quantity: 3,
      price_adjustment_iqd: 0,
      price_override_iqd: 310000,
      option_signature: "2222222222222222",
      weight_g: 230,
      length_mm: 152,
      width_mm: 71,
      height_mm: 8,
      version: 2,
      updated_at: "2026-09-24T00:00:00.000Z",
    },
  ];
}

function optionRows() {
  return [
    {
      merchant_id: "merchant-a",
      product_id: "product-a",
      variant_id: "variant-128",
      option_name: "Storage",
      option_value: "128GB",
      ordinal: 0,
    },
    {
      merchant_id: "merchant-a",
      product_id: "product-a",
      variant_id: "variant-128",
      option_name: "Plug",
      option_value: "EU",
      ordinal: 1,
    },
    {
      merchant_id: "merchant-a",
      product_id: "product-a",
      variant_id: "variant-256",
      option_name: "Storage",
      option_value: "256GB",
      ordinal: 0,
    },
    {
      merchant_id: "merchant-a",
      product_id: "product-a",
      variant_id: "variant-256",
      option_name: "Plug",
      option_value: "US",
      ordinal: 1,
    },
  ];
}

function baseHandler({ variantStockMode = false, locationQuantity = 3 } = {}) {
  return async (query) => {
    if (query.includes("FROM products")) {
      return [product({ variant_stock_mode: variantStockMode })];
    }
    if (query.includes("FROM product_variants")) return variants();
    if (query.includes("FROM catalog_variant_options")) return optionRows();
    if (query.includes("FROM commerce_promotions")) return [];
    if (query.includes("FROM merchant_locations")) {
      return [{ location_id: "location-a", quantity: locationQuantity }];
    }
    return [];
  };
}

test("custom option value resolves the exact variant price even without variant-stock mode", async () => {
  const sql = new FakeSql(baseHandler());
  const resolver = new PostgresOperationalFactResolver(sql);

  const result = await resolver.resolve({
    merchantId: "merchant-a",
    customerText: "price هاتف ألف 256GB",
    language: "en",
  });

  assert.equal(result?.factType, "product_price");
  assert.equal(result?.recordId, "variant-256");
  assert.equal(
    result?.contextRecordId,
    "catalog-variant:product-a:variant-256",
  );
  assert.match(result?.answerText || "", /310,000/);
  assert.match(result?.answerText || "", /256GB/);
  assert.equal(
    sql.queries.some((entry) =>
      entry.sql.includes("FROM catalog_variant_options"),
    ),
    true,
  );
});


test("generic price preserves product-level behavior when variant inventory is not enabled", async () => {
  const sql = new FakeSql(baseHandler({ variantStockMode: false }));
  const resolver = new PostgresOperationalFactResolver(sql);

  const result = await resolver.resolve({
    merchantId: "merchant-a",
    customerText: "price هاتف ألف",
    language: "en",
  });

  assert.equal(result?.recordId, "product-a");
  assert.equal(result?.contextRecordId, "catalog-product:product-a");
  assert.match(result?.answerText || "", /250,000/);
  assert.equal((result?.answerText || "").includes("128GB"), false);
  assert.equal((result?.answerText || "").includes("256GB"), false);
});

test("partial option that matches multiple variants asks for clarification instead of guessing", async () => {
  const sql = new FakeSql(baseHandler());
  const resolver = new PostgresOperationalFactResolver(sql);

  await assert.rejects(
    () =>
      resolver.resolve({
        merchantId: "merchant-a",
        customerText: "price هاتف ألف Black",
        language: "en",
      }),
    (error) =>
      error instanceof KnowledgeRuntimeGateError &&
      error.code === "KNOWLEDGE_VARIANT_AMBIGUOUS",
  );
});

test("custom option resolves variant-specific measurement even when inventory is product-level", async () => {
  const sql = new FakeSql(baseHandler({ variantStockMode: false }));
  const resolver = new PostgresOperationalFactResolver(sql);

  const result = await resolver.resolve({
    merchantId: "merchant-a",
    customerText: "weight هاتف ألف 256GB",
    language: "en",
  });

  assert.equal(result?.factType, "product_weight");
  assert.equal(result?.recordId, "variant-256");
  assert.equal(
    result?.contextRecordId,
    "catalog-variant:product-a:variant-256",
  );
  assert.match(result?.answerText || "", /256GB/);
  assert.match(result?.answerText || "", /0\.23 kg/);
});

test("different variant measurements require the missing option rather than returning product-level measurement", async () => {
  const sql = new FakeSql(baseHandler({ variantStockMode: false }));
  const resolver = new PostgresOperationalFactResolver(sql);

  await assert.rejects(
    () =>
      resolver.resolve({
        merchantId: "merchant-a",
        customerText: "weight هاتف ألف",
        language: "en",
      }),
    (error) =>
      error instanceof KnowledgeRuntimeGateError &&
      error.code === "KNOWLEDGE_VARIANT_REQUIRED",
  );
});

test("custom option selects the exact variant for variant-level location inventory", async () => {
  const sql = new FakeSql(
    baseHandler({ variantStockMode: true, locationQuantity: 3 }),
  );
  const resolver = new PostgresOperationalFactResolver(sql);

  const result = await resolver.resolve({
    merchantId: "merchant-a",
    customerText: "is هاتف ألف 256GB available?",
    language: "en",
  });

  assert.equal(result?.factType, "product_stock");
  assert.equal(
    result?.contextRecordId,
    "catalog-variant:product-a:variant-256",
  );
  assert.match(result?.answerText || "", /256GB/);
  assert.match(result?.answerText || "", /available/i);

  const inventoryQuery = sql.queries.find((entry) =>
    entry.sql.includes("FROM merchant_locations"),
  );
  assert.ok(inventoryQuery);
  assert.equal(inventoryQuery.values[2], "variant-256");
});

test("product-level inventory remains product authority while preserving explicit variant context", async () => {
  const sql = new FakeSql(
    baseHandler({ variantStockMode: false, locationQuantity: 8 }),
  );
  const resolver = new PostgresOperationalFactResolver(sql);

  const result = await resolver.resolve({
    merchantId: "merchant-a",
    customerText: "is هاتف ألف 256GB available?",
    language: "en",
  });

  assert.equal(
    result?.contextRecordId,
    "catalog-variant:product-a:variant-256",
  );
  const inventoryQuery = sql.queries.find((entry) =>
    entry.sql.includes("FROM merchant_locations"),
  );
  assert.ok(inventoryQuery);
  assert.equal(inventoryQuery.values[2], null);
});


test("single-letter clothing size selects the exact variant only as a standalone token", async () => {
  const sizeVariants = [
    {
      id: "variant-s",
      product_id: "shirt-a",
      merchant_id: "merchant-a",
      external_ref: null,
      name: "",
      color: null,
      size: "S",
      sku: "SHIRT-S",
      barcode: null,
      quantity: 5,
      price_adjustment_iqd: 0,
      price_override_iqd: 30000,
      option_signature: "3333333333333333",
      weight_g: null,
      length_mm: null,
      width_mm: null,
      height_mm: null,
      version: 1,
      updated_at: "2026-09-24T00:00:00.000Z",
    },
    {
      id: "variant-m",
      product_id: "shirt-a",
      merchant_id: "merchant-a",
      external_ref: null,
      name: "",
      color: null,
      size: "M",
      sku: "SHIRT-M",
      barcode: null,
      quantity: 5,
      price_adjustment_iqd: 0,
      price_override_iqd: 35000,
      option_signature: "4444444444444444",
      weight_g: null,
      length_mm: null,
      width_mm: null,
      height_mm: null,
      version: 1,
      updated_at: "2026-09-24T00:00:00.000Z",
    },
  ];

  const sql = new FakeSql(async (query) => {
    if (query.includes("FROM products")) {
      return [
        product({
          id: "shirt-a",
          name: "Classic Shirt",
          sku: "SHIRT",
          barcode: "987654321",
          current_price_iqd: 25000,
          variant_stock_mode: false,
          weight_g: null,
          length_mm: null,
          width_mm: null,
          height_mm: null,
        }),
      ];
    }
    if (query.includes("FROM product_variants")) return sizeVariants;
    if (query.includes("FROM catalog_variant_options")) return [];
    if (query.includes("FROM commerce_promotions")) return [];
    return [];
  });
  const resolver = new PostgresOperationalFactResolver(sql);

  const exact = await resolver.resolve({
    merchantId: "merchant-a",
    customerText: "price Classic Shirt M",
    language: "en",
  });

  assert.equal(exact?.recordId, "variant-m");
  assert.equal(exact?.contextRecordId, "catalog-variant:shirt-a:variant-m");
  assert.match(exact?.answerText || "", /35,000/);
  assert.match(exact?.answerText || "", /\(M\)/);

  const notStandalone = await resolver.resolve({
    merchantId: "merchant-a",
    customerText: "price Classic Shirt premium",
    language: "en",
  });

  assert.equal(notStandalone?.recordId, "shirt-a");
  assert.equal(notStandalone?.contextRecordId, "catalog-product:shirt-a");
  assert.match(notStandalone?.answerText || "", /25,000/);
});
