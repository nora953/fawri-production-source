// Local client-contract checks on source-derived synthetic shapes.
// No SQL, application HTTP server, legacy producer execution or external network.
import assert from 'node:assert/strict';
import test from 'node:test';
import {isMerchantNotificationRecord,readMerchantNotificationsAuthority} from '../../../artifacts/fawri/src/lib/merchantNotificationsAuthority.ts';
const common={id:'synthetic-legacy-notice',merchant_id:'synthetic-merchant',created_at:'2026-10-25T00:00:00.000Z'};
const legacyJson=[
  {...common,type:'subscription_balance_purchase',purchased_replies:100,emergency_debt_paid:20,addon_replies_added:80,emergency_debt_remaining:0,base_replies_remaining:10,emergency_replies_remaining:0,addon_replies_remaining:80,total_replies_available:90,addon_batch_id:'synthetic-batch',addon_batch_expires_at:'2026-11-25T00:00:00.000Z'},
  {...common,type:'subscription_plan_event',operation:'change',plan_name:'silver',previous_plan_name:'gold',start_date:'2026-10-25T00:00:00.000Z',expires_at:'2026-11-25T00:00:00.000Z',emergency_debt_paid:0,emergency_debt_remaining:0,base_replies_remaining:10,addon_replies_remaining:0,total_replies_available:10},
  {...common,type:'subscription_emergency_activated',addon_batch_id:'synthetic-emergency',emergency_replies_added:100,emergency_debt:100,expires_at:'2027-01-25T00:00:00.000Z'},
];
const olderSqlInspection={...common,type:'inspection_session_request',ticket_id:'synthetic-ticket',request_id:'synthetic-request',action_url:'/dashboard/support?ticket=synthetic-ticket'};
const currentInspection={...common,type:'inspection_session_request',ticket_id:'synthetic-ticket',inspection_request_id:'synthetic-request',ticket_subject:'Synthetic subject',admin_name:'Synthetic support',mode:'independent_read_only',request_expires_at:'2026-10-25T00:10:00.000Z',action_url:'/dashboard/support?ticket=synthetic-ticket'};
test('three source-defined legacy JSON subscription shapes remain structurally frontend-compatible',()=>{
  for(const value of legacyJson)assert.equal(isMerchantNotificationRecord(value),true,value.type);
});
test('older SQL inspection request_id shape is not compatible with current frontend contract',()=>{
  assert.equal(isMerchantNotificationRecord(olderSqlInspection),false);
});
test('current inspection shape needs authoritative lifecycle enrichment rather than a renamed legacy key',()=>{
  assert.equal(isMerchantNotificationRecord({...olderSqlInspection,inspection_request_id:olderSqlInspection.request_id,request_status:'pending'}),false);
  assert.equal(isMerchantNotificationRecord(currentInspection),false);
  assert.equal(isMerchantNotificationRecord({...currentInspection,request_status:'pending'}),true);
  assert.equal(isMerchantNotificationRecord({...currentInspection,request_status:'approved',consent_decision:'approved',responded_at:'2026-10-25T00:01:00.000Z',session_expires_at:'2026-10-25T00:31:00.000Z',ended_at:'2026-10-25T00:02:00.000Z',end_reason:'merchant_terminated'}),true);
});
test('actual client rejects a mixed response containing an incompatible historical-style shape',async t=>{
  const original=globalThis.fetch;let calls=0;t.after(()=>{globalThis.fetch=original;});
  globalThis.fetch=async()=>{calls++;return new Response(JSON.stringify({ok:true,notifications:[legacyJson[0],olderSqlInspection]}),{status:200,headers:{'Content-Type':'application/json'}});};
  await assert.rejects(readMerchantNotificationsAuthority,/merchant notification authority unavailable/);assert.equal(calls,1);
});
