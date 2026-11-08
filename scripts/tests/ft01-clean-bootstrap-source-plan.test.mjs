import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  assertFt01EmptySchemaReadOnlyResult,
  buildFt01CleanBootstrapSourcePlan,
} from "../lib/ft01-clean-bootstrap-source-plan.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");
const preflight = () => ({
  database_name: "fawri",
  postgres_major: 18,
  session_role_name: "fawri_owner",
  user_relations: 0,
  user_data_relations: 0,
  public_relations: 0,
  drizzle_ledger_exists: false,
  pre_migration_readonly_decision: "EMPTY_SCHEMA_PRE_MIGRATION_CANDIDATE",
});

function modifiedSource(changes) {
  return buildFt01CleanBootstrapSourcePlan({
    root,
    readFile: (relative) => Object.prototype.hasOwnProperty.call(changes, relative)
      ? changes[relative] : read(relative),
  });
}

test("FT-01 independently created blank target preflight is narrow and never a write approval", () => {
  const result = assertFt01EmptySchemaReadOnlyResult([preflight()]);
  assert.equal(result.decision, "EMPTY_SCHEMA_PREFLIGHT_REVIEWABLE");
  assert.equal(result.projectBranchVerifiedFromSql, false);
  assert.equal(result.bootstrapAuthorized, false);
  assert.equal(result.deploymentAuthorized, false);
});

test("FT-01 refuses nonempty, wrong database/role/version, migration ledger and untrusted decision", () => {
  for (const change of [
    { database_name: "neondb" }, { postgres_major: 16 },
    { session_role_name: "neondb_owner" }, { user_relations: 1 },
    { user_data_relations: 1 }, { public_relations: 1 },
    { drizzle_ledger_exists: true },
    { pre_migration_readonly_decision: "NOT_ACCEPTED" },
    { user_relations: "0" }, { postgres_major: "18" },
  ]) {
    assert.throws(
      () => assertFt01EmptySchemaReadOnlyResult({ ...preflight(), ...change }),
      /FT01_READONLY_EMPTY_SCHEMA_NOT_ACCEPTED/,
      JSON.stringify(change),
    );
  }
  for (const value of [null, [], [], {}, [preflight(), preflight()]]) {
    assert.throws(
      () => assertFt01EmptySchemaReadOnlyResult(value),
      /FT01_READONLY_EMPTY_SCHEMA_NOT_ACCEPTED/,
    );
  }
});

test("FT-01 inventory locks canonical 0000–0052, holds 0052, and cannot authorize production SQL", () => {
  const result = buildFt01CleanBootstrapSourcePlan();
  assert.equal(result.decision, "SOURCE_ONLY_BOOTSTRAP_INVENTORY_READY");
  assert.deepEqual(result.target, {
    project_id: "crimson-cherry-65705041",
    branch_id: "br-holy-waterfall-b993zglb",
    database_name: "fawri",
    postgres_major: 18,
  });
  assert.equal(result.source_mode, "fresh_schema_migrations_only");
  assert.equal(result.data_import_allowed, false);
  assert.equal(result.inventoried_migrations.length, 53);
  assert.equal(result.last_pre_held_index, 51);
  assert.deepEqual(
    result.inventoried_migrations.map((e) => e.index),
    Array.from({ length: 53 }, (_, index) => index),
  );
  assert.match(result.migration_journal_sha256, /^[a-f0-9]{64}$/);
  assert.match(result.source_manifest_sha256, /^[a-f0-9]{64}$/);
  assert.match(result.held_migration.sha256, /^[a-f0-9]{64}$/);
  assert.equal(result.held_migration.index, 52);
  assert.equal(result.held_migration.tag, "0052_cashier_stream_receipt_storage");
  assert.equal(result.held_migration.disposition, "HELD_NOT_AUTHORIZED_FOR_HOSTED");
  assert.ok(result.inventoried_migrations.slice(0, -1).every(
    (e) => e.disposition === "SOURCE_INVENTORIED_NOT_APPROVED_TO_APPLY",
  ));
  for (const key of [
    "approved_to_execute", "database_connection_used", "hosted_sql_executed",
    "role_provisioning_authorized", "rollback_verified_on_new_target",
    "field002_closed", "commercial_release_authorized",
  ]) {
    assert.equal(result[key], false, key);
  }
});

test("FT-01 rejects reordered or missing canonical journal entries and migration sources", () => {
  const journalPath = "lib/db/drizzle/meta/_journal.json";
  const journal = JSON.parse(read(journalPath));
  const shuffled = structuredClone(journal);
  [shuffled.entries[51], shuffled.entries[52]] = [
    shuffled.entries[52], shuffled.entries[51],
  ];
  assert.throws(
    () => modifiedSource({ [journalPath]: JSON.stringify(shuffled) }),
    /FT01_JOURNAL_ORDER_OR_TAG_DRIFT/,
  );
  const missing = structuredClone(journal);
  missing.entries.pop();
  assert.throws(
    () => modifiedSource({ [journalPath]: JSON.stringify(missing) }),
    /FT01_JOURNAL_UNEXPECTED/,
  );
  assert.throws(
    () => modifiedSource({ "lib/db/drizzle/0051_residual_merchant_privacy_scoped_authority.sql": "" }),
    /FT01_MIGRATION_SOURCE_EMPTY/,
  );
});

test("FT-01 rejects byte changes to held cashier 0052 and its stage provenance", () => {
  const sqlPath = "lib/db/drizzle/0052_cashier_stream_receipt_storage.sql";
  assert.throws(
    () => modifiedSource({ [sqlPath]: read(sqlPath) + "\n-- altered\n" }),
    /FT01_0052_SQL_HASH_OR_STAGE_DRIFT/,
  );
  const stagePath = "lib/db/migration-stages/0052/stage.json";
  const stage = JSON.parse(read(stagePath));
  stage.mode = "unreviewed";
  assert.throws(
    () => modifiedSource({ [stagePath]: JSON.stringify(stage) }),
    /FT01_0052_SQL_HASH_OR_STAGE_DRIFT/,
  );
  assert.throws(
    () => modifiedSource({ "lib/db/drizzle/meta/0052_snapshot.json": "{}" }),
    /FT01_0052_SNAPSHOT_INVALID/,
  );
});
