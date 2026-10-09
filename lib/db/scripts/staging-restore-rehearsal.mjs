import assert from "node:assert/strict";
import pg from "pg";

import {
  buildStagingRestorePlan,
  currentOwnerId,
  legacyOwnerId,
} from "../../../scripts/lib/staging-restore-policy.mjs";

import {
  prepareInsert,
  resolveInsertOrder,
} from "./lib/migration-write.mjs";

const { Pool } = pg;

const connectionString = process.env.DATABASE_URL;
assert.ok(connectionString, "DATABASE_URL is required");
assert.equal(
  process.env.FAWRI_ALLOW_STAGING_RESTORE_REHEARSAL,
  "1",
  "FAWRI_ALLOW_STAGING_RESTORE_REHEARSAL=1 is required",
);

const target = new URL(connectionString);
assert.ok(
  target.hostname === "127.0.0.1" || target.hostname === "localhost",
  "rehearsal only permits local PostgreSQL",
);
assert.equal(
  target.pathname.replace(/^\//, ""),
  "fawri_ci",
  "rehearsal only permits the disposable fawri_ci database",
);

const { report, snapshot } = buildStagingRestorePlan({
  dataDirectory: "./artifacts/api-server/data",
  includeRows: true,
});

assert.equal(report.ok, true, "staging restore plan contains errors");
assert.equal(report.mode, "additive_staging_restore_dry_run");
assert.equal(report.planned_row_count, 317);
assert.equal(report.source_lineage?.length, 317);
assert.deepEqual(
  report.write_readiness?.blockers?.map((item) => item.code),
  ["ADDITIVE_STAGING_WRITER_NOT_IMPLEMENTED"],
  "unexpected staging restore blockers",
);

const rows = report.rows;
const serialized = JSON.stringify(rows);

assert.equal(
  (rows.accounts || []).some((row) => row.id === currentOwnerId),
  false,
  "current owner must remain an external precondition",
);
assert.equal(
  (rows.admin_profiles || []).some(
    (row) => row.id === currentOwnerId || row.account_id === currentOwnerId,
  ),
  false,
  "current owner profile must not be imported",
);

const schema = snapshot.value || snapshot;
for (const [tableName, tableRows] of Object.entries(rows)) {
  const table = schema.tables?.[`public.${tableName}`];
  assert.ok(table, `missing snapshot table ${tableName}`);

  for (const foreignKey of Object.values(table.foreignKeys || {})) {
    for (const row of tableRows) {
      for (const field of foreignKey.columnsFrom || []) {
        assert.notEqual(
          row[field],
          legacyOwnerId,
          `legacy owner remains in FK ${tableName}.${field}`,
        );
      }
    }
  }
}

const plannedTables = resolveInsertOrder(
  Object.entries(rows)
    .filter(([, values]) => Array.isArray(values) && values.length > 0)
    .map(([table]) => table),
  schema,
);

const pool = new Pool({ connectionString, max: 1 });
let client;
let transactionOpen = false;

try {
  client = await pool.connect();

  const identity = await client.query(
    "SELECT current_database() AS database, current_user AS user, inet_server_addr()::text AS host, inet_server_port() AS port",
  );

  assert.equal(identity.rows[0]?.database, "fawri_ci");
  const serverHost = identity.rows[0]?.host;
  assert.ok(
    serverHost === "127.0.0.1" ||
      serverHost === "127.0.0.1/32" ||
      serverHost === "::1" ||
      serverHost === "::1/128",
    "connected PostgreSQL server is not loopback",
  );

  const owner = await client.query(
    `SELECT a.id, a.state, p.role, p.enabled
       FROM accounts a
       JOIN admin_profiles p ON p.account_id = a.id
      WHERE a.id = $1`,
    [currentOwnerId],
  );

  assert.equal(owner.rowCount, 1, "local current-owner fixture is missing");
  assert.equal(owner.rows[0].state, "closed");
  assert.equal(owner.rows[0].role, "owner_admin");
  assert.equal(owner.rows[0].enabled, false);

  const legacyOwner = await client.query(
    "SELECT COUNT(*)::integer AS count FROM accounts WHERE id = $1",
    [legacyOwnerId],
  );
  assert.equal(legacyOwner.rows[0].count, 0);

  await client.query("BEGIN");
  transactionOpen = true;

  let inserted = 0;
  for (const tableName of plannedTables) {
    for (const row of rows[tableName]) {
      const statement = prepareInsert(tableName, row, schema);
      const result = await client.query(statement.sql, statement.values);
      inserted += result.rowCount;
    }
  }

  assert.equal(inserted, 317, "first rehearsal pass did not insert exactly 317 rows");

  const additiveExtras = {
    accounts: 1,
    admin_profiles: 1,
  };

  let reconciledRows = 0;

  for (const tableName of plannedTables) {
    const expected =
      (rows[tableName]?.length || 0) + (additiveExtras[tableName] || 0);

    const result = await client.query(
      `SELECT COUNT(*)::integer AS count FROM "${tableName}"`,
    );

    assert.equal(
      result.rows[0].count,
      expected,
      `${tableName} row count does not match additive rehearsal plan`,
    );

    reconciledRows += rows[tableName]?.length || 0;
  }

  assert.equal(reconciledRows, 317);

  const ownerCount = await client.query(
    `SELECT COUNT(*)::integer AS count
       FROM admin_profiles
      WHERE role = 'owner_admin'`,
  );
  assert.equal(ownerCount.rows[0].count, 1, "rehearsal must contain exactly one owner");

  const forbiddenSecurityRows = {};
  for (const table of [
    "account_sessions",
    "trusted_devices",
    "login_attempts",
    "auth_otp_challenges",
  ]) {
    const result = await client.query(`SELECT COUNT(*)::integer AS count FROM "${table}"`);
    forbiddenSecurityRows[table] = result.rows[0].count;
    assert.equal(result.rows[0].count, 0, `${table} must remain empty`);
  }

  const secondPass = {};
  let secondPassInserted = 0;
  for (const tableName of plannedTables) {
    let count = 0;
    for (const row of rows[tableName]) {
      const statement = prepareInsert(tableName, row, schema);
      const result = await client.query(statement.sql, statement.values);
      count += result.rowCount;
    }
    secondPass[tableName] = count;
    secondPassInserted += count;
  }

  assert.equal(
    secondPassInserted,
    0,
    "second rehearsal pass must be an idempotent no-op",
  );

  await client.query("ROLLBACK");
  transactionOpen = false;

  console.log(JSON.stringify({
    ok: true,
    mode: "local_additive_staging_restore_rehearsal",
    database: identity.rows[0].database,
    server: `${identity.rows[0].host}:${identity.rows[0].port}`,
    planned_rows: report.planned_row_count,
    first_pass_inserted: inserted,
    reconciled_rows: reconciledRows,
    second_pass_inserted: secondPassInserted,
    owner_count_during_rehearsal: ownerCount.rows[0].count,
    legacy_owner_fk_hits: 0,
    forbidden_security_rows: forbiddenSecurityRows,
    transaction_committed: false,
    transaction_rolled_back: true,
    neon_capable: false,
    staging_writer_blocker_preserved:
      serialized.length > 0 &&
      report.write_readiness.blockers.some(
        (item) => item.code === "ADDITIVE_STAGING_WRITER_NOT_IMPLEMENTED",
      ),
  }, null, 2));
} catch (error) {
  if (transactionOpen && client) {
    try {
      await client.query("ROLLBACK");
    } catch {}
  }
  throw error;
} finally {
  if (client) client.release();
  await pool.end();
}
