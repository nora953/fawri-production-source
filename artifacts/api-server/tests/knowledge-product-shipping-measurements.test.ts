// @ts-nocheck
import assert from "node:assert/strict";
import test from "node:test";
import { PostgresOperationalFactResolver } from "../src/services/knowledge/postgresOperationalFactResolver.js";
import { KnowledgeRuntimeGateError } from "../src/services/knowledge/postgresKnowledgeRuntime.js";

class FakeSql {
  queries = [];
  constructor(handler) { this.handler = handler; }
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
    name: "حقيبة سفر",
    sku: "BAG-A",
    barcode: "123456789",
    current_price_iqd: 250000,
    quantity: 4,
    low_stock_threshold: 1,
    variant_stock_mode: false,
    weight_g: null,
    length_mm: null,
    width_mm: null,
    height_mm: null,
    version: 3,
    status: "available",
    allow_fawri_reply: true,
    updated_at: "2026-08-10T00:00:00.000Z",
    ...overrides,
  };
}

function variant(id, name, overrides = {}) {
  return {
    id,
    product_id: "product-a",
    merchant_id: "merchant-a",
    external_ref: null,
    name,
    color: null,
    size: name,
    sku: `SKU-${id}`,
    barcode: null,
    quantity: 2,
    price_adjustment_iqd: 0,
    price_override_iqd: null,
    option_signature: `0123456789abcdef-${id}`,
    weight_g: null,
    length_mm: null,
    width_mm: null,
    height_mm: null,
    version: 2,
    updated_at: "2026-08-10T00:00:00.000Z",
    ...overrides,
  };
}

function resolverFor(productRow, variants = []) {
  return new PostgresOperationalFactResolver(new FakeSql(async (query) => {
    if (query.includes("FROM products")) return [productRow];
    if (query.includes("FROM product_variants")) return variants;
    return [];
  }));
}

test("Arabic product weight answer comes from canonical integer measurement", async () => {
  const resolver = resolverFor(product({ weight_g: 1250 }));
  const result = await resolver.resolve({
    merchantId: "merchant-a",
    customerText: "شكد وزن حقيبة سفر؟",
    language: "ar",
  });
  assert.equal(result?.factType, "product_weight");
  assert.equal(result?.recordId, "product-a");
  assert.match(result?.answerText || "", /1\.25/);
  assert.match(result?.answerText || "", /كغم/);
});

test("English dimensions answer uses canonical millimeters rendered as centimeters", async () => {
  const resolver = resolverFor(product({ length_mm: 550, width_mm: 350, height_mm: 220 }));
  const result = await resolver.resolve({
    merchantId: "merchant-a",
    customerText: "What are the dimensions of حقيبة سفر?",
    language: "en",
  });
  assert.equal(result?.factType, "product_dimensions");
  assert.match(result?.answerText || "", /55 × 35 × 22 cm/);
});

test("missing physical data returns truthful unavailable fact instead of falling through", async () => {
  const resolver = resolverFor(product());
  const weight = await resolver.resolve({
    merchantId: "merchant-a",
    customerText: "وزن حقيبة سفر",
    language: "ar",
  });
  const dimensions = await resolver.resolve({
    merchantId: "merchant-a",
    customerText: "أبعاد حقيبة سفر",
    language: "ar",
  });
  assert.equal(weight?.factType, "product_weight");
  assert.match(weight?.answerText || "", /غير متوفرة حاليًا/);
  assert.equal(dimensions?.factType, "product_dimensions");
  assert.match(dimensions?.answerText || "", /غير متوفرة حاليًا/);
});

test("variant override wins independently while missing variant fields inherit product", async () => {
  const productRow = product({
    variant_stock_mode: true,
    weight_g: 2000,
    length_mm: 400,
    width_mm: 300,
    height_mm: 200,
  });
  const variants = [
    variant("small", "صغير", { weight_g: 1500 }),
    variant("large", "كبير", { length_mm: 500, width_mm: 320, height_mm: 210 }),
  ];
  const resolver = resolverFor(productRow, variants);

  const smallWeight = await resolver.resolve({
    merchantId: "merchant-a",
    customerText: "وزن حقيبة سفر صغير",
    language: "ar",
  });
  assert.equal(smallWeight?.recordId, "small");
  assert.match(smallWeight?.answerText || "", /1\.5/);

  const smallDimensions = await resolver.resolve({
    merchantId: "merchant-a",
    customerText: "أبعاد حقيبة سفر صغير",
    language: "ar",
  });
  assert.match(smallDimensions?.answerText || "", /40 × 30 × 20/);

  const largeWeight = await resolver.resolve({
    merchantId: "merchant-a",
    customerText: "وزن حقيبة سفر كبير",
    language: "ar",
  });
  assert.match(largeWeight?.answerText || "", /2/);

  const largeDimensions = await resolver.resolve({
    merchantId: "merchant-a",
    customerText: "أبعاد حقيبة سفر كبير",
    language: "ar",
  });
  assert.match(largeDimensions?.answerText || "", /50 × 32 × 21/);
});

test("unspecified variant fails closed when effective measurements differ", async () => {
  const resolver = resolverFor(
    product({ variant_stock_mode: true, weight_g: 2000 }),
    [variant("small", "صغير", { weight_g: 1500 }), variant("large", "كبير", { weight_g: 2500 })],
  );
  await assert.rejects(
    () => resolver.resolve({
      merchantId: "merchant-a",
      customerText: "وزن حقيبة سفر",
      language: "ar",
    }),
    (error) => error instanceof KnowledgeRuntimeGateError && error.code === "KNOWLEDGE_VARIANT_REQUIRED",
  );
});

test("unspecified variant can answer when every effective measurement is identical", async () => {
  const resolver = resolverFor(
    product({ variant_stock_mode: true, weight_g: 2000 }),
    [variant("small", "صغير"), variant("large", "كبير")],
  );
  const result = await resolver.resolve({
    merchantId: "merchant-a",
    customerText: "weight حقيبة سفر",
    language: "en",
  });
  assert.equal(result?.recordId, "product-a:common-measurement");
  assert.match(result?.answerText || "", /2 kg/);
});

test("Kurdish physical intent is recognized and invalid partial database dimensions fail closed", async () => {
  const ku = resolverFor(product({ weight_g: 900 }));
  const result = await ku.resolve({
    merchantId: "merchant-a",
    customerText: "کێشی حقيبة سفر چەندە؟",
    language: "ku",
  });
  assert.equal(result?.factType, "product_weight");
  assert.match(result?.answerText || "", /0\.9/);

  const corrupt = resolverFor(product({ length_mm: 100 }));
  await assert.rejects(
    () => corrupt.resolve({
      merchantId: "merchant-a",
      customerText: "dimensions حقيبة سفر",
      language: "en",
    }),
    (error) => error instanceof KnowledgeRuntimeGateError && error.code === "KNOWLEDGE_STATE_INVALID",
  );
});
