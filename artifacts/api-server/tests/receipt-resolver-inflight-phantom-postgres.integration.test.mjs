import assert from 'node:assert/strict';
import {randomUUID,randomInt} from 'node:crypto';
import test from 'node:test';
import {setImmediate as nextTurn} from 'node:timers/promises';
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

test('P0 resolver must reject a competing authority committed while its selected row is locked',async t=>{
  const ids=[],events=[];
  let blocker,resolver;
  t.after(async()=>cleanupResources([
    ['release blocker',async()=>{if(blocker){await blocker.query('ROLLBACK');blocker.release();}}],
    ['release resolver',async()=>{if(resolver){await resolver.query('ROLLBACK');resolver.release();}}],
    ['owned receipts',()=>pool.query('DELETE FROM verified_provider_payment_receipts WHERE provider_event_id=ANY($1::text[])',[events])],
    ['owned accounts',()=>pool.query('DELETE FROM accounts WHERE id=ANY($1::text[])',[ids])],
    ['pool',()=>pool.end()],
  ]));
  async function merchant(){
    const id=`resolver-race-${randomUUID()}`;ids.push(id);
    await pool.query("INSERT INTO accounts(id,kind,phone,password_hash,state,phone_verified) VALUES($1,'merchant',$2,'synthetic','active',true)",[id,`+1997${String(randomInt(0,100000000)).padStart(8,'0')}`]);
    await pool.query("INSERT INTO merchants(id,account_id,owner_name,store_name,activity_type,status,account_status,onboarding_status) VALUES($1,$1,'Synthetic','Synthetic','retail','approved','approved','channel_connected')",[id]);
    return id;
  }
  const bot=await saas.createSaasBillingCheckout({merchantId:await merchant(),operation:'activate',plan:'silver',idempotencyKey:randomUUID(),provider:'test_fake'});
  const cash=await cashier.createCashierBillingCheckout({merchantId:await merchant(),operation:'activate',requestedSeats:1,idempotencyKey:randomUUID(),provider:'test_fake'});
  const payment=`inflight-payment-${randomUUID()}`,request=`inflight-request-${randomUUID()}`;
  const event=`inflight-event-${randomUUID()}`,hash='b'.repeat(64);events.push(event);
  await pool.query("UPDATE saas_billing_orders SET provider='superqi_sandbox',provider_checkout_ref=$2,metadata=metadata||$3::jsonb WHERE id=$1",[bot.order.id,payment,JSON.stringify({provider_request_id:request})]);
  await pool.query("INSERT INTO verified_provider_payment_receipts(provider,provider_event_id,payment_ref,request_ref,event_type,amount_iqd,payload_hash,first_received_at) VALUES('superqi_sandbox',$1,$2,$3,'payment_succeeded',$4,$5,now())",[event,payment,request,bot.order.amount_iqd,hash]);

  blocker=await pool.connect();
  resolver=await pool.connect();
  await blocker.query('BEGIN');
  await blocker.query('SELECT id FROM saas_billing_orders WHERE id=$1 FOR UPDATE',[bot.order.id]);
  const pid=(await resolver.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
  // Resolver scans the one candidate and then waits on this row's FOR UPDATE.
  const resolving=resolver.query('SELECT * FROM public.fawri_resolve_confirmed_payment_order($1,$2,$3,$4,$5,$6)',[event,payment,request,'payment_succeeded',bot.order.amount_iqd,hash]).then(rows=>({rows}),error=>({error}));
  let waiting=false;
  for(let attempt=0;attempt<1500;attempt++){
    const state=(await pool.query("SELECT wait_event_type,wait_event FROM pg_stat_activity WHERE pid=$1",[pid])).rows[0];
    if(state?.wait_event_type==='Lock'){waiting=true;break;}
    await nextTurn();
  }
  assert.ok(waiting,'resolver must reach the selected-row lock barrier; do not infer race from timing');
  // A separate writer does not participate in the resolver's advisory-lock convention.
  await pool.query("UPDATE cashier_billing_orders SET provider='superqi_sandbox',provider_checkout_ref=$2,metadata=metadata||$3::jsonb WHERE id=$1",[cash.order.id,payment,JSON.stringify({provider_request_id:request})]);
  await blocker.query('COMMIT');
  const result=await resolving;
  const visible=(await pool.query(`SELECT
    (SELECT count(*)::int FROM saas_billing_orders WHERE provider='superqi_sandbox' AND provider_checkout_ref=$1)
    +(SELECT count(*)::int FROM cashier_billing_orders WHERE provider='superqi_sandbox' AND provider_checkout_ref=$1) AS matches`,[payment])).rows[0].matches;
  assert.equal(visible,2,'both authorities must be committed before judging resolver outcome');
  console.log('P0_RESOLVER_INFLIGHT_RACE '+JSON.stringify({resolverPid:pid,waitObserved:waiting,committedMatches:visible,returnedRows:result.rows?.rows?.length??null,sqlstate:result.error?.code??null}));
  // Fail CI if a stale unique mapping escapes after the competing order committed.
  assert.ok(result.error || result.rows.rows.length===0,'P0: resolver returned a stale unique mapping after an in-flight cross-authority phantom');
  const grants=(await pool.query('SELECT (SELECT count(*)::int FROM saas_entitlement_applications WHERE order_id=$1) AS bot,(SELECT count(*)::int FROM cashier_entitlement_applications WHERE order_id=$2) AS cashier',[bot.order.id,cash.order.id])).rows[0];
  assert.deepEqual(grants,{bot:0,cashier:0});
});
