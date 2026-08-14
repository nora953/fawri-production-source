import assert from "node:assert/strict";
import test from "node:test";

const DATABASE_URL = String(process.env.DATABASE_URL || "");
assert.ok(DATABASE_URL, "DATABASE_URL is required");
const parsedDatabaseUrl = new URL(DATABASE_URL);
assert.ok(
  parsedDatabaseUrl.hostname === "127.0.0.1" || parsedDatabaseUrl.hostname === "localhost",
  "merchant retention PostgreSQL proof only permits a local database",
);
assert.equal(
  parsedDatabaseUrl.pathname.replace(/^\//, ""),
  "fawri_ci",
  "merchant retention PostgreSQL proof only permits the fawri_ci database",
);

const readOnlyId = "merchant-retention-readonly-proof";
const suspendedId = "merchant-retention-suspended-proof";
const renewedId = "merchant-retention-renewed-proof";
const assistantId = "admin-retention-proof";
const readOnlyPhone = "07987222001";
const suspendedPhone = "07987222002";
const renewedPhone = "07987222003";
const assistantPhone = "07987222004";
const fixedNow = new Date("2026-08-15T00:00:00.000Z");

process.env.NODE_ENV = "test";
process.env.FAWRI_OPERATIONAL_POSTGRES_AUTHORITY = "required";
process.env.FAWRI_AUTH_POSTGRES_SESSION_AUTHORITY = "required";
process.env.FAWRI_AUTH_SECURITY_SECRET =
  "merchant-retention-proof-security-secret-at-least-32-characters";
process.env.FAWRI_PASSWORD_SALT = "merchant-retention-proof-password-salt";

const { pool } = await import("@workspace/db");
const { hashPassword } = await import("../src/services/authPasswordService.js");
const { authPostgresSessionAuthority } = await import(
  "../src/services/authPostgresSessionAuthority.js"
);
const {
  refreshMerchantRetentionPostgres,
} = await import("../src/services/postgresMerchantRetentionAuthority.js");
const {
  createDeletionRequestPostgres,
  MerchantManagementError,
} = await import("../src/services/postgresMerchantManagementAuthority.js");

async function cleanup(): Promise<void> {
  await pool.query(
    `DELETE FROM merchant_deletion_requests
      WHERE merchant_id_snapshot = ANY($1::text[])
         OR requested_by_admin_id_snapshot = $2`,
    [[readOnlyId, suspendedId, renewedId], assistantId],
  ).catch(() => undefined);
  await pool.query(
    `DELETE FROM audit_events
      WHERE merchant_id = ANY($1::text[])
         OR actor_account_id = $2`,
    [[readOnlyId, suspendedId, renewedId], assistantId],
  ).catch(() => undefined);
  await pool.query(
    "DELETE FROM accounts WHERE id = ANY($1::text[]) OR phone = ANY($2::text[])",
    [
      [readOnlyId, suspendedId, renewedId, assistantId],
      [readOnlyPhone, suspendedPhone, renewedPhone, assistantPhone],
    ],
  ).catch(() => undefined);
}

test("PostgreSQL retention enforces read-only, suspension, and renewal protection", async (t) => {
  await cleanup();
  t.after(async () => {
    await cleanup();
    await pool.end();
  });

  const passwordHash = hashPassword("RetentionProof9!");
  await pool.query(
    `INSERT INTO accounts (
       id, kind, phone, password_hash, state, language,
       phone_verified, phone_verified_at, created_at, updated_at
     ) VALUES
       ($1, 'merchant', $2, $9, 'active', 'ar', true, now(), now(), now()),
       ($3, 'merchant', $4, $9, 'active', 'ar', true, now(), now(), now()),
       ($5, 'merchant', $6, $9, 'active', 'ar', true, now(), now(), now()),
       ($7, 'admin', $8, $9, 'active', 'en', true, now(), now(), now())`,
    [
      readOnlyId,
      readOnlyPhone,
      suspendedId,
      suspendedPhone,
      renewedId,
      renewedPhone,
      assistantId,
      assistantPhone,
      passwordHash,
    ],
  );
  await pool.query(
    `INSERT INTO merchants (
       id, account_id, profile_kind, owner_name, store_name, activity_type,
       status, account_status, onboarding_status, trial_status, signup_source,
       last_subscription_ended_at, warning_stage, products_read_only,
       created_at, updated_at
     ) VALUES
       ($1, $1, 'merchant', 'Read Only Owner', 'Read Only Store', 'retail',
        'approved', 'approved', 'awaiting_channel', 'expired', 'direct',
        '2026-05-01T00:00:00.000Z', 0, false, now(), now()),
       ($2, $2, 'merchant', 'Suspended Owner', 'Suspended Store', 'retail',
        'approved', 'approved', 'awaiting_channel', 'expired', 'direct',
        '2026-01-01T00:00:00.000Z', 0, false, now(), now()),
       ($3, $3, 'merchant', 'Renewed Owner', 'Renewed Store', 'retail',
        'approved', 'approved', 'awaiting_channel', 'active', 'direct',
        '2025-12-01T00:00:00.000Z', 4, true, now(), now())`,
    [readOnlyId, suspendedId, renewedId],
  );
  await pool.query(
    `INSERT INTO admin_profiles (
       id, account_id, profile_kind, display_name, role,
       enabled, must_change_password, created_at, updated_at
     ) VALUES (
       $1, $1, 'admin', 'Retention Assistant', 'assistant_admin',
       true, false, now(), now()
     )`,
    [assistantId],
  );
  await pool.query(
    `INSERT INTO subscriptions (
       id, merchant_id, plan_name, status, price_iqd, billing_anchor_day,
       base_reply_limit, base_replies_used, base_replies_remaining,
       addon_replies_remaining, auto_reply_enabled, starts_at, expires_at,
       version, metadata, created_at, updated_at
     ) VALUES
       ('subscription-retention-suspended-proof', $1, 'silver', 'expired', 25000, 1,
        4000, 0, 4000, 0, false,
        '2025-12-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z', 1, '{}'::jsonb, now(), now()),
       ('subscription-retention-renewed-proof', $2, 'gold', 'active', 49000, 15,
        8000, 0, 8000, 0, true,
        '2026-08-01T00:00:00.000Z', '2026-09-15T00:00:00.000Z', 1, '{}'::jsonb, now(), now())`,
    [suspendedId, renewedId],
  );

  const suspendedSession = await authPostgresSessionAuthority.issueSession({
    accountId: suspendedId,
    accountKind: "merchant",
    tenantId: suspendedId,
  });

  const readOnly = await refreshMerchantRetentionPostgres(readOnlyId, fixedNow);
  assert.equal(readOnly?.productsReadOnly, true);
  assert.equal(readOnly?.accountSuspended, false);
  assert.equal(readOnly?.retentionStatus, "warning_2");
  const readOnlyState = await pool.query<{
    state: string;
    products_read_only: boolean;
    warning_stage: number;
  }>(
    `SELECT a.state, m.products_read_only, m.warning_stage
       FROM accounts a JOIN merchants m ON m.id = a.id
      WHERE a.id = $1`,
    [readOnlyId],
  );
  assert.deepEqual(readOnlyState.rows[0], {
    state: "active",
    products_read_only: true,
    warning_stage: 2,
  });

  const suspended = await refreshMerchantRetentionPostgres(suspendedId, fixedNow);
  assert.equal(suspended?.productsReadOnly, true);
  assert.equal(suspended?.accountSuspended, true);
  assert.equal(suspended?.retentionStatus, "eligible_for_deletion");
  const suspendedState = await pool.query<{
    account_state: string;
    merchant_status: string;
    retention_status: string;
    subscription_status: string;
    auto_reply_enabled: boolean;
  }>(
    `SELECT a.state AS account_state,
            m.status AS merchant_status,
            m.retention_status,
            s.status AS subscription_status,
            s.auto_reply_enabled
       FROM accounts a
       JOIN merchants m ON m.id = a.id
       JOIN subscriptions s ON s.merchant_id = m.id
      WHERE a.id = $1`,
    [suspendedId],
  );
  assert.deepEqual(suspendedState.rows[0], {
    account_state: "suspended",
    merchant_status: "suspended",
    retention_status: "eligible_for_deletion",
    subscription_status: "suspended",
    auto_reply_enabled: false,
  });
  const suspendedSessionRow = await pool.query<{ status: string }>(
    "SELECT status FROM account_sessions WHERE id = $1",
    [suspendedSession.session.id],
  );
  assert.equal(suspendedSessionRow.rows[0]?.status, "revoked");

  const renewed = await refreshMerchantRetentionPostgres(renewedId, fixedNow);
  assert.equal(renewed?.productsReadOnly, false);
  assert.equal(renewed?.accountSuspended, false);
  assert.equal(renewed?.retentionStatus, "protected");
  const renewedState = await pool.query<{
    retention_status: string;
    products_read_only: boolean;
  }>(
    "SELECT retention_status, products_read_only FROM merchants WHERE id = $1",
    [renewedId],
  );
  assert.deepEqual(renewedState.rows[0], {
    retention_status: "protected",
    products_read_only: false,
  });

  // Administrative suspension does not change the fact that the current paid
  // subscription extends beyond the old historical subscription end.
  await pool.query(
    `UPDATE merchants
        SET status = 'suspended', account_status = 'suspended', updated_at = now()
      WHERE id = $1`,
    [renewedId],
  );
  await pool.query(
    `UPDATE accounts SET state = 'suspended', suspended_at = now(), updated_at = now()
      WHERE id = $1`,
    [renewedId],
  );

  await assert.rejects(
    () => createDeletionRequestPostgres({
      merchantId: renewedId,
      reason: "retention_expired",
      details: "must reject because the current renewal is still active",
      actorAdminId: assistantId,
    }),
    (error: unknown) => {
      assert.ok(error instanceof MerchantManagementError);
      assert.equal(error.code, "MERCHANT_NOT_ELIGIBLE_FOR_DELETION");
      return true;
    },
  );
});
