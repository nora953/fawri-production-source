/**
 * FT-01 / first-commercial fresh PostgreSQL database:
 * pure, repository-local migration source inventory (NO DB CONNECTION).
 *
 * This source contract is deliberately not a production migration runner.
 * It never accepts a connection string, imports customer data or issues SQL.
 * Canonical journal currently includes 0052, which remains blocked for hosted
 * rollout; list it as HELD rather than silently omitting/authorizing it.
 */
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  FIELD002_R2_PROJECT_ID,
  FIELD002_R2_FIRST_COMMERCIAL_BRANCH_ID,
  assertField002FirstCommercialSourcePolicy,
} from "./field002-r2-precommercial-source-admission.mjs";

const rootDefault = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)), "../..",
);
const stageSql = "lib/db/drizzle/0052_cashier_stream_receipt_storage.sql";
const stageMetadata = "lib/db/migration-stages/0052/stage.json";
const journalPath = "lib/db/drizzle/meta/_journal.json";
const heldIndex = 52;
const sourceMode = "fresh_schema_migrations_only";

function fail(code) {
  const error = new Error(code);
  error.code = code;
  throw error;
}
function sha256(input) {
  return createHash("sha256").update(input, "utf8").digest("hex");
}
function cleanRecord(value) {
  return value !== null && typeof value === "object" &&
    !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
}
function firstCommercialSource() {
  return {
    intent: "first_commercial_launch",
    project_id: FIELD002_R2_PROJECT_ID,
    target_branch_id: FIELD002_R2_FIRST_COMMERCIAL_BRANCH_ID,
    source_mode: sourceMode,
    source_branch_id: null,
    source_backup_id: null,
    data_import_requested: false,
    restore_requested: false,
  };
}

/** Accept ONLY the reviewed, read-only zero-relation observation.
 *  This cannot authenticate its project/branch origin or future freshness.
 */
export function assertFt01EmptySchemaReadOnlyResult(observation) {
  const row = Array.isArray(observation) && observation.length === 1
    ? observation[0] : observation;
  if (!cleanRecord(row) ||
      row.database_name !== "fawri" ||
      row.postgres_major !== 18 ||
      row.session_role_name !== "fawri_owner" ||
      row.user_relations !== 0 ||
      row.user_data_relations !== 0 ||
      row.public_relations !== 0 ||
      row.drizzle_ledger_exists !== false ||
      row.pre_migration_readonly_decision !== "EMPTY_SCHEMA_PRE_MIGRATION_CANDIDATE") {
    fail("FT01_READONLY_EMPTY_SCHEMA_NOT_ACCEPTED");
  }
  return Object.freeze({
    decision: "EMPTY_SCHEMA_PREFLIGHT_REVIEWABLE",
    projectBranchVerifiedFromSql: false,
    bootstrapAuthorized: false,
    deploymentAuthorized: false,
  });
}

/**
 * Computes actual SHA256 for every committed migration, validates exact
 * ordered 0000..0052 journal, canonical SQL presence and independent 0052
 * stage checksum; no host/network/DB access, no files written.
 *
 * readFile is dependency injection ONLY for negative in-memory unit tests.
 */
export function buildFt01CleanBootstrapSourcePlan({
  root = rootDefault,
  readFile = (relative) => fs.readFileSync(path.join(root, relative), "utf8"),
} = {}) {
  const policy = assertField002FirstCommercialSourcePolicy(firstCommercialSource());
  if (policy.deploymentAuthorized !== false) fail("FT01_SOURCE_POLICY_UNSAFE");
  const journalRaw = readFile(journalPath);
  let journal;
  try { journal = JSON.parse(journalRaw); } catch {
    fail("FT01_JOURNAL_INVALID");
  }
  if (journal?.version !== "7" || journal?.dialect !== "postgresql" ||
      !Array.isArray(journal.entries) || journal.entries.length !== heldIndex + 1) {
    fail("FT01_JOURNAL_UNEXPECTED");
  }

  const migrations = [];
  for (let i = 0; i <= heldIndex; i += 1) {
    const entry = journal.entries[i];
    const padded = String(i).padStart(4, "0");
    if (!entry || entry.idx !== i || entry.version !== "7" ||
        entry.breakpoints !== true || !Number.isSafeInteger(entry.when) ||
        typeof entry.tag !== "string" ||
        !new RegExp("^" + padded + "_[a-z0-9_]+$").test(entry.tag)) {
      fail("FT01_JOURNAL_ORDER_OR_TAG_DRIFT");
    }
    const relativePath = "lib/db/drizzle/" + entry.tag + ".sql";
    let sql;
    try { sql = readFile(relativePath); } catch {
      fail("FT01_MIGRATION_SOURCE_MISSING");
    }
    if (typeof sql !== "string" || !sql.trim()) {
      fail("FT01_MIGRATION_SOURCE_EMPTY");
    }
    migrations.push({
      index: i,
      tag: entry.tag,
      sha256: sha256(sql),
      disposition: i === heldIndex
        ? "HELD_NOT_AUTHORIZED_FOR_HOSTED"
        : "SOURCE_INVENTORIED_NOT_APPROVED_TO_APPLY",
    });
  }

  let stage;
  try { stage = JSON.parse(readFile(stageMetadata)); } catch {
    fail("FT01_0052_STAGE_INVALID");
  }
  const latest = migrations[heldIndex];
  if (stage.index !== heldIndex ||
      stage.name !== "cashier_stream_receipt_storage" ||
      stage.mode !== "reviewed_sql" ||
      stage.when !== journal.entries[heldIndex].when ||
      latest.tag !== "0052_cashier_stream_receipt_storage" ||
      latest.sha256 !== stage.sql_sha256 ||
      stageSql !== "lib/db/drizzle/" + latest.tag + ".sql") {
    fail("FT01_0052_SQL_HASH_OR_STAGE_DRIFT");
  }

  // The 0052 snapshot must be present, but a snapshot alone does not confer
  // hosted acceptance of its owners, grants, policies or financial receipts.
  let snapshot;
  try { snapshot = JSON.parse(readFile("lib/db/drizzle/meta/0052_snapshot.json")); } catch {
    fail("FT01_0052_SNAPSHOT_MISSING");
  }
  if (!cleanRecord(snapshot) || !cleanRecord(snapshot.tables)) {
    fail("FT01_0052_SNAPSHOT_INVALID");
  }

  return Object.freeze({
    decision: "SOURCE_ONLY_BOOTSTRAP_INVENTORY_READY",
    target: Object.freeze({
      project_id: FIELD002_R2_PROJECT_ID,
      branch_id: FIELD002_R2_FIRST_COMMERCIAL_BRANCH_ID,
      database_name: "fawri",
      postgres_major: 18,
    }),
    source_mode: sourceMode,
    data_import_allowed: false,
    migration_journal_sha256: sha256(journalRaw),
    inventoried_migrations: migrations,
    last_pre_held_index: heldIndex - 1,
    held_migration: latest,
    source_manifest_sha256: sha256(
      JSON.stringify(migrations.map(({ index, tag, sha256: digest }) => [index, tag, digest])),
    ),
    approved_to_execute: false,
    database_connection_used: false,
    hosted_sql_executed: false,
    role_provisioning_authorized: false,
    rollback_verified_on_new_target: false,
    field002_closed: false,
    commercial_release_authorized: false,
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.length !== 2) fail("FT01_SOURCE_PLAN_NO_ARGUMENTS_ALLOWED");
  process.stdout.write(JSON.stringify(buildFt01CleanBootstrapSourcePlan(), null, 2) + "\n");
}
