import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import {stripTypeScriptTypes} from 'node:module';
import {read} from './seq233-worker-child.mjs';

const raw=read('artifacts/fawri/src/pages/AdminWorkMonitorPage.tsx');
function segment(start,end){const a=raw.indexOf(start),b=raw.indexOf(end,a);assert.ok(a>=0&&b>a);return stripTypeScriptTypes(raw.slice(a,b),{mode:'transform'});}
const loadBody=segment('const load = useCallback(','\n\n  useEffect(');
const actionBody=segment('const executeAction = async () =>','\n\n  const ');
function deferred(){let resolve;const promise=new Promise(ok=>{resolve=ok;});return {promise,resolve};}
const response=id=>({ok:true,json:async()=>({ok:true,admin:{id},summary:{work_status:'active'}})});
function monitor(adminId,state,fetch){
  return vm.runInNewContext(`(()=>{${loadBody};${actionBody};return {load,executeAction};})()`,{
    adminId,useCallback:x=>x,fetch,getAdminAuthHeaders:()=>({}),console:{error(){}},
    setData:x=>{state.data=x;},setLoadError:x=>{state.loadError=x;},setLoading:x=>{state.loading=x;},
    action:{type:'revoke-session',session:{id:'synthetic-session'}},processing:false,ownerPassword:'synthetic-only-password',
    setProcessing:x=>{state.processing=x;},setActionError:x=>{state.actionError=x;},
    closeAction:()=>{state.closed=true;},toast:{success(){}},text:{actionError:'synthetic-error'},
  });
}
async function switchRace(){
  const state={data:null,loadError:false};const pending=deferred();
  const a=monitor('admin-A',state,()=>pending.promise),b=monitor('admin-B',state,async()=>response('admin-B'));
  const old=a.load();await b.load();assert.equal(state.data.admin.id,'admin-B');
  pending.resolve(response('admin-A'));await old;return state;
}
test('SEQ236 observation: late former-admin request replaces new-admin monitor data',async()=>{
  const state=await switchRace();assert.equal(state.data.admin.id,'admin-A');assert.equal(state.loadError,false);
});
test('SEQ236 acceptance: old admin response must not replace current admin data',async()=>{
  const state=await switchRace();assert.equal(state.data.admin.id,'admin-B','WORK-MONITOR-STALE-001: no request generation/abort guard');
});
async function denialRace(){
  const state={data:null,loadError:false};const pending=deferred();let n=0;
  const m=monitor('admin-A',state,()=>++n===1?pending.promise:Promise.resolve({ok:false,status:403,json:async()=>({ok:false})}));
  const old=m.load();await m.load();assert.equal(state.loadError,true);
  pending.resolve(response('admin-A'));await old;return state;
}
test('SEQ236 observation: late success clears newer non-silent denial marker',async()=>{
  const state=await denialRace();assert.equal(state.loadError,false);assert.equal(state.data.admin.id,'admin-A');
});
test('SEQ236 acceptance: earlier success cannot clear later failed refresh',async()=>{
  const state=await denialRace();assert.ok(state.loadError||state.data===null,'WORK-MONITOR-STALE-001: newer failure overwritten');
});
for(const silent of [false,true]){
  async function actionAfterDenial(){
    const state={data:response('admin-A'),loadError:false},calls=[];
    const m=monitor('admin-A',state,async(url,options)=>{
      calls.push({url,method:options?.method||'GET'});
      return {ok:false,status:403,json:async()=>({ok:false})};
    });
    await m.load(silent);await m.executeAction();return {state,calls};
  }
  test(`SEQ237 observation: pending action still sends synthetic POST after ${silent?'silent':'visible'}403`,async()=>{
    const {state,calls}=await actionAfterDenial();assert.equal(calls.filter(x=>x.method==='POST').length,1);
    assert.equal(state.actionError,'synthetic-error');assert.equal(state.processing,false);
    assert.ok(calls.some(x=>x.url.endsWith('/sessions/synthetic-session/revoke')));
  });
  test(`SEQ237 acceptance: pending action blocked after ${silent?'silent':'visible'}403`,async()=>{
    const {calls}=await actionAfterDenial();assert.equal(calls.filter(x=>x.method==='POST').length,0,'WORK-MONITOR-STALE-001: action callback lacks fresh-load authority guard');
  });
}
