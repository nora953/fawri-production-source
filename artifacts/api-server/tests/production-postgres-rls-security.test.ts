import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync, readdirSync } from "node:fs";
import type { OperationalQueryTarget } from "../src/services/operationalPostgresAuthority";
import {
  assertProductionDatabaseRlsReady,
  PRODUCTION_TENANT_RLS_TABLES,
  PRODUCTION_PROTECTED_RLS_TABLES,
  ProductionDatabaseRlsSecurityError,
} from "../src/services/postgresRuntimeRlsSecurity";

function productionEnv(): NodeJS.ProcessEnv {
  return {
    NODE_ENV: "production",
    FAWRI_DEPLOYMENT_MODE: "production",
    FAWRI_OPERATIONAL_POSTGRES_AUTHORITY: "required",
  };
}

function target(row: Record<string, unknown>): OperationalQueryTarget {
  return {
    async query<T extends Record<string, unknown>>() {
      return { rows: [row] as unknown as T[] };
    },
  };
}

function safeRow(overrides: Record<string, unknown> = {}) {
  return {
    role_name: "fawri_runtime",
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
    "role_superuser", "role_bypass_rls", "session_role_superuser",
    "session_role_bypass_rls", "session_role_create_role",
  ]) {
    for (const value of [undefined, null, "false", "true", 0, 1, {}, []]) {
      await rejectsWith("PRODUCTION_DATABASE_RLS_READINESS_CHECK_FAILED", safeRow({ [field]: value }));
    }
  }
});

test("production fails closed on absent or malformed privilege inventories", async () => {
  for (const field of [
    "session_inherited_privileged_roles", "session_owned_tables",
    "session_reachable_privileged_roles", "owned_tenant_tables",
    "missing_or_unprotected_tenant_tables",
  ]) {
    for (const value of [undefined, null, "{}", {}, [null], [""], ["   "], [false], [0]]) {
      await rejectsWith("PRODUCTION_DATABASE_RLS_READINESS_CHECK_FAILED", safeRow({ [field]: value }));
    }
  }
});

test("production rejects CREATEROLE and inherited privileged membership with complete evidence", async () => {
  await rejectsWith("PRODUCTION_DATABASE_SESSION_CREATEROLE_FORBIDDEN",
    safeRow({ session_role_create_role: true }));
  await rejectsWith("PRODUCTION_DATABASE_INHERITED_PRIVILEGED_ROLE_FORBIDDEN",
    safeRow({ session_inherited_privileged_roles: ["isolated_bypass_role"] }));
});
