import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import vm from 'node:vm';
import test from 'node:test';

// Actual UI authority/callback bodies with inert state/transport adapters. No
// React mounting, cookies, actual admin HTTP or database authorization proof.
const controller=readFileSync(new URL('../artifacts/fawri/src/pages/admin/useAdminPageController.tsx',import.meta.url),'utf8');
const sections=readFileSync(new URL('../artifacts/fawri/src/pages/admin/AdminPageSections.tsx',import.meta.url),'utf8');
const hs=sections.indexOf('export function hasAdminPermission('),he=sections.indexOf('\n}',hs)+2;
assert.ok(hs>=0&&he>hs);
const helper=stripTypeScriptTypes(sections.slice(hs,he),{mode:'transform'}).replace('export ','');
const start=controller.indexOf('  const passwordChangeRequired ='),end=controller.indexOf('  const [merchants,',start);
assert.ok(start>=0&&end>start);
const capability=stripTypeScriptTypes(controller.slice(start,end),{mode:'transform'});
const derive=vm.runInNewContext(`(()=>{${helper};return currentAdmin=>{${capability};return {canManageAdmins,canViewMerchants,canManageMerchants,canManageSubscriptions,canManageChannels,canViewLogs,canInspectSessions,canManageSupport,canViewMerchantData};};})()`,{},{timeout:2000});
const owner={is_admin:true,admin_role:'owner_admin',permissions:[]};
test('owner capability matrix grants the declared management surfaces',()=>{
  assert.ok(Object.values(derive(owner)).every(Boolean));
});
test('mandatory password change gates all management capabilities even for owner',()=>{
  assert.ok(Object.values(derive({...owner,must_change_password:true})).every(v=>v===false));
});
test('assistant granted logs only cannot manage admins or merchant data',()=>{
  const r=derive({is_admin:true,admin_role:'assistant_admin',permissions:['view_logs']});
  assert.equal(r.canViewLogs,true);assert.ok(Object.entries(r).filter(([key])=>key!=='canViewLogs').every(([,v])=>v===false));
});
test('missing authenticated admin leaves every declared capability closed',()=>{
  assert.ok(Object.values(derive(undefined)).every(v=>v===false));
});
const cbStart=controller.indexOf('async (\n    options: { preserveOnTransientError?');
const cbEnd=controller.indexOf('}, [setLocation]);',cbStart)+1;
assert.ok(cbStart>0&&cbEnd>cbStart);
const callback=stripTypeScriptTypes('('+controller.slice(cbStart,cbEnd)+')',{mode:'transform'});
function refreshHarness(response){
  let current=owner;const state={clears:0,location:null};
  const api=vm.runInNewContext(callback,{
    fetch:async()=>{if(response instanceof Error)throw response;return {ok:response.status>=200&&response.status<300,status:response.status,json:async()=>response.body};},
    getAdminAuthHeaders:()=>({'X-Fawri-Device-Id':'synthetic'}),
    clearSession:()=>state.clears++,setCurrentAdmin:next=>{current=next;},setLocation:path=>state.location=path,
    console:{error:()=>{}},
  },{timeout:2000});
  return {api,state,current:()=>current};
}
for(const status of [401,403])test(`actual admin refresh ${status} clears cached owner despite transient-preserve option`,async()=>{
  const h=refreshHarness({status,body:{ok:false}});assert.equal(await h.api({preserveOnTransientError:true}),null);
  assert.equal(h.current(),undefined);assert.equal(h.state.clears,1);assert.equal(h.state.location,'/login');
});
test('successful server role downgrade replaces owner and closes management capabilities',async()=>{
  const reduced={is_admin:true,admin_role:'assistant_admin',permissions:['view_logs']};
  const h=refreshHarness({status:200,body:{ok:true,admin:reduced}});await h.api({preserveOnTransientError:true});
  const r=derive(h.current());assert.equal(r.canManageAdmins,false);assert.equal(r.canViewMerchantData,false);assert.equal(r.canViewLogs,true);
});
test('transient503 explicitly preserves prior UI identity only under preserve option',async()=>{
  const h=refreshHarness({status:503,body:{ok:false}});assert.equal(await h.api({preserveOnTransientError:true}),null);
  assert.equal(h.current(),owner);assert.equal(h.state.clears,0);
});
test('initial transient failure without preserve option clears admin UI identity',async()=>{
  const h=refreshHarness({status:503,body:{ok:false}});await h.api();assert.equal(h.current(),undefined);assert.equal(h.state.location,'/login');
});
test('malformed successful admin response on initial load clears identity',async()=>{
  const h=refreshHarness({status:200,body:{ok:true,admin:{is_admin:false}}});await h.api();assert.equal(h.current(),undefined);assert.equal(h.state.location,'/login');
});
