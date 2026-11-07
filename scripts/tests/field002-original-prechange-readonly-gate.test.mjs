import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const sqlFile = path.join(root,
  "docs/final-audit/evidence/sql/P0-FIELD002-ORIGINAL-PRECHANGE-READONLY-GATE-20261107.sql");
const sql = fs.readFileSync(sqlFile, "utf8");
const executable = sql.split("\n")
  .filter(line => !line.trimStart().startsWith("--")).join("\n");

test("FIELD002 original prechange probe has exact connection-target external pin and never authorizes writes", () => {
  assert.ok(sql.includes("br-falling-dust-b1km4gix"));
  assert.ok(sql.includes("br-royal-fog-b1v7pdmr"));
  assert.ok(sql.includes("br-shiny-lab-b1vxj4wn"));
  assert.ok(sql.includes("THIS SQL CANNOT VERIFY THE NEON BRANCH ID"));
  assert.match(executable, /false AS authorized_to_write_original/);
  assert.match(executable, /SOURCE_READONLY_BASELINE_MATCH_NOT_A_WRITE_APPROVAL/);
  assert.match(executable, /FAIL_CLOSED_SOURCE_OR_ISOLATION_DRIFT/);
  assert.match(executable, /FAIL_CLOSED_DEFAULT_FUNCTION_EXECUTE_ACL_DRIFT/);
  assert.match(executable, /WHEN unsafe_function_exec_count<>2 THEN/);
  assert.match(executable, /FIELD002_OPEN_NO_GO_0052_BLOCKED/);
});

test("FIELD002 original prechange query is exactly one read-only SELECT statement and has no role/schema/secret mutations", () => {
  assert.match(executable, /^\s*WITH\s/m);
  assert.match(executable, /\bSELECT \*,/);
  assert.ok(executable.trimEnd().endsWith("FROM truth;"));
  assert.equal((executable.match(/;\s*(?=\S)/g) || []).length, 0);
  const forbidden = /\b(?:CREATE|ALTER|DROP|TRUNCATE|INSERT|UPDATE|DELETE|GRANT|REVOKE|RESET|SET|CALL|DO|COPY|VACUUM|LOCK|COMMIT|ROLLBACK)\b/i;
  assert.ok(!forbidden.test(executable), "original preflight must be strictly read-only");
  assert.ok(!/\bPASSWORD\b|\bSECRET\b|DATABASE_URL|FAWRI_AUTH_DATABASE_URL/i.test(executable));
});

test("FIELD002 original prechange probe refuses branch drift, role drift, extra clients and incomplete rollback state", () => {
  for (const marker of [
    "AND m.applied=28",
    "87a2a16f4278430b770f6e60a4da497ae8cc24cab11aeec6780febe119bd9b3f",
    "residuals.present=8 AND residuals.rls_enabled=0",
    "residual_policies.policy_count=0",
    "legacy_defaults.unsafe_function_exec_count=2",
    "WHEN unsafe_function_exec_count<>2 THEN",
    "roles.unsafe_legacy_login_count=1",
    "roles.nonlogin_legacy_runtime_count=1",
    "roles.field002_test_roles=0",
    "legacy_members.direct_memberships=2",
    "activity.other_client_sessions=0",
    "data_baseline.notifications=0",
    "data_baseline.audit_events=283",
    "data_baseline.merchants=1",
    "current_database()='neondb'",
    "session_user='neondb_owner' AND current_user='neondb_owner'",
    "to_regprocedure('public.fawri_authentication_runtime()') IS NULL",
  ]) {
    assert.ok(executable.includes(marker), marker);
  }
  const eight = [
    "audit_events", "manual_reply_requests", "merchant_admin_notes",
    "merchant_channel_overrides", "merchant_deletion_requests",
    "notifications", "order_drafts", "processed_channel_events",
  ];
  for (const table of eight) {
    assert.ok(executable.includes("'" + table + "'"), table);
  }
  assert.ok(executable.includes("CROSS JOIN LATERAL aclexplode"));
  assert.ok(executable.includes("pg_stat_activity"));
  assert.ok(executable.includes("pg_auth_members"));
  assert.ok(executable.includes("pg_default_acl"));
});
