import assert from 'node:assert/strict';
import test from 'node:test';
import {
  V1_OWNER_ADMIN_TARGET,V1_OWNER_ADMIN_COMMIT,
  assertV1OwnerAdminBootstrapJob,validateV1OwnerUrl,
  deriveV1RoleUrl,assertV1OwnerSecretInputs,
} from '../lib/v1-owner-admin-bootstrap-safety.mjs';
const good={
  GITHUB_ACTIONS:'true',
  GITHUB_REPOSITORY:'nora953/fawri-production-source',
  GITHUB_ACTOR:'nora953',
  GITHUB_EVENT_NAME:'push',
  GITHUB_REF:'refs/heads/fix/p0-provider-receipt-order-discovery-20261015',
  FAWRI_V1_OWNER_ADMIN_BOOTSTRAP_ENABLED:'1',
  FAWRI_V1_OWNER_ADMIN_BOOTSTRAP_COMMIT:V1_OWNER_ADMIN_COMMIT,
  FAWRI_V1_G2B_RECEIPT:'G2B-20261116-SCHEMA54-43852308674',
  FAWRI_V1_G2C_RECEIPT:'G2C-20261116-THREE-LOGIN-43917539519',
};
const owner='postgresql://fawri_owner:kept-secret@'+V1_OWNER_ADMIN_TARGET.host+'/fawri?sslmode=require&channel_binding=require';
const user={
  FAWRI_V1_OWNER_ADMIN_PHONE:'+9647801234567',
  FAWRI_V1_OWNER_ADMIN_PASSWORD:'LongSafeOwnerPassword2026!',
  FAWRI_V1_OWNER_ADMIN_PASSWORD_SALT:'private-salt-value-longer-than-32characters-2026',
  FAWRI_V1_G2_TENANT_LOGIN_PASSWORD:'tenant-only-secure-password',
  FAWRI_V1_G2_AUTH_LOGIN_PASSWORD:'auth-only-secure-password',
};
test('only exact owner ACTIONS opt-in and G2 evidence admitted',()=>{
 assert.equal(assertV1OwnerAdminBootstrapJob(good),true);
 for(const field of Object.keys(good)){
  assert.throws(()=>assertV1OwnerAdminBootstrapJob({...good,[field]:'wrong'}),
   /V1_OWNER_BOOTSTRAP_NOT_AUTHORIZED/,field);
 }
});
test('source URL is exact commercial PostgreSQL origin, direct TLS only',()=>{
 assert.equal(validateV1OwnerUrl(owner).username,'fawri_owner');
 for(const url of [
  owner.replace('/fawri','/neondb'),
  owner.replace('fawri_owner','fawri_restricted_runtime'),
  owner.replace('ep-polished-poetry','ep-untrusted'),
  owner.replace('sslmode=require','sslmode=disable'),
  owner.replace('channel_binding=require','channel_binding=prefer'),
  owner+'&options=-c%20role%3Dfawri_owner',
  owner.replace('postgresql:','https:'),
 ]){
  assert.throws(()=>validateV1OwnerUrl(url),/V1_OWNER_BOOTSTRAP_/);
 }
});
test('runtime/auth connections are separate non-owner role URLs',()=>{
 for(const role of ['fawri_restricted_runtime','fawri_auth_issuer']){
  const url=new URL(deriveV1RoleUrl(owner,role,'provisioned-password-A1'));
  assert.equal(url.username,role);
  assert.equal(url.hostname,V1_OWNER_ADMIN_TARGET.host);
  assert.equal(url.searchParams.get('sslmode'),'require');
 }
 for(const role of ['fawri_owner','postgres','fawri_operator_issuer','fawri_cashier_retirement_writer']){
  assert.throws(()=>deriveV1RoleUrl(owner,role,'provisioned-password-A1'),/ROLE_SECRET_INVALID/);
 }
});
test('only private, validated phone password and long stable pepper',()=>{
 assert.equal(assertV1OwnerSecretInputs(user).phone,'+9647801234567');
 for(const [key,value] of [
  ['FAWRI_V1_OWNER_ADMIN_PHONE','07801234567'],
  ['FAWRI_V1_OWNER_ADMIN_PASSWORD','short'],
  ['FAWRI_V1_OWNER_ADMIN_PASSWORD','onlylowercaseletters'],
  ['FAWRI_V1_OWNER_ADMIN_PASSWORD','Unsafe SPACE 123'],
  ['FAWRI_V1_OWNER_ADMIN_PASSWORD_SALT','tiny'],
  ['FAWRI_V1_G2_AUTH_LOGIN_PASSWORD','tenant-only-secure-password'],
 ]){
  assert.throws(()=>assertV1OwnerSecretInputs({...user,[key]:value}),/V1_OWNER_BOOTSTRAP_/);
 }
});
