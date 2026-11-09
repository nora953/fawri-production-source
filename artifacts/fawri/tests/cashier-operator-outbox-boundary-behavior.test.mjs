import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';

const source=await readFile(new URL('../src/lib/cashierOperatorCloudSync.ts',import.meta.url),'utf8');
const limit=1000;
class OperatorSyncError extends Error {
  constructor(code,message,status){
    super(message);
    this.code=code;
    this.status=status;
  }
}
function actualFunction(start,end,name) {
  const a=source.indexOf(start),b=source.indexOf(end,a);
  assert.ok(a>=0 && b>a, 'real '+name+' production code must be found');
  const block=source.slice(a,b);
  const javascript=ts.transpileModule(block,{
    compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None}
  }).outputText;
  return new Function('MAX_PENDING_ENVELOPES','CashierOperatorCloudSyncError',
    javascript+';return '+name+';')(limit,OperatorSyncError);
}
const complete=actualFunction('function completeOperationWindow(', '\nfunction operationKind(','completeOperationWindow');
const group=actualFunction('function groupByOperation(', '\n/**\n * Peek one envelope','groupByOperation');
const kind=actualFunction('function operationKind(', '\nfunction commonBody(','operationKind');
const e=(id,seq)=>({operation_id:id,device_sequence:seq});
const many=(count,offset=0)=>Array.from({length:count},(_,i)=>e('op-'+(offset+i),offset+i+1));
const denied=(run,code)=>assert.throws(run,error=>error instanceof OperatorSyncError && error.code===code);

test('live cashier operator reads 1001 envelopes, never sends the lookahead item',()=>{
  assert.match(source,/listPendingSync\(MAX_PENDING_ENVELOPES \+ 1\)/);
  assert.match(source,/const uploadable = completeOperationWindow\(batch\)/);
  assert.match(source,/const pending = batch\.slice\(0, MAX_PENDING_ENVELOPES\)/);
});

test('operator 999 and exact 1000 complete outbox envelopes are not stalled',()=>{
  assert.equal(complete(many(999)).length,999);
  assert.deepEqual(complete(many(1000)),many(1000));
  const exactOperation=Array.from({length:1000},()=>e('one-op',1));
  assert.deepEqual(complete(exactOperation),exactOperation);
  assert.equal(group(complete(exactOperation)).size,1);
});

test('operator 1001st different operation leaves it pending without discarding the 1000th',()=>{
  const outbox=many(1001);
  assert.deepEqual(complete(outbox),outbox.slice(0,1000));
  assert.equal(group(complete(outbox)).size,1000);
});

test('operator boundary split preserves the whole boundary operation and older complete operations',()=>{
  const outbox=[...many(999),e('split',1000),e('split',1000)];
  const selected=complete(outbox);
  assert.deepEqual(selected,outbox.slice(0,999));
  assert.equal(group(selected).size,999);
});

test('operator 1001-envelope single operation is rejected, not partially uploaded',()=>{
  const outbox=Array.from({length:1001},()=>e('too-big',1));
  denied(()=>complete(outbox),'CASHIER_OPERATOR_OPERATION_TOO_LARGE');
});

test('operator boundary rejects duplicate sequence across different operation IDs',()=>{
  denied(()=>complete([...many(1000),e('forged-op',1000)]),'CASHIER_OPERATOR_OUTBOX_CORRUPT');
  denied(()=>complete([...many(1000),e('older-op',999)]),'CASHIER_OPERATOR_OUTBOX_CORRUPT');
  denied(()=>complete([...many(1000),e('op-999',1001)]),'CASHIER_OPERATOR_OUTBOX_CORRUPT');
  denied(()=>complete([...many(1000),e('',1001)]),'CASHIER_OPERATOR_OUTBOX_CORRUPT');
  denied(()=>complete([...many(1000),e('next',Number.NaN)]),'CASHIER_OPERATOR_OUTBOX_CORRUPT');
});

test('operator repeated operation ID after a different group is fail-closed',()=>{
  denied(()=>group([e('op-a',1),e('op-b',2),e('op-a',1)]),'CASHIER_OPERATOR_OUTBOX_CORRUPT');
  denied(()=>group([e('op-a',1),e('op-b',2),e('op-a',3)]),'CASHIER_OPERATOR_OUTBOX_CORRUPT');
  denied(()=>group([e('op-a',1),e('op-a',2)]),'CASHIER_OPERATOR_OUTBOX_CORRUPT');
  denied(()=>group([e('op-a',2),e('op-b',1)]),'CASHIER_OPERATOR_OUTBOX_CORRUPT');
  assert.equal(group([e('op-a',1),e('op-a',1),e('op-b',2),e('op-c',3)]).size,3);
});

test('operator classifies only one primary financial event and ordinary inventory companions',()=>{
  const anchor=(entity_type,operation,id='root')=>({entity_type,operation,operation_id:id,device_sequence:1});
  const sale=anchor('sale','append'),movement=anchor('inventory_movement','append');
  const refund=anchor('return','append'),voided=anchor('sale','void');
  assert.equal(kind([sale]),'sale');
  assert.equal(kind([sale,movement,movement]),'sale');
  assert.equal(kind([refund,movement]),'return');
  assert.equal(kind([voided,movement]),'void');
  // An inventory adjustment is durable local history, NOT an uploadable sale.
  assert.equal(kind([movement]),'skip');
  assert.equal(kind([]),'skip');
});

test('operator blocks corrupted multi-primary groups before network and leaves history pending',()=>{
  const item=(entity_type,operation,entity_id)=>({
    entity_type,operation,entity_id,operation_id:'op-1',device_sequence:1,
  });
  const sale=item('sale','append','sale-1'),refund=item('return','append','return-1');
  const voided=item('sale','void','sale-1'),movement=item('inventory_movement','append','movement-1');
  for(const group of [
    [sale,refund], [sale,voided], [refund,voided], [sale,sale],
    [refund,refund],[voided,voided],[sale,refund,movement],
    [sale,item('unknown','append','other')],
    [sale,item('inventory_movement','void','movement-2')],
    [item('unknown','append','other')],
    [item('return','void','return-1')],
  ]) assert.equal(kind(group),'skip',JSON.stringify(group));
  // The existing full-batch preflight rejects "skip" before any fetch:
  const preflight=source.indexOf('for (const [, envelopes] of groups)');
  const rejectAt=source.indexOf('CASHIER_OPERATOR_UNSUPPORTED_OPERATION',preflight);
  const upload=source.indexOf('const uploadedResult = await postOperation(',preflight);
  assert.ok(preflight>=0 && rejectAt>preflight && upload>rejectAt);
});

function actualOperatorDrainWrapper(core) {
  const start=source.indexOf('let operatorOutboxSyncInProgress = false;');
  const end=source.indexOf('async function performCashierOperatorOutboxSync(',start);
  assert.ok(start>=0 && end>start,'same-app-instance cashier serialization guard is present');
  const block=source.slice(start,end).replace('export async function','async function');
  const javascript=ts.transpileModule(block,{
    compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None}
  }).outputText;
  return new Function('performCashierOperatorOutboxSync','CashierOperatorCloudSyncError',
    javascript+';return syncCashierOperatorOutboxToCloud;')(core,OperatorSyncError);
}

test('manual and automatic operator outbox drains cannot run in parallel in one app instance',async()=>{
  let settle;let runs=0;
  const sync=actualOperatorDrainWrapper(async()=>{
    runs++;
    return new Promise(resolve=>{settle=resolve;});
  });
  const first=sync();
  assert.equal(runs,1);
  await assert.rejects(sync(),error=>
    error instanceof OperatorSyncError &&
    error.code==='CASHIER_OPERATOR_SYNC_IN_PROGRESS' && error.status===409);
  assert.equal(runs,1,'rejected contender must not open IndexedDB or call provider');
  const answer={pending_before:1,pending_after:0,acknowledged_operations:1};
  settle(answer);
  assert.deepEqual(await first,answer);
  const second=sync();
  assert.equal(runs,2,'after final ACK the mutex must release');
  settle(answer);
  assert.deepEqual(await second,answer);
});

test('operator sync lock releases on failure and never silently reports success',async()=>{
  let count=0;const bad=new OperatorSyncError('CASHIER_OPERATOR_ACK_INVALID','invalid ack',409);
  const sync=actualOperatorDrainWrapper(async()=>{
    count++;
    if(count===1) throw bad;
    return {pending_before:1,pending_after:1,acknowledged_operations:0};
  });
  await assert.rejects(sync(),error=>error===bad);
  assert.deepEqual(await sync(),{
    pending_before:1,pending_after:1,acknowledged_operations:0,
  });
  assert.equal(count,2);
});

test('manual and auto entrypoints interpret same-process in-progress drain without false retry success',async()=>{
  const [automatic,manual]=await Promise.all([
    readFile(new URL('../src/cashierMain.tsx',import.meta.url),'utf8'),
    readFile(new URL('../src/pages/CashierCatalogSyncPage.tsx',import.meta.url),'utf8'),
  ]);
  assert.match(automatic,/syncErrorCode\(cause\) === 'CASHIER_OPERATOR_SYNC_IN_PROGRESS'/);
  assert.match(automatic,/nextOutboxAttemptAt = Date\.now\(\) \+ AUTO_SYNC_RETRY_BACKOFF_MS/);
  assert.match(manual,/cause\.code === 'CASHIER_OPERATOR_SYNC_IN_PROGRESS'/);
  assert.match(manual,/setError\(labels\.wait\)/);
  assert.match(source,/return await performCashierOperatorOutboxSync\(\)/);
  assert.match(source,/finally \{\s*operatorOutboxSyncInProgress = false;/);
});
