import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const dataDir = fs.mkdtempSync(
  path.join(os.tmpdir(), "fawri-merchant-payment-authority-"),
);
process.env.FAWRI_DATA_DIR = dataDir;
process.env.FAWRI_OPERATIONAL_POSTGRES_AUTHORITY = "required";
process.env.FAWRI_META_TOKEN_KEY_ID = "merchant-payment-proof-key";
process.env.FAWRI_META_TOKEN_KEY_BASE64 = Buffer.alloc(32, 31).toString("base64");
process.env.FAWRI_AUTH_SECURITY_SECRET =
  "merchant-payment-proof-auth-secret-32-bytes-minimum";

const dbModule = await import("@workspace/db");
const pool = dbModule.pool;
const accounts = await import(
  "../src/services/postgresMerchantAccountAuthority.js"
);
const channels = await import("../src/services/postgresMetaChannelAuthority.js");
const orders = await import("../src/services/postgresOrderOperationsAuthority.js");
const providerPayments = await import(
  "../src/services/postgresOrderPaymentProviderAuthority.js"
);
const conversations = await import(
  "../src/services/postgresManualConversationAuthority.js"
);

async function raw(sql: string, values: unknown[] = []) {
  return pool.query(sql, values);
}

async function seedMerchant() {
  const created = await accounts.upsertPendingMerchantAuthoritative({
    phone: "07770000001",
    passwordHash: "merchant-payment-proof-hash",
    ownerName: "Payment Proof Owner",
    storeName: "Payment Proof Store",
    activityType: "retail",
    language: "ar",
    requestedPlan: "silver",
  });
  const verified = await accounts.markMerchantOtpVerifiedAuthoritative(
    created.account.id,
  );
  assert.ok(verified?.merchantProfile);
  return verified!;
}

const merchant = await seedMerchant();
const channel = await channels.connectMetaChannelAuthoritative({
  merchantId: merchant.account.id,
  platform: "messenger",
  pageId: "payment-proof-page",
  pageName: "Payment Proof Page",
  accessToken: "payment-proof-page-token",
  webhookSubscribed: true,
});

async function seedElectronicOrder(input: {
  id: string;
  conversationId: string;
  customerId: string;
  amount: number;
  paymentMethod?: "superqi" | "fastpay" | "other";
}) {
  await raw(
    `INSERT INTO conversations
      (id, merchant_id, channel_id, customer_external_id, customer_name,
       status, assigned_to_human, needs_training)
     VALUES ($1, $2, $3, $4, $5, 'auto_replying', FALSE, FALSE)`,
    [
      input.conversationId,
      merchant.account.id,
      channel.id,
      input.customerId,
      `Customer ${input.id}`,
    ],
  );
  await raw(
    `INSERT INTO orders
      (id, merchant_id, conversation_id, customer_external_id, customer_name,
       customer_phone, customer_address, status, payment_method, payment_status,
       subtotal_iqd, delivery_fee_iqd, total_iqd, source_channel, version)
     VALUES ($1, $2, $3, $4, $5, '07710000000', 'Baghdad',
             'pending_confirmation', $6::payment_method, 'electronic_pending',
             $7, 0, $7, 'messenger', 1)`,
    [
      input.id,
      merchant.account.id,
      input.conversationId,
      input.customerId,
      `Customer ${input.id}`,
      input.paymentMethod || "superqi",
      input.amount,
    ],
  );
}

function hash(label: string): string {
  return crypto.createHash("sha256").update(label).digest("hex");
}

test("merchant manual confirmation is decisive and records merchant_confirmed provenance", async () => {
  await seedElectronicOrder({
    id: "order-manual-paid",
    conversationId: "conversation-manual-paid",
    customerId: "customer-manual-paid",
    amount: 25_000,
  });

  const confirmed = await orders.confirmServerPaymentAuthoritative({
    merchantId: merchant.account.id,
    orderId: "order-manual-paid",
    expectedVersion: 1,
    actorId: merchant.account.id,
    requestId: "manual-payment-confirm-proof-0001",
  });

  assert.equal(confirmed.payment_status, "paid");
  assert.equal(confirmed.status, "confirmed");
  assert.equal(confirmed.payment_confirmation_source, "merchant_confirmed");
  assert.equal(confirmed.payment_reconciliation_status, "clear");
  assert.equal(confirmed.last_payment_decision?.confirmation_source, "merchant_confirmed");

  const decision = await raw(
    `SELECT confirmation_source::text AS confirmation_source
       FROM order_payment_decisions
      WHERE merchant_id = $1 AND order_id = $2`,
    [merchant.account.id, "order-manual-paid"],
  );
  assert.equal(decision.rows.length, 1);
  assert.equal(decision.rows[0].confirmation_source, "merchant_confirmed");
});

test("verified provider paid evidence can confirm a pending order without Fawri receiving funds", async () => {
  await seedElectronicOrder({
    id: "order-provider-paid",
    conversationId: "conversation-provider-paid",
    customerId: "customer-provider-paid",
    amount: 49_000,
    paymentMethod: "fastpay",
  });

  const result =
    await providerPayments.recordVerifiedProviderPaymentEvidenceAuthoritative({
      merchantId: merchant.account.id,
      orderId: "order-provider-paid",
      provider: "fastpay",
      providerEventId: "fastpay-proof-event-paid-0001",
      providerTransactionRef: "fastpay-proof-txn-0001",
      outcome: "paid",
      amountIqd: 49_000,
      currency: "IQD",
      payloadSha256: hash("fastpay-proof-event-paid-0001"),
      authenticityVerified: true,
      sanitizedMetadata: { environment: "isolated_test", status: "paid" },
    });

  assert.equal(result.deduplicated, false);
  assert.equal(result.action, "provider_paid_confirmed");
  assert.equal(result.order.payment_status, "paid");
  assert.equal(result.order.status, "confirmed");
  assert.equal(result.order.payment_confirmation_source, "provider_verified");
  assert.equal(result.order.payment_provider, "fastpay");
  assert.equal(
    result.order.payment_provider_transaction_ref,
    "fastpay-proof-txn-0001",
  );
  assert.equal(result.order.payment_reconciliation_status, "clear");

  const replay =
    await providerPayments.recordVerifiedProviderPaymentEvidenceAuthoritative({
      merchantId: merchant.account.id,
      orderId: "order-provider-paid",
      provider: "fastpay",
      providerEventId: "fastpay-proof-event-paid-0001",
      providerTransactionRef: "fastpay-proof-txn-0001",
      outcome: "paid",
      amountIqd: 49_000,
      currency: "IQD",
      payloadSha256: hash("fastpay-proof-event-paid-0001"),
      authenticityVerified: true,
      sanitizedMetadata: { environment: "isolated_test", status: "paid" },
    });
  assert.equal(replay.deduplicated, true);

  const eventCount = await raw(
    `SELECT count(*)::int AS count
       FROM order_payment_provider_events
      WHERE merchant_id = $1 AND order_id = $2`,
    [merchant.account.id, "order-provider-paid"],
  );
  assert.equal(eventCount.rows[0].count, 1);
});

test("provider failure after merchant confirmation preserves merchant paid decision and escalates only that conversation", async () => {
  await seedElectronicOrder({
    id: "order-payment-conflict",
    conversationId: "conversation-payment-conflict",
    customerId: "customer-payment-conflict",
    amount: 75_000,
  });

  const merchantConfirmed = await orders.confirmServerPaymentAuthoritative({
    merchantId: merchant.account.id,
    orderId: "order-payment-conflict",
    expectedVersion: 1,
    actorId: merchant.account.id,
    requestId: "manual-payment-conflict-proof-0001",
  });
  assert.equal(merchantConfirmed.payment_status, "paid");

  const conflict =
    await providerPayments.recordVerifiedProviderPaymentEvidenceAuthoritative({
      merchantId: merchant.account.id,
      orderId: "order-payment-conflict",
      provider: "superqi",
      providerEventId: "superqi-proof-event-failed-0001",
      providerTransactionRef: "superqi-proof-txn-0001",
      outcome: "failed",
      amountIqd: 75_000,
      currency: "IQD",
      payloadSha256: hash("superqi-proof-event-failed-0001"),
      authenticityVerified: true,
      sanitizedMetadata: { environment: "isolated_test", status: "failed" },
    });

  assert.equal(conflict.action, "payment_conflict");
  assert.equal(conflict.order.payment_status, "paid");
  assert.equal(conflict.order.payment_confirmation_source, "merchant_confirmed");
  assert.equal(
    conflict.order.payment_reconciliation_status,
    "reconciliation_required",
  );
  assert.equal(conflict.order.payment_conflict_code, "MERCHANT_PAID_PROVIDER_FAILED");

  const controlled = await raw(
    `SELECT status::text AS status, assigned_to_human
       FROM conversations
      WHERE merchant_id = $1 AND id = $2`,
    [merchant.account.id, "conversation-payment-conflict"],
  );
  assert.equal(controlled.rows[0].status, "manual");
  assert.equal(controlled.rows[0].assigned_to_human, true);

  const unrelated = await raw(
    `SELECT status::text AS status
       FROM conversations
      WHERE merchant_id = $1 AND id = $2`,
    [merchant.account.id, "conversation-provider-paid"],
  );
  assert.equal(unrelated.rows[0].status, "auto_replying");

  const notifications = await raw(
    `SELECT type, variables
       FROM notifications
      WHERE merchant_id = $1 AND type = 'operational_payment_conflict'`,
    [merchant.account.id],
  );
  assert.equal(notifications.rows.length, 1);
  assert.equal(notifications.rows[0].variables.order_id, "order-payment-conflict");
});

test("unresolved payment conflict blocks return-to-bot until merchant records resolution", async () => {
  await assert.rejects(
    () =>
      conversations.returnConversationToFawriAuthoritative(
        merchant.account.id,
        "conversation-payment-conflict",
      ),
    (error: unknown) =>
      Boolean(
        error &&
          typeof error === "object" &&
          (error as { code?: string }).code === "PAYMENT_RECONCILIATION_REQUIRED",
      ),
  );

  const current = await orders.getServerOrderAuthoritative(
    merchant.account.id,
    "order-payment-conflict",
  );
  const resolved =
    await providerPayments.resolveMerchantPaymentConflictAuthoritative({
      merchantId: merchant.account.id,
      orderId: "order-payment-conflict",
      expectedVersion: current.version,
      actorId: merchant.account.id,
      resolutionNote: "Merchant reviewed the transfer with the customer and closed the discrepancy.",
    });
  assert.equal(resolved.payment_status, "paid");
  assert.equal(resolved.payment_reconciliation_status, "resolved");
  assert.ok(resolved.payment_conflict_resolved_at);

  const returned = await conversations.returnConversationToFawriAuthoritative(
    merchant.account.id,
    "conversation-payment-conflict",
  );
  assert.equal(returned.status, "auto_replying");
  assert.equal(returned.assigned_to_human, false);
});

test("provider failure can be recorded before merchant review and later manual confirmation exposes conflict", async () => {
  await seedElectronicOrder({
    id: "order-provider-failed-first",
    conversationId: "conversation-provider-failed-first",
    customerId: "customer-provider-failed-first",
    amount: 32_000,
    paymentMethod: "other",
  });

  const failure =
    await providerPayments.recordVerifiedProviderPaymentEvidenceAuthoritative({
      merchantId: merchant.account.id,
      orderId: "order-provider-failed-first",
      provider: "future_provider",
      providerEventId: "future-provider-failed-event-0001",
      providerTransactionRef: "future-provider-txn-0001",
      outcome: "failed",
      amountIqd: 32_000,
      currency: "IQD",
      payloadSha256: hash("future-provider-failed-event-0001"),
      authenticityVerified: true,
      sanitizedMetadata: { environment: "isolated_test" },
    });
  assert.equal(failure.action, "provider_failure_recorded");
  assert.equal(failure.order.payment_status, "failed");

  const merchantOverride = await orders.confirmServerPaymentAuthoritative({
    merchantId: merchant.account.id,
    orderId: "order-provider-failed-first",
    expectedVersion: failure.order.version,
    actorId: merchant.account.id,
    requestId: "manual-after-provider-failure-0001",
  });
  assert.equal(merchantOverride.payment_status, "paid");
  assert.equal(merchantOverride.payment_confirmation_source, "merchant_confirmed");
  assert.equal(
    merchantOverride.payment_reconciliation_status,
    "reconciliation_required",
  );
  assert.equal(
    merchantOverride.payment_conflict_code,
    "MERCHANT_PAID_PROVIDER_FAILED",
  );

  const controlled = await raw(
    `SELECT status::text AS status, assigned_to_human
       FROM conversations
      WHERE merchant_id = $1 AND id = $2`,
    [merchant.account.id, "conversation-provider-failed-first"],
  );
  assert.equal(controlled.rows[0].status, "manual");
  assert.equal(controlled.rows[0].assigned_to_human, true);
});

test("provider evidence is rejected when amount mismatches server order total", async () => {
  await seedElectronicOrder({
    id: "order-amount-mismatch",
    conversationId: "conversation-amount-mismatch",
    customerId: "customer-amount-mismatch",
    amount: 18_500,
  });

  await assert.rejects(
    () =>
      providerPayments.recordVerifiedProviderPaymentEvidenceAuthoritative({
        merchantId: merchant.account.id,
        orderId: "order-amount-mismatch",
        provider: "fastpay",
        providerEventId: "fastpay-amount-mismatch-event-0001",
        providerTransactionRef: "fastpay-amount-mismatch-txn-0001",
        outcome: "paid",
        amountIqd: 20_000,
        currency: "IQD",
        payloadSha256: hash("fastpay-amount-mismatch-event-0001"),
        authenticityVerified: true,
        sanitizedMetadata: { environment: "isolated_test" },
      }),
    (error: unknown) =>
      Boolean(
        error &&
          typeof error === "object" &&
          (error as { code?: string }).code ===
            "ORDER_PAYMENT_PROVIDER_AMOUNT_MISMATCH",
      ),
  );

  const stored = await raw(
    `SELECT count(*)::int AS count
       FROM order_payment_provider_events
      WHERE merchant_id = $1 AND order_id = $2`,
    [merchant.account.id, "order-amount-mismatch"],
  );
  assert.equal(stored.rows[0].count, 0);
});

test("provider metadata rejects credential and card-secret fields", async () => {
  await assert.rejects(
    () =>
      providerPayments.recordVerifiedProviderPaymentEvidenceAuthoritative({
        merchantId: merchant.account.id,
        orderId: "order-amount-mismatch",
        provider: "fastpay",
        providerEventId: "fastpay-unsafe-metadata-event-0001",
        outcome: "failed",
        amountIqd: 18_500,
        currency: "IQD",
        payloadSha256: hash("fastpay-unsafe-metadata-event-0001"),
        authenticityVerified: true,
        sanitizedMetadata: { access_token: "must-not-be-stored" },
      }),
    (error: unknown) =>
      Boolean(
        error &&
          typeof error === "object" &&
          (error as { code?: string }).code ===
            "ORDER_PAYMENT_PROVIDER_METADATA_UNSAFE",
      ),
  );
});

test.after(async () => {
  await pool.end();
  fs.rmSync(dataDir, { recursive: true, force: true });
});
