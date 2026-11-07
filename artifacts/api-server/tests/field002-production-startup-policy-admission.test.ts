import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  assertSafePostgresRuntimeRole,
  CRITICAL_POSTGRES_PRIVACY_RLS_TABLES,
} from "../src/observability/runtime";

const source = () => readFileSync(new URL("../src/index.ts", import.meta.url), "utf8");

test("FIELD002 production startup validates reviewed RLS policies before app import and listener", () => {
  const startup = source();
  assert.match(startup, /if \(productionReleaseGateRequired\(process\.env\)\) \{\s*await createPostgresAuthorityReadinessCheck\(\)\.check\(\);[\s\S]*?await assertProductionAuthenticationDatabaseReady\(process\.env\);\s*\}/);
  const checkpoints = [
    "assertProductionRuntimeConfiguration(process.env);",
    "await assertProductionDatabaseRlsReady(process.env);",
    "await createPostgresAuthorityReadinessCheck().check();",
    "await assertProductionAuthenticationDatabaseReady(process.env);",
    "await assertProductionCashierStreamStorageReady(process.env);",
    "await assertProductionOwnerAdminReady(process.env);",
    "await bootstrapRuntimeAndLoadApplication({",
    "app.listen(port,",
  ].map((part) => startup.indexOf(part));
  assert.ok(checkpoints.every((position) => position >= 0), "all production startup security checkpoints must exist");
  assert.ok(checkpoints.every((position, index) => index === 0 || position > checkpoints[index - 1]),
    "tenant RLS and auth issuer admission must precede providers and the HTTP listener");
});

test("FIELD002 startup policy admission rejects missing or mismatched policy inventory", () => {
  const env = {
    NODE_ENV: "production",
    FAWRI_DEPLOYMENT_MODE: "production",
    FAWRI_EXPECTED_POSTGRES_RUNTIME_ROLE: "fawri_tenant_runtime",
  };
  const safe = {
    role_name: "fawri_tenant_runtime",
    session_role_name: "fawri_tenant_runtime",
    is_superuser: false, can_create_role: false, bypass_rls: false,
    owns_unforced_rls_table: false,
    session_is_superuser: false, session_bypass_rls: false,
    session_can_create_role: false, session_inherits_privileged_role: false,
    session_can_set_privileged_role: false,
    effective_has_authentication_runtime: false,
    effective_has_admin_directory_authority: false,
    session_has_authentication_runtime: false,
    session_has_admin_directory_authority: false,
    session_can_set_sensitive_function_role: false,
    critical_privacy_rls_ready_count: CRITICAL_POSTGRES_PRIVACY_RLS_TABLES.length,
  };
  assert.equal(CRITICAL_POSTGRES_PRIVACY_RLS_TABLES.length, 8);
  assert.doesNotThrow(() => assertSafePostgresRuntimeRole(safe, env));
  for (const count of [undefined, 0, 7, "8", null]) {
    assert.throws(
      () => assertSafePostgresRuntimeRole({ ...safe, critical_privacy_rls_ready_count: count }, env),
      /POSTGRES_RUNTIME_PRIVACY_RLS_NOT_READY/,
    );
  }
  assert.throws(
    () => assertSafePostgresRuntimeRole({ ...safe, bypass_rls: true }, env),
    /POSTGRES_RUNTIME_ROLE_UNSAFE/,
  );
  assert.throws(
    () => assertSafePostgresRuntimeRole({ ...safe, role_name: "other_runtime" }, env),
    /POSTGRES_RUNTIME_ROLE_MISMATCH/,
  );
});
