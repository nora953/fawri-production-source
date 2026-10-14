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
const staff = await import('../src/services/postgresCashierStaffAuthority.ts');
const { issueCashierCostEvidence } = await import('../src/services/cashierCostEvidence.ts');
const sync = await import('../src/services/postgresCashierSyncAuthority.ts');
const historical = await import('../src/services/cashierHistoricalOperationAuthority.ts');
const operational = await import('../src/services/operationalPostgresAuthority.ts');


test('isolated operator report profit permission boundary', async t => {
  const owned = [];
  let server;
  t.after(async () => cleanupResources([
    ['HTTP server', () => server ? new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve())) : undefined],
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
      id: productId, name: 'One last stock item', price_iqd: 1000, cost_iqd: 500, stock_quantity: 1,
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
        catalog_version: 1, cost_evidence: issueCashierCostEvidence({ merchantId: f.merchantId, productId: f.productId, catalogVersion: 1, unitCostMinor: 500 }), quantity: 1, base_unit_price_minor: 1000, effective_unit_price_minor: 1000,
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
    displayName: 'Synthetic recovery cashier', role: 'cashier', pin: '2468', permissions: ['sale.create', 'sale.view_own', 'reports.sales'] });
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

  const accepted = await request('/api/cashier/operator/sync/sale', original.operator_token, body);
  assert.equal(accepted.status,200,JSON.stringify(accepted.body));
  async function report(token) {
    const response=await fetch(base+'/api/cashier/operator/report',{signal:AbortSignal.timeout(15000),headers:{
      'x-fawri-cashier-station-token':device.stationToken,'x-fawri-cashier-device-id':device.deviceId,
      'x-fawri-cashier-operator-token':token,
    }});return {status:response.status,body:await response.json()};
  }
  const ordinary=await report(original.operator_token);
  assert.equal(ordinary.status,200,JSON.stringify(ordinary.body));
  assert.equal(ordinary.body.can_view_profit,false);
  assert.equal(ordinary.body.report.by_currency[0].gross_profit_minor,undefined);
  console.log('AUDIT_OPERATOR_PROFIT_BOUNDARY '+JSON.stringify({canViewProfit:ordinary.body.can_view_profit,
    currencyProfit:ordinary.body.report.by_currency[0].gross_profit_minor??null,
    topProducts:ordinary.body.report.by_currency[0].top_products,
    profitableRanking:ordinary.body.report.by_currency[0].top_profitable_products}));
  await t.test('no reports.profit permission removes nested product profit values',async()=>{
    const products=ordinary.body.report.by_currency[0].top_products;
    assert.ok(products.length>0,'fixture must contain a product');
    assert.ok(products.every(product=>product.gross_profit_minor===undefined),
      'HTTP response exposes product gross profit without reports.profit');
  });
  await t.test('no reports.profit permission does not expose a profitable-product ranking',async()=>{
    assert.equal(ordinary.body.report.by_currency[0].top_profitable_products.length,0,
      'HTTP response exposes ranking by hidden profit without reports.profit');
  });
  await t.test('explicit reports.profit grant allows actual aggregate and product profit',async()=>{
    await staff.updateCashierStaffAuthoritative({merchantId:f.merchantId,staffId:member.id,
      expectedVersion:member.version,permissions:['sale.create','sale.view_own','reports.sales','reports.profit']});
    const login=await request('/api/cashier/operator/login',null,{staff_id:member.id,pin:'2468'});
    assert.equal(login.status,200,JSON.stringify(login.body));
    const allowed=await report(login.body.operator_token);
    assert.equal(allowed.status,200,JSON.stringify(allowed.body));
    assert.equal(allowed.body.can_view_profit,true);
    assert.equal(allowed.body.report.by_currency[0].gross_profit_minor,500);
    assert.equal(allowed.body.report.by_currency[0].top_products[0].gross_profit_minor,500);
  });
});
