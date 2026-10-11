import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { assertDisposablePostgres } from './lib/disposable-postgres-test-guard.mjs';
const suites = {
  cashier: ['cashier-subscription-postgres.integration.test.ts', 'cashier-billing-postgres.integration.test.ts', 'cashier-downgrade-grace-postgres.integration.test.ts', 'cashier-historical-operation-postgres.integration.test.ts', 'cashier-operator-logout-pin-postgres.integration.test.ts', 'cashier-operator-own-history-scope-postgres.integration.test.ts', 'catalog-cashier-compensation-history-postgres.integration.test.ts'],
  billing: ['saas-billing-negative-failure-cases.integration.test.mjs', 'saas-billing-authority.integration.test.ts', 'superqi-sandbox-billing.integration.test.ts', 'subscription-entitlement-postgres.integration.test.ts', 'merchant-customer-payment-authority-postgres.integration.test.ts'],
  tenant: ['production-postgres-rls-security.integration.test.ts', 'knowledge-tenant-rls.integration.test.mjs', 'merchant-management-tenant-rls.integration.test.mjs', 'subscription-reminder-rls.integration.test.mjs'],
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
function execute(args, env = process.env) {
  const result = spawnSync(process.execPath, args, { env, encoding: 'utf8', timeout: 240000, maxBuffer: 4 * 1024 * 1024 });
  process.stdout.write(result.stdout || '');
  process.stderr.write(result.stderr || '');
  return result;
}
const migration = execute(['lib/db/scripts/audit-disposable-migrate.mjs']);
if (migration.status !== 0) process.exit(1);
let failed = false;
for (const file of selected) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fawri-audit-suite-'));
  const result = execute(['--import', './scripts/lib/disposable-postgres-preload.mjs', '--import', 'tsx', '--test', '--test-reporter=tap', '--test-concurrency=1', '--test-timeout=180000', `artifacts/api-server/tests/${file}`], { ...process.env, FAWRI_DATA_DIR: dataDir });
  try { fs.rmSync(dataDir, { recursive: true, force: true }); }
  catch { failed = true; console.error("AUDIT_SUITE_DATA_CLEANUP_FAILURE"); }
  const summary = { suite: file, exit: result.status, passed: Number(result.stdout?.match(/^# pass (\d+)$/m)?.[1] || 0), failed: Number(result.stdout?.match(/^# fail (\d+)$/m)?.[1] || 0), skipped: Number(result.stdout?.match(/^# skipped (\d+)$/m)?.[1] || 0) };
  // CI cannot silently pass a suite that skipped its entire PostgreSQL proof.
  if (result.status !== 0 || summary.passed === 0 || summary.skipped !== 0) failed = true;
  console.log('AUDIT_SUITE_RESULT ' + JSON.stringify(summary));
}
process.exitCode = failed ? 1 : 0;
