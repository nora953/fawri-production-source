import assert from 'node:assert/strict';
import {randomInt,randomUUID} from 'node:crypto';
import test from 'node:test';
import {assertDisposablePostgres} from '../../../scripts/lib/disposable-postgres-test-guard.mjs';
import {createDisposableKnowledgeRuntime} from './helpers/disposable-knowledge-runtime.mjs';
import {cleanupResources} from './helpers/cleanup-resources.mjs';

await assertDisposablePostgres();
// A green diagnostic records authority facts; it never accepts a privacy defect.
test('classify emergency privacy authority with actual restricted LOGIN and synthetic records',{timeout:120000},async t=>{
  const fixture=await createDisposableKnowledgeRuntime(),admin=fixture.admin,primary=fixture.runtimePool;
  const owner=`emergency-owner-${randomUUID()}`;
  const rows=[0,1].map(()=>{const id=randomUUID();return {merchant:`emergency-merchant-${id}`,assistant:`emergency-admin-${id}`,request:`emergency-request-${id}`,alert:`emergency-alert-${id}`,notice:`emergency-notice-${id}`};});
  const merchants=rows.map(x=>x.merchant),assistants=rows.map(x=>x.assistant),accounts=[owner,...merchants,...assistants];
  const saved=process.env.FAWRI_OPERATIONAL_POSTGRES_AUTHORITY;
  t.after(()=>cleanupResources([
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
  const before=await snapshot();
  const metadata=(await primary.query(`SELECT c.relname AS table_name,c.relrowsecurity AS rls,c.relforcerowsecurity AS force_rls,
    has_table_privilege(current_user,c.oid,'SELECT') AS can_select,
    has_table_privilege(current_user,c.oid,'UPDATE') AS can_update,
    (SELECT count(*)::int FROM pg_policy p WHERE p.polrelid=c.oid) AS policy_count
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relname=ANY($1::text[]) ORDER BY c.relname`,[inventory.map(x=>x.table)])).rows;
  await t.test('measure every emergency table under an actual nonprivileged LOGIN',async()=>{
    assert.deepEqual((await primary.query('SELECT session_user=current_user AS same_login,r.rolsuper,r.rolbypassrls,r.rolcreaterole FROM pg_roles r WHERE r.rolname=session_user')).rows[0],{same_login:true,rolsuper:false,rolbypassrls:false,rolcreaterole:false});
    assert.deepEqual(metadata.map(x=>x.table_name).sort(),inventory.map(x=>x.table).sort());
  });
  const observations=[];
  await t.test('classify SQL read visibility without inferring HTTP or mutation acceptance',async()=>{
    const probe=async(target,item)=>{
      try{const visible=(await target.query(`SELECT ${item.key} AS id FROM ${item.table} WHERE ${item.key}=ANY($1::text[])`,[item.ids])).rows.map(x=>x.id);
        assert.ok(visible.every(id=>item.ids.includes(id)));assert.equal(new Set(visible).size,visible.length);
        return {denied:false,count:visible.length};
      }catch(error){if(error.code!=='42501')throw error;return {denied:true,count:0};}
    };
    for(const item of inventory){
      const unscoped=await probe(primary,item);
      const tenantScoped=await scoped(merchants[0],client=>probe(client,item));
      observations.push({table:item.table,kind:item.kind,unscoped,tenantScoped});
    }
  });
  await t.test('read-only classification preserves both tenants and trusted records exactly',async()=>{
    assert.deepEqual(await snapshot(),before);
  });
  console.log('P0_EMERGENCY_PRIVACY_AUTHORITY_BASELINE '+JSON.stringify({diagnosticOnly:true,actualLogins:1,merchants:2,tables:metadata,observations,mutationAttempted:false,httpAuthorizationTested:false,exactSnapshotRestoration:true,hostedCertified:false,releaseAccepted:false}));
});
