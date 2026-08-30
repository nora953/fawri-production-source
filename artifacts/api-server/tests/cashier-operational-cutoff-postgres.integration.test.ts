import assert from "node:assert/strict";
import crypto from "node:crypto";
import test from "node:test";

const DATABASE_URL = String(process.env.DATABASE_URL || "").trim();

if (DATABASE_URL) {
  const parsed = new URL(DATABASE_URL);
  assert.ok(
    parsed.hostname === "127.0.0.1" || parsed.hostname === "localhost",
    "cashier operational-cutoff regression only permits local PostgreSQL",
  );
  assert.equal(
    parsed.pathname.replace(/^\//, ""),
    "fawri_ci",
    "cashier operational-cutoff regression only permits the fawri_ci database",
  );
}

function randomPhone(): string {
  return `07${String(crypto.randomInt(0, 1_000_000_000)).padStart(9, "0")}`;
}

function proofSuffix(): string {
  return crypto.randomUUID().replace(/-/g, "").slice(0, 12);
}

test(
  "suspending a merchant invalidates existing cashier station/operator access and stale pairing codes",
  { skip: !DATABASE_URL },
  async (t) => {
    Object.assign(process.env, {
      NODE_ENV: "test",
      FAWRI_OPERATIONAL_POSTGRES_AUTHORITY: "required",
      FAWRI_PASSWORD_SALT:
        "cashier-operational-cutoff-test-password-salt-over-thirty-two-characters",
    });

    const [
      { pool },
      { hashPassword },
      merchantAccounts,
      cashier,
    ] = await Promise.all([
      import("@workspace/db"),
      import("../src/services/authPasswordService.js"),
      import("../src/services/postgresMerchantAccountAuthority.js"),
      import("../src/services/postgresCashierStaffAuthority.js"),
    ]);

    const suffix = proofSuffix();
    const phone = randomPhone();
    const password = "CashierCutoff1!";
    const deviceId = `cashier-cutoff-device-${suffix}`;
    let merchantId = "";

    t.after(async () => {
      if (merchantId) {
        await pool
          .query("DELETE FROM accounts WHERE id = $1", [merchantId])
          .catch(() => undefined);
      }
      await pool.end();
    });

    const collision = await pool.query(
      "SELECT id FROM accounts WHERE phone = $1 LIMIT 1",
      [phone],
    );
    assert.equal(
      collision.rows.length,
      0,
      "generated cashier-cutoff phone must not collide with an existing account",
    );

    const merchant = await merchantAccounts.upsertPendingMerchantAuthoritative({
      phone,
      passwordHash: hashPassword(password),
      ownerName: `Cashier Cutoff Owner ${suffix}`,
      storeName: `Cashier Cutoff Store ${suffix}`,
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

    const staff = await cashier.createCashierStaffAuthoritative({
      merchantId,
      displayName: `Cutoff Cashier ${suffix}`,
      role: "manager",
      pin: "2468",
    });
    const activeStation = await cashier.createCashierStationAuthoritative({
      merchantId,
      name: `Active Station ${suffix}`,
      branchKey: `active-${suffix}`,
    });
    const stalePairingStation = await cashier.createCashierStationAuthoritative({
      merchantId,
      name: `Pending Pair Station ${suffix}`,
      branchKey: `pending-${suffix}`,
    });

    const activePairing = await cashier.beginCashierStationPairingAuthoritative({
      merchantId,
      stationId: activeStation.id,
    });
    const paired = await cashier.redeemCashierStationPairingAuthoritative({
      pairingCode: activePairing.pairing_code,
      deviceId,
    });
    const operator = await cashier.loginCashierOperatorAuthoritative({
      station: {
        credential_id: String(
          (
            await pool.query(
              `SELECT id
                 FROM cashier_station_credentials
                WHERE merchant_id = $1 AND station_id = $2 AND status = 'active'
                ORDER BY issued_at DESC
                LIMIT 1`,
              [merchantId, activeStation.id],
            )
          ).rows[0]?.id || "",
        ),
        merchant_id: merchantId,
        station_id: activeStation.id,
        station_name: paired.station_name,
        branch_key: paired.branch_key,
        ...(paired.branch_label ? { branch_label: paired.branch_label } : {}),
        offline_inventory_authority: paired.offline_inventory_authority,
        credential_version: Number(
          (
            await pool.query(
              `SELECT credential_version
                 FROM merchant_cashier_stations
                WHERE merchant_id = $1 AND id = $2`,
              [merchantId, activeStation.id],
            )
          ).rows[0]?.credential_version,
        ),
        credential_expires_at: paired.credential_expires_at,
        device_id: deviceId,
      },
      staffId: staff.id,
      pin: "2468",
    });

    const stalePairing = await cashier.beginCashierStationPairingAuthoritative({
      merchantId,
      stationId: stalePairingStation.id,
    });

    await pool.query(
      `UPDATE merchants
          SET status = 'suspended',
              account_status = 'suspended',
              updated_at = now()
        WHERE id = $1`,
      [merchantId],
    );

    const outcomes = await Promise.allSettled([
      cashier.authenticateCashierStationAuthoritative({
        stationToken: paired.station_token,
        deviceId,
      }),
      cashier.authenticateCashierOperatorAuthoritative({
        stationToken: paired.station_token,
        operatorToken: operator.operator_token,
        deviceId,
        requiredPermission: "sale.create",
      }),
      cashier.redeemCashierStationPairingAuthoritative({
        pairingCode: stalePairing.pairing_code,
        deviceId: `cashier-cutoff-stale-device-${suffix}`,
      }),
    ]);

    for (const [index, outcome] of outcomes.entries()) {
      assert.equal(
        outcome.status,
        "rejected",
        [
          "existing station credential must fail after merchant suspension",
          "existing operator session must fail after merchant suspension",
          "pre-suspension pairing code must not activate a device after suspension",
        ][index],
      );
      if (outcome.status === "rejected") {
        const error = outcome.reason as { code?: unknown; status?: unknown };
        assert.equal(error.code, "MERCHANT_SUSPENDED");
        assert.equal(error.status, 403);
      }
    }
  },
);
