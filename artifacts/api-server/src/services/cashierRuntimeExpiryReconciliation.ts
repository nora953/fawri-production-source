import crypto from "node:crypto";
import {
  operationalDatabasePool,
  operationalPostgresAuthorityRequired,
  withOperationalTransaction,
} from "./operationalPostgresAuthority";

export type CashierRuntimeExpiryReconciliation = {
  pairing_challenges_expired: number;
  station_credentials_expired: number;
  operator_sessions_expired: number;
};

function affectedRows(result: { rowCount?: number | null }): number {
  return Number.isSafeInteger(result.rowCount) && Number(result.rowCount) > 0
    ? Number(result.rowCount)
    : 0;
}

function hashStationToken(value: string): string {
  return crypto.createHash("sha256").update(value, "utf8").digest("hex");
}

/**
 * Restore/roll the compatibility expiry metadata for the currently paired
 * station credential before normal authentication runs.
 *
 * Explicit revocation remains authoritative: only active credentials and
 * legacy rows that became `expired` solely because of the old wall-clock
 * policy can be restored, and only while the station/device/version binding
 * still matches the current server authority.
 */
export async function refreshDurableCashierStationCredentialAuthoritative(input: {
  stationToken: unknown;
  deviceId: unknown;
}): Promise<void> {
  if (!operationalPostgresAuthorityRequired()) return;

  const stationToken = String(input.stationToken ?? "").trim();
  const deviceId = String(input.deviceId ?? "").trim();
  if (!stationToken || !deviceId) return;

  const pool = await operationalDatabasePool();
  await pool.query(
    `UPDATE cashier_station_credentials AS c
        SET status = 'active',
            revoked_at = NULL,
            expires_at = now() + interval '180 days'
       FROM merchant_cashier_stations AS s
      WHERE c.token_hash = $1
        AND c.device_id = $2
        AND c.status IN ('active', 'expired')
        AND s.id = c.station_id
        AND s.merchant_id = c.merchant_id
        AND s.status = 'active'
        AND s.paired_device_id = $2
        AND s.credential_version = c.version`,
    [hashStationToken(stationToken), deviceId],
  );
}

/**
 * Deterministic lifecycle housekeeping for short-lived cashier authorities.
 *
 * Pairing challenges and operator sessions remain time-bound. Station
 * credentials are durable bindings: their explicit status/version/station
 * state is authoritative, so wall-clock age alone never ends a pairing.
 */
export async function reconcileCashierRuntimeExpirationsAuthoritative(): Promise<CashierRuntimeExpiryReconciliation> {
  if (!operationalPostgresAuthorityRequired()) {
    return {
      pairing_challenges_expired: 0,
      station_credentials_expired: 0,
      operator_sessions_expired: 0,
    };
  }

  return withOperationalTransaction(async (client) => {
    const pairing = await client.query(
      `UPDATE cashier_station_pairing_challenges
          SET status = 'expired'
        WHERE status = 'active'
          AND expires_at <= now()`,
    );
    const sessions = await client.query(
      `UPDATE cashier_operator_sessions
          SET status = 'expired'
        WHERE status = 'active'
          AND expires_at <= now()`,
    );

    return {
      pairing_challenges_expired: affectedRows(pairing),
      station_credentials_expired: 0,
      operator_sessions_expired: affectedRows(sessions),
    };
  });
}
