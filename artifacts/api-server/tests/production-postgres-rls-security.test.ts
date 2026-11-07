import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync, readdirSync } from "node:fs";
import type { OperationalQueryTarget } from "../src/services/operationalPostgresAuthority";
import {
  assertProductionDatabaseRlsReady,
  PRODUCTION_TENANT_RLS_TABLES,
  PRODUCTION_PROTECTED_RLS_TABLES,
  AUTHENTICATION_INTEGRITY_TABLES,
  ProductionDatabaseRlsSecurityError,
} from "../src/services/postgresRuntimeRlsSecurity";

function productionEnv(): NodeJS.ProcessEnv {
  return {
    NODE_ENV: "production",
    FAWRI_DEPLOYMENT_MODE: "production",
    FAWRI_OPERATIONAL_POSTGRES_AUTHORITY: "required",
    FAWRI_AUTH_DATABASE_URL:"postgresql://auth@127.0.0.1/fawri_ci", FAWRI_OPERATOR_DATABASE_URL: "postgresql://operator@127.0.0.1/fawri_ci",
  };
}

function target(row: Record<string, unknown>): OperationalQueryTarget {
  return {
    async query<T extends Record<string, unknown>>(sql: string) {
      return { rows: [sql.includes("WITH principal") ? {present:true,safe:true} : row] as unknown as T[] };
    },
  };
}

function safeRow(overrides: Record<string, unknown> = {}) {
  return {
    tenant_predicate_trusted: true,
    non_row_privilege_roles: [],
    cashier_staff_lock_ready:true, cashier_approval_authority_ready:true, authentication_authority_present:true, authentication_marker_reachable_roles:[], authentication_mutation_roles:[], audit_access_roles:[],
    authentication_sensitive_columns_present:true, authentication_sensitive_read_roles:[],
    directory_issuer_present: true,
    operator_authority_roles: [],
    role_name: "fawri_runtime",
    role_create_role: false,
    session_role_name: "fawri_runtime",
    session_role_superuser: false,
    session_role_bypass_rls: false,
    session_role_create_role: false,
    session_inherited_privileged_roles: [],
    session_owned_tables: [],
    session_reachable_privileged_roles: [],
    role_superuser: false,
    role_bypass_rls: false,
    owned_tenant_tables: [],
    missing_or_unprotected_tenant_tables: [],
    ...overrides,
  };
}

async function rejectsWith(
  code: string,
  row: Record<string, unknown>,
): Promise<void> {
  await assert.rejects(
    () => assertProductionDatabaseRlsReady(productionEnv(), target(row)),
    (error: unknown) => {
      assert.ok(error instanceof ProductionDatabaseRlsSecurityError);
      assert.equal(error.code, code);
      return true;
    },
  );
}

test("production database RLS readiness is inert outside the production gate", async () => {
  let queried = false;
  await assertProductionDatabaseRlsReady(
    { NODE_ENV: "production", FAWRI_DEPLOYMENT_MODE: "staging" },
    {
      async query() {
        queried = true;
        throw new Error("must not query");
      },
    },
  );
  assert.equal(queried, false);
});

test("staff discount policy mutations remain trusted authentication authority", () => {
  assert.ok((AUTHENTICATION_INTEGRITY_TABLES as readonly string[]).includes("merchant_cashier_staff_discount_policies"));
});

test("FIELD002 configured production SQL current/session role must match the approved runtime login", async () => {
  const env = { ...productionEnv(), FAWRI_EXPECTED_POSTGRES_RUNTIME_ROLE: "fawri_runtime" };
  await assert.doesNotReject(() => assertProductionDatabaseRlsReady(env, target(safeRow())));
  for (const fields of [
    { role_name: "fawri_unapproved" },
    { session_role_name: "fawri_unapproved" },
  ]) {
    await assert.rejects(
      () => assertProductionDatabaseRlsReady(env, target(safeRow(fields))),
      (error: unknown) => {
        assert.ok(error instanceof ProductionDatabaseRlsSecurityError);
        assert.equal(error.code, "PRODUCTION_DATABASE_RUNTIME_ROLE_MISMATCH");
        return true;
      },
    );
  }
});

test("FIELD002 production admits only the exact reviewed trusted tenant predicate and fails closed on drift", async () => {
  await assert.doesNotReject(() => assertProductionDatabaseRlsReady(
    productionEnv(), target(safeRow()),
  ));
  await rejectsWith("PRODUCTION_TENANT_PREDICATE_SOURCE_UNTRUSTED",
    safeRow({tenant_predicate_trusted: false}));
  for (const malformed of [undefined, null, "true", "false", 0, 1]) {
    await rejectsWith("PRODUCTION_DATABASE_RLS_READINESS_CHECK_FAILED",
      safeRow({tenant_predicate_trusted: malformed}));
  }
  const source = readFileSync(new URL("../src/services/postgresRuntimeRlsSecurity.ts",
    import.meta.url), "utf8");
  const migration = readFileSync(new URL(
    "../../../lib/db/drizzle/0041_private_tenant_predicate_cutover.sql",
    import.meta.url), "utf8");
  assert.match(source, /md5\\(fn\\.prosrc\\)='f0978dfce073f2546c2081467306e26d'/);
  assert.match(source, /fn\\.prosecdef AND fn\\.proisstrict/);
  assert.match(source, /tenant_predicate_trusted/);
  assert.match(migration, /fawri_security\\.allows_merchant\\(p_merchant_id\\)/);
  assert.doesNotMatch(migration, /fawri\\.tenant_id/);
});

test("production rejects superuser and BYPASSRLS runtime roles", async () => {
  await rejectsWith(
    "PRODUCTION_DATABASE_RUNTIME_SUPERUSER_FORBIDDEN",
    safeRow({ role_superuser: true }),
  );
  await rejectsWith(
    "PRODUCTION_DATABASE_RUNTIME_BYPASSRLS_FORBIDDEN",
    safeRow({ role_bypass_rls: true }),
  );
});

test("production refuses a CREATEROLE effective role even behind a restricted login", async () => {
  await rejectsWith(
    "PRODUCTION_DATABASE_RUNTIME_CREATEROLE_FORBIDDEN",
    safeRow({
      role_name: "role_admin_activated",
      role_create_role: true,
      session_role_name: "restricted_login",
      session_role_create_role: false,
    }),
  );
});

test("production rejects reachable trusted authentication marker under complete RLS", async () => {
  for (const reachable of [
    ["tenant_runtime"], ["trusted_auth"], ["tenant_runtime", "trusted_auth"],
  ]) {
    await rejectsWith(
      "PRODUCTION_AUTHENTICATION_MARKER_REACHABLE",
      safeRow({ authentication_marker_reachable_roles: reachable }),
    );
  }
  for (const malformed of [undefined, null, "[]", [null], [""]]) {
    await rejectsWith(
      "PRODUCTION_DATABASE_RLS_READINESS_CHECK_FAILED",
      safeRow({ authentication_marker_reachable_roles: malformed }),
    );
  }
});

test("production rejects runtime ownership of tenant tables", async () => {
  await rejectsWith(
    "PRODUCTION_DATABASE_RUNTIME_TABLE_OWNER_FORBIDDEN",
    safeRow({ owned_tenant_tables: ["products"] }),
  );
});

test("production rejects missing or RLS-disabled tenant tables", async () => {
  await rejectsWith(
    "PRODUCTION_DATABASE_TENANT_RLS_REQUIRED",
    safeRow({ missing_or_unprotected_tenant_tables: ["messages"] }),
  );
});

test("restricted non-owner role with complete tenant RLS is accepted", async () => {
  await assert.doesNotReject(() =>
    assertProductionDatabaseRlsReady(productionEnv(), target(safeRow())),
  );
});

test("critical tenant domains remain part of the production RLS contract", () => {
  for (const name of [
    "products",
    "location_inventory_levels",
    "orders",
    "messages",
    "reply_reservations",
    "saas_billing_orders",
    "knowledge_embeddings",
    "merchant_cashier_subscriptions",
    "cashier_station_seat_assignments",
    "cashier_billing_orders",
    "cashier_billing_events",
    "cashier_entitlement_applications",
    "cashier_entitlement_audit_events",
    "cashier_device_operation_timeline",
  ]) {
    assert.equal(PRODUCTION_TENANT_RLS_TABLES.includes(name as never), true);
  }
});

// Independent migration inventory prevents new protected domains from silently
// falling outside release readiness, including global capability-only tables.
test("release readiness covers every committed RLS-enabled table", () => {
  const directory = new URL("../../../lib/db/drizzle/", import.meta.url);
  const migrated = new Set<string>();
  for (const name of readdirSync(directory).filter(name => name.endsWith(".sql"))) {
    const sql = readFileSync(new URL(name, directory), "utf8");
    for (const match of sql.matchAll(/ALTER\s+TABLE\s+(?:public\.)?"?([a-z_]+)"?\s+ENABLE\s+ROW\s+LEVEL\s+SECURITY/gi)) {
      migrated.add(match[1]);
    }
  }
  assert.ok(migrated.size > 40, "must inspect the full migration history");
  const covered = new Set<string>(PRODUCTION_PROTECTED_RLS_TABLES);
  assert.deepEqual([...migrated].filter(name => !covered.has(name)).sort(), []);
});

test("production rejects a privileged authenticated session behind a restricted current role", async () => {
  await rejectsWith("PRODUCTION_DATABASE_SESSION_SUPERUSER_FORBIDDEN",
    safeRow({session_role_name: "connection_owner", session_role_superuser: true}));
  await rejectsWith("PRODUCTION_DATABASE_SESSION_BYPASSRLS_FORBIDDEN",
    safeRow({session_role_name: "connection_owner", session_role_bypass_rls: true}));
  await rejectsWith("PRODUCTION_DATABASE_SESSION_TABLE_OWNER_FORBIDDEN",
    safeRow({session_role_name: "connection_owner", session_owned_tables: ["verified_provider_payment_receipts"]}));
});

test("production rejects a session able to activate a privileged role", async () => {
  await rejectsWith("PRODUCTION_DATABASE_PRIVILEGED_ROLE_REACHABLE",
    safeRow({ session_reachable_privileged_roles: ["isolated_bypass_role"] }));
});

test("production fails closed on absent or malformed role safety booleans", async () => {
  for (const field of [
    "cashier_staff_lock_ready", "cashier_approval_authority_ready", "authentication_sensitive_columns_present", "directory_issuer_present", "role_superuser", "role_bypass_rls", "session_role_superuser",
    "session_role_bypass_rls", "session_role_create_role", "role_create_role",
  ]) {
    for (const value of [undefined, null, "false", "true", 0, 1, {}, []]) {
      await rejectsWith("PRODUCTION_DATABASE_RLS_READINESS_CHECK_FAILED", safeRow({ [field]: value }));
    }
  }
});

test("production fails closed on absent or malformed privilege inventories", async () => {
  for (const field of [
    "non_row_privilege_roles", "authentication_sensitive_read_roles", "authentication_mutation_roles", "audit_access_roles", "operator_authority_roles", "session_inherited_privileged_roles", "session_owned_tables",
    "session_reachable_privileged_roles", "owned_tenant_tables",
    "missing_or_unprotected_tenant_tables",
  ]) {
    for (const value of [undefined, null, "{}", {}, [null], [""], ["   "], [false], [0]]) {
      await rejectsWith("PRODUCTION_DATABASE_RLS_READINESS_CHECK_FAILED", safeRow({ [field]: value }));
    }
  }
});

test("production rejects reachable non-row privileges on protected tables", async () => {
  await rejectsWith("PRODUCTION_DATABASE_NONROW_PRIVILEGE_REACHABLE",
    safeRow({non_row_privilege_roles:["constraint_or_trigger_writer"]}));
});

test("production rejects CREATEROLE and inherited privileged membership with complete evidence", async () => {
  await rejectsWith("PRODUCTION_DATABASE_SESSION_CREATEROLE_FORBIDDEN",
    safeRow({ session_role_create_role: true }));
  await rejectsWith("PRODUCTION_DATABASE_INHERITED_PRIVILEGED_ROLE_FORBIDDEN",
    safeRow({ session_inherited_privileged_roles: ["isolated_bypass_role"] }));
});


test("tenant readiness rejects directory issuer ACLs reachable by current/session/SET roles", async () => {
  await rejectsWith("PRODUCTION_DATABASE_OPERATOR_AUTHORITY_REACHABLE",
    safeRow({ operator_authority_roles: ["trusted_directory_operator"] }));
  await rejectsWith("PRODUCTION_DATABASE_OPERATOR_ISSUER_REQUIRED",
    safeRow({ directory_issuer_present: false }));
});

test("production directory cannot silently use the tenant database when operator configuration is absent", async () => {
  for (const value of [undefined, "", "https://example.invalid", "not a url"]) {
    await assert.rejects(() => assertProductionDatabaseRlsReady(
      { ...productionEnv(), FAWRI_AUTH_DATABASE_URL:"postgresql://auth@127.0.0.1/fawri_ci", FAWRI_OPERATOR_DATABASE_URL: value }, target(safeRow())),
      { code: "PRODUCTION_OPERATOR_DATABASE_REQUIRED" });
  }
});


test("production rejects auth mutation and audit access inventories",async()=>{
  await rejectsWith("PRODUCTION_AUTH_SENSITIVE_COLUMNS_REQUIRED",safeRow({authentication_sensitive_columns_present:false}));
  await rejectsWith("PRODUCTION_AUTH_SENSITIVE_READ_AUTHORITY_REACHABLE",safeRow({authentication_sensitive_read_roles:["credential_reader"]}));
  await rejectsWith("PRODUCTION_AUTH_MUTATION_AUTHORITY_REACHABLE",safeRow({authentication_mutation_roles:["auth_writer"]}));
  await rejectsWith("PRODUCTION_ADMIN_AUDIT_ACCESS_REACHABLE",safeRow({audit_access_roles:["audit_reader"]}));
  await rejectsWith("PRODUCTION_AUTH_DATABASE_MIGRATION_REQUIRED",safeRow({authentication_authority_present:false}));
  await assert.rejects(()=>assertProductionDatabaseRlsReady({...productionEnv(),FAWRI_AUTH_DATABASE_URL:undefined},target(safeRow())),{code:"PRODUCTION_AUTH_DATABASE_REQUIRED"});
});


test("production rejects missing or unsafe private scope admission evidence", async () => {
  for (const state of [undefined, {}, {present:false,safe:true}, {present:true,safe:false}, {present:"true",safe:true}, {present:true,safe:"true"}]) {
    const client: OperationalQueryTarget = {
      async query<T extends Record<string, unknown>>(sql: string) {
        return { rows: (sql.includes("WITH principal") ? (state === undefined ? [] : [state]) : [safeRow()]) as unknown as T[] };
      },
    };
    await assert.rejects(() => assertProductionDatabaseRlsReady(productionEnv(), client),
      {code:"PRODUCTION_TENANT_SCOPE_ROLE_UNSAFE"});
  }
});

test("production requires the protected cashier approver locking capability",async()=>{
  await rejectsWith("PRODUCTION_CASHIER_STAFF_LOCK_REQUIRED",safeRow({cashier_staff_lock_ready:false}));
});

test("cashier identity tables require tenant RLS",()=>{
  for(const name of ["merchant_cashier_staff","merchant_cashier_staff_permissions","merchant_cashier_stations","cashier_station_pairing_challenges","cashier_station_credentials","cashier_shifts","cashier_operator_sessions"])assert.ok((PRODUCTION_TENANT_RLS_TABLES as readonly string[]).includes(name));
});

test("cashier discount and attribution tables require tenant RLS",()=>{
  for(const name of ["merchant_cashier_discount_settings","merchant_cashier_staff_discount_policies","merchant_cashier_discount_override_approvals","cashier_operation_attribution"])assert.ok((PRODUCTION_TENANT_RLS_TABLES as readonly string[]).includes(name));
});

 test("production requires scoped cashier approval mutation capabilities", async () => {
  await rejectsWith("PRODUCTION_CASHIER_APPROVAL_AUTHORITY_REQUIRED",safeRow({cashier_approval_authority_ready:false}));
});
 
test("production RLS SQL enumerates activatable and inherited CREATEROLE principals", () => {
  const source = readFileSync(new URL("../src/services/postgresRuntimeRlsSecurity.ts", import.meta.url), "utf8");
  assert.match(source, /COALESCE\(\(SELECT rolcreaterole FROM role_state\), TRUE\) AS role_create_role/);
  const reachabilityChecks = source.match(/\(privileged\.rolsuper OR privileged\.rolbypassrls OR privileged\.rolcreaterole\)/g) || [];
  assert.equal(reachabilityChecks.length, 2, "both SET and USAGE role reachability must cover CREATEROLE");
  assert.match(source, /PRODUCTION_DATABASE_RUNTIME_CREATEROLE_FORBIDDEN/);
});
