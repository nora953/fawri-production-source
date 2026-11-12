import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const load=p=>fs.readFileSync(path.join(root,p),'utf8');

test('Meta worker inserts all attempts and dead letters with merchant identity',()=>{
  const ts=load('artifacts/api-server/src/services/postgresDurableJobQueue.ts');
  assert.match(ts,/INSERT INTO job_attempts[\s\S]{0,180}\(id, job_id, merchant_id, attempt_number/);
  assert.match(ts,/INSERT INTO job_dead_letters[\s\S]{0,190}\(id, job_id, merchant_id, occurrence/);
  assert.match(ts,/UPDATE job_attempts[\s\S]{0,180}WHERE merchant_id = \$1 AND job_id = \$2/);
  assert.match(ts,/async function finishAttempt\([\s\S]{0,100}merchantId: string/);
  assert.match(ts,/withAuthenticationTransaction\(async \(client\)/);
});

test('HELD first-commercial SQL adds exact tenant FK+RLS not broad global grants',()=>{
  const sql=load('lib/db/first-commercial/held/v1_meta_worker_tenant_job_rls.sql');
  for(const relation of ['job_attempts','job_dead_letters']){
    assert.ok(sql.includes('ALTER TABLE public.'+relation+' ADD COLUMN merchant_id text;'));
    assert.ok(sql.includes('ALTER TABLE public.'+relation+' ALTER COLUMN merchant_id SET NOT NULL;'));
    assert.ok(sql.includes('ALTER TABLE public.'+relation+' ENABLE ROW LEVEL SECURITY;'));
    assert.match(sql,new RegExp('CREATE POLICY v1_'+relation+'_tenant_boundary ON public\\.'+relation));
  }
  assert.match(sql,/FOREIGN KEY \(job_id,merchant_id\)/);
  assert.match(sql,/V1_META_JOB_UNOWNED_HISTORY_REQUIRES_REVIEW/);
  assert.doesNotMatch(sql,/GRANT[\s\S]{0,150}ALL PRIVILEGES/i);
  assert.doesNotMatch(sql,/GRANT SELECT ON public\.merchants\s+TO fawri_restricted_runtime/i);
  assert.doesNotMatch(sql,/DELETE FROM public\.job_(attempts|dead_letters)/i);
});

test('canonical Drizzle jobs.ts remains unchanged pending HELD additive migration approval',()=>{
  // No edits to accepted migration snapshots or historical canonical schema
  // merely to make first-commercial held PostgreSQL18 tests pass.
  const original=load('lib/db/src/schema/jobs.ts');
  assert.ok(original.includes('export const jobAttempts = pgTable('));
  assert.ok(original.includes('export const jobDeadLetters = pgTable('));
  const attempts=original.slice(original.indexOf('export const jobAttempts = pgTable('),
    original.indexOf('export const jobDeadLetters = pgTable('));
  assert.doesNotMatch(attempts,/merchantId: text\\("merchant_id"\\)/,
    'V1_META_HISTORIC_SCHEMA_UNAUTHORIZED_CHANGE');
  const dead=original.slice(original.indexOf('export const jobDeadLetters = pgTable('));
  assert.doesNotMatch(dead,/merchantId: text\\("merchant_id"\\)/,
    'V1_META_HISTORIC_SCHEMA_UNAUTHORIZED_CHANGE');
  // Role admission prelistener and held candidate SQL are the *new*
  // commercial gate; accepted 0000..0052 canonical reproduction stays exact.
});

test('V1 role-pinned production prelistener requires worker RLS without changing historical canonical inventory',()=>{
  const ts=load('artifacts/api-server/src/services/postgresRuntimeRlsSecurity.ts');
  const start=ts.indexOf('export const PRODUCTION_TENANT_RLS_TABLES = [');
  const end=ts.indexOf('] as const;',start);
  assert.ok(start>=0&&end>start);
  const base=ts.slice(start,end);
  assert.ok(base.includes('"background_jobs"'));
  assert.ok(base.includes('"background_job_payloads"'));
  for(const table of ['job_attempts','job_dead_letters']){
    assert.ok(!base.includes('"'+table+'"'),
      'HISTORIC_RLS_INVENTORY_MUST_PRESERVE_ACCEPTED_SCHEMA_'+table);
    assert.ok(ts.includes('"'+table+'"'),'V1_EXTRA_RLS_MUST_INCLUDE_'+table);
  }
  assert.match(ts,/export function protectedRlsTablesForRuntime\(/);
  assert.match(ts,/FAWRI_EXPECTED_POSTGRES_RUNTIME_ROLE/);
  assert.match(ts,/protectedRlsTablesForRuntime\(env\)/);
  assert.match(ts,/Array\.from\(protectedTables\)/);
});
