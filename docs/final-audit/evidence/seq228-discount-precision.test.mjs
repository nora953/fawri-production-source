import assert from 'node:assert/strict';
import test from 'node:test';
import { cashierManualDiscountLimitMinor, cashierManualDiscountWithinPolicy } from '../../../artifacts/api-server/src/services/cashierDiscountPolicy.ts';

const policy = bps => ({enabled:true,max_percentage_bps:bps,max_amount_minor:Number.MAX_SAFE_INTEGER,can_approve_override:false});
const limit = (total,bps) => cashierManualDiscountLimitMinor({postPromotionTotalMinor:total,policy:policy(bps),kind:'percentage'});
const exact = (total,bps) => Number(BigInt(total)*BigInt(bps)/10000n);

test('ordinary monetary inputs agree with independent integer arithmetic',()=>{
  for(const total of [0,1,99,10000,697910,1000000000])
    for(const bps of [0,1,3333,5000,9999,10000]) assert.equal(limit(total,bps),exact(total,bps));
});
test('unsafe total is rejected before percentage calculation',()=>{
  assert.throws(()=>limit(Number.MAX_SAFE_INTEGER+1,3333),{code:'CASHIER_DISCOUNT_POLICY_INVALID'});
});
test('admitted safe integer retains exact percentage floor near upper boundary',()=>{
  const total=9007199254740990,bps=3333;
  assert.equal(limit(total,bps),exact(total,bps));
});
test('percentage policy denies one minor unit above the exact mathematical cap',()=>{
  const total=9007199254740990,bps=3333;
  assert.equal(cashierManualDiscountWithinPolicy({postPromotionTotalMinor:total,policy:policy(bps),kind:'percentage',manualDiscountMinor:exact(total,bps)+1}),false);
});
