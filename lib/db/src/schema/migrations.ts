import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { accounts } from "./accounts";
import {
  migrationModeEnum,
  migrationReconciliationStatusEnum,
  migrationRecordDispositionEnum,
  migrationRunStatusEnum,
  migrationSourceFileStatusEnum,
} from "./enums";

export const migrationRuns = pgTable(
  "migration_runs",
  {
    id: text("id").primaryKey(),
    mode: migrationModeEnum("mode").notNull(),
    status: migrationRunStatusEnum("status").notNull().default("planned"),
    sourceEnvironment: text("source_environment").notNull(),
    sourceRoot: text("source_root"),
    targetDatabase: text("target_database"),
    schemaSnapshot: text("schema_snapshot").notNull(),
    schemaSnapshotSha256: text("schema_snapshot_sha256").notNull(),
    sourceManifestSha256: text("source_manifest_sha256"),
    toolVersion: text("tool_version").notNull(),
    gitCommitSha: text("git_commit_sha"),
    plannedRowCount: integer("planned_row_count").notNull().default(0),
    insertedRowCount: integer("inserted_row_count").notNull().default(0),
    reconciledRowCount: integer("reconciled_row_count").notNull().default(0),
    warningCount: integer("warning_count").notNull().default(0),
    errorCount: integer("error_count").notNull().default(0),
    initiatedByAccountId: text("initiated_by_account_id").references(
      () => accounts.id,
      { onDelete: "set null" },
    ),
    metadata: jsonb("metadata")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    startedAt: timestamp("started_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
  },
  (table) => ({
    statusCreatedIndex: index("migration_runs_status_created_idx").on(
      table.status,
      table.createdAt,
    ),
    modeCreatedIndex: index("migration_runs_mode_created_idx").on(
      table.mode,
      table.createdAt,
    ),
    sourceEnvironmentIndex: index(
      "migration_runs_source_environment_idx",
    ).on(table.sourceEnvironment),
    plannedRowsNonnegative: check(
      "migration_runs_planned_rows_nonnegative",
      sql`${table.plannedRowCount} >= 0`,
    ),
    insertedRowsNonnegative: check(
      "migration_runs_inserted_rows_nonnegative",
      sql`${table.insertedRowCount} >= 0`,
    ),
    reconciledRowsNonnegative: check(
      "migration_runs_reconciled_rows_nonnegative",
      sql`${table.reconciledRowCount} >= 0`,
    ),
    warningsNonnegative: check(
      "migration_runs_warnings_nonnegative",
      sql`${table.warningCount} >= 0`,
    ),
    errorsNonnegative: check(
      "migration_runs_errors_nonnegative",
      sql`${table.errorCount} >= 0`,
    ),
    validTimeRange: check(
      "migration_runs_valid_time_range",
      sql`${table.finishedAt} IS NULL OR ${table.startedAt} IS NULL OR ${table.finishedAt} >= ${table.startedAt}`,
    ),
  }),
);

export const migrationSourceFiles = pgTable(
  "migration_source_files",
  {
    id: text("id").primaryKey(),
    migrationRunId: text("migration_run_id")
      .notNull()
      .references(() => migrationRuns.id, { onDelete: "cascade" }),
    logicalName: text("logical_name").notNull(),
    relativePath: text("relative_path").notNull(),
    exists: boolean("exists").notNull().default(true),
    status: migrationSourceFileStatusEnum("status").notNull(),
    sizeBytes: integer("size_bytes").notNull().default(0),
    recordCount: integer("record_count").notNull().default(0),
    sha256: text("sha256"),
    errorCode: text("error_code"),
    metadata: jsonb("metadata")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    runLogicalNameUnique: uniqueIndex(
      "migration_source_files_run_logical_name_unique",
    ).on(table.migrationRunId, table.logicalName),
    runStatusIndex: index("migration_source_files_run_status_idx").on(
      table.migrationRunId,
      table.status,
    ),
    sha256Index: index("migration_source_files_sha256_idx").on(table.sha256),
    sizeNonnegative: check(
      "migration_source_files_size_nonnegative",
      sql`${table.sizeBytes} >= 0`,
    ),
    recordsNonnegative: check(
      "migration_source_files_records_nonnegative",
      sql`${table.recordCount} >= 0`,
    ),
  }),
);

export const migrationSourceRecords = pgTable(
  "migration_source_records",
  {
    id: text("id").primaryKey(),
    migrationRunId: text("migration_run_id")
      .notNull()
      .references(() => migrationRuns.id, { onDelete: "cascade" }),
    sourceFileId: text("source_file_id").references(
      () => migrationSourceFiles.id,
      { onDelete: "cascade" },
    ),
    sourceCollection: text("source_collection").notNull(),
    sourceRecordId: text("source_record_id").notNull(),
    sourceRecordSha256: text("source_record_sha256").notNull(),
    targetTable: text("target_table").notNull(),
    targetRecordId: text("target_record_id").notNull(),
    disposition: migrationRecordDispositionEnum("disposition")
      .notNull()
      .default("planned"),
    errorCode: text("error_code"),
    metadata: jsonb("metadata")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    sourceTargetUnique: uniqueIndex(
      "migration_source_records_source_target_unique",
    ).on(
      table.migrationRunId,
      table.sourceCollection,
      table.sourceRecordId,
      table.targetTable,
      table.targetRecordId,
    ),
    targetIndex: index("migration_source_records_target_idx").on(
      table.targetTable,
      table.targetRecordId,
    ),
    runDispositionIndex: index(
      "migration_source_records_run_disposition_idx",
    ).on(table.migrationRunId, table.disposition),
    sourceHashIndex: index("migration_source_records_hash_idx").on(
      table.sourceRecordSha256,
    ),
  }),
);

export const migrationReconciliationResults = pgTable(
  "migration_reconciliation_results",
  {
    id: text("id").primaryKey(),
    migrationRunId: text("migration_run_id")
      .notNull()
      .references(() => migrationRuns.id, { onDelete: "cascade" }),
    sourceFileId: text("source_file_id").references(
      () => migrationSourceFiles.id,
      { onDelete: "set null" },
    ),
    checkType: text("check_type").notNull(),
    scopeType: text("scope_type").notNull(),
    scopeName: text("scope_name").notNull(),
    expectedCount: integer("expected_count"),
    actualCount: integer("actual_count"),
    status: migrationReconciliationStatusEnum("status").notNull(),
    errorCode: text("error_code"),
    details: jsonb("details")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    runStatusIndex: index("migration_reconciliation_run_status_idx").on(
      table.migrationRunId,
      table.status,
    ),
    scopeIndex: index("migration_reconciliation_scope_idx").on(
      table.scopeType,
      table.scopeName,
    ),
    expectedCountNonnegative: check(
      "migration_reconciliation_expected_nonnegative",
      sql`${table.expectedCount} IS NULL OR ${table.expectedCount} >= 0`,
    ),
    actualCountNonnegative: check(
      "migration_reconciliation_actual_nonnegative",
      sql`${table.actualCount} IS NULL OR ${table.actualCount} >= 0`,
    ),
  }),
);

export type MigrationRun = typeof migrationRuns.$inferSelect;
export type MigrationSourceFile = typeof migrationSourceFiles.$inferSelect;
export type MigrationSourceRecord = typeof migrationSourceRecords.$inferSelect;
export type MigrationReconciliationResult =
  typeof migrationReconciliationResults.$inferSelect;
