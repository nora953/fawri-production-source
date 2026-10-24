import assert from 'node:assert/strict';
import {randomInt,randomUUID} from 'node:crypto';
import test from 'node:test';
import {assertDisposablePostgres} from '../../../scripts/lib/disposable-postgres-test-guard.mjs';
import {cleanupResources} from './helpers/cleanup-resources.mjs';
import {createDisposableKnowledgeRuntime} from './helpers/disposable-knowledge-runtime.mjs';

await assertDisposablePostgres();
test('scoped approver lock preserves commerce serialization without tenant staff writes',{timeout:120000},async t=>{
  const fixture=await createDisposableKnowledgeRuntime(),admin=fixture.admin,main=fixture.runtimePool;
  const nonce=randomUUID(),merchants=[`staff-lock-a-${nonce}`,`staff-lock-b-${nonce}`],ids=merchants.map(x=>`manager-${x}`);
  const grantRole=`staff_grant_${randomUUID().replaceAll('-','')}`;
  let authPool,roleCreated=false;
  t.after(()=>cleanupResources([
    ['auth probe pool',()=>authPool?.end()],
    ['staff',()=>admin.query('DELETE FROM merchant_cashier_staff WHERE merchant_id=ANY($1::text[])',[merchants])],
    ['accounts',()=>admin.query('DELETE FROM accounts WHERE id=ANY($1::text[])',[merchants])],
    ['grant role',async()=>{if(roleCreated){await admin.query(`DROP OWNED BY ${grantRole}`);await admin.query(`DROP ROLE ${grantRole}`);}}],
    ['runtime',()=>fixture.dispose()],
  ]));
  const {issueMerchantTransactionScope:scope}=await import('../src/services/tenantTransactionScope.ts');
  const {assertProductionDatabaseRlsReady:ready}=await import('../src/services/postgresRuntimeRlsSecurity.ts');
  const env={...process.env,NODE_ENV:'production',FAWRI_DEPLOYMENT_MODE:'production',FAWRI_OPERATIONAL_POSTGRES_AUTHORITY:'required',FAWRI_OPERATOR_DATABASE_URL:'postgresql://unused@127.0.0.1/fawri_ci'};
  const sql='SELECT * FROM public.fawri_lock_cashier_approver($1::text,$2::text)';
  const params=[merchants[0],ids[0]],quote=s=>'"'+s.replaceAll('"','""')+'"';
  for(let i=0;i<2;i++){
    await admin.query("INSERT INTO accounts(id,kind,phone,password_hash,state,phone_verified) VALUES($1,'merchant',$2,'synthetic','active',true)",[merchants[i],`+198${randomInt(100000000,999999999)}`]);
    await admin.query("INSERT INTO merchants(id,account_id,owner_name,store_name,activity_type,status,account_status) VALUES($1,$1,'Synthetic','Synthetic','retail','approved','approved')",[merchants[i]]);
    await admin.query("INSERT INTO merchant_cashier_staff(id,merchant_id,display_name,role,pin_hash) VALUES($1,$2,'Synthetic manager','manager',$3)",[ids[i],merchants[i],'synthetic-disposable-staff-pin-hash-only']);
  }
  await admin.query(`CREATE ROLE ${grantRole} NOLOGIN NOSUPERUSER NOBYPASSRLS NOCREATEROLE NOINHERIT`);roleCreated=true;
  const columns=(await admin.query("SELECT attname FROM pg_attribute WHERE attrelid='public.merchant_cashier_staff'::regclass AND attnum>0 AND NOT attisdropped ORDER BY attnum")).rows.map(x=>x.attname);
  let mutationGrantCases=0;
  await t.test('actual tenant cannot mutate any staff column or insert/delete/truncate',async()=>{
    assert.deepEqual((await main.query('SELECT session_user AS login,current_user AS active')).rows[0],{login:fixture.role,active:fixture.role});
    for(const column of columns)await assert.rejects(()=>main.query(`UPDATE merchant_cashier_staff SET ${quote(column)}=${quote(column)} WHERE false`),{code:'42501'});
    for(const statement of ['INSERT INTO merchant_cashier_staff(id) VALUES($1)','DELETE FROM merchant_cashier_staff WHERE id=$1','TRUNCATE merchant_cashier_staff'])await assert.rejects(()=>main.query(statement,statement.startsWith('TRUNCATE')?[]:[ids[0]]),{code:'42501'});
    await assert.rejects(()=>main.query('SELECT pin_hash FROM merchant_cashier_staff'),{code:'42501'});
    assert.deepEqual((await main.query('SELECT id,role FROM merchant_cashier_staff WHERE id=$1',[ids[0]])).rows,[]);
    const scoped=await main.connect();
    try{await scoped.query('BEGIN');await scope(scoped,merchants[0]);
      assert.deepEqual((await scoped.query('SELECT id,role FROM merchant_cashier_staff WHERE id=$1',[ids[0]])).rows,[{id:ids[0],role:'manager'}]);
    }finally{await scoped.query('ROLLBACK');scoped.release();}
    await ready(env,main);
  });
  await t.test('table and column mutation grants fail readiness through direct PUBLIC inherited and SET roles',async()=>{
    for(const mode of ['direct','public','inherit-only','set-reachable','unreachable'])for(const privilege of ['INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER','UPDATE(pin_hash)','UPDATE(role)','UPDATE(failed_pin_attempts)']){
      const grantee=mode==='direct'?fixture.role:mode==='public'?'PUBLIC':grantRole;
      try{
        await admin.query(`GRANT ${privilege} ON merchant_cashier_staff TO ${grantee}`);
        if(!['direct','public'].includes(mode))await admin.query(`GRANT ${grantRole} TO ${fixture.role} WITH INHERIT ${mode==='inherit-only'?'TRUE':'FALSE'}, SET ${mode==='set-reachable'?'TRUE':'FALSE'}`);
        if(mode==='unreachable')await ready(env,main);
        else await assert.rejects(()=>ready(env,main),{code:'PRODUCTION_AUTH_MUTATION_AUTHORITY_REACHABLE'});
        mutationGrantCases++;
      }finally{
        if(!['direct','public'].includes(mode))await admin.query(`REVOKE ${grantRole} FROM ${fixture.role}`);
        await admin.query(`REVOKE ${privilege} ON merchant_cashier_staff FROM ${grantee}`);
      }
      await ready(env,main);
    }
  });
  await t.test('forged GUCs and another backend cannot invoke the scoped function',async()=>{
    await main.query("SELECT set_config('fawri.tenant_id',$1,false),set_config('fawri.admin_account_id','forged',false),set_config('fawri.admin_audit_id','forged',false)",[merchants[0]]);
    await assert.rejects(()=>main.query(sql,params),{code:'42501'});
    const lease=await main.connect(),other=await main.connect();
    try{
      await lease.query('BEGIN');await scope(lease,merchants[0]);
      const row=(await lease.query(sql,params)).rows[0];assert.deepEqual(Object.keys(row).sort(),['display_name','id','revoked_at','role','status']);assert.equal(row.id,ids[0]);
      await assert.rejects(()=>other.query(sql,params),{code:'42501'});
      assert.equal((await lease.query(sql,[merchants[0],ids[1]])).rows.length,0);
    }finally{await lease.query('ROLLBACK');lease.release();other.release();}
  });
  await t.test('cross-merchant expired and completed transaction scopes fail closed',async()=>{
    const client=await main.connect();
    try{
      await client.query('BEGIN');await scope(client,merchants[0]);
      await assert.rejects(()=>client.query(sql,[merchants[1],ids[1]]),{code:'42501'});await client.query('ROLLBACK');
      await client.query('BEGIN');await scope(client,merchants[0]);
      await admin.query("UPDATE fawri_security.transaction_scopes SET issued_at=clock_timestamp()-interval '2 minutes',expires_at=clock_timestamp()-interval '1 minute' WHERE runtime_login=$1 AND backend_pid=$2",[fixture.role,(await client.query('SELECT pg_backend_pid() AS pid')).rows[0].pid]);
      await assert.rejects(()=>client.query(sql,params),{code:'42501'});await client.query('ROLLBACK');
      await client.query('BEGIN');await scope(client,merchants[0]);await client.query(sql,params);await client.query('COMMIT');
      await assert.rejects(()=>client.query(sql,params),{code:'42501'});
    }finally{await client.query('ROLLBACK');client.release();}
  });
  const {Pool}=await import('pg');authPool=new Pool({connectionString:process.env.FAWRI_AUTH_DATABASE_URL,max:2,connectionTimeoutMillis:5000});
  await t.test('the function holds the real staff row lock until commerce commit or rollback',async()=>{
    for(const completion of ['COMMIT','ROLLBACK']){
      const commerce=await main.connect(),auth=await authPool.connect();
      try{
        assert.deepEqual((await auth.query('SELECT session_user AS login,current_user AS active')).rows[0],{login:fixture.authRole,active:fixture.authRole});
        await commerce.query('BEGIN');await scope(commerce,merchants[0]);await commerce.query(sql,params);
        await auth.query('BEGIN');await auth.query("SET LOCAL lock_timeout='150ms'");
        await assert.rejects(()=>auth.query("UPDATE merchant_cashier_staff SET display_name='Blocked synthetic change' WHERE id=$1",[ids[0]]),{code:'55P03'});await auth.query('ROLLBACK');
        assert.equal((await admin.query('SELECT display_name FROM merchant_cashier_staff WHERE id=$1',[ids[0]])).rows[0].display_name,'Synthetic manager');
        await commerce.query(completion);
        assert.equal((await auth.query("UPDATE merchant_cashier_staff SET display_name='Synthetic manager',version=version+1 WHERE id=$1 RETURNING id",[ids[0]])).rows.length,1);
      }finally{await commerce.query('ROLLBACK');await auth.query('ROLLBACK');commerce.release();auth.release();}
    }
  });
  await t.test('readiness rejects missing function execute rights unsafe search path or invoker semantics',async()=>{
    const signature='public.fawri_lock_cashier_approver(text,text)';
    for(const[change,restore]of [['SECURITY INVOKER','SECURITY DEFINER'],['SET search_path=public','SET search_path=pg_catalog'],['STABLE','VOLATILE']]){
      await admin.query(`ALTER FUNCTION ${signature} ${change}`);
      try{await assert.rejects(()=>ready(env,main),{code:'PRODUCTION_CASHIER_STAFF_LOCK_REQUIRED'});}
      finally{await admin.query(`ALTER FUNCTION ${signature} ${restore}`);}
      await ready(env,main);
    }
    await admin.query(`REVOKE EXECUTE ON FUNCTION ${signature} FROM PUBLIC`);
    try{await assert.rejects(()=>ready(env,main),{code:'PRODUCTION_CASHIER_STAFF_LOCK_REQUIRED'});}
    finally{await admin.query(`GRANT EXECUTE ON FUNCTION ${signature} TO PUBLIC`);}
    await admin.query(`ALTER FUNCTION ${signature} RENAME TO fawri_lock_cashier_approver_missing_probe`);
    try{await assert.rejects(()=>ready(env,main),{code:'PRODUCTION_CASHIER_STAFF_LOCK_REQUIRED'});}
    finally{await admin.query('ALTER FUNCTION public.fawri_lock_cashier_approver_missing_probe(text,text) RENAME TO fawri_lock_cashier_approver');}
    await ready(env,main);
  });
  console.log('P0_CASHIER_STAFF_LOCK_PROOF '+JSON.stringify({actualRestrictedLogins:2,staffColumnsMutationDenied:columns.length,tenantInsertDeleteTruncatePinReadDenied:true,mutationGrantReadinessCases:mutationGrantCases,publicInheritedSetReachability:true,ordinaryReadPreserved:true,scopeOnlyPublicProjection:true,forgedGucOtherBackendCrossMerchantExpiredCompletedDenied:true,realStaffRowLockBlocksAuthUpdate:true,commitAndRollbackReleaseLock:true,trustedAuthWritesPreserved:true,functionReadinessMetadataExecuteExistenceChecks:5,hostedCertified:false,releaseAccepted:false}));
});
