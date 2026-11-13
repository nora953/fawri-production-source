import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import test from 'node:test';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const relative = 'docs/final-audit/evidence/sql/P0-FIELD002-CURRENT-ACL0-ORIGINAL-PRECHANGE-READONLY-GATE-20261108.sql';
const sql = readFileSync(path.join(root, relative), 'utf8');
const executable = sql.split('\n')
  .filter(line => !line.trimStart().startsWith('--')).join('\n');

test('FIELD002 current ACL0 prechange inventory pins source and matching recovery without allowing writes', () => {
  for (const pin of [
    'br-falling-dust-b1km4gix', 'br-lingering-surf-b19gxt4e',
    'br-royal-fog-b1v7pdmr', 'br-shiny-lab-b1vxj4wn',
    'THIS SQL CANNOT VERIFY THE NEON BRANCH ID',
    'CURRENT_ACL0_BASELINE_MATCH_NOT_A_WRITE_APPROVAL',
    'FAIL_CLOSED_CURRENT_DEFAULT_FUNCTION_ACL_DRIFT',
    'FIELD002_OPEN_NO_GO_0052_BLOCKED',
  ]) assert.ok(sql.includes(pin), pin);
  for (const failClosedFlag of [
    'false AS authorized_to_write_original',
    'false AS safe_to_serve_tenants',
    'false AS independent_external_restore_accepted',
  ]) assert.ok(executable.includes(failClosedFlag), failClosedFlag);
});

test('FIELD002 new inventory is exactly one SELECT and never changes SQL privileges or fixtures', () => {
  assert.match(executable, /^\s*WITH\s/);
  assert.ok(executable.trimEnd().endsWith('FROM truth;'));
  assert.equal((executable.match(/;\s*(?=\S)/g) || []).length, 0);
  const forbidden = /\b(?:CREATE|ALTER|DROP|TRUNCATE|INSERT|UPDATE|DELETE|GRANT|REVOKE|RESET|SET|CALL|DO|COPY|VACUUM|LOCK|COMMIT|ROLLBACK)\b/i;
  assert.ok(!forbidden.test(executable), 'source SQL must remain strictly SELECT-only');
  assert.doesNotMatch(executable, /\bPASSWORD\b|\bSECRET\b|DATABASE_URL/i);
});

test('FIELD002 current expected baseline includes the observed zero default ACL and unsafe legacy predicate, never commercial admission', () => {
  for (const expected of [
    'AND m.applied=28',
    '87a2a16f4278430b770f6e60a4da497ae8cc24cab11aeec6780febe119bd9b3f',
    'residuals.present=8 AND residuals.rls_enabled=0',
    'residual_policies.policy_count=0',
    'legacy_defaults.unsafe_function_exec_count=0',
    'WHEN unsafe_function_exec_count<>0 THEN',
    '246383256a2e6a525a5fbd4cc98b3920',
    "has_function_privilege('public',",
    'roles.unsafe_legacy_login_count=1',
    'roles.nonlogin_legacy_runtime_count=1',
    'roles.field002_test_roles=0',
    'legacy_members.direct_memberships=2',
    'activity.other_client_sessions=0',
    'data_baseline.notifications=0',
    'data_baseline.audit_events=283',
    'data_baseline.merchants=1',
    "session_user='neondb_owner' AND current_user='neondb_owner'",
    "to_regprocedure('public.fawri_authentication_runtime()') IS NULL",
  ]) assert.ok(executable.includes(expected), expected);
  for (const table of [
    'audit_events', 'manual_reply_requests', 'merchant_admin_notes',
    'merchant_channel_overrides', 'merchant_deletion_requests',
    'notifications', 'order_drafts', 'processed_channel_events',
  ]) assert.ok(executable.includes("'" + table + "'"));
});

test('FIELD002 earlier dated ACL=2 evidence remains intact and cannot be confused with new ACL=0 baseline', () => {
  const old = readFileSync(path.join(root,
    'docs/final-audit/evidence/sql/P0-FIELD002-ORIGINAL-PRECHANGE-READONLY-GATE-20261107.sql'), 'utf8');
  assert.ok(old.includes('legacy_defaults.unsafe_function_exec_count=2'));
  assert.ok(old.includes('WHEN unsafe_function_exec_count<>2 THEN'));
  assert.ok(!sql.includes('legacy_defaults.unsafe_function_exec_count=2'));
});
