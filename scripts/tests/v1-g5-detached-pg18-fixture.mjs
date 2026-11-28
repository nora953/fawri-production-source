/** Synthetic mechanism check only. No production archive, secret or network. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {localSession,proveRestoredAuthorization} from '../lib/v1-g5-restored-authorization.mjs';
import {recoverLocal} from '../v1-g5-private-detached-recovery.mjs';
import {buildAclSemanticReviewSql} from '../lib/v1-g5-detached-acl-recovery.mjs';
const BIN='/usr/lib/postgresql/18/bin';
const root=fs.mkdtempSync('/tmp/fawri-acl-recovery-fixture-');
const data=path.join(root,'data'),socket=path.join(root,'s'),admin='g5_detached_bootstrap';
const env={PATH:'/usr/bin:/bin',LANG:'C.UTF-8',HOME:root,PGHOST:socket,PGPORT:'5432',PGUSER:admin,PGDATABASE:'postgres'};
const run=(cmd,args,input,extra={})=>{
 const r=spawnSync(path.join(BIN,cmd),args,{input,env:{...env,...extra},timeout:120000,maxBuffer:8*1024*1024});
 if(r.error||r.status!==0)throw new Error('fixture '+cmd+' failed: '+String(r.stderr).slice(0,1600));
 return r.stdout;
};
const psql=(sql,extra={},args=[])=>run('psql',['-X','-w','-qAt','-v','ON_ERROR_STOP=1',...args],sql,extra);
let started=false;
try{
 assert.equal(process.getuid()===0,false);
 fs.mkdirSync(socket,{mode:0o700});
 run('initdb',['-D',data,'-U',admin,'--auth-local=trust','--auth-host=reject','--no-locale','--encoding=UTF8']);
 run('pg_ctl',['-D',data,'-l',path.join(root,'server.log'),'-o',"-c listen_addresses='' -c unix_socket_directories="+socket,'-w','start']);started=true;
 const roles=['fawri_restricted_runtime','fawri_auth_issuer','fawri_operator_issuer','fawri_cashier_retirement_writer'];
 psql('CREATE ROLE fawri_owner LOGIN NOSUPERUSER INHERIT BYPASSRLS;'+roles.map((r,i)=>'CREATE ROLE '+r+(i===3?' NOLOGIN':' LOGIN')+' NOINHERIT NOSUPERUSER NOBYPASSRLS;').join('\n')+
 roles.map(r=>'GRANT '+r+' TO fawri_owner WITH ADMIN TRUE, INHERIT FALSE, SET FALSE;').join('\n')+
 'CREATE ROLE neon_superuser NOLOGIN NOINHERIT; CREATE ROLE cloud_admin NOLOGIN NOINHERIT; GRANT neon_superuser TO fawri_owner; CREATE DATABASE fawri OWNER fawri_owner;');
 const sql=[];
 for(let i=0;i<102;i++){
   sql.push('CREATE TABLE public.fixture_'+i+'(id integer, merchant_id integer);');
   if(i<84)sql.push('ALTER TABLE public.fixture_'+i+' ENABLE ROW LEVEL SECURITY; ALTER TABLE public.fixture_'+i+' FORCE ROW LEVEL SECURITY;');
   if(i<83)sql.push('CREATE POLICY p ON public.fixture_'+i+' TO fawri_restricted_runtime USING (false);');
   if(i<25)sql.push('GRANT SELECT(id) ON public.fixture_'+i+' TO fawri_restricted_runtime;');
 }
 sql.push('ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO fawri_auth_issuer;');
 sql.push('ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE ON SEQUENCES TO fawri_auth_issuer;');
 sql.push('GRANT CONNECT ON DATABASE fawri TO neon_superuser; GRANT SELECT ON public.fixture_0 TO neon_superuser; GRANT USAGE ON SCHEMA public TO cloud_admin;');
 sql.push('INSERT INTO public.fixture_0 VALUES (1,1),(2,2);');
 psql(sql.join('\n'),{PGUSER:'fawri_owner',PGDATABASE:'fawri'});
 const capture=fileURLToPath(new URL('../../docs/final-audit/evidence/sql/P0-V1-G5-POSTG4-ACL-RECOVERY-CATALOG-HELD.sql',import.meta.url));
 const catalog=JSON.parse(psql(fs.readFileSync(capture),{PGUSER:'fawri_owner',PGDATABASE:'fawri'},['-v','g5_capture_approved=1']).toString());
 assert.equal(catalog.roles.length,5);assert.equal(catalog.membership_edges.length,5);
 assert.equal(catalog.membership_edges.filter(x=>x.role==='neon_superuser'&&x.member==='fawri_owner').length,1);
 assert.match(catalog.database_acl.acl,/neon_superuser=/);
 assert.match(catalog.relations.find(x=>x.name==='fixture_0').acl,/neon_superuser=/);
 psql('ALTER TABLE public.fixture_101 OWNER TO cloud_admin;', {PGDATABASE:'fawri'});
 const updatedCatalog=JSON.parse(psql(fs.readFileSync(capture),{PGUSER:'fawri_owner',PGDATABASE:'fawri'},['-v','g5_capture_approved=1']).toString());
 assert.equal(updatedCatalog.relations.find(x=>x.name==='fixture_101').owner,'cloud_admin');
 assert.match(updatedCatalog.schemas.find(x=>x.schema==='public').acl,/cloud_admin=/);
 // Synthetic default equivalence, missing provider grant and extra PUBLIC execution.
 const reviewSource=structuredClone(updatedCatalog), reviewTarget=structuredClone(updatedCatalog);
 reviewSource.relations.find(x=>x.name==='fixture_100').acl=psql("SELECT acldefault('r','fawri_owner'::regrole)::text;",{PGDATABASE:'fawri'}).toString().trim();
 reviewTarget.relations.find(x=>x.name==='fixture_100').acl=null;
 reviewTarget.relations.find(x=>x.name==='fixture_0').acl=null;
 psql("CREATE FUNCTION public.g5_acl_fixture() RETURNS int LANGUAGE sql AS 'SELECT 1';",{PGDATABASE:'fawri',PGUSER:'fawri_owner'});
 const fn={schema:'public',name:'g5_acl_fixture',identity_args:'',kind:'f',owner:'fawri_owner',security_definer:false};
 reviewSource.routines.push({...fn,acl:'{fawri_owner=X/fawri_owner}'});
 reviewTarget.routines.push({...fn,acl:null});
 const semantics=JSON.parse(psql(buildAclSemanticReviewSql(reviewSource,reviewTarget),{PGDATABASE:'fawri'}).toString());
 assert.equal(semantics.sections.relations.examined,2);
 assert.equal(semantics.sections.relations.same_direct_privileges,1);
 assert.equal(semantics.sections.relations.different_direct_privileges,1);
 assert.ok(semantics.delta.some(x=>x.role_class==='provider'&&x.difference==='missing_privilege'));
 assert.ok(semantics.delta.some(x=>x.role_class==='public'&&x.difference==='extra_privilege'));
 psql("DROP FUNCTION public.g5_acl_fixture();",{PGDATABASE:'fawri',PGUSER:'fawri_owner'});
 console.log('G5_SYNTHETIC_ACL_DEFAULT_SEMANTICS_PASS');
 const session=localSession({bin:path.join(BIN,'psql'),env:{...env,PGUSER:'fawri_restricted_runtime',PGDATABASE:'fawri'}});
 try{
   assert.equal(await session.query("SELECT current_user=session_user AND current_user='fawri_restricted_runtime';"),'t');
   const identity=await session.query("BEGIN; SELECT pg_backend_pid()::text||'|'||txid_current()::text;");
   assert.match(identity,/^\d+\|\d+$/);
   assert.equal(await session.query("SELECT count(id) FROM public.fixture_0;"),'0');
   assert.equal(await session.query("ROLLBACK; SELECT 1;"),'1');
 }finally{await session.close();}
 console.log('G5_SYNTHETIC_PERSISTENT_RESTRICTED_SESSION_PASS');
 const archive=run('pg_dump',['-Fc','--dbname=fawri']);
 // Source and target are distinct local clusters. No production endpoint or
 // passphrase is available in this workflow. The private CLI remains CI-denied.
 await recoverLocal({catalog:updatedCatalog,plain:archive});
 console.log('G5_SYNTHETIC_SOCKET_ONLY_ACL_REHEARSAL_PASS');

 // Exercise the real canonical issuer and actual authentication/operator
 // functions on a separate synthetic schema after the ACL rehearsal.
 // These are minimal dependency tables, not proof of the complete migrations.
 const source=(file,expected)=>{
   const bytes=fs.readFileSync(fileURLToPath(new URL('../../lib/db/drizzle/'+file,import.meta.url)));
   assert.equal(createHash('sha1').update('blob '+bytes.length+'\0').update(bytes).digest('hex'),expected);
   return bytes.toString('utf8');
 };
 const owner={PGUSER:'fawri_owner',PGDATABASE:'fawri'};
 const marker=source('0039_role_bound_authentication_runtime.sql','3275129afee9ba454ba1e69ea619f538a94e1c14').split('--> statement-breakpoint').slice(0,2).join('\n');
 const operator=source('0038_role_bound_admin_directory_issuer.sql','1ab287e78d7c61e721860e8591fae1b40b8adf64').split('--> statement-breakpoint').slice(0,2).join('\n');
 const issuer=source('0040_transaction_scoped_tenant_authority.sql','718330bb9b1ac592e0f2f835be2062c11f0dbffe');
 psql("CREATE TABLE public.accounts(id text PRIMARY KEY,kind text,phone text UNIQUE,password_hash text,state text DEFAULT 'active'); CREATE TABLE public.merchants(id text PRIMARY KEY,account_id text REFERENCES public.accounts(id),owner_name text,store_name text,activity_type text); CREATE TABLE public.products(id text PRIMARY KEY,merchant_id text REFERENCES public.merchants(id),name text); CREATE TABLE public.admin_profiles(account_id text PRIMARY KEY REFERENCES public.accounts(id),role text,enabled boolean,must_change_password boolean); CREATE TABLE public.admin_permissions(admin_id text,permission text); CREATE TABLE public.database_admin_access_audits(id text PRIMARY KEY,admin_account_id text,reason_code text,request_hash text,expires_at timestamptz);",owner);
 psql(marker+'\n'+operator+'\n'+issuer,owner);
 psql("REVOKE ALL ON public.products FROM fawri_auth_issuer; GRANT SELECT ON public.merchants TO fawri_auth_issuer; GRANT SELECT ON public.products TO fawri_restricted_runtime; GRANT USAGE ON SCHEMA fawri_security TO fawri_restricted_runtime,fawri_auth_issuer; GRANT EXECUTE ON FUNCTION public.fawri_authentication_runtime() TO fawri_auth_issuer; GRANT EXECUTE ON FUNCTION public.fawri_issue_admin_directory_audit(text,text,text) TO fawri_operator_issuer; GRANT EXECUTE ON FUNCTION fawri_security.issue_scope(name,integer,bigint,text) TO fawri_auth_issuer; GRANT EXECUTE ON FUNCTION fawri_security.allows_merchant(text) TO fawri_restricted_runtime; ALTER TABLE public.products ENABLE ROW LEVEL SECURITY; ALTER TABLE public.products FORCE ROW LEVEL SECURITY; CREATE POLICY g5_product_scope ON public.products TO fawri_restricted_runtime USING (fawri_security.allows_merchant(merchant_id));",owner);
 await proveRestoredAuthorization({
   psql:(role,sql)=>psql(sql,{PGUSER:role,PGDATABASE:'fawri'}),
   conn:role=>({...env,PGUSER:role,PGDATABASE:'fawri'}),
   bin:path.join(BIN,'psql')
 });
 console.log('G5_SYNTHETIC_CANONICAL_ISSUER_FUNCTIONAL_PROOF_PASS');

}finally{
 if(started){
  run('pg_ctl',['-D',data,'-m','immediate','-w','stop']);
 }
 fs.rmSync(root,{recursive:true,force:true});
}
