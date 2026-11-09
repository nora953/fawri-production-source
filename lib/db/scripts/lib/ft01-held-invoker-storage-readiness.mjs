/**
 * FT-01: strictly held, read-only metadata verifier for fresh-launch 0052
 * SECURITY INVOKER candidate. DOES NOT change production startup admission,
 * canonical migration files, historical journal, grants, or hosted databases.
 */
import {createHash} from 'node:crypto';
import {INVOKER_MERCHANT_DELETION_SHA256} from './ft01-0052-nonsuperuser-invoker-candidate.mjs';

const GROUP='fawri_auth_issuer';
const FUN='fawri_sequence_merchant_deleted';
const EXPECTED_FUNCTION_SHA={
  fawri_sequence_stream_guard:'ff7269a8c4abab06217e331ec94ca125b45838b7ce6d0294eebaae76420d3344',
  fawri_sequence_receipt_guard:'f5b2663869e9ea914736650937d2d508b38ca8b1d73b0faf8368652b7f135fb6',
  fawri_sequence_receipt_commit_guard:'167169ca073458060332fb5968ba0652fb959f707a08a6b572badb91edfb2921',
};
const hashes={
 cashier_device_streams_auth_deleted_read:{
  using:'PENDING_REVIEW',check:null,
 },
 cashier_device_streams_auth_deleted_retirement:{
  using:'PENDING_REVIEW',check:'PENDING_REVIEW',
 },
};
const allowedPolicies={
 cashier_device_streams_scoped_read:['cashier_device_streams','r','public'],
 cashier_device_streams_auth_deleted_read:['cashier_device_streams','r',GROUP],
 cashier_device_streams_auth_deleted_retirement:['cashier_device_streams','w',GROUP],
 cashier_operation_receipts_scoped_read:['cashier_operation_receipts','r','public'],
};
const expectedTriggers={
 cashier_device_streams_guard:['cashier_device_streams','fawri_sequence_stream_guard',false],
 cashier_operation_receipts_guard:['cashier_operation_receipts','fawri_sequence_receipt_guard',false],
 cashier_operation_receipts_commit_guard:['cashier_operation_receipts','fawri_sequence_receipt_commit_guard',true],
 cashier_device_streams_merchant_deleted:['merchants',FUN,false],
};
function same(a,b){return JSON.stringify(a)===JSON.stringify(b);}
export function hasPinnedFt01InvokerFingerprints(){
 return Object.values(hashes).every(h=>h.using!=='PENDING_REVIEW'&&
   (h.check===null||h.check!=='PENDING_REVIEW'));
}
export async function assertFt01HeldInvokerStorageReady(client,{primaryRole,authenticationRole,migrationOwnerRole}){
 const fail=(reason)=>{const e=new Error('FT01 held invoker metadata is not trustworthy');
  e.code='FT01_HELD_INVOKER_READINESS_NOT_PROVEN';e.reason=reason;throw e;};
 if(!hasPinnedFt01InvokerFingerprints())fail('POLICY_FINGERPRINTS_NOT_REVIEWED');
 const names=[primaryRole,authenticationRole,migrationOwnerRole,GROUP];
 if(names.some(n=>typeof n!=='string'||!/^[_a-z][_a-z0-9]{0,62}$/.test(n))||
   new Set(names).size!==4)fail('INDEPENDENT_ROLE_IDENTITIES_REQUIRED');
 const roles=(await client.query(`SELECT rolname,rolcanlogin,rolsuper,rolbypassrls,
   rolcreatedb,rolcreaterole,rolinherit,rolreplication
   FROM pg_roles WHERE rolname=ANY($1::text[])`,[names])).rows;
 if(roles.length!==4)fail('ROLE_SET');
 const group=roles.find(r=>r.rolname===GROUP);
 if(!group||Object.entries(group).some(([k,v])=>k!=='rolname'&&v!==false))fail('GROUP_ROLE_FLAGS');
 for(const login of [primaryRole,authenticationRole]){
  const r=roles.find(x=>x.rolname===login);
  if(!r||!r.rolcanlogin||Object.entries(r).some(([k,v])=>
     k!=='rolname'&&k!=='rolcanlogin'&&v!==false))fail('LOGIN_FLAGS');
 }
 const ownerRole=roles.find(x=>x.rolname===migrationOwnerRole);
 if(!ownerRole||ownerRole.rolsuper||!ownerRole.rolcreaterole)fail('MIGRATION_OWNER_FLAGS');

 const edges=(await client.query(`SELECT u.rolname AS member_role,
  m.admin_option,m.inherit_option,m.set_option
  FROM pg_auth_members m JOIN pg_roles r ON r.oid=m.roleid
  JOIN pg_roles u ON u.oid=m.member
  WHERE r.rolname=$1 ORDER BY u.rolname`,[GROUP])).rows;
 const want=[
  {member_role:migrationOwnerRole,admin_option:true,inherit_option:false,set_option:false},
  {member_role:authenticationRole,admin_option:false,inherit_option:true,set_option:false},
 ].sort((a,b)=>a.member_role.localeCompare(b.member));
 if(!same(edges,want))fail('GROUP_MEMBERSHIP_EDGES');

 const reach=(await client.query(`SELECT
   pg_has_role($1,$3,'USAGE') AS auth_inherits,
   pg_has_role($1,$3,'SET') AS auth_set,
   pg_has_role($2,$3,'USAGE') AS primary_inherits,
   pg_has_role($2,$3,'SET') AS primary_set,
   has_function_privilege($1,'public.fawri_authentication_runtime()','EXECUTE') AS auth_marker,
   has_function_privilege($2,'public.fawri_authentication_runtime()','EXECUTE') AS primary_marker,
   has_function_privilege($1,'public.fawri_sequence_merchant_deleted()','EXECUTE') AS auth_direct_trigger,
   has_function_privilege($2,'public.fawri_sequence_merchant_deleted()','EXECUTE') AS primary_direct_trigger,
   has_column_privilege($1,'public.cashier_device_streams','state','UPDATE') AS state_update,
   has_column_privilege($1,'public.cashier_device_streams','device_id','UPDATE') AS device_update,
   has_column_privilege($1,'public.cashier_device_streams','version','UPDATE') AS version_update,
   has_column_privilege($1,'public.cashier_device_streams','last_sequence','UPDATE') AS sequence_update,
   has_column_privilege($1,'public.cashier_device_streams','merchant_id','UPDATE') AS merchant_update,
   has_column_privilege($1,'public.cashier_device_streams','enrollment_evidence_hash','UPDATE') AS evidence_update,
   has_table_privilege($3,'public.cashier_device_streams','SELECT,INSERT,UPDATE,DELETE') AS group_table_privilege,
   has_schema_privilege($3,'public','CREATE') AS group_schema_create`,
   [authenticationRole,primaryRole,GROUP])).rows[0];
 if(!same(reach,{
  auth_inherits:true,auth_set:false,primary_inherits:false,primary_set:false,
  auth_marker:true,primary_marker:false,auth_direct_trigger:false,
  primary_direct_trigger:false,state_update:true,device_update:true,
  version_update:true,sequence_update:false,merchant_update:false,
  evidence_update:false,group_table_privilege:false,group_schema_create:false,
 }))fail('AUTHORITY_COLUMNS_OR_MEMBERSHIP');

 const funcs=(await client.query(`SELECT proname,prosrc,prosecdef,proconfig,
   pg_get_userbyid(proowner)::text AS owner,
   EXISTS(SELECT 1 FROM aclexplode(coalesce(proacl,acldefault('f',proowner))) a
     WHERE a.grantee=0 AND a.privilege_type='EXECUTE') AS public_execute
   FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public' AND proname=ANY($1::text[])`,
   [[...Object.keys(EXPECTED_FUNCTION_SHA),FUN]])).rows;
 if(funcs.length!==4)fail('FUNCTION_SET');
 for(const f of funcs){
  const h=createHash('sha256').update(f.prosrc).digest('hex');
  const expected=f.proname===FUN?INVOKER_MERCHANT_DELETION_SHA256:EXPECTED_FUNCTION_SHA[f.proname];
  if(h!==expected||f.public_execute||!same(f.proconfig,['search_path=pg_catalog'])||
     f.prosecdef!==false)fail('FUNCTION_BODY_SECURITY_OR_ACL');
  if(f.proname===FUN&&f.owner!==migrationOwnerRole)fail('INVOKER_OWNER');
 }
 const triggerRows=(await client.query(`SELECT c.relname,t.tgname,t.tgenabled,
   t.tgdeferrable,t.tginitdeferred,p.proname
   FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid
   JOIN pg_namespace n ON n.oid=c.relnamespace
   JOIN pg_proc p ON p.oid=t.tgfoid
   WHERE n.nspname='public' AND NOT t.tgisinternal
     AND t.tgname=ANY($1::text[])`,[Object.keys(expectedTriggers)])).rows;
 if(triggerRows.length!==4||triggerRows.some(t=>{
  const e=expectedTriggers[t.tgname];
  return !e||t.relname!==e[0]||t.proname!==e[1]||
    t.tgenabled!=='O'||t.tgdeferrable!==e[2]||t.tginitdeferred!==e[2];
 }))fail('TRIGGER_STATE');

 const policies=(await client.query(`SELECT c.relname,polname,polcmd,
  pg_get_expr(polqual,polrelid) AS predicate,
  pg_get_expr(polwithcheck,polrelid) AS check_predicate,
  ARRAY(SELECT CASE WHEN r=0 THEN 'public' ELSE pg_get_userbyid(r)::text END
    FROM unnest(polroles) r ORDER BY 1) AS roles
  FROM pg_policy JOIN pg_class c ON c.oid=polrelid
  JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='public' AND c.relname IN
    ('cashier_device_streams','cashier_operation_receipts')`)).rows;
 if(policies.length!==4)fail('POLICY_COUNT');
 for(const p of policies){
  const e=allowedPolicies[p.polname];
  if(!e||p.relname!==e[0]||p.polcmd!==e[1]||
    !same(p.roles,[e[2]]))fail('POLICY_ROLE_COMMAND');
  if(p.polname.endsWith('_scoped_read')){
   if(p.predicate!=='fawri_security.allows_merchant(merchant_id)'||
     p.check_predicate!==null)fail('SCOPED_READ');
  }else{
   const h=hashes[p.polname];
   const digest=t=>t===null?null:createHash('sha256').update(t).digest('hex');
   if(digest(p.predicate)!==h.using||digest(p.check_predicate)!==h.check)
     fail('POLICY_EXPRESSION_FINGERPRINT');
  }
 }
 const protectedTables=(await client.query(`SELECT relname,relrowsecurity
  FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='public' AND relname IN
     ('cashier_device_streams','cashier_operation_receipts')`)).rows;
 if(protectedTables.length!==2||protectedTables.some(x=>x.relrowsecurity!==true))
   fail('RLS_DISABLED');
 const retirementRole=(await client.query(`SELECT count(*)::int AS n FROM pg_roles
   WHERE rolname='fawri_cashier_retirement_owner'`)).rows[0];
 if(retirementRole?.n!==0)fail('UNEXPECTED_OWNER_ROLE');
 return {ok:true,sourceOnly:true,releaseAccepted:false,
   invariant:'FT01_HELD_INVOKER_EXACT_CATALOG_AND_AUTHORITY_PASS'};
}
