export {
  withTransaction,
  setTenantContext,
  setAuditedAdminContext,
  issueOtpChallenge,
  consumeOtpChallenge,
  revokeAllSessions,
  trustDevice,
  revokeTrustedDevice,
  claimDurableJobs,
  enqueueInboundAtomically,
  reserveBaseReply,
  refundBaseReply,
  suppressQueuedAutoReplies,
  applyPaymentDecision,
  mutateInventory,
  legacyDecisionId,
  approvedKnowledgeSearchSql,
} from "./cross-lane-transactions-base.mjs";

export async function rotateSession(client, input) {
  const locked = await client.query(
    `SELECT s.*,a.security_version AS current_security_version
     FROM account_sessions s
     JOIN accounts a ON a.id=s.account_id
     WHERE s.id=$1
     FOR UPDATE OF s,a`,
    [input.sessionId],
  );
  const row = locked.rows[0];
  if (
    !row ||
    row.status !== "active" ||
    Number(row.security_version) !== Number(row.current_security_version)
  ) {
    throw new Error("SESSION_NOT_ROTATABLE");
  }
  await client.query(
    `INSERT INTO account_sessions(
       id,account_id,kind,status,token_hash,tenant_id,device_fingerprint_hash,
       device_label,session_version,security_version,role_snapshot,permission_snapshot,
       created_at,last_seen_at,last_activity_at,idle_expires_at,absolute_expires_at,rotate_after
     ) VALUES(
       $1,$2,$3,'active',$4,$5,$6,$7,$8,$9,$10,$11::jsonb,
       clock_timestamp(),clock_timestamp(),clock_timestamp(),
       clock_timestamp()+interval '30 minutes',
       clock_timestamp()+interval '7 days',
       clock_timestamp()+interval '15 minutes'
     )`,
    [
      input.successorId,
      row.account_id,
      row.kind,
      input.successorTokenHash,
      row.tenant_id,
      row.device_fingerprint_hash,
      row.device_label,
      Number(row.session_version) + 1,
      row.current_security_version,
      row.role_snapshot,
      JSON.stringify(Array.isArray(row.permission_snapshot) ? row.permission_snapshot : []),
    ],
  );
  await client.query(
    `UPDATE account_sessions
     SET status='revoked',revoked_at=clock_timestamp(),revoke_reason='rotated',replaced_by_session_id=$2
     WHERE id=$1`,
    [input.sessionId, input.successorId],
  );
}
