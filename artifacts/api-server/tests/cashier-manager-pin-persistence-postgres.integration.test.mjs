import assert from 'node:assert/strict';
import {randomInt,randomUUID} from 'node:crypto';
import test from 'node:test';
import {assertDisposablePostgres} from '../../../scripts/lib/disposable-postgres-test-guard.mjs';
import {cleanupResources} from './helpers/cleanup-resources.mjs';
import {createDisposableKnowledgeRuntime} from './helpers/disposable-knowledge-runtime.mjs';

await assertDisposablePostgres();
test('manager override PIN failures persist and enforce lockout on actual database LOGINs',{timeout:90000},async t=>{
  const fixture=await createDisposableKnowledgeRuntime(),admin=fixture.admin;
  const nonce=randomUUID(),merchant=`manager-pin-${nonce}`,station=`manager-station-${nonce}`;
  const cashier=`manager-requester-${nonce}`,manager=`manager-approver-${nonce}`;
  const savedAuthority=process.env.FAWRI_OPERATIONAL_POSTGRES_AUTHORITY;
  t.after(()=>cleanupResources([
    ['approvals',()=>admin.query('DELETE FROM merchant_cashier_discount_override_approvals WHERE merchant_id=$1',[merchant])],
    ['stations',()=>admin.query('DELETE FROM merchant_cashier_stations WHERE merchant_id=$1',[merchant])],
    ['staff',()=>admin.query('DELETE FROM merchant_cashier_staff WHERE merchant_id=$1',[merchant])],
    ['accounts',()=>admin.query('DELETE FROM accounts WHERE id=$1',[merchant])],
    ['runtime fixture',()=>fixture.dispose()],
    ['environment',async()=>{if(savedAuthority===undefined)delete process.env.FAWRI_OPERATIONAL_POSTGRES_AUTHORITY;else process.env.FAWRI_OPERATIONAL_POSTGRES_AUTHORITY=savedAuthority;}],
  ]));
  process.env.FAWRI_OPERATIONAL_POSTGRES_AUTHORITY='required';
  const {hashPassword}=await import('../src/services/authPasswordService.ts');
  const {issueCashierDiscountOverrideApprovalAuthoritative:issue}=await import('../src/services/cashierDiscountOverrideAuthority.ts');
  await admin.query("INSERT INTO accounts(id,kind,phone,password_hash,state,phone_verified) VALUES($1,'merchant',$2,'synthetic','active',true)",[merchant,`+198${randomInt(100000000,999999999)}`]);
  await admin.query("INSERT INTO merchants(id,account_id,owner_name,store_name,activity_type,status,account_status) VALUES($1,$1,'Synthetic','Synthetic','retail','approved','approved')",[merchant]);
  await admin.query("INSERT INTO merchant_cashier_stations(id,merchant_id,name) VALUES($1,$2,'Synthetic')",[station,merchant]);
  for(const [id,role,pin]of [[cashier,'cashier','2468'],[manager,'manager','1357']]){
    await admin.query('INSERT INTO merchant_cashier_staff(id,merchant_id,display_name,role,pin_hash) VALUES($1,$2,$3,$4,$5)',[id,merchant,'Synthetic',role,hashPassword(pin)]);
    await admin.query('INSERT INTO merchant_cashier_staff_permissions(merchant_id,staff_id,permission) VALUES($1,$2,$3)',[merchant,id,role==='manager'?'sale.discount_override':'sale.discount']);
    await admin.query('INSERT INTO merchant_cashier_staff_discount_policies(merchant_id,staff_id,enabled,max_percentage_bps,max_amount_minor,can_approve_override) VALUES($1,$2,true,10000,$3,$4)',[merchant,id,role==='manager'?500:100,role==='manager']);
  }
  const input=pin=>({context:{merchant_id:merchant,station_id:station,staff_id:cashier,permissions:['sale.discount']},approverStaffId:manager,pin,operationId:`manager-operation-${randomUUID()}`,manualDiscountMinor:250,discountBaseMinor:1000,discountKind:'amount',reason:'synthetic approval'});
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
  });
});
