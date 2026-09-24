import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "fawri-meta-generation-"));
process.env.FAWRI_DATA_DIR = dataDir;
process.env.FAWRI_OPERATIONAL_POSTGRES_AUTHORITY = "required";
process.env.FAWRI_SUBSCRIPTION_POSTGRES_AUTHORITY = "required";
process.env.FAWRI_META_TOKEN_KEY_ID = "test-key";
process.env.FAWRI_META_TOKEN_KEY_BASE64 = Buffer.alloc(32, 29).toString("base64");
process.env.FAWRI_AUTH_SECURITY_SECRET = "test-auth-security-secret-32-bytes-min";

const dbModule = await import("@workspace/db");
const pool = dbModule.pool;
const accounts = await import("../src/services/postgresMerchantAccountAuthority.js");
const settings = await import("../src/services/postgresMerchantSettingsAuthority.js");
const channels = await import("../src/services/postgresMetaChannelAuthority.js");
const jobs = await import("../src/services/postgresDurableJobQueue.js");
const intents = await import("../src/services/postgresMetaAutoReplyIntent.js");
const liveTransport = await import("../src/services/postgresMetaWebhookReplyTransport.js");
const workerCore = await import("../src/services/metaWebhookWorkerCore.js");

async function raw(sql: string, values: unknown[] = []) {
  return pool.query(sql, values);
}

function webhookBody(
  pageId: string,
  senderId: string,
  mid: string,
  message: string,
  timestamp: number,
) {
  return {
    object: "page",
    entry: [{
      id: pageId,
      messaging: [{
        sender: { id: senderId },
        recipient: { id: pageId },
        timestamp,
        message: { mid, text: message },
      }],
    }],
  };
}

async function enqueue(input: {
  merchantId: string;
  pageId: string;
  senderId: string;
  eventId: string;
  mid: string;
  message: string;
  timestamp: number;
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
        input.message,
        input.timestamp,
      ),
    },
  });
}

const pageId = "page-generation-race";
let merchantId = "";

await test("seed merchant for generation-race integration", async () => {
  const created = await accounts.upsertPendingMerchantAuthoritative({
    phone: "07719990001",
    passwordHash: "test-hash",
    ownerName: "Race Owner",
    storeName: "Race Store",
    activityType: "retail",
    language: "ar",
    requestedPlan: "silver",
  });
  merchantId = created.account.id;
  await accounts.markMerchantOtpVerifiedAuthoritative(merchantId);
  await raw(
    `UPDATE merchants
        SET status = 'approved', account_status = 'approved',
            onboarding_status = 'channel_connected'
      WHERE id = $1`,
    [merchantId],
  );
  const initial = await settings.getMerchantOperationalSettingsAuthoritative(merchantId);
  await settings.updateMerchantOperationalSettingsAuthoritative({
    merchantId,
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
     VALUES ('sub-generation-race', $1, 'silver', 'active', 10000, 1,
             20, 0, 20, 0, 0, FALSE, 0, TRUE,
             now() - interval '1 day', now() + interval '30 days', now(), 1)`,
    [merchantId],
  );
  await channels.connectMetaChannelAuthoritative({
    merchantId,
    platform: "messenger",
    pageId,
    pageName: "Generation Race Page",
    accessToken: "integration-placeholder-token",
    webhookSubscribed: true,
  });
});

await test("A cannot persist after B supersedes its decision, including identical provider timestamps", async () => {
  const senderId = "customer-race-persist";
  const timestamp = Date.UTC(2026, 8, 25, 0, 0, 0);
  const a = await enqueue({
    merchantId, pageId, senderId,
    eventId: "event-race-persist-a",
    mid: "mid-race-persist-a",
    message: "كم سعر التوصيل؟",
    timestamp,
  });

  let unblock!: () => void;
  const resume = new Promise<void>((resolve) => { unblock = resolve; });
  let notifyPaused!: () => void;
  const paused = new Promise<void>((resolve) => { notifyPaused = resolve; });

  const pendingA = intents.preparePostgresMetaAutoReply(a.job, {
    hooks: {
      async afterDecision() {
        notifyPaused();
        await resume;
      },
    },
  });
  await paused;

  const b = await enqueue({
    merchantId, pageId, senderId,
    eventId: "event-race-persist-b",
    mid: "mid-race-persist-b",
    message: "والتوصيل لبغداد؟",
    timestamp,
  });
  const preparedB = await intents.preparePostgresMetaAutoReply(b.job);
  assert.equal(preparedB.action, "send");

  unblock();
  const preparedA = await pendingA;
  assert.equal(preparedA.action, "suppress");
  if (preparedA.action !== "suppress") return;
  assert.equal(preparedA.code, "CONVERSATION_SUPERSEDED");

  const conversation = await raw(
    `SELECT metadata FROM conversations
      WHERE merchant_id = $1 AND id = $2`,
    [merchantId, `messenger-${senderId}`],
  );
  assert.equal(Number(conversation.rows[0]?.metadata?.customer_message_generation), 2);

  const staleReply = await raw(
    `SELECT count(*)::int AS count FROM messages
      WHERE merchant_id = $1 AND external_event_id = $2`,
    [merchantId, "reply:event-race-persist-a"],
  );
  assert.equal(staleReply.rows[0].count, 0);
});

await test("A prepared before B is stopped at provider boundary and reservation is released exactly once", async () => {
  const senderId = "customer-race-send";
  const timestamp = Date.UTC(2026, 8, 25, 0, 1, 0);
  const a = await enqueue({
    merchantId, pageId, senderId,
    eventId: "event-race-send-a",
    mid: "mid-race-send-a",
    message: "كم سعر التوصيل؟",
    timestamp,
  });
  const preparedA = await intents.preparePostgresMetaAutoReply(a.job);
  assert.equal(preparedA.action, "send");
  if (preparedA.action !== "send") return;
  assert.equal(preparedA.sourceConversationGeneration, 1);

  const b = await enqueue({
    merchantId, pageId, senderId,
    eventId: "event-race-send-b",
    mid: "mid-race-send-b",
    message: "هل التوصيل يوم الجمعة؟",
    timestamp,
  });
  const preparedB = await intents.preparePostgresMetaAutoReply(b.job);
  assert.equal(preparedB.action, "send");
  if (preparedB.action !== "send") return;
  assert.equal(preparedB.sourceConversationGeneration, 2);

  let providerSends = 0;
  const transport = await liveTransport.createPostgresMetaWebhookReplyTransport({
    prepared: preparedA,
    sendText: async () => {
      providerSends += 1;
      return {
        status: "sent",
        providerMessageId: "must-not-send",
        recipientId: senderId,
      };
    },
  });
  const result = await workerCore.processMetaReplyJob(a.job, { transport });
  assert.equal(result.delivery_status, "suppressed");
  assert.equal(result.suppression_code, "CONVERSATION_SUPERSEDED");
  assert.equal(providerSends, 0);

  const ledger = await raw(
    `SELECT count(*) FILTER (WHERE direction = 'debit')::int AS debits,
            count(*) FILTER (WHERE direction = 'credit')::int AS credits
       FROM reply_ledger
      WHERE merchant_id = $1 AND external_event_id = $2`,
    [merchantId, "event-race-send-a"],
  );
  assert.equal(ledger.rows[0].debits, 1);
  assert.equal(ledger.rows[0].credits, 1);

  const replayTransport = await liveTransport.createPostgresMetaWebhookReplyTransport({
    prepared: preparedA,
    sendText: async () => {
      providerSends += 1;
      return {
        status: "sent",
        providerMessageId: "must-not-retry",
        recipientId: senderId,
      };
    },
  });
  const replay = await workerCore.processMetaReplyJob(a.job, {
    transport: replayTransport,
  });
  assert.equal(replay.delivery_status, "suppressed");
  assert.equal(providerSends, 0);

  const ledgerAfterReplay = await raw(
    `SELECT count(*) FILTER (WHERE direction = 'debit')::int AS debits,
            count(*) FILTER (WHERE direction = 'credit')::int AS credits
       FROM reply_ledger
      WHERE merchant_id = $1 AND external_event_id = $2`,
    [merchantId, "event-race-send-a"],
  );
  assert.equal(ledgerAfterReplay.rows[0].debits, 1);
  assert.equal(ledgerAfterReplay.rows[0].credits, 1);
});

await test("duplicate webhook does not increment conversation generation", async () => {
  const senderId = "customer-race-duplicate";
  const timestamp = Date.UTC(2026, 8, 25, 0, 2, 0);
  const event = await enqueue({
    merchantId, pageId, senderId,
    eventId: "event-race-duplicate",
    mid: "mid-race-duplicate",
    message: "كم سعر التوصيل؟",
    timestamp,
  });
  const first = await intents.preparePostgresMetaAutoReply(event.job);
  const duplicate = await intents.preparePostgresMetaAutoReply(event.job);
  assert.equal(first.action, "send");
  assert.equal(duplicate.action, "send");

  const conversation = await raw(
    `SELECT metadata FROM conversations
      WHERE merchant_id = $1 AND id = $2`,
    [merchantId, `messenger-${senderId}`],
  );
  assert.equal(Number(conversation.rows[0]?.metadata?.customer_message_generation), 1);
});

await test("merchant takeover during decision suppresses the automatic reply", async () => {
  const senderId = "customer-race-takeover";
  const event = await enqueue({
    merchantId, pageId, senderId,
    eventId: "event-race-takeover",
    mid: "mid-race-takeover",
    message: "كم سعر التوصيل؟",
    timestamp: Date.UTC(2026, 8, 25, 0, 3, 0),
  });
  const prepared = await intents.preparePostgresMetaAutoReply(event.job, {
    hooks: {
      async afterDecision(input) {
        await raw(
          `UPDATE conversations
              SET status = 'manual', assigned_to_human = TRUE, updated_at = now()
            WHERE merchant_id = $1 AND id = $2`,
          [input.merchantId, input.conversationId],
        );
      },
    },
  });
  assert.equal(prepared.action, "suppress");
  if (prepared.action !== "suppress") return;
  assert.equal(prepared.code, "CONVERSATION_MANUAL_TAKEOVER");
});

test.after(async () => {
  await pool.end();
  fs.rmSync(dataDir, { recursive: true, force: true });
});
