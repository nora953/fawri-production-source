/**
 * FAWRI G2-C: strict, pure production LOGIN admission contract.
 * This file does not access Neon, SQL, secrets, or external services.
 */
import {assertG2SchemaPostimage, assertG2SchemaOwnerUrl} from './v1-g2-production-schema-migration-safety.mjs';

export const G2C_ROLES=Object.freeze([
  'fawri_restricted_runtime','fawri_auth_issuer','fawri_operator_issuer'
]);
export const G2C_DORMANT='fawri_cashier_retirement_writer';
export const G2C_COMMIT='FAWRI_V1_OWNER_AUTHORIZED_G2_THREE_LOGIN_GRANTS';
const fail=code=>{const e=new Error(code);e.code=code;throw e;};

export function assertG2COptIn(env=process.env){
  if(env.GITHUB_ACTIONS!=='true' ||
    env.GITHUB_REPOSITORY!=='nora953/fawri-production-source' ||
    env.GITHUB_EVENT_NAME!=='push' ||
    env.GITHUB_ACTOR!=='nora953' ||
    env.GITHUB_REF!=='refs/heads/fix/p0-provider-receipt-order-discovery-20261015' ||
    env.FAWRI_V1_G2_ROLE_ADMISSION_ENABLED!=='1' ||
    env.FAWRI_V1_G2_ROLE_COMMIT_MESSAGE!==G2C_COMMIT ||
    env.FAWRI_V1_G2_G1_RECEIPT!=='G1-20261115-GDRIVE-READBACK-43712483648' ||
    env.FAWRI_V1_G2_G2A_RECEIPT!=='G2A-20261115-NOLOGIN-43717035419' ||
    env.FAWRI_V1_G2_G2B_RECEIPT!=='G2B-20261116-SCHEMA54-43852308674'){
    fail('V1_G2C_NOT_OWNER_AUTHORIZED');
  }
  return true;
}
export function assertG2COwnerUrl(value){
  return assertG2SchemaOwnerUrl(value);
}
function validatePassword(value){
  // Must be separately generated in a password manager. At least 48
  // mixed-case/digit characters; no punctuation that can affect SQL literals.
  if(typeof value!=='string' || !/^[A-Za-z0-9_-]{48,96}$/.test(value) ||
     !/[A-Z]/.test(value) || !/[a-z]/.test(value) || !/[0-9]/.test(value)){
    fail('V1_G2C_INVALID_CREDENTIAL_FORMAT');
  }
  return value;
}
export function assertG2CCredentials(env=process.env){
  const values=[
    validatePassword(env.FAWRI_V1_G2_TENANT_LOGIN_PASSWORD),
    validatePassword(env.FAWRI_V1_G2_AUTH_LOGIN_PASSWORD),
    validatePassword(env.FAWRI_V1_G2_OPERATOR_LOGIN_PASSWORD),
  ];
  if(new Set(values).size!==3)fail('V1_G2C_CREDENTIAL_REUSE_DENIED');
  return Object.fromEntries(G2C_ROLES.map((name,i)=>[name,values[i]]));
}
export function assertG2CPreimage(row,roles){
  try{assertG2SchemaPostimage(row,roles);}
  catch{fail('V1_G2C_SCHEMA_OR_ROLE_PREIMAGE_DRIFT');}
  return true;
}
export function assertG2CRoles(rows){
  const expected=new Set([...G2C_ROLES,G2C_DORMANT]);
  if(!Array.isArray(rows)||rows.length!==4 ||
     rows.some(r=>!expected.delete(r.name) ||
       r.can_login!==(r.name!==G2C_DORMANT) ||
       r.inherit!==false || r.superuser!==false || r.bypass_rls!==false ||
       r.can_create_roles!==false || r.can_create_db!==false ||
       r.replication!==false || Number(r.outgoing_membership)!==0 ||
       Number(r.inbound_creator_only)!==1 || Number(r.inbound_count)!==1 ||
       r.public_create!==false) || expected.size!==0){
    fail('V1_G2C_ROLE_ESCALATION_OR_MISSING_LOGIN');
  }
  return true;
}
export function assertG2CProfiles(rows){
  const expected=new Set(G2C_ROLES);
  if(!Array.isArray(rows)||rows.length!==3 ||
     rows.some(r=>!expected.delete(r.role_name) ||
       r.observed_database_name!=='fawri' ||
       Number(r.observed_postgres_major)!==18 ||
       r.role_exists!==true || r.can_login!==true ||
       r.preliminary_role_profile_pass!==true) || expected.size!==0){
    fail('V1_G2C_HELD_ROLE_PROFILE_UNSAFE');
  }
  return true;
}
