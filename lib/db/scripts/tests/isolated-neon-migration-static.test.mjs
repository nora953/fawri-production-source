import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { stabilizeMigrationDependencyOrder } from "../lib/migration-sql-order.mjs";

const drizzleFolder = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../drizzle");
const journal = JSON.parse(fs.readFileSync(path.join(drizzleFolder, "meta/_journal.json"), "utf8"));

test("committed migration journal is ordered and every SQL source can be hashed", () => {
  assert.ok(journal.entries.length > 0);
  const timestamps = new Set();
  for (const [index, entry] of journal.entries.entries()) {
    assert.equal(entry.idx, index);
    assert.ok(Number.isSafeInteger(entry.when));
    assert.ok(!timestamps.has(entry.when), "duplicate migration timestamp: " + entry.tag);
    timestamps.add(entry.when);
    assert.match(entry.tag, /^[a-zA-Z0-9_-]+$/);
    const sql = fs.readFileSync(path.join(drizzleFolder, entry.tag + ".sql"), "utf8");
    const stabilized = stabilizeMigrationDependencyOrder(sql);
    assert.match(createHash("sha256").update(stabilized).digest("hex"), /^[a-f0-9]{64}$/);
    assert.equal(stabilizeMigrationDependencyOrder(stabilized), stabilized, "stabilization must be idempotent: " + entry.tag);
  }
});

test("preflight contains explicit read-only transaction safeguards", () => {
  const source = fs.readFileSync(path.join(drizzleFolder, "../scripts/preflight-isolated-neon-migrations.mjs"), "utf8");
  assert.match(source, /BEGIN READ ONLY/);
  assert.match(source, /SHOW transaction_read_only/);
  assert.match(source, /ROLLBACK/);
  assert.doesNotMatch(source, /client\.query\(["\x27](?:INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|TRUNCATE)\b/i);
  assert.match(source, /FAWRI_ISOLATED_NEON_CONFIRM_BRANCH/);
  assert.match(source, /stabilizeMigrationDependencyOrder\(sourceSql\)/);
});

import {
  assessIsolatedRetirementOwnerReadiness,
  CASHIER_RETIREMENT_MIGRATION,
} from "../lib/isolated-neon-retirement-owner-readiness.mjs";

const safeRetirementOwner = {
  rolname: "fawri_cashier_retirement_owner",
  rolcanlogin: false,
  rolsuper: false,
  rolbypassrls: false,
  rolcreatedb: false,
  rolcreaterole: false,
  rolinherit: false,
  rolreplication: false,
};

function ownerReady(overrides = {}) {
  return assessIsolatedRetirementOwnerReadiness({
    pending: [CASHIER_RETIREMENT_MIGRATION],
    ownerRole: safeRetirementOwner,
    ownerMembershipCount: 0,
    executorSuperuser: true,
    sessionSuperuser: true,
    ...overrides,
  });
}

test("0052 role handoff is not required when the migration is already recorded", () => {
  assert.deepEqual(ownerReady({ pending: [] }), {
    required: false, ready: true, reason: "NOT_PENDING",
  });
});

test("0052 requires a preprovisioned owner, never an implicit Neon CREATEROLE side effect", () => {
  assert.deepEqual(ownerReady({ ownerRole: null }), {
    required: true, ready: false, reason: "OWNER_ROLE_NOT_PREPROVISIONED",
  });
  assert.equal(ownerReady({ ownerRole: { ...safeRetirementOwner, rolname: "other" } }).ready, false);
});

test("0052 refuses all owner role privilege flags, including unknown flags", () => {
  for (const key of [
    "rolcanlogin", "rolsuper", "rolbypassrls", "rolcreatedb",
    "rolcreaterole", "rolinherit", "rolreplication",
  ]) {
    assert.deepEqual(ownerReady({ ownerRole: { ...safeRetirementOwner, [key]: true } }).reason, "OWNER_ROLE_FLAGS_UNSAFE");
  }
  const { rolbypassrls, ...incomplete } = safeRetirementOwner;
  assert.deepEqual(ownerReady({ ownerRole: incomplete }).reason, "OWNER_ROLE_FLAGS_UNSAFE");
});

test("0052 rejects even ADMIN-only or malformed role memberships", () => {
  for (const count of [1, 2, undefined, null, "0", -1]) {
    assert.deepEqual(ownerReady({ ownerMembershipCount: count }).reason, "OWNER_HAS_ROLE_MEMBERSHIP");
  }
});

test("0052 rejects non-superuser ownership transfer even without memberships", () => {
  assert.deepEqual(ownerReady({ executorSuperuser: false }).reason, "OWNER_HANDOFF_REQUIRES_TRUSTED_SUPERUSER");
  assert.deepEqual(ownerReady({ sessionSuperuser: false }).reason, "OWNER_HANDOFF_REQUIRES_TRUSTED_SUPERUSER");
  assert.deepEqual(ownerReady({ executorSuperuser: undefined }).reason, "OWNER_HANDOFF_REQUIRES_TRUSTED_SUPERUSER");
  assert.deepEqual(ownerReady(), {
    required: true, ready: true, reason: "TRUSTED_OWNER_HANDOFF_PRECONDITIONS_MET",
  });
});

test("0052 preflight refuses missing or malformed journal state", () => {
  for (const pending of [null, "", [null], [42]]) {
    assert.throws(() => ownerReady({ pending }), TypeError);
  }
});

test("hosted 0052 readiness check remains metadata-only and rejects blocked role handoff", () => {
  const source = fs.readFileSync(path.join(drizzleFolder, "../scripts/preflight-isolated-neon-migrations.mjs"), "utf8");
  assert.match(source, /assessIsolatedRetirementOwnerReadiness/);
  assert.match(source, /OWNER.*|cashierRetirementOwner\.ready/);
  assert.match(source, /pg_auth_members/);
  assert.match(source, /executor_superuser/);
  assert.match(source, /BEGIN READ ONLY/);
  assert.match(source, /ROLLBACK/);
  const journalEntry = journal.entries.find(entry => entry.tag === CASHIER_RETIREMENT_MIGRATION);
  assert.ok(journalEntry);
  const originalMigration = fs.readFileSync(path.join(drizzleFolder, journalEntry.tag + ".sql"), "utf8");
  assert.match(originalMigration, /ALTER FUNCTION public\.fawri_sequence_merchant_deleted\(\) OWNER TO fawri_cashier_retirement_owner/);
  assert.match(originalMigration, /CREATE ROLE fawri_cashier_retirement_owner NOLOGIN/);
});

// An authorization marker must never be auto-executable by the tenant runtime
// merely because the function creator has broad per-schema default privileges.
import {
  assessDefaultFunctionExecuteReadiness,
  TRUSTED_FUNCTION_CREATION_MIGRATIONS,
} from "../lib/default-function-execute-preflight.mjs";

test("0038 and 0039 privileged function migrations reject non-owner default EXECUTE grants", () => {
  assert.deepEqual([...TRUSTED_FUNCTION_CREATION_MIGRATIONS], [
    "0038_role_bound_admin_directory_issuer",
    "0039_role_bound_authentication_runtime",
  ]);
  for (const tag of TRUSTED_FUNCTION_CREATION_MIGRATIONS) {
    assert.deepEqual(assessDefaultFunctionExecuteReadiness({
      pending: [tag], nonOwnerDefaultExecuteGrants: 0,
    }), { required: true, ready: true, reason: "NO_NONOWNER_DEFAULT_FUNCTION_EXECUTE" });
    assert.deepEqual(assessDefaultFunctionExecuteReadiness({
      pending: [tag], nonOwnerDefaultExecuteGrants: 2,
    }), { required: true, ready: false, reason: "DEFAULT_FUNCTION_EXECUTE_WOULD_LEAK" });
  }
  assert.deepEqual(assessDefaultFunctionExecuteReadiness({
    pending: ["0052_cashier_stream_receipt_storage"], nonOwnerDefaultExecuteGrants: 2,
  }), { required: false, ready: true, reason: "NOT_PENDING" });
});

test("missing or malformed default-ACL evidence is never treated as safe", () => {
  const pending = [TRUSTED_FUNCTION_CREATION_MIGRATIONS[0]];
  for (const count of [undefined, null, "0", "2", -1, 0.1, NaN, Infinity]) {
    assert.deepEqual(assessDefaultFunctionExecuteReadiness({
      pending, nonOwnerDefaultExecuteGrants: count,
    }), { required: true, ready: false, reason: "DEFAULT_FUNCTION_GRANTS_UNVERIFIED" });
  }
  for (const badPending of [null, "", [null], [3], [""]]) {
    assert.throws(() => assessDefaultFunctionExecuteReadiness({
      pending: badPending, nonOwnerDefaultExecuteGrants: 0,
    }), TypeError);
  }
});

test("trusted-function preflight uses only read-only catalog ACL inspection", () => {
  const source = fs.readFileSync(path.join(drizzleFolder, "../scripts/preflight-isolated-neon-migrations.mjs"), "utf8");
  assert.match(source, /BEGIN READ ONLY/);
  assert.match(source, /pg_default_acl/);
  assert.match(source, /aclexplode\(d\.defaclacl\)/);
  assert.match(source, /defaclrole = \(SELECT oid FROM pg_roles WHERE rolname = current_user\)/);
  assert.match(source, /defaclnamespace = 0 OR d\.defaclnamespace = 'public'::regnamespace/);
  assert.match(source, /grant_entry\.grantee <> d\.defaclrole/);
  assert.match(source, /assessDefaultFunctionExecuteReadiness/);
  assert.match(source, /defaultFunctionExecute\.ready/);
  assert.match(source, /ROLLBACK/);
});

import {
  APPLIED_TRUSTED_FUNCTIONS,
  UNTRUSTED_RUNTIME_FUNCTION_GRANTEES,
  assessAppliedTrustedFunctionExecuteReadiness,
} from "../lib/default-function-execute-preflight.mjs";

const appliedTags = APPLIED_TRUSTED_FUNCTIONS.map(item => item.migration);
const safeAppliedFunctionRows = appliedTags.map(migration => ({
  migration, present: true, runtimeExecuteRoles: [],
}));

test("already-applied trusted auth functions require ACL proof after migration", () => {
  assert.deepEqual(assessAppliedTrustedFunctionExecuteReadiness({
    applied: [], actual: null,
  }), { required: false, ready: true, reason: "NOT_APPLIED" });
  assert.deepEqual(assessAppliedTrustedFunctionExecuteReadiness({
    applied: appliedTags, actual: safeAppliedFunctionRows,
  }), { required: true, ready: true,
    reason: "APPLIED_TRUSTED_FUNCTION_ACLS_SCOPED" });
  assert.deepEqual([...UNTRUSTED_RUNTIME_FUNCTION_GRANTEES], [
    "fawri_staging_rls_runtime", "fawri_staging_runtime", "<PUBLIC>",
  ]);
});

test("applied trusted functions fail closed for both historic default EXECUTE grantees", () => {
  for (const migration of appliedTags) {
    for (const role of UNTRUSTED_RUNTIME_FUNCTION_GRANTEES) {
      const actual = safeAppliedFunctionRows.map(row => row.migration === migration
        ? { ...row, runtimeExecuteRoles: [role] } : row);
      assert.deepEqual(assessAppliedTrustedFunctionExecuteReadiness({
        applied: appliedTags, actual,
      }), { required: true, ready: false,
        reason: "APPLIED_TRUSTED_FUNCTION_RUNTIME_EXECUTE_LEAK" });
    }
  }
});

test("one existing trusted function cannot be hidden by a pending sibling", () => {
  const first = appliedTags[0];
  assert.deepEqual(assessAppliedTrustedFunctionExecuteReadiness({
    applied: [first],
    actual: [{ migration: first, present: true,
      runtimeExecuteRoles: ["fawri_staging_rls_runtime"] }],
  }).reason, "APPLIED_TRUSTED_FUNCTION_RUNTIME_EXECUTE_LEAK");
  assert.deepEqual(assessAppliedTrustedFunctionExecuteReadiness({
    applied: [first],
    actual: [{ migration: first, present: true, runtimeExecuteRoles: [] }],
  }).reason, "APPLIED_TRUSTED_FUNCTION_ACLS_SCOPED");
});

test("incomplete or inconsistent applied trusted ACL inventory never passes", () => {
  for (const actual of [
    null, [], safeAppliedFunctionRows.slice(0, 1),
    [...safeAppliedFunctionRows, safeAppliedFunctionRows[0]],
    safeAppliedFunctionRows.map(row => ({ ...row, present: false })),
    safeAppliedFunctionRows.map(row => ({ ...row, present: null })),
    safeAppliedFunctionRows.map(row => ({ ...row, runtimeExecuteRoles: null })),
    safeAppliedFunctionRows.map(row => ({ ...row, runtimeExecuteRoles: ["unknown-role"] })),
    safeAppliedFunctionRows.map(row => ({ ...row,
      runtimeExecuteRoles: ["fawri_staging_rls_runtime", "fawri_staging_rls_runtime"] })),
  ]) {
    assert.deepEqual(assessAppliedTrustedFunctionExecuteReadiness({
      applied: appliedTags, actual,
    }).reason, "APPLIED_TRUSTED_FUNCTION_ACL_UNVERIFIED");
  }
  for (const applied of [null, "", [null], [42], [""]]) {
    assert.throws(() => assessAppliedTrustedFunctionExecuteReadiness({
      applied, actual: safeAppliedFunctionRows,
    }), TypeError);
  }
});

test("isolated hosted preflight reads actual trusted function rights without mutations", () => {
  const source = fs.readFileSync(path.join(drizzleFolder,
    "../scripts/preflight-isolated-neon-migrations.mjs"), "utf8");
  assert.match(source, /assessAppliedTrustedFunctionExecuteReadiness/);
  assert.match(source, /to_regprocedure\(expected\.signature\)/);
  assert.match(source, /has_function_privilege\(runtime_role\.oid/);
  assert.match(source, /aclexplode/);
  assert.match(source, /acldefault/);
  assert.match(source, /acl\.grantee = 0 AND acl\.privilege_type = 'EXECUTE'/);
  assert.match(source, /SELECT '<PUBLIC>'::text AS role_name/);
  assert.match(source, /runtimeExecuteRoles: row\.runtime_execute_roles/);
  assert.match(source, /appliedTrustedFunctionExecute\.ready/);
  assert.match(source, /BEGIN READ ONLY/);
  assert.match(source, /ROLLBACK/);
});

test("trusted functions deny PUBLIC EXECUTE even if named runtime role is absent", () => {
  for (const migration of appliedTags) {
    const actual = safeAppliedFunctionRows
      .filter(row => row.migration === migration)
      .map(row => ({ ...row, runtimeExecuteRoles: ["<PUBLIC>"] }));
    assert.deepEqual(assessAppliedTrustedFunctionExecuteReadiness({
      applied: [migration], actual,
    }), {
      required: true, ready: false,
      reason: "APPLIED_TRUSTED_FUNCTION_RUNTIME_EXECUTE_LEAK",
    });
  }
});
