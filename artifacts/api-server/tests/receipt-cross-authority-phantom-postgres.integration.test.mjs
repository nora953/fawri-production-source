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
  console.log('P0_CROSS_AUTHORITY_IDENTITY_GUARDED '+JSON.stringify({first,second,writerSqlstate:collision.code,readerIsolation:'read committed',scope:'database write-path protection'}));
});
