import assert from "node:assert/strict";
import crypto from "node:crypto";
import test from "node:test";

const DATABASE_URL = String(process.env.DATABASE_URL || "").trim();

if (DATABASE_URL) {
  const parsed = new URL(DATABASE_URL);
  assert.ok(
    parsed.hostname === "127.0.0.1" || parsed.hostname === "localhost",
    "merchant deletion cashier lifecycle regression only permits local PostgreSQL",
  );
  assert.equal(
    parsed.pathname.replace(/^\//, ""),
    "fawri_ci",
    "merchant deletion cashier lifecycle regression only permits the fawri_ci database",
  );
}

function randomPhone(): string {
  return `07${String(crypto.randomInt(0, 1_000_000_000)).padStart(9, "0")}`;
}

function suffix(): string {
  return crypto.randomUUID().replace(/-/g, "").slice(0, 12);
}

test(
  "irreversible merchant deletion removes cashier auth state and anonymizes retained accounting anchors",
  { skip: !DATABASE_URL },
  async (t) => {
    Object.assign(process.env, {
      NODE_ENV: "test",
      FAWRI_OPERATIONAL_POSTGRES_AUTHORITY: "required",
      FAWRI_PASSWORD_SALT:
        "merchant-deletion-cashier-lifecycle-password-salt-over-thirty-two-characters",
    });

    const [
      { pool },
      { hashPassword },
      merchantAccounts,
      cashier,
      merchantManagement,
    ] = await Promise.all([
      import("@workspace/db"),
      import("../src/services/authPasswordService.js"),
      import("../src/services/postgresMerchantAccountAuthority.js"),
      import("../src/services/postgresCashierStaffAuthority.js"),
      import("../src/services/postgresMerchantManagementAuthority.js"),
    ]);

    const proof = suffix();
    const merchantPhone = randomPhone();
    const adminPhone = randomPhone();
    const adminId = `cashier-delete-admin-${proof}`;
    const deviceId = `cashier-delete-device-${proof}`;
    let merchantId = "";
    let deletionRequestId = "";

    t.after(async () => {
      if (merchantId) {
        await pool
          .query(
            `DELETE FROM merchant_deletion_requests
              WHERE merchant_id_snapshot = $1 OR requested_by_admin_id_snapshot = $2`,
            [merchantId, adminId],
          )
          .catch(() => undefined);
        await pool
          .query(
            `DELETE FROM audit_events
              WHERE merchant_id = $1 OR actor_account_id = $2`,
            [merchantId, adminId],
          )
          .catch(() => undefined);
        await pool
          .query("DELETE FROM accounts WHERE id = $1", [merchantId])
          .catch(() => undefined);
      }
      await pool
        .query("DELETE FROM accounts WHERE id = $1", [adminId])
        .catch(() => undefined);
      await pool.end();
    });

    const collisions = await pool.query(
      "SELECT id FROM accounts WHERE phone = ANY($1::text[]) LIMIT 1",
      [[merchantPhone, adminPhone]],
    );
    assert.equal(
      collisions.rows.length,
      0,
      "generated cashier deletion proof phones must not collide with existing accounts",
    );

    await pool.query(
      `INSERT INTO accounts (
         id, kind, phone, password_hash, state, language,
         phone_verified, phone_verified_at, created_at, updated_at
       ) VALUES ($1, 'admin', $2, $3, 'active', 'en', true, now(), now(), now())`,
      [adminId, adminPhone, hashPassword("CashierDeletionAdmin9!")],
    );
    await pool.query(
      `INSERT INTO admin_profiles (
         id, account_id, profile_kind, display_name, role,
         enabled, must_change_password, created_at, updated_at
       ) VALUES ($1, $1, 'admin', $2, 'owner_admin', true, false, now(), now())`,
      [adminId, `Cashier Deletion Owner ${proof}`],
    );

    const merchant = await merchantAccounts.upsertPendingMerchantAuthoritative({
      phone: merchantPhone,
      passwordHash: hashPassword("CashierDeletionMerchant9!"),
      ownerName: `Cashier Deletion Merchant ${proof}`,
      storeName: `Cashier Deletion Store ${proof}`,
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
      displayName: `Sensitive Cashier ${proof}`,
      role: "manager",
      pin: "2468",
    });
    const primaryStation = await cashier.createCashierStationAuthoritative({
      merchantId,
      name: `Sensitive Main Station ${proof}`,
      branchKey: `main-${proof}`,
      branchLabel: `Sensitive Branch ${proof}`,
      offlineInventoryAuthority: true,
    });
    const pendingStation = await cashier.createCashierStationAuthoritative({
      merchantId,
      name: `Sensitive Pending Station ${proof}`,
      branchKey: `pending-${proof}`,
      branchLabel: `Sensitive Pending Branch ${proof}`,
    });

    const pairing = await cashier.beginCashierStationPairingAuthoritative({
      merchantId,
      stationId: primaryStation.id,
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
      pin: "2468",
    });
    await cashier.beginCashierStationPairingAuthoritative({
      merchantId,
      stationId: pendingStation.id,
    });

    const operationId = `cashier-delete-operation-${proof}`;
    const saleId = `cashier-delete-sale-${proof}`;
    const attributionId = `cashier-delete-attribution-${proof}`;
    await pool.query(
      `INSERT INTO cashier_operation_attribution (
         id, merchant_id, operation_id, sale_id, operation_kind,
         station_id, staff_id, shift_id, device_id,
         station_credential_id, operator_session_id, occurred_at, created_at
       ) VALUES ($1,$2,$3,$4,'sale',$5,$6,$7,$8,$9,$10,now(),now())`,
      [
        attributionId,
        merchantId,
        operationId,
        saleId,
        operator.context.station_id,
        operator.context.staff_id,
        operator.context.shift_id,
        operator.context.device_id,
        operator.context.credential_id,
        operator.context.operator_session_id,
      ],
    );

    for (const table of [
      "merchant_cashier_staff_permissions",
      "cashier_station_pairing_challenges",
      "cashier_station_credentials",
      "cashier_operator_sessions",
      "cashier_shifts",
      "cashier_operation_attribution",
    ]) {
      const before = await pool.query<{ count: number }>(
        `SELECT COUNT(*)::int AS count FROM ${table} WHERE merchant_id = $1`,
        [merchantId],
      );
      assert.ok(
        Number(before.rows[0]?.count) > 0,
        `${table} fixture must exist before irreversible deletion`,
      );
    }

    await merchantManagement.updateMerchantStatusPostgres({
      merchantId,
      status: "suspended",
      reason: "cashier deletion lifecycle proof",
      actorAdminId: adminId,
    });
    const deletionRequest = await merchantManagement.createDeletionRequestPostgres({
      merchantId,
      reason: "policy_violation",
      details: "cashier deletion lifecycle proof",
      actorAdminId: adminId,
    });
    deletionRequestId = deletionRequest.id;

    const deleted = await merchantManagement.completeMerchantDeletionPostgres({
      merchantId,
      deletionRequestId,
      actorAdminId: adminId,
    });
    assert.equal(deleted.ok, true);
    assert.equal(deleted.deletedMerchantId, merchantId);
    assert.equal(deleted.deletionRequest.status, "completed");

    for (const table of [
      "merchant_cashier_staff_permissions",
      "cashier_station_pairing_challenges",
      "cashier_station_credentials",
      "cashier_operator_sessions",
    ]) {
      const after = await pool.query<{ count: number }>(
        `SELECT COUNT(*)::int AS count FROM ${table} WHERE merchant_id = $1`,
        [merchantId],
      );
      assert.equal(
        Number(after.rows[0]?.count),
        0,
        `${table} must not retain live cashier authorization material`,
      );
    }

    const staffAfter = await pool.query<{
      display_name: string;
      status: string;
      pin_hash: string;
      pin_version: number;
      failed_pin_attempts: number;
      pin_locked_until: Date | null;
      revoked_at: Date | null;
    }>(
      `SELECT display_name, status, pin_hash, pin_version,
              failed_pin_attempts, pin_locked_until, revoked_at
         FROM merchant_cashier_staff
        WHERE merchant_id = $1 AND id = $2`,
      [merchantId, staff.id],
    );
    assert.equal(staffAfter.rowCount, 1);
    assert.equal(staffAfter.rows[0]?.display_name, "[deleted cashier]");
    assert.equal(staffAfter.rows[0]?.status, "revoked");
    assert.equal(staffAfter.rows[0]?.pin_hash, "0".repeat(64));
    assert.ok(Number(staffAfter.rows[0]?.pin_version) > 1);
    assert.equal(staffAfter.rows[0]?.failed_pin_attempts, 0);
    assert.equal(staffAfter.rows[0]?.pin_locked_until, null);
    assert.ok(staffAfter.rows[0]?.revoked_at instanceof Date);

    const stationsAfter = await pool.query<{
      id: string;
      name: string;
      branch_key: string;
      branch_label: string | null;
      status: string;
      paired_device_id: string | null;
      offline_inventory_authority: boolean;
      paired_at: Date | null;
      last_seen_at: Date | null;
      revoked_at: Date | null;
    }>(
      `SELECT id, name, branch_key, branch_label, status, paired_device_id,
              offline_inventory_authority, paired_at, last_seen_at, revoked_at
         FROM merchant_cashier_stations
        WHERE merchant_id = $1
        ORDER BY id`,
      [merchantId],
    );
    assert.equal(stationsAfter.rowCount, 2);
    for (const station of stationsAfter.rows) {
      assert.equal(station.name, "[deleted station]");
      assert.equal(station.branch_key, "deleted");
      assert.equal(station.branch_label, null);
      assert.equal(station.status, "revoked");
      assert.equal(station.paired_device_id, null);
      assert.equal(station.offline_inventory_authority, false);
      assert.equal(station.paired_at, null);
      assert.equal(station.last_seen_at, null);
      assert.ok(station.revoked_at instanceof Date);
    }

    const shiftAfter = await pool.query<{
      status: string;
      ended_at: Date | null;
      close_reason: string | null;
    }>(
      `SELECT status, ended_at, close_reason
         FROM cashier_shifts
        WHERE merchant_id = $1 AND id = $2`,
      [merchantId, operator.context.shift_id],
    );
    assert.equal(shiftAfter.rowCount, 1);
    assert.equal(shiftAfter.rows[0]?.status, "closed");
    assert.ok(shiftAfter.rows[0]?.ended_at instanceof Date);
    assert.equal(shiftAfter.rows[0]?.close_reason, "merchant_deleted");

    const attributionAfter = await pool.query<{
      operation_id: string;
      sale_id: string;
      station_id: string;
      staff_id: string;
      shift_id: string;
      device_id: string;
      station_credential_id: string;
      operator_session_id: string;
    }>(
      `SELECT operation_id, sale_id, station_id, staff_id, shift_id,
              device_id, station_credential_id, operator_session_id
         FROM cashier_operation_attribution
        WHERE merchant_id = $1 AND id = $2`,
      [merchantId, attributionId],
    );
    assert.equal(attributionAfter.rowCount, 1);
    assert.deepEqual(attributionAfter.rows[0], {
      operation_id: operationId,
      sale_id: saleId,
      station_id: operator.context.station_id,
      staff_id: operator.context.staff_id,
      shift_id: operator.context.shift_id,
      device_id: "[deleted device]",
      station_credential_id: "[deleted credential]",
      operator_session_id: "[deleted operator session]",
    });

    const tombstone = await pool.query<{
      retention_status: string;
      state: string;
    }>(
      `SELECT m.retention_status, a.state
         FROM merchants m
         JOIN accounts a ON a.id = m.account_id
        WHERE m.id = $1`,
      [merchantId],
    );
    assert.deepEqual(tombstone.rows[0], {
      retention_status: "deleted",
      state: "closed",
    });
  },
);
