import {
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

/**
 * Deterministic lifecycle housekeeping for short-lived cashier authorities.
 *
 * This routine never closes shifts, changes staff/station state, or touches
 * commerce data. It only materializes time-derived terminal states that the
 * authorization queries already enforce with expires_at > now().
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
    const credentials = await client.query(
      `UPDATE cashier_station_credentials
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
      station_credentials_expired: affectedRows(credentials),
      operator_sessions_expired: affectedRows(sessions),
    };
  });
}
