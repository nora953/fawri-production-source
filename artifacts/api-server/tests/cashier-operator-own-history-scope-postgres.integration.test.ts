import assert from "node:assert/strict";
import crypto from "node:crypto";
import test from "node:test";

const DATABASE_URL = String(process.env.DATABASE_URL || "").trim();

if (DATABASE_URL) {
  const parsed = new URL(DATABASE_URL);
  assert.ok(
    parsed.hostname === "127.0.0.1" || parsed.hostname === "localhost",
    "cashier own-history regression only permits local PostgreSQL",
  );
  assert.equal(
    parsed.pathname.replace(/^\//, ""),
    "fawri_ci",
    "cashier own-history regression only permits the fawri_ci database",
  );
}

function randomPhone(): string {
  return `07${String(crypto.randomInt(0, 1_000_000_000)).padStart(9, "0")}`;
}

function suffix(): string {
  return crypto.randomUUID().replace(/-/g, "").slice(0, 12);
}

test(
  "sale.view_own report keeps the employee previous shift sales and excludes another employee",
  { skip: !DATABASE_URL },
  async (t) => {
    Object.assign(process.env, {
      NODE_ENV: "test",
      FAWRI_OPERATIONAL_POSTGRES_AUTHORITY: "required",
      FAWRI_PASSWORD_SALT:
        "cashier-own-history-test-password-salt-over-thirty-two-characters",
    });

    const [{ pool }, { hashPassword }, merchants, cashier, reports] = await Promise.all([
      import("@workspace/db"),
      import("../src/services/authPasswordService.js"),
      import("../src/services/postgresMerchantAccountAuthority.js"),
      import("../src/services/postgresCashierStaffAuthority.js"),
      import("../src/services/postgresCashierOperatorReportAuthority.js"),
    ]);

    const key = suffix();
    const phone = randomPhone();
    let merchantId = "";

    t.after(async () => {
      if (merchantId) {
        await pool.query("DELETE FROM accounts WHERE id = $1", [merchantId]).catch(() => undefined);
      }
      await pool.end();
    });

    const merchant = await merchants.upsertPendingMerchantAuthoritative({
      phone,
      passwordHash: hashPassword("CashierOwnHistory1!"),
      ownerName: `Own History Owner ${key}`,
      storeName: `Own History Store ${key}`,
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

    const own = await cashier.createCashierStaffAuthoritative({
      merchantId,
      displayName: `Own Cashier ${key}`,
      role: "cashier",
      pin: "2468",
      permissions: ["sale.create", "sale.view_own", "reports.sales"],
    });
    const other = await cashier.createCashierStaffAuthoritative({
      merchantId,
      displayName: `Other Cashier ${key}`,
      role: "cashier",
      pin: "1357",
      permissions: ["sale.create", "sale.view_own", "reports.sales"],
    });
    const station = await cashier.createCashierStationAuthoritative({
      merchantId,
      name: `Own History Station ${key}`,
      branchKey: `own-history-${key}`,
    });
    const pairing = await cashier.beginCashierStationPairingAuthoritative({
      merchantId,
      stationId: station.id,
    });
    const deviceId = `own-history-device-${key}`;
    const paired = await cashier.redeemCashierStationPairingAuthoritative({
      pairingCode: pairing.pairing_code,
      deviceId,
    });
    const stationContext = await cashier.authenticateCashierStationAuthoritative({
      stationToken: paired.station_token,
      deviceId,
    });

    const shiftOne = await cashier.loginCashierOperatorAuthoritative({
      station: stationContext,
      staffId: own.id,
      pin: "2468",
    });
    await pool.query(
      `INSERT INTO orders (
         id, merchant_id, customer_name, status, payment_method, payment_status,
         subtotal_iqd, delivery_fee_iqd, total_iqd, source_channel, version,
         notes, metadata, created_at, updated_at
       ) VALUES ($1,$2,'Cashier','confirmed','cash','paid',1000,0,1000,'cashier',1,NULL,$3::jsonb,now(),now())`,
      [
        `order-own-shift-one-${key}`,
        merchantId,
        JSON.stringify({
          cashier_sync: {
            sale_snapshot: {
              sale_id: `sale-own-shift-one-${key}`,
              operation_id: `op-own-shift-one-${key}`,
              local_merchant_id: merchantId,
              cloud_merchant_id: merchantId,
              device_id: deviceId,
              device_sequence: 1,
              source: "cashier",
              status: "completed",
              lines: [],
              subtotal_minor: 1000,
              discount_minor: 0,
              total_minor: 1000,
              currency_code: "IQD",
              currency_fraction_digits: 0,
              payment_method: "cash",
              payment_status: "paid",
              occurred_at: new Date().toISOString(),
            },
          },
        }),
      ],
    );
    await pool.query(
      `INSERT INTO cashier_operation_attribution (
         id, merchant_id, operation_id, sale_id, operation_kind,
         station_id, staff_id, shift_id, device_id,
         station_credential_id, operator_session_id, occurred_at, created_at
       ) VALUES ($1,$2,$3,$4,'sale',$5,$6,$7,$8,$9,$10,now(),now())`,
      [
        `cashattr-own-one-${key}`,
        merchantId,
        `op-own-shift-one-${key}`,
        `order-own-shift-one-${key}`,
        station.id,
        own.id,
        shiftOne.context.shift_id,
        deviceId,
        shiftOne.context.credential_id,
        shiftOne.context.operator_session_id,
      ],
    );

    await pool.query(
      `UPDATE cashier_operator_sessions
          SET status = 'revoked', revoked_at = now()
        WHERE id = $1`,
      [shiftOne.context.operator_session_id],
    );
    await pool.query(
      `UPDATE cashier_shifts
          SET status = 'closed', ended_at = now(), close_reason = 'test'
        WHERE id = $1`,
      [shiftOne.context.shift_id],
    );

    const otherShift = await cashier.loginCashierOperatorAuthoritative({
      station: stationContext,
      staffId: other.id,
      pin: "1357",
    });
    await pool.query(
      `INSERT INTO orders (
         id, merchant_id, customer_name, status, payment_method, payment_status,
         subtotal_iqd, delivery_fee_iqd, total_iqd, source_channel, version,
         notes, metadata, created_at, updated_at
       ) VALUES ($1,$2,'Cashier','confirmed','cash','paid',2000,0,2000,'cashier',1,NULL,$3::jsonb,now(),now())`,
      [
        `order-other-${key}`,
        merchantId,
        JSON.stringify({
          cashier_sync: {
            sale_snapshot: {
              sale_id: `sale-other-${key}`,
              operation_id: `op-other-${key}`,
              local_merchant_id: merchantId,
              cloud_merchant_id: merchantId,
              device_id: deviceId,
              device_sequence: 2,
              source: "cashier",
              status: "completed",
              lines: [],
              subtotal_minor: 2000,
              discount_minor: 0,
              total_minor: 2000,
              currency_code: "IQD",
              currency_fraction_digits: 0,
              payment_method: "cash",
              payment_status: "paid",
              occurred_at: new Date().toISOString(),
            },
          },
        }),
      ],
    );
    await pool.query(
      `INSERT INTO cashier_operation_attribution (
         id, merchant_id, operation_id, sale_id, operation_kind,
         station_id, staff_id, shift_id, device_id,
         station_credential_id, operator_session_id, occurred_at, created_at
       ) VALUES ($1,$2,$3,$4,'sale',$5,$6,$7,$8,$9,$10,now(),now())`,
      [
        `cashattr-other-${key}`,
        merchantId,
        `op-other-${key}`,
        `order-other-${key}`,
        station.id,
        other.id,
        otherShift.context.shift_id,
        deviceId,
        otherShift.context.credential_id,
        otherShift.context.operator_session_id,
      ],
    );
    await pool.query(
      `UPDATE cashier_operator_sessions SET status = 'revoked', revoked_at = now() WHERE id = $1`,
      [otherShift.context.operator_session_id],
    );
    await pool.query(
      `UPDATE cashier_shifts SET status = 'closed', ended_at = now(), close_reason = 'test' WHERE id = $1`,
      [otherShift.context.shift_id],
    );

    const current = await cashier.loginCashierOperatorAuthoritative({
      station: stationContext,
      staffId: own.id,
      pin: "2468",
    });
    assert.notEqual(current.context.shift_id, shiftOne.context.shift_id);

    const report = await reports.buildCashierOperatorReportAuthoritative({
      context: current.context,
    });

    assert.equal(report.scope, "own_staff");
    assert.equal(report.sales_scanned, 1);
    assert.equal(report.report.sale_count, 1);
  },
);
