import assert from 'node:assert/strict';
import {randomInt,randomUUID} from 'node:crypto';
import test from 'node:test';
import {assertDisposablePostgres} from '../../../scripts/lib/disposable-postgres-test-guard.mjs';
import {cleanupResources} from './helpers/cleanup-resources.mjs';
import {createDisposableKnowledgeRuntime} from './helpers/disposable-knowledge-runtime.mjs';

await assertDisposablePostgres();
// Diagnostic baseline, not a security acceptance suite. Preserve observed unsafe
// grant behavior before changing admission. Grants/data are disposable only.
test('inventory alternate cashier access and reproduce non-row privilege admission',{timeout:120000},async t=>{
  const fixture=await createDisposableKnowledgeRuntime(),admin=fixture.admin,main=fixture.runtimePool;
  const merchants=[`priv-a-${randomUUID()}`,`priv-b-${randomUUID()}`];
  const table='merchant_cashier_discount_settings';
  const observer=`cashier_privilege_observer_${randomUUID().replaceAll('-','')}`;
  t.after(()=>cleanupResources([
    ['synthetic observer',()=>admin.query(`DROP FUNCTION IF EXISTS public.${observer}(text[])`)],
    ['accounts',()=>admin.query('DELETE FROM accounts WHERE id=ANY($1::text[])',[merchants])],
    ['runtime',()=>fixture.dispose()],
  ]));
  const {assertProductionDatabaseRlsReady:ready}=await import('../src/services/postgresRuntimeRlsSecurity.ts');
  const {issueMerchantTransactionScope:scope}=await import('../src/services/tenantTransactionScope.ts');
  const env={NODE_ENV:'production',FAWRI_OPERATIONAL_POSTGRES_AUTHORITY:'required',FAWRI_AUTH_DATABASE_URL:process.env.FAWRI_AUTH_DATABASE_URL,FAWRI_OPERATOR_DATABASE_URL:'postgresql://unused@127.0.0.1/fawri_ci'};
  for(const merchant of merchants){
    await admin.query("INSERT INTO accounts(id,kind,phone,password_hash,state,phone_verified) VALUES($1,'merchant',$2,'synthetic','active',true)",[merchant,`+197${randomInt(100000000,999999999)}`]);
    await admin.query("INSERT INTO merchants(id,account_id,owner_name,store_name,activity_type,status,account_status) VALUES($1,$1,'Synthetic','Synthetic','retail','approved','approved')",[merchant]);
    await admin.query(`INSERT INTO ${table}(merchant_id) VALUES($1)`,[merchant]);
  }
  const inventory={};
  await t.test('actual LOGIN inventories cashier ACLs owners views and callable routines',async()=>{
    assert.deepEqual((await main.query('SELECT session_user AS login,current_user AS active')).rows[0],{login:fixture.role,active:fixture.role});
    inventory.tables=(await main.query(`SELECT c.relname,c.relrowsecurity,row_security_active(c.oid) AS rls_active,
      has_table_privilege(current_user,c.oid,'TRUNCATE') AS can_truncate,
      has_table_privilege(current_user,c.oid,'TRIGGER') AS can_trigger,
      has_table_privilege(current_user,c.oid,'REFERENCES') AS can_reference,
      has_any_column_privilege(current_user,c.oid,'REFERENCES') AS can_reference_column,
      pg_has_role(session_user,c.relowner,'USAGE') OR pg_has_role(session_user,c.relowner,'SET') AS owner_reachable
      FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='public' AND c.relkind IN ('r','p') AND c.relname LIKE '%cashier%' ORDER BY c.relname`)).rows;
    assert.equal(inventory.tables.length,18);
    for(const row of inventory.tables){assert.equal(row.relrowsecurity,true);assert.equal(row.rls_active,true);assert.equal(row.owner_reachable,false);assert.equal(row.can_truncate,false);assert.equal(row.can_trigger,false);assert.equal(row.can_reference,false);assert.equal(row.can_reference_column,false);}
    inventory.views=(await main.query(`SELECT n.nspname,c.relname,c.relkind,c.reloptions,
      has_table_privilege(current_user,c.oid,'SELECT') AS readable
      FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE c.relkind IN ('v','m') AND n.nspname NOT IN ('pg_catalog','information_schema') AND n.nspname NOT LIKE 'pg_toast%' ORDER BY n.nspname,c.relname`)).rows;
    inventory.routines=(await main.query(`SELECT n.nspname,p.proname,pg_get_function_identity_arguments(p.oid) AS arguments,
      p.prosecdef,p.provolatile,p.proconfig,has_function_privilege(current_user,p.oid,'EXECUTE') AS executable,
      pg_has_role(session_user,p.proowner,'USAGE') OR pg_has_role(session_user,p.proowner,'SET') AS owner_reachable
      FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname IN ('public','fawri_security') ORDER BY n.nspname,p.proname,arguments`)).rows;
    await ready(env,main);
  });
  const probes=[];
  await t.test('record readiness response to each isolated non-row table grant',async()=>{
    for(const privilege of ['TRUNCATE','REFERENCES','TRIGGER']){
      await admin.query(`GRANT ${privilege} ON public.${table} TO ${fixture.role}`);
      try{
        assert.equal((await main.query('SELECT has_table_privilege(current_user,$1,$2) AS granted',[`public.${table}`,privilege])).rows[0].granted,true);
        let admission='ACCEPTED',errorCode=null;
        try{await ready(env,main);}catch(error){admission='REJECTED';errorCode=error.code;}
        probes.push({privilege,admission,errorCode});
      }finally{await admin.query(`REVOKE ${privilege} ON public.${table} FROM ${fixture.role}`);}
      await ready(env,main);
    }
  });
  await t.test('actual scoped LOGIN TRUNCATE affects both merchants and rollback restores rows',async()=>{
    // Fixture-only read observer inspects both synthetic rows on the lock-holding
    // connection. It is not a committed application routine or a runtime grant
    // recommendation; the canonical routine inventory above precedes creation.
    await admin.query(`CREATE FUNCTION public.${observer}(text[]) RETURNS integer LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog AS 'SELECT count(*)::integer FROM public.merchant_cashier_discount_settings WHERE merchant_id=ANY($1)'`);
    await admin.query(`REVOKE ALL ON FUNCTION public.${observer}(text[]) FROM PUBLIC`);
    await admin.query(`GRANT EXECUTE ON FUNCTION public.${observer}(text[]) TO ${fixture.role}`);
    const client=await main.connect();
    await admin.query(`GRANT TRUNCATE ON public.${table} TO ${fixture.role}`);
    try{
      await client.query('BEGIN');await client.query("SET LOCAL lock_timeout='2s'");await scope(client,merchants[0]);
      assert.deepEqual((await client.query(`SELECT merchant_id FROM ${table} WHERE merchant_id=ANY($1::text[])`,[merchants])).rows,[{merchant_id:merchants[0]}]);
      assert.equal((await client.query(`SELECT public.${observer}($1::text[]) AS count`,[merchants])).rows[0].count,2);
      await client.query(`TRUNCATE TABLE public.${table}`);
      assert.equal((await client.query(`SELECT public.${observer}($1::text[]) AS count`,[merchants])).rows[0].count,0);
      assert.equal((await client.query(`SELECT count(*)::integer AS count FROM ${table}`)).rows[0].count,0);
      await client.query('ROLLBACK');
    }finally{await client.query('ROLLBACK');client.release();await admin.query(`REVOKE TRUNCATE ON public.${table} FROM ${fixture.role}`);}
    assert.equal((await admin.query(`SELECT count(*)::integer AS count FROM ${table} WHERE merchant_id=ANY($1::text[])`,[merchants])).rows[0].count,2);
    // Use a fresh transaction to show merchant B was restored as well. PostgreSQL
    // TRUNCATE operates on the table; no claim about DELETE predicates is made.
    const clientB=await main.connect();try{await clientB.query('BEGIN');await scope(clientB,merchants[1]);assert.equal((await clientB.query(`SELECT count(*)::integer AS count FROM ${table} WHERE merchant_id=$1`,[merchants[1]])).rows[0].count,1);}finally{await clientB.query('ROLLBACK');clientB.release();}
    await ready(env,main);
  });
  console.log('P0_CASHIER_ALTERNATE_PRIVILEGE_DIAGNOSTIC '+JSON.stringify({diagnosticOnly:true,inventory,probes,truncateGrantedInDisposableFixtureOnly:true,rollbackRestoredBothMerchants:true,hostedCertified:false,releaseAccepted:false}));
});
