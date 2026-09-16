import assert from 'node:assert/strict';
import pg from 'pg';
import {
  CASHIER_DISCOUNT_OVERRIDE_MIGRATION_WHEN,
  evaluateCashierDiscountOverrideReadiness,
} from './lib/cashier-discount-override-readiness.mjs';

const { Pool } = pg;
const reportOnly = process.argv.includes('--report');
const connectionString = String(process.env.DATABASE_URL || '').trim();
assert.ok(connectionString, 'DATABASE_URL is required');

const pool = new Pool({ connectionString, max: 1 });
const client = await pool.connect();

try {
  await client.query('BEGIN READ ONLY');

  const [{ current_database: database }] = (
    await client.query('SELECT current_database() AS current_database')
  ).rows;

  const migrationTable = (
    await client.query("SELECT to_regclass('drizzle.__drizzle_migrations')::text AS migration_table")
  ).rows[0]?.migration_table;
  let migrationRecorded = false;
  if (migrationTable) {
    migrationRecorded = Boolean((
      await client.query(
        'SELECT 1 FROM "drizzle"."__drizzle_migrations" WHERE created_at::bigint = $1 LIMIT 1',
        [CASHIER_DISCOUNT_OVERRIDE_MIGRATION_WHEN],
      )
    ).rowCount);
  }

  const tables = (
    await client.query(`
      SELECT
        to_regclass('public.merchant_cashier_staff_discount_policies') IS NOT NULL AS policy_table_present,
        to_regclass('public.merchant_cashier_discount_override_approvals') IS NOT NULL AS override_table_present
    `)
  ).rows[0];

  const columns = (
    await client.query(`
      SELECT table_name, column_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name IN (
          'merchant_cashier_staff_discount_policies',
          'merchant_cashier_discount_override_approvals'
        )
      ORDER BY table_name, ordinal_position
    `)
  ).rows;
  const policyColumns = columns
    .filter(row => row.table_name === 'merchant_cashier_staff_discount_policies')
    .map(row => String(row.column_name));
  const overrideColumns = columns
    .filter(row => row.table_name === 'merchant_cashier_discount_override_approvals')
    .map(row => String(row.column_name));

  const constraintRows = (
    await client.query(`
      SELECT conname, pg_get_constraintdef(oid) AS definition
      FROM pg_constraint
      WHERE connamespace = 'public'::regnamespace
        AND conrelid IN (
          COALESCE(to_regclass('public.merchant_cashier_staff_permissions'), 0::oid),
          COALESCE(to_regclass('public.merchant_cashier_staff_discount_policies'), 0::oid),
          COALESCE(to_regclass('public.merchant_cashier_discount_override_approvals'), 0::oid)
        )
      ORDER BY conname
    `)
  ).rows;
  const constraintNames = constraintRows.map(row => String(row.conname));
  const permissionConstraint = constraintRows.find(
    row => row.conname === 'merchant_cashier_staff_permissions_permission_check',
  );
  const permissionDefinition = String(permissionConstraint?.definition || '');
  const permissionConstraintSupportsDiscount =
    permissionDefinition.includes('sale.discount') &&
    permissionDefinition.includes('sale.discount_override');

  const policyCount = tables.policy_table_present
    ? Number((await client.query(
        'SELECT COUNT(*)::int AS count FROM merchant_cashier_staff_discount_policies',
      )).rows[0]?.count || 0)
    : null;
  const approvalCount = tables.override_table_present
    ? Number((await client.query(
        'SELECT COUNT(*)::int AS count FROM merchant_cashier_discount_override_approvals',
      )).rows[0]?.count || 0)
    : null;

  await client.query('ROLLBACK');

  const evaluated = evaluateCashierDiscountOverrideReadiness({
    migration_recorded: migrationRecorded,
    permission_constraint_supports_discount: permissionConstraintSupportsDiscount,
    policy_table_present: Boolean(tables.policy_table_present),
    override_table_present: Boolean(tables.override_table_present),
    policy_columns: policyColumns,
    override_columns: overrideColumns,
    constraint_names: constraintNames,
  });

  process.stdout.write(`${JSON.stringify({
    ...evaluated,
    mode: 'read_only_cashier_discount_override_readiness',
    database,
    migration_tag: '0015_cashier_discount_override_authority',
    migration_when: CASHIER_DISCOUNT_OVERRIDE_MIGRATION_WHEN,
    policy_row_count: policyCount,
    approval_row_count: approvalCount,
    database_writes_performed: false,
  }, null, 2)}\n`);

  if (!evaluated.ok && !reportOnly) process.exitCode = 2;
} catch (error) {
  try { await client.query('ROLLBACK'); } catch {}
  throw error;
} finally {
  client.release();
  await pool.end();
}
