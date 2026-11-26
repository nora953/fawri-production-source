import test from 'node:test';
import assert from 'node:assert/strict';
import {reviewedGlobals,buildDetachedRoleSql,canonicalAcl,compareObjectCatalogs,compareDetachedGlobals} from '../lib/v1-g5-detached-acl-recovery.mjs';
const OWNER='fawri_owner', names=['fawri_restricted_runtime','fawri_auth_issuer','fawri_operator_issuer','fawri_cashier_retirement_writer'];
function fixture(){
 const role=(rolname,rolcanlogin)=>({rolname,rolcanlogin,rolsuper:false,rolinherit:false,rolcreaterole:false,rolcreatedb:false,rolreplication:false,rolbypassrls:false,rolconnlimit:2,rolvaliduntil:null});
 return {format:'fawri-g5-postg4-acl-catalog-v1',database:'fawri',server_major:18,read_only:true,
 roles:[role(OWNER,true),...names.map((n,i)=>role(n,i!==3))],
 membership_edges:[...names.map(role=>({role,member:OWNER,grantor:OWNER,admin:true,inherit:false,set:false})),{role:'provider_internal',member:OWNER,grantor:'provider_internal',admin:true,inherit:true,set:true}],
 database_acl:{owner:OWNER,acl:null},schemas:[],relations:[{schema:'public',name:'test',kind:'r',owner:OWNER,acl:'{a=r/x,b=w/x}',rls:true,force_rls:true}],
 column_acls:[],routines:[],types:[],default_acls:[],policy_roles:[{schema:'public',relation:'test',policy:'fixture',roles:['b','a']}],extensions:[]};
}
test('only five reviewed roles and four owner edges; fresh isolated credentials',()=>{
 const c=fixture();let i=0;const p=buildDetachedRoleSql(c,()=> (++i).toString(16).padStart(64,'0'));
 assert.equal(Object.keys(p.credentials).length,4);assert.equal(p.externalExcluded,1);
 assert.equal(p.sql.match(/CREATE ROLE/g).length,5);assert.equal(p.sql.match(/GRANT /g).length,4);
 assert.ok(!p.sql.includes('provider_internal'));
});
test('reject runtime privilege, membership drift, new role and credential reuse',()=>{
 let c=fixture();c.roles[1].rolbypassrls=true;assert.throws(()=>reviewedGlobals(c));
 c=fixture();c.membership_edges[0].set=true;assert.throws(()=>reviewedGlobals(c));
 c=fixture();c.roles[1].rolname='other';assert.throws(()=>reviewedGlobals(c));
 assert.throws(()=>buildDetachedRoleSql(fixture(),()=> 'a'.repeat(64)));
});
test('ACL order normalized but null, empty and grant semantics remain distinct',()=>{
 assert.deepEqual(canonicalAcl('{b=w/x,a=r/x}'),['a=r/x','b=w/x']);
 assert.deepEqual(canonicalAcl('{"a,b=r/x",c=w/x}'),['a,b=r/x','c=w/x']);
 assert.notDeepEqual(canonicalAcl(null),canonicalAcl('{}'));
 assert.throws(()=>canonicalAcl('{broken}'));
});
test('object comparison rejects changed owner, ACL, force RLS, extra objects and database grants',()=>{
 const a=fixture(), b=structuredClone(a);b.relations[0].acl='{b=w/x,a=r/x}';b.policy_roles[0].roles.reverse();
 assert.equal(compareObjectCatalogs(a,b).exact,true);
 b.relations[0].force_rls=false;assert.equal(compareObjectCatalogs(a,b).report.relations.changed,1);
 b.schemas.push({schema:'provider',owner:'x',acl:null});assert.equal(compareObjectCatalogs(a,b).report.schemas.extra,1);
 b.database_acl.acl='{}';assert.equal(compareObjectCatalogs(a,b).report.database_acl.changed,1);
 assert.equal(compareObjectCatalogs(a,b).exact,false);
});
test('target may omit only external edge; grantor difference explicitly remains visible',()=>{
 const a=fixture(),b=structuredClone(a);b.membership_edges.pop();b.membership_edges[0].grantor='isolated_admin';
 const r=compareDetachedGlobals(a,b);assert.equal(r.portableMatch,true);assert.equal(r.grantors.changed,1);
 b.membership_edges.push({role:'other',member:OWNER,grantor:'other',admin:true,inherit:true,set:true});
 assert.equal(compareDetachedGlobals(a,b).portableMatch,false);
});
