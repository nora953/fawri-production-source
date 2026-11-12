/**
 * P0-ACCESS-HOSTED-IDENTITY: validates the exact HELD V1 authentication core
 * GRANT source against a disposable LOCAL PostgreSQL 18 catalog.
 * No Neon, no credentials, no company data, no migration/release authority.
 * Synthetic tables/functions only; unrelated accepted CI is not repeated.
 */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import pg from 'pg';

const source=readFileSync(fileURLToPath(new URL(
  '../first-commercial/held/v1_authentication_core_grants.sql',import.meta.url)),
  'utf8');
const PINNED_GIT_BLOB_SHA1='fe314f951f3836009a18a505ae1547572a270f28';
const digest=createHash('sha1').update('blob '+Buffer.byteLength(source)+'\0'+source).digest('hex');
assert.equal(digest,PINNED_GIT_BLOB_SHA1,
  'V1_AUTH_GRANTS_REVIEWED_SOURCE_PIN_DRIFT');

const AUTH='fawri_auth_issuer';
const coreTables=Object.freeze([
  'accounts','admin_profiles','admin_permissions','account_sessions',
  'trusted_devices','auth_otp_challenges','login_attempts','auth_audit_events',
]);
const setupTables=Object.freeze([...coreTables,'merchants','merchant_settings',
  'cashier_device_streams','notifications','order_drafts']);

function target() {
  assert.equal(process.argv.length,2,'V1_NO_ARGUMENTS');
  assert.equal(process.env.GITHUB_ACTIONS,'true','V1_CI_ONLY');
  assert.equal(process.env.GITHUB_REPOSITORY,
    'nora953/fawri-production-source','V1_REPO_MISMATCH');
  assert.equal(process.env.FAWRI_ALLOW_V1_LOCAL_AUTH_GRANTS,'1',
    'V1_EXPLICIT_LOCAL_AUTH_ONLY');
  const url=new URL(process.env.DATABASE_URL??'');
  assert.equal(url.protocol,'postgresql:','V1_POSTGRES_ONLY');
  assert.equal(url.hostname,'127.0.0.1','V1_LOOPBACK_ONLY');
  assert.equal(url.port,'5432','V1_LOCAL_PORT_ONLY');
  assert.equal(url.pathname,'/fawri_ci','V1_LOCAL_DATABASE_ONLY');
  assert.equal(decodeURIComponent(url.username),'fawri_ci','V1_LOCAL_OWNER_ONLY');
  assert.equal(url.search,'','V1_NO_EXTRA_CONNECTION_OPTIONS');
  assert.equal(url.hash,'','V1_NO_CONNECTION_FRAGMENT');
  return url.toString();
}
function localize() {
  const starting="BEGIN;\nSET LOCAL statement_timeout = '20s';\nSET LOCAL lock_timeout = '3s';\n";
  assert.equal(source.split(starting).length,2,'V1_SOURCE_TRANSACTION_START_DRIFT');
  assert.match(source,/\nCOMMIT;\n$/,'V1_SOURCE_TRANSACTION_END_DRIFT');
  // Test-only substitution: run original reviewed GRANT body inside a
  // disposable outer BEGIN so even role creation is rolled back.
  const sql=source.replace(starting,'').replace(/\nCOMMIT;\n$/,'\n')
    .replace("current_database() <> 'fawri'","current_database() <> 'fawri_ci'")
    .replace("session_user <> 'fawri_owner'","session_user <> 'fawri_ci'");
  assert.ok(!sql.includes("current_database() <> 'fawri'"));
  assert.ok(!sql.includes("session_user <> 'fawri_owner'"));
  const post=sql.match(/DO \$v1_auth_postimage\$[\s\S]*?\$v1_auth_postimage\$;/);
  assert.ok(post,'V1_SOURCE_POSTIMAGE_MISSING');
  return {sql,postSql:post[0]};
}
async function setup(client) {
  await client.query('CREATE SCHEMA fawri_security');
  await client.query('REVOKE ALL ON SCHEMA fawri_security FROM PUBLIC');
  await client.query('CREATE SCHEMA drizzle');
  await client.query('CREATE TABLE drizzle.__drizzle_migrations (id integer)');
  for(const table of setupTables)
    await client.query(`CREATE TABLE public.${table} (id text PRIMARY KEY)`);
  await client.query(`CREATE FUNCTION public.fawri_authentication_runtime()
    RETURNS boolean LANGUAGE sql AS 'SELECT true'`);
  await client.query(`CREATE FUNCTION fawri_security.issue_scope(name,integer,bigint,text)
    RETURNS void LANGUAGE plpgsql AS $$BEGIN RETURN; END;$$`);
  await client.query(`CREATE FUNCTION public.fawri_issue_admin_directory_audit(text,text,text)
    RETURNS boolean LANGUAGE sql AS 'SELECT true'`);
  // Deliberately leave PostgreSQL's default PUBLIC execute on the auth
  // marker/scope issuer: the HELD source itself must close this gap.
  await client.query(`REVOKE ALL ON FUNCTION
    public.fawri_issue_admin_directory_audit(text,text,text) FROM PUBLIC`);
  for(const role of ['fawri_restricted_runtime','fawri_operator_issuer']) {
    await client.query(`CREATE ROLE ${role}
      NOLOGIN NOINHERIT NOSUPERUSER NOBYPASSRLS
      NOCREATEDB NOCREATEROLE NOREPLICATION`);
  }
  await client.query(`CREATE ROLE ${AUTH}
    LOGIN NOINHERIT NOSUPERUSER NOBYPASSRLS
    NOCREATEDB NOCREATEROLE NOREPLICATION`);
}

async function allows(client, table, privilege) {
  const r=await client.query(
    'SELECT has_table_privilege($1::text,$2::text,$3::text) AS allowed',
    [AUTH,'public.'+table,privilege]);
  return r.rows[0].allowed;
}
async function execAllowed(client, fn) {
  const r=await client.query(
    'SELECT has_function_privilege($1::text,$2::text,\'EXECUTE\') AS allowed',
    [AUTH,fn]);
  return r.rows[0].allowed;
}
async function positive(client) {
  const verified=await client.query(`SELECT
    session_user::text AS actor,
    (SELECT count(*)::int FROM pg_roles WHERE rolname='${AUTH}'
       AND rolcanlogin AND NOT (rolsuper OR rolbypassrls OR rolcreaterole
         OR rolcreatedb OR rolreplication OR rolinherit)) AS expected,
    (SELECT count(*)::int FROM pg_auth_members m
      JOIN pg_roles r ON r.oid=m.member WHERE r.rolname='${AUTH}') AS memberships`);
  assert.equal(verified.rows[0].expected,1);
  assert.equal(verified.rows[0].memberships,0);
  for(const table of coreTables)
    for(const right of ['SELECT','INSERT','UPDATE','DELETE'])
      assert.equal(await allows(client,table,right),true,
        `V1_AUTH_MISSING_CORE_RIGHT_${table}_${right}`);
  for(const table of ['merchants','merchant_settings']){
    for(const right of ['SELECT','INSERT','UPDATE'])
      assert.equal(await allows(client,table,right),true,
        `V1_AUTH_MISSING_MERCHANT_RIGHT_${table}_${right}`);
    assert.equal(await allows(client,table,'DELETE'),false,
      `V1_AUTH_MERCHANT_DELETE_FORBIDDEN_${table}`);
  }
  for(const table of ['cashier_device_streams','notifications','order_drafts'])
    for(const right of ['SELECT','INSERT','UPDATE','DELETE','TRUNCATE',
      'TRIGGER','REFERENCES'])
      assert.equal(await allows(client,table,right),false,
        `V1_AUTH_UNEXPECTED_TENANT_POS_PRIVILEGE_${table}_${right}`);
  assert.equal(await execAllowed(client,'public.fawri_authentication_runtime()'),true);
  assert.equal(await execAllowed(client,
    'fawri_security.issue_scope(name,integer,bigint,text)'),true);
  assert.equal(await execAllowed(client,
    'public.fawri_issue_admin_directory_audit(text,text,text)'),false);
  for(const role of ['fawri_restricted_runtime','fawri_operator_issuer']) {
    for(const fn of [
      'public.fawri_authentication_runtime()',
      'fawri_security.issue_scope(name,integer,bigint,text)',
    ]) {
      const row=await client.query(
        "SELECT has_function_privilege($1::text,$2::text,'EXECUTE') AS allowed",
        [role,fn]);
      assert.equal(row.rows[0].allowed,false,
        `V1_AUTH_TRUSTED_MARKER_BLEED_${role}_${fn}`);
    }
  }
  const schemas=await client.query(`SELECT
    has_schema_privilege($1,'public','CREATE') AS public_create,
    has_schema_privilege($1,'fawri_security','CREATE') AS private_create`,[AUTH]);
  assert.deepEqual(schemas.rows[0],{public_create:false,private_create:false});
}
async function negative(client, postSql, label, mutation) {
  await client.query('SAVEPOINT v1_negative');
  try{
    await client.query(mutation);
    await assert.rejects(
      ()=>client.query(postSql),
      e=>e?.message?.includes('V1_AUTH_CORE_GRANT_POSTIMAGE_NOT_ACCEPTED'),
      label);
  } finally {
    await client.query('ROLLBACK TO SAVEPOINT v1_negative');
    await client.query('RELEASE SAVEPOINT v1_negative');
  }
  await positive(client);
}
async function main() {
  const connection=target();
  const {sql,postSql}=localize();
  const db=new pg.Client({connectionString:connection,ssl:false,
    connectionTimeoutMillis:3000});
  await db.connect();
  let began=false;
  try{
    const pre=(await db.query(`SELECT current_database()::text AS db,
      current_setting('server_version_num')::int/10000 AS major,
      (SELECT count(*)::int FROM pg_roles WHERE rolname='${AUTH}') AS existing`)).rows[0];
    assert.deepEqual(pre,{db:'fawri_ci',major:18,existing:0},
      'V1_AUTH_LOCAL_EMPTY_ROLE_PREIMAGE_REQUIRED');
    await db.query('BEGIN');began=true;
    await db.query("SET LOCAL statement_timeout='20s'");
    await db.query("SET LOCAL lock_timeout='3s'");
    await setup(db);
    await db.query(sql);
    await positive(db);
    await negative(db,postSql,'auth must not reach cashier table',
      'GRANT SELECT ON public.cashier_device_streams TO fawri_auth_issuer');
    await negative(db,postSql,'auth must not reach notification rows',
      'GRANT SELECT ON public.notifications TO fawri_auth_issuer');
    await negative(db,postSql,'auth must not acquire operator issuer',
      'GRANT EXECUTE ON FUNCTION public.fawri_issue_admin_directory_audit(text,text,text) TO fawri_auth_issuer');
    await negative(db,postSql,'auth must not bypass RLS',
      'ALTER ROLE fawri_auth_issuer BYPASSRLS');
    await negative(db,postSql,'auth must not gain CREATEROLE',
      'ALTER ROLE fawri_auth_issuer CREATEROLE');
    await negative(db,postSql,'auth must not gain schema CREATE',
      'GRANT CREATE ON SCHEMA public TO fawri_auth_issuer');
    await negative(db,postSql,'auth must not become NOLOGIN',
      'ALTER ROLE fawri_auth_issuer NOLOGIN');
    await negative(db,postSql,'PUBLIC must not inherit trusted marker',
      'GRANT EXECUTE ON FUNCTION public.fawri_authentication_runtime() TO PUBLIC');
    await negative(db,postSql,'tenant must not issue scopes',
      'GRANT EXECUTE ON FUNCTION fawri_security.issue_scope(name,integer,bigint,text) TO fawri_restricted_runtime');
    await negative(db,postSql,'operator must not issue scopes',
      'GRANT EXECUTE ON FUNCTION fawri_security.issue_scope(name,integer,bigint,text) TO fawri_operator_issuer');
    console.log('V1_AUTH_TRUSTED_MARKER_PUBLIC_CROSSROLE_DENIAL_PASS');
    console.log('V1_AUTH_CORE_HELD_EXACT_SOURCE_PG18_PASS');
    console.log('V1_AUTH_NO_CASHIER_NO_TENANT_ROWS_OPERATOR_DENIAL_PASS');
  } finally {
    if(began) await db.query('ROLLBACK');
    const q=(await db.query(`SELECT count(*)::int AS n FROM pg_roles
      WHERE rolname IN ('fawri_auth_issuer',
        'fawri_restricted_runtime','fawri_operator_issuer')`)).rows[0];
    assert.equal(q.n,0,'V1_AUTH_DISPOSABLE_ROLES_NOT_CLEANED');
    await db.end();
    console.log('V1_AUTH_CI_ROLLBACK_ZERO_ROLES_NO_NEON_PASS');
  }
}
await main();
