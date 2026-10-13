// Audit-only derived synthetic license/setup from existing compensation fixture; original unchanged.
import assert from "node:assert/strict";
import crypto from "node:crypto";
import test from "node:test";

import {assertDisposablePostgres} from '../../../scripts/lib/disposable-postgres-test-guard.mjs';
await assertDisposablePostgres();
process.env.FAWRI_OPERATIONAL_POSTGRES_AUTHORITY = "required";
process.env.FAWRI_AUTH_SECURITY_SECRET =
  "catalog-cashier-compensation-history-secret-32-bytes-minimum";

const dbModule = await import("../../../lib/db/src/index.ts");
const pool = dbModule.pool;
const accounts = await import(
  "../../../artifacts/api-server/src/services/postgresMerchantAccountAuthority.js"
);
const catalog = await import("../../../artifacts/api-server/src/services/postgresCatalogAuthority.js");
const cashier = await import(
  "../../../artifacts/api-server/src/services/postgresCashierSyncAuthority.js"
);
const compensation = await import(
  "../../../artifacts/api-server/src/services/postgresCashierCompensationSyncAuthority.js"
);

async function createMerchant(suffix: string) {
  const phone = `+96477${crypto.randomInt(0, 100_000_000)
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

async function provisionCashierHistoryAuthority(input: {
  merchantId: string;
  stationId: string;
  deviceId: string;
  suffix: string;
}) {
  const subscriptionId = `cashier-history-sub-${input.suffix}`;
  const billingOrderId = `cashier-history-billing-${input.suffix}`;
  const paymentRef = `cashier-history-payment-${input.suffix}`;
  await pool.query(
    `INSERT INTO merchant_cashier_subscriptions (
       id, merchant_id, status, licensed_seats, price_per_seat_iqd,
       billing_period_start, billing_period_end, grace_duration_seconds,
       version, created_at, updated_at
     ) VALUES ($1,$2,'active',1,3900,now(),now() + interval '1 month',604800,1,now(),now())`,
    [subscriptionId, input.merchantId],
  );
  await pool.query(
    `INSERT INTO cashier_billing_orders (
       id, merchant_id, subscription_id, operation, current_seats, requested_seats,
       resulting_seats, unit_price_iqd, amount_iqd, currency,
       billing_period_start, billing_period_end, grace_duration_seconds,
       status, idempotency_key, provider, provider_checkout_ref,
       provider_payment_ref, request_expires_at, paid_at, applied_at,
       metadata, created_at, updated_at
     ) VALUES (
       $1,$2,$3,'activate',0,1,1,3900,3900,'IQD',
       now(),now() + interval '1 month',604800,
       'applied',$4,'test_fixture',$5,$6,
       now() + interval '30 minutes',now(),now(),'{}'::jsonb,now(),now()
     )`,
    [
      billingOrderId,
      input.merchantId,
      subscriptionId,
      `cashier-history-idem-${input.suffix}`,
      `cashier-history-checkout-${input.suffix}`,
      paymentRef,
    ],
  );
  await pool.query(
    `INSERT INTO cashier_entitlement_applications (
       id, merchant_id, subscription_id, order_id, operation,
       previous_seats, resulting_seats, previous_version, resulting_version,
       amount_iqd, provider, provider_payment_ref, applied_at
     ) VALUES ($1,$2,$3,$4,'activate',0,1,0,1,3900,'test_fixture',$5,now())`,
    [
      `cashier-history-application-${input.suffix}`,
      input.merchantId,
      subscriptionId,
      billingOrderId,
      paymentRef,
    ],
  );
  await pool.query(
    `INSERT INTO cashier_station_seat_assignments (
       id, merchant_id, subscription_id, station_id, status,
       assigned_at, created_at, updated_at
     ) VALUES ($1,$2,$3,$4,'active',now(),now(),now())`,
    [
      `cashier-history-seat-${input.suffix}`,
      input.merchantId,
      subscriptionId,
      input.stationId,
    ],
  );
  await pool.query(
    `INSERT INTO cashier_station_credentials (
       id, merchant_id, station_id, device_id, token_hash, version,
       status, issued_at, expires_at
     ) VALUES ($1,$2,$3,$4,$5,1,'active',now(),now() + interval '1 month')`,
    [
      `cashier-history-credential-${input.suffix}`,
      input.merchantId,
      input.stationId,
      input.deviceId,
      crypto.createHash("sha256").update(`credential-${input.suffix}`).digest("hex"),
    ],
  );
}

async function seed(){
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
          stock_quantity: 2,
          options: { Color: "Blue" },
        },
      ],
    },
  });
  assert.equal(created.product.version, 1);
  assert.equal(created.product.variants[0]?.stock_quantity, 2);

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
  await provisionCashierHistoryAuthority({
    merchantId,
    stationId,
    deviceId,
    suffix,
  });
  await pool.query(
    `INSERT INTO location_inventory_levels (
       id, merchant_id, location_id, product_id, variant_id,
       quantity, low_stock_threshold, version, created_at, updated_at
     ) VALUES ($1,$2,$3,$4,$5,2,1,1,now(),now())`,
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
    promotion_discount_minor: 0,
    manual_discount_kind: "amount",
    manual_discount_minor: 2_000,
    manual_discount_reason: "partial return pricing regression",
    discount_minor: 2_000,
    total_minor: 18_000,
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
  assert.equal(soldProduct.variants[0]?.stock_quantity, 0);

  const locationAfterSale = await pool.query(
    `SELECT quantity, version
       FROM location_inventory_levels
      WHERE merchant_id = $1 AND location_id = $2
        AND product_id = $3 AND variant_id = $4`,
    [merchantId, locationId, productId, variantId],
  );
  assert.equal(Number(locationAfterSale.rows[0]?.quantity), 0);
  assert.equal(Number(locationAfterSale.rows[0]?.version), 2);

  return {suffix,merchantId,productId,variantId,locationId,stationId,deviceId,localMerchantId,saleId,saleLineId,saleBody,soldProduct};
}
function returnBody(s:Awaited<ReturnType<typeof seed>>){
 const {suffix,merchantId,productId,variantId,deviceId,localMerchantId,saleId,saleLineId}=s;
  const returnOperationId = `return-op-${suffix}`;
  const returnId = `return-${suffix}`;
  const returnMovementId = `return-move-${suffix}`;
  const returnedAt = new Date(Date.now() + 1_000).toISOString();
  const returnSnapshot = {
    refund_pricing_version: 2,
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
        refund_minor: 9_000,
      },
    ],
    refund_total_minor: 9_000,
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

return returnBody;
}
async function immutable(s:Awaited<ReturnType<typeof seed>>){
 return {orders:(await pool.query('SELECT * FROM orders WHERE merchant_id=$1 ORDER BY id',[s.merchantId])).rows,items:(await pool.query('SELECT * FROM order_items WHERE merchant_id=$1 ORDER BY id',[s.merchantId])).rows,mutations:(await pool.query('SELECT * FROM inventory_mutations WHERE merchant_id=$1 ORDER BY id',[s.merchantId])).rows};
}
async function levels(s:Awaited<ReturnType<typeof seed>>){return (await pool.query('SELECT * FROM location_inventory_levels WHERE merchant_id=$1 ORDER BY id',[s.merchantId])).rows;}
function update(s:Awaited<ReturnType<typeof seed>>,input:any){return catalog.updateCatalogProductAuthoritative({merchantId:s.merchantId,productId:s.productId,expectedVersion:s.soldProduct.version,input});}
test('zero-stock licensed sale immutable history survives subsequent catalog rename',async()=>{
 const s=await seed(),before=await immutable(s),stock=await levels(s);assert.equal(before.orders.length,1);assert.equal(before.items.length,1);assert.equal(before.mutations.length,1);
 await update(s,{...s.soldProduct,name:'Renamed after zero-stock licensed sale'});
 assert.deepEqual(await immutable(s),before);assert.deepEqual(await levels(s),stock);
 const current=await catalog.getCatalogProductAuthoritative(s.merchantId,s.productId);assert.equal(current.version,2);assert.equal(current.variants[0].stock_quantity,0);
 assert.equal(before.items[0].product_variant_id,s.variantId);assert.equal(before.items[0].quantity,2);assert.equal(before.orders[0].total_iqd,18000);
 console.log('CASHIER_HISTORY_OBSERVATION '+JSON.stringify({scenario:'zero-stock-rebuild',orders:1,items:1,mutations:1,immutableRowsPreserved:true,locationLevelUnchanged:true}));
});
test('zero-quantity location row blocks archive without changing catalog or sale history',async()=>{
 const s=await seed(),before=await immutable(s),stock=await levels(s);
 await assert.rejects(update(s,{...s.soldProduct,name:'Must not commit on dependency',variants:[]}),{code:'CATALOG_VARIANT_HISTORY_CONFLICT'});
 assert.deepEqual(await catalog.getCatalogProductAuthoritative(s.merchantId,s.productId),s.soldProduct);assert.deepEqual(await immutable(s),before);assert.deepEqual(await levels(s),stock);
 console.log('CASHIER_HISTORY_OBSERVATION '+JSON.stringify({scenario:'zero-stock-archive-guard',denied:true,graphUnchanged:true,immutableRowsPreserved:true,locationLevelUnchanged:true}));
});
test('zero-quantity location row blocks disabling inventory tracking atomically',async()=>{
 const s=await seed(),before=await immutable(s),stock=await levels(s);
 await assert.rejects(update(s,{...s.soldProduct,name:'Must not disable inventory',track_inventory:false}),{code:'CATALOG_PRODUCT_LOCATION_INVENTORY_CONFLICT'});
 assert.deepEqual(await catalog.getCatalogProductAuthoritative(s.merchantId,s.productId),s.soldProduct);assert.deepEqual(await immutable(s),before);assert.deepEqual(await levels(s),stock);
});
test('owned missing-level fault permits archive but retains sale/replay and rejects unsafe return',async()=>{
 const s=await seed(),before=await immutable(s);
 // Controlled fault in disposable fixture only: this is not a production deletion workflow.
 await pool.query('DELETE FROM location_inventory_levels WHERE merchant_id=$1 AND product_id=$2',[s.merchantId,s.productId]);
 const archived=await update(s,{...s.soldProduct,name:'Archive with historical sale',variants:[]});assert.equal(archived.variants.length,0);assert.equal(archived.version,2);
 assert.deepEqual(await immutable(s),before);
 const shadow=(await pool.query('SELECT quantity,metadata FROM product_variants WHERE merchant_id=$1 AND id=$2',[s.merchantId,s.variantId])).rows[0];assert.equal(shadow.quantity,0);assert.equal(shadow.metadata.catalog_archived,true);
 const replay=await cashier.syncCashierSaleAuthoritative({merchantId:s.merchantId,body:s.saleBody});assert.equal(replay.replayed,true);assert.equal(replay.inventory_mutation_count,0);assert.deepEqual(await immutable(s),before);
 await assert.rejects(compensation.syncCashierCompensationAuthoritative({merchantId:s.merchantId,body:returnBody(s)}),{code:'CASHIER_COMPENSATION_LOCATION_INVENTORY_MISSING'});
 assert.deepEqual(await immutable(s),before);assert.equal((await levels(s)).length,0);assert.equal((await catalog.getCatalogProductAuthoritative(s.merchantId,s.productId)).variants.length,0);
 console.log('CASHIER_HISTORY_OBSERVATION '+JSON.stringify({scenario:'owned-missing-level',archiveHidden:true,immutableRowsPreserved:true,replayNoMutation:true,unsafeReturnRejected:true,noRefundOrStockMutation:true}));
});
test.after(async()=>{await pool.end();});
