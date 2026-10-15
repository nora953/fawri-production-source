import assert from 'node:assert/strict';
import pg from 'pg';

const { Pool } = pg;
const connectionString = String(process.env.DATABASE_URL || '').trim();
assert.ok(connectionString, 'DATABASE_URL is required');

const requiredTables = [
  'merchant_cashier_staff',
  'merchant_cashier_staff_permissions',
  'merchant_cashier_stations',
  'cashier_station_pairing_challenges',
  'cashier_station_credentials',
  'cashier_shifts',
  'cashier_operator_sessions',
  'cashier_operation_attribution',
];

const requiredColumns = new Map([
  ['merchant_cashier_staff', ['merchant_id', 'display_name', 'role', 'status', 'pin_hash', 'version']],
  ['merchant_cashier_staff_permissions', ['merchant_id', 'staff_id', 'permission']],
  ['merchant_cashier_stations', ['merchant_id', 'branch_key', 'paired_device_id', 'offline_inventory_authority', 'credential_version']],
  ['cashier_station_pairing_challenges', ['merchant_id', 'station_id', 'code_hash', 'status', 'expires_at']],
  ['cashier_station_credentials', ['merchant_id', 'station_id', 'device_id', 'token_hash', 'version', 'status']],
  ['cashier_shifts', ['merchant_id', 'station_id', 'staff_id', 'status', 'started_at']],
  ['cashier_operator_sessions', ['merchant_id', 'station_id', 'staff_id', 'shift_id', 'token_hash', 'permission_snapshot', 'status']],
  ['cashier_operation_attribution', ['merchant_id', 'operation_id', 'sale_id', 'operation_kind', 'station_id', 'staff_id', 'shift_id', 'device_id', 'occurred_at']],
]);

const pool = new Pool({ connectionString, max: 1 });
const client = await pool.connect();

try {
  await client.query('BEGIN READ ONLY');
  const [{ current_database: database }] = (await client.query('SELECT current_database() AS current_database')).rows;

  const tableRows = (await client.query(
    `SELECT table_name
       FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name = ANY($1::text[])`,
    [requiredTables],
  )).rows;
  const presentTables = new Set(tableRows.map(row => String(row.table_name)));
  const missingTables = requiredTables.filter(table => !presentTables.has(table));

  const columnRows = (await client.query(
    `SELECT table_name, column_name
       FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = ANY($1::text[])`,
    [requiredTables],
  )).rows;
  const columns = new Map();
  for (const row of columnRows) {
    const table = String(row.table_name);
    const values = columns.get(table) || new Set();
    values.add(String(row.column_name));
    columns.set(table, values);
  }

  const missingColumns = [];
  for (const [table, names] of requiredColumns) {
    const present = columns.get(table) || new Set();
    for (const column of names) {
      if (!present.has(column)) missingColumns.push(`${table}.${column}`);
    }
  }

  await client.query('ROLLBACK');
  const ready = missingTables.length === 0 && missingColumns.length === 0;
  process.stdout.write(`${JSON.stringify({
    ok: ready,
    mode: 'read_only_cashier_staff_authority_readiness',
    database,
    required_table_count: requiredTables.length,
    missing_tables: missingTables,
    missing_columns: missingColumns,
    database_writes_performed: false,
  }, null, 2)}\n`);
  if (!ready) process.exitCode = 2;
} catch (error) {
  try { await client.query('ROLLBACK'); } catch {}
  throw error;
} finally {
  client.release();
  await pool.end();
}
