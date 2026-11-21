/**
 * FAWRI V1 G2-C: explicit owner-opt-in ONLY. One-shot, exact-schema, pinned
 * three role LOGIN + reviewed minimal grants; no Meta/POS/payment activation.
 * Credentials MUST stay in GitHub encrypted secrets, never source or logs.
 */
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import pg from 'pg';
import {buildV1FirstMerchantGrantSourcePlan}
  from '../../../scripts/lib/v1-first-merchant-grant-package-source-plan.mjs';
import {assertG2COptIn,assertG2COwnerUrl,assertG2CCredentials,
  assertG2CPreimage,assertG2CRoles,assertG2CProfiles,buildG2CLoginSql,classifyG2CError,G2C_ROLES,G2C_DORMANT}
  from '../../../scripts/lib/v1-g2-production-login-admission-safety.mjs';
const fail=code=>{const e=new Error(code);e.code=code;throw e;};
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../..');
const roles=[...G2C_ROLES,G2C_DORMANT];
const sha=s=>createHash('sha1').update('blob '+Buffer.byteLength(s)+'\0'+s).digest('hex');
const roleSQL=[
'SELECT r.rolname::text name,r.rolcanlogin can_login,r.rolinherit inherit,',
'r.rolsuper superuser,r.rolbypassrls bypass_rls,r.rolcreaterole can_create_roles,',
'r.rolcreatedb can_create_db,r.rolreplication replication,',
'(SELECT count(*)::int FROM pg_auth_members m WHERE m.member=r.oid) outgoing_membership,',
'(SELECT count(*)::int FROM pg_auth_members m WHERE m.roleid=r.oid) inbound_count,',
"(SELECT count(*)::int FROM pg_auth_members m JOIN pg_roles u ON u.oid=m.member WHERE m.roleid=r.oid AND u.rolname='fawri_owner' AND m.admin_option AND NOT m.inherit_option AND NOT m.set_option) inbound_creator_only,",
"has_schema_privilege(r.oid,'public','CREATE') public_create",
'FROM pg_roles r WHERE r.rolname=ANY($1::text[]) ORDER BY r.rolname'
].join(' ');
const catalogSQL=[
'SELECT current_database()::text db,session_user::text actor,',
"current_setting('server_version_num')::int/10000 pg_major,",
'(SELECT count(*)::int FROM drizzle.__drizzle_migrations) migration_count,',
"(SELECT count(*)::int FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN ('r','p')) public_tables,",
"(SELECT count(*)::int FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN ('r','p') AND c.relrowsecurity) rls_enabled_tables,",
"(SELECT count(*)::int FROM pg_policies WHERE schemaname='public') public_rls_policies,",
'(SELECT count(*)::int FROM public.merchants) merchant_rows,',
'(SELECT count(*)::int FROM public.accounts) account_rows,',
'(SELECT count(*)::int FROM public.orders) order_rows,',
"(to_regprocedure('fawri_security.issue_scope(name,integer,bigint,text)') IS NOT NULL) security_scope_function,",
"(to_regprocedure('public.fawri_authentication_runtime()') IS NOT NULL) auth_runtime_function,",
"(to_regprocedure('public.fawri_issue_admin_directory_audit(text,text,text)') IS NOT NULL) operator_directory_function"
].join(' ');
const checkCatalog=row=>{
 if(Number(row.migration_count)!==54||Number(row.public_tables)!==99||
   Number(row.rls_enabled_tables)!==79||Number(row.public_rls_policies)!==78||
   Number(row.merchant_rows)!==0||Number(row.account_rows)!==0||
   Number(row.order_rows)!==0)fail('V1_G2C_CATALOG_OR_CUSTOMER_DATA_DRIFT');
};
function pinSources(){
 const plan=buildV1FirstMerchantGrantSourcePlan();
 if(plan.approved_to_execute!==false||plan.selected_grant_sources?.length!==3||
   plan.legacy_not_selected?.length!==2||
   G2C_ROLES.some(name=>!plan.selected_grant_sources.some(x=>x.role===name)))
   fail('V1_G2C_SELECTED_SOURCE_DRIFT');
 const grants=plan.selected_grant_sources.map(x=>{
   if(!x.source_path.startsWith('lib/db/first-commercial/held/v1_')||
      !x.source_path.endsWith('_grants.sql'))fail('V1_G2C_GRANT_PATH_DENIED');
   const s=fs.readFileSync(path.join(root,x.source_path),'utf8');
   if(sha(s)!==x.reviewed_git_blob_sha1)fail('V1_G2C_GRANT_SHA_DRIFT');
   const wrapper=/\nBEGIN;\nSET LOCAL statement_timeout\s*=\s*'20s';\nSET LOCAL lock_timeout\s*=\s*'3s';\n/;
   if(!wrapper.test(s)||!/\nCOMMIT;\n$/.test(s))
     fail('V1_G2C_GRANT_TRANSACTION_DRIFT');
   return s.replace(wrapper,'\n').replace(/\nCOMMIT;\n$/,'\n');
 });
 const p='docs/final-audit/evidence/sql/P0-V1-FIRST-MERCHANT-ROLE-POSTFLIGHT-READONLY-HELD-20261112.sql';
 const sql=fs.readFileSync(path.join(root,p),'utf8');
 if(sha(sql)!=='171451c383e5aa30ec80ff3959a9198fac582778')
   fail('V1_G2C_POSTFLIGHT_SHA_DRIFT');
 return {grants,sql};
}
async function evidence(client,postSql,before){
 const row=(await client.query(catalogSQL)).rows[0];
 const r=(await client.query(roleSQL,[roles])).rows;
 checkCatalog(row);
 if(before)assertG2CPreimage(row,r);
 else{
   assertG2CRoles(r);
   assertG2CProfiles((await client.query(postSql)).rows);
 }
}
async function verifyRealLogins(ownerUrl,passwords){
 for(const role of G2C_ROLES){
   const u=new URL(ownerUrl);u.username=role;u.password=passwords[role];
   const c=new pg.Client({connectionString:u.toString(),connectionTimeoutMillis:8000});
   try{
     await c.connect();
     const x=(await c.query('SELECT session_user login,current_user active,current_database() db')).rows[0];
     if(x.login!==role||x.active!==role||x.db!=='fawri')
       fail('V1_G2C_LOGIN_SESSION_MISMATCH');
   }finally{await c.end().catch(()=>{});}
 }
}
async function main(){
 if(process.argv.length!==2)fail('V1_G2C_ARGS_DENIED');
 assertG2COptIn();
 const url=process.env.FAWRI_V1_PRODUCTION_PREWRITE_DUMP_URL;
 assertG2COwnerUrl(url);
 const passwords=assertG2CCredentials();
 const {grants,sql}=pinSources();
 const c=new pg.Client({connectionString:url,connectionTimeoutMillis:8000});
 await c.connect();
 try{
   await evidence(c,sql,true);
   console.log('V1_G2C_G2B_PREIMAGE_AND_PINNED_GRANTS_ACCEPTED');
   await c.query('BEGIN');
   try{
     await c.query("SET LOCAL statement_timeout='120s'");
     await c.query("SET LOCAL lock_timeout='3s'");
     for(const role of G2C_ROLES){
       // PG18 owner is CREATEROLE, not SUPERUSER; no privileged flag restatement.
       // Privileged flags are already false in the exact preimage and rechecked.
       await c.query(buildG2CLoginSql(role,passwords[role]));
     }
     for(const grant of grants)await c.query(grant);
     await evidence(c,sql,false);
     await c.query('COMMIT');
   }catch(e){await c.query('ROLLBACK').catch(()=>{});throw e;}
   try{await verifyRealLogins(url,passwords);}
   catch{
     // Revoke LOGIN if post-commit authentication is not independently proven.
     try{
       await c.query('BEGIN');
       for(const role of G2C_ROLES)await c.query('ALTER ROLE '+role+' NOLOGIN');
       await c.query('COMMIT');
       fail('V1_G2C_LOGIN_PROOF_FAILED_LOGIN_DISABLED');
     }catch(e){
       await c.query('ROLLBACK').catch(()=>{});
       if(e.code==='V1_G2C_LOGIN_PROOF_FAILED_LOGIN_DISABLED')throw e;
       fail('V1_G2C_LOGIN_PROOF_FAILED_MANUAL_ISOLATION_REQUIRED');
     }
   }
   console.log('V1_G2C_THREE_SEPARATE_REAL_LOGINS_VERIFIED');
   console.log('V1_G2C_HELD_MINIMAL_GRANTS_POSTIMAGE_ACCEPTED');
   console.log('V1_G2C_CASHIER_WRITER_NOLOGIN_META_POS_GRANTS_EXCLUDED');
   console.log('V1_G2C_NO_DATA_IMPORT_NO_APP_DEPLOY_NO_RELEASE');
 }finally{await c.end().catch(()=>{});}
}
try{await main();}
catch(e){
 // Only public SQLSTATE classification, never SQL/text/password/provider details.
 console.error(classifyG2CError(e));
 process.exitCode=1;
}
