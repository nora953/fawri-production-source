import assert from 'node:assert/strict';
import pg from 'pg';

const { Pool } = pg;

const apply = process.argv.includes('--apply');
const connectionString = String(process.env.DATABASE_URL || '').trim();
const expectedDatabase = String(process.env.FAWRI_EXPECT_DATABASE || '').trim();
const cashierStaffId = String(process.env.FAWRI_CASHIER_DISCOUNT_STAFF_ID || '').trim();
const managerStaffId = String(process.env.FAWRI_CASHIER_OVERRIDE_MANAGER_ID || '').trim();
const expectedCashierName = String(process.env.FAWRI_EXPECT_CASHIER_DISPLAY_NAME || '').trim();
const expectedManagerName = String(process.env.FAWRI_EXPECT_MANAGER_DISPLAY_NAME || '').trim();
const cashierMaxPercentageBps = Number(process.env.FAWRI_CASHIER_MAX_PERCENTAGE_BPS || '');
const allowApply = process.env.FAWRI_ALLOW_CASHIER_DISCOUNT_AUTHORITY_ACTIVATION === '1';

assert.ok(connectionString, 'DATABASE_URL is required');
assert.ok(expectedDatabase, 'FAWRI_EXPECT_DATABASE is required');
assert.ok(cashierStaffId, 'FAWRI_CASHIER_DISCOUNT_STAFF_ID is required');
assert.ok(managerStaffId, 'FAWRI_CASHIER_OVERRIDE_MANAGER_ID is required');
assert.notEqual(cashierStaffId, managerStaffId, 'cashier and manager must be different staff members');
assert.ok(expectedCashierName, 'FAWRI_EXPECT_CASHIER_DISPLAY_NAME is required');
assert.ok(expectedManagerName, 'FAWRI_EXPECT_MANAGER_DISPLAY_NAME is required');
assert.ok(
  Number.isSafeInteger(cashierMaxPercentageBps) &&
    cashierMaxPercentageBps >= 0 &&
    cashierMaxPercentageBps <= 10_000,
  'FAWRI_CASHIER_MAX_PERCENTAGE_BPS must be an integer from 0 to 10000',
);
if (apply) {
  assert.equal(
    allowApply,
    true,
    'FAWRI_ALLOW_CASHIER_DISCOUNT_AUTHORITY_ACTIVATION=1 is required with --apply',
  );
}

const pool = new Pool({ connectionString, max: 1 });
const client = await pool.connect();

const desired = {
  cashier: {
    enabled: true,
    max_percentage_bps: cashierMaxPercentageBps,
    max_amount_minor: null,
    can_approve_override: false,
    permissions: ['sale.discount'],
  },
  manager: {
    enabled: true,
    max_percentage_bps: 0,
    max_amount_minor: null,
    can_approve_override: true,
    permissions: ['sale.discount', 'sale.discount_override'],
  },
};

function asNumber(value) {
  return value === null || value === undefined ? null : Number(value);
}

async function loadState(target, lockStaff = false) {
  const database = String((await target.query('SELECT current_database() AS name')).rows[0]?.name || '');
  assert.equal(database, expectedDatabase, `connected database ${database} does not match FAWRI_EXPECT_DATABASE`);

  const migrationRecorded = Boolean((await target.query(
    `SELECT 1
       FROM drizzle.__drizzle_migrations
      WHERE created_at::bigint = 1787715600000
      LIMIT 1`,
  )).rowCount);
  assert.equal(migrationRecorded, true, 'canonical 0015_cashier_discount_override_authority is not recorded');

  const staffRows = (await target.query(
    `SELECT id, merchant_id, display_name, role, status, revoked_at, version
       FROM merchant_cashier_staff
      WHERE id = ANY($1::text[])
      ORDER BY id${lockStaff ? ' FOR UPDATE' : ''}`,
    [[cashierStaffId, managerStaffId]],
  )).rows;
  assert.equal(staffRows.length, 2, 'expected cashier and manager staff rows were not both found');

  const cashier = staffRows.find((row) => row.id === cashierStaffId);
  const manager = staffRows.find((row) => row.id === managerStaffId);
  assert.ok(cashier, 'cashier staff row was not found');
  assert.ok(manager, 'manager staff row was not found');
  assert.equal(cashier.display_name, expectedCashierName, 'cashier display name changed');
  assert.equal(manager.display_name, expectedManagerName, 'manager display name changed');
  assert.equal(cashier.role, 'cashier', 'expected cashier staff role is not cashier');
  assert.equal(manager.role, 'manager', 'expected manager staff role is not manager');
  assert.equal(cashier.status, 'active', 'cashier staff member is not active');
  assert.equal(manager.status, 'active', 'manager staff member is not active');
  assert.equal(cashier.revoked_at, null, 'cashier staff member is revoked');
  assert.equal(manager.revoked_at, null, 'manager staff member is revoked');
  assert.equal(cashier.merchant_id, manager.merchant_id, 'cashier and manager do not belong to the same merchant');
  const merchantId = String(cashier.merchant_id);

  const liveStationCount = Number((await target.query(
    `SELECT COUNT(DISTINCT st.id)::int AS count
       FROM merchant_cashier_stations AS st
       JOIN cashier_station_credentials AS c
         ON c.merchant_id = st.merchant_id
        AND c.station_id = st.id
        AND c.status = 'active'
        AND c.expires_at > now()
      WHERE st.merchant_id = $1
        AND st.status = 'active'
        AND st.revoked_at IS NULL
        AND st.paired_device_id IS NOT NULL`,
    [merchantId],
  )).rows[0]?.count || 0);
  assert.ok(liveStationCount > 0, 'merchant has no live paired cashier station');

  const permissionRows = (await target.query(
    `SELECT staff_id, permission
       FROM merchant_cashier_staff_permissions
      WHERE merchant_id = $1
        AND staff_id = ANY($2::text[])
        AND permission IN ('sale.discount','sale.discount_override')
      ORDER BY staff_id, permission`,
    [merchantId, [cashierStaffId, managerStaffId]],
  )).rows;
  const permissions = new Map([
    [cashierStaffId, []],
    [managerStaffId, []],
  ]);
  for (const row of permissionRows) permissions.get(row.staff_id)?.push(row.permission);

  const policyRows = (await target.query(
    `SELECT staff_id, enabled, max_percentage_bps, max_amount_minor,
            can_approve_override, version
       FROM merchant_cashier_staff_discount_policies
      WHERE merchant_id = $1 AND staff_id = ANY($2::text[])
      ORDER BY staff_id`,
    [merchantId, [cashierStaffId, managerStaffId]],
  )).rows;
  const policies = new Map(policyRows.map((row) => [row.staff_id, row]));

  const matches = (staffId, policy, desiredPolicy) => {
    const actualPermissions = [...(permissions.get(staffId) || [])].sort();
    const expectedPermissions = [...desiredPolicy.permissions].sort();
    return Boolean(
      policy &&
        policy.enabled === desiredPolicy.enabled &&
        Number(policy.max_percentage_bps) === desiredPolicy.max_percentage_bps &&
        asNumber(policy.max_amount_minor) === desiredPolicy.max_amount_minor &&
        policy.can_approve_override === desiredPolicy.can_approve_override &&
        JSON.stringify(actualPermissions) === JSON.stringify(expectedPermissions)
    );
  };

  const cashierReady = matches(cashierStaffId, policies.get(cashierStaffId), desired.cashier);
  const managerReady = matches(managerStaffId, policies.get(managerStaffId), desired.manager);

  return {
    database,
    merchantId,
    migrationRecorded,
    liveStationCount,
    cashier: {
      id: cashier.id,
      display_name: cashier.display_name,
      role: cashier.role,
      version: Number(cashier.version),
      current_permissions: permissions.get(cashierStaffId) || [],
      current_policy: policies.get(cashierStaffId) || null,
      desired: desired.cashier,
      ready: cashierReady,
    },
    manager: {
      id: manager.id,
      display_name: manager.display_name,
      role: manager.role,
      version: Number(manager.version),
      current_permissions: permissions.get(managerStaffId) || [],
      current_policy: policies.get(managerStaffId) || null,
      desired: desired.manager,
      ready: managerReady,
    },
    already_configured: cashierReady && managerReady,
  };
}

async function configureStaff(target, merchantId, staffId, policy) {
  await target.query(
    `DELETE FROM merchant_cashier_staff_permissions
      WHERE merchant_id = $1 AND staff_id = $2
        AND permission IN ('sale.discount','sale.discount_override')`,
    [merchantId, staffId],
  );
  for (const permission of policy.permissions) {
    await target.query(
      `INSERT INTO merchant_cashier_staff_permissions
         (merchant_id, staff_id, permission, granted_at)
       VALUES ($1,$2,$3,now())
       ON CONFLICT DO NOTHING`,
      [merchantId, staffId, permission],
    );
  }

  await target.query(
    `INSERT INTO merchant_cashier_staff_discount_policies
       (merchant_id, staff_id, enabled, max_percentage_bps,
        max_amount_minor, can_approve_override, version, created_at, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,1,now(),now())
     ON CONFLICT (merchant_id, staff_id) DO UPDATE
       SET enabled = EXCLUDED.enabled,
           max_percentage_bps = EXCLUDED.max_percentage_bps,
           max_amount_minor = EXCLUDED.max_amount_minor,
           can_approve_override = EXCLUDED.can_approve_override,
           version = merchant_cashier_staff_discount_policies.version + 1,
           updated_at = now()`,
    [
      merchantId,
      staffId,
      policy.enabled,
      policy.max_percentage_bps,
      policy.max_amount_minor,
      policy.can_approve_override,
    ],
  );

  await target.query(
    `UPDATE merchant_cashier_staff
        SET version = version + 1, updated_at = now()
      WHERE merchant_id = $1 AND id = $2`,
    [merchantId, staffId],
  );

  const allPermissions = (await target.query(
    `SELECT permission
       FROM merchant_cashier_staff_permissions
      WHERE merchant_id = $1 AND staff_id = $2
      ORDER BY permission`,
    [merchantId, staffId],
  )).rows.map((row) => row.permission);
  await target.query(
    `UPDATE cashier_operator_sessions
        SET permission_snapshot = $3::jsonb
      WHERE merchant_id = $1 AND staff_id = $2 AND status = 'active'`,
    [merchantId, staffId, JSON.stringify(allPermissions)],
  );
}

try {
  await client.query(apply ? 'BEGIN' : 'BEGIN READ ONLY');
  if (apply) {
    await client.query("SELECT pg_advisory_xact_lock(hashtext('fawri_cashier_discount_authority_activation'))");
  }

  const before = await loadState(client, apply);
  if (!apply || before.already_configured) {
    await client.query('ROLLBACK');
    process.stdout.write(`${JSON.stringify({
      ok: true,
      mode: apply ? 'cashier_discount_authority_activation_noop' : 'cashier_discount_authority_activation_preflight',
      database: before.database,
      merchant_id: before.merchantId,
      migration_recorded: before.migrationRecorded,
      live_station_count: before.liveStationCount,
      already_configured: before.already_configured,
      ready_to_apply: !before.already_configured,
      cashier: before.cashier,
      manager: before.manager,
      database_writes_performed: false,
    }, null, 2)}\n`);
    process.exit(0);
  }

  await configureStaff(client, before.merchantId, cashierStaffId, desired.cashier);
  await configureStaff(client, before.merchantId, managerStaffId, desired.manager);
  await client.query('COMMIT');

  await client.query('BEGIN READ ONLY');
  const after = await loadState(client, false);
  await client.query('ROLLBACK');
  assert.equal(after.already_configured, true, 'discount authority activation did not reach the intended state');

  process.stdout.write(`${JSON.stringify({
    ok: true,
    mode: 'cashier_discount_authority_activation_apply',
    database: after.database,
    merchant_id: after.merchantId,
    migration_recorded: after.migrationRecorded,
    live_station_count: after.liveStationCount,
    already_configured: true,
    ready_to_apply: false,
    cashier: after.cashier,
    manager: after.manager,
    database_writes_performed: true,
  }, null, 2)}\n`);
} catch (error) {
  try {
    await client.query('ROLLBACK');
  } catch {}
  throw error;
} finally {
  client.release();
  await pool.end();
}
