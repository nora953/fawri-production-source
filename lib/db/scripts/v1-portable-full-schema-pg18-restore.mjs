/**
 * P0-HOSTED-RECOVERY: independent 54-stage full SQL dump / restore rehearsal
 * Only disposable GitHub Actions PG18; no Neon / customer data or deployment.
 * This supplements (does not rerun) accepted three-role behavioural testing.
 */
import assert from 'node:assert/strict';
import {randomBytes,createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import pg from 'pg';
import {drizzle} from 'drizzle-orm/node-postgres';
import {migrate} from 'drizzle-orm/node-postgres/migrator';
import {materializeFt01LocalOnlyBundle} from '../../../scripts/lib/ft01-first-commercial-disposable-bundle.mjs';
import {buildP0Held0053SourceAdmissionPlan} from '../../../scripts/lib/p0-held-0053-source-admission-plan.mjs';
import {buildV1FirstMerchantGrantSourcePlan} from '../../../scripts/lib/v1-first-merchant-grant-package-source-plan.mjs';
import {stabilizeMigrationDependencyOrder} from './lib/migration-sql-order.mjs';

const {Client,Pool}=pg;
const base=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../..');
const read=p=>fs.readFileSync(path.join(base,p),'utf8');
const sha256=v=>createHash('sha256').update(v).digest('hex');
const blob=s=>createHash('sha1').update('blob '+Buffer.byteLength(s)+'\0'+s).digest('hex');
const SOURCE='fawri',TARGET='fawri_recovery_target',OWNER='fawri_owner';
const TARGET_PORT='5433';
const ROLES=['fawri_restricted_runtime','fawri_auth_issuer','fawri_operator_issuer'];
const ALL=[...ROLES,'fawri_cashier_retirement_writer','fawri_cashier_retirement_owner'];

function localOnly(){
  assert.equal(process.argv.length,2);
  assert.equal(process.env.GITHUB_ACTIONS,'true');
  assert.equal(process.env.GITHUB_REPOSITORY,'nora953/fawri-production-source');
  assert.equal(process.env.FAWRI_ALLOW_V1_PORTABLE_SCHEMA_RESTORE,'1');
  assert.equal(process.env.FAWRI_ALLOW_FT01_INVOKER_CANDIDATE,'1');
  const u=new URL(process.env.DATABASE_URL??'');
  assert.equal(u.protocol,'postgresql:');assert.equal(u.hostname,'127.0.0.1');
  assert.equal(u.port,'5432');assert.equal(u.pathname,'/fawri_ci');
  assert.equal(u.username,'fawri_ci');assert.equal(u.search,'');assert.equal(u.hash,'');
  return u;
}
function targetRootFor(u){const v=new URL(u.toString());v.port=TARGET_PORT;return v;}
function roleUrl(u,role,pass,db){
  const v=new URL(u.toString());v.username=role;v.password=pass;v.pathname='/'+db;
  return v.toString();
}
function dockerPg(temp,args){
  const x=spawnSync('docker',[
    'run','--rm','--network','host','--user','0:0',
    '-v',temp+':/fawri-out','-e','PGPASSWORD=fawri_ci',
    'postgres:18-alpine',...args
  ],{encoding:'utf8',timeout:120000,maxBuffer:16*1024*1024});
  if(x.error||x.status!==0)throw Error('V1_PORTABLE_PG_CLIENT_FAILED: '+
    String(x.stderr||x.error?.message||'unknown').slice(0,1200));
}
// pg_dump carries database objects and ACLs but NOT cluster-global roles or
// memberships. Restore the exact allowlisted synthetic V1 globals on an
// entirely fresh second cluster, with DIFFERENT ephemeral LOGIN secrets.
async function bootstrapRecoveryGlobals(sourceAdmin,targetAdmin){
  const ownerSecret=randomBytes(32).toString('hex');
  await targetAdmin.query("CREATE ROLE "+OWNER+
    " LOGIN NOSUPERUSER BYPASSRLS CREATEROLE CREATEDB REPLICATION PASSWORD '"+ownerSecret+"'");
  await targetAdmin.query('GRANT pg_read_all_stats TO '+OWNER);
  for(const role of ROLES){
    const credential=randomBytes(32).toString('hex');
    await targetAdmin.query("CREATE ROLE "+role+
      " LOGIN NOINHERIT NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION"+
      " CONNECTION LIMIT 2 PASSWORD '"+credential+"'");
  }
  await targetAdmin.query(
    'CREATE ROLE fawri_cashier_retirement_writer NOLOGIN NOINHERIT NOSUPERUSER'+
    ' NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION');
  for(const role of [...ROLES,'fawri_cashier_retirement_writer']){
    await targetAdmin.query('GRANT '+role+' TO '+OWNER+
      ' WITH ADMIN TRUE, INHERIT FALSE, SET FALSE');
  }
  const allowed=[OWNER,...ROLES,'fawri_cashier_retirement_writer'];
  async function roleCatalog(conn){
    const roles=(await conn.query(
      `SELECT rolname,rolcanlogin,rolinherit,rolsuper,rolbypassrls,
         rolcreatedb,rolcreaterole,rolreplication,rolconnlimit
         FROM pg_roles WHERE rolname=ANY($1::text[]) ORDER BY rolname`,
      [allowed])).rows;
    const edges=(await conn.query(
      `SELECT granted.rolname AS granted_role,member.rolname AS member_role,
         m.admin_option,m.inherit_option,m.set_option
         FROM pg_auth_members m JOIN pg_roles granted ON granted.oid=m.roleid
         JOIN pg_roles member ON member.oid=m.member
         WHERE member.rolname=ANY($1::text[])
           AND granted.rolname=ANY($1::text[])
         ORDER BY granted.rolname,member.rolname`,
      [allowed])).rows;
    const stats=(await conn.query(
      "SELECT pg_has_role('fawri_owner','pg_read_all_stats','USAGE') AS owner_stats")).rows[0].owner_stats;
    return {roles,edges,stats};
  }
  const source=await roleCatalog(sourceAdmin);
  const target=await roleCatalog(targetAdmin);
  assert.equal(source.roles.length,5,'V1_GLOBAL_SOURCE_ROLE_COUNT');
  assert.deepEqual(target,source,'V1_PORTABLE_GLOBAL_ROLES_MEMBERSHIP_DRIFT');
  assert.equal(target.edges.length,4,'V1_GLOBAL_ADMIN_ONLY_EDGES');
  assert.equal(target.stats,true);
  return {ownerSecret,roles:target.roles.length,edges:target.edges.length};
}
const catalogSQL=[
  "SELECT",
  "(SELECT count(*)::integer FROM drizzle.__drizzle_migrations) AS stages,",
  "(SELECT count(*)::integer FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace",
  " WHERE n.nspname='public' AND c.relkind IN ('r','p')) AS public_tables,",
  "(SELECT count(*)::integer FROM pg_policy p JOIN pg_class c ON c.oid=p.polrelid",
  " JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public') AS policies,",
  "(SELECT count(*)::integer FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace",
  " WHERE n.nspname='public' AND c.relrowsecurity AND c.relkind IN ('r','p')) AS rls_tables,",
  "(SELECT count(*)::integer FROM public.accounts WHERE id LIKE 'v1-restore-%') AS accounts,",
  "(SELECT count(*)::integer FROM public.merchants WHERE id LIKE 'v1-restore-%') AS merchants,",
  "(SELECT count(*)::integer FROM public.products WHERE id LIKE 'v1-restore-%') AS products,",
  "(SELECT count(*)::integer FROM public.orders WHERE id LIKE 'v1-restore-%') AS orders,",
  "(SELECT md5(string_agg(id||':'||merchant_id,'|' ORDER BY id)) FROM public.orders",
  " WHERE id LIKE 'v1-restore-%') AS order_digest,",
  "has_table_privilege('fawri_restricted_runtime','public.orders','SELECT') AS tenant_order_select,",
  "has_table_privilege('fawri_restricted_runtime','public.cashier_device_streams','INSERT') AS cashier_insert,",
  "has_table_privilege('fawri_auth_issuer','public.accounts','SELECT') AS auth_accounts,",
  "has_table_privilege('fawri_operator_issuer','public.orders','INSERT') AS operator_order_insert"
].join('\n');

async function main(){
  const root=localOnly();
  const grants=buildV1FirstMerchantGrantSourcePlan();
  const held=buildP0Held0053SourceAdmissionPlan();
  assert.equal(grants.approved_to_execute,false);
  assert.equal(grants.selected_grant_sources.length,3);
  assert.equal(held.approved_to_execute,false);
  assert.equal(held.proposed_held_source_migrations,54);
  const reservation=read('docs/final-audit/evidence/sql/P0-FT01-NEW-NEON-FOUR-NOLOGIN-ROLE-RESERVATION-HELD-20261109.sql');
  assert.equal(sha256(reservation),grants.reservation_sql_sha256);
  const admin=new Client({connectionString:root.toString(),ssl:false});
  const password=randomBytes(32).toString('hex');
  const rolePasswords=Object.fromEntries(ROLES.map(x=>[x,randomBytes(32).toString('hex')]));
  const targetRoot=targetRootFor(root);
  const targetAdmin=new Client({connectionString:targetRoot.toString(),ssl:false});
  let pool,restorePool,folder,tmp,ownerCreated=false,targetRolesCreated=false,recoveryGlobals;
  const createdDbs=[];
  await admin.connect();
  await targetAdmin.connect();
  try{
    const targetPre=(await targetAdmin.query([
      'SELECT current_database() AS db,current_setting(',
      "'server_version_num')::int/10000 AS major,",
      '(SELECT count(*)::integer FROM pg_database WHERE datname=ANY($1::text[])) AS dbs,',
      '(SELECT count(*)::integer FROM pg_roles WHERE rolname=$2 OR rolname=ANY($3::text[])) AS roles'
    ].join(' '),[[SOURCE,TARGET],OWNER,ALL])).rows[0];
    assert.deepEqual(targetPre,{db:'fawri_ci',major:18,dbs:0,roles:0},
      'V1_TARGET_INDEPENDENT_CLUSTER_NOT_FRESH');
    const pre=(await admin.query([
      'SELECT current_database() AS db,current_setting(',
      "'server_version_num')::int/10000 AS major,",
      '(SELECT count(*)::integer FROM pg_database WHERE datname=ANY($1::text[])) AS dbs,',
      '(SELECT count(*)::integer FROM pg_roles WHERE rolname=$2 OR rolname=ANY($3::text[])) AS roles'
    ].join(' '),[[SOURCE,TARGET],OWNER,ALL])).rows[0];
    assert.deepEqual(pre,{db:'fawri_ci',major:18,dbs:0,roles:0});
    await admin.query("CREATE ROLE "+OWNER+" LOGIN NOSUPERUSER BYPASSRLS CREATEROLE CREATEDB REPLICATION PASSWORD '"+password+"'");
    ownerCreated=true;
    await admin.query('GRANT pg_read_all_stats TO '+OWNER);
    await admin.query('CREATE DATABASE '+SOURCE+' OWNER '+OWNER);
    createdDbs.push(SOURCE);
    pool=new Pool({connectionString:roleUrl(root,OWNER,password,SOURCE),max:3,ssl:false});
    await pool.query(reservation);
    const bundle=materializeFt01LocalOnlyBundle();
    folder=bundle.folder;
    assert.equal(bundle.manifest.entries.length,53);
    const tail=read(held.proposed_sql_path);
    assert.equal(sha256(tail),held.candidate_0053_sql_sha256);
    const journal=read(held.proposed_journal_path);
    assert.equal(sha256(journal),held.candidate_0053_held_journal_sha256);
    fs.writeFileSync(path.join(folder,'meta','_journal.json'),journal);
    fs.writeFileSync(path.join(folder,'0053_verified_receipt_manual_cases_candidate.sql'),
      stabilizeMigrationDependencyOrder(tail),{flag:'wx'});
    await migrate(drizzle(pool),{migrationsFolder:folder});
    assert.equal((await pool.query('SELECT count(*)::integer AS n FROM drizzle.__drizzle_migrations')).rows[0].n,54);
    for(const role of ROLES){
      const prior=(await pool.query([
        'SELECT rolcanlogin,rolinherit,rolsuper,rolbypassrls,rolcreaterole,',
        'rolcreatedb,rolreplication FROM pg_roles WHERE rolname=$1'
      ].join(' '),[role])).rows[0];
      assert.deepEqual(prior,{rolcanlogin:false,rolinherit:false,rolsuper:false,
        rolbypassrls:false,rolcreaterole:false,rolcreatedb:false,rolreplication:false});
      await pool.query("ALTER ROLE "+role+" LOGIN CONNECTION LIMIT 2 PASSWORD '"+rolePasswords[role]+"'");
    }
    for(const item of grants.selected_grant_sources){
      const sql=read(item.source_path);
      assert.equal(blob(sql),item.reviewed_git_blob_sha1);
      await pool.query(sql);
    }
    await pool.query([
      'INSERT INTO public.accounts(id,kind,phone,password_hash) VALUES',
      "('v1-restore-a','merchant','+9647900000111','synthetic-not-login'),",
      "('v1-restore-b','merchant','+9647900000222','synthetic-not-login')"
    ].join(' '));
    await pool.query([
      'INSERT INTO public.merchants(id,account_id,owner_name,store_name,activity_type) VALUES',
      "('v1-restore-a','v1-restore-a','Test A','Recovery A','synthetic'),",
      "('v1-restore-b','v1-restore-b','Test B','Recovery B','synthetic')"
    ].join(' '));
    await pool.query([
      'INSERT INTO public.products(id,merchant_id,name) VALUES',
      "('v1-restore-product-a','v1-restore-a','Synthetic Product A'),",
      "('v1-restore-product-b','v1-restore-b','Synthetic Product B')"
    ].join(' '));
    await pool.query([
      'INSERT INTO public.orders(id,merchant_id,customer_name,source_channel) VALUES',
      "('v1-restore-order-a','v1-restore-a','Synthetic Customer A','messenger'),",
      "('v1-restore-order-b','v1-restore-b','Synthetic Customer B','messenger')"
    ].join(' '));
    const before=(await pool.query(catalogSQL)).rows[0];
    assert.equal(before.stages,54);
    assert.ok(before.public_tables>50&&before.rls_tables>10&&before.policies>10);
    for(const key of ['accounts','merchants','products','orders'])assert.equal(before[key],2);
    assert.equal(before.tenant_order_select,true);
    assert.equal(before.cashier_insert,false);
    assert.equal(before.auth_accounts,true);
    assert.equal(before.operator_order_insert,false);

    tmp=fs.mkdtempSync(path.join(os.tmpdir(),'fawri-v1-portable-'));
    const file=path.join(tmp,'full-schema.pgcustom');
    dockerPg(tmp,['pg_dump','-h','127.0.0.1','-U','fawri_ci','-d',SOURCE,
      '--format=custom','--compress=6','--file=/fawri-out/full-schema.pgcustom']);
    const bytes=fs.readFileSync(file);
    assert.equal(bytes.subarray(0,5).toString(),'PGDMP');
    assert.ok(bytes.length>10000);
    const fingerprint=sha256(bytes);
    // No roles are shared with source cluster; pre-provision exact V1 global
    // role definitions, security flags and ADMIN-only memberships.
    targetRolesCreated=true;
    recoveryGlobals=await bootstrapRecoveryGlobals(admin,targetAdmin);
    await targetAdmin.query('CREATE DATABASE '+TARGET+' OWNER '+OWNER);
    createdDbs.push(TARGET);
    dockerPg(tmp,['pg_restore','-h','127.0.0.1','-p',TARGET_PORT,'-U','fawri_ci','-d',TARGET,
      '--exit-on-error','--single-transaction','/fawri-out/full-schema.pgcustom']);
    restorePool=new Pool({connectionString:roleUrl(targetRoot,OWNER,recoveryGlobals.ownerSecret,TARGET),max:2,ssl:false});
    const after=(await restorePool.query(catalogSQL)).rows[0];
    assert.deepEqual(after,before,'V1_PORTABLE_SCHEMA_RLS_ACL_AND_ROWS_MISMATCH');
    const roles=(await targetAdmin.query(
      'SELECT rolname,rolcanlogin,rolinherit,rolsuper,rolbypassrls FROM pg_roles WHERE rolname=ANY($1::text[]) ORDER BY rolname',
      [ROLES])).rows;
    assert.equal(roles.length,3);
    assert.ok(roles.every(x=>x.rolcanlogin&&!x.rolinherit&&!x.rolsuper&&!x.rolbypassrls));
    await restorePool.query([
      'INSERT INTO public.orders(id,merchant_id,customer_name,source_channel) VALUES',
      "('v1-restore-only-target','v1-restore-a','Target Only','messenger')"
    ].join(' '));
    assert.equal((await restorePool.query(catalogSQL)).rows[0].orders,3);
    assert.equal((await pool.query(catalogSQL)).rows[0].orders,2);
    const report={
      format:'fawri-v1-disposable-54-stage-pg18-restore-v1',
      source_commit:process.env.GITHUB_SHA??null,
      synthetic_only:true,hosted_neon_touched:false,
      independent_postgres_clusters:2,
      global_roles_provisioned_before_restore:recoveryGlobals.roles,
      global_role_membership_edges:recoveryGlobals.edges,
      migration_stages:54,role_count:3,
      dump_format:'PostgreSQL custom',dump_bytes:bytes.length,dump_sha256:fingerprint,
      catalog:before,restored_catalog_equal:true,
      restored_source_isolation:true,
      production_backup_accepted:false,
    };
    if(process.env.FAWRI_V1_RESTORE_REPORT)
      fs.writeFileSync(process.env.FAWRI_V1_RESTORE_REPORT,JSON.stringify(report,null,2)+'\n');
    console.log('V1_TWO_PHYSICALLY_SEPARATE_PG18_CLUSTERS_GLOBAL_ROLES_PASS');
    console.log('V1_PG18_FULL_SCHEMA_CUSTOM_DUMP_RESTORE_RLS_ACL_PASS');
    console.log('V1_PG18_RECOVERY_DISPOSABLE_ONLY_NOT_NEON');
  }finally{
    if(restorePool)await restorePool.end();
    if(pool)await pool.end();
    if(folder)fs.rmSync(folder,{recursive:true,force:true});
    for(const db of [...createdDbs].reverse()){
      const client=db===TARGET?targetAdmin:admin;
      await client.query('DROP DATABASE IF EXISTS '+db+' WITH (FORCE)');
    }
    if(targetRolesCreated){
      for(const role of [...ALL].reverse())
        await targetAdmin.query('DROP ROLE IF EXISTS '+role);
      await targetAdmin.query('DROP ROLE IF EXISTS '+OWNER);
    }
    if(ownerCreated){
      for(const role of [...ALL].reverse())
        await admin.query('DROP ROLE IF EXISTS '+role);
      await admin.query('DROP ROLE IF EXISTS '+OWNER);
    }
    for(const client of [admin,targetAdmin]){
      const left=(await client.query([
        'SELECT',
        '(SELECT count(*)::integer FROM pg_database WHERE datname=ANY($1::text[])) AS dbs,',
        '(SELECT count(*)::integer FROM pg_roles WHERE rolname=$2 OR rolname=ANY($3::text[])) AS roles'
      ].join(' '),[[SOURCE,TARGET],OWNER,ALL])).rows[0];
      assert.deepEqual(left,{dbs:0,roles:0},'V1_BACKUP_CLUSTER_RESIDUE');
    }
    await targetAdmin.end();
    await admin.end();
    if(tmp)fs.rmSync(tmp,{recursive:true,force:true});
    console.log('V1_PG18_RECOVERY_DISPOSABLE_CLEANUP_PASS');
  }
}
await main();
