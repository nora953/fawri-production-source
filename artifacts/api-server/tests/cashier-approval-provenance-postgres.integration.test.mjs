import assert from 'node:assert/strict';
import {randomInt,randomUUID} from 'node:crypto';
import test from 'node:test';
import {assertDisposablePostgres} from '../../../scripts/lib/disposable-postgres-test-guard.mjs';
import {cleanupResources} from './helpers/cleanup-resources.mjs';
import {createDisposableKnowledgeRuntime} from './helpers/disposable-knowledge-runtime.mjs';

await assertDisposablePostgres();
// Diagnostic: a green run can prove an authority defect. Never call this remediation acceptance.
test('measure approval provenance using actual restricted LOGIN and real consumer',{timeout:120000},async t=>{
  const fixture=await createDisposableKnowledgeRuntime(),admin=fixture.admin,main=fixture.runtimePool;
  const merchants=[`approval-a-${randomUUID()}`,`approval-b-${randomUUID()}`],rows=[],observations={};
  const saved=Object.fromEntries(['FAWRI_OPERATIONAL_POSTGRES_AUTHORITY','FAWRI_DEPLOYMENT_MODE'].map(k=>[k,process.env[k]]));
  t.after(()=>cleanupResources([
    ...['merchant_cashier_discount_override_approvals','merchant_cashier_stations','merchant_cashier_staff'].map(table=>[table,()=>admin.query(`DELETE FROM ${table} WHERE merchant_id=ANY($1::text[])`,[merchants])]),
    ['accounts',()=>admin.query('DELETE FROM accounts WHERE id=ANY($1::text[])',[merchants])],
    ['runtime',()=>fixture.dispose()],
    ['environment',async()=>{for(const[k,v]of Object.entries(saved)){if(v===undefined)delete process.env[k];else process.env[k]=v;}}],
  ]));
  process.env.FAWRI_OPERATIONAL_POSTGRES_AUTHORITY='required';process.env.FAWRI_DEPLOYMENT_MODE='production';
  const {withMerchantOperationalTransaction:primary}=await import('../src/services/operationalPostgresAuthority.ts');
  const {issueCashierDiscountOverrideApprovalAuthoritative:issue,consumeCashierDiscountOverrideApproval:consume}=await import('../src/services/cashierDiscountOverrideAuthority.ts');
  const {assertCashierOperatorManualDiscountAuthority:validate}=await import('../src/services/cashierOperatorDiscountAuthority.ts');
  const {hashPassword}=await import('../src/services/authPasswordService.ts');
  const {assertProductionDatabaseRlsReady:ready}=await import('../src/services/postgresRuntimeRlsSecurity.ts');
  const env={...process.env,NODE_ENV:'production',FAWRI_OPERATOR_DATABASE_URL:'postgresql://unused@127.0.0.1/fawri_ci'};
  const request=row=>({context:{merchant_id:row.merchant,station_id:row.station,staff_id:row.cashier,permissions:['sale.discount']},approverStaffId:row.manager,pin:'1357',operationId:`approval-op-${randomUUID()}`,manualDiscountMinor:250,discountBaseMinor:1000,discountKind:'amount',reason:'synthetic provenance probe'});
  const input=(row,req,id)=>({merchantId:row.merchant,stationId:row.station,operatorStaffId:row.cashier,operationId:req.operationId,approvalId:id,saleOccurredAt:new Date().toISOString(),manualDiscountMinor:250,discountBaseMinor:1000,discountKind:'amount',reason:req.reason});
  const sale=(row,req,id)=>({context:req.context,body:{envelopes:[{entity_type:'sale',operation:'append',operation_id:req.operationId,occurred_at:new Date().toISOString(),payload:{lines:[{line_total_minor:1000}],manual_discount_minor:250,manual_discount_kind:'amount',manual_discount_reason:req.reason,...(id?{manual_discount_override_approval_id:id}:{})}}]}});
  const snapshot=async merchant=>{const out={};for(const table of ['merchant_cashier_staff','merchant_cashier_staff_permissions','merchant_cashier_staff_discount_policies','merchant_cashier_discount_settings','merchant_cashier_discount_override_approvals','cashier_operator_sessions'])out[table]=(await admin.query(`SELECT to_jsonb(t) AS row FROM ${table} t WHERE merchant_id=$1 ORDER BY to_jsonb(t)::text`,[merchant])).rows;return out;};
  for(const merchant of merchants){
    const row={merchant,station:`station-${merchant}`,cashier:`cashier-${merchant}`,manager:`manager-${merchant}`};
    await admin.query("INSERT INTO accounts(id,kind,phone,password_hash,state,phone_verified) VALUES($1,'merchant',$2,'synthetic','active',true)",[merchant,`+195${randomInt(100000000,999999999)}`]);
    await admin.query("INSERT INTO merchants(id,account_id,owner_name,store_name,activity_type,status,account_status) VALUES($1,$1,'Synthetic','Synthetic','retail','approved','approved')",[merchant]);
    await admin.query("INSERT INTO merchant_cashier_stations(id,merchant_id,name) VALUES($1,$2,'Synthetic')",[row.station,merchant]);
    await admin.query("INSERT INTO merchant_cashier_discount_settings(merchant_id,discount_kind) VALUES($1,'amount')",[merchant]);
    for(const[id,role]of [[row.cashier,'cashier'],[row.manager,'manager']]){
      await admin.query("INSERT INTO merchant_cashier_staff(id,merchant_id,display_name,role,pin_hash) VALUES($1,$2,'Synthetic',$3,$4)",[id,merchant,role,hashPassword('1357')]);
      await admin.query('INSERT INTO merchant_cashier_staff_permissions(merchant_id,staff_id,permission) VALUES($1,$2,$3)',[merchant,id,role==='manager'?'sale.discount_override':'sale.discount']);
      await admin.query('INSERT INTO merchant_cashier_staff_discount_policies(merchant_id,staff_id,enabled,max_percentage_bps,max_amount_minor,can_approve_override) VALUES($1,$2,true,10000,$3,$4)',[merchant,id,role==='manager'?500:100,role==='manager']);
    }
    row.req=request(row);row.approval=await issue(row.req);rows.push(row);
  }
  const [a,b]=rows;
  await t.test('real login missing approval denial genuine issuance consume and exact replay',async()=>{
    assert.deepEqual((await main.query('SELECT session_user AS login,current_user AS active')).rows[0],{login:fixture.role,active:fixture.role});
    await ready(env,main);
    for(const row of rows){
      await assert.rejects(()=>validate(sale(row,row.req)),{code:'CASHIER_MANUAL_DISCOUNT_OVERRIDE_REQUIRED'});
      await validate(sale(row,row.req,row.approval.approval_id));
      const before=await snapshot(row.merchant);await validate(sale(row,row.req,row.approval.approval_id));assert.deepEqual(await snapshot(row.merchant),before);
    }
  });
  const beforeA=await snapshot(a.merchant),beforeB=await snapshot(b.merchant);
  await t.test('cross merchant insertion and actual consumption remain denied',async()=>{
    await assert.rejects(()=>primary(a.merchant,c=>c.query("INSERT INTO merchant_cashier_discount_override_approvals(id,merchant_id,station_id,operator_staff_id,approver_staff_id,operation_id,manual_discount_minor,manual_discount_reason,expires_at) VALUES($1,$2,$3,$4,$5,$6,250,'foreign',now()+interval '1 minute')",[`foreign-${randomUUID()}`,b.merchant,b.station,b.cashier,b.manager,`foreign-${randomUUID()}`])),{code:'42501'});
    await assert.rejects(()=>primary(a.merchant,c=>consume(c,input(a,b.req,b.approval.approval_id))),{code:'CASHIER_DISCOUNT_OVERRIDE_INVALID'});
    assert.deepEqual(await snapshot(a.merchant),beforeA);assert.deepEqual(await snapshot(b.merchant),beforeB);
  });
  await t.test('measure primary forged pending and consumed approval through unchanged actual validator',async()=>{
    for(const consumed of [false,true]){
      const req=request(a),id=`forged-${randomUUID()}`,key=consumed?'forgedConsumed':'forgedPending';
      try{
        try{await primary(a.merchant,c=>c.query(`INSERT INTO merchant_cashier_discount_override_approvals(id,merchant_id,station_id,operator_staff_id,approver_staff_id,operation_id,manual_discount_minor,manual_discount_reason,expires_at,consumed_at) VALUES($1,$2,$3,$4,$5,$6,250,$7,now()+interval '5 minutes',${consumed?'now()':'NULL'})`,[id,a.merchant,a.station,a.cashier,a.manager,req.operationId,req.reason]));observations[key]={mutation:'ACCEPTED'};}
        catch(e){if(e.code!=='42501')throw e;observations[key]={mutation:'DENIED_42501'};}
        if(observations[key].mutation==='ACCEPTED'){
          // No issuance service or PIN call for this id/operation.
          await validate(sale(a,req,id));observations[key].actualValidator='ACCEPTED_WITHOUT_ISSUANCE';
          assert.ok((await admin.query('SELECT consumed_at FROM merchant_cashier_discount_override_approvals WHERE id=$1',[id])).rows[0].consumed_at);
        }else await assert.rejects(()=>validate(sale(a,req,id)),{code:'CASHIER_DISCOUNT_OVERRIDE_INVALID'});
      }finally{await admin.query('DELETE FROM merchant_cashier_discount_override_approvals WHERE id=$1 AND merchant_id=$2',[id,a.merchant]);}
      assert.deepEqual(await snapshot(a.merchant),beforeA);assert.deepEqual(await snapshot(b.merchant),beforeB);
    }
  });
  await t.test('measure immutable binding and consumed marker mutation with exact transaction rollback',async()=>{
    for(const mode of ['binding','clearConsumed']){
      let reached=false;
      await assert.rejects(()=>primary(a.merchant,async c=>{
        const req={...a.req,operationId:mode==='binding'?`rebound-${randomUUID()}`:a.req.operationId};
        try{
          const result=await c.query(mode==='binding'?'UPDATE merchant_cashier_discount_override_approvals SET operation_id=$2 WHERE id=$1 RETURNING id':'UPDATE merchant_cashier_discount_override_approvals SET consumed_at=NULL WHERE id=$1 RETURNING id',mode==='binding'?[a.approval.approval_id,req.operationId]:[a.approval.approval_id]);
          assert.equal(result.rows.length,1);observations[mode]={mutation:'ACCEPTED'};
        }catch(e){if(e.code!=='42501')throw e;observations[mode]={mutation:'DENIED_42501'};throw Error('probe rollback');}
        await consume(c,input(a,req,a.approval.approval_id));observations[mode].actualConsumer='ACCEPTED';reached=true;throw Error('probe rollback');
      }),{message:'probe rollback'});
      assert.equal(reached,observations[mode].mutation==='ACCEPTED');
      assert.deepEqual(await snapshot(a.merchant),beforeA);assert.deepEqual(await snapshot(b.merchant),beforeB);
    }
    await ready(env,main);
  });
  console.log('P0_CASHIER_APPROVAL_PROVENANCE_BASELINE '+JSON.stringify({diagnosticOnly:true,actualLogins:2,merchants:2,observations,realIssuanceConsumeReplay:true,crossTenantDenied:true,exactSnapshotRestoration:true,httpSaleExecuted:false,hostedCertified:false,releaseAccepted:false}));
});
