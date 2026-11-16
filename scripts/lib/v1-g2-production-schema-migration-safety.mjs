/**
 * FAWRI V1 G2-B — read-only admission assertions for exact reviewed 54-stage
 * new first-commercial schema. No provider access, SQL, secrets or writes here.
 */
import {
  G2_RESERVATION_TARGET, parseG2OwnerUrl, assertG2Postimage,
} from './v1-g2-production-role-reservation-safety.mjs';

export const G2_SCHEMA_TARGET=Object.freeze({
  ...G2_RESERVATION_TARGET,
  commitMessage:'FAWRI_V1_OWNER_AUTHORIZED_G2_PINNED_SCHEMA_54',
  schemaStages:54,
  firstCommercialOnly:true,
});
const fail=code=>{const e=new Error(code);e.code=code;throw e;};

export function assertG2SchemaOptIn(env=process.env){
  if(env.GITHUB_ACTIONS!=='true' ||
     env.GITHUB_REPOSITORY!=='nora953/fawri-production-source' ||
     env.GITHUB_EVENT_NAME!=='push' ||
     env.GITHUB_ACTOR!=='nora953' ||
     env.GITHUB_REF!=='refs/heads/fix/p0-provider-receipt-order-discovery-20261015' ||
     env.FAWRI_V1_G2_SCHEMA_MIGRATION_ENABLED!=='1' ||
     env.FAWRI_V1_G2_SCHEMA_COMMIT_MESSAGE!==G2_SCHEMA_TARGET.commitMessage ||
     env.FAWRI_V1_G2_G1_OFFSITE_RECEIPT!=='G1-20261115-GDRIVE-READBACK-43712483648' ||
     env.FAWRI_V1_G2_RESERVATION_RECEIPT!=='G2A-20261115-NOLOGIN-43717035419'){
    fail('V1_G2_SCHEMA_NOT_AUTHORIZED');
  }
  return true;
}
export function assertG2SchemaOwnerUrl(value){
  return parseG2OwnerUrl(value);
}
export function assertG2SchemaPreimage(row,roles){
  if(!row ||
     row.db!==G2_SCHEMA_TARGET.database ||
     row.actor!==G2_SCHEMA_TARGET.owner ||
     row.active!==G2_SCHEMA_TARGET.owner ||
     Number(row.pg_major)!==18 ||
     Number(row.user_relations)!==0 ||
     Number(row.drizzle_ledger)!==0 ||
     row.owner_stats!==true ||
     row.owner_create_role!==true ||
     row.is_owner_superuser!==false){
    fail('V1_G2_SCHEMA_NOT_EMPTY_OR_WRONG_OWNER');
  }
  try {assertG2Postimage(roles);}
  catch {fail('V1_G2_SCHEMA_RESERVED_ROLE_DRIFT');}
  return true;
}
export function assertG2SchemaPostimage(row,roles){
  if(!row ||
     row.db!==G2_SCHEMA_TARGET.database ||
     row.actor!==G2_SCHEMA_TARGET.owner ||
     Number(row.pg_major)!==18 ||
     Number(row.migration_count)!==54 ||
     Number(row.public_tables)!==99 ||
     Number(row.rls_enabled_tables)!==79 ||
     Number(row.public_rls_policies)!==78 ||
     Number(row.merchant_rows)!==0 ||
     Number(row.account_rows)!==0 ||
     Number(row.order_rows)!==0 ||
     row.security_scope_function!==true ||
     row.auth_runtime_function!==true ||
     row.operator_directory_function!==true){
    fail('V1_G2_SCHEMA_POSTIMAGE_NOT_ACCEPTED');
  }
  try {assertG2Postimage(roles);}
  catch {fail('V1_G2_SCHEMA_NOLOGIN_ROLE_ESCALATION');}
  return true;
}
