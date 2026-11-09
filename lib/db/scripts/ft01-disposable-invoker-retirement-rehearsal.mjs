/**
 * FT-01: PG18 disposable-only proof for held 0052 SECURITY INVOKER candidate.
 * Never changes canonical 0052 or connects to Neon.
 */
import assert from 'node:assert/strict';
import {randomBytes,randomUUID,randomInt,createHash} from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import pg from 'pg';
import {drizzle} from 'drizzle-orm/node-postgres';
import {migrate} from 'drizzle-orm/node-postgres/migrator';
import {createStabilizedMigrationFolder} from './lib/migration-sql-order.mjs';
import {disposableInvokerVariant} from './lib/ft01-0052-nonsuperuser-invoker-candidate.mjs';
import {assertFt01HeldInvokerStorageReady} from './lib/ft01-held-invoker-storage-readiness.mjs';
import {assertCashierStreamStorageReady} from './lib/cashier-stream-storage-candidate-readiness.mjs';

const {Client,Pool}=pg;
const DB='fawri_ft01_invoker_candidate';
const OWNER='fawri_ft01_invoker_owner';
const GROUP='fawri_cashier_retirement_writer';
const AUTH='fawri_auth_issuer';
const OPERATOR='fawri_operator_issuer';
const UNTRUSTED='fawri_restricted_runtime';
const migrationSource=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../drizzle');

function requireLocal(){
 assert.equal(process.argv.length,2);
 assert.equal(process.env.GITHUB_ACTIONS,'true');
 assert.equal(process.env.GITHUB_REPOSITORY,'nora953/fawri-production-source');
 assert.equal(process.env.FAWRI_ALLOW_FT01_INVOKER_CANDIDATE,'1');
 const u=new URL(process.env.DATABASE_URL??'');
 assert.equal(u.protocol,'postgresql:');assert.equal(u.hostname,'127.0.0.1');
 assert.equal(u.port,'5432');assert.equal(u.pathname,'/fawri_ci');
 assert.equal(decodeURIComponent(u.username),'fawri_ci');
 assert.equal(u.search,'');assert.equal(u.hash,'');
 return u;
}
function roleUrl(base,user,password){
 const u=new URL(base.toString());u.username=user;u.password=password;u.pathname='/'+DB;
 return u.toString();
}
async function deny(fn,code,reason){
 await assert.rejects(fn,e=>e?.code===code,reason);
}
async function main(){
 const base=requireLocal();
 const admin=new Client({connectionString:base.toString(),ssl:false,connectionTimeoutMillis:3000});
 const pw=randomBytes(28).toString('hex'),apw=randomBytes(28).toString('hex'),upw=randomBytes(28).toString('hex'),opw=randomBytes(28).toString('hex');
 let owner,auth,untrusted,operator,folder,dbCreated=false;
 const created=[];
 await admin.connect();
 try{
  const pre=(await admin.query(`SELECT
    current_database()::text AS db,current_setting('server_version_num')::int/10000 AS major,
    (SELECT count(*)::int FROM pg_roles WHERE rolname=ANY($1::text[])) AS roles,
    (SELECT count(*)::int FROM pg_roles WHERE rolname='fawri_cashier_retirement_owner') AS retirement_role,
    (SELECT count(*)::int FROM pg_database WHERE datname=$2) AS db_exists`,
    [[OWNER,GROUP,AUTH,UNTRUSTED,OPERATOR],DB])).rows[0];
  assert.deepEqual(pre,{db:'fawri_ci',major:18,roles:0,retirement_role:0,db_exists:0},
    'FT01_CANDIDATE_REQUIRES_CLEAN_PG18_CLUSTER');
  await admin.query(`CREATE ROLE "`+OWNER+`" LOGIN NOSUPERUSER CREATEROLE BYPASSRLS
    CREATEDB REPLICATION PASSWORD '`+pw+`'`);created.push(OWNER);
  await admin.query(`CREATE DATABASE "`+DB+`" OWNER "`+OWNER+`"`);dbCreated=true;
  owner=new Pool({connectionString:roleUrl(base,OWNER,pw),ssl:false,max:2,connectionTimeoutMillis:3000});
  // Mimic the reviewed independent new-target NOLOGIN role reservation.
  // PostgreSQL18 creator ADMIN is only on the bootstrap owner, never auth.
  await owner.query(`CREATE ROLE fawri_cashier_retirement_writer NOLOGIN NOINHERIT
    NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION`);
  created.push(GROUP);
  // True first-commercial ordering: the non-superuser CREATEROLE owner
  // provisions three NOLOGIN roles BEFORE schema migrations, and later
  // promotes them to independently authenticated LOGINs. CI superuser must
  // not create or promote the app roles, or Neon limitations stay hidden.
  for(const role of [UNTRUSTED,AUTH,OPERATOR]){
   await owner.query(`CREATE ROLE "`+role+`" NOLOGIN NOINHERIT NOSUPERUSER
     NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION`);
   created.push(role);
  }
  const prelogin=(await owner.query(`SELECT rolname,rolcanlogin,rolinherit,rolsuper,
    rolbypassrls,rolcreaterole,rolcreatedb,rolreplication FROM pg_roles
    WHERE rolname=ANY($1::text[]) ORDER BY rolname`,
    [[UNTRUSTED,AUTH,OPERATOR,GROUP]])).rows;
  assert.equal(prelogin.length,4,'FT01_FOUR_DISTINCT_PREPROVISIONED_ROLES');
  assert.ok(prelogin.every(r=>Object.entries(r).every(([key,val])=>
    key==='rolname'||val===false)),'FT01_PRELOGIN_ALL_FLAGS_RESTRICTED');
  const preEdges=(await owner.query(`SELECT grant_role.rolname AS granted_role,
    member.rolname AS member_role,m.admin_option,m.inherit_option,m.set_option
    FROM pg_auth_members m
    JOIN pg_roles grant_role ON grant_role.oid=m.roleid
    JOIN pg_roles member ON member.oid=m.member
    WHERE grant_role.rolname=ANY($1::text[]) OR member.rolname=ANY($1::text[])
    ORDER BY grant_role.rolname,member.rolname`,
    [[UNTRUSTED,AUTH,OPERATOR,GROUP]])).rows;
  assert.deepEqual(preEdges,[UNTRUSTED,AUTH,OPERATOR,GROUP].sort().map(granted_role=>({
    granted_role,member_role:OWNER,admin_option:true,
    inherit_option:false,set_option:false,
  })),'FT01_NON_SUPERUSER_CREATOR_ONLY_ADMIN_PRELOGIN');
  const original=fs.readFileSync(path.join(migrationSource,'0052_cashier_stream_receipt_storage.sql'),'utf8');
  folder=createStabilizedMigrationFolder(migrationSource);
  fs.writeFileSync(path.join(folder,'0052_cashier_stream_receipt_storage.sql'),
    disposableInvokerVariant(original),'utf8');
  await migrate(drizzle(owner),{migrationsFolder:folder});
  await migrate(drizzle(owner),{migrationsFolder:folder});
  const migrated=(await owner.query(`SELECT
    (SELECT count(*)::int FROM drizzle.__drizzle_migrations) AS migrations,
    (SELECT count(*)::int FROM pg_roles WHERE rolname='fawri_cashier_retirement_owner') AS retirement_roles,
    (SELECT pg_get_userbyid(proowner)::text FROM pg_proc
      WHERE oid='public.fawri_sequence_merchant_deleted()'::regprocedure) AS function_owner,
    (SELECT prosecdef FROM pg_proc
      WHERE oid='public.fawri_sequence_merchant_deleted()'::regprocedure) AS security_definer,
    (SELECT count(*)::int FROM pg_policies WHERE schemaname='public'
      AND tablename='cashier_device_streams' AND policyname IN
      ('cashier_device_streams_auth_deleted_read','cashier_device_streams_auth_deleted_retirement')) AS policies`)).rows[0];
  assert.deepEqual(migrated,{migrations:53,retirement_roles:0,
    function_owner:OWNER,security_definer:false,policies:2},
    'FT01_INVOKER_STRUCTURAL_POSTIMAGE');

  for(const [role,password] of [[AUTH,apw],[UNTRUSTED,upw],[OPERATOR,opw]]){
   await owner.query(`ALTER ROLE "`+role+`" LOGIN PASSWORD '`+password+`'`);
  }
  await owner.query(`GRANT USAGE ON SCHEMA public TO "`+AUTH+`","`+UNTRUSTED+`"`);
  // Evaluate the existing scoped-read predicate: it is FALSE for an unissued
  // auth session, and never confers tenant authority or direct stream writes.
  await owner.query(`GRANT USAGE ON SCHEMA fawri_security TO "`+AUTH+`","`+UNTRUSTED+`"`);
  await owner.query(`GRANT EXECUTE ON FUNCTION fawri_security.allows_merchant(text) TO "`+AUTH+`","`+UNTRUSTED+`"`);
  await owner.query(`GRANT SELECT,UPDATE(retention_status,status) ON public.merchants TO "`+AUTH+`","`+UNTRUSTED+`"`);
  // Tenant runtime may SELECT only through the scoped RLS predicate.
  // Only the authenticated issuer receives narrow retirement column UPDATE.
  // Granting the tenant LOGIN those columns would hide a real launch risk.
  await owner.query(`GRANT SELECT ON public.cashier_device_streams TO "`+AUTH+`","`+UNTRUSTED+`"`);
  await owner.query(`GRANT UPDATE(state,device_id,version) ON public.cashier_device_streams TO "`+AUTH+`"`);
  await owner.query(`GRANT EXECUTE ON FUNCTION public.fawri_authentication_runtime() TO "`+AUTH+`"`);
  // GROUP is the only RLS write-policy target: auth inherits the capability
  // without SET ROLE or role-administration rights; untrusted is not a member.
  await owner.query(`GRANT fawri_cashier_retirement_writer TO "`+AUTH+`" WITH SET FALSE, INHERIT TRUE`);
  auth=new Client({connectionString:roleUrl(base,AUTH,apw),ssl:false,connectionTimeoutMillis:3000});
  untrusted=new Client({connectionString:roleUrl(base,UNTRUSTED,upw),ssl:false,connectionTimeoutMillis:3000});
  operator=new Client({connectionString:roleUrl(base,OPERATOR,opw),ssl:false,connectionTimeoutMillis:3000});
  await auth.connect();await untrusted.connect();await operator.connect();
  // Capture only policy-expression digests, not values, IDs or credentials.
  // The next security gate pins the exact deparsed PostgreSQL18 policy ASTs.
  const policyFingerprintRows=(await owner.query(`SELECT polname,
    encode(sha256(convert_to(pg_get_expr(polqual,polrelid),'UTF8')),'hex') AS using_sha,
    CASE WHEN polwithcheck IS NULL THEN NULL ELSE
      encode(sha256(convert_to(pg_get_expr(polwithcheck,polrelid),'UTF8')),'hex')
    END AS check_sha
    FROM pg_policy JOIN pg_class c ON c.oid=polrelid
    WHERE c.relname='cashier_device_streams' AND polname IN
      ('cashier_device_streams_auth_deleted_read',
       'cashier_device_streams_auth_deleted_retirement')
    ORDER BY polname`)).rows;
  assert.equal(policyFingerprintRows.length,2);
  console.log('FT01_HELD_INVOKER_POLICY_AST_SHA256 '+JSON.stringify(policyFingerprintRows));
  const edges=(await owner.query(`SELECT member.rolname AS member,
    m.admin_option,m.inherit_option,m.set_option FROM pg_auth_members m
    JOIN pg_roles group_role ON group_role.oid=m.roleid
    JOIN pg_roles member ON member.oid=m.member
    WHERE group_role.rolname='fawri_cashier_retirement_writer' ORDER BY member.rolname`)).rows;
  assert.deepEqual(edges,[
    {member:AUTH,admin_option:false,inherit_option:true,set_option:false},
    {member:OWNER,admin_option:true,inherit_option:false,set_option:false},
  ].sort((a,b)=>a.member.localeCompare(b.member)),'FT01_INVOKER_EXPECTED_GROUP_MEMBERSHIPS');
  // The actual planned first-commercial LOGIN names must be independently
  // authenticated; neither LOGIN can SET ROLE to the writer NOLOGIN group.
  for(const [client,role] of [[auth,AUTH],[untrusted,UNTRUSTED],[operator,OPERATOR]]){
   const actual=(await client.query(`SELECT session_user::text AS login,current_user::text AS active,
     (SELECT rolsuper OR rolbypassrls OR rolcreaterole FROM pg_roles WHERE rolname=session_user) AS privileged`)).rows[0];
   assert.deepEqual(actual,{login:role,active:role,privileged:false});
   const setReach=(await client.query("SELECT pg_has_role(session_user,'fawri_cashier_retirement_writer','SET') AS allowed")).rows[0];
   assert.deepEqual(setReach,{allowed:false},'FT01_CANNOT_SET_ROLE_TO_WRITER_GROUP');
  }
  for(const c of [auth,untrusted]){
   const p=(await c.query("SELECT fawri_security.allows_merchant('unissued-merchant') AS allowed")).rows[0];
   assert.deepEqual(p,{allowed:false},'FT01_NO_SYNTHETIC_TENANT_SCOPE');
  }
  const operatorRights=(await operator.query(`SELECT
    has_function_privilege(session_user,'public.fawri_authentication_runtime()','EXECUTE') AS auth_marker,
    has_column_privilege(session_user,'public.cashier_device_streams','version','UPDATE') AS version_update,
    pg_has_role(session_user,'fawri_cashier_retirement_writer','USAGE') AS retirement_group
  `)).rows[0];
  assert.deepEqual(operatorRights,{auth_marker:false,version_update:false,
    retirement_group:false},'FT01_OPERATOR_LOGIN_NO_CASHIER_RETIREMENT_PRIVILEGES');
  console.log('FT01_PLANNED_THREE_LOGIN_NON_SUPERUSER_ROLE_PROMOTION_PASS');
  // The production canonical prelistener remains untouched. This verifies
  // the alternate held fingerprint/ACL/RLS/trigger profile in a local-only
  // inspect-only gate, with deliberately adversarial catalogue mutations.
  const profile={primaryRole:UNTRUSTED,authenticationRole:AUTH,
    operatorRole:OPERATOR,migrationOwnerRole:OWNER};
  // A deployment's real prelistener runs from its RESTRICTED tenant LOGIN,
  // never from a BYPASSRLS migration owner. Do not count admin-catalog
  // visibility alone as a production startup proof.
  const tenantAdmission=await assertFt01HeldInvokerStorageReady(untrusted,profile);
  assert.equal(tenantAdmission.ok,true,'FT01_RESTRICTED_TENANT_LOGIN_CATALOG_READABLE');
  // The existing canonical-only production startup guard must reject the
  // HELD alternative until a separately reviewed release profile is adopted.
  await assert.rejects(
    () => assertCashierStreamStorageReady(untrusted,{
      primaryRole:UNTRUSTED,authenticationRole:AUTH,
    }),
    e=>e.code==='CASHIER_STREAM_STORAGE_CANDIDATE_NOT_READY' &&
      e.issues?.includes('FUNCTION_SECURITY') &&
      e.issues?.includes('OWNER_ROLE_FLAGS'),
    'FT01_HELD_INVOKER_CANNOT_BYPASS_CANONICAL_PRODUCTION_GATE',
  );
  console.log('FT01_HELD_INVOKER_REAL_AUTH_AND_TENANT_LOGIN_NAMES_NOLOGIN_SEPARATION_PASS');
  console.log('FT01_HELD_INVOKER_TENANT_LOGIN_CATALOG_PASS');
  console.log('FT01_HELD_INVOKER_CANONICAL_PRODUCTION_GATE_DENIED_PASS');
  const accepted=await assertFt01HeldInvokerStorageReady(owner,profile);
  assert.deepEqual(accepted,{
   ok:true,sourceOnly:true,releaseAccepted:false,
   invariant:'FT01_HELD_INVOKER_EXACT_CATALOG_AND_AUTHORITY_PASS',
  });
  for(const [label,mutation,expected] of [
   ['WRITABLE_POLICY',`ALTER POLICY cashier_device_streams_auth_deleted_retirement
     ON public.cashier_device_streams USING (true)`,'POLICY_EXPRESSION_FINGERPRINT'],
   ['UNTRUSTED_GROUP_MEMBERSHIP',`GRANT fawri_cashier_retirement_writer TO "`+UNTRUSTED+`" WITH SET TRUE, INHERIT FALSE`,
     'GROUP_MEMBERSHIP_EDGES'],
   ['FUNCTION_PRIVILEGE_DRIFT',`ALTER FUNCTION public.fawri_sequence_merchant_deleted() SECURITY DEFINER`,
     'FUNCTION_BODY_SECURITY_OR_ACL'],
   ['CHECKPOINT_ESCALATION',`GRANT UPDATE(last_sequence)
     ON public.cashier_device_streams TO "`+AUTH+`"`,'AUTHORITY_COLUMNS_OR_MEMBERSHIP'],
   ['OPERATOR_AUTH_MARKER_ESCALATION',`GRANT EXECUTE ON FUNCTION
     public.fawri_authentication_runtime() TO "`+OPERATOR+`"`,
     'AUTHORITY_COLUMNS_OR_MEMBERSHIP'],
   ['OPERATOR_DIRECT_RETIREMENT_ESCALATION',`GRANT UPDATE(state,device_id,version)
     ON public.cashier_device_streams TO "`+OPERATOR+`"`,
     'AUTHORITY_COLUMNS_OR_MEMBERSHIP'],
   ['OPERATOR_WRITER_GROUP_MEMBERSHIP',`GRANT fawri_cashier_retirement_writer
     TO "`+OPERATOR+`" WITH SET FALSE, INHERIT TRUE`,
     'GROUP_MEMBERSHIP_EDGES'],
  ]){
   const c=await owner.connect();
   try{
    await c.query('BEGIN');
    await c.query(mutation);
    await assert.rejects(
      ()=>assertFt01HeldInvokerStorageReady(c,profile),
      e=>e.code==='FT01_HELD_INVOKER_READINESS_NOT_PROVEN'&&e.reason===expected,
      'FT01_INVOCER_DENY_'+label,
    );
   }finally{
    await c.query('ROLLBACK');
    c.release();
   }
   await assertFt01HeldInvokerStorageReady(owner,profile);
  }
  console.log('FT01_HELD_INVOKER_EXACT_STARTUP_CATALOG_PASS');
  console.log('FT01_HELD_INVOKER_OPERATOR_LOGIN_SEPARATION_NEGATIVE_PASS');
  console.log('FT01_HELD_INVOKER_POLICY_OWNER_ROLE_NEGATIVE_TAMPER_PASS');
  const salt=randomUUID().replaceAll('-','');
  const merchants=[0,1,2].map(i=>'ft01-invoker-'+i+'-'+salt);
  const streams=merchants.map((_,i)=>'ft01-stream-'+i+'-'+salt);
  for(let i=0;i<3;i++){
   await owner.query(`INSERT INTO public.accounts(id,kind,phone,password_hash,state)
     VALUES($1,'merchant',$2,'synthetic','active')`,
     [merchants[i],'+199'+String(randomInt(100000000,999999999))]);
   await owner.query(`INSERT INTO public.merchants(id,account_id,owner_name,store_name,activity_type,status)
     VALUES($1,$1,'Synthetic','Synthetic','retail','suspended')`,[merchants[i]]);
   await owner.query(`INSERT INTO public.cashier_device_streams(
     id,merchant_id,device_id,state,enrollment_evidence_hash,enrolled_at)
     VALUES($1,$2,$3,'active',repeat('a',64),now())`,
     [streams[i],merchants[i],'device-'+i+'-'+salt]);
  }
  const state=async()=>(await owner.query(`SELECT m.id AS merchant_id,m.retention_status,
    s.state,s.device_id,s.version FROM public.merchants m
    JOIN public.cashier_device_streams s ON s.merchant_id=m.id
    WHERE m.id=ANY($1::text[]) ORDER BY m.id`,[merchants])).rows;
  const before=await state();assert.equal(before.length,3);
  // Revoke the mandatory NOLOGIN issuer group while keeping the marker:
  // a missing RLS membership must NOT silently tombstone a merchant and
  // leave its previously active stream unretired.
  await owner.query(`REVOKE fawri_cashier_retirement_writer FROM "`+AUTH+`"`);
  await deny(()=>auth.query(`UPDATE public.merchants
     SET retention_status='deleted' WHERE id=$1`,[merchants[0]]),
     '42501','FT01_MISSING_AUTH_GROUP_MUST_ROLLBACK_MERCHANT_DELETE');
  assert.deepEqual(await state(),before,'FT01_MISSING_GROUP_NO_UNRETIRED_DELETED_MERCHANT');
  await owner.query(`GRANT fawri_cashier_retirement_writer TO "`+AUTH+`" WITH SET FALSE, INHERIT TRUE`);
  await assertFt01HeldInvokerStorageReady(owner,profile);
  console.log('FT01_HELD_INVOKER_MISSING_GROUP_MEMBERSHIP_DENIED_PASS');

  await deny(()=>untrusted.query(`UPDATE public.merchants
     SET retention_status='deleted' WHERE id=$1`,[merchants[0]]),
     '42501','FT01_UNTRUSTED_MERCHANT_DELETION_MUST_DENY');
  assert.deepEqual(await state(),before);
  const direct=await auth.query(`UPDATE public.cashier_device_streams
    SET state='retired',device_id=NULL,version=version+1 WHERE id=$1`,[streams[1]]);
  assert.equal(direct.rowCount,0,'FT01_DIRECT_LIVE_STREAM_UPDATE_DENIED');
  await deny(()=>auth.query(`UPDATE public.cashier_device_streams
    SET last_sequence=1 WHERE id=$1`,[streams[1]]),'42501',
    'FT01_NO_CHECKPOINT_COLUMN_GRANT');
  assert.deepEqual(await state(),before);
  await owner.query(`REVOKE UPDATE(version) ON public.cashier_device_streams FROM "`+AUTH+`"`);
  await deny(()=>auth.query(`UPDATE public.merchants
    SET retention_status='deleted' WHERE id=$1`,[merchants[1]]),'42501',
    'FT01_RETIREMENT_GRANT_DEFICIT_ROLLS_BACK_DELETION');
  assert.deepEqual(await state(),before);
  await owner.query(`GRANT UPDATE(version) ON public.cashier_device_streams TO "`+AUTH+`"`);
  const done=await auth.query(`UPDATE public.merchants
    SET retention_status='deleted' WHERE id=$1`,[merchants[0]]);
  assert.equal(done.rowCount,1);
  const after=await state();
  assert.equal(after[0].merchant_id,merchants[0]);
  assert.equal(after[0].retention_status,'deleted');
  assert.equal(after[0].state,'retired');
  assert.equal(after[0].device_id,null);
  assert.equal(after[0].version,2);
  assert.deepEqual(after.slice(1),before.slice(1));
  const replay=await auth.query(`UPDATE public.cashier_device_streams
    SET state='retired',device_id=NULL,version=version+1 WHERE id=$1`,[streams[0]]);
  assert.equal(replay.rowCount,0);
  assert.deepEqual(await state(),after);
  console.log('FT01_INVOKER_NON_SUPERUSER_53_MIGRATIONS_PASS');
  console.log('FT01_INVOKER_DENIAL_DIRECT_WRITE_AND_AUTH_MARKER_PASS');
  console.log('FT01_INVOKER_GRANT_DEFICIT_ATOMIC_ROLLBACK_PASS');
  console.log('FT01_INVOKER_RETIREMENT_OWN_ONLY_PEER_UNCHANGED_PASS');
  console.log('FT01_HELD_CANDIDATE_NOT_CANONICAL_NOT_HOSTED_PASS');
 } finally {
  if(auth)await auth.end();
  if(untrusted)await untrusted.end();
  if(operator)await operator.end();
  if(owner)await owner.end();
  if(folder)fs.rmSync(folder,{recursive:true,force:true});
  if(dbCreated)await admin.query(`DROP DATABASE "`+DB+`" WITH (FORCE)`);
  for(const role of created.reverse())await admin.query(`DROP ROLE "`+role+`"`);
  const clean=(await admin.query(`SELECT
    (SELECT count(*)::int FROM pg_roles WHERE rolname=ANY($1::text[])) AS roles,
    (SELECT count(*)::int FROM pg_database WHERE datname=$2) AS dbs,
    (SELECT count(*)::int FROM pg_roles WHERE rolname='fawri_cashier_retirement_owner') AS retirement_roles`,
    [[OWNER,GROUP,AUTH,UNTRUSTED,OPERATOR],DB])).rows[0];
  assert.deepEqual(clean,{roles:0,dbs:0,retirement_roles:0});
  await admin.end();
 }
}
await main();
