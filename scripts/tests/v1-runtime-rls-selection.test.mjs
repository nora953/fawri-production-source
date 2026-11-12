import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PRODUCTION_PROTECTED_RLS_TABLES,
  V1_FIRST_COMMERCIAL_WORKER_RLS_TABLES,
  protectedRlsTablesForRuntime,
} from '../../artifacts/api-server/src/services/postgresRuntimeRlsSecurity.ts';

test('historical canonical PG schema remains valid for legacy tests',()=>{
  const old=protectedRlsTablesForRuntime({
    NODE_ENV:'production',
    FAWRI_EXPECTED_POSTGRES_RUNTIME_ROLE:'fawri_historical_test_runtime',
  });
  assert.deepEqual(old,[...PRODUCTION_PROTECTED_RLS_TABLES]);
  assert.equal(old.includes('job_attempts'),false);
  assert.equal(old.includes('job_dead_letters'),false);
});

test('first-commercial true LOGIN always requires HELD worker attempt and dead-letter RLS',()=>{
  const selected=protectedRlsTablesForRuntime({
    NODE_ENV:'production',
    FAWRI_EXPECTED_POSTGRES_RUNTIME_ROLE:'fawri_restricted_runtime',
  });
  for(const name of V1_FIRST_COMMERCIAL_WORKER_RLS_TABLES){
    assert.ok(selected.includes(name),'missing V1-only RLS gate: '+name);
    assert.ok(!PRODUCTION_PROTECTED_RLS_TABLES.includes(name));
  }
  assert.equal(selected.length,PRODUCTION_PROTECTED_RLS_TABLES.length+2);
});

test('V1 cannot bypass role-pinned worker RLS by overriding deployment mode',()=>{
  for(const mode of ['development','staging','production']){
    const list=protectedRlsTablesForRuntime({
      FAWRI_DEPLOYMENT_MODE:mode,
      FAWRI_EXPECTED_POSTGRES_RUNTIME_ROLE:'fawri_restricted_runtime',
    });
    assert.ok(list.includes('job_attempts')&&list.includes('job_dead_letters'));
  }
});
