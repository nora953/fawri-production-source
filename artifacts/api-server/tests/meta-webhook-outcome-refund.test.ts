import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  getMetaWebhookReplyOutcome,
  removeFailedMetaWebhookAttempt,
} from "../src/services/metaWebhookOutcome";
import { refundMerchantAutoReply } from "../src/services/merchantReplyRefund";

function message(id: string, sender: string, status?: string, externalId?: string) {
  return {
    id,
    sender,
    text: id,
    timestamp: "2026-08-06T12:00:00.000Z",
    ...(status ? { status } : {}),
    ...(externalId ? { external_message_id: externalId } : {}),
  };
}

test("Meta reply outcome identifies sent and failed attempts and removes only failed pair", async () => {
  const dataDirectory = await mkdtemp(
    path.join(os.tmpdir(), "fawri-meta-outcome-"),
  );
  const previousDataDirectory = process.env.FAWRI_DATA_DIR;
  process.env.FAWRI_DATA_DIR = dataDirectory;

  const runtimePath = path.join(dataDirectory, "fawri-runtime-db.json");
  try {
    await writeFile(
      runtimePath,
      JSON.stringify({
        productsByMerchant: {},
        conversationsByMerchant: {
          "merchant-1": [
            {
              id: "conversation-failed",
              messages: [
                message("customer-failed", "customer", undefined, "message-failed"),
                message("reply-failed", "fawri", "failed"),
              ],
            },
            {
              id: "conversation-sent",
              messages: [
                message("customer-sent", "customer", undefined, "message-sent"),
                message("reply-sent", "fawri", "sent"),
              ],
            },
          ],
        },
        metaPagesByPageId: {},
        ordersByMerchant: {},
        orderDraftsByConversation: {},
      }),
    );

    assert.deepEqual(
      getMetaWebhookReplyOutcome({
        merchantId: "merchant-1",
        externalMessageId: "message-failed",
      }),
      { status: "failed", conversationId: "conversation-failed" },
    );
    assert.deepEqual(
      getMetaWebhookReplyOutcome({
        merchantId: "merchant-1",
        externalMessageId: "message-sent",
      }),
      { status: "sent", conversationId: "conversation-sent" },
    );
    assert.deepEqual(
      getMetaWebhookReplyOutcome({
        merchantId: "merchant-1",
        externalMessageId: "missing",
      }),
      { status: "missing" },
    );

    assert.equal(
      removeFailedMetaWebhookAttempt({
        merchantId: "merchant-1",
        externalMessageId: "message-failed",
      }),
      true,
    );
    assert.deepEqual(
      getMetaWebhookReplyOutcome({
        merchantId: "merchant-1",
        externalMessageId: "message-failed",
      }),
      { status: "missing" },
    );
    assert.equal(
      removeFailedMetaWebhookAttempt({
        merchantId: "merchant-1",
        externalMessageId: "message-sent",
      }),
      false,
    );

    const runtime = JSON.parse(await readFile(runtimePath, "utf8"));
    assert.deepEqual(
      runtime.conversationsByMerchant["merchant-1"].map(
        (conversation: { id: string }) => conversation.id,
      ),
      ["conversation-sent"],
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

test("confirmed failed DLQ refund restores one reply exactly once", async () => {
  const dataDirectory = await mkdtemp(
    path.join(os.tmpdir(), "fawri-meta-refund-"),
  );
  const previousDataDirectory = process.env.FAWRI_DATA_DIR;
  process.env.FAWRI_DATA_DIR = dataDirectory;

  const merchantsPath = path.join(dataDirectory, "merchants.json");
  const reservationsPath = path.join(dataDirectory, "reply-reservations.json");
  const eventId = "meta:page-1:message-1";
  try {
    await writeFile(
      merchantsPath,
      JSON.stringify({
        merchants: [],
        subscriptions: [
          {
            id: "subscription-1",
            merchant_id: "merchant-1",
            plan_name: "silver",
            reply_limit: 2,
            replies_used: 2,
            replies_remaining: 0,
            base_reply_limit: 2,
            base_replies_used: 2,
            base_replies_remaining: 0,
            addon_replies_remaining: 0,
            addon_reply_batches: [],
            start_date: "2026-08-01T00:00:00.000Z",
            expires_at: "2026-09-01T00:00:00.000Z",
            status: "replies_exhausted",
            auto_reply_enabled: false,
          },
        ],
      }),
    );
    await writeFile(
      reservationsPath,
      JSON.stringify({
        reservations: {
          [eventId]: {
            merchant_id: "merchant-1",
            subscription_id: "subscription-1",
            event_id: eventId,
            amount: 1,
            reserved_at: "2026-08-06T12:00:00.000Z",
            status: "consumed",
            replies_remaining_after: 0,
          },
        },
      }),
    );

    const first = refundMerchantAutoReply(
      eventId,
      new Date("2026-08-06T13:00:00.000Z"),
    );
    assert.deepEqual(first, {
      refunded: true,
      merchantId: "merchant-1",
      subscriptionId: "subscription-1",
    });

    const merchantDatabase = JSON.parse(await readFile(merchantsPath, "utf8"));
    const subscription = merchantDatabase.subscriptions[0];
    assert.equal(subscription.base_replies_used, 1);
    assert.equal(subscription.base_replies_remaining, 1);
    assert.equal(subscription.replies_used, 1);
    assert.equal(subscription.replies_remaining, 1);
    assert.equal(subscription.status, "active");
    assert.equal(subscription.auto_reply_enabled, true);

    const reservationDatabase = JSON.parse(
      await readFile(reservationsPath, "utf8"),
    );
    assert.deepEqual(reservationDatabase.reservations, {});

    assert.deepEqual(refundMerchantAutoReply(eventId), {
      refunded: false,
      reason: "reservation_not_found",
    });
    const afterSecondRefund = JSON.parse(await readFile(merchantsPath, "utf8"));
    assert.equal(afterSecondRefund.subscriptions[0].replies_remaining, 1);
  } finally {
    if (previousDataDirectory === undefined) {
      delete process.env.FAWRI_DATA_DIR;
    } else {
      process.env.FAWRI_DATA_DIR = previousDataDirectory;
    }
    await rm(dataDirectory, { recursive: true, force: true });
  }
});

test("addon debit refund restores an addon batch when base balance is exhausted", async () => {
  const dataDirectory = await mkdtemp(
    path.join(os.tmpdir(), "fawri-meta-addon-refund-"),
  );
  const previousDataDirectory = process.env.FAWRI_DATA_DIR;
  process.env.FAWRI_DATA_DIR = dataDirectory;

  const eventId = "meta:page-2:message-2";
  try {
    await writeFile(
      path.join(dataDirectory, "merchants.json"),
      JSON.stringify({
        merchants: [],
        subscriptions: [
          {
            id: "subscription-addon",
            merchant_id: "merchant-addon",
            reply_limit: 12,
            replies_used: 3,
            replies_remaining: 9,
            base_reply_limit: 2,
            base_replies_used: 2,
            base_replies_remaining: 0,
            addon_replies_remaining: 9,
            addon_reply_batches: [
              {
                id: "batch-1",
                amount: 10,
                remaining: 9,
                purchased_at: "2026-08-01T00:00:00.000Z",
                expires_at: "2026-09-01T00:00:00.000Z",
              },
            ],
            expires_at: "2026-09-01T00:00:00.000Z",
            status: "active",
            auto_reply_enabled: true,
          },
        ],
      }),
    );
    await writeFile(
      path.join(dataDirectory, "reply-reservations.json"),
      JSON.stringify({
        reservations: {
          [eventId]: {
            merchant_id: "merchant-addon",
            subscription_id: "subscription-addon",
            event_id: eventId,
            amount: 1,
            reserved_at: "2026-08-06T12:00:00.000Z",
            status: "consumed",
            replies_remaining_after: 9,
          },
        },
      }),
    );

    assert.equal(refundMerchantAutoReply(eventId).refunded, true);
    const database = JSON.parse(
      await readFile(path.join(dataDirectory, "merchants.json"), "utf8"),
    );
    assert.equal(database.subscriptions[0].base_replies_used, 2);
    assert.equal(
      database.subscriptions[0].addon_reply_batches[0].remaining,
      10,
    );
    assert.equal(database.subscriptions[0].replies_remaining, 10);
  } finally {
    if (previousDataDirectory === undefined) {
      delete process.env.FAWRI_DATA_DIR;
    } else {
      process.env.FAWRI_DATA_DIR = previousDataDirectory;
    }
    await rm(dataDirectory, { recursive: true, force: true });
  }
});
