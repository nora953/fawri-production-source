import assert from 'node:assert/strict';
import {randomInt,randomUUID} from 'node:crypto';
import test from 'node:test';
import {assertDisposablePostgres} from '../../../scripts/lib/disposable-postgres-test-guard.mjs';
import {cleanupResources} from './helpers/cleanup-resources.mjs';
import {createDisposableKnowledgeRuntime} from './helpers/disposable-knowledge-runtime.mjs';

await assertDisposablePostgres();
// Immutable d051f0c baseline records the bypass. This regression requires
// primary mutation denial and trusted-auth writes; it is not an HTTP sale test.
test('protect policy mutation while preserving actual manual-discount authority',{timeout:120000},async t=>{
  const fixture=await createDisposableKnowledgeRuntime(),admin=fixture.admin,main=fixture.runtimePool;
  const merchants=[`policy-a-${randomUUID()}`,`policy-b-${randomUUID()}`],rows=[];
  const grantRole=`policy_acl_${randomUUID().replaceAll('-','')}`;let grantRoleCreated=false;
  const saved={FAWRI_OPERATIONAL_POSTGRES_AUTHORITY:process.env.FAWRI_OPERATIONAL_POSTGRES_AUTHORITY,FAWRI_DEPLOYMENT_MODE:process.env.FAWRI_DEPLOYMENT_MODE};
  t.after(()=>cleanupResources([
    ['stations',()=>admin.query('DELETE FROM merchant_cashier_stations WHERE merchant_id=ANY($1::text[])',[merchants])],
    ['staff',()=>admin.query('DELETE FROM merchant_cashier_staff WHERE merchant_id=ANY($1::text[])',[merchants])],
    ['accounts',()=>admin.query('DELETE FROM accounts WHERE id=ANY($1::text[])',[merchants])],
    ['grant role privileges',()=>grantRoleCreated?admin.query(`DROP OWNED BY ${grantRole}`):undefined],
    ['grant role',()=>grantRoleCreated?admin.query(`DROP ROLE ${grantRole}`):undefined],
    ['runtime',()=>fixture.dispose()],
    ['environment',async()=>{for(const[k,v]of Object.entries(saved)){if(v===undefined)delete process.env[k];else process.env[k]=v;}}],
  ]));
  process.env.FAWRI_OPERATIONAL_POSTGRES_AUTHORITY='required';process.env.FAWRI_DEPLOYMENT_MODE='production';
  const {assertCashierOperatorManualDiscountAuthority:validate}=await import('../src/services/cashierOperatorDiscountAuthority.ts');
  const {withMerchantOperationalTransaction:primary}=await import('../src/services/operationalPostgresAuthority.ts');
  const {withMerchantAuthenticationTransaction:auth}=await import('../src/services/authenticationPostgresAuthority.ts');
  const {assertProductionDatabaseRlsReady:ready}=await import('../src/services/postgresRuntimeRlsSecurity.ts');
  const {hashPassword}=await import('../src/services/authPasswordService.ts');
  const {upsertCashierDiscountPolicy:upsertPolicy}=await import('../src/services/cashierDiscountPolicyAuthority.ts');
  const env={...process.env,NODE_ENV:'production',FAWRI_OPERATOR_DATABASE_URL:'postgresql://unused@127.0.0.1/fawri_ci'};
  for(const merchant of merchants){
    const row={merchant,station:`station-${merchant}`,cashier:`cashier-${merchant}`,manager:`manager-${merchant}`};
    await admin.query("INSERT INTO accounts(id,kind,phone,password_hash,state,phone_verified) VALUES($1,'merchant',$2,'synthetic','active',true)",[merchant,`+196${randomInt(100000000,999999999)}`]);
    await admin.query("INSERT INTO merchants(id,account_id,owner_name,store_name,activity_type,status,account_status) VALUES($1,$1,'Synthetic','Synthetic','retail','approved','approved')",[merchant]);
    await admin.query("INSERT INTO merchant_cashier_stations(id,merchant_id,name) VALUES($1,$2,'Synthetic')",[row.station,merchant]);
    await admin.query("INSERT INTO merchant_cashier_discount_settings(merchant_id,discount_kind) VALUES($1,'amount')",[merchant]);
    for(const[id,role]of [[row.cashier,'cashier'],[row.manager,'manager']]){
      await admin.query("INSERT INTO merchant_cashier_staff(id,merchant_id,display_name,role,pin_hash) VALUES($1,$2,'Synthetic',$3,$4)",[id,merchant,role,hashPassword('1357')]);
      await admin.query('INSERT INTO merchant_cashier_staff_permissions(merchant_id,staff_id,permission) VALUES($1,$2,$3)',[merchant,id,role==='manager'?'sale.discount_override':'sale.discount']);
      await admin.query('INSERT INTO merchant_cashier_staff_discount_policies(merchant_id,staff_id,enabled,max_percentage_bps,max_amount_minor,can_approve_override) VALUES($1,$2,true,10000,$3,$4)',[merchant,id,role==='manager'?500:100,role==='manager']);
    }
    row.input={context:{merchant_id:merchant,station_id:row.station,staff_id:row.cashier,permissions:['sale.discount']},body:{envelopes:[{entity_type:'sale',operation:'append',operation_id:`policy-op-${randomUUID()}`,occurred_at:new Date().toISOString(),payload:{lines:[{line_total_minor:1000}],manual_discount_minor:250,manual_discount_kind:'amount',manual_discount_reason:'synthetic authority probe'}}]}};
    rows.push(row);
  }
  const snapshot=async merchant=>{
    const result={};
    for(const table of ['merchant_cashier_staff','merchant_cashier_staff_permissions','merchant_cashier_staff_discount_policies','merchant_cashier_discount_settings','merchant_cashier_discount_override_approvals','cashier_operator_sessions']){
      result[table]=(await admin.query(`SELECT to_jsonb(t) AS row FROM ${table} t WHERE merchant_id=$1 ORDER BY to_jsonb(t)::text`,[merchant])).rows;
    }
    return result;
  };
  const a=rows[0],b=rows[1],beforeA=await snapshot(a.merchant),beforeB=await snapshot(b.merchant);
  // Preserve PostgreSQL microseconds when restoring the exact original row.
  const original=(await admin.query('SELECT enabled,max_percentage_bps,max_amount_minor,can_approve_override,version,created_at::text,updated_at::text FROM merchant_cashier_staff_discount_policies WHERE merchant_id=$1 AND staff_id=$2',[a.merchant,a.cashier])).rows[0];
  const observations={};
  await t.test('both real tenant contexts require approval before any mutation',async()=>{
    assert.deepEqual((await main.query('SELECT session_user AS login,current_user AS active')).rows[0],{login:fixture.role,active:fixture.role});
    await auth(a.merchant,async c=>assert.deepEqual((await c.query('SELECT session_user AS login,current_user AS active')).rows[0],{login:fixture.authRole,active:fixture.authRole}));
    for(const row of rows)await assert.rejects(()=>validate(row.input),{code:'CASHIER_MANUAL_DISCOUNT_OVERRIDE_REQUIRED'});
    await ready(env,main);
  });
  await t.test('measure primary own-limit change then identical validator decision and restore through auth',async()=>{
    try{
      try{
        await primary(a.merchant,async c=>{
          const changed=await c.query('UPDATE merchant_cashier_staff_discount_policies SET max_amount_minor=300,version=version+1,updated_at=now() WHERE merchant_id=$1 AND staff_id=$2 RETURNING staff_id',[a.merchant,a.cashier]);
          assert.equal(changed.rows.length,1);
        });
        observations.primaryPolicyMutation='ACCEPTED';
      }catch(error){if(error.code!=='42501')throw error;observations.primaryPolicyMutation='DENIED_42501';}
      try{await ready(env,main);observations.readiness='ACCEPTED';}catch(error){observations.readiness='REJECTED';observations.readinessCode=error.code;}
      try{await validate(a.input);observations.sameValidatorWithoutApproval='ACCEPTED';}
      catch(error){if(error.code!=='CASHIER_MANUAL_DISCOUNT_OVERRIDE_REQUIRED')throw error;observations.sameValidatorWithoutApproval='OVERRIDE_REQUIRED';}
      assert.equal(observations.primaryPolicyMutation,'DENIED_42501');assert.equal(observations.readiness,'ACCEPTED');assert.equal(observations.sameValidatorWithoutApproval,'OVERRIDE_REQUIRED');
      assert.deepEqual(await snapshot(a.merchant),beforeA);
      await auth(a.merchant,c=>upsertPolicy(c,{merchantId:a.merchant,staffId:a.cashier,policy:{enabled:true,max_percentage_bps:10000,max_amount_minor:300,can_approve_override:false}}));
      await validate(a.input);observations.trustedAuthPolicyPositive=true;
      const duringA=await snapshot(a.merchant);
      for(const table of Object.keys(beforeA).filter(x=>x!=='merchant_cashier_staff_discount_policies'))assert.deepEqual(duringA[table],beforeA[table]);
      assert.deepEqual(await snapshot(b.merchant),beforeB);
      await assert.rejects(()=>validate(b.input),{code:'CASHIER_MANUAL_DISCOUNT_OVERRIDE_REQUIRED'});
    }finally{
      await auth(a.merchant,c=>c.query(`UPDATE merchant_cashier_staff_discount_policies SET enabled=$3,max_percentage_bps=$4,max_amount_minor=$5,can_approve_override=$6,version=$7,created_at=$8,updated_at=$9 WHERE merchant_id=$1 AND staff_id=$2`,[a.merchant,a.cashier,original.enabled,original.max_percentage_bps,original.max_amount_minor,original.can_approve_override,original.version,original.created_at,original.updated_at]));
    }
    assert.deepEqual(await snapshot(a.merchant),beforeA);assert.deepEqual(await snapshot(b.merchant),beforeB);
    await assert.rejects(()=>validate(a.input),{code:'CASHIER_MANUAL_DISCOUNT_OVERRIDE_REQUIRED'});
    await ready(env,main);
  });
  const table='merchant_cashier_staff_discount_policies';let denialCases=0,grantCases=0;
  const columns=(await admin.query("SELECT attname FROM pg_attribute WHERE attrelid='public.merchant_cashier_staff_discount_policies'::regclass AND attnum>0 AND NOT attisdropped ORDER BY attnum")).rows.map(x=>x.attname);
  await t.test('primary denies all policy column updates and table insert delete truncate while own reads remain',async()=>{
    for(const column of columns){await assert.rejects(()=>primary(a.merchant,c=>c.query(`UPDATE ${table} SET ${column}=${column} WHERE merchant_id=$1`,[a.merchant])),{code:'42501'});denialCases++;}
    for(const sql of [`INSERT INTO ${table} SELECT * FROM ${table} WHERE FALSE`,`DELETE FROM ${table} WHERE merchant_id=$1`,`TRUNCATE TABLE ${table}`]){await assert.rejects(()=>primary(a.merchant,c=>c.query(sql,sql.includes('$1')?[a.merchant]:[])),{code:'42501'});denialCases++;}
    for(const merchant of merchants)await primary(merchant,async c=>{const read=await c.query(`SELECT merchant_id FROM ${table} WHERE merchant_id=ANY($1::text[])`,[merchants]);assert.equal(read.rows.length,2);assert.ok(read.rows.every(x=>x.merchant_id===merchant));});
    assert.deepEqual(await snapshot(a.merchant),beforeA);assert.deepEqual(await snapshot(b.merchant),beforeB);
  });
  await t.test('policy table and every mutation column grant fail readiness through reachable roles',async()=>{
    await admin.query(`CREATE ROLE ${grantRole} NOLOGIN NOSUPERUSER NOBYPASSRLS NOCREATEROLE NOINHERIT`);grantRoleCreated=true;
    const privileges=['INSERT','UPDATE','DELETE','TRUNCATE','TRIGGER','REFERENCES',...columns.flatMap(column=>[`UPDATE(${column})`,`INSERT(${column})`,`REFERENCES(${column})`])];
    const client=await main.connect();
    try{for(const privilege of privileges)for(const mode of ['direct','public','inherit-only','set-reachable','unreachable']){
      const grantee=mode==='direct'?fixture.role:mode==='public'?'PUBLIC':grantRole;
      try{
        await admin.query(`GRANT ${privilege} ON public.${table} TO ${grantee}`);
        if(!['direct','public'].includes(mode))await admin.query(`GRANT ${grantRole} TO ${fixture.role} WITH INHERIT ${mode==='inherit-only'?'TRUE':'FALSE'}, SET ${mode==='set-reachable'?'TRUE':'FALSE'}`);
        if(mode==='unreachable'){await ready(env,client);await assert.rejects(()=>client.query(`SET ROLE ${grantRole}`),{code:'42501'});}
        else{
          await assert.rejects(()=>ready(env,client),{code:'PRODUCTION_AUTH_MUTATION_AUTHORITY_REACHABLE'});
          if(mode==='direct')await admin.query(`GRANT ${grantRole} TO ${fixture.role} WITH INHERIT FALSE, SET TRUE`);
          if(['direct','set-reachable'].includes(mode)){await client.query(`SET ROLE ${grantRole}`);await assert.rejects(()=>ready(env,client),{code:'PRODUCTION_AUTH_MUTATION_AUTHORITY_REACHABLE'});}
        }
        grantCases++;
      }finally{await client.query('RESET ROLE');if(mode!=='public')await admin.query(`REVOKE ${grantRole} FROM ${fixture.role}`);await admin.query(`REVOKE ${privilege} ON public.${table} FROM ${grantee}`);}
      await ready(env,client);
    }}finally{await client.query('RESET ROLE');client.release();}
    assert.deepEqual(await snapshot(a.merchant),beforeA);assert.deepEqual(await snapshot(b.merchant),beforeB);
  });
  console.log('P0_CASHIER_DISCOUNT_POLICY_INTEGRITY_REMEDIATION '+JSON.stringify({diagnosticOnly:false,policyColumns:columns.length,denialCases,grantCases,actualLogins:2,merchants:2,initialLimitMinor:100,requestedDiscountMinor:250,mutatedLimitMinor:300,observations,policyRestoredExactly:true,otherMerchantUnchanged:true,staffPermissionPinSessionApprovalStateUnchanged:true,actualValidatorCalled:true,httpSaleExecuted:false,hostedCertified:false,releaseAccepted:false}));
});
