/**
 * FAWRI V1 pre-POS-off POSTSCHEMA backup of approved PG18 commercial Neon.
 * Read-only backup/export, NOT a rollback authorization or production write.
 */
export const POSTSCHEMA_TARGET=Object.freeze({
 project_id:'crimson-cherry-65705041',
 branch_id:'br-holy-waterfall-b993zglb',
 database:'fawri',
 endpoint_host:'ep-polished-poetry-b9jpvn4r.c-7.eu-central-1.aws.neon.tech',
 owner_login:'fawri_owner',
});
export const POSTSCHEMA_COMMIT='FAWRI_V1_OWNER_AUTHORIZED_POSTSCHEMA_ENCRYPTED_EXPORT';
const fail=code=>{const e=new Error(code);e.code=code;throw e;};
export function assertPostSchemaOptIn(env=process.env){
 if(env.GITHUB_ACTIONS!=='true' ||
   env.GITHUB_REPOSITORY!=='nora953/fawri-production-source' ||
   env.GITHUB_REF!=='refs/heads/fix/p0-provider-receipt-order-discovery-20261015' ||
   env.GITHUB_EVENT_NAME!=='push' ||
   env.GITHUB_ACTOR!=='nora953' ||
   env.FAWRI_V1_POSTSCHEMA_BACKUP_ENABLED!=='1' ||
   env.FAWRI_V1_POSTSCHEMA_BACKUP_COMMIT!==POSTSCHEMA_COMMIT ||
   env.FAWRI_V1_G2B_ACCEPTANCE!=='G2B-20261116-SCHEMA54-43852308674' ||
   env.FAWRI_V1_G2C_ACCEPTANCE!=='G2C-20261116-THREE-LOGIN-43917539519'){
   fail('V1_POSTSCHEMA_NOT_OWNER_AUTHORIZED');
 }
 return true;
}
export function validatePostSchemaUrl(value,env=process.env){
 assertPostSchemaOptIn(env);
 let url;
 try{url=new URL(value??'');}
 catch{fail('V1_POSTSCHEMA_OWNER_URL_REQUIRED');}
 if(!['postgres:','postgresql:'].includes(url.protocol) ||
   url.hostname!==POSTSCHEMA_TARGET.endpoint_host ||
   !['','5432'].includes(url.port) ||
   decodeURIComponent(url.username)!==POSTSCHEMA_TARGET.owner_login ||
   decodeURIComponent(url.pathname)!=='/'+POSTSCHEMA_TARGET.database ||
   !url.password || url.hash){
   fail('V1_POSTSCHEMA_OWNER_TARGET_DENIED');
 }
 const options=[...url.searchParams.keys()];
 if(options.length!==new Set(options).size ||
   !options.includes('sslmode') ||
   options.some(key=>!['sslmode','channel_binding'].includes(key)) ||
   !['require','verify-full'].includes(url.searchParams.get('sslmode')) ||
   (url.searchParams.has('channel_binding') &&
     url.searchParams.get('channel_binding')!=='require')){
   fail('V1_POSTSCHEMA_TLS_MUST_BE_REQUIRED');
 }
 return Object.freeze({
  host:url.hostname,port:Number(url.port||5432),
  user:POSTSCHEMA_TARGET.owner_login,
  database:POSTSCHEMA_TARGET.database,
  password:decodeURIComponent(url.password),
 });
}
export function assertPostSchemaCatalog(row,{restored=false}={}){
 if(!row ||
   row.db!==(restored?'fawri_ci':POSTSCHEMA_TARGET.database) ||
   row.actor!==(restored?'fawri_ci':POSTSCHEMA_TARGET.owner_login) ||
   Number(row.major)!==18 ||
   Number(row.migrations)!==54 ||
   Number(row.public_tables)!==99 ||
   Number(row.rls_tables)!==79 ||
   Number(row.rls_policies)!==78 ||
   Number(row.merchants)!==0 || Number(row.accounts)!==0 ||
   Number(row.orders)!==0 || Number(row.cashier_streams)!==0 ||
   Number(row.cashier_receipts)!==0 ||
   row.legacy_delete_trigger!==true ||
   row.v1_pos_guard_installed!==false ||
   (!restored &&
     (Number(row.safe_login_roles)!==3 ||
       row.dormant_cashier_role!==true))){
   fail(restored?'V1_POSTSCHEMA_RESTORE_CATALOG_MISMATCH':
     'V1_POSTSCHEMA_HOSTED_CATALOG_DRIFT');
 }
 return true;
}
