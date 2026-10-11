import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { assertDisposablePostgres } from './lib/disposable-postgres-test-guard.mjs';
const suites = {
  bootstrap: ['global-merchant-auth-bootstrap-postgres.integration.test.mjs', 'global-merchant-golden-journey.integration.test.mjs'],
  http: ['global-merchant-postgres-http-journey.integration.test.ts'],
  deletion: ['merchant-deletion-tenant-rls.integration.test.mjs'],
  meta: ['meta-webhook-postgres-ingress-cutover.integration.test.ts'],
  'meta-rls': ['meta-page-directory-restricted-rls.integration.test.mjs'],
};
suites.priority = [...suites.bootstrap, ...suites.http, ...suites.deletion, ...suites.meta, ...suites['meta-rls']];
const selected = suites[process.argv[2]];
assert.ok(selected, 'unknown audit suite');
await assertDisposablePostgres();
function execute(args) {
  const result = spawnSync(process.execPath, args, { env: process.env, encoding: 'utf8', timeout: 240000, maxBuffer: 4 * 1024 * 1024 });
  process.stdout.write(result.stdout || '');
  process.stderr.write(result.stderr || '');
  return result;
}
const migration = execute(['lib/db/scripts/audit-disposable-migrate.mjs']);
if (migration.status !== 0) process.exit(1);
let failed = false;
for (const file of selected) {
  const result = execute(['--import', 'tsx', '--test', '--test-reporter=tap', '--test-concurrency=1', '--test-timeout=180000', `artifacts/api-server/tests/${file}`]);
  const summary = { suite: file, exit: result.status, passed: Number(result.stdout?.match(/^# pass (\d+)$/m)?.[1] || 0), failed: Number(result.stdout?.match(/^# fail (\d+)$/m)?.[1] || 0), skipped: Number(result.stdout?.match(/^# skipped (\d+)$/m)?.[1] || 0) };
  // CI cannot silently pass a suite that skipped its entire PostgreSQL proof.
  if (result.status !== 0 || summary.passed === 0 || summary.skipped !== 0) failed = true;
  console.log('AUDIT_SUITE_RESULT ' + JSON.stringify(summary));
}
process.exitCode = failed ? 1 : 0;
