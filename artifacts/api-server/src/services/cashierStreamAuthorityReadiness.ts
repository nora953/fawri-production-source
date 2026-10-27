import {createHash} from "node:crypto";
import {assertCashierStreamStorageReady} from "../../../../lib/db/scripts/lib/cashier-stream-storage-candidate-readiness.mjs";
import type {OperationalQueryTarget} from "./operationalPostgresAuthority";

// Internal SELECT-only inspection. Trusted provisioning callers supply role names
// from authenticated sessions. This is not actor authentication or authorization,
// a concurrent-DDL attestation, production startup wiring, or operational adoption.
type Identities={primaryRole:string;authenticationRole:string;reviewerRole:string;bootstrapRole:string};
const enrollmentOwner="fawri_cashier_enrollment_owner",receiptOwner="fawri_cashier_receipt_owner";
const owners=[enrollmentOwner,receiptOwner];
const targets=["cashier_device_streams","cashier_operation_receipts","cashier_stream_enrollment_reviews"];
const functions:Record<string,{args:string;owner:"enrollment"|"receipt"|"bootstrap";security:boolean;language:string;returns:string;set:boolean;volatility:string;hash:string}>={
 fawri_cashier_enrollment_runtime:{args:"",owner:"bootstrap",security:false,language:"sql",returns:"boolean",set:false,volatility:"s",hash:"bf52f1b1ec94ff12c0d86fe2021370784dd9de97ad2bea79856aa624444fa142"},
 fawri_enrollment_review_immutable:{args:"",owner:"bootstrap",security:false,language:"plpgsql",returns:"trigger",set:false,volatility:"v",hash:"65833ce7015463ef73a7dc9ce6b7b34d59a64459e1d65e3799e6f31e326fab1c"},
 fawri_enroll_reviewed_empty_cashier_stream:{args:"text, jsonb",owner:"enrollment",security:true,language:"plpgsql",returns:"record",set:true,volatility:"v",hash:"9f395dd1f92d9fce3112bd3f36a7c08057ea7506654d928a065ba40898e29e70"},
 fawri_cashier_stream_financial_runtime:{args:"",owner:"bootstrap",security:false,language:"sql",returns:"boolean",set:false,volatility:"s",hash:"bf52f1b1ec94ff12c0d86fe2021370784dd9de97ad2bea79856aa624444fa142"},
 fawri_lock_cashier_financial_stream:{args:"text, text, text",owner:"receipt",security:true,language:"plpgsql",returns:"record",set:true,volatility:"v",hash:"16e8cb87eac203b39f5fe664e98e54a28fbe453666151f1729c65a87dc0e61e4"},
 fawri_commit_cashier_financial_receipt:{args:"jsonb",owner:"receipt",security:true,language:"plpgsql",returns:"void",set:false,volatility:"v",hash:"66967d50367c619857e9324d0733e33f6517551f5d98461f9bab7cede48910e2"},
};
const policies:Record<string,{table:string;command:string;role:string;predicate:string|null;check:string|null}>={
 "enrollment_owner_stream_read": {
  "table": "cashier_device_streams",
  "command": "r",
  "role": "fawri_cashier_enrollment_owner",
  "predicate": "true",
  "check": null
 },
 "enrollment_owner_stream_insert": {
  "table": "cashier_device_streams",
  "command": "a",
  "role": "fawri_cashier_enrollment_owner",
  "predicate": null,
  "check": "state='active' AND last_sequence=0 AND version=1"
 },
 "enrollment_owner_review_read": {
  "table": "cashier_stream_enrollment_reviews",
  "command": "r",
  "role": "fawri_cashier_enrollment_owner",
  "predicate": "true",
  "check": null
 },
 "enrollment_owner_review_insert": {
  "table": "cashier_stream_enrollment_reviews",
  "command": "a",
  "role": "fawri_cashier_enrollment_owner",
  "predicate": null,
  "check": "true"
 },
 "enrollment_owner_timeline_read": {
  "table": "cashier_device_operation_timeline",
  "command": "r",
  "role": "fawri_cashier_enrollment_owner",
  "predicate": "true",
  "check": null
 },
 "enrollment_owner_attribution_read": {
  "table": "cashier_operation_attribution",
  "command": "r",
  "role": "fawri_cashier_enrollment_owner",
  "predicate": "true",
  "check": null
 },
 "enrollment_owner_order_read": {
  "table": "orders",
  "command": "r",
  "role": "fawri_cashier_enrollment_owner",
  "predicate": "true",
  "check": null
 },
 "enrollment_owner_station_read": {
  "table": "merchant_cashier_stations",
  "command": "r",
  "role": "fawri_cashier_enrollment_owner",
  "predicate": "true",
  "check": null
 },
 "enrollment_owner_station_lock": {
  "table": "merchant_cashier_stations",
  "command": "w",
  "role": "fawri_cashier_enrollment_owner",
  "predicate": "true",
  "check": "false"
 },
 "enrollment_owner_merchant_read": {
  "table": "merchants",
  "command": "r",
  "role": "fawri_cashier_enrollment_owner",
  "predicate": "true",
  "check": null
 },
 "enrollment_owner_merchant_lock": {
  "table": "merchants",
  "command": "w",
  "role": "fawri_cashier_enrollment_owner",
  "predicate": "true",
  "check": "false"
 },
 "receipt_owner_stream_read": {
  "table": "cashier_device_streams",
  "command": "r",
  "role": "fawri_cashier_receipt_owner",
  "predicate": "true",
  "check": null
 },
 "receipt_owner_stream_update": {
  "table": "cashier_device_streams",
  "command": "w",
  "role": "fawri_cashier_receipt_owner",
  "predicate": "state='active'",
  "check": "state='active'"
 },
 "receipt_owner_receipt_read": {
  "table": "cashier_operation_receipts",
  "command": "r",
  "role": "fawri_cashier_receipt_owner",
  "predicate": "true",
  "check": null
 },
 "receipt_owner_receipt_insert": {
  "table": "cashier_operation_receipts",
  "command": "a",
  "role": "fawri_cashier_receipt_owner",
  "predicate": null,
  "check": "true"
 },
 "receipt_owner_order_read": {
  "table": "orders",
  "command": "r",
  "role": "fawri_cashier_receipt_owner",
  "predicate": "true",
  "check": null
 },
 "receipt_owner_session_read": {
  "table": "cashier_operator_sessions",
  "command": "r",
  "role": "fawri_cashier_receipt_owner",
  "predicate": "true",
  "check": null
 },
 "receipt_owner_shift_read": {
  "table": "cashier_shifts",
  "command": "r",
  "role": "fawri_cashier_receipt_owner",
  "predicate": "true",
  "check": null
 },
 "receipt_owner_station_read": {
  "table": "merchant_cashier_stations",
  "command": "r",
  "role": "fawri_cashier_receipt_owner",
  "predicate": "true",
  "check": null
 },
 "receipt_owner_credential_read": {
  "table": "cashier_station_credentials",
  "command": "r",
  "role": "fawri_cashier_receipt_owner",
  "predicate": "true",
  "check": null
 }
};
const selectColumns:Record<string,Record<string,string[]|"*">>={
 [enrollmentOwner]:{
  cashier_device_streams:"*",cashier_stream_enrollment_reviews:"*",
  cashier_device_operation_timeline:["id","merchant_id","device_id"],cashier_operation_attribution:["id","merchant_id","device_id"],
  orders:["id","merchant_id","source_channel","metadata"],merchants:["id","retention_status","status","account_status"],
  merchant_cashier_stations:["id","merchant_id","status","paired_device_id","location_id"],
 },
 [receiptOwner]:{
  cashier_device_streams:"*",cashier_operation_receipts:"*",orders:"*",
  cashier_operator_sessions:["id","merchant_id","station_id","staff_id","shift_id","issued_at","expires_at","revoked_at"],
  cashier_shifts:["id","merchant_id","station_id","staff_id","started_at","ended_at"],
  merchant_cashier_stations:["id","merchant_id","location_id"],
  cashier_station_credentials:["id","merchant_id","station_id","device_id","issued_at","expires_at","revoked_at"],
 },
};
const insertColumns:Record<string,Record<string,string[]|"*">>={
 [enrollmentOwner]:{cashier_device_streams:["id","merchant_id","device_id","state","enrollment_evidence_hash","enrolled_at"],cashier_stream_enrollment_reviews:"*"},
 [receiptOwner]:{cashier_operation_receipts:"*"},
};
const updateColumns:Record<string,Record<string,string[]|"*">>={
 [enrollmentOwner]:{merchants:["id"],merchant_cashier_stations:["id"]},
 [receiptOwner]:{cashier_device_streams:["last_sequence","version"]},
};
export class CashierStreamAuthorityReadinessError extends Error {
 readonly code="CASHIER_STREAM_AUTHORITY_CANDIDATE_NOT_READY";
 constructor(readonly issues:string[]){super("Cashier stream authority proposal metadata is unsafe or incomplete");this.name="CashierStreamAuthorityReadinessError";}
}
export async function assertCashierStreamAuthorityCandidateReady(client:OperationalQueryTarget,identities:Identities){
 const issues:string[]=[];const fail=(ok:unknown,code:string)=>{if(!ok)issues.push(code);};
 const callerNames=[identities.primaryRole,identities.authenticationRole,identities.reviewerRole];
 const names=[...callerNames,identities.bootstrapRole,...owners];
 if(names.some(x=>typeof x!=="string"||!x||x.length>63)||new Set(names).size!==6)throw new CashierStreamAuthorityReadinessError(["DISTINCT_TRUSTED_IDENTITIES"]);
 try{
  try{await assertCashierStreamStorageReady(client,identities);}catch{issues.push("CANONICAL_STORAGE");}
  const roleRows=(await client.query("SELECT rolname,rolcanlogin,rolsuper,rolbypassrls,rolcreatedb,rolcreaterole,rolinherit,rolreplication FROM pg_roles WHERE rolname=ANY($1::text[])",[names])).rows;
  fail(roleRows.length===6,"ROLE_SET");
  for(const owner of owners){const r=roleRows.find(r=>r.rolname===owner);fail(r&&!Object.entries(r).some(([k,v])=>k!=="rolname"&&v===true),"OWNER_ROLE_FLAGS");}
  for(const name of callerNames){const r=roleRows.find(r=>r.rolname===name);fail(r&&r.rolcanlogin&&!r.rolsuper&&!r.rolbypassrls&&!r.rolcreatedb&&!r.rolcreaterole&&!r.rolinherit&&!r.rolreplication,"CALLER_ROLE_FLAGS");}
  const rels=(await client.query("SELECT c.relname,c.relrowsecurity,c.relkind,pg_get_userbyid(c.relowner) AS owner FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname=ANY($1::text[])",[targets])).rows;
  fail(rels.length===3&&rels.every(r=>r.relkind==="r"&&r.relrowsecurity&&r.owner===identities.bootstrapRole),"PROPOSAL_TABLE_METADATA");
  const ledgerColumns=(await client.query("SELECT a.attname,format_type(a.atttypid,a.atttypmod) AS type,a.attnotnull FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname='cashier_stream_enrollment_reviews' AND a.attnum>0 AND NOT a.attisdropped ORDER BY a.attnum")).rows;
  const ledgerNames=["review_reference_hash","stream_id","merchant_id","manifest_hash","reviewer_reference_hash","evidence_sha256","reviewed_at","created_at"];
  fail(ledgerColumns.length===ledgerNames.length&&ledgerColumns.every((c,i)=>c.attname===ledgerNames[i]&&c.type===(i<6?"text":"timestamp with time zone")&&c.attnotnull),"LEDGER_FIELD_CONTRACT");
  const procs=(await client.query("SELECT p.oid::text AS oid,proname,oidvectortypes(proargtypes) AS args,prosrc,prosecdef,proconfig,proretset,provolatile,format_type(prorettype,NULL) AS returns,l.lanname,pg_get_userbyid(proowner) AS owner,EXISTS(SELECT 1 FROM aclexplode(coalesce(proacl,acldefault('f',proowner))) a WHERE a.grantee=0 AND a.privilege_type='EXECUTE') AS public_execute FROM pg_proc p JOIN pg_namespace n ON n.oid=pronamespace JOIN pg_language l ON l.oid=prolang WHERE n.nspname='public' AND proname=ANY($1::text[])",[Object.keys(functions)])).rows;
  fail(procs.length===6,"FUNCTION_SET");
  const ownerNames={enrollment:enrollmentOwner,receipt:receiptOwner,bootstrap:identities.bootstrapRole};
  for(const p of procs){
   const expected=functions[String(p.proname)];if(!expected){issues.push("FUNCTION_SET");continue;}
   fail(p.args===expected.args&&p.returns===expected.returns&&p.proretset===expected.set&&p.lanname===expected.language&&p.provolatile===expected.volatility,"FUNCTION_SIGNATURE");
   fail(p.owner===ownerNames[expected.owner],"FUNCTION_OWNER");fail(p.prosecdef===expected.security,"FUNCTION_SECURITY");
   fail(JSON.stringify(p.proconfig)===JSON.stringify(["search_path=pg_catalog"]),"FUNCTION_SEARCH_PATH");
   fail(createHash("sha256").update(String(p.prosrc)).digest("hex")===expected.hash,"FUNCTION_BODY");fail(!p.public_execute,"FUNCTION_PUBLIC_EXECUTE");
   for(const name of callerNames){
    const allowed=p.proname==="fawri_enrollment_review_immutable"?false:
     String(p.proname).includes("enroll")?name===identities.reviewerRole:name===identities.primaryRole;
    fail((await client.query("SELECT has_function_privilege($1,$2::oid,'EXECUTE') AS allowed",[name,p.oid])).rows[0]?.allowed===allowed,"CALLER_FUNCTION_CAPABILITY");
   }
  }
  const policyRows=(await client.query("SELECT c.relname,polname,polcmd,polpermissive,pg_get_expr(polqual,polrelid) AS predicate,pg_get_expr(polwithcheck,polrelid) AS check_predicate,ARRAY(SELECT CASE WHEN r=0 THEN 'public' ELSE pg_get_userbyid(r)::text END FROM unnest(polroles) r ORDER BY 1) AS roles FROM pg_policy p JOIN pg_class c ON c.oid=polrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public'")).rows;
  // Only conjunctions of fixed equality/boolean predicates are accepted here;
  // normalization never removes operators, identifiers, or arbitrary casts.
  const simple=(value:unknown)=>value===null?null:String(value).replace(/::(?:text|bigint|integer)\b/g,"").replace(/'(0|1)'/g,"$1").replace(/[()\s]/g,"");
  for(const [name,expected]of Object.entries(policies)){
   const p=policyRows.find(p=>p.polname===name&&p.relname===expected.table);
   fail(p&&p.polcmd===expected.command&&p.polpermissive===true&&JSON.stringify(p.roles)===JSON.stringify([expected.role])&&simple(p.predicate)===simple(expected.predicate)&&simple(p.check_predicate)===simple(expected.check),"OWNER_POLICY");
  }
  const canonicalPolicies=["cashier_device_streams_scoped_read","cashier_operation_receipts_scoped_read","sequence_retirement_owner_read","sequence_retirement_owner_update"];
  fail(!policyRows.some(p=>targets.includes(String(p.relname))&&!policies[String(p.polname)]&&!canonicalPolicies.includes(String(p.polname))),"UNEXPECTED_POLICY");
  const ownerPolicies=policyRows.filter(p=>(p.roles as string[]).some(r=>owners.includes(r)));
  fail(ownerPolicies.length===Object.keys(policies).length&&ownerPolicies.every(p=>Boolean(policies[String(p.polname)])),"OWNER_POLICY_SET");
  const triggers=(await client.query("SELECT t.tgname,t.tgenabled,t.tgtype,t.tgdeferrable,t.tginitdeferred,p.proname,n.nspname AS function_schema FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace r ON r.oid=c.relnamespace JOIN pg_proc p ON p.oid=t.tgfoid JOIN pg_namespace n ON n.oid=p.pronamespace WHERE r.nspname='public' AND c.relname='cashier_stream_enrollment_reviews' AND NOT t.tgisinternal")).rows;
  fail(triggers.length===1&&triggers.every(t=>t.tgname==="cashier_stream_enrollment_reviews_immutable"&&t.tgenabled==="O"&&t.tgtype===27&&!t.tgdeferrable&&!t.tginitdeferred&&t.proname==="fawri_enrollment_review_immutable"&&t.function_schema==="public"),"REVIEW_TRIGGER");
  fail((await client.query("SELECT count(*)::int AS n FROM pg_auth_members WHERE roleid IN (SELECT oid FROM pg_roles WHERE rolname=ANY($1::text[])) OR member IN (SELECT oid FROM pg_roles WHERE rolname=ANY($1::text[]))",[owners])).rows[0]?.n===0,"OWNER_MEMBERSHIPS");
  fail((await client.query("SELECT count(*)::int AS n FROM pg_class WHERE relowner IN (SELECT oid FROM pg_roles WHERE rolname=ANY($1::text[]))",[owners])).rows[0]?.n===0,"OWNER_RELATION_OWNERSHIP");
  const owned=(await client.query("SELECT proname,n.nspname,pg_get_userbyid(proowner) AS owner FROM pg_proc p JOIN pg_namespace n ON n.oid=pronamespace WHERE proowner IN (SELECT oid FROM pg_roles WHERE rolname=ANY($1::text[]))",[owners])).rows;
  fail(owned.length===3&&owned.every(p=>p.nspname==="public"&&functions[String(p.proname)]&&p.owner===ownerNames[functions[String(p.proname)].owner]),"OWNER_FUNCTION_OWNERSHIP");
  for(const owner of owners){
   const acl=(await client.query("SELECT has_schema_privilege($1,'public','USAGE') AS public_usage,has_schema_privilege($1,'public','CREATE') AS public_create,has_schema_privilege($1,'fawri_security','USAGE') AS private_usage,has_schema_privilege($1,'fawri_security','CREATE') AS private_create,has_function_privilege($1,'fawri_security.issue_scope(name,integer,bigint,text)','EXECUTE') AS issuer,has_function_privilege($1,'fawri_security.allows_merchant(text)','EXECUTE') AS predicate,has_function_privilege($1,'public.fawri_authentication_runtime()','EXECUTE') AS authentication,has_table_privilege($1,'fawri_security.transaction_scopes','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,TRIGGER,REFERENCES') AS scope_access",[owner])).rows[0];
   fail(acl?.public_usage&&!acl.public_create&&!acl.private_create,"OWNER_SCHEMA_ACL");
   fail(acl?.private_usage===(owner===receiptOwner)&&acl?.predicate===(owner===receiptOwner)&&!acl?.issuer&&!acl?.authentication&&!acl?.scope_access,"OWNER_AUTHORITY_ACL");
   for(const name of callerNames)fail(!(await client.query("SELECT pg_has_role($1,$2,'USAGE') OR pg_has_role($1,$2,'SET') AS allowed",[name,owner])).rows[0]?.allowed,"CALLER_OWNER_REACHABILITY");
  }
  const columnRows=(await client.query("SELECT r.rolname,c.relname,a.attname,has_column_privilege(r.rolname,c.oid,a.attnum,'SELECT') AS select_allowed,has_column_privilege(r.rolname,c.oid,a.attnum,'INSERT') AS insert_allowed,has_column_privilege(r.rolname,c.oid,a.attnum,'UPDATE') AS update_allowed,has_column_privilege(r.rolname,c.oid,a.attnum,'REFERENCES') AS references_allowed FROM pg_roles r CROSS JOIN pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_attribute a ON a.attrelid=c.oid WHERE r.rolname=ANY($1::text[]) AND n.nspname='public' AND c.relkind IN ('r','p') AND a.attnum>0 AND NOT a.attisdropped",[[...owners,identities.reviewerRole]])).rows;
  for(const row of columnRows){
   const role=String(row.rolname),table=String(row.relname),column=String(row.attname);
   const allows=(map:Record<string,Record<string,string[]|"*">>)=>{const e=map[role]?.[table];return e==="*"||Boolean(e?.includes(column));};
   fail(Boolean(row.select_allowed)===allows(selectColumns)&&Boolean(row.insert_allowed)===allows(insertColumns)&&Boolean(row.update_allowed)===allows(updateColumns)&&!row.references_allowed,"OWNER_COLUMN_ACL");
  }
  fail(!(await client.query("SELECT EXISTS(SELECT 1 FROM pg_roles r CROSS JOIN pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE r.rolname=ANY($1::text[]) AND n.nspname='public' AND c.relkind IN ('r','p') AND has_table_privilege(r.rolname,c.oid,'DELETE,TRUNCATE,TRIGGER,REFERENCES')) AS allowed",[[...owners,identities.reviewerRole]])).rows[0]?.allowed,"OWNER_TABLE_ACL");
  for(const name of callerNames)fail(!(await client.query("SELECT (has_table_privilege($1,c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,TRIGGER,REFERENCES') OR has_any_column_privilege($1,c.oid,'SELECT,INSERT,UPDATE,REFERENCES')) AS allowed FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname='cashier_stream_enrollment_reviews'",[name])).rows[0]?.allowed,"CALLER_LEDGER_ACL");
 }catch(error){if(error instanceof CashierStreamAuthorityReadinessError)throw error;issues.push("CATALOG_QUERY");}
 if(issues.length)throw new CashierStreamAuthorityReadinessError([...new Set(issues)]);
 return{ok:true,statementSnapshotOnly:true,operationalAdoption:false,releaseAccepted:false};
}
