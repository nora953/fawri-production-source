import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { assertDisposablePostgres } from './lib/disposable-postgres-test-guard.mjs';
const suites = {
  "subscription-golden": ["subscription-entitlement-postgres.integration.test.ts", "subscription-http-postgres-golden-journey.integration.test.ts"],
  "online-routing": ["merchant-customer-payment-authority-postgres.integration.test.ts"],
  "cashier-operational": ["cashier-operational-cutoff-postgres.integration.test.ts", "catalog-cashier-compensation-history-postgres.integration.test.ts", "cashier-operator-logout-pin-postgres.integration.test.ts", "cashier-operator-own-history-scope-postgres.integration.test.ts"],
  'knowledge-rls': ['knowledge-tenant-rls.integration.test.mjs', 'knowledge-management-postgres-cutover.integration.test.ts', 'knowledge-postgres-lifecycle.integration.test.ts'],
  management: ['merchant-management-tenant-rls.integration.test.mjs'],
  'audit-boundary': ['tenant-transaction-scope-postgres.integration.test.mjs', 'authentication-operator-pool-postgres.integration.test.mjs', 'cashier-credential-housekeeping-postgres.integration.test.mjs', 'cashier-manager-pin-persistence-postgres.integration.test.mjs', 'cashier-permission-session-authority-postgres.integration.test.mjs', 'cashier-staff-lock-boundary-postgres.integration.test.mjs', 'cashier-identity-tenant-rls-postgres.integration.test.mjs', 'admin-audit-boundary-postgres.integration.test.mjs'],
  'full-restore': ['full-schema-restore-postgres.integration.test.mjs'],
  cashier: ['cashier-operator-profit-http-postgres.integration.test.mjs', 'cashier-historical-compensation-http-postgres.integration.test.mjs', 'cashier-closed-shift-recovery-http-postgres.integration.test.mjs', 'cashier-sync-multidevice-postgres.integration.test.mjs', 'cashier-billing-negative-failure-cases.integration.test.mjs', 'cashier-full-lifecycle-postgres.integration.test.ts', 'cashier-subscription-postgres.integration.test.ts', 'cashier-billing-postgres.integration.test.ts', 'cashier-downgrade-grace-postgres.integration.test.ts', 'cashier-historical-operation-postgres.integration.test.ts', 'cashier-operator-logout-pin-postgres.integration.test.ts', 'cashier-operator-own-history-scope-postgres.integration.test.ts', 'catalog-cashier-compensation-history-postgres.integration.test.ts'],
  billing: ['merchant-billing-context-postgres.integration.test.mjs', 'receipt-operator-pool-postgres.integration.test.mjs', 'receipt-review-operator-pool-postgres.integration.test.mjs', 'receipt-execution-operator-pool-postgres.integration.test.mjs', 'receipt-resolver-inflight-phantom-postgres.integration.test.mjs', 'receipt-cross-authority-phantom-postgres.integration.test.mjs', 'billing-provider-discovery-restricted-postgres.integration.test.mjs', 'postgres-autocommit-response-proxy.unit.test.mjs', 'verified-inbox-wire-recovery-postgres.integration.test.mjs', 'operator-replay-wire-recovery-postgres.integration.test.mjs', 'verified-receipt-replay-execution-http-postgres.integration.test.mjs', 'verified-receipt-replay-review-http-postgres.integration.test.mjs', 'verified-receipt-operator-http-postgres.integration.test.mjs', 'verified-provider-receipt-inbox-postgres.integration.test.mjs', 'billing-receipt-process-recovery-postgres.integration.test.mjs', 'billing-external-checkout-rollback-postgres.integration.test.mjs', 'saas-billing-sql-failure-recovery.integration.test.mjs', 'saas-billing-negative-failure-cases.integration.test.mjs', 'saas-billing-authority.integration.test.ts', 'superqi-sandbox-billing.integration.test.ts', 'subscription-entitlement-postgres.integration.test.ts', 'merchant-customer-payment-authority-postgres.integration.test.ts'],
  'meta-bot': ['meta-worker-precommit-restart-postgres.integration.test.mjs', 'meta-job-identity-postgres.integration.test.mjs', 'meta-worker-deadletter-restart-postgres.integration.test.mjs', 'meta-restore-wire-recovery-postgres.integration.test.mjs', 'meta-full-app-restricted-postgres.integration.test.mjs', 'knowledge-learning-cycle-postgres.integration.test.ts', 'meta-live-reply-postgres.integration.test.ts'],
  tenant: ['admin-auth-router-postgres.integration.test.ts', 'support-postgres-cutover.integration.test.ts', 'merchant-session-restricted-http-postgres.integration.test.mjs', 'auth-cutover-contract.test.mjs', 'merchant-password-recovery-postgres.integration.test.ts', 'reply-addon-refund-postgres.integration.test.mjs', 'reply-cross-cycle-refund-postgres.integration.test.mjs', 'production-postgres-rls-security.integration.test.ts', 'knowledge-tenant-rls.integration.test.mjs', 'knowledge-management-postgres-cutover.integration.test.ts', 'knowledge-postgres-lifecycle.integration.test.ts', 'merchant-management-tenant-rls.integration.test.mjs', 'subscription-reminder-rls.integration.test.mjs'],
  bootstrap: ['global-merchant-auth-bootstrap-postgres.integration.test.mjs', 'global-merchant-golden-journey.integration.test.mjs'],
  http: ['global-merchant-postgres-http-journey.integration.test.ts'],
  deletion: ['merchant-deletion-tenant-rls.integration.test.mjs'],
  meta: ['meta-webhook-postgres-ingress-cutover.integration.test.ts'],
  'meta-rls': ['meta-page-directory-restricted-rls.integration.test.mjs'],
};
suites['node22-http'] = suites.http;
suites['auth-contract'] = ['auth-account-repository.test.ts','auth-password-service.test.ts','auth-otp-delivery.test.ts','auth-policy.test.ts','auth-security-store.test.ts','auth-cutover-contract.test.mjs','auth-cutover-path-case.test.ts'];
suites['foundation-runtime'] = ['merchant-settings-clock.integration.test.mjs','queue-expired-lease-race.integration.test.mjs'];
suites['subscription-reminder'] = ['subscription-reminder-rls.integration.test.mjs'];
suites['settings-runtime'] = ['merchant-settings-postgres-http.integration.test.ts'];
suites['regional-runtime'] = ['merchant-regional-postgres-http.integration.test.ts'];
suites['channels-runtime'] = ['merchant-channels-postgres-http.integration.test.ts'];
suites['variant-runtime'] = ['catalog-variant-signature-postgres.integration.test.ts'];
suites['inventory-runtime'] = ['location-inventory-authority-postgres.integration.test.ts'];
suites['media-runtime'] = ['merchant-deletion-physical-media-postgres.integration.test.ts'];
suites.priority = [...suites['audit-boundary'], 'merchant-central-scope-postgres.integration.test.mjs', ...suites['foundation-runtime'], 'cashier-operator-login-concurrency-hardening.test.mjs', 'subscription-tenant-transaction-unit.test.mjs', 'billing-merchant-context-unit.test.mjs', 'operational-postgres-transaction-lifecycle.test.ts', 'failed-setup-cleanup-postgres.integration.test.mjs', ...suites.bootstrap, ...suites.http, ...suites.deletion, ...suites.meta, ...suites['meta-rls']];
const selected = suites[process.argv[2]];
assert.ok(selected, 'unknown audit suite');
await assertDisposablePostgres();
function execute(args, env = process.env) {
  const result = spawnSync(process.execPath, args, { env, encoding: 'utf8', timeout: 240000, maxBuffer: 4 * 1024 * 1024 });
  process.stdout.write(result.stdout || '');
  process.stderr.write(result.stderr || '');
  return result;
}
if (process.env.FAWRI_AUDIT_RESTORE_PHASE !== 'verify') {
  const migration = execute(['lib/db/scripts/audit-disposable-migrate.mjs']);
  if (migration.status !== 0) process.exit(1);
}
let failed = false;
for (const file of selected) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fawri-audit-suite-'));
  const result = execute(['--import', './scripts/lib/disposable-postgres-preload.mjs', '--import', 'tsx', '--test', '--test-reporter=tap', '--test-concurrency=1', '--test-timeout=180000', `artifacts/api-server/tests/${file}`], { ...process.env, FAWRI_DATA_DIR: dataDir });
  try { fs.rmSync(dataDir, { recursive: true, force: true }); }
  catch { failed = true; console.error("AUDIT_SUITE_DATA_CLEANUP_FAILURE"); }
  const summary = { suite: file, auditBatch: process.argv[2], runtime: process.version, ...(process.argv[2] === 'full-restore' ? { phase: process.env.FAWRI_AUDIT_RESTORE_PHASE } : {}), exit: result.status, passed: Number(result.stdout?.match(/^# pass (\d+)$/m)?.[1] || 0), failed: Number(result.stdout?.match(/^# fail (\d+)$/m)?.[1] ?? (result.stdout?.match(/^\s*not ok \d+ -/gm)?.length || 0)), skipped: Number(result.stdout?.match(/^# skipped (\d+)$/m)?.[1] || 0), cancelled: Number(result.stdout?.match(/^# cancelled (\d+)$/m)?.[1] || 0), summaryComplete: /^# pass \d+$/m.test(result.stdout || '') && /^# fail \d+$/m.test(result.stdout || '') && /^# skipped \d+$/m.test(result.stdout || '') };
  // CI cannot silently pass a suite that skipped its entire PostgreSQL proof.
  if (result.status !== 0 || !summary.summaryComplete || summary.passed === 0 || summary.skipped !== 0 || summary.cancelled !== 0) failed = true;
  console.log('AUDIT_SUITE_RESULT ' + JSON.stringify(summary));
}
process.exitCode = failed ? 1 : 0;
