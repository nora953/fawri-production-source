import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { pool } from "@workspace/db";
import { reserveMerchantAutoReplyAuthoritative } from "../src/services/merchantReplyEntitlementAuthority";
import { refundMerchantAutoReplyAuthoritative } from "../src/services/merchantReplyRefundAuthority";
import { releaseMerchantAutoReplyReservationAuthoritative } from "../src/services/merchantReplyReservationReleaseAuthority";
import {
  activateEmergencyCreditPostgres,
  applySubscriptionActionPostgres,
  applySubscriptionPlanOperationPostgres,
  getCurrentSubscriptionPostgres,
  SubscriptionEntitlementAuthorityError,
} from "../src/services/postgresSubscriptionEntitlement";

const merchantId = "merchant-subscription-pg-test";
const actorId = "admin-subscription-pg-test";
const merchantPhone = "07700000101";
const adminPhone = "07700000102";

async function seedIdentity(): Promise<void> {
  await pool.query(
    `INSERT INTO accounts (
       id, kind, phone, password_hash, state, language, phone_verified,
       password_version, security_version, session_version, created_at, updated_at
     ) VALUES
       ($1, 'merchant', $2, 'test-only-hash', 'active', 'ar', TRUE, 1, 1, 1, NOW(), NOW()),
       ($3, 'admin', $4, 'test-only-hash', 'active', 'ar', TRUE, 1, 1, 1, NOW(), NOW())`,
    [merchantId, merchantPhone, actorId, adminPhone],
  );
  await pool.query(
    `INSERT INTO merchants (
       id, account_id, profile_kind, owner_name, store_name, activity_type,
       status, account_status, onboarding_status, trial_status, signup_source,
       warning_stage, products_read_only, metadata, created_at, updated_at
     ) VALUES (
       $1, $1, 'merchant', 'Test Owner', 'Test Store', 'test',
       'approved', 'approved', 'channel_connected', 'not_started', 'direct',
       0, FALSE, '{}'::jsonb, NOW(), NOW()
     )`,
    [merchantId],
  );
}

async function cleanupIdentity(): Promise<void> {
  await pool.query(`DELETE FROM accounts WHERE id = ANY($1::text[])`, [
    [merchantId, actorId],
  ]);
}

test("required mode keeps reply entitlement entirely in PostgreSQL", async () => {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required for PostgreSQL entitlement proof");
  }
  const previousAuthority = process.env.FAWRI_SUBSCRIPTION_POSTGRES_AUTHORITY;
  const previousDataDir = process.env.FAWRI_DATA_DIR;
  const dataDir = await mkdtemp(path.join(os.tmpdir(), "fawri-subscription-pg-"));
  const legacyPath = path.join(dataDir, "merchants.json");
  const legacySentinel = JSON.stringify({
    subscriptions: [
      {
        id: "legacy-must-not-be-read-or-written",
        merchant_id: merchantId,
        replies_remaining: 999999,
      },
    ],
  });

  process.env.FAWRI_SUBSCRIPTION_POSTGRES_AUTHORITY = "required";
  process.env.FAWRI_DATA_DIR = dataDir;
  await writeFile(legacyPath, legacySentinel, "utf8");

  try {
    await cleanupIdentity();
    await seedIdentity();

    const activated = await applySubscriptionPlanOperationPostgres({
      merchantId,
      actorAccountId: actorId,
      operation: "activate",
      plan: "silver",
      now: new Date("2026-08-11T00:00:00.000Z"),
    });
    assert.equal(activated.plan_name, "silver");
    assert.equal(activated.base_reply_limit, 4000);
    assert.equal(activated.replies_remaining, 4000);

    const first = await reserveMerchantAutoReplyAuthoritative(
      merchantId,
      "meta:pg-cutover:event-1",
      new Date("2026-08-11T00:01:00.000Z"),
    );
    assert.equal(first.allowed, true);
    if (first.allowed) {
      assert.equal(first.duplicate, false);
      assert.equal(first.repliesRemaining, 3999);
    }

    const duplicate = await reserveMerchantAutoReplyAuthoritative(
      merchantId,
      "meta:pg-cutover:event-1",
      new Date("2026-08-11T00:02:00.000Z"),
    );
    assert.equal(duplicate.allowed, true);
    if (duplicate.allowed) {
      assert.equal(duplicate.duplicate, true);
      assert.equal(duplicate.repliesRemaining, 3999);
    }

    const released = await releaseMerchantAutoReplyReservationAuthoritative(
      "meta:pg-cutover:event-1",
      "MERCHANT_SETTINGS_VERSION_CHANGED",
      new Date("2026-08-11T00:03:00.000Z"),
    );
    assert.equal(released.released, true);
    assert.deepEqual(
      await releaseMerchantAutoReplyReservationAuthoritative(
        "meta:pg-cutover:event-1",
        "MERCHANT_SETTINGS_VERSION_CHANGED",
        new Date("2026-08-11T00:04:00.000Z"),
      ),
      { released: false, reason: "already_released" },
    );

    const afterRelease = await getCurrentSubscriptionPostgres(
      merchantId,
      new Date("2026-08-11T00:05:00.000Z"),
    );
    assert.equal(afterRelease?.replies_remaining, 4000);

    const second = await reserveMerchantAutoReplyAuthoritative(
      merchantId,
      "meta:pg-cutover:event-2",
      new Date("2026-08-11T00:06:00.000Z"),
    );
    assert.equal(second.allowed, true);
    const refunded = await refundMerchantAutoReplyAuthoritative(
      "meta:pg-cutover:event-2",
      "META_REPLY_FAILED",
      new Date("2026-08-11T00:07:00.000Z"),
    );
    assert.equal(refunded.refunded, true);
    assert.deepEqual(
      await refundMerchantAutoReplyAuthoritative(
        "meta:pg-cutover:event-2",
        "META_REPLY_FAILED",
        new Date("2026-08-11T00:08:00.000Z"),
      ),
      { refunded: false, reason: "already_refunded" },
    );

    const withAddon = await applySubscriptionActionPostgres({
      merchantId,
      actorAccountId: actorId,
      action: "add_replies",
      amount: 10,
      now: new Date("2026-08-11T00:09:00.000Z"),
    });
    assert.equal(withAddon.addon_replies_remaining, 10);
    assert.equal(withAddon.replies_remaining, 4010);

    await applySubscriptionActionPostgres({
      merchantId,
      actorAccountId: actorId,
      action: "deduct_replies",
      amount: 3510,
      now: new Date("2026-08-11T00:10:00.000Z"),
    });
    const emergency = await activateEmergencyCreditPostgres(
      merchantId,
      merchantId,
      new Date("2026-08-11T00:11:00.000Z"),
    );
    assert.equal(emergency.emergency_credit_activated, true);
    assert.equal(emergency.emergency_debt, 400);
    assert.equal(emergency.replies_remaining, 900);

    const ledger = await pool.query(
      `SELECT external_event_id, direction, reason_code
         FROM reply_ledger
        WHERE merchant_id = $1
          AND external_event_id LIKE 'meta:pg-cutover:%'
        ORDER BY external_event_id, direction`,
      [merchantId],
    );
    assert.deepEqual(
      ledger.rows.map((row) => [row.external_event_id, row.direction, row.reason_code]),
      [
        ["meta:pg-cutover:event-1", "credit", "MERCHANT_SETTINGS_VERSION_CHANGED"],
        ["meta:pg-cutover:event-1", "debit", "meta_auto_reply_reservation"],
        ["meta:pg-cutover:event-2", "credit", "META_REPLY_FAILED"],
        ["meta:pg-cutover:event-2", "debit", "meta_auto_reply_reservation"],
      ],
    );

    assert.equal(
      await readFile(legacyPath, "utf8"),
      legacySentinel,
      "required PostgreSQL authority touched legacy merchants.json",
    );
  } finally {
    await cleanupIdentity();
    if (previousAuthority === undefined) {
      delete process.env.FAWRI_SUBSCRIPTION_POSTGRES_AUTHORITY;
    } else {
      process.env.FAWRI_SUBSCRIPTION_POSTGRES_AUTHORITY = previousAuthority;
    }
    if (previousDataDir === undefined) delete process.env.FAWRI_DATA_DIR;
    else process.env.FAWRI_DATA_DIR = previousDataDir;
    await rm(dataDir, { recursive: true, force: true });
  }
});

test("admin mutations fail closed when merchant is not approved", async () => {
  const previousAuthority = process.env.FAWRI_SUBSCRIPTION_POSTGRES_AUTHORITY;
  process.env.FAWRI_SUBSCRIPTION_POSTGRES_AUTHORITY = "required";
  try {
    await cleanupIdentity();
    await seedIdentity();
    await pool.query(
      `UPDATE merchants SET status = 'suspended', account_status = 'suspended' WHERE id = $1`,
      [merchantId],
    );
    await assert.rejects(
      () =>
        applySubscriptionPlanOperationPostgres({
          merchantId,
          actorAccountId: actorId,
          operation: "activate",
          plan: "gold",
        }),
      (error: unknown) =>
        error instanceof SubscriptionEntitlementAuthorityError &&
        error.code === "APPROVED_MERCHANT_REQUIRED",
    );
  } finally {
    await cleanupIdentity();
    if (previousAuthority === undefined) {
      delete process.env.FAWRI_SUBSCRIPTION_POSTGRES_AUTHORITY;
    } else {
      process.env.FAWRI_SUBSCRIPTION_POSTGRES_AUTHORITY = previousAuthority;
    }
  }
});
