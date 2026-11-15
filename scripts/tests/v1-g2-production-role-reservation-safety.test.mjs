import test from 'node:test';
import assert from 'node:assert/strict';
import {
  G2_RESERVATION_TARGET,
  assertG2OptIn, parseG2OwnerUrl, assertG2Preimage, assertG2Postimage,
} from '../lib/v1-g2-production-role-reservation-safety.mjs';

const env=Object.freeze({
  GITHUB_ACTIONS:'true',
  GITHUB_REPOSITORY:'nora953/fawri-production-source',
  GITHUB_REF:'refs/heads/fix/p0-provider-receipt-order-discovery-20261015',
  GITHUB_EVENT_NAME:'push',
  GITHUB_ACTOR:'nora953',
  FAWRI_V1_G2_ROLE_RESERVATION_ENABLED:'1',
  FAWRI_V1_G2_COMMIT_MESSAGE:G2_RESERVATION_TARGET.commitMessage,
});
const ownerUrl='postgresql://fawri_owner:test-placeholder@'+
  G2_RESERVATION_TARGET.host+'/fawri?sslmode=require';
const pre=Object.freeze({
  db:'fawri',login:'fawri_owner',active:'fawri_owner',major:18,
  nonsystem_relations:0,drizzle_ledger:0,reserved_roles:0,
  owner_can_create_roles:true,owner_can_see_stats:true,
});
const names=['fawri_restricted_runtime','fawri_auth_issuer',
  'fawri_operator_issuer','fawri_cashier_retirement_writer'];
const rows=()=>names.map(name=>({
  name,can_login:false,inherit:false,superuser:false,bypass_rls:false,
  can_create_roles:false,can_create_db:false,replication:false,
  outgoing_membership:0,inbound_count:1,inbound_creator_only:1,
  public_create:false,
}));
const deny=fn=>assert.throws(fn,err=>err?.code?.startsWith('V1_G2_'));
test('exact owner-opt-in admission only (no remote network)',()=>{
  assert.equal(assertG2OptIn(env),true);
  for(const [key,wrong] of Object.entries({
    GITHUB_ACTIONS:'false',GITHUB_REPOSITORY:'other/repository',
    GITHUB_EVENT_NAME:'pull_request',GITHUB_ACTOR:'somebody-else',
    GITHUB_REF:'refs/heads/main',
    FAWRI_V1_G2_ROLE_RESERVATION_ENABLED:'0',
    FAWRI_V1_G2_COMMIT_MESSAGE:'some other message',
  }))deny(()=>assertG2OptIn({...env,[key]:wrong}));
});
test('exact direct Neon owner URL, strict TLS, no downgrade',()=>{
  assert.equal(parseG2OwnerUrl(ownerUrl),true);
  for(const wrong of [
    ownerUrl.replace('fawri_owner','fawri_restricted_runtime'),
    ownerUrl.replace('/fawri?','/neondb?'),
    ownerUrl.replace(G2_RESERVATION_TARGET.host,'localhost'),
    ownerUrl.replace('sslmode=require','sslmode=disable'),
    ownerUrl.replace('?sslmode=require',''),
    ownerUrl+'&sslmode=require',
    ownerUrl+'&application_name=demo',
    ownerUrl.replace('postgresql://','http://'),
    ownerUrl.replace('test-placeholder',''),
    ownerUrl.replace('.c-7.', '-pooler.c-7.'),
  ])deny(()=>parseG2OwnerUrl(wrong));
  assert.equal(parseG2OwnerUrl(ownerUrl+'&channel_binding=require'),true);
  deny(()=>parseG2OwnerUrl(ownerUrl+'&channel_binding=disable'));
});
test('empty commercial preimage only and trusted owner',()=>{
  assert.equal(assertG2Preimage(pre),true);
  for(const [key,bad] of Object.entries({
    db:'neondb',login:'fawri_auth_issuer',active:'fawri_restricted_runtime',
    major:17,nonsystem_relations:1,drizzle_ledger:1,reserved_roles:1,
    owner_can_create_roles:false,owner_can_see_stats:false,
  }))deny(()=>assertG2Preimage({...pre,[key]:bad}));
});
test('postimage exactly four NOLOGIN least-privilege roles, owner ADMIN only',()=>{
  assert.equal(assertG2Postimage(rows()),true);
  for(const field of [
    'can_login','inherit','superuser','bypass_rls','can_create_roles',
    'can_create_db','replication','public_create',
  ]){const result=rows();result[0][field]=true;deny(()=>assertG2Postimage(result));}
  for(const [field,bad] of Object.entries({
    outgoing_membership:1,inbound_count:2,inbound_creator_only:0,
  })){const result=rows();result[1][field]=bad;deny(()=>assertG2Postimage(result));}
  deny(()=>assertG2Postimage(rows().slice(1)));
  const duplicated=rows();duplicated[1].name=duplicated[0].name;
  deny(()=>assertG2Postimage(duplicated));
});
