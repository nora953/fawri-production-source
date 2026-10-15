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
const expectedDatabase = String(process.env.FAWRI_EXPECT_DATABASE || '').trim();
assert.ok(expectedDatabase, 'FAWRI_EXPECT_DATABASE is required');

const pool = new Pool({ connectionString, max: 1 });
const client = await pool.connect();

try {
  await client.query('BEGIN READ ONLY');

  const database = String((
    await client.query('SELECT current_database() AS current_database')
  ).rows[0]?.current_database || '');
  assert.equal(
    database,
    expectedDatabase,
    `connected database ${database} does not match FAWRI_EXPECT_DATABASE`,
  );

  const migrationTable = String((
    await client.query("SELECT to_regclass('drizzle.__drizzle_migrations')::text AS migration_table")
  ).rows[0]?.migration_table || '');
  const migrationRecorded = migrationTable
    ? Boolean((
        await client.query(
          'SELECT 1 FROM "drizzle"."__drizzle_migrations" WHERE created_at::bigint = $1 LIMIT 1',
          [CASHIER_DISCOUNT_OVERRIDE_MIGRATION_WHEN],
        )
      ).rowCount)
    : false;

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
    .filter((row) => row.table_name === 'merchant_cashier_staff_discount_policies')
    .map((row) => String(row.column_name));
  const overrideColumns = columns
    .filter((row) => row.table_name === 'merchant_cashier_discount_override_approvals')
    .map((row) => String(row.column_name));

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
  const constraintNames = constraintRows.map((row) => String(row.conname));
  const permissionDefinition = String(
    constraintRows.find(
      (row) => row.conname === 'merchant_cashier_staff_permissions_permission_check',
    )?.definition || '',
  );

  const schemaReadiness = evaluateCashierDiscountOverrideReadiness({
    migration_recorded: migrationRecorded,
    permission_constraint_supports_discount:
      permissionDefinition.includes('sale.discount') &&
      permissionDefinition.includes('sale.discount_override'),
    policy_table_present: Boolean(tables.policy_table_present),
    override_table_present: Boolean(tables.override_table_present),
    policy_columns: policyColumns,
    override_columns: overrideColumns,
    constraint_names: constraintNames,
  });

  const operational = schemaReadiness.ok
    ? (
        await client.query(`
          WITH active_staff AS (
            SELECT merchant_id, id, role
            FROM merchant_cashier_staff
            WHERE status = 'active' AND revoked_at IS NULL
          ),
          discount_operators AS (
            SELECT DISTINCT s.merchant_id, s.id
            FROM active_staff AS s
            JOIN merchant_cashier_staff_permissions AS p
              ON p.merchant_id = s.merchant_id
             AND p.staff_id = s.id
             AND p.permission = 'sale.discount'
            JOIN merchant_cashier_staff_discount_policies AS d
              ON d.merchant_id = s.merchant_id
             AND d.staff_id = s.id
             AND d.enabled = true
          ),
          override_managers AS (
            SELECT DISTINCT s.merchant_id, s.id
            FROM active_staff AS s
            JOIN merchant_cashier_staff_permissions AS p
              ON p.merchant_id = s.merchant_id
             AND p.staff_id = s.id
             AND p.permission = 'sale.discount_override'
            JOIN merchant_cashier_staff_discount_policies AS d
              ON d.merchant_id = s.merchant_id
             AND d.staff_id = s.id
             AND d.enabled = true
             AND d.can_approve_override = true
            WHERE s.role = 'manager'
          ),
          live_stations AS (
            SELECT DISTINCT st.merchant_id, st.id
            FROM merchant_cashier_stations AS st
            JOIN cashier_station_credentials AS c
              ON c.merchant_id = st.merchant_id
             AND c.station_id = st.id
             AND c.status = 'active'
             AND c.expires_at > now()
            WHERE st.status = 'active'
              AND st.revoked_at IS NULL
              AND st.paired_device_id IS NOT NULL
          ),
          cashier_merchants AS (
            SELECT merchant_id FROM active_staff
            UNION
            SELECT merchant_id FROM live_stations
          ),
          distinct_override_pairs AS (
            SELECT DISTINCT o.merchant_id
            FROM discount_operators AS o
            JOIN override_managers AS m
              ON m.merchant_id = o.merchant_id
             AND m.id <> o.id
          ),
          live_ready_merchants AS (
            SELECT DISTINCT p.merchant_id
            FROM distinct_override_pairs AS p
            JOIN live_stations AS st ON st.merchant_id = p.merchant_id
          ),
          active_sessions AS (
            SELECT merchant_id, staff_id, permission_snapshot
            FROM cashier_operator_sessions
            WHERE status = 'active'
              AND revoked_at IS NULL
              AND expires_at > now()
          )
          SELECT
            (SELECT COUNT(DISTINCT merchant_id)::int FROM cashier_merchants) AS cashier_merchant_count,
            (SELECT COUNT(*)::int FROM active_staff) AS active_staff_count,
            (SELECT COUNT(*)::int FROM merchant_cashier_staff_permissions WHERE permission = 'sale.discount') AS sale_discount_permission_grant_count,
            (SELECT COUNT(*)::int FROM merchant_cashier_staff_permissions WHERE permission = 'sale.discount_override') AS sale_discount_override_permission_grant_count,
            (SELECT COUNT(*)::int FROM merchant_cashier_staff_discount_policies WHERE enabled = true) AS enabled_policy_count,
            (SELECT COUNT(*)::int FROM merchant_cashier_staff_discount_policies WHERE enabled = true AND can_approve_override = true) AS override_capable_policy_count,
            (SELECT COUNT(*)::int FROM discount_operators) AS active_discount_operator_count,
            (SELECT COUNT(*)::int FROM override_managers) AS eligible_override_manager_count,
            (SELECT COUNT(*)::int FROM live_stations) AS live_station_count,
            (SELECT COUNT(*)::int FROM distinct_override_pairs) AS merchants_with_distinct_override_pair,
            (SELECT COUNT(*)::int FROM live_ready_merchants) AS manager_override_live_ready_merchant_count,
            (SELECT COUNT(*)::int FROM active_sessions) AS active_operator_session_count,
            (SELECT COUNT(*)::int FROM active_sessions WHERE permission_snapshot @> '["sale.discount"]'::jsonb) AS active_discount_operator_session_count
        `)
      ).rows[0]
    : null;

  await client.query('ROLLBACK');

  const counts = operational
    ? Object.fromEntries(
        Object.entries(operational).map(([key, value]) => [key, Number(value || 0)]),
      )
    : null;

  const blockers = [];
  if (!schemaReadiness.ok) blockers.push('canonical_0015_schema_not_ready');
  if (counts) {
    if (counts.sale_discount_permission_grant_count === 0) {
      blockers.push('no_sale_discount_permission_grants');
    }
    if (counts.sale_discount_override_permission_grant_count === 0) {
      blockers.push('no_sale_discount_override_permission_grants');
    }
    if (counts.enabled_policy_count === 0) blockers.push('no_enabled_discount_policies');
    if (counts.eligible_override_manager_count === 0) {
      blockers.push('no_eligible_override_manager');
    }
    if (counts.merchants_with_distinct_override_pair === 0) {
      blockers.push('no_distinct_requester_approver_pair');
    }
    if (counts.live_station_count === 0) blockers.push('no_live_paired_station');
  }

  const operationallyReady = Boolean(
    schemaReadiness.ok &&
      counts &&
      counts.manager_override_live_ready_merchant_count > 0,
  );

  process.stdout.write(`${JSON.stringify({
    ok: schemaReadiness.ok,
    mode: 'read_only_cashier_discount_override_live_readiness',
    database,
    schema_ready: schemaReadiness.ok,
    operationally_ready: operationallyReady,
    counts,
    blockers,
    note:
      counts &&
      counts.active_operator_session_count > 0 &&
      counts.active_discount_operator_session_count === 0 &&
      counts.sale_discount_permission_grant_count > 0
        ? 'active operator sessions may need re-login after permission grants so their permission snapshot includes sale.discount'
        : null,
    sensitive_staff_identity_exposed: false,
    database_writes_performed: false,
  }, null, 2)}\n`);

  if (!schemaReadiness.ok && !reportOnly) process.exitCode = 2;
} catch (error) {
  try {
    await client.query('ROLLBACK');
  } catch {}
  throw error;
} finally {
  client.release();
  await pool.end();
}
