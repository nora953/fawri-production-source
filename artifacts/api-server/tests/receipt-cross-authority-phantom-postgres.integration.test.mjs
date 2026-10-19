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

test('two independent READ COMMITTED sessions expose a cross-authority order phantom',async t=>{
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
  await writer.query("UPDATE cashier_billing_orders SET provider='superqi_sandbox',provider_checkout_ref=$2,metadata=metadata||$3::jsonb WHERE id=$1",[cash.order.id,payment,JSON.stringify({provider_request_id:request})]);
  await writer.query('COMMIT');
  const second=(await reader.query(sql,[payment,request])).rows[0].n;
  assert.equal(second,2,'second statement in same READ COMMITTED transaction must see committed phantom');
  await reader.query('ROLLBACK');
  // Real resolver must fail closed when both authority candidates are committed.
  const receiptEvent=`phantom-event-${randomUUID()}`;
  const receiptHash='a'.repeat(64);
  await pool.query(
    "INSERT INTO verified_provider_payment_receipts(provider,provider_event_id,payment_ref,request_ref,event_type,amount_iqd,payload_hash,first_received_at) VALUES('superqi_sandbox',$1,$2,$3,'payment_succeeded',$4,$5,now())",
    [receiptEvent,payment,request,bot.order.amount_iqd,receiptHash]
  );
  await assert.rejects(
    ()=>pool.query('SELECT * FROM public.fawri_resolve_confirmed_payment_order($1,$2,$3,$4,$5,$6)',[receiptEvent,payment,request,'payment_succeeded',bot.order.amount_iqd,receiptHash]),
    error=>error.code==='23514' && /ORDER_AUTHORITY_COLLISION/.test(error.message)
  );
  const grants=await pool.query(
    'SELECT (SELECT count(*)::int FROM saas_entitlement_applications WHERE order_id=$1) AS bot, (SELECT count(*)::int FROM cashier_entitlement_applications WHERE order_id=$2) AS cashier',
    [bot.order.id,cash.order.id]
  );
  assert.deepEqual(grants.rows[0],{bot:0,cashier:0});
  await pool.query('DELETE FROM verified_provider_payment_receipts WHERE provider_event_id=$1',[receiptEvent]);
  console.log('P0_RESOLVER_COMMITTED_COLLISION_REJECTED '+JSON.stringify({sqlstate:'23514',entitlementGrants:0,scope:'post-commit; not an in-function interleaving'}));
  console.log('P0_CROSS_AUTHORITY_PHANTOM_OBSERVED '+JSON.stringify({first,second,readerIsolation:'read committed',writerCommitted:true,kind:'database schedule only; no replay function was invoked'}));
});
