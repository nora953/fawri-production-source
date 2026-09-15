import assert from "node:assert/strict";
import crypto from "node:crypto";
import test from "node:test";

const DATABASE_URL = String(process.env.DATABASE_URL || "").trim();

if (DATABASE_URL) {
  const parsed = new URL(DATABASE_URL);
  assert.ok(
    parsed.hostname === "127.0.0.1" || parsed.hostname === "localhost",
    "provider-identifier deletion regression only permits local PostgreSQL",
  );
  assert.equal(
    parsed.pathname.replace(/^\//, ""),
    "fawri_ci",
    "provider-identifier deletion regression only permits the fawri_ci database",
  );
}

function randomPhone(): string {
  return `07${String(crypto.randomInt(0, 1_000_000_000)).padStart(9, "0")}`;
}

function suffix(): string {
  return crypto.randomUUID().replace(/-/g, "").slice(0, 12);
}

test(
  "irreversible merchant deletion replaces raw provider identifiers with internal deletion-safe linkage",
  { skip: !DATABASE_URL },
  async (t) => {
    Object.assign(process.env, {
      NODE_ENV: "test",
      FAWRI_OPERATIONAL_POSTGRES_AUTHORITY: "required",
      FAWRI_PASSWORD_SALT:
        "provider-identifier-deletion-test-password-salt-over-thirty-two-characters",
    });

    const [
      { pool },
      { hashPassword },
      merchantAccounts,
      merchantManagement,
    ] = await Promise.all([
      import("@workspace/db"),
      import("../src/services/authPasswordService.js"),
      import("../src/services/postgresMerchantAccountAuthority.js"),
      import("../src/services/postgresMerchantManagementAuthority.js"),
    ]);

    const proof = suffix();
    const merchantPhone = randomPhone();
    const adminPhone = randomPhone();
    const adminId = `provider-delete-admin-${proof}`;
    const subscriptionId = `provider-delete-subscription-${proof}`;
    const channelId = `provider-delete-channel-${proof}`;
    const jobId = `provider-delete-job-${proof}`;
    const inboundId = `provider-delete-inbound-${proof}`;
    const debitLedgerId = `provider-delete-debit-${proof}`;
    const creditLedgerId = `provider-delete-credit-${proof}`;
    const reservationId = `provider-delete-reservation-${proof}`;
    const refundId = `provider-delete-refund-${proof}`;
    const deliveryId = `provider-delete-delivery-${proof}`;
    const rawPageId = `raw-meta-page-${proof}`;
    const rawProviderEventId = `meta:${rawPageId}:mid.${proof}`;
    const rawProviderMessageId = `provider-message-${proof}`;
    let merchantId = "";

    t.after(async () => {
      await pool.end();
    });

    const collisions = await pool.query(
      "SELECT id FROM accounts WHERE phone = ANY($1::text[]) LIMIT 1",
      [[merchantPhone, adminPhone]],
    );
    assert.equal(collisions.rows.length, 0);

    await pool.query(
      `INSERT INTO accounts (
         id, kind, phone, password_hash, state, language,
         phone_verified, phone_verified_at, created_at, updated_at
       ) VALUES ($1, 'admin', $2, $3, 'active', 'en', true, now(), now(), now())`,
      [adminId, adminPhone, hashPassword("ProviderDeletionAdmin9!")],
    );
    await pool.query(
      `INSERT INTO admin_profiles (
         id, account_id, profile_kind, display_name, role,
         enabled, must_change_password, created_at, updated_at
       ) VALUES ($1, $1, 'admin', $2, 'owner_admin', true, false, now(), now())`,
      [adminId, `Provider Deletion Owner ${proof}`],
    );

    const merchant = await merchantAccounts.upsertPendingMerchantAuthoritative({
      phone: merchantPhone,
      passwordHash: hashPassword("ProviderDeletionMerchant9!"),
      ownerName: `Provider Deletion Merchant ${proof}`,
      storeName: `Provider Deletion Store ${proof}`,
      activityType: "retail",
      language: "en",
      requestedPlan: "silver",
    });
    merchantId = merchant.account.id;
    await merchantAccounts.markMerchantOtpVerifiedAuthoritative(merchantId);
    await pool.query(
      `UPDATE merchants
          SET status = 'approved',
              account_status = 'approved',
              onboarding_status = 'channel_connected',
              updated_at = now()
        WHERE id = $1`,
      [merchantId],
    );

    await pool.query(
      `INSERT INTO subscriptions (
         id, merchant_id, plan_name, status, price_iqd, billing_anchor_day,
         base_reply_limit, base_replies_used, base_replies_remaining,
         addon_replies_remaining, auto_reply_enabled, starts_at, expires_at,
         version, metadata, created_at, updated_at
       ) VALUES (
         $1, $2, 'silver', 'active', 25000, 15,
         100, 1, 99,
         0, true, now() - interval '1 day', now() + interval '30 days',
         1, '{}'::jsonb, now(), now()
       )`,
      [subscriptionId, merchantId],
    );
    await pool.query(
      `INSERT INTO merchant_channels (
         id, merchant_id, platform, status, version,
         external_account_id, external_account_name, page_id, page_name,
         metadata, connected_at, created_at, updated_at
       ) VALUES (
         $1, $2, 'messenger', 'connected', 1,
         $3, 'Raw Meta Account', $4, 'Raw Meta Page',
         '{}'::jsonb, now(), now(), now()
       )`,
      [channelId, merchantId, `raw-account-${proof}`, rawPageId],
    );
    await pool.query(
      `INSERT INTO background_jobs (
         id, type, dedupe_key, merchant_id, payload_hash, priority, status,
         attempts, max_attempts, requeue_count, available_at,
         completed_at, created_at, updated_at
       ) VALUES (
         $1, 'meta.webhook.reply', $2, $3, NULL, 10, 'completed',
         1, 5, 0, now(), now(), now(), now()
       )`,
      [jobId, rawProviderEventId, merchantId],
    );
    await pool.query(
      `INSERT INTO channel_inbound_events (
         id, merchant_id, channel_id, provider, external_event_id,
         payload_hash, enqueue_job_id, received_at, enqueue_committed_at
       ) VALUES ($1,$2,$3,'messenger',$4,$5,$6,now(),now())`,
      [
        inboundId,
        merchantId,
        channelId,
        rawProviderEventId,
        crypto.createHash("sha256").update(`payload-${proof}`).digest("hex"),
        jobId,
      ],
    );
    await pool.query(
      `INSERT INTO reply_ledger (
         id, merchant_id, subscription_id, direction, amount, reason_code,
         external_event_id, message_id, balance_after, metadata, created_at
       ) VALUES
         ($1,$3,$4,'debit',1,'auto_reply',$5,$5,99,'{}'::jsonb,now()),
         ($2,$3,$4,'credit',1,'confirmed_failure_refund',$5,$5,100,'{}'::jsonb,now())`,
      [
        debitLedgerId,
        creditLedgerId,
        merchantId,
        subscriptionId,
        rawProviderEventId,
      ],
    );
    await pool.query(
      `INSERT INTO reply_reservations (
         id, merchant_id, inbound_event_id, external_event_id,
         subscription_id, reply_batch_id, debit_ledger_id, debit_source,
         amount, balance_before_debit, balance_after_debit, status,
         reserved_at, refunded_at
       ) VALUES (
         $1,$2,$3,$4,$5,NULL,$6,'base',1,100,99,'refunded',now(),now()
       )`,
      [
        reservationId,
        merchantId,
        inboundId,
        rawProviderEventId,
        subscriptionId,
        debitLedgerId,
      ],
    );
    await pool.query(
      `INSERT INTO reply_refunds (
         id, merchant_id, reservation_id, confirmed_failure_code,
         state, credit_ledger_id, balance_after_refund, requested_at, refunded_at
       ) VALUES ($1,$2,$3,'META_CONFIRMED_FAILURE','refunded',$4,100,now(),now())`,
      [refundId, merchantId, reservationId, creditLedgerId],
    );
    await pool.query(
      `INSERT INTO outbound_deliveries (
         id, merchant_id, inbound_event_id, reservation_id, reply_intent_id,
         outcome, provider_message_id, attempted_at, finalized_at
       ) VALUES ($1,$2,$3,$4,$5,'sent',$6,now(),now())`,
      [
        deliveryId,
        merchantId,
        inboundId,
        reservationId,
        `reply-intent-${proof}`,
        rawProviderMessageId,
      ],
    );

    await merchantManagement.updateMerchantStatusPostgres({
      merchantId,
      status: "suspended",
      reason: "provider identifier deletion proof",
      actorAdminId: adminId,
    });
    const deletionRequest = await merchantManagement.createDeletionRequestPostgres({
      merchantId,
      reason: "policy_violation",
      details: "provider identifier deletion proof",
      actorAdminId: adminId,
    });
    const deleted = await merchantManagement.completeMerchantDeletionPostgres({
      merchantId,
      deletionRequestId: deletionRequest.id,
      actorAdminId: adminId,
    });
    assert.equal(deleted.ok, true);

    const inbound = await pool.query<{ external_event_id: string }>(
      "SELECT external_event_id FROM channel_inbound_events WHERE id = $1",
      [inboundId],
    );
    assert.equal(inbound.rows[0]?.external_event_id, `deleted:event:${inboundId}`);

    const reservation = await pool.query<{ external_event_id: string }>(
      "SELECT external_event_id FROM reply_reservations WHERE id = $1",
      [reservationId],
    );
    assert.equal(
      reservation.rows[0]?.external_event_id,
      `deleted:event:${inboundId}`,
    );

    const ledgers = await pool.query<{
      id: string;
      direction: string;
      external_event_id: string | null;
      message_id: string | null;
    }>(
      `SELECT id, direction, external_event_id, message_id
         FROM reply_ledger
        WHERE id = ANY($1::text[])
        ORDER BY direction`,
      [[debitLedgerId, creditLedgerId]],
    );
    assert.equal(ledgers.rowCount, 2);
    for (const ledger of ledgers.rows) {
      assert.equal(ledger.external_event_id, `deleted:event:${inboundId}`);
      assert.equal(ledger.message_id, null);
    }

    const job = await pool.query<{ dedupe_key: string; payload_hash: string | null }>(
      "SELECT dedupe_key, payload_hash FROM background_jobs WHERE id = $1",
      [jobId],
    );
    assert.deepEqual(job.rows[0], {
      dedupe_key: `deleted:job:${jobId}`,
      payload_hash: null,
    });

    const delivery = await pool.query<{ provider_message_id: string | null }>(
      "SELECT provider_message_id FROM outbound_deliveries WHERE id = $1",
      [deliveryId],
    );
    assert.equal(delivery.rows[0]?.provider_message_id, null);

    const channel = await pool.query<{
      page_id: string | null;
      external_account_id: string | null;
    }>(
      "SELECT page_id, external_account_id FROM merchant_channels WHERE id = $1",
      [channelId],
    );
    assert.deepEqual(channel.rows[0], {
      page_id: null,
      external_account_id: null,
    });

    const retained = JSON.stringify({
      inbound: inbound.rows,
      reservation: reservation.rows,
      ledgers: ledgers.rows,
      job: job.rows,
      delivery: delivery.rows,
      channel: channel.rows,
    });
    assert.equal(retained.includes(rawProviderEventId), false);
    assert.equal(retained.includes(rawProviderMessageId), false);
    assert.equal(retained.includes(rawPageId), false);
  },
);
