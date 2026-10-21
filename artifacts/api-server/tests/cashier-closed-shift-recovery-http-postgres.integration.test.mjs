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
const {createDisposableKnowledgeRuntime}=await import('./helpers/disposable-knowledge-runtime.mjs');
const runtimeFixture=await createDisposableKnowledgeRuntime();
// Root SQL is limited to owned setup, barriers, assertions and cleanup.
const pool=runtimeFixture.admin;
const billing = await import('../src/services/cashierBillingAuthority.ts');
const catalog = await import('../src/services/postgresCatalogAuthority.ts');
const staff = await import('../src/services/postgresCashierStaffAuthority.ts');
const { issueCashierCostEvidence } = await import('../src/services/cashierCostEvidence.ts');
const sync = await import('../src/services/postgresCashierSyncAuthority.ts');
const historical = await import('../src/services/cashierHistoricalOperationAuthority.ts');
const operational = await import('../src/services/operationalPostgresAuthority.ts');


test('isolated HTTP recovers original-shift sale after staff disable and re-enable', async t => {
  const owned = [];
  let server;
  t.after(async () => cleanupResources([
    ['HTTP server', () => server ? new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve())) : undefined],
    ['fixture accounts', () => pool.query('DELETE FROM accounts WHERE id=ANY($1::text[])', [owned])],
    ['actual runtime fixture', () => runtimeFixture.dispose()],
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
    await billing.applyVerifiedCashierBillingProviderEvent({ merchantId: activation.order.merchant_id, provider: 'test_fake', providerEventId: randomUUID(),
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
    for (let i = 0; i < 1; i++) {
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
      stations.push({ stationId, deviceId, stationToken: `synthetic-${i}-${suffix}` });
    }
    return { merchantId, locationId, productId, stations, subscriptionId: subscription.id, billingOrderId: activation.order.id };
  }

  function saleBody(f, device, occurredAt, sequence = 1) {
    const operationId = `audit-op-${randomUUID()}`, saleId = `audit-sale-${randomUUID()}`;
    const identity = { operation_id: operationId, local_merchant_id: `local-${f.merchantId}`,
      cloud_merchant_id: f.merchantId, device_id: device.deviceId, device_sequence: sequence };
    const sale = { ...identity, sale_id: saleId, source: 'cashier', status: 'completed',
      lines: [{ line_id: `line-${randomUUID()}`, product_id: f.productId, product_name_snapshot: 'Last item',
        catalog_version: 1, cost_evidence: issueCashierCostEvidence({ merchantId: f.merchantId, productId: f.productId, catalogVersion: 1, unitCostMinor: null }), quantity: 1, base_unit_price_minor: 1000, effective_unit_price_minor: 1000,
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


  const [{ default: express }, { default: commerceRouter }, { default: staffRouter }] = await Promise.all([
    import('express'), import('../src/routes/cashier-operator-commerce.ts'), import('../src/routes/cashier-staff-operations.ts'),
  ]);
  const app = express();
  app.use(express.json()); app.use('/api', staffRouter, commerceRouter);
  server = await new Promise((resolve, reject) => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); s.once('error', reject); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const f = await fixture(), device = f.stations[0];
  const member = await staff.createCashierStaffAuthoritative({ merchantId: f.merchantId,
    displayName: 'Synthetic recovery cashier', role: 'cashier', pin: '2468', permissions: ['sale.create', 'sale.view_own'] });
  async function request(path, token, payload, deviceId = device.deviceId) {
    const response = await fetch(base + path, { method: 'POST', signal: AbortSignal.timeout(15000), headers: {
      'Content-Type': 'application/json', 'x-fawri-cashier-station-token': device.stationToken,
      'x-fawri-cashier-device-id': deviceId, ...(token ? { 'x-fawri-cashier-operator-token': token } : {}),
    }, body: JSON.stringify(payload) });
    return { status: response.status, body: await response.json() };
  }
  const firstLogin = await request('/api/cashier/operator/login', null, { staff_id: member.id, pin: '2468' });
  assert.equal(firstLogin.status, 200, JSON.stringify(firstLogin.body));
  const original = firstLogin.body;
  // Use actual isolated SQL clock, after issuance and before revocation. This
  // proves a feasible history interval without future timestamps or production I/O.
  await pool.query('SELECT pg_sleep(0.02)');
  const occurredAt = (await pool.query('SELECT clock_timestamp() AS instant')).rows[0].instant.toISOString();
  const body = saleBody(f, device, occurredAt);
  const attribution = await commerceHistoricalContext();
  assert.equal(attribution.shift_id, original.context.shift_id);
  async function commerceHistoricalContext() {
    const commerce = await import('../src/services/cashierOperatorCommerceAuthority.ts');
    return commerce.resolveHistoricalOperatorAttributionContext({ merchantId: f.merchantId, deviceId: device.deviceId, occurredAt });
  }
  await pool.query('SELECT pg_sleep(0.02)');
  // Administrative service boundary is real; owner HTTP middleware is outside
  // this proof. No original binding is rewritten and no sale exists yet.
  const disabled = await staff.updateCashierStaffAuthoritative({ merchantId: f.merchantId,
    staffId: member.id, expectedVersion: member.version, status: 'disabled' });
  const closed = (await pool.query('SELECT status,close_reason FROM cashier_shifts WHERE id=$1', [original.context.shift_id])).rows[0];
  assert.deepEqual(closed, { status: 'closed', close_reason: 'staff_disabled' });
  const rejected = await request('/api/cashier/operator/sync/sale', original.operator_token, body);
  assert.equal(rejected.status, 401, JSON.stringify(rejected.body));
  assert.equal((await pool.query('SELECT count(*)::int AS n FROM orders WHERE merchant_id=$1', [f.merchantId])).rows[0].n, 0);
  await staff.updateCashierStaffAuthoritative({ merchantId: f.merchantId, staffId: member.id,
    expectedVersion: disabled.version, status: 'active' });
  const nextLogin = await request('/api/cashier/operator/login', null, { staff_id: member.id, pin: '2468' });
  assert.equal(nextLogin.status, 200, JSON.stringify(nextLogin.body));
  const restored = nextLogin.body;
  assert.notEqual(restored.context.shift_id, original.context.shift_id);
  assert.equal((await request('/api/cashier/operator/sync/sale', restored.operator_token, body, 'wrong-device')).status, 401);
  const accepted = await request('/api/cashier/operator/sync/sale', restored.operator_token, body);
  assert.equal(accepted.status, 200, JSON.stringify(accepted.body));
  assert.equal(accepted.body.operation_id, body.operation_id);
  assert.deepEqual(new Set(accepted.body.accepted_entity_ids), new Set(body.envelopes.map(e => e.entity_id)));
  const saved = (await pool.query('SELECT staff_id,shift_id,operator_session_id,device_id FROM cashier_operation_attribution WHERE merchant_id=$1 AND operation_id=$2', [f.merchantId, body.operation_id])).rows[0];
  assert.deepEqual(saved, { staff_id: member.id, shift_id: original.context.shift_id,
    operator_session_id: original.context.operator_session_id, device_id: device.deviceId });
  const replay = await request('/api/cashier/operator/sync/sale', restored.operator_token, body);
  assert.equal(replay.status, 200, JSON.stringify(replay.body));
  assert.equal(replay.body.replayed, true);
  assert.equal(replay.body.inventory_mutation_count, 0);
  assert.equal((await pool.query('SELECT count(*)::int AS n FROM orders WHERE merchant_id=$1', [f.merchantId])).rows[0].n, 1);
  assert.equal((await pool.query('SELECT quantity FROM location_inventory_levels WHERE merchant_id=$1 AND location_id=$2 AND product_id=$3 AND variant_id IS NULL', [f.merchantId, f.locationId, f.productId])).rows[0].quantity, 0);
  assert.equal((await pool.query('SELECT count(*)::int AS n FROM cashier_operation_attribution WHERE merchant_id=$1', [f.merchantId])).rows[0].n, 1);
});
