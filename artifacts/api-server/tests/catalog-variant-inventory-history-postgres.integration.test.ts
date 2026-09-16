import assert from "node:assert/strict";
import crypto from "node:crypto";
import test from "node:test";

process.env.FAWRI_OPERATIONAL_POSTGRES_AUTHORITY = "required";
process.env.FAWRI_AUTH_SECURITY_SECRET =
  "catalog-variant-history-auth-secret-32-bytes-minimum";

const dbModule = await import("@workspace/db");
const pool = dbModule.pool;
const accounts = await import(
  "../src/services/postgresMerchantAccountAuthority.js"
);
const catalog = await import("../src/services/postgresCatalogAuthority.js");
const cashier = await import(
  "../src/services/postgresCashierSyncAuthority.js"
);

async function raw(sql: string, values: unknown[] = []) {
  return pool.query(sql, values);
}

async function createMerchant(suffix: string) {
  const phone = `077${String(Date.now()).slice(-8)}`;
  const pending = await accounts.upsertPendingMerchantAuthoritative({
    phone,
    passwordHash: `hash-${suffix}`,
    ownerName: `History Owner ${suffix}`,
    storeName: `History Store ${suffix}`,
    activityType: "retail",
    language: "ar",
    requestedPlan: "silver",
  });
  const merchant = await accounts.markMerchantOtpVerifiedAuthoritative(
    pending.account.id,
  );
  assert.ok(merchant?.merchantProfile);
  return merchant.account.id;
}

async function createVariantProduct(params: {
  merchantId: string;
  suffix: string;
  productId: string;
  variantId: string;
  quantity?: number;
}) {
  return catalog.createCatalogProductAuthoritative({
    merchantId: params.merchantId,
    idempotencyKey: `variant-history-create-${params.suffix}`,
    input: {
      id: params.productId,
      name: "Variant inventory history proof",
      price_iqd: 10_000,
      low_stock_threshold: 1,
      status: "available",
      allow_fawri_reply: true,
      variants: [
        {
          id: params.variantId,
          name: "Blue",
          stock_quantity: params.quantity ?? 10,
          options: { Color: "Blue" },
        },
      ],
    },
  });
}

test("variant inventory mutations survive subsequent catalog graph rebuilds", async () => {
  const suffix = crypto.randomUUID().replace(/-/g, "").slice(0, 12);
  const productId = `prd-variant-history-${suffix}`;
  const variantId = `var-variant-history-${suffix}`;
  const merchantId = await createMerchant(suffix);

  const created = await createVariantProduct({
    merchantId,
    suffix,
    productId,
    variantId,
  });
  assert.equal(created.product.version, 1);
  assert.equal(created.product.variants[0]?.id, variantId);
  assert.equal(created.product.variants[0]?.stock_quantity, 10);

  const first = await catalog.adjustCatalogInventoryAuthoritative({
    merchantId,
    productId,
    variantId,
    expectedVersion: created.product.version,
    delta: -2,
    idempotencyKey: `variant-history-adjust-1-${suffix}`,
    reason: "history regression first adjustment",
  });
  assert.equal(first.product.version, 2);
  assert.equal(first.product.variants[0]?.stock_quantity, 8);

  const afterFirst = await raw(
    `SELECT before_quantity, after_quantity, expected_version, resulting_version
       FROM inventory_mutations
      WHERE merchant_id = $1 AND product_id = $2 AND variant_id = $3
      ORDER BY created_at, id`,
    [merchantId, productId, variantId],
  );
  assert.deepEqual(
    afterFirst.rows.map((row) => ({
      before: Number(row.before_quantity),
      after: Number(row.after_quantity),
      expectedVersion: Number(row.expected_version),
      resultingVersion: Number(row.resulting_version),
    })),
    [{ before: 10, after: 8, expectedVersion: 1, resultingVersion: 2 }],
  );

  const second = await catalog.adjustCatalogInventoryAuthoritative({
    merchantId,
    productId,
    variantId,
    expectedVersion: first.product.version,
    delta: -1,
    idempotencyKey: `variant-history-adjust-2-${suffix}`,
    reason: "history regression second adjustment",
  });
  assert.equal(second.product.version, 3);
  assert.equal(second.product.variants[0]?.stock_quantity, 7);

  const history = await raw(
    `SELECT before_quantity, after_quantity, expected_version, resulting_version
       FROM inventory_mutations
      WHERE merchant_id = $1 AND product_id = $2 AND variant_id = $3
      ORDER BY expected_version, id`,
    [merchantId, productId, variantId],
  );

  assert.deepEqual(
    history.rows.map((row) => ({
      before: Number(row.before_quantity),
      after: Number(row.after_quantity),
      expectedVersion: Number(row.expected_version),
      resultingVersion: Number(row.resulting_version),
    })),
    [
      { before: 10, after: 8, expectedVersion: 1, resultingVersion: 2 },
      { before: 8, after: 7, expectedVersion: 2, resultingVersion: 3 },
    ],
    "variant inventory audit history must not be deleted when the product graph is rebuilt",
  );
});

test("cashier sale variant mutation survives a later catalog graph rebuild", async () => {
  const suffix = crypto.randomUUID().replace(/-/g, "").slice(0, 12);
  const productId = `prd-cashier-history-${suffix}`;
  const variantId = `var-cashier-history-${suffix}`;
  const merchantId = await createMerchant(`cashier-${suffix}`);

  const created = await createVariantProduct({
    merchantId,
    suffix: `cashier-${suffix}`,
    productId,
    variantId,
    quantity: 5,
  });
  assert.equal(created.product.version, 1);
  assert.equal(created.product.variants[0]?.stock_quantity, 5);

  const operationId = `cashier-op-${suffix}`;
  const saleId = `cashier-sale-${suffix}`;
  const lineId = `cashier-line-${suffix}`;
  const movementId = `cashier-movement-${suffix}`;
  const localMerchantId = `local-${suffix}`;
  const deviceId = `device-${suffix}`;
  const occurredAt = new Date().toISOString();
  const sale = {
    sale_id: saleId,
    operation_id: operationId,
    local_merchant_id: localMerchantId,
    cloud_merchant_id: merchantId,
    device_id: deviceId,
    device_sequence: 1,
    source: "cashier",
    status: "completed",
    lines: [
      {
        line_id: lineId,
        product_id: productId,
        variant_id: variantId,
        product_name_snapshot: created.product.name,
        variant_name_snapshot: created.product.variants[0]?.name || "Blue",
        catalog_version: created.product.version,
        quantity: 1,
        base_unit_price_minor: 10_000,
        effective_unit_price_minor: 10_000,
        discount_minor: 0,
        line_total_minor: 10_000,
      },
    ],
    subtotal_minor: 10_000,
    discount_minor: 0,
    total_minor: 10_000,
    currency_code: "IQD",
    currency_fraction_digits: 0,
    payment_method: "cash",
    payment_status: "paid",
    occurred_at: occurredAt,
  };
  const movement = {
    movement_id: movementId,
    operation_id: operationId,
    local_merchant_id: localMerchantId,
    cloud_merchant_id: merchantId,
    device_id: deviceId,
    device_sequence: 1,
    product_id: productId,
    variant_id: variantId,
    delta: -1,
    reason: "sale",
    related_sale_id: saleId,
    occurred_at: occurredAt,
  };
  const body = {
    cloud_merchant_id: merchantId,
    local_merchant_id: localMerchantId,
    device_id: deviceId,
    device_sequence: 1,
    operation_id: operationId,
    envelopes: [
      {
        schema_version: 1,
        operation_id: operationId,
        device_id: deviceId,
        device_sequence: 1,
        entity_type: "sale",
        entity_id: saleId,
        operation: "append",
        occurred_at: occurredAt,
        payload: sale,
      },
      {
        schema_version: 1,
        operation_id: operationId,
        device_id: deviceId,
        device_sequence: 1,
        entity_type: "inventory_movement",
        entity_id: movementId,
        operation: "append",
        occurred_at: occurredAt,
        payload: movement,
      },
    ],
  };

  const synced = await cashier.syncCashierSaleAuthoritative({
    merchantId,
    body,
  });
  assert.equal(synced.replayed, false);
  assert.equal(synced.inventory_mutation_count, 1);

  const saleEvidence = await raw(
    `SELECT id, request_hash, before_quantity, after_quantity
       FROM inventory_mutations
      WHERE merchant_id = $1
        AND product_id = $2
        AND variant_id = $3
        AND reason_code = 'cashier_sale_sync'`,
    [merchantId, productId, variantId],
  );
  assert.equal(saleEvidence.rows.length, 1);
  assert.equal(Number(saleEvidence.rows[0].before_quantity), 5);
  assert.equal(Number(saleEvidence.rows[0].after_quantity), 4);
  const requestHash = String(saleEvidence.rows[0].request_hash);
  assert.ok(requestHash.length > 0);

  const afterSale = await catalog.listCatalogProductsAuthoritative(merchantId);
  const soldProduct = afterSale.find((item) => item.id === productId);
  assert.ok(soldProduct);
  assert.equal(soldProduct.version, 2);
  assert.equal(soldProduct.variants[0]?.stock_quantity, 4);

  const rebuilt = await catalog.updateCatalogProductAuthoritative({
    merchantId,
    productId,
    expectedVersion: soldProduct.version,
    input: {
      name: `${soldProduct.name} updated`,
      description: soldProduct.description,
      category: soldProduct.category,
      sku: soldProduct.sku,
      barcode: soldProduct.barcode,
      price_iqd: soldProduct.price_iqd,
      compare_at_price_iqd: soldProduct.compare_at_price_iqd,
      low_stock_threshold: soldProduct.low_stock_threshold,
      status: soldProduct.status,
      allow_fawri_reply: soldProduct.allow_fawri_reply,
      image_refs: soldProduct.image_refs,
      variants: soldProduct.variants.map((variant) => ({
        id: variant.id,
        name: variant.name,
        sku: variant.sku,
        barcode: variant.barcode,
        price_iqd: variant.price_iqd,
        stock_quantity: variant.stock_quantity,
        options: variant.options,
        image_refs: variant.image_refs,
      })),
    },
  });
  assert.equal(rebuilt.version, 3);
  assert.equal(rebuilt.variants[0]?.stock_quantity, 4);

  const evidenceAfterRebuild = await raw(
    `SELECT id, request_hash, before_quantity, after_quantity
       FROM inventory_mutations
      WHERE merchant_id = $1
        AND product_id = $2
        AND variant_id = $3
        AND request_hash = $4`,
    [merchantId, productId, variantId, requestHash],
  );
  assert.equal(
    evidenceAfterRebuild.rows.length,
    1,
    "cashier sale inventory evidence must survive later catalog graph rebuilds so return/void reconciliation can restore stock",
  );
  assert.equal(Number(evidenceAfterRebuild.rows[0].before_quantity), 5);
  assert.equal(Number(evidenceAfterRebuild.rows[0].after_quantity), 4);
});

test.after(async () => {
  await pool.end();
});
