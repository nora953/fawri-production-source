import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { refundMerchantAutoReply } from "../src/services/merchantReplyRefund";

test("confirmed failed delivery refunds exactly once and preserves an audit marker", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "fawri-refund-"));
  const previous = process.env.FAWRI_DATA_DIR;
  process.env.FAWRI_DATA_DIR = directory;
  const now = new Date("2026-08-07T00:00:00.000Z");
  try {
    await writeFile(
      path.join(directory, "merchants.json"),
      JSON.stringify({
        subscriptions: [
          {
            id: "subscription-1",
            merchant_id: "merchant-1",
            status: "replies_exhausted",
            expires_at: "2026-09-01T00:00:00.000Z",
            auto_reply_enabled: false,
            reply_limit: 1,
            replies_used: 1,
            replies_remaining: 0,
            base_reply_limit: 1,
            base_replies_used: 1,
            base_replies_remaining: 0,
            addon_replies_remaining: 0,
            addon_reply_batches: [],
          },
        ],
      }),
    );
    await writeFile(
      path.join(directory, "reply-reservations.json"),
      JSON.stringify({
        reservations: {
          "meta:page-1:message-1": {
            merchant_id: "merchant-1",
            subscription_id: "subscription-1",
            event_id: "meta:page-1:message-1",
            status: "consumed",
          },
        },
      }),
    );

    const first = refundMerchantAutoReply(
      "meta:page-1:message-1",
      "META_REPLY_FAILED",
      now,
    );
    assert.equal(first.refunded, true);
    const second = refundMerchantAutoReply(
      "meta:page-1:message-1",
      "META_REPLY_FAILED",
      new Date(now.getTime() + 1_000),
    );
    assert.deepEqual(second, { refunded: false, reason: "already_refunded" });

    const merchantDb = JSON.parse(
      await readFile(path.join(directory, "merchants.json"), "utf8"),
    );
    assert.equal(merchantDb.subscriptions[0].base_replies_used, 0);
    assert.equal(merchantDb.subscriptions[0].replies_remaining, 1);

    const reservations = JSON.parse(
      await readFile(path.join(directory, "reply-reservations.json"), "utf8"),
    );
    const record = reservations.reservations["meta:page-1:message-1"];
    assert.equal(record.refund_status, "refunded");
    assert.equal(record.refund_failure_code, "META_REPLY_FAILED");
  } finally {
    if (previous === undefined) delete process.env.FAWRI_DATA_DIR;
    else process.env.FAWRI_DATA_DIR = previous;
    await rm(directory, { recursive: true, force: true });
  }
});

test("pending refund recovery recognizes credit already applied before a crash", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "fawri-refund-recovery-"));
  const previous = process.env.FAWRI_DATA_DIR;
  process.env.FAWRI_DATA_DIR = directory;
  try {
    await writeFile(
      path.join(directory, "merchants.json"),
      JSON.stringify({
        subscriptions: [
          {
            id: "subscription-2",
            merchant_id: "merchant-2",
            status: "active",
            expires_at: "2026-09-01T00:00:00.000Z",
            auto_reply_enabled: true,
            reply_limit: 1,
            replies_used: 0,
            replies_remaining: 1,
            base_reply_limit: 1,
            base_replies_used: 0,
            base_replies_remaining: 1,
            addon_replies_remaining: 0,
            addon_reply_batches: [],
          },
        ],
      }),
    );
    await writeFile(
      path.join(directory, "reply-reservations.json"),
      JSON.stringify({
        reservations: {
          "meta:page-2:message-2": {
            merchant_id: "merchant-2",
            subscription_id: "subscription-2",
            event_id: "meta:page-2:message-2",
            status: "consumed",
            debit_source: "base",
            debit_balance_after: 1,
            refund_status: "pending",
            refund_failure_code: "META_REPLY_FAILED",
          },
        },
      }),
    );

    const recovered = refundMerchantAutoReply(
      "meta:page-2:message-2",
      "META_REPLY_FAILED",
    );
    assert.equal(recovered.refunded, true);
    const merchantDb = JSON.parse(
      await readFile(path.join(directory, "merchants.json"), "utf8"),
    );
    assert.equal(merchantDb.subscriptions[0].base_replies_used, 0);
    const reservations = JSON.parse(
      await readFile(path.join(directory, "reply-reservations.json"), "utf8"),
    );
    assert.equal(
      reservations.reservations["meta:page-2:message-2"].refund_status,
      "refunded",
    );
  } finally {
    if (previous === undefined) delete process.env.FAWRI_DATA_DIR;
    else process.env.FAWRI_DATA_DIR = previous;
    await rm(directory, { recursive: true, force: true });
  }
});
