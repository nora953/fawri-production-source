/**
 * R-OWN-5/FT-01 actual 0000..0053 held lineage with non-superuser owner.
 * Disposable GitHub Actions PostgreSQL18 ONLY. NO hosted SQL or credentials.
 * Never rewrites canonical migration source or accepted 0052 role scheme.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash,randomBytes} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import pg from 'pg';
import {drizzle} from 'drizzle-orm/node-postgres';
import {migrate} from 'drizzle-orm/node-postgres/migrator';
import {materializeFt01LocalOnlyBundle} from '../../../scripts/lib/ft01-first-commercial-disposable-bundle.mjs';
import {buildP0Held0053SourceAdmissionPlan} from '../../../scripts/lib/p0-held-0053-source-admission-plan.mjs';
import {stabilizeMigrationDependencyOrder} from './lib/migration-sql-order.mjs';

const {Client,Pool}=pg;
const dbName='fawri_receipt_case_0053_ci';
const ownerRole='fawri_receipt_case_0053_owner_ci';
const roles=['fawri_restricted_runtime','fawri_auth_issuer','fawri_operator_issuer','fawri_cashier_retirement_writer'];
const fileRoot=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../..');
const sha=s=>createHash('sha256').update(s,'utf8').digest('hex');
function requireLocal() {
  assert.equal(process.argv.length,2,'P0_HELD_0053_DISPOSABLE_NO_ARGS');
  assert.equal(process.env.GITHUB_ACTIONS,'true','P0_HELD_0053_CI_ONLY');
  assert.equal(process.env.GITHUB_REPOSITORY,'nora953/fawri-production-source','P0_HELD_0053_REPO_ONLY');
  assert.equal(process.env.FAWRI_ALLOW_FT01_INVOKER_CANDIDATE,'1','P0_HELD_0053_FT01_CI_FLAG');
  assert.equal(process.env.FAWRI_ALLOW_HELD_0053_DISPOSABLE,'1','P0_HELD_0053_EXPLICIT_CI_FLAG');
  const uri=new URL(process.env.DATABASE_URL||'');
  assert.equal(uri.protocol,'postgresql:');
  assert.equal(uri.hostname,'127.0.0.1');
  assert.equal(uri.port,'5432');
  assert.equal(uri.pathname,'/fawri_ci');
  assert.equal(decodeURIComponent(uri.username),'fawri_ci');
  assert.equal(uri.search,'');assert.equal(uri.hash,'');
  return uri;
}
function loginUrl(base,login,password,database=dbName) {
  const u=new URL(base.toString());u.username=login;u.password=password;u.pathname='/'+database;
  return u.toString();
}
async function main(){
  const rootUrl=requireLocal();
  const plan=buildP0Held0053SourceAdmissionPlan();
  assert.equal(plan.approved_to_execute,false);
  assert.equal(plan.proposed_held_source_migrations,54);
  const admin=new Client({connectionString:rootUrl.toString(),connectionTimeoutMillis:5000});
  let folder,ownerPool,operator,createdDb=false,createdOwner=false;
  const password=randomBytes(32).toString('hex'),operatorPassword=randomBytes(32).toString('hex'),authPassword=randomBytes(32).toString('hex');
  await admin.connect();
  try{
    const pre=(await admin.query("SELECT current_database() AS db, (current_setting('server_version_num')::int/10000) AS major, (SELECT count(*)::int FROM pg_database WHERE datname=$1) AS db_count, (SELECT count(*)::int FROM pg_roles WHERE rolname=$2 OR rolname=ANY($3::text[])) AS role_count",[dbName,ownerRole,roles])).rows[0];
    assert.deepEqual(pre,{db:'fawri_ci',major:18,db_count:0,role_count:0},'P0_HELD_0053_CLEAN_CLUSTER_REQUIRED');
    await admin.query('CREATE ROLE '+ownerRole+" LOGIN PASSWORD '"+password+"' NOSUPERUSER BYPASSRLS CREATEROLE CREATEDB REPLICATION");
    createdOwner=true;
    await admin.query('CREATE DATABASE '+dbName+' OWNER '+ownerRole);
    createdDb=true;
    ownerPool=new Pool({connectionString:loginUrl(rootUrl,ownerRole,password),max:2,connectionTimeoutMillis:5000});
    const flags=(await ownerPool.query('SELECT rolsuper,rolbypassrls,rolcreaterole FROM pg_roles WHERE rolname=$1',[ownerRole])).rows[0];
    assert.deepEqual(flags,{rolsuper:false,rolbypassrls:true,rolcreaterole:true},'P0_HELD_0053_NON_SUPERUSER_OWNER');
    for(const role of roles){
      await ownerPool.query('CREATE ROLE '+role+' NOLOGIN NOINHERIT NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION');
    }
    const materialized=materializeFt01LocalOnlyBundle();
    folder=materialized.folder;
    assert.equal(materialized.manifest.entries.length,53);
    assert.equal(materialized.manifest.entries[52].selected_tag,'0052_cashier_stream_receipt_storage_invoker');
    const journal=fs.readFileSync(path.join(fileRoot,plan.proposed_journal_path),'utf8');
    const sql=fs.readFileSync(path.join(fileRoot,plan.proposed_sql_path),'utf8');
    assert.equal(sha(journal),plan.candidate_0053_held_journal_sha256);
    assert.equal(sha(sql),plan.candidate_0053_sql_sha256);
    // This temp folder is NEVER written into the repository or original Drizzle.
    fs.writeFileSync(path.join(folder,'meta','_journal.json'),journal,'utf8');
    const staged=stabilizeMigrationDependencyOrder(sql);
    fs.writeFileSync(path.join(folder,'0053_verified_receipt_manual_cases_candidate.sql'),staged,{flag:'wx',mode:0o600});
    assert.equal(fs.readdirSync(folder).filter(name=>name.endsWith('.sql')).length,54);
    const db=drizzle(ownerPool);
    await migrate(db,{migrationsFolder:folder});
    await migrate(db,{migrationsFolder:folder});
    const ledger=(await ownerPool.query('SELECT count(*)::int AS count FROM drizzle.__drizzle_migrations')).rows[0].count;
    assert.equal(ledger,54,'P0_HELD_0053_LEDGER_54_REQUIRED');
    const last=(await ownerPool.query('SELECT hash FROM drizzle.__drizzle_migrations ORDER BY id DESC LIMIT 1')).rows[0].hash;
    assert.equal(last,sha(staged),'P0_HELD_0053_LEDGER_LAST_DIGEST_MISMATCH');
    const beforeTables=(await ownerPool.query("SELECT relname,relrowsecurity FROM pg_class WHERE relname IN ('verified_receipt_manual_cases','verified_receipt_manual_case_events') ORDER BY relname")).rows;
    assert.deepEqual(beforeTables.map(x=>x.relname),['verified_receipt_manual_case_events','verified_receipt_manual_cases']);
    assert.ok(beforeTables.every(x=>x.relrowsecurity===true));
    const grants=fs.readFileSync(path.join(fileRoot,plan.proposed_operator_grants_path),'utf8');
    assert.equal(sha(grants),plan.candidate_0053_grants_sha256);
    await ownerPool.query("ALTER ROLE fawri_operator_issuer LOGIN PASSWORD '"+operatorPassword+"'");
    await ownerPool.query(grants);
    // Strictly disposable identity fixture: prove genuine AUTH LOGIN on this
    // 54-stage database. Do not use the BYPASSRLS schema owner for sessions.
    // Privileges are bounded to the exact tables and operations used by
    // admin session issue/validation, not general merchant/billing access.
    await ownerPool.query("ALTER ROLE fawri_auth_issuer LOGIN PASSWORD '"+authPassword+"'");
    await ownerPool.query(`GRANT USAGE ON SCHEMA public TO fawri_auth_issuer;
      GRANT EXECUTE ON FUNCTION public.fawri_authentication_runtime()
        TO fawri_auth_issuer;
      GRANT SELECT ON public.accounts,public.admin_profiles,
        public.admin_permissions,public.trusted_devices,public.account_sessions
        TO fawri_auth_issuer;
      GRANT INSERT,UPDATE ON public.trusted_devices,public.account_sessions
        TO fawri_auth_issuer;`);
    const authProbe=new Client({connectionString:loginUrl(rootUrl,'fawri_auth_issuer',authPassword),connectionTimeoutMillis:5000});
    try {
      await authProbe.connect();
      const attested=(await authProbe.query(`SELECT session_user AS login,current_user AS active,
        (r.rolsuper OR r.rolbypassrls OR r.rolcreaterole OR r.rolcreatedb) AS privileged,
        has_function_privilege(session_user,
          'public.fawri_authentication_runtime()','EXECUTE') AS can_auth,
        has_table_privilege(session_user,
          'public.verified_receipt_manual_cases','SELECT,INSERT,UPDATE,DELETE') AS can_case,
        has_function_privilege(session_user,
          'public.fawri_open_unmatched_verified_receipt_case(text,text,text,text,text)','EXECUTE') AS can_case_open
        FROM pg_roles r WHERE r.rolname=session_user`)).rows[0];
      assert.deepEqual(attested,{login:'fawri_auth_issuer',active:'fawri_auth_issuer',
        privileged:false,can_auth:true,can_case:false,can_case_open:false},
        'P0_HELD_0053_SEPARATE_LEAST_PRIVILEGED_AUTH_LOGIN');
    } finally {await authProbe.end();}
    operator=new Client({connectionString:loginUrl(rootUrl,'fawri_operator_issuer',operatorPassword),connectionTimeoutMillis:5000});
    await operator.connect();
    const who=(await operator.query('SELECT session_user AS login,current_user AS active')).rows[0];
    assert.deepEqual(who,{login:'fawri_operator_issuer',active:'fawri_operator_issuer'});
    for(const tbl of ['public.verified_provider_payment_receipts','public.verified_receipt_manual_cases','public.verified_receipt_manual_case_events','public.saas_billing_orders','public.cashier_billing_orders']){
      assert.equal((await operator.query("SELECT has_table_privilege(session_user,$1,'SELECT,INSERT,UPDATE,DELETE') AS allowed",[tbl])).rows[0].allowed,false,'P0_HELD_0053_RAW_TABLE_DENIED_'+tbl);
    }
    const reviewFn='public.fawri_acknowledge_receipt_dispute_second_review(text,text,text,text,text,text)';
    assert.equal((await operator.query("SELECT has_function_privilege(session_user,$1,'EXECUTE') AS allowed",[reviewFn])).rows[0].allowed,true);
    await assert.rejects(operator.query('SELECT * FROM public.verified_receipt_manual_cases'),e=>e?.code==='42501');
    await assert.rejects(operator.query('SELECT * FROM public.fawri_open_unmatched_verified_receipt_case($1,$2,$3,$4,$5)',[
      'fake-actor','fake-session','a'.repeat(64),'receipt-case-'+'b'.repeat(64),'event'
    ]),e=>e?.code==='42501');
    // Same disposable database, exact 54-stage Drizzle ledger and HELD 0052
    // variant: run the real mounted receipt operator HTTP flow using a
    // separate Node/tsx process so pooled runtime connections die on exit.
    // The child refuses any host other than the one created above.
    const ownerCompositeUrl=loginUrl(rootUrl,ownerRole,password);
    const operatorCompositeUrl=loginUrl(rootUrl,'fawri_operator_issuer',operatorPassword);
    const authCompositeUrl=loginUrl(rootUrl,'fawri_auth_issuer',authPassword);
    execFileSync('pnpm',['exec','tsx','scripts/tests/p0-held-0053-composite-http-pg18.mjs'],{
      cwd:fileRoot,
      timeout:150000,
      stdio:'inherit',
      env:{
        ...process.env,
        DATABASE_URL:ownerCompositeUrl,
        // Local-only independent authentication and operator LOGINs; neither
        // is the privileged migration owner. Hosted profile remains untested.
        FAWRI_AUTH_DATABASE_URL:authCompositeUrl,
        FAWRI_OPERATOR_DATABASE_URL:operatorCompositeUrl,
        FAWRI_HELD_0053_COMPOSITE_HTTP_CI:'1',
        FAWRI_OPERATIONAL_POSTGRES_AUTHORITY:'required',
        FAWRI_AUTH_POSTGRES_SESSION_AUTHORITY:'required',
        FAWRI_AUTH_SECURITY_SECRET:'isolated-composite-ci-secret-not-for-production-32',
        FAWRI_PASSWORD_SALT:'isolated-composite-ci-salt-not-for-production-32',
        FAWRI_ALLOWED_ORIGINS:'https://operator.example.invalid'
      }
    });
    console.log('P0_HELD_0053_TRUE_FIRST_COMMERCIAL_0052_0053_COMPOSITE_PG18_PASS');
    console.log('P0_HELD_0053_DISPOSABLE_54_LEDGER_LAST_SHA_PASS '+last);
    console.log('P0_HELD_0053_DISPOSABLE_NOT_HOSTED_RELEASE_AUTHORIZATION');
  }finally{
    if(operator)await operator.end();
    if(ownerPool)await ownerPool.end();
    if(folder)fs.rmSync(folder,{recursive:true,force:true});
    if(createdDb)await admin.query('DROP DATABASE IF EXISTS '+dbName+' WITH (FORCE)');
    // The owner created the four local role identities; after deleting their
    // only database, drop each separately. Fail if an unexpected dependency
    // prevents cleanup, rather than leave a misleading clean-cluster result.
    for(const role of [...roles].reverse())if(createdOwner){
      await admin.query('DROP ROLE IF EXISTS '+role);
    }
    if(createdOwner)await admin.query('DROP ROLE IF EXISTS '+ownerRole);
    await admin.end();
  }
}
main().catch(error=>{console.error(error);process.exitCode=1});
