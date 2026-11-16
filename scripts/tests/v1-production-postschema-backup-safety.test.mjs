import assert from 'node:assert/strict';
import test from 'node:test';
 import {
 POSTSCHEMA_TARGET,POSTSCHEMA_COMMIT,assertPostSchemaOptIn,
 validatePostSchemaUrl,assertPostSchemaCatalog,
} from '../lib/v1-production-postschema-backup-safety.mjs';
const base={
 GITHUB_ACTIONS:'true',GITHUB_REPOSITORY:'nora953/fawri-production-source',
 GITHUB_REF:'refs/heads/fix/p0-provider-receipt-order-discovery-20261015',
 GITHUB_EVENT_NAME:'push',GITHUB_ACTOR:'nora953',
 FAWRI_V1_POSTSCHEMA_BACKUP_ENABLED:'1',
 FAWRI_V1_POSTSCHEMA_BACKUP_COMMIT:POSTSCHEMA_COMMIT,
 FAWRI_V1_G2B_ACCEPTANCE:'G2B-20261116-SCHEMA54-43852308674',
 FAWRI_V1_G2C_ACCEPTANCE:'G2C-20261116-THREE-LOGIN-43917539519',
};
const url='postgresql://fawri_owner:opaqueSecret123@'+
 POSTSCHEMA_TARGET.endpoint_host+'/fawri?sslmode=require&channel_binding=require';
const live={
 db:'fawri',actor:'fawri_owner',major:18,migrations:54,
 public_tables:99,rls_tables:79,rls_policies:78,
 merchants:0,accounts:0,orders:0,cashier_streams:0,
 cashier_receipts:0,safe_login_roles:3,dormant_cashier_role:true,
 legacy_delete_trigger:true,v1_pos_guard_installed:false,
};
test('exact owner opt-in, identity and accepted receipts required',()=>{
 assert.equal(assertPostSchemaOptIn(base),true);
 for(const key of Object.keys(base)){
  assert.throws(()=>assertPostSchemaOptIn({...base,[key]:'wrong'}),
   /V1_POSTSCHEMA_NOT_OWNER_AUTHORIZED/,key);
 }
});
test('only exact direct Neon owner TLS URL accepted',()=>{
 const auth=validatePostSchemaUrl(url,base);
 assert.equal(auth.user,'fawri_owner');
 assert.equal(auth.database,'fawri');
 for(const variant of [
  url.replace('/fawri','/neondb'),
  url.replace('fawri_owner','fawri_restricted_runtime'),
  url.replace('ep-polished-poetry','ep-untrusted'),
  url.replace('sslmode=require','sslmode=disable'),
  url.replace('channel_binding=require','channel_binding=disable'),
  url+'&options=-c%20role%3Dfawri_owner',
  url.replace('postgresql:','https:'),
 ]){
  assert.throws(()=>validatePostSchemaUrl(variant,base),/V1_POSTSCHEMA_/);
 }
});
test('post-54 hosted catalog must contain exact pre POS-off baseline',()=>{
 assert.equal(assertPostSchemaCatalog(live),true);
 for(const [key,value] of Object.entries(live)){
  const bad=typeof value==='boolean'?!value:typeof value==='number'?value+1:'wrong';
  assert.throws(()=>assertPostSchemaCatalog({...live,[key]:bad}),
   /V1_POSTSCHEMA_HOSTED_CATALOG_DRIFT/,key);
 }
});
test('restored DB checks 54-stage schema without global roles',()=>{
 const local={...live,db:'fawri_ci',actor:'fawri_ci',
  safe_login_roles:0,dormant_cashier_role:false};
 assert.equal(assertPostSchemaCatalog(local,{restored:true}),true);
 assert.throws(()=>assertPostSchemaCatalog({...local,migrations:53},{restored:true}),
  /V1_POSTSCHEMA_RESTORE_CATALOG_MISMATCH/);
});
