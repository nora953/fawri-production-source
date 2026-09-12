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

    const insertSaleEvidence = async (input: {
      orderId: string;
      operationId: string;
      amount: number;
      staffId: string;
      shiftId: string;
      credentialId: string;
      operatorSessionId: string;
    }) => {
      const occurredAt = new Date();
      const lineId = `line-${input.operationId}`;
      const saleSnapshot = {
        sale_id: input.orderId,
        operation_id: input.operationId,
        local_merchant_id: merchantId,
        cloud_merchant_id: merchantId,
        device_id: deviceId,
        device_sequence: input.amount,
        source: "cashier",
        status: "completed",
        lines: [
          {
            line_id: lineId,
            product_id: `product-${key}`,
            product_name_snapshot: "Regression item",
            quantity: 1,
            base_unit_price_minor: input.amount,
            effective_unit_price_minor: input.amount,
            discount_minor: 0,
            line_total_minor: input.amount,
          },
        ],
        subtotal_minor: input.amount,
        discount_minor: 0,
        total_minor: input.amount,
        currency_code: "IQD",
        currency_fraction_digits: 0,
        payment_method: "cash",
        payment_status: "paid",
        occurred_at: occurredAt.toISOString(),
      };

      await pool.query(
        `INSERT INTO orders (
           id, merchant_id, customer_name, status, payment_method, payment_status,
           subtotal_iqd, delivery_fee_iqd, total_iqd, source_channel, version,
           notes, payment_verified_at, payment_confirmation_source,
           confirmed_at, delivered_at, metadata, created_at, updated_at
         ) VALUES (
           $1,$2,'Cashier sale','delivered','cash_on_delivery','paid',
           $3,0,$3,'cashier',1,NULL,$4,'merchant_confirmed',$4,$4,$5::jsonb,$4,$4
         )`,
        [
          input.orderId,
          merchantId,
          input.amount,
          occurredAt,
          JSON.stringify({ cashier_sync: { sale_snapshot: saleSnapshot } }),
        ],
      );
      await pool.query(
        `INSERT INTO cashier_operation_attribution (
           id, merchant_id, operation_id, sale_id, operation_kind,
           station_id, staff_id, shift_id, device_id,
           station_credential_id, operator_session_id, occurred_at, created_at
         ) VALUES ($1,$2,$3,$4,'sale',$5,$6,$7,$8,$9,$10,$11,$11)`,
        [
          `cashattr-${input.operationId}`,
          merchantId,
          input.operationId,
          input.orderId,
          station.id,
          input.staffId,
          input.shiftId,
          deviceId,
          input.credentialId,
          input.operatorSessionId,
          occurredAt,
        ],
      );
    };

    const closeShift = async (operatorSessionId: string, shiftId: string) => {
      await pool.query(
        `UPDATE cashier_operator_sessions
            SET status = 'revoked', revoked_at = now()
          WHERE id = $1`,
        [operatorSessionId],
      );
      await pool.query(
        `UPDATE cashier_shifts
            SET status = 'closed', ended_at = now(), close_reason = 'test'
          WHERE id = $1`,
        [shiftId],
      );
    };

    const shiftOne = await cashier.loginCashierOperatorAuthoritative({
      station: stationContext,
      staffId: own.id,
      pin: "2468",
    });
    await insertSaleEvidence({
      orderId: `order-own-shift-one-${key}`,
      operationId: `op-own-shift-one-${key}`,
      amount: 1000,
      staffId: own.id,
      shiftId: shiftOne.context.shift_id,
      credentialId: shiftOne.context.credential_id,
      operatorSessionId: shiftOne.context.operator_session_id,
    });
    await closeShift(
      shiftOne.context.operator_session_id,
      shiftOne.context.shift_id,
    );

    const otherShift = await cashier.loginCashierOperatorAuthoritative({
      station: stationContext,
      staffId: other.id,
      pin: "1357",
    });
    await insertSaleEvidence({
      orderId: `order-other-${key}`,
      operationId: `op-other-${key}`,
      amount: 2000,
      staffId: other.id,
      shiftId: otherShift.context.shift_id,
      credentialId: otherShift.context.credential_id,
      operatorSessionId: otherShift.context.operator_session_id,
    });
    await closeShift(
      otherShift.context.operator_session_id,
      otherShift.context.shift_id,
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
    assert.equal(report.report.by_currency[0]?.gross_revenue_minor, 1000);
  },
);
