import crypto from "node:crypto";

export async function withTransaction(client, operation) {
  await client.query("BEGIN");
  try {
    const result = await operation();
    await client.query("COMMIT");
    return result;
  } catch (error) {
    try { await client.query("ROLLBACK"); } catch {}
    throw error;
  }
}

export async function setTenantContext(client, merchantId) {
  if (!merchantId) throw new Error("TENANT_CONTEXT_REQUIRED");
  await client.query("SELECT set_config('fawri.tenant_id',$1,true),set_config('fawri.admin_audit_id','',true),set_config('fawri.admin_account_id','',true)", [merchantId]);
}

export async function setAuditedAdminContext(client, input) {
  const minutes = Math.min(Math.max(Number(input.durationMinutes || 5), 1), 30);
  await client.query(
    `INSERT INTO database_admin_access_audits(id,admin_account_id,merchant_id,reason_code,request_hash,started_at,expires_at)
     VALUES($1,$2,$3,$4,$5,clock_timestamp(),clock_timestamp()+($6::text||' minutes')::interval)`,
    [input.auditId,input.adminAccountId,input.merchantId ?? null,input.reasonCode,input.requestHash,minutes],
  );
  await client.query("SELECT set_config('fawri.tenant_id','',true),set_config('fawri.admin_audit_id',$1,true),set_config('fawri.admin_account_id',$2,true)", [input.auditId,input.adminAccountId]);
}

export async function issueOtpChallenge(client, input) {
  const current = await client.query(
    `SELECT id FROM auth_otp_challenges WHERE target_hash=$1 AND purpose=$2 AND used_at IS NULL AND revoked_at IS NULL AND superseded_by_challenge_id IS NULL FOR UPDATE`,
    [input.targetHash,input.purpose],
  );
  const oldIds = current.rows.map((row) => String(row.id));
  if (oldIds.length) await client.query("UPDATE auth_otp_challenges SET revoked_at=clock_timestamp() WHERE id=ANY($1::text[])", [oldIds]);
  await client.query(
    `INSERT INTO auth_otp_challenges(id,account_id,target_hash,code_hash,ip_hash,purpose,created_at,expires_at,resend_after,attempts,max_attempts)
     VALUES($1,$2,$3,$4,$5,$6,clock_timestamp(),clock_timestamp()+($7::text||' seconds')::interval,clock_timestamp()+($8::text||' seconds')::interval,0,$9)`,
    [input.id,input.accountId ?? null,input.targetHash,input.codeHash,input.ipHash,input.purpose,input.ttlSeconds,input.resendSeconds,input.maxAttempts],
  );
  if (oldIds.length) await client.query("UPDATE auth_otp_challenges SET superseded_by_challenge_id=$2 WHERE id=ANY($1::text[])", [oldIds,input.id]);
}

export async function consumeOtpChallenge(client, id, codeHash) {
  const locked = await client.query("SELECT *,clock_timestamp() AS db_now FROM auth_otp_challenges WHERE id=$1 FOR UPDATE", [id]);
  const row = locked.rows[0];
  if (!row) return "invalid";
  if (row.used_at || row.revoked_at) return "revoked";
  if (new Date(row.expires_at) <= new Date(row.db_now)) return "expired";
  if (Number(row.attempts) >= Number(row.max_attempts)) return "exhausted";
  if (row.code_hash !== codeHash) {
    await client.query("UPDATE auth_otp_challenges SET attempts=attempts+1,revoked_at=CASE WHEN attempts+1>=max_attempts THEN clock_timestamp() ELSE revoked_at END WHERE id=$1", [id]);
    return "invalid";
  }
  await client.query("UPDATE auth_otp_challenges SET attempts=attempts+1,used_at=clock_timestamp() WHERE id=$1", [id]);
  return "used";
}

export async function rotateSession(client, input) {
  const locked = await client.query(
    `SELECT s.*,a.security_version AS current_security_version FROM account_sessions s JOIN accounts a ON a.id=s.account_id WHERE s.id=$1 FOR UPDATE OF s,a`,
    [input.sessionId],
  );
  const row = locked.rows[0];
  if (!row || row.status !== "active" || Number(row.security_version) !== Number(row.current_security_version)) throw new Error("SESSION_NOT_ROTATABLE");
  await client.query(
    `INSERT INTO account_sessions(id,account_id,kind,status,token_hash,tenant_id,device_fingerprint_hash,device_label,session_version,security_version,role_snapshot,permission_snapshot,created_at,last_seen_at,last_activity_at,idle_expires_at,absolute_expires_at,rotate_after)
     VALUES($1,$2,$3,'active',$4,$5,$6,$7,$8,$9,$10,$11,clock_timestamp(),clock_timestamp(),clock_timestamp(),clock_timestamp()+interval '30 minutes',clock_timestamp()+interval '7 days',clock_timestamp()+interval '15 minutes')`,
    [input.successorId,row.account_id,row.kind,input.successorTokenHash,row.tenant_id,row.device_fingerprint_hash,row.device_label,Number(row.session_version)+1,row.current_security_version,row.role_snapshot,row.permission_snapshot],
  );
  await client.query("UPDATE account_sessions SET status='revoked',revoked_at=clock_timestamp(),revoke_reason='rotated',replaced_by_session_id=$2 WHERE id=$1", [input.sessionId,input.successorId]);
}

export async function revokeAllSessions(client, accountId, reason = "logout_all") {
  await client.query("SELECT id FROM accounts WHERE id=$1 FOR UPDATE", [accountId]);
  const revoked = await client.query("UPDATE account_sessions SET status='revoked',revoked_at=clock_timestamp(),revoke_reason=$2 WHERE account_id=$1 AND status='active'", [accountId,reason]);
  await client.query("UPDATE accounts SET security_version=security_version+1,session_version=session_version+1,updated_at=clock_timestamp() WHERE id=$1", [accountId]);
  return revoked.rowCount || 0;
}

export async function trustDevice(client, input) {
  await client.query("SELECT id FROM accounts WHERE id=$1 FOR UPDATE", [input.accountId]);
  const rows = await client.query("SELECT trust_slot FROM trusted_devices WHERE account_id=$1 AND status='trusted' ORDER BY trust_slot FOR UPDATE", [input.accountId]);
  const used = new Set(rows.rows.map((row) => Number(row.trust_slot)));
  const slot = [1,2].find((value) => !used.has(value));
  if (!slot) throw new Error("TRUSTED_DEVICE_CAP_REACHED");
  await client.query(
    `INSERT INTO trusted_devices(id,account_id,kind,device_fingerprint_hash,label,status,trust_slot,first_seen_at,last_seen_at,trusted_at,trusted_by_account_id)
     VALUES($1,$2,$3,$4,$5,'trusted',$6,clock_timestamp(),clock_timestamp(),clock_timestamp(),$7)`,
    [input.id,input.accountId,input.kind,input.fingerprintHash,input.label,slot,input.trustedByAccountId],
  );
  return slot;
}

export async function revokeTrustedDevice(client, accountId, fingerprintHash, actorId) {
  const changed = await client.query("UPDATE trusted_devices SET status='revoked',trust_slot=NULL,revoked_at=clock_timestamp(),revoked_by_account_id=$3 WHERE account_id=$1 AND device_fingerprint_hash=$2 AND status<>'revoked'", [accountId,fingerprintHash,actorId]);
  if (changed.rowCount) await client.query("UPDATE account_sessions SET status='revoked',revoked_at=clock_timestamp(),revoke_reason='device_revoked' WHERE account_id=$1 AND device_fingerprint_hash=$2 AND status='active'", [accountId,fingerprintHash]);
  return changed.rowCount || 0;
}

export async function claimDurableJobs(client, workerId, limit = 10, leaseSeconds = 30) {
  const bounded = Math.min(Math.max(Math.trunc(limit),1),100);
  const claimed = await client.query(
    `WITH candidate AS (
       SELECT id FROM background_jobs
       WHERE attempts<max_attempts AND ((status IN ('queued','retry') AND available_at<=clock_timestamp()) OR (status='processing' AND lease_expires_at<=clock_timestamp()))
       ORDER BY priority DESC,available_at,created_at FOR UPDATE SKIP LOCKED LIMIT $1
     )
     UPDATE background_jobs j SET status='processing',locked_at=clock_timestamp(),locked_by=$2,lease_expires_at=clock_timestamp()+($3::text||' seconds')::interval,lease_generation=COALESCE(lease_generation,0)+1,attempts=attempts+1,updated_at=clock_timestamp()
     FROM candidate WHERE j.id=candidate.id RETURNING j.*`,
    [bounded,workerId,leaseSeconds],
  );
  return claimed.rows;
}

export async function enqueueInboundAtomically(client, input) {
  const duplicate = await client.query("SELECT id FROM channel_inbound_events WHERE provider=$1 AND external_event_id=$2 FOR UPDATE", [input.provider,input.externalEventId]);
  if (duplicate.rowCount) return "duplicate";
  await client.query(
    `INSERT INTO background_jobs(id,type,dedupe_key,merchant_id,payload_hash,status,settings_version,available_at,created_at,updated_at)
     VALUES($1,$2,$3,$4,$5,'queued',$6,clock_timestamp(),clock_timestamp(),clock_timestamp())`,
    [input.jobId,input.jobType,input.dedupeKey,input.merchantId,input.payloadHash,input.settingsVersion ?? null],
  );
  await client.query("INSERT INTO background_job_payloads(job_id,merchant_id,ciphertext,key_id,payload_sha256,created_at) VALUES($1,$2,$3,$4,$5,clock_timestamp())", [input.jobId,input.merchantId,input.payloadCiphertext,input.payloadKeyId,input.payloadHash]);
  await client.query("INSERT INTO channel_inbound_events(id,merchant_id,channel_id,provider,external_event_id,payload_hash,enqueue_job_id,received_at,enqueue_committed_at) VALUES($1,$2,$3,$4,$5,$6,$7,clock_timestamp(),clock_timestamp())", [input.eventId,input.merchantId,input.channelId,input.provider,input.externalEventId,input.payloadHash,input.jobId]);
  return "inserted";
}

export async function reserveBaseReply(client, input) {
  const locked = await client.query("SELECT * FROM subscriptions WHERE id=$1 AND merchant_id=$2 FOR UPDATE", [input.subscriptionId,input.merchantId]);
  const row = locked.rows[0];
  if (!row || Number(row.base_replies_remaining) < 1) throw new Error("REPLY_CREDIT_UNAVAILABLE");
  const before = Number(row.base_replies_remaining), after = before - 1;
  await client.query("UPDATE subscriptions SET base_replies_remaining=$3,base_replies_used=base_replies_used+1,version=version+1,updated_at=clock_timestamp() WHERE id=$1 AND merchant_id=$2", [input.subscriptionId,input.merchantId,after]);
  await client.query("INSERT INTO reply_ledger(id,merchant_id,subscription_id,direction,amount,reason_code,external_event_id,balance_after,created_at) VALUES($1,$2,$3,'debit',1,'reply_reservation',$4,$5,clock_timestamp())", [input.ledgerId,input.merchantId,input.subscriptionId,input.externalEventId,after]);
  await client.query("INSERT INTO reply_reservations(id,merchant_id,inbound_event_id,external_event_id,subscription_id,debit_ledger_id,debit_source,amount,balance_before_debit,balance_after_debit,status,reserved_at) VALUES($1,$2,$3,$4,$5,$6,'base',1,$7,$8,'reserved',clock_timestamp())", [input.reservationId,input.merchantId,input.inboundEventId,input.externalEventId,input.subscriptionId,input.ledgerId,before,after]);
  return { before, after };
}

export async function refundBaseReply(client, input) {
  const reservation = await client.query("SELECT * FROM reply_reservations WHERE id=$1 AND merchant_id=$2 FOR UPDATE", [input.reservationId,input.merchantId]);
  const row = reservation.rows[0];
  if (!row) throw new Error("RESERVATION_NOT_FOUND");
  const prior = await client.query("SELECT state FROM reply_refunds WHERE reservation_id=$1 FOR UPDATE", [input.reservationId]);
  if (prior.rowCount) return prior.rows[0].state;
  await client.query("INSERT INTO reply_refunds(id,merchant_id,reservation_id,confirmed_failure_code,state,requested_at) VALUES($1,$2,$3,$4,'pending',clock_timestamp())", [input.refundId,input.merchantId,input.reservationId,input.failureCode]);
  const subscription = await client.query("SELECT * FROM subscriptions WHERE id=$1 AND merchant_id=$2 FOR UPDATE", [row.subscription_id,input.merchantId]);
  const after = Number(subscription.rows[0].base_replies_remaining) + Number(row.amount);
  await client.query("UPDATE subscriptions SET base_replies_remaining=$3,base_replies_used=GREATEST(base_replies_used-$4,0),version=version+1,updated_at=clock_timestamp() WHERE id=$1 AND merchant_id=$2", [row.subscription_id,input.merchantId,after,row.amount]);
  await client.query("INSERT INTO reply_ledger(id,merchant_id,subscription_id,direction,amount,reason_code,external_event_id,balance_after,created_at) VALUES($1,$2,$3,'credit',$4,'reply_refund',$5,$6,clock_timestamp())", [input.ledgerId,input.merchantId,row.subscription_id,row.amount,row.external_event_id,after]);
  await client.query("UPDATE reply_refunds SET state='refunded',credit_ledger_id=$2,balance_after_refund=$3,refunded_at=clock_timestamp() WHERE id=$1", [input.refundId,input.ledgerId,after]);
  await client.query("UPDATE reply_reservations SET status='refunded',refunded_at=clock_timestamp() WHERE id=$1", [input.reservationId]);
  return "refunded";
}

export async function suppressQueuedAutoReplies(client, merchantId, expectedVersion, jobType) {
  const settings = await client.query("SELECT version FROM merchant_settings WHERE merchant_id=$1 FOR UPDATE", [merchantId]);
  if (!settings.rowCount || Number(settings.rows[0].version) !== expectedVersion) throw new Error("SETTINGS_VERSION_CONFLICT");
  const next = expectedVersion + 1;
  await client.query("UPDATE merchant_settings SET auto_reply_enabled=false,version=$2,updated_at=clock_timestamp() WHERE merchant_id=$1", [merchantId,next]);
  const jobs = await client.query("UPDATE background_jobs SET status='completed',completed_at=clock_timestamp(),result=jsonb_build_object('suppressed',true,'credit_consumed',false,'settings_version',$3::integer),updated_at=clock_timestamp() WHERE merchant_id=$1 AND type=$2 AND status IN ('queued','retry')", [merchantId,jobType,next]);
  return { version: next, suppressed: jobs.rowCount || 0 };
}

export async function applyPaymentDecision(client, input) {
  const locked = await client.query("SELECT * FROM orders WHERE merchant_id=$1 AND id=$2 FOR UPDATE", [input.merchantId,input.orderId]);
  const order = locked.rows[0];
  if (!order) throw new Error("ORDER_NOT_FOUND");
  if (Number(order.version) !== input.expectedVersion) throw new Error("ORDER_VERSION_CONFLICT");
  if (["paid","failed"].includes(order.payment_status)) throw new Error("ORDER_ALREADY_TERMINAL");
  const resultingVersion = input.expectedVersion + 1;
  await client.query(
    `INSERT INTO order_payment_decisions(id,merchant_id,order_id,operation,payment_channel,outcome,previous_order_status,resulting_order_status,previous_payment_status,resulting_payment_status,actor_type,actor_account_id,actor_session_fingerprint,request_id,reason,expected_version,resulting_version,source_file,source_sha256,migration_batch_id,decided_at)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$6,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,clock_timestamp())`,
    [input.decisionId,input.merchantId,input.orderId,input.operation,input.paymentChannel,input.outcome,order.status,input.resultingOrderStatus,order.payment_status,input.actorType,input.actorAccountId ?? null,input.actorSessionFingerprint ?? null,input.requestId ?? null,input.reason ?? null,input.expectedVersion,resultingVersion,input.sourceFile ?? null,input.sourceSha256 ?? null,input.migrationBatchId ?? null],
  );
  await client.query("UPDATE orders SET status=$3,payment_status=$4,version=$5,payment_verified_at=CASE WHEN $4='paid' THEN clock_timestamp() ELSE NULL END,payment_verified_by_account_id=CASE WHEN $4='paid' THEN $6 ELSE NULL END,payment_rejection_reason=CASE WHEN $4='failed' THEN COALESCE($7,'rejected') ELSE NULL END,updated_at=clock_timestamp() WHERE merchant_id=$1 AND id=$2", [input.merchantId,input.orderId,input.resultingOrderStatus,input.outcome,resultingVersion,input.actorAccountId ?? null,input.reason ?? null]);
  await client.query("INSERT INTO order_terminal_decision_links(merchant_id,order_id,decision_id,linked_at) VALUES($1,$2,$3,clock_timestamp())", [input.merchantId,input.orderId,input.decisionId]);
  return resultingVersion;
}

export async function mutateInventory(client, input) {
  const table = input.variantId ? "product_variants" : "products";
  const id = input.variantId || input.productId;
  const locked = await client.query(`SELECT quantity,version FROM ${table} WHERE merchant_id=$1 AND id=$2 FOR UPDATE`, [input.merchantId,id]);
  const row = locked.rows[0];
  if (!row) throw new Error("CATALOG_TARGET_NOT_FOUND");
  if (Number(row.version) !== input.expectedVersion) throw new Error("CATALOG_VERSION_CONFLICT");
  const before = Number(row.quantity), after = input.type === "set" ? Number(input.value) : before + Number(input.value);
  if (!Number.isSafeInteger(after) || after < 0) throw new Error("CATALOG_STOCK_INVALID");
  const next = input.expectedVersion + 1;
  await client.query(`UPDATE ${table} SET quantity=$3,version=$4,updated_at=clock_timestamp() WHERE merchant_id=$1 AND id=$2`, [input.merchantId,id,after,next]);
  await client.query("INSERT INTO inventory_mutations(id,merchant_id,product_id,variant_id,mutation_type,before_quantity,after_quantity,expected_version,resulting_version,actor_type,actor_account_id,reason_code,idempotency_key_hash,request_hash,created_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,clock_timestamp())", [input.mutationId,input.merchantId,input.productId,input.variantId ?? null,input.type,before,after,input.expectedVersion,next,input.actorType,input.actorAccountId ?? null,input.reasonCode,input.idempotencyKeyHash,input.requestHash]);
  if (input.variantId) {
    await client.query("SELECT id FROM products WHERE merchant_id=$1 AND id=$2 FOR UPDATE", [input.merchantId,input.productId]);
    await client.query("UPDATE products SET quantity=s.total,updated_at=clock_timestamp() FROM (SELECT COALESCE(SUM(quantity),0)::integer total FROM product_variants WHERE merchant_id=$1 AND product_id=$2)s WHERE products.merchant_id=$1 AND products.id=$2 AND products.variant_stock_mode=true", [input.merchantId,input.productId]);
  }
  return { before, after, version: next };
}

export function legacyDecisionId(parts) {
  return `legacy-payment:${crypto.createHash("sha256").update(parts.join("\u0000")).digest("hex").slice(0,32)}`;
}

export const approvedKnowledgeSearchSql = `
WITH tenant_candidates AS MATERIALIZED (
  SELECT e.id,e.knowledge_kind,e.knowledge_id,e.embedding
  FROM knowledge_embeddings e
  LEFT JOIN saved_answers s ON e.saved_answer_id=s.id AND e.merchant_id=s.merchant_id
  LEFT JOIN learned_answers l ON e.learned_answer_id=l.id AND e.merchant_id=l.merchant_id
  WHERE e.merchant_id=$1
    AND e.embedding_model=$2
    AND ((e.knowledge_kind='saved_answer' AND s.active=true AND s.source='merchant_approved')
      OR (e.knowledge_kind='learned_answer' AND l.source='merchant_approved' AND l.approval_status='approved' AND l.safe_to_auto_reply=true))
)
SELECT id,knowledge_kind,knowledge_id,
  (SELECT SUM(a.value*b.value) FROM unnest(embedding) WITH ORDINALITY a(value,n)
    JOIN unnest($3::real[]) WITH ORDINALITY b(value,n) USING(n)) AS dot_score
FROM tenant_candidates
ORDER BY dot_score DESC NULLS LAST
LIMIT $4`;
