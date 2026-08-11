import assert from "node:assert/strict";
import test from "node:test";
import { pool } from "@workspace/db";
import {
  applyVerifiedSaasBillingProviderEvent,
  createSaasBillingCheckout,
  getSaasBillingCatalog,
  listMerchantSaasBillingOrders,
} from "../src/services/saasBillingAuthority";
import {
  applySubscriptionPlanOperationPostgres,
  getCurrentSubscriptionPostgres,
} from "../src/services/postgresSubscriptionEntitlement";
import { PostgresSubscriptionGuaranteeSubscriptionAuthority } from "../src/services/subscriptionServiceGuarantee";

const merchantId = "merchant-saas-billing-test";
const manualMerchantId = "merchant-saas-manual-test";
const lateMerchantId = "merchant-saas-late-test";
const adminId = "admin-saas-billing-test";

async function cleanup(): Promise<void> {
  await pool.query(`DELETE FROM accounts WHERE id = ANY($1::text[])`, [
    [merchantId, manualMerchantId, lateMerchantId, adminId],
  ]);
}

async function seedAccount(id: string, kind: "merchant" | "admin", phone: string) {
  await pool.query(
    `INSERT INTO accounts (
       id, kind, phone, password_hash, state, language, phone_verified,
       password_version, security_version, session_version, created_at, updated_at
     ) VALUES ($1, $2, $3, 'test-only-hash', 'active', 'ar', TRUE, 1, 1, 1, NOW(), NOW())`,
    [id, kind, phone],
  );
}

async function seedMerchant(id: string, phone: string) {
  await seedAccount(id, "merchant", phone);
  await pool.query(
    `INSERT INTO merchants (
       id, account_id, profile_kind, owner_name, store_name, activity_type,
       status, account_status, onboarding_status, trial_status, signup_source,
       warning_stage, products_read_only, metadata, created_at, updated_at
     ) VALUES (
       $1, $1, 'merchant', 'Billing Owner', 'Billing Store', 'test',
       'approved', 'approved', 'channel_connected', 'not_started', 'direct',
       0, FALSE, '{}'::jsonb, NOW(), NOW()
     )`,
    [id],
  );
}

function successEvent(input: {
  orderId: string;
  eventId: string;
  paymentRef: string;
  amount: number;
  at: Date;
}) {
  return {
    provider: "test_fake" as const,
    providerEventId: input.eventId,
    orderId: input.orderId,
    eventType: "payment_succeeded" as const,
    signatureVerified: true as const,
    payloadHash: "a".repeat(64),
    occurredAt: input.at,
    amountIqd: input.amount,
    currency: "IQD" as const,
    providerPaymentRef: input.paymentRef,
  };
}

test("verified SaaS payment applies one entitlement exactly once", async () => {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
  const oldAuthority = process.env.FAWRI_SUBSCRIPTION_POSTGRES_AUTHORITY;
  const oldProvider = process.env.FAWRI_SAAS_BILLING_PROVIDER;
  const oldNodeEnv = process.env.NODE_ENV;
  process.env.FAWRI_SUBSCRIPTION_POSTGRES_AUTHORITY = "required";
  process.env.FAWRI_SAAS_BILLING_PROVIDER = "test_fake";
  process.env.NODE_ENV = "test";

  try {
    await cleanup();
    await seedMerchant(merchantId, "07700000201");

    const catalog = getSaasBillingCatalog();
    assert.equal(catalog.catalog_version, "2026-08-v1");
    assert.equal(catalog.provider.checkout_available, true);
    assert.equal(catalog.plans.find((plan) => plan.plan === "silver")?.monthly_price_iqd, 25_000);

    const createdAt = new Date("2026-08-11T01:00:00.000Z");
    const first = await createSaasBillingCheckout({
      merchantId,
      operation: "activate",
      plan: "silver",
      idempotencyKey: "checkout-once",
      now: createdAt,
    });
    assert.equal(first.duplicate, false);
    assert.equal(first.order.amount_iqd, 25_000);
    assert.equal(first.order.currency, "IQD");
    assert.equal(first.order.status, "pending");

    const duplicateCheckout = await createSaasBillingCheckout({
      merchantId,
      operation: "activate",
      plan: "silver",
      idempotencyKey: "checkout-once",
      now: new Date("2026-08-11T01:01:00.000Z"),
    });
    assert.equal(duplicateCheckout.duplicate, true);
    assert.equal(duplicateCheckout.order.id, first.order.id);

    const event = successEvent({
      orderId: first.order.id,
      eventId: "provider-event-paid-1",
      paymentRef: "provider-payment-1",
      amount: 25_000,
      at: new Date("2026-08-11T01:02:00.000Z"),
    });
    const applied = await applyVerifiedSaasBillingProviderEvent(event);
    assert.equal(applied.status, "applied");
    assert.equal(applied.order.status, "paid");

    const duplicateEvent = await applyVerifiedSaasBillingProviderEvent(event);
    assert.equal(duplicateEvent.status, "duplicate");
    assert.equal(duplicateEvent.order.id, first.order.id);

    const subscription = await getCurrentSubscriptionPostgres(
      merchantId,
      new Date("2026-08-11T01:03:00.000Z"),
    );
    assert.equal(subscription?.plan_name, "silver");
    assert.equal(subscription?.base_reply_limit, 4_000);
    assert.equal(subscription?.price_iqd, 25_000);

    const applicationCount = await pool.query(
      `SELECT COUNT(*)::int AS count FROM saas_entitlement_applications WHERE order_id = $1`,
      [first.order.id],
    );
    assert.equal(applicationCount.rows[0].count, 1);
    const eventCount = await pool.query(
      `SELECT COUNT(*)::int AS count FROM saas_billing_events WHERE provider_event_id = $1`,
      [event.providerEventId],
    );
    assert.equal(eventCount.rows[0].count, 1);

    const guarantee = new PostgresSubscriptionGuaranteeSubscriptionAuthority();
    const snapshot = await guarantee.loadSubscription(merchantId, subscription!.id);
    assert.equal(snapshot?.billingState, "paid");
    assert.equal(snapshot?.billingReference, `saas-billing-order:${first.order.id}`);

    const refund = await applyVerifiedSaasBillingProviderEvent({
      provider: "test_fake",
      providerEventId: "provider-event-refund-1",
      orderId: first.order.id,
      eventType: "refund_settled",
      signatureVerified: true,
      payloadHash: "b".repeat(64),
      occurredAt: new Date("2026-08-11T01:04:00.000Z"),
      amountIqd: 25_000,
      currency: "IQD",
      providerRefundRef: "provider-refund-1",
      reasonCode: "service_guarantee_manual_refund",
    });
    assert.equal(refund.status, "refunded");
    assert.equal(refund.order.status, "refunded");
  } finally {
    await cleanup();
    if (oldAuthority === undefined) delete process.env.FAWRI_SUBSCRIPTION_POSTGRES_AUTHORITY;
    else process.env.FAWRI_SUBSCRIPTION_POSTGRES_AUTHORITY = oldAuthority;
    if (oldProvider === undefined) delete process.env.FAWRI_SAAS_BILLING_PROVIDER;
    else process.env.FAWRI_SAAS_BILLING_PROVIDER = oldProvider;
    if (oldNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = oldNodeEnv;
  }
});

test("manual admin entitlement remains financially unknown", async () => {
  const oldAuthority = process.env.FAWRI_SUBSCRIPTION_POSTGRES_AUTHORITY;
  process.env.FAWRI_SUBSCRIPTION_POSTGRES_AUTHORITY = "required";
  try {
    await cleanup();
    await seedMerchant(manualMerchantId, "07700000202");
    await seedAccount(adminId, "admin", "07700000203");
    const subscription = await applySubscriptionPlanOperationPostgres({
      merchantId: manualMerchantId,
      actorAccountId: adminId,
      operation: "activate",
      plan: "gold",
      now: new Date("2026-08-11T02:00:00.000Z"),
    });
    const guarantee = new PostgresSubscriptionGuaranteeSubscriptionAuthority();
    const snapshot = await guarantee.loadSubscription(manualMerchantId, subscription.id);
    assert.equal(snapshot?.billingState, "unknown");
    assert.equal(snapshot?.billingReference, null);

    const audit = await pool.query(
      `SELECT reason_code, metadata FROM audit_events
        WHERE merchant_id = $1 AND entity_id = $2
        ORDER BY created_at DESC LIMIT 1`,
      [manualMerchantId, subscription.id],
    );
    assert.equal(audit.rows[0].reason_code, "MANUAL_ENTITLEMENT_OVERRIDE");
    assert.equal(audit.rows[0].metadata.authority_source, "manual_override");
  } finally {
    await cleanup();
    if (oldAuthority === undefined) delete process.env.FAWRI_SUBSCRIPTION_POSTGRES_AUTHORITY;
    else process.env.FAWRI_SUBSCRIPTION_POSTGRES_AUTHORITY = oldAuthority;
  }
});

test("late verified payment is preserved for reconciliation without silent entitlement", async () => {
  const oldAuthority = process.env.FAWRI_SUBSCRIPTION_POSTGRES_AUTHORITY;
  const oldProvider = process.env.FAWRI_SAAS_BILLING_PROVIDER;
  const oldNodeEnv = process.env.NODE_ENV;
  process.env.FAWRI_SUBSCRIPTION_POSTGRES_AUTHORITY = "required";
  process.env.FAWRI_SAAS_BILLING_PROVIDER = "test_fake";
  process.env.NODE_ENV = "test";
  try {
    await cleanup();
    await seedMerchant(lateMerchantId, "07700000204");
    const created = await createSaasBillingCheckout({
      merchantId: lateMerchantId,
      operation: "activate",
      plan: "diamond",
      idempotencyKey: "late-checkout",
      now: new Date("2026-08-11T03:00:00.000Z"),
    });
    const outcome = await applyVerifiedSaasBillingProviderEvent(
      successEvent({
        orderId: created.order.id,
        eventId: "provider-event-late-1",
        paymentRef: "provider-payment-late-1",
        amount: 75_000,
        at: new Date("2026-08-11T03:31:00.000Z"),
      }),
    );
    assert.equal(outcome.status, "reconciliation_required");
    assert.equal(outcome.order.status, "paid_reconciliation_required");
    assert.equal(await getCurrentSubscriptionPostgres(lateMerchantId), null);
    const applications = await pool.query(
      `SELECT COUNT(*)::int AS count FROM saas_entitlement_applications WHERE order_id = $1`,
      [created.order.id],
    );
    assert.equal(applications.rows[0].count, 0);
  } finally {
    await cleanup();
    if (oldAuthority === undefined) delete process.env.FAWRI_SUBSCRIPTION_POSTGRES_AUTHORITY;
    else process.env.FAWRI_SUBSCRIPTION_POSTGRES_AUTHORITY = oldAuthority;
    if (oldProvider === undefined) delete process.env.FAWRI_SAAS_BILLING_PROVIDER;
    else process.env.FAWRI_SAAS_BILLING_PROVIDER = oldProvider;
    if (oldNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = oldNodeEnv;
  }
});

test("browser amount cannot override server plan pricing", async () => {
  const oldAuthority = process.env.FAWRI_SUBSCRIPTION_POSTGRES_AUTHORITY;
  const oldProvider = process.env.FAWRI_SAAS_BILLING_PROVIDER;
  const oldNodeEnv = process.env.NODE_ENV;
  process.env.FAWRI_SUBSCRIPTION_POSTGRES_AUTHORITY = "required";
  process.env.FAWRI_SAAS_BILLING_PROVIDER = "test_fake";
  process.env.NODE_ENV = "test";
  try {
    await cleanup();
    await seedMerchant(merchantId, "07700000205");
    const created = await createSaasBillingCheckout({
      merchantId,
      operation: "activate",
      plan: "silver",
      idempotencyKey: "server-price-only",
      now: new Date("2026-08-11T04:00:00.000Z"),
    });
    const mismatch = await applyVerifiedSaasBillingProviderEvent(
      successEvent({
        orderId: created.order.id,
        eventId: "provider-event-wrong-amount",
        paymentRef: "provider-payment-wrong-amount",
        amount: 1,
        at: new Date("2026-08-11T04:01:00.000Z"),
      }),
    );
    assert.equal(mismatch.status, "reconciliation_required");
    assert.equal(mismatch.reasonCode, "SAAS_BILLING_AMOUNT_MISMATCH");
    const orders = await listMerchantSaasBillingOrders(merchantId);
    assert.equal(orders[0].amount_iqd, 25_000);
    assert.equal(orders[0].status, "paid_reconciliation_required");
    assert.equal(await getCurrentSubscriptionPostgres(merchantId), null);
  } finally {
    await cleanup();
    if (oldAuthority === undefined) delete process.env.FAWRI_SUBSCRIPTION_POSTGRES_AUTHORITY;
    else process.env.FAWRI_SUBSCRIPTION_POSTGRES_AUTHORITY = oldAuthority;
    if (oldProvider === undefined) delete process.env.FAWRI_SAAS_BILLING_PROVIDER;
    else process.env.FAWRI_SAAS_BILLING_PROVIDER = oldProvider;
    if (oldNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = oldNodeEnv;
  }
});
