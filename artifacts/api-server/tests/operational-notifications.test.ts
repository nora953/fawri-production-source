import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

function merchant(id: string) {
  return {
    id,
    owner_name: `Owner ${id}`,
    store_name: `Store ${id}`,
    phone: id === "merchant-a" ? "07111111111" : "07222222222",
    password: `Password-${id}-1!`,
    activity_type: "retail",
    status: "approved",
    account_status: "approved",
    onboarding_status: "channel_connected",
    trial_status: "active",
    signup_source: "direct",
    language: "en",
    theme_preference: "auto",
    created_at: "2026-08-01T00:00:00.000Z",
    otp_verified: true,
    warning_stage: 0,
    retention_status: "protected",
  };
}

test("operational notifications are authoritative, deduplicated, tenant-scoped, and privacy-minimal", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "fawri-operational-notifications-"));
  const dataDir = path.join(root, "data");
  await mkdir(dataDir, { recursive: true });
  t.after(async () => rm(root, { recursive: true, force: true }));

  process.env.NODE_ENV = "test";
  process.env.FAWRI_DATA_DIR = dataDir;
  process.env.FAWRI_PASSWORD_SALT = "operational-test-password-salt";
  process.env.FAWRI_ADMIN_SESSION_SECRET = "operational-test-admin-secret";
  process.env.FAWRI_MERCHANT_SESSION_SECRET = "operational-test-merchant-secret";
  process.env.FAWRI_DISABLE_JOB_WORKERS = "1";

  const existingNotification = {
    id: "existing-balance",
    merchant_id: "merchant-a",
    type: "subscription_balance_purchase",
    purchased_replies: 100,
    emergency_debt_paid: 0,
    addon_replies_added: 100,
    emergency_debt_remaining: 0,
    base_replies_remaining: 1000,
    emergency_replies_remaining: 0,
    addon_replies_remaining: 100,
    total_replies_available: 1100,
    created_at: "2026-08-01T00:00:00.000Z",
  };
  await writeFile(
    path.join(dataDir, "merchants.json"),
    JSON.stringify({
      merchants: [merchant("merchant-a"), merchant("merchant-b")],
      subscriptions: [],
      otps: [],
      admin_logs: [],
      merchant_notifications: [existingNotification],
      support_tickets: [],
      deletion_requests: [],
      channel_overrides: {},
      admin_notes: {},
    }),
  );
  await writeFile(
    path.join(dataDir, "fawri-runtime-db.json"),
    JSON.stringify({
      productsByMerchant: {},
      conversationsByMerchant: {},
      metaPagesByPageId: {},
      ordersByMerchant: {},
      orderDraftsByConversation: {},
      lastSyncedMerchantId: null,
    }),
  );

  const routeModule = await import(`../src/routes/index.ts?operational=${Date.now()}`);
  const authModule = await import("../src/routes/auth.ts");

  const order = routeModule.createOrder({
    merchantId: "merchant-a",
    conversationId: "messenger-customer-a",
    customerId: "customer-a",
    customerName: "Customer A",
    customerPhone: "07123456789",
    customerAddress: "Baghdad",
    productName: "Product A",
    quantity: 1,
    unitPrice: 25000,
  });

  let authDb = JSON.parse(await readFile(path.join(dataDir, "merchants.json"), "utf8"));
  let orderNotifications = authDb.merchant_notifications.filter(
    (item: { type?: string; order_id?: string }) =>
      item.type === "operational_new_order" && item.order_id === order.id,
  );
  assert.equal(orderNotifications.length, 1);
  assert.equal(orderNotifications[0].merchant_id, "merchant-a");
  assert.equal(orderNotifications[0].conversation_id, "messenger-customer-a");
  assert.equal(orderNotifications[0].action_url, `/dashboard/orders?order=${encodeURIComponent(order.id)}`);
  assert.equal(orderNotifications[0].read_at, undefined);

  const duplicateOrder = authModule.notifyMerchantNewOrder({
    merchantId: "merchant-a",
    orderId: order.id,
    conversationId: "messenger-customer-a",
    createdAt: order.created_at,
  });
  assert.equal(duplicateOrder.deduplicated, true);
  authDb = JSON.parse(await readFile(path.join(dataDir, "merchants.json"), "utf8"));
  orderNotifications = authDb.merchant_notifications.filter(
    (item: { type?: string; order_id?: string }) =>
      item.type === "operational_new_order" && item.order_id === order.id,
  );
  assert.equal(orderNotifications.length, 1, "order retry duplicated notification");

  routeModule.saveMessengerConversation({
    merchantId: "merchant-a",
    customerId: "customer-a",
    userText: "private customer text must not enter notification payload",
    botReply: "reply",
    externalMessageId: "mid-customer-a-1",
    sourceEventId: "meta:page-a:mid-customer-a-1",
    replyStatus: "failed",
  });
  routeModule.saveMessengerConversation({
    merchantId: "merchant-a",
    customerId: "customer-a",
    userText: "private customer text must not enter notification payload",
    botReply: "reply",
    externalMessageId: "mid-customer-a-1",
    sourceEventId: "meta:page-a:mid-customer-a-1",
    replyStatus: "failed",
  });

  authDb = JSON.parse(await readFile(path.join(dataDir, "merchants.json"), "utf8"));
  const messageNotifications = authDb.merchant_notifications.filter(
    (item: { type?: string; conversation_id?: string }) =>
      item.type === "operational_customer_message" &&
      item.conversation_id === "messenger-customer-a",
  );
  assert.equal(messageNotifications.length, 1, "message retry duplicated notification");
  assert.equal(messageNotifications[0].merchant_id, "merchant-a");
  assert.equal(
    messageNotifications[0].action_url,
    "/dashboard/conversations?conversation=messenger-customer-a",
  );
  assert.equal(Object.hasOwn(messageNotifications[0], "body"), false);
  assert.equal(Object.hasOwn(messageNotifications[0], "text"), false);
  assert.equal(
    JSON.stringify(messageNotifications[0]).includes("private customer text"),
    false,
  );

  assert.ok(
    authDb.merchant_notifications.some(
      (item: { id?: string; type?: string }) =>
        item.id === "existing-balance" && item.type === "subscription_balance_purchase",
    ),
    "existing notification type was dropped",
  );
  assert.equal(
    authDb.merchant_notifications.filter(
      (item: { merchant_id?: string }) => item.merchant_id === "merchant-b",
    ).length,
    0,
    "merchant A event leaked to merchant B",
  );

  const missingMerchant = authModule.notifyMerchantNewCustomerMessage({
    merchantId: "merchant-missing",
    conversationId: "messenger-missing",
    sourceEventId: "meta:missing:event",
  });
  assert.equal(missingMerchant.notification, null);
  assert.equal(missingMerchant.skipped, "merchant_not_found");

  const runtimeDb = JSON.parse(
    await readFile(path.join(dataDir, "fawri-runtime-db.json"), "utf8"),
  );
  assert.equal(runtimeDb.ordersByMerchant["merchant-a"].length, 1);
  assert.equal(runtimeDb.ordersByMerchant["merchant-a"][0].id, order.id);
  assert.equal(runtimeDb.conversationsByMerchant["merchant-a"].length, 1);
  assert.equal(
    runtimeDb.conversationsByMerchant["merchant-a"][0].messages.filter(
      (item: { sender?: string }) => item.sender === "customer",
    ).length,
    1,
    "duplicate inbound message changed conversation authority",
  );
});
