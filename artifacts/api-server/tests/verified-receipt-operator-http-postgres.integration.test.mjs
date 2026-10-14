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
