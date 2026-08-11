import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "fawri-runtime-pg-proof-"));
process.env.FAWRI_DATA_DIR = dataDir;
process.env.FAWRI_OPERATIONAL_POSTGRES_AUTHORITY = "required";
process.env.FAWRI_META_TOKEN_KEY_ID = "runtime-pg-proof-key";
process.env.FAWRI_META_TOKEN_KEY_BASE64 = Buffer.alloc(32, 19).toString("base64");
process.env.FAWRI_AUTH_SECURITY_SECRET = "runtime-pg-proof-auth-secret-32-bytes-minimum";

const dbModule = await import("@workspace/db");
const pool = dbModule.pool;

const accounts = await import("../src/services/postgresMerchantAccountAuthority.js");
const settings = await import("../src/services/postgresMerchantSettingsAuthority.js");
const catalog = await import("../src/services/postgresCatalogAuthority.js");
const channels = await import("../src/services/postgresMetaChannelAuthority.js");
const conversations = await import("../src/services/postgresManualConversationAuthority.js");
const orders = await import("../src/services/postgresOrderOperationsAuthority.js");
const jobs = await import("../src/services/postgresDurableJobQueue.js");
const authSecurity = await import("../src/services/postgresMerchantAuthSecurityAuthority.js");
const notifications = await import("../src/services/postgresOperationalNotificationAuthority.js");

const legacyFiles = [
  "merchants.json",
  "merchant-settings.json",
  "catalog-inventory.json",
  "meta-channels.json",
  "background-jobs.json",
  "auth-security.json",
  "fawri-runtime-db.json",
];

async function raw(sql: string, values: unknown[] = []) {
  return pool.query(sql, values);
}

async function seedMerchant(phone: string, suffix: string) {
  const created = await accounts.upsertPendingMerchantAuthoritative({
    phone,
    passwordHash: `hash-${suffix}`,
    ownerName: `Owner ${suffix}`,
    storeName: `Store ${suffix}`,
    activityType: "retail",
    language: "ar",
    requestedPlan: "silver",
  });
  const verified = await accounts.markMerchantOtpVerifiedAuthoritative(created.account.id);
  assert.ok(verified?.merchantProfile);
  return verified!;
}

let merchantA: Awaited<ReturnType<typeof seedMerchant>>;
let merchantB: Awaited<ReturnType<typeof seedMerchant>>;
let channelAId = "";
let conversationAId = "";

test("merchant accounts are PostgreSQL-backed and isolated", async () => {
  merchantA = await seedMerchant("07700000001", "A");
  merchantB = await seedMerchant("07700000002", "B");

  const foundA = await accounts.findMerchantByPhoneAuthoritative("07700000001");
  const foundB = await accounts.findMerchantByPhoneAuthoritative("07700000002");
  assert.equal(foundA?.account.id, merchantA.account.id);
  assert.equal(foundB?.account.id, merchantB.account.id);
  assert.notEqual(foundA?.account.id, foundB?.account.id);
  assert.equal(foundA?.merchantProfile?.storeName, "Store A");
  assert.equal(foundB?.merchantProfile?.storeName, "Store B");
});

test("settings versioning and tenant separation are PostgreSQL authoritative", async () => {
  const initialA = await settings.getMerchantOperationalSettingsAuthoritative(merchantA.account.id);
  const initialB = await settings.getMerchantOperationalSettingsAuthoritative(merchantB.account.id);
  assert.equal(initialA.version, 1);
  assert.equal(initialB.version, 1);

  const changed = await settings.updateMerchantOperationalSettingsAuthoritative({
    merchantId: merchantA.account.id,
    expectedVersion: initialA.version,
    patch: {
      reply_language: "ar",
      delivery: { fee_iqd: 5000 },
    },
  });
  assert.equal(changed.settings.version, 2);
  assert.equal(changed.settings.delivery.fee_iqd, 5000);

  const untouchedB = await settings.getMerchantOperationalSettingsAuthoritative(merchantB.account.id);
  assert.equal(untouchedB.version, 1);
  assert.equal(untouchedB.delivery.fee_iqd, 0);
});

test("catalog writes and reads stay inside the merchant tenant", async () => {
  const created = await catalog.createCatalogProductAuthoritative({
    merchantId: merchantA.account.id,
    idempotencyKey: "runtime-pg-product-create-a-0001",
    input: {
      name: "Runtime Proof Product",
      price_iqd: 12000,
      stock_quantity: 7,
      low_stock_threshold: 2,
      status: "available",
      allow_fawri_reply: true,
      sku: "RUNTIME-A-001",
    },
  });
  assert.equal(created.replayed, false);
  assert.equal(created.product.stock_quantity, 7);

  const replay = await catalog.createCatalogProductAuthoritative({
    merchantId: merchantA.account.id,
    idempotencyKey: "runtime-pg-product-create-a-0001",
    input: {
      name: "Runtime Proof Product",
      price_iqd: 12000,
      stock_quantity: 7,
      low_stock_threshold: 2,
      status: "available",
      allow_fawri_reply: true,
      sku: "RUNTIME-A-001",
    },
  });
  assert.equal(replay.replayed, true);
  assert.equal(replay.product.id, created.product.id);

  const listA = await catalog.listCatalogProductsAuthoritative(merchantA.account.id);
  const listB = await catalog.listCatalogProductsAuthoritative(merchantB.account.id);
  assert.equal(listA.length, 1);
  assert.equal(listB.length, 0);
});

test("Meta credentials use PostgreSQL envelope storage and tenant mapping", async () => {
  const channelA = await channels.connectMetaChannelAuthoritative({
    merchantId: merchantA.account.id,
    platform: "messenger",
    pageId: "page-runtime-a",
    pageName: "Runtime Page A",
    accessToken: "runtime-secret-token-A",
    webhookSubscribed: true,
  });
  const channelB = await channels.connectMetaChannelAuthoritative({
    merchantId: merchantB.account.id,
    platform: "messenger",
    pageId: "page-runtime-b",
    pageName: "Runtime Page B",
    accessToken: "runtime-secret-token-B",
    webhookSubscribed: true,
  });
  channelAId = channelA.id;
  assert.notEqual(channelA.id, channelB.id);
  assert.equal(
    await channels.readMetaChannelCredentialAuthoritative({
      merchantId: merchantA.account.id,
      platform: "messenger",
      pageId: "page-runtime-a",
    }),
    "runtime-secret-token-A",
  );

  const stored = await raw(
    "SELECT credential_ciphertext FROM merchant_channels WHERE id = $1",
    [channelA.id],
  );
  assert.equal(stored.rows.length, 1);
  assert.notEqual(stored.rows[0].credential_ciphertext, "runtime-secret-token-A");
  assert.ok(String(stored.rows[0].credential_ciphertext || "").length > 10);

  const mappings = await channels.listActiveMetaPageMappingsAuthoritative();
  assert.ok(mappings.some((item) => item.pageId === "page-runtime-a" && item.merchantId === merchantA.account.id));
  assert.ok(mappings.some((item) => item.pageId === "page-runtime-b" && item.merchantId === merchantB.account.id));
});

test("manual conversation state and messages are tenant-bound", async () => {
  conversationAId = "conversation-runtime-a";
  await raw(
    `INSERT INTO conversations
      (id, merchant_id, channel_id, customer_external_id, customer_name,
       status, assigned_to_human, needs_training)
     VALUES ($1, $2, $3, $4, $5, 'auto_replying', false, false)`,
    [conversationAId, merchantA.account.id, channelAId, "customer-runtime-a", "Customer A"],
  );

  const taken = await conversations.takeOverConversationAuthoritative(
    merchantA.account.id,
    conversationAId,
  );
  assert.equal(taken.status, "manual");
  assert.equal(taken.assigned_to_human, true);

  const incoming = await conversations.recordManualInboundMessageAuthoritative({
    merchantId: merchantA.account.id,
    conversationId: conversationAId,
    externalMessageId: "mid-runtime-a-1",
    messageText: "مرحبا من اختبار PostgreSQL",
  });
  assert.equal(incoming.sender, "customer");

  const listA = await conversations.listServerConversationsAuthoritative(merchantA.account.id);
  const listB = await conversations.listServerConversationsAuthoritative(merchantB.account.id);
  assert.equal(listA.length, 1);
  assert.equal(listA[0].messages.length, 1);
  assert.equal(listB.length, 0);
});

test("order lifecycle and terminal payment audit are PostgreSQL authoritative", async () => {
  const orderId = "order-runtime-a";
  await raw(
    `INSERT INTO orders
      (id, merchant_id, conversation_id, customer_external_id, customer_name,
       customer_phone, customer_address, status, payment_method, payment_status,
       subtotal_iqd, delivery_fee_iqd, total_iqd, source_channel, version)
     VALUES ($1, $2, $3, 'customer-runtime-a', 'Customer A', '07711111111',
             'Baghdad', 'pending_confirmation', 'superqi', 'electronic_pending',
             12000, 5000, 17000, 'messenger', 1)`,
    [orderId, merchantA.account.id, conversationAId],
  );
  await raw(
    `INSERT INTO order_items
      (id, order_id, merchant_id, product_name_snapshot, quantity,
       unit_price_iqd, line_total_iqd)
     VALUES ('order-item-runtime-a', $1, $2, 'Runtime Proof Product', 1, 12000, 12000)`,
    [orderId, merchantA.account.id],
  );

  const before = await orders.getServerOrderAuthoritative(merchantA.account.id, orderId);
  assert.equal(before.version, 1);
  assert.equal(before.payment_status, "electronic_pending");

  const confirmed = await orders.confirmServerPaymentAuthoritative({
    merchantId: merchantA.account.id,
    orderId,
    expectedVersion: 1,
    actorId: merchantA.account.id,
    requestId: "runtime-payment-confirm-a-0001",
  });
  assert.equal(confirmed.payment_status, "paid");
  assert.equal(confirmed.status, "confirmed");
  assert.equal(confirmed.version, 2);

  const replay = await orders.confirmServerPaymentAuthoritative({
    merchantId: merchantA.account.id,
    orderId,
    expectedVersion: 1,
    actorId: merchantA.account.id,
    requestId: "runtime-payment-confirm-a-0001",
  });
  assert.equal(replay.version, 2);

  const listB = await orders.listServerOrdersAuthoritative(merchantB.account.id);
  assert.equal(listB.length, 0);
  const audit = await raw(
    "SELECT count(*)::int AS count FROM order_payment_decisions WHERE merchant_id = $1 AND order_id = $2",
    [merchantA.account.id, orderId],
  );
  assert.equal(audit.rows[0].count, 1);
});

test("durable jobs encrypt payloads, deduplicate, and preserve tenants", async () => {
  const first = await jobs.enqueueDurableJobAuthoritative({
    type: "meta_webhook_reply",
    dedupeKey: "runtime-job-a-0001",
    merchantId: merchantA.account.id,
    payload: { message: "sensitive runtime payload", page_id: "page-runtime-a" },
  });
  assert.equal(first.deduplicated, false);
  const replay = await jobs.enqueueDurableJobAuthoritative({
    type: "meta_webhook_reply",
    dedupeKey: "runtime-job-a-0001",
    merchantId: merchantA.account.id,
    payload: { message: "sensitive runtime payload", page_id: "page-runtime-a" },
  });
  assert.equal(replay.deduplicated, true);
  assert.equal(replay.job.id, first.job.id);

  await jobs.enqueueDurableJobAuthoritative({
    type: "meta_webhook_reply",
    dedupeKey: "runtime-job-b-0001",
    merchantId: merchantB.account.id,
    payload: { message: "tenant B payload", page_id: "page-runtime-b" },
  });

  const stored = await raw(
    `SELECT p.ciphertext
       FROM background_job_payloads p
      WHERE p.job_id = $1 AND p.merchant_id = $2`,
    [first.job.id, merchantA.account.id],
  );
  assert.equal(stored.rows.length, 1);
  assert.ok(!String(stored.rows[0].ciphertext).includes("sensitive runtime payload"));

  const all = await jobs.listDurableJobsAuthoritative();
  assert.equal(all.filter((job) => job.merchant_id === merchantA.account.id).length, 1);
  assert.equal(all.filter((job) => job.merchant_id === merchantB.account.id).length, 1);
});

test("merchant OTP and login-attempt security state are durable in PostgreSQL", async () => {
  const issued = await authSecurity.issueMerchantOtpChallengeAuthoritative({
    target: merchantA.account.phone,
    purpose: "password_reset",
    ip: "127.0.0.10",
  });
  assert.match(issued.code, /^\d{6}$/);
  const verified = await authSecurity.verifyMerchantOtpChallengeAuthoritative({
    challengeId: issued.challengeId,
    target: merchantA.account.phone,
    purpose: "password_reset",
    code: issued.code,
    ip: "127.0.0.10",
  });
  assert.equal(verified, "verified");
  const used = await authSecurity.verifyMerchantOtpChallengeAuthoritative({
    challengeId: issued.challengeId,
    target: merchantA.account.phone,
    purpose: "password_reset",
    code: issued.code,
    ip: "127.0.0.10",
  });
  assert.equal(used, "used");

  await authSecurity.recordMerchantLoginAttemptAuthoritative({
    target: merchantA.account.phone,
    accountKind: "merchant",
    ip: "127.0.0.11",
    success: false,
    reason: "proof_failure",
    accountId: merchantA.account.id,
  });
  const allowed = await authSecurity.checkMerchantLoginAllowedAuthoritative({
    target: merchantA.account.phone,
    accountKind: "merchant",
    ip: "127.0.0.11",
  });
  assert.deepEqual(allowed, { allowed: true });
  const persisted = await raw(
    "SELECT count(*)::int AS count FROM login_attempts WHERE account_id = $1",
    [merchantA.account.id],
  );
  assert.equal(persisted.rows[0].count, 1);
});

test("operational notifications deduplicate in PostgreSQL", async () => {
  const first = await notifications.notifyMerchantNewCustomerMessagePostgres({
    merchantId: merchantA.account.id,
    conversationId: conversationAId,
    sourceEventId: "runtime-event-a-0001",
  });
  const replay = await notifications.notifyMerchantNewCustomerMessagePostgres({
    merchantId: merchantA.account.id,
    conversationId: conversationAId,
    sourceEventId: "runtime-event-a-0001",
  });
  assert.equal(first.deduplicated, false);
  assert.equal(replay.deduplicated, true);
  assert.equal(first.notification_id, replay.notification_id);

  const stored = await raw(
    "SELECT count(*)::int AS count FROM notifications WHERE merchant_id = $1 AND id = $2",
    [merchantA.account.id, first.notification_id],
  );
  assert.equal(stored.rows[0].count, 1);
});

test("required operational PostgreSQL authority creates no legacy runtime JSON files", () => {
  for (const file of legacyFiles) {
    assert.equal(
      fs.existsSync(path.join(dataDir, file)),
      false,
      `${file} must not be created while PostgreSQL authority is required`,
    );
  }
});

test.after(async () => {
  await pool.end();
  fs.rmSync(dataDir, { recursive: true, force: true });
});
