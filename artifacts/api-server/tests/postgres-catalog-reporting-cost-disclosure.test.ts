import assert from "node:assert/strict";
import test from "node:test";

import { PostgresOperationalFactResolver } from "../src/services/knowledge/postgresOperationalFactResolver";
import type { KnowledgeSqlExecutor } from "../src/services/knowledge/postgresKnowledgeRuntime";

const product = {
  id: "prd-private-cost",
  merchant_id: "merchant-a",
  external_ref: null,
  code: null,
  name: "قميص",
  sku: null,
  barcode: null,
  current_price_iqd: 15000,
  quantity: 11,
  low_stock_threshold: 2,
  variant_stock_mode: false,
  weight_g: null,
  length_mm: null,
  width_mm: null,
  height_mm: null,
  metadata: {
    fawri_catalog_v2: {
      version: 1,
      item_type: "product",
      track_inventory: true,
      cost_iqd: 6000,
      variant_costs_iqd: {
        "variant-secret": 5500,
      },
    },
  },
  version: 1,
  status: "available",
  allow_fawri_reply: true,
  updated_at: new Date(),
  merchant_currency_code: "IQD",
};

const sql: KnowledgeSqlExecutor = {
  async query(statement) {
    if (statement.includes("FROM products")) return { rows: [product] };
    if (statement.includes("FROM commerce_promotions")) return { rows: [] };
    throw new Error(`unexpected SQL in test: ${statement}`);
  },
};

test("merchant reporting cost never changes or appears in Fawri product price replies", async () => {
  const resolver = new PostgresOperationalFactResolver(sql);
  const result = await resolver.resolve({
    merchantId: "merchant-a",
    customerText: "شكد سعر قميص",
    language: "ar",
  });

  assert.equal(result?.factType, "product_price");
  assert.equal(result?.answerText, "سعر قميص هو 15,000 دينار.");
  assert.equal(result?.answerText.includes("6,000"), false);
  assert.equal(result?.answerText.includes("5,500"), false);
});

test("merchant reporting cost never appears in Fawri stock replies", async () => {
  const resolver = new PostgresOperationalFactResolver(sql);
  const result = await resolver.resolve({
    merchantId: "merchant-a",
    customerText: "هل قميص متوفر",
    language: "ar",
  });

  assert.equal(result?.factType, "product_stock");
  assert.equal(result?.answerText, "قميص متوفر حاليًا.");
  assert.equal(result?.answerText.includes("6000"), false);
  assert.equal(result?.answerText.includes("5500"), false);
});
