import assert from 'node:assert/strict';
import {randomUUID,randomInt,generateKeyPairSync} from 'node:crypto';
import test from 'node:test';
import {assertDisposablePostgres} from '../../../scripts/lib/disposable-postgres-test-guard.mjs';
import {cleanupResources} from './helpers/cleanup-resources.mjs';
await assertDisposablePostgres();
Object.assign(process.env,{
  FAWRI_OPERATIONAL_POSTGRES_AUTHORITY:'required',FAWRI_AUTH_POSTGRES_SESSION_AUTHORITY:'required',
  FAWRI_AUTH_SECURITY_SECRET:'synthetic-receipt-operator-security-secret-at-least-32-characters',
  FAWRI_PASSWORD_SALT:'synthetic-receipt-operator-password-salt',FAWRI_ALLOWED_ORIGINS:'https://operator.example.invalid',
});
const {publicKey}=generateKeyPairSync('rsa',{modulusLength:2048});
Object.assign(process.env,{FAWRI_SUBSCRIPTION_POSTGRES_AUTHORITY:'required',FAWRI_SAAS_BILLING_PROVIDER:'superqi_sandbox',FAWRI_SAAS_BILLING_PROVIDERS:'superqi_sandbox,test_fake',FAWRI_SUPERQI_SANDBOX_ENABLED:'1',FAWRI_SUPERQI_SANDBOX_USERNAME:'synthetic-user',FAWRI_SUPERQI_SANDBOX_PASSWORD:'synthetic-password',FAWRI_SUPERQI_SANDBOX_TERMINAL_ID:'synthetic-terminal',FAWRI_SUPERQI_SANDBOX_NOTIFICATION_URL:'https://operator.example.invalid/webhook',FAWRI_SUPERQI_SANDBOX_FINISH_URL:'https://operator.example.invalid/finish',FAWRI_SUPERQI_SANDBOX_WEBHOOK_PUBLIC_KEY_B64:Buffer.from(publicKey.export({type:'spki',format:'pem'})).toString('base64')});
const {pool}=await import('@workspace/db');
const saas=await import('../src/services/saasBillingAuthority.ts');
const cashier=await import('../src/services/cashierBillingAuthority.ts');
const {superQiConfirmedProviderEventId}=await import('../src/services/superQiSandboxWebhook.ts');
const {superQiWebhookPayloadHash}=await import('../src/services/superQiSandboxTransport.ts');
const {authPostgresSessionAuthority:authority}=await import('../src/services/authPostgresSessionAuthority.ts');
const {registerAdminDeviceAuthoritative,setAdminDeviceTrustAuthoritative}=await import('../src/services/postgresAdminSecurityAuthority.ts');
const {default:router}=await import('../src/routes/auth-verified-receipts-postgres-routes.ts');
const {enforceAuthOrigin}=await import('../src/middleware/authSession.ts');
const capability='public.fawri_review_verified_payment_receipt(text,text,text,text,text,text)';
const readSql='SELECT * FROM public.fawri_review_verified_payment_receipt($1,$2,$3,$4,$5,$6)';

test('real HTTP replay review requires fresh provider confirmation and durable current-operator audit without grants',async t=>{
  const ids=[],events=[],role=`receipt_http_${randomUUID().replaceAll('-','')}`;
  let admin,server,roleCreated=false,faultName;
  const originalOptions=pool.options.options,nativeFetch=globalThis.fetch;
  let providerCalls=0,providerMode='ok',providerHook;const fixtures=[],setupClients=[];
  globalThis.fetch=async(url,init)=>{const target=String(url);if(target.startsWith('https://uat-sandbox-3ds-api.qi.iq/api/v1/payment/')){providerCalls++;assert.equal(init.method,'GET');if(providerHook)await providerHook();if(providerMode==='outage')throw new Error('SENSITIVE_PROVIDER_DETAIL');const f=fixtures.find(f=>target.endsWith(`/payment/${encodeURIComponent(f.payload.paymentId)}/status`));assert.ok(f,'owned provider identity only');return Response.json({...f.payload,...(providerMode==='request'?{requestId:randomUUID()}:providerMode==='amount'?{confirmedAmount:f.payload.amount+1}:providerMode==='nonterminal'?{status:'CREATED'}:providerMode==='date'?{creationDate:'2026-10-15T12:00:00Z'}:{})});}assert.ok(target.startsWith('http://127.0.0.1:'),'no external network');return nativeFetch(url,init);};
  t.after(async()=>cleanupResources([
    ['transport restore',()=>{globalThis.fetch=nativeFetch;}],
    ['HTTP server',()=>server?new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve())):undefined],
    ['audit fault',async()=>{if(faultName){await admin.query(`DROP TRIGGER IF EXISTS ${faultName} ON database_admin_access_audits`);await admin.query(`DROP FUNCTION IF EXISTS ${faultName}()`);}}],
    ['owned receipts',()=>admin?.query('DELETE FROM verified_provider_payment_receipts WHERE provider_event_id=ANY($1::text[])',[events])],
    ['owned read audits',()=>admin?.query('DELETE FROM database_admin_access_audits WHERE admin_account_id=ANY($1::text[])',[ids])],
    ['owned devices',()=>admin?.query('DELETE FROM trusted_devices WHERE account_id=ANY($1::text[])',[ids])],
    ['owned accounts',()=>admin?.query('DELETE FROM accounts WHERE id=ANY($1::text[])',[ids])],
    ['role grants',()=>roleCreated?admin.query(`DROP OWNED BY ${role}`):undefined],
    ['role',()=>roleCreated?admin.query(`DROP ROLE ${role}`):undefined],
    ['owner connection',()=>{pool.options.options=originalOptions;for(const client of setupClients)client.release();admin?.release();}],
    ['pool',()=>pool.end()],
  ]));
  admin=await pool.connect();
  await admin.query(`CREATE ROLE ${role} NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS`);roleCreated=true;
  await admin.query(`GRANT USAGE ON SCHEMA public TO ${role}`);
  await admin.query(`GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO ${role}`);
  await admin.query(`GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA public TO ${role}`);
  async function account(kind,adminRole,permissions=[]) {
    const id=`receipt-actor-${randomUUID()}`;ids.push(id);
    await admin.query('INSERT INTO accounts(id,kind,phone,password_hash,state,phone_verified) VALUES($1,$2,$3,$4,\'active\',true)',[id,kind,`+1992${String(randomInt(0,100000000)).padStart(8,'0')}`,'synthetic']);
    if(kind==='admin'){
      await admin.query("INSERT INTO admin_profiles(id,account_id,display_name,role,enabled,must_change_password) VALUES($1,$1,'Synthetic',$2,true,false)",[id,adminRole]);
      for(const permission of permissions)await admin.query('INSERT INTO admin_permissions(admin_id,permission) VALUES($1,$2)',[id,permission]);
    }
    return {id,kind,adminRole,permissions,device:`synthetic-device-${randomUUID()}`};
  }
  const owner=await account('admin','owner_admin'),finance=await account('admin','assistant_admin',['manage_subscriptions']),denied=await account('admin','assistant_admin',['view_logs']),merchant=await account('merchant');
  const references=[];
  for(const kind of ['saas','cashier']){
    const id=`replay-merchant-${randomUUID()}`;ids.push(id);
    await admin.query("INSERT INTO accounts(id,kind,phone,password_hash,state,phone_verified) VALUES($1,'merchant',$2,'synthetic','active',true)",[id,`+1996${String(randomInt(0,100000000)).padStart(8,'0')}`]);
    await admin.query("INSERT INTO merchants(id,account_id,owner_name,store_name,activity_type,status,account_status,onboarding_status) VALUES($1,$1,'Synthetic','Synthetic','retail','approved','approved','channel_connected')",[id]);
    const checkout=kind==='saas'?await saas.createSaasBillingCheckout({merchantId:id,operation:'activate',plan:'silver',idempotencyKey:randomUUID(),provider:'test_fake'}):await cashier.createCashierBillingCheckout({merchantId:id,operation:'activate',requestedSeats:1,idempotencyKey:randomUUID(),provider:'test_fake'});
    const payload={paymentId:`synthetic-replay-${randomUUID()}`,requestId:randomUUID(),status:'SUCCESS',canceled:false,amount:checkout.order.amount_iqd,confirmedAmount:checkout.order.amount_iqd,currency:'IQD',creationDate:'2026-10-14T12:00:00Z'};
    const event=superQiConfirmedProviderEventId(payload);events.push(event);references.push(payload.paymentId,payload.requestId);
    const table=kind==='saas'?'saas_billing_orders':'cashier_billing_orders';
    await admin.query(`UPDATE ${table} SET provider='superqi_sandbox',provider_checkout_ref=$2,metadata=metadata||$3::jsonb WHERE id=$1`,[checkout.order.id,payload.paymentId,JSON.stringify({provider_request_id:payload.requestId})]);
    await admin.query("INSERT INTO verified_provider_payment_receipts VALUES('superqi_sandbox',$1,$2,$3,'payment_succeeded',$4,$5,$6)",[event,payload.paymentId,payload.requestId,payload.amount,superQiWebhookPayloadHash(payload),'2026-10-14T12:00:00.123456Z']);
    fixtures.push({kind,table,payload,event,order:checkout.order,body:{authority:kind==='saas'?'bot_subscription':'cashier_subscription',order_id:checkout.order.id}});
  }
  const orderSnapshot=async()=>Promise.all(fixtures.map(async f=>(await admin.query(`SELECT * FROM ${f.table} WHERE id=$1`,[f.order.id])).rows[0]));
  const originalOrders=await orderSnapshot();
  const receiptSnapshot=async()=>(await admin.query('SELECT * FROM verified_provider_payment_receipts WHERE provider_event_id=ANY($1::text[]) ORDER BY provider_event_id',[events])).rows;
  const originalReceipts=await receiptSnapshot();
  const entitlementCount=async()=>(await admin.query('SELECT (SELECT count(*) FROM saas_entitlement_applications)+(SELECT count(*) FROM cashier_entitlement_applications) AS n')).rows[0].n;
  const originalEntitlements=await entitlementCount();
  while(pool.idleCount>0)setupClients.push(await pool.connect());
  pool.options.options=`-c role=${role}`;
  const identity=(await pool.query("SELECT current_user AS role,rolsuper,rolbypassrls,EXISTS(SELECT 1 FROM pg_class WHERE relnamespace='public'::regnamespace AND relowner=r.oid) AS owns_table FROM pg_roles r WHERE rolname=current_user")).rows[0];
  assert.deepEqual(identity,{role,rolsuper:false,rolbypassrls:false,owns_table:false});
  assert.equal((await pool.query('SELECT * FROM verified_provider_payment_receipts')).rows.length,0);
  await assert.rejects(()=>pool.query(readSql,[owner.id,fixtures[0].event,fixtures[0].body.authority,fixtures[0].order.id,randomUUID(),'a'.repeat(64)]),error=>error.code==='42501');
  await admin.query(`GRANT EXECUTE ON FUNCTION ${capability} TO ${role}`);
  for(const actor of [owner,finance,denied,merchant]){
    if(actor.kind==='admin'){
      const device=await registerAdminDeviceAuthoritative({accountId:actor.id,accountKind:'admin',deviceId:actor.device,deviceLabel:'Synthetic'});
      const trusted=await setAdminDeviceTrustAuthoritative({deviceRecordId:device.id,trusted:true,actorAccountId:owner.id});
      assert.equal(trusted.status,'trusted');
    }
    actor.session=await authority.issueSession({accountId:actor.id,accountKind:actor.kind,tenantId:actor.id,deviceId:actor.device,deviceLabel:'Synthetic',...(actor.kind==='admin'?{adminRole:actor.adminRole,permissions:actor.permissions}:{})});
  }
  const [{default:express},{default:cookieParser}]=await Promise.all([import('express'),import('cookie-parser')]);
  const app=express();app.use(cookieParser());app.use(express.json());app.use('/api/auth',enforceAuthOrigin,router);
  server=await new Promise((resolve,reject)=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));s.once('error',reject);});
  const base=`http://127.0.0.1:${server.address().port}/api/auth/admin/billing/verified-receipts`;
  async function request(actor,f=fixtures[0],body=f.body,headers={}) {
    const response=await fetch(`${base}/${f.event}/replay-review`,{method:'POST',headers:{'Content-Type':'application/json',Origin:'https://operator.example.invalid',...(actor?{Cookie:`fawri_admin_session_v2=${actor.session.token}`,'X-Fawri-Device-Id':actor.device}:{}),...headers},body:JSON.stringify(body)});
    return {response,body:await response.json()};
  }
  const audits=async()=>(await admin.query("SELECT id,admin_account_id,reason_code,request_hash FROM database_admin_access_audits WHERE admin_account_id=ANY($1::text[]) AND reason_code='BILLING_RECEIPT_REPLAY_REVIEW' ORDER BY started_at,id",[ids])).rows;
  await t.test('session/device/permission/origin denials stop before raw lookup and provider access',async()=>{
    assert.equal((await request()).response.status,401);
    assert.equal((await request(owner,fixtures[0],fixtures[0].body,{'X-Fawri-Device-Id':'wrong'})).response.status,401);
    assert.equal((await request(merchant)).response.status,401);
    assert.equal((await request(denied)).response.status,403);
    assert.equal((await request(owner,fixtures[0],fixtures[0].body,{Origin:'https://forbidden.example.invalid'})).response.status,403);
    assert.equal(providerCalls,0);assert.equal((await audits()).length,0);
  });
  await t.test('unexpected actor/merchant/amount body and mismatching expected order fail closed',async()=>{
    for(const body of [{...fixtures[0].body,actor_id:owner.id},{...fixtures[0].body,merchant_id:ids[0]},{...fixtures[0].body,amount_iqd:1},{authority:'other',order_id:'x'},[]])assert.equal((await request(owner,fixtures[0],body)).response.status,400);
    assert.equal((await audits()).length,0);
    assert.equal((await request(owner,fixtures[0],{...fixtures[0].body,order_id:fixtures[1].order.id})).response.status,409);
    assert.equal(providerCalls,0);assert.equal((await audits()).length,1);
  });
  for(const f of fixtures)await t.test(`${f.kind}: fresh confirmed review is audited and returns only bounded intent, never payment or grant`,async()=>{
    const before=(await audits()).length,calls=providerCalls;
    const result=await request(finance,f);assert.equal(result.response.status,200);assert.match(result.response.headers.get('cache-control'),/no-store/);
    assert.deepEqual(result.body,{ok:true,status:'verified',applied:false,receipt_event_id:f.event,order_id:f.order.id,authority:f.body.authority});
    assert.equal(providerCalls,calls+1);assert.equal((await audits()).length,before+2);
    const output=JSON.stringify(result.body);for(const ref of [...references,finance.session.token,f.payload.currency,superQiWebhookPayloadHash(f.payload)])assert.equal(output.includes(ref),false);
  });
  await t.test('provider outage/nonterminal/identity/amount/date changes cannot confirm review or leak driver details',async()=>{
    for(const mode of ['outage','nonterminal','request','amount','date']){
      providerMode=mode;const result=await request(owner);
      assert.equal(result.response.status,mode==='outage'?503:409);assert.equal(result.body.applied,undefined);
      assert.equal(JSON.stringify(result.body).includes('SENSITIVE'),false);
    }
    providerMode='ok';
  });
  await t.test('current SQL permission is rechecked after provider I/O; revoked actor cannot confirm',async()=>{
    providerHook=async()=>{await admin.query("DELETE FROM admin_permissions WHERE admin_id=$1 AND permission='manage_subscriptions'",[finance.id]);};
    const result=await request(finance);assert.equal(result.response.status,403);
    providerHook=undefined;await admin.query("INSERT INTO admin_permissions(admin_id,permission) VALUES($1,'manage_subscriptions')",[finance.id]);
  });
  await t.test('cross-authority ambiguity and exact identity mismatch stop before provider access',async()=>{
    const a=fixtures[0],b=fixtures[1],calls=providerCalls;
    await admin.query(`UPDATE ${b.table} SET provider_checkout_ref=$2,metadata=metadata||$3::jsonb WHERE id=$1`,[b.order.id,a.payload.paymentId,JSON.stringify({provider_request_id:a.payload.requestId})]);
    assert.equal((await request(owner,a)).response.status,409);assert.equal(providerCalls,calls);
    await admin.query(`UPDATE ${b.table} SET provider_checkout_ref=$2,metadata=$3::jsonb WHERE id=$1`,[b.order.id,b.payload.paymentId,JSON.stringify(originalOrders[1].metadata)]);
    await admin.query(`UPDATE ${a.table} SET metadata=metadata||$2::jsonb WHERE id=$1`,[a.order.id,JSON.stringify({provider_request_id:randomUUID()})]);
    assert.equal((await request(owner,a)).response.status,409);assert.equal(providerCalls,calls);
    await admin.query(`UPDATE ${a.table} SET metadata=$2::jsonb WHERE id=$1`,[a.order.id,JSON.stringify(originalOrders[0].metadata)]);
  });
  await t.test('SQL raw capability denies unpermitted and disabled operator',async()=>{
    const f=fixtures[0],args=[denied.id,f.event,f.body.authority,f.order.id,randomUUID(),'a'.repeat(64)];
    await assert.rejects(()=>pool.query(readSql,args),error=>error.code==='42501');
    await admin.query('UPDATE admin_profiles SET enabled=false WHERE id=$1',[owner.id]);
    await assert.rejects(()=>pool.query(readSql,[owner.id,...args.slice(1)]),error=>error.code==='42501');
    await admin.query('UPDATE admin_profiles SET enabled=true WHERE id=$1',[owner.id]);
  });
  await t.test('mapping changed during provider I/O fails final audited recheck',async()=>{
    const f=fixtures[0];providerHook=async()=>{await admin.query(`UPDATE ${f.table} SET metadata=metadata||$2::jsonb WHERE id=$1`,[f.order.id,JSON.stringify({provider_request_id:randomUUID()})]);};
    assert.equal((await request(owner)).response.status,409);providerHook=undefined;
    await admin.query(`UPDATE ${f.table} SET metadata=$2::jsonb WHERE id=$1`,[f.order.id,JSON.stringify(originalOrders[0].metadata)]);
  });
  await t.test('durable audit failure prevents provider access and sensitive disclosure',async()=>{
    const before=(await audits()).length,calls=providerCalls;faultName=`replay_audit_${randomUUID().replaceAll('-','')}`;
    await admin.query(`CREATE FUNCTION ${faultName}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.reason_code='BILLING_RECEIPT_REPLAY_REVIEW' THEN RAISE EXCEPTION 'SENSITIVE_AUDIT_DETAIL' USING ERRCODE='P0001'; END IF; RETURN NEW; END $$`);
    await admin.query(`CREATE TRIGGER ${faultName} BEFORE INSERT ON database_admin_access_audits FOR EACH ROW EXECUTE FUNCTION ${faultName}()`);
    const result=await request(owner);assert.equal(result.response.status,503);assert.equal(JSON.stringify(result.body).includes('SENSITIVE'),false);assert.equal(providerCalls,calls);assert.equal((await audits()).length,before);
    await admin.query(`DROP TRIGGER ${faultName} ON database_admin_access_audits`);
  });
  await t.test('concurrent reviews remain read-only; receipt/order/time and all entitlements unchanged',async()=>{
    const results=await Promise.all([request(owner),request(finance)]);assert.ok(results.every(result=>result.response.status===200&&result.body.applied===false));
    assert.deepEqual(await receiptSnapshot(),originalReceipts);assert.deepEqual(await orderSnapshot(),originalOrders);assert.equal(await entitlementCount(),originalEntitlements);
    assert.equal((await pool.query('SELECT * FROM verified_provider_payment_receipts')).rows.length,0);
    console.log('VERIFIED_RECEIPT_REPLAY_REVIEW_HTTP_PROOF '+JSON.stringify({restrictedRole:true,realAdminSession:true,freshProvider:true,durableAudit:true,permissionRecheckedAfterProvider:true,receiptAndOrderUnchanged:true,entitlementGrants:0,executionAction:false}));
  });
});
