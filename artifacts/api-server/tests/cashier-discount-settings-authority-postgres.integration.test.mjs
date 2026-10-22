import assert from 'node:assert/strict';
import {randomInt,randomUUID} from 'node:crypto';
import test from 'node:test';
import {assertDisposablePostgres} from '../../../scripts/lib/disposable-postgres-test-guard.mjs';
import {cleanupResources} from './helpers/cleanup-resources.mjs';
import {createDisposableKnowledgeRuntime} from './helpers/disposable-knowledge-runtime.mjs';

await assertDisposablePostgres();
// Bounded settings authority diagnostic. A clean run is not remediation acceptance.
test('measure discount settings authority while preserving authorized management invariants',{timeout:120000},async t=>{
  const fixture=await createDisposableKnowledgeRuntime(),admin=fixture.admin,main=fixture.runtimePool;
  const merchants=[`kind-a-${randomUUID()}`,`kind-b-${randomUUID()}`],rows=[];
  const saved={FAWRI_OPERATIONAL_POSTGRES_AUTHORITY:process.env.FAWRI_OPERATIONAL_POSTGRES_AUTHORITY,FAWRI_DEPLOYMENT_MODE:process.env.FAWRI_DEPLOYMENT_MODE};
  t.after(()=>cleanupResources([
    ['approvals',()=>admin.query('DELETE FROM merchant_cashier_discount_override_approvals WHERE merchant_id=ANY($1::text[])',[merchants])],
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
  const {issueCashierDiscountOverrideApprovalAuthoritative:issue,consumeCashierDiscountOverrideApproval:consume}=await import('../src/services/cashierDiscountOverrideAuthority.ts');
  const {updateMerchantCashierDiscountSetting:updateSetting}=await import('../src/services/cashierMerchantDiscountSettingsAuthority.ts');
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
  const [a,b]=rows,observations={};
  const envelope=a.input.body.envelopes[0];
  const request={context:a.input.context,approverStaffId:a.manager,pin:'1357',operationId:envelope.operation_id,manualDiscountMinor:250,discountBaseMinor:1000,discountKind:'amount',reason:envelope.payload.manual_discount_reason};
  const approval=await issue(request);
  const beforeA=await snapshot(a.merchant),beforeB=await snapshot(b.merchant);
  const original=(await admin.query('SELECT discount_kind,version,created_at::text,updated_at::text FROM merchant_cashier_discount_settings WHERE merchant_id=$1',[a.merchant])).rows[0];
  const approvalRow=(await admin.query('SELECT to_jsonb(t) AS row FROM merchant_cashier_discount_override_approvals t WHERE id=$1',[approval.approval_id])).rows[0].row;
  const percentageInput=JSON.parse(JSON.stringify(a.input));percentageInput.body.envelopes[0].payload.manual_discount_kind='percentage';
  const consumeInput={merchantId:a.merchant,stationId:a.station,operatorStaffId:a.cashier,operationId:request.operationId,approvalId:approval.approval_id,saleOccurredAt:new Date().toISOString(),manualDiscountMinor:250,discountBaseMinor:1000,discountKind:'percentage',reason:request.reason};
  const restore=()=>auth(a.merchant,async c=>{
    await c.query('UPDATE merchant_cashier_discount_settings SET discount_kind=$2,version=$3,created_at=$4,updated_at=$5 WHERE merchant_id=$1',[a.merchant,original.discount_kind,original.version,original.created_at,original.updated_at]);
    await c.query('DELETE FROM merchant_cashier_discount_override_approvals WHERE merchant_id=$1 AND id=$2',[a.merchant,approval.approval_id]);
    await c.query('INSERT INTO merchant_cashier_discount_override_approvals SELECT * FROM jsonb_populate_record(NULL::public.merchant_cashier_discount_override_approvals,$1::jsonb)',[JSON.stringify(approvalRow)]);
  });
  await t.test('actual role and original settings enforce ordinary approval and tenant boundaries',async()=>{
    assert.deepEqual((await main.query('SELECT session_user AS login,current_user AS active')).rows[0],{login:fixture.role,active:fixture.role});
    for(const row of rows)await assert.rejects(()=>validate(row.input),{code:'CASHIER_MANUAL_DISCOUNT_OVERRIDE_REQUIRED'});
    await assert.rejects(()=>validate(percentageInput),{code:'CASHIER_DISCOUNT_KIND_MISMATCH'});
    await primary(a.merchant,async c=>assert.equal((await c.query('UPDATE merchant_cashier_discount_settings SET version=version WHERE merchant_id=$1 RETURNING merchant_id',[b.merchant])).rows.length,0));
    await ready(env,main);assert.deepEqual(await snapshot(a.merchant),beforeA);assert.deepEqual(await snapshot(b.merchant),beforeB);
  });
  await t.test('measure configuration mutation admission and unchanged business validation then restore exactly',async()=>{
    try{
      try{await primary(a.merchant,async c=>assert.equal((await c.query("UPDATE merchant_cashier_discount_settings SET discount_kind='percentage',version=version+1,updated_at=now() WHERE merchant_id=$1 RETURNING merchant_id",[a.merchant])).rows.length,1));observations.primaryMutation='ACCEPTED';}
      catch(e){if(e.code!=='42501')throw e;observations.primaryMutation='DENIED_42501';}
      try{await ready(env,main);observations.readiness='ACCEPTED';}catch(e){observations.readiness='REJECTED';observations.readinessCode=e.code;}
      if(observations.primaryMutation==='ACCEPTED'){
        try{await validate(percentageInput);observations.actualValidator='ACCEPTED';}catch(e){observations.actualValidator='REJECTED';observations.validatorCode=e.code;}
        const pending=(await admin.query('SELECT consumed_at FROM merchant_cashier_discount_override_approvals WHERE id=$1',[approval.approval_id])).rows;
        observations.pendingEvidenceRetained=pending.length===1&&pending[0].consumed_at===null;
        if(observations.pendingEvidenceRetained){try{await primary(a.merchant,c=>consume(c,consumeInput));observations.actualConsumer='ACCEPTED';}catch(e){observations.actualConsumer='REJECTED';observations.consumerCode=e.code;}}
      }
      const during=await snapshot(a.merchant);
      for(const table of Object.keys(beforeA).filter(x=>!['merchant_cashier_discount_settings','merchant_cashier_discount_override_approvals'].includes(x)))assert.deepEqual(during[table],beforeA[table]);
      assert.deepEqual(await snapshot(b.merchant),beforeB);
    }finally{await restore();}
    assert.deepEqual(await snapshot(a.merchant),beforeA);assert.deepEqual(await snapshot(b.merchant),beforeB);
    await assert.rejects(()=>validate(a.input),{code:'CASHIER_MANUAL_DISCOUNT_OVERRIDE_REQUIRED'});
    await ready(env,main);
  });
  await t.test('authorized management retains version checks and atomic pending-only invalidation',async()=>{
    try{
      const updated=await primary(a.merchant,c=>updateSetting(c,{merchantId:a.merchant,expectedVersion:Number(original.version),discountKind:'percentage'}));
      assert.equal(updated.discount_kind,'percentage');assert.equal(updated.version,Number(original.version)+1);
      assert.equal((await admin.query('SELECT id FROM merchant_cashier_discount_override_approvals WHERE id=$1',[approval.approval_id])).rows.length,0);
      await assert.rejects(()=>primary(a.merchant,c=>consume(c,consumeInput)),{code:'CASHIER_DISCOUNT_OVERRIDE_INVALID'});
      await assert.rejects(()=>primary(a.merchant,c=>updateSetting(c,{merchantId:a.merchant,expectedVersion:Number(original.version),discountKind:'amount'})),{code:'CASHIER_DISCOUNT_KIND_VERSION_CONFLICT'});
      observations.authorizedManagement=true;
    }finally{await restore();}
    await assert.rejects(()=>primary(a.merchant,async c=>{await updateSetting(c,{merchantId:a.merchant,expectedVersion:Number(original.version),discountKind:'percentage'});throw Error('settings rollback');}),{message:'settings rollback'});
    assert.deepEqual(await snapshot(a.merchant),beforeA);assert.deepEqual(await snapshot(b.merchant),beforeB);
  });
  console.log('P0_CASHIER_DISCOUNT_SETTINGS_AUTHORITY_BASELINE '+JSON.stringify({diagnosticOnly:true,actualLogins:2,merchants:2,observations,authorizedManagementVersionInvalidationRollback:true,crossTenantDenied:true,exactSnapshotRestoration:true,httpSaleExecuted:false,hostedCertified:false,releaseAccepted:false}));
});
