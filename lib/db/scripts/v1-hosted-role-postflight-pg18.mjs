/**
 * V1 P0-ACCESS-HOSTED-IDENTITY. Only a new local disposable PG18 in GitHub CI.
 * Tests the NEW held read-only postflight SQL against a synthetic catalog,
 * with transactional rollback and negative privilege mutations.
 * Never connects to Neon or reads customer data, never provisions production.
 */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import pg from 'pg';

const SQL = readFileSync(fileURLToPath(new URL(
  '../../../docs/final-audit/evidence/sql/P0-V1-FIRST-MERCHANT-ROLE-POSTFLIGHT-READONLY-HELD-20261112.sql',
  import.meta.url)), 'utf8');
const {Client} = pg;
const ROLES = ['fawri_restricted_runtime','fawri_auth_issuer','fawri_operator_issuer'];
const expectedNames = [...ROLES].sort();
function localTarget() {
  assert.equal(process.env.GITHUB_ACTIONS, 'true', 'V1_GITHUB_CI_ONLY');
  assert.equal(process.env.GITHUB_REPOSITORY,
    'nora953/fawri-production-source', 'V1_WRONG_REPO');
  assert.equal(process.env.FAWRI_ALLOW_LOCAL_V1_ROLE_PROBE, '1',
    'V1_EXPLICIT_LOCAL_TEST_FLAG_REQUIRED');
  const target = new URL(process.env.DATABASE_URL ?? '');
  assert.equal(target.protocol, 'postgresql:');
  assert.equal(target.hostname, '127.0.0.1');
  assert.equal(target.port, '5432');
  assert.equal(target.pathname, '/fawri_ci');
  assert.equal(decodeURIComponent(target.username), 'fawri_ci');
  assert.equal(target.search, '');
  assert.equal(target.hash, '');
  return target.toString();
}
function ensureOnlyReadOnlyCatalogSource() {
  const body=SQL.replace(/^--.*$/gm,'').trim();
  assert.match(body, /^WITH expected\s*\(/);
  assert.match(body, /\bSELECT\s+current_database\(\)/);
  assert.doesNotMatch(body, /\b(?:CREATE|ALTER|DROP|TRUNCATE|UPDATE|INSERT|DELETE|GRANT|REVOKE|COPY|DO|CALL|EXECUTE)\b/i);
  assert.equal((body.match(/;/g)??[]).length, 1, 'V1_ONE_READONLY_SQL_STATEMENT');
}
async function getRows(client) {
  const result = await client.query(SQL);
  assert.deepEqual(result.rows.map(x=>x.role_name),expectedNames);
  assert.equal(result.rows.length,3);
  assert.ok(result.rows.every(x=>x.observed_postgres_major===18));
  assert.ok(result.rows.every(x=>x.observed_database_name==='fawri_ci'));
  return result.rows;
}
async function expectStatus(client, conditions, label) {
  const rows=await getRows(client);
  for (const [profile, want] of Object.entries(conditions)) {
    const row=rows.find(x=>x.profile===profile);
    assert.ok(row, label+': role missing from output');
    assert.equal(row.preliminary_role_profile_pass,want,label+': '+profile);
  }
  return rows;
}
async function fixture(client) {
  await client.query('CREATE SCHEMA fawri_security');
  await client.query(`CREATE FUNCTION fawri_security.allows_merchant(text)
    RETURNS boolean LANGUAGE sql AS 'SELECT true'`);
  await client.query(`CREATE FUNCTION public.fawri_authentication_runtime()
    RETURNS void LANGUAGE plpgsql AS $$BEGIN RETURN; END;$$`);
  await client.query(`CREATE FUNCTION fawri_security.issue_scope(name,integer,bigint,text)
    RETURNS void LANGUAGE plpgsql AS $$BEGIN RETURN; END;$$`);
  await client.query(`CREATE FUNCTION public.fawri_issue_admin_directory_audit(text,text,text)
    RETURNS void LANGUAGE plpgsql AS $$BEGIN RETURN; END;$$`);
  await client.query(`CREATE TABLE public.notifications (id integer)`);
  for(const table of ['order_drafts','merchant_admin_notes',
    'merchant_deletion_requests','support_inspection_requests']) {
    await client.query(`CREATE TABLE public.${table} (id integer)`);
  }
  // PostgreSQL functions default to PUBLIC execute. Explicitly revoke before
  // adding exact role-specific allowlisted capabilities.
  for(const fn of [
    'fawri_security.allows_merchant(text)',
    'public.fawri_authentication_runtime()',
    'fawri_security.issue_scope(name,integer,bigint,text)',
    'public.fawri_issue_admin_directory_audit(text,text,text)',
  ]) await client.query(`REVOKE ALL ON FUNCTION ${fn} FROM PUBLIC`);
  await expectStatus(client,{tenant:false,auth:false,operator:false},
    'roles absent before any local role creation');
  for(const role of ROLES) {
    await client.query(`CREATE ROLE ${role}
      NOLOGIN NOINHERIT NOSUPERUSER NOBYPASSRLS
      NOCREATEROLE NOCREATEDB NOREPLICATION`);
  }
  await expectStatus(client,{tenant:false,auth:false,operator:false},
    'NOLOGIN reservation must not be a preliminary pass');
  for(const role of ROLES) await client.query(`ALTER ROLE ${role} LOGIN`);
  await client.query(`GRANT USAGE ON SCHEMA fawri_security
    TO fawri_restricted_runtime,fawri_auth_issuer`);
  await client.query(`GRANT EXECUTE ON FUNCTION fawri_security.allows_merchant(text)
    TO fawri_restricted_runtime`);
  await client.query(`GRANT EXECUTE ON FUNCTION public.fawri_authentication_runtime()
    TO fawri_auth_issuer`);
  await client.query(`GRANT EXECUTE ON FUNCTION
    fawri_security.issue_scope(name,integer,bigint,text) TO fawri_auth_issuer`);
  await client.query(`GRANT EXECUTE ON FUNCTION
    public.fawri_issue_admin_directory_audit(text,text,text)
    TO fawri_operator_issuer`);
  await client.query('GRANT SELECT ON public.notifications TO fawri_restricted_runtime');
}
async function denyMutation(client, label, sql, failed) {
  await client.query('SAVEPOINT v1_local_negative');
  try {
    await client.query(sql);
    const rows=await expectStatus(client,failed,label);
    assert.ok(rows.some(x=>x.preliminary_role_profile_pass===false),
      label+': must fail closed');
  } finally {
    await client.query('ROLLBACK TO SAVEPOINT v1_local_negative');
    await client.query('RELEASE SAVEPOINT v1_local_negative');
  }
  await expectStatus(client,{tenant:true,auth:true,operator:true},
    label+' rollback must return to positive baseline');
}
async function main() {
  ensureOnlyReadOnlyCatalogSource();
  const url=localTarget();
  const client=new Client({connectionString:url,ssl:false,connectionTimeoutMillis:3000});
  await client.connect();
  let begun=false;
  try {
    const pre=(await client.query(`SELECT current_database() AS db,
      current_setting('server_version_num')::integer / 10000 AS major,
      session_user AS actor,
      (SELECT count(*)::integer FROM pg_catalog.pg_roles
       WHERE rolname IN ('fawri_restricted_runtime','fawri_auth_issuer',
         'fawri_operator_issuer')) AS preexisting`)).rows[0];
    assert.deepEqual(pre,{db:'fawri_ci',major:18,actor:'fawri_ci',preexisting:0});
    await client.query('BEGIN');begun=true;
    await client.query("SET LOCAL statement_timeout='20s'");
    await client.query("SET LOCAL lock_timeout='3s'");
    await fixture(client);
    const baseline=await expectStatus(client,
      {tenant:true,auth:true,operator:true},'restricted capability baseline');
    assert.equal(baseline.find(x=>x.profile==='tenant')
      .can_directly_reach_tenant_sensitive_rows,true,
      'tenant may read its own RLS-protected rows only; SQL alone cannot prove RLS');
    await denyMutation(client,'tenant AUTH marker escalation',
      'GRANT EXECUTE ON FUNCTION public.fawri_authentication_runtime() TO fawri_restricted_runtime',
      {tenant:false,auth:true,operator:true});
    await denyMutation(client,'auth direct tenant SELECT escalation',
      'GRANT SELECT ON public.notifications TO fawri_auth_issuer',
      {tenant:true,auth:false,operator:true});
    await denyMutation(client,'operator issue_scope escalation',
      'GRANT EXECUTE ON FUNCTION fawri_security.issue_scope(name,integer,bigint,text) TO fawri_operator_issuer',
      {tenant:true,auth:true,operator:false});
    await denyMutation(client,'auth operator issuer escalation',
      'GRANT EXECUTE ON FUNCTION public.fawri_issue_admin_directory_audit(text,text,text) TO fawri_auth_issuer',
      {tenant:true,auth:false,operator:true});
    await denyMutation(client,'runtime BYPASSRLS escalation',
      'ALTER ROLE fawri_restricted_runtime BYPASSRLS',
      {tenant:false,auth:true,operator:true});
    await denyMutation(client,'auth NOLOGIN cutover',
      'ALTER ROLE fawri_auth_issuer NOLOGIN',
      {tenant:true,auth:false,operator:true});
    await denyMutation(client,'tenant role membership escalation',
      'GRANT fawri_auth_issuer TO fawri_restricted_runtime',
      {tenant:false,auth:true,operator:true});
    await denyMutation(client,'public schema CREATE escalation',
      'GRANT CREATE ON SCHEMA public TO fawri_restricted_runtime',
      {tenant:false,auth:true,operator:true});
    await denyMutation(client,'PUBLIC function EXECUTE drift',
      'GRANT EXECUTE ON FUNCTION public.fawri_authentication_runtime() TO PUBLIC',
      {tenant:false,auth:true,operator:true});
    console.log('V1_ROLE_POSTFLIGHT_LOCAL_PG18_POSITIVE_NEGATIVE_PASS');
    console.log('V1_ROLE_POSTFLIGHT_TRANSACTION_ROLLBACK_PASS');
    console.log('V1_ROLE_POSTFLIGHT_NO_NEON_NO_MERCHANT_DATA_NO_RELEASE_PASS');
  } finally {
    if(begun) await client.query('ROLLBACK');
    const remaining=(await client.query(`SELECT count(*)::integer AS n
      FROM pg_catalog.pg_roles WHERE rolname IN
      ('fawri_restricted_runtime','fawri_auth_issuer','fawri_operator_issuer')`)).rows[0].n;
    assert.equal(remaining,0,'V1_LOCAL_ROLE_CLEANUP_REQUIRED');
    await client.end();
  }
}
await main();
