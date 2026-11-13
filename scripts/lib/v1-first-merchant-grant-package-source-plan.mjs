/**
 * V1 first-merchant grant SOURCE selection and pinning. NEVER a deploy runner.
 * The historical FT01 candidate proves 53-stage migration lineage and may
 * reference cashier-retirement code. This V1 selector MUST exclude its
 * cashier-specific auth grants and any legacy operator overlap from new
 * first-merchant role provisioning, without altering migration bytes.
 *
 * No PostgreSQL, Neon, credentials, hosted mutation, source writes or GO.
 */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {buildFt01FirstCommercialInvokerReviewPlan}
  from './ft01-first-commercial-invoker-source-plan.mjs';

const rootDefault=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const HELD_GRANTS=Object.freeze({
  authentication:Object.freeze({
    path:'lib/db/first-commercial/held/v1_authentication_core_grants.sql',
    blob:'fe314f951f3836009a18a505ae1547572a270f28',
    role:'fawri_auth_issuer',
  }),
  tenant:Object.freeze({
    path:'lib/db/first-commercial/held/v1_tenant_online_commerce_grants.sql',
    blob:'92241fad25b601abcba5b98abe860c0dee7f8317',
    role:'fawri_restricted_runtime',
  }),
  operator:Object.freeze({
    path:'lib/db/first-commercial/held/v1_operator_receipt_review_grants.sql',
    blob:'22445192803ea7043d30ffb87c4ee355c0497566',
    role:'fawri_operator_issuer',
  }),
});
// Exact later V1 first-merchant HELD additions, applied only after an
// approved 54-stage migration and the three independent minimal LOGIN grants.
// These are never interpreted as permission to run SQL on a hosted database.
const HELD_ADDITIVE=Object.freeze([
  Object.freeze({
    path:'lib/db/first-commercial/held/v1_meta_channel_onboarding_grants.sql',
    blob:'6d87f7e87ff2e7210b4929a4ba9572bc5a1e5b41',
    purpose:'META_AUTH_CREDENTIALS_AND_TENANT_PUBLIC_ROUTING',
  }),
  Object.freeze({
    path:'lib/db/first-commercial/held/v1_meta_inbound_conversation_grants.sql',
    blob:'9d2822c7b4c9323b2bd34be92e65990d6ddef594',
    purpose:'META_INBOUND_CONVERSATIONS_OUTBOUND_QUEUED_REPLY_DELETE_ONLY',
  }),
  Object.freeze({
    path:'lib/db/first-commercial/held/v1_auto_reply_bounded_financial_writer.sql',
    blob:'9d03a49ad5d3719f485e2d63a25794204c4478a5',
    purpose:'META_REPLY_ISSUER_SCOPED_ATOMIC_DEBIT_REFUND_NO_DIRECT_DML',
  }),
  Object.freeze({
    path:'lib/db/first-commercial/held/v1_meta_worker_tenant_job_rls.sql',
    blob:'a56842ad262c3a83ed41dd24109d241eb4fb6861',
    purpose:'META_JOB_HISTORY_TENANT_RLS_AND_DML',
  }),
  Object.freeze({
    path:'lib/db/first-commercial/held/v1_pos_off_merchant_deletion_guard.sql',
    blob:'bd08142e26547aeaa78850c8aa9644ec7495f217',
    purpose:'POS_OFF_MERCHANT_RETENTION_GUARD',
  }),
]);
const HELD_FAIL_CLOSED_REVERTS=Object.freeze([
  Object.freeze({
    path:'lib/db/first-commercial/held/v1_meta_worker_tenant_job_rls_failclosed_revert.sql',
    blob:'3e27c9efb75803676db083acd4e1e4e7eb5deee0',
    purpose:'STOP_WORKER_DML_PRESERVE_JOB_HISTORY',
  }),
  Object.freeze({
    path:'lib/db/first-commercial/held/v1_pos_off_merchant_deletion_guard_revert.sql',
    blob:'f6a98b30cb053c13b5321283b8d63d8929f38f0e',
    purpose:'RESTORE_ORIGINAL_TRIGGER_PRESERVE_FINANCIAL_HISTORY',
  }),
]);
const LEGACY_HELD=[
  'lib/db/first-commercial/held/0052_cashier_retirement_issuer_grants.sql',
  'lib/db/first-commercial/held/0053_receipt_manual_case_operator_grants.sql',
];
function reject(code){const error=new Error(code);error.code=code;throw error;}
function gitBlob(s){
  return createHash('sha1').update('blob '+Buffer.byteLength(s)+'\0'+s).digest('hex');
}
function sqlGrantStatements(sql){
  const withoutComments=sql.replace(/^\s*--.*$/gm,'');
  return [...withoutComments.matchAll(/\bGRANT\b[\s\S]*?;/gi)].map(m=>m[0]);
}
export function buildV1FirstMerchantGrantSourcePlan({
  root=rootDefault,
  readFile=relative=>fs.readFileSync(path.join(root,relative),'utf8'),
}={}){
  const source=buildFt01FirstCommercialInvokerReviewPlan({root,readFile});
  assert.equal(source.source_migrations_count,53);
  assert.equal(source.source_mode,'fresh_schema_migrations_only');
  assert.equal(source.approved_to_execute,false);
  assert.equal(source.target.project_id,'crimson-cherry-65705041');
  assert.equal(source.target.branch_id,'br-holy-waterfall-b993zglb');
  assert.equal(source.target.database_name,'fawri');
  assert.equal(source.target.postgres_major,18);
  const selected=[];
  for(const entry of Object.values(HELD_GRANTS)){
    const sql=readFile(entry.path);
    if(typeof sql!=='string'||gitBlob(sql)!==entry.blob)
      reject('V1_HELD_GRANT_SOURCE_SHA_DRIFT');
    const statements=sqlGrantStatements(sql);
    if(!statements.length)reject('V1_HELD_GRANT_NO_EXPLICIT_ACL');
    for(const statement of statements) {
      if(/\bfawri_cashier_retirement_writer\b|\bpublic\.cashier_[a-z_]+\b/i.test(statement))
        reject('V1_CASHIER_GRANT_PROHIBITED');
      if(/\b(?:ALL\s+PRIVILEGES|GRANT\s+ALL\s+ON)\b/i.test(statement))
        reject('V1_GRANT_ALL_FORBIDDEN');
    }
    selected.push(Object.freeze({
      role:entry.role,source_path:entry.path,reviewed_git_blob_sha1:entry.blob,
      status:'HELD_SOURCE_ONLY_NOT_APPROVED_FOR_HOSTED',
    }));
  }
  const uniqueRoles=new Set(selected.map(item=>item.role));
  if(uniqueRoles.size!==3)reject('V1_INDEPENDENT_ROLE_SET_MISSING');
  const stagePinned=(entries,errorCode)=>Object.freeze(entries.map(entry=>{
    const bytes=readFile(entry.path);
    if(typeof bytes!=='string'||gitBlob(bytes)!==entry.blob)
      reject(errorCode);
    if(/\bGRANT\s+ALL\s+(?:PRIVILEGES\s+)?ON\b/i.test(
      bytes.replace(/^\s*--.*$/gm,'')))
      reject('V1_STAGE_GRANT_ALL_FORBIDDEN');
    return Object.freeze({
      source_path:entry.path,
      reviewed_git_blob_sha1:entry.blob,
      purpose:entry.purpose,
      status:'HELD_SOURCE_ONLY_NOT_APPROVED_FOR_HOSTED',
    });
  }));
  const additions=stagePinned(HELD_ADDITIVE,'V1_HELD_ADDITIVE_SOURCE_SHA_DRIFT');
  const failClosedReverts=stagePinned(
    HELD_FAIL_CLOSED_REVERTS,'V1_HELD_REVERT_SOURCE_SHA_DRIFT');
  const selectedPaths=new Set(selected.map(x=>x.source_path));
  if(LEGACY_HELD.some(x=>selectedPaths.has(x)))
    reject('V1_LEGACY_CASHIER_OR_DUPLICATE_OPERATOR_GRANTS_FORBIDDEN');

  return Object.freeze({
    decision:'V1_THREE_ROLE_SOURCE_BUNDLE_REVIEWABLE_NOT_EXECUTABLE',
    target:Object.freeze({...source.target}),
    source_mode:source.source_mode,
    source_migrations_count:source.source_migrations_count,
    canonical_0052_sha256:source.canonical_0052_sha256,
    reviewed_invoker_variant_0052_sha256:source.reviewed_invoker_variant_0052_sha256,
    pinned_held_journal_sha256:source.reviewed_held_journal_sha256,
    reservation_sql_sha256:source.four_role_reservation_sql_sha256,
    selected_grant_sources:Object.freeze(selected),
    // Exact ordered stage references, not a deploy script or greenlight.
    additional_held_sql_sources:additions,
    failclosed_revert_sources:failClosedReverts,

    legacy_not_selected:Object.freeze([...LEGACY_HELD]),
    cashier_retirement_writer_may_remain_dormant_nologin:true,
    data_import_allowed:false,
    roles_provisioned:false,
    role_credentials_prepared:false,
    full_v1_grant_coverage_verified:false,
    first_merchant_sql_http_verified:false,
    independent_backup_restore_verified:false,
    hosted_migration_authorized:false,
    hosted_role_creation_authorized:false,
    hosted_grant_execution_authorized:false,
    approved_to_execute:false,
    approved_to_deploy:false,
    p0_closed:false,
    commercial_release_authorized:false,
  });
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  assert.equal(process.argv.length,2,'V1_GRANT_SOURCE_PLAN_NO_ARGS');
  process.stdout.write(JSON.stringify(buildV1FirstMerchantGrantSourcePlan(),null,2)+'\n');
}
