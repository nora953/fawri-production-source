import assert from 'node:assert/strict';
import test from 'node:test';
import {POSTOWNER_TARGET,POSTOWNER_COMMIT,assertPostOwnerOptIn,
  validatePostOwnerUrl,assertPostOwnerCatalog}
from '../lib/v1-production-postowner-rls-backup-safety.mjs';
const gate={
 GITHUB_ACTIONS:'true',GITHUB_REPOSITORY:'nora953/fawri-production-source',
 GITHUB_REF:'refs/heads/fix/p0-provider-receipt-order-discovery-20261015',
 GITHUB_EVENT_NAME:'push',GITHUB_ACTOR:'nora953',
 FAWRI_V1_POSTOWNER_BACKUP_COMMIT:POSTOWNER_COMMIT,
 FAWRI_V1_G2B_ACCEPTANCE:'G2B-20261116-SCHEMA54-43852308674',
 FAWRI_V1_G2C_ACCEPTANCE:'G2C-20261116-THREE-LOGIN-43917539519',
};
const conn='postgresql://fawri_owner:exampleSecret@'+POSTOWNER_TARGET.endpoint_host+
 '/fawri?sslmode=require&channel_binding=require';
const valid={
 db:'fawri',actor:'fawri_owner',major:18,migrations:54,
 public_tables:99,rls_tables:79,rls_policies:78,
 merchants:0,accounts:1,owners:1,usable_owners:1,orders:0,
 jobs:0,job_attempts:0,dead_letters:0,cashier_streams:0,cashier_receipts:0,
 safe_login_roles:3,dormant_cashier_role:true,v1_delete_trigger:true,
 v1_pos_guard_installed:true,worker_rls_tables:0,worker_tenant_columns:0,
};
test('one-time approved exact owner GitHub push and accepted receipts',()=>{
 assert.equal(assertPostOwnerOptIn(gate),true);
 for(const key of Object.keys(gate)) assert.throws(
   ()=>assertPostOwnerOptIn({...gate,[key]:'wrong'}),
   /V1_POSTOWNER_NOT_OWNER_AUTHORIZED/,key);
});
test('exact production owner PG18 direct TLS endpoint',()=>{
 assert.equal(validatePostOwnerUrl(conn,gate).database,'fawri');
 for(const value of [
 conn.replace('fawri_owner','fawri_restricted_runtime'),
 conn.replace('ep-polished-poetry','ep-wrong'),
 conn.replace('/fawri?','/neondb?'),
 conn.replace('sslmode=require','sslmode=disable'),
 conn.replace('channel_binding=require','channel_binding=prefer'),
 conn+'&options=-c%20role%3Dfawri_owner',
 ]) assert.throws(()=>validatePostOwnerUrl(value,gate),/V1_POSTOWNER_/);
});
test('exact owner1+POS-off, no worker RLS preimage and no tenant data',()=>{
 assert.equal(assertPostOwnerCatalog(valid),true);
 for(const [key,value] of Object.entries(valid)){
   const altered=typeof value==='boolean'?!value:typeof value==='number'?value+1:'wrong';
   assert.throws(()=>assertPostOwnerCatalog({...valid,[key]:altered}),/HOSTED_CATALOG_DRIFT/,key);
 }
});
test('detached restore uses verified owner1 and PG18 without global roles',()=>{
 const restored={...valid,db:'fawri_ci',actor:'fawri_ci',safe_login_roles:0,
   dormant_cashier_role:false};
 assert.equal(assertPostOwnerCatalog(restored,{restored:true}),true);
 assert.throws(()=>assertPostOwnerCatalog({...restored,owners:0},{restored:true}),
   /RESTORE_CATALOG_MISMATCH/);
});
