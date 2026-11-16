import test from 'node:test';
import assert from 'node:assert/strict';
import {
  G2_SCHEMA_TARGET,assertG2SchemaOptIn,assertG2SchemaOwnerUrl,
  assertG2SchemaPreimage,assertG2SchemaPostimage,
} from '../lib/v1-g2-production-schema-migration-safety.mjs';

const env={
  GITHUB_ACTIONS:'true',
  GITHUB_REPOSITORY:'nora953/fawri-production-source',
  GITHUB_EVENT_NAME:'push',
  GITHUB_ACTOR:'nora953',
  GITHUB_REF:'refs/heads/fix/p0-provider-receipt-order-discovery-20261015',
  FAWRI_V1_G2_SCHEMA_MIGRATION_ENABLED:'1',
  FAWRI_V1_G2_SCHEMA_COMMIT_MESSAGE:G2_SCHEMA_TARGET.commitMessage,
  FAWRI_V1_G2_G1_OFFSITE_RECEIPT:'G1-20261115-GDRIVE-READBACK-43712483648',
  FAWRI_V1_G2_RESERVATION_RECEIPT:'G2A-20261115-NOLOGIN-43717035419',
};
const names=['fawri_restricted_runtime','fawri_auth_issuer',
  'fawri_operator_issuer','fawri_cashier_retirement_writer'];
const roles=()=>names.map(name=>({
  name,can_login:false,inherit:false,superuser:false,bypass_rls:false,
  can_create_roles:false,can_create_db:false,replication:false,
  outgoing_membership:0,inbound_count:1,inbound_creator_only:1,
  public_create:false,
}));
const before={
  db:'fawri',actor:'fawri_owner',active:'fawri_owner',pg_major:18,
  user_relations:0,drizzle_ledger:0,owner_stats:true,
  owner_create_role:true,is_owner_superuser:false,
};
const after={
  db:'fawri',actor:'fawri_owner',pg_major:18,migration_count:54,
  public_tables:99,rls_enabled_tables:79,public_rls_policies:78,
  merchant_rows:0,account_rows:0,order_rows:0,
  security_scope_function:true,auth_runtime_function:true,
  operator_directory_function:true,
};
const deny=fn=>assert.throws(fn,e=>e?.code?.startsWith('V1_G2_'));

test('G2-B exact one-use owner opt-in; G2-A flag cannot authorize',()=>{
  assert.equal(assertG2SchemaOptIn(env),true);
  for(const [field,bad] of Object.entries({
    GITHUB_ACTIONS:'false',
    GITHUB_REPOSITORY:'someone/repo',
    GITHUB_EVENT_NAME:'pull_request',
    GITHUB_ACTOR:'untrusted',
    GITHUB_REF:'refs/heads/main',
    FAWRI_V1_G2_SCHEMA_MIGRATION_ENABLED:'0',
    FAWRI_V1_G2_SCHEMA_COMMIT_MESSAGE:'other-commit',
    FAWRI_V1_G2_G1_OFFSITE_RECEIPT:'missing',
    FAWRI_V1_G2_RESERVATION_RECEIPT:'missing',
  }))deny(()=>assertG2SchemaOptIn({...env,[field]:bad}));
});

test('G2-B only exact direct Neon project credential and TLS',()=>{
  const url='postgresql://fawri_owner:fake@'+G2_SCHEMA_TARGET.host+
    '/fawri?sslmode=require';
  assert.equal(assertG2SchemaOwnerUrl(url),true);
  for(const bad of [
    url.replace('fawri_owner','fawri_auth_issuer'),
    url.replace('fawri?','neondb?'),
    url.replace(G2_SCHEMA_TARGET.host,'localhost'),
    url.replace('sslmode=require','sslmode=disable'),
    url.replace('?sslmode=require',''),
    url.replace('.c-7.','-pooler.c-7.'),
    url+'&arbitrary=1',
  ])deny(()=>assertG2SchemaOwnerUrl(bad));
});

test('no production schema write until exact empty preimage and four NOLOGINs',()=>{
  assert.equal(assertG2SchemaPreimage(before,roles()),true);
  for(const [field,bad] of Object.entries({
    db:'neondb',actor:'fawri_auth_issuer',active:'other',
    pg_major:17,user_relations:1,drizzle_ledger:1,
    owner_stats:false,owner_create_role:false,is_owner_superuser:true,
  }))deny(()=>assertG2SchemaPreimage({...before,[field]:bad},roles()));
  const escalated=roles();escalated[1].can_login=true;
  deny(()=>assertG2SchemaPreimage(before,escalated));
  deny(()=>assertG2SchemaPreimage(before,roles().slice(1)));
});

test('postimage exactly 54 migrations, 99 tables, RLS + no rows or privilege escalation',()=>{
  assert.equal(assertG2SchemaPostimage(after,roles()),true);
  for(const [field,bad] of Object.entries({
    db:'neondb',actor:'other',pg_major:17,migration_count:53,
    public_tables:98,rls_enabled_tables:78,public_rls_policies:77,
    merchant_rows:1,account_rows:1,order_rows:1,
    security_scope_function:false,auth_runtime_function:false,
    operator_directory_function:false,
  }))deny(()=>assertG2SchemaPostimage({...after,[field]:bad},roles()));
  const elevated=roles();elevated[2].bypass_rls=true;
  deny(()=>assertG2SchemaPostimage(after,elevated));
});
