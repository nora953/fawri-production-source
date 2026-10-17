import assert from 'node:assert/strict';
import {randomUUID,randomInt,generateKeyPairSync} from 'node:crypto';
import test from 'node:test';
import {assertDisposablePostgres} from '../../../scripts/lib/disposable-postgres-test-guard.mjs';
import {cleanupResources} from './helpers/cleanup-resources.mjs';
import {proveReceiptCapabilityOwners} from './helpers/receipt-capability-owner-matrix.mjs';
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
const capability='public.fawri_authorize_verified_receipt_replay(text,text,text,text,text,text,text,text)';
const readSql='SELECT * FROM public.fawri_authorize_verified_receipt_replay($1,$2,$3,$4,$5,$6,$7,$8)';

test('real HTTP replay execution applies exactly once under tenant RLS and current locked operator authority',async t=>{
  const ids=[],events=[],role=`receipt_http_${randomUUID().replaceAll('-','')}`;
  let admin,server,roleCreated=false,faultName;const faults=[];
  const originalOptions=pool.options.options,nativeFetch=globalThis.fetch;
  let providerCalls=0,providerMode='ok',providerHook;const fixtures=[],setupClients=[];
  globalThis.fetch=async(url,init)=>{const target=String(url);if(target.startsWith('https://uat-sandbox-3ds-api.qi.iq/api/v1/payment/')){providerCalls++;assert.equal(init.method,'GET');if(providerHook)await providerHook();if(providerMode==='outage')throw new Error('SENSITIVE_PROVIDER_DETAIL');const f=fixtures.find(f=>target.endsWith(`/payment/${encodeURIComponent(f.payload.paymentId)}/status`));assert.ok(f,'owned provider identity only');return Response.json({...f.payload,...(providerMode==='request'?{requestId:randomUUID()}:providerMode==='amount'?{confirmedAmount:f.payload.amount+1}:providerMode==='nonterminal'?{status:'CREATED'}:providerMode==='date'?{creationDate:'2026-10-15T12:00:00Z'}:{})});}assert.ok(target.startsWith('http://127.0.0.1:'),'no external network');return nativeFetch(url,init);};
  t.after(async()=>cleanupResources([
    ['transport restore',()=>{globalThis.fetch=nativeFetch;}],
    ['HTTP server',()=>server?new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve())):undefined],
    ['audit fault',async()=>{if(faultName){await admin.query(`DROP TRIGGER IF EXISTS ${faultName} ON database_admin_access_audits`);await admin.query(`DROP FUNCTION IF EXISTS ${faultName}()`);}}],
    ['entitlement faults',async()=>{for(const fault of faults){await admin.query(`DROP TRIGGER IF EXISTS ${fault.name} ON ${fault.table}`);await admin.query(`DROP FUNCTION IF EXISTS ${fault.name}()`);}}],
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
  for(const kind of ['saas','cashier'])for(const scenario of ['normal','fault','blocked','hold']){
    const id=`replay-merchant-${randomUUID()}`;ids.push(id);
    await admin.query("INSERT INTO accounts(id,kind,phone,password_hash,state,phone_verified) VALUES($1,'merchant',$2,'synthetic','active',true)",[id,`+1996${String(randomInt(0,100000000)).padStart(8,'0')}`]);
    await admin.query("INSERT INTO merchants(id,account_id,owner_name,store_name,activity_type,status,account_status,onboarding_status) VALUES($1,$1,'Synthetic','Synthetic','retail','approved','approved','channel_connected')",[id]);
    const checkout=kind==='saas'?await saas.createSaasBillingCheckout({merchantId:id,operation:'activate',plan:'silver',idempotencyKey:randomUUID(),provider:'test_fake'}):await cashier.createCashierBillingCheckout({merchantId:id,operation:'activate',requestedSeats:1,idempotencyKey:randomUUID(),provider:'test_fake'});
    const firstReceivedAt=new Date(Date.parse(checkout.order.created_at)+100).toISOString().replace(/(\.\d{3})Z$/,'$1456Z');
    assert.ok(Date.parse(firstReceivedAt)>Date.parse(checkout.order.created_at),'owned receipt must follow original order creation');
    const payload={paymentId:`synthetic-replay-${randomUUID()}`,requestId:randomUUID(),status:'SUCCESS',canceled:false,amount:checkout.order.amount_iqd,confirmedAmount:checkout.order.amount_iqd,currency:'IQD',creationDate:new Date(Date.parse(checkout.order.created_at)+50).toISOString()};
    const event=superQiConfirmedProviderEventId(payload);events.push(event);references.push(payload.paymentId,payload.requestId);
    const table=kind==='saas'?'saas_billing_orders':'cashier_billing_orders';
    await admin.query(`UPDATE ${table} SET provider='superqi_sandbox',provider_checkout_ref=$2,metadata=metadata||$3::jsonb WHERE id=$1`,[checkout.order.id,payload.paymentId,JSON.stringify({provider_request_id:payload.requestId})]);
    await admin.query("INSERT INTO verified_provider_payment_receipts VALUES('superqi_sandbox',$1,$2,$3,'payment_succeeded',$4,$5,$6)",[event,payload.paymentId,payload.requestId,payload.amount,superQiWebhookPayloadHash(payload),firstReceivedAt]);
    fixtures.push({kind,scenario,table,payload,event,firstReceivedAt,order:checkout.order,body:{authority:kind==='saas'?'bot_subscription':'cashier_subscription',order_id:checkout.order.id}});
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
  await assert.rejects(()=>pool.query(readSql,[owner.id,'synthetic-session','a'.repeat(64),fixtures[0].event,fixtures[0].body.authority,fixtures[0].order.id,randomUUID(),'a'.repeat(64)]),error=>error.code==='42501');
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
    const response=await fetch(`${base}/${f.event}/replay`,{method:'POST',headers:{'Content-Type':'application/json',Origin:'https://operator.example.invalid',...(actor?{Cookie:`fawri_admin_session_v2=${actor.session.token}`,'X-Fawri-Device-Id':actor.device}:{}),...headers},body:JSON.stringify(body)});
    return {response,body:await response.json()};
  }
  const audits=async()=>(await admin.query("SELECT id,admin_account_id,reason_code,request_hash FROM database_admin_access_audits WHERE admin_account_id=ANY($1::text[]) AND reason_code='BILLING_RECEIPT_REPLAY_EXECUTE' ORDER BY started_at,id",[ids])).rows;
  const applications=async f=>(await admin.query(`SELECT * FROM ${f.kind==='saas'?'saas_entitlement_applications':'cashier_entitlement_applications'} WHERE order_id=$1`,[f.order.id])).rows;
  const eventState=async f=>(await admin.query(`SELECT status FROM ${f.kind==='saas'?'saas_billing_events':'cashier_billing_events'} WHERE provider_event_id=$1`,[f.event])).rows;
  const exactTime=async f=>(await admin.query(`SELECT to_char(paid_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS time FROM ${f.table} WHERE id=$1`,[f.order.id])).rows[0].time;
  const ownerSession=(await admin.query("SELECT id,device_fingerprint_hash FROM account_sessions WHERE account_id=$1 AND kind='admin' AND status='active'",[owner.id])).rows;
  assert.equal(ownerSession.length,1);
  await proveReceiptCapabilityOwners(t,{
    admin,role,functions:[capability,'public.fawri_review_verified_payment_receipt(text,text,text,text,text,text)'],
    tables:['accounts','admin_profiles','admin_permissions','database_admin_access_audits','verified_provider_payment_receipts','saas_billing_orders','cashier_billing_orders','account_sessions','trusted_devices'],
    fixtures:fixtures.filter(f=>f.scenario==='normal'),actorId:owner.id,deniedActorId:denied.id,
    invoke:(f,actorId,auditId)=>admin.query(readSql,[actorId,ownerSession[0].id,ownerSession[0].device_fingerprint_hash,f.event,f.body.authority,f.order.id,auditId,'a'.repeat(64)]),
    expected:f=>({provider:'superqi_sandbox',provider_event_id:f.event,payment_ref:f.payload.paymentId,request_ref:f.payload.requestId,event_type:'payment_succeeded',amount_iqd:f.payload.amount,payload_hash:superQiWebhookPayloadHash(f.payload),first_received_at:f.firstReceivedAt,order_id:f.order.id,authority:f.body.authority,merchant_id:originalOrders.find(order=>order.id===f.order.id).merchant_id}),
    snapshot:async()=>({receipts:await receiptSnapshot(),orders:await orderSnapshot(),audits:(await admin.query('SELECT id,admin_account_id,reason_code,request_hash FROM database_admin_access_audits WHERE admin_account_id=ANY($1::text[]) ORDER BY started_at,id',[ids])).rows,entitlements:await entitlementCount()}),
    auditReasons:['BILLING_RECEIPT_REPLAY_REVIEW','BILLING_RECEIPT_REPLAY_EXECUTE'],
  });
  await t.test('permission/device/origin denial and body overrides cannot execute or call provider',async()=>{
    for(const actor of [undefined,merchant,denied])assert.ok([401,403].includes((await request(actor)).response.status));
    assert.equal((await request(owner,fixtures[0],fixtures[0].body,{'X-Fawri-Device-Id':'wrong'})).response.status,401);
    assert.equal((await request(owner,fixtures[0],fixtures[0].body,{Origin:'https://forbidden.example.invalid'})).response.status,403);
    for(const body of [{...fixtures[0].body,merchant_id:ids[0]},{...fixtures[0].body,actor_id:owner.id},{...fixtures[0].body,amount_iqd:1}])assert.equal((await request(owner,fixtures[0],body)).response.status,400);
    assert.equal(providerCalls,0);assert.equal((await audits()).length,0);
  });
  await t.test('provider outage/nonterminal/changed identity cannot create billing events or applications',async()=>{
    const f=fixtures.find(f=>f.kind==='saas'&&f.scenario==='blocked');
    for(const mode of ['outage','nonterminal','request','amount','date']){providerMode=mode;const result=await request(owner,f);assert.equal(result.response.status,mode==='outage'?503:409);assert.equal(JSON.stringify(result.body).includes('SENSITIVE'),false);}
    providerMode='ok';assert.equal((await applications(f)).length,0);assert.equal((await eventState(f)).length,0);
  });
  await t.test('permission and session revoked during provider I/O stop before billing receipt admission',async()=>{
    const f=fixtures.find(f=>f.kind==='cashier'&&f.scenario==='blocked');
    providerHook=async()=>admin.query("DELETE FROM admin_permissions WHERE admin_id=$1 AND permission='manage_subscriptions'",[finance.id]);
    assert.equal((await request(finance,f)).response.status,403);providerHook=undefined;
    await admin.query("INSERT INTO admin_permissions(admin_id,permission) VALUES($1,'manage_subscriptions')",[finance.id]);
    providerHook=async()=>admin.query("UPDATE account_sessions SET status='revoked',revoked_at=now(),revoke_reason='manual_revocation' WHERE id=$1",[finance.session.session.id]);
    assert.equal((await request(finance,f)).response.status,403);providerHook=undefined;
    finance.session=await authority.issueSession({accountId:finance.id,accountKind:'admin',tenantId:finance.id,deviceId:finance.device,deviceLabel:'Synthetic',adminRole:finance.adminRole,permissions:finance.permissions});
    assert.equal((await applications(f)).length,0);assert.equal((await eventState(f)).length,0);
  });
  await t.test('mapping change during provider I/O and unassigned payment fail closed without ownership repair',async()=>{
    const f=fixtures.find(f=>f.kind==='saas'&&f.scenario==='blocked');
    providerHook=async()=>admin.query(`UPDATE ${f.table} SET metadata=metadata||$2::jsonb WHERE id=$1`,[f.order.id,JSON.stringify({provider_request_id:'synthetic-conflict'})]);
    assert.equal((await request(owner,f)).response.status,409);providerHook=undefined;
    await admin.query(`UPDATE ${f.table} SET metadata=metadata||$2::jsonb,provider_checkout_ref=NULL WHERE id=$1`,[f.order.id,JSON.stringify({provider_request_id:f.payload.requestId})]);
    const calls=providerCalls;assert.equal((await request(owner,f)).response.status,409);assert.equal(providerCalls,calls);
    await admin.query(`UPDATE ${f.table} SET provider_checkout_ref=$2 WHERE id=$1`,[f.order.id,f.payload.paymentId]);
    assert.equal((await applications(f)).length,0);
  });
  await t.test('durable execution audit fault blocks provider and all payment writes',async()=>{
    const f=fixtures[0],calls=providerCalls;faultName=`execution_audit_${randomUUID().replaceAll('-','')}`;
    await admin.query(`CREATE FUNCTION ${faultName}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.reason_code='BILLING_RECEIPT_REPLAY_EXECUTE' THEN RAISE EXCEPTION 'SENSITIVE_AUDIT_DETAIL' USING ERRCODE='P0001'; END IF; RETURN NEW; END $$`);
    await admin.query(`CREATE TRIGGER ${faultName} BEFORE INSERT ON database_admin_access_audits FOR EACH ROW EXECUTE FUNCTION ${faultName}()`);
    const before=(await audits()).length;const result=await request(owner,f);assert.equal(result.response.status,503);assert.equal(JSON.stringify(result.body).includes('SENSITIVE'),false);assert.equal(providerCalls,calls);assert.equal((await audits()).length,before);
    await admin.query(`DROP TRIGGER ${faultName} ON database_admin_access_audits`);assert.equal((await eventState(f)).length,0);
  });
  for(const f of fixtures.filter(f=>f.scenario==='normal'))await t.test(`${f.kind}: concurrent real HTTP replay applies once and duplicate retains exact original receipt timestamp`,async()=>{
    const before=(await audits()).length;const results=await Promise.all([request(owner,f),request(finance,f)]);
    assert.ok(results.every(result=>result.response.status===200),JSON.stringify(results.map(result=>({status:result.response.status,code:result.body.code}))));assert.deepEqual(results.map(result=>result.body.status).sort(),['applied','duplicate']);
    for(const result of results){assert.deepEqual(Object.keys(result.body).sort(),['authority','ok','order_id','receipt_event_id','status']);const output=JSON.stringify(result.body);for(const ref of references)assert.equal(output.includes(ref),false);}
    assert.equal((await applications(f)).length,1);assert.equal((await eventState(f)).length,1);
    assert.equal(await exactTime(f),f.firstReceivedAt);
    const duplicate=await request(owner,f);assert.equal(duplicate.body.status,'duplicate');assert.equal((await applications(f)).length,1);assert.ok((await audits()).length>before);
  });
  for(const f of fixtures.filter(f=>f.scenario==='fault'))await t.test(`${f.kind}: SQL entitlement fault retains received event then concurrent HTTP retry applies once`,async()=>{
    const table=f.kind==='saas'?'saas_entitlement_applications':'cashier_entitlement_applications',name=`execution_fault_${randomUUID().replaceAll('-','')}`;faults.push({table,name});
    await admin.query(`CREATE FUNCTION ${name}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.order_id=TG_ARGV[0] THEN RAISE EXCEPTION 'SENSITIVE_ENTITLEMENT_DETAIL' USING ERRCODE='P0001'; END IF; RETURN NEW; END $$`);
    await admin.query(`CREATE TRIGGER ${name} BEFORE INSERT ON ${table} FOR EACH ROW EXECUTE FUNCTION ${name}('${f.order.id}')`);
    const failed=await request(owner,f);assert.equal(failed.response.status,503);assert.equal(JSON.stringify(failed.body).includes('SENSITIVE'),false);
    assert.deepEqual(await eventState(f),[{status:'received'}]);assert.equal((await applications(f)).length,0);
    assert.equal((await admin.query(`SELECT status FROM ${f.table} WHERE id=$1`,[f.order.id])).rows[0].status,'paid_reconciliation_required');
    await admin.query(`DROP TRIGGER ${name} ON ${table}`);
    const results=await Promise.all([request(owner,f),request(finance,f)]);assert.ok(results.every(result=>result.response.status===200),JSON.stringify(results.map(result=>({status:result.response.status,code:result.body.code}))));assert.deepEqual(results.map(result=>result.body.status).sort(),['applied','duplicate']);
    assert.equal((await applications(f)).length,1);assert.equal(await exactTime(f),f.firstReceivedAt);
  });
  await t.test('current permission SHARE lock serializes revocation behind the entitlement commit',async()=>{
    const f=fixtures.find(f=>f.kind==='cashier'&&f.scenario==='hold'),table='cashier_entitlement_applications',name=`execution_hold_${randomUUID().replaceAll('-','')}`,marker=randomInt(100000000,200000000);faults.push({table,name});
    await admin.query(`CREATE FUNCTION ${name}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.order_id=TG_ARGV[0] THEN PERFORM pg_advisory_xact_lock(${marker}); PERFORM pg_sleep(2); END IF; RETURN NEW; END $$`);
    await admin.query(`CREATE TRIGGER ${name} BEFORE INSERT ON ${table} FOR EACH ROW EXECUTE FUNCTION ${name}('${f.order.id}')`);
    const pending=request(finance,f);let seen=false;const until=Date.now()+10000;
    while(Date.now()<until){seen=(await admin.query("SELECT EXISTS(SELECT 1 FROM pg_locks WHERE locktype='advisory' AND objid=$1 AND granted) AS yes",[marker])).rows[0].yes;if(seen)break;await new Promise(r=>setTimeout(r,25));}
    assert.ok(seen,'owned grant transaction must reach barrier');
    const revoke=admin.query("DELETE FROM admin_permissions WHERE admin_id=$1 AND permission='manage_subscriptions'",[finance.id]);
    assert.equal(await Promise.race([revoke.then(()=>false),new Promise(resolve=>setTimeout(()=>resolve(true),100))]),true,'revocation must wait on current permission lock');
    const result=await pending;assert.equal(result.response.status,200);assert.equal(result.body.status,'applied');await revoke;
    await admin.query("INSERT INTO admin_permissions(admin_id,permission) VALUES($1,'manage_subscriptions')",[finance.id]);
    await admin.query(`DROP TRIGGER ${name} ON ${table}`);assert.equal((await applications(f)).length,1);
  });
  await t.test('raw receipts stay immutable/private; grants occur only for five reviewed owned orders',async()=>{
    assert.deepEqual(await receiptSnapshot(),originalReceipts);assert.equal(BigInt(await entitlementCount())-BigInt(originalEntitlements),5n);
    for(const f of fixtures.filter(f=>f.scenario==='blocked'||f.kind==='saas'&&f.scenario==='hold'))assert.equal((await applications(f)).length,0);
    assert.equal((await pool.query('SELECT * FROM verified_provider_payment_receipts')).rows.length,0);
    assert.equal((await pool.query('SELECT * FROM saas_billing_orders')).rows.length,0);
    console.log('VERIFIED_RECEIPT_REPLAY_EXECUTION_HTTP_PROOF '+JSON.stringify({restrictedRole:true,realAdminSession:true,freshProvider:true,durableAudit:true,permissionAndSessionRechecked:true,permissionHeldThroughGrant:true,onceOnlySaasAndCashier:true,sqlFailureRecovery:true,receiptUnchanged:true,tenantPrivate:true,entitlementGrants:5}));
  });
});
