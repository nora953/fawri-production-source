import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import pg from "pg";

import {
  buildStagingRestorePlan,
  currentOwnerId,
  legacyOwnerId,
} from "../../../scripts/lib/staging-restore-policy.mjs";

import {
  hasDefault,
  isMissing,
  quoteIdentifier,
  resolveInsertOrder,
} from "./lib/migration-write.mjs";

const { Pool } = pg;

const EXPECTED_PLAN_ROWS = 317;
const EXPECTED_BASELINE_FINGERPRINT =
  "35712e46288bd2d857502a78ec978482a8191b23163159e8bdabfcef16317c02";
const EXPECTED_AUDIT_FINGERPRINT =
  "ba9ed9bf0838a558e715a5a7a34279c476a2730e5907daecbb5132f2af96f0af";

const baselineTables = [
  "accounts",
  "admin_profiles",
  "admin_permissions",
  "merchants",
  "subscriptions",
  "support_tickets",
  "support_messages",
  "support_inspection_requests",
  "support_preview_sessions",
  "emergency_authorizations",
  "emergency_access_requests",
  "emergency_owner_alerts",
  "emergency_merchant_notices",
  "audit_events",
  "notifications",
  "merchant_channel_overrides",
  "merchant_deletion_requests",
];

function prepareStrictInsert(tableName, row, snapshot) {
  const table = snapshot.tables?.[`public.${tableName}`];
  assert.ok(table, `missing snapshot table ${tableName}`);

  const entries = [];

  for (const [columnName, value] of Object.entries(row)) {
    const column = table.columns?.[columnName];
    assert.ok(column, `unknown target column ${tableName}.${columnName}`);

    if (value === undefined) continue;
    if (isMissing(value) && column.notNull && hasDefault(column)) continue;

    const prepared =
      (column.type === "json" || column.type === "jsonb") &&
      value !== null &&
      value !== undefined
        ? JSON.stringify(value)
        : value;

    entries.push([columnName, prepared]);
  }

  assert.ok(entries.length > 0, `no insertable columns for ${tableName}`);

  const columns = entries
    .map(([column]) => quoteIdentifier(column))
    .join(", ");

  const placeholders = entries
    .map((_, index) => `$${index + 1}`)
    .join(", ");

  return {
    sql:
      `INSERT INTO ${quoteIdentifier(tableName)} (${columns}) ` +
      `VALUES (${placeholders})`,
    values: entries.map(([, value]) => value),
  };
}

async function readBaseline(client) {
  const counts = {};

  for (const table of baselineTables) {
    const result = await client.query(
      `SELECT COUNT(*)::integer AS count FROM ${quoteIdentifier(table)}`,
    );
    counts[table] = result.rows[0].count;
  }

  const audit = await client.query(`
    SELECT id, created_at
      FROM audit_events
     ORDER BY id
  `);

  const owner = await client.query(`
    SELECT a.id, a.kind, a.state, p.role, p.enabled
      FROM accounts a
      JOIN admin_profiles p ON p.account_id = a.id
     WHERE p.role = 'owner_admin'
     ORDER BY a.id
  `);

  const auditFingerprint = createHash("sha256")
    .update(JSON.stringify(audit.rows))
    .digest("hex");

  const stateFingerprint = createHash("sha256")
    .update(
      JSON.stringify({
        counts,
        owner: owner.rows,
        audit: audit.rows,
      }),
    )
    .digest("hex");

  return {
    counts,
    owner: owner.rows,
    auditFingerprint,
    stateFingerprint,
  };
}

async function assertTargetIdentity(client) {
  const identity = await client.query(`
    SELECT
      current_database() AS database,
      current_user AS current_user,
      session_user AS session_user
  `);

  assert.equal(identity.rows[0].database, "neondb");
  assert.equal(identity.rows[0].current_user, "fawri_staging_runtime");
  assert.equal(identity.rows[0].session_user, "fawri_staging_runtime");

  const owner = await client.query(
    `SELECT a.id, a.state, p.role, p.enabled
       FROM accounts a
       JOIN admin_profiles p ON p.account_id = a.id
      WHERE a.id = $1`,
    [currentOwnerId],
  );

  assert.equal(owner.rowCount, 1, "expected current staging owner is missing");
  assert.equal(owner.rows[0].state, "active");
  assert.equal(owner.rows[0].role, "owner_admin");
  assert.equal(owner.rows[0].enabled, true);

  const legacy = await client.query(
    `SELECT COUNT(*)::integer AS count
       FROM accounts
      WHERE id = $1`,
    [legacyOwnerId],
  );

  assert.equal(legacy.rows[0].count, 0, "legacy owner already exists in target");
}

const connectionString = process.env.DATABASE_URL;
assert.ok(connectionString, "DATABASE_URL is required");

const parsed = new URL(connectionString);

assert.equal(parsed.protocol, "postgresql:");
assert.equal(parsed.pathname.replace(/^\//, ""), "neondb");
assert.match(
  parsed.hostname,
  /^ep-plain-leaf-b1wtzjr3(?:-pooler)?\.c-5\.eu-central-1\.aws\.neon\.tech$/,
  "refusing unexpected Neon target",
);

const { report, snapshot } = buildStagingRestorePlan({
  dataDirectory: "./artifacts/api-server/data",
  includeRows: true,
});

assert.equal(report.ok, true);
assert.equal(report.planned_row_count, EXPECTED_PLAN_ROWS);
assert.equal(report.source_lineage?.length, EXPECTED_PLAN_ROWS);
assert.deepEqual(
  (report.write_readiness?.blockers || []).map((blocker) => blocker?.code),
  ["ADDITIVE_STAGING_WRITER_NOT_IMPLEMENTED"],
);

const schema = snapshot.value || snapshot;

const rows = report.rows || {};
const plannedTables = resolveInsertOrder(
  Object.keys(rows).filter(
    (tableName) => Array.isArray(rows[tableName]) && rows[tableName].length > 0,
  ),
  schema,
);

const pool = new Pool({
  connectionString,
  max: 1,
  options: "-c default_transaction_read_only=on",
});

const client = await pool.connect();

try {
  await assertTargetIdentity(client);

  const baseline = await readBaseline(client);

  assert.equal(
    baseline.auditFingerprint,
    EXPECTED_AUDIT_FINGERPRINT,
    "staging audit baseline changed",
  );

  assert.equal(
    baseline.stateFingerprint,
    EXPECTED_BASELINE_FINGERPRINT,
    "staging target baseline changed",
  );

  let preparedRows = 0;

  for (const tableName of plannedTables) {
    for (const row of rows[tableName]) {
      prepareStrictInsert(tableName, row, schema);
      preparedRows += 1;
    }
  }

  assert.equal(preparedRows, EXPECTED_PLAN_ROWS);

  const rehearsal =
    process.env.FAWRI_STAGING_RESTORE_REHEARSAL === "1";

  if (!rehearsal) {
    console.log(
      JSON.stringify(
        {
          ok: true,
          mode: "staging_restore_writer_preflight_only",
          database: "neondb",
          current_owner_id: currentOwnerId,
          planned_rows: report.planned_row_count,
          prepared_strict_inserts: preparedRows,
          baseline_fingerprint: baseline.stateFingerprint,
          audit_fingerprint: baseline.auditFingerprint,
          conflict_policy: "STRICT_INSERT_NO_ON_CONFLICT",
          transaction_mode: "READ_ONLY",
          writes_performed: false,
          commit_capable: false,
          staging_writer_blocker_preserved: true,
        },
        null,
        2,
      ),
    );
  } else {
    await client.query("ROLLBACK");
    await client.query("SET default_transaction_read_only = off");
    await client.query("BEGIN");

    let insertedRows = 0;

    try {
      const lockedBaseline = await readBaseline(client);

      assert.equal(
        lockedBaseline.auditFingerprint,
        EXPECTED_AUDIT_FINGERPRINT,
        "staging audit baseline changed before rehearsal inserts",
      );

      assert.equal(
        lockedBaseline.stateFingerprint,
        EXPECTED_BASELINE_FINGERPRINT,
        "staging target baseline changed before rehearsal inserts",
      );

      await assertTargetIdentity(client);

      for (const tableName of plannedTables) {
        for (const row of rows[tableName]) {
          const statement = prepareStrictInsert(
            tableName,
            row,
            schema,
          );

          const result = await client.query(
            statement.sql,
            statement.values,
          );

          assert.equal(
            result.rowCount,
            1,
            `strict insert failed for ${tableName}`,
          );

          insertedRows += 1;
        }
      }

      assert.equal(insertedRows, EXPECTED_PLAN_ROWS);

      const ownerCount = await client.query(`
        SELECT COUNT(*)::integer AS count
          FROM admin_profiles
         WHERE role = 'owner_admin'
      `);

      assert.equal(
        ownerCount.rows[0].count,
        1,
        "rehearsal produced an invalid owner count",
      );

      const legacyOwner = await client.query(
        `SELECT COUNT(*)::integer AS count
           FROM accounts
          WHERE id = $1`,
        [legacyOwnerId],
      );

      assert.equal(
        legacyOwner.rows[0].count,
        0,
        "legacy owner became an active account",
      );

      for (const [tableName, expectedCount] of Object.entries(
        report.table_counts,
      )) {
        const actual = await client.query(
          `SELECT COUNT(*)::integer AS count
             FROM ${quoteIdentifier(tableName)}`,
        );

        const baselineCount =
          lockedBaseline.counts[tableName] ?? 0;

        assert.equal(
          actual.rows[0].count,
          baselineCount + expectedCount,
          `${tableName} additive count mismatch`,
        );
      }

      await client.query("ROLLBACK");

      console.log(
        JSON.stringify(
          {
            ok: true,
            mode: "neon_staging_restore_forced_rollback_rehearsal",
            database: "neondb",
            planned_rows: EXPECTED_PLAN_ROWS,
            inserted_inside_transaction: insertedRows,
            transaction_committed: false,
            transaction_rolled_back: true,
            persistent_writes_performed: false,
            commit_capable: false,
            owner_count_during_rehearsal: 1,
            legacy_owner_active: false,
            staging_writer_blocker_preserved: true,
          },
          null,
          2,
        ),
      );
    } catch (error) {
      try {
        await client.query("ROLLBACK");
      } catch {}
      throw error;
    }
  }
} finally {
  client.release();
  await pool.end();
}
