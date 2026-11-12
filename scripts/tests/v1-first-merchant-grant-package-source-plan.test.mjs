import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {buildV1FirstMerchantGrantSourcePlan}
  from '../lib/v1-first-merchant-grant-package-source-plan.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const readOriginal=relative=>fs.readFileSync(path.join(root,relative),'utf8');

test('source-only V1 grant selection pins three roles without cashier or old manual-case ACL',()=>{
  const plan=buildV1FirstMerchantGrantSourcePlan();
  assert.equal(plan.decision,'V1_THREE_ROLE_SOURCE_BUNDLE_REVIEWABLE_NOT_EXECUTABLE');
  assert.deepEqual(plan.target,{
    project_id:'crimson-cherry-65705041',
    branch_id:'br-holy-waterfall-b993zglb',
    database_name:'fawri',postgres_major:18,
  });
  assert.equal(plan.source_mode,'fresh_schema_migrations_only');
  assert.equal(plan.source_migrations_count,53);
  assert.deepEqual(plan.selected_grant_sources.map(x=>x.role),[
    'fawri_auth_issuer','fawri_restricted_runtime','fawri_operator_issuer']);
  assert.equal(plan.selected_grant_sources.length,3);
  assert.equal(plan.additional_held_sql_sources.length,4);
  assert.deepEqual(plan.additional_held_sql_sources.map(x=>x.purpose),[
    'META_AUTH_CREDENTIALS_AND_TENANT_PUBLIC_ROUTING',
    'META_INBOUND_CONVERSATIONS_OUTBOUND_QUEUED_REPLY_DELETE_ONLY',
    'META_JOB_HISTORY_TENANT_RLS_AND_DML',
    'POS_OFF_MERCHANT_RETENTION_GUARD',
  ]);
  assert.equal(plan.failclosed_revert_sources.length,2);
  assert.deepEqual(plan.failclosed_revert_sources.map(x=>x.purpose),[
    'STOP_WORKER_DML_PRESERVE_JOB_HISTORY',
    'RESTORE_ORIGINAL_TRIGGER_PRESERVE_FINANCIAL_HISTORY',
  ]);
  for(const p of [
    ...plan.additional_held_sql_sources,...plan.failclosed_revert_sources
  ]){
    assert.equal(p.status,'HELD_SOURCE_ONLY_NOT_APPROVED_FOR_HOSTED');
    assert.match(p.reviewed_git_blob_sha1,/^[0-9a-f]{40}$/);
  }

  assert.equal(plan.legacy_not_selected.length,2);
  for(const legacy of plan.legacy_not_selected) {
    assert.ok(legacy.includes('0052_')||legacy.includes('0053_'));
    assert.ok(!plan.selected_grant_sources.some(x=>x.source_path===legacy));
  }
  for(const flag of [
    'approved_to_execute','approved_to_deploy','p0_closed',
    'roles_provisioned','role_credentials_prepared',
    'full_v1_grant_coverage_verified','first_merchant_sql_http_verified',
    'independent_backup_restore_verified','hosted_migration_authorized',
    'hosted_role_creation_authorized','hosted_grant_execution_authorized',
    'commercial_release_authorized','data_import_allowed'
  ]) assert.equal(plan[flag],false,flag);
  assert.ok(Object.isFrozen(plan));
});

test('tampered auth/tenant/operator SQL must fail independently pinned grant selection',()=>{
  for(const rolePath of [
    'lib/db/first-commercial/held/v1_authentication_core_grants.sql',
    'lib/db/first-commercial/held/v1_tenant_online_commerce_grants.sql',
    'lib/db/first-commercial/held/v1_operator_receipt_review_grants.sql',
  ]){
    assert.throws(()=>buildV1FirstMerchantGrantSourcePlan({
      root,
      readFile:relative=>relative===rolePath?
        readOriginal(relative)+'\n-- simulated unaudited source edit\n':
        readOriginal(relative),
    }),/V1_HELD_GRANT_SOURCE_SHA_DRIFT/,rolePath);
  }
});

test('historical cashier source remains pinned evidence, never selects it for V1',()=>{
  const plan=buildV1FirstMerchantGrantSourcePlan();
  assert.ok(plan.legacy_not_selected.includes(
    'lib/db/first-commercial/held/0052_cashier_retirement_issuer_grants.sql'));
  assert.ok(plan.cashier_retirement_writer_may_remain_dormant_nologin);
  assert.ok(plan.reservation_sql_sha256);
  assert.ok(plan.reviewed_invoker_variant_0052_sha256);
});

test('changed Meta/POS additions and fail-closed revert sources never enter unpinned rollout',()=>{
  const original=buildV1FirstMerchantGrantSourcePlan();
  for(const item of [...original.additional_held_sql_sources,
    ...original.failclosed_revert_sources]){
    const isRevert=original.failclosed_revert_sources.some(
      x=>x.source_path===item.source_path);
    assert.throws(()=>buildV1FirstMerchantGrantSourcePlan({
      root,
      readFile:relative=>relative===item.source_path?
        readOriginal(relative)+'\n-- unaudited change\n':
        readOriginal(relative),
    }),isRevert?
      /V1_HELD_REVERT_SOURCE_SHA_DRIFT/:
      /V1_HELD_ADDITIVE_SOURCE_SHA_DRIFT/,item.source_path);
  }
});
