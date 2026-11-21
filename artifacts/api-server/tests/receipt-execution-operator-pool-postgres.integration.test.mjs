import {createDisposableKnowledgeRuntime} from './helpers/disposable-knowledge-runtime.mjs';
import {createDisposableAuthenticationRole} from "./helpers/disposable-authentication-role.mjs";
import {grantReceiptExecutionFixture} from "./helpers/receipt-execution-role.mjs";
import assert from 'node:assert/strict';
import { randomUUID, randomInt, generateKeyPairSync } from 'node:crypto';
import test from 'node:test';
import { assertDisposablePostgres } from '../../../scripts/lib/disposable-postgres-test-guard.mjs';
import { cleanupResources } from './helpers/cleanup-resources.mjs';
await assertDisposablePostgres();
const { Client } = await import('pg');
const capability='public.fawri_authorize_verified_receipt_replay(text,text,text,text,text,text,text,text)';
const sql='SELECT * FROM public.fawri_authorize_verified_receipt_replay($1,$2,$3,$4,$5,$6,$7,$8)';

test('direct execution LOGIN owns all replay phases without borrowing tenant or bootstrap credentials', {timeout:120000}, async t=>{
  const nonce=randomUUID().replaceAll('-',''),ids=[],fixtures=[],roles=[],clients=[],urls=[],faults=[];
  const admin=new Client({connectionString:process.env.DATABASE_URL,connectionTimeoutMillis:5000});await admin.connect();
  const bootstrapUrl=process.env.DATABASE_URL;
  const saved={};let authFixture,parentRuntime;let mainPool,originalQuery,originalConnect,closePool=async()=>{},bootstrapCalls=0;
  t.after(()=>cleanupResources([
    ['main pool methods',async()=>{if(mainPool){mainPool.query=originalQuery;mainPool.connect=originalConnect;}}],
    ['owned triggers',async()=>{for(const f of faults){await admin.query(`DROP TRIGGER IF EXISTS ${f.name} ON ${f.table}`);await admin.query(`DROP FUNCTION IF EXISTS ${f.name}()`);}}],
    ['operator pool',()=>closePool()],
    ['authentication pool',async()=>{const {closeAuthenticationPool}=await import('../src/services/authenticationPostgresAuthority.ts');await closeAuthenticationPool();}],
    ['authentication fixture',()=>authFixture?.dispose()],
    ['runtime connections',async()=>{for(const c of clients)await c.end();}],
    ['owned receipts',()=>admin.query('DELETE FROM verified_provider_payment_receipts WHERE provider_event_id=ANY($1::text[])',[fixtures.map(f=>f.event)])],
    ['owned operator audits',()=>admin.query('DELETE FROM database_admin_access_audits WHERE admin_account_id=ANY($1::text[])',[ids])],
    ['owned trusted devices',()=>admin.query('DELETE FROM trusted_devices WHERE account_id=ANY($1::text[])',[ids])],
    ['owned accounts',()=>admin.query('DELETE FROM accounts WHERE id=ANY($1::text[])',[ids])],
    ['owned role grants',async()=>{for(const r of roles){await admin.query(`DROP OWNED BY ${r}`);await admin.query(`DROP ROLE ${r}`);}}],
    ['parent runtime',()=>parentRuntime?.dispose()],
    ['environment',async()=>{for(const[k,v]of Object.entries(saved)){if(v===undefined)delete process.env[k];else process.env[k]=v;}}],
    ['bootstrap connection',()=>admin.end()],
  ]));
  const {publicKey}=generateKeyPairSync('rsa',{modulusLength:2048});
  const env={NODE_ENV:'test',FAWRI_DEPLOYMENT_MODE:'development',FAWRI_OPERATIONAL_POSTGRES_AUTHORITY:'required',FAWRI_AUTH_POSTGRES_SESSION_AUTHORITY:'required',FAWRI_SUBSCRIPTION_POSTGRES_AUTHORITY:'required',
    FAWRI_AUTH_SECURITY_SECRET:'synthetic-execution-pool-security-secret-at-least-32-characters',FAWRI_PASSWORD_SALT:'synthetic-execution-pool-password-salt',FAWRI_OPERATOR_DATABASE_URL:undefined,FAWRI_AUTH_DATABASE_URL:undefined,
    FAWRI_SAAS_BILLING_PROVIDER:'superqi_sandbox',FAWRI_SAAS_BILLING_PROVIDERS:'superqi_sandbox,test_fake',FAWRI_SUPERQI_SANDBOX_ENABLED:'1',
    FAWRI_SUPERQI_SANDBOX_USERNAME:'synthetic-user',FAWRI_SUPERQI_SANDBOX_PASSWORD:'synthetic-password',FAWRI_SUPERQI_SANDBOX_TERMINAL_ID:'synthetic-terminal',
    FAWRI_SUPERQI_SANDBOX_NOTIFICATION_URL:'https://execute.example.invalid/webhook',FAWRI_SUPERQI_SANDBOX_FINISH_URL:'https://execute.example.invalid/finish',
    FAWRI_SUPERQI_SANDBOX_WEBHOOK_PUBLIC_KEY_B64:Buffer.from(publicKey.export({type:'spki',format:'pem'})).toString('base64')};
  for(const[k,v]of Object.entries(env)){saved[k]=process.env[k];if(v===undefined)delete process.env[k];else process.env[k]=v;}
  parentRuntime=await createDisposableKnowledgeRuntime();
  authFixture=await createDisposableAuthenticationRole(admin,bootstrapUrl);
  process.env.FAWRI_AUTH_DATABASE_URL=authFixture.url;
  ({pool:mainPool}=await import('@workspace/db'));originalQuery=mainPool.query;originalConnect=mainPool.connect;
  ({closeReceiptOperatorExecutionPool:closePool}=await import('../src/services/operatorReceiptExecutionPostgresAuthority.ts'));
  const {executeVerifiedReceiptReplay:execute}=await import('../src/services/verifiedReceiptReplayExecution.ts');
  const saas=await import('../src/services/saasBillingAuthority.ts'),cashier=await import('../src/services/cashierBillingAuthority.ts');
  const {superQiConfirmedProviderEventId}=await import('../src/services/superQiSandboxWebhook.ts');
  const {superQiWebhookPayloadHash}=await import('../src/services/superQiSandboxTransport.ts');
  const {authPostgresSessionAuthority:auth}=await import('../src/services/authPostgresSessionAuthority.ts');
  const {registerAdminDeviceAuthoritative,setAdminDeviceTrustAuthoritative}=await import('../src/services/postgresAdminSecurityAuthority.ts');
  async function account(kind,role){
    const id=`execution-${kind}-${randomUUID()}`;ids.push(id);
    await admin.query("INSERT INTO accounts(id,kind,phone,password_hash,state,phone_verified) VALUES($1,$2,$3,'synthetic','active',true)",[id,kind,`+198${randomInt(100000000,999999999)}`]);
    if(kind==='admin')await admin.query("INSERT INTO admin_profiles(id,account_id,display_name,role,enabled,must_change_password) VALUES($1,$1,'Synthetic',$2,true,false)",[id,role]);
    return id;
  }
  const owner=await account('admin','owner_admin'),actor=await account('admin','assistant_admin');
  await admin.query("INSERT INTO admin_permissions(admin_id,permission) VALUES($1,'manage_subscriptions')",[actor]);
  const deviceId=`execution-device-${nonce}`;
  const device=await registerAdminDeviceAuthoritative({accountId:actor,accountKind:'admin',deviceId,deviceLabel:'Synthetic'});
  assert.equal((await setAdminDeviceTrustAuthoritative({deviceRecordId:device.id,trusted:true,actorAccountId:owner})).status,'trusted');
  const issued=await auth.issueSession({accountId:actor,accountKind:'admin',tenantId:actor,deviceId,deviceLabel:'Synthetic',adminRole:'assistant_admin',permissions:['manage_subscriptions']});
  const session=(await admin.query('SELECT * FROM account_sessions WHERE id=$1',[issued.session.id])).rows[0];
  const context={id:actor,sessionId:session.id,deviceHash:session.device_fingerprint_hash};
  for(const kind of ['saas','cashier'])for(const scenario of ['normal','blocked','fault','admission','commit']){
    const merchant=await account('merchant');
    await admin.query("INSERT INTO merchants(id,account_id,owner_name,store_name,activity_type,status,account_status,onboarding_status) VALUES($1,$1,'Synthetic','Synthetic','retail','approved','approved','channel_connected')",[merchant]);
    const checkout=kind==='saas'?await saas.createSaasBillingCheckout({merchantId:merchant,operation:'activate',plan:'silver',idempotencyKey:randomUUID(),provider:'test_fake'}):await cashier.createCashierBillingCheckout({merchantId:merchant,operation:'activate',requestedSeats:1,idempotencyKey:randomUUID(),provider:'test_fake'});
    const created=Date.parse(checkout.order.created_at),firstReceivedAt=new Date(created+100).toISOString().replace(/(\.\d{3})Z$/,'$1456Z');
    const payload={paymentId:`execution-payment-${randomUUID()}`,requestId:randomUUID(),status:'SUCCESS',canceled:false,amount:checkout.order.amount_iqd,confirmedAmount:checkout.order.amount_iqd,currency:'IQD',creationDate:new Date(created+50).toISOString()};
    const f={kind,scenario,merchant,order:checkout.order.id,payload,firstReceivedAt,event:superQiConfirmedProviderEventId(payload),table:kind==='saas'?'saas_billing_orders':'cashier_billing_orders',events:kind==='saas'?'saas_billing_events':'cashier_billing_events',applications:kind==='saas'?'saas_entitlement_applications':'cashier_entitlement_applications',body:{authority:kind==='saas'?'bot_subscription':'cashier_subscription',order_id:checkout.order.id}};
    fixtures.push(f);
    await admin.query(`UPDATE ${f.table} SET provider='superqi_sandbox',provider_checkout_ref=$2,metadata=metadata||$3::jsonb WHERE id=$1`,[f.order,payload.paymentId,JSON.stringify({provider_request_id:payload.requestId})]);
    await admin.query("INSERT INTO verified_provider_payment_receipts VALUES('superqi_sandbox',$1,$2,$3,'payment_succeeded',$4,$5,$6)",[f.event,payload.paymentId,payload.requestId,payload.amount,superQiWebhookPayloadHash(payload),firstReceivedAt]);
  }
  for(const kind of ['tenant','executor']){
    const r=`execution_${kind}_${nonce}`,password=randomUUID().replaceAll('-','');
    await admin.query(`CREATE ROLE ${r} LOGIN PASSWORD '${password}' NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION`);roles.push(r);
    await admin.query(`GRANT USAGE ON SCHEMA public TO ${r}`);
    if(kind==='executor'){
      await grantReceiptExecutionFixture(admin,r,bootstrapUrl);
    }
    const url=new URL(process.env.DATABASE_URL);url.username=r;url.password=password;url.search='';urls.push(url.toString());
    const c=new Client({connectionString:url.toString(),connectionTimeoutMillis:5000});clients.push(c);await c.connect();
    const identity=(await c.query(`SELECT current_user AS active,session_user AS login,rolsuper,rolbypassrls,rolcreaterole,
      EXISTS(SELECT 1 FROM pg_auth_members WHERE member=r.oid) AS member,
      EXISTS(SELECT 1 FROM pg_class WHERE relowner=r.oid) AS owner FROM pg_roles r WHERE rolname=current_user`)).rows[0];
    assert.deepEqual(identity,{active:r,login:r,rolsuper:false,rolbypassrls:false,rolcreaterole:false,member:false,owner:false});
    for(const signature of ['public.fawri_issue_admin_directory_audit(text,text,text)','public.fawri_read_verified_payment_receipts(text,integer,timestamptz,text,text,text)','public.fawri_review_verified_payment_receipt(text,text,text,text,text,text)'])
      assert.equal((await c.query("SELECT has_function_privilege(current_user,$1,'EXECUTE') AS allowed",[signature])).rows[0].allowed,false);
    for(const table of ['accounts','admin_profiles','admin_permissions','account_sessions','trusted_devices','database_admin_access_audits','verified_provider_payment_receipts'])
      assert.equal((await c.query("SELECT has_table_privilege(current_user,$1,'SELECT,INSERT,UPDATE,DELETE') AS allowed",[`public.${table}`])).rows[0].allowed,false);
  }
  process.env.FAWRI_OPERATOR_DATABASE_URL=urls[1];process.env.FAWRI_DEPLOYMENT_MODE='production';
  // No replay phase is allowed to borrow the root/tenant application pool.
  mainPool.query=async()=>{bootstrapCalls++;throw new Error('unexpected primary pool query');};
  mainPool.connect=async()=>{bootstrapCalls++;throw new Error('unexpected primary pool lease');};
  let providerCalls=0,providerHook;
  const fetchImpl=async(url,init)=>{
    providerCalls++;assert.equal(init.method,'GET');
    const f=fixtures.find(f=>String(url)===`https://uat-sandbox-3ds-api.qi.iq/api/v1/payment/${encodeURIComponent(f.payload.paymentId)}/status`);assert.ok(f,'only injected owned provider traffic');
    // Other concurrent requests may legitimately hold their own SQL transaction.
    // A separate connection must be able to update this actor while this request
    // awaits the provider. Holding our own FOR SHARE lock would deadlock until
    // lock_timeout; transient locks from other requests can finish normally.
    const probe=new Client({connectionString:bootstrapUrl,connectionTimeoutMillis:5000});
    await probe.connect();
    try {
      await probe.query('BEGIN');await probe.query("SET LOCAL lock_timeout='5s'");
      assert.equal((await probe.query('UPDATE accounts SET state=state WHERE id=$1',[actor])).rowCount,1);
      await probe.query('ROLLBACK');
    } finally {await probe.query('ROLLBACK').catch(()=>{});await probe.end();}
    if(providerHook)await providerHook(f);return Response.json(f.payload);
  };
  const invoke=(f)=>execute(context,f.event,f.body,fetchImpl);
  const applications=async f=>(await admin.query(`SELECT * FROM ${f.applications} WHERE order_id=$1`,[f.order])).rows;
  const eventRows=async f=>(await admin.query(`SELECT * FROM ${f.events} WHERE provider_event_id=$1`,[f.event])).rows;
  const audits=async()=> (await admin.query("SELECT id,authority_transaction_id::text AS tx FROM database_admin_access_audits WHERE admin_account_id=$1 AND reason_code='BILLING_RECEIPT_REPLAY_EXECUTE' ORDER BY id",[actor])).rows;
  const receiptSnapshot=async()=>(await admin.query('SELECT * FROM verified_provider_payment_receipts WHERE provider_event_id=ANY($1::text[]) ORDER BY provider_event_id',[fixtures.map(f=>f.event)])).rows;
  const originalReceipts=await receiptSnapshot();
  await t.test('tenant knowing valid actor/session/device IDs cannot authorize or switch to execution role',async()=>{
    const f=fixtures[0];await clients[0].query("SELECT set_config('fawri.admin_account_id',$1,false),set_config('fawri.admin_audit_id',$2,false),set_config('fawri.tenant_id',$3,false)",[actor,randomUUID(),f.merchant]);
    await assert.rejects(()=>clients[0].query(sql,[actor,session.id,context.deviceHash,f.event,f.body.authority,f.order,randomUUID(),'a'.repeat(64)]),{code:'42501'});
    await assert.rejects(()=>clients[0].query(`SET ROLE ${roles[1]}`),{code:'42501'});
    assert.equal(providerCalls,0);assert.equal((await audits()).length,0);
  });
  for(const kind of ['saas','cashier'])await t.test(`${kind}: dedicated executor preserves four checks and three committed transactions, with one grant`,async()=>{
    const f=fixtures.find(f=>f.kind===kind&&f.scenario==='normal'),before=await audits(),oldCalls=providerCalls;
    providerHook=async()=>assert.equal((await audits()).length,before.length+1,'provider admission audit must already be committed');
    let result;try{result=await invoke(f);}finally{providerHook=undefined;}
    assert.equal(result.status,'applied');assert.equal(result.authority,f.body.authority);assert.equal(providerCalls,oldCalls+1);assert.equal((await applications(f)).length,1);
    const fresh=(await audits()).filter(a=>!before.some(b=>b.id===a.id));assert.equal(fresh.length,4);
    const groups={};for(const a of fresh)groups[a.tx]=(groups[a.tx]||0)+1;assert.deepEqual(Object.values(groups).sort(),[1,1,2]);
    assert.equal((await invoke(f)).status,'duplicate');assert.equal((await applications(f)).length,1);
    const paid=(await admin.query(`SELECT to_char(paid_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS time FROM ${f.table} WHERE id=$1`,[f.order])).rows[0].time;
    assert.equal(paid,f.firstReceivedAt);assert.equal(bootstrapCalls,0);
  });
  await t.test('permission, session and execution capability revoked during provider I/O block admission',async()=>{
    const f=fixtures.find(f=>f.kind==='saas'&&f.scenario==='blocked');
    for(const [mutate,restore,code] of [
      [()=>admin.query("DELETE FROM admin_permissions WHERE admin_id=$1 AND permission='manage_subscriptions'",[actor]),()=>admin.query("INSERT INTO admin_permissions(admin_id,permission) VALUES($1,'manage_subscriptions')",[actor]),'RECEIPT_REPLAY_EXECUTION_PERMISSION_REQUIRED'],
      [()=>admin.query("UPDATE account_sessions SET status='revoked',revoked_at=now(),revoke_reason='manual_revocation' WHERE id=$1",[session.id]),()=>admin.query("UPDATE account_sessions SET status='active',revoked_at=NULL,revoke_reason=NULL WHERE id=$1",[session.id]),'RECEIPT_REPLAY_EXECUTION_PERMISSION_REQUIRED'],
      [()=>admin.query(`REVOKE EXECUTE ON FUNCTION ${capability} FROM ${roles[1]}`),()=>admin.query(`GRANT EXECUTE ON FUNCTION ${capability} TO ${roles[1]}`),'RECEIPT_REPLAY_EXECUTION_UNAVAILABLE'],
    ]){
      providerHook=mutate;try{await assert.rejects(()=>invoke(f),{code});}finally{providerHook=undefined;await restore();}
      assert.equal((await eventRows(f)).length,0);assert.equal((await applications(f)).length,0);
    }
  });
  await t.test('mapping modified during provider I/O cannot admit a receipt or grant entitlement',async()=>{
    const f=fixtures.find(f=>f.kind==='cashier'&&f.scenario==='blocked');
    const metadata=(await admin.query(`SELECT metadata FROM ${f.table} WHERE id=$1`,[f.order])).rows[0].metadata;
    providerHook=()=>admin.query(`UPDATE ${f.table} SET metadata=metadata||$2::jsonb WHERE id=$1`,[f.order,JSON.stringify({provider_request_id:randomUUID()})]);
    try{await assert.rejects(()=>invoke(f),{code:'RECEIPT_REPLAY_EXECUTION_CONFLICT'});}finally{providerHook=undefined;await admin.query(`UPDATE ${f.table} SET metadata=$2::jsonb WHERE id=$1`,[f.order,JSON.stringify(metadata)]);}
    assert.equal((await eventRows(f)).length,0);assert.equal((await applications(f)).length,0);
  });
  async function fault(f,phase){
    const name=`exec_${phase}_${randomUUID().replaceAll('-','')}`,table=phase==='grant'?f.applications:'database_admin_access_audits';faults.push({name,table});
    // The executor has no direct private-schema access. Use the canonical public
    // predicate: this LOGIN has neither authentication nor directory capability,
    // so only its issued transaction scope can select the later fault phases.
    const condition=phase==='grant'?`NEW.order_id='${f.order}'`:`NEW.admin_account_id='${actor}' AND NEW.reason_code='BILLING_RECEIPT_REPLAY_EXECUTE' AND public.fawri_tenant_or_audited_admin('${f.merchant}')${phase==='commit'?` AND EXISTS(SELECT 1 FROM ${f.applications} WHERE order_id='${f.order}')`:''}`;
    await admin.query(`CREATE FUNCTION ${name}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF ${condition} THEN RAISE EXCEPTION 'synthetic execution fault' USING ERRCODE='P0001'; END IF; RETURN NEW; END $$`);
    await admin.query(phase==='grant'?`CREATE TRIGGER ${name} BEFORE INSERT ON ${table} FOR EACH ROW EXECUTE FUNCTION ${name}()`:`CREATE CONSTRAINT TRIGGER ${name} AFTER INSERT ON ${table} DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION ${name}()`);
    return async()=>{await admin.query(`DROP TRIGGER ${name} ON ${table}`);await admin.query(`DROP FUNCTION ${name}()`);};
  }
  for(const kind of ['saas','cashier'])for(const phase of ['grant','admission','commit'])await t.test(`${kind}: ${phase} failure rolls back grants and retry applies exactly once`,async()=>{
    const f=fixtures.find(f=>f.kind===kind&&f.scenario===(phase==='grant'?'fault':phase));
    const remove=await fault(f,phase);try{await assert.rejects(()=>invoke(f));}finally{await remove();}
    assert.equal((await applications(f)).length,0);
    if(phase==='admission')assert.equal((await eventRows(f)).length,0);
    else assert.equal((await eventRows(f))[0].status,'received','durable receipt survives failed entitlement/application COMMIT');
    assert.equal((await invoke(f)).status,'applied');assert.equal((await invoke(f)).status,'duplicate');assert.equal((await applications(f)).length,1);
  });
  await t.test('production rejects missing operator credentials and tenant LOGIN before provider',async()=>{
    await closePool();const f=fixtures[0],calls=providerCalls,before=(await audits()).length;
    try{
      delete process.env.FAWRI_OPERATOR_DATABASE_URL;await assert.rejects(()=>invoke(f),{code:'RECEIPT_REPLAY_EXECUTION_UNAVAILABLE',status:503});
      process.env.FAWRI_OPERATOR_DATABASE_URL=urls[0];await assert.rejects(()=>invoke(f),{code:'RECEIPT_REPLAY_EXECUTION_UNAVAILABLE',status:503});
    }finally{await closePool();process.env.FAWRI_OPERATOR_DATABASE_URL=urls[1];}
    assert.equal(providerCalls,calls);assert.equal((await audits()).length,before);assert.equal(bootstrapCalls,0);
  });
  await t.test('private scope is issued for actual executor transactions; revocation fails closed and recovers',async()=>{
    for(const f of fixtures.filter(f=>f.scenario==='normal')){
      const scopes=await admin.query(`SELECT s.merchant_id FROM fawri_security.transaction_scopes s JOIN database_admin_access_audits a ON a.authority_transaction_id=s.transaction_id WHERE s.runtime_login=$1 AND s.merchant_id=$2 AND a.admin_account_id=$3 AND a.reason_code='BILLING_RECEIPT_REPLAY_EXECUTE'`,[roles[1],f.merchant,actor]);
      assert.ok(scopes.rows.length>=2,'receipt admission and entitlement transactions require distinct bindings');
    }
    await assert.rejects(()=>clients[1].query('SELECT * FROM fawri_security.transaction_scopes'),{code:'42501'});
    await admin.query(`REVOKE EXECUTE ON FUNCTION fawri_security.issue_scope(name,integer,bigint,text) FROM ${authFixture.role}`);
    const f=fixtures[0],before=await applications(f);
    try {await assert.rejects(()=>invoke(f),{code:'RECEIPT_REPLAY_EXECUTION_UNAVAILABLE',status:503});assert.deepEqual(await applications(f),before);}
    finally {await admin.query(`GRANT EXECUTE ON FUNCTION fawri_security.issue_scope(name,integer,bigint,text) TO ${authFixture.role}`);}
    assert.equal((await invoke(f)).status,'duplicate');assert.equal(bootstrapCalls,0);
  });
  await t.test('concurrent duplicate executions preserve tenant scope, receipt bytes and single grants',async()=>{
    const normal=fixtures.filter(f=>f.scenario==='normal');const outcomes=await Promise.allSettled(normal.flatMap(f=>[invoke(f),invoke(f)]));assert.ok(outcomes.every(o=>o.status==='fulfilled'&&o.value.status==='duplicate'));
    for(const f of normal)assert.equal((await applications(f)).length,1);
    assert.deepEqual(await receiptSnapshot(),originalReceipts);assert.equal(bootstrapCalls,0);
    console.log('P0_RECEIPT_EXECUTION_OPERATOR_POOL_PROOF '+JSON.stringify({directRestrictedLogins:3,separateScopeIssuer:true,executionOnlyPrivilegedCapability:true,authAuditInboxCrud:false,tenantKnownActorSessionDenied:true,bootstrapPoolCalls:bootstrapCalls,providerOutsideTransaction:true,checksPerFreshExecution:4,durableTransactionsPerFreshExecution:3,permissionSessionCapabilityRevocationRechecked:true,mappingChangeRejected:true,grantAdmissionCommitFailureRecovery:true,concurrentAuthorities:2,receiptFieldsUnchanged:true,exactlyOneGrantPerOrder:true,productionPaymentProviderCertified:false,releaseAccepted:false}));
  });
});
