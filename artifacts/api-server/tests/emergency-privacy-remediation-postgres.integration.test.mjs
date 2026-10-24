import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {randomInt,randomUUID} from 'node:crypto';
import test from 'node:test';
import {assertDisposablePostgres} from '../../../scripts/lib/disposable-postgres-test-guard.mjs';
import {createDisposableKnowledgeRuntime} from './helpers/disposable-knowledge-runtime.mjs';
import {cleanupResources} from './helpers/cleanup-resources.mjs';

await assertDisposablePostgres();
// Strict remediation acceptance is separate from the retained read-only baseline.
test('emergency SQL privacy denies primary authority and preserves trusted merchant notices',{timeout:120000},async t=>{
  const fixture=await createDisposableKnowledgeRuntime(),admin=fixture.admin,primary=fixture.runtimePool;
  const owner=`emergency-owner-${randomUUID()}`;
  const rows=[0,1].map(()=>{const id=randomUUID();return {merchant:`emergency-merchant-${id}`,assistant:`emergency-admin-${id}`,request:`emergency-request-${id}`,alert:`emergency-alert-${id}`,notice:`emergency-notice-${id}`};});
  const merchants=rows.map(x=>x.merchant),assistants=rows.map(x=>x.assistant),accounts=[owner,...merchants,...assistants];
  const saved=process.env.FAWRI_OPERATIONAL_POSTGRES_AUTHORITY;
  t.after(()=>cleanupResources([
    ['synthetic audit records',()=>admin.query('DELETE FROM audit_events WHERE merchant_id=ANY($1::text[])',[merchants])],
    ['synthetic requests',()=>admin.query('DELETE FROM emergency_access_requests WHERE merchant_id=ANY($1::text[])',[merchants])],
    ['synthetic authorizations',()=>admin.query('DELETE FROM emergency_authorizations WHERE admin_account_id=ANY($1::text[])',[assistants])],
    ['synthetic accounts',()=>admin.query('DELETE FROM accounts WHERE id=ANY($1::text[])',[accounts])],
    ['runtime',()=>fixture.dispose()],
    ['environment',async()=>{if(saved===undefined)delete process.env.FAWRI_OPERATIONAL_POSTGRES_AUTHORITY;else process.env.FAWRI_OPERATIONAL_POSTGRES_AUTHORITY=saved;}],
  ]));
  process.env.FAWRI_OPERATIONAL_POSTGRES_AUTHORITY='required';
  const {withMerchantOperationalTransaction:scoped}=await import('../src/services/operationalPostgresAuthority.ts');
  for(const id of accounts)await admin.query("INSERT INTO accounts(id,kind,phone,password_hash,state,phone_verified) VALUES($1,$2,$3,'synthetic','active',true)",[id,merchants.includes(id)?'merchant':'admin',`+196${randomInt(100000000,999999999)}`]);
  for(const r of rows){
    await admin.query("INSERT INTO merchants(id,account_id,owner_name,store_name,activity_type,status,account_status) VALUES($1,$1,'Synthetic','Synthetic','retail','approved','approved')",[r.merchant]);
    await admin.query('INSERT INTO emergency_authorizations(admin_account_id,can_request,granted_by_owner_account_id) VALUES($1,true,$2)',[r.assistant,owner]);
    await admin.query("INSERT INTO emergency_access_requests(id,merchant_id,requested_by_admin_account_id,incident_reference,severity,reason,duration_minutes,status,activation_mode) VALUES($1,$2,$3,'Synthetic incident','high','Synthetic diagnostic',15,'ended','owner_approval')",[r.request,r.merchant,r.assistant]);
    await admin.query("INSERT INTO emergency_owner_alerts(id,request_id,type,title_key) VALUES($1,$2,'synthetic','synthetic')",[r.alert,r.request]);
    await admin.query("INSERT INTO emergency_merchant_notices(id,request_id,merchant_id,incident_reference,activation_mode,started_at,ended_at) VALUES($1,$2,$3,'Synthetic incident','owner_approval',now()-interval '2 minutes',now()-interval '1 minute')",[r.notice,r.request,r.merchant]);
  }
  const inventory=[
    {table:'emergency_authorizations',key:'admin_account_id',ids:assistants,kind:'global_admin_authority'},
    {table:'emergency_access_requests',key:'id',ids:rows.map(x=>x.request),kind:'internal_request'},
    {table:'emergency_owner_alerts',key:'id',ids:rows.map(x=>x.alert),kind:'owner_alert'},
    {table:'emergency_merchant_notices',key:'id',ids:rows.map(x=>x.notice),kind:'merchant_notice'},
  ];
  const snapshot=async()=>{
    const out={};
    for(const item of inventory)out[item.table]=(await admin.query(`SELECT to_jsonb(t) AS row FROM ${item.table} t WHERE ${item.key}=ANY($1::text[]) ORDER BY ${item.key}`,[item.ids])).rows;
    return out;
  };
  const {withAuthenticationTransaction:trusted}=await import('../src/services/authenticationPostgresAuthority.ts');
  const {assertProductionDatabaseRlsReady:ready}=await import('../src/services/postgresRuntimeRlsSecurity.ts');
  const {listEmergencyMerchantNoticesPostgres:listNotices,markEmergencyMerchantNoticeReadPostgres:markRead}=await import('../src/services/postgresEmergencyReadAccessAuthority.ts');
  const env={...process.env,NODE_ENV:'production',FAWRI_OPERATOR_DATABASE_URL:'postgresql://unused@127.0.0.1/fawri_ci'};
  const before=await snapshot();
  let readDenials=0,mutationDenials=0;
  await t.test('all four boundaries are mandatory and the primary LOGIN is nonprivileged',async()=>{
    assert.deepEqual((await primary.query('SELECT session_user=current_user AS same_login,r.rolsuper,r.rolbypassrls,r.rolcreaterole FROM pg_roles r WHERE r.rolname=session_user')).rows[0],{same_login:true,rolsuper:false,rolbypassrls:false,rolcreaterole:false});
    await ready(env);
    for(const item of inventory){
      const m=(await primary.query("SELECT relrowsecurity,(SELECT count(*)::int FROM pg_policy p WHERE p.polrelid=c.oid) AS policies FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname=$1",[item.table])).rows[0];
      assert.deepEqual(m,{relrowsecurity:true,policies:1});
      await admin.query(`ALTER TABLE public.${item.table} DISABLE ROW LEVEL SECURITY`);
      try{await assert.rejects(ready(env),{code:'PRODUCTION_DATABASE_TENANT_RLS_REQUIRED'});}
      finally{await admin.query(`ALTER TABLE public.${item.table} ENABLE ROW LEVEL SECURITY`);}
    }
    await ready(env);
  });
  await t.test('unscoped and either tenant cannot read or mutate internal emergency records',async()=>{
    const contexts=[work=>work(primary),work=>scoped(merchants[0],work),work=>scoped(merchants[1],work)];
    for(const item of inventory){
      for(const run of contexts){
        await run(async client=>{
          assert.equal((await client.query(`SELECT ${item.key} FROM ${item.table} WHERE ${item.key}=ANY($1::text[])`,[item.ids])).rowCount,0);readDenials++;
          assert.equal((await client.query(`UPDATE ${item.table} SET ${item.key}=${item.key} WHERE ${item.key}=ANY($1::text[])`,[item.ids])).rowCount,0);mutationDenials++;
          assert.equal((await client.query(`DELETE FROM ${item.table} WHERE ${item.key}=ANY($1::text[])`,[item.ids])).rowCount,0);mutationDenials++;
        });
        const row={...before[item.table][0].row,[item.key]:`denied-${randomUUID()}`};
        await assert.rejects(run(c=>c.query(`INSERT INTO public.${item.table} SELECT (jsonb_populate_record(NULL::public.${item.table},$1::jsonb)).*`,[JSON.stringify(row)])),{code:'42501'});mutationDenials++;
      }
      assert.equal((await primary.query(`SELECT ${item.key} FROM ${item.table} WHERE ${item.key}=ANY($1::text[])`,[item.ids])).rowCount,0);readDenials++;
    }
    assert.deepEqual(await snapshot(),before);
  });
  await t.test('directory capability alone confers no emergency authority',async()=>{
    await admin.query(`GRANT EXECUTE ON FUNCTION public.fawri_issue_admin_directory_audit(text,text,text) TO ${fixture.role}`);
    try{
      await assert.rejects(ready(env),{code:'PRODUCTION_DATABASE_OPERATOR_AUTHORITY_REACHABLE'});
      for(const item of inventory)await scoped(merchants[0],async c=>{assert.equal((await c.query(`SELECT ${item.key} FROM ${item.table} WHERE ${item.key}=ANY($1::text[])`,[item.ids])).rowCount,0);readDenials++;});
    }finally{await admin.query(`REVOKE EXECUTE ON FUNCTION public.fawri_issue_admin_directory_audit(text,text,text) FROM ${fixture.role}`);}
    await ready(env);
  });
  await t.test('trusted authentication sees both tenants and transactions restore every record on rollback',async()=>{
    const rollback=new Error('synthetic emergency rollback');
    for(const item of inventory)await assert.rejects(trusted(async c=>{
      assert.equal((await c.query(`SELECT ${item.key} FROM ${item.table} WHERE ${item.key}=ANY($1::text[])`,[item.ids])).rowCount,2);
      assert.equal((await c.query(`UPDATE ${item.table} SET ${item.key}=${item.key} WHERE ${item.key}=$1`,[item.ids[0]])).rowCount,1);
      throw rollback;
    }),e=>e===rollback);
    assert.deepEqual(await snapshot(),before);
  });
  await t.test('notice ancestry preflight and trusted writes reject a foreign merchant link',async()=>{
    const migration=await readFile(new URL('../../../lib/db/drizzle/0048_emergency_privacy_authentication_authority.sql',import.meta.url),'utf8');
    const preflight=migration.split('--> statement-breakpoint')[0];
    await admin.query('UPDATE emergency_merchant_notices SET merchant_id=$1 WHERE id=$2',[merchants[1],rows[0].notice]);
    try{await assert.rejects(admin.query(preflight),{code:'23514'});}
    finally{await admin.query('UPDATE emergency_merchant_notices SET merchant_id=$1 WHERE id=$2',[merchants[0],rows[0].notice]);}
    await admin.query(preflight);
    await assert.rejects(trusted(c=>c.query('UPDATE emergency_merchant_notices SET merchant_id=$1 WHERE id=$2',[merchants[1],rows[0].notice])),{code:'42501'});
    mutationDenials++;
    assert.deepEqual(await snapshot(),before);
  });
  await t.test('session-facing notice services retain own reads and deny foreign status changes',async()=>{
    for(const r of rows){
      const listed=await listNotices({merchantId:r.merchant});
      assert.deepEqual(listed.notices.map(x=>x.id),[r.notice]);assert.equal(listed.unread_count,1);
    }
    await assert.rejects(markRead({merchantId:merchants[0],noticeId:rows[1].notice}),{code:'EMERGENCY_MERCHANT_NOTICE_NOT_FOUND'});
    assert.deepEqual(await snapshot(),before);
    const notice=await markRead({merchantId:merchants[0],noticeId:rows[0].notice});assert.ok(notice.read_at);
    assert.equal((await listNotices({merchantId:merchants[0]})).unread_count,0);
    assert.equal((await listNotices({merchantId:merchants[1]})).unread_count,1);
    assert.deepEqual((await snapshot()).emergency_merchant_notices.filter(x=>x.row.id===rows[1].notice),before.emergency_merchant_notices.filter(x=>x.row.id===rows[1].notice));
  });
  console.log('P0_EMERGENCY_PRIVACY_REMEDIATION '+JSON.stringify({tables:4,readDenials,mutationDenials,actualLogins:2,merchants:2,trustedGlobalRollback:true,ownNoticeRead:true,foreignNoticeDenied:true,fullHttpPermissions:'separate unchanged actual-session emergency suite',hostedCertified:false,releaseAccepted:false}));
});
