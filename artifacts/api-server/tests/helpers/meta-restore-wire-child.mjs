import assert from 'node:assert/strict';
import {assertDisposablePostgres} from '../../../../scripts/lib/disposable-postgres-test-guard.mjs';
await assertDisposablePostgres();
const {pool}=await import('@workspace/db');
let handled=false,proxy;
async function send(message){if(process.connected)await new Promise(resolve=>process.send(message,()=>resolve()));}
process.on('message',async task=>{
  if(handled)return;handled=true;let dropped=false;
  try{
    assert.match(task.role,/^meta_restore_[a-f0-9]{32}$/);assert.match(task.marker,/^meta-restore-owned-[a-f0-9-]+$/);
    assert.ok(['refund','release'].includes(task.kind));
    pool.options.max=1;pool.options.options=`-c role=${task.role}`;pool.options.application_name=task.marker;
    if(task.drop){
      const {startOwnedCommitResponseProxy}=await import('./postgres-commit-response-proxy.mjs');
      proxy=await startOwnedCommitResponseProxy(1,async()=>{
        dropped=true;await send({type:'wire-drop',serverCommitCompleted:true,commandCompleteDelivered:false});
        if(task.abrupt)process.kill(process.pid,'SIGKILL');
      },{deferUntilArmed:true});
      const owned=new URL(process.env.DATABASE_URL);pool.options.connectionString=undefined;
      Object.assign(pool.options,{host:'127.0.0.1',port:proxy.port,user:decodeURIComponent(owned.username),password:decodeURIComponent(owned.password),database:'fawri_ci',ssl:false});
    }
    const identity=(await pool.query("SELECT current_user AS role,rolsuper,rolbypassrls,EXISTS(SELECT 1 FROM pg_class WHERE relnamespace='public'::regnamespace AND relowner=r.oid) AS owns_table FROM pg_roles r WHERE rolname=current_user")).rows[0];
    assert.deepEqual(identity,{role:task.role,rolsuper:false,rolbypassrls:false,owns_table:false});
    for(const table of ['subscriptions','reply_ledger'])assert.equal((await pool.query(`SELECT count(*)::int AS n FROM ${table}`)).rows[0].n,0);
    await send({type:'role-proof',restricted:true,nakedReadsZero:true});
    const {refundMerchantAutoReplyAuthoritative}=await import('../../src/services/merchantReplyRefundAuthority.ts');
    const {releaseMerchantAutoReplyReservationAuthoritative}=await import('../../src/services/merchantReplyReservationReleaseAuthority.ts');
    proxy?.arm();
    try{
      const restore=task.kind==='refund'?refundMerchantAutoReplyAuthoritative:releaseMerchantAutoReplyReservationAuthoritative;
      const result=await restore(task.event,task.kind==='refund'?'META_REPLY_FAILED':'MERCHANT_AUTO_REPLY_DISABLED',new Date(),task.merchant);
      assert.equal(task.drop,false,'withheld COMMIT must never report success');
      assert.equal((await pool.query("SELECT NULLIF(current_setting('fawri.tenant_id',true),'') AS tenant")).rows[0].tenant,null);
      await send({type:'result',restored:task.kind==='refund'?result.refunded:result.released,reason:result.reason||null,contextReset:true});
    }catch(error){
      if(!task.drop||!dropped)throw error;
      await send({type:'uncertain',successReported:false,dropObserved:true});
    }
  }catch(error){await send({type:'failure',code:/^[A-Z0-9_]{1,80}$/.test(error?.code||'')?error.code:'META_RESTORE_WIRE_TEST_FAILURE'});process.exitCode=1;}
  finally{try{await pool.end();if(proxy)await proxy.close();}catch{process.exitCode=1;await send({type:'cleanup-failure'});}if(process.connected)process.disconnect();}
});
await send({type:'ready'});
