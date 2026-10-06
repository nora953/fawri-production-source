import assert from "node:assert/strict";
import crypto from "node:crypto";
import test from "node:test";

const DATABASE_URL = String(process.env.DATABASE_URL || "").trim();

if (DATABASE_URL) {
  const parsed = new URL(DATABASE_URL);
  assert.ok(
    parsed.hostname === "127.0.0.1" || parsed.hostname === "localhost",
    "cashier full lifecycle test only permits local PostgreSQL",
  );
  assert.equal(
    parsed.pathname.replace(/^\//, ""),
    "fawri_ci",
    "cashier full lifecycle test only permits the fawri_ci database",
  );
}

function randomPhone(): string {
  return `+9647${String(crypto.randomInt(0, 1_000_000_000)).padStart(9, "0")}`;
}

function payloadHash(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

test(
  "cashier full lifecycle: activate, prorate seat, unified expiry, grace, restricted, renew and replay-safe historical sync",
  { skip: !DATABASE_URL },
  async (t) => {
    Object.assign(process.env, {
      NODE_ENV: "test",
      FAWRI_OPERATIONAL_POSTGRES_AUTHORITY: "required",
      FAWRI_PASSWORD_SALT:
        "cashier-full-lifecycle-password-salt-over-thirty-two-characters",
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
      entitlement,
      historical,
      operational,
    ] = await Promise.all([
      import("@workspace/db"),
      import("../src/services/authPasswordService.js"),
      import("../src/services/postgresMerchantAccountAuthority.js"),
      import("../src/services/cashierBillingAuthority.js"),
      import("../src/services/postgresCashierStaffAuthority.js"),
      import("../src/services/cashierEntitlementAuthority.js"),
      import("../src/services/cashierHistoricalOperationAuthority.js"),
      import("../src/services/operationalPostgresAuthority.js"),
    ]);

    let merchantId = "";
    t.after(async () => {
      if (merchantId) {
        await pool
          .query("DELETE FROM accounts WHERE id = $1", [merchantId])
          .catch(() => undefined);
      }
      await pool.end();
    });

    const merchant = await merchants.upsertPendingMerchantAuthoritative({
      phone: randomPhone(),
      passwordHash: hashPassword("CashierLifecycle1!"),
      ownerName: "Cashier Lifecycle Owner",
      storeName: "Cashier Lifecycle Store",
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

    // 1 Oct: activate exactly one Cashier seat for one calendar billing month.
    const activationAt = new Date("2026-10-01T00:00:00.000Z");
    const activation = await billing.createCashierBillingCheckout({
      merchantId,
      operation: "activate",
      requestedSeats: 1,
      idempotencyKey: "full-lifecycle-activate",
      provider: "test_fake",
      now: activationAt,
    });
    assert.equal(activation.order.amount_iqd, 3900);
    assert.equal(activation.order.billing_period_start, "2026-10-01T00:00:00.000Z");
    assert.equal(activation.order.billing_period_end, "2026-11-01T00:00:00.000Z");

    await billing.applyVerifiedCashierBillingProviderEvent({
      provider: "test_fake",
      providerEventId: "full-lifecycle-activate-event",
      orderId: activation.order.id,
      eventType: "payment_succeeded",
      signatureVerified: true,
      payloadHash: payloadHash("full-lifecycle-activate-event"),
      occurredAt: new Date("2026-10-01T00:01:00.000Z"),
      amountIqd: activation.order.amount_iqd,
      currency: "IQD",
      providerPaymentRef: "full-lifecycle-activate-payment",
    });

    const stationOne = await cashier.createCashierStationAuthoritative({
      merchantId,
      name: "Lifecycle Station 1",
      branchKey: `lifecycle-1-${crypto.randomUUID().slice(0, 8)}`,
    });
    const pairingOne = await cashier.beginCashierStationPairingAuthoritative({
      merchantId,
      stationId: stationOne.id,
    });
    const deviceOne = `lifecycle-device-1-${crypto.randomUUID()}`;
    await cashier.redeemCashierStationPairingAuthoritative({
      pairingCode: pairingOne.pairing_code,
      deviceId: deviceOne,
    });

    // 10 Oct: add exactly one more seat. It must keep the same renewal date.
    const addAt = new Date("2026-10-10T00:00:00.000Z");
    const addQuote = await billing.quoteCashierBillingChange({
      merchantId,
      operation: "add_seats",
      requestedSeats: 2,
      now: addAt,
    });
    assert.equal(addQuote.current_seats, 1);
    assert.equal(addQuote.resulting_seats, 2);
    assert.equal(addQuote.amount_iqd, 2768);
    assert.equal(addQuote.billing_period_end, "2026-11-01T00:00:00.000Z");
    assert.equal(addQuote.next_full_renewal_amount_iqd, 7800);

    const addSeat = await billing.createCashierBillingCheckout({
      merchantId,
      operation: "add_seats",
      requestedSeats: 2,
      idempotencyKey: "full-lifecycle-add-second-seat",
      provider: "test_fake",
      now: addAt,
    });
    await billing.applyVerifiedCashierBillingProviderEvent({
      provider: "test_fake",
      providerEventId: "full-lifecycle-add-seat-event",
      orderId: addSeat.order.id,
      eventType: "payment_succeeded",
      signatureVerified: true,
      payloadHash: payloadHash("full-lifecycle-add-seat-event"),
      occurredAt: new Date("2026-10-10T00:01:00.000Z"),
      amountIqd: addSeat.order.amount_iqd,
      currency: "IQD",
      providerPaymentRef: "full-lifecycle-add-seat-payment",
    });

    const stationTwo = await cashier.createCashierStationAuthoritative({
      merchantId,
      name: "Lifecycle Station 2",
      branchKey: `lifecycle-2-${crypto.randomUUID().slice(0, 8)}`,
    });
    const pairingTwo = await cashier.beginCashierStationPairingAuthoritative({
      merchantId,
      stationId: stationTwo.id,
    });
    await cashier.redeemCashierStationPairingAuthoritative({
      pairingCode: pairingTwo.pairing_code,
      deviceId: `lifecycle-device-2-${crypto.randomUUID()}`,
    });

    // Two seats means a third station must fail at the backend even if a client tries directly.
    await assert.rejects(
      () =>
        cashier.createCashierStationAuthoritative({
          merchantId,
          name: "Lifecycle Station 3",
          branchKey: `lifecycle-3-${crypto.randomUUID().slice(0, 8)}`,
        }),
      (error: unknown) =>
        Boolean(
          error &&
            typeof error === "object" &&
            "code" in error &&
            (error as { code?: unknown }).code === "CASHIER_LICENSED_SEAT_LIMIT_REACHED",
        ),
    );

    const subscriptionRow = await pool.query(
      `SELECT id, merchant_id, status, licensed_seats, price_per_seat_iqd,
              billing_period_start, billing_period_end, grace_duration_seconds,
              scheduled_licensed_seats, scheduled_change_at, version
         FROM merchant_cashier_subscriptions
        WHERE merchant_id = $1`,
      [merchantId],
    );
    assert.equal(subscriptionRow.rows.length, 1);
    const row = subscriptionRow.rows[0];
    assert.equal(Number(row.licensed_seats), 2);
    assert.equal(new Date(row.billing_period_end).toISOString(), "2026-11-01T00:00:00.000Z");

    // Same subscription authority becomes GRACE exactly at expiry and RESTRICTED exactly 7 days later.
    const grace = entitlement.evaluateCashierEntitlement(
      row,
      new Date("2026-11-01T00:00:00.000Z"),
    );
    assert.equal(grace?.state, "grace");
    assert.equal(grace?.grace_until, "2026-11-08T00:00:00.000Z");

    const restricted = entitlement.evaluateCashierEntitlement(
      row,
      new Date("2026-11-08T00:00:00.000Z"),
    );
    assert.equal(restricted?.state, "restricted");

    // After the grace boundary, renewal starts a fresh paid period for both seats.
    const renewalAt = new Date("2026-11-08T00:00:00.000Z");
    const renewalQuote = await billing.quoteCashierBillingChange({
      merchantId,
      operation: "renew",
      requestedSeats: 2,
      now: renewalAt,
    });
    assert.equal(renewalQuote.amount_iqd, 7800);
    assert.equal(renewalQuote.billing_period_start, "2026-11-08T00:00:00.000Z");
    assert.equal(renewalQuote.billing_period_end, "2026-12-08T00:00:00.000Z");

    const renewal = await billing.createCashierBillingCheckout({
      merchantId,
      operation: "renew",
      requestedSeats: 2,
      idempotencyKey: "full-lifecycle-renew-after-restricted",
      provider: "test_fake",
      now: renewalAt,
    });
    await billing.applyVerifiedCashierBillingProviderEvent({
      provider: "test_fake",
      providerEventId: "full-lifecycle-renew-event",
      orderId: renewal.order.id,
      eventType: "payment_succeeded",
      signatureVerified: true,
      payloadHash: payloadHash("full-lifecycle-renew-event"),
      occurredAt: new Date("2026-11-08T00:01:00.000Z"),
      amountIqd: renewal.order.amount_iqd,
      currency: "IQD",
      providerPaymentRef: "full-lifecycle-renew-payment",
    });

    const renewedRow = await pool.query(
      `SELECT status, licensed_seats, billing_period_start, billing_period_end
         FROM merchant_cashier_subscriptions
        WHERE merchant_id = $1`,
      [merchantId],
    );
    assert.equal(renewedRow.rows[0].status, "active");
    assert.equal(Number(renewedRow.rows[0].licensed_seats), 2);
    assert.equal(
      new Date(renewedRow.rows[0].billing_period_start).toISOString(),
      "2026-11-08T00:00:00.000Z",
    );
    assert.equal(
      new Date(renewedRow.rows[0].billing_period_end).toISOString(),
      "2026-12-08T00:00:00.000Z",
    );

    // An operation created by station 1 during the old 7-day grace remains
    // eligible after renewal, but replay/sequence authority is deterministic.
    const graceSaleAt = "2026-11-05T12:00:00.000Z";
    await operational.withMerchantOperationalTransaction(
      merchantId,
      async (client) => {
        const authority =
          await historical.evaluateCashierHistoricalOperationAuthorityInTransaction({
            target: client,
            merchantId,
            deviceId: deviceOne,
            occurredAt: graceSaleAt,
            now: new Date("2026-11-08T00:02:00.000Z"),
          });
        assert.equal(authority.allowed, true);
        if (!authority.allowed) return;

        const first = await historical.recordCashierOperationTimelineInTransaction({
          target: client,
          merchantId,
          deviceId: deviceOne,
          deviceSequence: 1,
          operationId: "full-lifecycle-grace-sale-1",
          operationKind: "sale",
          occurredAt: graceSaleAt,
          authority,
          now: new Date("2026-11-08T00:02:00.000Z"),
        });
        assert.deepEqual(first, { allowed: true, replayed: false });

        const replay = await historical.recordCashierOperationTimelineInTransaction({
          target: client,
          merchantId,
          deviceId: deviceOne,
          deviceSequence: 1,
          operationId: "full-lifecycle-grace-sale-1",
          operationKind: "sale",
          occurredAt: graceSaleAt,
          authority,
          now: new Date("2026-11-08T00:02:30.000Z"),
        });
        assert.deepEqual(replay, { allowed: true, replayed: true });

        const conflictingReplay =
          await historical.recordCashierOperationTimelineInTransaction({
            target: client,
            merchantId,
            deviceId: deviceOne,
            deviceSequence: 1,
            operationId: "full-lifecycle-different-sale",
            operationKind: "sale",
            occurredAt: graceSaleAt,
            authority,
            now: new Date("2026-11-08T00:03:00.000Z"),
          });
        assert.equal(conflictingReplay.allowed, false);
        if (!conflictingReplay.allowed) {
          assert.equal(
            conflictingReplay.code,
            "CASHIER_OPERATION_SEQUENCE_CONFLICT",
          );
        }
      },
    );
  },
);
