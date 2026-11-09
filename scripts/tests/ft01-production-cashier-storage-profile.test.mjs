import assert from 'node:assert/strict';
import test from 'node:test';
import {buildFt01FirstCommercialInvokerReviewPlan} from '../lib/ft01-first-commercial-invoker-source-plan.mjs';
import {
  selectFt01CashierStorageProfile,
  FT01_CASHIER_STORAGE_PROFILE_ENV,
  FT01_INVOKER_0052_SHA_ENV,
  FT01_ROLE_RESERVATION_SHA_ENV,
  FT01_INVOKER_PROFILE,
  FT01_CANONICAL_PROFILE,
  FT01_PINNED_FIRST_COMMERCIAL_SOURCE,
} from '../../lib/db/scripts/lib/ft01-production-cashier-storage-profile.mjs';

const plan=buildFt01FirstCommercialInvokerReviewPlan();
const manifest=Object.freeze({
  intent:'first_commercial_launch',
  project_id:plan.target.project_id,
  target_branch_id:plan.target.branch_id,
  source_mode:'fresh_schema_migrations_only',
  source_branch_id:null,
  source_backup_id:null,
  data_import_requested:false,
  restore_requested:false,
});
test('bundled-runtime source pins match source-reviewed migration, four roles and Neon target',()=>{
 const pins=FT01_PINNED_FIRST_COMMERCIAL_SOURCE;
 assert.equal(Object.isFrozen(pins),true);
 assert.equal(pins.projectId,plan.target.project_id);
 assert.equal(pins.branchId,plan.target.branch_id);
 assert.equal(pins.database,plan.target.database_name);
 assert.equal(pins.postgresMajor,plan.target.postgres_major);
 assert.equal(pins.canonical0052Sha256,plan.canonical_0052_sha256);
 assert.equal(pins.variant0052Sha256,plan.reviewed_invoker_variant_0052_sha256);
 assert.equal(pins.fourRoleReservationSha256,plan.four_role_reservation_sql_sha256);
 assert.equal(plan.approved_to_execute,false);
 assert.equal(plan.production_startup_profile_adopted,false);
 assert.equal(plan.commercial_release_authorized,false);
});

const approvedEnv=()=>({
 [FT01_CASHIER_STORAGE_PROFILE_ENV]:FT01_INVOKER_PROFILE,
 [FT01_INVOKER_0052_SHA_ENV]:plan.reviewed_invoker_variant_0052_sha256,
 [FT01_ROLE_RESERVATION_SHA_ENV]:plan.four_role_reservation_sql_sha256,
 FAWRI_FIRST_COMMERCIAL_SOURCE_MANIFEST_JSON:JSON.stringify(manifest),
});
const denied=(env,reason)=>assert.throws(()=>selectFt01CashierStorageProfile(env),
  e=>e?.code==='FT01_CASHIER_PROFILE_NOT_APPROVED'&&e.reason===reason);

test('legacy profile untouched without opt-in',()=>{
 assert.deepEqual(selectFt01CashierStorageProfile({}),{mode:'canonical',explicitOptIn:false});
 assert.deepEqual(selectFt01CashierStorageProfile({
  [FT01_CASHIER_STORAGE_PROFILE_ENV]:FT01_CANONICAL_PROFILE,
 }),{mode:'canonical',explicitOptIn:false});
});
test('new profile is exact-source-pinned, explicit, and never release approval',()=>{
 const selected=selectFt01CashierStorageProfile(approvedEnv());
 assert.equal(selected.mode,'first-commercial-invoker');
 assert.equal(selected.exactCandidateSha256,plan.reviewed_invoker_variant_0052_sha256);
 assert.equal(selected.exactRoleReservationSha256,plan.four_role_reservation_sql_sha256);
 assert.equal(selected.migrationOwnerRole,'fawri_owner');
 assert.equal(selected.explicitOptIn,true);
 assert.equal(selected.hostedTargetAttested,false);
 assert.equal(selected.releaseAuthorized,false);
 assert.equal(Object.isFrozen(selected),true);
});
test('unknown/typo profiles cannot silently fall back to legacy',()=>{
 denied({[FT01_CASHIER_STORAGE_PROFILE_ENV]:'invoker'},'UNKNOWN_STORAGE_PROFILE');
 denied({[FT01_CASHIER_STORAGE_PROFILE_ENV]:'CANONICAL-OWNER-v1'},'UNKNOWN_STORAGE_PROFILE');
 denied({[FT01_CASHIER_STORAGE_PROFILE_ENV]:'0'},'UNKNOWN_STORAGE_PROFILE');
});
test('manifest must be fresh commercial schema-only and exact project + branch',()=>{
 const base=approvedEnv();
 denied({...base,FAWRI_FIRST_COMMERCIAL_SOURCE_MANIFEST_JSON:''},
  'FIRST_COMMERCIAL_SOURCE_MANIFEST_REQUIRED');
 denied({...base,FAWRI_FIRST_COMMERCIAL_SOURCE_MANIFEST_JSON:'{broken'},
  'FIRST_COMMERCIAL_SOURCE_NOT_VERIFIED');
 for(const change of [
  {source_branch_id:'br-shiny-lab-b1vxj4wn'},
  {source_backup_id:'old-staging'},
  {data_import_requested:true},
  {restore_requested:true},
  {project_id:'round-fire-18493605'},
  {target_branch_id:'br-young-hill-b1x9vhlz'},
 ])denied({...base,FAWRI_FIRST_COMMERCIAL_SOURCE_MANIFEST_JSON:JSON.stringify({
  ...manifest,...change})},'FIRST_COMMERCIAL_SOURCE_NOT_VERIFIED');
});
test('missing/forged variant or role digest cannot select invoker',()=>{
 const base=approvedEnv();
 for(const key of [FT01_INVOKER_0052_SHA_ENV,FT01_ROLE_RESERVATION_SHA_ENV]){
  denied({...base,[key]:''},'EXACT_VARIANT_AND_ROLE_SOURCE_HASHES_REQUIRED');
  denied({...base,[key]:'0'.repeat(64)},'EXACT_VARIANT_AND_ROLE_SOURCE_HASHES_REQUIRED');
  denied({...base,[key]:'BAD_HASH'},'EXACT_VARIANT_AND_ROLE_SOURCE_HASHES_REQUIRED');
 }
});
