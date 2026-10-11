import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { assertDisposablePostgres } from '../../../scripts/lib/disposable-postgres-test-guard.mjs';
import { cleanupResources } from './helpers/cleanup-resources.mjs';
await assertDisposablePostgres();
const { pool } = await import('@workspace/db');
test('failed fixture setup still removes real DB rows after one cleanup fails', async t => {
  const id = `audit-failed-setup-${randomUUID()}`;
  t.after(async () => cleanupResources([
    ['fallback fixture account', () => pool.query('DELETE FROM accounts WHERE id=$1', [id])],
    ['pool', () => pool.end()],
  ]));
  const childEnv = { ...process.env, FAWRI_AUDIT_FAILED_SETUP_ID: id };
  // A nested --test process must be a new runner, not an inherited IPC worker.
  delete childEnv.NODE_TEST_CONTEXT;
  const child = spawnSync(process.execPath, ['--import', './scripts/lib/disposable-postgres-preload.mjs', '--import', 'tsx', '--test', '--test-reporter=tap', 'artifacts/api-server/tests/fixtures/disposable-failed-setup.mjs'], { env: childEnv, encoding: 'utf8', timeout: 30000, maxBuffer: 1024 * 1024 });
  const output = (child.stdout || '') + (child.stderr || '');
  assert.equal(child.error, undefined, 'child must finish rather than time out');
  assert.equal(child.status, 1, 'injected fixture/cleanup failure must remain visible');
  assert.match(output, /expected synthetic fixture setup failure/);
  assert.match(output, /TEST_CLEANUP_FAILURE \{"failedResources":1\}/);
  assert.equal(output.includes('synthetic-invalid-integer'), false, 'raw PostgreSQL cleanup error is redacted');
  const accounts = (await pool.query('SELECT count(*)::int AS count FROM accounts WHERE id=$1', [id])).rows[0].count;
  const merchants = (await pool.query('SELECT count(*)::int AS count FROM merchants WHERE id=$1', [id])).rows[0].count;
  assert.equal(accounts, 0);
  assert.equal(merchants, 0);
  console.log('AUDIT_EXPECTED_FAILURE_CLEANUP ' + JSON.stringify({ expectedChildExit: child.status, remainingAccounts: accounts, remainingMerchants: merchants, rawErrorRedacted: true }));
});
