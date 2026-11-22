/** Exact commercial PG18 owner1, worker-RLS, post-six-G4 schema encrypted backup.
 * One-shot owner GitHub commit, read-only hosted export, detached PG18 restore.
 * Never log credentials, unhashed phone, owner password, account hash or plaintext dump.
 */
export const POSTG4_TARGET=Object.freeze({
 project_id:'crimson-cherry-65705041',
 branch_id:'br-holy-waterfall-b993zglb',
 database:'fawri',
 endpoint_host:'ep-polished-poetry-b9jpvn4r.c-7.eu-central-1.aws.neon.tech',
 owner_login:'fawri_owner',
});
export const POSTG4_COMMIT='FAWRI_V1_OWNER_AUTHORIZED_POSTG4_ENCRYPTED_BACKUP';
const fail=code=>{const e=new Error(code);e.code=code;throw e;};
export function assertPostG4OptIn(env=process.env){
 if(env.GITHUB_ACTIONS!=='true' ||
   env.GITHUB_REPOSITORY!=='nora953/fawri-production-source' ||
   env.GITHUB_REF!=='refs/heads/fix/p0-provider-receipt-order-discovery-20261015' ||
   env.GITHUB_EVENT_NAME!=='push' ||
   env.GITHUB_ACTOR!=='nora953' ||
   env.FAWRI_V1_POSTG4_BACKUP_COMMIT!==POSTG4_COMMIT ||
   env.FAWRI_V1_POSTG4_BACKUP_ENABLED!=='1' ||
   env.FAWRI_V1_G2B_ACCEPTANCE!=='G2B-20261116-SCHEMA54-43852308674' ||
   env.FAWRI_V1_G2C_ACCEPTANCE!=='G2C-20261116-THREE-LOGIN-43917539519'){
   fail('V1_POSTG4_NOT_OWNER_AUTHORIZED');
 }
 return true;
}
export function validatePostG4Url(value,env=process.env){
 assertPostG4OptIn(env);
 let url;
 try{url=new URL(value??'');}
 catch{fail('V1_POSTG4_OWNER_URL_REQUIRED');}
 if(!['postgres:','postgresql:'].includes(url.protocol) ||
   url.hostname!==POSTG4_TARGET.endpoint_host ||
   !['','5432'].includes(url.port) ||
   decodeURIComponent(url.username)!==POSTG4_TARGET.owner_login ||
   decodeURIComponent(url.pathname)!=='/'+POSTG4_TARGET.database ||
   !url.password || url.hash){
   fail('V1_POSTG4_OWNER_TARGET_DENIED');
 }
 const options=[...url.searchParams.keys()];
 if(options.length!==new Set(options).size ||
   !options.includes('sslmode') ||
   options.some(key=>!['sslmode','channel_binding'].includes(key)) ||
   !['require','verify-full'].includes(url.searchParams.get('sslmode')) ||
   (url.searchParams.has('channel_binding') &&
     url.searchParams.get('channel_binding')!=='require')){
   fail('V1_POSTG4_TLS_MUST_BE_REQUIRED');
 }
 return Object.freeze({
  host:url.hostname,port:Number(url.port||5432),
  user:POSTG4_TARGET.owner_login,
  database:POSTG4_TARGET.database,
  password:decodeURIComponent(url.password),
 });
}
export function assertPostG4Catalog(row,{restored=false}={}){
 const failCode=restored?'V1_POSTG4_RESTORE_CATALOG_MISMATCH':'V1_POSTG4_HOSTED_CATALOG_DRIFT';
 if(!row ||
    row.db!==(restored?'fawri_ci':POSTG4_TARGET.database) ||
    row.actor!==(restored?'fawri_ci':POSTG4_TARGET.owner_login) ||
    Number(row.major)!==18 ||
    Number(row.migrations)!==54 ||
    Number(row.public_tables)!==102 ||
    Number(row.rls_tables)!==84 ||
    Number(row.rls_policies)!==83 ||
    Number(row.merchants)!==0 || Number(row.orders)!==0 ||
    Number(row.accounts)!==1 || Number(row.owners)!==1 ||
    Number(row.usable_owners)!==1 ||
    Number(row.jobs)!==0 || Number(row.job_attempts)!==0 ||
    Number(row.dead_letters)!==0 ||
    Number(row.cashier_streams)!==0 || Number(row.cashier_receipts)!==0 ||
    row.v1_delete_trigger!==true || row.v1_pos_guard_installed!==true ||
    Number(row.worker_rls_tables)!==2 || Number(row.worker_tenant_columns)!==2 ||
    Number(row.google_account_columns)!==5 ||
    Number(row.google_consent_columns)!==3 ||
    Number(row.whatsapp_receipt_columns)!==2 ||
    Number(row.google_rls_authority_tables)!==3 ||
    Number(row.google_immutable_triggers)!==2 ||
    Number(row.google_unique_indexes)!==3 ||
    Number(row.google_challenges)!==0 ||
    Number(row.trial_claims)!==0 ||
    Number(row.trial_evidence)!==0 ||
    (!restored && (Number(row.safe_login_roles)!==3 || row.dormant_cashier_role!==true))){
    const error=new Error(failCode);error.code=failCode;throw error;
 }
 return true;
}
