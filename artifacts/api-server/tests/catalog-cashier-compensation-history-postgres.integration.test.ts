import assert from "node:assert/strict";
import crypto from "node:crypto";
import test from "node:test";

process.env.FAWRI_OPERATIONAL_POSTGRES_AUTHORITY = "required";
process.env.FAWRI_AUTH_SECURITY_SECRET =
  "catalog-cashier-compensation-history-secret-32-bytes-minimum";

const dbModule = await import("@workspace/db");
const pool = dbModule.pool;
const accounts = await import(
  "../src/services/postgresMerchantAccountAuthority.js"
);
const catalog = await import("../src/services/postgresCatalogAuthority.js");
const cashier = await import(
  "../src/services/postgresCashierSyncAuthority.js"
);
const compensation = await import(
  "../src/services/postgresCashierCompensationSyncAuthority.js"
);

async function createMerchant(suffix: string) {
  const phone = `077${crypto.randomInt(0, 100_000_000)
    .toString()
    .padStart(8, "0")}`;
  const pending = await accounts.upsertPendingMerchantAuthoritative({
    phone,
    passwordHash: `hash-${suffix}`,
    ownerName: `Compensation Owner ${suffix}`,
    storeName: `Compensation Store ${suffix}`,
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

test("cashier variant return remains compensatable after an ordinary catalog rebuild", async () => {
  const suffix = crypto.randomUUID().replace(/-/g, "").slice(0, 12);
  const merchantId = await createMerchant(suffix);
  const productId = `prd-comp-history-${suffix}`;
  const variantId = `var-comp-history-${suffix}`;
  const localMerchantId = `local-${suffix}`;
  const deviceId = `device-${suffix}`;

  const created = await catalog.createCatalogProductAuthoritative({
    merchantId,
    idempotencyKey: `comp-history-create-${suffix}`,
    input: {
      id: productId,
      name: "Cashier compensation history proof",
      price_iqd: 10_000,
      low_stock_threshold: 1,
      status: "available",
      allow_fawri_reply: true,
      variants: [
        {
          id: variantId,
          name: "Blue",
          stock_quantity: 5,
          options: { Color: "Blue" },
        },
      ],
    },
  });
  assert.equal(created.product.version, 1);
  assert.equal(created.product.variants[0]?.stock_quantity, 5);

  const locationId = `location-comp-history-${suffix}`;
  const stationId = `station-comp-history-${suffix}`;
  await pool.query(
    `INSERT INTO merchant_locations (
       id, merchant_id, name, legacy_branch_key, is_default,
       operational_status, online_fulfillment_enabled,
       accept_online_orders_while_closed, merchant_priority,
       created_at, updated_at
     ) VALUES ($1,$2,'Main Location','main',TRUE,'open',FALSE,FALSE,0,now(),now())`,
    [locationId, merchantId],
  );
  await pool.query(
    `INSERT INTO merchant_cashier_stations (
       id, merchant_id, name, branch_key, location_id, status,
       paired_device_id, offline_inventory_authority, credential_version,
       paired_at, created_at, updated_at
     ) VALUES ($1,$2,'Compensation Station','main',$3,'active',$4,FALSE,1,now(),now(),now())`,
    [stationId, merchantId, locationId, deviceId],
  );
  await pool.query(
    `INSERT INTO location_inventory_levels (
       id, merchant_id, location_id, product_id, variant_id,
       quantity, low_stock_threshold, version, created_at, updated_at
     ) VALUES ($1,$2,$3,$4,$5,5,1,1,now(),now())`,
    [
      `location-inventory-comp-history-${suffix}`,
      merchantId,
      locationId,
      productId,
      variantId,
    ],
  );

  const saleOperationId = `sale-op-${suffix}`;
  const saleId = `sale-${suffix}`;
  const saleLineId = `sale-line-${suffix}`;
  const saleMovementId = `sale-move-${suffix}`;
  const soldAt = new Date().toISOString();
  const saleSnapshot = {
    sale_id: saleId,
    operation_id: saleOperationId,
    local_merchant_id: localMerchantId,
    cloud_merchant_id: merchantId,
    device_id: deviceId,
    device_sequence: 1,
    source: "cashier",
    status: "completed",
    lines: [
      {
        line_id: saleLineId,
        product_id: productId,
        variant_id: variantId,
        product_name_snapshot: created.product.name,
        variant_name_snapshot: created.product.variants[0]?.name || "Blue",
        catalog_version: created.product.version,
        quantity: 2,
        base_unit_price_minor: 10_000,
        effective_unit_price_minor: 10_000,
        discount_minor: 0,
        line_total_minor: 20_000,
      },
    ],
    subtotal_minor: 20_000,
    discount_minor: 0,
    total_minor: 20_000,
    currency_code: "IQD",
    currency_fraction_digits: 0,
    payment_method: "cash",
    payment_status: "paid",
    occurred_at: soldAt,
  };
  const saleMovement = {
    movement_id: saleMovementId,
    operation_id: saleOperationId,
    local_merchant_id: localMerchantId,
    cloud_merchant_id: merchantId,
    device_id: deviceId,
    device_sequence: 1,
    product_id: productId,
    variant_id: variantId,
    delta: -2,
    reason: "sale",
    related_sale_id: saleId,
    occurred_at: soldAt,
  };
  const saleBody = {
    cloud_merchant_id: merchantId,
    local_merchant_id: localMerchantId,
    device_id: deviceId,
    device_sequence: 1,
    operation_id: saleOperationId,
    envelopes: [
      {
        schema_version: 1,
        operation_id: saleOperationId,
        device_id: deviceId,
        device_sequence: 1,
        entity_type: "sale",
        entity_id: saleId,
        operation: "append",
        occurred_at: soldAt,
        payload: saleSnapshot,
      },
      {
        schema_version: 1,
        operation_id: saleOperationId,
        device_id: deviceId,
        device_sequence: 1,
        entity_type: "inventory_movement",
        entity_id: saleMovementId,
        operation: "append",
        occurred_at: soldAt,
        payload: saleMovement,
      },
    ],
  };

  const sale = await cashier.syncCashierSaleAuthoritative({
    merchantId,
    body: saleBody,
  });
  assert.equal(sale.replayed, false);
  assert.equal(sale.inventory_mutation_count, 1);

  const afterSale = await catalog.listCatalogProductsAuthoritative(merchantId);
  const soldProduct = afterSale.find((item) => item.id === productId);
  assert.ok(soldProduct);
  assert.equal(soldProduct.version, 1);
  assert.equal(soldProduct.variants[0]?.id, variantId);
  assert.equal(soldProduct.variants[0]?.stock_quantity, 3);

  const locationAfterSale = await pool.query(
    `SELECT quantity, version
       FROM location_inventory_levels
      WHERE merchant_id = $1 AND location_id = $2
        AND product_id = $3 AND variant_id = $4`,
    [merchantId, locationId, productId, variantId],
  );
  assert.equal(Number(locationAfterSale.rows[0]?.quantity), 3);
  assert.equal(Number(locationAfterSale.rows[0]?.version), 2);

  const rebuilt = await catalog.updateCatalogProductAuthoritative({
    merchantId,
    productId,
    expectedVersion: soldProduct.version,
    input: {
      name: `${soldProduct.name} renamed`,
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
  assert.equal(rebuilt.version, 2);
  assert.equal(rebuilt.variants[0]?.id, variantId);
  assert.equal(rebuilt.variants[0]?.stock_quantity, 3);

  const returnOperationId = `return-op-${suffix}`;
  const returnId = `return-${suffix}`;
  const returnMovementId = `return-move-${suffix}`;
  const returnedAt = new Date(Date.now() + 1_000).toISOString();
  const returnSnapshot = {
    return_id: returnId,
    operation_id: returnOperationId,
    sale_id: saleId,
    local_merchant_id: localMerchantId,
    cloud_merchant_id: merchantId,
    device_id: deviceId,
    device_sequence: 2,
    lines: [
      {
        original_line_id: saleLineId,
        product_id: productId,
        variant_id: variantId,
        quantity: 1,
        effective_unit_price_minor: 10_000,
        refund_minor: 10_000,
      },
    ],
    refund_total_minor: 10_000,
    currency_code: "IQD",
    currency_fraction_digits: 0,
    occurred_at: returnedAt,
  };
  const returnMovement = {
    movement_id: returnMovementId,
    operation_id: returnOperationId,
    local_merchant_id: localMerchantId,
    cloud_merchant_id: merchantId,
    device_id: deviceId,
    device_sequence: 2,
    product_id: productId,
    variant_id: variantId,
    delta: 1,
    reason: "return",
    related_sale_id: saleId,
    occurred_at: returnedAt,
  };
  const returnBody = {
    cloud_merchant_id: merchantId,
    local_merchant_id: localMerchantId,
    device_id: deviceId,
    device_sequence: 2,
    operation_id: returnOperationId,
    envelopes: [
      {
        schema_version: 1,
        operation_id: returnOperationId,
        device_id: deviceId,
        device_sequence: 2,
        entity_type: "return",
        entity_id: returnId,
        operation: "append",
        occurred_at: returnedAt,
        payload: returnSnapshot,
      },
      {
        schema_version: 1,
        operation_id: returnOperationId,
        device_id: deviceId,
        device_sequence: 2,
        entity_type: "inventory_movement",
        entity_id: returnMovementId,
        operation: "append",
        occurred_at: returnedAt,
        payload: returnMovement,
      },
    ],
  };

  const returned = await compensation.syncCashierCompensationAuthoritative({
    merchantId,
    body: returnBody,
  });
  assert.equal(returned.compensation_kind, "return");
  assert.equal(returned.replayed, false);
  assert.equal(returned.inventory_mutation_count, 1);

  const afterReturn = await catalog.listCatalogProductsAuthoritative(merchantId);
  const restoredProduct = afterReturn.find((item) => item.id === productId);
  assert.ok(restoredProduct);
  assert.equal(restoredProduct.variants[0]?.id, variantId);
  assert.equal(restoredProduct.variants[0]?.stock_quantity, 4);

  assert.equal(restoredProduct.version, 2);

  const locationAfterReturn = await pool.query(
    `SELECT quantity, version
       FROM location_inventory_levels
      WHERE merchant_id = $1 AND location_id = $2
        AND product_id = $3 AND variant_id = $4`,
    [merchantId, locationId, productId, variantId],
  );
  assert.equal(Number(locationAfterReturn.rows[0]?.quantity), 4);
  assert.equal(Number(locationAfterReturn.rows[0]?.version), 3);

  const returnMutation = await pool.query(
    `SELECT location_id, before_quantity, after_quantity,
            expected_version, resulting_version
       FROM inventory_mutations
      WHERE merchant_id = $1 AND reason_code = 'cashier_return_sync'
      ORDER BY created_at DESC
      LIMIT 1`,
    [merchantId],
  );
  assert.equal(returnMutation.rows[0]?.location_id, locationId);
  assert.equal(Number(returnMutation.rows[0]?.before_quantity), 3);
  assert.equal(Number(returnMutation.rows[0]?.after_quantity), 4);
  assert.equal(Number(returnMutation.rows[0]?.expected_version), 2);
  assert.equal(Number(returnMutation.rows[0]?.resulting_version), 3);

  const replay = await compensation.syncCashierCompensationAuthoritative({
    merchantId,
    body: returnBody,
  });
  assert.equal(replay.compensation_kind, "return");
  assert.equal(replay.replayed, true);
  assert.equal(replay.inventory_mutation_count, 0);

  const afterReplay = await catalog.listCatalogProductsAuthoritative(merchantId);
  const replayProduct = afterReplay.find((item) => item.id === productId);
  assert.ok(replayProduct);
  assert.equal(replayProduct.variants[0]?.stock_quantity, 4);
});


test("cashier full void restores stock to the original sale location even after station moves", async () => {
  const suffix = crypto.randomUUID().replace(/-/g, "").slice(0, 12);
  const merchantId = await createMerchant(`void-${suffix}`);
  const productId = `prd-comp-void-${suffix}`;
  const localMerchantId = `local-void-${suffix}`;
  const deviceId = `device-void-${suffix}`;
  const originalLocationId = `location-void-origin-${suffix}`;
  const movedLocationId = `location-void-moved-${suffix}`;
  const stationId = `station-void-${suffix}`;

  const created = await catalog.createCatalogProductAuthoritative({
    merchantId,
    idempotencyKey: `comp-void-create-${suffix}`,
    input: {
      id: productId,
      name: "Cashier void location proof",
      price_iqd: 9_000,
      stock_quantity: 3,
      low_stock_threshold: 1,
      status: "available",
      allow_fawri_reply: true,
    },
  });
  assert.equal(created.product.version, 1);
  assert.equal(created.product.stock_quantity, 3);

  await pool.query(
    `INSERT INTO merchant_locations (
       id, merchant_id, name, legacy_branch_key, is_default,
       operational_status, online_fulfillment_enabled,
       accept_online_orders_while_closed, merchant_priority,
       created_at, updated_at
     ) VALUES
       ($1,$3,'Original Location','origin',TRUE,'open',FALSE,FALSE,0,now(),now()),
       ($2,$3,'Moved Location','moved',FALSE,'open',FALSE,FALSE,1,now(),now())`,
    [originalLocationId, movedLocationId, merchantId],
  );
  await pool.query(
    `INSERT INTO merchant_cashier_stations (
       id, merchant_id, name, branch_key, location_id, status,
       paired_device_id, offline_inventory_authority, credential_version,
       paired_at, created_at, updated_at
     ) VALUES ($1,$2,'Void Station','origin',$3,'active',$4,FALSE,1,now(),now(),now())`,
    [stationId, merchantId, originalLocationId, deviceId],
  );
  await pool.query(
    `INSERT INTO location_inventory_levels (
       id, merchant_id, location_id, product_id, variant_id,
       quantity, low_stock_threshold, version, created_at, updated_at
     ) VALUES
       ($1,$3,$4,$5,NULL,3,1,1,now(),now()),
       ($2,$3,$6,$5,NULL,8,1,1,now(),now())`,
    [
      `location-inventory-void-origin-${suffix}`,
      `location-inventory-void-moved-${suffix}`,
      merchantId,
      originalLocationId,
      productId,
      movedLocationId,
    ],
  );

  const saleOperationId = `void-sale-op-${suffix}`;
  const saleId = `void-sale-${suffix}`;
  const saleLineId = `void-sale-line-${suffix}`;
  const saleMovementId = `void-sale-move-${suffix}`;
  const soldAt = new Date().toISOString();
  const saleSnapshot = {
    sale_id: saleId,
    operation_id: saleOperationId,
    local_merchant_id: localMerchantId,
    cloud_merchant_id: merchantId,
    device_id: deviceId,
    device_sequence: 1,
    source: "cashier",
    status: "completed",
    lines: [
      {
        line_id: saleLineId,
        product_id: productId,
        product_name_snapshot: created.product.name,
        catalog_version: created.product.version,
        quantity: 1,
        base_unit_price_minor: 9_000,
        effective_unit_price_minor: 9_000,
        discount_minor: 0,
        line_total_minor: 9_000,
      },
    ],
    subtotal_minor: 9_000,
    discount_minor: 0,
    total_minor: 9_000,
    currency_code: "IQD",
    currency_fraction_digits: 0,
    payment_method: "cash",
    payment_status: "paid",
    occurred_at: soldAt,
  };
  const saleBody = {
    cloud_merchant_id: merchantId,
    local_merchant_id: localMerchantId,
    device_id: deviceId,
    device_sequence: 1,
    operation_id: saleOperationId,
    envelopes: [
      {
        schema_version: 1,
        operation_id: saleOperationId,
        device_id: deviceId,
        device_sequence: 1,
        entity_type: "sale",
        entity_id: saleId,
        operation: "append",
        occurred_at: soldAt,
        payload: saleSnapshot,
      },
      {
        schema_version: 1,
        operation_id: saleOperationId,
        device_id: deviceId,
        device_sequence: 1,
        entity_type: "inventory_movement",
        entity_id: saleMovementId,
        operation: "append",
        occurred_at: soldAt,
        payload: {
          movement_id: saleMovementId,
          operation_id: saleOperationId,
          local_merchant_id: localMerchantId,
          cloud_merchant_id: merchantId,
          device_id: deviceId,
          device_sequence: 1,
          product_id: productId,
          delta: -1,
          reason: "sale",
          related_sale_id: saleId,
          occurred_at: soldAt,
        },
      },
    ],
  };

  const sale = await cashier.syncCashierSaleAuthoritative({
    merchantId,
    body: saleBody,
  });
  assert.equal(sale.replayed, false);
  assert.equal(sale.inventory_mutation_count, 1);

  const originalAfterSale = await pool.query(
    `SELECT quantity, version
       FROM location_inventory_levels
      WHERE merchant_id = $1 AND location_id = $2 AND product_id = $3
        AND variant_id IS NULL`,
    [merchantId, originalLocationId, productId],
  );
  assert.equal(Number(originalAfterSale.rows[0]?.quantity), 2);
  assert.equal(Number(originalAfterSale.rows[0]?.version), 2);

  await pool.query(
    `UPDATE merchant_cashier_stations
        SET location_id = $3, branch_key = 'moved', updated_at = now()
      WHERE merchant_id = $1 AND id = $2`,
    [merchantId, stationId, movedLocationId],
  );

  const voidOperationId = `void-op-${suffix}`;
  const voidMovementId = `void-move-${suffix}`;
  const voidedAt = new Date(Date.now() + 1_000).toISOString();
  const voidBody = {
    cloud_merchant_id: merchantId,
    local_merchant_id: localMerchantId,
    device_id: deviceId,
    device_sequence: 2,
    operation_id: voidOperationId,
    envelopes: [
      {
        schema_version: 1,
        operation_id: voidOperationId,
        device_id: deviceId,
        device_sequence: 2,
        entity_type: "sale",
        entity_id: saleId,
        operation: "void",
        occurred_at: voidedAt,
        payload: {
          sale_id: saleId,
          local_merchant_id: localMerchantId,
          cloud_merchant_id: merchantId,
          device_id: deviceId,
          device_sequence: 2,
          status: "voided",
          returns: [],
          void: {
            operation_id: voidOperationId,
            sale_id: saleId,
            device_id: deviceId,
            device_sequence: 2,
            refund_total_minor: 9_000,
            currency_code: "IQD",
            currency_fraction_digits: 0,
            occurred_at: voidedAt,
          },
        },
      },
      {
        schema_version: 1,
        operation_id: voidOperationId,
        device_id: deviceId,
        device_sequence: 2,
        entity_type: "inventory_movement",
        entity_id: voidMovementId,
        operation: "append",
        occurred_at: voidedAt,
        payload: {
          movement_id: voidMovementId,
          operation_id: voidOperationId,
          local_merchant_id: localMerchantId,
          cloud_merchant_id: merchantId,
          device_id: deviceId,
          device_sequence: 2,
          product_id: productId,
          delta: 1,
          reason: "sale_void",
          related_sale_id: saleId,
          occurred_at: voidedAt,
        },
      },
    ],
  };

  const voided = await compensation.syncCashierCompensationAuthoritative({
    merchantId,
    body: voidBody,
  });
  assert.equal(voided.compensation_kind, "void");
  assert.equal(voided.replayed, false);
  assert.equal(voided.inventory_mutation_count, 1);

  const originalAfterVoid = await pool.query(
    `SELECT quantity, version
       FROM location_inventory_levels
      WHERE merchant_id = $1 AND location_id = $2 AND product_id = $3
        AND variant_id IS NULL`,
    [merchantId, originalLocationId, productId],
  );
  const movedAfterVoid = await pool.query(
    `SELECT quantity, version
       FROM location_inventory_levels
      WHERE merchant_id = $1 AND location_id = $2 AND product_id = $3
        AND variant_id IS NULL`,
    [merchantId, movedLocationId, productId],
  );
  assert.equal(Number(originalAfterVoid.rows[0]?.quantity), 3);
  assert.equal(Number(originalAfterVoid.rows[0]?.version), 3);
  assert.equal(Number(movedAfterVoid.rows[0]?.quantity), 8);
  assert.equal(Number(movedAfterVoid.rows[0]?.version), 1);

  const afterVoid = await catalog.listCatalogProductsAuthoritative(merchantId);
  const restored = afterVoid.find((item) => item.id === productId);
  assert.ok(restored);
  assert.equal(restored.stock_quantity, 3);
  assert.equal(restored.version, 1);

  const voidMutation = await pool.query(
    `SELECT location_id, before_quantity, after_quantity,
            expected_version, resulting_version
       FROM inventory_mutations
      WHERE merchant_id = $1 AND reason_code = 'cashier_void_sync'
      ORDER BY created_at DESC
      LIMIT 1`,
    [merchantId],
  );
  assert.equal(voidMutation.rows[0]?.location_id, originalLocationId);
  assert.equal(Number(voidMutation.rows[0]?.before_quantity), 2);
  assert.equal(Number(voidMutation.rows[0]?.after_quantity), 3);
  assert.equal(Number(voidMutation.rows[0]?.expected_version), 2);
  assert.equal(Number(voidMutation.rows[0]?.resulting_version), 3);

  const order = await pool.query(
    `SELECT fulfillment_location_id,
            metadata->'cashier_sync'->>'current_sale_status' AS cashier_status
       FROM orders
      WHERE merchant_id = $1 AND id = $2`,
    [merchantId, saleId],
  );
  assert.equal(order.rows[0]?.fulfillment_location_id, originalLocationId);
  assert.equal(order.rows[0]?.cashier_status, "voided");
});

test.after(async () => {
  await pool.end();
});
