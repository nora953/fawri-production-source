import test from 'node:test';
import assert from 'node:assert/strict';
import {
  G2C_COMMIT, assertG2COptIn, assertG2CCredentials,
  assertG2CRoles,assertG2CProfiles,
} from '../lib/v1-g2-production-login-admission-safety.mjs';

const goodEnv={
  GITHUB_ACTIONS:'true',
  GITHUB_REPOSITORY:'nora953/fawri-production-source',
  GITHUB_EVENT_NAME:'push',
  GITHUB_ACTOR:'nora953',
  GITHUB_REF:'refs/heads/fix/p0-provider-receipt-order-discovery-20261015',
  FAWRI_V1_G2_ROLE_ADMISSION_ENABLED:'1',
  FAWRI_V1_G2_ROLE_COMMIT_MESSAGE:G2C_COMMIT,
  FAWRI_V1_G2_G1_RECEIPT:'G1-20261115-GDRIVE-READBACK-43712483648',
  FAWRI_V1_G2_G2A_RECEIPT:'G2A-20261115-NOLOGIN-43717035419',
  FAWRI_V1_G2_G2B_RECEIPT:'G2B-20261116-SCHEMA54-43852308674',
};
test('owner action and exact historical receipts are all required',()=>{
  assert.equal(assertG2COptIn(goodEnv),true);
  for(const key of Object.keys(goodEnv)){
    assert.throws(()=>assertG2COptIn({...goodEnv,[key]:'invalid'}),/V1_G2C_NOT_OWNER_AUTHORIZED/,key);
  }
});
const password1=Buffer.alloc(32,1).toString('base64url');
const password2=Buffer.alloc(32,2).toString('base64url');
const password3=Buffer.alloc(32,3).toString('base64url');
const passwordEnv={
  FAWRI_V1_G2_TENANT_LOGIN_PASSWORD:password1,
  FAWRI_V1_G2_AUTH_LOGIN_PASSWORD:password2,
  FAWRI_V1_G2_OPERATOR_LOGIN_PASSWORD:password3,
};
test('three unique canonical 32-byte passwords required; never echo values',()=>{
  assert.equal(Object.keys(assertG2CCredentials(passwordEnv)).length,3);
  for(const key of Object.keys(passwordEnv)){
    assert.throws(()=>assertG2CCredentials({...passwordEnv,[key]:''}),/V1_G2C_INVALID_CREDENTIAL_FORMAT/);
    assert.throws(()=>assertG2CCredentials({...passwordEnv,[key]:'weak_password'}),/V1_G2C_INVALID_CREDENTIAL_FORMAT/);
  }
  assert.throws(()=>assertG2CCredentials({...passwordEnv,
    FAWRI_V1_G2_OPERATOR_LOGIN_PASSWORD:password1}),/V1_G2C_CREDENTIAL_REUSE_DENIED/);
});
const roles=[
'fawri_restricted_runtime','fawri_auth_issuer','fawri_operator_issuer',
'fawri_cashier_retirement_writer'].map(name=>({
  name,can_login:name!=='fawri_cashier_retirement_writer',
  inherit:false,superuser:false,bypass_rls:false,
  can_create_roles:false,can_create_db:false,replication:false,
  outgoing_membership:0,inbound_count:1,inbound_creator_only:1,public_create:false,
}));
test('reserved POS writer stays NOLOGIN; others least privilege',()=>{
  assert.equal(assertG2CRoles(roles),true);
  for(const name of ['fawri_restricted_runtime','fawri_auth_issuer','fawri_operator_issuer']){
    assert.throws(()=>assertG2CRoles(roles.map(r=>r.name===name?{...r,bypass_rls:true}:r)),/V1_G2C_ROLE_ESCALATION_OR_MISSING_LOGIN/);
    assert.throws(()=>assertG2CRoles(roles.map(r=>r.name===name?{...r,can_login:false}:r)),/V1_G2C_ROLE_ESCALATION_OR_MISSING_LOGIN/);
  }
  assert.throws(()=>assertG2CRoles(roles.map(r=>r.name==='fawri_cashier_retirement_writer'?{...r,can_login:true}:r)),/V1_G2C_ROLE_ESCALATION_OR_MISSING_LOGIN/);
});
test('role profile admission requires all 3 exact successes',()=>{
  const rows=['fawri_restricted_runtime','fawri_auth_issuer','fawri_operator_issuer'].map(role_name=>({
    role_name,observed_database_name:'fawri',observed_postgres_major:18,
    role_exists:true,can_login:true,preliminary_role_profile_pass:true,
  }));
  assert.equal(assertG2CProfiles(rows),true);
  assert.throws(()=>assertG2CProfiles(rows.slice(1)),/V1_G2C_HELD_ROLE_PROFILE_UNSAFE/);
  assert.throws(()=>assertG2CProfiles(rows.map(r=>({...r,preliminary_role_profile_pass:false}))),/V1_G2C_HELD_ROLE_PROFILE_UNSAFE/);
});
