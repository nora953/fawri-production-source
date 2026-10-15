import assert from 'node:assert/strict';
import pg from 'pg';

const { Pool } = pg;
const connectionString = String(process.env.DATABASE_URL || '').trim();
assert.ok(connectionString, 'DATABASE_URL is required');

const pool = new Pool({ connectionString, max: 1 });
const client = await pool.connect();
const findings = [];

function add(severity, code, message, rows = []) {
  findings.push({ severity, code, message, count: rows.length, rows });
}

async function tableExists(name) {
  const result = await client.query(
    `SELECT EXISTS (
       SELECT 1
       FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name = $1
     ) AS present`,
    [name],
  );
  return result.rows[0]?.present === true;
}

try {
  await client.query('BEGIN READ ONLY');

  const [{ current_database: database }] = (
    await client.query('SELECT current_database() AS current_database')
  ).rows;

  if (await tableExists('cashier_station_credentials')) {
    const expiredActiveCredentials = (
      await client.query(`
        SELECT id, merchant_id, station_id, device_id, version, status, expires_at
        FROM cashier_station_credentials
        WHERE status = 'active' AND expires_at <= NOW()
        ORDER BY expires_at ASC, id ASC
      `)
    ).rows;
    if (expiredActiveCredentials.length) {
      add(
        'warning',
        'CASHIER_ACTIVE_STATION_CREDENTIAL_EXPIRED',
        'Cashier station credentials remain marked active after their expiration time.',
        expiredActiveCredentials,
      );
    }
  }

  if (await tableExists('cashier_station_pairing_challenges')) {
    const expiredActivePairings = (
      await client.query(`
        SELECT id, merchant_id, station_id, status, expires_at
        FROM cashier_station_pairing_challenges
        WHERE status = 'active' AND expires_at <= NOW()
        ORDER BY expires_at ASC, id ASC
      `)
    ).rows;
    if (expiredActivePairings.length) {
      add(
        'warning',
        'CASHIER_ACTIVE_PAIRING_CHALLENGE_EXPIRED',
        'Cashier pairing challenges remain marked active after expiration.',
        expiredActivePairings,
      );
    }
  }

  if (await tableExists('cashier_operator_sessions')) {
    const expiredActiveSessions = (
      await client.query(`
        SELECT id, merchant_id, station_id, staff_id, shift_id, status, expires_at, last_seen_at
        FROM cashier_operator_sessions
        WHERE status = 'active' AND expires_at <= NOW()
        ORDER BY expires_at ASC, id ASC
      `)
    ).rows;
    if (expiredActiveSessions.length) {
      add(
        'warning',
        'CASHIER_ACTIVE_OPERATOR_SESSION_EXPIRED',
        'Cashier operator sessions remain marked active after expiration.',
        expiredActiveSessions,
      );
    }
  }

  if (
    (await tableExists('cashier_operator_sessions')) &&
    (await tableExists('cashier_shifts')) &&
    (await tableExists('merchant_cashier_staff')) &&
    (await tableExists('merchant_cashier_stations'))
  ) {
    const invalidActiveOperatorState = (
      await client.query(`
        SELECT
          s.id,
          s.merchant_id,
          s.station_id,
          s.staff_id,
          s.shift_id,
          s.expires_at,
          sh.status AS shift_status,
          st.status AS staff_status,
          cs.status AS station_status
        FROM cashier_operator_sessions s
        JOIN cashier_shifts sh
          ON sh.id = s.shift_id AND sh.merchant_id = s.merchant_id
        JOIN merchant_cashier_staff st
          ON st.id = s.staff_id AND st.merchant_id = s.merchant_id
        JOIN merchant_cashier_stations cs
          ON cs.id = s.station_id AND cs.merchant_id = s.merchant_id
        WHERE s.status = 'active'
          AND (
            s.expires_at <= NOW()
            OR sh.status <> 'open'
            OR st.status <> 'active'
            OR cs.status <> 'active'
          )
        ORDER BY s.id ASC
      `)
    ).rows;
    if (invalidActiveOperatorState.length) {
      add(
        'warning',
        'CASHIER_OPERATOR_ACTIVE_STATE_CONTRADICTION',
        'Active cashier operator sessions are expired or reference a non-open/non-active shift, staff member, or station.',
        invalidActiveOperatorState,
      );
    }
  }

  if (
    (await tableExists('cashier_station_credentials')) &&
    (await tableExists('merchant_cashier_stations'))
  ) {
    const credentialVersionMismatch = (
      await client.query(`
        SELECT
          c.id,
          c.merchant_id,
          c.station_id,
          c.device_id,
          c.version AS credential_version,
          s.credential_version AS station_credential_version,
          c.expires_at
        FROM cashier_station_credentials c
        JOIN merchant_cashier_stations s
          ON s.id = c.station_id AND s.merchant_id = c.merchant_id
        WHERE c.status = 'active'
          AND (
            s.status <> 'active'
            OR c.version <> s.credential_version
            OR s.paired_device_id IS DISTINCT FROM c.device_id
          )
        ORDER BY c.id ASC
      `)
    ).rows;
    if (credentialVersionMismatch.length) {
      add(
        'warning',
        'CASHIER_ACTIVE_CREDENTIAL_STATION_MISMATCH',
        'Active station credentials do not match the current station status/version/device binding.',
        credentialVersionMismatch,
      );
    }
  }

  if (await tableExists('subscriptions')) {
    const staleSubscriptionExpiry = (
      await client.query(`
        SELECT id, merchant_id, plan_name, status, expires_at, updated_at
        FROM subscriptions
        WHERE expires_at <= NOW()
          AND status IN ('active', 'replies_exhausted')
        ORDER BY expires_at ASC, id ASC
      `)
    ).rows;
    if (staleSubscriptionExpiry.length) {
      add(
        'review',
        'SUBSCRIPTION_STATUS_STALE_AFTER_EXPIRY',
        'Subscriptions have passed expires_at while retaining a pre-expiry operational status; verify lazy-refresh/reconciliation behavior.',
        staleSubscriptionExpiry,
      );
    }
  }

  const statusExpiryTables = (
    await client.query(`
      SELECT c1.table_name
      FROM information_schema.columns c1
      JOIN information_schema.columns c2
        ON c1.table_schema = c2.table_schema
       AND c1.table_name = c2.table_name
      WHERE c1.table_schema = 'public'
        AND c1.column_name = 'status'
        AND c2.column_name = 'expires_at'
      ORDER BY c1.table_name
    `)
  ).rows.map((row) => String(row.table_name));

  const counts = findings.reduce(
    (acc, finding) => {
      acc[finding.severity] = (acc[finding.severity] || 0) + 1;
      return acc;
    },
    { critical: 0, warning: 0, review: 0 },
  );

  await client.query('ROLLBACK');

  process.stdout.write(`${JSON.stringify({
    ok: counts.critical === 0 && counts.warning === 0,
    mode: 'read_only_postgres_runtime_consistency_audit',
    database,
    counts,
    status_expiry_tables: statusExpiryTables,
    findings,
    database_writes_performed: false,
  }, null, 2)}\n`);

  if (counts.critical > 0 || counts.warning > 0) process.exitCode = 2;
} catch (error) {
  try { await client.query('ROLLBACK'); } catch {}
  throw error;
} finally {
  client.release();
  await pool.end();
}
