import assert from 'node:assert/strict';
import {randomInt,randomUUID} from 'node:crypto';
import test from 'node:test';
import {assertDisposablePostgres} from '../../../scripts/lib/disposable-postgres-test-guard.mjs';
import {createDisposableKnowledgeRuntime} from './helpers/disposable-knowledge-runtime.mjs';
import {cleanupResources} from './helpers/cleanup-resources.mjs';

await assertDisposablePostgres();
const tables=['audit_events','manual_reply_requests','merchant_admin_notes','merchant_channel_overrides','merchant_deletion_requests','notifications','order_drafts','processed_channel_events'];
// Diagnostic only: fixture grants are deliberately documented, not a hosted ACL plan.
// Green execution establishes observations; it does not accept foreign visibility.
test('classify residual merchant privacy authority with actual LOGIN and rollback',{timeout:120000},async t=>{
  const fixture=await createDisposableKnowledgeRuntime(),admin=fixture.admin,primary=fixture.runtimePool;
  const rows=[0,1].map(()=>{const id=randomUUID();return {merchant:`residual-${id}`,channel:`residual-channel-${id}`,conversation:`residual-conversation-${id}`,row:`residual-row-${id}`};});
  const merchants=rows.map(r=>r.merchant),saved=process.env.FAWRI_OPERATIONAL_POSTGRES_AUTHORITY;
  t.after(()=>cleanupResources([
    ...tables.map(table=>[table,()=>admin.query(`DELETE FROM ${table} WHERE merchant_id=ANY($1::text[])`,[merchants])]),
    ['conversations',()=>admin.query('DELETE FROM conversations WHERE merchant_id=ANY($1::text[])',[merchants])],
    ['channels',()=>admin.query('DELETE FROM merchant_channels WHERE merchant_id=ANY($1::text[])',[merchants])],
    ['accounts',()=>admin.query('DELETE FROM accounts WHERE id=ANY($1::text[])',[merchants])],
    ['runtime',()=>fixture.dispose()],
    ['environment',()=>{if(saved===undefined)delete process.env.FAWRI_OPERATIONAL_POSTGRES_AUTHORITY;else process.env.FAWRI_OPERATIONAL_POSTGRES_AUTHORITY=saved;}],
  ]));
  process.env.FAWRI_OPERATIONAL_POSTGRES_AUTHORITY='required';
  const {withMerchantOperationalTransaction:scoped}=await import('../src/services/operationalPostgresAuthority.ts');
  const {withAuthenticationTransaction:trusted}=await import('../src/services/authenticationPostgresAuthority.ts');
  for(const r of rows){
    await admin.query("INSERT INTO accounts(id,kind,phone,password_hash,state,phone_verified) VALUES($1,'merchant',$2,'synthetic','active',true)",[r.merchant,`+197${randomInt(100000000,999999999)}`]);
    await admin.query("INSERT INTO merchants(id,account_id,owner_name,store_name,activity_type,status,account_status) VALUES($1,$1,'Synthetic','Synthetic','retail','approved','approved')",[r.merchant]);
    await admin.query("INSERT INTO merchant_channels(id,merchant_id,platform,status) VALUES($1,$2,'messenger','connected')",[r.channel,r.merchant]);
    await admin.query("INSERT INTO conversations(id,merchant_id,channel_id,customer_external_id) VALUES($1,$2,$3,'synthetic-customer')",[r.conversation,r.merchant,r.channel]);
    await admin.query("INSERT INTO audit_events(id,actor_kind,action_type,merchant_id,details) VALUES($1,'system','synthetic',$2,'Synthetic private audit')",[r.row,r.merchant]);
    await admin.query("INSERT INTO manual_reply_requests(id,merchant_id,conversation_id,idempotency_key,text_sha256) VALUES($1,$2,$3,$1,$4)",[r.row,r.merchant,r.conversation,'a'.repeat(64)]);
    await admin.query("INSERT INTO merchant_admin_notes(merchant_id,note) VALUES($1,'Synthetic private note')",[r.merchant]);
    await admin.query("INSERT INTO merchant_channel_overrides(merchant_id,platform,status) VALUES($1,'messenger','connected')",[r.merchant]);
    await admin.query("INSERT INTO merchant_deletion_requests(id,merchant_id,merchant_id_snapshot,merchant_name_snapshot,merchant_phone_snapshot,requested_by_admin_id_snapshot,requested_by_admin_name_snapshot,requested_by_admin_phone_snapshot,reason,details) VALUES($1,$2,$2,'Synthetic','Synthetic','synthetic-admin','Synthetic','Synthetic','policy_violation','Synthetic private deletion note')",[r.row,r.merchant]);
    await admin.query("INSERT INTO notifications(id,audience,merchant_id,type,title_key,body_key) VALUES($1,'merchant',$2,'synthetic','synthetic.title','synthetic.body')",[r.row,r.merchant]);
    await admin.query("INSERT INTO order_drafts(id,merchant_id,conversation_id,customer_external_id,awaiting_field,expires_at) VALUES($1,$2,$3,'synthetic-customer','synthetic',now()+interval '1 hour')",[r.row,r.merchant,r.conversation]);
    await admin.query("INSERT INTO processed_channel_events(id,merchant_id,channel_id,external_event_id,event_type,payload_hash,processing_status) VALUES($1,$2,$3,$1,'synthetic',$4,'received')",[r.row,r.merchant,r.channel,'b'.repeat(64)]);
  }
  const snapshot=async()=>Object.fromEntries(await Promise.all(tables.map(async table=>[table,(await admin.query(`SELECT to_jsonb(t) AS row FROM ${table} t WHERE merchant_id=ANY($1::text[]) ORDER BY merchant_id`,[merchants])).rows])));
  const before=await snapshot();
  for(const table of tables)assert.equal(before[table].length,2,`synthetic seed missing: ${table}`);
  const metadata=(await primary.query(`SELECT c.relname AS table_name,c.relrowsecurity AS rls,c.relforcerowsecurity AS force_rls,
    has_table_privilege(current_user,c.oid,'SELECT') AS can_select,has_table_privilege(current_user,c.oid,'UPDATE') AS can_update,
    (SELECT count(*)::int FROM pg_policy p WHERE p.polrelid=c.oid) AS policies
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname=ANY($1::text[]) ORDER BY c.relname`,[tables])).rows;
  await t.test('attest actual unprivileged primary LOGIN and complete table catalog',async()=>{
    assert.deepEqual((await primary.query('SELECT session_user=current_user AS same_login,r.rolcanlogin,r.rolsuper,r.rolbypassrls,r.rolcreaterole FROM pg_roles r WHERE r.rolname=session_user')).rows[0],{same_login:true,rolcanlogin:true,rolsuper:false,rolbypassrls:false,rolcreaterole:false});
    assert.deepEqual(metadata.map(r=>r.table_name),tables);
  });
  const observations=[];
  const read=async(query)=>{try{const result=await query();assert.ok(result.rows.every(r=>merchants.includes(r.merchant_id)));return {denied:false,ownRows:result.rows.filter(r=>r.merchant_id===merchants[0]).length,foreignRows:result.rows.filter(r=>r.merchant_id===merchants[1]).length};}catch(error){if(error.code!=='42501')throw error;return {denied:true,ownRows:0,foreignRows:0};}};
  await t.test('classify unscoped and genuine merchant-scoped reads without changing records',async()=>{
    for(const table of tables){
      const sql=`SELECT merchant_id,to_jsonb(t) AS private_record FROM ${table} t WHERE merchant_id=ANY($1::text[])`;
      const unscoped=await read(()=>primary.query(sql,[merchants]));
      const tenantScoped=await read(()=>scoped(merchants[0],c=>c.query(sql,[merchants])));
      const global=await read(()=>trusted(c=>c.query(sql,[merchants])));
      assert.equal(global.denied,false);assert.equal(global.ownRows,1);assert.equal(global.foreignRows,1);
      observations.push({table,unscoped,tenantScoped,trustedGlobal:global});
    }
    assert.deepEqual(await snapshot(),before);
  });
  await t.test('classify foreign no-op writes with forced rollback and exact restoration',async()=>{
    for(const item of observations){
      const stop=new Error('owned diagnostic rollback');let affected;
      try{await scoped(merchants[0],async c=>{affected=(await c.query(`UPDATE ${item.table} SET merchant_id=merchant_id WHERE merchant_id=$1`,[merchants[1]])).rowCount;throw stop;});assert.fail('diagnostic transaction must roll back');}
      catch(error){if(error===stop)item.foreignUpdate={denied:false,rows:affected};else if(error.code==='42501')item.foreignUpdate={denied:true,rows:0};else throw error;}
    }
    assert.deepEqual(await snapshot(),before);
    assert.deepEqual((await primary.query('SELECT public.fawri_tenant_or_audited_admin($1) AS a,public.fawri_tenant_or_audited_admin($2) AS b',merchants)).rows[0],{a:false,b:false});
  });
  console.log('P0_RESIDUAL_MERCHANT_PRIVACY_BASELINE '+JSON.stringify({diagnosticOnly:true,fixturePrimaryTableCrud:true,actualRestrictedPrimaryLogin:true,merchants:2,tables:metadata,observations,exactRollbackRestoration:true,pooledScopeReset:true,httpAuthorizationTested:false,hostedPrivilegePlanCertified:false,privacyAccepted:false,releaseAccepted:false}));
});
