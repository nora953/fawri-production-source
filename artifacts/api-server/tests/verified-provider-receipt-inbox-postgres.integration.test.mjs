import assert from 'node:assert/strict';
import {randomUUID,randomInt,generateKeyPairSync,createSign} from 'node:crypto';
import test from 'node:test';
import {assertDisposablePostgres} from '../../../scripts/lib/disposable-postgres-test-guard.mjs';
import {cleanupResources} from './helpers/cleanup-resources.mjs';
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

test('confirmed provider inbox preserves unmatched payment evidence without guessing a tenant',async t=>{
  const paymentRefs=[],merchantIds=[],faults=[];
  let role,restricted;
  t.after(async()=>cleanupResources([
    ['restricted connection',async()=>{if(restricted){await restricted.query('RESET ROLE');restricted.release();}}],
    ['fault objects',async()=>{for(const name of faults){await pool.query(`DROP TRIGGER IF EXISTS ${name} ON verified_provider_payment_receipts`);await pool.query(`DROP FUNCTION IF EXISTS ${name}()`);}}],
    ['owned receipts',()=>pool.query('DELETE FROM verified_provider_payment_receipts WHERE payment_ref=ANY($1::text[])',[paymentRefs])],
    ['owned accounts',()=>pool.query('DELETE FROM accounts WHERE id=ANY($1::text[])',[merchantIds])],
    ['role grants',async()=>{if(role)await pool.query(`DROP OWNED BY ${role}`);}],
    ['role',async()=>{if(role)await pool.query(`DROP ROLE ${role}`);}],
    ['pool',()=>pool.end()],
  ]));
  function payload(amount=3900) {
    const paymentId=`synthetic-inbox-${randomUUID()}`;paymentRefs.push(paymentId);
    return {paymentId,requestId:randomUUID(),status:'SUCCESS',canceled:false,amount,confirmedAmount:amount,currency:'IQD',creationDate:'2026-10-14T10:00:00'};
  }
  const receipts=async paymentId=>(await pool.query('SELECT * FROM verified_provider_payment_receipts WHERE payment_ref=$1',[paymentId])).rows;
  const missingOrder=error=>error.code==='SUPERQI_SANDBOX_VERIFIED_PAYMENT_ORDER_NOT_FOUND'&&error.status===503;

  await t.test('invalid signature and mismatched confirmed gateway state never create receipts',async()=>{
    const p=payload();
    await assert.rejects(()=>handle({payload:p,signature:'invalid',fetchImpl:async()=>{throw new Error('unverified webhook must not call gateway');}}),error=>error.code==='SUPERQI_SANDBOX_SIGNATURE_INVALID');
    await assert.rejects(()=>handle({payload:p,signature:signatureOf(p),fetchImpl:fakeStatus({...p,amount:p.amount+1})}),error=>error.code==='SUPERQI_SANDBOX_WEBHOOK_STATUS_MISMATCH');
    await assert.rejects(()=>handle({payload:p,signature:signatureOf(p),fetchImpl:fakeStatus({...p,requestId:randomUUID()})}),error=>error.code==='SUPERQI_SANDBOX_REQUEST_ID_MISMATCH');
    assert.equal((await receipts(p.paymentId)).length,0);
  });

  await t.test('receipt SQL failure rejects before durable success; retry preserves one record',async()=>{
    const p=payload(),name=`inbox_fault_${randomUUID().replaceAll('-','')}`;faults.push(name);
    await pool.query(`CREATE FUNCTION ${name}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.payment_ref=TG_ARGV[0] THEN RAISE EXCEPTION 'synthetic inbox failure' USING ERRCODE='P0001'; END IF; RETURN NEW; END $$`);
    await pool.query(`CREATE TRIGGER ${name} BEFORE INSERT ON verified_provider_payment_receipts FOR EACH ROW EXECUTE FUNCTION ${name}('${p.paymentId}')`);
    const input={payload:p,signature:signatureOf(p),fetchImpl:fakeStatus(p)};
    await assert.rejects(()=>handle(input),error=>error.code==='P0001');
    assert.equal((await receipts(p.paymentId)).length,0);
    await pool.query(`DROP TRIGGER ${name} ON verified_provider_payment_receipts`);
    await assert.rejects(()=>handle(input),missingOrder);
    assert.equal((await receipts(p.paymentId)).length,1);
  });

  for(const kind of ['saas','cashier'])for(const conflict of ['request_mismatch','payment_mismatch','request_missing','amount_mismatch'])await t.test(`${kind}: ${conflict} keeps receipt but cannot attach or grant; reviewed mapping replay applies once`,async()=>{
    const merchantId=`binding-merchant-${randomUUID()}`;merchantIds.push(merchantId);
    await pool.query("INSERT INTO accounts(id,kind,phone,password_hash,state,phone_verified) VALUES($1,'merchant',$2,'synthetic','active',true)",[merchantId,`+1994${String(randomInt(0,100000000)).padStart(8,'0')}`]);
    await pool.query("INSERT INTO merchants(id,account_id,owner_name,store_name,activity_type,status,account_status,onboarding_status) VALUES($1,$1,'Synthetic','Synthetic','retail','approved','approved','channel_connected')",[merchantId]);
    const checkout=kind==='saas'
      ?await saas.createSaasBillingCheckout({merchantId,operation:'activate',plan:'silver',idempotencyKey:randomUUID(),provider:'test_fake'})
      :await cashier.createCashierBillingCheckout({merchantId,operation:'activate',requestedSeats:1,idempotencyKey:randomUUID(),provider:'test_fake'});
    const p=payload(checkout.order.amount_iqd+(conflict==='amount_mismatch'?1:0));
    const orders=kind==='saas'?'saas_billing_orders':'cashier_billing_orders';
    const apps=kind==='saas'?'saas_entitlement_applications':'cashier_entitlement_applications';
    const subscription=kind==='saas'?'subscriptions':'merchant_cashier_subscriptions';
    const wrongPayment=`synthetic-other-${randomUUID()}`;
    await pool.query(`UPDATE ${orders} SET provider='superqi_sandbox',provider_checkout_ref=$2,metadata=(metadata-'provider_request_id')||$3::jsonb WHERE id=$1`,[checkout.order.id,conflict==='payment_mismatch'?wrongPayment:p.paymentId,JSON.stringify(conflict==='request_missing'?{}:{provider_request_id:conflict==='request_mismatch'?randomUUID():p.requestId})]);
    const snapshot=async()=>(await pool.query(`SELECT * FROM ${orders} WHERE id=$1`,[checkout.order.id])).rows[0];
    const before=await snapshot(),first=new Date(),later=new Date(first.getTime()+86400000);
    const input={payload:p,signature:signatureOf(p),fetchImpl:fakeStatus(p)};
    const code=conflict==='amount_mismatch'?'SUPERQI_SANDBOX_ORDER_AMOUNT_MISMATCH':kind==='saas'?'SUPERQI_SANDBOX_ORDER_IDENTITY_MISMATCH':'CASHIER_BILLING_ORDER_IDENTITY_MISMATCH';
    await assert.rejects(()=>handle({...input,receivedAt:first}),error=>error.code===code&&error.status===409);
    await assert.rejects(()=>handle({...input,receivedAt:later}),error=>error.code===code&&error.status===409);
    assert.deepEqual(await snapshot(),before,'identity failure must not change order fields');
    assert.equal((await receipts(p.paymentId)).length,1);
    assert.equal((await pool.query(`SELECT count(*)::int AS n FROM ${apps} WHERE order_id=$1`,[checkout.order.id])).rows[0].n,0);
    assert.equal((await pool.query(`SELECT count(*)::int AS n FROM ${subscription} WHERE merchant_id=$1`,[merchantId])).rows[0].n,0);
    if(conflict!=='amount_mismatch'){
      // Owned fixture restores original confirmed identities; no product manual mapping API.
      await pool.query(`UPDATE ${orders} SET provider_checkout_ref=$2,metadata=metadata||$3::jsonb WHERE id=$1`,[checkout.order.id,p.paymentId,JSON.stringify({provider_request_id:p.requestId})]);
      const results=await Promise.all([handle({...input,receivedAt:later}),handle({...input,receivedAt:later})]);
      assert.deepEqual(results.map(result=>result.outcome.status).sort(),['applied','duplicate']);
      assert.equal((await pool.query(`SELECT count(*)::int AS n FROM ${apps} WHERE order_id=$1`,[checkout.order.id])).rows[0].n,1);
      assert.equal(new Date((await snapshot()).paid_at).getTime(),first.getTime());
    }
    console.log('VERIFIED_ORDER_IDENTITY_BINDING_PROOF '+JSON.stringify({kind,conflict,receiptDurable:true,conflictOrderUnchanged:true,conflictEntitlementGrants:0,recovery:conflict==='amount_mismatch'?'blocked':'once_using_first_receipt'}));
  });

  for(const kind of ['saas','cashier'])await t.test(`${kind}: matching request with unassigned payment reference remains recoverable`,async()=>{
    const merchantId=`binding-null-${randomUUID()}`;merchantIds.push(merchantId);
    await pool.query("INSERT INTO accounts(id,kind,phone,password_hash,state,phone_verified) VALUES($1,'merchant',$2,'synthetic','active',true)",[merchantId,`+1995${String(randomInt(0,100000000)).padStart(8,'0')}`]);
    await pool.query("INSERT INTO merchants(id,account_id,owner_name,store_name,activity_type,status,account_status,onboarding_status) VALUES($1,$1,'Synthetic','Synthetic','retail','approved','approved','channel_connected')",[merchantId]);
    const checkout=kind==='saas'
      ?await saas.createSaasBillingCheckout({merchantId,operation:'activate',plan:'silver',idempotencyKey:randomUUID(),provider:'test_fake'})
      :await cashier.createCashierBillingCheckout({merchantId,operation:'activate',requestedSeats:1,idempotencyKey:randomUUID(),provider:'test_fake'});
    const p=payload(checkout.order.amount_iqd),orders=kind==='saas'?'saas_billing_orders':'cashier_billing_orders';
    await pool.query(`UPDATE ${orders} SET provider='superqi_sandbox',provider_checkout_ref=NULL,metadata=metadata||$2::jsonb WHERE id=$1`,[checkout.order.id,JSON.stringify({provider_request_id:p.requestId})]);
    const result=await handle({payload:p,signature:signatureOf(p),fetchImpl:fakeStatus(p)});
    assert.equal(result.outcome.status,'applied');
    assert.equal((await pool.query(`SELECT provider_checkout_ref FROM ${orders} WHERE id=$1`,[checkout.order.id])).rows[0].provider_checkout_ref,p.paymentId);
  });

  for(const kind of ['saas','cashier'])await t.test(`${kind}: orphan commit survives concurrent redelivery and restored order applies once using first receipt time`,async()=>{
    const merchantId=`inbox-merchant-${randomUUID()}`;merchantIds.push(merchantId);
    await pool.query("INSERT INTO accounts(id,kind,phone,password_hash,state,phone_verified) VALUES($1,'merchant',$2,'synthetic','active',true)",[merchantId,`+1993${String(randomInt(0,100000000)).padStart(8,'0')}`]);
    await pool.query("INSERT INTO merchants(id,account_id,owner_name,store_name,activity_type,status,account_status,onboarding_status) VALUES($1,$1,'Synthetic','Synthetic','retail','approved','approved','channel_connected')",[merchantId]);
    // A different provider's synthetic order is not a valid SuperQi mapping.
    const checkout=kind==='saas'
      ?await saas.createSaasBillingCheckout({merchantId,operation:'activate',plan:'silver',idempotencyKey:randomUUID(),provider:'test_fake'})
      :await cashier.createCashierBillingCheckout({merchantId,operation:'activate',requestedSeats:1,idempotencyKey:randomUUID(),provider:'test_fake'});
    const p=payload(kind==='saas'?getSaasPlan('silver').monthly_price_iqd:3900);
    assert.equal(p.amount,checkout.order.amount_iqd);
    const first=new Date(),later=new Date(first.getTime()+86400000);
    const input={payload:p,signature:signatureOf(p),fetchImpl:fakeStatus(p)};
    await assert.rejects(()=>handle({...input,receivedAt:first}),missingOrder);
    await Promise.all([assert.rejects(()=>handle({...input,receivedAt:later}),missingOrder),assert.rejects(()=>handle({...input,receivedAt:later}),missingOrder)]);
    const before=await receipts(p.paymentId);assert.equal(before.length,1);
    assert.equal(new Date(before[0].first_received_at).getTime(),first.getTime());
    const apps=kind==='saas'?'saas_entitlement_applications':'cashier_entitlement_applications';
    const subscriptions=kind==='saas'?'subscriptions':'merchant_cashier_subscriptions';
    assert.equal((await pool.query(`SELECT count(*)::int AS n FROM ${apps} WHERE order_id=$1`,[checkout.order.id])).rows[0].n,0);
    assert.equal((await pool.query(`SELECT count(*)::int AS n FROM ${subscriptions} WHERE merchant_id=$1`,[merchantId])).rows[0].n,0);
    const changed={...p,requestId:randomUUID()};
    await assert.rejects(()=>handle({payload:changed,signature:signatureOf(changed),fetchImpl:fakeStatus(changed)}),error=>error.code==='SUPERQI_SANDBOX_RECEIPT_IDENTITY_COLLISION');
    assert.equal((await receipts(p.paymentId))[0].request_ref,p.requestId);
    const orders=kind==='saas'?'saas_billing_orders':'cashier_billing_orders';
    // Only this owned fixture reconstructs the reviewed original mapping.
    await pool.query(`UPDATE ${orders} SET provider='superqi_sandbox',provider_checkout_ref=$2,metadata=metadata||$3::jsonb WHERE id=$1`,[checkout.order.id,p.paymentId,JSON.stringify({provider_request_id:p.requestId})]);
    const results=await Promise.all([handle({...input,receivedAt:later}),handle({...input,receivedAt:later})]);
    assert.deepEqual(results.map(result=>result.outcome.status).sort(),['applied','duplicate']);
    assert.equal((await receipts(p.paymentId)).length,1);
    assert.equal((await pool.query(`SELECT count(*)::int AS n FROM ${apps} WHERE order_id=$1`,[checkout.order.id])).rows[0].n,1);
    assert.equal((await pool.query(`SELECT count(*)::int AS n FROM ${subscriptions} WHERE merchant_id=$1`,[merchantId])).rows[0].n,1);
    assert.equal(new Date((await pool.query(`SELECT paid_at FROM ${orders} WHERE id=$1`,[checkout.order.id])).rows[0].paid_at).getTime(),first.getTime());
    console.log('VERIFIED_ORPHAN_INBOX_PROOF '+JSON.stringify({kind,receiptBeforeOrderMapping:1,preMappingEntitlement:0,replayAppliedOnce:true,originalReceiptTime:true}));
  });

  await t.test('restricted role cannot read/write inbox or execute PUBLIC admission; explicit bounded capability exposes only one timestamp',async()=>{
    role=`inbox_role_${randomUUID().replaceAll('-','')}`;
    await pool.query(`CREATE ROLE ${role} NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS`);
    await pool.query(`GRANT USAGE ON SCHEMA public TO ${role}`);
    await pool.query(`GRANT SELECT,INSERT,UPDATE,DELETE ON verified_provider_payment_receipts TO ${role}`);
    const p=payload(),eventId=`synthetic-event-${randomUUID()}`,first=new Date();
    const args=[eventId,p.paymentId,p.requestId,'payment_succeeded',3900,'a'.repeat(64),first];
    restricted=await pool.connect();await restricted.query(`SET ROLE ${role}`);
    assert.equal((await restricted.query('SELECT * FROM verified_provider_payment_receipts')).rows.length,0);
    await assert.rejects(()=>restricted.query(admitSql,args),error=>error.code==='42501');
    await assert.rejects(()=>restricted.query("INSERT INTO verified_provider_payment_receipts VALUES('superqi_sandbox',$1,$2,$3,'payment_succeeded',3900,$4,$5)",[eventId,p.paymentId,p.requestId,'a'.repeat(64),first]),error=>error.code==='42501');
    await pool.query(`GRANT EXECUTE ON FUNCTION ${functionIdentity} TO ${role}`);
    await assert.rejects(()=>restricted.query(admitSql,['x'.repeat(301),...args.slice(1)]),error=>error.code==='22023');
    const admitted=await restricted.query(admitSql,args);
    assert.deepEqual(Object.keys(admitted.rows[0]),['first_received_at']);
    assert.equal(new Date(admitted.rows[0].first_received_at).getTime(),first.getTime());
    await assert.rejects(()=>restricted.query(admitSql,[...args.slice(0,5),'b'.repeat(64),first]),error=>error.code==='23505');
    assert.equal((await restricted.query('SELECT * FROM verified_provider_payment_receipts')).rows.length,0);
    assert.equal((await restricted.query('DELETE FROM verified_provider_payment_receipts')).rowCount,0);
    assert.equal((await restricted.query('UPDATE verified_provider_payment_receipts SET amount_iqd=1')).rowCount,0);
    await restricted.query('RESET ROLE');restricted.release();restricted=undefined;
    assert.equal((await receipts(p.paymentId)).length,1);
  });

  for (const forced of [false,true]) await t.test(`admission restricted function/table owner with FORCE RLS ${forced}`,async()=>{
    const client=await pool.connect(),owner=`admission_owner_${randomUUID().replaceAll('-','')}`;
    const p=payload(),first=new Date(),later=new Date(first.getTime()+86400000);
    const args=[`synthetic-event-${randomUUID()}`,p.paymentId,p.requestId,'payment_succeeded',3900,'a'.repeat(64),first];
    const original=(await pool.query("SELECT c.relowner,c.relrowsecurity,c.relforcerowsecurity,p.proowner,p.prosecdef,p.proconfig FROM pg_class c CROSS JOIN pg_proc p WHERE c.oid='public.verified_provider_payment_receipts'::regclass AND p.oid=$1::regprocedure",[functionIdentity])).rows;
    const entitlementCounts=async()=>(await pool.query('SELECT (SELECT count(*)::int FROM saas_entitlement_applications) saas,(SELECT count(*)::int FROM cashier_entitlement_applications) cashier,(SELECT count(*)::int FROM subscriptions) subscriptions,(SELECT count(*)::int FROM merchant_cashier_subscriptions) cashier_subscriptions')).rows;
    const beforeEntitlements=await entitlementCounts();
    try {
      await client.query('BEGIN');
      await client.query(`CREATE ROLE ${owner} NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS`);
      await client.query(`GRANT USAGE ON SCHEMA public TO ${owner}`);
      await client.query(`ALTER TABLE public.verified_provider_payment_receipts OWNER TO ${owner}`);
      await client.query(`ALTER TABLE public.verified_provider_payment_receipts ${forced?'FORCE':'NO FORCE'} ROW LEVEL SECURITY`);
      await client.query(`ALTER FUNCTION ${functionIdentity} OWNER TO ${owner}`);
      await client.query(`SET LOCAL ROLE ${role}`);
      const metadata=(await client.query("SELECT c.relrowsecurity,c.relforcerowsecurity,p.proowner=c.relowner AS matching_owner,p.prosecdef,p.proconfig,r.rolsuper,r.rolbypassrls FROM pg_proc p JOIN pg_roles r ON r.oid=p.proowner CROSS JOIN pg_class c WHERE c.oid='public.verified_provider_payment_receipts'::regclass AND p.oid=$1::regprocedure",[functionIdentity])).rows[0];
      assert.deepEqual(metadata,{relrowsecurity:true,relforcerowsecurity:forced,matching_owner:true,prosecdef:true,proconfig:['search_path=pg_catalog','row_security=off'],rolsuper:false,rolbypassrls:false});
      assert.equal((await client.query('SELECT current_user AS role')).rows[0].role,role);
      assert.equal((await client.query('SELECT * FROM verified_provider_payment_receipts')).rows.length,0);
      if (forced) {
        await client.query('SAVEPOINT expected_denial');
        await assert.rejects(()=>client.query(admitSql,args),error=>error.code==='42501');
        await client.query('ROLLBACK TO SAVEPOINT expected_denial');
        await client.query('RESET ROLE');
        assert.equal((await client.query('SELECT count(*)::int n FROM verified_provider_payment_receipts WHERE payment_ref=$1',[p.paymentId])).rows[0].n,0);
      } else {
        const admitted=await client.query(admitSql,args);
        assert.deepEqual(Object.keys(admitted.rows[0]),['first_received_at']);
        assert.equal(new Date(admitted.rows[0].first_received_at).getTime(),first.getTime());
        assert.deepEqual((await client.query(admitSql,[...args.slice(0,6),later])).rows,admitted.rows);
        await client.query('SAVEPOINT expected_collision');
        await assert.rejects(()=>client.query(admitSql,[...args.slice(0,5),'b'.repeat(64),later]),error=>error.code==='23505');
        await client.query('ROLLBACK TO SAVEPOINT expected_collision');
        assert.equal((await client.query('SELECT * FROM verified_provider_payment_receipts')).rows.length,0);
        assert.equal((await client.query('UPDATE verified_provider_payment_receipts SET amount_iqd=1')).rowCount,0);
        assert.equal((await client.query('DELETE FROM verified_provider_payment_receipts')).rowCount,0);
        await client.query('RESET ROLE');
        const stored=(await client.query('SELECT * FROM verified_provider_payment_receipts WHERE payment_ref=$1',[p.paymentId])).rows;
        assert.equal(stored.length,1);
        assert.equal(stored[0].provider_event_id,args[0]);
        assert.equal(stored[0].request_ref,p.requestId);
        assert.equal(stored[0].payload_hash,args[5]);
        assert.equal(stored[0].amount_iqd,3900);
        assert.equal(new Date(stored[0].first_received_at).getTime(),first.getTime());
      }
    } finally {
      await client.query('ROLLBACK');client.release();
    }
    assert.equal((await receipts(p.paymentId)).length,0,'transactional owner fixture leaves no receipt');
    assert.deepEqual(await entitlementCounts(),beforeEntitlements,'admission never grants an entitlement');
    assert.deepEqual((await pool.query("SELECT c.relowner,c.relrowsecurity,c.relforcerowsecurity,p.proowner,p.prosecdef,p.proconfig FROM pg_class c CROSS JOIN pg_proc p WHERE c.oid='public.verified_provider_payment_receipts'::regclass AND p.oid=$1::regprocedure",[functionIdentity])).rows,original);
    assert.equal((await pool.query('SELECT count(*)::int n FROM pg_roles WHERE rolname=$1',[owner])).rows[0].n,0);
    console.log('ADMISSION_OWNER_RLS_PROOF '+JSON.stringify({forced,restrictedOwner:true,expectedSqlstate:forced?'42501':null,immutableReplay:!forced,rollbackRestored:true,entitlementsUnchanged:true}));
  });
});
