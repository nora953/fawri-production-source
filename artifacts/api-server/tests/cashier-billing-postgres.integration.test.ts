import assert from "node:assert/strict";
import crypto from "node:crypto";
import test from "node:test";

const DATABASE_URL = String(process.env.DATABASE_URL || "").trim();

if (DATABASE_URL) {
  const parsed = new URL(DATABASE_URL);
  assert.ok(
    parsed.hostname === "127.0.0.1" || parsed.hostname === "localhost",
    "cashier billing regression only permits local PostgreSQL",
  );
  assert.equal(
    parsed.pathname.replace(/^\//, ""),
    "fawri_ci",
    "cashier billing regression only permits the fawri_ci database",
  );
}

function randomPhone(): string {
  return `+9647${String(crypto.randomInt(0, 1_000_000_000)).padStart(9, "0")}`;
}

function hash(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

test(
  "cashier billing requires verified payment, preserves one renewal date and blocks replay/stale entitlement",
  { skip: !DATABASE_URL },
  async (t) => {
    Object.assign(process.env, {
      NODE_ENV: "test",
      FAWRI_OPERATIONAL_POSTGRES_AUTHORITY: "required",
      FAWRI_PASSWORD_SALT:
        "cashier-billing-test-password-salt-over-thirty-two-characters",
      FAWRI_CASHIER_SEAT_PRICE_IQD: "3900",
      FAWRI_CASHIER_GRACE_SECONDS: String(7 * 24 * 60 * 60),
      FAWRI_SAAS_BILLING_PROVIDER: "test_fake",
      FAWRI_SAAS_BILLING_PROVIDERS: "test_fake",
    });

    const [
      { pool },
      { hashPassword },
      merchantAccounts,
      billing,
    ] = await Promise.all([
      import("@workspace/db"),
      import("../src/services/authPasswordService.js"),
      import("../src/services/postgresMerchantAccountAuthority.js"),
      import("../src/services/cashierBillingAuthority.js"),
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

    const merchant = await merchantAccounts.upsertPendingMerchantAuthoritative({
      phone: randomPhone(),
      passwordHash: hashPassword("CashierBilling1!"),
      ownerName: "Cashier Billing Owner",
      storeName: "Cashier Billing Store",
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

    const activationTime = new Date("2026-10-01T00:00:00.000Z");
    const activationQuote = await billing.quoteCashierBillingChange({
      merchantId,
      operation: "activate",
      requestedSeats: 1,
      now: activationTime,
    });
    assert.equal(activationQuote.amount_iqd, 3900);
    assert.equal(activationQuote.billing_period_end, "2026-11-01T00:00:00.000Z");

    const activation = await billing.createCashierBillingCheckout({
      merchantId,
      operation: "activate",
      requestedSeats: 1,
      idempotencyKey: "activate-one",
      provider: "test_fake",
      now: activationTime,
    });
    assert.equal(activation.duplicate, false);

    const duplicateCheckout = await billing.createCashierBillingCheckout({
      merchantId,
      operation: "activate",
      requestedSeats: 1,
      idempotencyKey: "activate-one",
      provider: "test_fake",
      now: activationTime,
    });
    assert.equal(duplicateCheckout.duplicate, true);
    assert.equal(duplicateCheckout.order.id, activation.order.id);

    // Seats must not exist merely because checkout was created.
    const beforePayment = await pool.query(
      "SELECT licensed_seats FROM merchant_cashier_subscriptions WHERE merchant_id = $1",
      [merchantId],
    );
    assert.equal(beforePayment.rows.length, 0);

    const activationEvent = {
      provider: "test_fake" as const,
      providerEventId: "event-activate-1",
      orderId: activation.order.id,
      eventType: "payment_succeeded" as const,
      signatureVerified: true as const,
      payloadHash: hash("event-activate-1"),
      occurredAt: new Date("2026-10-01T00:01:00.000Z"),
      amountIqd: activation.order.amount_iqd,
      currency: "IQD" as const,
      providerPaymentRef: "payment-activate-1",
    };
    const activated = await billing.applyVerifiedCashierBillingProviderEvent(
      activationEvent,
    );
    assert.equal(activated.status, "applied");

    const duplicateEvent = await billing.applyVerifiedCashierBillingProviderEvent(
      activationEvent,
    );
    assert.equal(duplicateEvent.status, "duplicate");

    let row = await pool.query(
      `SELECT licensed_seats, billing_period_start, billing_period_end, version
         FROM merchant_cashier_subscriptions
        WHERE merchant_id = $1`,
      [merchantId],
    );
    assert.equal(Number(row.rows[0].licensed_seats), 1);
    assert.equal(new Date(row.rows[0].billing_period_end).toISOString(), "2026-11-01T00:00:00.000Z");

    // Add two seats mid-cycle: exact actual-period proration, same period end.
    const addTime = new Date("2026-10-10T00:00:00.000Z");
    const addQuote = await billing.quoteCashierBillingChange({
      merchantId,
      operation: "add_seats",
      requestedSeats: 3,
      now: addTime,
    });
    assert.equal(addQuote.current_seats, 1);
    assert.equal(addQuote.resulting_seats, 3);
    assert.equal(addQuote.amount_iqd, 5535);
    assert.equal(addQuote.billing_period_end, "2026-11-01T00:00:00.000Z");
    assert.equal(addQuote.next_full_renewal_amount_iqd, 11700);

    const addCheckout = await billing.createCashierBillingCheckout({
      merchantId,
      operation: "add_seats",
      requestedSeats: 3,
      idempotencyKey: "add-to-three",
      provider: "test_fake",
      now: addTime,
    });
    await billing.applyVerifiedCashierBillingProviderEvent({
      provider: "test_fake",
      providerEventId: "event-add-three",
      orderId: addCheckout.order.id,
      eventType: "payment_succeeded",
      signatureVerified: true,
      payloadHash: hash("event-add-three"),
      occurredAt: new Date("2026-10-10T00:01:00.000Z"),
      amountIqd: addCheckout.order.amount_iqd,
      currency: "IQD",
      providerPaymentRef: "payment-add-three",
    });

    row = await pool.query(
      `SELECT licensed_seats, billing_period_end, version
         FROM merchant_cashier_subscriptions WHERE merchant_id = $1`,
      [merchantId],
    );
    assert.equal(Number(row.rows[0].licensed_seats), 3);
    assert.equal(new Date(row.rows[0].billing_period_end).toISOString(), "2026-11-01T00:00:00.000Z");

    // A paid upgrade supersedes an older scheduled downgrade, but a failed
    // upgrade must leave that downgrade untouched.
    await pool.query(
      `UPDATE merchant_cashier_subscriptions
          SET scheduled_licensed_seats = 2,
              scheduled_change_at = billing_period_end,
              version = version + 1,
              updated_at = now()
        WHERE merchant_id = $1`,
      [merchantId],
    );

    // Failed payment must not increase entitlement or cancel the downgrade.
    const failedCheckout = await billing.createCashierBillingCheckout({
      merchantId,
      operation: "add_seats",
      requestedSeats: 4,
      idempotencyKey: "failed-add-four",
      provider: "test_fake",
      now: new Date("2026-10-15T00:00:00.000Z"),
    });
    const failed = await billing.applyVerifiedCashierBillingProviderEvent({
      provider: "test_fake",
      providerEventId: "event-failed-add-four",
      orderId: failedCheckout.order.id,
      eventType: "payment_failed",
      signatureVerified: true,
      payloadHash: hash("event-failed-add-four"),
      occurredAt: new Date("2026-10-15T00:01:00.000Z"),
      amountIqd: failedCheckout.order.amount_iqd,
      currency: "IQD",
      reasonCode: "DECLINED",
    });
    assert.equal(failed.status, "failed");
    row = await pool.query(
      "SELECT licensed_seats FROM merchant_cashier_subscriptions WHERE merchant_id = $1",
      [merchantId],
    );
    assert.equal(Number(row.rows[0].licensed_seats), 3);
    const scheduledAfterFailure = await pool.query(
      `SELECT scheduled_licensed_seats
         FROM merchant_cashier_subscriptions
        WHERE merchant_id = $1`,
      [merchantId],
    );
    assert.equal(Number(scheduledAfterFailure.rows[0].scheduled_licensed_seats), 2);

    // A later valid payment can add the seat and supersede the downgrade.
    const addFour = await billing.createCashierBillingCheckout({
      merchantId,
      operation: "add_seats",
      requestedSeats: 4,
      idempotencyKey: "valid-add-four",
      provider: "test_fake",
      now: new Date("2026-10-15T00:02:00.000Z"),
    });
    await billing.applyVerifiedCashierBillingProviderEvent({
      provider: "test_fake",
      providerEventId: "event-valid-add-four",
      orderId: addFour.order.id,
      eventType: "payment_succeeded",
      signatureVerified: true,
      payloadHash: hash("event-valid-add-four"),
      occurredAt: new Date("2026-10-15T00:03:00.000Z"),
      amountIqd: addFour.order.amount_iqd,
      currency: "IQD",
      providerPaymentRef: "payment-add-four",
    });

    const upgradedState = await pool.query(
      `SELECT licensed_seats, scheduled_licensed_seats, scheduled_change_at
         FROM merchant_cashier_subscriptions
        WHERE merchant_id = $1`,
      [merchantId],
    );
    assert.equal(Number(upgradedState.rows[0].licensed_seats), 4);
    assert.equal(upgradedState.rows[0].scheduled_licensed_seats, null);
    assert.equal(upgradedState.rows[0].scheduled_change_at, null);

    // During grace renewal is for all four seats and retains the shared cycle anchor.
    const graceRenewalTime = new Date("2026-11-02T00:00:00.000Z");
    const renewalQuote = await billing.quoteCashierBillingChange({
      merchantId,
      operation: "renew",
      requestedSeats: 4,
      now: graceRenewalTime,
    });
    assert.equal(renewalQuote.amount_iqd, 15600);
    assert.equal(renewalQuote.billing_period_start, "2026-11-01T00:00:00.000Z");
    assert.equal(renewalQuote.billing_period_end, "2026-12-01T00:00:00.000Z");

    const renewal = await billing.createCashierBillingCheckout({
      merchantId,
      operation: "renew",
      requestedSeats: 4,
      idempotencyKey: "renew-grace",
      provider: "test_fake",
      now: graceRenewalTime,
    });
    assert.equal(renewal.order.unit_price_iqd, 3900);
    assert.equal(renewal.order.grace_duration_seconds, 7 * 24 * 60 * 60);

    // A configuration change after checkout must not mutate already-paid terms.
    process.env.FAWRI_CASHIER_SEAT_PRICE_IQD = "9900";
    process.env.FAWRI_CASHIER_GRACE_SECONDS = String(3 * 24 * 60 * 60);

    // Reusing an old provider payment reference on this new order is a replay.
    await assert.rejects(
      () =>
        billing.applyVerifiedCashierBillingProviderEvent({
          provider: "test_fake",
          providerEventId: "event-replayed-payment-ref",
          orderId: renewal.order.id,
          eventType: "payment_succeeded",
          signatureVerified: true,
          payloadHash: hash("event-replayed-payment-ref"),
          occurredAt: new Date("2026-11-02T00:01:00.000Z"),
          amountIqd: renewal.order.amount_iqd,
          currency: "IQD",
          providerPaymentRef: "payment-add-four",
        }),
      (error: unknown) =>
        error instanceof billing.CashierBillingAuthorityError &&
        error.code === "CASHIER_BILLING_PAYMENT_REPLAY",
    );

    const renewed = await billing.applyVerifiedCashierBillingProviderEvent({
      provider: "test_fake",
      providerEventId: "event-renew-grace",
      orderId: renewal.order.id,
      eventType: "payment_succeeded",
      signatureVerified: true,
      payloadHash: hash("event-renew-grace"),
      occurredAt: new Date("2026-11-02T00:02:00.000Z"),
      amountIqd: renewal.order.amount_iqd,
      currency: "IQD",
      providerPaymentRef: "payment-renew-grace",
    });
    assert.equal(renewed.status, "applied");
    row = await pool.query(
      `SELECT licensed_seats, price_per_seat_iqd, grace_duration_seconds,
              billing_period_start, billing_period_end, version
         FROM merchant_cashier_subscriptions WHERE merchant_id = $1`,
      [merchantId],
    );
    assert.equal(Number(row.rows[0].licensed_seats), 4);
    assert.equal(Number(row.rows[0].price_per_seat_iqd), 3900);
    assert.equal(Number(row.rows[0].grace_duration_seconds), 7 * 24 * 60 * 60);
    assert.equal(new Date(row.rows[0].billing_period_start).toISOString(), "2026-11-01T00:00:00.000Z");
    assert.equal(new Date(row.rows[0].billing_period_end).toISOString(), "2026-12-01T00:00:00.000Z");

    process.env.FAWRI_CASHIER_SEAT_PRICE_IQD = "3900";
    process.env.FAWRI_CASHIER_GRACE_SECONDS = String(7 * 24 * 60 * 60);

    // A stale quote/order cannot overwrite a newer entitlement version after payment.
    const staleCheckout = await billing.createCashierBillingCheckout({
      merchantId,
      operation: "add_seats",
      requestedSeats: 5,
      idempotencyKey: "stale-add-five",
      provider: "test_fake",
      now: new Date("2026-11-10T00:00:00.000Z"),
    });
    await pool.query(
      `UPDATE merchant_cashier_subscriptions
          SET version = version + 1, updated_at = now()
        WHERE merchant_id = $1`,
      [merchantId],
    );
    const staleOutcome = await billing.applyVerifiedCashierBillingProviderEvent({
      provider: "test_fake",
      providerEventId: "event-stale-add-five",
      orderId: staleCheckout.order.id,
      eventType: "payment_succeeded",
      signatureVerified: true,
      payloadHash: hash("event-stale-add-five"),
      occurredAt: new Date("2026-11-10T00:01:00.000Z"),
      amountIqd: staleCheckout.order.amount_iqd,
      currency: "IQD",
      providerPaymentRef: "payment-stale-add-five",
    });
    assert.equal(staleOutcome.status, "reconciliation_required");
    assert.equal(staleOutcome.reasonCode, "CASHIER_SUBSCRIPTION_VERSION_CONFLICT");
    row = await pool.query(
      "SELECT licensed_seats FROM merchant_cashier_subscriptions WHERE merchant_id = $1",
      [merchantId],
    );
    assert.equal(Number(row.rows[0].licensed_seats), 4);

    // Renewal after the 7-day grace starts a fresh paid period from payment time.
    const restrictedTime = new Date("2026-12-09T00:00:00.000Z");
    const restrictedQuote = await billing.quoteCashierBillingChange({
      merchantId,
      operation: "renew",
      requestedSeats: 4,
      now: restrictedTime,
    });
    assert.equal(restrictedQuote.billing_period_start, "2026-12-09T00:00:00.000Z");
    assert.equal(restrictedQuote.billing_period_end, "2027-01-09T00:00:00.000Z");

    const restrictedRenewal = await billing.createCashierBillingCheckout({
      merchantId,
      operation: "renew",
      requestedSeats: 4,
      idempotencyKey: "renew-restricted",
      provider: "test_fake",
      now: restrictedTime,
    });
    const restored = await billing.applyVerifiedCashierBillingProviderEvent({
      provider: "test_fake",
      providerEventId: "event-renew-restricted",
      orderId: restrictedRenewal.order.id,
      eventType: "payment_succeeded",
      signatureVerified: true,
      payloadHash: hash("event-renew-restricted"),
      occurredAt: new Date("2026-12-09T00:01:00.000Z"),
      amountIqd: restrictedRenewal.order.amount_iqd,
      currency: "IQD",
      providerPaymentRef: "payment-renew-restricted",
    });
    assert.equal(restored.status, "applied");
    row = await pool.query(
      `SELECT licensed_seats, billing_period_start, billing_period_end
         FROM merchant_cashier_subscriptions WHERE merchant_id = $1`,
      [merchantId],
    );
    assert.equal(Number(row.rows[0].licensed_seats), 4);
    assert.equal(new Date(row.rows[0].billing_period_start).toISOString(), "2026-12-09T00:00:00.000Z");
    assert.equal(new Date(row.rows[0].billing_period_end).toISOString(), "2027-01-09T00:00:00.000Z");
  },
);
