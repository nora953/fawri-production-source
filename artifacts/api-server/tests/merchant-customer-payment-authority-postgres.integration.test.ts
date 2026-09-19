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
const merchantManagement = await import(
  "../src/services/postgresMerchantManagementAuthority.js"
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
  await merchantManagement.updateMerchantStatusPostgres({
    merchantId: created.account.id,
    status: "approved",
    actorAdminId: created.account.id,
  });
  const managed = await merchantManagement.getManagedMerchantPostgres(
    created.account.id,
  );
  assert.equal(managed?.status, "approved");
  assert.equal(managed?.account_status, "approved");
  const approved = await accounts.findMerchantByIdAuthoritative(
    created.account.id,
  );
  assert.ok(approved?.merchantProfile);
  return approved!;
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

const fulfillmentLocationId = "payment-proof-location";
const fulfillmentAreaRateId = "payment-proof-area-mansour";
const fulfillmentProductId = "payment-proof-product";

async function seedOnlineFulfillmentFoundation() {
  await raw(
    `INSERT INTO merchant_settings
      (merchant_id, delivery_enabled, delivery_pricing_mode, delivery_fee_iqd,
       delivery_areas, delivery_estimated_days_min, delivery_estimated_days_max)
     VALUES ($1, TRUE, 'per_area', 0, '[]'::jsonb, 1, 3)
     ON CONFLICT (merchant_id) DO UPDATE
       SET delivery_enabled = TRUE,
           delivery_pricing_mode = 'per_area',
           delivery_fee_iqd = 0,
           delivery_areas = '[]'::jsonb,
           delivery_estimated_days_min = 1,
           delivery_estimated_days_max = 3,
           updated_at = now()`,
    [merchant.account.id],
  );

  await raw(
    `INSERT INTO merchant_delivery_area_rates
      (id, merchant_id, area_name, normalized_area_name, fee_iqd, enabled)
     VALUES ($1, $2, 'المنصور', 'المنصور', 0, TRUE)
     ON CONFLICT (merchant_id, normalized_area_name) DO UPDATE
       SET area_name = EXCLUDED.area_name,
           fee_iqd = EXCLUDED.fee_iqd,
           enabled = TRUE,
           updated_at = now()`,
    [fulfillmentAreaRateId, merchant.account.id],
  );

  const canonicalArea = await raw(
    `SELECT id
       FROM merchant_delivery_area_rates
      WHERE merchant_id = $1 AND normalized_area_name = 'المنصور'
      LIMIT 1`,
    [merchant.account.id],
  );
  assert.equal(canonicalArea.rows.length, 1);

  await raw(
    `INSERT INTO merchant_locations
      (id, merchant_id, name, is_default, operational_status,
       online_fulfillment_enabled, accept_online_orders_while_closed,
       merchant_priority, inventory_fresh_at)
     VALUES ($1, $2, 'Payment Proof Main', TRUE, 'open', TRUE, FALSE, 1, now())
     ON CONFLICT (id) DO UPDATE
       SET operational_status = 'open',
           online_fulfillment_enabled = TRUE,
           accept_online_orders_while_closed = FALSE,
           inventory_fresh_at = now(),
           updated_at = now()`,
    [fulfillmentLocationId, merchant.account.id],
  );

  await raw(
    `INSERT INTO merchant_location_delivery_areas
      (id, merchant_id, location_id, delivery_area_rate_id)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (merchant_id, location_id, delivery_area_rate_id)
     DO UPDATE SET updated_at = now()`,
    [
      "payment-proof-location-area",
      merchant.account.id,
      fulfillmentLocationId,
      canonicalArea.rows[0].id,
    ],
  );

  await raw(
    `INSERT INTO products
      (id, merchant_id, name, original_price_iqd, current_price_iqd,
       quantity, low_stock_threshold, version, status, allow_fawri_reply, metadata)
     VALUES ($1, $2, 'Payment Proof Product', 1000, 1000,
             1000, 5, 1, 'available', TRUE, '{}'::jsonb)
     ON CONFLICT (id) DO UPDATE
       SET quantity = 1000,
           low_stock_threshold = 5,
           status = 'available',
           deleted_at = NULL,
           updated_at = now()`,
    [fulfillmentProductId, merchant.account.id],
  );

  await raw(
    `INSERT INTO location_inventory_levels
      (id, merchant_id, location_id, product_id, variant_id,
       quantity, low_stock_threshold, version)
     VALUES ($1, $2, $3, $4, NULL, 1000, 5, 1)
     ON CONFLICT (merchant_id, location_id, product_id)
       WHERE variant_id IS NULL
     DO UPDATE SET quantity = 1000,
                   low_stock_threshold = 5,
                   version = 1,
                   updated_at = now()`,
    [
      "payment-proof-location-stock",
      merchant.account.id,
      fulfillmentLocationId,
      fulfillmentProductId,
    ],
  );
}

await seedOnlineFulfillmentFoundation();

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
       customer_phone, customer_address, customer_area,
       status, payment_method, payment_status,
       subtotal_iqd, delivery_fee_iqd, total_iqd, source_channel, version)
     VALUES ($1, $2, $3, $4, $5, '07710000000', 'Baghdad', 'المنصور',
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
  await raw(
    `INSERT INTO order_items
      (id, order_id, merchant_id, product_id, product_variant_id,
       product_name_snapshot, variant_snapshot, quantity,
       unit_price_iqd, line_total_iqd)
     VALUES ($1, $2, $3, $4, NULL,
             'Payment Proof Product', '{}'::jsonb, 1, $5, $5)`,
    [
      `${input.id}-item`,
      input.id,
      merchant.account.id,
      fulfillmentProductId,
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

  const manualFulfillment = await raw(
    `SELECT fulfillment_location_id, metadata
       FROM orders
      WHERE merchant_id = $1 AND id = $2`,
    [merchant.account.id, "order-manual-paid"],
  );
  assert.equal(
    manualFulfillment.rows[0].fulfillment_location_id,
    fulfillmentLocationId,
  );
  assert.equal(
    manualFulfillment.rows[0].metadata.online_fulfillment_v1.inventory_committed,
    true,
  );
  assert.equal(
    manualFulfillment.rows[0].metadata.online_fulfillment_v1.location_id,
    fulfillmentLocationId,
  );

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

  const stockBeforeProviderPaid = await raw(
    `SELECT quantity
       FROM location_inventory_levels
      WHERE merchant_id = $1 AND location_id = $2 AND product_id = $3
        AND variant_id IS NULL`,
    [merchant.account.id, fulfillmentLocationId, fulfillmentProductId],
  );

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

  const providerFulfillment = await raw(
    `SELECT fulfillment_location_id, metadata
       FROM orders
      WHERE merchant_id = $1 AND id = $2`,
    [merchant.account.id, "order-provider-paid"],
  );
  assert.equal(
    providerFulfillment.rows[0].fulfillment_location_id,
    fulfillmentLocationId,
  );
  assert.equal(
    providerFulfillment.rows[0].metadata.online_fulfillment_v1.inventory_committed,
    true,
  );

  const stockAfterProviderReplay = await raw(
    `SELECT quantity
       FROM location_inventory_levels
      WHERE merchant_id = $1 AND location_id = $2 AND product_id = $3
        AND variant_id IS NULL`,
    [merchant.account.id, fulfillmentLocationId, fulfillmentProductId],
  );
  assert.equal(
    Number(stockAfterProviderReplay.rows[0].quantity),
    Number(stockBeforeProviderPaid.rows[0].quantity) - 1,
  );

  const eventCount = await raw(
    `SELECT count(*)::int AS count
       FROM order_payment_provider_events
      WHERE merchant_id = $1 AND order_id = $2`,
    [merchant.account.id, "order-provider-paid"],
  );
  assert.equal(eventCount.rows[0].count, 1);
});

test("provider paid evidence is preserved while stale fulfillment rolls back inventory and requires reconciliation", async () => {
  await seedElectronicOrder({
    id: "order-provider-paid-stale",
    conversationId: "conversation-provider-paid-stale",
    customerId: "customer-provider-paid-stale",
    amount: 41_000,
    paymentMethod: "fastpay",
  });

  const stockBefore = await raw(
    `SELECT quantity
       FROM location_inventory_levels
      WHERE merchant_id = $1 AND location_id = $2 AND product_id = $3
        AND variant_id IS NULL`,
    [merchant.account.id, fulfillmentLocationId, fulfillmentProductId],
  );
  await raw(
    `UPDATE merchant_locations
        SET inventory_fresh_at = now() - interval '10 minutes',
            updated_at = now()
      WHERE merchant_id = $1 AND id = $2`,
    [merchant.account.id, fulfillmentLocationId],
  );

  try {
    const result =
      await providerPayments.recordVerifiedProviderPaymentEvidenceAuthoritative({
        merchantId: merchant.account.id,
        orderId: "order-provider-paid-stale",
        provider: "fastpay",
        providerEventId: "fastpay-proof-event-paid-stale-0001",
        providerTransactionRef: "fastpay-proof-txn-stale-0001",
        outcome: "paid",
        amountIqd: 41_000,
        currency: "IQD",
        payloadSha256: hash("fastpay-proof-event-paid-stale-0001"),
        authenticityVerified: true,
        sanitizedMetadata: { environment: "isolated_test", status: "paid" },
      });

    assert.equal(result.action, "payment_conflict");
    assert.equal(result.order.payment_status, "paid");
    assert.equal(result.order.status, "pending_confirmation");
    assert.equal(
      result.order.payment_reconciliation_status,
      "reconciliation_required",
    );
    assert.equal(
      result.order.payment_conflict_code,
      "ORDER_FULFILLMENT_CONFIRMATION_REQUIRED",
    );

    const stockAfter = await raw(
      `SELECT quantity
         FROM location_inventory_levels
        WHERE merchant_id = $1 AND location_id = $2 AND product_id = $3
          AND variant_id IS NULL`,
      [merchant.account.id, fulfillmentLocationId, fulfillmentProductId],
    );
    assert.equal(
      Number(stockAfter.rows[0].quantity),
      Number(stockBefore.rows[0].quantity),
    );

    const storedEvent = await raw(
      `SELECT count(*)::int AS count
         FROM order_payment_provider_events
        WHERE merchant_id = $1 AND order_id = $2`,
      [merchant.account.id, "order-provider-paid-stale"],
    );
    assert.equal(storedEvent.rows[0].count, 1);

    const controlled = await raw(
      `SELECT status::text AS status, assigned_to_human
         FROM conversations
        WHERE merchant_id = $1 AND id = $2`,
      [merchant.account.id, "conversation-provider-paid-stale"],
    );
    assert.equal(controlled.rows[0].status, "manual");
    assert.equal(controlled.rows[0].assigned_to_human, true);
  } finally {
    await raw(
      `UPDATE merchant_locations
          SET inventory_fresh_at = now(), updated_at = now()
        WHERE merchant_id = $1 AND id = $2`,
      [merchant.account.id, fulfillmentLocationId],
    );
  }
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
