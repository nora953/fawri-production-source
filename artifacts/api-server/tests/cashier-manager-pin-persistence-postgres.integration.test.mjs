import assert from 'node:assert/strict';
import {randomInt,randomUUID} from 'node:crypto';
import test from 'node:test';
import {assertDisposablePostgres} from '../../../scripts/lib/disposable-postgres-test-guard.mjs';
import {cleanupResources} from './helpers/cleanup-resources.mjs';
import {createDisposableKnowledgeRuntime} from './helpers/disposable-knowledge-runtime.mjs';

await assertDisposablePostgres();
test('manager override PIN failures persist and enforce lockout on actual database LOGINs',{timeout:90000},async t=>{
  const fixture=await createDisposableKnowledgeRuntime(),admin=fixture.admin;
  const main=fixture.runtimePool,originalQuery=main.query,originalConnect=main.connect;
  let tenantPool,primaryCalls=0;
  const nonce=randomUUID(),merchant=`manager-pin-${nonce}`,station=`manager-station-${nonce}`;
  const cashier=`manager-requester-${nonce}`,manager=`manager-approver-${nonce}`;
  const savedAuthority=process.env.FAWRI_OPERATIONAL_POSTGRES_AUTHORITY;
  const savedMode=process.env.FAWRI_DEPLOYMENT_MODE,authUrl=process.env.FAWRI_AUTH_DATABASE_URL;
  t.after(()=>cleanupResources([
    ['primary methods',async()=>{main.query=originalQuery;main.connect=originalConnect;}],
    ['tenant commerce pool',()=>tenantPool?.end()],
    ['approvals',()=>admin.query('DELETE FROM merchant_cashier_discount_override_approvals WHERE merchant_id=$1',[merchant])],
    ['stations',()=>admin.query('DELETE FROM merchant_cashier_stations WHERE merchant_id=$1',[merchant])],
    ['staff',()=>admin.query('DELETE FROM merchant_cashier_staff WHERE merchant_id=$1',[merchant])],
    ['accounts',()=>admin.query('DELETE FROM accounts WHERE id=$1',[merchant])],
    ['runtime fixture',()=>fixture.dispose()],
    ['environment',async()=>{for(const[k,v]of Object.entries({FAWRI_OPERATIONAL_POSTGRES_AUTHORITY:savedAuthority,FAWRI_DEPLOYMENT_MODE:savedMode})){if(v===undefined)delete process.env[k];else process.env[k]=v;}}],
  ]));
  process.env.FAWRI_OPERATIONAL_POSTGRES_AUTHORITY='required';
  process.env.FAWRI_DEPLOYMENT_MODE='production';
  const {Pool}=await import('pg');tenantPool=new Pool({connectionString:process.env.DATABASE_URL,max:3,connectionTimeoutMillis:5000});
  const {hashPassword}=await import('../src/services/authPasswordService.ts');
  const {issueCashierDiscountOverrideApprovalAuthoritative:issue,consumeCashierDiscountOverrideApproval:consume}=await import('../src/services/cashierDiscountOverrideAuthority.ts');
  const {withOperationalTransaction}=await import('../src/services/operationalPostgresAuthority.ts');
  const {issueMerchantTransactionScope}=await import('../src/services/tenantTransactionScope.ts');
  const {closeAuthenticationPool:closeAuth,withAuthenticationTransaction}=await import('../src/services/authenticationPostgresAuthority.ts');
  await admin.query("INSERT INTO accounts(id,kind,phone,password_hash,state,phone_verified) VALUES($1,'merchant',$2,'synthetic','active',true)",[merchant,`+198${randomInt(100000000,999999999)}`]);
  await admin.query("INSERT INTO merchants(id,account_id,owner_name,store_name,activity_type,status,account_status) VALUES($1,$1,'Synthetic','Synthetic','retail','approved','approved')",[merchant]);
  await admin.query("INSERT INTO merchant_cashier_stations(id,merchant_id,name) VALUES($1,$2,'Synthetic')",[station,merchant]);
  for(const [id,role,pin]of [[cashier,'cashier','2468'],[manager,'manager','1357']]){
    await admin.query('INSERT INTO merchant_cashier_staff(id,merchant_id,display_name,role,pin_hash) VALUES($1,$2,$3,$4,$5)',[id,merchant,'Synthetic',role,hashPassword(pin)]);
    await admin.query('INSERT INTO merchant_cashier_staff_permissions(merchant_id,staff_id,permission) VALUES($1,$2,$3)',[merchant,id,role==='manager'?'sale.discount_override':'sale.discount']);
    await admin.query('INSERT INTO merchant_cashier_staff_discount_policies(merchant_id,staff_id,enabled,max_percentage_bps,max_amount_minor,can_approve_override) VALUES($1,$2,true,10000,$3,$4)',[merchant,id,role==='manager'?500:100,role==='manager']);
  }
  const input=pin=>({context:{merchant_id:merchant,station_id:station,staff_id:cashier,permissions:['sale.discount']},approverStaffId:manager,pin,operationId:`manager-operation-${randomUUID()}`,manualDiscountMinor:250,discountBaseMinor:1000,discountKind:'amount',reason:'synthetic approval'});
  const state=async()=>(await admin.query('SELECT failed_pin_attempts,pin_locked_until FROM merchant_cashier_staff WHERE id=$1',[manager])).rows[0];
  const approvalCount=async()=>Number((await admin.query('SELECT count(*) AS n FROM merchant_cashier_discount_override_approvals WHERE merchant_id=$1',[merchant])).rows[0].n);
  const reset=async()=>{await admin.query('DELETE FROM merchant_cashier_discount_override_approvals WHERE merchant_id=$1',[merchant]);await admin.query("UPDATE merchant_cashier_staff SET failed_pin_attempts=0,pin_locked_until=NULL,role='manager',status='active',revoked_at=NULL WHERE id=$1",[manager]);};
  const consumption=(request,approval,overrides={})=>({merchantId:merchant,stationId:station,operatorStaffId:cashier,operationId:request.operationId,approvalId:approval.approval_id,saleOccurredAt:new Date().toISOString(),manualDiscountMinor:250,discountBaseMinor:1000,discountKind:'amount',reason:'synthetic approval',...overrides});
  const commerce=work=>withOperationalTransaction(async client=>{await issueMerchantTransactionScope(client,merchant);return work(client);},tenantPool);
  main.query=async()=>{primaryCalls++;throw Error('manager approval borrowed primary query');};
  main.connect=async()=>{primaryCalls++;throw Error('manager approval borrowed primary lease');};
  await t.test('five wrong PINs persist counters and block the correct PIN until lock expiry',async()=>{
    const counters=[],codes=[];let validPinApproved=false,correctPinCode;
    for(let i=0;i<5;i++){
      try{await issue(input('9999'));codes.push('UNEXPECTED_SUCCESS');}catch(error){codes.push(error.code);}
      counters.push((await admin.query('SELECT failed_pin_attempts FROM merchant_cashier_staff WHERE id=$1',[manager])).rows[0].failed_pin_attempts);
    }
    try{await issue(input('1357'));validPinApproved=true;}catch(error){correctPinCode=error.code;}
    const state=(await admin.query('SELECT failed_pin_attempts,pin_locked_until FROM merchant_cashier_staff WHERE id=$1',[manager])).rows[0];
    console.log('P0_MANAGER_PIN_PERSISTENCE_OBSERVATION '+JSON.stringify({counters,codes,validPinApproved,correctPinCode,locked:state.pin_locked_until!==null,hostedCertified:false,releaseAccepted:false}));
    assert.deepEqual(counters,[1,2,3,4,0],'wrong PIN state must survive transaction completion');
    assert.deepEqual(codes,['CASHIER_OPERATOR_INVALID','CASHIER_OPERATOR_INVALID','CASHIER_OPERATOR_INVALID','CASHIER_OPERATOR_INVALID','CASHIER_PIN_LOCKED']);
    assert.equal(validPinApproved,false,'correct PIN must not bypass an active lock');assert.equal(correctPinCode,'CASHIER_PIN_LOCKED');
    assert.ok(state.pin_locked_until.getTime()>Date.now()+14*60000);
    assert.equal(await approvalCount(),0);
  });
  await t.test('concurrent wrong attempts share the durable threshold and cannot create approvals',async()=>{
    await reset();
    const attempts=await Promise.allSettled(Array.from({length:8},()=>issue(input('9999'))));
    assert.equal(attempts.filter(x=>x.status==='rejected'&&x.reason.code==='CASHIER_OPERATOR_INVALID').length,4);
    assert.equal(attempts.filter(x=>x.status==='rejected'&&x.reason.code==='CASHIER_PIN_LOCKED').length,4);
    const actual=await state();assert.equal(actual.failed_pin_attempts,0);assert.ok(actual.pin_locked_until.getTime()>Date.now());
    assert.equal(await approvalCount(),0);
  });
  await t.test('an expired lock allows a valid PIN and clears failure state on successful approval',async()=>{
    await reset();await admin.query("UPDATE merchant_cashier_staff SET failed_pin_attempts=3,pin_locked_until=now()-interval '1 second' WHERE id=$1",[manager]);
    const approved=await issue(input('1357'));assert.ok(approved.approval_id);assert.equal(approved.approver_staff_id,manager);
    assert.deepEqual(await state(),{failed_pin_attempts:0,pin_locked_until:null});assert.equal(await approvalCount(),1);
  });
  await t.test('self/missing/disabled/non-manager/permission/policy and malformed PIN refusals preserve counters',async()=>{
    await reset();await admin.query('UPDATE merchant_cashier_staff SET failed_pin_attempts=2 WHERE id=$1',[manager]);
    for(const [patch,code]of [[{approverStaffId:cashier},'CASHIER_DISCOUNT_OVERRIDE_SELF_APPROVAL_FORBIDDEN'],[{approverStaffId:'missing-synthetic-manager'},'CASHIER_DISCOUNT_OVERRIDE_APPROVER_REQUIRED'],[{pin:'bad-pin'},'CASHIER_OPERATOR_INVALID'],[{context:{...input('').context,permissions:[]}},'CASHIER_MANUAL_DISCOUNT_PERMISSION_REQUIRED']])
      await assert.rejects(()=>issue({...input('1357'),...patch}),{code});
    for(const change of ["status='disabled'","role='cashier'"]){
      await admin.query(`UPDATE merchant_cashier_staff SET ${change} WHERE id=$1`,[manager]);
      try{await assert.rejects(()=>issue(input('1357')),{code:'CASHIER_DISCOUNT_OVERRIDE_APPROVER_REQUIRED'});}
      finally{await admin.query("UPDATE merchant_cashier_staff SET status='active',role='manager' WHERE id=$1",[manager]);}
    }
    await admin.query("DELETE FROM merchant_cashier_staff_permissions WHERE staff_id=$1 AND permission='sale.discount_override'",[manager]);
    try{await assert.rejects(()=>issue(input('1357')),{code:'CASHIER_DISCOUNT_OVERRIDE_PERMISSION_REQUIRED'});}
    finally{await admin.query("INSERT INTO merchant_cashier_staff_permissions(merchant_id,staff_id,permission) VALUES($1,$2,'sale.discount_override')",[merchant,manager]);}
    await admin.query('UPDATE merchant_cashier_staff_discount_policies SET can_approve_override=false WHERE staff_id=$1',[manager]);
    try{await assert.rejects(()=>issue(input('1357')),{code:'CASHIER_DISCOUNT_OVERRIDE_PERMISSION_REQUIRED'});}
    finally{await admin.query('UPDATE merchant_cashier_staff_discount_policies SET can_approve_override=true WHERE staff_id=$1',[manager]);}
    assert.deepEqual(await state(),{failed_pin_attempts:2,pin_locked_until:null});assert.equal(await approvalCount(),0);
  });
  await t.test('SQL insert failure and manager limit failure roll back valid-PIN resets without approval',async()=>{
    await reset();await admin.query('UPDATE merchant_cashier_staff SET failed_pin_attempts=3 WHERE id=$1',[manager]);
    await admin.query(`REVOKE INSERT ON merchant_cashier_discount_override_approvals FROM ${fixture.authRole}`);
    try{await assert.rejects(()=>issue(input('1357')),{code:'42501'});}
    finally{await admin.query(`GRANT INSERT ON merchant_cashier_discount_override_approvals TO ${fixture.authRole}`);}
    assert.deepEqual(await state(),{failed_pin_attempts:3,pin_locked_until:null});
    await assert.rejects(()=>issue({...input('1357'),manualDiscountMinor:900}),{code:'CASHIER_DISCOUNT_OVERRIDE_MANAGER_LIMIT_EXCEEDED'});
    assert.deepEqual(await state(),{failed_pin_attempts:3,pin_locked_until:null});assert.equal(await approvalCount(),0);
  });
  await t.test('duplicate operation rollback preserves one approval and the previous failure count',async()=>{
    await reset();const request=input('1357'),approved=await issue(request);
    await admin.query('UPDATE merchant_cashier_staff SET failed_pin_attempts=2 WHERE id=$1',[manager]);
    await assert.rejects(()=>issue(request),{code:'CASHIER_DISCOUNT_OVERRIDE_OPERATION_CONFLICT'});
    assert.deepEqual(await state(),{failed_pin_attempts:2,pin_locked_until:null});assert.equal(await approvalCount(),1);
    assert.equal((await admin.query('SELECT id FROM merchant_cashier_discount_override_approvals WHERE merchant_id=$1',[merchant])).rows[0].id,approved.approval_id);
  });
  await t.test('actual tenant cannot read PIN hashes while commerce retains locked non-secret consumption and rollback',async()=>{
    await reset();const request=input('1357'),approved=await issue(request),use=consumption(request,approved);
    const identity=(await tenantPool.query('SELECT session_user AS login,current_user AS active')).rows[0];assert.deepEqual(identity,{login:fixture.role,active:fixture.role});
    await assert.rejects(()=>tenantPool.query('SELECT pin_hash FROM merchant_cashier_staff WHERE id=$1',[manager]),{code:'42501'});
    const authIdentity=await withAuthenticationTransaction(async c=>(await c.query('SELECT session_user AS login,current_user AS active')).rows[0]);assert.deepEqual(authIdentity,{login:fixture.authRole,active:fixture.authRole});
    const captured=[];
    await assert.rejects(()=>commerce(async client=>{
      const target={query:async(sql,values)=>{captured.push(sql);return client.query(sql,values);}};
      await consume(target,use);throw Error('synthetic commerce rollback');
    }),{message:'synthetic commerce rollback'});
    const projection=captured.find(sql=>sql.includes('public.fawri_lock_cashier_approver('));
    assert.ok(projection);assert.doesNotMatch(projection,/pin_hash/);
    const definition=(await admin.query("SELECT pg_get_functiondef('public.fawri_lock_cashier_approver(text,text)'::regprocedure) AS body")).rows[0].body;
    assert.match(definition,/FOR UPDATE/);assert.match(definition,/fawri_security\.allows_merchant/);assert.doesNotMatch(definition,/pin_hash/);
    assert.equal((await admin.query('SELECT consumed_at FROM merchant_cashier_discount_override_approvals WHERE id=$1',[approved.approval_id])).rows[0].consumed_at,null);
    await commerce(c=>consume(c,use));
    const consumed=(await admin.query('SELECT consumed_at FROM merchant_cashier_discount_override_approvals WHERE id=$1',[approved.approval_id])).rows[0].consumed_at;assert.ok(consumed);
    await commerce(c=>consume(c,use));
    assert.deepEqual((await admin.query('SELECT consumed_at FROM merchant_cashier_discount_override_approvals WHERE id=$1',[approved.approval_id])).rows[0].consumed_at,consumed);
    await assert.rejects(()=>commerce(c=>consume(c,{...use,reason:'different-synthetic-reason'})),{code:'CASHIER_DISCOUNT_OVERRIDE_INVALID'});
    await assert.rejects(()=>commerce(c=>consume(c,{...use,saleOccurredAt:new Date(Date.now()+3600000).toISOString()})),{code:'CASHIER_DISCOUNT_OVERRIDE_EXPIRED'});
  });
  await t.test('concurrent matching consumption updates once and pre-consumption demotion remains authoritative',async()=>{
    await reset();const request=input('1357'),approved=await issue(request),use=consumption(request,approved);let updates=0;
    await Promise.all([1,2].map(()=>commerce(client=>consume({query:async(sql,values)=>{if(sql.includes('FROM public.fawri_consume_cashier_discount_approval('))updates++;return client.query(sql,values);}},use))));
    assert.equal(updates,1);
    await reset();const request2=input('1357'),approved2=await issue(request2);
    await admin.query("UPDATE merchant_cashier_staff SET role='cashier' WHERE id=$1",[manager]);
    try{await assert.rejects(()=>commerce(c=>consume(c,consumption(request2,approved2))),{code:'CASHIER_DISCOUNT_OVERRIDE_APPROVER_REQUIRED'});}
    finally{await admin.query("UPDATE merchant_cashier_staff SET role='manager' WHERE id=$1",[manager]);}
    assert.equal((await admin.query('SELECT consumed_at FROM merchant_cashier_discount_override_approvals WHERE id=$1',[approved2.approval_id])).rows[0].consumed_at,null);
  });
  await t.test('marker revocation and missing/tenant auth URL reject issuance without primary fallback',async()=>{
    await reset();await admin.query('UPDATE merchant_cashier_staff SET failed_pin_attempts=3 WHERE id=$1',[manager]);
    await admin.query(`REVOKE EXECUTE ON FUNCTION public.fawri_authentication_runtime() FROM ${fixture.authRole}`);
    try{await assert.rejects(()=>issue(input('1357')),{code:'AUTH_DATABASE_IDENTITY_INVALID'});}
    finally{await admin.query(`GRANT EXECUTE ON FUNCTION public.fawri_authentication_runtime() TO ${fixture.authRole}`);}
    for(const url of [undefined,process.env.DATABASE_URL]){
      await closeAuth();if(url===undefined)delete process.env.FAWRI_AUTH_DATABASE_URL;else process.env.FAWRI_AUTH_DATABASE_URL=url;
      try{await assert.rejects(()=>issue(input('1357')),{code:url===undefined?'AUTH_DATABASE_REQUIRED':'AUTH_DATABASE_IDENTITY_INVALID'});}
      finally{await closeAuth();process.env.FAWRI_AUTH_DATABASE_URL=authUrl;}
    }
    assert.deepEqual(await state(),{failed_pin_attempts:3,pin_locked_until:null});assert.equal(await approvalCount(),0);
  });
  assert.equal(primaryCalls,0);
  console.log('P0_MANAGER_PIN_PERSISTENCE_PROOF '+JSON.stringify({actualRestrictedLogins:2,durableWrongPinCounter:true,fiveAttemptLockout:true,concurrentFailuresSerialized:true,expiredLockRecovery:true,authorizationRefusalsPreserved:true,insertConflictBusinessRollback:true,tenantPinReadDenied:true,nonSecretCommerceForUpdatePreserved:true,consumptionRollbackReplayConcurrency:true,demotionBeforeConsumeDenied:true,markerMissingTenantUrlDenied:true,primaryPoolCalls:primaryCalls,hostedCertified:false,releaseAccepted:false}));
});
