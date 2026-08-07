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

export async function applyPaymentDecision(client, input) {
  const locked = await client.query(
    "SELECT * FROM orders WHERE merchant_id=$1 AND id=$2 FOR UPDATE",
    [input.merchantId, input.orderId],
  );
  const order = locked.rows[0];
  if (!order) throw new Error("ORDER_NOT_FOUND");
  if (Number(order.version) !== input.expectedVersion) {
    throw new Error("ORDER_VERSION_CONFLICT");
  }
  if (["paid", "failed"].includes(order.payment_status)) {
    throw new Error("ORDER_ALREADY_TERMINAL");
  }

  const resultingVersion = input.expectedVersion + 1;
  await client.query(
    `INSERT INTO order_payment_decisions(
       id,merchant_id,order_id,operation,payment_channel,outcome,
       previous_order_status,resulting_order_status,previous_payment_status,resulting_payment_status,
       actor_type,actor_account_id,actor_session_fingerprint,request_id,reason,
       expected_version,resulting_version,source_file,source_sha256,migration_batch_id,decided_at
     ) VALUES(
       $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,
       $11,$12,$13,$14,$15,$16,$17,$18,$19,$20,clock_timestamp()
     )`,
    [
      input.decisionId,
      input.merchantId,
      input.orderId,
      input.operation,
      input.paymentChannel,
      input.outcome,
      order.status,
      input.resultingOrderStatus,
      order.payment_status,
      input.outcome,
      input.actorType,
      input.actorAccountId ?? null,
      input.actorSessionFingerprint ?? null,
      input.requestId ?? null,
      input.reason ?? null,
      input.expectedVersion,
      resultingVersion,
      input.sourceFile ?? null,
      input.sourceSha256 ?? null,
      input.migrationBatchId ?? null,
    ],
  );

  await client.query(
    `UPDATE orders
     SET status=$3,
         payment_status=$4,
         version=$5,
         payment_verified_at=CASE WHEN $4='paid' THEN clock_timestamp() ELSE NULL END,
         payment_verified_by_account_id=CASE WHEN $4='paid' THEN $6 ELSE NULL END,
         payment_rejection_reason=CASE WHEN $4='failed' THEN COALESCE($7,'rejected') ELSE NULL END,
         updated_at=clock_timestamp()
     WHERE merchant_id=$1 AND id=$2`,
    [
      input.merchantId,
      input.orderId,
      input.resultingOrderStatus,
      input.outcome,
      resultingVersion,
      input.actorAccountId ?? null,
      input.reason ?? null,
    ],
  );

  await client.query(
    `INSERT INTO order_terminal_decision_links(merchant_id,order_id,decision_id,linked_at)
     VALUES($1,$2,$3,clock_timestamp())`,
    [input.merchantId, input.orderId, input.decisionId],
  );
  return resultingVersion;
}
