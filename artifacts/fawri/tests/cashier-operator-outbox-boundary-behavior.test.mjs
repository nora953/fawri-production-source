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
