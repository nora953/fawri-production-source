import assert from "node:assert/strict";
import test from "node:test";
import { assertSafePostgresRuntimeRole } from "../src/observability/runtime";

const safe = { role_name: "fawri_runtime", is_superuser: false, bypass_rls: false, owns_unforced_rls_table: false, session_role_name: "fawri_login", session_is_superuser: false, session_bypass_rls: false, session_can_set_privileged_role: false };

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
    { ...safe, bypass_rls: true },
    { ...safe, owns_unforced_rls_table: true },
    { ...safe, owns_unforced_rls_table: undefined },
    { ...safe, bypass_rls: undefined },
    { ...safe, session_role_name: undefined },
    { ...safe, session_role_name: "" },
    { ...safe, session_is_superuser: true },
    { ...safe, session_bypass_rls: true },
    { ...safe, session_bypass_rls: undefined },
    { ...safe, session_can_set_privileged_role: true },
    { ...safe, session_can_set_privileged_role: undefined },
  ]) {
    assert.throws(() => assertSafePostgresRuntimeRole(role), /POSTGRES_RUNTIME_ROLE_UNSAFE/);
  }
});

test("readiness still enforces configured runtime role identity", () => {
  const old = process.env.FAWRI_EXPECTED_POSTGRES_RUNTIME_ROLE;
  try {
    process.env.FAWRI_EXPECTED_POSTGRES_RUNTIME_ROLE = "expected_runtime";
    assert.throws(() => assertSafePostgresRuntimeRole(safe), /POSTGRES_RUNTIME_ROLE_MISMATCH/);
    assert.doesNotThrow(() => assertSafePostgresRuntimeRole({ ...safe, role_name: "expected_runtime" }));
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
