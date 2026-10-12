import assert from 'node:assert/strict';
import { randomUUID, randomInt, createHash } from 'node:crypto';
import test from 'node:test';
import { assertDisposablePostgres } from '../../../scripts/lib/disposable-postgres-test-guard.mjs';
import { cleanupResources } from './helpers/cleanup-resources.mjs';

// A localhost URL alone never authorizes this test. Refuse before DB imports.
await assertDisposablePostgres();
process.env.FAWRI_OPERATIONAL_POSTGRES_AUTHORITY = 'required';
process.env.FAWRI_SAAS_BILLING_PROVIDER = 'test_fake';
process.env.FAWRI_SAAS_BILLING_PROVIDERS = 'test_fake';
const { pool } = await import('@workspace/db');
const billing = await import('../src/services/cashierBillingAuthority.ts');
const catalog = await import('../src/services/postgresCatalogAuthority.ts');
const sync = await import('../src/services/postgresCashierSyncAuthority.ts');
const historical = await import('../src/services/cashierHistoricalOperationAuthority.ts');
const operational = await import('../src/services/operationalPostgresAuthority.ts');

test('isolated cashier multi-device final-stock, replay and gap observations', async t => {
  const owned = [];
  // Register before the first mutation; cleanup failures must remain visible.
  t.after(async () => cleanupResources([
    ['fixture accounts', () => pool.query('DELETE FROM accounts WHERE id=ANY($1::text[])', [owned])],
    ['pool', () => pool.end()],
  ]));

  async function fixture() {
    const suffix = randomUUID();
    const merchantId = `audit-sync-${suffix}`;
    owned.push(merchantId);
    await pool.query("INSERT INTO accounts(id,kind,phone,password_hash,state,phone_verified) VALUES($1,'merchant',$2,'synthetic','active',true)",
      [merchantId, `+1996${String(randomInt(0, 100000000)).padStart(8, '0')}`]);
    await pool.query("INSERT INTO merchants(id,account_id,owner_name,store_name,activity_type,status,account_status,onboarding_status) VALUES($1,$1,'Synthetic','Sync race fixture','retail','approved','approved','channel_connected')", [merchantId]);
    const activation = await billing.createCashierBillingCheckout({ merchantId, operation: 'activate',
      requestedSeats: 2, idempotencyKey: randomUUID(), provider: 'test_fake' });
    await billing.applyVerifiedCashierBillingProviderEvent({ provider: 'test_fake', providerEventId: randomUUID(),
      orderId: activation.order.id, eventType: 'payment_succeeded', signatureVerified: true,
      payloadHash: createHash('sha256').update(suffix).digest('hex'), occurredAt: new Date(),
      amountIqd: activation.order.amount_iqd, currency: 'IQD', providerPaymentRef: randomUUID() });
    const subscription = (await pool.query('SELECT id FROM merchant_cashier_subscriptions WHERE merchant_id=$1', [merchantId])).rows[0];
    assert.ok(subscription, 'fixture must have applied subscription');
    const locationId = `audit-location-${suffix}`;
    await pool.query(`INSERT INTO merchant_locations(id,merchant_id,name,legacy_branch_key,is_default,
      operational_status,online_fulfillment_enabled,accept_online_orders_while_closed,merchant_priority,created_at,updated_at)
      VALUES($1,$2,'Sync location','sync',TRUE,'open',FALSE,FALSE,0,now(),now())`, [locationId, merchantId]);
    const productId = `audit-product-${suffix}`;
    await catalog.createCatalogProductAuthoritative({ merchantId, idempotencyKey: randomUUID(), input: {
      id: productId, name: 'One last stock item', price_iqd: 1000, stock_quantity: 1,
      low_stock_threshold: 0, status: 'available', allow_fawri_reply: true,
    } });
    const levels = await pool.query('SELECT id FROM location_inventory_levels WHERE merchant_id=$1 AND location_id=$2 AND product_id=$3 AND variant_id IS NULL',
      [merchantId, locationId, productId]);
    if (!levels.rows.length) {
      await pool.query(`INSERT INTO location_inventory_levels(id,merchant_id,location_id,product_id,variant_id,
        quantity,low_stock_threshold,version,created_at,updated_at) VALUES($1,$2,$3,$4,NULL,1,0,1,now(),now())`,
        [`audit-level-${suffix}`, merchantId, locationId, productId]);
    }
    const stations = [];
    for (let i = 0; i < 2; i++) {
      const stationId = `audit-station-${i}-${suffix}`, deviceId = `audit-device-${i}-${suffix}`;
      await pool.query(`INSERT INTO merchant_cashier_stations(id,merchant_id,name,branch_key,location_id,status,
        paired_device_id,offline_inventory_authority,credential_version,paired_at,created_at,updated_at)
        VALUES($1,$2,'Sync station',$3,$4,'active',$5,FALSE,1,now(),now(),now())`,
        [stationId, merchantId, `sync-${i}`, locationId, deviceId]);
      await pool.query(`INSERT INTO cashier_station_seat_assignments(id,merchant_id,subscription_id,station_id,
        status,assigned_at,created_at,updated_at) VALUES($1,$2,$3,$4,'active',now(),now(),now())`,
        [`audit-seat-${i}-${suffix}`, merchantId, subscription.id, stationId]);
      await pool.query(`INSERT INTO cashier_station_credentials(id,merchant_id,station_id,device_id,token_hash,
        version,status,issued_at,expires_at) VALUES($1,$2,$3,$4,$5,1,'active',now(),now()+interval '1 month')`,
        [`audit-credential-${i}-${suffix}`, merchantId, stationId, deviceId,
          createHash('sha256').update(`synthetic-${i}-${suffix}`).digest('hex')]);
      stations.push({ stationId, deviceId });
    }
    return { merchantId, locationId, productId, stations, subscriptionId: subscription.id, billingOrderId: activation.order.id };
  }

  function saleBody(f, device, sequence = 1) {
    const operationId = `audit-op-${randomUUID()}`, saleId = `audit-sale-${randomUUID()}`;
    const occurredAt = new Date().toISOString();
    const identity = { operation_id: operationId, local_merchant_id: `local-${f.merchantId}`,
      cloud_merchant_id: f.merchantId, device_id: device.deviceId, device_sequence: sequence };
    const sale = { ...identity, sale_id: saleId, source: 'cashier', status: 'completed',
      lines: [{ line_id: `line-${randomUUID()}`, product_id: f.productId, product_name_snapshot: 'Last item',
        catalog_version: 1, quantity: 1, base_unit_price_minor: 1000, effective_unit_price_minor: 1000,
        discount_minor: 0, line_total_minor: 1000 }], subtotal_minor: 1000, discount_minor: 0,
      total_minor: 1000, currency_code: 'IQD', currency_fraction_digits: 0,
      payment_method: 'cash', payment_status: 'paid', occurred_at: occurredAt };
    const movement = { ...identity, movement_id: `movement-${randomUUID()}`, product_id: f.productId,
      delta: -1, reason: 'sale', related_sale_id: saleId, occurred_at: occurredAt };
    const envelope = (entityType, entityId, payload) => ({ schema_version: 1, operation_id: operationId,
      device_id: device.deviceId, device_sequence: sequence, entity_type: entityType, entity_id: entityId,
      operation: 'append', occurred_at: occurredAt, payload });
    return { ...identity, envelopes: [envelope('sale', saleId, sale), envelope('inventory_movement', movement.movement_id, movement)] };
  }

  await t.test('two different devices competing for one piece produce one sale and one rollback', async () => {
    for (let trial = 0; trial < 4; trial++) {
      const f = await fixture();
      const bodies = f.stations.map(device => saleBody(f, device));
      const results = await Promise.allSettled(bodies.map(body => sync.syncCashierSaleAuthoritative({ merchantId: f.merchantId, body })));
      const winner = results.findIndex(r => r.status === 'fulfilled');
      assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
      const loser = results.find(r => r.status === 'rejected');
      assert.equal(loser.reason.code, 'CASHIER_SYNC_NEGATIVE_STOCK');
      const counts = (await pool.query(`SELECT
        (SELECT count(*)::int FROM orders WHERE merchant_id=$1 AND source_channel='cashier') AS orders,
        (SELECT count(*)::int FROM inventory_mutations WHERE merchant_id=$1 AND reason_code='cashier_sale_sync') AS movements,
        (SELECT count(*)::int FROM cashier_device_operation_timeline WHERE merchant_id=$1) AS timeline`, [f.merchantId])).rows[0];
      assert.deepEqual(counts, { orders: 1, movements: 1, timeline: 1 });
      const level = (await pool.query('SELECT quantity,version FROM location_inventory_levels WHERE merchant_id=$1 AND location_id=$2 AND product_id=$3 AND variant_id IS NULL',
        [f.merchantId, f.locationId, f.productId])).rows[0];
      assert.equal(Number(level.quantity), 0); assert.equal(Number(level.version), 2);
      const replays = await Promise.all([0, 1].map(() => sync.syncCashierSaleAuthoritative({ merchantId: f.merchantId, body: bodies[winner] })));
      assert.ok(replays.every(r => r.replayed && r.inventory_mutation_count === 0));
      const after = (await pool.query('SELECT count(*)::int AS count FROM inventory_mutations WHERE merchant_id=$1 AND reason_code=\'cashier_sale_sync\'', [f.merchantId])).rows[0];
      assert.equal(after.count, 1);
      const altered = structuredClone(bodies[winner]); altered.envelopes[0].payload.note = 'changed retry';
      await assert.rejects(sync.syncCashierSaleAuthoritative({ merchantId: f.merchantId, body: altered }),
        err => err.code === 'CASHIER_SYNC_IDEMPOTENCY_CONFLICT');
      await assert.rejects(sync.syncCashierSaleAuthoritative({ merchantId: f.merchantId, body: bodies[1 - winner] }),
        err => err.code === 'CASHIER_SYNC_NEGATIVE_STOCK');
    }
  });

  await t.test('SQL observation: gap is accepted but its later missing sequence is rejected', async () => {
    const f = await fixture(), device = f.stations[0];
    const occurredAt = new Date().toISOString();
    async function record(sequence) {
      return operational.withMerchantOperationalTransaction(f.merchantId, async client => {
        await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [`cashier-device:${f.merchantId}:${device.deviceId}`]);
        return historical.recordCashierOperationTimelineInTransaction({ target: client,
          merchantId: f.merchantId, deviceId: device.deviceId, deviceSequence: sequence,
          operationId: `gap-${sequence}`, operationKind: 'sale', occurredAt,
          authority: { allowed: true, stationId: device.stationId, subscriptionId: f.subscriptionId, billingOrderId: f.billingOrderId } });
      });
    }
    assert.deepEqual(await record(1), { allowed: true, replayed: false });
    assert.deepEqual(await record(3), { allowed: true, replayed: false });
    assert.equal((await record(2)).code, 'CASHIER_OPERATION_SEQUENCE_CONFLICT');
    const rows = await pool.query('SELECT device_sequence FROM cashier_device_operation_timeline WHERE merchant_id=$1 AND device_id=$2 ORDER BY device_sequence',
      [f.merchantId, device.deviceId]);
    assert.deepEqual(rows.rows.map(r => Number(r.device_sequence)), [1, 3]);
    // This passing observation does not approve missing-operation rejection.
  });
});
