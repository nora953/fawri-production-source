import assert from 'node:assert/strict';
import {randomUUID,randomInt} from 'node:crypto';
import test from 'node:test';
import {assertDisposablePostgres} from '../../../scripts/lib/disposable-postgres-test-guard.mjs';
import {cleanupResources} from './helpers/cleanup-resources.mjs';

await assertDisposablePostgres();
Object.assign(process.env,{
  FAWRI_OPERATIONAL_POSTGRES_AUTHORITY:'required',
  FAWRI_SUBSCRIPTION_POSTGRES_AUTHORITY:'required',
  FAWRI_SAAS_BILLING_PROVIDER:'test_fake',
  FAWRI_SAAS_BILLING_PROVIDERS:'test_fake',
});
const {pool}=await import('@workspace/db');
const saas=await import('../src/services/saasBillingAuthority.ts');
const cashier=await import('../src/services/cashierBillingAuthority.ts');

test('cross-authority identity guard rejects second writer in READ COMMITTED',async t=>{
  const merchants=[];
  let reader,writer;
  t.after(async()=>cleanupResources([
    ['reader rollback',async()=>{if(reader){await reader.query('ROLLBACK');reader.release();}}],
    ['writer rollback',async()=>{if(writer){await writer.query('ROLLBACK');writer.release();}}],
    ['owned accounts',()=>pool.query('DELETE FROM accounts WHERE id=ANY($1::text[])',[merchants])],
    ['pool',()=>pool.end()],
  ]));
  async function merchant(){
    const id=`phantom-merchant-${randomUUID()}`;merchants.push(id);
    await pool.query("INSERT INTO accounts(id,kind,phone,password_hash,state,phone_verified) VALUES($1,'merchant',$2,'synthetic','active',true)",[id,`+1998${String(randomInt(0,100000000)).padStart(8,'0')}`]);
    await pool.query("INSERT INTO merchants(id,account_id,owner_name,store_name,activity_type,status,account_status,onboarding_status) VALUES($1,$1,'Synthetic','Synthetic','retail','approved','approved','channel_connected')",[id]);
    return id;
  }
  const saasMerchant=await merchant(),cashierMerchant=await merchant();
  const bot=await saas.createSaasBillingCheckout({merchantId:saasMerchant,operation:'activate',plan:'silver',idempotencyKey:randomUUID(),provider:'test_fake'});
  const cash=await cashier.createCashierBillingCheckout({merchantId:cashierMerchant,operation:'activate',requestedSeats:1,idempotencyKey:randomUUID(),provider:'test_fake'});
  const payment=`phantom-payment-${randomUUID()}`,request=`phantom-request-${randomUUID()}`;
  await pool.query("UPDATE saas_billing_orders SET provider='superqi_sandbox',provider_checkout_ref=$2,metadata=metadata||$3::jsonb WHERE id=$1",[bot.order.id,payment,JSON.stringify({provider_request_id:request})]);
  // The second authority initially has a different provider identity.
  reader=await pool.connect();writer=await pool.connect();
  const sql=`SELECT count(*)::int AS n FROM (
    SELECT id FROM saas_billing_orders WHERE provider='superqi_sandbox' AND
      (provider_checkout_ref=$1 OR metadata->>'provider_request_id'=$2)
    UNION ALL
    SELECT id FROM cashier_billing_orders WHERE provider='superqi_sandbox' AND
      (provider_checkout_ref=$1 OR metadata->>'provider_request_id'=$2)
    LIMIT 3
  ) candidates`;
  await reader.query('BEGIN ISOLATION LEVEL READ COMMITTED');
  const first=(await reader.query(sql,[payment,request])).rows[0].n;
  assert.equal(first,1,'first scan must have exactly one candidate');
  await writer.query('BEGIN');
  const collision=await writer.query("UPDATE cashier_billing_orders SET provider='superqi_sandbox',provider_checkout_ref=$2,metadata=metadata||$3::jsonb WHERE id=$1",[cash.order.id,payment,JSON.stringify({provider_request_id:request})]).then(()=>null,error=>error);
  assert.equal(collision?.code,'23514','second writer must be rejected by the database guard');
  await writer.query('ROLLBACK');
  const second=(await reader.query(sql,[payment,request])).rows[0].n;
  assert.equal(second,1,'no competing order may commit under the database guard');
  await reader.query('ROLLBACK');
  // Two distinct pre-existing orders race to claim an initially unowned
  // provider identity. The second writer must wait for the first commit and
  // then fail closed; neither table can commit a duplicate.
  const freshPayment=`concurrent-payment-${randomUUID()}`;
  const freshRequest=`concurrent-request-${randomUUID()}`;
  const owner=await pool.connect(),contender=await pool.connect();
  let ownerOpen=false,contenderOpen=false;
  try {
    await owner.query('BEGIN');
    ownerOpen=true;
    await owner.query("UPDATE saas_billing_orders SET provider='superqi_sandbox',provider_checkout_ref=$2,metadata=metadata||$3::jsonb WHERE id=$1",[bot.order.id,freshPayment,JSON.stringify({provider_request_id:freshRequest})]);
    await contender.query('BEGIN');
    contenderOpen=true;
    const pending=contender.query("UPDATE cashier_billing_orders SET provider='superqi_sandbox',provider_checkout_ref=$2,metadata=metadata||$3::jsonb WHERE id=$1",[cash.order.id,freshPayment,JSON.stringify({provider_request_id:freshRequest})]).then(()=>null,error=>error);
    const deadline=Date.now()+10000;
    let blocked=false;
    while(Date.now()<deadline){
      const result=await pool.query("SELECT cardinality(pg_blocking_pids(pid)) AS blockers FROM pg_stat_activity WHERE pid=$1",[contender.processID]);
      if(Number(result.rows[0]?.blockers)>0){blocked=true;break;}
      await new Promise(resolve=>setTimeout(resolve,50));
    }
    assert.equal(blocked,true,'competing first-time identity writer must wait for owner transaction');
    await owner.query('COMMIT');
    ownerOpen=false;
    const rejected=await pending;
    assert.equal(rejected?.code,'23514','second first-time writer must reject the committed owner');
    await contender.query('ROLLBACK');
    contenderOpen=false;
    const owned=(await pool.query(sql,[freshPayment,freshRequest])).rows[0].n;
    assert.equal(owned,1,'only one authority may commit the fresh provider identity');
    console.log('P0_CONCURRENT_FIRST_WRITERS_GUARDED '+JSON.stringify({blocked,writerSqlstate:rejected.code,committedMatches:owned}));
  } finally {
    if(ownerOpen)await owner.query('ROLLBACK');
    if(contenderOpen)await contender.query('ROLLBACK');
    owner.release();contender.release();
  }
  // Exercise the actual BEFORE INSERT trigger with two simultaneous first writers
  // in separate authorities. The source rows are synthetic orders created above;
  // only IDs, idempotency keys, provider references and request IDs are replaced.
  const insertPayment=`concurrent-insert-payment-${randomUUID()}`;
  const insertRequest=`concurrent-insert-request-${randomUUID()}`;
  const insertOwner=await pool.connect(),insertContender=await pool.connect();
  let insertOwnerOpen=false,insertContenderOpen=false;
  try {
    await insertOwner.query('BEGIN');
    insertOwnerOpen=true;
    await insertOwner.query(`INSERT INTO saas_billing_orders (
      id,merchant_id,operation,requested_plan,amount_iqd,currency,catalog_version,
      provider,status,idempotency_key,provider_checkout_ref,request_expires_at,metadata,created_at,updated_at
    ) SELECT $2,merchant_id,operation,requested_plan,amount_iqd,currency,catalog_version,
      'superqi_sandbox','failed',$3,$4,request_expires_at,
      metadata || jsonb_build_object('provider_request_id',$5::text),now(),now()
      FROM saas_billing_orders WHERE id=$1`,
      [bot.order.id,randomUUID(),`p0-insert-owner-${randomUUID()}`,insertPayment,insertRequest]);
    await insertContender.query('BEGIN');
    insertContenderOpen=true;
    const pendingInsert=insertContender.query(`INSERT INTO cashier_billing_orders (
      id,merchant_id,subscription_id,operation,current_seats,requested_seats,resulting_seats,
      unit_price_iqd,amount_iqd,currency,billing_period_start,billing_period_end,
      grace_duration_seconds,status,idempotency_key,provider,provider_checkout_ref,
      request_expires_at,metadata,created_at,updated_at
    ) SELECT $2,merchant_id,subscription_id,operation,current_seats,requested_seats,resulting_seats,
      unit_price_iqd,amount_iqd,currency,billing_period_start,billing_period_end,
      grace_duration_seconds,'failed',$3,'superqi_sandbox',$4,request_expires_at,
      metadata || jsonb_build_object('provider_request_id',$5::text),now(),now()
      FROM cashier_billing_orders WHERE id=$1`,
      [cash.order.id,randomUUID(),`p0-insert-contender-${randomUUID()}`,insertPayment,insertRequest])
      .then(()=>null,error=>error);
    const insertDeadline=Date.now()+10000;
    let insertBlocked=false;
    while(Date.now()<insertDeadline){
      const result=await pool.query('SELECT cardinality(pg_blocking_pids(pid)) AS blockers FROM pg_stat_activity WHERE pid=$1',[insertContender.processID]);
      if(Number(result.rows[0]?.blockers)>0){insertBlocked=true;break;}
      await new Promise(resolve=>setTimeout(resolve,50));
    }
    assert.equal(insertBlocked,true,'competing first-time INSERT must wait on identity advisory lock');
    await insertOwner.query('COMMIT');
    insertOwnerOpen=false;
    const insertRejected=await pendingInsert;
    assert.equal(insertRejected?.code,'23514','cross-authority duplicate INSERT must be rejected');
    await insertContender.query('ROLLBACK');
    insertContenderOpen=false;
    const insertOwned=(await pool.query(sql,[insertPayment,insertRequest])).rows[0].n;
    assert.equal(insertOwned,1,'concurrent INSERTs must leave exactly one authority owner');
    console.log('P0_CONCURRENT_INSERTS_GUARDED '+JSON.stringify({blocked:insertBlocked,loserSqlstate:insertRejected.code,committedMatches:insertOwned}));
  } finally {
    if(insertOwnerOpen)await insertOwner.query('ROLLBACK');
    if(insertContenderOpen)await insertContender.query('ROLLBACK');
    insertOwner.release();insertContender.release();
  }
  // Verify independent identity keys: either key alone must reject a collision.
  for (const scenario of [
    { label: 'request-only', payment: `request-only-${randomUUID()}`, request: freshRequest },
    { label: 'payment-only', payment: freshPayment, request: `payment-only-${randomUUID()}` },
  ]) {
    const error = await pool.query(
      "UPDATE cashier_billing_orders SET provider='superqi_sandbox',provider_checkout_ref=$2,metadata=metadata||$3::jsonb WHERE id=$1",
      [cash.order.id,scenario.payment,JSON.stringify({provider_request_id:scenario.request})],
    ).then(()=>null,e=>e);
    assert.equal(error?.code,'23514',`${scenario.label} identity collision must fail closed`);
    const count=(await pool.query(sql,[scenario.payment,scenario.request])).rows[0].n;
    assert.equal(count,1,`${scenario.label} collision must not create a second owner`);
  }
  console.log('P0_CROSS_AUTHORITY_IDENTITY_GUARDED '+JSON.stringify({first,second,writerSqlstate:collision.code,readerIsolation:'read committed',scope:'database write-path protection'}));
});
