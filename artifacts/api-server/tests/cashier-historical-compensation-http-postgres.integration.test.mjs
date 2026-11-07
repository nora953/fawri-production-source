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
  const {default: cookieParser} = await import('cookie-parser');
  const app = express();
  app.use(cookieParser());
  app.use(express.json()); app.use('/api', staffRouter, commerceRouter);
  server = await new Promise((resolve, reject) => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); s.once('error', reject); });
  const base = `http://127.0.0.1:${server.address().port}`;

  async function reviewEnrollmentHistory(scope, merchantId, deviceId) {
    const {reviewCashierDeviceEnrollmentHistory} = await import('../src/services/cashierDeviceHistoryAssessment.ts');
    return operational.withMerchantOperationalTransaction(scope, async client => {
      await client.query('SET TRANSACTION READ ONLY');
      assert.equal((await client.query('SHOW transaction_read_only')).rows[0].transaction_read_only,'on');
      const result = await reviewCashierDeviceEnrollmentHistory({target:client,merchantId,deviceId});
      assert.equal(result.enrollmentAuthorized,false);
      assert.equal(result.statementSnapshotOnly,true);
      return result;
    });
  }
  async function assertNoProtocolDowngrade(body, httpRequest, coreRequest) {
    async function snapshot() {
      const state = {};
      for (const table of ['orders','order_items','inventory_mutations','cashier_device_operation_timeline','location_inventory_levels','cashier_operation_attribution','cashier_device_streams','cashier_operation_receipts']) {
        state[table] = (await pool.query(`SELECT to_jsonb(t) AS row FROM ${table} t WHERE merchant_id=ANY($1::text[]) ORDER BY to_jsonb(t)::text`, [owned])).rows;
      }
      return state;
    }
    const before = await snapshot();
    for (const marker of [{protocol_version:2}, {stream_id:'unverified-stream'}, {protocol_version:1,stream_id:'unverified-stream'}, {protocol_version:null}, {protocol_version:'2'}, {stream_id:null}]) {
      const candidate = {...body,...marker};
      const denied = await httpRequest(candidate);
      assert.equal(denied.status,409,JSON.stringify(denied.body));
      assert.equal(denied.body.code,'CASHIER_SYNC_PROTOCOL_UNSUPPORTED');
      assert.equal(denied.body.accepted_entity_ids,undefined);
      assert.equal(denied.body.order_id,undefined);
      await assert.rejects(coreRequest(candidate), error => error.code === 'CASHIER_SYNC_PROTOCOL_UNSUPPORTED');
      assert.deepEqual(await snapshot(),before,'unsupported protocol cannot write or receive legacy replay ACK');
    }
  }

  await t.test('existing merchant pairing service redeems through mounted HTTP without financial history reset', async () => {
    const f = await fixture();
    const station = f.stations[0];
    const tables = ['orders', 'order_items', 'inventory_mutations', 'cashier_device_operation_timeline',
      'cashier_operation_attribution', 'cashier_device_streams', 'cashier_operation_receipts'];
    async function snapshot() {
      const state = {};
      for (const table of tables) {
        state[table] = (await pool.query(
          `SELECT to_jsonb(t) AS row FROM ${table} t WHERE merchant_id=$1 ORDER BY to_jsonb(t)::text`,
          [f.merchantId],
        )).rows;
      }
      return state;
    }
    async function redeem(code, deviceId) {
      const response = await fetch(base + '/api/cashier/station/pair', {
        method: 'POST', signal: AbortSignal.timeout(15000),
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({pairing_code: code, device_id: deviceId}),
      });
      return {status: response.status, body: await response.json()};
    }
    const before = await snapshot();
    const {authPostgresSessionAuthority: sessionAuthority} =
      await import('../src/services/authPostgresSessionAuthority.ts');
    const {MERCHANT_SESSION_COOKIE} = await import('../src/middleware/authSession.ts');
    const device = 'pairing-merchant-' + randomUUID();
    const session = await sessionAuthority.issueSession({
      accountId: f.merchantId, accountKind: 'merchant', tenantId: f.merchantId,
      deviceId: device,
    });
    async function issuePairing() {
      const response = await fetch(
        base + '/api/cashier/management/stations/' + encodeURIComponent(station.stationId) + '/pairing',
        {method: 'POST', signal: AbortSignal.timeout(15000),
          headers: {Cookie: MERCHANT_SESSION_COOKIE + '=' + session.token,
            'X-Fawri-Device-Id': device, 'Content-Type': 'application/json'},
          body: JSON.stringify({})},
      );
      return {status: response.status, body: await response.json()};
    }
    const unauthenticated = await fetch(
      base + '/api/cashier/management/stations/' + encodeURIComponent(station.stationId) + '/pairing',
      {method: 'POST', signal: AbortSignal.timeout(15000),
        headers: {'Content-Type': 'application/json'}, body: JSON.stringify({})},
    );
    const unauthenticatedBody = await unauthenticated.json();
    assert.equal(unauthenticated.status, 401, JSON.stringify(unauthenticatedBody));
    assert.equal(unauthenticatedBody.code, 'SESSION_REQUIRED');
    assert.deepEqual(await snapshot(), before, 'missing merchant session must not rewrite financial history');
    const unauthenticatedChallenges = await pool.query(
      'SELECT id FROM cashier_station_pairing_challenges WHERE merchant_id=$1 AND station_id=$2',
      [f.merchantId, station.stationId],
    );
    assert.equal(unauthenticatedChallenges.rows.length, 0, 'anonymous request must not issue a pairing challenge');
    const peer = await fixture();
    const peerDevice = 'pairing-peer-' + randomUUID();
    const peerSession = await sessionAuthority.issueSession({
      accountId: peer.merchantId, accountKind: 'merchant',
      tenantId: peer.merchantId, deviceId: peerDevice,
    });
    const beforePeer = await snapshot();
    const foreign = await fetch(
      base + '/api/cashier/management/stations/' + encodeURIComponent(station.stationId) + '/pairing',
      {method: 'POST', signal: AbortSignal.timeout(15000),
        headers: {Cookie: MERCHANT_SESSION_COOKIE + '=' + peerSession.token,
          'X-Fawri-Device-Id': peerDevice, 'Content-Type': 'application/json'},
        body: JSON.stringify({})},
    );
    const foreignBody = await foreign.json();
    assert.equal(foreign.status, 404, JSON.stringify(foreignBody));
    assert.equal(foreignBody.ok, false);
    assert.deepEqual(await snapshot(), beforePeer, 'foreign merchant must not mutate target financial history');
    const foreignChallenges = await pool.query(
      'SELECT id FROM cashier_station_pairing_challenges WHERE merchant_id=$1 AND station_id=$2',
      [peer.merchantId, station.stationId],
    );
    assert.equal(foreignChallenges.rows.length, 0, 'foreign merchant must not issue a pairing challenge');
    assert.deepEqual(await snapshot(), before, 'cross-tenant rejection must preserve financial history');
    const challengeResponse = await issuePairing();
    assert.equal(challengeResponse.status, 201, JSON.stringify(challengeResponse.body));
    const challenge = challengeResponse.body;
    const paired = await redeem(challenge.pairing_code, station.deviceId);
    assert.equal(paired.status, 200, JSON.stringify(paired.body));
    assert.equal(paired.body.merchant_id, f.merchantId);
    assert.equal(paired.body.station_id, station.stationId);
    assert.deepEqual(await snapshot(), before, 're-pair must not rewrite financial history');
    const reused = await redeem(challenge.pairing_code, 'unexpected-' + randomUUID());
    assert.equal(reused.status, 401, JSON.stringify(reused.body));
    assert.equal(reused.body.code, 'CASHIER_PAIRING_INVALID');
    assert.deepEqual(await snapshot(), before, 'reused pairing code must not rewrite financial history');
    const replacement = 'replacement-' + randomUUID();
    const secondResponse = await issuePairing();
    assert.equal(secondResponse.status, 201, JSON.stringify(secondResponse.body));
    const replaced = await redeem(secondResponse.body.pairing_code, replacement);
    assert.equal(replaced.status, 200, JSON.stringify(replaced.body));
    assert.deepEqual(await snapshot(), before, 'replacement must not reset original financial history');
    const stream = await pool.query(
      'SELECT id FROM cashier_device_streams WHERE merchant_id=$1 AND device_id=$2',
      [f.merchantId, replacement],
    );
    assert.equal(stream.rows.length, 0, 'pairing cannot silently enroll a financial stream');
  });

  await t.test('internal v2 canonical financial receipt and checkpoint transactions', {timeout:120000}, async v2t=>{
    const {readFile}=await import('node:fs/promises');
    const commerce=await import('../src/services/cashierOperatorCommerceAuthority.ts');
    const v2Ids=[];
    let installed=false;
    v2t.after(()=>cleanupResources([
      ['v2 data',async()=>{
        if(!installed)return;
        const c=await pool.connect();
        try{await c.query('BEGIN');await c.query('ALTER TABLE cashier_operation_receipts DISABLE TRIGGER cashier_operation_receipts_guard');
          await c.query('DELETE FROM cashier_operation_receipts WHERE merchant_id=ANY($1::text[])',[v2Ids]);
          await c.query('ALTER TABLE cashier_operation_receipts ENABLE TRIGGER cashier_operation_receipts_guard');
          await c.query('ALTER TABLE cashier_stream_enrollment_reviews DISABLE TRIGGER cashier_stream_enrollment_reviews_immutable');
          await c.query('DELETE FROM cashier_stream_enrollment_reviews WHERE merchant_id=ANY($1::text[])',[v2Ids]);
          await c.query('ALTER TABLE cashier_stream_enrollment_reviews ENABLE TRIGGER cashier_stream_enrollment_reviews_immutable');
          await c.query('DELETE FROM cashier_device_streams WHERE merchant_id=ANY($1::text[])',[v2Ids]);await c.query('COMMIT');
        }catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}
      }],
      ['v2 proposal',async()=>{
        if(!installed)return;
        await pool.query('DROP FUNCTION public.fawri_commit_cashier_financial_receipt(jsonb)');
        await pool.query('DROP FUNCTION public.fawri_lock_cashier_financial_stream(text,text,text)');
        await pool.query('DROP FUNCTION public.fawri_cashier_stream_financial_runtime()');
        for(const [name,table]of [['receipt_owner_stream_read','cashier_device_streams'],['receipt_owner_stream_update','cashier_device_streams'],['receipt_owner_receipt_read','cashier_operation_receipts'],['receipt_owner_receipt_insert','cashier_operation_receipts'],['receipt_owner_order_read','orders'],['receipt_owner_session_read','cashier_operator_sessions'],['receipt_owner_shift_read','cashier_shifts'],['receipt_owner_station_read','merchant_cashier_stations'],['receipt_owner_credential_read','cashier_station_credentials']])await pool.query('DROP POLICY '+name+' ON public.'+table);
        await pool.query('DROP OWNED BY fawri_cashier_receipt_owner');await pool.query('DROP ROLE fawri_cashier_receipt_owner');
        await pool.query('DROP FUNCTION public.fawri_enroll_reviewed_empty_cashier_stream(text,jsonb)');
        await pool.query('DROP TABLE public.cashier_stream_enrollment_reviews');
        await pool.query('DROP FUNCTION public.fawri_enrollment_review_immutable()');
        await pool.query('DROP FUNCTION public.fawri_cashier_enrollment_runtime()');
        for(const [name,table]of [['enrollment_owner_stream_read','cashier_device_streams'],['enrollment_owner_stream_insert','cashier_device_streams'],['enrollment_owner_timeline_read','cashier_device_operation_timeline'],['enrollment_owner_attribution_read','cashier_operation_attribution'],['enrollment_owner_order_read','orders'],['enrollment_owner_station_read','merchant_cashier_stations'],['enrollment_owner_station_lock','merchant_cashier_stations'],['enrollment_owner_merchant_read','merchants'],['enrollment_owner_merchant_lock','merchants']])await pool.query('DROP POLICY '+name+' ON public.'+table);
        await pool.query('DROP OWNED BY fawri_cashier_enrollment_owner');await pool.query('DROP ROLE fawri_cashier_enrollment_owner');
      }],
    ]));
    const ddl=await readFile(new URL('../../../docs/final-audit/evidence/seq-d3-financial-receipt-proposal.sql',import.meta.url),'utf8');
    const setup=await pool.connect();try{await setup.query('BEGIN');await setup.query(ddl);await setup.query(await readFile(new URL('../../../docs/final-audit/evidence/seq-d3-reviewed-empty-enrollment-proposal.sql',import.meta.url),'utf8'));await setup.query('COMMIT');installed=true;}catch(e){await setup.query('ROLLBACK');throw e;}finally{setup.release();}
    async function create(withStream=true){
      const f=await fixture(3);v2Ids.push(f.merchantId);
      const member=await staff.createCashierStaffAuthoritative({merchantId:f.merchantId,displayName:'Synthetic v2 manager',role:'manager',pin:'2468',permissions:['sale.create','sale.return','sale.void','sale.view_all']});
      const d=f.stations[0],r=await fetch(base+'/api/cashier/operator/login',{method:'POST',signal:AbortSignal.timeout(15000),headers:{'Content-Type':'application/json','x-fawri-cashier-station-token':d.stationToken,'x-fawri-cashier-device-id':d.deviceId},body:JSON.stringify({staff_id:member.id,pin:'2468'})});
      const login=await r.json();assert.equal(r.status,200,JSON.stringify(login));
      const streamId='receipt-stream-'+randomUUID(),at=(await pool.query('SELECT clock_timestamp() AS instant')).rows[0].instant.toISOString();
      const body=saleBody(f,d,at);
      if(withStream)await activate(f,streamId);
      return {f,body,streamId,context:login.context,token:login.operator_token};
    }
    async function activate(f,streamId){await pool.query("INSERT INTO cashier_device_streams(id,merchant_id,device_id,state,enrollment_evidence_hash,enrolled_at) VALUES($1,$2,$3,'active',repeat('d',64),now())",[streamId,f.merchantId,f.stations[0].deviceId]);}
    function versioned(x,body){return {...body,protocol_version:2,stream_id:x.streamId};}
    const sell=(x,body=x.body)=>commerce.syncCashierOperatorSaleAuthoritative({context:x.context,body:versioned(x,body),versionedStreamId:x.streamId});
    const compensate=(x,body,kind)=>commerce.syncCashierOperatorCompensationAuthoritative({context:x.context,body:versioned(x,body),kind,versionedStreamId:x.streamId});
    async function snapshot(){const state={};for(const table of ['orders','order_items','inventory_mutations','location_inventory_levels','cashier_device_operation_timeline','cashier_operation_attribution','cashier_device_streams','cashier_operation_receipts','cashier_stream_enrollment_reviews'])state[table]=(await pool.query(`SELECT to_jsonb(t) AS row FROM ${table} t WHERE merchant_id=ANY($1::text[]) ORDER BY to_jsonb(t)::text`,[v2Ids])).rows;return state;}
    function compensation(x,body,kind,sequence){
      const sale=body.envelopes[0].payload,op='v2-comp-'+randomUUID(),at=new Date(Date.parse(body.envelopes[0].occurred_at)+sequence).toISOString(),returnId='v2-return-'+randomUUID();
      const identity={local_merchant_id:body.local_merchant_id,cloud_merchant_id:body.cloud_merchant_id,device_id:body.device_id,operation_id:op,device_sequence:sequence};
      const payload=kind==='return'?{...identity,refund_pricing_version:2,return_id:returnId,sale_id:sale.sale_id,lines:[{original_line_id:sale.lines[0].line_id,product_id:x.f.productId,quantity:1,effective_unit_price_minor:1000,refund_minor:1000}],refund_total_minor:1000,currency_code:'IQD',currency_fraction_digits:0,occurred_at:at}:{...sale,status:'voided',void:{operation_id:op,sale_id:sale.sale_id,device_id:body.device_id,device_sequence:sequence,refund_total_minor:1000,currency_code:'IQD',currency_fraction_digits:0,occurred_at:at}};
      const movement={...identity,movement_id:'v2-movement-'+randomUUID(),product_id:x.f.productId,delta:1,reason:kind==='return'?'return':'sale_void',related_sale_id:sale.sale_id,occurred_at:at};
      const envelope=(entity_type,entity_id,operation,payload)=>({schema_version:1,operation_id:op,device_id:body.device_id,device_sequence:sequence,occurred_at:at,entity_type,entity_id,operation,payload});
      return {...identity,envelopes:[envelope(kind==='return'?'return':'sale',kind==='return'?returnId:sale.sale_id,kind==='return'?'append':'void',payload),envelope('inventory_movement',movement.movement_id,'append',movement)]};
    }
    const first=await create();
    await v2t.test('unprovisioned capability and public HTTP do not enable internal v2',async()=>{
      const before=await snapshot();await assert.rejects(sell(first),e=>e.code==='42501');
      await assert.rejects(sync.syncCashierSaleAuthoritative({merchantId:first.f.merchantId,body:versioned(first,first.body)}),e=>e.code==='CASHIER_SYNC_PROTOCOL_UNSUPPORTED');
      const d=first.f.stations[0],r=await fetch(base+'/api/cashier/operator/sync/sale',{method:'POST',signal:AbortSignal.timeout(15000),headers:{'Content-Type':'application/json','x-fawri-cashier-station-token':d.stationToken,'x-fawri-cashier-device-id':d.deviceId,'x-fawri-cashier-operator-token':first.token},body:JSON.stringify(versioned(first,first.body))});
      const result=await r.json();assert.equal(r.status,409);assert.equal(result.code,'CASHIER_SYNC_PROTOCOL_UNSUPPORTED');assert.equal(result.accepted_entity_ids,undefined);assert.deepEqual(await snapshot(),before);
    });
    await pool.query(`GRANT EXECUTE ON FUNCTION public.fawri_cashier_stream_financial_runtime(),public.fawri_lock_cashier_financial_stream(text,text,text),public.fawri_commit_cashier_financial_receipt(jsonb) TO ${runtimeFixture.role}`);
    for(const name of [runtimeFixture.role,runtimeFixture.authRole])assert.equal((await pool.query("SELECT pg_has_role($1,'fawri_cashier_receipt_owner','USAGE') OR pg_has_role($1,'fawri_cashier_receipt_owner','SET') AS member",[name])).rows[0].member,false);
    assert.equal((await pool.query("SELECT has_function_privilege($1,'public.fawri_commit_cashier_financial_receipt(jsonb)','EXECUTE') AS allowed",[runtimeFixture.authRole])).rows[0].allowed,false);
    await v2t.test('ordered sales then return and void have immutable receipts, contiguous checkpoint and exact replay',async()=>{
      const peer=await create(),peerBefore=await snapshot(),r1=await sell(first);
      assert.equal(r1.replayed,false);assert.equal(r1.protocol_version,2);assert.equal(r1.stream_id,first.streamId);
      const afterOne=await snapshot(),changed=structuredClone(first.body);changed.envelopes[0].payload.note='different request';
      await assert.rejects(sell(first,changed),e=>e.code==='CASHIER_STREAM_IDENTITY_CONFLICT');assert.deepEqual(await snapshot(),afterOne);
      const third=saleBody(first.f,first.f.stations[0],first.body.envelopes[0].occurred_at,3);
      await assert.rejects(sell(first,third),e=>e.code==='CASHIER_STREAM_SEQUENCE_GAP');assert.deepEqual(await snapshot(),afterOne);
      const second=saleBody(first.f,first.f.stations[0],first.body.envelopes[0].occurred_at,2);
      await sell(first,second);await sell(first,third);
      for(const body of [first.body,second,third]){const before=await snapshot(),r=await sell(first,body);assert.equal(r.replayed,true);assert.equal(r.inventory_mutation_count,0);assert.deepEqual(await snapshot(),before);}
      for(const [kind,body,seq]of [['return',first.body,4],['void',second,5]]){
        const comp=compensation(first,body,kind,seq),before=await snapshot(),name='receipt_fault_'+randomUUID().replaceAll('-','');
        await pool.query(`CREATE FUNCTION public.${name}() RETURNS trigger LANGUAGE plpgsql AS $receipt_fault$ BEGIN IF NEW.merchant_id='${first.f.merchantId}' THEN RAISE EXCEPTION 'synthetic receipt insertion fault'; END IF; RETURN NEW; END $receipt_fault$`);
        await pool.query(`CREATE TRIGGER ${name} BEFORE INSERT ON cashier_operation_receipts FOR EACH ROW EXECUTE FUNCTION public.${name}()`);
        try{await assert.rejects(compensate(first,comp,kind),e=>e.code==='P0001'&&e.message.includes('synthetic receipt insertion fault'));assert.deepEqual(await snapshot(),before);}
        finally{await pool.query(`DROP TRIGGER ${name} ON cashier_operation_receipts`);await pool.query(`DROP FUNCTION public.${name}()`);}
        const r=await compensate(first,comp,kind);assert.equal(r.replayed,false);assert.equal(r.stream_id,first.streamId);
        const after=await snapshot(),replay=await compensate(first,comp,kind);assert.equal(replay.replayed,true);assert.equal(replay.inventory_mutation_count,0);assert.deepEqual(await snapshot(),after);
      }
      const receipts=(await pool.query('SELECT device_sequence::text,operation_kind FROM cashier_operation_receipts WHERE merchant_id=$1 ORDER BY device_sequence',[first.f.merchantId])).rows;
      assert.deepEqual(receipts.map(x=>x.device_sequence),['1','2','3','4','5']);assert.deepEqual(receipts.map(x=>x.operation_kind),['sale','sale','sale','return','void']);
      assert.deepEqual((await pool.query('SELECT last_sequence::text,version FROM cashier_device_streams WHERE id=$1',[first.streamId])).rows[0],{last_sequence:'5',version:6});
      assert.equal((await pool.query('SELECT count(*)::int AS n FROM cashier_device_operation_timeline WHERE merchant_id=$1',[first.f.merchantId])).rows[0].n,0,'v2 uses immutable receipts, not legacy timeline writes');
      const before=await snapshot();
      await assert.rejects(commerce.syncCashierOperatorSaleAuthoritative({context:first.context,body:{...versioned(first,first.body),stream_id:peer.streamId},versionedStreamId:peer.streamId}),e=>e.code==='23514');
      assert.deepEqual(await snapshot(),before);
      for(const table of Object.keys(peerBefore)){const filter=rows=>rows.filter(x=>x.row.merchant_id===peer.f.merchantId);assert.deepEqual(filter((await snapshot())[table]),filter(peerBefore[table]));}
    });
    await v2t.test('checkpoint failure rolls back sale, stock and receipt; retry commits once',async()=>{
      const x=await create(),before=await snapshot(),name='checkpoint_fault_'+randomUUID().replaceAll('-','');
      await pool.query(`CREATE FUNCTION public.${name}() RETURNS trigger LANGUAGE plpgsql AS $receipt_fault$ BEGIN IF NEW.merchant_id='${x.f.merchantId}' AND NEW.last_sequence>OLD.last_sequence THEN RAISE EXCEPTION 'synthetic checkpoint fault'; END IF; RETURN NEW; END $receipt_fault$`);
      await pool.query(`CREATE TRIGGER ${name} BEFORE UPDATE ON cashier_device_streams FOR EACH ROW EXECUTE FUNCTION public.${name}()`);
      try{await assert.rejects(sell(x),e=>e.code==='P0001'&&e.message.includes('synthetic checkpoint fault'));assert.deepEqual(await snapshot(),before);}
      finally{await pool.query(`DROP TRIGGER ${name} ON cashier_device_streams`);await pool.query(`DROP FUNCTION public.${name}()`);}
      assert.equal((await sell(x)).replayed,false);const committed=await snapshot();assert.equal((await sell(x)).replayed,true);assert.deepEqual(await snapshot(),committed);
    });
    await v2t.test('post-commit attribution failure retains exact receipt and replay repairs original identity',async()=>{
      const x=await create(),name='v2_attribution_fault_'+randomUUID().replaceAll('-','');let partial;
      await pool.query(`CREATE FUNCTION public.${name}() RETURNS trigger LANGUAGE plpgsql AS $receipt_fault$ BEGIN IF NEW.merchant_id='${x.f.merchantId}' THEN RAISE EXCEPTION 'synthetic v2 attribution fault'; END IF; RETURN NEW; END $receipt_fault$`);
      await pool.query(`CREATE TRIGGER ${name} BEFORE INSERT ON cashier_operation_attribution FOR EACH ROW EXECUTE FUNCTION public.${name}()`);
      try{await assert.rejects(sell(x),e=>e.code==='P0001'&&e.message.includes('synthetic v2 attribution fault'));partial=await snapshot();
        const own=table=>partial[table].filter(y=>y.row.merchant_id===x.f.merchantId);
        assert.equal(own('orders').length,1);assert.equal(own('inventory_mutations').length,1);assert.equal(own('cashier_operation_receipts').length,1);assert.equal(own('cashier_operation_attribution').length,0);assert.equal(own('cashier_device_streams')[0].row.last_sequence,1);
        await assert.rejects(sell(x),e=>e.code==='P0001');assert.deepEqual(await snapshot(),partial);
      }finally{await pool.query(`DROP TRIGGER ${name} ON cashier_operation_attribution`);await pool.query(`DROP FUNCTION public.${name}()`);}
      const replay=await sell(x);assert.equal(replay.replayed,true);assert.equal(replay.inventory_mutation_count,0);
      const repaired=await snapshot();for(const table of Object.keys(partial).filter(x=>x!=='cashier_operation_attribution'))assert.deepEqual(repaired[table],partial[table]);
      const row=repaired.cashier_operation_attribution.find(y=>y.row.merchant_id===x.f.merchantId).row;assert.equal(row.staff_id,x.context.staff_id);assert.equal(row.shift_id,x.context.shift_id);
      const before=await snapshot();await sell(x);assert.deepEqual(await snapshot(),before);
    });
    await v2t.test('legacy financial effect cannot be silently adopted or directly minted into a receipt',async()=>{
      const x=await create(false);const old=await sync.syncCashierSaleAuthoritative({merchantId:x.f.merchantId,body:x.body});assert.equal(old.replayed,false);await activate(x.f,x.streamId);
      const before=await snapshot();await assert.rejects(sell(x),e=>e.code==='CASHIER_STREAM_RECONCILIATION_REQUIRED');assert.deepEqual(await snapshot(),before);
      const order=(await pool.query('SELECT metadata FROM orders WHERE id=$1',[old.order_id])).rows[0];
      const a=await commerce.resolveHistoricalOperatorAttributionContext({merchantId:x.f.merchantId,deviceId:x.f.stations[0].deviceId,occurredAt:x.body.envelopes[0].occurred_at});
      const r={stream_id:x.streamId,merchant_id:x.f.merchantId,device_id:x.f.stations[0].deviceId,device_sequence:1,operation_id:x.body.operation_id,operation_kind:'sale',request_hash:order.metadata.cashier_sync.request_hash,result_id:old.order_id,station_id:a.station_id,location_id:a.location_id,staff_id:a.staff_id,shift_id:a.shift_id,occurred_at:x.body.envelopes[0].occurred_at,operator_session_id:a.operator_session_id,credential_id:a.credential_id};
      await assert.rejects(operational.withMerchantOperationalTransaction(x.f.merchantId,c=>c.query('SELECT public.fawri_commit_cashier_financial_receipt($1::jsonb)',[JSON.stringify(r)])),e=>e.code==='23514');assert.deepEqual(await snapshot(),before);
    });


    // Install the already-reviewed enrollment proposal beside the receipt
    // proposal only in this owned fixture. The reviewer is a separate LOGIN.
    const enrollment=await import('../src/services/cashierStreamEnrollmentAuthority.ts');
    const {Pool}=await import('pg');
    const reviewerRole='receipt_review_'+randomUUID().replaceAll('-',''),reviewerPassword=randomUUID().replaceAll('-','');
    let reviewer,reviewerCreated=false;
    v2t.after(()=>cleanupResources([
      ['reviewer pool',()=>reviewer?.end()],
      ['reviewer grants',()=>reviewerCreated?pool.query('DROP OWNED BY '+reviewerRole):undefined],
      ['reviewer role',()=>reviewerCreated?pool.query('DROP ROLE '+reviewerRole):undefined],
    ]));
    await pool.query(`CREATE ROLE ${reviewerRole} LOGIN PASSWORD '${reviewerPassword}' NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION`);reviewerCreated=true;
    await pool.query('GRANT USAGE ON SCHEMA public TO '+reviewerRole);
    await pool.query('GRANT EXECUTE ON FUNCTION public.fawri_cashier_enrollment_runtime(),public.fawri_enroll_reviewed_empty_cashier_stream(text,jsonb) TO '+reviewerRole);
    const reviewerUrl=new URL(process.env.DATABASE_URL);reviewerUrl.username=reviewerRole;reviewerUrl.password=reviewerPassword;reviewerUrl.search='';
    reviewer=new Pool({connectionString:reviewerUrl.toString(),connectionTimeoutMillis:5000});
    async function reviewedEnroll(review){
      const c=await reviewer.connect();
      try{await c.query('BEGIN');const r=await enrollment.enrollReviewedEmptyCashierStreamInTransaction(c,review);await c.query('COMMIT');return r;}
      catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}
    }
    async function reviewed(){
      const x=await create(false),d=x.f.stations[0];
      x.review={merchantId:x.f.merchantId,stationId:d.stationId,deviceId:d.deviceId,reviewReference:'receipt-review-'+randomUUID(),reviewerReference:'independent-synthetic-reviewer',evidenceSha256:'e'.repeat(64),reviewedAt:new Date().toISOString(),reviewedLocalCounter:0,reviewedPendingOperations:0};
      const r=await reviewedEnroll(x.review);assert.equal(r.last_sequence,'0');assert.equal(r.version,1);assert.equal(r.replayed,false);x.streamId=r.stream_id;return x;
    }
    const own=(state,x)=>Object.fromEntries(Object.entries(state).map(([k,rows])=>[k,rows.filter(y=>y.row.merchant_id===x.f.merchantId)]));
    async function assertFinancial(x,count,last,stock){
      const state=own(await snapshot(),x);
      assert.equal(state.orders.length,count);assert.equal(state.inventory_mutations.length,count);
      assert.equal(state.cashier_operation_receipts.length,count);assert.equal(state.cashier_operation_attribution.length,count);
      assert.equal(state.cashier_device_operation_timeline.length,0);assert.equal(state.cashier_stream_enrollment_reviews.length,1);
      assert.equal(Number(state.cashier_device_streams[0].row.last_sequence),last);assert.equal(state.cashier_device_streams[0].row.version,last+1);
      const level=state.location_inventory_levels.find(y=>y.row.location_id===x.f.locationId&&y.row.product_id===x.f.productId&&y.row.variant_id===null);
      assert.equal(Number(level.row.quantity),stock);return state;
    }
    async function observedWait(blocker){
      const end=Date.now()+5000;
      while(Date.now()<end){
        const r=await pool.query('SELECT pid FROM pg_stat_activity WHERE usename=$1 AND $2::int=ANY(pg_blocking_pids(pid))',[runtimeFixture.role,blocker]);
        if(r.rows.length===1)return r.rows[0].pid;
        assert.ok(r.rows.length<=1,'one expected restricted financial waiter');
        await new Promise(resolve=>setTimeout(resolve,20));
      }
      assert.fail('restricted canonical financial transaction did not enter the observed lock wait');
    }
    // The first real receipt INSERT waits at a root-owned test barrier. Its
    // second caller must then wait on that real financial transaction's lock.
    async function overlap(x,sequence,firstCall,secondCall,rollbackFirst=false,peerCall=async()=>{}){
      const name='receipt_race_'+randomUUID().replaceAll('-',''),seq=name+'_seq',gate='receipt-barrier:'+name;
      let first,second;const blocker=await pool.connect();
      const capture=call=>Promise.resolve().then(call).then(value=>({value}),error=>({error}));
      try{
        await pool.query('CREATE SEQUENCE public.'+seq);
        await pool.query('GRANT USAGE ON SEQUENCE public.'+seq+' TO fawri_cashier_receipt_owner');
        await pool.query(`CREATE FUNCTION public.${name}() RETURNS trigger LANGUAGE plpgsql AS $race$ BEGIN IF NEW.merchant_id='${x.f.merchantId}' AND NEW.device_sequence=${sequence} THEN IF nextval('public.${seq}')=1 THEN PERFORM pg_advisory_xact_lock(hashtextextended('${gate}',0)); ${rollbackFirst?"RAISE EXCEPTION 'synthetic overlapped receipt rollback';":""} END IF; END IF; RETURN NEW; END $race$`);
        await pool.query(`CREATE TRIGGER ${name} AFTER INSERT ON cashier_operation_receipts FOR EACH ROW EXECUTE FUNCTION public.${name}()`);
        await blocker.query('BEGIN');await blocker.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[gate]);
        first=capture(firstCall);const firstPid=await observedWait(blocker.processID);
        second=capture(secondCall);const secondPid=await observedWait(firstPid);assert.notEqual(firstPid,secondPid);
        await peerCall();await blocker.query('COMMIT');
        const outcomes=await Promise.all([first,second]);return outcomes;
      }finally{
        await blocker.query('ROLLBACK');await Promise.all([first,second].filter(Boolean));blocker.release();
        await pool.query('DROP TRIGGER IF EXISTS '+name+' ON cashier_operation_receipts');
        await pool.query('DROP FUNCTION IF EXISTS public.'+name+'()');
        await pool.query('DROP SEQUENCE IF EXISTS public.'+seq);
      }
    }
    await v2t.test('reviewed enrollment hands off to canonical sale return void without checkpoint reset',async()=>{
      const x=await reviewed(),ledger=own(await snapshot(),x).cashier_stream_enrollment_reviews;
      await assert.rejects(operational.withMerchantOperationalTransaction(x.f.merchantId,c=>enrollment.enrollReviewedEmptyCashierStreamInTransaction(c,x.review)),e=>e.code==='42501');
      await assert.rejects(reviewer.query("SELECT public.fawri_commit_cashier_financial_receipt('{}'::jsonb)"),e=>e.code==='42501');
      const second=saleBody(x.f,x.f.stations[0],x.body.envelopes[0].occurred_at,2);
      await sell(x);await sell(x,second);
      const returned=compensation(x,x.body,'return',3),voided=compensation(x,second,'void',4);
      await compensate(x,returned,'return');await compensate(x,voided,'void');
      const state=own(await snapshot(),x);assert.equal(state.cashier_operation_receipts.length,4);
      assert.deepEqual(state.cashier_operation_receipts.map(y=>Number(y.row.device_sequence)).sort((a,b)=>a-b),[1,2,3,4]);
      assert.equal(Number(state.cashier_device_streams[0].row.last_sequence),4);assert.equal(state.cashier_device_streams[0].row.version,5);
      assert.deepEqual(state.cashier_stream_enrollment_reviews,ledger);
      const retry=await reviewedEnroll(x.review);assert.equal(retry.replayed,true);assert.equal(retry.last_sequence,'4');assert.equal(retry.version,5);
      await assert.rejects(reviewedEnroll({...x.review,reviewReference:'conflict-'+randomUUID()}),e=>e.code==='23514');
      assert.deepEqual(own(await snapshot(),x),state);
      for(const [body,kind] of [[x.body,'sale'],[second,'sale'],[returned,'return'],[voided,'void']]){
        const r=kind==='sale'?await sell(x,body):await compensate(x,body,kind);assert.equal(r.replayed,true);
      }
      assert.deepEqual(own(await snapshot(),x),state);
    });
    await v2t.test('observed concurrent exact sale retry commits one receipt while peer merchant proceeds',async()=>{
      const x=await reviewed(),peer=await reviewed();
      const [first,second]=await overlap(x,1,()=>sell(x),()=>sell(x),false,()=>sell(peer));
      assert.ifError(first.error);assert.ifError(second.error);assert.equal(first.value.replayed,false);assert.equal(second.value.replayed,true);
      assert.equal(second.value.inventory_mutation_count,0);assert.equal(first.value.order_id,second.value.order_id);
      const state=await assertFinancial(x,1,1,2);await assertFinancial(peer,1,1,2);
      assert.equal((await sell(x)).replayed,true);assert.deepEqual(own(await snapshot(),x),state);
    });
    await v2t.test('observed same-sequence different operation conflicts after first real commit',async()=>{
      const x=await reviewed(),other=saleBody(x.f,x.f.stations[0],x.body.envelopes[0].occurred_at,1);
      const [first,second]=await overlap(x,1,()=>sell(x),()=>sell(x,other));
      assert.ifError(first.error);assert.equal(second.error?.code,'CASHIER_STREAM_IDENTITY_CONFLICT');
      const state=await assertFinancial(x,1,1,2);assert.equal(state.orders[0].row.id,first.value.order_id);
      await assert.rejects(sell(x,other),e=>e.code==='CASHIER_STREAM_IDENTITY_CONFLICT');assert.deepEqual(own(await snapshot(),x),state);
    });
    await v2t.test('observed first financial rollback lets waiting exact request commit once',async()=>{
      const x=await reviewed();const [first,second]=await overlap(x,1,()=>sell(x),()=>sell(x),true);
      assert.equal(first.error?.code,'P0001');assert.match(first.error.message,/synthetic overlapped receipt rollback/);
      assert.ifError(second.error);assert.equal(second.value.replayed,false);
      const state=await assertFinancial(x,1,1,2);assert.equal((await sell(x)).replayed,true);assert.deepEqual(own(await snapshot(),x),state);
    });
    await v2t.test('observed adjacent canonical requests preserve contiguous checkpoint after commit or rollback',async()=>{
      for(const rollbackFirst of [false,true]){
        const x=await reviewed();await sell(x);
        const second=saleBody(x.f,x.f.stations[0],x.body.envelopes[0].occurred_at,2),third=saleBody(x.f,x.f.stations[0],x.body.envelopes[0].occurred_at,3);
        const [a,b]=await overlap(x,2,()=>sell(x,second),()=>sell(x,third),rollbackFirst);
        if(rollbackFirst){
          assert.equal(a.error?.code,'P0001');assert.equal(b.error?.code,'CASHIER_STREAM_SEQUENCE_GAP');
          await assertFinancial(x,1,1,2);await sell(x,second);await sell(x,third);
        }else{assert.ifError(a.error);assert.ifError(b.error);assert.equal(a.value.replayed,false);assert.equal(b.value.replayed,false);}
        const state=await assertFinancial(x,3,3,0);
        assert.deepEqual(state.cashier_operation_receipts.map(y=>Number(y.row.device_sequence)).sort((a,b)=>a-b),[1,2,3]);
      }
    });
    console.log('P0_REVIEWED_ENROLLMENT_FINANCIAL_HANDOFF '+JSON.stringify({separateReviewerLogin:true,actualCanonicalSaleReturnVoid:true,observedRestrictedFinancialWaits:true,exactConcurrentRetry:true,conflictingOperationHeld:true,firstRollback:true,adjacentCommitRollback:true,peerMerchantProgress:true,independentEvidenceAssumed:true,publicHttpNativeV2:false,canonicalProposalAdoption:false,hosted:false}));

    console.log('P0_INTERNAL_V2_FINANCIAL_RECEIPTS '+JSON.stringify({actualCanonicalSaleReturnVoid:true,actualOperatorAttributionWrapper:true,restrictedPrimaryLogin:true,receiptAndCheckpointSameFinancialTransaction:true,postCommitAttributionRepair:true,publicHttpV2Held:true,streamEnrollmentSyntheticRootFixture:true,proposalCanonical:false,fullClientOrHosted:false}));
  });

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
    await streamTest.test('paired device with no server financial history still lacks trusted enrollment provenance',async()=>{
      const before=await snapshot();
      const empty=await reviewEnrollmentHistory(target.merchantId,target.merchantId,target.stations[0].deviceId);
      assert.deepEqual(empty.signals,{timeline:false,sale:false,compensation:false,attribution:false,stream:false});
      assert.equal(empty.serverHistoryPresent,false);assert.equal(empty.reviewReason,'TRUSTED_PROVENANCE_REQUIRED');
      await pool.query(`REVOKE SELECT ON orders FROM ${runtimeFixture.role}`);
      try {await assert.rejects(reviewEnrollmentHistory(target.merchantId,target.merchantId,target.stations[0].deviceId),error=>error.code==='42501');}
      finally {await pool.query(`GRANT SELECT ON orders TO ${runtimeFixture.role}`);}
      await assert.rejects(reviewEnrollmentHistory(target.merchantId,peer.merchantId,peer.stations[0].deviceId),error=>error.code==='CASHIER_ENROLLMENT_SCOPE_REQUIRED');
      assert.deepEqual(await snapshot(),before);
    });
    const instant=(await pool.query('SELECT clock_timestamp() AS instant')).rows[0].instant.toISOString();
    const body=saleBody(target,target.stations[0],instant),next=saleBody(target,target.stations[0],instant,2);
    const assertSaleProtocolHold = () => assertNoProtocolDowngrade(body,
      candidate => request(target,token,candidate),
      candidate => sync.syncCashierSaleAuthoritative({merchantId:target.merchantId,body:candidate}));
    await streamTest.test('unsupported sale protocol cannot downgrade before first commit',assertSaleProtocolHold);
    await streamTest.test('unreadable stream metadata fails closed before a legacy financial commit',async()=>{
      const before=await snapshot();
      await pool.query(`REVOKE SELECT ON cashier_device_streams FROM ${runtimeFixture.role}`);
      try{
        await assert.rejects(sync.syncCashierSaleAuthoritative({merchantId:target.merchantId,body}),error=>error.code==='42501');
        const denied=await request(target,token,body);assert.equal(denied.status,500,JSON.stringify(denied.body));assert.equal(denied.body.accepted_entity_ids,undefined);
        assert.deepEqual(await snapshot(),before,'metadata failure cannot fall back to legacy admission');
      }finally{await pool.query(`GRANT SELECT ON cashier_device_streams TO ${runtimeFixture.role}`);}
    });
    const accepted=await request(target,token,{...body,protocol_version:1});assert.equal(accepted.status,200,JSON.stringify(accepted.body));
    await streamTest.test('unsupported sale protocol cannot receive a legacy replay ACK',assertSaleProtocolHold);
    assert.equal((await request(target,token,body)).body.replayed,true,'unenrolled exact replay remains valid');
    // Root setup only: intentionally inconsistent synthetic history is not an
    // enrollment method or a trusted checkpoint and must remain held.
    const id='stream-fence-'+randomUUID();
    await pool.query('INSERT INTO cashier_device_streams(id,merchant_id,device_id) VALUES($1,$2,$3)',[id,target.merchantId,target.stations[0].deviceId]);
    const known=await reviewEnrollmentHistory(target.merchantId,target.merchantId,target.stations[0].deviceId);
    assert.deepEqual(known.signals,{timeline:true,sale:true,compensation:false,attribution:true,stream:true});
    assert.equal(known.reviewReason,'SERVER_HISTORY_PRESENT');
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
    const peerEmpty=await reviewEnrollmentHistory(peer.merchantId,peer.merchantId,peer.stations[0].deviceId);
    assert.equal(peerEmpty.serverHistoryPresent,false,'foreign tenant device-string collision is not own server history');
    assert.equal(peerEmpty.reviewReason,'TRUSTED_PROVENANCE_REQUIRED');
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
  const compensationCore = await import('../src/services/postgresCashierCompensationSyncAuthority.ts');
  const assertCompensationProtocolHold = () => assertNoProtocolDowngrade(compensation,
    candidate => request(`/api/cashier/operator/sync/${kind}`,privileged.body.operator_token,candidate),
    candidate => compensationCore.syncCashierCompensationAuthoritative({merchantId:f.merchantId,body:candidate}));
  await t.test(`${kind} unsupported protocol cannot downgrade before first commit`,assertCompensationProtocolHold);
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
  const compensated = await request(`/api/cashier/operator/sync/${kind}`, privileged.body.operator_token, {...compensation,protocol_version:1});
  assert.equal(compensated.status, 200, JSON.stringify(compensated.body));
  assert.equal(compensated.body.compensation_kind, kind);
  assert.equal(compensated.body.replayed, false);
  await t.test(`${kind} unsupported protocol cannot receive a legacy replay ACK`,assertCompensationProtocolHold);
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

  await t.test(`${kind} enrollment review finds canonical financial history without timeline rows`,async()=>{
    async function selectedState(){const state={};for(const table of ['orders','order_items','inventory_mutations','cashier_device_operation_timeline','location_inventory_levels','cashier_operation_attribution','cashier_device_streams','cashier_operation_receipts'])state[table]=(await pool.query(`SELECT to_jsonb(t) AS row FROM ${table} t WHERE merchant_id=ANY($1::text[]) ORDER BY to_jsonb(t)::text`,[owned])).rows;return state;}
    const before=await selectedState();
    const known=await reviewEnrollmentHistory(f.merchantId,f.merchantId,device.deviceId);
    assert.deepEqual(known.signals,{timeline:true,sale:true,compensation:true,attribution:true,stream:false});
    assert.equal(known.reviewReason,'SERVER_HISTORY_PRESENT');
    assert.deepEqual(await selectedState(),before);
    // Root-owned fault fixture only. Remove numeric history, never financial
    // rows; restore the exact timeline in finally. This is not a live repair.
    const removed=(await pool.query('DELETE FROM cashier_device_operation_timeline WHERE merchant_id=$1 RETURNING to_jsonb(cashier_device_operation_timeline) AS row',[f.merchantId])).rows.map(x=>x.row);
    assert.equal(removed.length,2);
    try {
      const orphanBefore=await selectedState();
      const orphan=await reviewEnrollmentHistory(f.merchantId,f.merchantId,device.deviceId);
      assert.deepEqual(orphan.signals,{timeline:false,sale:true,compensation:true,attribution:true,stream:false});
      assert.equal(orphan.reviewReason,'SERVER_HISTORY_PRESENT');
      assert.deepEqual(await selectedState(),orphanBefore);
      // Probe compensation independently of the original sale's device string.
      // This synthetic metadata alias must not be mistaken for a fresh device.
      const alias='enrollment-compensation-'+randomUUID();
      const original=(await pool.query('SELECT metadata FROM orders WHERE merchant_id=$1 AND id=$2',[f.merchantId,sale.sale_id])).rows[0].metadata;
      try {
        await pool.query("UPDATE orders SET metadata=jsonb_set(metadata,'{cashier_sync,compensations,0,device_id}',to_jsonb($3::text),false) WHERE merchant_id=$1 AND id=$2",[f.merchantId,sale.sale_id,alias]);
        const aliasedBefore=await selectedState();
        const compensationOnly=await reviewEnrollmentHistory(f.merchantId,f.merchantId,alias);
        assert.deepEqual(compensationOnly.signals,{timeline:false,sale:false,compensation:true,attribution:false,stream:false});
        assert.equal(compensationOnly.reviewReason,'SERVER_HISTORY_PRESENT');
        assert.deepEqual(await selectedState(),aliasedBefore);
      } finally {await pool.query('UPDATE orders SET metadata=$3::jsonb WHERE merchant_id=$1 AND id=$2',[f.merchantId,sale.sale_id,JSON.stringify(original)]);}
    } finally {
      for(const row of removed)await pool.query('INSERT INTO cashier_device_operation_timeline SELECT (jsonb_populate_record(NULL::cashier_device_operation_timeline,$1::jsonb)).*',[JSON.stringify(row)]);
    }
    assert.deepEqual(await selectedState(),before);
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
