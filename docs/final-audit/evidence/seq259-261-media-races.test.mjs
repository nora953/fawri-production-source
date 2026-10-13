import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import vm from 'node:vm';
import {stripTypeScriptTypes} from 'node:module';
import test from 'node:test';
const raw=fs.readFileSync(new URL('../../../artifacts/api-server/src/services/merchantPhysicalMediaCleanup.ts',import.meta.url),'utf8');
const source=stripTypeScriptTypes(raw,{mode:'transform'}).replace(/^import[^;]+;\s*$/gm,'').replace(/^export\s+/gm,'');
function deferred(){let resolve;const promise=new Promise(ok=>{resolve=ok;});return {promise,resolve};}
function fixture(t){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'fawri-media-race-'));let storageCalls=0;
 const state={complete:async()=>({ok:true,deletedMerchantId:'synthetic',deletionRequest:{id:'synthetic-request'}}),remove:async()=>{}};
 const f=vm.runInNewContext(`(()=>{${source};return {completeMerchantDeletionWithPhysicalMediaCleanup,reconcileMerchantPhysicalMediaCleanup};})()`,{
   fs,path,crypto,process,Date,logger:{warn(){}},getFawriDataDir:()=>dir,
   operationalPostgresAuthorityRequired:()=>true,catalogMediaStorageProviderName:()=>'filesystem',
   operationalDatabasePool:async()=>({}),withMerchantOperationalTransaction:async(id,fn)=>fn({}),
   operationalQueryRows:async(target,sql)=>sql.includes('SELECT m.status')?[{merchant_status:'suspended',account_state:'suspended'}]:sql.includes('SELECT a.state')?[{account_state:'closed',retention_status:'deleted'}]:[],
   completeMerchantDeletionPostgres:async input=>state.complete(input),
   removeCatalogMerchantMedia:async()=>{storageCalls++;return state.remove();},
   removeCatalogMediaStorageObject:async()=>{},removeSupportImageStorageObject:async()=>{},removeSupportTicketImageStoragePrefix:async()=>{},
 });
 t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const file=path.join(dir,'merchant-media-cleanup',crypto.createHash('sha256').update('synthetic').digest('hex')+'.json');
 return {f,state,file,storageCalls:()=>storageCalls,input:{merchantId:'synthetic',deletionRequestId:'synthetic-request',actorAdminId:'synthetic-owner'}};
}
test('SEQ259 single precommit deletion failure removes own prepared manifest without storage operations',async t=>{
 const x=fixture(t);x.state.complete=async()=>{throw Error('synthetic-rollback');};await assert.rejects(()=>x.f.completeMerchantDeletionWithPhysicalMediaCleanup(x.input),/synthetic-rollback/);assert.equal(fs.existsSync(x.file),false);assert.equal(x.storageCalls(),0);
});
async function losingAttempt(t){
 const x=fixture(t),win=deferred(),lose=deferred(),both=deferred();let n=0;
 x.state.complete=async()=>{const i=++n;if(n===2)both.resolve();if(i===1){await win.promise;return {ok:true,deletedMerchantId:'synthetic',deletionRequest:{id:'synthetic-request'}};}await lose.promise;throw Error('synthetic-concurrent-deletion-conflict');};
 x.state.remove=async()=>{throw Object.assign(new Error('synthetic-storage-unavailable'),{code:'SYNTHETIC_STORAGE_FAILURE'});};
 const winner=x.f.completeMerchantDeletionWithPhysicalMediaCleanup(x.input);
 const loser=x.f.completeMerchantDeletionWithPhysicalMediaCleanup(x.input).catch(e=>e);
 await both.promise;win.resolve();assert.equal((await winner).ok,true);
 assert.equal(JSON.parse(fs.readFileSync(x.file,'utf8')).state,'pending');
 lose.resolve();assert.match((await loser).message,/synthetic-concurrent/);return x;
}
test('SEQ260 observation: losing concurrent deletion unlinks successful attempt pending recovery',async t=>{
 const x=await losingAttempt(t);assert.equal(fs.existsSync(x.file),false);assert.equal((await x.f.reconcileMerchantPhysicalMediaCleanup('synthetic')).status,'missing');
});
test('SEQ260 acceptance: rollback of concurrent loser preserves winner durable pending cleanup',{timeout:5000},async t=>{
 const x=await losingAttempt(t);assert.equal(fs.existsSync(x.file),true,'MEDIA-CLEANUP-CONCURRENT-UNLINK-001: loser removes winner recovery intent');
});
async function staleCompletion(t){
 const x=fixture(t),held=deferred(),started=deferred();let n=0;
 // Prepare a valid committed deletion manifest, but hold one old retry.
 x.state.remove=async()=>{};await x.f.completeMerchantDeletionWithPhysicalMediaCleanup(x.input);
 const m=JSON.parse(fs.readFileSync(x.file,'utf8'));m.state='pending';m.entries=[{kind:'catalog_merchant_prefix',storage_provider:'filesystem'}];fs.writeFileSync(x.file,JSON.stringify(m));
 x.state.remove=async()=>{const i=++n;if(i===1){started.resolve();await held.promise;throw Error('synthetic-stale-failure');}};
 const old=x.f.reconcileMerchantPhysicalMediaCleanup('synthetic');await started.promise;
 assert.equal((await x.f.reconcileMerchantPhysicalMediaCleanup('synthetic')).status,'complete');
 held.resolve();await old;return x;
}
test('SEQ261 observation: late failed retry overwrites newer completed cleanup',async t=>{
 const x=await staleCompletion(t);assert.equal(JSON.parse(fs.readFileSync(x.file,'utf8')).state,'pending');
});
test('SEQ261 repeated idempotent retry recovers reopened pending state',async t=>{
 const x=await staleCompletion(t);assert.equal((await x.f.reconcileMerchantPhysicalMediaCleanup('synthetic')).status,'complete');
});
