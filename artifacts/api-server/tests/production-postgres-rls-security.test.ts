import assert from "node:assert/strict";
import test from "node:test";
import type { OperationalQueryTarget } from "../src/services/operationalPostgresAuthority";
import {
  assertProductionDatabaseRlsReady,
  PRODUCTION_TENANT_RLS_TABLES,
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
  ]) {
    assert.equal(PRODUCTION_TENANT_RLS_TABLES.includes(name as never), true);
  }
});
