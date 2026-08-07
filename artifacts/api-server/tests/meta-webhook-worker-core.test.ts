import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  claimNextDurableJob,
  enqueueDurableJob,
  listDurableJobs,
  requeueDeadLetterJob,
  type DurableJob,
} from "../src/services/durableJobQueue";
import { reserveMerchantAutoReply } from "../src/services/merchantReplyEntitlement";
import { releaseMerchantAutoReplyReservation } from "../src/services/merchantReplyReservationRelease";
import {
  updateMerchantOperationalSettingsWithEffects,
} from "../src/services/merchantSettingsRuntime";
import { createFakeMetaWebhookReplyTransport } from "../src/services/metaWebhookFakeTransport";
import { processMetaReplyJob } from "../src/services/metaWebhookWorkerCore";
import { startMetaWebhookWorker } from "../src/services/metaWebhookWorker";

const MERCHANT_ID = "merchant-1";
const PAGE_ID = "page-1";

function eventId(messageId: string): string {
  return `meta:${PAGE_ID}:${messageId}`;
}

function durableJob(messageId: string): DurableJob {
  return {
    id: `job-${messageId}`,
    type: "meta.webhook.reply",
    dedupe_key: eventId(messageId),
    merchant_id: MERCHANT_ID,
    payload: {
      event_id: eventId(messageId),
      page_id: PAGE_ID,
      merchant_id: MERCHANT_ID,
      external_message_id: messageId,
      sender_id: "customer-1",
    },
    priority: 10,
    status: "processing",
    attempts: 1,
    max_attempts: 5,
    available_at: "2026-08-07T00:00:00.000Z",
    locked_at: "2026-08-07T00:00:00.000Z",
    locked_by: "test-worker",
    created_at: "2026-08-07T00:00:00.000Z",
    updated_at: "2026-08-07T00:00:00.000Z",
  };
}

function subscription() {
  return {
    id: "subscription-1",
    merchant_id: MERCHANT_ID,
    plan_name: "silver",
    price_iqd: 25_000,
    reply_limit: 3,
    replies_used: 0,
    replies_remaining: 3,
    base_reply_limit: 3,
    base_replies_used: 0,
    base_replies_remaining: 3,
    addon_replies_remaining: 0,
    addon_reply_batches: [],
    billing_anchor_day: 1,
    start_date: "2026-08-01T00:00:00.000Z",
    expires_at: "2026-09-01T00:00:00.000Z",
    status: "active",
    auto_reply_enabled: true,
    emergency_credit_used: 0,
    emergency_credit_amount: 400,
    emergency_credit_remaining: 0,
    emergency_credit_activated: false,
    emergency_debt: 0,
    pending_next_cycle_deduction: 0,
  };
}

async function initializeFixture(directory: string): Promise<void> {
  await writeFile(
    path.join(directory, "merchants.json"),
    JSON.stringify({
      merchants: [
        {
          id: MERCHANT_ID,
          otp_verified: true,
          status: "approved",
          account_status: "approved",
        },
      ],
      subscriptions: [subscription()],
    }),
  );
  await writeFile(
    path.join(directory, "fawri-runtime-db.json"),
    JSON.stringify({
      productsByMerchant: {},
      conversationsByMerchant: { [MERCHANT_ID]: [] },
      metaPagesByPageId: {},
      ordersByMerchant: {},
      orderDraftsByConversation: {},
    }),
  );
}

async function withDataDirectory(
  prefix: string,
  callback: (directory: string) => Promise<void>,
): Promise<void> {
  const directory = await mkdtemp(path.join(os.tmpdir(), prefix));
  const previous = process.env.FAWRI_DATA_DIR;
  process.env.FAWRI_DATA_DIR = directory;
  try {
    await initializeFixture(directory);
    await callback(directory);
  } finally {
    if (previous === undefined) delete process.env.FAWRI_DATA_DIR;
    else process.env.FAWRI_DATA_DIR = previous;
    await rm(directory, { recursive: true, force: true });
  }
}

async function readSubscription(directory: string) {
  const database = JSON.parse(
    await readFile(path.join(directory, "merchants.json"), "utf8"),
  );
  return database.subscriptions[0];
}

async function readReservation(directory: string, id: string) {
  try {
    const database = JSON.parse(
      await readFile(path.join(directory, "reply-reservations.json"), "utf8"),
    );
    return database.reservations[id] || null;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

function enqueueReply(messageId: string, maxAttempts = 5) {
  return enqueueDurableJob({
    type: "meta.webhook.reply",
    dedupeKey: eventId(messageId),
    merchantId: MERCHANT_ID,
    priority: 10,
    maxAttempts,
    payload: {
      event_id: eventId(messageId),
      page_id: PAGE_ID,
      merchant_id: MERCHANT_ID,
      external_message_id: messageId,
      sender_id: "customer-1",
    },
  }).job;
}

function replyJobById(id: string) {
  return listDurableJobs().find((job) => job.id === id);
}

test("enabled -> claimed -> disabled before reservation suppresses without debit", async () => {
  await withDataDirectory("fawri-meta-race-before-reserve-", async (directory) => {
    const queued = enqueueReply("disable-before-reserve");
    const transport = createFakeMetaWebhookReplyTransport({
      outcomeFor: () => "sent",
    });
    let observedProcessing = 0;
    const worker = startMetaWebhookWorker(3101, {
      replyTransport: transport,
      replyHooks: {
        afterClaimSettingsRead() {
          const update = updateMerchantOperationalSettingsWithEffects({
            merchantId: MERCHANT_ID,
            expectedVersion: 1,
            patch: { auto_reply_enabled: false },
          });
          observedProcessing = update.effects.processing_auto_reply_jobs_observed;
        },
      },
    });
    try {
      assert.equal(await worker.runOnce(), true);
    } finally {
      worker.stop();
    }

    const settled = replyJobById(queued.id);
    assert.equal(settled?.status, "completed");
    assert.equal(settled?.result?.delivery_status, "suppressed");
    assert.equal(
      settled?.result?.suppression_code,
      "MERCHANT_AUTO_REPLY_DISABLED",
    );
    assert.equal(observedProcessing, 1);
    assert.equal((await readSubscription(directory)).replies_used, 0);
    assert.equal(await readReservation(directory, eventId("disable-before-reserve")), null);
    const state = transport.read(eventId("disable-before-reserve"));
    assert.equal(state?.status, "suppressed");
    assert.equal(state?.attempts, 0);

    const queue = JSON.parse(
      await readFile(path.join(directory, "background-jobs.json"), "utf8"),
    );
    assert.equal(queue.version, 2, "settings update downgraded the durable queue");
  });
});

test("enabled -> reserved -> disabled before send releases exactly once", async () => {
  await withDataDirectory("fawri-meta-race-after-reserve-", async (directory) => {
    const queued = enqueueReply("disable-after-reserve");
    const id = eventId("disable-after-reserve");
    const transport = createFakeMetaWebhookReplyTransport({
      outcomeFor: () => "sent",
    });
    const worker = startMetaWebhookWorker(3102, {
      replyTransport: transport,
      replyHooks: {
        afterReservation() {
          updateMerchantOperationalSettingsWithEffects({
            merchantId: MERCHANT_ID,
            expectedVersion: 1,
            patch: { auto_reply_enabled: false },
          });
        },
      },
    });
    try {
      assert.equal(await worker.runOnce(), true);
    } finally {
      worker.stop();
    }

    const settled = replyJobById(queued.id);
    assert.equal(settled?.status, "completed");
    assert.equal(
      settled?.result?.suppression_code,
      "MERCHANT_AUTO_REPLY_DISABLED",
    );
    assert.equal((await readSubscription(directory)).replies_used, 0);
    const reservation = await readReservation(directory, id);
    assert.equal(reservation.release_status, "released");
    assert.equal(
      reservation.release_reason_code,
      "MERCHANT_AUTO_REPLY_DISABLED",
    );
    assert.deepEqual(
      releaseMerchantAutoReplyReservation(id, "MERCHANT_AUTO_REPLY_DISABLED"),
      { released: false, reason: "already_released" },
    );
    const state = transport.read(id);
    assert.equal(state?.status, "suppressed");
    assert.equal(state?.attempts, 0, "fake send started after disablement");
  });
});

test("settings version change after reservation suppresses and restores the debit", async () => {
  await withDataDirectory("fawri-meta-race-version-", async (directory) => {
    const queued = enqueueReply("version-change");
    const id = eventId("version-change");
    const transport = createFakeMetaWebhookReplyTransport({
      outcomeFor: () => "sent",
    });
    const worker = startMetaWebhookWorker(3103, {
      replyTransport: transport,
      replyHooks: {
        afterReservation() {
          updateMerchantOperationalSettingsWithEffects({
            merchantId: MERCHANT_ID,
            expectedVersion: 1,
            patch: { reply_language: "ar" },
          });
        },
      },
    });
    try {
      assert.equal(await worker.runOnce(), true);
    } finally {
      worker.stop();
    }

    const settled = replyJobById(queued.id);
    assert.equal(settled?.status, "completed");
    assert.equal(
      settled?.result?.suppression_code,
      "MERCHANT_SETTINGS_VERSION_CHANGED",
    );
    assert.equal((await readSubscription(directory)).replies_used, 0);
    const reservation = await readReservation(directory, id);
    assert.equal(reservation.release_status, "released");
    assert.equal(
      reservation.release_reason_code,
      "MERCHANT_SETTINGS_VERSION_CHANGED",
    );
    assert.equal(transport.read(id)?.attempts, 0);
  });
});

test("confirmed failure retry debits once and duplicate sent result never sends twice", async () => {
  await withDataDirectory("fawri-meta-race-retry-", async (directory) => {
    const id = eventId("retry-once");
    const job = durableJob("retry-once");
    const transport = createFakeMetaWebhookReplyTransport({
      outcomeFor: ({ attempt }) => (attempt === 1 ? "failed" : "sent"),
    });

    await assert.rejects(
      () => processMetaReplyJob(job, { transport }),
      (error: unknown) => {
        const failure = error as { code?: string; retryable?: boolean };
        assert.equal(failure.code, "META_REPLY_FAILED");
        assert.equal(failure.retryable, true);
        return true;
      },
    );
    assert.equal((await readSubscription(directory)).replies_used, 1);
    assert.equal(transport.read(id)?.attempts, 1);

    const second = await processMetaReplyJob(job, { transport });
    assert.equal(second.delivery_status, "sent");
    assert.equal((await readSubscription(directory)).replies_used, 1);
    assert.equal(transport.read(id)?.attempts, 2);

    const duplicate = await processMetaReplyJob(job, { transport });
    assert.equal(duplicate.delivery_status, "sent");
    assert.equal(duplicate.recovered_from_existing_result, true);
    assert.equal((await readSubscription(directory)).replies_used, 1);
    assert.equal(transport.read(id)?.attempts, 2, "duplicate caused another send");
  });
});

test("confirmed final failure enqueues one idempotent refund and restores one reply", async () => {
  await withDataDirectory("fawri-meta-race-refund-", async (directory) => {
    const queued = enqueueReply("confirmed-failure", 1);
    const id = eventId("confirmed-failure");
    const transport = createFakeMetaWebhookReplyTransport({
      outcomeFor: () => "failed",
    });
    const worker = startMetaWebhookWorker(3104, { replyTransport: transport });
    try {
      assert.equal(await worker.runOnce(), true);
      assert.equal(replyJobById(queued.id)?.status, "dead_letter");
      assert.equal(replyJobById(queued.id)?.requeue_policy, "blocked");
      assert.equal((await readSubscription(directory)).replies_used, 1);

      assert.equal(await worker.runOnce(), true);
      const refunds = listDurableJobs().filter(
        (job) => job.type === "meta.reply.refund",
      );
      assert.equal(refunds.length, 1);
      assert.equal(refunds[0].status, "completed");
      assert.equal((await readSubscription(directory)).replies_used, 0);
      const reservation = await readReservation(directory, id);
      assert.equal(reservation.refund_status, "refunded");
    } finally {
      worker.stop();
    }

    const restarted = startMetaWebhookWorker(3105, { replyTransport: transport });
    try {
      assert.equal(await restarted.runOnce(), false);
    } finally {
      restarted.stop();
    }
    assert.equal((await readSubscription(directory)).replies_used, 0);
    assert.equal(
      listDurableJobs().filter((job) => job.type === "meta.reply.refund").length,
      1,
    );
  });
});

test("uncertain fake delivery is dead-lettered with blocked requeue and no refund", async () => {
  await withDataDirectory("fawri-meta-race-uncertain-", async (directory) => {
    const queued = enqueueReply("uncertain-delivery", 5);
    const id = eventId("uncertain-delivery");
    const transport = createFakeMetaWebhookReplyTransport({
      outcomeFor: () => "uncertain",
    });
    const worker = startMetaWebhookWorker(3106, { replyTransport: transport });
    try {
      assert.equal(await worker.runOnce(), true);
    } finally {
      worker.stop();
    }

    const settled = replyJobById(queued.id);
    assert.equal(settled?.status, "dead_letter");
    assert.equal(settled?.last_error_code, "META_REPLY_OUTCOME_UNCERTAIN");
    assert.equal(settled?.requeue_policy, "blocked");
    assert.equal(transport.read(id)?.status, "uncertain");
    assert.equal((await readSubscription(directory)).replies_used, 1);
    assert.equal(
      listDurableJobs().filter((job) => job.type === "meta.reply.refund").length,
      0,
    );
    assert.throws(
      () => requeueDeadLetterJob(queued.id),
      (error: unknown) => {
        assert.equal(
          (error as NodeJS.ErrnoException).code,
          "DURABLE_JOB_REQUEUE_BLOCKED",
        );
        return true;
      },
    );
  });
});

test("worker restart reconciles durable sending marker as uncertain without duplicate send", async () => {
  await withDataDirectory("fawri-meta-race-restart-", async (directory) => {
    const old = new Date("2026-08-06T00:00:00.000Z");
    const queued = enqueueDurableJob(
      {
        type: "meta.webhook.reply",
        dedupeKey: eventId("restart-uncertain"),
        merchantId: MERCHANT_ID,
        priority: 10,
        maxAttempts: 5,
        availableAt: old,
        payload: {
          event_id: eventId("restart-uncertain"),
          page_id: PAGE_ID,
          merchant_id: MERCHANT_ID,
          external_message_id: "restart-uncertain",
          sender_id: "customer-1",
        },
      },
      old,
    ).job;
    const claimed = claimNextDurableJob("crashed-worker", {
      now: old,
      visibilityTimeoutMs: 1_000,
      acceptedTypes: ["meta.webhook.reply"],
    });
    assert.equal(claimed?.id, queued.id);

    const reservation = reserveMerchantAutoReply(MERCHANT_ID, eventId("restart-uncertain"), old);
    assert.equal(reservation.allowed, true);
    const transport = createFakeMetaWebhookReplyTransport({
      outcomeFor: () => "leave_sending",
    });
    transport.markReserved({
      eventId: eventId("restart-uncertain"),
      merchantId: MERCHANT_ID,
      settingsVersion: 1,
      now: old,
    });
    await assert.rejects(
      () =>
        transport.send({
          eventId: eventId("restart-uncertain"),
          merchantId: MERCHANT_ID,
          settingsVersion: 1,
          beforeSend: () => undefined,
          now: old,
        }),
      (error: unknown) => {
        assert.equal(
          (error as { code?: string }).code,
          "META_FAKE_SEND_INTERRUPTED",
        );
        return true;
      },
    );
    assert.equal(transport.read(eventId("restart-uncertain"))?.status, "sending");

    const restarted = startMetaWebhookWorker(3107, { replyTransport: transport });
    try {
      assert.equal(await restarted.runOnce(), false);
    } finally {
      restarted.stop();
    }

    const settled = replyJobById(queued.id);
    assert.equal(settled?.status, "dead_letter");
    assert.equal(settled?.last_error_code, "META_REPLY_OUTCOME_UNCERTAIN");
    assert.equal(settled?.requeue_policy, "blocked");
    assert.equal(transport.read(eventId("restart-uncertain"))?.attempts, 1);
    assert.equal((await readSubscription(directory)).replies_used, 1);
    assert.equal(
      listDurableJobs().filter((job) => job.type === "meta.reply.refund").length,
      0,
    );
  });
});

test("default fake transport blocks real send and releases the reserved credit", async () => {
  await withDataDirectory("fawri-meta-race-fake-gate-", async (directory) => {
    const id = eventId("fake-only");
    const transport = createFakeMetaWebhookReplyTransport();
    const result = await processMetaReplyJob(durableJob("fake-only"), { transport });
    assert.equal(result.delivery_status, "suppressed");
    assert.equal(result.suppression_code, "META_FAKE_TRANSPORT_ONLY");
    assert.equal((await readSubscription(directory)).replies_used, 0);
    const reservation = await readReservation(directory, id);
    assert.equal(reservation.release_status, "released");
    assert.equal(reservation.release_reason_code, "META_FAKE_TRANSPORT_ONLY");
    const state = transport.read(id);
    assert.equal(state?.status, "suppressed");
    assert.equal(state?.attempts, 1);

    const rawTransportState = await readFile(
      path.join(directory, "meta-fake-reply-transport.json"),
      "utf8",
    );
    assert.doesNotMatch(rawTransportState, /access[_-]?token|Bearer|customer-1|hello/i);
  });
});
