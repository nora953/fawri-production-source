#!/usr/bin/env node
// Read-only, fail-closed migration preflight. Never applies SQL.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { stabilizeMigrationDependencyOrder } from "./lib/migration-sql-order.mjs";
import { assessIsolatedRetirementOwnerReadiness, CASHIER_RETIREMENT_MIGRATION } from "./lib/isolated-neon-retirement-owner-readiness.mjs";
import { assessDefaultFunctionExecuteReadiness, TRUSTED_FUNCTION_CREATION_MIGRATIONS, APPLIED_TRUSTED_FUNCTIONS, UNTRUSTED_RUNTIME_FUNCTION_GRANTEES, assessAppliedTrustedFunctionExecuteReadiness } from "./lib/default-function-execute-preflight.mjs";

const { Client } = pg;
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../drizzle");
const journal = JSON.parse(fs.readFileSync(path.join(root, "meta/_journal.json"), "utf8"));
const entries = journal.entries;
assert.ok(Array.isArray(entries) && entries.length > 0, "missing migration journal");
const urlText = process.env.FAWRI_ISOLATED_NEON_DATABASE_URL;
const expectedHost = process.env.FAWRI_ISOLATED_NEON_HOST;
const expectedDb = process.env.FAWRI_ISOLATED_NEON_DATABASE;
const expectedLastHash = process.env.FAWRI_ISOLATED_NEON_LAST_HASH;
assert.ok(urlText && expectedHost && expectedDb && expectedLastHash, "explicit isolated connection, hostname, database, and last applied hash are required");
const url = new URL(urlText);
assert.ok(url.protocol === "postgresql:" || url.protocol === "postgres:", "PostgreSQL URL required");
assert.equal(url.hostname, expectedHost, "database host mismatch");
assert.ok(expectedHost.startsWith("ep-"), "explicit Neon endpoint hostname required");
assert.ok(!url.port || url.port === "5432", "unexpected PostgreSQL port");
assert.ok(!url.hash, "URL fragments are forbidden");
assert.ok(!url.hostname.includes("pooler"), "direct Neon endpoint required, not a pooler");
assert.match(url.hostname, /^ep-[a-z0-9-]+\.([a-z0-9-]+\.)?aws\.neon\.tech$/, "Neon endpoint hostname required");
assert.equal(decodeURIComponent(url.pathname.slice(1)), expectedDb, "database name mismatch");
assert.equal(process.env.FAWRI_ISOLATED_NEON_CONFIRM_BRANCH, "1", "explicit confirmation of isolated Neon branch is required");
assert.notEqual(expectedDb, "fawri_ci", "local CI database is not an isolated Neon branch");
assert.equal(url.searchParams.get("sslmode"), "require", "sslmode=require required");
assert.ok(url.username && url.password, "explicit authenticated connection required");
assert.ok(!url.searchParams.has("options"), "session startup options are forbidden in preflight");
assert.ok(!url.searchParams.has("host") && !url.searchParams.has("hostaddr") && !url.searchParams.has("service"), "alternate connection routing is forbidden");
assert.deepEqual([...url.searchParams.keys()], ["sslmode"], "only sslmode connection parameter is permitted");
// URL-encoded credential characters are valid and are decoded by the PostgreSQL client.
assert.match(expectedLastHash, /^[a-f0-9]{64}$/, "expected last hash must be sha256");
const client = new Client({ connectionString: urlText, application_name: "fawri-isolated-migration-readonly-preflight", statement_timeout: 15000, query_timeout: 20000, connectionTimeoutMillis: 10000 });
let connected = false;
let report;
try {
  await client.connect();
  connected = true;
  await client.query("BEGIN READ ONLY");
  await client.query("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ");
  const transaction = await client.query("SHOW transaction_read_only");
  assert.equal(transaction.rows[0]?.transaction_read_only, "on", "transaction must be read only");
  const identity = await client.query("SELECT current_database() AS db, current_user AS role, inet_server_addr()::text AS address");
  assert.equal(identity.rows[0].db, expectedDb, "connected database mismatch");
  const history = await client.query('SELECT id, created_at::text AS created_at, hash FROM drizzle.__drizzle_migrations ORDER BY id');
  assert.ok(history.rows.length > 0 && history.rows.length <= entries.length, "unexpected migration history length");
  for (let i = 0; i < history.rows.length; i++) {
    const actual = history.rows[i];
    assert.equal(Number(actual.id), i + 1, "non-contiguous migration IDs");
    assert.equal(String(actual.created_at), String(entries[i].when), "migration timestamp differs from committed journal");
    assert.match(actual.hash, /^[a-f0-9]{64}$/, "invalid applied migration hash");
    const sqlPath = path.join(root, `${entries[i].tag}.sql`);
    const sourceSql = fs.readFileSync(sqlPath, "utf8");
    const sourceHash = createHash("sha256").update(stabilizeMigrationDependencyOrder(sourceSql)).digest("hex");
    assert.equal(actual.hash, sourceHash, `applied migration SQL hash mismatch: ${entries[i].tag}`);
  }
  assert.equal(history.rows.at(-1).hash, expectedLastHash, "last applied migration hash mismatch");
  const pending = entries.slice(history.rows.length).map((entry) => entry.tag);
  // Default EXECUTE ACLs are applied to a freshly created privileged function
  // before the migration's REVOKE FROM PUBLIC runs. REVOKE FROM PUBLIC does
  // not remove explicit per-role default EXECUTE grants. Check the function
  // creator's global and public-schema defaults BEFORE 0038/0039 are applied.
  let defaultFunctionExecute = { required: false, ready: true, reason: "NOT_PENDING" };
  if (pending.some((tag) => TRUSTED_FUNCTION_CREATION_MIGRATIONS.includes(tag))) {
    const defaults = await client.query(`
      SELECT count(*)::int AS n
      FROM pg_default_acl d
      CROSS JOIN LATERAL aclexplode(d.defaclacl) AS grant_entry
      WHERE d.defaclrole = (SELECT oid FROM pg_roles WHERE rolname = current_user)
        AND d.defaclobjtype = 'f'
        AND (d.defaclnamespace = 0 OR d.defaclnamespace = 'public'::regnamespace)
        AND grant_entry.privilege_type = 'EXECUTE'
        AND grant_entry.grantee <> d.defaclrole
    `);
    defaultFunctionExecute = assessDefaultFunctionExecuteReadiness({
      pending,
      nonOwnerDefaultExecuteGrants: defaults.rows[0]?.n,
    });
    assert.equal(defaultFunctionExecute.ready, true,
      "trusted function migration is blocked by default EXECUTE ACLs: " +
        defaultFunctionExecute.reason);
  }
  // A migration may be recorded already while its created function still has
  // a dangerous per-role EXECUTE ACL inherited from default privileges. Inspect
  // actual function rights, not merely pending migration/pre-creation defaults.
  const applied = entries.slice(0, history.rows.length).map(entry => entry.tag);
  let appliedTrustedFunctionExecute = {
    required: false, ready: true, reason: "NOT_APPLIED",
  };
  if (APPLIED_TRUSTED_FUNCTIONS.some(item => applied.includes(item.migration))) {
    const functionAclRows = await client.query(`
      WITH expected(migration, signature) AS (
        VALUES
          ('0038_role_bound_admin_directory_issuer'::text,
            'public.fawri_issue_admin_directory_audit(text,text,text)'::text),
          ('0039_role_bound_authentication_runtime'::text,
            'public.fawri_authentication_runtime()'::text)
      )
      SELECT expected.migration,
        to_regprocedure(expected.signature) IS NOT NULL AS present,
        ARRAY(
          SELECT runtime_role.rolname::text FROM pg_roles runtime_role
          WHERE runtime_role.rolname = ANY($1::text[])
            AND COALESCE(has_function_privilege(runtime_role.oid,
              to_regprocedure(expected.signature), 'EXECUTE'), false)
          ORDER BY runtime_role.rolname
        ) AS runtime_execute_roles
      FROM expected
      WHERE expected.migration = ANY($2::text[])
      ORDER BY expected.migration
    `, [
      Array.from(UNTRUSTED_RUNTIME_FUNCTION_GRANTEES),
      applied,
    ]);
    appliedTrustedFunctionExecute = assessAppliedTrustedFunctionExecuteReadiness({
      applied,
      actual: functionAclRows.rows.map(row => ({
        migration: row.migration,
        present: row.present,
        runtimeExecuteRoles: row.runtime_execute_roles,
      })),
    });
    assert.equal(appliedTrustedFunctionExecute.ready, true,
      "applied trusted function ACLs are unsafe: " +
      appliedTrustedFunctionExecute.reason);
  }
  // 0052 cannot transfer a SECURITY DEFINER function to a zero-member owner
  // under a non-superuser CREATEROLE session. Neon automatically creates an
  // ADMIN-only membership, even for NOLOGIN roles; do not try to repair it by
  // keeping a temporary SET grant. This is read-only metadata inspection.
  let cashierRetirementOwner = { required: false, ready: true, reason: "NOT_PENDING" };
  if (pending.includes(CASHIER_RETIREMENT_MIGRATION)) {
    const ownerRows = await client.query(
      "SELECT rolname,rolcanlogin,rolsuper,rolbypassrls,rolcreatedb,rolcreaterole,rolinherit,rolreplication FROM pg_roles WHERE rolname='fawri_cashier_retirement_owner'",
    );
    const memberships = await client.query(
      "SELECT count(*)::int AS n FROM pg_auth_members WHERE roleid=(SELECT oid FROM pg_roles WHERE rolname='fawri_cashier_retirement_owner') OR member=(SELECT oid FROM pg_roles WHERE rolname='fawri_cashier_retirement_owner')",
    );
    const executor = await client.query(
      "SELECT (SELECT rolsuper FROM pg_roles WHERE rolname=current_user) AS executor_superuser, (SELECT rolsuper FROM pg_roles WHERE rolname=session_user) AS session_superuser",
    );
    cashierRetirementOwner = assessIsolatedRetirementOwnerReadiness({
      pending,
      ownerRole: ownerRows.rows[0] || null,
      ownerMembershipCount: memberships.rows[0]?.n,
      executorSuperuser: executor.rows[0]?.executor_superuser,
      sessionSuperuser: executor.rows[0]?.session_superuser,
    });
    assert.equal(
      cashierRetirementOwner.ready,
      true,
      "0052 isolated owner handoff is blocked: " + cashierRetirementOwner.reason,
    );
  }
  const roles = await client.query("SELECT rolname,rolcanlogin,rolbypassrls,rolsuper FROM pg_roles WHERE rolname IN ('fawri_staging_runtime','fawri_staging_rls_runtime') ORDER BY rolname");
  report = { ok: true, read_only: true, db: identity.rows[0].db, role: identity.rows[0].role, applied: history.rows.length, pending, roles: roles.rows, defaultFunctionExecute, appliedTrustedFunctionExecute, cashierRetirementOwner };
} finally {
  try {
    if (connected) await client.query("ROLLBACK");
  } finally {
    await client.end();
  }
}
if (report) process.stdout.write(JSON.stringify(report, null, 2) + "\n");
