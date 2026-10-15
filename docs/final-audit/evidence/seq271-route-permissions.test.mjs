import fs from 'node:fs';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import test from 'node:test';
import {stripTypeScriptTypes} from 'node:module';
const root=new URL('../../../',import.meta.url),read=p=>fs.readFileSync(new URL(p,root),'utf8');
const raw=read('artifacts/api-server/src/routes/auth-support-postgres-routes.ts');
const a=raw.indexOf('function requireAssistantSupport('),b=raw.indexOf('function requireSupportViewer(',a);assert.ok(a>=0&&b>a);
const guards=stripTypeScriptTypes(raw.slice(a,b),{mode:'transform'});
const policy=stripTypeScriptTypes(read('artifacts/api-server/src/services/authPolicy.ts'),{mode:'transform'}).replace(/^import[^;]+;\s*$/gm,'').replace(/^export\s+/gm,'');
for(const [role,permissions,allowed,code] of [
 ['owner_admin',[],false,'ASSISTANT_SUPPORT_REQUIRED'],
 ['assistant_admin',['manage_support','inspect_merchant_sessions'],true,null],
 ['assistant_admin',['manage_support'],false,'ADMIN_PERMISSION_REQUIRED'],
 ['assistant_admin',['inspect_merchant_sessions'],false,'ASSISTANT_SUPPORT_REQUIRED'],
])test(`SEQ271 preview guard ${role} ${permissions.join('+')||'none'}`,()=>{
 let next=0,error;
 const fn=vm.runInNewContext(`(()=>{${policy};${guards};return requireAssistantInspection;})()`,{
   requireSecureAdminSession:(req,res,cb)=>cb(),getAuthContext:()=>({adminProfile:{role,permissions}}),
   sendAuthError:(res,status,code)=>{error={status,code};},
 });
 fn({}, {},()=>next++);assert.equal(next,allowed?1:0);if(!allowed){assert.equal(error.status,403);assert.equal(error.code,code);}
});
