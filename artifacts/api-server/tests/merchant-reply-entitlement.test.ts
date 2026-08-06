import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { reserveMerchantAutoReply } from "../src/services/merchantReplyEntitlement";

function subscription(
  merchantId: string,
  status: string,
  options: {
    replies?: number;
    autoReply?: boolean;
    expiresAt?: string;
  } = {},
) {
  const replies = options.replies ?? 2;
  return {
    id: `subscription-${merchantId}`,
    merchant_id: merchantId,
    plan_name: "silver",
    price_iqd: 25_000,
    reply_limit: replies,
    replies_used: 0,
    replies_remaining: replies,
    base_reply_limit: replies,
    base_replies_used: 0,
    base_replies_remaining: replies,
    addon_replies_remaining: 0,
    addon_reply_batches: [],
    billing_anchor_day: 1,
    start_date: "2026-08-01T00:00:00.000Z",
    expires_at: options.expiresAt || "2026-09-01T00:00:00.000Z",
    status,
    auto_reply_enabled: options.autoReply ?? true,
    emergency_credit_used: 0,
    emergency_credit_amount: 400,
    emergency_credit_remaining: 0,
    emergency_credit_activated: false,
    emergency_debt: 0,
    pending_next_cycle_deduction: 0,
  };
}

test("reply reservations enforce subscription status, balance, and idempotency", async () => {
  const dataDirectory = await mkdtemp(
    path.join(os.tmpdir(), "fawri-reply-entitlement-"),
  );
  const previousDataDirectory = process.env.FAWRI_DATA_DIR;
  process.env.FAWRI_DATA_DIR = dataDirectory;

  const now = new Date("2026-08-06T12:00:00.000Z");
  const merchantsPath = path.join(dataDirectory, "merchants.json");

  try {
    await writeFile(
      merchantsPath,
      JSON.stringify({
        merchants: [],
        subscriptions: [
          subscription("merchant-active", "active", { replies: 2 }),
          subscription("merchant-pending", "pending_activation"),
          subscription("merchant-expired", "active", {
            expiresAt: "2026-08-05T00:00:00.000Z",
          }),
          subscription("merchant-suspended", "suspended"),
          subscription("merchant-exhausted", "replies_exhausted", {
            replies: 0,
          }),
          subscription("merchant-disabled", "active", {
            autoReply: false,
          }),
        ],
      }),
    );

    const first = reserveMerchantAutoReply(
      "merchant-active",
      "meta:page-1:message-1",
      now,
    );
    assert.equal(first.allowed, true);
    if (first.allowed) {
      assert.equal(first.duplicate, false);
      assert.equal(first.repliesRemaining, 1);
    }

    const duplicate = reserveMerchantAutoReply(
      "merchant-active",
      "meta:page-1:message-1",
      now,
    );
    assert.equal(duplicate.allowed, true);
    if (duplicate.allowed) {
      assert.equal(duplicate.duplicate, true);
      assert.equal(duplicate.repliesRemaining, 1);
    }

    const second = reserveMerchantAutoReply(
      "merchant-active",
      "meta:page-1:message-2",
      now,
    );
    assert.equal(second.allowed, true);
    if (second.allowed) {
      assert.equal(second.duplicate, false);
      assert.equal(second.repliesRemaining, 0);
    }

    const exhaustedAfterConsumption = reserveMerchantAutoReply(
      "merchant-active",
      "meta:page-1:message-3",
      now,
    );
    assert.equal(exhaustedAfterConsumption.allowed, false);
    if (!exhaustedAfterConsumption.allowed) {
      assert.equal(
        exhaustedAfterConsumption.code,
        "MERCHANT_REPLIES_EXHAUSTED",
      );
    }

    const cases = [
      ["merchant-pending", "MERCHANT_SUBSCRIPTION_PENDING"],
      ["merchant-expired", "MERCHANT_SUBSCRIPTION_EXPIRED"],
      ["merchant-suspended", "MERCHANT_SUBSCRIPTION_SUSPENDED"],
      ["merchant-exhausted", "MERCHANT_REPLIES_EXHAUSTED"],
      ["merchant-disabled", "MERCHANT_AUTO_REPLY_DISABLED"],
      ["merchant-missing", "MERCHANT_SUBSCRIPTION_REQUIRED"],
    ] as const;

    for (const [merchantId, expectedCode] of cases) {
      const decision = reserveMerchantAutoReply(
        merchantId,
        `meta:page-${merchantId}:message-1`,
        now,
      );
      assert.equal(decision.allowed, false);
      if (!decision.allowed) assert.equal(decision.code, expectedCode);
    }

    const database = JSON.parse(await readFile(merchantsPath, "utf8"));
    const active = database.subscriptions.find(
      (item: { merchant_id: string }) =>
        item.merchant_id === "merchant-active",
    );
    assert.equal(active.base_replies_used, 2);
    assert.equal(active.base_replies_remaining, 0);
    assert.equal(active.replies_remaining, 0);
    assert.equal(active.status, "replies_exhausted");
    assert.equal(active.auto_reply_enabled, false);

    const expired = database.subscriptions.find(
      (item: { merchant_id: string }) =>
        item.merchant_id === "merchant-expired",
    );
    assert.equal(expired.status, "expired");
    assert.equal(expired.auto_reply_enabled, false);

    const reservations = JSON.parse(
      await readFile(path.join(dataDirectory, "reply-reservations.json"), "utf8"),
    );
    assert.deepEqual(Object.keys(reservations.reservations).sort(), [
      "meta:page-1:message-1",
      "meta:page-1:message-2",
    ]);
    assert.equal(
      reservations.reservations["meta:page-1:message-1"].status,
      "consumed",
    );
  } finally {
    if (previousDataDirectory === undefined) {
      delete process.env.FAWRI_DATA_DIR;
    } else {
      process.env.FAWRI_DATA_DIR = previousDataDirectory;
    }
    await rm(dataDirectory, { recursive: true, force: true });
  }
});
