import assert from 'node:assert/strict';
import {randomInt,randomUUID} from 'node:crypto';
import test from 'node:test';
import {assertDisposablePostgres} from '../../../scripts/lib/disposable-postgres-test-guard.mjs';
import {createDisposableKnowledgeRuntime} from '../../../artifacts/api-server/tests/helpers/disposable-knowledge-runtime.mjs';
import {cleanupResources} from '../../../artifacts/api-server/tests/helpers/cleanup-resources.mjs';

await assertDisposablePostgres();
// Diagnostic only: no HTTP authorization or hosted acceptance is inferred.
test('reconcile Support and emergency privacy authority in an owned runtime',{timeout:120000},async t=>{
  const fixture=await createDisposableKnowledgeRuntime();
  const admin=fixture.admin,primary=fixture.runtimePool;
  const merchants=[`privacy-a-${randomUUID()}`,`privacy-b-${randomUUID()}`];
  const tickets=merchants.map(id=>`ticket-${id}`);
  const saved=process.env.FAWRI_OPERATIONAL_POSTGRES_AUTHORITY;
  t.after(()=>cleanupResources([
    ['synthetic tickets',()=>admin.query('DELETE FROM support_tickets WHERE id=ANY($1::text[])',[tickets])],
    ['synthetic accounts',()=>admin.query('DELETE FROM accounts WHERE id=ANY($1::text[])',[merchants])],
    ['runtime',()=>fixture.dispose()],
    ['environment',async()=>{if(saved===undefined)delete process.env.FAWRI_OPERATIONAL_POSTGRES_AUTHORITY;else process.env.FAWRI_OPERATIONAL_POSTGRES_AUTHORITY=saved;}],
  ]));
  process.env.FAWRI_OPERATIONAL_POSTGRES_AUTHORITY='required';
  const {withMerchantOperationalTransaction}=await import('../../../artifacts/api-server/src/services/operationalPostgresAuthority.ts');
  const tables=['support_tickets','support_messages','support_attachments','support_inspection_requests','support_preview_sessions','emergency_access_requests','emergency_authorizations','emergency_merchant_notices','emergency_owner_alerts'];
  const facts=(await primary.query(`SELECT c.relname AS table_name,c.relrowsecurity AS rls,c.relforcerowsecurity AS force_rls,
    has_table_privilege(current_user,c.oid,'SELECT') AS can_select,
    has_table_privilege(current_user,c.oid,'UPDATE') AS can_update,
    (SELECT count(*)::int FROM pg_catalog.pg_policy p WHERE p.polrelid=c.oid) AS policy_count
    FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relname=ANY($1::text[]) ORDER BY c.relname`,[tables])).rows;
  await t.test('actual restricted LOGIN sees complete effective catalog facts',async()=>{
    assert.deepEqual((await primary.query(`SELECT session_user=current_user AS same_login,r.rolsuper,r.rolbypassrls,r.rolcreaterole
      FROM pg_catalog.pg_roles r WHERE r.rolname=session_user`)).rows[0],{same_login:true,rolsuper:false,rolbypassrls:false,rolcreaterole:false});
    assert.deepEqual(facts.map(x=>x.table_name).sort(),[...tables].sort());
  });
  for(let i=0;i<merchants.length;i++){
    await admin.query("INSERT INTO accounts(id,kind,phone,password_hash,state,phone_verified) VALUES($1,'merchant',$2,'synthetic','active',true)",[merchants[i],`+196${randomInt(100000000,999999999)}`]);
    await admin.query("INSERT INTO merchants(id,account_id,owner_name,store_name,activity_type,status,account_status) VALUES($1,$1,'Synthetic','Synthetic','retail','approved','approved')",[merchants[i]]);
    await admin.query("INSERT INTO support_tickets(id,merchant_id,subject,category) VALUES($1,$2,'Synthetic privacy proof','technical')",[tickets[i],merchants[i]]);
  }
  const snapshot=async()=> (await admin.query('SELECT to_jsonb(t) AS row FROM support_tickets t WHERE id=ANY($1::text[]) ORDER BY id',[tickets])).rows;
  const before=await snapshot();
  await t.test('legitimate same-merchant Support reads remain functional',async()=>{
    for(let i=0;i<merchants.length;i++)await withMerchantOperationalTransaction(merchants[i],async client=>{
      assert.equal((await client.query('SELECT id FROM support_tickets WHERE id=$1 AND merchant_id=$2',[tickets[i],merchants[i]])).rows[0]?.id,tickets[i]);
    });
  });
  const probe=async target=>{
    try{return {denied:false,visibleIds:(await target.query('SELECT id FROM support_tickets WHERE id=ANY($1::text[]) ORDER BY id',[tickets])).rows.map(x=>x.id)};}
    catch(error){if(error.code!=='42501')throw error;return {denied:true,visibleIds:[]};}
  };
  let unscoped,scoped;
  await t.test('classify isolated SQL privacy boundary without accepting diagnostic green as remediation',async()=>{
    unscoped=await probe(primary);
    scoped=await withMerchantOperationalTransaction(merchants[0],client=>probe(client));
    for(const observation of [unscoped,scoped]){
      assert.equal(new Set(observation.visibleIds).size,observation.visibleIds.length);
      assert.ok(observation.visibleIds.every(id=>tickets.includes(id)));
    }
    assert.deepEqual(await snapshot(),before);
  });
  console.log('P0_SUPPORT_PRIVACY_AUTHORITY_BASELINE '+JSON.stringify({diagnosticOnly:true,tables:facts,
    unscopedSyntheticRows:unscoped.visibleIds.length,scopedSyntheticRows:scoped.visibleIds.length,
    scopedForeignSyntheticRowVisible:scoped.visibleIds.includes(tickets[1]),
    sameTenantRead:true,exactSnapshotRestoration:true,actualLogins:1,merchants:2,
    httpAuthorizationTested:false,hostedCertified:false,releaseAccepted:false}));
});
