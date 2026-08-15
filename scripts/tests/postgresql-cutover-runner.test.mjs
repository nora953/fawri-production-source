import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  CUTOVER_MIGRATION_MODE,
  migrationSourceFileStatus,
  requireCutoverTarget,
  validateCutoverPlanForWrite,
} from "../../lib/db/scripts/cutover-migration.mjs";

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(currentDirectory, "../..");
const gitSha = "a".repeat(40);
const connectionString =
  "postgresql://fawri_user:secret@db.internal.example/heliumdb";

function validEnvironment(overrides = {}) {
  return {
    FAWRI_ALLOW_POSTGRESQL_CUTOVER: "1",
    FAWRI_MIGRATION_TARGET_DATABASE: "heliumdb",
    FAWRI_MIGRATION_SOURCE_ENVIRONMENT: "replit_qa",
    FAWRI_MIGRATION_GIT_SHA: gitSha,
    ...overrides,
  };
}

function minimalSnapshot() {
  const table = () => ({ columns: {}, foreignKeys: {} });
  return {
    tables: {
      "public.accounts": table(),
      "public.migration_runs": table(),
      "public.migration_source_files": table(),
      "public.migration_source_records": table(),
      "public.migration_reconciliation_results": table(),
    },
  };
}

function validReport(overrides = {}) {
  return {
    ok: true,
    write_readiness: { ok: true, blockers: [] },
    planned_row_count: 1,
    rows: { accounts: [{ id: "account-1" }] },
    source_files: {
      auth: { file: "merchants.json", exists: true, bytes: 10, sha256: "b".repeat(64) },
      runtime: { file: "bot-runtime.json", exists: false, bytes: 0, sha256: null },
    },
    source_lineage: [
      {
        source_key: "auth",
        source_collection: "accounts",
        source_record_id: "account-1",
        source_record_sha256: "c".repeat(64),
        target_table: "accounts",
        target_record_id: "account-1",
      },
    ],
    source_lineage_sha256: "d".repeat(64),
    ...overrides,
  };
}

test("cutover target requires explicit approval, database, environment and exact Git SHA", () => {
  assert.deepEqual(
    requireCutoverTarget(connectionString, validEnvironment(), gitSha),
    {
      databaseName: "heliumdb",
      sourceEnvironment: "replit_qa",
      gitSha,
    },
  );

  assert.throws(
    () =>
      requireCutoverTarget(
        connectionString,
        validEnvironment({ FAWRI_ALLOW_POSTGRESQL_CUTOVER: "0" }),
        gitSha,
      ),
    /FAWRI_ALLOW_POSTGRESQL_CUTOVER=1/,
  );
  assert.throws(
    () =>
      requireCutoverTarget(
        connectionString,
        validEnvironment({ FAWRI_MIGRATION_SOURCE_ENVIRONMENT: "development" }),
        gitSha,
      ),
    /replit_qa or production/,
  );
  assert.throws(
    () =>
      requireCutoverTarget(
        connectionString,
        validEnvironment({ FAWRI_MIGRATION_GIT_SHA: "b".repeat(40) }),
        gitSha,
      ),
    /does not match FAWRI_MIGRATION_GIT_SHA/,
  );
  assert.throws(
    () =>
      requireCutoverTarget(
        "postgresql://user:pass@db.internal.example/otherdb",
        validEnvironment(),
        gitSha,
      ),
    /target database does not match/,
  );
  assert.throws(
    () =>
      requireCutoverTarget(
        "postgresql://user:pass@127.0.0.1/fawri_ci",
        validEnvironment({ FAWRI_MIGRATION_TARGET_DATABASE: "fawri_ci" }),
        gitSha,
      ),
    /refuses the disposable fawri_ci database/,
  );
});

test("cutover metadata values stay inside committed migration enum contracts", () => {
  const migrationSql = fs.readFileSync(
    path.join(repositoryRoot, "lib/db/drizzle/0001_military_proteus.sql"),
    "utf8",
  );

  assert.equal(CUTOVER_MIGRATION_MODE, "write");
  assert.match(
    migrationSql,
    /"migration_mode" AS ENUM\('dry_run', 'rollback_test', 'commit_test', 'write'\)/,
  );
  assert.match(
    migrationSql,
    /"migration_source_file_status" AS ENUM\('missing', 'parsed', 'invalid', 'skipped'\)/,
  );
  assert.equal(migrationSourceFileStatus({ exists: true }), "parsed");
  assert.equal(migrationSourceFileStatus({ exists: false }), "missing");
  assert.equal(migrationSourceFileStatus(undefined), "missing");
});

test("write-ready plan accepts optional missing sources while preserving exact lineage", () => {
  const result = validateCutoverPlanForWrite(validReport(), minimalSnapshot());
  assert.deepEqual(result.plannedTables, ["accounts"]);
  assert.equal(result.totalPlanned, 1);
});

test("cutover plan validation remains fail-closed", () => {
  const snapshot = minimalSnapshot();

  assert.throws(
    () =>
      validateCutoverPlanForWrite(
        validReport({ write_readiness: { ok: false, blockers: ["blocked"] } }),
        snapshot,
      ),
    /not write-ready/,
  );

  assert.throws(
    () =>
      validateCutoverPlanForWrite(
        validReport({ rows: { unknown_table: [{ id: "x" }] } }),
        snapshot,
      ),
    /unknown target tables/,
  );

  assert.throws(
    () =>
      validateCutoverPlanForWrite(
        validReport({ planned_row_count: 0, rows: {}, source_lineage: [] }),
        snapshot,
      ),
    /empty migration plan/,
  );

  assert.throws(
    () =>
      validateCutoverPlanForWrite(
        validReport({ planned_row_count: 2 }),
        snapshot,
      ),
    /planned_row_count/,
  );

  assert.throws(
    () =>
      validateCutoverPlanForWrite(
        validReport({ source_lineage: [] }),
        snapshot,
      ),
    /source-lineage record/,
  );

  assert.throws(
    () =>
      validateCutoverPlanForWrite(
        validReport({ source_lineage_sha256: null }),
        snapshot,
      ),
    /source_lineage_sha256/,
  );
});
