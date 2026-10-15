import assert from "node:assert/strict";
import test from "node:test";
import {
  assertPlanIdentity,
  resolveInsertOrder,
} from "../../lib/db/scripts/lib/migration-write.mjs";

function report(overrides = {}) {
  return {
    ok: true,
    tool_version: "6",
    source_manifest_sha256: "a".repeat(64),
    source_lineage_sha256: "f".repeat(64),
    source_files: {
      merchants: {
        file: "merchants.json",
        exists: true,
        bytes: 100,
        sha256: "b".repeat(64),
      },
    },
    table_counts: { accounts: 1, merchants: 1 },
    ...overrides,
  };
}

function snapshot(overrides = {}) {
  return {
    name: "0001_snapshot.json",
    sha256: "c".repeat(64),
    value: {},
    ...overrides,
  };
}

test("migration write identity accepts an unchanged validated plan", () => {
  assert.doesNotThrow(() =>
    assertPlanIdentity(
      report(),
      snapshot(),
      structuredClone(report()),
      structuredClone(snapshot()),
      "before_commit",
    ),
  );
});

test("migration write identity rejects changed source data", () => {
  assert.throws(
    () =>
      assertPlanIdentity(
        report(),
        snapshot(),
        report({ source_manifest_sha256: "d".repeat(64) }),
        snapshot(),
        "before_commit",
      ),
    /source manifest changed after validation/,
  );
});

test("migration write identity rejects changed source lineage", () => {
  assert.throws(
    () =>
      assertPlanIdentity(
        report(),
        snapshot(),
        report({ source_lineage_sha256: "e".repeat(64) }),
        snapshot(),
        "before_commit",
      ),
    /source lineage changed after validation/,
  );
});

test("migration write identity rejects changed Drizzle schema", () => {
  assert.throws(
    () =>
      assertPlanIdentity(
        report(),
        snapshot(),
        report(),
        snapshot({ sha256: "e".repeat(64) }),
        "before_write",
      ),
    /Drizzle snapshot content changed after validation/,
  );
});

test("foreign-key order is derived from snapshot dependencies", () => {
  const synthetic = {
    tables: {
      "public.accounts": { foreignKeys: {} },
      "public.merchants": {
        foreignKeys: {
          merchants_account_fk: { tableTo: "accounts" },
        },
      },
      "public.orders": {
        foreignKeys: {
          orders_merchant_fk: { tableTo: "merchants" },
        },
      },
      "public.order_items": {
        foreignKeys: {
          order_items_order_fk: { tableTo: "orders" },
        },
      },
    },
  };
  assert.deepEqual(
    resolveInsertOrder(
      ["order_items", "orders", "merchants", "accounts"],
      synthetic,
    ),
    ["accounts", "merchants", "orders", "order_items"],
  );
});
