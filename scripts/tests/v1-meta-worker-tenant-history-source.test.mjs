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

test('Drizzle table schema retains merchant-bound foreign keys and RLS',()=>{
  const ts=load('lib/db/src/schema/jobs.ts');
  for(const name of ['jobAttempts','jobDeadLetters']){
    const start=ts.indexOf('export const '+name+' = pgTable(');
    assert.ok(start>=0);
    const end=ts.indexOf(').enableRLS();',start);
    assert.ok(end>start, name+' missing enabled RLS');
    const declaration=ts.slice(start,end);
    assert.match(declaration,/merchantId: text\("merchant_id"\)\.notNull\(\)/);
    assert.match(declaration,/columns: \[table\.jobId, table\.merchantId\]/);
  }
});
