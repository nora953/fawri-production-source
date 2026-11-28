/**
 * FAWRI first-commercial G2-A — one-time, bounded NOLOGIN reservation ONLY.
 * Does not perform migration, grant tables, create login or activate POS.
 * The only targeted remote write is the exact prior reviewed reservation SQL.
 * Requires owner-only Actions push, exact preimage, private owner URL and opt-in.
 */
import {createHash} from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import pg from 'pg';
import {
  G2_RESERVATION_TARGET, assertG2OptIn, parseG2OwnerUrl,
  assertG2Preimage, assertG2Postimage,
} from '../../../scripts/lib/v1-g2-production-role-reservation-safety.mjs';
import {buildFt01FirstCommercialInvokerReviewPlan}
  from '../../../scripts/lib/ft01-first-commercial-invoker-source-plan.mjs';

const repoRoot=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../..');
const sourcePath='docs/final-audit/evidence/sql/P0-FT01-NEW-NEON-FOUR-NOLOGIN-ROLE-RESERVATION-HELD-20261109.sql';
const fail=code=>{const e=new Error(code);e.code=code;throw e;};
const sha256=s=>createHash('sha256').update(s,'utf8').digest('hex');
const preflightSQL=`SELECT current_database()::text AS db,
  session_user::text AS login, current_user::text AS active,
  current_setting('server_version_num')::int / 10000 AS major,
  (SELECT count(*)::int FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname NOT IN ('pg_catalog','information_schema')
      AND n.nspname NOT LIKE 'pg_toast%' AND n.nspname NOT LIKE 'pg_temp_%'
      AND c.relkind IN ('r','p','v','m','f','S')) AS nonsystem_relations,
  (SELECT count(*)::int FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='drizzle' AND c.relname='__drizzle_migrations') AS drizzle_ledger,
  (SELECT count(*)::int FROM pg_roles WHERE rolname = ANY(ARRAY[
    'fawri_restricted_runtime','fawri_auth_issuer',
    'fawri_operator_issuer','fawri_cashier_retirement_writer'])) AS reserved_roles,
  (SELECT rolcreaterole FROM pg_roles WHERE rolname=session_user) AS owner_can_create_roles,
  pg_has_role(session_user,'pg_read_all_stats','USAGE') AS owner_can_see_stats`;
const postflightSQL=`SELECT r.rolname::text AS name,
  r.rolcanlogin AS can_login, r.rolinherit AS inherit,
  r.rolsuper AS superuser, r.rolbypassrls AS bypass_rls,
  r.rolcreaterole AS can_create_roles, r.rolcreatedb AS can_create_db,
  r.rolreplication AS replication,
  (SELECT count(*)::int FROM pg_auth_members m WHERE m.member=r.oid)
     AS outgoing_membership,
  (SELECT count(*)::int FROM pg_auth_members m WHERE m.roleid=r.oid)
     AS inbound_count,
  (SELECT count(*)::int FROM pg_auth_members m
    JOIN pg_roles creator ON creator.oid=m.member
    WHERE m.roleid=r.oid AND creator.rolname='fawri_owner'
    AND m.admin_option AND NOT m.inherit_option AND NOT m.set_option)
     AS inbound_creator_only,
  has_schema_privilege(r.oid,'public','CREATE') AS public_create
  FROM pg_roles r WHERE r.rolname = ANY(ARRAY[
    'fawri_restricted_runtime','fawri_auth_issuer',
    'fawri_operator_issuer','fawri_cashier_retirement_writer'])
  ORDER BY r.rolname`;
async function main(){
  if(process.argv.length!==2) fail('V1_G2_EXTRA_ARGUMENTS_FORBIDDEN');
  assertG2OptIn();
  const url=process.env.FAWRI_V1_PRODUCTION_PREWRITE_DUMP_URL;
  parseG2OwnerUrl(url);
  // The reviewed source plan has independently pinned SQL and journal.
  const review=buildFt01FirstCommercialInvokerReviewPlan();
  if(review.approved_to_execute!==false || review.target.project_id!==G2_RESERVATION_TARGET.project ||
     review.target.branch_id!==G2_RESERVATION_TARGET.branch) {
    fail('V1_G2_REVIEWED_SOURCE_TARGET_DRIFT');
  }
  const sql=fs.readFileSync(path.join(repoRoot,sourcePath),'utf8');
  if(sha256(sql)!==review.four_role_reservation_sql_sha256) {
    fail('V1_G2_RESERVATION_SQL_SHA_DRIFT');
  }
  // The prior G1 independent encrypted prewrite/restore receipt is required;
  // never derive this approval from a local test or Neon snapshot alone.
  if(process.env.FAWRI_V1_G2_G1_OFFSITE_RECEIPT !==
      'G1-20261115-GDRIVE-READBACK-43712483648') {
    fail('V1_G2_G1_OFFSITE_ACCEPTANCE_MISSING');
  }
  const client=new pg.Client({connectionString:url,connectionTimeoutMillis:8000,
    query_timeout:30000,statement_timeout:30000});
  try {
    await client.connect();
    assertG2Preimage((await client.query(preflightSQL)).rows[0]);
    // This source has transaction / lock timeouts and enforces its own
    // independent catalog checks BEFORE creating exactly four NOLOGIN roles.
    await client.query(sql);
    assertG2Postimage((await client.query(postflightSQL)).rows);
    const after=(await client.query(preflightSQL)).rows[0];
    if(after.db!==G2_RESERVATION_TARGET.database ||
       after.login!==G2_RESERVATION_TARGET.owner ||
       Number(after.nonsystem_relations)!==0 ||
       Number(after.drizzle_ledger)!==0 ||
       Number(after.reserved_roles)!==4) {
      fail('V1_G2_ROLE_RESERVATION_UNEXPECTED_SCHEMA_WRITE');
    }
    console.log('V1_G2_PRODUCTION_FOUR_NOLOGIN_ROLES_RESERVED_PASS');
    console.log('V1_G2_PRODUCTION_NO_LOGIN_NO_GRANT_NO_MIGRATION');
    console.log('V1_G2_NEXT_THREE_INDEPENDENT_LOGIN_CREDENTIALS_STILL_REQUIRED');
  } finally {
    await client.end().catch(()=>{});
  }
}
try {await main();}
catch(err){
  // Never expose provider errors, SQL, role passwords or connection string.
  const safe=typeof err?.code==='string' && err.code.startsWith('V1_G2_')
    ? err.code : 'V1_G2_REMOTE_FAILURE_DETAILS_REDACTED';
  console.error(safe);process.exitCode=1;
}
