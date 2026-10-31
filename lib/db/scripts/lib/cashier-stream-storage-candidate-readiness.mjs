import {createHash} from 'node:crypto';
// Catalog inspector shared by production startup readiness and owned regressions.
// Trusted callers supply identities obtained from authenticated database sessions.
// SELECT-only catalog snapshot, not authorization or operational adoption.
const owner='fawri_cashier_retirement_owner';
const expectedBodies={
  "fawri_sequence_stream_guard": "ff7269a8c4abab06217e331ec94ca125b45838b7ce6d0294eebaae76420d3344",
  "fawri_sequence_receipt_guard": "f5b2663869e9ea914736650937d2d508b38ca8b1d73b0faf8368652b7f135fb6",
  "fawri_sequence_receipt_commit_guard": "167169ca073458060332fb5968ba0652fb959f707a08a6b572badb91edfb2921",
  "fawri_sequence_merchant_deleted": "cfc91ff0b7ab2afb8856710fbfd6ca5dd0c00f365ed775dd58c222b2938560e4"
};
const tables=['cashier_device_streams','cashier_operation_receipts'];
export async function assertCashierStreamStorageCandidateReady(client,{primaryRole,authenticationRole}){
 const issues=[];const fail=(ok,code)=>{if(!ok)issues.push(code);};
 const roles=(await client.query('SELECT rolname,rolcanlogin,rolsuper,rolbypassrls,rolcreatedb,rolcreaterole,rolinherit,rolreplication FROM pg_roles WHERE rolname=ANY($1::text[])',[[owner,primaryRole,authenticationRole]])).rows;
 const ownerRow=roles.find(r=>r.rolname===owner);
 fail(ownerRow&&!Object.entries(ownerRow).some(([k,v])=>k!=='rolname'&&v===true),'OWNER_ROLE_FLAGS');
 for(const name of [primaryRole,authenticationRole]){
  const row=roles.find(r=>r.rolname===name);fail(row&&row.rolcanlogin&&!row.rolsuper&&!row.rolbypassrls&&!row.rolcreatedb&&!row.rolcreaterole&&!row.rolinherit,'CALLER_ROLE_FLAGS');
 }
 const relations=(await client.query("SELECT c.relname,c.relrowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname=ANY($1::text[]) AND c.relkind='r'",[tables])).rows;
 fail(relations.length===2&&relations.every(r=>r.relrowsecurity),'TABLE_RLS');
 const functions=(await client.query("SELECT proname,prosrc,prosecdef,proconfig,pg_get_userbyid(proowner) AS owner,EXISTS(SELECT 1 FROM aclexplode(coalesce(proacl,acldefault('f',proowner))) a WHERE a.grantee=0 AND a.privilege_type='EXECUTE') AS public_execute FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND proname=ANY($1::text[])",[Object.keys(expectedBodies)])).rows;
 fail(functions.length===4,'FUNCTION_SET');
 for(const f of functions){
  fail(createHash('sha256').update(f.prosrc).digest('hex')===expectedBodies[f.proname],'FUNCTION_BODY');
  fail(JSON.stringify(f.proconfig)===JSON.stringify(['search_path=pg_catalog']),'FUNCTION_SEARCH_PATH');
  fail(f.prosecdef===(f.proname==='fawri_sequence_merchant_deleted'),'FUNCTION_SECURITY');
  fail(!f.public_execute,'FUNCTION_PUBLIC_EXECUTE');
  if(f.proname==='fawri_sequence_merchant_deleted')fail(f.owner===owner,'FUNCTION_OWNER');
 }
 const triggers=(await client.query("SELECT c.relname,t.tgname,t.tgenabled,t.tgdeferrable,t.tginitdeferred,p.proname FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_proc p ON p.oid=t.tgfoid WHERE n.nspname='public' AND NOT t.tgisinternal AND t.tgname=ANY($1::text[])",[['cashier_device_streams_guard','cashier_operation_receipts_guard','cashier_operation_receipts_commit_guard','cashier_device_streams_merchant_deleted']])).rows;
 const expectedTriggers={cashier_device_streams_guard:['cashier_device_streams','fawri_sequence_stream_guard',false],cashier_operation_receipts_guard:['cashier_operation_receipts','fawri_sequence_receipt_guard',false],cashier_operation_receipts_commit_guard:['cashier_operation_receipts','fawri_sequence_receipt_commit_guard',true],cashier_device_streams_merchant_deleted:['merchants','fawri_sequence_merchant_deleted',false]};
 fail(triggers.length===4&&triggers.every(t=>{const e=expectedTriggers[t.tgname];return e&&t.relname===e[0]&&t.proname===e[1]&&t.tgenabled==='O'&&t.tgdeferrable===e[2]&&t.tginitdeferred===e[2];}),'TRIGGER_STATE');
 const policies=(await client.query("SELECT c.relname,polname,polcmd,pg_get_expr(polqual,polrelid) AS predicate,pg_get_expr(polwithcheck,polrelid) AS check_predicate,ARRAY(SELECT CASE WHEN r=0 THEN 'public' ELSE pg_get_userbyid(r)::text END FROM unnest(polroles) r ORDER BY 1) AS roles FROM pg_policy JOIN pg_class c ON c.oid=polrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname=ANY($1::text[])",[tables])).rows;
 for(const table of tables){const p=policies.find(p=>p.relname===table&&p.polname===table+'_scoped_read');fail(p&&p.polcmd==='r'&&JSON.stringify(p.roles)==='["public"]'&&p.predicate==='fawri_security.allows_merchant(merchant_id)','SCOPED_READ_POLICY');}
 fail(!policies.some(p=>p.roles.includes('public')&&p.polcmd!=='r'),'PUBLIC_WRITE_POLICY');
 const ownerRead=policies.find(p=>p.polname==='sequence_retirement_owner_read'),ownerUpdate=policies.find(p=>p.polname==='sequence_retirement_owner_update');
 const simple=e=>String(e).replaceAll("'retired'::text","'retired'").replace(/[()\s]/g,'');
 fail(ownerRead&&ownerRead.polcmd==='r'&&JSON.stringify(ownerRead.roles)===JSON.stringify([owner])&&ownerRead.predicate==='true'&&ownerUpdate&&ownerUpdate.polcmd==='w'&&JSON.stringify(ownerUpdate.roles)===JSON.stringify([owner])&&simple(ownerUpdate.predicate)==="state<>'retired'"&&simple(ownerUpdate.check_predicate)==="state='retired'ANDdevice_idISNULL",'OWNER_POLICY');

 if(ownerRow&&relations.length===2){
  fail((await client.query('SELECT count(*)::int AS n FROM pg_auth_members WHERE roleid=(SELECT oid FROM pg_roles WHERE rolname=$1) OR member=(SELECT oid FROM pg_roles WHERE rolname=$1)',[owner])).rows[0].n===0,'OWNER_MEMBERSHIPS');
  fail((await client.query('SELECT count(*)::int AS n FROM pg_class WHERE relowner=(SELECT oid FROM pg_roles WHERE rolname=$1)',[owner])).rows[0].n===0,'OWNER_RELATION_OWNERSHIP');
  fail(!(await client.query("SELECT has_schema_privilege($1,'public','CREATE') AS allowed",[owner])).rows[0].allowed,'OWNER_SCHEMA_CREATE');
  const columns=(await client.query("SELECT attname,has_column_privilege($1,'public.cashier_device_streams',attname,'UPDATE') AS allowed FROM pg_attribute WHERE attrelid='public.cashier_device_streams'::regclass AND attnum>0 AND NOT attisdropped",[owner])).rows;
  fail(columns.every(c=>c.allowed===['state','device_id','version'].includes(c.attname)),'OWNER_COLUMN_ACL');
  for(const [table,privs]of [['cashier_device_streams','INSERT,DELETE,TRUNCATE,TRIGGER,REFERENCES'],['cashier_operation_receipts','SELECT,INSERT,UPDATE,DELETE'],['accounts','SELECT,INSERT,UPDATE,DELETE'],['merchants','SELECT,INSERT,UPDATE,DELETE']])fail(!(await client.query('SELECT has_table_privilege($1,$2,$3) AS allowed',[owner,'public.'+table,privs])).rows[0].allowed,'OWNER_EXTRA_TABLE_ACL');
  fail(!(await client.query("SELECT has_function_privilege($1,'public.fawri_authentication_runtime()','EXECUTE') AS allowed",[owner])).rows[0].allowed,'OWNER_AUTH_CAPABILITY');
  for(const role of [primaryRole,authenticationRole])if(roles.some(r=>r.rolname===role)){
   fail(!(await client.query("SELECT pg_has_role($1,$2,'USAGE') OR pg_has_role($1,$2,'SET') AS allowed",[role,owner])).rows[0].allowed,'CALLER_OWNER_REACHABILITY');
   fail(!(await client.query("SELECT has_function_privilege($1,'public.fawri_sequence_merchant_deleted()','EXECUTE') AS allowed",[role])).rows[0].allowed,'CALLER_DIRECT_EXECUTE');
  }
 }
 if(issues.length){const e=new Error('Cashier stream candidate metadata not ready');e.code='CASHIER_STREAM_STORAGE_CANDIDATE_NOT_READY';e.issues=[...new Set(issues)];throw e;}
 return {ok:true,statementSnapshotOnly:true,releaseAccepted:false};
}

export const assertCashierStreamStorageReady=assertCashierStreamStorageCandidateReady;
