import assert from "node:assert/strict";
import crypto from "node:crypto";
import test from "node:test";

const DATABASE_URL = String(process.env.DATABASE_URL || "").trim();

if (DATABASE_URL) {
  const parsed = new URL(DATABASE_URL);
  assert.ok(
    parsed.hostname === "127.0.0.1" || parsed.hostname === "localhost",
    "cashier subscription regression only permits local PostgreSQL",
  );
  assert.equal(
    parsed.pathname.replace(/^\//, ""),
    "fawri_ci",
    "cashier subscription regression only permits the fawri_ci database",
  );
}

function randomPhone(): string {
  return `+9647${String(crypto.randomInt(0, 1_000_000_000)).padStart(9, "0")}`;
}

function suffix(): string {
  return crypto.randomUUID().replace(/-/g, "").slice(0, 12);
}

test(
  "cashier subscription is independent, seat-limited, concurrency-safe, grace-bound and tenant-scoped",
  { skip: !DATABASE_URL },
  async (t) => {
    Object.assign(process.env, {
      NODE_ENV: "test",
      FAWRI_OPERATIONAL_POSTGRES_AUTHORITY: "required",
      FAWRI_PASSWORD_SALT:
        "cashier-subscription-test-password-salt-over-thirty-two-characters",
      FAWRI_CASHIER_SEAT_PRICE_IQD: "3900",
      FAWRI_CASHIER_GRACE_SECONDS: String(7 * 24 * 60 * 60),
    });

    const [
      { pool },
      { hashPassword },
      merchantAccounts,
      cashier,
      entitlement,
    ] = await Promise.all([
      import("@workspace/db"),
      import("../src/services/authPasswordService.js"),
      import("../src/services/postgresMerchantAccountAuthority.js"),
      import("../src/services/postgresCashierStaffAuthority.js"),
      import("../src/services/cashierEntitlementAuthority.js"),
    ]);

    const merchantIds: string[] = [];

    t.after(async () => {
      for (const merchantId of merchantIds) {
        await pool
          .query("DELETE FROM accounts WHERE id = $1", [merchantId])
          .catch(() => undefined);
      }
      await pool.end();
    });

    async function createMerchant(label: string) {
      const id = suffix();
      const merchant = await merchantAccounts.upsertPendingMerchantAuthoritative({
        phone: randomPhone(),
        passwordHash: hashPassword("CashierSubscription1!"),
        ownerName: `${label} Owner ${id}`,
        storeName: `${label} Store ${id}`,
        activityType: "retail",
        language: "en",
        requestedPlan: "silver",
      });
      merchantIds.push(merchant.account.id);
      await merchantAccounts.markMerchantOtpVerifiedAuthoritative(merchant.account.id);
      await pool.query(
        `UPDATE merchants
            SET status = 'approved',
                account_status = 'approved',
                onboarding_status = 'channel_connected',
                updated_at = now()
          WHERE id = $1`,
        [merchant.account.id],
      );
      return merchant.account.id;
    }

    async function activateCashier(merchantId: string, seats: number) {
      const id = `cashier-sub-${suffix()}`;
      await pool.query(
        `INSERT INTO merchant_cashier_subscriptions (
           id, merchant_id, status, licensed_seats, price_per_seat_iqd,
           billing_period_start, billing_period_end, grace_duration_seconds,
           version, created_at, updated_at
         ) VALUES (
           $1,$2,'active',$3,3900,
           now() - interval '1 day',
           now() + interval '29 days',
           604800,1,now(),now()
         )`,
        [id, merchantId, seats],
      );
      return id;
    }

    const cashierOnlyMerchant = await createMerchant("Cashier Only");
    const noCashierMerchant = await createMerchant("No Cashier");
    const otherMerchant = await createMerchant("Other Tenant");

    // No Bot subscription row is created for cashierOnlyMerchant. Cashier must
    // still work because its entitlement is an independent authority.
    await activateCashier(cashierOnlyMerchant, 1);
    const firstStation = await cashier.createCashierStationAuthoritative({
      merchantId: cashierOnlyMerchant,
      name: "Licensed Station",
      branchKey: `licensed-${suffix()}`,
    });
    assert.ok(firstStation.id);

    // A merchant account by itself (and therefore a possible Bot-only merchant)
    // cannot create Cashier stations without an independent Cashier entitlement.
    await assert.rejects(
      () =>
        cashier.createCashierStationAuthoritative({
          merchantId: noCashierMerchant,
          name: "Unlicensed Station",
          branchKey: `unlicensed-${suffix()}`,
        }),
      (error: unknown) =>
        error instanceof entitlement.CashierEntitlementError &&
        error.code === "CASHIER_ACTIVE_SUBSCRIPTION_REQUIRED",
    );

    // 1 licensed seat means a second station cannot be created by direct service/API bypass.
    await assert.rejects(
      () =>
        cashier.createCashierStationAuthoritative({
          merchantId: cashierOnlyMerchant,
          name: "Second Station",
          branchKey: `second-${suffix()}`,
        }),
      (error: unknown) =>
        error instanceof entitlement.CashierEntitlementError &&
        error.code === "CASHIER_LICENSED_SEAT_LIMIT_REACHED",
    );

    // Upgrade authority to two seats, leaving exactly one unassigned seat.
    await pool.query(
      `UPDATE merchant_cashier_subscriptions
          SET licensed_seats = 2, version = version + 1, updated_at = now()
        WHERE merchant_id = $1`,
      [cashierOnlyMerchant],
    );

    // Two concurrent attempts compete for the final seat. Row locking on the
    // subscription must make exactly one succeed.
    const concurrent = await Promise.allSettled([
      cashier.createCashierStationAuthoritative({
        merchantId: cashierOnlyMerchant,
        name: "Concurrent A",
        branchKey: `concurrent-a-${suffix()}`,
      }),
      cashier.createCashierStationAuthoritative({
        merchantId: cashierOnlyMerchant,
        name: "Concurrent B",
        branchKey: `concurrent-b-${suffix()}`,
      }),
    ]);
    assert.equal(
      concurrent.filter((result) => result.status === "fulfilled").length,
      1,
      "only one concurrent station may consume the final licensed seat",
    );
    assert.equal(
      concurrent.filter((result) => result.status === "rejected").length,
      1,
      "the competing station must be rejected",
    );
    const assignmentCount = await pool.query(
      `SELECT count(*)::int AS count
         FROM cashier_station_seat_assignments
        WHERE merchant_id = $1 AND status = 'active'`,
      [cashierOnlyMerchant],
    );
    assert.equal(Number(assignmentCount.rows[0].count), 2);

    // A different merchant cannot reuse another tenant's station/seat.
    await activateCashier(otherMerchant, 1);
    await assert.rejects(
      () =>
        entitlement.assertCashierStationLicensedAuthoritative({
          merchantId: otherMerchant,
          stationId: firstStation.id,
          allowGrace: true,
        }),
      (error: unknown) =>
        error instanceof entitlement.CashierEntitlementError &&
        error.code === "CASHIER_STATION_LICENSE_REQUIRED",
    );

    // Expiration moves the shared merchant entitlement into grace, not a
    // per-device grace. Existing licensed stations remain valid.
    await pool.query(
      `UPDATE merchant_cashier_subscriptions
          SET billing_period_start = now() - interval '31 days',
              billing_period_end = now() - interval '1 day',
              version = version + 1,
              updated_at = now()
        WHERE merchant_id = $1`,
      [cashierOnlyMerchant],
    );
    const grace = await entitlement.getCashierEntitlementAuthoritative(
      cashierOnlyMerchant,
    );
    assert.equal(grace?.state, "grace");
    const duringGrace =
      await entitlement.assertCashierStationLicensedAuthoritative({
        merchantId: cashierOnlyMerchant,
        stationId: firstStation.id,
        allowGrace: true,
      });
    assert.equal(duringGrace.state, "grace");

    // After exactly more than seven days, new sale authority fails closed while
    // explicit restricted read-only checks can still validate the station.
    await pool.query(
      `UPDATE merchant_cashier_subscriptions
          SET billing_period_start = now() - interval '40 days',
              billing_period_end = now() - interval '8 days',
              version = version + 1,
              updated_at = now()
        WHERE merchant_id = $1`,
      [cashierOnlyMerchant],
    );
    const restricted = await entitlement.getCashierEntitlementAuthoritative(
      cashierOnlyMerchant,
    );
    assert.equal(restricted?.state, "restricted");
    await assert.rejects(
      () =>
        entitlement.assertCashierStationLicensedAuthoritative({
          merchantId: cashierOnlyMerchant,
          stationId: firstStation.id,
          allowGrace: true,
        }),
      (error: unknown) =>
        error instanceof entitlement.CashierEntitlementError &&
        error.code === "CASHIER_STATION_ENTITLEMENT_REQUIRED",
    );
    const readOnly =
      await entitlement.assertCashierStationLicensedAuthoritative({
        merchantId: cashierOnlyMerchant,
        stationId: firstStation.id,
        allowGrace: true,
        allowRestricted: true,
      });
    assert.equal(readOnly.state, "restricted");

    // Administrative suspension overrides both paid period and grace.
    await pool.query(
      `UPDATE merchant_cashier_subscriptions
          SET status = 'suspended',
              billing_period_start = now() - interval '1 day',
              billing_period_end = now() + interval '29 days',
              version = version + 1,
              updated_at = now()
        WHERE merchant_id = $1`,
      [cashierOnlyMerchant],
    );
    const suspended = await entitlement.getCashierEntitlementAuthoritative(
      cashierOnlyMerchant,
    );
    assert.equal(suspended?.state, "suspended");
    await assert.rejects(
      () =>
        entitlement.assertCashierStationLicensedAuthoritative({
          merchantId: cashierOnlyMerchant,
          stationId: firstStation.id,
          allowGrace: true,
          allowRestricted: true,
        }),
      (error: unknown) =>
        error instanceof entitlement.CashierEntitlementError &&
        error.code === "CASHIER_STATION_ENTITLEMENT_REQUIRED",
    );
  },
);
