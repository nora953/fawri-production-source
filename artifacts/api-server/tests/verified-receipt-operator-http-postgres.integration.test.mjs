import assert from 'node:assert/strict';
import {randomUUID,randomInt} from 'node:crypto';
import test from 'node:test';
import {assertDisposablePostgres} from '../../../scripts/lib/disposable-postgres-test-guard.mjs';
import {cleanupResources} from './helpers/cleanup-resources.mjs';
await assertDisposablePostgres();
Object.assign(process.env,{
  FAWRI_OPERATIONAL_POSTGRES_AUTHORITY:'required',FAWRI_AUTH_POSTGRES_SESSION_AUTHORITY:'required',
  FAWRI_AUTH_SECURITY_SECRET:'synthetic-receipt-operator-security-secret-at-least-32-characters',
  FAWRI_PASSWORD_SALT:'synthetic-receipt-operator-password-salt',FAWRI_ALLOWED_ORIGINS:'https://operator.example.invalid',
});
const {pool}=await import('@workspace/db');
const {authPostgresSessionAuthority:authority}=await import('../src/services/authPostgresSessionAuthority.ts');
const {registerAdminDeviceAuthoritative,setAdminDeviceTrustAuthoritative}=await import('../src/services/postgresAdminSecurityAuthority.ts');
const {default:router}=await import('../src/routes/auth-verified-receipts-postgres-routes.ts');
const {enforceAuthOrigin}=await import('../src/middleware/authSession.ts');
const capability='public.fawri_read_verified_payment_receipts(text,integer,timestamptz,text,text,text)';
const readSql='SELECT * FROM public.fawri_read_verified_payment_receipts($1,$2,$3,$4,$5,$6)';

test('real HTTP receipt directory requires trusted admin permission and durable audit under restricted RLS',async t=>{
  const ids=[],events=[],role=`receipt_http_${randomUUID().replaceAll('-','')}`;
  let admin,server,roleCreated=false,faultName;
  const originalOptions=pool.options.options;
  t.after(async()=>cleanupResources([
    ['HTTP server',()=>server?new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve())):undefined],
    ['audit fault',async()=>{if(faultName){await admin.query(`DROP TRIGGER IF EXISTS ${faultName} ON database_admin_access_audits`);await admin.query(`DROP FUNCTION IF EXISTS ${faultName}()`);}}],
    ['owned receipts',()=>admin?.query('DELETE FROM verified_provider_payment_receipts WHERE provider_event_id=ANY($1::text[])',[events])],
    ['owned read audits',()=>admin?.query('DELETE FROM database_admin_access_audits WHERE admin_account_id=ANY($1::text[])',[ids])],
    ['owned devices',()=>admin?.query('DELETE FROM trusted_devices WHERE account_id=ANY($1::text[])',[ids])],
    ['owned accounts',()=>admin?.query('DELETE FROM accounts WHERE id=ANY($1::text[])',[ids])],
    ['role grants',()=>roleCreated?admin.query(`DROP OWNED BY ${role}`):undefined],
    ['role',()=>roleCreated?admin.query(`DROP ROLE ${role}`):undefined],
    ['owner connection',()=>{pool.options.options=originalOptions;admin?.release();}],
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
  for(let i=1;i<=3;i++){
    const event=`operator-event-${randomUUID()}`;events.push(event);
    const payment=`synthetic-payment-${randomUUID()}`,request=`synthetic-request-${randomUUID()}`;references.push(payment,request);
    await admin.query("INSERT INTO verified_provider_payment_receipts VALUES('superqi_sandbox',$1,$2,$3,'payment_succeeded',3900,$4,$5)",[event,payment,request,'c'.repeat(64),`2026-10-14T12:00:00.12300${i}Z`]);
  }
  const receiptSnapshot=async()=>(await admin.query('SELECT * FROM verified_provider_payment_receipts WHERE provider_event_id=ANY($1::text[]) ORDER BY provider_event_id',[events])).rows;
  const originalReceipts=await receiptSnapshot();
  const entitlementCount=async()=>(await admin.query('SELECT (SELECT count(*) FROM saas_entitlement_applications)+(SELECT count(*) FROM cashier_entitlement_applications) AS n')).rows[0].n;
  const originalEntitlements=await entitlementCount();
  pool.options.options=`-c role=${role}`;
  const identity=(await pool.query("SELECT current_user AS role,rolsuper,rolbypassrls,EXISTS(SELECT 1 FROM pg_class WHERE relnamespace='public'::regnamespace AND relowner=r.oid) AS owns_table FROM pg_roles r WHERE rolname=current_user")).rows[0];
  assert.deepEqual(identity,{role,rolsuper:false,rolbypassrls:false,owns_table:false});
  assert.equal((await pool.query('SELECT * FROM verified_provider_payment_receipts')).rows.length,0);
  await assert.rejects(()=>pool.query(readSql,[owner.id,2,null,null,randomUUID(),'a'.repeat(64)]),error=>error.code==='42501');
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
  async function request(actor,suffix='',headers={}) {
    const response=await fetch(base+suffix,{headers:{...(actor?{Cookie:`fawri_admin_session_v2=${actor.session.token}`,'X-Fawri-Device-Id':actor.device}:{}),...headers}});
    return {response,body:await response.json()};
  }
  const audits=async()=>(await admin.query("SELECT id,admin_account_id,reason_code,request_hash FROM database_admin_access_audits WHERE admin_account_id=ANY($1::text[]) AND reason_code='BILLING_VERIFIED_RECEIPTS_READ' ORDER BY started_at,id",[ids])).rows;
  await t.test('anonymous, forged, wrong-device, merchant and unpermitted assistant cannot disclose rows',async()=>{
    assert.equal((await request()).response.status,401);
    assert.equal((await request(owner,'',{'X-Fawri-Device-Id':'wrong-device'})).response.status,401);
    assert.equal((await request(owner,'',{Cookie:'fawri_admin_session_v2=forged'})).response.status,401);
    assert.equal((await request(merchant)).response.status,401);
    assert.equal((await request(denied)).response.status,403);
    assert.equal((await audits()).length,0);
  });
  await t.test('owner pagination preserves microsecond cursors, redacts sensitive fields and audits each page',async()=>{
    const first=await request(owner,'?limit=2');assert.equal(first.response.status,200);assert.match(first.response.headers.get('cache-control'),/no-store/);
    assert.equal(first.body.receipts.length,2);assert.ok(first.body.next_cursor);
    assert.equal(first.body.receipts[0].first_received_at,'2026-10-14T12:00:00.123003Z');
    const next=await request(owner,`?limit=2&cursor=${first.body.next_cursor}`);assert.equal(next.response.status,200);
    assert.equal(next.body.receipts.length,1);assert.equal(next.body.next_cursor,null);
    assert.equal(next.body.receipts[0].first_received_at,'2026-10-14T12:00:00.123001Z');
    assert.deepEqual([...first.body.receipts,...next.body.receipts].map(row=>row.provider_event_id).sort(),[...events].sort());
    const encoded=JSON.stringify([first.body,next.body]);
    for(const value of [...references,...[owner,finance,denied,merchant].map(x=>x.session.token),'c'.repeat(64)])assert.equal(encoded.includes(value),false);
    for(const field of ['payload_hash','payment_ref','request_ref','signature','merchant_id'])assert.ok([...first.body.receipts,...next.body.receipts].every(row=>!Object.hasOwn(row,field)));
    const rows=await audits();assert.equal(rows.length,2);assert.ok(rows.every(row=>row.admin_account_id===owner.id&&/^[a-f0-9]{64}$/.test(row.request_hash)));
  });
  await t.test('finance assistant can read; unknown actor input and malformed bounds/cursors fail before audit',async()=>{
    const result=await request(finance,'?limit=1');assert.equal(result.response.status,200);
    const before=(await audits()).length;
    for(const suffix of ['?limit=0','?limit=51','?limit=1&limit=2','?cursor=not-json',`?actor_account_id=${owner.id}`])assert.equal((await request(finance,suffix)).response.status,400);
    assert.equal((await audits()).length,before);
  });
  await t.test('database authorization recheck denies disabled or unpermitted actors and revoked HTTP permission',async()=>{
    const before=(await audits()).length;
    await assert.rejects(()=>pool.query(readSql,[denied.id,2,null,null,randomUUID(),'a'.repeat(64)]),error=>error.code==='42501');
    await admin.query('UPDATE admin_profiles SET enabled=false WHERE id=$1',[owner.id]);
    await assert.rejects(()=>pool.query(readSql,[owner.id,2,null,null,randomUUID(),'a'.repeat(64)]),error=>error.code==='42501');
    await admin.query('UPDATE admin_profiles SET enabled=true WHERE id=$1',[owner.id]);
    await admin.query("DELETE FROM admin_permissions WHERE admin_id=$1 AND permission='manage_subscriptions'",[finance.id]);
    assert.ok([401,403].includes((await request(finance)).response.status));
    await assert.rejects(()=>pool.query(readSql,[finance.id,2,null,null,randomUUID(),'a'.repeat(64)]),error=>error.code==='42501');
    assert.equal((await audits()).length,before);
  });
  for(const forced of [null,'verified_provider_payment_receipts'])await t.test(`audited directory restricted capability owner; FORCE RLS on ${forced||'none'}`,async()=>{
    const capabilityOwner=`directory_owner_${randomUUID().replaceAll('-','')}`;
    const tables=['accounts','admin_profiles','admin_permissions','database_admin_access_audits','verified_provider_payment_receipts'];
    const catalogSql="SELECT c.relname,c.relowner,c.relrowsecurity,c.relforcerowsecurity FROM pg_class c WHERE c.relnamespace='public'::regnamespace AND c.relname=ANY($1::text[]) ORDER BY c.relname";
    const originalCatalog=(await admin.query(catalogSql,[tables])).rows;
    const originalFunction=(await admin.query('SELECT proowner,prosecdef,proconfig FROM pg_proc WHERE oid=$1::regprocedure',[capability])).rows;
    const originalPrincipal=(await admin.query('SELECT current_user,session_user')).rows;
    const beforeAudits=await audits(),auditId=randomUUID();
    try{
      await admin.query('BEGIN');
      await admin.query(`CREATE ROLE ${capabilityOwner} NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS`);
      await admin.query(`GRANT USAGE ON SCHEMA public TO ${capabilityOwner}`);
      for(const table of tables)await admin.query(`ALTER TABLE public.${table} OWNER TO ${capabilityOwner}`);
      // Only the receipt dependency's FORCE flag is varied. Actor/audit table
      // RLS flags stay exactly as committed by the migrations.
      await admin.query(`ALTER TABLE public.verified_provider_payment_receipts ${forced?'FORCE':'NO FORCE'} ROW LEVEL SECURITY`);
      await admin.query(`ALTER FUNCTION ${capability} OWNER TO ${capabilityOwner}`);
      const flags=(await admin.query('SELECT rolsuper,rolbypassrls FROM pg_roles WHERE rolname=$1',[capabilityOwner])).rows[0];
      assert.deepEqual(flags,{rolsuper:false,rolbypassrls:false});
      const protectedCatalog=(await admin.query(catalogSql,[tables])).rows;
      assert.equal(new Set(protectedCatalog.map(row=>row.relowner)).size,1);
      for(const row of protectedCatalog){
        const original=originalCatalog.find(table=>table.relname===row.relname);
        assert.equal(row.relrowsecurity,original.relrowsecurity);
        assert.equal(row.relforcerowsecurity,row.relname==='verified_provider_payment_receipts'?Boolean(forced):original.relforcerowsecurity);
      }
      assert.equal(protectedCatalog.find(row=>row.relname==='verified_provider_payment_receipts').relrowsecurity,true);
      const functionOwner=(await admin.query('SELECT proowner,prosecdef,proconfig FROM pg_proc WHERE oid=$1::regprocedure',[capability])).rows[0];
      assert.deepEqual(functionOwner,{proowner:protectedCatalog[0].relowner,prosecdef:true,proconfig:['search_path=pg_catalog','row_security=off']});
      await admin.query(`SET LOCAL ROLE ${role}`);
      assert.equal((await admin.query('SELECT current_user AS role')).rows[0].role,role);
      assert.equal((await admin.query('SELECT * FROM verified_provider_payment_receipts')).rows.length,0);
      await admin.query('SAVEPOINT expected_denial');
      if(forced){
        await assert.rejects(()=>admin.query(readSql,[owner.id,3,null,null,auditId,'a'.repeat(64)]),error=>error.code==='42501');
        await admin.query('ROLLBACK TO SAVEPOINT expected_denial');
      }else{
        await assert.rejects(()=>admin.query(readSql,[denied.id,3,null,null,randomUUID(),'a'.repeat(64)]),error=>error.code==='42501');
        await admin.query('ROLLBACK TO SAVEPOINT expected_denial');
        const result=(await admin.query(readSql,[owner.id,3,null,null,auditId,'a'.repeat(64)])).rows;
        assert.deepEqual(result.map(row=>row.provider_event_id).sort(),[...events].sort());
        for(const row of result)assert.deepEqual(Object.keys(row).sort(),['provider','provider_event_id','event_type','amount_iqd','first_received_at','payment_ref_suffix','request_ref_suffix'].sort());
        for(const value of [...references,'c'.repeat(64)])assert.equal(JSON.stringify(result).includes(value),false);
        assert.equal((await admin.query('SELECT * FROM verified_provider_payment_receipts')).rows.length,0);
      }
      await admin.query('RESET ROLE');
      const ownAudit=(await admin.query('SELECT admin_account_id,reason_code,request_hash FROM database_admin_access_audits WHERE id=$1',[auditId])).rows;
      assert.deepEqual(ownAudit,forced?[]:[{admin_account_id:owner.id,reason_code:'BILLING_VERIFIED_RECEIPTS_READ',request_hash:'a'.repeat(64)}]);
      assert.deepEqual(await receiptSnapshot(),originalReceipts,'receipt fields cannot change before owner-fixture rollback');
      assert.equal(await entitlementCount(),originalEntitlements,'read capability cannot grant even before rollback');
    }finally{await admin.query('ROLLBACK');}
    assert.deepEqual((await admin.query('SELECT current_user,session_user')).rows,originalPrincipal);
    assert.deepEqual((await admin.query(catalogSql,[tables])).rows,originalCatalog);
    assert.deepEqual((await admin.query('SELECT proowner,prosecdef,proconfig FROM pg_proc WHERE oid=$1::regprocedure',[capability])).rows,originalFunction);
    assert.deepEqual(await audits(),beforeAudits);assert.deepEqual(await receiptSnapshot(),originalReceipts);
    assert.equal(await entitlementCount(),originalEntitlements);
    assert.equal((await admin.query('SELECT count(*)::int n FROM pg_roles WHERE rolname=$1',[capabilityOwner])).rows[0].n,0);
    console.log('DIRECTORY_OWNER_RLS_PROOF '+JSON.stringify({forced,restrictedOwner:true,expectedSqlstate:forced?'42501':null,auditRequired:true,noReceiptMutation:true,preRollbackDomainUnchanged:true,rollbackRestored:true}));
  });
  await t.test('equal-microsecond keyset pages retain every original receipt during a new head insertion',async()=>{
    const added=[],prefix=`tie-event-${randomUUID()}`;
    try{
      for(let i=1;i<=4;i++){
        const event=`${prefix}-${i}`;added.push(event);events.push(event);
        await admin.query("INSERT INTO verified_provider_payment_receipts VALUES('superqi_sandbox',$1,$2,$3,'payment_succeeded',3900,$4,$5)",[event,`synthetic-tie-payment-${i}`,`synthetic-tie-request-${i}`,'d'.repeat(64),'2026-10-14T13:00:00.222222Z']);
      }
      const expected=(await admin.query('SELECT provider_event_id FROM verified_provider_payment_receipts WHERE provider_event_id=ANY($1::text[]) ORDER BY first_received_at DESC,provider_event_id DESC',[events])).rows.map(row=>row.provider_event_id);
      const first=await request(owner,'?limit=2');assert.equal(first.response.status,200);assert.equal(first.body.receipts.length,2);assert.ok(first.body.next_cursor);
      assert.ok(first.body.receipts.every(row=>row.first_received_at==='2026-10-14T13:00:00.222222Z'));
      const late=`head-event-${randomUUID()}`;added.push(late);events.push(late);
      await admin.query("INSERT INTO verified_provider_payment_receipts VALUES('superqi_sandbox',$1,'synthetic-new-payment','synthetic-new-request','payment_succeeded',3900,$2,$3)",[late,'e'.repeat(64),'2026-10-14T14:00:00.333333Z']);
      const seen=first.body.receipts.map(row=>row.provider_event_id);let cursor=first.body.next_cursor,pages=1;
      while(cursor){assert.ok(pages<8,'pagination must terminate');const page=await request(owner,`?limit=2&cursor=${cursor}`);assert.equal(page.response.status,200);seen.push(...page.body.receipts.map(row=>row.provider_event_id));cursor=page.body.next_cursor;pages++;}
      assert.deepEqual(seen,expected);assert.equal(new Set(seen).size,expected.length);assert.equal(seen.includes(late),false);
      const refreshed=await request(owner,'?limit=1');assert.equal(refreshed.response.status,200);assert.equal(refreshed.body.receipts[0].provider_event_id,late);
      console.log('VERIFIED_RECEIPT_DISCOVERY_PROOF '+JSON.stringify({restrictedRole:true,equalMicrosecondTieRows:4,concurrentHeadInsert:true,originalRowsOnce:seen.length,newHeadRequiresFreshBrowse:true,cursorChainTerminates:true}));
    }finally{
      await admin.query('DELETE FROM verified_provider_payment_receipts WHERE provider_event_id=ANY($1::text[])',[added]);
      for(const id of added){const index=events.indexOf(id);if(index!==-1)events.splice(index,1);}
    }
  });
  await t.test('restricted role cannot rewrite delete or insert inbox evidence through direct table access',async()=>{
    const before=await receiptSnapshot(),auditBefore=(await audits()).length,client=await pool.connect();
    try{
      for(const tenant of ['',owner.id,merchant.id]){
        await client.query('BEGIN');
        try{
          await client.query("SELECT set_config('fawri.tenant_id',$1,true)",[tenant]);
          assert.equal((await client.query('SELECT * FROM verified_provider_payment_receipts WHERE provider_event_id=ANY($1::text[])',[events])).rows.length,0);
          assert.equal((await client.query("UPDATE verified_provider_payment_receipts SET payload_hash=$2 WHERE provider_event_id=ANY($1::text[])",[events,'f'.repeat(64)])).rowCount,0);
          assert.equal((await client.query('DELETE FROM verified_provider_payment_receipts WHERE provider_event_id=ANY($1::text[])',[events])).rowCount,0);
        }finally{await client.query('ROLLBACK');}
      }
      await assert.rejects(()=>client.query("INSERT INTO verified_provider_payment_receipts VALUES('superqi_sandbox',$1,'synthetic-forged-payment','synthetic-forged-request','payment_succeeded',3900,$2,now())",[`blocked-${randomUUID()}`,'f'.repeat(64)]),error=>error.code==='42501');
      assert.equal((await client.query("SELECT has_function_privilege(current_user,'public.fawri_admit_verified_payment_receipt(text,text,text,text,integer,text,timestamptz)','EXECUTE') AS allowed")).rows[0].allowed,false);
      assert.equal((await client.query("SELECT NULLIF(current_setting('fawri.tenant_id',true),'') AS tenant")).rows[0].tenant,null);
    }finally{client.release();}
    assert.deepEqual(await receiptSnapshot(),before);assert.equal((await audits()).length,auditBefore);assert.equal(await entitlementCount(),originalEntitlements);
    console.log('VERIFIED_RECEIPT_RETENTION_BOUNDARY_PROOF '+JSON.stringify({restrictedRole:true,tenantContexts:3,directUpdateRows:0,directDeleteRows:0,directInsertDenied:true,admissionCapabilityDenied:true,allReceiptFieldsUnchanged:true,entitlementGrants:0,contextReset:true}));
  });
  await t.test('deferred audit COMMIT failure with prepared receipt rows never discloses an HTTP result',async()=>{
    const before=(await audits()).length,receiptBefore=await receiptSnapshot();faultName=`operator_deferred_${randomUUID().replaceAll('-','')}`;
    try{
      await admin.query(`CREATE FUNCTION ${faultName}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.reason_code='BILLING_VERIFIED_RECEIPTS_READ' AND NEW.admin_account_id=TG_ARGV[0] THEN RAISE EXCEPTION 'synthetic deferred audit commit failure' USING ERRCODE='P0001'; END IF; RETURN NEW; END $$`);
      await admin.query(`CREATE CONSTRAINT TRIGGER ${faultName} AFTER INSERT ON database_admin_access_audits DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION ${faultName}('${owner.id}')`);
      // Prove the deferred fault occurs after the function can prepare rows:
      // an explicit transaction sees them, then its real COMMIT is rejected.
      const client=await pool.connect();
      try{
        await client.query('BEGIN');
        assert.equal((await client.query(readSql,[owner.id,2,null,null,randomUUID(),'a'.repeat(64)])).rows.length,2);
        await assert.rejects(()=>client.query('COMMIT'),error=>error.code==='P0001');
      }finally{await client.query('ROLLBACK');client.release();}
      assert.equal((await audits()).length,before);
      const result=await request(owner,'?limit=2');assert.equal(result.response.status,503);assert.equal(result.body.receipts,undefined);assert.equal(result.body.next_cursor,undefined);
      const encoded=JSON.stringify(result.body);for(const value of [...events,...references,'synthetic deferred audit commit failure','P0001'])assert.equal(encoded.includes(value),false);
      assert.equal((await audits()).length,before);assert.deepEqual(await receiptSnapshot(),receiptBefore);assert.equal(await entitlementCount(),originalEntitlements);
      console.log('VERIFIED_RECEIPT_DEFERRED_AUDIT_PROOF '+JSON.stringify({restrictedRole:true,realHttp:true,deferredConstraintTrigger:true,nativeRowsBeforeCommit:2,commitRejected:true,httpStatus:503,receiptResponse:false,auditRowsCommitted:0,receiptFieldsUnchanged:true,entitlementGrants:0}));
    }finally{
      await admin.query(`DROP TRIGGER IF EXISTS ${faultName} ON database_admin_access_audits`);await admin.query(`DROP FUNCTION IF EXISTS ${faultName}()`);faultName=undefined;
    }
  });
  await t.test('failed durable audit returns503 and no receipt response; reading does not mutate payment or grant entitlement',async()=>{
    const before=(await audits()).length;faultName=`operator_audit_${randomUUID().replaceAll('-','')}`;
    await admin.query(`CREATE FUNCTION ${faultName}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.reason_code='BILLING_VERIFIED_RECEIPTS_READ' AND NEW.admin_account_id=TG_ARGV[0] THEN RAISE EXCEPTION 'synthetic audit write failure' USING ERRCODE='P0001'; END IF; RETURN NEW; END $$`);
    await admin.query(`CREATE TRIGGER ${faultName} BEFORE INSERT ON database_admin_access_audits FOR EACH ROW EXECUTE FUNCTION ${faultName}('${owner.id}')`);
    const result=await request(owner);assert.equal(result.response.status,503);assert.equal(result.body.receipts,undefined);
    assert.equal((await audits()).length,before);
    assert.equal((await admin.query('SELECT count(*)::int AS n FROM verified_provider_payment_receipts WHERE provider_event_id=ANY($1::text[])',[events])).rows[0].n,3);
    assert.equal((await admin.query('SELECT count(*)::int AS n FROM saas_entitlement_applications WHERE merchant_id=ANY($1::text[])',[ids])).rows[0].n,0);
    assert.equal((await admin.query('SELECT count(*)::int AS n FROM cashier_entitlement_applications WHERE merchant_id=ANY($1::text[])',[ids])).rows[0].n,0);
    assert.deepEqual(await receiptSnapshot(),originalReceipts,'read path must retain every receipt field');
    assert.equal(await entitlementCount(),originalEntitlements,'read path cannot add any entitlement');
    assert.equal((await pool.query('SELECT * FROM verified_provider_payment_receipts')).rows.length,0);
    console.log('VERIFIED_RECEIPT_OPERATOR_HTTP_PROOF '+JSON.stringify({restrictedRole:true,roleOwnsTable:false,realSessionMiddleware:true,permissionDenials:true,redactedPagination:true,microsecondCursor:true,durableAuditRequired:true,entitlementGrants:0}));
  });
});
