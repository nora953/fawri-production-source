import type { OperationalQueryTarget } from "./operationalPostgresAuthority";
import { OperationalPostgresAuthorityError } from "./operationalPostgresAuthority";
import { withAuthenticationTransaction } from "./authenticationPostgresAuthority";

type ScopeTarget = {
  login: string;
  active: string;
  pid: number;
  xid: string;
  isolation: string;
};

/**
 * Call immediately after BEGIN, before merchant/FK row locks or protected SQL.
 * The issuer commits on the separate authenticated pool before this resolves.
 * Caller retains the same leased primary client until COMMIT or ROLLBACK.
 * This function neither starts a transaction nor changes the caller's isolation.
 */
export async function issueMerchantTransactionScope(
  client: OperationalQueryTarget,
  merchantIdValue: string,
): Promise<void> {
  const merchantId = String(merchantIdValue || "").trim();
  if (!merchantId || merchantId.length > 200) {
    throw new OperationalPostgresAuthorityError(
      "OPERATIONAL_TENANT_INVALID", "merchant tenant is invalid", 400,
    );
  }
  const result = await client.query<ScopeTarget>(`SELECT
    session_user::text AS login, current_user::text AS active,
    pg_backend_pid() AS pid, txid_current()::text AS xid,
    current_setting('transaction_isolation') AS isolation`);
  const target = result.rows[0];
  if (!target || !target.login || target.login !== target.active
      || !Number.isSafeInteger(target.pid) || target.pid <= 0
      || !/^[1-9][0-9]*$/.test(target.xid)) {
    throw new OperationalPostgresAuthorityError(
      "OPERATIONAL_TENANT_SESSION_INVALID", "merchant database session is unavailable",
    );
  }
  // A separate connection commits the binding. Higher isolation snapshots
  // cannot reliably observe that row and must be rejected before any work.
  if (target.isolation !== "read committed") {
    throw new OperationalPostgresAuthorityError(
      "OPERATIONAL_TENANT_ISOLATION_UNSUPPORTED", "merchant transaction requires Read Committed",
    );
  }
  await withAuthenticationTransaction(async issuer => {
    await issuer.query(
      "SELECT fawri_security.issue_scope($1::name,$2::integer,$3::bigint,$4::text)",
      [target.login, target.pid, target.xid, merchantId],
    );
  });
}
