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
