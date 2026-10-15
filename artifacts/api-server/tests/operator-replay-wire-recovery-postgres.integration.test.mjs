import assert from 'node:assert/strict';
import {randomUUID,randomInt,generateKeyPairSync} from 'node:crypto';
import test from 'node:test';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {assertDisposablePostgres} from '../../../scripts/lib/disposable-postgres-test-guard.mjs';
import {cleanupResources,stopTestChild} from './helpers/cleanup-resources.mjs';
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
const childPath=fileURLToPath(new URL('./helpers/operator-replay-wire-child.mjs',import.meta.url));
const capability='public.fawri_authorize_verified_receipt_replay(text,text,text,text,text,text,text,text)';
const kinds={saas:{orders:'saas_billing_orders',events:'saas_billing_events',applications:'saas_entitlement_applications',subscriptions:'subscriptions'},cashier:{orders:'cashier_billing_orders',events:'cashier_billing_events',applications:'cashier_entitlement_applications',subscriptions:'merchant_cashier_subscriptions'}};

test('real operator HTTP replay recovers committed receipt/grant after PostgreSQL wire acknowledgment loss with fresh sessions', {timeout:180000},async t=>{
  const ids=[],events=[],children=[],markers=[],sessionIds=[];const role=`operator_wire_${randomUUID().replaceAll('-','')}`;let roleCreated=false;
  t.after(async()=>cleanupResources([
    ['owned backends',async()=>{for(const marker of markers)await pool.query('SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE application_name=$1 AND datname=current_database() AND pid<>pg_backend_pid()',[marker]);}],
    ['owned child processes',async()=>{for(const child of children)await stopTestChild(child);}],
    ['owned receipts',()=>pool.query('DELETE FROM verified_provider_payment_receipts WHERE provider_event_id=ANY($1::text[])',[events])],
    ['owned execution audits',()=>pool.query('DELETE FROM database_admin_access_audits WHERE admin_account_id=ANY($1::text[])',[ids])],
    ['owned trusted devices',()=>pool.query('DELETE FROM trusted_devices WHERE account_id=ANY($1::text[])',[ids])],
    ['owned accounts',()=>pool.query('DELETE FROM accounts WHERE id=ANY($1::text[])',[ids])],
    ['owned role grants',()=>roleCreated?pool.query(`DROP OWNED BY ${role}`):undefined],
    ['owned role',()=>roleCreated?pool.query(`DROP ROLE ${role}`):undefined],
    ['pool',()=>pool.end()],
  ]));
  await pool.query(`CREATE ROLE ${role} NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS`);roleCreated=true;
  await pool.query(`GRANT USAGE ON SCHEMA public TO ${role}`);await pool.query(`GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO ${role}`);await pool.query(`GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA public TO ${role}`);
  assert.equal((await pool.query("SELECT has_function_privilege($1,$2,'EXECUTE') AS allowed",[role,capability])).rows[0].allowed,false);
  await pool.query(`GRANT EXECUTE ON FUNCTION ${capability} TO ${role}`);
  async function admin(roleName,permissions=[]){
    const id=`wire-admin-${randomUUID()}`;ids.push(id);
    await pool.query("INSERT INTO accounts(id,kind,phone,password_hash,state,phone_verified) VALUES($1,'admin',$2,'synthetic','active',true)",[id,`+1997${String(randomInt(0,100000000)).padStart(8,'0')}`]);
    await pool.query("INSERT INTO admin_profiles(id,account_id,display_name,role,enabled,must_change_password) VALUES($1,$1,'Synthetic',$2,true,false)",[id,roleName]);
    for(const permission of permissions)await pool.query('INSERT INTO admin_permissions(admin_id,permission) VALUES($1,$2)',[id,permission]);
    return {id,adminRole:roleName,permissions,device:`wire-device-${randomUUID()}`};
  }
  const owner=await admin('owner_admin'),finance=await admin('assistant_admin',['manage_subscriptions']);
  const device=await registerAdminDeviceAuthoritative({accountId:finance.id,accountKind:'admin',deviceId:finance.device,deviceLabel:'Synthetic'});
  assert.equal((await setAdminDeviceTrustAuthoritative({deviceRecordId:device.id,trusted:true,actorAccountId:owner.id})).status,'trusted');
  async function issue(){const session=await authority.issueSession({accountId:finance.id,accountKind:'admin',tenantId:finance.id,deviceId:finance.device,deviceLabel:'Synthetic',adminRole:finance.adminRole,permissions:finance.permissions});assert.ok(!sessionIds.includes(session.session.id),'fresh retry session required');sessionIds.push(session.session.id);return session.token;}
  async function fixture(kind){
    const merchantId=`wire-merchant-${randomUUID()}`;ids.push(merchantId);
    await pool.query("INSERT INTO accounts(id,kind,phone,password_hash,state,phone_verified) VALUES($1,'merchant',$2,'synthetic','active',true)",[merchantId,`+1998${String(randomInt(0,100000000)).padStart(8,'0')}`]);
    await pool.query("INSERT INTO merchants(id,account_id,owner_name,store_name,activity_type,status,account_status,onboarding_status) VALUES($1,$1,'Synthetic','Synthetic','retail','approved','approved','channel_connected')",[merchantId]);
    const checkout=kind==='saas'?await saas.createSaasBillingCheckout({merchantId,operation:'activate',plan:'silver',idempotencyKey:randomUUID(),provider:'test_fake'}):await cashier.createCashierBillingCheckout({merchantId,operation:'activate',requestedSeats:1,idempotencyKey:randomUUID(),provider:'test_fake'});
    const firstReceivedAt=new Date(Date.parse(checkout.order.created_at)+100).toISOString().replace(/(\.\d{3})Z$/,'$1456Z');assert.ok(Date.parse(firstReceivedAt)>Date.parse(checkout.order.created_at));
    const payload={paymentId:`synthetic-wire-${randomUUID()}`,requestId:randomUUID(),status:'SUCCESS',canceled:false,amount:checkout.order.amount_iqd,confirmedAmount:checkout.order.amount_iqd,currency:'IQD',creationDate:new Date(Date.parse(checkout.order.created_at)+50).toISOString()};
    const event=superQiConfirmedProviderEventId(payload);events.push(event);
    await pool.query(`UPDATE ${kinds[kind].orders} SET provider='superqi_sandbox',provider_checkout_ref=$2,metadata=metadata||$3::jsonb WHERE id=$1`,[checkout.order.id,payload.paymentId,JSON.stringify({provider_request_id:payload.requestId})]);
    await pool.query("INSERT INTO verified_provider_payment_receipts VALUES('superqi_sandbox',$1,$2,$3,'payment_succeeded',$4,$5,$6)",[event,payload.paymentId,payload.requestId,payload.amount,superQiWebhookPayloadHash(payload),firstReceivedAt]);
    return {kind,merchantId,payload,event,firstReceivedAt,body:{authority:kind==='saas'?'bot_subscription':'cashier_subscription',order_id:checkout.order.id}};
  }
  async function receipt(f){return (await pool.query('SELECT * FROM verified_provider_payment_receipts WHERE provider_event_id=$1',[f.event])).rows[0];}
  async function snapshot(f){const tables=kinds[f.kind];return {
    order:(await pool.query(`SELECT status,to_char(paid_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS paid_time FROM ${tables.orders} WHERE id=$1`,[f.body.order_id])).rows[0],
    event:(await pool.query(`SELECT status,to_char(occurred_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS time FROM ${tables.events} WHERE provider_event_id=$1`,[f.event])).rows,
    applications:(await pool.query(`SELECT count(*)::int AS n FROM ${tables.applications} WHERE order_id=$1`,[f.body.order_id])).rows[0].n,
    subscriptions:(await pool.query(`SELECT count(*)::int AS n FROM ${tables.subscriptions} WHERE merchant_id=$1`,[f.merchantId])).rows[0].n,
  };}
  async function run(f,boundary){
    const token=await issue(),marker=`operator-wire-owned-${randomUUID()}`;markers.push(marker);
    const child=spawn(process.execPath,['--import','tsx',childPath],{env:{...process.env},stdio:['ignore','pipe','pipe','ipc']});children.push(child);
    const messages=[];let readyResolve;const ready=new Promise(resolve=>{readyResolve=resolve;});
    child.on('message',message=>{messages.push(message);if(message.type==='ready')readyResolve();});child.stdout.on('data',()=>{});child.stderr.on('data',()=>{});
    const done=new Promise(resolve=>{child.once('exit',(code,signal)=>resolve({code,signal,messages}));child.once('error',()=>resolve({code:'SPAWN_FAILURE',messages}));});
    let timer;try{await Promise.race([ready,done.then(()=>{throw new Error('owned operator exited before ready');}),new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('owned operator ready timeout')),15000);})]);}finally{clearTimeout(timer);}
    child.send({...f,role,marker,token,device:finance.device,boundary});
    try{return await Promise.race([done,new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('owned operator HTTP timeout')),30000);})]);}finally{clearTimeout(timer);}
  }
  async function runPausedWithRevocation(f,revoke){
    const token=await issue(),marker=`operator-wire-owned-${randomUUID()}`;markers.push(marker);
    const child=spawn(process.execPath,['--import','tsx',childPath],{env:{...process.env},stdio:['ignore','pipe','pipe','ipc']});children.push(child);
    const messages=[];let readyResolve,pausedResolve;
    const ready=new Promise(resolve=>{readyResolve=resolve;});
    const paused=new Promise(resolve=>{pausedResolve=resolve;});
    child.on('message',message=>{messages.push(message);if(message.type==='ready')readyResolve();if(message.type==='provider-paused')pausedResolve();});
    child.stdout.on('data',()=>{});child.stderr.on('data',()=>{});
    const done=new Promise(resolve=>{child.once('exit',(code,signal)=>resolve({code,signal,messages}));child.once('error',()=>resolve({code:'SPAWN_FAILURE',messages}));});
    const deadline=async(p,label)=>{let timer;try{return await Promise.race([p,done.then(()=>{throw Error('operator child exited before '+label);}),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('operator '+label+' timeout')),15000);})]);}finally{clearTimeout(timer);}};
    await deadline(ready,'ready');
    child.send({...f,role,marker,token,device:finance.device,pauseProvider:true});
    await deadline(paused,'provider pause');
    try{await revoke(token);}finally{child.send({type:'resume-provider'});}
    let finishTimer;try{return await Promise.race([done,new Promise((_,reject)=>{finishTimer=setTimeout(()=>reject(Error('operator HTTP completion timeout')),30000);})]);}finally{clearTimeout(finishTimer);}
  }
  const audits=async()=>(await pool.query("SELECT count(*)::int AS n FROM database_admin_access_audits WHERE admin_account_id=$1 AND reason_code='BILLING_RECEIPT_REPLAY_EXECUTE'",[finance.id])).rows[0].n;
  for(const kind of ['saas','cashier'])await t.test(`${kind}: revoked active session during provider I/O must not apply entitlement`,async()=>{
    const f=await fixture(kind),originalReceipt=await receipt(f),before=await snapshot(f);
    const result=await runPausedWithRevocation(f,async(token)=>{
      const revoked=await authority.revokeSession(token,'admin','manual_revocation');
      assert.equal(revoked,true,'the in-flight operator session must be revoked');
    });
    assert.equal(result.code,0,'original HTTP child must finish normally');
    const response=result.messages.find(m=>m.type==='http-result');
    assert.ok(response,'missing HTTP response');
    assert.ok([401,403,409].includes(response.httpStatus),`expected fail-closed session revocation, got ${response.httpStatus}`);
    assert.equal(response.providerCalls,1,'provider was called before session revocation');
    assert.deepEqual(await snapshot(f),before,'revoked session must not apply payment');
    assert.deepEqual(await receipt(f),originalReceipt,'verified receipt must remain immutable');
    const recovered=await run(f),recovery=recovered.messages.find(m=>m.type==='http-result');
    assert.equal(recovered.code,0);assert.equal(recovery.httpStatus,200);assert.equal(recovery.status,'applied');
    const after=await snapshot(f);assert.equal(after.applications,1);assert.equal(after.subscriptions,1);
    assert.equal(after.order.paid_time,f.firstReceivedAt);assert.deepEqual(await receipt(f),originalReceipt);
  });
  for(const kind of ['saas','cashier'])await t.test(`${kind}: revoked device trust during provider I/O must not apply entitlement`,async()=>{
    const f=await fixture(kind),originalReceipt=await receipt(f),before=await snapshot(f);
    const result=await runPausedWithRevocation(f,async()=>{
      const changed=await setAdminDeviceTrustAuthoritative({deviceRecordId:device.id,trusted:false,actorAccountId:owner.id});
      assert.equal(changed.status,'revoked');
    });
    assert.equal(result.code,0,'original HTTP child must finish normally');
    const response=result.messages.find(m=>m.type==='http-result');
    assert.ok(response,'missing HTTP response');
    assert.ok([401,403,409].includes(response.httpStatus),`expected fail-closed device revocation, got ${response.httpStatus}`);
    assert.equal(response.providerCalls,1,'provider was called before device trust revocation');
    assert.deepEqual(await snapshot(f),before,'untrusted device must not apply payment');
    assert.deepEqual(await receipt(f),originalReceipt,'verified receipt must remain immutable');
    const restored=await setAdminDeviceTrustAuthoritative({deviceRecordId:device.id,trusted:true,actorAccountId:owner.id});
    assert.equal(restored.status,'trusted');
    const recovered=await run(f),recovery=recovered.messages.find(m=>m.type==='http-result');
    assert.equal(recovered.code,0);assert.equal(recovery.httpStatus,200);assert.equal(recovery.status,'applied');
    const after=await snapshot(f);assert.equal(after.applications,1);assert.equal(after.subscriptions,1);
    assert.equal(after.order.paid_time,f.firstReceivedAt);assert.deepEqual(await receipt(f),originalReceipt);
  });
  for(const kind of ['saas','cashier'])await t.test(`${kind}: revoked finance permission during provider I/O must not apply entitlement`,async()=>{
    const f=await fixture(kind),originalReceipt=await receipt(f),before=await snapshot(f);
    const result=await runPausedWithRevocation(f,()=>pool.query("DELETE FROM admin_permissions WHERE admin_id=$1 AND permission='manage_subscriptions'",[finance.id]));
    assert.equal(result.code,0,'original HTTP child must finish normally');
    const response=result.messages.find(m=>m.type==='http-result');
    assert.ok(response,'missing HTTP response');
    assert.ok([403,409].includes(response.httpStatus),`expected fail-closed revocation, got ${response.httpStatus}`);
    assert.equal(response.providerCalls,1,'provider was called before revocation');
    assert.deepEqual(await snapshot(f),before,'revoked operator must not apply payment');
    assert.deepEqual(await receipt(f),originalReceipt,'verified receipt must remain immutable');
    await pool.query("INSERT INTO admin_permissions(admin_id,permission) VALUES($1,'manage_subscriptions')",[finance.id]);
    const recovered=await run(f),recovery=recovered.messages.find(m=>m.type==='http-result');
    assert.equal(recovered.code,0);assert.equal(recovery.httpStatus,200);assert.equal(recovery.status,'applied');
    const after=await snapshot(f);assert.equal(after.applications,1);assert.equal(after.subscriptions,1);
    assert.equal(after.order.paid_time,f.firstReceivedAt);assert.deepEqual(await receipt(f),originalReceipt);
  });
  for(const kind of ['saas','cashier'])for(const boundary of [1,2])await t.test(`${kind}: operator HTTP loses ${boundary===1?'billing receipt':'entitlement'} COMMIT acknowledgment and fresh-session retry stays once-only`,async()=>{
    const f=await fixture(kind),originalReceipt=await receipt(f),beforeAudits=await audits();
    const lost=await run(f,boundary);assert.equal(lost.code,0,'child must complete HTTP failure handling/cleanup');
    assert.ok(lost.messages.some(m=>m.type==='role-proof'&&m.restricted&&m.privateReceipt&&m.privateOrders));
    assert.ok(lost.messages.some(m=>m.type==='wire-drop'&&m.boundary===boundary&&m.serverCommitCompleted&&m.commandCompleteDelivered===false),'real backend COMMIT frame must be withheld');
    const response=lost.messages.find(m=>m.type==='http-result');assert.equal(response.httpStatus,503);assert.equal(response.successReported,false);assert.equal(response.providerCalls,1);assert.equal(response.dropObserved,true);
    const uncertain=await snapshot(f);assert.deepEqual(uncertain.event,[{status:boundary===1?'received':'applied',time:f.firstReceivedAt}]);assert.equal(uncertain.applications,boundary===1?0:1);assert.equal(uncertain.subscriptions,boundary===1?0:1);assert.ok(await audits()>beforeAudits,'execution audit must persist despite unknown outcome');assert.deepEqual(await receipt(f),originalReceipt);
    // A new session must still respect current permission, even for already-paid duplicates.
    await pool.query("DELETE FROM admin_permissions WHERE admin_id=$1 AND permission='manage_subscriptions'",[finance.id]);
    const auditBeforeDeny=await audits(),denied=await run(f);assert.equal(denied.code,0);const deniedResponse=denied.messages.find(m=>m.type==='http-result');assert.equal(deniedResponse.httpStatus,403);assert.equal(deniedResponse.providerCalls,0);assert.equal(await audits(),auditBeforeDeny);assert.deepEqual(await snapshot(f),uncertain);
    await pool.query("INSERT INTO admin_permissions(admin_id,permission) VALUES($1,'manage_subscriptions')",[finance.id]);
    const retries=await Promise.all([run(f),run(f)]);assert.ok(retries.every(r=>r.code===0));
    const results=retries.map(r=>r.messages.find(m=>m.type==='http-result'));assert.ok(results.every(r=>r.httpStatus===200&&r.providerCalls===1));assert.deepEqual(results.map(r=>r.status).sort(),boundary===1?['applied','duplicate']:['duplicate','duplicate']);
    const after=await snapshot(f);assert.equal(after.applications,1);assert.equal(after.subscriptions,1);assert.deepEqual(after.event,[{status:'applied',time:f.firstReceivedAt}]);assert.equal(after.order.paid_time,f.firstReceivedAt);assert.deepEqual(await receipt(f),originalReceipt);
    console.log('OPERATOR_REPLAY_WIRE_RECOVERY_PROOF '+JSON.stringify({kind,boundary,realHttp:true,restrictedRole:true,serverCommitCompleted:true,commandCompleteDelivered:false,callerHttpStatus:503,freshSessionPermissionDenied:true,freshProviderOnRetry:true,applications:1,originalMicrosecondTime:true,receiptUnchanged:true,durableAudit:true}));
  });
});
