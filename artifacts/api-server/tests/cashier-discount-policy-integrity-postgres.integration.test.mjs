import assert from 'node:assert/strict';
import {randomInt,randomUUID} from 'node:crypto';
import test from 'node:test';
import {assertDisposablePostgres} from '../../../scripts/lib/disposable-postgres-test-guard.mjs';
import {cleanupResources} from './helpers/cleanup-resources.mjs';
import {createDisposableKnowledgeRuntime} from './helpers/disposable-knowledge-runtime.mjs';

await assertDisposablePostgres();
// Diagnostic baseline: a green run may record a policy-authority gap. This calls
// the real sale validator with a synthetic trusted context, not an HTTP sale.
test('measure own-policy mutation effect on actual manual-discount authority',{timeout:120000},async t=>{
  const fixture=await createDisposableKnowledgeRuntime(),admin=fixture.admin,main=fixture.runtimePool;
  const merchants=[`policy-a-${randomUUID()}`,`policy-b-${randomUUID()}`],rows=[];
  const saved={FAWRI_OPERATIONAL_POSTGRES_AUTHORITY:process.env.FAWRI_OPERATIONAL_POSTGRES_AUTHORITY,FAWRI_DEPLOYMENT_MODE:process.env.FAWRI_DEPLOYMENT_MODE};
  t.after(()=>cleanupResources([
    ['stations',()=>admin.query('DELETE FROM merchant_cashier_stations WHERE merchant_id=ANY($1::text[])',[merchants])],
    ['staff',()=>admin.query('DELETE FROM merchant_cashier_staff WHERE merchant_id=ANY($1::text[])',[merchants])],
    ['accounts',()=>admin.query('DELETE FROM accounts WHERE id=ANY($1::text[])',[merchants])],
    ['runtime',()=>fixture.dispose()],
    ['environment',async()=>{for(const[k,v]of Object.entries(saved)){if(v===undefined)delete process.env[k];else process.env[k]=v;}}],
  ]));
  process.env.FAWRI_OPERATIONAL_POSTGRES_AUTHORITY='required';process.env.FAWRI_DEPLOYMENT_MODE='production';
  const {assertCashierOperatorManualDiscountAuthority:validate}=await import('../src/services/cashierOperatorDiscountAuthority.ts');
  const {withMerchantOperationalTransaction:primary}=await import('../src/services/operationalPostgresAuthority.ts');
  const {withMerchantAuthenticationTransaction:auth}=await import('../src/services/authenticationPostgresAuthority.ts');
  const {assertProductionDatabaseRlsReady:ready}=await import('../src/services/postgresRuntimeRlsSecurity.ts');
  const {hashPassword}=await import('../src/services/authPasswordService.ts');
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
  console.log('P0_CASHIER_DISCOUNT_POLICY_INTEGRITY_BASELINE '+JSON.stringify({diagnosticOnly:true,actualLogins:2,merchants:2,initialLimitMinor:100,requestedDiscountMinor:250,mutatedLimitMinor:300,observations,policyRestoredExactly:true,otherMerchantUnchanged:true,staffPermissionPinSessionApprovalStateUnchanged:true,actualValidatorCalled:true,httpSaleExecuted:false,hostedCertified:false,releaseAccepted:false}));
});
