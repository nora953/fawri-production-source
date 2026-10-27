import type {OperationalQueryTarget} from './operationalPostgresAuthority';
import {assertCashierStreamAuthorityCandidateReady} from './cashierStreamAuthorityReadiness';
import {validateCashierAuthorityCandidateHistory} from '../../../../lib/db/scripts/lib/cashier-authority-candidate-history.mjs';

type Identities={primaryRole:string;authenticationRole:string;reviewerRole:string;bootstrapRole:string};
export class CashierAuthorityCandidateInstallationError extends Error {
  readonly code='CASHIER_AUTHORITY_CANDIDATE_INSTALLATION_NOT_READY';
  constructor(readonly issues:string[]){super('Candidate installation history or authority boundary is unsafe or incomplete');this.name='CashierAuthorityCandidateInstallationError';}
}

// INTERNAL SELECT-only candidate inspection. Trusted configuration supplies role
// names. No pool creation, credentials, grants, startup wiring or adoption.
// Call within REPEATABLE READ/SERIALIZABLE; positive tests also use READ ONLY.
// A snapshot is not a DDL lock, reviewer provenance or permission to grant later.
export async function assertCashierAuthorityCandidateInstallationReady(client:OperationalQueryTarget,identities:Identities){
  const issues:string[]=[];
  const fail=(ok:unknown,code:string)=>{if(!ok)issues.push(code);};
  let transactionReadOnly=false;
  try {
    const context=(await client.query("SELECT session_user::text AS login,current_user::text AS active,current_setting('transaction_isolation') AS isolation,current_setting('transaction_read_only') AS read_only")).rows[0];
    if(!context||context.login!==identities.bootstrapRole||context.active!==identities.bootstrapRole)throw new CashierAuthorityCandidateInstallationError(['BOOTSTRAP_CONTEXT']);
    if(!['repeatable read','serializable'].includes(String(context.isolation)))throw new CashierAuthorityCandidateInstallationError(['SNAPSHOT_CONTEXT']);
    transactionReadOnly=context.read_only==='on';
    const relation=(await client.query("SELECT c.oid::text AS oid,c.relkind,c.relrowsecurity,c.relforcerowsecurity,pg_get_userbyid(c.relowner) AS owner,pg_get_userbyid(n.nspowner) AS schema_owner,EXISTS(SELECT 1 FROM aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) a WHERE a.grantee=0) AS public_acl,EXISTS(SELECT 1 FROM aclexplode(coalesce(n.nspacl,acldefault('n',n.nspowner))) a WHERE a.grantee=0) AS public_schema_acl FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='drizzle' AND c.relname='__drizzle_migrations'")).rows[0];
    if(!relation||relation.relkind!=='r'||relation.relrowsecurity||relation.relforcerowsecurity||relation.owner!==identities.bootstrapRole||relation.schema_owner!==identities.bootstrapRole)throw new CashierAuthorityCandidateInstallationError(['JOURNAL_RELATION']);
    fail(!relation.public_acl&&!relation.public_schema_acl,'JOURNAL_PUBLIC_ACL');
    const columns=(await client.query("SELECT a.attname,format_type(a.atttypid,a.atttypmod) AS type,a.attnotnull,EXISTS(SELECT 1 FROM aclexplode(coalesce(a.attacl,ARRAY[]::aclitem[])) x WHERE x.grantee=0) AS public_acl FROM pg_attribute a WHERE a.attrelid=$1::oid AND a.attnum>0 AND NOT a.attisdropped ORDER BY a.attnum",[relation.oid])).rows;
    const expected=[['id','integer',true],['hash','text',true],['created_at','bigint',false]];
    fail(columns.length===3&&columns.every((c,i)=>c.attname===expected[i]?.[0]&&c.type===expected[i]?.[1]&&c.attnotnull===expected[i]?.[2]),'JOURNAL_COLUMNS');
    fail(columns.every(c=>!c.public_acl),'JOURNAL_PUBLIC_ACL');
    for(const role of [identities.primaryRole,identities.authenticationRole,identities.reviewerRole]){
      const acl=(await client.query("SELECT has_schema_privilege($1,'drizzle','USAGE,CREATE') AS schema_access,has_table_privilege($1,$2::oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,TRIGGER,REFERENCES') AS table_access,has_any_column_privilege($1,$2::oid,'SELECT,INSERT,UPDATE,REFERENCES') AS column_access",[role,relation.oid])).rows[0];
      fail(acl&&!acl.schema_access&&!acl.table_access&&!acl.column_access,'JOURNAL_CALLER_ACL');
    }
    if(issues.length)throw new CashierAuthorityCandidateInstallationError([...new Set(issues)]);
    const history=(await client.query('SELECT hash,created_at::text AS created_at FROM drizzle.__drizzle_migrations ORDER BY created_at,hash')).rows;
    issues.push(...validateCashierAuthorityCandidateHistory(history));
    if(issues.length)throw new CashierAuthorityCandidateInstallationError([...new Set(issues)]);
    try{await assertCashierStreamAuthorityCandidateReady(client,identities,{capabilityPhase:'withheld'});}
    catch{issues.push('WITHHELD_AUTHORITY_BOUNDARY');}
  } catch(error) {
    if(error instanceof CashierAuthorityCandidateInstallationError)throw error;
    issues.push('INSTALLATION_CATALOG_QUERY');
  }
  if(issues.length)throw new CashierAuthorityCandidateInstallationError([...new Set(issues)]);
  return {ok:true,candidateOnly:true,historyEntries:54,transactionReadOnly,capabilitiesWithheld:true,grantsAuthorized:false,operationalAdoption:false,releaseAccepted:false};
}
