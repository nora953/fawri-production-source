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
const {superQiWebhookSigningPayload}=await import('../src/services/superQiSandboxTransport.ts');
// Register isolated SQLSTATE 42501/42883 fail-closed proofs in the existing CI billing audit.
await import('./confirmed-provider-resolver-unavailable.test.ts');
const signatureOf=payload=>{
  const signer=createSign('RSA-SHA256');signer.update(superQiWebhookSigningPayload(payload),'utf8');signer.end();
  return signer.sign(privateKey).toString('base64');
};
const resolverIdentity='public.fawri_resolve_confirmed_payment_order(text,text,text,text,integer,text)';
const functionIdentity='public.fawri_admit_verified_payment_receipt(text,text,text,text,integer,text,timestamptz)';

test('verified provider callbacks discover mapped orders without global tenant access',{timeout:120000},async t=>{
  const children=[],merchantIds=[],paymentRefs=[];const role=`billing_discovery_${randomUUID().replaceAll('-','')}`,runtimePassword=randomUUID().replaceAll('-','');
  t.after(async()=>cleanupResources([
    ['owned children',async()=>{for(const child of children)await stopTestChild(child);}],
    ['owned inbox',()=>pool.query('DELETE FROM verified_provider_payment_receipts WHERE payment_ref=ANY($1::text[])',[paymentRefs])],
    ['owned accounts',()=>pool.query('DELETE FROM accounts WHERE id=ANY($1::text[])',[merchantIds])],
    ['owned grants',()=>pool.query(`DROP OWNED BY ${role}`)],['owned role',()=>pool.query(`DROP ROLE ${role}`)],['pool',()=>pool.end()],
  ]));
  await pool.query(`CREATE ROLE ${role} LOGIN PASSWORD '${runtimePassword}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS`);
  await pool.query(`GRANT USAGE ON SCHEMA public TO ${role}`);
  await pool.query(`GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO ${role}`);
  await pool.query(`GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA public TO ${role}`);
  await pool.query(`GRANT EXECUTE ON FUNCTION ${functionIdentity} TO ${role}`);
  // The unmatched-receipt case must exercise the resolver's zero-row result,
  // not the missing-EXECUTE fail-closed path tested separately below.
  await pool.query(`GRANT EXECUTE ON FUNCTION ${resolverIdentity} TO ${role}`);
  const providerEnv=Object.fromEntries(Object.entries(process.env).filter(([key])=>key.startsWith('FAWRI_SUPERQI_')||['FAWRI_OPERATIONAL_POSTGRES_AUTHORITY','FAWRI_SUBSCRIPTION_POSTGRES_AUTHORITY','FAWRI_SAAS_BILLING_PROVIDER','FAWRI_SAAS_BILLING_PROVIDERS'].includes(key)));
  async function run(payload,receivedAt){
    const child=spawn(process.execPath,['--import','tsx',fileURLToPath(new URL('./helpers/billing-provider-discovery-child.mjs',import.meta.url))],{env:{...process.env},stdio:['ignore','pipe','pipe','ipc']});children.push(child);
    const messages=[];let readyResolve;const ready=new Promise(resolve=>{readyResolve=resolve;});
    child.on('message',message=>{messages.push(message);if(message.type==='ready')readyResolve();});child.stdout.on('data',()=>{});child.stderr.on('data',()=>{});
    const done=new Promise(resolve=>{child.once('exit',(code,signal)=>resolve({code,signal,messages}));child.once('error',()=>resolve({code:'SPAWN_FAILURE',messages}));});let timer;
    try{await Promise.race([ready,done.then(()=>{throw Error('owned child exited before ready');}),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('owned child startup timeout')),15000);})]);}finally{clearTimeout(timer);}
    child.send({payload,signature:signatureOf(payload),receivedAt:receivedAt.toISOString(),providerEnv,role,runtimePassword});return done;
  }
  for(const kind of ['saas','cashier'])await t.test(`${kind}: signed callback applies mapped payment with empty tenant and restricted role`,async kt=>{
    const merchantId=`discovery-${randomUUID()}`;merchantIds.push(merchantId);
    await pool.query("INSERT INTO accounts(id,kind,phone,password_hash,state,phone_verified) VALUES($1,'merchant',$2,'synthetic','active',true)",[merchantId,`+1991${String(randomInt(0,100000000)).padStart(8,'0')}`]);
    await pool.query("INSERT INTO merchants(id,account_id,owner_name,store_name,activity_type,status,account_status,onboarding_status) VALUES($1,$1,'Synthetic','Synthetic','retail','approved','approved','channel_connected')",[merchantId]);
    const checkout=kind==='saas'?await saas.createSaasBillingCheckout({merchantId,operation:'activate',plan:'silver',idempotencyKey:randomUUID(),provider:'test_fake'}):await cashier.createCashierBillingCheckout({merchantId,operation:'activate',requestedSeats:1,idempotencyKey:randomUUID(),provider:'test_fake'});
    const orders=kind==='saas'?'saas_billing_orders':'cashier_billing_orders',apps=kind==='saas'?'saas_entitlement_applications':'cashier_entitlement_applications',subscriptions=kind==='saas'?'subscriptions':'merchant_cashier_subscriptions';
    const payload={paymentId:`synthetic-discovery-${randomUUID()}`,requestId:randomUUID(),status:'SUCCESS',canceled:false,amount:checkout.order.amount_iqd,confirmedAmount:checkout.order.amount_iqd,currency:'IQD',creationDate:'2026-10-14T10:00:00'};paymentRefs.push(payload.paymentId);
    // An authenticated provider payment with no matching provider order must be
    // retained for recovery, never assigned to the unrelated test_fake order.
    const orphanReceivedAt=new Date();
    const orphanRun=await run(payload,orphanReceivedAt);
    const orphanObservation=orphanRun.messages.find(message=>message.type==='observation');
    assert.equal(orphanRun.code,0);
    assert.equal(orphanObservation?.errorCode,'SUPERQI_SANDBOX_VERIFIED_PAYMENT_ORDER_NOT_FOUND','unmatched verified receipt must return the precise retryable error');
    assert.equal(orphanObservation.gatewayCalls,1);
    assert.deepEqual(orphanObservation.afterContext,{tenant:'',audit:'',admin:''});
    assert.deepEqual(orphanObservation.afterNaked,{saas:0,cashier:0,receipts:0});
    const orphanReceipt=(await pool.query('SELECT * FROM verified_provider_payment_receipts WHERE payment_ref=$1',[payload.paymentId])).rows;
    assert.equal(orphanReceipt.length,1,'unmatched verified payment must survive callback failure');
    assert.equal(new Date(orphanReceipt[0].first_received_at).getTime(),orphanReceivedAt.getTime());
    assert.equal((await pool.query(`SELECT count(*)::int n FROM ${apps} WHERE order_id=$1`,[checkout.order.id])).rows[0].n,0);
    assert.equal((await pool.query(`SELECT count(*)::int n FROM ${subscriptions} WHERE merchant_id=$1`,[merchantId])).rows[0].n,0);
    await pool.query(`UPDATE ${orders} SET provider='superqi_sandbox',provider_checkout_ref=$2,metadata=metadata||$3::jsonb WHERE id=$1`,[checkout.order.id,payload.paymentId,JSON.stringify({provider_request_id:payload.requestId})]);
    const first=orphanReceivedAt,before=(await pool.query(`SELECT * FROM ${orders} WHERE id=$1`,[checkout.order.id])).rows[0];
    // Capability is never PUBLIC; lack of the reviewed runtime grant is retryable.
    await pool.query(`REVOKE ALL ON FUNCTION ${resolverIdentity} FROM ${role}`);
    assert.equal((await pool.query("SELECT has_function_privilege($1,$2,'EXECUTE') allowed",[role,resolverIdentity])).rows[0].allowed,false);
    const denied=await run(payload,first),deniedObservation=denied.messages.find(message=>message.type==='observation');
    assert.equal(denied.code,0);assert.equal(deniedObservation?.errorCode,'SUPERQI_SANDBOX_ORDER_RESOLVER_UNAVAILABLE');
    assert.deepEqual(deniedObservation.afterContext,{tenant:'',audit:'',admin:''});assert.deepEqual(deniedObservation.afterNaked,{saas:0,cashier:0,receipts:0});
    const admitted=(await pool.query('SELECT * FROM verified_provider_payment_receipts WHERE payment_ref=$1',[payload.paymentId])).rows;assert.equal(admitted.length,1);
    await pool.query(`GRANT EXECUTE ON FUNCTION ${resolverIdentity} TO ${role}`);
    const assertDenied=async expected=>{
      const orderBefore=(await pool.query(`SELECT * FROM ${orders} WHERE id=$1`,[checkout.order.id])).rows[0];
      const denied=await run(payload,first),observation=denied.messages.find(message=>message.type==='observation');
      assert.equal(denied.code,0);assert.equal(observation?.errorCode,expected);assert.deepEqual(observation.afterContext,{tenant:'',audit:'',admin:''});assert.deepEqual(observation.afterNaked,{saas:0,cashier:0,receipts:0});
      assert.deepEqual((await pool.query(`SELECT * FROM ${orders} WHERE id=$1`,[checkout.order.id])).rows[0],orderBefore);
      assert.deepEqual((await pool.query('SELECT * FROM verified_provider_payment_receipts WHERE payment_ref=$1',[payload.paymentId])).rows,admitted);
      assert.equal((await pool.query(`SELECT count(*)::int n FROM ${apps} WHERE order_id=$1`,[checkout.order.id])).rows[0].n,0);
      assert.equal((await pool.query(`SELECT count(*)::int n FROM ${subscriptions} WHERE merchant_id=$1`,[merchantId])).rows[0].n,0);
    };
    // Mutation after durable receipt admission, before application: an altered
    // provider mapping must fail closed without attaching or granting payment.
    // This is a sequential boundary proof, NOT an overlapping transaction race.
    await pool.query(`UPDATE ${orders} SET provider_checkout_ref=$2 WHERE id=$1`,[checkout.order.id,`remapped-${randomUUID()}`]);
    await assertDenied(kind==='saas'?'SUPERQI_SANDBOX_ORDER_IDENTITY_MISMATCH':'CASHIER_BILLING_ORDER_IDENTITY_MISMATCH');
    await pool.query(`UPDATE ${orders} SET provider_checkout_ref=$2 WHERE id=$1`,[checkout.order.id,payload.paymentId]);
    await pool.query(`UPDATE ${orders} SET metadata=metadata||$2::jsonb WHERE id=$1`,[checkout.order.id,JSON.stringify({provider_request_id:randomUUID()})]);
    await assertDenied(kind==='saas'?'SUPERQI_SANDBOX_ORDER_IDENTITY_MISMATCH':'CASHIER_BILLING_ORDER_IDENTITY_MISMATCH');
    await pool.query(`UPDATE ${orders} SET metadata=$2::jsonb WHERE id=$1`,[checkout.order.id,JSON.stringify(before.metadata)]);
    await pool.query(`UPDATE ${orders} SET amount_iqd=amount_iqd+1 WHERE id=$1`,[checkout.order.id]);
    await assertDenied('SUPERQI_SANDBOX_ORDER_AMOUNT_MISMATCH');
    await pool.query(`UPDATE ${orders} SET amount_iqd=$2 WHERE id=$1`,[checkout.order.id,payload.amount]);
    // Real two-session race: the owner holds an uncommitted mapping update
    // while the restricted callback tries to discover/apply the same receipt.
    // Observe a PostgreSQL lock wait rather than relying on a timed sleep.
    const locker=await pool.connect();
    let lockOpen=false,overlapping;
    try {
      await locker.query('BEGIN');
      lockOpen=true;
      await locker.query(`UPDATE ${orders} SET provider_checkout_ref=$2 WHERE id=$1`,[checkout.order.id,`raced-${randomUUID()}`]);
      overlapping=run(payload,first);
      const deadline=Date.now()+15000;
      let blocked=false;
      while(Date.now()<deadline){
        const observed=(await pool.query("SELECT cardinality(pg_blocking_pids(pid)) AS blockers FROM pg_stat_activity WHERE usename=$1 AND state='active'",[role])).rows;
        if(observed.some(row=>Number(row.blockers)>0)){blocked=true;break;}
        await new Promise(resolve=>setTimeout(resolve,75));
      }
      assert.equal(blocked,true,'restricted webhook must overlap the owner mapping transaction and block on its lock');
      await locker.query('COMMIT');
      lockOpen=false;
      const result=await overlapping;
      const observation=result.messages.find(message=>message.type==='observation');
      assert.equal(result.code,0);
      assert.ok(['SUPERQI_SANDBOX_ORDER_IDENTITY_MISMATCH','CASHIER_BILLING_ORDER_IDENTITY_MISMATCH','SUPERQI_SANDBOX_ORDER_REFERENCE_CONFLICT'].includes(observation?.errorCode),`unexpected race rejection: ${observation?.errorCode}`);
      assert.deepEqual(observation.afterContext,{tenant:'',audit:'',admin:''});
      assert.deepEqual(observation.afterNaked,{saas:0,cashier:0,receipts:0});
      assert.deepEqual((await pool.query('SELECT * FROM verified_provider_payment_receipts WHERE payment_ref=$1',[payload.paymentId])).rows,admitted);
      assert.equal((await pool.query(`SELECT count(*)::int n FROM ${apps} WHERE order_id=$1`,[checkout.order.id])).rows[0].n,0);
      assert.equal((await pool.query(`SELECT count(*)::int n FROM ${subscriptions} WHERE merchant_id=$1`,[merchantId])).rows[0].n,0);
    } finally {
      if(lockOpen)await locker.query('ROLLBACK');
      locker.release();
      if(overlapping)await overlapping;
    }
    await pool.query(`UPDATE ${orders} SET provider_checkout_ref=$2 WHERE id=$1`,[checkout.order.id,payload.paymentId]);
    // Second interleaving: let discovery complete, then block the attach
    // transaction on the merchant lock. Change the mapping while attach is
    // blocked; its in-transaction scope reauthorization must reject the drift.
    const attachLocker=await pool.connect();
    let attachLockOpen=false,attachOverlap;
    try {
      await attachLocker.query('BEGIN');
      attachLockOpen=true;
      await attachLocker.query('SELECT id FROM merchants WHERE id=$1 FOR UPDATE',[merchantId]);
      attachOverlap=run(payload,first);
      const deadline=Date.now()+15000;
      let blocked=false;
      while(Date.now()<deadline){
        const observed=(await pool.query("SELECT cardinality(pg_blocking_pids(pid)) AS blockers,query FROM pg_stat_activity WHERE usename=$1 AND state='active'",[role])).rows;
        if(observed.some(row=>Number(row.blockers)>0 && /merchants/i.test(row.query))){blocked=true;break;}
        await new Promise(resolve=>setTimeout(resolve,75));
      }
      assert.equal(blocked,true,'webhook must complete initial discovery and block on merchant lock before attach');
      await attachLocker.query(`UPDATE ${orders} SET provider_checkout_ref=$2 WHERE id=$1`,[checkout.order.id,`post-discovery-${randomUUID()}`]);
      await attachLocker.query('COMMIT');
      attachLockOpen=false;
      const result=await attachOverlap,observation=result.messages.find(message=>message.type==='observation');
      assert.equal(result.code,0);
      assert.ok(['SUPERQI_SANDBOX_ORDER_IDENTITY_MISMATCH','CASHIER_BILLING_ORDER_IDENTITY_MISMATCH','SUPERQI_SANDBOX_ORDER_REFERENCE_CONFLICT'].includes(observation?.errorCode),`unexpected post-discovery rejection: ${observation?.errorCode}`);
      assert.deepEqual(observation.afterContext,{tenant:'',audit:'',admin:''});
      assert.deepEqual(observation.afterNaked,{saas:0,cashier:0,receipts:0});
      assert.deepEqual((await pool.query('SELECT * FROM verified_provider_payment_receipts WHERE payment_ref=$1',[payload.paymentId])).rows,admitted);
      assert.equal((await pool.query(`SELECT count(*)::int n FROM ${apps} WHERE order_id=$1`,[checkout.order.id])).rows[0].n,0);
      assert.equal((await pool.query(`SELECT count(*)::int n FROM ${subscriptions} WHERE merchant_id=$1`,[merchantId])).rows[0].n,0);
    } finally {
      if(attachLockOpen)await attachLocker.query('ROLLBACK');
      attachLocker.release();
      if(attachOverlap)await attachOverlap;
    }
    await pool.query(`UPDATE ${orders} SET provider_checkout_ref=$2 WHERE id=$1`,[checkout.order.id,payload.paymentId]);
    const decoyMerchant=`discovery-decoy-${randomUUID()}`;merchantIds.push(decoyMerchant);
    await pool.query("INSERT INTO accounts(id,kind,phone,password_hash,state,phone_verified) VALUES($1,'merchant',$2,'synthetic','active',true)",[decoyMerchant,`+1990${String(randomInt(0,100000000)).padStart(8,'0')}`]);
    await pool.query("INSERT INTO merchants(id,account_id,owner_name,store_name,activity_type,status,account_status,onboarding_status) VALUES($1,$1,'Synthetic','Synthetic','retail','approved','approved','channel_connected')",[decoyMerchant]);
    const same=kind==='saas'?await saas.createSaasBillingCheckout({merchantId:decoyMerchant,operation:'activate',plan:'silver',idempotencyKey:randomUUID(),provider:'test_fake'}):await cashier.createCashierBillingCheckout({merchantId:decoyMerchant,operation:'activate',requestedSeats:1,idempotencyKey:randomUUID(),provider:'test_fake'});
    await pool.query(`UPDATE ${orders} SET provider='superqi_sandbox',provider_checkout_ref=$2,metadata=metadata||$3::jsonb WHERE id=$1`,[same.order.id,payload.paymentId,JSON.stringify({provider_request_id:payload.requestId})]);
    const decoyBefore=(await pool.query(`SELECT * FROM ${orders} WHERE id=$1`,[same.order.id])).rows[0];
    await assertDenied(kind==='saas'?'SUPERQI_SANDBOX_ORDER_AMBIGUOUS':'CASHIER_BILLING_ORDER_AMBIGUOUS');
    assert.deepEqual((await pool.query(`SELECT * FROM ${orders} WHERE id=$1`,[same.order.id])).rows[0],decoyBefore);
    assert.equal((await pool.query(`SELECT count(*)::int n FROM ${apps} WHERE order_id=$1`,[same.order.id])).rows[0].n,0);
    assert.equal((await pool.query(`SELECT count(*)::int n FROM ${subscriptions} WHERE merchant_id=$1`,[decoyMerchant])).rows[0].n,0);
    await pool.query(`UPDATE ${orders} SET provider='test_fake' WHERE id=$1`,[same.order.id]);
    const other=kind==='saas'?await cashier.createCashierBillingCheckout({merchantId,operation:'activate',requestedSeats:1,idempotencyKey:randomUUID(),provider:'test_fake'}):await saas.createSaasBillingCheckout({merchantId,operation:'activate',plan:'silver',idempotencyKey:randomUUID(),provider:'test_fake'});
    const otherTable=kind==='saas'?'cashier_billing_orders':'saas_billing_orders';
    await pool.query(`UPDATE ${otherTable} SET provider='superqi_sandbox',provider_checkout_ref=$2,metadata=metadata||$3::jsonb WHERE id=$1`,[other.order.id,payload.paymentId,JSON.stringify({provider_request_id:payload.requestId})]);
    await assertDenied('SUPERQI_SANDBOX_ORDER_AUTHORITY_COLLISION');
    await pool.query(`UPDATE ${otherTable} SET provider='test_fake' WHERE id=$1`,[other.order.id]);
    // This matrix tests the original SQL capability with alternate fixture
    // ownership, before application. No callback timing or mapping mutation.
    for (const forced of [null,'verified_provider_payment_receipts','saas_billing_orders','cashier_billing_orders']) {
      await kt.test(`${kind}: restricted resolver owner, FORCE RLS on ${forced || 'none'}`,async()=>{
        const client=await pool.connect(),owner=`billing_owner_${randomUUID().replaceAll('-','')}`;
        const protectedTables=['verified_provider_payment_receipts','saas_billing_orders','cashier_billing_orders'];
        const orderBefore=(await pool.query(`SELECT * FROM ${orders} WHERE id=$1`,[checkout.order.id])).rows[0];
        try {
          await client.query('BEGIN');
          await client.query(`CREATE ROLE ${owner} NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS`);
          await client.query(`GRANT USAGE ON SCHEMA public TO ${owner}`);
          for (const table of protectedTables) {
            await client.query(`ALTER TABLE public.${table} OWNER TO ${owner}`);
            await client.query(`ALTER TABLE public.${table} ${table===forced?'FORCE':'NO FORCE'} ROW LEVEL SECURITY`);
          }
          await client.query(`ALTER FUNCTION ${resolverIdentity} OWNER TO ${owner}`);
          await client.query(`SET LOCAL ROLE ${role}`);
          const metadata=(await client.query("SELECT c.relname,c.relrowsecurity,c.relforcerowsecurity,p.proowner=c.relowner AS matching_owner,r.rolsuper,r.rolbypassrls FROM pg_proc p JOIN pg_roles r ON r.oid=p.proowner JOIN pg_class c ON c.relname=ANY($1::text[]) AND c.relnamespace='public'::regnamespace WHERE p.oid=$2::regprocedure ORDER BY c.relname",[protectedTables,resolverIdentity])).rows;
          assert.deepEqual(metadata,protectedTables.slice().sort().map(relname=>({relname,relrowsecurity:true,relforcerowsecurity:relname===forced,matching_owner:true,rolsuper:false,rolbypassrls:false})));
          assert.equal((await client.query('SELECT current_user AS role')).rows[0].role,role);
          const resolve=()=>client.query('SELECT * FROM public.fawri_resolve_confirmed_payment_order($1,$2,$3,$4,$5,$6)',[admitted[0].provider_event_id,payload.paymentId,payload.requestId,admitted[0].event_type,payload.amount,admitted[0].payload_hash]);
          if (forced) {
            await assert.rejects(resolve,error=>error.code==='42501');
          } else {
            const resolved=(await resolve()).rows;
            assert.equal(resolved.length,1);
            assert.equal(resolved[0].order_id,checkout.order.id);
            assert.equal(resolved[0].merchant_id,merchantId);
            assert.equal(resolved[0].authority,kind==='saas'?'bot_subscription':'cashier_subscription');
            assert.equal(new Date(resolved[0].first_received_at).getTime(),first.getTime());
            assert.deepEqual((await client.query('SELECT (SELECT count(*)::int FROM saas_billing_orders) saas,(SELECT count(*)::int FROM cashier_billing_orders) cashier,(SELECT count(*)::int FROM verified_provider_payment_receipts) receipts')).rows[0],{saas:0,cashier:0,receipts:0});
          }
        } finally {
          await client.query('ROLLBACK');client.release();
        }
        assert.deepEqual((await pool.query('SELECT * FROM verified_provider_payment_receipts WHERE payment_ref=$1',[payload.paymentId])).rows,admitted);
        assert.deepEqual((await pool.query(`SELECT * FROM ${orders} WHERE id=$1`,[checkout.order.id])).rows[0],orderBefore);
        assert.equal((await pool.query(`SELECT count(*)::int n FROM ${apps} WHERE order_id=$1`,[checkout.order.id])).rows[0].n,0);
        assert.equal((await pool.query(`SELECT count(*)::int n FROM ${subscriptions} WHERE merchant_id=$1`,[merchantId])).rows[0].n,0);
      });
    }
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
