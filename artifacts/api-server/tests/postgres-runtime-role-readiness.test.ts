import assert from "node:assert/strict";
import test from "node:test";
import { assertSafePostgresRuntimeRole } from "../src/observability/runtime";

const safe = { role_name: "fawri_runtime", is_superuser: false, bypass_rls: false, owns_unforced_rls_table: false };

test("readiness accepts a non-owner non-bypass runtime role", () => {
  assert.doesNotThrow(() => assertSafePostgresRuntimeRole(safe));
});

test("readiness rejects unsafe PostgreSQL runtime identities", () => {
  for (const role of [
    undefined,
    { ...safe, is_superuser: true },
    { ...safe, bypass_rls: true },
    { ...safe, owns_unforced_rls_table: true },
    { ...safe, owns_unforced_rls_table: undefined },
    { ...safe, bypass_rls: undefined },
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
