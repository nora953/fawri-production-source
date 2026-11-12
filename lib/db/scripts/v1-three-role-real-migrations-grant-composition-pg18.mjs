/**
 * P0-ACCESS-HOSTED-IDENTITY / P0-ACCESS-HOSTED-ROLLOUT:
 * NEW first-merchant integration of the 3 pinned V1 HELD grant sources
 * on the ACTUAL source-pinned 0000..0053 first-commercial candidate schema.
 * No legacy cashier grants, no staging imports, no external provider data.
 *
 * ONLY an isolated GitHub Actions PostgreSQL 18 LOCAL service.
 * This cannot become a production provisioning tool. No connection to Neon,
 * no production credentials, no deployment authority, no GO/P0 closure.
 */
import assert from 'node:assert/strict';
import {randomBytes,createHash} from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import pg from 'pg';
import {drizzle} from 'drizzle-orm/node-postgres';
import {migrate} from 'drizzle-orm/node-postgres/migrator';
import {materializeFt01LocalOnlyBundle}
  from '../../../scripts/lib/ft01-first-commercial-disposable-bundle.mjs';
import {buildP0Held0053SourceAdmissionPlan}
  from '../../../scripts/lib/p0-held-0053-source-admission-plan.mjs';
import {buildV1FirstMerchantGrantSourcePlan}
  from '../../../scripts/lib/v1-first-merchant-grant-package-source-plan.mjs';
import {stabilizeMigrationDependencyOrder} from './lib/migration-sql-order.mjs';

const {Client,Pool}=pg;
const repoRoot=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../..');
const DB='fawri';
const OWNER='fawri_owner';
const roles=['fawri_restricted_runtime','fawri_auth_issuer','fawri_operator_issuer'];
const disposableRoles=[...roles,'fawri_cashier_retirement_writer'];
const RESERVED='docs/final-audit/evidence/sql/P0-FT01-NEW-NEON-FOUR-NOLOGIN-ROLE-RESERVATION-HELD-20261109.sql';
const read=relative=>fs.readFileSync(path.join(repoRoot,relative),'utf8');
const sha256=s=>createHash('sha256').update(s,'utf8').digest('hex');
const sha1blob=s=>createHash('sha1').update('blob '+Buffer.byteLength(s)+'\0'+s).digest('hex');

function localOnly(){
  assert.equal(process.argv.length,2,'V1_COMBINED_NO_ARGS');
  assert.equal(process.env.GITHUB_ACTIONS,'true','V1_COMBINED_CI_ONLY');
  assert.equal(process.env.GITHUB_REPOSITORY,
    'nora953/fawri-production-source','V1_COMBINED_REPO_ONLY');
  assert.equal(process.env.FAWRI_ALLOW_FT01_INVOKER_CANDIDATE,'1',
    'V1_COMBINED_PINNED_MIGRATION_REQUIRED');
  assert.equal(process.env.FAWRI_ALLOW_LOCAL_V1_THREE_ROLE_COMPOSITION,'1',
    'V1_COMBINED_EXPLICIT_LOCAL_FLAG_REQUIRED');
  const url=new URL(process.env.DATABASE_URL??'');
  assert.equal(url.protocol,'postgresql:');
  assert.equal(url.hostname,'127.0.0.1');
  assert.equal(url.port,'5432');
  assert.equal(url.pathname,'/fawri_ci');
  assert.equal(decodeURIComponent(url.username),'fawri_ci');
  assert.equal(url.search,'');assert.equal(url.hash,'');
  return url;
}
function urlFor(u,role,secret,db=DB){
  const v=new URL(u.toString());v.username=role;v.password=secret;
  v.pathname='/'+db;return v.toString();
}
async function ensureCleanLocalCluster(admin){
  const row=(await admin.query(`SELECT current_database() AS db,
    current_setting('server_version_num')::int/10000 AS pg_major,
    (SELECT count(*)::int FROM pg_database WHERE datname=$1) AS db_count,
    (SELECT count(*)::int FROM pg_roles
      WHERE rolname=$2 OR rolname=ANY($3::text[])
        OR rolname='fawri_cashier_retirement_owner') AS role_count`,
    [DB,OWNER,disposableRoles])).rows[0];
  assert.deepEqual(row,{db:'fawri_ci',pg_major:18,db_count:0,role_count:0},
    'V1_COMBINED_DISPOSABLE_CLUSTER_NOT_EMPTY');
}
async function proveActualRole({rootUrl,role,password}){
  const client=new Client({connectionString:urlFor(rootUrl,role,password),
    connectionTimeoutMillis:3000,ssl:false});
  await client.connect();
  try {
    const row=(await client.query(`SELECT session_user AS session_login,
      current_user AS active_login,current_database() AS observed_db,
      r.rolcanlogin AS can_login,r.rolinherit AS inherit,
      r.rolsuper AS superuser,r.rolbypassrls AS bypassrls,
      r.rolcreaterole AS createrole,r.rolcreatedb AS createdb,
      r.rolreplication AS replication,
      EXISTS(SELECT 1 FROM pg_auth_members m WHERE m.member=r.oid)
         AS outgoing_membership,
      has_schema_privilege(session_user,'public','CREATE') AS public_create,
      has_function_privilege(session_user,
        'public.fawri_authentication_runtime()','EXECUTE') AS auth_marker,
      has_function_privilege(session_user,
        'fawri_security.issue_scope(name,integer,bigint,text)','EXECUTE')
         AS issue_scope,
      has_function_privilege(session_user,
        'fawri_security.allows_merchant(text)','EXECUTE') AS tenant_predicate,
      has_function_privilege(session_user,
        'public.fawri_issue_admin_directory_audit(text,text,text)',
        'EXECUTE') AS operator_directory,
      has_table_privilege(session_user,'public.cashier_device_streams',
         'SELECT,INSERT,UPDATE,DELETE') AS cashier_data,
      has_table_privilege(session_user,'public.verified_provider_payment_receipts',
         'SELECT,INSERT,UPDATE,DELETE') AS verified_receipt_table,
      has_table_privilege(session_user,'public.products','SELECT') AS products_select
      FROM pg_roles r WHERE r.rolname=session_user`)).rows[0];
    assert.deepEqual(row,{
      session_login:role,active_login:role,observed_db:DB,
      can_login:true,inherit:false,superuser:false,bypassrls:false,
      createrole:false,createdb:false,replication:false,
      outgoing_membership:false,public_create:false,
      auth_marker:role==='fawri_auth_issuer',
      issue_scope:role==='fawri_auth_issuer',
      tenant_predicate:role==='fawri_restricted_runtime',
      operator_directory:role==='fawri_operator_issuer',
      cashier_data:false,verified_receipt_table:false,
      products_select:role==='fawri_restricted_runtime',
    },'V1_COMBINED_REAL_ROLE_GRANTS_MISMATCH_'+role);
    // Online merchant reads are scoped by the real migrated policies, even
    // though the tenant has SELECT on the catalog relation.
    if (role==='fawri_restricted_runtime') {
      const result=await client.query('SELECT count(*)::int AS n FROM public.products');
      assert.equal(result.rows[0]?.n,0,
        'V1_COMBINED_NO_MERCHANT_SCOPE_MUST_SHOW_ZERO_PRODUCTS');
    }
  }finally{await client.end();}
}
async function main(){
  const root=localOnly();
  const grants=buildV1FirstMerchantGrantSourcePlan();
  const migration=buildP0Held0053SourceAdmissionPlan();
  assert.equal(grants.approved_to_execute,false);
  assert.equal(grants.selected_grant_sources.length,3);
  assert.equal(grants.legacy_not_selected.length,2);
  assert.equal(migration.proposed_held_source_migrations,54);
  assert.equal(migration.approved_to_execute,false);
  const reservation=read(RESERVED);
  assert.equal(sha256(reservation),grants.reservation_sql_sha256,
    'V1_COMBINED_RESERVED_FOUR_ROLE_SQL_DRIFT');
  const admin=new Client({connectionString:root.toString(),
    ssl:false,connectionTimeoutMillis:3000});
  const ownerPassword=randomBytes(32).toString('hex');
  const passwords=Object.fromEntries(roles.map(role=>[
    role,randomBytes(32).toString('hex')]));
  let dbCreated=false,ownerCreated=false,ownerPool,folder;
  await admin.connect();
  try {
    await ensureCleanLocalCluster(admin);
    await admin.query(`CREATE ROLE ${OWNER} LOGIN NOSUPERUSER
      BYPASSRLS CREATEROLE CREATEDB REPLICATION
      PASSWORD '${ownerPassword}'`);
    ownerCreated=true;
    await admin.query(`CREATE DATABASE ${DB} OWNER ${OWNER}`);
    dbCreated=true;
    ownerPool=new Pool({connectionString:urlFor(root,OWNER,ownerPassword),
      max:2,ssl:false,connectionTimeoutMillis:3000});
    const who=(await ownerPool.query(`SELECT session_user AS role,
      current_database() AS db,rolsuper AS super
      FROM pg_roles WHERE rolname=session_user`)).rows[0];
    assert.deepEqual(who,{role:OWNER,db:DB,super:false});
    // This is the pre-migration HELD reservation source unchanged.
    await ownerPool.query(reservation);
    const noLogin=(await ownerPool.query(`SELECT count(*)::int AS n
      FROM pg_roles WHERE rolname=ANY($1::text[])
        AND NOT (rolcanlogin OR rolinherit OR rolsuper
          OR rolbypassrls OR rolcreaterole OR rolcreatedb OR rolreplication)`,
      [disposableRoles])).rows[0].n;
    assert.equal(noLogin,4,'V1_COMBINED_RESERVED_ROLES_NOT_HELD');
    const bundle=materializeFt01LocalOnlyBundle();
    folder=bundle.folder;
    assert.equal(bundle.manifest.entries.length,53);
    const tail=read(migration.proposed_sql_path);
    const heldJournal=read(migration.proposed_journal_path);
    assert.equal(sha256(tail),migration.candidate_0053_sql_sha256);
    assert.equal(sha256(heldJournal),migration.candidate_0053_held_journal_sha256);
    fs.writeFileSync(path.join(folder,'meta','_journal.json'),heldJournal,'utf8');
    fs.writeFileSync(path.join(folder,'0053_verified_receipt_manual_cases_candidate.sql'),
      stabilizeMigrationDependencyOrder(tail),{flag:'wx',mode:0o600});
    assert.equal(fs.readdirSync(folder).filter(x=>x.endsWith('.sql')).length,54);
    // Migrate ONCE for this NEW integrated V1-grants case, not rerun the
    // already accepted separate 53/54-stage migration smoke suites.
    await migrate(drizzle(ownerPool),{migrationsFolder:folder});
    const count=(await ownerPool.query(
      'SELECT count(*)::int AS n FROM drizzle.__drizzle_migrations')).rows[0].n;
    assert.equal(count,54,'V1_COMBINED_0052_0053_LEDGER_REQUIRED');
    console.log('V1_COMBINED_REAL_54_STAGE_HELD_SCHEMA_READY');

    for(const role of roles){
      assert.match(passwords[role],/^[0-9a-f]{64}$/);
      await ownerPool.query(`ALTER ROLE ${role}
        LOGIN NOINHERIT NOSUPERUSER NOBYPASSRLS
        NOCREATEROLE NOCREATEDB NOREPLICATION CONNECTION LIMIT 2
        PASSWORD '${passwords[role]}'`);
    }
    // Execute only the SELECTED V1 GRANT fragments. 0052 legacy cashier
    // grants and 0053 overlapping legacy operator grants are NOT executed.
    const selected=new Set(grants.selected_grant_sources.map(x=>x.role));
    assert.deepEqual([...selected].sort(),[...roles].sort());
    for(const item of grants.selected_grant_sources){
      const sql=read(item.source_path);
      assert.equal(sha1blob(sql),item.reviewed_git_blob_sha1,
        'V1_COMBINED_UNPINNED_GRANT_SOURCE');
      await ownerPool.query(sql);
    }
    for(const role of roles) {
      await proveActualRole({rootUrl:root,role,password:passwords[role]});
    }
    // Real 54-stage migration RLS presence, not a synthetic policy fixture.
    const required=['products','orders','order_items','location_inventory_levels'];
    const flags=(await ownerPool.query(`SELECT c.relname,c.relrowsecurity,
      EXISTS(SELECT 1 FROM pg_policy p WHERE p.polrelid=c.oid) AS policy_exists
      FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='public' AND c.relname=ANY($1::text[])
        AND c.relkind IN ('r','p') ORDER BY c.relname`,[required])).rows;
    assert.equal(flags.length,required.length);
    assert.ok(flags.every(f=>f.relrowsecurity&&f.policy_exists),
      'V1_COMBINED_REAL_RLS_POLICY_MISSING');
    console.log('V1_COMBINED_THREE_ACTUAL_AUTHENTICATED_LOGIN_ACL_PASS');
    console.log('V1_COMBINED_POS_OFF_CASHIER_GRANTS_EXCLUDED_PASS');
    console.log('V1_COMBINED_SOURCE_ONLY_NOT_HOSTED_OR_RELEASE_APPROVAL');
  }finally{
    if(ownerPool)await ownerPool.end();
    if(folder)fs.rmSync(folder,{recursive:true,force:true});
    if(dbCreated)await admin.query(`DROP DATABASE IF EXISTS ${DB} WITH (FORCE)`);
    if(ownerCreated){
      for(const role of [
        'fawri_cashier_retirement_owner',
        ...[...disposableRoles].reverse(),
        OWNER]){
        await admin.query('DROP ROLE IF EXISTS '+role);
      }
    }
    const remain=(await admin.query(`SELECT count(*)::int AS n FROM pg_roles
      WHERE rolname=$1 OR rolname=ANY($2::text[])
        OR rolname='fawri_cashier_retirement_owner'`,
      [OWNER,disposableRoles])).rows[0].n;
    assert.equal(remain,0,'V1_COMBINED_DISPOSABLE_ROLES_LEFT_BEHIND');
    await admin.end();
    console.log('V1_COMBINED_LOCAL_PG18_ALL_ROLES_CLEANED_NO_NEON');
  }
}
await main();
