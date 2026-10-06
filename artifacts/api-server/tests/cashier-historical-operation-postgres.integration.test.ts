import assert from "node:assert/strict";
import crypto from "node:crypto";
import test from "node:test";

const DATABASE_URL = String(process.env.DATABASE_URL || "").trim();

if (DATABASE_URL) {
  const parsed = new URL(DATABASE_URL);
  assert.ok(
    parsed.hostname === "127.0.0.1" || parsed.hostname === "localhost",
    "cashier historical authority test only permits local PostgreSQL",
  );
  assert.equal(parsed.pathname.replace(/^\//, ""), "fawri_ci");
}

function randomPhone(): string {
  return `+9647${String(crypto.randomInt(0, 1_000_000_000)).padStart(9, "0")}`;
}

function payloadHash(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

test(
  "historical offline authority rejects post-grace gaps and device clock rollback after renewal",
  { skip: !DATABASE_URL },
  async (t) => {
    Object.assign(process.env, {
      NODE_ENV: "test",
      FAWRI_OPERATIONAL_POSTGRES_AUTHORITY: "required",
      FAWRI_PASSWORD_SALT:
        "cashier-history-test-password-salt-over-thirty-two-characters",
      FAWRI_CASHIER_SEAT_PRICE_IQD: "3900",
      FAWRI_CASHIER_GRACE_SECONDS: String(7 * 24 * 60 * 60),
      FAWRI_SAAS_BILLING_PROVIDER: "test_fake",
      FAWRI_SAAS_BILLING_PROVIDERS: "test_fake",
    });

    const [
      { pool },
      { hashPassword },
      merchants,
      billing,
      cashier,
      historical,
      operational,
    ] = await Promise.all([
      import("@workspace/db"),
      import("../src/services/authPasswordService.js"),
      import("../src/services/postgresMerchantAccountAuthority.js"),
      import("../src/services/cashierBillingAuthority.js"),
      import("../src/services/postgresCashierStaffAuthority.js"),
      import("../src/services/cashierHistoricalOperationAuthority.js"),
      import("../src/services/operationalPostgresAuthority.js"),
    ]);

    let merchantId = "";
    t.after(async () => {
      if (merchantId) {
        await pool.query("DELETE FROM accounts WHERE id = $1", [merchantId]).catch(() => undefined);
      }
      await pool.end();
    });

    const merchant = await merchants.upsertPendingMerchantAuthoritative({
      phone: randomPhone(),
      passwordHash: hashPassword("CashierHistory1!"),
      ownerName: "History Owner",
      storeName: "History Store",
      activityType: "retail",
      language: "en",
      requestedPlan: "silver",
    });
    merchantId = merchant.account.id;
    await merchants.markMerchantOtpVerifiedAuthoritative(merchantId);
    await pool.query(
      `UPDATE merchants
          SET status = 'approved',
              account_status = 'approved',
              onboarding_status = 'channel_connected',
              updated_at = now()
        WHERE id = $1`,
      [merchantId],
    );

    const activation = await billing.createCashierBillingCheckout({
      merchantId,
      operation: "activate",
      requestedSeats: 1,
      idempotencyKey: "history-activate",
      provider: "test_fake",
    });
    await billing.applyVerifiedCashierBillingProviderEvent({
      provider: "test_fake",
      providerEventId: "history-activation-event",
      orderId: activation.order.id,
      eventType: "payment_succeeded",
      signatureVerified: true,
      payloadHash: payloadHash("history-activation-event"),
      occurredAt: new Date(),
      amountIqd: activation.order.amount_iqd,
      currency: "IQD",
      providerPaymentRef: "history-activation-payment",
    });

    const station = await cashier.createCashierStationAuthoritative({
      merchantId,
      name: "Historical Station",
      branchKey: `history-${crypto.randomUUID().slice(0, 8)}`,
    });
    const pairing = await cashier.beginCashierStationPairingAuthoritative({
      merchantId,
      stationId: station.id,
    });
    const deviceId = `history-device-${crypto.randomUUID()}`;
    await cashier.redeemCashierStationPairingAuthoritative({
      pairingCode: pairing.pairing_code,
      deviceId,
    });

    // Move the first paid cycle and its station/device authority into history.
    // It ended 12 days ago, so its seven-day grace ended 5 days ago.
    await pool.query(
      `UPDATE cashier_billing_orders
          SET billing_period_start = now() - interval '42 days',
              billing_period_end = now() - interval '12 days',
              paid_at = now() - interval '42 days',
              applied_at = now() - interval '42 days',
              updated_at = now()
        WHERE id = $1`,
      [activation.order.id],
    );
    await pool.query(
      `UPDATE cashier_entitlement_applications
          SET applied_at = now() - interval '42 days'
        WHERE order_id = $1`,
      [activation.order.id],
    );
    await pool.query(
      `UPDATE cashier_entitlement_audit_events
          SET created_at = now() - interval '42 days'
        WHERE merchant_id = $1 AND action = 'activate'`,
      [merchantId],
    );
    await pool.query(
      `UPDATE merchant_cashier_subscriptions
          SET billing_period_start = now() - interval '42 days',
              billing_period_end = now() - interval '12 days',
              version = version + 1,
              updated_at = now()
        WHERE merchant_id = $1`,
      [merchantId],
    );
    await pool.query(
      `UPDATE cashier_station_seat_assignments
          SET assigned_at = now() - interval '40 days',
              created_at = now() - interval '40 days'
        WHERE merchant_id = $1 AND station_id = $2`,
      [merchantId, station.id],
    );
    await pool.query(
      `UPDATE cashier_station_credentials
          SET issued_at = now() - interval '40 days'
        WHERE merchant_id = $1 AND station_id = $2 AND device_id = $3`,
      [merchantId, station.id, deviceId],
    );

    // Current authority is restricted until a new payment succeeds.
    const renewal = await billing.createCashierBillingCheckout({
      merchantId,
      operation: "renew",
      requestedSeats: 1,
      idempotencyKey: "history-renew",
      provider: "test_fake",
    });
    await billing.applyVerifiedCashierBillingProviderEvent({
      provider: "test_fake",
      providerEventId: "history-renewal-event",
      orderId: renewal.order.id,
      eventType: "payment_succeeded",
      signatureVerified: true,
      payloadHash: payloadHash("history-renewal-event"),
      occurredAt: new Date(),
      amountIqd: renewal.order.amount_iqd,
      currency: "IQD",
      providerPaymentRef: "history-renewal-payment",
    });

    await operational.withMerchantOperationalTransaction(
      merchantId,
      async (client) => {
        const validGraceAt = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000);
        const valid = await historical.evaluateCashierHistoricalOperationAuthorityInTransaction({
          target: client,
          merchantId,
          deviceId,
          occurredAt: validGraceAt.toISOString(),
        });
        assert.equal(valid.allowed, true);
        if (!valid.allowed) return;

        const firstTimeline = await historical.recordCashierOperationTimelineInTransaction({
          target: client,
          merchantId,
          deviceId,
          deviceSequence: 100,
          operationId: "history-valid-100",
          operationKind: "sale",
          occurredAt: validGraceAt.toISOString(),
          authority: valid,
        });
        assert.deepEqual(firstTimeline, { allowed: true, replayed: false });

        const duplicateTimeline = await historical.recordCashierOperationTimelineInTransaction({
          target: client,
          merchantId,
          deviceId,
          deviceSequence: 100,
          operationId: "history-valid-100",
          operationKind: "sale",
          occurredAt: validGraceAt.toISOString(),
          authority: valid,
        });
        assert.deepEqual(duplicateTimeline, { allowed: true, replayed: true });

        const resetSequence = await historical.recordCashierOperationTimelineInTransaction({
          target: client,
          merchantId,
          deviceId,
          deviceSequence: 1,
          operationId: "history-reset-sequence-1",
          operationKind: "sale",
          occurredAt: validGraceAt.toISOString(),
          authority: valid,
        });
        assert.equal(resetSequence.allowed, false);
        if (!resetSequence.allowed) {
          assert.equal(resetSequence.code, "CASHIER_OPERATION_SEQUENCE_CONFLICT");
        }

        const rollbackAt = new Date(validGraceAt.getTime() - 24 * 60 * 60 * 1000);
        const rollbackAuthority =
          await historical.evaluateCashierHistoricalOperationAuthorityInTransaction({
            target: client,
            merchantId,
            deviceId,
            occurredAt: rollbackAt.toISOString(),
          });
        assert.equal(rollbackAuthority.allowed, true);
        if (rollbackAuthority.allowed) {
          const rollback = await historical.recordCashierOperationTimelineInTransaction({
            target: client,
            merchantId,
            deviceId,
            deviceSequence: 101,
            operationId: "history-rollback-101",
            operationKind: "sale",
            occurredAt: rollbackAt.toISOString(),
            authority: rollbackAuthority,
          });
          assert.equal(rollback.allowed, false);
          if (!rollback.allowed) assert.equal(rollback.code, "CASHIER_OPERATION_CLOCK_ROLLBACK");
        }

        const postGraceGapAt = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
        const invalidGap =
          await historical.evaluateCashierHistoricalOperationAuthorityInTransaction({
            target: client,
            merchantId,
            deviceId,
            occurredAt: postGraceGapAt.toISOString(),
          });
        assert.equal(invalidGap.allowed, false);
        if (!invalidGap.allowed) {
          assert.equal(invalidGap.code, "CASHIER_OPERATION_BILLING_AUTHORITY_REQUIRED");
        }

        const nowAuthority =
          await historical.evaluateCashierHistoricalOperationAuthorityInTransaction({
            target: client,
            merchantId,
            deviceId,
            occurredAt: new Date().toISOString(),
          });
        assert.equal(nowAuthority.allowed, true);
        if (nowAuthority.allowed) {
          const aheadAt = new Date(Date.now() + 10 * 60 * 1000);
          const ahead = await historical.recordCashierOperationTimelineInTransaction({
            target: client,
            merchantId,
            deviceId,
            deviceSequence: 102,
            operationId: "history-clock-ahead-102",
            operationKind: "sale",
            occurredAt: aheadAt.toISOString(),
            authority: nowAuthority,
          });
          assert.equal(ahead.allowed, false);
          if (!ahead.allowed) assert.equal(ahead.code, "CASHIER_OPERATION_CLOCK_AHEAD");
        }
      },
    );
  },
);
