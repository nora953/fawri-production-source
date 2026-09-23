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
    name: "هاتف ألف",
    sku: "SKU-A",
    barcode: "123456789",
    current_price_iqd: 250000,
    quantity: 4,
    low_stock_threshold: 1,
    variant_stock_mode: false,
    version: 3,
    status: "available",
    allow_fawri_reply: true,
    updated_at: "2026-08-07T20:00:00.000Z",
    merchant_currency_code: "IQD",
    ...overrides,
  };
}

test("product price fact reads only visible tenant PostgreSQL catalog rows", async () => {
  const sql = new FakeSql(async (query) => {
    if (query.includes("FROM products")) return [product()];
    if (query.includes("FROM commerce_promotions")) return [];
    return [];
  });
  const resolver = new PostgresOperationalFactResolver(sql);
  const result = await resolver.resolve({
    merchantId: "merchant-a",
    customerText: "شكد سعر هاتف ألف؟",
    language: "ar",
  });

  assert.equal(result?.factType, "product_price");
  assert.equal(result?.recordId, "product-a");
  assert.match(result?.answerText || "", /250,000/);
  assert.match(sql.queries[0].sql, /merchant_id = \$1/);
  assert.match(sql.queries[0].sql, /deleted_at IS NULL/);
  assert.match(sql.queries[0].sql, /allow_fawri_reply = TRUE/);
  assert.match(sql.queries[0].sql, /status IN \('available', 'low_stock', 'out_of_stock'\)/);
  assert.deepEqual(sql.queries[0].values, ["merchant-a"]);
});

test("catalog row from another merchant is rejected even if SQL adapter returns it", async () => {
  const resolver = new PostgresOperationalFactResolver(
    new FakeSql(async () => [product({ merchant_id: "merchant-b" })]),
  );
  await assert.rejects(
    () => resolver.resolve({
      merchantId: "merchant-a",
      customerText: "سعر هاتف ألف",
      language: "ar",
    }),
    (error) => error instanceof KnowledgeRuntimeGateError && error.code === "KNOWLEDGE_TENANT_VIOLATION",
  );
});

test("variant-stock product requires one explicit tenant-safe variant", async () => {
  const sql = new FakeSql(async (query) => {
    if (query.includes("FROM products")) return [product({ variant_stock_mode: true, quantity: 999 })];
    if (query.includes("FROM product_variants")) return [
      {
        id: "variant-red",
        product_id: "product-a",
        merchant_id: "merchant-a",
        external_ref: null,
        name: "أحمر",
        color: "أحمر",
        size: null,
        sku: "SKU-RED",
        barcode: null,
        quantity: 2,
        price_adjustment_iqd: 10000,
        price_override_iqd: null,
        option_signature: "0123456789abcdef",
        version: 2,
        updated_at: "2026-08-07T20:00:00.000Z",
      },
    ];
    if (query.includes("FROM commerce_promotions")) return [];
    return [];
  });
  const resolver = new PostgresOperationalFactResolver(sql);

  await assert.rejects(
    () => resolver.resolve({
      merchantId: "merchant-a",
      customerText: "سعر هاتف ألف",
      language: "ar",
    }),
    (error) => error instanceof KnowledgeRuntimeGateError && error.code === "KNOWLEDGE_VARIANT_REQUIRED",
  );

  const resolved = await resolver.resolve({
    merchantId: "merchant-a",
    customerText: "سعر هاتف ألف SKU-RED",
    language: "ar",
  });
  assert.equal(resolved?.recordId, "variant-red");
  assert.match(resolved?.answerText || "", /260,000/);
});

test("explicit order id is tenant filtered and returns no customer PII", async () => {
  const sql = new FakeSql(async (query) => query.includes("FROM orders") ? [{
    id: "ord-123",
    merchant_id: "merchant-a",
    status: "confirmed",
    payment_method: "cash_on_delivery",
    payment_status: "cash_on_delivery",
    total_iqd: 72000,
    version: 5,
    updated_at: "2026-08-07T20:00:00.000Z",
    merchant_currency_code: "IQD",
  }] : []);
  const resolver = new PostgresOperationalFactResolver(sql);
  const result = await resolver.resolve({
    merchantId: "merchant-a",
    customerText: "حالة الطلب ord-123",
    language: "ar",
    conversationId: "conversation-a",
    customerExternalId: "customer-a",
  });

  assert.equal(result?.factType, "order_status");
  assert.equal(result?.recordId, "ord-123");
  assert.match(result?.answerText || "", /confirmed/);
  assert.match(result?.answerText || "", /72,000 دينار/);
  assert.match(sql.queries[0].sql, /JOIN merchants m ON m\.id = o\.merchant_id/);
  assert.match(sql.queries[0].sql, /o\.merchant_id = \$1/);
  assert.match(sql.queries[0].sql, /o\.id = \$2/);
  assert.match(sql.queries[0].sql, /o\.conversation_id = \$3/);
  assert.match(sql.queries[0].sql, /o\.customer_external_id = \$4/);
  assert.deepEqual(sql.queries[0].values, [
    "merchant-a",
    "ord-123",
    "conversation-a",
    "customer-a",
  ]);
});

test("order fact formats total using merchant currency minor-unit scale", async () => {
  const sql = new FakeSql(async (query) => query.includes("FROM orders") ? [{
    id: "ord-usd",
    merchant_id: "merchant-a",
    status: "confirmed",
    payment_method: "cash_on_delivery",
    payment_status: "cash_on_delivery",
    total_iqd: 7_299,
    version: 2,
    updated_at: "2026-08-07T20:00:00.000Z",
    merchant_currency_code: "USD",
  }] : []);
  const resolver = new PostgresOperationalFactResolver(sql);
  const result = await resolver.resolve({
    merchantId: "merchant-a",
    customerText: "order status ord-usd",
    language: "en",
    conversationId: "conversation-usd",
    customerExternalId: "customer-usd",
  });

  assert.equal(result?.factType, "order_status");
  assert.equal(result?.recordId, "ord-usd");
  assert.match(result?.answerText || "", /72\.99 USD/);
  assert.equal((result?.answerText || "").includes("IQD"), false);
});

test("order fact requires trusted customer conversation identity before querying", async () => {
  const sql = new FakeSql(async () => {
    throw new Error("database should not be queried without trusted customer identity");
  });
  const resolver = new PostgresOperationalFactResolver(sql);

  assert.equal(
    await resolver.resolve({
      merchantId: "merchant-a",
      customerText: "حالة الطلب ord-123",
      language: "ar",
    }),
    null,
  );
  assert.equal(sql.queries.length, 0);
});

test("order fact remains hidden when the identity-bound query finds no matching customer order", async () => {
  const sql = new FakeSql(async (query) => query.includes("FROM orders") ? [] : []);
  const resolver = new PostgresOperationalFactResolver(sql);

  assert.equal(
    await resolver.resolve({
      merchantId: "merchant-a",
      customerText: "حالة الطلب ord-private",
      language: "ar",
      conversationId: "conversation-other",
      customerExternalId: "customer-other",
    }),
    null,
  );
  assert.deepEqual(sql.queries[0].values, [
    "merchant-a",
    "ord-private",
    "conversation-other",
    "customer-other",
  ]);
});

test("order fact without explicit id and warranty without structured authority fail closed", async () => {
  const sql = new FakeSql(async () => { throw new Error("database should not be queried"); });
  const resolver = new PostgresOperationalFactResolver(sql);
  assert.equal(await resolver.resolve({ merchantId: "merchant-a", customerText: "وين طلبي؟", language: "ar" }), null);
  assert.equal(await resolver.resolve({ merchantId: "merchant-a", customerText: "شنو الضمان؟", language: "ar" }), null);
  assert.equal(sql.queries.length, 0);
});
