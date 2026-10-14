import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fork} from 'node:child_process';
import {once} from 'node:events';
import {stripTypeScriptTypes} from 'node:module';
import vm from 'node:vm';
import test from 'node:test';
import {queue,read} from './seq233-worker-child.mjs';

async function fixture(t){
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'fawri-owned-worker-'));
  const child=fork(new URL('./seq233-worker-child.mjs',import.meta.url),['child',dir],{
    env:{PATH:process.env.PATH,NODE_ENV:'test'},stdio:['ignore','ignore','pipe','ipc']});
  const exit=once(child,'exit');let errors='';child.stderr.on('data',x=>{errors+=x;});
  t.after(async()=>{if(child.exitCode===null)child.kill('SIGKILL');await exit;fs.rmSync(dir,{recursive:true,force:true});});
  const message=await Promise.race([once(child,'message'),exit.then(x=>{throw Error('child exited before claim '+x+' '+errors);})]);
  assert.equal(message[0].type,'started');
  return {dir,child,exit,q:queue(dir)};
}
test('SEQ233 real child paused handler completes after explicit stop and resume', {timeout:5000},async t=>{
  const f=await fixture(t);f.child.send('stop-resume');const [code,signal]=await f.exit;
  assert.equal(code,0);assert.equal(signal,null);assert.equal(f.q.listDurableJobs()[0].status,'completed');
  assert.equal(fs.readFileSync(path.join(f.dir,'effects.txt'),'utf8').split('\n').filter(Boolean).length,1);
});
test('SEQ233 observation: real SIGTERM exits zero with durable processing claim unfinished',{timeout:5000},async t=>{
  const f=await fixture(t);f.child.kill('SIGTERM');const [code,signal]=await f.exit;
  assert.equal(code,0);assert.equal(signal,null);assert.equal(f.q.listDurableJobs()[0].status,'processing');
  assert.equal(fs.readFileSync(path.join(f.dir,'events.txt'),'utf8'),'dispose\n');
});
test('SEQ233 acceptance: successful shutdown drains the already running handler',{timeout:5000},async t=>{
  const f=await fixture(t);f.child.kill('SIGTERM');await f.exit;
  assert.equal(f.q.listDurableJobs()[0].status,'completed','existing OPS-WORKER-DRAIN-001: handler killed before completion');
});
for(const mode of ['uncertain','complete','reconciliation-error']){
  test(`SEQ234 restart after SIGTERM: ${mode}`,{timeout:5000},async t=>{
    const f=await fixture(t);f.child.kill('SIGTERM');await f.exit;
    const original=f.q.listDurableJobs()[0];const future=new Date(Date.parse(original.lease_expires_at)+1000);
    class Clock extends Date {constructor(...args){super(...(args.length?args:[future.getTime()]));}static now(){return future.getTime();}}
    const q=queue(f.dir,Clock);let executions=0;
    const worker=q.startDurableJobWorker({workerId:'restart',pollIntervalMs:60000,visibilityTimeoutMs:60000,
      handlers:{audit:async()=>{executions++;}},
      ...(mode==='complete'?{reconcileExpiredJob:()=>({action:'complete',result:{recovered:true}})}:{}),
      ...(mode==='reconciliation-error'?{reconcileExpiredJob:()=>{throw Error('synthetic-reconciliation-fault');}}:{})});
    try{await worker.runOnce();}finally{worker.stop();}
    const recovered=q.listDurableJobs()[0];assert.equal(executions,0);assert.equal(recovered.id,original.id);
    if(mode==='complete'){assert.equal(recovered.status,'completed');assert.equal(recovered.result.recovered,true);}
    else{assert.equal(recovered.status,'dead_letter');assert.equal(recovered.requeue_policy,'blocked');
      assert.throws(()=>q.requeueDeadLetterJob(recovered.id),{code:'DURABLE_JOB_REQUEUE_BLOCKED'});
      assert.equal(recovered.last_error_code,mode==='uncertain'?'JOB_VISIBILITY_TIMEOUT_OUTCOME_UNCERTAIN':'JOB_RECONCILIATION_FAILED');}
  });
}
test('SEQ235 actual PostgreSQL worker body stop does not abort in-flight completion',{timeout:5000},async()=>{
  const raw=read('artifacts/api-server/src/services/postgresDurableJobQueue.ts');
  const start=raw.indexOf('export function startDurableJobWorkerAuthoritative(');
  assert.ok(start>=0);const source=stripTypeScriptTypes(raw.slice(start),{mode:'transform'}).replace(/^export\s+/gm,'');
  let release,started;const gate=new Promise(ok=>{release=ok;});const claimed=new Promise(ok=>{started=ok;});
  let claims=0,completed=0;
  const startWorker=vm.runInNewContext(`(()=>{${source};return startDurableJobWorkerAuthoritative;})()`,{
    operationalPostgresAuthorityRequired:()=>true,text:x=>x,positiveInteger:(x,f)=>x||f,
    DEFAULT_VISIBILITY_TIMEOUT_MS:300000,DEFAULT_POLL_INTERVAL_MS:1000,
    merchantIds:async()=>['synthetic-merchant'],expiredJobsForMerchant:async()=>[],
    claimForMerchant:async()=>{claims++;return {id:'synthetic-job',type:'audit'};},
    heartbeat:async()=>{},completeJob:async()=>{completed++;},failJob:async()=>{throw Error('unexpected failure');},
    setInterval,clearInterval,Date,console,
  });
  const w=startWorker({workerId:'audit',pollIntervalMs:60000,handlers:{audit:async()=>{started();await gate;return {};}}});
  const run=w.runOnce();await claimed;assert.equal(await w.runOnce(),false);
  assert.equal(w.stop(),undefined);assert.equal(await w.runOnce(),false);assert.equal(completed,0);
  release();assert.equal(await run,true);assert.equal(completed,1);assert.equal(claims,1);w.stop();
});
