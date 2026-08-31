import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import type { DurableJob } from "../src/services/durableJobQueue";
import { createFakeMetaWebhookReplyTransport } from "../src/services/metaWebhookFakeTransport";
import { processMetaReplyJob } from "../src/services/metaWebhookWorkerCore";

const MERCHANT_ID = "merchant-meta-cutoff";
const PAGE_ID = "page-meta-cutoff";
const MESSAGE_ID = "reject-after-reservation";
const EVENT_ID = `meta:${PAGE_ID}:${MESSAGE_ID}`;

function job(): DurableJob {
  return {
    id: `job-${MESSAGE_ID}`,
    type: "meta.webhook.reply",
    dedupe_key: EVENT_ID,
    merchant_id: MERCHANT_ID,
    payload: {
      event_id: EVENT_ID,
      page_id: PAGE_ID,
      merchant_id: MERCHANT_ID,
      external_message_id: MESSAGE_ID,
      sender_id: "customer-cutoff",
    },
    priority: 10,
    status: "processing",
    attempts: 1,
    max_attempts: 5,
    available_at: "2026-08-30T00:00:00.000Z",
    locked_at: "2026-08-30T00:00:00.000Z",
    locked_by: "meta-cutoff-test",
    created_at: "2026-08-30T00:00:00.000Z",
    updated_at: "2026-08-30T00:00:00.000Z",
  };
}

function activeSubscription() {
  return {
    id: "subscription-meta-cutoff",
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
    expires_at: "2026-09-30T00:00:00.000Z",
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

async function writeFixture(directory: string): Promise<void> {
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
      subscriptions: [activeSubscription()],
    }),
    "utf8",
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
    "utf8",
  );
}

async function rejectMerchant(directory: string): Promise<void> {
  const file = path.join(directory, "merchants.json");
  const database = JSON.parse(await readFile(file, "utf8"));
  database.merchants[0].status = "rejected";
  database.merchants[0].account_status = "rejected";
  // Keep the subscription active intentionally. This mirrors the canonical
  // PostgreSQL merchant-status lifecycle, where rejection blocks the account
  // but does not transition the subscription to `suspended`.
  assert.equal(database.subscriptions[0].status, "active");
  await writeFile(file, JSON.stringify(database), "utf8");
}

async function readSubscription(directory: string) {
  const database = JSON.parse(
    await readFile(path.join(directory, "merchants.json"), "utf8"),
  );
  return database.subscriptions[0];
}

test("approved -> reserved -> rejected before send suppresses and releases exactly once", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "fawri-meta-operational-cutoff-"));
  const previousDataDir = process.env.FAWRI_DATA_DIR;
  const previousOperational = process.env.FAWRI_OPERATIONAL_POSTGRES_AUTHORITY;
  const previousSubscription = process.env.FAWRI_SUBSCRIPTION_POSTGRES_AUTHORITY;
  process.env.FAWRI_DATA_DIR = directory;
  process.env.FAWRI_OPERATIONAL_POSTGRES_AUTHORITY = "optional";
  process.env.FAWRI_SUBSCRIPTION_POSTGRES_AUTHORITY = "optional";

  try {
    await writeFixture(directory);
    const transport = createFakeMetaWebhookReplyTransport({
      outcomeFor: () => "sent",
    });

    const result = await processMetaReplyJob(job(), {
      transport,
      hooks: {
        async afterReservation() {
          await rejectMerchant(directory);
        },
      },
    });

    assert.equal(result.delivery_status, "suppressed");
    assert.equal(result.suppression_code, "MERCHANT_REJECTED");
    assert.equal(
      (await readSubscription(directory)).replies_used,
      0,
      "rejection after reservation must restore the reserved reply",
    );
    assert.equal(
      transport.read(EVENT_ID)?.attempts,
      0,
      "external Meta send must not start after merchant rejection",
    );
  } finally {
    if (previousDataDir === undefined) delete process.env.FAWRI_DATA_DIR;
    else process.env.FAWRI_DATA_DIR = previousDataDir;
    if (previousOperational === undefined) {
      delete process.env.FAWRI_OPERATIONAL_POSTGRES_AUTHORITY;
    } else {
      process.env.FAWRI_OPERATIONAL_POSTGRES_AUTHORITY = previousOperational;
    }
    if (previousSubscription === undefined) {
      delete process.env.FAWRI_SUBSCRIPTION_POSTGRES_AUTHORITY;
    } else {
      process.env.FAWRI_SUBSCRIPTION_POSTGRES_AUTHORITY = previousSubscription;
    }
    await rm(directory, { recursive: true, force: true });
  }
});
