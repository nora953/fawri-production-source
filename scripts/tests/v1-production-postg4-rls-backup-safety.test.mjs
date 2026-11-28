import assert from 'node:assert/strict';
import test from 'node:test';
import {POSTG4_TARGET,POSTG4_COMMIT,assertPostG4OptIn,
  validatePostG4Url,assertPostG4Catalog}
from '../lib/v1-production-postg4-rls-backup-safety.mjs';
const gate={
 GITHUB_ACTIONS:'true',GITHUB_REPOSITORY:'nora953/fawri-production-source',
 GITHUB_REF:'refs/heads/fix/p0-provider-receipt-order-discovery-20261015',
 GITHUB_EVENT_NAME:'push',GITHUB_ACTOR:'nora953',
 FAWRI_V1_POSTG4_BACKUP_COMMIT:POSTG4_COMMIT,
 FAWRI_V1_POSTG4_BACKUP_ENABLED:'1',
 FAWRI_V1_G2B_ACCEPTANCE:'G2B-20261116-SCHEMA54-43852308674',
 FAWRI_V1_G2C_ACCEPTANCE:'G2C-20261116-THREE-LOGIN-43917539519',
};
const ownerFixture = new URL(`postgresql://${POSTG4_TARGET.endpoint_host}/fawri?sslmode=require&channel_binding=require`);
ownerFixture.username = 'fawri_owner';
ownerFixture.password = ['example','Secret'].join('');
const conn = ownerFixture.toString();
const valid={
 db:'fawri',actor:'fawri_owner',major:18,migrations:54,
 public_tables:102,rls_tables:84,rls_policies:83,
 merchants:0,accounts:1,owners:1,usable_owners:1,orders:0,
 jobs:0,job_attempts:0,dead_letters:0,cashier_streams:0,cashier_receipts:0,
 safe_login_roles:3,dormant_cashier_role:true,v1_delete_trigger:true,
 v1_pos_guard_installed:true,worker_rls_tables:2,worker_tenant_columns:2,
 google_account_columns:5,google_consent_columns:3,whatsapp_receipt_columns:2,
 google_rls_authority_tables:3,google_immutable_triggers:2,google_unique_indexes:3,
 google_challenges:0,trial_claims:0,trial_evidence:0,
};
test('one-time approved exact owner GitHub push and accepted receipts',()=>{
 assert.equal(assertPostG4OptIn(gate),true);
 for(const key of Object.keys(gate)) assert.throws(
   ()=>assertPostG4OptIn({...gate,[key]:'wrong'}),
   /V1_POSTG4_NOT_OWNER_AUTHORIZED/,key);
});
test('exact production owner PG18 direct TLS endpoint',()=>{
 assert.equal(validatePostG4Url(conn,gate).database,'fawri');
 for(const value of [
 conn.replace('fawri_owner','fawri_restricted_runtime'),
 conn.replace('ep-polished-poetry','ep-wrong'),
 conn.replace('/fawri?','/neondb?'),
 conn.replace('sslmode=require','sslmode=disable'),
 conn.replace('channel_binding=require','channel_binding=prefer'),
 conn+'&options=-c%20role%3Dfawri_owner',
 ]) assert.throws(()=>validatePostG4Url(value,gate),/V1_POSTG4_/);
});
test('exact owner1+POS-off, with worker RLS preimage and no tenant data',()=>{
 assert.equal(assertPostG4Catalog(valid),true);
 for(const [key,value] of Object.entries(valid)){
   const altered=typeof value==='boolean'?!value:typeof value==='number'?value+1:'wrong';
   assert.throws(()=>assertPostG4Catalog({...valid,[key]:altered}),/HOSTED_CATALOG_DRIFT/,key);
 }
});
test('detached restore uses verified owner1 and PG18 without global roles',()=>{
 const restored={...valid,db:'fawri_ci',actor:'fawri_ci',safe_login_roles:0,
   dormant_cashier_role:false};
 assert.equal(assertPostG4Catalog(restored,{restored:true}),true);
 assert.throws(()=>assertPostG4Catalog({...restored,owners:0},{restored:true}),
   /RESTORE_CATALOG_MISMATCH/);
});

test('reject the obsolete pre-G4 schema, even if it was previously approved',()=>{
 assert.throws(()=>assertPostG4Catalog({...valid,public_tables:99,rls_tables:81,rls_policies:80,google_account_columns:0,google_rls_authority_tables:0}),/V1_POSTG4_HOSTED_CATALOG_DRIFT/);
});

test('new G4 authority tables, immutable evidence and empty trial claims are mandatory',()=>{
 for(const key of ['google_account_columns','google_consent_columns','whatsapp_receipt_columns',
   'google_rls_authority_tables','google_immutable_triggers','google_unique_indexes']) {
  assert.throws(()=>assertPostG4Catalog({...valid,[key]:0}),/V1_POSTG4_HOSTED_CATALOG_DRIFT/,key);
 }
 for(const key of ['google_challenges','trial_claims','trial_evidence']) {
  assert.throws(()=>assertPostG4Catalog({...valid,[key]:1}),/V1_POSTG4_HOSTED_CATALOG_DRIFT/,key);
 }
});
