/** Synthetic mechanism check only. No production archive, secret or network. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {recoverLocal} from '../v1-g5-private-detached-recovery.mjs';
import {buildAclSemanticReviewSql} from '../lib/v1-g5-detached-acl-recovery.mjs';
const BIN='/usr/lib/postgresql/18/bin';
const root=fs.mkdtempSync('/tmp/fawri-acl-fixture-');
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
 const archive=run('pg_dump',['-Fc','--dbname=fawri']);
 // Source and target are distinct local clusters. No production endpoint or
 // passphrase is available in this workflow. The private CLI remains CI-denied.
 await recoverLocal({catalog:updatedCatalog,plain:archive});
 console.log('G5_SYNTHETIC_SOCKET_ONLY_ACL_REHEARSAL_PASS');
}finally{
 if(started){
  run('pg_ctl',['-D',data,'-m','immediate','-w','stop']);
 }
 fs.rmSync(root,{recursive:true,force:true});
}
