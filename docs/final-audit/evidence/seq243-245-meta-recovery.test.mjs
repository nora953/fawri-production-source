import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {stripTypeScriptTypes} from 'node:module';
import test from 'node:test';
const root=new URL('../../../',import.meta.url);
const read=p=>fs.readFileSync(new URL(p,root),'utf8');
function part(raw,a,b){const start=raw.indexOf(a),end=b?raw.indexOf(b,start):raw.length;assert.ok(start>=0&&end>start);return stripTypeScriptTypes(raw.slice(start,end),{mode:'transform'}).replace(/^export\s+/gm,'');}
const raw=read('artifacts/api-server/src/services/metaWebhookWorker.ts');
const refund=part(raw,'async function processMetaReplyRefundJob(','\nasync function processFakeMetaReplyJob(');
const reconcile=part(raw,'async function reconcileExpiredMetaJob(','\nasync function enqueueConfirmedFailureRefund(');
function worker(outcome){
  const calls=[];
  const fn=vm.runInNewContext(`(()=>{${refund};${reconcile};return reconcileExpiredMetaJob;})()`,{
    text:x=>String(x||'').trim(),jobError:(code,safeMessage,retryable,requeueSafe)=>Object.assign(new Error(safeMessage),{code,safeMessage,retryable,requeueSafe}),
    META_REPLY_REFUND_JOB_TYPE:'meta.reply.refund',META_CHANNEL_DISCONNECT_JOB_TYPE:'meta.channel.disconnect',META_REPLY_JOB_TYPE:'meta.webhook.reply',
    refundMerchantAutoReplyAuthoritative:async(id,reason)=>{calls.push({id,reason});if(outcome==='sql-error')throw Error('synthetic-private');return outcome;},
    reconcilePostgresMetaReplyJob:async()=>{calls.push({live:true});return {action:'complete',result:{synthetic:true}};},
    reconcileMetaReplyJob:async()=>{calls.push({fake:true});return {action:'complete',result:{synthetic:true}};},
  });return {fn,calls};
}
for(const [label,result,action,code] of [
  ['refunded',{refunded:true},'complete',undefined],
  ['already-refunded',{refunded:false,reason:'already_refunded'},'complete',undefined],
  ['balance-conflict',{refunded:false,reason:'refund_balance_conflict'},'dead_letter','META_REPLY_REFUND_CONFLICT'],
  ['reservation-missing',{refunded:false,reason:'reservation_not_found'},'retry','META_REPLY_REFUND_STATE_MISSING'],
  ['subscription-missing',{refunded:false,reason:'subscription_not_found'},'retry','META_REPLY_REFUND_STATE_MISSING'],
  ['unrecognized-rejection',{refunded:false,reason:'synthetic_unknown'},'dead_letter','META_REPLY_REFUND_REJECTED'],
  ['sql-error','sql-error','retry','META_REPLY_REFUND_UNAVAILABLE'],
])test(`SEQ243 expired refund ${label}`,async()=>{
  const w=worker(result),r=await w.fn({type:'meta.reply.refund',payload:{event_id:'synthetic-event'},dedupe_key:'fallback'},'live',null);
  assert.equal(r.action,action);if(code)assert.equal(r.code,code);assert.equal(w.calls[0].id,'synthetic-event');
  assert.equal(w.calls[0].reason,'META_REPLY_FAILED');assert.ok(!JSON.stringify(r).includes('synthetic-private'));
});
test('SEQ243 missing refund identity deadletters before financial adapter',async()=>{
  const w=worker({refunded:true}),r=await w.fn({type:'meta.reply.refund',payload:{},dedupe_key:''},'live',null);
  assert.equal(r.action,'dead_letter');assert.equal(r.code,'META_REFUND_JOB_INVALID');assert.equal(w.calls.length,0);
});
for(const mode of ['live','fake'])test(`SEQ244 reply ${mode} dispatches only matching reconciler`,async()=>{
  const w=worker({}),r=await w.fn({type:'meta.webhook.reply',payload:{}},mode,{});
  assert.equal(r.action,'complete');assert.equal(w.calls.length,1);assert.equal(w.calls[0][mode],true);
});
test('SEQ244 fake reply with absent transport deadletters',async()=>{
  const w=worker({}),r=await w.fn({type:'meta.webhook.reply',payload:{}},'fake',null);
  assert.equal(r.action,'dead_letter');assert.equal(r.code,'META_REPLY_TRANSPORT_UNAVAILABLE');assert.equal(w.calls.length,0);
});
test('SEQ244 channel disconnect recovery retries idempotent work',async()=>{
  const w=worker({}),r=await w.fn({type:'meta.channel.disconnect',payload:{}},'live',null);
  assert.equal(r.action,'retry');assert.equal(r.code,'META_CHANNEL_DISCONNECT_CLAIM_EXPIRED');assert.equal(w.calls.length,0);
});
const pgBody=part(read('artifacts/api-server/src/services/postgresMetaWebhookReplyTransport.ts'),'export async function reconcilePostgresMetaReplyJob(');
for(const [state,action,code] of [[null,'retry','META_REPLY_NOT_STARTED'],[{status:'reserved'},'retry','META_REPLY_NOT_STARTED'],[{status:'sent',transport_message_id:'synthetic-message'},'complete',null],[{status:'failed'},'retry','META_REPLY_FAILED'],[{status:'sending'},'dead_letter','META_REPLY_OUTCOME_UNCERTAIN'],[{status:'synthetic_unknown'},'dead_letter','META_REPLY_OUTCOME_UNCERTAIN'],['sql-error','dead_letter','META_JOB_RECONCILIATION_FAILED']]){
 test(`SEQ245 live reply state ${typeof state==='string'?state:state?.status||'missing'}`,async()=>{
  let queries=0;const fn=vm.runInNewContext(`(()=>{${pgBody};return reconcilePostgresMetaReplyJob;})()`,{text:x=>String(x||'').trim(),readPostgresMetaWebhookReplyState:async input=>{queries++;assert.equal(input.merchantId,'synthetic-merchant');assert.equal(input.eventId,'synthetic-event');if(state==='sql-error')throw Error('synthetic-private');return state;}});
  const r=await fn({merchant_id:'synthetic-merchant',dedupe_key:'synthetic-event',payload:{}});assert.equal(queries,1);assert.equal(r.action,action);if(code)assert.equal(r.code,code);if(action==='complete')assert.equal(r.result.transport_message_id,'synthetic-message');assert.ok(!JSON.stringify(r).includes('synthetic-private'));
 });
}
test('SEQ245 invalid live job identity deadletters before state lookup',async()=>{
  const fn=vm.runInNewContext(`(()=>{${pgBody};return reconcilePostgresMetaReplyJob;})()`,{text:x=>String(x||'').trim(),readPostgresMetaWebhookReplyState:async()=>{throw Error('must not query');}});
  const r=await fn({payload:{}});assert.equal(r.action,'dead_letter');assert.equal(r.code,'META_JOB_RECONCILIATION_INVALID');
});
