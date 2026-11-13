import test from 'node:test';
import assert from 'node:assert/strict';
import {
  V1_FIRST_COMMERCIAL_WORKER_RLS_TABLES,
  selectProtectedRlsTablesForRuntime,
} from '../../artifacts/api-server/src/services/v1CommercialRlsSelection.ts';

const canonicalTables = Object.freeze([
  'background_jobs', 'background_job_payloads', 'products',
]);

test('historical canonical PG schema remains valid for legacy tests',()=>{
  const old=selectProtectedRlsTablesForRuntime(canonicalTables, {
    NODE_ENV:'production',
    FAWRI_EXPECTED_POSTGRES_RUNTIME_ROLE:'fawri_historical_test_runtime',
  });
  assert.deepEqual(old,[...canonicalTables]);
  assert.equal(old.includes('job_attempts'),false);
  assert.equal(old.includes('job_dead_letters'),false);
});

test('first-commercial true LOGIN always requires HELD worker attempt and dead-letter RLS',()=>{
  const selected=selectProtectedRlsTablesForRuntime(canonicalTables, {
    NODE_ENV:'production',
    FAWRI_EXPECTED_POSTGRES_RUNTIME_ROLE:'fawri_restricted_runtime',
  });
  for(const name of V1_FIRST_COMMERCIAL_WORKER_RLS_TABLES){
    assert.ok(selected.includes(name),'missing V1-only RLS gate: '+name);
    assert.ok(!canonicalTables.includes(name));
  }
  assert.equal(selected.length,canonicalTables.length+2);
});

test('V1 cannot bypass role-pinned worker RLS by overriding deployment mode',()=>{
  for(const mode of ['development','staging','production']){
    const list=selectProtectedRlsTablesForRuntime(canonicalTables, {
      FAWRI_DEPLOYMENT_MODE:mode,
      FAWRI_EXPECTED_POSTGRES_RUNTIME_ROLE:'fawri_restricted_runtime',
    });
    assert.ok(list.includes('job_attempts')&&list.includes('job_dead_letters'));
  }
});
