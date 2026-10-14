import test from 'node:test';
import assert from 'node:assert/strict';
import {sendReceiptReplayAction,ReceiptReplayFailure} from '../src/lib/receiptReplayClient';
const intent={authority:'bot_subscription' as const,order_id:'synthetic-order'};
const signal=()=>new AbortController().signal;
const reply=(status:string)=>({ok:true,status,applied:false,receipt_event_id:'event/one',...intent});
test('explicit review/execute uses one cookie/device POST with only existing-order intent',async()=>{
  for(const action of ['replay-review','replay'] as const){
    let calls=0;const controller=new AbortController();
    const result=await sendReceiptReplayAction(action,'event/one',{...intent,merchant_id:'must-drop'} as typeof intent,{'X-Fawri-Device-Id':'synthetic-device'},controller.signal,async(url,init)=>{
      calls++;assert.equal(url,`/api/auth/admin/billing/verified-receipts/event%2Fone/${action}`);assert.equal(init?.method,'POST');assert.equal(init?.credentials,'same-origin');assert.equal(init?.cache,'no-store');assert.equal(init?.signal,controller.signal);assert.deepEqual(init?.headers,{'X-Fawri-Device-Id':'synthetic-device','Content-Type':'application/json'});assert.deepEqual(JSON.parse(String(init?.body)),intent);
      return Response.json(reply(action==='replay-review'?'verified':'applied'));
    });assert.equal(result.status,action==='replay-review'?'verified':'applied');assert.equal(calls,1);
  }
});
test('server duplicate is success, identity-mismatched or optimistic responses cannot establish success',async()=>{
  assert.equal((await sendReceiptReplayAction('replay','event/one',intent,{},signal(),async()=>Response.json(reply('duplicate')))).status,'duplicate');
  for(const value of [{...reply('applied'),order_id:'another'},reply('verified'),{ok:true,paid:true}])await assert.rejects(sendReceiptReplayAction('replay','event/one',intent,{},signal(),async()=>Response.json(value)),error=>error instanceof ReceiptReplayFailure&&error.kind==='uncertain');
  await assert.rejects(sendReceiptReplayAction('replay-review','event/one',intent,{},signal(),async()=>Response.json({...reply('verified'),applied:true})),ReceiptReplayFailure);
});
test('denied/conflict responses consume no sensitive error body; server execution error stays uncertain',async()=>{
  for(const [status,kind] of [[403,'denied'],[409,'conflict'],[503,'uncertain']] as const)await assert.rejects(sendReceiptReplayAction('replay','event/one',intent,{},signal(),async()=>new Response('SENSITIVE_DRIVER_DETAIL',{status})),error=>error instanceof ReceiptReplayFailure&&error.kind===kind&&!error.message.includes('SENSITIVE'));
});
test('lost acknowledgement sends no automatic retry and cannot be reported as successful execution',async()=>{
  for(const action of ['replay-review','replay'] as const){let calls=0;await assert.rejects(sendReceiptReplayAction(action,'event/one',intent,{},signal(),async()=>{calls++;throw new Error('SENSITIVE_NETWORK_DETAIL');}),error=>error instanceof ReceiptReplayFailure&&error.kind===(action==='replay'?'uncertain':'unavailable'));assert.equal(calls,1);}
});
test('invalid intent sends no request; abort propagates instead of manufacturing a result',async()=>{
  let calls=0;await assert.rejects(sendReceiptReplayAction('replay','event/one',{...intent,order_id:''},{},signal(),async()=>{calls++;throw new Error('unexpected');}),ReceiptReplayFailure);assert.equal(calls,0);
  const controller=new AbortController();controller.abort();await assert.rejects(sendReceiptReplayAction('replay','event/one',intent,{},controller.signal,async()=>{controller.signal.throwIfAborted();throw new Error('unexpected');}),{name:'AbortError'});
});
