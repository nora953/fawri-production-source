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
const caseId='receipt-case-'+randomUUID();
const paymentId='payment-'+randomUUID();
const eventId='receipt-'+randomUUID();
const testHash='a'.repeat(64);
let sessionId,deviceHash;
let connected=false;
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
  const identity=(await admin.query('SELECT rolcanlogin,rolsuper,rolbypassrls,rolcreaterole FROM pg_roles WHERE rolname=$1',[caseRole])).rows[0];
  assert.deepEqual(identity,{rolcanlogin:true,rolsuper:false,rolbypassrls:false,rolcreaterole:false});
  await admin.query(`INSERT INTO public.accounts(id,kind,phone,password_hash,state,phone_verified)
    VALUES($1,'admin',$2,'synthetic','active',true),
          ($3,'merchant',$4,'synthetic','active',true)`,[
    actorId,'+1991'+String(Math.floor(Math.random()*100000000)).padStart(8,'0'),
    strangerId,'+1991'+String(Math.floor(Math.random()*100000000)).padStart(8,'0')]);
  await admin.query(`INSERT INTO public.admin_profiles(id,account_id,display_name,role,enabled,must_change_password)
    VALUES($1,$1,'Synthetic','owner_admin',true,false)`,[actorId]);
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
  await sqlstate(operator.query('SELECT * FROM public.fawri_open_unmatched_verified_receipt_case($1,$2,$3,$4,$5)',[strangerId,sessionId,deviceHash,caseId,eventId]),'42501');
  await sqlstate(operator.query('SELECT * FROM public.fawri_open_unmatched_verified_receipt_case($1,$2,$3,$4,$5)',[actorId,sessionId,deviceHash,caseId,'absent-receipt']),'23514');
  const open=(await operator.query('SELECT * FROM public.fawri_open_unmatched_verified_receipt_case($1,$2,$3,$4,$5)',[actorId,sessionId,deviceHash,caseId,eventId])).rows;
  assert.deepEqual(open,[{case_id:caseId,receipt_event_id:eventId,case_state:'UNRESOLVED_HOLD',applied:false}]);
  assert.deepEqual((await operator.query('SELECT * FROM public.fawri_open_unmatched_verified_receipt_case($1,$2,$3,$4,$5)',[actorId,sessionId,deviceHash,caseId,eventId])).rows,open);
  await sqlstate(operator.query('SELECT * FROM public.fawri_open_unmatched_verified_receipt_case($1,$2,$3,$4,$5)',[actorId,sessionId,deviceHash,'different-case',eventId]),'23505');
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
  if(connected) await operator.end();
  await admin.end();
}
