import assert from "node:assert/strict";
import test from "node:test";
import { assertPlanIdentity } from "../../lib/db/scripts/lib/migration-write.mjs";

function report(overrides = {}) {
  return {
    ok: true,
    tool_version: "1",
    source_manifest_sha256: "a".repeat(64),
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

test("migration write identity rejects changed planned counts", () => {
  assert.throws(
    () =>
      assertPlanIdentity(
        report(),
        snapshot(),
        report({ table_counts: { accounts: 1, merchants: 2 } }),
        snapshot(),
        "before_write",
      ),
    /planned table counts changed after validation/,
  );
});
