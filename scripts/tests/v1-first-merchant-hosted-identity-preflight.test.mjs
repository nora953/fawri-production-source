import assert from "node:assert/strict";
import test from "node:test";
import {
  assessV1HostedIdentityCatalog,
  V1_REQUIRED_LOGIN_ROLES,
} from "../lib/v1-first-merchant-hosted-identity-preflight.mjs";

const target = () => ({
  project_id: "crimson-cherry-65705041",
  branch_id: "br-holy-waterfall-b993zglb",
  database_name: "fawri",
  postgres_major: 18,
});
const missing = () => V1_REQUIRED_LOGIN_ROLES.map(role_name => ({
  role_name, role_exists: false, can_login: false, is_superuser: false,
  bypasses_rls: false, can_create_roles: false, can_create_databases: false,
}));
const active = () => missing().map(row => ({
  ...row, role_exists: true, can_login: true,
}));
const assess = (rows, selectedTarget = target()) =>
  assessV1HostedIdentityCatalog({target: selectedTarget, rows});

test("accepted 2026-11-12 owner's three-role negative SELECT is a real blocker, never GO", () => {
  const verdict = assess(missing());
  assert.equal(verdict.gate_id, "P0-ACCESS-HOSTED-IDENTITY");
  assert.equal(verdict.status, "MISSING_REQUIRED_LOGIN_ROLES");
  assert.deepEqual(verdict.missing_roles, V1_REQUIRED_LOGIN_ROLES);
  assert.equal(verdict.catalog_rows_assessed, 3);
  for (const flag of [
    "project_branch_verified_by_sql", "direct_pool_identity_verified",
    "real_login_and_grants_verified", "hosted_sql_http_accepted",
    "backup_restore_accepted", "role_provisioning_authorized",
    "hosted_sql_authorized", "migration_authorized",
    "commercial_deployment_authorized", "p0_closed",
  ]) assert.equal(verdict[flag], false, flag);
  assert.equal(verdict.source_only, true);
  assert.ok(Object.isFrozen(verdict));
});

test("missing pg_roles LEFT JOIN NULL properties mean ABSENT, never secure LOGIN", () => {
  const rows = missing().map(r => ({
    ...r, can_login: null, is_superuser: null, bypasses_rls: null,
    can_create_roles: null, can_create_databases: null,
  }));
  assert.equal(assess(rows).status, "MISSING_REQUIRED_LOGIN_ROLES");
  assert.throws(() => assess([{...missing()[0], can_login: true}, ...missing().slice(1)]),
    /V1_HOSTED_IDENTITY_MISSING_ROLE_FLAGS_INVALID/);
});

test("reject wrong project, branch, database, PostgreSQL and extra target attributes", () => {
  for (const t of [
    {...target(), project_id: "round-fire-18493605"},
    {...target(), branch_id: "br-original-staging"},
    {...target(), database_name: "neondb"},
    {...target(), postgres_major: 16},
    {...target(), extra: "unreviewed"},
  ]) {
    assert.throws(() => assess(missing(), t),
      /V1_HOSTED_IDENTITY_TARGET_NOT_ATTESTED/);
  }
});

test("reject duplicate, missing or unexpected role observations", () => {
  const rows = missing();
  for (const altered of [
    rows.slice(1), [...rows, rows[0]], [rows[0], rows[0], rows[2]],
    [{...rows[0], role_name: "fawri_owner"}, rows[1], rows[2]],
    [{...rows[0], role_exists: "false"}, rows[1], rows[2]],
  ]) {
    assert.throws(() => assess(altered),
      /V1_HOSTED_IDENTITY_ROWS_INCOMPLETE|V1_HOSTED_IDENTITY_ROLE_ROW_UNTRUSTED/);
  }
});

test("NOLOGIN reservations do not pass as real tenant/auth/operator logins", () => {
  const rows = active();
  rows[0].can_login = false;
  const verdict = assess(rows);
  assert.equal(verdict.status, "NOLOGIN_ROLES_NOT_RUNTIME");
  assert.deepEqual(verdict.nologin_roles, ["fawri_restricted_runtime"]);
  assert.equal(verdict.p0_closed, false);
});

test("present but elevated role fails preliminary admission", () => {
  for (const property of ["is_superuser", "bypasses_rls", "can_create_roles", "can_create_databases"]) {
    const rows = active();
    rows[1][property] = true;
    const verdict = assess(rows);
    assert.equal(verdict.status, "ELEVATED_ROLE_FLAGS_REJECTED", property);
    assert.deepEqual(verdict.elevated_roles, ["fawri_auth_issuer"]);
    assert.equal(verdict.p0_closed, false);
  }
});

test("incomplete security attributes never silently default to false", () => {
  const rows = active();
  rows[1].bypasses_rls = null;
  assert.throws(() => assess(rows),
    /V1_HOSTED_IDENTITY_ROLE_FLAGS_INCOMPLETE/);
});

test("even three apparently safe LOGIN flags cannot close hosted identity", () => {
  const verdict = assess(active());
  assert.equal(verdict.status, "ROLE_FLAGS_PRELIMINARY_ONLY");
  assert.deepEqual(verdict.missing_roles, []);
  assert.equal(verdict.direct_pool_identity_verified, false);
  assert.equal(verdict.real_login_and_grants_verified, false);
  assert.equal(verdict.p0_closed, false);
});
