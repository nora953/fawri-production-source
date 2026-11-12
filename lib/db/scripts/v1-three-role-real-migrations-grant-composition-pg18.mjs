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
async function proveActualRole({rootUrl,role,password,privateFunctionOids}){
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
      -- Checking a private function by text signature may throw 42501 for
      -- a correctly denied schema USAGE role. Its catalog OID is fetched
      -- only by the owner before these role sessions are created.
      has_function_privilege(session_user,$1::oid,'EXECUTE') AS issue_scope,
      has_function_privilege(session_user,$2::oid,'EXECUTE')
         AS tenant_predicate,
      has_function_privilege(session_user,
        'public.fawri_issue_admin_directory_audit(text,text,text)',
        'EXECUTE') AS operator_directory,
      has_table_privilege(session_user,'public.cashier_device_streams',
         'SELECT,INSERT,UPDATE,DELETE') AS cashier_data,
      has_table_privilege(session_user,'public.verified_provider_payment_receipts',
         'SELECT,INSERT,UPDATE,DELETE') AS verified_receipt_table,
      has_table_privilege(session_user,'public.products','SELECT') AS products_select,
      has_table_privilege(session_user,'public.merchants','SELECT') AS global_merchant_select,
      has_column_privilege(session_user,'public.merchant_channels',
        'page_id','SELECT') AS meta_page_read,
      has_column_privilege(session_user,'public.merchant_channels',
        'credential_ciphertext','SELECT') AS meta_ciphertext_read,
      has_table_privilege(session_user,'public.merchant_channels',
        'INSERT') AS meta_channel_insert,
      has_function_privilege(session_user,
        'public.fawri_resolve_meta_page_merchants(text[])',
        'EXECUTE') AS meta_ingress_resolution,
      has_table_privilege(session_user,'public.background_jobs',
        'SELECT') AS durable_jobs_read,
      has_table_privilege(session_user,'public.background_job_payloads',
        'INSERT') AS durable_payload_insert,
      has_table_privilege(session_user,'public.job_attempts',
        'SELECT') AS durable_attempt_read,
      has_table_privilege(session_user,'public.job_dead_letters',
        'SELECT') AS durable_dead_letter_read
      FROM pg_roles r WHERE r.rolname=session_user`,
      [privateFunctionOids.scope,privateFunctionOids.tenant])).rows[0];
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
      global_merchant_select:role==='fawri_auth_issuer',
      meta_page_read:role!=='fawri_operator_issuer',
      meta_ciphertext_read:role==='fawri_auth_issuer',
      meta_channel_insert:role==='fawri_auth_issuer',
      meta_ingress_resolution:role==='fawri_restricted_runtime',
      durable_jobs_read:role==='fawri_restricted_runtime',
      durable_payload_insert:role==='fawri_restricted_runtime',
      durable_attempt_read:role==='fawri_restricted_runtime',
      durable_dead_letter_read:role==='fawri_restricted_runtime',
    },'V1_COMBINED_REAL_ROLE_GRANTS_MISMATCH_'+role);
    // Online merchant reads are scoped by the real migrated policies, even
    // though the tenant has SELECT on the catalog relation.
    if (role==='fawri_restricted_runtime') {
      const result=await client.query('SELECT count(*)::int AS n FROM public.products');
      assert.equal(result.rows[0]?.n,0,
        'V1_COMBINED_NO_MERCHANT_SCOPE_MUST_SHOW_ZERO_PRODUCTS');
      const columns=await client.query(
        'SELECT id,page_id,platform FROM public.merchant_channels LIMIT 1');
      assert.deepEqual(columns.rows,[],
        'V1_META_TENANT_NO_SCOPE_CHANNELS_MUST_BE_HIDDEN');
      const routing=await client.query(
        "SELECT page_id,merchant_id FROM public.fawri_resolve_meta_page_merchants(ARRAY['unconnected-page']::text[])");
      assert.deepEqual(routing.rows,[],'V1_META_BOUNDED_UNMATCHED_PAGE');
      await assert.rejects(
        ()=>client.query(
          'SELECT credential_ciphertext FROM public.merchant_channels LIMIT 1'),
        e=>e?.code==='42501','V1_META_CREDENTIAL_COLUMN_MUST_BE_DENIED');
      await assert.rejects(
        ()=>client.query('SELECT id FROM public.merchants LIMIT 1'),
        e=>e?.code==='42501','V1_WORKER_TENANT_MERCHANT_ENUM_DENIED');
      // No authenticated scoped transaction -> both merchants' histories
      // are filtered by real tenant RLS despite table SELECT grants.
      const hiddenAttempts=await client.query(
        'SELECT id FROM public.job_attempts ORDER BY id');
      const hiddenLetters=await client.query(
        'SELECT id FROM public.job_dead_letters ORDER BY id');
      assert.deepEqual(hiddenAttempts.rows,[],
        'V1_WORKER_UNSCOPED_JOB_ATTEMPTS_VISIBLE');
      assert.deepEqual(hiddenLetters.rows,[],
        'V1_WORKER_UNSCOPED_DEAD_LETTERS_VISIBLE');
    }
    if (role==='fawri_auth_issuer') {
      const all=await client.query(
        'SELECT id FROM public.merchants ORDER BY id');
      assert.deepEqual(all.rows,[
        {id:'v1-fixture-tenant-a'},{id:'v1-fixture-tenant-b'}
      ],'V1_META_AUTH_MERCHANT_ENUM_OWNS_GLOBAL_SCOPE');
      const channels=await client.query(
        'SELECT id,credential_ciphertext FROM public.merchant_channels LIMIT 1');
      assert.deepEqual(channels.rows,[],
        'V1_META_AUTH_CREDENTIAL_QUERY_AVAILABLE_ON_EMPTY_SOURCE');
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
      // The actual Neon-style NON-SUPERUSER CREATEROLE owner cannot issue
      // NOSUPERUSER / NOBYPASSRLS ALTER attributes even if already false.
      // Verify the exact reserved role's immutable security flags first,
      // then change only LOGIN, CONNECTION LIMIT and ephemeral CI password.
      const prior=(await ownerPool.query(`SELECT
        rolcanlogin,rolinherit,rolsuper,rolbypassrls,rolcreaterole,
        rolcreatedb,rolreplication,
        EXISTS(SELECT 1 FROM pg_auth_members m WHERE m.member=r.oid)
          AS has_inherited_or_set_role
        FROM pg_roles r WHERE r.rolname=$1`,[role])).rows[0];
      assert.deepEqual(prior,{
        rolcanlogin:false,rolinherit:false,rolsuper:false,rolbypassrls:false,
        rolcreaterole:false,rolcreatedb:false,rolreplication:false,
        has_inherited_or_set_role:false,
      },'V1_COMBINED_ROLE_PREPROMOTION_PRIVILEGES_CHANGED_'+role);
      await ownerPool.query(`ALTER ROLE ${role}
        LOGIN CONNECTION LIMIT 2 PASSWORD '${passwords[role]}'`);
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
    // NEW approved POS-off scope compatibility, not part of original 0052.
    // The merchant-retention hook must remain callable without cashier ACL,
    // but must refuse any preserved cashier stream and have safe revert.
    const v1PosSource=read(
      'lib/db/first-commercial/held/v1_pos_off_merchant_deletion_guard.sql');
    assert.equal(sha1blob(v1PosSource),
      'bd08142e26547aeaa78850c8aa9644ec7495f217',
      'V1_COMBINED_POS_OFF_SOURCE_DRIFT');
    const legacyFunction=(await ownerPool.query(`SELECT pg_get_functiondef(
      'public.fawri_sequence_merchant_deleted()'::regprocedure
      ) AS original`)).rows[0].original;
    await ownerPool.query(v1PosSource);
    const v1Trigger=(await ownerPool.query(`SELECT
       tgfoid=to_regprocedure(
         'public.fawri_v1_pos_off_merchant_deleted()') AS v1_hook
       FROM pg_trigger
       WHERE tgname='cashier_device_streams_merchant_deleted'
         AND tgrelid='public.merchants'::regclass`)).rows[0];
    assert.deepEqual(v1Trigger,{v1_hook:true},
      'V1_COMBINED_POS_OFF_HOOK_NOT_ADOPTED');
    const metaChannelSource=read(
      'lib/db/first-commercial/held/v1_meta_channel_onboarding_grants.sql');
    assert.equal(sha1blob(metaChannelSource),
      '6d87f7e87ff2e7210b4929a4ba9572bc5a1e5b41',
      'V1_META_FIRST_COMMERCIAL_GRANT_SOURCE_SHA_DRIFT');
    await ownerPool.query(metaChannelSource);
    // Preserve two local pre-patch job histories and verify deterministic
    // merchant_id backfill + full tenant RLS on the actual source schema.
    await ownerPool.query(`INSERT INTO public.accounts
       (id,kind,phone,password_hash)
       VALUES
        ('v1-fixture-tenant-a','merchant','+9647900000001','synthetic-not-login'),
        ('v1-fixture-tenant-b','merchant','+9647900000002','synthetic-not-login')`);
    await ownerPool.query(`INSERT INTO public.merchants
       (id,account_id,owner_name,store_name,activity_type)
       VALUES
        ('v1-fixture-tenant-a','v1-fixture-tenant-a','A','A Shop','test'),
        ('v1-fixture-tenant-b','v1-fixture-tenant-b','B','B Shop','test')`);
    await ownerPool.query(`INSERT INTO public.background_jobs
       (id,type,dedupe_key,merchant_id)
       VALUES
        ('v1-fixture-job-a','v1.synthetic','v1-dedupe-a','v1-fixture-tenant-a'),
        ('v1-fixture-job-b','v1.synthetic','v1-dedupe-b','v1-fixture-tenant-b')`);
    await ownerPool.query(`INSERT INTO public.job_attempts
       (id,job_id,attempt_number,worker_id,lease_generation,status)
       VALUES
        ('v1-fixture-attempt-a','v1-fixture-job-a',1,'v1-worker',1,'processing'),
        ('v1-fixture-attempt-b','v1-fixture-job-b',1,'v1-worker',1,'processing')`);
    await ownerPool.query(`INSERT INTO public.job_dead_letters
       (id,job_id,occurrence,reason_code,attempts)
       VALUES
        ('v1-fixture-letter-a','v1-fixture-job-a',1,'V1_TEST',1),
        ('v1-fixture-letter-b','v1-fixture-job-b',1,'V1_TEST',1)`);
    const workerRlsSource=read(
       'lib/db/first-commercial/held/v1_meta_worker_tenant_job_rls.sql');
    assert.equal(sha1blob(workerRlsSource),
      'a56842ad262c3a83ed41dd24109d241eb4fb6861',
      'V1_META_WORKER_RLS_SOURCE_DRIFT');
    await ownerPool.query(workerRlsSource);
    const history=(await ownerPool.query(`SELECT
       'attempt' AS kind,a.id,a.merchant_id FROM public.job_attempts a
       UNION ALL SELECT 'dead_letter',d.id,d.merchant_id
       FROM public.job_dead_letters d ORDER BY kind,id`)).rows;
    assert.deepEqual(history,[
      {kind:'attempt',id:'v1-fixture-attempt-a',merchant_id:'v1-fixture-tenant-a'},
      {kind:'attempt',id:'v1-fixture-attempt-b',merchant_id:'v1-fixture-tenant-b'},
      {kind:'dead_letter',id:'v1-fixture-letter-a',merchant_id:'v1-fixture-tenant-a'},
      {kind:'dead_letter',id:'v1-fixture-letter-b',merchant_id:'v1-fixture-tenant-b'},
    ],'V1_META_WORKER_HISTORY_BACKFILL_WRONG_OR_LOST');
    await assert.rejects(
      ()=>ownerPool.query(`INSERT INTO public.job_attempts
         (id,job_id,merchant_id,attempt_number,worker_id,lease_generation,status)
         VALUES ('v1-invalid','v1-fixture-job-a','v1-fixture-tenant-b',
           2,'v1-worker',2,'processing')`),
      e=>e?.code==='23503',
      'V1_META_WORKER_CROSS_MERCHANT_FK_MUST_DENY');
    const privateFunctionOids=(await ownerPool.query(`SELECT
      'fawri_security.issue_scope(name,integer,bigint,text)'::regprocedure::oid
        AS scope,
      'fawri_security.allows_merchant(text)'::regprocedure::oid AS tenant`
    )).rows[0];
    assert.ok(privateFunctionOids?.scope&&privateFunctionOids?.tenant,
      'V1_COMBINED_PINNED_PRIVATE_FUNCTIONS_NOT_FOUND');
    for(const role of roles) {
      await proveActualRole({
        rootUrl:root,role,password:passwords[role],privateFunctionOids
      });
    }
    // Real 54-stage migration RLS presence, not a synthetic policy fixture.
    const required=['products','orders','order_items',
      'location_inventory_levels','background_jobs',
      'background_job_payloads','job_attempts','job_dead_letters'];
    const flags=(await ownerPool.query(`SELECT c.relname,c.relrowsecurity,
      EXISTS(SELECT 1 FROM pg_policy p WHERE p.polrelid=c.oid) AS policy_exists
      FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='public' AND c.relname=ANY($1::text[])
        AND c.relkind IN ('r','p') ORDER BY c.relname`,[required])).rows;
    assert.equal(flags.length,required.length);
    assert.ok(flags.every(f=>f.relrowsecurity&&f.policy_exists),
      'V1_COMBINED_REAL_RLS_POLICY_MISSING');
    const v1PosRevert=read(
      'lib/db/first-commercial/held/v1_pos_off_merchant_deletion_guard_revert.sql');
    assert.equal(sha1blob(v1PosRevert),
      'f6a98b30cb053c13b5321283b8d63d8929f38f0e',
      'V1_COMBINED_POS_OFF_REVERT_SOURCE_DRIFT');
    await ownerPool.query(v1PosRevert);
    const restored=(await ownerPool.query(`SELECT
       tgfoid=to_regprocedure(
         'public.fawri_sequence_merchant_deleted()') AS legacy_hook
       FROM pg_trigger
       WHERE tgname='cashier_device_streams_merchant_deleted'
         AND tgrelid='public.merchants'::regclass`)).rows[0];
    assert.deepEqual(restored,{legacy_hook:true},
      'V1_COMBINED_POS_OFF_REVERT_NOT_RESTORED');
    const legacyNow=(await ownerPool.query(`SELECT pg_get_functiondef(
      'public.fawri_sequence_merchant_deleted()'::regprocedure
      ) AS original`)).rows[0].original;
    assert.equal(legacyNow,legacyFunction,
      'V1_COMBINED_POS_OFF_REVERT_ALTERED_HISTORY');
    console.log('V1_META_WORKER_TENANT_JOB_HISTORY_RLS_FK_PASS');
    console.log('V1_META_AUTH_CHANNEL_AND_TENANT_ROUTING_ACL_PASS');
    console.log('V1_COMBINED_POS_OFF_PATCH_AND_REVERT_REAL_54_STAGE_PASS');
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
