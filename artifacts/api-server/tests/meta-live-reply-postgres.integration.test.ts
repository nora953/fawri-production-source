import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "fawri-meta-live-pg-"));
process.env.FAWRI_DATA_DIR = dataDir;
process.env.FAWRI_OPERATIONAL_POSTGRES_AUTHORITY = "required";
process.env.FAWRI_SUBSCRIPTION_POSTGRES_AUTHORITY = "required";
process.env.FAWRI_META_TOKEN_KEY_ID = "meta-live-test-key";
process.env.FAWRI_META_TOKEN_KEY_BASE64 = Buffer.alloc(32, 23).toString("base64");
process.env.FAWRI_AUTH_SECURITY_SECRET = "meta-live-test-auth-secret-32-bytes-minimum";

const dbModule = await import("@workspace/db");
const pool = dbModule.pool;
const accounts = await import("../src/services/postgresMerchantAccountAuthority.js");
const settings = await import("../src/services/postgresMerchantSettingsAuthority.js");
const channels = await import("../src/services/postgresMetaChannelAuthority.js");
const jobs = await import("../src/services/postgresDurableJobQueue.js");
const intents = await import("../src/services/postgresMetaAutoReplyIntent.js");
const liveTransport = await import("../src/services/postgresMetaWebhookReplyTransport.js");
const workerCore = await import("../src/services/metaWebhookWorkerCore.js");

type Merchant = Awaited<ReturnType<typeof accounts.upsertPendingMerchantAuthoritative>>;

async function raw(sql: string, values: unknown[] = []) {
  return pool.query(sql, values);
}

async function seedMerchant(phone: string, suffix: string): Promise<Merchant> {
  const created = await accounts.upsertPendingMerchantAuthoritative({
    phone,
    passwordHash: `hash-${suffix}`,
    ownerName: `Owner ${suffix}`,
    storeName: `Store ${suffix}`,
    activityType: "retail",
    language: "ar",
    requestedPlan: "silver",
  });
  await accounts.markMerchantOtpVerifiedAuthoritative(created.account.id);
  await raw(
    `UPDATE merchants
        SET status = 'approved', account_status = 'approved',
            onboarding_status = 'channel_connected'
      WHERE id = $1`,
    [created.account.id],
  );
  const initial = await settings.getMerchantOperationalSettingsAuthoritative(
    created.account.id,
  );
  await settings.updateMerchantOperationalSettingsAuthoritative({
    merchantId: created.account.id,
    expectedVersion: initial.version,
    patch: {
      auto_reply_enabled: true,
      delivery: {
        enabled: true,
        pricing_mode: "flat",
        fee_iqd: 5000,
        estimated_days_min: 1,
        estimated_days_max: 2,
        areas: ["Baghdad"],
      },
      payment: {
        cash_on_delivery_enabled: true,
        electronic_payment_enabled: false,
        methods: ["cash_on_delivery"],
      },
    },
  });
  await raw(
    `INSERT INTO subscriptions
      (id, merchant_id, plan_name, status, price_iqd, billing_anchor_day,
       base_reply_limit, base_replies_used, base_replies_remaining,
       addon_replies_remaining, emergency_credit_amount,
       emergency_credit_activated, emergency_debt, auto_reply_enabled,
       starts_at, expires_at, activated_at, version)
     VALUES ($1, $2, 'silver', 'active', 10000, 1,
             20, 0, 20, 0, 0, FALSE, 0, TRUE,
             now() - interval '1 day', now() + interval '30 days', now(), 1)`,
    [`sub-meta-${suffix}`, created.account.id],
  );
  return created;
}

function webhookBody(pageId: string, senderId: string, mid: string, message: string) {
  return {
    object: "page",
    entry: [
      {
        id: pageId,
        messaging: [
          {
            sender: { id: senderId },
            recipient: { id: pageId },
            timestamp: Date.now(),
            message: { mid, text: message },
          },
        ],
      },
    ],
  };
}

async function enqueueReply(input: {
  merchantId: string;
  pageId: string;
  senderId: string;
  eventId: string;
  mid: string;
  message?: string;
}) {
  return jobs.enqueueDurableJobAuthoritative({
    type: "meta.webhook.reply",
    dedupeKey: input.eventId,
    merchantId: input.merchantId,
    maxAttempts: 5,
    payload: {
      event_id: input.eventId,
      page_id: input.pageId,
      merchant_id: input.merchantId,
      external_message_id: input.mid,
      sender_id: input.senderId,
      webhook_body: webhookBody(
        input.pageId,
        input.senderId,
        input.mid,
        input.message || "كم سعر التوصيل؟",
      ),
    },
  });
}

let merchantA: Merchant;
let merchantB: Merchant;
const pageA = "page-live-a";
const pageB = "page-live-b";

await test("seed isolated live Meta merchants and encrypted channels", async () => {
  merchantA = await seedMerchant("07710000001", "A");
  merchantB = await seedMerchant("07710000002", "B");
  await channels.connectMetaChannelAuthoritative({
    merchantId: merchantA.account.id,
    platform: "messenger",
    pageId: pageA,
    pageName: "Live Page A",
    accessToken: "meta-live-secret-A",
    webhookSubscribed: true,
  });
  await channels.connectMetaChannelAuthoritative({
    merchantId: merchantB.account.id,
    platform: "messenger",
    pageId: pageB,
    pageName: "Live Page B",
    accessToken: "meta-live-secret-B",
    webhookSubscribed: true,
  });

  const stored = await raw(
    "SELECT credential_ciphertext FROM merchant_channels WHERE merchant_id = $1 AND page_id = $2",
    [merchantA.account.id, pageA],
  );
  assert.equal(stored.rows.length, 1);
  assert.equal(
    String(stored.rows[0].credential_ciphertext).includes("meta-live-secret-A"),
    false,
  );
});

await test("live PostgreSQL transport sends once and deduplicates provider success", async () => {
  const queued = await enqueueReply({
    merchantId: merchantA.account.id,
    pageId: pageA,
    senderId: "customer-live-a-1",
    eventId: "event-live-sent-1",
    mid: "mid-live-sent-1",
  });
  const prepared = await intents.preparePostgresMetaAutoReply(queued.job);
  assert.equal(prepared.action, "send");
  if (prepared.action !== "send") return;
  assert.match(prepared.messageText, /التوصيل|رسوم/);

  let sends = 0;
  const sendText: liveTransport.PostgresMetaSendFunction = async (input) => {
    sends += 1;
    assert.equal(input.pageId, pageA);
    assert.equal(input.recipientId, "customer-live-a-1");
    assert.equal(input.pageAccessToken, "meta-live-secret-A");
    return {
      status: "sent",
      providerMessageId: "provider-message-live-1",
      recipientId: input.recipientId,
    };
  };
  const firstTransport = await liveTransport.createPostgresMetaWebhookReplyTransport({
    prepared,
    sendText,
  });
  const first = await workerCore.processMetaReplyJob(queued.job, {
    transport: firstTransport,
  });
  assert.equal(first.delivery_status, "sent");
  assert.equal(sends, 1);

  const replayPrepared = await intents.preparePostgresMetaAutoReply(queued.job);
  assert.equal(replayPrepared.action, "send");
  if (replayPrepared.action !== "send") return;
  const replayTransport = await liveTransport.createPostgresMetaWebhookReplyTransport({
    prepared: replayPrepared,
    sendText,
  });
  const replay = await workerCore.processMetaReplyJob(queued.job, {
    transport: replayTransport,
  });
  assert.equal(replay.delivery_status, "sent");
  assert.equal(sends, 1);

  const stored = await raw(
    `SELECT od.outcome, od.provider_message_id, m.status AS message_status,
            m.counted_as_auto_reply, m.metadata
       FROM outbound_deliveries od
       JOIN messages m ON m.id = $2 AND m.merchant_id = od.merchant_id
      WHERE od.merchant_id = $1 AND od.reply_intent_id = $3`,
    [merchantA.account.id, prepared.replyMessageId, prepared.replyIntentId],
  );
  assert.equal(stored.rows[0].outcome, "sent");
  assert.equal(stored.rows[0].provider_message_id, "provider-message-live-1");
  assert.equal(stored.rows[0].message_status, "sent");
  assert.equal(stored.rows[0].counted_as_auto_reply, true);
  assert.equal(stored.rows[0].metadata.reason_code, "DATABASE_FACT_DELIVERY_POLICY");
  assert.ok(Object.hasOwn(stored.rows[0].metadata, "matched_record_id"));

  const ledger = await raw(
    `SELECT count(*)::int AS count
       FROM reply_ledger
      WHERE merchant_id = $1 AND external_event_id = $2 AND direction = 'debit'`,
    [merchantA.account.id, "event-live-sent-1"],
  );
  assert.equal(ledger.rows[0].count, 1);
  assert.equal(
    await liveTransport.readPostgresMetaWebhookReplyState({
      merchantId: merchantB.account.id,
      eventId: "event-live-sent-1",
    }),
    null,
  );
});

await test("confirmed provider rejection retries safely without consuming a second reply", async () => {
  const queued = await enqueueReply({
    merchantId: merchantA.account.id,
    pageId: pageA,
    senderId: "customer-live-a-2",
    eventId: "event-live-retry-1",
    mid: "mid-live-retry-1",
  });
  const prepared = await intents.preparePostgresMetaAutoReply(queued.job);
  assert.equal(prepared.action, "send");
  if (prepared.action !== "send") return;

  let sends = 0;
  const failedTransport = await liveTransport.createPostgresMetaWebhookReplyTransport({
    prepared,
    sendText: async () => {
      sends += 1;
      return {
        status: "confirmed_failed",
        code: "META_GRAPH_HTTP_400_100",
        httpStatus: 400,
      };
    },
  });
  await assert.rejects(
    () => workerCore.processMetaReplyJob(queued.job, { transport: failedTransport }),
    (error: unknown) => (error as { code?: string }).code === "META_REPLY_FAILED",
  );

  const retriedPrepared = await intents.preparePostgresMetaAutoReply(queued.job);
  assert.equal(retriedPrepared.action, "send");
  if (retriedPrepared.action !== "send") return;
  const retryTransport = await liveTransport.createPostgresMetaWebhookReplyTransport({
    prepared: retriedPrepared,
    sendText: async (input) => {
      sends += 1;
      return {
        status: "sent",
        providerMessageId: "provider-message-live-retry-1",
        recipientId: input.recipientId,
      };
    },
  });
  const result = await workerCore.processMetaReplyJob(queued.job, {
    transport: retryTransport,
  });
  assert.equal(result.delivery_status, "sent");
  assert.equal(sends, 2);

  const ledger = await raw(
    `SELECT count(*) FILTER (WHERE direction = 'debit')::int AS debits,
            count(*) FILTER (WHERE direction = 'credit')::int AS credits
       FROM reply_ledger
      WHERE merchant_id = $1 AND external_event_id = $2`,
    [merchantA.account.id, "event-live-retry-1"],
  );
  assert.equal(ledger.rows[0].debits, 1);
  assert.equal(ledger.rows[0].credits, 0);
});

await test("uncertain provider outcome blocks automatic resend", async () => {
  const queued = await enqueueReply({
    merchantId: merchantA.account.id,
    pageId: pageA,
    senderId: "customer-live-a-3",
    eventId: "event-live-uncertain-1",
    mid: "mid-live-uncertain-1",
  });
  const prepared = await intents.preparePostgresMetaAutoReply(queued.job);
  assert.equal(prepared.action, "send");
  if (prepared.action !== "send") return;

  let sends = 0;
  const uncertainTransport = await liveTransport.createPostgresMetaWebhookReplyTransport({
    prepared,
    sendText: async () => {
      sends += 1;
      return {
        status: "uncertain",
        code: "META_GRAPH_TRANSPORT_UNCERTAIN",
      };
    },
  });
  await assert.rejects(
    () => workerCore.processMetaReplyJob(queued.job, { transport: uncertainTransport }),
    (error: unknown) => (error as { code?: string }).code === "META_REPLY_OUTCOME_UNCERTAIN",
  );

  const retriedPrepared = await intents.preparePostgresMetaAutoReply(queued.job);
  assert.equal(retriedPrepared.action, "send");
  if (retriedPrepared.action !== "send") return;
  const secondTransport = await liveTransport.createPostgresMetaWebhookReplyTransport({
    prepared: retriedPrepared,
    sendText: async () => {
      sends += 1;
      throw new Error("must not resend uncertain delivery");
    },
  });
  await assert.rejects(
    () => workerCore.processMetaReplyJob(queued.job, { transport: secondTransport }),
    (error: unknown) => (error as { code?: string }).code === "META_REPLY_OUTCOME_UNCERTAIN",
  );
  assert.equal(sends, 1);

  const state = await liveTransport.readPostgresMetaWebhookReplyState({
    merchantId: merchantA.account.id,
    eventId: "event-live-uncertain-1",
  });
  assert.equal(state?.status, "uncertain");
});

await test("manual takeover suppresses only that conversation before reservation", async () => {
  const channel = await raw(
    "SELECT id FROM merchant_channels WHERE merchant_id = $1 AND page_id = $2",
    [merchantA.account.id, pageA],
  );
  const manualConversationId = "messenger-customer-live-manual";
  await raw(
    `INSERT INTO conversations
      (id, merchant_id, channel_id, external_conversation_id,
       customer_external_id, customer_handle, status, assigned_to_human,
       needs_training)
     VALUES ($1, $2, $3, 'customer-live-manual', 'customer-live-manual',
             'customer-live-manual', 'manual', TRUE, FALSE)`,
    [manualConversationId, merchantA.account.id, channel.rows[0].id],
  );

  const queued = await enqueueReply({
    merchantId: merchantA.account.id,
    pageId: pageA,
    senderId: "customer-live-manual",
    eventId: "event-live-manual-1",
    mid: "mid-live-manual-1",
  });
  const prepared = await intents.preparePostgresMetaAutoReply(queued.job);
  assert.deepEqual(prepared, {
    action: "suppress",
    eventId: "event-live-manual-1",
    merchantId: merchantA.account.id,
    conversationId: manualConversationId,
    code: "CONVERSATION_MANUAL_TAKEOVER",
  });

  const ledger = await raw(
    "SELECT count(*)::int AS count FROM reply_ledger WHERE external_event_id = $1",
    ["event-live-manual-1"],
  );
  assert.equal(ledger.rows[0].count, 0);
  const customerMessage = await raw(
    `SELECT count(*)::int AS count
       FROM messages
      WHERE merchant_id = $1 AND conversation_id = $2 AND external_message_id = $3`,
    [merchantA.account.id, manualConversationId, "mid-live-manual-1"],
  );
  assert.equal(customerMessage.rows[0].count, 1);
});

test.after(async () => {
  await pool.end();
  fs.rmSync(dataDir, { recursive: true, force: true });
});
