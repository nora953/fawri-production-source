import assert from 'node:assert/strict';
import {randomInt,randomUUID} from 'node:crypto';
import test from 'node:test';
import {assertDisposablePostgres} from '../../../scripts/lib/disposable-postgres-test-guard.mjs';
import {createDisposableKnowledgeRuntime} from './helpers/disposable-knowledge-runtime.mjs';
import {cleanupResources} from './helpers/cleanup-resources.mjs';
await assertDisposablePostgres();
const tables=['merchant_admin_notes','merchant_channel_overrides','merchant_deletion_requests'];

test('private merchant administration denies primary SQL and preserves trusted management services',{timeout:120000},async t=>{
  const fixture=await createDisposableKnowledgeRuntime(),admin=fixture.admin,primary=fixture.runtimePool;
  const merchants=[0,1].map(()=>`management-private-${randomUUID()}`),owner=`management-owner-${randomUUID()}`;
  const saved=process.env.FAWRI_OPERATIONAL_POSTGRES_AUTHORITY;
  t.after(()=>cleanupResources([
    ...tables.map(table=>[table,()=>admin.query(`DELETE FROM ${table} WHERE merchant_id=ANY($1::text[])`,[merchants])]),
    ['audits',()=>admin.query('DELETE FROM audit_events WHERE merchant_id=ANY($1::text[])',[merchants])],
    ['directory audits',()=>admin.query('DELETE FROM database_admin_access_audits WHERE admin_account_id=$1',[owner])],
    ['notifications',()=>admin.query('DELETE FROM notifications WHERE merchant_id=ANY($1::text[]) OR account_id=$2',[merchants,owner])],
    ['accounts',()=>admin.query('DELETE FROM accounts WHERE id=ANY($1::text[])',[[...merchants,owner]])],
    ['runtime',()=>fixture.dispose()],
    ['environment',()=>{if(saved===undefined)delete process.env.FAWRI_OPERATIONAL_POSTGRES_AUTHORITY;else process.env.FAWRI_OPERATIONAL_POSTGRES_AUTHORITY=saved;}],
  ]));
  process.env.FAWRI_OPERATIONAL_POSTGRES_AUTHORITY='required';
  const {withMerchantOperationalTransaction:scoped}=await import('../src/services/operationalPostgresAuthority.ts');
  const {withAuthenticationTransaction:trusted}=await import('../src/services/authenticationPostgresAuthority.ts');
  const management=await import('../src/services/postgresMerchantManagementAuthority.ts');
  const {assertProductionDatabaseRlsReady:ready}=await import('../src/services/postgresRuntimeRlsSecurity.ts');
  const env={...process.env,NODE_ENV:'production',FAWRI_DEPLOYMENT_MODE:'production',FAWRI_OPERATOR_DATABASE_URL:'postgresql://unused@127.0.0.1/fawri_ci'};
  await admin.query("INSERT INTO accounts(id,kind,phone,password_hash,state,phone_verified) VALUES($1,'admin',$2,'synthetic','active',true)",[owner,`+195${randomInt(100000000,999999999)}`]);
  await admin.query("INSERT INTO admin_profiles(id,account_id,profile_kind,display_name,role,enabled,must_change_password) VALUES($1,$1,'admin','Synthetic owner','owner_admin',true,false)",[owner]);
  const requests=[];
  for(const merchantId of merchants){
    await admin.query("INSERT INTO accounts(id,kind,phone,password_hash,state,phone_verified) VALUES($1,'merchant',$2,'synthetic','active',true)",[merchantId,`+195${randomInt(100000000,999999999)}`]);
    await admin.query("INSERT INTO merchants(id,account_id,owner_name,store_name,activity_type,status,account_status) VALUES($1,$1,'Synthetic','Synthetic','retail','suspended','suspended')",[merchantId]);
    await management.setMerchantAdminNotePostgres({merchantId,note:'Synthetic private note',actorAdminId:owner});
    await management.setMerchantChannelOverridePostgres({merchantId,platform:'messenger',status:'connected',actorAdminId:owner});
    requests.push(await management.createDeletionRequestPostgres({merchantId,actorAdminId:owner,reason:'policy_violation',details:'Synthetic private request'}));
  }
  const snapshot=async()=>Object.fromEntries(await Promise.all(tables.map(async table=>[table,(await admin.query(`SELECT to_jsonb(t) AS row FROM ${table} t WHERE merchant_id=ANY($1::text[]) ORDER BY merchant_id`,[merchants])).rows])));
  const baseline=await snapshot();for(const table of tables)assert.equal(baseline[table].length,2);
  let readDenials=0,mutationDenials=0;
  await t.test('readiness requires all three effective administrative boundaries',async()=>{
    await ready(env);
    const metadata=(await primary.query("SELECT relname,relrowsecurity,(SELECT count(*)::int FROM pg_policy p WHERE p.polrelid=c.oid) AS policies FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND relname=ANY($1::text[]) ORDER BY relname",[tables])).rows;
    assert.equal(metadata.length,3);assert.ok(metadata.every(r=>r.relrowsecurity&&r.policies===1));
    for(const table of tables){
      await admin.query(`ALTER TABLE ${table} DISABLE ROW LEVEL SECURITY`);
      try{await assert.rejects(ready(env),{code:'PRODUCTION_DATABASE_TENANT_RLS_REQUIRED'});}
      finally{await admin.query(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY`);}
    }
    await ready(env);
  });
  await t.test('no scope or ordinary tenant scope confers private administrative reads',async()=>{
    assert.deepEqual((await primary.query('SELECT session_user=current_user AS same_login,r.rolcanlogin,r.rolsuper,r.rolbypassrls,r.rolcreaterole FROM pg_roles r WHERE r.rolname=session_user')).rows[0],{same_login:true,rolcanlogin:true,rolsuper:false,rolbypassrls:false,rolcreaterole:false});
    for(const table of tables){
      const sql=`SELECT to_jsonb(t) AS row FROM ${table} t WHERE merchant_id=ANY($1::text[])`;
      assert.equal((await primary.query(sql,[merchants])).rowCount,0);readDenials++;
      for(const merchant of merchants)await scoped(merchant,async c=>{assert.equal((await c.query(sql,[merchants])).rowCount,0);readDenials++;});
    }
    assert.deepEqual(await snapshot(),baseline);
  });
  const rollbackProbe=async(merchant,sql,values)=>{
    const stop=new Error('owned denied-mutation rollback');let result;
    try{await scoped(merchant,async c=>{result=await c.query(sql,values);throw stop;});assert.fail('probe must roll back');}
    catch(error){if(error===stop)return {rows:result.rowCount};if(error.code==='42501')return {denied:true};throw error;}
  };
  await t.test('primary updates, deletes and valid upserts cannot change administrative data',async()=>{
    for(const table of tables)for(const merchant of merchants)for(const operation of ['UPDATE','DELETE']){
      const sql=operation==='UPDATE'?`UPDATE ${table} SET merchant_id=merchant_id WHERE merchant_id=$1`:`DELETE FROM ${table} WHERE merchant_id=$1`;
      const result=await rollbackProbe(merchant,sql,[merchants[1]]);assert.ok(result.denied||result.rows===0);mutationDenials++;
    }
    for(const merchant of merchants){
      assert.deepEqual(await rollbackProbe(merchant,"INSERT INTO merchant_admin_notes(merchant_id,note) VALUES($1,'Synthetic denied') ON CONFLICT(merchant_id) DO UPDATE SET note=EXCLUDED.note",[merchant]),{denied:true});mutationDenials++;
      assert.deepEqual(await rollbackProbe(merchant,"INSERT INTO merchant_channel_overrides(merchant_id,platform,status) VALUES($1,'messenger','pending') ON CONFLICT(merchant_id,platform) DO UPDATE SET status=EXCLUDED.status",[merchant]),{denied:true});mutationDenials++;
      const id=`denied-${randomUUID()}`;
      assert.deepEqual(await rollbackProbe(merchant,"INSERT INTO merchant_deletion_requests(id,merchant_id,merchant_id_snapshot,merchant_name_snapshot,merchant_phone_snapshot,requested_by_admin_id_snapshot,requested_by_admin_name_snapshot,requested_by_admin_phone_snapshot,reason,details) VALUES($1,$2,$2,'Synthetic','Synthetic','synthetic-owner','Synthetic','Synthetic','policy_violation','Synthetic denied')",[id,merchant]),{denied:true});mutationDenials++;
    }
    assert.deepEqual(await snapshot(),baseline);
  });
  await t.test('trusted actual management services retain both tenants and review the intended request',async()=>{
    await trusted(async c=>{
      assert.deepEqual((await c.query("SELECT session_user=current_user AS same_login,has_function_privilege(session_user,'public.fawri_authentication_runtime()','EXECUTE') AS authority")).rows[0],{same_login:true,authority:true});
      for(const table of tables)assert.equal((await c.query(`SELECT merchant_id FROM ${table} WHERE merchant_id=ANY($1::text[])`,[merchants])).rowCount,2);
    });
    const before=await snapshot(),stop=new Error('trusted rollback');
    await assert.rejects(trusted(async c=>{await c.query("UPDATE merchant_admin_notes SET note='Synthetic rolled back' WHERE merchant_id=$1",[merchants[0]]);throw stop;}),e=>e===stop);
    assert.deepEqual(await snapshot(),before);
    await management.setMerchantAdminNotePostgres({merchantId:merchants[0],note:'Synthetic updated private note',actorAdminId:owner});
    assert.equal(await management.getMerchantAdminNotePostgres(merchants[0]),'Synthetic updated private note');
    assert.equal(await management.getMerchantAdminNotePostgres(merchants[1]),'Synthetic private note');
    await management.setMerchantChannelOverridePostgres({merchantId:merchants[0],platform:'messenger',status:'disconnected',actorAdminId:owner});
    const overrides=await management.listMerchantChannelOverridesPostgres();
    assert.equal(overrides[merchants[0]].messenger,'disconnected');assert.equal(overrides[merchants[1]].messenger,'connected');
    await management.rejectDeletionRequestPostgres({requestId:requests[0].id,actorAdminId:owner});
    const listed=await management.listDeletionRequestsPostgres();
    assert.equal(listed.find(r=>r.id===requests[0].id).status,'rejected');assert.equal(listed.find(r=>r.id===requests[1].id).status,'pending');
    for(const table of tables)assert.equal((await primary.query(`SELECT merchant_id FROM ${table} WHERE merchant_id=ANY($1::text[])`,[merchants])).rowCount,0);
  });
  console.log('P0_MERCHANT_MANAGEMENT_PRIVACY_REMEDIATION '+JSON.stringify({tables:3,actualPrimaryAndAuthLogins:2,syntheticMerchants:2,readDenials,mutationDenials,trustedServiceReadsAndMutations:true,rollbackAndPeerPreservation:true,readinessDisableProbes:3,httpRoleMatrixTested:false,remainingResidualTables:5,hostedCertified:false,releaseAccepted:false}));
});
