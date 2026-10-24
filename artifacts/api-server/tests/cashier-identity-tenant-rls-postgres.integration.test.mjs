import assert from 'node:assert/strict';
import {createHash,randomInt,randomUUID} from 'node:crypto';
import test from 'node:test';
import {assertDisposablePostgres} from '../../../scripts/lib/disposable-postgres-test-guard.mjs';
import {cleanupResources} from './helpers/cleanup-resources.mjs';
import {createDisposableKnowledgeRuntime} from './helpers/disposable-knowledge-runtime.mjs';

await assertDisposablePostgres();
test('cashier identity rows require private merchant scope while trusted authentication remains global',{timeout:120000},async t=>{
  const fixture=await createDisposableKnowledgeRuntime(),admin=fixture.admin,main=fixture.runtimePool;
  const tables=['merchant_cashier_staff','merchant_cashier_staff_permissions','merchant_cashier_stations','cashier_station_pairing_challenges','cashier_station_credentials','cashier_shifts','cashier_operator_sessions'];
  const nonce=randomUUID(),merchants=[`identity-a-${nonce}`,`identity-b-${nonce}`],rows=[];
  const saved={FAWRI_OPERATIONAL_POSTGRES_AUTHORITY:process.env.FAWRI_OPERATIONAL_POSTGRES_AUTHORITY,FAWRI_DEPLOYMENT_MODE:process.env.FAWRI_DEPLOYMENT_MODE};
  let authClient;
  t.after(()=>cleanupResources([
    ['auth SQL probe',()=>authClient?.end()],
    ...['cashier_operator_sessions','cashier_shifts','cashier_station_credentials','cashier_station_pairing_challenges','merchant_cashier_staff_permissions','merchant_cashier_stations','merchant_cashier_staff'].map(table=>[table,()=>admin.query(`DELETE FROM ${table} WHERE merchant_id=ANY($1::text[])`,[merchants])]),
    ['accounts',()=>admin.query('DELETE FROM accounts WHERE id=ANY($1::text[])',[merchants])],
    ['runtime',()=>fixture.dispose()],
    ['environment',async()=>{for(const[k,v]of Object.entries(saved)){if(v===undefined)delete process.env[k];else process.env[k]=v;}}],
  ]));
  process.env.FAWRI_OPERATIONAL_POSTGRES_AUTHORITY='required';process.env.FAWRI_DEPLOYMENT_MODE='production';
  const {issueMerchantTransactionScope:scope}=await import('../src/services/tenantTransactionScope.ts');
  const {withAuthenticationTransaction:auth}=await import('../src/services/authenticationPostgresAuthority.ts');
  const {assertProductionDatabaseRlsReady:ready}=await import('../src/services/postgresRuntimeRlsSecurity.ts');
  const {resolveHistoricalOperatorAttributionContext:historical}=await import('../src/services/cashierOperatorCommerceAuthority.ts');
  const {listCashierStaffAuthoritative:listStaff}=await import('../src/services/postgresCashierStaffAuthority.ts');
  const env={...process.env,NODE_ENV:'production',FAWRI_OPERATOR_DATABASE_URL:'postgresql://unused@127.0.0.1/fawri_ci'};
  const hash=s=>createHash('sha256').update(s).digest('hex');
  for(const merchant of merchants){
    const staff=`staff-${merchant}`,station=`station-${merchant}`,shift=`shift-${merchant}`,session=`session-${merchant}`,credential=`credential-${merchant}`,pair=`pair-${merchant}`,location=`location-${merchant}`,device=`device-${merchant}`;
    await admin.query("INSERT INTO accounts(id,kind,phone,password_hash,state,phone_verified) VALUES($1,'merchant',$2,'synthetic','active',true)",[merchant,`+198${randomInt(100000000,999999999)}`]);
    await admin.query("INSERT INTO merchants(id,account_id,owner_name,store_name,activity_type,status,account_status) VALUES($1,$1,'Synthetic','Synthetic','retail','approved','approved')",[merchant]);
    await admin.query("INSERT INTO merchant_locations(id,merchant_id,name,legacy_branch_key,is_default) VALUES($1,$2,'Synthetic','default',true)",[location,merchant]);
    await admin.query("INSERT INTO merchant_cashier_staff(id,merchant_id,display_name,pin_hash) VALUES($1,$2,'Synthetic',$3)",[staff,merchant,hash('synthetic-pin-'+merchant)]);
    await admin.query("INSERT INTO merchant_cashier_staff_permissions(merchant_id,staff_id,permission) VALUES($1,$2,'sale.create')",[merchant,staff]);
    await admin.query("INSERT INTO merchant_cashier_stations(id,merchant_id,name,location_id,paired_device_id,paired_at,credential_version) VALUES($1,$2,'Synthetic',$3,$4,now()-interval '1 hour',1)",[station,merchant,location,device]);
    await admin.query("INSERT INTO cashier_station_pairing_challenges(id,merchant_id,station_id,code_hash,created_at,expires_at) VALUES($1,$2,$3,$4,now()-interval '1 hour',now()+interval '1 hour')",[pair,merchant,station,hash(pair)]);
    await admin.query("INSERT INTO cashier_station_credentials(id,merchant_id,station_id,device_id,token_hash,version,issued_at,expires_at) VALUES($1,$2,$3,$4,$5,1,now()-interval '1 hour',now()+interval '1 day')",[credential,merchant,station,device,hash(credential)]);
    await admin.query("INSERT INTO cashier_shifts(id,merchant_id,station_id,staff_id,started_at) VALUES($1,$2,$3,$4,now()-interval '1 hour')",[shift,merchant,station,staff]);
    await admin.query("INSERT INTO cashier_operator_sessions(id,merchant_id,station_id,staff_id,shift_id,token_hash,staff_version,issued_at,last_seen_at,expires_at) VALUES($1,$2,$3,$4,$5,$6,1,now()-interval '1 hour',now(),now()+interval '1 day')",[session,merchant,station,staff,shift,hash(session)]);
    rows.push({merchant,staff,station,shift,session,credential,pair,location,device});
  }
  const {Client}=await import('pg');authClient=new Client({connectionString:process.env.FAWRI_AUTH_DATABASE_URL,connectionTimeoutMillis:5000});await authClient.connect();
  const queryRows=(client,table)=>client.query(`SELECT merchant_id FROM ${table} WHERE merchant_id=ANY($1::text[]) ORDER BY merchant_id`,[merchants]).then(x=>x.rows);
  const scoped=async(merchant,work)=>{const c=await main.connect();try{await c.query('BEGIN');await scope(c,merchant);return await work(c);}finally{await c.query('ROLLBACK');c.release();}};
  await t.test('all seven catalog policies use the established predicate with enabled runtime RLS',async()=>{
    const catalog=(await main.query("SELECT c.relname,c.relrowsecurity,row_security_active(c.oid) AS active,p.polname,pg_get_expr(p.polqual,p.polrelid) AS using,pg_get_expr(p.polwithcheck,p.polrelid) AS check FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace LEFT JOIN pg_policy p ON p.polrelid=c.oid WHERE n.nspname='public' AND c.relname=ANY($1::text[]) ORDER BY c.relname",[tables])).rows;
    assert.equal(catalog.length,7);for(const row of catalog){assert.equal(row.relrowsecurity,true);assert.equal(row.active,true);assert.equal(row.polname,row.relname+'_tenant_boundary');assert.match(row.using,/fawri_tenant_or_audited_admin\(merchant_id\)/);assert.equal(row.using,row.check);}
    assert.deepEqual((await main.query('SELECT session_user AS login,current_user AS active')).rows[0],{login:fixture.role,active:fixture.role});await ready(env,main);
  });
  await t.test('unscoped and forged tenant/admin GUCs reveal no identity rows',async()=>{
    for(const table of tables)assert.deepEqual(await queryRows(main,table),[]);
    const c=await main.connect();try{await c.query('BEGIN');await c.query("SELECT set_config('fawri.tenant_id',$1,true),set_config('fawri.admin_account_id','forged',true),set_config('fawri.admin_audit_id','forged',true)",[merchants[0]]);for(const table of tables)assert.deepEqual(await queryRows(c,table),[]);}finally{await c.query('ROLLBACK');c.release();}
  });
  await t.test('both private scopes return only own rows despite forged contrary GUCs, then disappear',async()=>{
    for(const merchant of merchants)await scoped(merchant,async c=>{await c.query("SELECT set_config('fawri.tenant_id',$1,true)",[merchants.find(x=>x!==merchant)]);for(const table of tables)assert.deepEqual(await queryRows(c,table),[{merchant_id:merchant}]);});
    for(const table of tables)assert.deepEqual(await queryRows(main,table),[]);
  });
  await t.test('station and shift row checks deny cross-merchant writes but preserve own transactional work',async()=>{
    const a=rows[0],b=rows[1];
    await scoped(a.merchant,async c=>{
      assert.equal((await c.query("UPDATE merchant_cashier_stations SET name='own-change' WHERE id=$1 RETURNING id",[a.station])).rows.length,1);
      assert.equal((await c.query("UPDATE cashier_shifts SET status='closed',ended_at=now(),close_reason='synthetic' WHERE id=$1 RETURNING id",[a.shift])).rows.length,1);
      for(const table of ['merchant_cashier_stations','cashier_shifts']){
        assert.equal((await c.query(`UPDATE ${table} SET merchant_id=$1 WHERE merchant_id=$1 RETURNING id`,[b.merchant])).rows.length,0);
        assert.equal((await c.query(`DELETE FROM ${table} WHERE merchant_id=$1 RETURNING id`,[b.merchant])).rows.length,0);
      }
    });
    for(const statement of [c=>c.query("INSERT INTO merchant_cashier_stations(id,merchant_id,name) VALUES($1,$2,'foreign')",[`foreign-${nonce}`,b.merchant]),c=>c.query('UPDATE merchant_cashier_stations SET merchant_id=$1 WHERE id=$2',[b.merchant,a.station])])await assert.rejects(()=>scoped(a.merchant,statement),{code:'42501'});
    assert.equal((await admin.query('SELECT name FROM merchant_cashier_stations WHERE id=$1',[a.station])).rows[0].name,'Synthetic');assert.equal((await admin.query('SELECT status FROM cashier_shifts WHERE id=$1',[a.shift])).rows[0].status,'open');
  });
  await t.test('auth LOGIN remains global without tenant GUC and actual staff service stays merchant-bound',async()=>{
    await auth(async c=>{const identity=(await c.query("SELECT session_user AS login,current_user AS active,nullif(current_setting('fawri.tenant_id',true),'') AS tenant")).rows[0];assert.deepEqual(identity,{login:fixture.authRole,active:fixture.authRole,tenant:null});for(const table of tables)assert.deepEqual(await queryRows(c,table),merchants.map(merchant_id=>({merchant_id})).sort((a,b)=>a.merchant_id.localeCompare(b.merchant_id)));});
    for(const row of rows){const staff=await listStaff(row.merchant);assert.equal(staff.length,1);assert.equal(staff[0].id,row.staff);}
    await admin.query(`REVOKE EXECUTE ON FUNCTION public.fawri_authentication_runtime() FROM ${fixture.authRole}`);
    try{for(const table of tables)assert.deepEqual(await queryRows(authClient,table),[]);await assert.rejects(()=>auth(c=>queryRows(c,tables[0])),{code:'AUTH_DATABASE_IDENTITY_INVALID'});}
    finally{await admin.query(`GRANT EXECUTE ON FUNCTION public.fawri_authentication_runtime() TO ${fixture.authRole}`);}
  });
  await t.test('historical primary join reads own station shift credential and session under private scope',async()=>{
    const instant=(await admin.query('SELECT clock_timestamp() AS instant')).rows[0].instant.toISOString();
    for(const row of rows){const result=await historical({merchantId:row.merchant,deviceId:row.device,occurredAt:instant});assert.deepEqual(result,{merchant_id:row.merchant,station_id:row.station,location_id:row.location,staff_id:row.staff,shift_id:row.shift,device_id:row.device,credential_id:row.credential,operator_session_id:row.session});}
    await assert.rejects(()=>historical({merchantId:rows[0].merchant,deviceId:rows[1].device,occurredAt:instant}));
  });
  await t.test('readiness rejects disabling RLS on each new protected identity table and recovers',async()=>{
    for(const table of tables){await admin.query(`ALTER TABLE ${table} DISABLE ROW LEVEL SECURITY`);try{await assert.rejects(()=>ready(env,main),{code:'PRODUCTION_DATABASE_TENANT_RLS_REQUIRED'});}finally{await admin.query(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY`);}await ready(env,main);}
  });
  console.log('P0_CASHIER_IDENTITY_RLS_PROOF '+JSON.stringify({actualRestrictedLogins:2,protectedTables:7,catalogPoliciesAndActiveRls:true,unscopedAndForgedGucRowsHidden:true,bothMerchantPrivateScopes:true,scopeEndsWithoutLeak:true,crossMerchantStationShiftWritesDenied:true,ownWritesAndRollbackPreserved:true,authGlobalWithoutTenantGuc:true,authMarkerRevocationHidesRows:true,staffServiceMerchantBound:true,historicalPrimaryJoinBothMerchants:true,crossDeviceHistoricalDenied:true,disabledRlsAdmissionCases:7,hostedCertified:false,releaseAccepted:false}));
});
