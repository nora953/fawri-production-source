/**
 * Mounted real HTTP proof against the SAME disposable PG18 database with the
 * independently-journaled HELD 0052->0053 (54 Drizzle migrations).
 * Only invoked by the guarded composite GitHub Actions rehearsal. NO hosted.
 */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';

function localUrl(value, role) {
  const url = new URL(String(value || ''));
  assert.equal(url.protocol,'postgresql:');
  assert.equal(url.hostname,'127.0.0.1');
  assert.equal(url.port,'5432');
  assert.equal(url.pathname,'/fawri_receipt_case_0053_ci');
  assert.equal(url.username,role);
  assert.equal(url.search,'');
  assert.equal(url.hash,'');
  assert.ok(url.password.length>=32,'local disposable role password required');
  return url;
}
assert.equal(process.argv.length,2,'P0_HELD_COMPOSITE_HTTP_NO_ARGS');
assert.equal(process.env.GITHUB_ACTIONS,'true','P0_HELD_COMPOSITE_HTTP_CI_ONLY');
assert.equal(process.env.GITHUB_REPOSITORY,'nora953/fawri-production-source');
assert.equal(process.env.NODE_ENV,'test');
assert.equal(process.env.FAWRI_ALLOW_HELD_0053_DISPOSABLE,'1');
assert.equal(process.env.FAWRI_HELD_0053_COMPOSITE_HTTP_CI,'1');
const ownerUrl=localUrl(process.env.DATABASE_URL,'fawri_receipt_case_0053_owner_ci');
const operatorUrl=localUrl(process.env.FAWRI_OPERATOR_DATABASE_URL,'fawri_operator_issuer');
// CI uses the accepted synthetic-session fallback; it is NOT hosted auth
// LOGIN parity, which remains an explicit P0 external acceptance requirement.
assert.equal(process.env.FAWRI_AUTH_DATABASE_URL,'');
assert.equal(process.env.FAWRI_OPERATIONAL_POSTGRES_AUTHORITY,'required');
assert.equal(process.env.FAWRI_AUTH_POSTGRES_SESSION_AUTHORITY,'required');
assert.equal(process.env.FAWRI_ALLOWED_ORIGINS,'https://operator.example.invalid');

const dbRequire=createRequire(new URL('../../lib/db/package.json',import.meta.url));
const apiRequire=createRequire(new URL('../../artifacts/api-server/package.json',import.meta.url));
const {Client}=dbRequire('pg');
const owner=new Client({connectionString:ownerUrl.toString(),connectionTimeoutMillis:5000});
const operator=new Client({connectionString:operatorUrl.toString(),connectionTimeoutMillis:5000});
const actorId=randomUUID(),reviewerId=randomUUID();
const deviceId='composite-open-'+randomUUID(),reviewDeviceId='composite-review-'+randomUUID();
let listener;
async function main() {
  await owner.connect();
  await operator.connect();
  const identity=(await owner.query("SELECT current_database() AS db,(current_setting('server_version_num')::int/10000) AS major,(SELECT count(*)::int FROM drizzle.__drizzle_migrations) AS stages")).rows[0];
  assert.deepEqual(identity,{db:'fawri_receipt_case_0053_ci',major:18,stages:54},
    'P0_HELD_COMPOSITE_HTTP_REQUIRES_54_STAGES');
  assert.deepEqual((await operator.query('SELECT session_user AS login,current_user AS active')).rows[0],
    {login:'fawri_operator_issuer',active:'fawri_operator_issuer'});
  const role=(await owner.query("SELECT rolsuper,rolbypassrls,rolcanlogin FROM pg_roles WHERE rolname='fawri_operator_issuer'")).rows[0];
  assert.deepEqual(role,{rolsuper:false,rolbypassrls:false,rolcanlogin:true});
  assert.equal((await operator.query("SELECT has_table_privilege(session_user,'public.verified_receipt_manual_cases','SELECT,INSERT,UPDATE,DELETE') AS allowed")).rows[0].allowed,false);
  const before=(await owner.query('SELECT (SELECT count(*)::int FROM saas_entitlement_applications)+(SELECT count(*)::int FROM cashier_entitlement_applications) AS n')).rows[0].n;
  for (const [id,name] of [[actorId,'Composite opener'],[reviewerId,'Composite reviewer']]){
    await owner.query("INSERT INTO accounts(id,kind,phone,password_hash,state,phone_verified) VALUES($1,'admin',$2,'synthetic','active',true)",
      [id,'+1991'+String(Math.floor(Math.random()*100000000)).padStart(8,'0')]);
    await owner.query("INSERT INTO admin_profiles(id,account_id,display_name,role,enabled,must_change_password) VALUES($1,$1,$2,'owner_admin',true,false)",[id,name]);
  }
  const [{registerAdminDeviceAuthoritative,setAdminDeviceTrustAuthoritative},
    {authPostgresSessionAuthority},{default:receiptRouter},{enforceAuthOrigin}]=await Promise.all([
    import('../../artifacts/api-server/src/services/postgresAdminSecurityAuthority.ts'),
    import('../../artifacts/api-server/src/services/authPostgresSessionAuthority.ts'),
    import('../../artifacts/api-server/src/routes/auth-verified-receipts-postgres-routes.ts'),
    import('../../artifacts/api-server/src/middleware/authSession.ts')
  ]);
  async function login(id,deviceId) {
    const device=await registerAdminDeviceAuthoritative({accountId:id,accountKind:'admin',deviceId,deviceLabel:'Isolated composite HTTP'});
    assert.equal((await setAdminDeviceTrustAuthoritative({deviceRecordId:device.id,trusted:true,actorAccountId:id})).status,'trusted');
    const issued=await authPostgresSessionAuthority.issueSession({accountId:id,accountKind:'admin',tenantId:id,deviceId,
      deviceLabel:'Isolated composite HTTP',adminRole:'owner_admin',permissions:['manage_subscriptions']});
    return {id,deviceId,token:issued.token,sessionId:issued.session.id,deviceHash:device.device_hash};
  }
  const opener=await login(actorId,deviceId),reviewer=await login(reviewerId,reviewDeviceId);
  const receiptEvent='composite-receipt-'+randomUUID(), evidenceHash='a'.repeat(64);
  await owner.query("INSERT INTO verified_provider_payment_receipts(provider,provider_event_id,payment_ref,request_ref,event_type,amount_iqd,payload_hash,first_received_at) VALUES('superqi_sandbox',$1,$2,$3,'payment_succeeded',49000,$4,clock_timestamp())",
    [receiptEvent,'payment-'+randomUUID(),'request-'+randomUUID(),evidenceHash]);
  const express=apiRequire('express'),cookieParser=apiRequire('cookie-parser');
  const app=express();
  app.use(cookieParser());
  app.use(express.json());
  app.use('/api/auth',enforceAuthOrigin,receiptRouter);
  listener=await new Promise((resolve,reject)=>{
    const server=app.listen(0,'127.0.0.1',()=>resolve(server));
    server.once('error',reject);
  });
  const base='http://127.0.0.1:'+listener.address().port+'/api/auth/admin/billing';
  async function call(method,endpoint,body,actor) {
    const headers={Origin:'https://operator.example.invalid'};
    if(body!==undefined)headers['Content-Type']='application/json';
    if(actor){
      headers.Cookie='fawri_admin_session_v2='+actor.token;
      headers['X-Fawri-Device-Id']=actor.deviceId;
    }
    const response=await fetch(base+endpoint,{method,headers,...(body===undefined?{}:{body:JSON.stringify(body)})});
    return {status:response.status,data:await response.json(),cache:response.headers.get('cache-control')};
  }
  const intake='/verified-receipts/'+receiptEvent+'/manual-case';
  assert.equal((await call('POST',intake,{},null)).status,401);
  assert.equal((await call('POST',intake,{merchant_id:'forged'},opener)).status,400);
  const opened=await call('POST',intake,{},opener);
  assert.equal(opened.status,200,JSON.stringify(opened.data));
  assert.equal(opened.data.status,'UNRESOLVED_HOLD');
  assert.equal(opened.data.applied,false);
  const caseId=opened.data.case_id;
  assert.match(caseId,/^receipt-case-[a-f0-9]{64}$/);
  assert.deepEqual((await call('POST',intake,{},opener)).data,opened.data,'lost ACK retry must return identical case');
  const list=await call('GET','/verified-receipt-manual-cases?limit=1',undefined,opener);
  assert.equal(list.status,200,JSON.stringify(list.data));
  assert.match(list.cache,/no-store/);
  assert.equal(list.data.cases[0].case_id,caseId);
  const escalation='/verified-receipt-manual-cases/'+caseId+'/escalation';
  assert.equal((await call('POST',escalation,{action:'RECORD_PROVIDER_OUTCOME',provider_evidence_hash:evidenceHash},opener)).status,400);
  assert.equal((await call('POST',escalation,{action:'ESCALATE_TO_PROVIDER',provider_evidence_hash:null},opener)).status,200);
  const dispute=await call('POST',escalation,{action:'RECORD_PROVIDER_DISPUTE',provider_evidence_hash:evidenceHash},opener);
  assert.equal(dispute.status,200,JSON.stringify(dispute.data));
  assert.equal(dispute.data.status,'PROVIDER_DISPUTE');
  const review='/verified-receipt-manual-cases/'+caseId+'/second-review';
  assert.equal((await call('POST',review,{provider_evidence_hash:evidenceHash},opener)).status,409,
    'actor cannot review own dispute');
  assert.equal((await call('POST',review,{provider_evidence_hash:'b'.repeat(64)},reviewer)).status,409);
  const reviewed=await call('POST',review,{provider_evidence_hash:evidenceHash},reviewer);
  assert.equal(reviewed.status,200,JSON.stringify(reviewed.data));
  assert.deepEqual({status:reviewed.data.status,applied:reviewed.data.applied,provider_settled:reviewed.data.provider_settled},
    {status:'PROVIDER_DISPUTE_REVIEWED',applied:false,provider_settled:false});
  assert.equal((await call('POST',review,{provider_evidence_hash:evidenceHash},reviewer)).status,409);
  const history=await call('GET','/verified-receipt-manual-cases/'+caseId+'/history?limit=10',undefined,opener);
  assert.equal(history.status,200,JSON.stringify(history.data));
  assert.deepEqual(history.data.events.map(e=>e.event_action),
    ['ACKNOWLEDGE_DISPUTE_SECOND_REVIEW','RECORD_PROVIDER_DISPUTE','ESCALATE_TO_PROVIDER','OPEN_HOLD']);
  const events=(await owner.query('SELECT actor_id,action FROM verified_receipt_manual_case_events WHERE case_id=$1 ORDER BY sequence',[caseId])).rows;
  assert.deepEqual(events.map(e=>e.action),['OPEN_HOLD','ESCALATE_TO_PROVIDER','RECORD_PROVIDER_DISPUTE','ACKNOWLEDGE_DISPUTE_SECOND_REVIEW']);
  assert.deepEqual(events.map(e=>e.actor_id),[actorId,actorId,actorId,reviewerId]);
  const after=(await owner.query('SELECT (SELECT count(*)::int FROM saas_entitlement_applications)+(SELECT count(*)::int FROM cashier_entitlement_applications) AS n')).rows[0].n;
  assert.equal(after,before,'manual case must never enable a subscription');
  assert.equal(await authPostgresSessionAuthority.revokeSession(opener.token,'admin','manual_revocation'),true);
  assert.equal((await call('POST',intake,{},opener)).status,401);
  console.log('P0_HELD_0053_COMPOSITE_54_STAGE_MOUNTED_HTTP_RESTRICTED_PG18_PASS '+JSON.stringify({
    stages:54,actualPostgres:true,realAppHttp:true,operatorLoginRestricted:true,
    independentSecondReviewer:true,noEntitlementMutation:true,hostedAccepted:false,
    providerSettlementVerified:false
  }));
}
try{
  await main();
}catch(error){
  console.error(error);
  process.exitCode=1;
}finally{
  if(listener)await new Promise(resolve=>listener.close(resolve));
  await operator.end().catch(()=>{});
  await owner.end().catch(()=>{});
  const [{closeAuthenticationPool},{closeOperatorDirectoryPool}]=await Promise.all([
    import('../../artifacts/api-server/src/services/authenticationPostgresAuthority.ts'),
    import('../../artifacts/api-server/src/services/operatorDirectoryPostgresAuthority.ts')
  ]);
  await closeAuthenticationPool().catch(()=>{});
  await closeOperatorDirectoryPool().catch(()=>{});
}
