import assert from "node:assert/strict";
import crypto from "node:crypto";
import test from "node:test";

const DATABASE_URL = String(process.env.DATABASE_URL || "").trim();

if (DATABASE_URL) {
  const parsed = new URL(DATABASE_URL);
  assert.ok(
    parsed.hostname === "127.0.0.1" || parsed.hostname === "localhost",
    "cashier end-shift PIN regression only permits local PostgreSQL",
  );
  assert.equal(
    parsed.pathname.replace(/^\//, ""),
    "fawri_ci",
    "cashier end-shift PIN regression only permits the fawri_ci database",
  );
}

function randomPhone(): string {
  return `07${String(crypto.randomInt(0, 1_000_000_000)).padStart(9, "0")}`;
}

function proofSuffix(): string {
  return crypto.randomUUID().replace(/-/g, "").slice(0, 12);
}

test(
  "ending a cashier shift requires the authenticated employee PIN",
  { skip: !DATABASE_URL },
  async (t) => {
    Object.assign(process.env, {
      NODE_ENV: "test",
      FAWRI_OPERATIONAL_POSTGRES_AUTHORITY: "required",
      FAWRI_PASSWORD_SALT:
        "cashier-end-shift-pin-test-password-salt-over-thirty-two-characters",
    });

    const [
      { pool },
      { hashPassword },
      merchantAccounts,
      cashier,
      shiftClose,
    ] = await Promise.all([
      import("@workspace/db"),
      import("../src/services/authPasswordService.js"),
      import("../src/services/postgresMerchantAccountAuthority.js"),
      import("../src/services/postgresCashierStaffAuthority.js"),
      import("../src/services/cashierOperatorShiftCloseAuthority.js"),
    ]);

    const suffix = proofSuffix();
    const phone = randomPhone();
    const password = "CashierEndShift1!";
    const employeePin = "2468";
    const otherEmployeePin = "1357";
    const deviceId = `cashier-end-shift-device-${suffix}`;
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
      phone,
      passwordHash: hashPassword(password),
      ownerName: `End Shift Owner ${suffix}`,
      storeName: `End Shift Store ${suffix}`,
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
      displayName: `End Shift Cashier ${suffix}`,
      role: "cashier",
      pin: employeePin,
    });
    await cashier.createCashierStaffAuthoritative({
      merchantId,
      displayName: `Other End Shift Manager ${suffix}`,
      role: "manager",
      pin: otherEmployeePin,
    });
    const station = await cashier.createCashierStationAuthoritative({
      merchantId,
      name: `End Shift Station ${suffix}`,
      branchKey: `end-shift-${suffix}`,
    });
    const pairing = await cashier.beginCashierStationPairingAuthoritative({
      merchantId,
      stationId: station.id,
    });
    const paired = await cashier.redeemCashierStationPairingAuthoritative({
      pairingCode: pairing.pairing_code,
      deviceId,
    });
    const stationContext = await cashier.authenticateCashierStationAuthoritative({
      stationToken: paired.station_token,
      deviceId,
    });
    const operator = await cashier.loginCashierOperatorAuthoritative({
      station: stationContext,
      staffId: staff.id,
      pin: employeePin,
    });

    await assert.rejects(
      shiftClose.logoutCashierOperatorWithPinAuthoritative({
        context: operator.context,
        pin: otherEmployeePin,
      }),
      (error: unknown) => {
        const candidate = error as { code?: unknown; status?: unknown };
        assert.equal(candidate.code, "CASHIER_OPERATOR_INVALID");
        assert.equal(candidate.status, 401);
        return true;
      },
      "another active employee PIN must not close the authenticated employee shift",
    );

    const afterOtherEmployeePin = await pool.query(
      `SELECT sh.status::text AS shift_status,
              os.status::text AS session_status,
              staff.failed_pin_attempts,
              staff.pin_locked_until
         FROM cashier_shifts AS sh
         JOIN cashier_operator_sessions AS os
           ON os.shift_id = sh.id
          AND os.id = $2
         JOIN merchant_cashier_staff AS staff
           ON staff.merchant_id = sh.merchant_id
          AND staff.id = sh.staff_id
        WHERE sh.id = $1
          AND sh.merchant_id = $3
        LIMIT 1`,
      [operator.context.shift_id, operator.context.operator_session_id, merchantId],
    );
    assert.equal(afterOtherEmployeePin.rows.length, 1);
    assert.equal(afterOtherEmployeePin.rows[0].shift_status, "open");
    assert.equal(afterOtherEmployeePin.rows[0].session_status, "active");
    assert.equal(Number(afterOtherEmployeePin.rows[0].failed_pin_attempts), 1);
    assert.equal(afterOtherEmployeePin.rows[0].pin_locked_until, null);

    const stillAuthenticated = await cashier.authenticateCashierOperatorAuthoritative({
      stationToken: paired.station_token,
      operatorToken: operator.operator_token,
      deviceId,
      requiredPermission: "sale.create",
    });
    assert.equal(stillAuthenticated.operator_session_id, operator.context.operator_session_id);
    assert.equal(stillAuthenticated.shift_id, operator.context.shift_id);
    assert.equal(stillAuthenticated.staff_id, staff.id);

    await shiftClose.logoutCashierOperatorWithPinAuthoritative({
      context: operator.context,
      pin: employeePin,
    });

    const afterCorrectPin = await pool.query(
      `SELECT sh.status::text AS shift_status,
              sh.ended_at,
              sh.close_reason,
              os.status::text AS session_status,
              os.revoked_at,
              staff.failed_pin_attempts,
              staff.pin_locked_until
         FROM cashier_shifts AS sh
         JOIN cashier_operator_sessions AS os
           ON os.shift_id = sh.id
          AND os.id = $2
         JOIN merchant_cashier_staff AS staff
           ON staff.merchant_id = sh.merchant_id
          AND staff.id = sh.staff_id
        WHERE sh.id = $1
          AND sh.merchant_id = $3
        LIMIT 1`,
      [operator.context.shift_id, operator.context.operator_session_id, merchantId],
    );
    assert.equal(afterCorrectPin.rows.length, 1);
    assert.equal(afterCorrectPin.rows[0].shift_status, "closed");
    assert.ok(afterCorrectPin.rows[0].ended_at);
    assert.equal(afterCorrectPin.rows[0].close_reason, "operator_logout");
    assert.equal(afterCorrectPin.rows[0].session_status, "revoked");
    assert.ok(afterCorrectPin.rows[0].revoked_at);
    assert.equal(Number(afterCorrectPin.rows[0].failed_pin_attempts), 0);
    assert.equal(afterCorrectPin.rows[0].pin_locked_until, null);

    await assert.rejects(
      cashier.authenticateCashierOperatorAuthoritative({
        stationToken: paired.station_token,
        operatorToken: operator.operator_token,
        deviceId,
        requiredPermission: "sale.create",
      }),
      (error: unknown) => {
        const candidate = error as { code?: unknown; status?: unknown };
        assert.equal(candidate.code, "CASHIER_OPERATOR_SESSION_INVALID");
        assert.equal(candidate.status, 401);
        return true;
      },
      "the previous operator session must be unusable after a successful PIN-confirmed shift close",
    );
  },
);
