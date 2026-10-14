import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import vm from 'node:vm';
import {stripTypeScriptTypes} from 'node:module';
import test from 'node:test';
const root=new URL('../../../',import.meta.url);
const raw=fs.readFileSync(new URL('artifacts/api-server/src/services/merchantPhysicalMediaCleanup.ts',root),'utf8');
const source=stripTypeScriptTypes(raw,{mode:'transform'}).replace(/^import[^;]+;\s*$/gm,'').replace(/^export\s+/gm,'');
function fixture(t){
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'fawri-owned-media-')),calls=[],logs=[];
  const state={committed:true,fail:new Set()};
  const fn=vm.runInNewContext(`(()=>{${source};return {reconcileMerchantPhysicalMediaCleanup,reconcilePendingMerchantPhysicalMediaCleanups};})()`,{
    crypto,fs,path,process,setInterval,clearInterval,Date,getFawriDataDir:()=>dir,
    logger:{warn:(fields)=>logs.push(fields)},operationalPostgresAuthorityRequired:()=>true,
    operationalDatabasePool:async()=>({}),operationalQueryRows:async()=>state.committed?[{account_state:'closed',retention_status:'deleted'}]:[{account_state:'suspended',retention_status:'eligible_for_deletion'}],
    removeCatalogMerchantMedia:async input=>{calls.push(input.merchantId);if(state.fail.has(input.merchantId))throw Object.assign(new Error('synthetic-private-storage-detail'),{code:'SYNTHETIC_STORAGE_FAILURE'});},
    removeCatalogMediaStorageObject:async()=>{},removeSupportImageStorageObject:async()=>{},removeSupportTicketImageStoragePrefix:async()=>{},
  });
  const folder=path.join(dir,'merchant-media-cleanup');fs.mkdirSync(folder);
  const file=id=>path.join(folder,crypto.createHash('sha256').update(id).digest('hex')+'.json');
  const put=id=>fs.writeFileSync(file(id),JSON.stringify({version:1,merchant_id:id,deletion_request_id:'synthetic-'+id,state:'pending',attempts:0,entries:[{kind:'catalog_merchant_prefix',storage_provider:'filesystem'}],created_at:'2026-10-13T00:00:00Z',updated_at:'2026-10-13T00:00:00Z'}));
  t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));return {fn,state,calls,logs,file,put,folder};
}
test('SEQ249 uncommitted deletion defers storage removal',async t=>{
  const f=fixture(t);f.put('synthetic');f.state.committed=false;const r=await f.fn.reconcileMerchantPhysicalMediaCleanup('synthetic');
  assert.equal(r.status,'deferred');assert.equal(r.remaining,1);assert.equal(f.calls.length,0);
});
test('SEQ249 storage fault retains durable pending entry then successful retry completes',async t=>{
  const f=fixture(t);f.put('synthetic');f.state.fail.add('synthetic');const r=await f.fn.reconcileMerchantPhysicalMediaCleanup('synthetic');
  assert.equal(r.status,'pending');let m=JSON.parse(fs.readFileSync(f.file('synthetic'),'utf8'));assert.equal(m.entries.length,1);assert.equal(m.last_error_code,'SYNTHETIC_STORAGE_FAILURE');assert.ok(!JSON.stringify(m).includes('synthetic-private'));
  f.state.fail.clear();const next=await f.fn.reconcileMerchantPhysicalMediaCleanup('synthetic');assert.equal(next.status,'complete');m=JSON.parse(fs.readFileSync(f.file('synthetic'),'utf8'));assert.equal(m.attempts,2);assert.equal(m.entries.length,0);assert.equal(m.last_error_code,undefined);
});
test('SEQ249 completed manifest does not repeat storage deletion',async t=>{
  const f=fixture(t);f.put('synthetic');await f.fn.reconcileMerchantPhysicalMediaCleanup('synthetic');await f.fn.reconcileMerchantPhysicalMediaCleanup('synthetic');assert.equal(f.calls.length,1);
});
test('SEQ250 observation: corrupt existing manifest is silently missing and excluded from pending count',async t=>{
  const f=fixture(t);fs.writeFileSync(f.file('synthetic'),'synthetic-corrupt-json');
  assert.equal((await f.fn.reconcileMerchantPhysicalMediaCleanup('synthetic')).status,'missing');const batch=await f.fn.reconcilePendingMerchantPhysicalMediaCleanups();assert.equal(batch.inspected,0);assert.equal(batch.pending,0);assert.equal(f.logs.length,0);assert.equal(f.calls.length,0);
});
test('SEQ250 acceptance: corrupt persisted cleanup must surface an error or unresolved work',async t=>{
  const f=fixture(t);fs.writeFileSync(f.file('synthetic'),'synthetic-corrupt-json');const batch=await f.fn.reconcilePendingMerchantPhysicalMediaCleanups();assert.ok(batch.pending>0||f.logs.length>0,'MEDIA-CLEANUP-CORRUPT-001: corrupt work silently omitted');
});
async function starved(t){
  const f=fixture(t);const ids=Array.from({length:101},(_,i)=>'synthetic-tenant-'+i).sort((a,b)=>path.basename(f.file(a)).localeCompare(path.basename(f.file(b))));
  for(const id of ids)f.put(id);for(const id of ids.slice(0,100))f.state.fail.add(id);
  assert.deepEqual(fs.readdirSync(f.folder),ids.map(id=>path.basename(f.file(id))));
  await f.fn.reconcilePendingMerchantPhysicalMediaCleanups();await f.fn.reconcilePendingMerchantPhysicalMediaCleanups();return {f,last:ids[100]};
}
test('SEQ251 observation: default100 limit repeatedly inspects failing first100 and never tenant101',async t=>{
  const {f,last}=await starved(t);assert.equal(f.calls.length,200);assert.equal(f.calls.includes(last),false);assert.equal(JSON.parse(fs.readFileSync(f.file(last),'utf8')).attempts,0);
});
test('SEQ251 acceptance: repeated batches allow independent later tenant to make progress',async t=>{
  const {f,last}=await starved(t);assert.equal(JSON.parse(fs.readFileSync(f.file(last),'utf8')).state,'complete','MEDIA-CLEANUP-STARVATION-001: failing earlier manifests monopolize batch');
});
