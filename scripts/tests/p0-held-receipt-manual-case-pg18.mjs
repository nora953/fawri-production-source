// Standalone restricted-login PG18 integration: HELD additive schema is never
// applied to hosted DBs or to the canonical 53-stage Drizzle journal.
import assert from 'node:assert/strict';
import {randomBytes,randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';

if (process.env.FAWRI_RECEIPT_CASE_HELD_CI !== '1') {
  throw new Error('RECEIPT_CASE_HELD_EXECUTION_NOT_AUTHORIZED');
}
const target = new URL(String(process.env.DATABASE_URL || ''));
assert.equal(target.hostname,'127.0.0.1');
assert.equal(target.pathname,'/fawri_ci');
assert.equal(target.username,'fawri_ci');
assert.equal(process.env.NODE_ENV,'test');
const requireDb = createRequire(new URL('../../lib/db/package.json',import.meta.url));
const {Client} = requireDb('pg');
const admin = new Client({connectionString:target.toString(),connectionTimeoutMillis:5000});
const caseRole = 'receipt_case_ci_' + randomBytes(7).toString('hex');
const password = randomBytes(20).toString('hex');
const loginUrl = new URL(target);
loginUrl.username=caseRole;
loginUrl.password=password;
const operator = new Client({connectionString:loginUrl.toString(),connectionTimeoutMillis:5000});
const actorId='receipt-case-actor-'+randomUUID();
const strangerId='receipt-case-stranger-'+randomUUID();
const reviewerId='receipt-case-second-reviewer-'+randomUUID();
const caseId='receipt-case-'+randomBytes(32).toString('hex');
const paymentId='payment-'+randomUUID();
const eventId='receipt-'+randomUUID();
const testHash='a'.repeat(64);
let sessionId,deviceHash;
let connected=false,server;
async function sqlstate(promise,code) {
  await assert.rejects(promise,e=>e?.code===code, 'expected SQLSTATE '+code);
}
try {
  await admin.connect();
  const baseline=(await admin.query(`SELECT current_database() AS db,
    (current_setting('server_version_num')::int/10000) AS major,
    (SELECT count(*)::int FROM drizzle.__drizzle_migrations) AS migrations,
    to_regclass('public.verified_receipt_manual_cases') IS NULL AS absent`)).rows[0];
  assert.deepEqual(baseline,{db:'fawri_ci',major:18,migrations:53,absent:true});
  // Same owned fresh local PG18 after canonical smoke; HELD file is outside
  // migration journal and cannot become executable via normal startup.
  const held = readFileSync(new URL('../../lib/db/first-commercial/held/0053_verified_receipt_manual_cases_candidate.sql',import.meta.url),'utf8');
  await admin.query('BEGIN');
  await admin.query(held);
  await admin.query('COMMIT');
  const ledger=(await admin.query('SELECT count(*)::int AS n FROM drizzle.__drizzle_migrations')).rows[0].n;
  assert.equal(ledger,53,'canonical migration journal must remain byte-for-byte logically untouched');
  const classes=(await admin.query(`SELECT relname,relrowsecurity FROM pg_class
    WHERE relname IN ('verified_receipt_manual_cases','verified_receipt_manual_case_events')
    ORDER BY relname`)).rows;
  assert.equal(classes.length,2);
  assert.ok(classes.every(c=>c.relrowsecurity));
  for(const fn of ['public.fawri_open_unmatched_verified_receipt_case(text,text,text,text,text)',
                   'public.fawri_escalate_verified_receipt_manual_case(text,text,text,text,text,text,text)']) {
    assert.equal((await admin.query(`SELECT EXISTS(SELECT 1 FROM pg_proc p, LATERAL aclexplode(p.proacl) acl WHERE p.oid=$1::regprocedure AND acl.grantee=0 AND acl.privilege_type='EXECUTE') AS allowed`,[fn])).rows[0].allowed,false);
  }
  await admin.query(`CREATE ROLE ${caseRole} LOGIN PASSWORD '${password}' NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION`);
  await admin.query(`GRANT USAGE ON SCHEMA public TO ${caseRole}`);
  // First-commercial HELD grant artifact, exercised on this fresh disposable
  // PG18 with the intended exact LOGIN name. Never a hosted GRANT.
  const grantFile = readFileSync(new URL('../../lib/db/first-commercial/held/0053_receipt_manual_case_operator_grants.sql',import.meta.url),'utf8');
  const onlyStatements=grantFile.split('\n').map(s=>s.trim()).filter(s=>s && !s.startsWith('--'));
  const exactGrants=[
    'GRANT USAGE ON SCHEMA public TO fawri_operator_issuer;',
    'GRANT EXECUTE ON FUNCTION public.fawri_open_unmatched_verified_receipt_case(text,text,text,text,text) TO fawri_operator_issuer;',
    'GRANT EXECUTE ON FUNCTION public.fawri_escalate_verified_receipt_manual_case(text,text,text,text,text,text,text) TO fawri_operator_issuer;',
    'GRANT EXECUTE ON FUNCTION public.fawri_list_verified_receipt_manual_cases(text,text,text,integer,timestamptz,text,text,text) TO fawri_operator_issuer;',
    'GRANT EXECUTE ON FUNCTION public.fawri_read_verified_receipt_manual_case_history(text,text,text,text,integer,bigint,text,text) TO fawri_operator_issuer;',
    'GRANT EXECUTE ON FUNCTION public.fawri_acknowledge_receipt_dispute_second_review(text,text,text,text,text,text) TO fawri_operator_issuer;',
  ];
  assert.deepEqual(onlyStatements,exactGrants,'no widened/replaced hosted GRANT may pass');
  const exactRole='fawri_operator_issuer';
  assert.equal((await admin.query('SELECT EXISTS(SELECT 1 FROM pg_roles WHERE rolname=$1) AS exists',[exactRole])).rows[0].exists,false);
  const exactRolePassword=randomBytes(22).toString('hex');
  await admin.query("CREATE ROLE "+exactRole+" LOGIN PASSWORD '"+exactRolePassword+"' NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION");
  await admin.query(grantFile);
  const exactRoleFlags=(await admin.query('SELECT rolcanlogin,rolsuper,rolbypassrls,rolcreaterole,rolcreatedb,rolinherit,rolreplication FROM pg_roles WHERE rolname=$1',[exactRole])).rows[0];
  assert.deepEqual(exactRoleFlags,{rolcanlogin:true,rolsuper:false,rolbypassrls:false,rolcreaterole:false,rolcreatedb:false,rolinherit:false,rolreplication:false});
  const roleUrl = new URL(target);
  roleUrl.username=exactRole;
  roleUrl.password=exactRolePassword;
  const exactClient=new Client({connectionString:roleUrl.toString(),connectionTimeoutMillis:5000});
  try {
    await exactClient.connect();
    assert.deepEqual((await exactClient.query('SELECT session_user AS login,current_user AS active')).rows[0],{login:exactRole,active:exactRole});
    for(const source of [
      'public.verified_provider_payment_receipts','public.verified_receipt_manual_cases',
      'public.verified_receipt_manual_case_events','public.saas_billing_orders',
      'public.cashier_billing_orders'
    ]) {
      assert.equal((await exactClient.query('SELECT has_table_privilege(session_user,$1,$2) AS allowed',[source,'SELECT,INSERT,UPDATE,DELETE'])).rows[0].allowed,false,source);
    }
    for(const fn of exactGrants.slice(1).map(x=>x.split('ON FUNCTION ')[1].split(' TO ')[0])) {
      assert.equal((await exactClient.query('SELECT has_function_privilege(session_user,$1,$2) AS allowed',[fn,'EXECUTE'])).rows[0].allowed,true,fn);
    }
    assert.equal((await exactClient.query("SELECT has_schema_privilege(session_user,'public','CREATE') AS allowed")).rows[0].allowed,false);
    await sqlstate(exactClient.query('SELECT * FROM public.verified_receipt_manual_cases'),'42501');
    await sqlstate(exactClient.query('SELECT * FROM public.fawri_open_unmatched_verified_receipt_case($1,$2,$3,$4,$5)',[
      'forged-actor','forged-session','a'.repeat(64),'receipt-case-'+'e'.repeat(64),'receipt-event'
    ]),'42501');
  } finally { await exactClient.end(); }
  console.log('P0_RECEIPT_CASE_HELD_EXACT_OPERATOR_GRANTS_PG18_PASS');

  const identity=(await admin.query('SELECT rolcanlogin,rolsuper,rolbypassrls,rolcreaterole FROM pg_roles WHERE rolname=$1',[caseRole])).rows[0];
  assert.deepEqual(identity,{rolcanlogin:true,rolsuper:false,rolbypassrls:false,rolcreaterole:false});
  await admin.query(`INSERT INTO public.accounts(id,kind,phone,password_hash,state,phone_verified)
    VALUES($1,'admin',$2,'synthetic','active',true),
          ($3,'merchant',$4,'synthetic','active',true)`,[
    actorId,'+1991'+String(Math.floor(Math.random()*100000000)).padStart(8,'0'),
    strangerId,'+1991'+String(Math.floor(Math.random()*100000000)).padStart(8,'0')]);
  await admin.query(`INSERT INTO public.admin_profiles(id,account_id,display_name,role,enabled,must_change_password)
    VALUES($1,$1,'Synthetic','owner_admin',true,false)`,[actorId]);
  await admin.query(`INSERT INTO public.accounts(id,kind,phone,password_hash,state,phone_verified)
    VALUES($1,'admin',$2,'synthetic','active',true)`,[
    reviewerId,'+1991'+String(Math.floor(Math.random()*100000000)).padStart(8,'0')]);
  await admin.query(`INSERT INTO public.admin_profiles(id,account_id,display_name,role,enabled,must_change_password)
    VALUES($1,$1,'Second Synthetic','owner_admin',true,false)`,[reviewerId]);
  Object.assign(process.env,{
    FAWRI_OPERATIONAL_POSTGRES_AUTHORITY:'required',
    FAWRI_AUTH_POSTGRES_SESSION_AUTHORITY:'required',
    FAWRI_AUTH_SECURITY_SECRET:'synthetic-manual-case-security-secret-at-least-32-chars',
    FAWRI_PASSWORD_SALT:'synthetic-manual-case-password-salt-at-least-32-chars'
  });
  const {registerAdminDeviceAuthoritative,setAdminDeviceTrustAuthoritative} = await import('../../artifacts/api-server/src/services/postgresAdminSecurityAuthority.ts');
  const {authPostgresSessionAuthority} = await import('../../artifacts/api-server/src/services/authPostgresSessionAuthority.ts');
  const deviceId = 'case-device-'+randomUUID();
  const device = await registerAdminDeviceAuthoritative({accountId:actorId,accountKind:'admin',deviceId,deviceLabel:'Synthetic CI'});
  const trust = await setAdminDeviceTrustAuthoritative({deviceRecordId:device.id,trusted:true,actorAccountId:actorId});
  assert.equal(trust.status,'trusted');
  deviceHash=device.device_hash;
  const issued = await authPostgresSessionAuthority.issueSession({accountId:actorId,accountKind:'admin',tenantId:actorId,deviceId,deviceLabel:'Synthetic CI',adminRole:'owner_admin',permissions:['manage_subscriptions']});
  sessionId=issued.session.id;
  const reviewerDeviceId='case-second-device-'+randomUUID();
  const reviewerDevice=await registerAdminDeviceAuthoritative({accountId:reviewerId,accountKind:'admin',deviceId:reviewerDeviceId,deviceLabel:'Independent reviewer CI'});
  assert.equal((await setAdminDeviceTrustAuthoritative({deviceRecordId:reviewerDevice.id,trusted:true,actorAccountId:reviewerId})).status,'trusted');
  const reviewerIssued=await authPostgresSessionAuthority.issueSession({accountId:reviewerId,accountKind:'admin',tenantId:reviewerId,deviceId:reviewerDeviceId,deviceLabel:'Independent reviewer CI',adminRole:'owner_admin',permissions:['manage_subscriptions']});
  await admin.query(`INSERT INTO public.verified_provider_payment_receipts
    (provider,provider_event_id,payment_ref,request_ref,event_type,amount_iqd,payload_hash,first_received_at)
    VALUES('superqi_sandbox',$1,$2,$3,'payment_succeeded',49000,$4,clock_timestamp())`,[
    eventId,paymentId,'request-'+randomUUID(),testHash]);
  const before=(await admin.query('SELECT (SELECT count(*)::int FROM saas_entitlement_applications)+(SELECT count(*)::int FROM cashier_entitlement_applications) AS n')).rows[0].n;
  await operator.connect();connected=true;
  const runtime=(await operator.query('SELECT session_user AS login,current_user AS active')).rows[0];
  assert.deepEqual(runtime,{login:caseRole,active:caseRole});
  await sqlstate(operator.query('SELECT * FROM public.verified_receipt_manual_cases'),'42501');
  await sqlstate(operator.query('INSERT INTO public.verified_receipt_manual_cases(id,provider_event_id,opened_by) VALUES($1,$2,$3)',[caseId,eventId,actorId]),'42501');
  await sqlstate(operator.query('SELECT * FROM public.fawri_open_unmatched_verified_receipt_case($1,$2,$3,$4,$5)',[actorId,sessionId,deviceHash,caseId,eventId]),'42501');
  await admin.query(`GRANT EXECUTE ON FUNCTION public.fawri_open_unmatched_verified_receipt_case(text,text,text,text,text) TO ${caseRole}`);
  await admin.query(`GRANT EXECUTE ON FUNCTION public.fawri_escalate_verified_receipt_manual_case(text,text,text,text,text,text,text) TO ${caseRole}`);
  const queueSql="SELECT * FROM public.fawri_list_verified_receipt_manual_cases($1,$2,$3,$4,$5,$6,$7,$8)";
  const historySql="SELECT * FROM public.fawri_read_verified_receipt_manual_case_history($1,$2,$3,$4,$5,$6,$7,$8)";
  await sqlstate(operator.query(queueSql,[actorId,sessionId,deviceHash,20,null,null,'audit-no-grant',testHash]),'42501');
  await sqlstate(operator.query(historySql,[actorId,sessionId,deviceHash,caseId,20,null,'audit-no-grant-2',testHash]),'42501');
  await admin.query(`GRANT EXECUTE ON FUNCTION public.fawri_list_verified_receipt_manual_cases(text,text,text,integer,timestamptz,text,text,text) TO ${caseRole}`);
  await admin.query(`GRANT EXECUTE ON FUNCTION public.fawri_read_verified_receipt_manual_case_history(text,text,text,text,integer,bigint,text,text) TO ${caseRole}`);
  const reviewSql="SELECT public.fawri_acknowledge_receipt_dispute_second_review($1,$2,$3,$4,$5,$6) AS state";
  const reviewInput=[reviewerId,reviewerIssued.session.id,reviewerDevice.device_hash,caseId,'review-'+randomUUID(),testHash];
  await sqlstate(operator.query(reviewSql,reviewInput),'42501');
  await admin.query(`GRANT EXECUTE ON FUNCTION public.fawri_acknowledge_receipt_dispute_second_review(text,text,text,text,text,text) TO ${caseRole}`);
  await sqlstate(operator.query('SELECT * FROM public.verified_receipt_manual_case_events'),'42501');
  await sqlstate(operator.query('SELECT * FROM public.fawri_open_unmatched_verified_receipt_case($1,$2,$3,$4,$5)',[strangerId,sessionId,deviceHash,caseId,eventId]),'42501');
  await sqlstate(operator.query('SELECT * FROM public.fawri_open_unmatched_verified_receipt_case($1,$2,$3,$4,$5)',[actorId,sessionId,deviceHash,caseId,'absent-receipt']),'23514');
  const open=(await operator.query('SELECT * FROM public.fawri_open_unmatched_verified_receipt_case($1,$2,$3,$4,$5)',[actorId,sessionId,deviceHash,caseId,eventId])).rows;
  assert.deepEqual(open,[{case_id:caseId,receipt_event_id:eventId,case_state:'UNRESOLVED_HOLD',applied:false}]);
  assert.deepEqual((await operator.query('SELECT * FROM public.fawri_open_unmatched_verified_receipt_case($1,$2,$3,$4,$5)',[actorId,sessionId,deviceHash,caseId,eventId])).rows,open);
  await sqlstate(operator.query('SELECT * FROM public.fawri_open_unmatched_verified_receipt_case($1,$2,$3,$4,$5)',[actorId,sessionId,deviceHash,'receipt-case-'+randomBytes(32).toString('hex'),eventId]),'23505');
  await sqlstate(operator.query('SELECT public.fawri_escalate_verified_receipt_manual_case($1,$2,$3,$4,$5,$6,$7)',[actorId,sessionId,deviceHash,caseId,'RECORD_PROVIDER_DISPUTE','bad-order',testHash]),'23514');
  const forward=(await operator.query('SELECT public.fawri_escalate_verified_receipt_manual_case($1,$2,$3,$4,$5,$6,$7) AS state',[actorId,sessionId,deviceHash,caseId,'ESCALATE_TO_PROVIDER','escalate-'+randomUUID(),null])).rows[0];
  assert.equal(forward.state,'PROVIDER_REVIEW');
  await sqlstate(operator.query('SELECT public.fawri_escalate_verified_receipt_manual_case($1,$2,$3,$4,$5,$6,$7)',[actorId,sessionId,deviceHash,caseId,'ESCALATE_TO_PROVIDER','second-'+randomUUID(),null]),'23514');
  await sqlstate(operator.query('SELECT public.fawri_escalate_verified_receipt_manual_case($1,$2,$3,$4,$5,$6,$7)',[actorId,sessionId,deviceHash,caseId,'RECORD_PROVIDER_DISPUTE','bad-'+randomUUID(),null]),'23514');
  const dispute=(await operator.query('SELECT public.fawri_escalate_verified_receipt_manual_case($1,$2,$3,$4,$5,$6,$7) AS state',[actorId,sessionId,deviceHash,caseId,'RECORD_PROVIDER_DISPUTE','dispute-'+randomUUID(),testHash])).rows[0];
  assert.equal(dispute.state,'PROVIDER_DISPUTE');
  await sqlstate(operator.query('SELECT public.fawri_escalate_verified_receipt_manual_case($1,$2,$3,$4,$5,$6,$7)',[actorId,sessionId,deviceHash,caseId,'RECORD_PROVIDER_OUTCOME','outcome-'+randomUUID(),testHash]),'22023');
  const history=(await admin.query('SELECT action,from_state,to_state,actor_id,session_id,device_hash FROM public.verified_receipt_manual_case_events WHERE case_id=$1 ORDER BY sequence',[caseId])).rows;
  assert.deepEqual(history.map(x=>x.action),['OPEN_HOLD','ESCALATE_TO_PROVIDER','RECORD_PROVIDER_DISPUTE']);
  assert.ok(history.every(x=>x.actor_id===actorId && x.session_id===sessionId && x.device_hash===deviceHash));
  // The real mounted operator HTTP route must not authorize guessed financial
  // ownership. Use its production session/permission/device middleware and the
  // same actual restricted LOGIN, not mocked route handlers.
  process.env.FAWRI_OPERATOR_DATABASE_URL=loginUrl.toString();
  process.env.FAWRI_ALLOWED_ORIGINS='https://operator.example.invalid';
  const requireApi=createRequire(new URL('../../artifacts/api-server/package.json',import.meta.url));
  const express=requireApi('express'),cookieParser=requireApi('cookie-parser');
  const [{default:router},{enforceAuthOrigin}]=await Promise.all([
    import('../../artifacts/api-server/src/routes/auth-verified-receipts-postgres-routes.ts'),
    import('../../artifacts/api-server/src/middleware/authSession.ts'),
  ]);
  const httpApp=express();
  httpApp.use(cookieParser());
  httpApp.use(express.json());
  httpApp.use('/api/auth',enforceAuthOrigin,router);
  server=await new Promise((resolve,reject)=>{
    const listener=httpApp.listen(0,'127.0.0.1',()=>resolve(listener));
    listener.once('error',reject);
  });
  const httpEventId='receipt-http-'+randomUUID();
  await admin.query(`INSERT INTO public.verified_provider_payment_receipts
    (provider,provider_event_id,payment_ref,request_ref,event_type,amount_iqd,payload_hash,first_received_at)
    VALUES('superqi_sandbox',$1,$2,$3,'payment_succeeded',49000,$4,clock_timestamp())`,[
    httpEventId,'payment-http-'+randomUUID(),'request-http-'+randomUUID(),testHash]);
  const base='http://127.0.0.1:'+server.address().port+'/api/auth/admin/billing';
  async function post(path,body,authenticate=true) {
    const response=await fetch(base+path,{method:'POST',headers:{
      Origin:'https://operator.example.invalid',
      'Content-Type':'application/json',
      ...(authenticate?{Cookie:'fawri_admin_session_v2='+issued.token,'X-Fawri-Device-Id':deviceId}:{})
    },body:JSON.stringify(body)});
    return {status:response.status,data:await response.json()};
  }
  async function reviewPost(path,body,roleToken,roleDeviceId) {
    const response=await fetch(base+path,{method:'POST',headers:{
      Origin:'https://operator.example.invalid',
      'Content-Type':'application/json',
      Cookie:'fawri_admin_session_v2='+roleToken,
      'X-Fawri-Device-Id':roleDeviceId,
    },body:JSON.stringify(body)});
    return {status:response.status,data:await response.json()};
  }
  const reviewPath='/verified-receipt-manual-cases/'+caseId+'/second-review';
  const payload={provider_evidence_hash:testHash};
  assert.equal((await post(reviewPath,payload,false)).status,401);
  assert.equal((await post(reviewPath,payload)).status,409,'opener cannot approve own dispute');
  assert.equal((await reviewPost(reviewPath,{provider_evidence_hash:'b'.repeat(64)},reviewerIssued.token,reviewerDeviceId)).status,409,'wrong provider evidence digest must fail');
  assert.equal((await reviewPost(reviewPath,{...payload,refund:true},reviewerIssued.token,reviewerDeviceId)).status,400,'no financial authority in review body');
  const reviewed=await reviewPost(reviewPath,payload,reviewerIssued.token,reviewerDeviceId);
  assert.equal(reviewed.status,200,JSON.stringify(reviewed.data));
  assert.deepEqual({status:reviewed.data.status,provider_settled:reviewed.data.provider_settled,applied:reviewed.data.applied},
    {status:'PROVIDER_DISPUTE_REVIEWED',provider_settled:false,applied:false});
  assert.equal((await reviewPost(reviewPath,payload,reviewerIssued.token,reviewerDeviceId)).status,409,'second review cannot replay as second approval');
  const reviewedEvents=(await admin.query('SELECT action,actor_id,session_id,device_hash,provider_evidence_hash FROM public.verified_receipt_manual_case_events WHERE case_id=$1 ORDER BY sequence',[caseId])).rows;
  assert.deepEqual(reviewedEvents.map(e=>e.action),['OPEN_HOLD','ESCALATE_TO_PROVIDER','RECORD_PROVIDER_DISPUTE','ACKNOWLEDGE_DISPUTE_SECOND_REVIEW']);
  assert.deepEqual({
    actor:reviewedEvents.at(-1).actor_id,
    session:reviewedEvents.at(-1).session_id,
    device:reviewedEvents.at(-1).device_hash,
    evidence:reviewedEvents.at(-1).provider_evidence_hash,
  },{actor:reviewerId,session:reviewerIssued.session.id,device:reviewerDevice.device_hash,evidence:testHash});
  assert.notEqual(reviewedEvents.at(-1).actor_id,reviewedEvents.at(-2).actor_id);
  console.log('P0_RECEIPT_DISPUTE_INDEPENDENT_SECOND_ACTOR_HTTP_PG18_PASS');
  const intakePath='/verified-receipts/'+httpEventId+'/manual-case';
  assert.equal((await post(intakePath,{},false)).status,401);
  assert.equal((await post(intakePath,{merchant_id:'forged'})).status,400);
  assert.equal((await post(intakePath,{order_id:'new-order'})).status,400);
  assert.equal((await post(intakePath,{amount_iqd:49000})).status,400);
  const opened=await post(intakePath,{});
  assert.equal(opened.status,200,JSON.stringify(opened.data));
  assert.equal(opened.data.status,'UNRESOLVED_HOLD');
  assert.equal(opened.data.applied,false);
  assert.ok(/^receipt-case-[a-f0-9]{64}$/.test(opened.data.case_id));
  assert.deepEqual((await post(intakePath,{})).data,opened.data);
  const escalationPath='/verified-receipt-manual-cases/'+opened.data.case_id+'/escalation';
  assert.equal((await post(escalationPath,{action:'RECORD_PROVIDER_OUTCOME',provider_evidence_hash:testHash})).status,400);
  assert.equal((await post(escalationPath,{action:'ESCALATE_TO_PROVIDER',provider_evidence_hash:null,merchant_id:'foreign'})).status,400);
  const escalated=await post(escalationPath,{action:'ESCALATE_TO_PROVIDER',provider_evidence_hash:null});
  assert.equal(escalated.status,200,JSON.stringify(escalated.data));
  assert.deepEqual({status:escalated.data.status,applied:escalated.data.applied,provider_settled:escalated.data.provider_settled},
    {status:'PROVIDER_REVIEW',applied:false,provider_settled:false});
  const reopened=await post(intakePath,{});
  assert.equal(reopened.status,200);
  assert.equal(reopened.data.case_id,opened.data.case_id);
  assert.equal(reopened.data.status,'PROVIDER_REVIEW','lost HTTP response recheck returns current case state');
  const httpEvents=(await admin.query('SELECT action,actor_id,session_id,device_hash FROM public.verified_receipt_manual_case_events WHERE case_id=$1 ORDER BY sequence',[opened.data.case_id])).rows;
  assert.deepEqual(httpEvents.map(x=>x.action),['OPEN_HOLD','ESCALATE_TO_PROVIDER']);
  assert.ok(httpEvents.every(x=>x.actor_id===actorId && x.session_id===sessionId && x.device_hash===deviceHash));
  console.log('P0_RECEIPT_MANUAL_CASE_MOUNTED_HTTP_RESTRICTED_PG18_PASS');
  // Real permissioned operator case work queue: no table read, no raw provider
  // refs, bounded pagination and durable actor/audit evidence.
  async function get(path,authenticate=true) {
    const response=await fetch(base+path,{headers:{
      Origin:'https://operator.example.invalid',
      ...(authenticate?{Cookie:'fawri_admin_session_v2='+issued.token,'X-Fawri-Device-Id':deviceId}:{})
    }});
    return {status:response.status,cache:response.headers.get('cache-control'),data:await response.json()};
  }
  assert.equal((await get('/verified-receipt-manual-cases',false)).status,401);
  assert.equal((await get('/verified-receipt-manual-cases?merchant_id=forged')).status,400);
  assert.equal((await get('/verified-receipt-manual-cases?limit=0')).status,400);
  assert.equal((await get('/verified-receipt-manual-cases?cursor=bad')).status,400);
  const q1=await get('/verified-receipt-manual-cases?limit=1');
  assert.equal(q1.status,200,JSON.stringify(q1.data));
  assert.match(q1.cache,/no-store/);
  assert.equal(q1.data.cases.length,1);
  assert.ok(q1.data.next_cursor);
  const q2=await get('/verified-receipt-manual-cases?limit=1&cursor='+encodeURIComponent(q1.data.next_cursor));
  assert.equal(q2.status,200,JSON.stringify(q2.data));
  assert.equal(q2.data.cases.length,1);
  assert.notEqual(q1.data.cases[0].case_id,q2.data.cases[0].case_id);
  assert.deepEqual(new Set([q1.data.cases[0].case_id,q2.data.cases[0].case_id]),new Set([caseId,opened.data.case_id]));
  for (const item of [...q1.data.cases,...q2.data.cases]) {
    assert.ok(['UNRESOLVED_HOLD','PROVIDER_REVIEW','PROVIDER_DISPUTE','PROVIDER_DISPUTE_REVIEWED'].includes(item.case_state));
    assert.match(item.opened_at,/Z$/);
    assert.ok(!Object.hasOwn(item,'payment_ref') && !Object.hasOwn(item,'merchant_id'));
  }
  const path='/verified-receipt-manual-cases/'+opened.data.case_id+'/history';
  assert.equal((await get(path,false)).status,401);
  assert.equal((await get(path+'?merchant_id=other')).status,400);
  assert.equal((await get('/verified-receipt-manual-cases/receipt-case-'+'f'.repeat(64)+'/history')).status,404);
  const h1=await get(path+'?limit=1');
  assert.equal(h1.status,200,JSON.stringify(h1.data));
  assert.deepEqual(h1.data.events.map(e=>e.event_action),['ESCALATE_TO_PROVIDER']);
  assert.ok(h1.data.next_cursor);
  const h2=await get(path+'?limit=1&cursor='+encodeURIComponent(h1.data.next_cursor));
  assert.equal(h2.status,200,JSON.stringify(h2.data));
  assert.deepEqual(h2.data.events.map(e=>e.event_action),['OPEN_HOLD']);
  assert.equal(h2.data.next_cursor,null);
  assert.equal(h1.data.events[0].actor_id,actorId);
  assert.ok(!Object.hasOwn(h1.data.events[0],'device_hash'));
  const auditKinds=(await admin.query(`SELECT reason_code,count(*)::int AS n
    FROM public.database_admin_access_audits WHERE admin_account_id=$1
      AND reason_code IN ('BILLING_MANUAL_CASE_QUEUE_READ','BILLING_MANUAL_CASE_HISTORY_READ')
    GROUP BY reason_code ORDER BY reason_code`,[actorId])).rows;
  assert.deepEqual(auditKinds.map(v=>v.reason_code),['BILLING_MANUAL_CASE_HISTORY_READ','BILLING_MANUAL_CASE_QUEUE_READ']);
  assert.ok(auditKinds.every(v=>v.n>=2));
  console.log('P0_RECEIPT_MANUAL_CASE_AUDITED_QUEUE_HISTORY_PG18_HTTP_PASS');


  assert.equal(await authPostgresSessionAuthority.revokeSession(issued.token,'admin','manual_revocation'),true);
  await sqlstate(operator.query('SELECT public.fawri_escalate_verified_receipt_manual_case($1,$2,$3,$4,$5,$6,$7)',[actorId,sessionId,deviceHash,caseId,'ESCALATE_TO_PROVIDER','revoked-'+randomUUID(),null]),'42501');
  await sqlstate(admin.query('DELETE FROM public.verified_receipt_manual_cases WHERE id=$1',[caseId]),'42501');
  await sqlstate(admin.query('UPDATE public.verified_receipt_manual_case_events SET action=\'OPEN_HOLD\' WHERE case_id=$1',[caseId]),'42501');
  const after=(await admin.query('SELECT (SELECT count(*)::int FROM saas_entitlement_applications)+(SELECT count(*)::int FROM cashier_entitlement_applications) AS n')).rows[0].n;
  assert.equal(after,before,'manual case cannot grant subscriptions');
  assert.equal((await admin.query('SELECT count(*)::int AS n FROM public.verified_receipt_manual_cases WHERE id=$1',[caseId])).rows[0].n,1);
  console.log('P0_RECEIPT_MANUAL_CASE_HELD_PG18_RESTRICTED_LOGIN_PASS');
  console.log('P0_RECEIPT_MANUAL_CASE_HELD_NOT_DEPLOYMENT_AUTHORIZATION');
} finally {
  if(server) await new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve()));
  if(connected) await operator.end();
  await admin.end();
}
