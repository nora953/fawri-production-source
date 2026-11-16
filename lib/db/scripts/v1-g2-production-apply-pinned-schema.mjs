/**
 * FAWRI V1 G2-B: EXACT SOURCE-PINNED 54-STAGE fresh PostgreSQL18 schema.
 *
 * This is NOT the existing disposable CI runner. Only the separately approved
 * first-commercial Neon project/branch and owner URL may be touched, through
 * explicit one-time GitHub Actions owner opt-in. It DOES NOT create passwords,
 * LOGINs, application GRANTs, POS activation or merchant rows.
 *
 * If a migration fails, do not drop tables or restore automatically: stop
 * all application startup and require source-preserving DBA recovery review.
 */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import pg from 'pg';
import {drizzle} from 'drizzle-orm/node-postgres';
import {migrate} from 'drizzle-orm/node-postgres/migrator';
import {buildFt01DisposableBundleManifest}
  from '../../../scripts/lib/ft01-first-commercial-disposable-bundle.mjs';
import {buildP0Held0053SourceAdmissionPlan}
  from '../../../scripts/lib/p0-held-0053-source-admission-plan.mjs';
import {stabilizeMigrationDependencyOrder}
  from './lib/migration-sql-order.mjs';
import {
  G2_SCHEMA_TARGET,assertG2SchemaOptIn,assertG2SchemaOwnerUrl,
  assertG2SchemaPreimage,assertG2SchemaPostimage,
} from '../../../scripts/lib/v1-g2-production-schema-migration-safety.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../..');
const hash=s=>createHash('sha256').update(s,'utf8').digest('hex');
const fail=code=>{const e=new Error(code);e.code=code;throw e;};
const read=rel=>fs.readFileSync(path.join(root,rel),'utf8');
const roleNames=['fawri_restricted_runtime','fawri_auth_issuer',
  'fawri_operator_issuer','fawri_cashier_retirement_writer'];

const roleSQL=`SELECT r.rolname::text AS name,
  r.rolcanlogin AS can_login,r.rolinherit AS inherit,
  r.rolsuper AS superuser,r.rolbypassrls AS bypass_rls,
  r.rolcreaterole AS can_create_roles,r.rolcreatedb AS can_create_db,
  r.rolreplication AS replication,
  (SELECT count(*)::int FROM pg_auth_members m WHERE m.member=r.oid)
     AS outgoing_membership,
  (SELECT count(*)::int FROM pg_auth_members m WHERE m.roleid=r.oid)
     AS inbound_count,
  (SELECT count(*)::int FROM pg_auth_members m JOIN pg_roles u
     ON u.oid=m.member WHERE m.roleid=r.oid AND u.rolname='fawri_owner'
     AND m.admin_option AND NOT m.inherit_option AND NOT m.set_option)
     AS inbound_creator_only,
  has_schema_privilege(r.oid,'public','CREATE') AS public_create
  FROM pg_roles r WHERE r.rolname=ANY($1::text[]) ORDER BY r.rolname`;

const preflightSQL=`SELECT current_database()::text AS db,
 session_user::text AS actor,current_user::text AS active,
 current_setting('server_version_num')::int/10000 AS pg_major,
 (SELECT count(*)::int FROM pg_class c JOIN pg_namespace n ON c.relnamespace=n.oid
   WHERE n.nspname NOT IN ('pg_catalog','information_schema')
     AND n.nspname NOT LIKE 'pg_toast%' AND n.nspname NOT LIKE 'pg_temp_%'
     AND c.relkind IN ('r','p','v','m','f','S')) AS user_relations,
 (SELECT count(*)::int FROM pg_class c JOIN pg_namespace n ON c.relnamespace=n.oid
   WHERE n.nspname='drizzle' AND c.relname='__drizzle_migrations') AS drizzle_ledger,
 pg_has_role(session_user,'pg_read_all_stats','USAGE') AS owner_stats,
 (SELECT rolcreaterole FROM pg_roles WHERE rolname=session_user)
    AS owner_create_role,
 (SELECT rolsuper FROM pg_roles WHERE rolname=session_user)
    AS is_owner_superuser`;

const postflightSQL=`SELECT current_database()::text AS db,
 session_user::text AS actor,current_setting('server_version_num')::int/10000 AS pg_major,
 (SELECT count(*)::int FROM drizzle.__drizzle_migrations) AS migration_count,
 (SELECT count(*)::int FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relkind IN ('r','p')) AS public_tables,
 (SELECT count(*)::int FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relkind IN ('r','p')
      AND c.relrowsecurity) AS rls_enabled_tables,
 (SELECT count(*)::int FROM pg_policies WHERE schemaname='public')
    AS public_rls_policies,
 (SELECT count(*)::int FROM public.merchants) AS merchant_rows,
 (SELECT count(*)::int FROM public.accounts) AS account_rows,
 (SELECT count(*)::int FROM public.orders) AS order_rows,
 (to_regprocedure('fawri_security.issue_scope(name,integer,bigint,text)')
    IS NOT NULL) AS security_scope_function,
 (to_regprocedure('public.fawri_authentication_runtime()')
    IS NOT NULL) AS auth_runtime_function,
 (to_regprocedure('public.fawri_issue_admin_directory_audit(text,text,text)')
    IS NOT NULL) AS operator_directory_function`;

function materializePinnedFirstCommercialSchema(){
  const baseline=buildFt01DisposableBundleManifest();
  const tail=buildP0Held0053SourceAdmissionPlan();
  if(baseline.entries.length!==53 || tail.proposed_held_source_migrations!==54 ||
     baseline.entries[52].selected_tag!=='0052_cashier_stream_receipt_storage_invoker' ||
     tail.approved_to_execute!==false ||
     baseline.source_only!==true ||
     tail.target.project_id!==G2_SCHEMA_TARGET.project ||
     tail.target.branch_id!==G2_SCHEMA_TARGET.branch ||
     tail.target.database_name!==G2_SCHEMA_TARGET.database){
    fail('V1_G2_SCHEMA_SOURCE_NOT_PINNED');
  }
  const folder=fs.mkdtempSync(path.join(os.tmpdir(),'fawri-v1-g2-schema-'));
  try{
    fs.mkdirSync(path.join(folder,'meta'));
    const journal=read(tail.proposed_journal_path);
    if(hash(journal)!==tail.candidate_0053_held_journal_sha256){
      fail('V1_G2_SCHEMA_JOURNAL_DRIFT');
    }
    fs.writeFileSync(path.join(folder,'meta','_journal.json'),journal,
      {flag:'wx',mode:0o600});
    const snapshot=read('lib/db/drizzle/meta/0052_snapshot.json');
    if(hash(snapshot)!==baseline.snapshot_0052_sha256){
      fail('V1_G2_SCHEMA_SNAPSHOT_DRIFT');
    }
    fs.writeFileSync(path.join(folder,'meta','0052_snapshot.json'),snapshot,
      {flag:'wx',mode:0o600});
    for(const entry of baseline.entries){
      const source=entry.index===52
        ? 'lib/db/first-commercial/held/0052_cashier_stream_receipt_storage_invoker.sql'
        : 'lib/db/drizzle/'+entry.tag+'.sql';
      const raw=read(source);
      if(hash(raw)!==entry.selected_sha256)fail('V1_G2_SCHEMA_MIGRATION_SOURCE_DRIFT');
      const prepared=stabilizeMigrationDependencyOrder(raw);
      if(hash(prepared)!==entry.executable_sha256){
        fail('V1_G2_SCHEMA_MIGRATION_EXECUTABLE_DRIFT');
      }
      fs.writeFileSync(path.join(folder,entry.selected_tag+'.sql'),prepared,
        {flag:'wx',mode:0o600});
    }
    const last=read(tail.proposed_sql_path);
    if(hash(last)!==tail.candidate_0053_sql_sha256){
      fail('V1_G2_SCHEMA_0053_SOURCE_DRIFT');
    }
    fs.writeFileSync(path.join(folder,
      '0053_verified_receipt_manual_cases_candidate.sql'),
      stabilizeMigrationDependencyOrder(last),{flag:'wx',mode:0o600});
    const files=fs.readdirSync(folder).filter(x=>x.endsWith('.sql'));
    if(files.length!==54 || new Set(files).size!==54){
      fail('V1_G2_SCHEMA_STAGE_COUNT_DRIFT');
    }
    return folder;
  }catch(e){fs.rmSync(folder,{recursive:true,force:true});throw e;}
}

async function main(){
  if(process.argv.length!==2)fail('V1_G2_SCHEMA_ARGUMENTS_FORBIDDEN');
  assertG2SchemaOptIn();
  const url=process.env.FAWRI_V1_PRODUCTION_PREWRITE_DUMP_URL;
  assertG2SchemaOwnerUrl(url);
  // Materialize before connecting. All 54 stages and journals must match the
  // existing independent Git SHA/source digest pins from accepted local PG18.
  const folder=materializePinnedFirstCommercialSchema();
  const pool=new pg.Pool({connectionString:url,connectionTimeoutMillis:8000,
    max:2,application_name:'fawri-g2-schema-only'});
  let sourceConnected=false;
  try {
    const client=await pool.connect();
    sourceConnected=true;
    try{
      const before=(await client.query(preflightSQL)).rows[0];
      const roles=(await client.query(roleSQL,[roleNames])).rows;
      assertG2SchemaPreimage(before,roles);
    }finally{client.release();}
    console.log('V1_G2_SCHEMA_PREIMAGE_EMPTY_AND_FOUR_NOLOGIN_PASS');

    // No hosted data import. This is the same migrate(drizzle(pool)) pattern
    // already accepted on 54-stage disposable PG18, now explicitly gated.
    await migrate(drizzle(pool),{migrationsFolder:folder});

    const clientAfter=await pool.connect();
    try{
      const after=(await clientAfter.query(postflightSQL)).rows[0];
      const roles=(await clientAfter.query(roleSQL,[roleNames])).rows;
      assertG2SchemaPostimage(after,roles);
    }finally{clientAfter.release();}
    console.log('V1_G2_PRODUCTION_PINNED_54_STAGE_SCHEMA_PASS');
    console.log('V1_G2_PRODUCTION_FOUR_ROLES_STILL_NOLOGIN');
    console.log('V1_G2_PRODUCTION_ZERO_MERCHANT_ACCOUNT_ORDER_ROWS');
    console.log('V1_G2_NO_APPLICATION_LOGIN_NO_APPLICATION_GRANTS_NO_POS_ACTIVATION');
  }finally{
    if(sourceConnected)await pool.end().catch(()=>{});
    fs.rmSync(folder,{recursive:true,force:true});
  }
}
try{await main();}
catch(err){
  const code=typeof err?.code==='string' && err.code.startsWith('V1_G2_')
    ? err.code : 'V1_G2_SCHEMA_MIGRATION_FAILURE_STOP_MANUAL_RECOVERY';
  // The connection string, SQL statements, provider logs and raw errors
  // could include secrets. Never leak them into CI output.
  console.error(code);
  process.exitCode=1;
}
