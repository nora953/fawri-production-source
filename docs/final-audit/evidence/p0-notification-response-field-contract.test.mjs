// Candidate assessment only. This projection is not imported by application code.
// Source-derived synthetic objects + actual frontend client; no SQL or app HTTP.
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { isMerchantNotificationRecord, readMerchantNotificationsAuthority, markMerchantNotificationReadAuthority } from '../../../artifacts/fawri/src/lib/merchantNotificationsAuthority.ts';
const contract = JSON.parse(readFileSync(new URL('./P0-NOTIFICATION-PRODUCER-FIELD-MAP-20261025.json', import.meta.url))).responseFieldContract;
const shapes = new Map(contract.types.map(shape => [shape.type, shape]));
const time = '2026-10-25T00:00:00.000Z';
const date = '2026-11-25T00:00:00.000Z';
const values = {
  subscription_balance_purchase: { purchased_replies:100, emergency_debt_paid:20, addon_replies_added:80, emergency_debt_remaining:0, base_replies_remaining:10, emergency_replies_remaining:0, addon_replies_remaining:80, total_replies_available:90, addon_batch_id:'batch', addon_batch_expires_at:date },
  subscription_plan_event: { operation:'change', plan_name:'silver', previous_plan_name:'gold', start_date:time, expires_at:date, emergency_debt_paid:0, emergency_debt_remaining:0, base_replies_remaining:10, addon_replies_remaining:0, total_replies_available:10 },
  subscription_emergency_activated: { addon_batch_id:'emergency', emergency_replies_added:100, emergency_debt:100, expires_at:date },
  subscription_expiry_reminder: { plan_name:'silver', expires_at:date, days_remaining:5 },
  subscription_expired: { plan_name:'gold', expired_at:time, addon_replies_remaining:8 },
  addon_expiry_reminder: { addon_batch_id:'batch', source:'purchase', remaining_replies:80, expires_at:date, days_remaining:6 },
  inspection_session_request: { ticket_id:'ticket', inspection_request_id:'request', ticket_subject:'Subject', admin_name:'Support', mode:'independent_read_only', request_expires_at:date, action_url:'/dashboard/support?ticket=ticket', request_status:'approved', consent_decision:'approved', responded_at:time, session_expires_at:date, ended_at:time, end_reason:'merchant_terminated' },
  support_reply_reminder: { ticket_id:'ticket', ticket_subject:'Subject', action_url:'/dashboard/support?ticket=ticket' },
  operational_new_order: { order_id:'order', conversation_id:'conversation', action_url:'/dashboard/orders?order=order' },
  operational_payment_conflict: { order_id:'order', conversation_id:'conversation', provider:'fake', action_url:'/dashboard/conversations?conversation=conversation' },
  operational_knowledge_gap: { training_request_id:'training', conversation_id:'conversation', action_url:'/dashboard/conversations?conversation=conversation' },
  operational_customer_message: { conversation_id:'conversation', action_url:'/dashboard/conversations?conversation=conversation' },
};
const fixtures = Object.entries(values).map(([type, fields]) => ({id:`synthetic-${type}`, type, created_at:time, read_at:time, ...fields}));
function candidate(record) {
  const shape = shapes.get(record.type);
  const allowed = [...contract.common.required, ...contract.common.optional, ...(shape ? [...shape.required, ...shape.optional, ...shape.permittedExtraKeys] : [])];
  return Object.fromEntries(allowed.filter(key => Object.hasOwn(record,key)).map(key => [key,record[key]]));
}
function mockFetch(t, body) {
  const original = globalThis.fetch;
  t.after(() => { globalThis.fetch = original; });
  globalThis.fetch = async () => new Response(JSON.stringify(body), {status:200, headers:{'Content-Type':'application/json'}});
}
test('candidate preserves every declared field of all twelve source-derived valid client shapes', () => {
  assert.deepEqual(new Set(Object.keys(values)), new Set(shapes.keys()));
  for (const record of fixtures) {
    const shape = shapes.get(record.type);
    assert.deepEqual(new Set(Object.keys(record)),new Set([...contract.common.required,...contract.common.optional,...shape.required,...shape.optional]));
    assert.equal(isMerchantNotificationRecord(record),true,record.type);
    assert.deepEqual(candidate(record),record,record.type);
    assert.equal(isMerchantNotificationRecord(candidate(record)),true,record.type);
  }
});
test('current actual client accepts extra fields; candidate removes them without claiming a SQL leak or public input path', async t => {
  const original = fixtures.map(record => ({...record,synthetic_extra:{note:'owned fixture only'},merchant_id:'synthetic-internal-column'}));
  const snapshot = structuredClone(original);
  mockFetch(t,{ok:true,notifications:original});
  const accepted = await readMerchantNotificationsAuthority();
  assert.deepEqual(accepted,original);
  for (const record of accepted) {
    const projected = candidate(record);
    assert.equal(Object.hasOwn(projected,'synthetic_extra'),false);
    assert.equal(Object.hasOwn(projected,'merchant_id'),false);
    assert.equal(isMerchantNotificationRecord(projected),true);
  }
  assert.deepEqual(original,snapshot);
  const extraBusiness = {...fixtures.find(r=>r.type==='operational_customer_message'),order_id:'synthetic-existing-extension-contract'};
  assert.equal(isMerchantNotificationRecord(extraBusiness),true);
  assert.equal(Object.hasOwn(candidate(extraBusiness),'order_id'),false);
});
test('absent optional fields remain absent and missing required fields stay invalid for all twelve shapes', () => {
  for (const record of fixtures) {
    const minimal = {...record};
    for (const key of [...contract.common.optional,...shapes.get(record.type).optional]) delete minimal[key];
    assert.equal(isMerchantNotificationRecord(candidate(minimal)),true,record.type);
    assert.deepEqual(candidate(minimal),minimal);
    for (const key of shapes.get(record.type).required) {
      const missing = {...minimal}; delete missing[key];
      assert.equal(isMerchantNotificationRecord(candidate(missing)),false,`${record.type}:${key}`);
    }
  }
});
test('candidate cannot repair unlinked inspection shapes or coerce invalid typed fields and unsafe URLs', () => {
  const inspection = {...fixtures.find(r=>r.type==='inspection_session_request')};
  delete inspection.request_status;
  assert.equal(isMerchantNotificationRecord(candidate(inspection)),false);
  const old = {id:'old',type:'inspection_session_request',created_at:time,ticket_id:'ticket',request_id:'request',action_url:'/dashboard/support'};
  assert.equal(isMerchantNotificationRecord(candidate(old)),false);
  const customer = fixtures.find(r=>r.type==='operational_customer_message');
  assert.equal(isMerchantNotificationRecord(candidate({...customer,action_url:'//example.invalid'})),false);
  assert.equal(isMerchantNotificationRecord(candidate({...customer,conversation_id:null})),false);
});
test('unknown type retains a canonical row and whole-response rejection rather than silently changing list/count semantics', async t => {
  const unknown = {id:'unknown',type:'synthetic_unknown',created_at:time,synthetic_extra:'fixture'};
  const projected = candidate(unknown);
  assert.deepEqual(projected,{id:'unknown',type:'synthetic_unknown',created_at:time});
  assert.equal(isMerchantNotificationRecord(projected),false);
  const rows = [candidate(fixtures[0]),projected];
  assert.equal(rows.length,2);
  mockFetch(t,{ok:true,notifications:rows});
  await assert.rejects(readMerchantNotificationsAuthority,/merchant notification authority unavailable/);
});
test('actual read client keeps path identity and read_at checks after candidate minimization', async t => {
  const record = candidate(fixtures[0]);
  mockFetch(t,{ok:true,notification:record});
  assert.deepEqual(await markMerchantNotificationReadAuthority(record.id),record);
  await assert.rejects(markMerchantNotificationReadAuthority('another-path-id'),/merchant notification read mutation failed/);
  mockFetch(t,{ok:true,notification:{...record,read_at:undefined}});
  await assert.rejects(markMerchantNotificationReadAuthority(record.id),/merchant notification read mutation failed/);
});
