import assert from 'node:assert/strict';
import test from 'node:test';
import {spawnSync} from 'node:child_process';
import {validateCashierRecoveryRolePlan} from '../lib/disposable-cashier-role-recovery.mjs';
const manifest={primaryRole:'app_fixture',authRole:'auth_fixture',reviewerRole:'review_fixture'};
function plan(){
 const callers=Object.values(manifest);
 return{format:'fawri-disposable-cashier-role-recovery-v1',sourceSystemIdentifier:'1234567890123456789',sourceContainerId:'a'.repeat(64),sourceRunId:'b'.repeat(32),memberships:[],roles:[...callers,'fawri_cashier_retirement_owner','fawri_cashier_enrollment_owner','fawri_cashier_receipt_owner'].map(rolname=>({rolname,rolcanlogin:callers.includes(rolname),rolsuper:false,rolbypassrls:false,rolcreatedb:false,rolcreaterole:false,rolinherit:false,rolreplication:false}))};
}
test('exact reviewed role plan permits separated LOGINs and passwordless NOLOGIN owners',()=>assert.equal(validateCashierRecoveryRolePlan(plan(),manifest).names.length,6));
for(const key of ['rolsuper','rolbypassrls','rolcreatedb','rolcreaterole','rolinherit','rolreplication'])test('unsafe '+key+' recovery is denied',()=>{const p=plan();p.roles[0][key]=true;assert.throws(()=>validateCashierRecoveryRolePlan(p,manifest));});
test('owner LOGIN is denied',()=>{const p=plan();p.roles[3].rolcanlogin=true;assert.throws(()=>validateCashierRecoveryRolePlan(p,manifest));});
test('password or arbitrary SQL fields cannot enter the reviewed plan',()=>{for(const key of ['password','sql']){const p=plan();p.roles[0][key]='untrusted';assert.throws(()=>validateCashierRecoveryRolePlan(p,manifest));}});
test('unknown missing duplicate and unsafe role identities are denied',()=>{for(const edit of [p=>p.roles.pop(),p=>p.roles[0].rolname='unreviewed',p=>p.roles[0].rolname=p.roles[1].rolname]){const p=plan();edit(p);assert.throws(()=>validateCashierRecoveryRolePlan(p,manifest));}assert.throws(()=>validateCashierRecoveryRolePlan(plan(),{...manifest,primaryRole:'unsafe";DROP ROLE x;--'}));});
test('unreviewed role membership and absent source cluster identity are denied',()=>{const p=plan();p.memberships=[{role:'app_fixture',member:'auth_fixture'}];assert.throws(()=>validateCashierRecoveryRolePlan(p,manifest));const q=plan();q.sourceSystemIdentifier='';assert.throws(()=>validateCashierRecoveryRolePlan(q,manifest));});
test('actual role recovery CLI refuses a remote target before pg import or proof-file access',()=>{
 const r=spawnSync(process.execPath,['scripts/lib/disposable-cashier-role-recovery.mjs','bootstrap'],{encoding:'utf8',env:{...process.env,DATABASE_URL:'postgresql://example:private-synthetic@outside.invalid/fawri_ci'},timeout:10000});
 assert.equal(r.status,1);assert.match(r.stderr,/Owned offline cashier role recovery refused/);assert.doesNotMatch(r.stderr,/private-synthetic|outside.invalid|ENOENT|Cannot find package/);
});
