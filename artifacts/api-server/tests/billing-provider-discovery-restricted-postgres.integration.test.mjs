import assert from 'node:assert/strict';
import {randomUUID,randomInt,generateKeyPairSync,createSign} from 'node:crypto';
import test from 'node:test';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {assertDisposablePostgres} from '../../../scripts/lib/disposable-postgres-test-guard.mjs';
import {stopTestChild,cleanupResources} from './helpers/cleanup-resources.mjs';
await assertDisposablePostgres();
const {publicKey,privateKey}=generateKeyPairSync('rsa',{modulusLength:2048});
Object.assign(process.env,{
  FAWRI_OPERATIONAL_POSTGRES_AUTHORITY:'required',FAWRI_SUBSCRIPTION_POSTGRES_AUTHORITY:'required',
  FAWRI_SAAS_BILLING_PROVIDER:'superqi_sandbox',FAWRI_SAAS_BILLING_PROVIDERS:'superqi_sandbox,test_fake',
  FAWRI_SUPERQI_SANDBOX_ENABLED:'1',FAWRI_SUPERQI_SANDBOX_USERNAME:'synthetic-user',
  FAWRI_SUPERQI_SANDBOX_PASSWORD:'synthetic-password',FAWRI_SUPERQI_SANDBOX_TERMINAL_ID:'synthetic-terminal',
  FAWRI_SUPERQI_SANDBOX_NOTIFICATION_URL:'https://merchant.example.invalid/api/auth/billing/providers/superqi/webhook',
  FAWRI_SUPERQI_SANDBOX_FINISH_URL:'https://merchant.example.invalid/dashboard/subscription',
  FAWRI_SUPERQI_SANDBOX_WEBHOOK_PUBLIC_KEY_B64:Buffer.from(publicKey.export({type:'spki',format:'pem'})).toString('base64'),
});
const {pool}=await import('@workspace/db');
const saas=await import('../src/services/saasBillingAuthority.ts');
const cashier=await import('../src/services/cashierBillingAuthority.ts');
const {getSaasPlan}=await import('../src/services/saasPlanCatalog.ts');
const {handleSuperQiSandboxWebhook:handle}=await import('../src/services/superQiSandboxWebhook.ts');
const {superQiWebhookSigningPayload}=await import('../src/services/superQiSandboxTransport.ts');
const signatureOf=payload=>{
  const signer=createSign('RSA-SHA256');signer.update(superQiWebhookSigningPayload(payload),'utf8');signer.end();
  return signer.sign(privateKey).toString('base64');
};
function fakeStatus(payload) {
  return async (url,init)=>{
    assert.equal(init.method,'GET');
    assert.equal(url,`https://uat-sandbox-3ds-api.qi.iq/api/v1/payment/${payload.paymentId}/status`);
    return {ok:true,status:200,json:async()=>payload};
  };
}
const functionIdentity='public.fawri_admit_verified_payment_receipt(text,text,text,text,integer,text,timestamptz)';
const admitSql='SELECT public.fawri_admit_verified_payment_receipt($1,$2,$3,$4,$5,$6,$7) AS first_received_at';

test('verified provider callbacks discover mapped orders without global tenant access',{timeout:120000},async t=>{
  const children=[],merchantIds=[],paymentRefs=[];const role=`billing_discovery_${randomUUID().replaceAll('-','')}`;
  t.after(async()=>cleanupResources([
    ['owned children',async()=>{for(const child of children)await stopTestChild(child);}],
    ['owned inbox',()=>pool.query('DELETE FROM verified_provider_payment_receipts WHERE payment_ref=ANY($1::text[])',[paymentRefs])],
    ['owned accounts',()=>pool.query('DELETE FROM accounts WHERE id=ANY($1::text[])',[merchantIds])],
    ['owned grants',()=>pool.query(`DROP OWNED BY ${role}`)],['owned role',()=>pool.query(`DROP ROLE ${role}`)],['pool',()=>pool.end()],
  ]));
  await pool.query(`CREATE ROLE ${role} NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS`);
  await pool.query(`GRANT USAGE ON SCHEMA public TO ${role}`);
  await pool.query(`GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO ${role}`);
  await pool.query(`GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA public TO ${role}`);
  await pool.query(`GRANT EXECUTE ON FUNCTION ${functionIdentity} TO ${role}`);
  const providerEnv=Object.fromEntries(Object.entries(process.env).filter(([key])=>key.startsWith('FAWRI_SUPERQI_')||['FAWRI_OPERATIONAL_POSTGRES_AUTHORITY','FAWRI_SUBSCRIPTION_POSTGRES_AUTHORITY','FAWRI_SAAS_BILLING_PROVIDER','FAWRI_SAAS_BILLING_PROVIDERS'].includes(key)));
  async function run(payload,receivedAt){
    const child=spawn(process.execPath,['--import','tsx',fileURLToPath(new URL('./helpers/billing-provider-discovery-child.mjs',import.meta.url))],{env:{...process.env},stdio:['ignore','pipe','pipe','ipc']});children.push(child);
    const messages=[];let readyResolve;const ready=new Promise(resolve=>{readyResolve=resolve;});
    child.on('message',message=>{messages.push(message);if(message.type==='ready')readyResolve();});child.stdout.on('data',()=>{});child.stderr.on('data',()=>{});
    const done=new Promise(resolve=>{child.once('exit',(code,signal)=>resolve({code,signal,messages}));child.once('error',()=>resolve({code:'SPAWN_FAILURE',messages}));});let timer;
    try{await Promise.race([ready,done.then(()=>{throw Error('owned child exited before ready');}),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('owned child startup timeout')),15000);})]);}finally{clearTimeout(timer);}
    child.send({payload,signature:signatureOf(payload),receivedAt:receivedAt.toISOString(),providerEnv,role});return done;
  }
  for(const kind of ['saas','cashier'])await t.test(`${kind}: signed callback applies mapped payment with empty tenant and restricted role`,async()=>{
    const merchantId=`discovery-${randomUUID()}`;merchantIds.push(merchantId);
    await pool.query("INSERT INTO accounts(id,kind,phone,password_hash,state,phone_verified) VALUES($1,'merchant',$2,'synthetic','active',true)",[merchantId,`+1991${String(randomInt(0,100000000)).padStart(8,'0')}`]);
    await pool.query("INSERT INTO merchants(id,account_id,owner_name,store_name,activity_type,status,account_status,onboarding_status) VALUES($1,$1,'Synthetic','Synthetic','retail','approved','approved','channel_connected')",[merchantId]);
    const checkout=kind==='saas'?await saas.createSaasBillingCheckout({merchantId,operation:'activate',plan:'silver',idempotencyKey:randomUUID(),provider:'test_fake'}):await cashier.createCashierBillingCheckout({merchantId,operation:'activate',requestedSeats:1,idempotencyKey:randomUUID(),provider:'test_fake'});
    const orders=kind==='saas'?'saas_billing_orders':'cashier_billing_orders',apps=kind==='saas'?'saas_entitlement_applications':'cashier_entitlement_applications',subscriptions=kind==='saas'?'subscriptions':'merchant_cashier_subscriptions';
    const payload={paymentId:`synthetic-discovery-${randomUUID()}`,requestId:randomUUID(),status:'SUCCESS',canceled:false,amount:checkout.order.amount_iqd,confirmedAmount:checkout.order.amount_iqd,currency:'IQD',creationDate:'2026-10-14T10:00:00'};paymentRefs.push(payload.paymentId);
    await pool.query(`UPDATE ${orders} SET provider='superqi_sandbox',provider_checkout_ref=$2,metadata=metadata||$3::jsonb WHERE id=$1`,[checkout.order.id,payload.paymentId,JSON.stringify({provider_request_id:payload.requestId})]);
    const first=new Date(),before=(await pool.query(`SELECT * FROM ${orders} WHERE id=$1`,[checkout.order.id])).rows[0];
    const result=await run(payload,first);assert.equal(result.code,0);const observation=result.messages.find(message=>message.type==='observation');assert.ok(observation,'child must complete independent role/context observations');
    const original=(await pool.query('SELECT * FROM verified_provider_payment_receipts WHERE payment_ref=$1',[payload.paymentId])).rows;assert.equal(original.length,1);assert.equal(new Date(original[0].first_received_at).getTime(),first.getTime());
    const applications=(await pool.query(`SELECT count(*)::int n FROM ${apps} WHERE order_id=$1`,[checkout.order.id])).rows[0].n,grants=(await pool.query(`SELECT count(*)::int n FROM ${subscriptions} WHERE merchant_id=$1`,[merchantId])).rows[0].n;
    if(observation.errorCode){assert.deepEqual((await pool.query(`SELECT * FROM ${orders} WHERE id=$1`,[checkout.order.id])).rows[0],before);assert.equal(applications,0);assert.equal(grants,0);}
    assert.deepEqual(observation.afterContext,{tenant:'',audit:'',admin:''});assert.deepEqual(observation.afterNaked,{saas:0,cashier:0,receipts:0});assert.equal(observation.gatewayCalls,1);
    console.log('BILLING_RESTRICTED_DISCOVERY_OBSERVATION '+JSON.stringify({kind,...observation,independentReceiptCount:original.length,applications,grants}));
    assert.equal(observation.errorCode,undefined,'verified mapped payment must remain discoverable under restricted runtime');assert.equal(observation.status,'applied');assert.equal(applications,1);assert.equal(grants,1);
    const duplicate=await run(payload,new Date(first.getTime()+86400000)),replayed=duplicate.messages.find(message=>message.type==='observation');assert.equal(duplicate.code,0);assert.equal(replayed?.status,'duplicate');assert.equal(replayed?.errorCode,undefined);
    assert.deepEqual((await pool.query('SELECT * FROM verified_provider_payment_receipts WHERE payment_ref=$1',[payload.paymentId])).rows,original);
    assert.equal((await pool.query(`SELECT count(*)::int n FROM ${apps} WHERE order_id=$1`,[checkout.order.id])).rows[0].n,1);
    assert.equal(new Date((await pool.query(`SELECT paid_at FROM ${orders} WHERE id=$1`,[checkout.order.id])).rows[0].paid_at).getTime(),first.getTime());
  });
});
