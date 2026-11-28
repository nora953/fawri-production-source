import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');

test('worker merchant discovery uses authenticated role, NOT broad tenant SELECT',()=>{
  const code=fs.readFileSync(path.join(root,
    'artifacts/api-server/src/services/postgresDurableJobQueue.ts'),'utf8');
  const start=code.indexOf('async function merchantIds(): Promise<string[]> {');
  const end=code.indexOf('export async function enqueueDurableJobAuthoritative',start);
  assert.ok(start>=0&&end>start,'V1_WORKER_MERCHANT_ENUM_FUNCTION_MISSING');
  const body=code.slice(start,end);
  assert.match(body,/import\(\s*["']\.\/authenticationPostgresAuthority["']\s*\)/);
  assert.match(body,/withAuthenticationTransaction\(async\s*\(client\)/);
  assert.match(body,/SELECT id FROM merchants ORDER BY id/);
  assert.doesNotMatch(body,/withOperationalTransaction\s*\(/);
  assert.doesNotMatch(body,/withMerchantOperationalTransaction\s*\(/);
  assert.doesNotMatch(body,/SELECT\s+\*/);
  const tenantGrants=fs.readFileSync(path.join(root,
    'lib/db/first-commercial/held/v1_tenant_online_commerce_grants.sql'),'utf8');
  assert.doesNotMatch(tenantGrants,/GRANT[\s\S]{0,180}SELECT[\s\S]{0,180}ON\s+public\.merchants\s+TO\s+fawri_restricted_runtime/i);
});
