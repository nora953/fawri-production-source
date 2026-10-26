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


test('isolated HTTP historical return and void scope and privileged recovery', async t => {
  const owned = [];
  let server;
  t.after(async () => cleanupResources([
    ['HTTP server', () => server ? new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve())) : undefined],
    ['fixture streams', () => pool.query('DELETE FROM cashier_device_streams WHERE merchant_id=ANY($1::text[])', [owned])],
    ['fixture accounts', () => pool.query('DELETE FROM accounts WHERE id=ANY($1::text[])', [owned])],
    ['actual runtime fixture', () => runtimeFixture.dispose()],
  ]));
  async function fixture(initialStock = 1) {
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
      id: productId, name: 'One last stock item', price_iqd: 1000, stock_quantity: initialStock,
      low_stock_threshold: 0, status: 'available', allow_fawri_reply: true,
    } });
    const levels = await pool.query('SELECT id FROM location_inventory_levels WHERE merchant_id=$1 AND location_id=$2 AND product_id=$3 AND variant_id IS NULL',
      [merchantId, locationId, productId]);
    if (!levels.rows.length) {
      await pool.query(`INSERT INTO location_inventory_levels(id,merchant_id,location_id,product_id,variant_id,
        quantity,low_stock_threshold,version,created_at,updated_at) VALUES($1,$2,$3,$4,NULL,$5,0,1,now(),now())`,
        [`audit-level-${suffix}`, merchantId, locationId, productId, initialStock]);
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
  await t.test('versioned stream fences legacy sale admission and replay without changing peer financial state',async streamTest=>{
    const target=await fixture(2),peer=await fixture(1);
    async function login(f){
      const member=await staff.createCashierStaffAuthoritative({merchantId:f.merchantId,displayName:'Synthetic stream cashier',role:'cashier',pin:'2468',permissions:['sale.create','sale.view_own']});
      const d=f.stations[0],response=await fetch(base+'/api/cashier/operator/login',{method:'POST',signal:AbortSignal.timeout(15000),headers:{'Content-Type':'application/json','x-fawri-cashier-station-token':d.stationToken,'x-fawri-cashier-device-id':d.deviceId},body:JSON.stringify({staff_id:member.id,pin:'2468'})});
      const body=await response.json();assert.equal(response.status,200,JSON.stringify(body));return body.operator_token;
    }
    async function request(f,token,body){const d=f.stations[0],r=await fetch(base+'/api/cashier/operator/sync/sale',{method:'POST',signal:AbortSignal.timeout(15000),headers:{'Content-Type':'application/json','x-fawri-cashier-station-token':d.stationToken,'x-fawri-cashier-device-id':d.deviceId,'x-fawri-cashier-operator-token':token},body:JSON.stringify(body)});return {status:r.status,body:await r.json()};}
    async function snapshot(){const state={};for(const table of ['orders','order_items','inventory_mutations','cashier_device_operation_timeline','location_inventory_levels','cashier_operation_attribution','cashier_device_streams','cashier_operation_receipts'])state[table]=(await pool.query(`SELECT to_jsonb(t) AS row FROM ${table} t WHERE merchant_id=ANY($1::text[]) ORDER BY to_jsonb(t)::text`,[[target.merchantId,peer.merchantId]])).rows;return state;}
    const token=await login(target),peerToken=await login(peer);
    const instant=(await pool.query('SELECT clock_timestamp() AS instant')).rows[0].instant.toISOString();
    const body=saleBody(target,target.stations[0],instant),next=saleBody(target,target.stations[0],instant,2);
    await streamTest.test('unreadable stream metadata fails closed before a legacy financial commit',async()=>{
      const before=await snapshot();
      await pool.query(`REVOKE SELECT ON cashier_device_streams FROM ${runtimeFixture.role}`);
      try{
        await assert.rejects(sync.syncCashierSaleAuthoritative({merchantId:target.merchantId,body}),error=>error.code==='42501');
        const denied=await request(target,token,body);assert.equal(denied.status,500,JSON.stringify(denied.body));assert.equal(denied.body.accepted_entity_ids,undefined);
        assert.deepEqual(await snapshot(),before,'metadata failure cannot fall back to legacy admission');
      }finally{await pool.query(`GRANT SELECT ON cashier_device_streams TO ${runtimeFixture.role}`);}
    });
    const accepted=await request(target,token,body);assert.equal(accepted.status,200,JSON.stringify(accepted.body));
    assert.equal((await request(target,token,body)).body.replayed,true,'unenrolled exact replay remains valid');
    // Root setup only: intentionally inconsistent synthetic history is not an
    // enrollment method or a trusted checkpoint and must remain held.
    const id='stream-fence-'+randomUUID();
    await pool.query('INSERT INTO cashier_device_streams(id,merchant_id,device_id) VALUES($1,$2,$3)',[id,target.merchantId,target.stations[0].deviceId]);
    for(const state of ['review','active']){
      if(state==='active')await pool.query("UPDATE cashier_device_streams SET state='active',enrollment_evidence_hash=repeat('a',64),enrolled_at=now(),version=version+1 WHERE id=$1",[id]);
      const before=await snapshot(),code=state==='review'?'CASHIER_OPERATION_STREAM_REVIEW_REQUIRED':'CASHIER_OPERATION_STREAM_PROTOCOL_REQUIRED';
      for(const candidate of [body,next]){
        const denied=await request(target,token,candidate);assert.equal(denied.status,409,JSON.stringify(denied.body));assert.equal(denied.body.code,code);
        assert.equal(denied.body.accepted_entity_ids,undefined);assert.equal(denied.body.order_id,undefined);
        assert.deepEqual(await snapshot(),before,'denial must preserve selected own/peer financial, stock, timeline, attribution and stream rows');
      }
      await assert.rejects(sync.syncCashierSaleAuthoritative({merchantId:target.merchantId,body:next}),error=>error.code===code,'direct core caller cannot bypass HTTP fence');
      assert.deepEqual(await snapshot(),before);
    }
    // The peer has no stream, but another tenant has a stream with the peer
    // device string. A device-only lookup would incorrectly deny the peer.
    await pool.query('INSERT INTO cashier_device_streams(id,merchant_id,device_id) VALUES($1,$2,$3)',['foreign-'+randomUUID(),target.merchantId,peer.stations[0].deviceId]);
    const peerBody=saleBody(peer,peer.stations[0],instant);
    assert.equal((await request(peer,peerToken,peerBody)).status,200);
    const before=await snapshot();assert.equal((await request(peer,peerToken,peerBody)).body.replayed,true);assert.deepEqual(await snapshot(),before);
    console.log('P0_STREAM_LEGACY_FENCE '+JSON.stringify({sale:true,reviewAndActive:true,newAndReplayHeld:true,restrictedLogin:true,directCoreDenied:true,peerLegacyPreserved:true,enrollmentImplemented:false,financialWriterImplemented:false}));
  });
  await t.test('actual operator HTTP sequence diagnostic verifies ordered sales and bounded gap late rejection without financial mutation',async()=>{
    const target=await fixture(3),peer=await fixture(3);
    async function request(f,token,payload,overrides={}){
      const device=f.stations[0];const response=await fetch(base+'/api/cashier/operator/sync/sale',{method:'POST',signal:AbortSignal.timeout(15000),headers:{'Content-Type':'application/json','x-fawri-cashier-station-token':device.stationToken,'x-fawri-cashier-device-id':device.deviceId,...(token?{'x-fawri-cashier-operator-token':token}:{}),...overrides},body:JSON.stringify(payload)});return {status:response.status,body:await response.json()};
    }
    async function login(f){
      const member=await staff.createCashierStaffAuthoritative({merchantId:f.merchantId,displayName:'Synthetic sequence cashier',role:'cashier',pin:'2468',permissions:['sale.create','sale.view_own']});
      const device=f.stations[0],response=await fetch(base+'/api/cashier/operator/login',{method:'POST',signal:AbortSignal.timeout(15000),headers:{'Content-Type':'application/json','x-fawri-cashier-station-token':device.stationToken,'x-fawri-cashier-device-id':device.deviceId},body:JSON.stringify({staff_id:member.id,pin:'2468'})});
      const body=await response.json();assert.equal(response.status,200,JSON.stringify(body));return {member,token:body.operator_token,context:body.context};
    }
    async function snapshot(f){const state={};for(const table of ['orders','order_items','inventory_mutations','cashier_device_operation_timeline','location_inventory_levels','cashier_operation_attribution'])state[table]=(await pool.query(`SELECT to_jsonb(t) AS row FROM ${table} t WHERE merchant_id=$1 ORDER BY to_jsonb(t)::text`,[f.merchantId])).rows;return state;}
    function ack(result,body,replayed){assert.equal(result.status,200,JSON.stringify(result.body));assert.equal(result.body.replayed,replayed);assert.equal(result.body.operation_id,body.operation_id);assert.equal(Number(result.body.device_sequence),body.device_sequence);assert.deepEqual(new Set(result.body.accepted_entity_ids),new Set(body.envelopes.map(x=>x.entity_id)));assert.equal(result.body.inventory_mutation_count,replayed?0:1);}
    const own=await login(target),other=await login(peer);
    await pool.query('SELECT pg_sleep(0.02)');const occurredAt=(await pool.query('SELECT clock_timestamp() AS instant')).rows[0].instant.toISOString();
    const bodies=new Map([1,2,3].map(sequence=>[sequence,saleBody(target,target.stations[0],occurredAt,sequence)]));
    const ordered=new Map([1,2,3].map(sequence=>[sequence,saleBody(peer,peer.stations[0],occurredAt,sequence)]));
    for(const sequence of [1,2,3])ack(await request(peer,other.token,ordered.get(sequence)),ordered.get(sequence),false);
    const peerBefore=await snapshot(peer);assert.equal(peerBefore.orders.length,3);assert.deepEqual(peerBefore.cashier_device_operation_timeline.map(x=>Number(x.row.device_sequence)).sort((a,b)=>a-b),[1,2,3]);
    const before=await snapshot(target);
    const missing=await request(target,null,bodies.get(1));assert.equal(missing.status,400);assert.equal(missing.body.code,'CASHIER_STAFF_INPUT_INVALID');
    assert.equal((await request(target,'synthetic-invalid-operator-token',bodies.get(1))).status,401);
    assert.equal((await request(target,own.token,bodies.get(1),{'x-fawri-cashier-device-id':'synthetic-wrong-device'})).status,401);
    assert.equal((await request(target,own.token,bodies.get(1),{'x-fawri-cashier-station-token':'synthetic-wrong-token'})).status,401);
    assert.equal((await request(peer,other.token,bodies.get(1))).status,403);
    assert.deepEqual(await snapshot(target),before);assert.deepEqual(await snapshot(peer),peerBefore);
    for(const sequence of [1,3])ack(await request(target,own.token,bodies.get(sequence)),bodies.get(sequence),false);
    const accepted=await snapshot(target);assert.equal(accepted.orders.length,2);assert.equal(accepted.inventory_mutations.length,2);assert.equal(accepted.cashier_operation_attribution.length,2);
    assert.deepEqual(accepted.cashier_device_operation_timeline.map(x=>Number(x.row.device_sequence)).sort((a,b)=>a-b),[1,3]);
    const level=accepted.location_inventory_levels.find(x=>x.row.location_id===target.locationId&&x.row.product_id===target.productId&&x.row.variant_id===null);assert.equal(Number(level.row.quantity),1);
    for(const attribution of accepted.cashier_operation_attribution){assert.equal(attribution.row.staff_id,own.member.id);assert.equal(attribution.row.shift_id,own.context.shift_id);assert.equal(attribution.row.operator_session_id,own.context.operator_session_id);}
    for(let attempt=0;attempt<2;attempt++){const late=await request(target,own.token,bodies.get(2));assert.equal(late.status,409,JSON.stringify(late.body));assert.equal(late.body.code,'CASHIER_OPERATION_SEQUENCE_CONFLICT');assert.deepEqual(await snapshot(target),accepted);}
    for(const sequence of [1,3])ack(await request(target,own.token,bodies.get(sequence)),bodies.get(sequence),true);
    assert.deepEqual(await snapshot(target),accepted);assert.deepEqual(await snapshot(peer),peerBefore);
    const version=(await pool.query('SELECT version FROM merchant_cashier_staff WHERE id=$1',[own.member.id])).rows[0].version;
    await staff.updateCashierStaffAuthoritative({merchantId:target.merchantId,staffId:own.member.id,expectedVersion:version,status:'disabled'});
    assert.equal((await request(target,own.token,bodies.get(2))).status,401);assert.deepEqual(await snapshot(target),accepted);assert.deepEqual(await snapshot(peer),peerBefore);
    const fault=await fixture(),faultLogin=await login(fault);
    await pool.query('SELECT pg_sleep(0.02)');const faultAt=(await pool.query('SELECT clock_timestamp() AS instant')).rows[0].instant.toISOString();
    const faultBody=saleBody(fault,fault.stations[0],faultAt),trigger='attribution_fault_'+randomUUID().replaceAll('-','');
    let partial;
    try{
      await pool.query(`CREATE FUNCTION public.${trigger}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.merchant_id='${fault.merchantId}' THEN RAISE EXCEPTION 'synthetic operator attribution fault'; END IF; RETURN NEW; END $$`);
      await pool.query(`CREATE TRIGGER ${trigger} BEFORE INSERT ON cashier_operation_attribution FOR EACH ROW EXECUTE FUNCTION public.${trigger}()`);
      const failed=await request(fault,faultLogin.token,faultBody);assert.equal(failed.status,500,JSON.stringify(failed.body));
      partial=await snapshot(fault);assert.equal(partial.orders.length,1);assert.equal(partial.inventory_mutations.length,1);assert.equal(partial.cashier_device_operation_timeline.length,1);assert.equal(partial.cashier_operation_attribution.length,0);
      const stock=partial.location_inventory_levels.find(x=>x.row.location_id===fault.locationId&&x.row.product_id===fault.productId&&x.row.variant_id===null);assert.equal(Number(stock.row.quantity),0);
      assert.equal((await request(fault,faultLogin.token,faultBody)).status,500);assert.deepEqual(await snapshot(fault),partial,'failed attribution retry must not repeat committed sale or stock delta');
    }finally{
      await pool.query(`DROP TRIGGER IF EXISTS ${trigger} ON cashier_operation_attribution`);await pool.query(`DROP FUNCTION IF EXISTS public.${trigger}()`);
    }
    ack(await request(fault,faultLogin.token,faultBody),faultBody,true);
    const repaired=await snapshot(fault);assert.equal(repaired.cashier_operation_attribution.length,1);assert.equal(repaired.cashier_operation_attribution[0].row.staff_id,faultLogin.member.id);
    for(const table of Object.keys(partial).filter(x=>x!=='cashier_operation_attribution'))assert.deepEqual(repaired[table],partial[table],'repair must preserve committed '+table);
    ack(await request(fault,faultLogin.token,faultBody),faultBody,true);assert.deepEqual(await snapshot(fault),repaired);assert.deepEqual(await snapshot(peer),peerBefore);
    console.log('P0_OPERATOR_POSTCOMMIT_ATTRIBUTION_FAULT '+JSON.stringify({actualHttp:true,injectedBoundary:'attribution_insert_after_sale_commit',failedResponses:2,status:500,durableOrdersBeforeRetry:1,durableInventoryMutationsBeforeRetry:1,attributionsBeforeRetry:0,repairedAttributions:1,retryReplayed:true,retryInventoryMutations:0,peerPreserved:true,hostedAccepted:false}));
    console.log('P0_SEQUENCE_OPERATOR_HTTP_DIAGNOSTIC '+JSON.stringify({actualMountedRouters:true,realOperatorLogin:true,realStationCredential:true,restrictedPrimaryLogin:true,separateAuthenticationLogin:true,orderedAccepted:[1,2,3],gapAccepted:[1,3],lateSequence:2,lateStatus:409,lateAttempts:2,orders:2,inventoryMutations:2,attributions:2,remainingStock:1,exactAckIdentity:true,replayNoMutation:true,peerPreserved:true,missingOperatorTokenDenied:400,invalidOperatorTokenDenied:401,wrongDeviceDenied:401,wrongStationDenied:401,foreignTenantDenied:403,disabledSessionDenied:401,recoveryContractAccepted:false,fullApp:false,hostedAccepted:false}));
    // This passing diagnostic documents unresolved gap recovery. It does not
    // authorize dropping a real late sale or synthesizing a tombstone.
  });
  for (const kind of ['return', 'void']) {
  const f = await fixture(), device = f.stations[0];
  const member = await staff.createCashierStaffAuthoritative({ merchantId: f.merchantId,
    displayName: 'Synthetic recovery cashier', role: 'cashier', pin: '2468', permissions: ['sale.create', 'sale.return', 'sale.void', 'sale.view_own'] });
  async function request(path, token, payload, deviceId = device.deviceId, stationToken = device.stationToken) {
    const response = await fetch(base + path, { method: 'POST', signal: AbortSignal.timeout(15000), headers: {
      'Content-Type': 'application/json', 'x-fawri-cashier-station-token': stationToken,
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

  const sale = body.envelopes[0].payload;
  const compId = `audit-${kind}-${randomUUID()}`;
  const compAt = new Date(new Date(occurredAt).getTime() + 1).toISOString();
  const identity = { ...Object.fromEntries(Object.entries(body).filter(([key]) => key !== 'envelopes')),
    operation_id: compId, device_sequence: 2 };
  const returnId = `return-${randomUUID()}`;
  const snapshot = kind === 'return' ? { ...identity, refund_pricing_version: 2, return_id: returnId,
    sale_id: sale.sale_id, lines: [{ original_line_id: sale.lines[0].line_id, product_id: f.productId,
      quantity: 1, effective_unit_price_minor: 1000, refund_minor: 1000 }], refund_total_minor: 1000,
    currency_code: 'IQD', currency_fraction_digits: 0, occurred_at: compAt } : { ...sale, status: 'voided',
      void: { operation_id: compId, sale_id: sale.sale_id, device_id: device.deviceId, device_sequence: 2,
        refund_total_minor: 1000, currency_code: 'IQD', currency_fraction_digits: 0, occurred_at: compAt } };
  const movement = { ...identity, movement_id: `comp-movement-${randomUUID()}`, product_id: f.productId,
    delta: 1, reason: kind === 'return' ? 'return' : 'sale_void', related_sale_id: sale.sale_id, occurred_at: compAt };
  const envelope = (entity_type, entity_id, operation, payload) => ({ schema_version: 1,
    operation_id: compId, device_id: device.deviceId, device_sequence: 2, occurred_at: compAt,
    entity_type, entity_id, operation, payload });
  const compensation = { ...identity, envelopes: [envelope(kind === 'return' ? 'return' : 'sale',
    kind === 'return' ? returnId : sale.sale_id, kind === 'return' ? 'append' : 'void', snapshot),
    envelope('inventory_movement', movement.movement_id, 'append', movement)] };
  const ownScope = await request(`/api/cashier/operator/sync/${kind}`, restored.operator_token, compensation);
  assert.equal(ownScope.status, 403, JSON.stringify(ownScope.body));
  assert.equal(ownScope.body.code, 'CASHIER_OPERATOR_SALE_SCOPE_FORBIDDEN');
  assert.equal((await pool.query('SELECT count(*)::int AS n FROM cashier_operation_attribution WHERE merchant_id=$1', [f.merchantId])).rows[0].n, 1);
  const version = (await pool.query('SELECT version FROM merchant_cashier_staff WHERE id=$1', [member.id])).rows[0].version;
  await staff.updateCashierStaffAuthoritative({ merchantId: f.merchantId, staffId: member.id,
    expectedVersion: version, role: 'manager', permissions: ['sale.create', 'sale.return', 'sale.void', 'sale.view_all'] });
  const privileged = await request('/api/cashier/operator/login', null, { staff_id: member.id, pin: '2468' });
  assert.equal(privileged.status, 200, JSON.stringify(privileged.body));
  await t.test(`${kind} stream review/active fences canonical legacy compensation and replay`,async()=>{
    const id='comp-fence-'+randomUUID();
    await pool.query('INSERT INTO cashier_device_streams(id,merchant_id,device_id) VALUES($1,$2,$3)',[id,f.merchantId,device.deviceId]);
    async function snapshot(){const state={};for(const table of ['orders','order_items','inventory_mutations','cashier_device_operation_timeline','location_inventory_levels','cashier_operation_attribution','cashier_device_streams','cashier_operation_receipts'])state[table]=(await pool.query(`SELECT to_jsonb(t) AS row FROM ${table} t WHERE merchant_id=ANY($1::text[]) ORDER BY to_jsonb(t)::text`,[owned])).rows;return state;}
    try{for(const state of ['review','active']){
      if(state==='active')await pool.query("UPDATE cashier_device_streams SET state='active',enrollment_evidence_hash=repeat('b',64),enrolled_at=now(),version=version+1 WHERE id=$1",[id]);
      const before=await snapshot(),code=state==='review'?'CASHIER_OPERATION_STREAM_REVIEW_REQUIRED':'CASHIER_OPERATION_STREAM_PROTOCOL_REQUIRED';
      const denied=await request(`/api/cashier/operator/sync/${kind}`,privileged.body.operator_token,compensation);
      assert.equal(denied.status,409,JSON.stringify(denied.body));assert.equal(denied.body.code,code);assert.equal(denied.body.accepted_entity_ids,undefined);
      const core=await import('../src/services/postgresCashierCompensationSyncAuthority.ts');
      await assert.rejects(core.syncCashierCompensationAuthoritative({merchantId:f.merchantId,body:compensation}),error=>error.code===code);
      assert.deepEqual(await snapshot(),before);
    }}finally{await pool.query('DELETE FROM cashier_device_streams WHERE id=$1',[id]);}
  });
  const compensated = await request(`/api/cashier/operator/sync/${kind}`, privileged.body.operator_token, compensation);
  assert.equal(compensated.status, 200, JSON.stringify(compensated.body));
  assert.equal(compensated.body.compensation_kind, kind);
  assert.equal(compensated.body.replayed, false);
  assert.deepEqual(new Set(compensated.body.accepted_entity_ids), new Set(compensation.envelopes.map(e => e.entity_id)));
  const savedComp = (await pool.query('SELECT staff_id,shift_id,operator_session_id FROM cashier_operation_attribution WHERE merchant_id=$1 AND operation_id=$2', [f.merchantId, compId])).rows[0];
  assert.deepEqual(savedComp, { staff_id: member.id, shift_id: original.context.shift_id,
    operator_session_id: original.context.operator_session_id });
  const repeatComp = await request(`/api/cashier/operator/sync/${kind}`, privileged.body.operator_token, compensation);
  assert.equal(repeatComp.status, 200, JSON.stringify(repeatComp.body));
  assert.equal(repeatComp.body.replayed, true);
  assert.equal(repeatComp.body.inventory_mutation_count, 0);
  assert.equal((await pool.query('SELECT quantity FROM location_inventory_levels WHERE merchant_id=$1 AND location_id=$2 AND product_id=$3 AND variant_id IS NULL', [f.merchantId, f.locationId, f.productId])).rows[0].quantity, 1);

  await t.test(`${kind} exact legacy replay requires explicit mapping once a stream exists`,async()=>{
    const id='replay-fence-'+randomUUID();await pool.query("INSERT INTO cashier_device_streams(id,merchant_id,device_id,state,enrollment_evidence_hash,enrolled_at) VALUES($1,$2,$3,'active',repeat('c',64),now())",[id,f.merchantId,device.deviceId]);
    try{const before=(await pool.query('SELECT to_jsonb(t) AS row FROM orders t WHERE merchant_id=$1 ORDER BY id',[f.merchantId])).rows;
      const denied=await request(`/api/cashier/operator/sync/${kind}`,privileged.body.operator_token,compensation);
      assert.equal(denied.status,409,JSON.stringify(denied.body));assert.equal(denied.body.code,'CASHIER_OPERATION_STREAM_PROTOCOL_REQUIRED');assert.equal(denied.body.accepted_entity_ids,undefined);
      assert.deepEqual((await pool.query('SELECT to_jsonb(t) AS row FROM orders t WHERE merchant_id=$1 ORDER BY id',[f.merchantId])).rows,before);
      assert.equal((await pool.query('SELECT count(*)::int AS n FROM cashier_operation_receipts WHERE merchant_id=$1',[f.merchantId])).rows[0].n,0);
    }finally{await pool.query('DELETE FROM cashier_device_streams WHERE id=$1',[id]);}
  });
  // Real second licensed tenant: denied at the HTTP boundary, not only by a
  // mocked merchant-id adapter. The body remains the original tenant's bundle.
  const otherTenant = await fixture(), otherDevice = otherTenant.stations[0];
  const otherManager = await staff.createCashierStaffAuthoritative({ merchantId: otherTenant.merchantId,
    displayName: 'Other synthetic tenant', role: 'manager', pin: '1357',
    permissions: ['sale.create', 'sale.return', 'sale.void', 'sale.view_all'] });
  const otherLogin = await request('/api/cashier/operator/login', null, { staff_id: otherManager.id, pin: '1357' }, otherDevice.deviceId, otherDevice.stationToken);
  assert.equal(otherLogin.status, 200, JSON.stringify(otherLogin.body));
  const tenantDenied = await request(`/api/cashier/operator/sync/${kind}`, otherLogin.body.operator_token,
    compensation, otherDevice.deviceId, otherDevice.stationToken);
  assert.equal(tenantDenied.status, 403, JSON.stringify(tenantDenied.body));
  assert.equal((await pool.query('SELECT count(*)::int AS n FROM orders WHERE merchant_id=$1', [otherTenant.merchantId])).rows[0].n, 0);
  const currentVersion = (await pool.query('SELECT version FROM merchant_cashier_staff WHERE id=$1', [member.id])).rows[0].version;
  const actionRemoved = await staff.updateCashierStaffAuthoritative({ merchantId: f.merchantId, staffId: member.id,
    expectedVersion: currentVersion, permissions: ['sale.create', 'sale.view_all'] });
  const noActionLogin = await request('/api/cashier/operator/login', null, {staff_id: member.id, pin:'2468'});
  assert.equal(noActionLogin.status,200,JSON.stringify(noActionLogin.body));
  const actionDenied = await request(`/api/cashier/operator/sync/${kind}`, noActionLogin.body.operator_token, compensation);
  assert.equal(actionDenied.status,403,JSON.stringify(actionDenied.body));
  // A distinct cashier with action+view_own is also denied; this is an ordinary
  // supported administrative closure, not handcrafted operator authentication.
  await staff.updateCashierStaffAuthoritative({ merchantId:f.merchantId,staffId:member.id,
    expectedVersion:actionRemoved.version,status:'disabled' });
  const colleague = await staff.createCashierStaffAuthoritative({merchantId:f.merchantId,
    displayName:'Other synthetic cashier',role:'cashier',pin:'3579',permissions:['sale.create','sale.return','sale.void','sale.view_own']});
  const colleagueLogin = await request('/api/cashier/operator/login',null,{staff_id:colleague.id,pin:'3579'});
  assert.equal(colleagueLogin.status,200,JSON.stringify(colleagueLogin.body));
  const staffDenied = await request(`/api/cashier/operator/sync/${kind}`,colleagueLogin.body.operator_token,compensation);
  assert.equal(staffDenied.status,403,JSON.stringify(staffDenied.body));
  assert.equal(staffDenied.body.code,'CASHIER_OPERATOR_SALE_SCOPE_FORBIDDEN');
  assert.equal((await pool.query('SELECT count(*)::int AS n FROM cashier_operation_attribution WHERE merchant_id=$1',[f.merchantId])).rows[0].n,2);
  assert.equal((await pool.query('SELECT quantity FROM location_inventory_levels WHERE merchant_id=$1 AND location_id=$2 AND product_id=$3 AND variant_id IS NULL',[f.merchantId,f.locationId,f.productId])).rows[0].quantity,1);
  console.log('AUDIT_COMPENSATION_HTTP_DENIALS '+JSON.stringify({kind,otherTenant:tenantDenied.status,
    missingActionPermission:actionDenied.status,otherStaff:staffDenied.status,attributions:2,stock:1}));
  console.log('AUDIT_HISTORICAL_COMPENSATION_RESULT ' + JSON.stringify({ kind, ownScope: ownScope.body.code,
    privilegedStatus: compensated.status, replayed: repeatComp.body.replayed, originalAttribution: true, stock: 1 }));
  }
});
