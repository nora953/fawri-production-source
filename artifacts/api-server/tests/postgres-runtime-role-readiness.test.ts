import assert from "node:assert/strict";
import test from "node:test";
import { assertSafePostgresRuntimeRole, CRITICAL_POSTGRES_PRIVACY_RLS_TABLES } from "../src/observability/runtime";

const safe = { role_name: "fawri_runtime", is_superuser: false, can_create_role: false, bypass_rls: false, owns_unforced_rls_table: false, session_role_name: "fawri_login", session_is_superuser: false, session_bypass_rls: false, session_can_create_role: false, session_inherits_privileged_role: false, session_can_set_privileged_role: false, effective_has_authentication_runtime: false, effective_has_admin_directory_authority: false, session_has_authentication_runtime: false, session_has_admin_directory_authority: false, session_can_set_sensitive_function_role: false, critical_privacy_rls_ready_count: 8 };

test("readiness accepts a non-owner non-bypass runtime role", () => {
  assert.doesNotThrow(() => assertSafePostgresRuntimeRole(safe));
});

test("readiness rejects unsafe PostgreSQL runtime identities", () => {
  for (const role of [
    undefined,
    { ...safe, role_name: undefined },
    { ...safe, role_name: "" },
    { ...safe, role_name: "   " },
    { ...safe, is_superuser: true },
    { ...safe, can_create_role: true },
    { ...safe, can_create_role: undefined },
    { ...safe, bypass_rls: true },
    { ...safe, owns_unforced_rls_table: true },
    { ...safe, owns_unforced_rls_table: undefined },
    { ...safe, bypass_rls: undefined },
    { ...safe, session_role_name: undefined },
    { ...safe, session_role_name: "" },
    { ...safe, session_is_superuser: true },
    { ...safe, session_bypass_rls: true },
    { ...safe, session_bypass_rls: undefined },
    { ...safe, session_can_create_role: true },
    { ...safe, session_can_create_role: undefined },
    { ...safe, session_inherits_privileged_role: true },
    { ...safe, session_inherits_privileged_role: undefined },
    { ...safe, session_can_set_privileged_role: true },
    { ...safe, session_can_set_privileged_role: undefined },
    { ...safe, effective_has_authentication_runtime: true },
    { ...safe, effective_has_authentication_runtime: undefined },
    { ...safe, effective_has_admin_directory_authority: true },
    { ...safe, effective_has_admin_directory_authority: undefined },
    { ...safe, session_has_authentication_runtime: true },
    { ...safe, session_has_authentication_runtime: undefined },
    { ...safe, session_has_admin_directory_authority: true },
    { ...safe, session_has_admin_directory_authority: undefined },
    { ...safe, session_can_set_sensitive_function_role: true },
    { ...safe, session_can_set_sensitive_function_role: undefined },
  ]) {
    assert.throws(() => assertSafePostgresRuntimeRole(role), /POSTGRES_RUNTIME_ROLE_UNSAFE/);
  }
});

test("readiness still enforces configured runtime role identity", () => {
  const old = process.env.FAWRI_EXPECTED_POSTGRES_RUNTIME_ROLE;
  try {
    process.env.FAWRI_EXPECTED_POSTGRES_RUNTIME_ROLE = "expected_runtime";
    assert.throws(() => assertSafePostgresRuntimeRole(safe), /POSTGRES_RUNTIME_ROLE_MISMATCH/);
    assert.doesNotThrow(() => assertSafePostgresRuntimeRole({
      ...safe, role_name: "expected_runtime", session_role_name: "expected_runtime",
    }));
    assert.throws(() => assertSafePostgresRuntimeRole({
      ...safe, role_name: "expected_runtime",
    }), /POSTGRES_RUNTIME_ROLE_MISMATCH/, "SET ROLE cannot mask another authenticated login");
  } finally {
    if (old === undefined) delete process.env.FAWRI_EXPECTED_POSTGRES_RUNTIME_ROLE;
    else process.env.FAWRI_EXPECTED_POSTGRES_RUNTIME_ROLE = old;
  }
});

test("readiness rejects privileged login even when SET ROLE selects a safe effective role", () => {
  assert.throws(() => assertSafePostgresRuntimeRole({ ...safe, role_name: "fawri_staging_rls_runtime", session_role_name: "fawri_staging_runtime", session_bypass_rls: true }), /POSTGRES_RUNTIME_ROLE_UNSAFE/);
});


test("readiness rejects a non-bypass login that can SET ROLE into BYPASSRLS or SUPERUSER", () => {
  assert.throws(() => assertSafePostgresRuntimeRole({ ...safe, session_can_set_privileged_role: true }), /POSTGRES_RUNTIME_ROLE_UNSAFE/);
});


test("readiness rejects CREATEROLE and inherited privileged membership even without SET ROLE", () => {
  assert.throws(() => assertSafePostgresRuntimeRole({ ...safe, session_can_create_role: true }), /POSTGRES_RUNTIME_ROLE_UNSAFE/);
  assert.throws(() => assertSafePostgresRuntimeRole({ ...safe, session_inherits_privileged_role: true }), /POSTGRES_RUNTIME_ROLE_UNSAFE/);
});

test("effective current role cannot carry CREATEROLE even if login is restricted", () => {
  assert.throws(() => assertSafePostgresRuntimeRole({
    ...safe,
    role_name: "createrole_current",
    can_create_role: true,
    session_role_name: "restricted_login",
    session_can_create_role: false,
  }), /POSTGRES_RUNTIME_ROLE_UNSAFE/);
});

test("privacy RLS inventory includes exactly the eight residual merchant tables", () => {
  assert.deepEqual([...CRITICAL_POSTGRES_PRIVACY_RLS_TABLES], [
    "audit_events", "manual_reply_requests", "merchant_admin_notes",
    "merchant_channel_overrides", "merchant_deletion_requests",
    "notifications", "order_drafts", "processed_channel_events",
  ]);
});

test("configured hosted PostgreSQL role refuses missing RLS or policy on any privacy table", () => {
  const old = process.env.FAWRI_EXPECTED_POSTGRES_RUNTIME_ROLE;
  try {
    process.env.FAWRI_EXPECTED_POSTGRES_RUNTIME_ROLE = "fawri_runtime";
    // The hosted passing fixture must use the same approved authenticated
    // LOGIN for current_user and session_user. The local fixture intentionally
    // keeps different values for legacy/local no-policy tests.
    const hosted = { ...safe, session_role_name: "fawri_runtime" };
    for (const count of [0, 1, 7, 9, undefined, null, "8", NaN]) {
      assert.throws(
        () => assertSafePostgresRuntimeRole({ ...hosted, critical_privacy_rls_ready_count: count }),
        /POSTGRES_RUNTIME_PRIVACY_RLS_NOT_READY/,
        "eight validated table-policy pairs required, not just matching role name",
      );
    }
    assert.doesNotThrow(() => assertSafePostgresRuntimeRole(hosted));
  } finally {
    if (old === undefined) delete process.env.FAWRI_EXPECTED_POSTGRES_RUNTIME_ROLE;
    else process.env.FAWRI_EXPECTED_POSTGRES_RUNTIME_ROLE = old;
  }
});

test("no hosted runtime role configuration preserves lightweight local readiness", () => {
  const old = process.env.FAWRI_EXPECTED_POSTGRES_RUNTIME_ROLE;
  try {
    delete process.env.FAWRI_EXPECTED_POSTGRES_RUNTIME_ROLE;
    assert.doesNotThrow(() => assertSafePostgresRuntimeRole({ ...safe, critical_privacy_rls_ready_count: 0 }));
  } finally {
    if (old === undefined) delete process.env.FAWRI_EXPECTED_POSTGRES_RUNTIME_ROLE;
    else process.env.FAWRI_EXPECTED_POSTGRES_RUNTIME_ROLE = old;
  }
});

test("tenant runtime rejects RLS-bypassing function capabilities even with all eight policies", () => {
  const old = process.env.FAWRI_EXPECTED_POSTGRES_RUNTIME_ROLE;
  try {
    process.env.FAWRI_EXPECTED_POSTGRES_RUNTIME_ROLE = "fawri_staging_rls_runtime";
    const restricted = {
      ...safe,
      role_name: "fawri_staging_rls_runtime",
      session_role_name: "fawri_staging_rls_runtime",
      critical_privacy_rls_ready_count: 8,
    };
    assert.doesNotThrow(() => assertSafePostgresRuntimeRole(restricted));
    for (const unsafe of [
      { session_has_authentication_runtime: true },
      { session_has_admin_directory_authority: true },
      { effective_has_authentication_runtime: true },
      { effective_has_admin_directory_authority: true },
      { session_can_set_sensitive_function_role: true },
    ]) {
      assert.throws(
        () => assertSafePostgresRuntimeRole({ ...restricted, ...unsafe }),
        /POSTGRES_RUNTIME_ROLE_UNSAFE/,
        "function execution bypasses tenant boundaries regardless of RLS policy count",
      );
    }
  } finally {
    if (old === undefined) delete process.env.FAWRI_EXPECTED_POSTGRES_RUNTIME_ROLE;
    else process.env.FAWRI_EXPECTED_POSTGRES_RUNTIME_ROLE = old;
  }
});

test("unconfigured local runtime still refuses authentication bypass execution grants", () => {
  const old = process.env.FAWRI_EXPECTED_POSTGRES_RUNTIME_ROLE;
  try {
    delete process.env.FAWRI_EXPECTED_POSTGRES_RUNTIME_ROLE;
    assert.throws(
      () => assertSafePostgresRuntimeRole({ ...safe, session_has_authentication_runtime: true }),
      /POSTGRES_RUNTIME_ROLE_UNSAFE/,
    );
    assert.throws(
      () => assertSafePostgresRuntimeRole({ ...safe, session_can_set_sensitive_function_role: true }),
      /POSTGRES_RUNTIME_ROLE_UNSAFE/,
    );
  } finally {
    if (old === undefined) delete process.env.FAWRI_EXPECTED_POSTGRES_RUNTIME_ROLE;
    else process.env.FAWRI_EXPECTED_POSTGRES_RUNTIME_ROLE = old;
  }
});
