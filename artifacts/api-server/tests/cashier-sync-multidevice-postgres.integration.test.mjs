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
const sync = await import('../src/services/postgresCashierSyncAuthority.ts');
const historical = await import('../src/services/cashierHistoricalOperationAuthority.ts');
const operational = await import('../src/services/operationalPostgresAuthority.ts');

test('isolated cashier multi-device final-stock, replay and gap observations', async t => {
  const owned = [];
  // Register before the first mutation; cleanup failures must remain visible.
  t.after(async () => cleanupResources([
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
    // PostgreSQL issued_at has microseconds; JavaScript timestamps truncate to
    // milliseconds. Place this synthetic operation unambiguously after setup,
    // within the existing five-minute server clock tolerance.
    const occurredAt = new Date(Date.now() + 1000).toISOString();
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
      for (let i = 0; i < f.stations.length; i++) {
        const authority = await operational.withMerchantOperationalTransaction(f.merchantId, client =>
          historical.evaluateCashierHistoricalOperationAuthorityInTransaction({ target: client,
            merchantId: f.merchantId, deviceId: f.stations[i].deviceId,
            occurredAt: bodies[i].envelopes[0].occurred_at }));
        assert.equal(authority.allowed, true, 'fixture must authorize both devices before the stock race');
      }
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

  await t.test('read-only bounded device history assessment preserves financial state and observes tenant scope and statement snapshots',async()=>{
    const {assessCashierDeviceHistory}=await import('../src/services/cashierDeviceHistoryAssessment.ts');
    const f=await fixture(),peer=await fixture(),device=f.stations[0],peerDevice=peer.stations[0];
    const gap='assessment-gap-'+randomUUID(),start='assessment-start-'+randomUUID(),unsafe='assessment-unsafe-'+randomUUID(),changing='assessment-changing-'+randomUUID();
    async function seed(client,owner,deviceId,sequence){await client.query(`INSERT INTO cashier_device_operation_timeline(id,merchant_id,subscription_id,billing_order_id,station_id,device_id,device_sequence,operation_id,operation_kind,occurred_at,accepted_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,'sale',now(),now())`,['assessment-'+randomUUID(),owner.merchantId,owner.subscriptionId,owner.billingOrderId,owner.stations[0].stationId,deviceId,String(sequence),'assessment-op-'+randomUUID()]);}
    for(const n of [1,2,3])await seed(pool,f,device.deviceId,n);
    for(const n of [1,3])await seed(pool,f,gap,n);
    await seed(pool,f,start,5);await seed(pool,f,unsafe,'9007199254740992');await seed(pool,f,changing,1);
    for(const n of [1,2])await seed(pool,peer,peerDevice.deviceId,n);
    async function snapshot(){const state={};for(const table of ['orders','order_items','inventory_mutations','cashier_device_operation_timeline','location_inventory_levels'])state[table]=(await pool.query(`SELECT to_jsonb(t) AS row FROM ${table} t WHERE merchant_id=ANY($1::text[]) ORDER BY to_jsonb(t)::text`,[[f.merchantId,peer.merchantId]])).rows;return state;}
    async function read(scope,merchantId,deviceId,inspectionLimit){return operational.withMerchantOperationalTransaction(scope,async client=>{await client.query('SET TRANSACTION READ ONLY');assert.equal((await client.query('SHOW transaction_read_only')).rows[0].transaction_read_only,'on');const result=await assessCashierDeviceHistory({target:client,merchantId,deviceId,...(inspectionLimit===undefined?{}:{inspectionLimit})});assert.equal(result.enrollmentAuthorized,false);assert.equal(result.statementSnapshotOnly,true);return result;});}
    const before=await snapshot();
    const contiguous=await read(f.merchantId,f.merchantId,device.deviceId);assert.equal(contiguous.status,'CONTIGUOUS');assert.equal(contiguous.reason,'CONTIGUOUS_NUMBERS_ONLY');assert.equal(contiguous.lastSequence,'3');assert.equal(contiguous.historyComplete,true);
    const gapped=await read(f.merchantId,f.merchantId,gap);assert.equal(gapped.status,'GAPPED');assert.equal(gapped.firstMissingSequence,'2');
    const above=await read(f.merchantId,f.merchantId,start);assert.equal(above.status,'GAPPED');assert.equal(above.firstMissingSequence,'1');
    const numeric=await read(f.merchantId,f.merchantId,unsafe);assert.equal(numeric.status,'REVIEW_REQUIRED');assert.equal(numeric.reason,'UNSAFE_SEQUENCE');assert.equal(numeric.lastSequence,null);
    const limited=await read(f.merchantId,f.merchantId,device.deviceId,2);assert.equal(limited.reason,'INSPECTION_LIMIT');assert.equal(limited.historyComplete,false);assert.equal(limited.lastSequence,null);
    assert.equal((await read(f.merchantId,f.merchantId,'assessment-absent-'+randomUUID())).status,'EMPTY');
    assert.equal((await read(f.merchantId,f.merchantId,peerDevice.deviceId)).status,'EMPTY');
    assert.equal((await read(f.merchantId,peer.merchantId,peerDevice.deviceId)).status,'EMPTY');
    assert.equal((await read(peer.merchantId,peer.merchantId,peerDevice.deviceId)).status,'CONTIGUOUS');
    await assert.rejects(read(f.merchantId,f.merchantId,device.deviceId,513),error=>error.code==='CASHIER_HISTORY_INPUT_INVALID');
    assert.deepEqual(await snapshot(),before);
    const writer=await pool.connect();let held=false;
    try{
      await writer.query('BEGIN');held=true;await seed(writer,f,changing,3);
      const during=await read(f.merchantId,f.merchantId,changing);assert.equal(during.status,'CONTIGUOUS');assert.equal(during.lastSequence,'1');
      assert.deepEqual(await snapshot(),before,'uncommitted setup writer is invisible and assessment makes no financial writes');
      await writer.query('COMMIT');held=false;const afterCommit=await snapshot();
      const after=await read(f.merchantId,f.merchantId,changing);assert.equal(after.status,'GAPPED');assert.equal(after.firstMissingSequence,'2');assert.deepEqual(await snapshot(),afterCommit);
    }finally{if(held)await writer.query('ROLLBACK');writer.release();}
    console.log('P0_DEVICE_HISTORY_ASSESSMENT '+JSON.stringify({actualRestrictedSql:true,readOnlyTransactions:true,numericContiguityNotEnrollment:true,empty:true,contiguous:true,gap:true,startAboveOne:true,unsafeSequence:true,boundedTruncation:true,tenantAndDeviceIsolation:true,peerPositive:true,uncommittedWriterSnapshot:true,noFinancialOrTimelineWritesByAssessor:true,liveAdmissionChanged:false,hostedAccepted:false}));
  });

  await t.test('canonical sale-service diagnostic observes late rejection without financial mutation after accepting a sequence gap',async()=>{
    const f=await fixture(3),peer=await fixture(),device=f.stations[0];
    const bodies=new Map([1,2,3].map(sequence=>[sequence,saleBody(f,device,sequence)]));
    async function snapshot(merchantId){
      const state={};
      for(const table of ['orders','order_items','inventory_mutations','cashier_device_operation_timeline','location_inventory_levels'])state[table]=(await pool.query(`SELECT to_jsonb(t) AS row FROM ${table} t WHERE merchant_id=$1 ORDER BY to_jsonb(t)::text`,[merchantId])).rows;
      return state;
    }
    const peerBefore=await snapshot(peer.merchantId);
    for(const sequence of [1,3]){const result=await sync.syncCashierSaleAuthoritative({merchantId:f.merchantId,body:bodies.get(sequence)});assert.equal(result.replayed,false);assert.equal(result.inventory_mutation_count,1);}
    const beforeLate=await snapshot(f.merchantId);assert.equal(beforeLate.orders.length,2);assert.equal(beforeLate.inventory_mutations.length,2);
    assert.deepEqual(beforeLate.cashier_device_operation_timeline.map(x=>Number(x.row.device_sequence)).sort((a,b)=>a-b),[1,3]);
    const level=beforeLate.location_inventory_levels.find(x=>x.row.location_id===f.locationId&&x.row.product_id===f.productId&&x.row.variant_id===null);assert.ok(level);assert.equal(Number(level.row.quantity),1);
    for(let attempt=0;attempt<2;attempt++)await assert.rejects(sync.syncCashierSaleAuthoritative({merchantId:f.merchantId,body:bodies.get(2)}),error=>error.code==='CASHIER_OPERATION_SEQUENCE_CONFLICT');
    assert.deepEqual(await snapshot(f.merchantId),beforeLate,'late rejection must roll back all selected financial/stock/timeline state');
    for(const sequence of [1,3]){const replay=await sync.syncCashierSaleAuthoritative({merchantId:f.merchantId,body:bodies.get(sequence)});assert.equal(replay.replayed,true);assert.equal(replay.inventory_mutation_count,0);}
    assert.deepEqual(await snapshot(f.merchantId),beforeLate);assert.deepEqual(await snapshot(peer.merchantId),peerBefore);
    console.log('P0_SEQUENCE_GAP_SALE_DIAGNOSTIC '+JSON.stringify({canonicalSaleService:true,restrictedPrimaryLogin:true,separateAuthenticationLogin:true,accepted:[1,3],lateRejected:2,durableOrders:2,durableInventoryMutations:2,remainingStock:1,replayNoMutation:true,peerPreserved:true,recoveryContractAccepted:false,httpTest:false,hostedAccepted:false}));
    // A passing observation is a reproduced unresolved recovery behavior, not
    // approval to discard the missing operation or synthesize a tombstone.
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
