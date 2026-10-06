import assert from "node:assert/strict";
import crypto from "node:crypto";
import test from "node:test";

const DATABASE_URL = String(process.env.DATABASE_URL || "").trim();

if (DATABASE_URL) {
  const parsed = new URL(DATABASE_URL);
  assert.ok(
    parsed.hostname === "127.0.0.1" || parsed.hostname === "localhost",
    "cashier downgrade regression only permits local PostgreSQL",
  );
  assert.equal(
    parsed.pathname.replace(/^\//, ""),
    "fawri_ci",
    "cashier downgrade regression only permits the fawri_ci database",
  );
}

function randomPhone(): string {
  return `+9647${String(crypto.randomInt(0, 1_000_000_000)).padStart(9, "0")}`;
}

function digest(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

test(
  "scheduled downgrade preserves pre-expiry seats through grace and applies only after paid renewal",
  { skip: !DATABASE_URL },
  async (t) => {
    Object.assign(process.env, {
      NODE_ENV: "test",
      FAWRI_OPERATIONAL_POSTGRES_AUTHORITY: "required",
      FAWRI_PASSWORD_SALT:
        "cashier-downgrade-test-password-salt-over-thirty-two-characters",
      FAWRI_CASHIER_SEAT_PRICE_IQD: "3900",
      FAWRI_CASHIER_GRACE_SECONDS: String(7 * 24 * 60 * 60),
      FAWRI_SAAS_BILLING_PROVIDER: "test_fake",
      FAWRI_SAAS_BILLING_PROVIDERS: "test_fake",
    });

    const [
      { pool },
      { hashPassword },
      merchantAccounts,
      cashier,
      entitlement,
      billing,
    ] = await Promise.all([
      import("@workspace/db"),
      import("../src/services/authPasswordService.js"),
      import("../src/services/postgresMerchantAccountAuthority.js"),
      import("../src/services/postgresCashierStaffAuthority.js"),
      import("../src/services/cashierEntitlementAuthority.js"),
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
      passwordHash: hashPassword("CashierDowngrade1!"),
      ownerName: "Cashier Downgrade Owner",
      storeName: "Cashier Downgrade Store",
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

    const subscriptionId = `cashier-sub-${crypto.randomUUID()}`;
    await pool.query(
      `INSERT INTO merchant_cashier_subscriptions (
         id, merchant_id, status, licensed_seats, price_per_seat_iqd,
         billing_period_start, billing_period_end, grace_duration_seconds,
         version, created_at, updated_at
       ) VALUES (
         $1,$2,'active',3,3900,
         '2026-10-01T00:00:00.000Z',
         '2026-11-01T00:00:00.000Z',
         604800,1,now(),now()
       )`,
      [subscriptionId, merchantId],
    );

    const stations = [];
    for (const label of ["Keep", "Release A", "Release B"]) {
      stations.push(
        await cashier.createCashierStationAuthoritative({
          merchantId,
          name: label,
          branchKey: `${label.toLowerCase().replace(/\s+/g, "-")}-${crypto.randomUUID().slice(0, 8)}`,
        }),
      );
    }

    const scheduled = await entitlement.scheduleCashierDowngradeAuthoritative({
      merchantId,
      targetSeats: 1,
      keepStationIds: [stations[0].id],
      expectedVersion: 1,
    });
    assert.equal(scheduled.licensed_seats, 3);
    assert.equal(scheduled.scheduled_licensed_seats, 1);

    await pool.query(
      `UPDATE merchant_cashier_subscriptions
          SET billing_period_start = now() - interval '32 days',
              billing_period_end = now() - interval '1 day',
              scheduled_change_at = now() - interval '1 day',
              updated_at = now()
        WHERE merchant_id = $1`,
      [merchantId],
    );

    const grace = await entitlement.getCashierEntitlementAuthoritative(merchantId);
    assert.equal(grace?.state, "grace");
    assert.equal(
      grace?.licensed_seats,
      3,
      "scheduled downgrade must not reduce the pre-expiry entitlement during grace",
    );
    assert.equal(grace?.scheduled_licensed_seats, 1);

    for (const station of stations) {
      const snapshot =
        await entitlement.assertCashierStationLicensedAuthoritative({
          merchantId,
          stationId: station.id,
          allowGrace: true,
        });
      assert.equal(
        snapshot.state,
        "grace",
        "every station licensed at expiry must remain permitted through grace",
      );
    }

    const quote = await billing.quoteCashierBillingChange({
      merchantId,
      operation: "renew",
      requestedSeats: 1,
    });
    assert.equal(quote.current_seats, 3);
    assert.equal(quote.resulting_seats, 1);
    assert.equal(quote.amount_iqd, 3900);

    const checkout = await billing.createCashierBillingCheckout({
      merchantId,
      operation: "renew",
      requestedSeats: 1,
      idempotencyKey: "downgrade-renewal",
      provider: "test_fake",
    });
    const outcome = await billing.applyVerifiedCashierBillingProviderEvent({
      provider: "test_fake",
      providerEventId: "downgrade-renewal-event",
      orderId: checkout.order.id,
      eventType: "payment_succeeded",
      signatureVerified: true,
      payloadHash: digest("downgrade-renewal-event"),
      occurredAt: new Date(),
      amountIqd: checkout.order.amount_iqd,
      currency: "IQD",
      providerPaymentRef: "downgrade-renewal-payment",
    });
    assert.equal(outcome.status, "applied");

    const after = await entitlement.getCashierEntitlementAuthoritative(merchantId);
    assert.equal(after?.state, "active");
    assert.equal(after?.licensed_seats, 1);
    assert.equal(after?.scheduled_licensed_seats, undefined);

    const assignments = await pool.query(
      `SELECT station_id, status
         FROM cashier_station_seat_assignments
        WHERE merchant_id = $1
        ORDER BY station_id`,
      [merchantId],
    );
    const statusByStation = new Map(
      assignments.rows.map((row) => [String(row.station_id), String(row.status)]),
    );
    assert.equal(statusByStation.get(stations[0].id), "active");
    assert.equal(statusByStation.get(stations[1].id), "released");
    assert.equal(statusByStation.get(stations[2].id), "released");

    await entitlement.assertCashierStationLicensedAuthoritative({
      merchantId,
      stationId: stations[0].id,
      allowGrace: true,
    });
    for (const station of stations.slice(1)) {
      await assert.rejects(
        () =>
          entitlement.assertCashierStationLicensedAuthoritative({
            merchantId,
            stationId: station.id,
            allowGrace: true,
          }),
        (error: unknown) =>
          error instanceof entitlement.CashierEntitlementError &&
          error.code === "CASHIER_STATION_LICENSE_REQUIRED",
      );
    }
  },
);
