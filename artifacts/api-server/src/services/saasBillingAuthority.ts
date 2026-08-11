import crypto from "node:crypto";
import {
  createSuperQiSandboxPayment,
  getSuperQiSandboxPublicState,
  type SuperQiFetch,
} from "./superQiSandboxTransport";
import {
  SAAS_PLAN_CATALOG_VERSION,
  getSaasPlan,
  listSaasPlans,
  type SaasPaidPlan,
} from "./saasPlanCatalog";
import {
  applySubscriptionPlanCycleInTransaction,
  SubscriptionPlanCycleError,
  type SubscriptionPlanCycleOperation,
  type SubscriptionPlanCycleTransaction,
} from "./subscriptionPlanCycleAuthority";
import { subscriptionPostgresAuthorityRequired } from "./postgresSubscriptionEntitlement";

export const SAAS_BILLING_PROVIDER_ENV = "FAWRI_SAAS_BILLING_PROVIDER";
export const SAAS_BILLING_PROVIDERS_ENV = "FAWRI_SAAS_BILLING_PROVIDERS";

export type SaasBillingCheckoutProvider = "test_fake" | "superqi_sandbox";
export type SaasBillingProviderKey = SaasBillingCheckoutProvider | "fastpay";
export type SaasBillingProviderState = {
  provider: SaasBillingProviderKey | "disabled" | "unsupported";
  display_name: string;
  checkout_available: boolean;
  production_ready: boolean;
  test_only: boolean;
  status:
    | "available"
    | "disabled"
    | "merchant_setup_required"
    | "production_forbidden"
    | "configuration_incomplete"
    | "unsupported";
};

export type SaasBillingOrderRecord = {
  id: string;
  merchant_id: string;
  operation: SubscriptionPlanCycleOperation;
  requested_plan: SaasPaidPlan;
  amount_iqd: number;
  currency: "IQD";
  catalog_version: string;
  provider: string;
  status:
    | "pending"
    | "paid"
    | "paid_reconciliation_required"
    | "failed"
    | "cancelled"
    | "expired"
    | "refunded";
  idempotency_key: string;
  provider_checkout_ref: string | null;
  provider_payment_ref: string | null;
  request_expires_at: string;
  paid_at: string | null;
  failed_at: string | null;
  cancelled_at: string | null;
  created_at: string;
  updated_at: string;
  metadata: Record<string, string | number | boolean | null>;
};

export type VerifiedSaasBillingProviderEvent = {
  provider: "test_fake" | "superqi_sandbox";
  providerEventId: string;
  orderId: string;
  eventType:
    | "payment_succeeded"
    | "payment_failed"
    | "payment_cancelled"
    | "refund_settled";
  signatureVerified: true;
  payloadHash: string;
  occurredAt: Date;
  amountIqd: number;
  currency: "IQD";
  providerPaymentRef?: string;
  providerRefundRef?: string;
  reasonCode?: string;
};

export type SaasBillingApplicationOutcome =
  | {
      status: "applied" | "duplicate";
      order: SaasBillingOrderRecord;
      subscriptionId?: string;
    }
  | {
      status: "failed" | "cancelled" | "refunded" | "reconciliation_required";
      order: SaasBillingOrderRecord;
      reasonCode?: string;
    };

export class SaasBillingAuthorityError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details?: Record<string, unknown>;

  constructor(
    code: string,
    message: string,
    status = 409,
    details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "SaasBillingAuthorityError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

type DatabaseClient = SubscriptionPlanCycleTransaction & { release(): void };
type DatabasePool = SubscriptionPlanCycleTransaction & {
  connect(): Promise<DatabaseClient>;
};

function fail(
  code: string,
  message: string,
  status = 409,
  details?: Record<string, unknown>,
): never {
  throw new SaasBillingAuthorityError(code, message, status, details);
}

function requiredText(value: unknown, max = 300): string {
  const result = String(value ?? "").trim();
  if (!result || result.length > max) {
    fail("SAAS_BILLING_INPUT_INVALID", "SaaS billing input is invalid", 400);
  }
  return result;
}

function positiveInteger(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    fail("SAAS_BILLING_AMOUNT_INVALID", "SaaS billing amount is invalid", 400);
  }
  return parsed;
}

function timestamp(value: unknown): Date {
  const parsed = value instanceof Date ? value : new Date(String(value ?? ""));
  if (!Number.isFinite(parsed.getTime())) {
    fail("SAAS_BILLING_STATE_INVALID", "SaaS billing state is invalid", 503);
  }
  return parsed;
}

async function pool(): Promise<DatabasePool> {
  if (!process.env.DATABASE_URL) {
    throw new Error("SaaS billing authority requires DATABASE_URL");
  }
  const module = await import("@workspace/db");
  return module.pool as unknown as DatabasePool;
}

async function transaction<T>(work: (client: DatabaseClient) => Promise<T>): Promise<T> {
  const database = await pool();
  const client = await database.connect();
  try {
    await client.query("BEGIN");
    const result = await work(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

function configuredProviderNames(): string[] {
  const multi = String(process.env[SAAS_BILLING_PROVIDERS_ENV] || "")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
  const raw = multi.length > 0
    ? multi
    : [String(process.env[SAAS_BILLING_PROVIDER_ENV] || "").trim().toLowerCase()]
        .filter(Boolean);
  return [...new Set(raw.filter((value) => value !== "disabled"))];
}

function providerStateFor(
  requestedProvider: string,
  configuredProviders: Set<string>,
): SaasBillingProviderState {
  const provider = String(requestedProvider || "").trim().toLowerCase();
  if (provider === "test_fake") {
    const configured = configuredProviders.has(provider);
    const available = configured && process.env.NODE_ENV === "test";
    return {
      provider: "test_fake",
      display_name: "Internal test provider",
      checkout_available: available,
      production_ready: false,
      test_only: true,
      status: available ? "available" : "disabled",
    };
  }
  if (provider === "superqi_sandbox") {
    if (!configuredProviders.has(provider)) {
      return {
        provider: "superqi_sandbox",
        display_name: "SuperQi",
        checkout_available: false,
        production_ready: false,
        test_only: true,
        status: "disabled",
      };
    }
    const sandbox = getSuperQiSandboxPublicState();
    return {
      provider: "superqi_sandbox",
      display_name: "SuperQi",
      checkout_available: sandbox.checkout_available,
      production_ready: false,
      test_only: true,
      status: sandbox.checkout_available
        ? "available"
        : sandbox.reason === "production_forbidden"
          ? "production_forbidden"
          : "configuration_incomplete",
    };
  }
  if (provider === "fastpay") {
    return {
      provider: "fastpay",
      display_name: "FastPay",
      checkout_available: false,
      production_ready: false,
      test_only: false,
      status: "merchant_setup_required",
    };
  }
  return {
    provider: provider ? "unsupported" : "disabled",
    display_name: provider || "Disabled",
    checkout_available: false,
    production_ready: false,
    test_only: false,
    status: provider ? "unsupported" : "disabled",
  };
}

export function getSaasBillingProviderState(
  requestedProvider?: string,
): SaasBillingProviderState {
  const configured = configuredProviderNames();
  const configuredSet = new Set(configured);
  if (requestedProvider) {
    return providerStateFor(requestedProvider, configuredSet);
  }
  if (configured.length === 0) {
    return providerStateFor("", configuredSet);
  }
  return providerStateFor(configured[0], configuredSet);
}

export function getSaasBillingProviderStates(): SaasBillingProviderState[] {
  const configured = configuredProviderNames();
  const configuredSet = new Set(configured);
  const states = configured.map((provider) => providerStateFor(provider, configuredSet));
  if (!configuredSet.has("fastpay")) {
    states.push(providerStateFor("fastpay", configuredSet));
  }
  return states;
}

export function resolveSaasBillingCheckoutProvider(
  requestedProvider?: string,
): SaasBillingProviderState & { provider: SaasBillingCheckoutProvider } {
  if (requestedProvider) {
    const state = getSaasBillingProviderState(requestedProvider);
    if (
      !state.checkout_available ||
      !["test_fake", "superqi_sandbox"].includes(state.provider)
    ) {
      fail(
        "SAAS_BILLING_PROVIDER_DISABLED",
        "selected SaaS billing provider is not available",
        503,
        { provider: state.provider, provider_status: state.status },
      );
    }
    return state as SaasBillingProviderState & { provider: SaasBillingCheckoutProvider };
  }

  const available = getSaasBillingProviderStates().filter(
    (state): state is SaasBillingProviderState & { provider: SaasBillingCheckoutProvider } =>
      state.checkout_available &&
      (state.provider === "test_fake" || state.provider === "superqi_sandbox"),
  );
  if (available.length === 1) return available[0];
  if (available.length > 1) {
    fail(
      "SAAS_BILLING_PROVIDER_REQUIRED",
      "billing provider selection is required",
      400,
      { providers: available.map((provider) => provider.provider) },
    );
  }
  fail(
    "SAAS_BILLING_PROVIDER_DISABLED",
    "SaaS subscription checkout is not enabled yet",
    503,
  );
}

export function getSaasBillingCatalog() {
  return {
    catalog_version: SAAS_PLAN_CATALOG_VERSION,
    currency: "IQD" as const,
    plans: listSaasPlans(),
    provider: getSaasBillingProviderState(),
    providers: getSaasBillingProviderStates(),
  };
}

function orderFromRow(row: Record<string, unknown>): SaasBillingOrderRecord {
  const operation = String(row.operation) as SubscriptionPlanCycleOperation;
  const requestedPlan = String(row.requested_plan) as SaasPaidPlan;
  const status = String(row.status) as SaasBillingOrderRecord["status"];
  if (!["activate", "renew", "change"].includes(operation)) {
    fail("SAAS_BILLING_STATE_INVALID", "SaaS billing state is invalid", 503);
  }
  if (!["silver", "gold", "diamond"].includes(requestedPlan)) {
    fail("SAAS_BILLING_STATE_INVALID", "SaaS billing state is invalid", 503);
  }
  if (
    ![
      "pending",
      "paid",
      "paid_reconciliation_required",
      "failed",
      "cancelled",
      "expired",
      "refunded",
    ].includes(status)
  ) {
    fail("SAAS_BILLING_STATE_INVALID", "SaaS billing state is invalid", 503);
  }
  return {
    id: requiredText(row.id, 180),
    merchant_id: requiredText(row.merchant_id, 180),
    operation,
    requested_plan: requestedPlan,
    amount_iqd: positiveInteger(row.amount_iqd),
    currency: "IQD",
    catalog_version: requiredText(row.catalog_version, 100),
    provider: requiredText(row.provider, 100),
    status,
    idempotency_key: requiredText(row.idempotency_key, 200),
    provider_checkout_ref: row.provider_checkout_ref
      ? requiredText(row.provider_checkout_ref, 300)
      : null,
    provider_payment_ref: row.provider_payment_ref
      ? requiredText(row.provider_payment_ref, 300)
      : null,
    request_expires_at: timestamp(row.request_expires_at).toISOString(),
    paid_at: row.paid_at ? timestamp(row.paid_at).toISOString() : null,
    failed_at: row.failed_at ? timestamp(row.failed_at).toISOString() : null,
    cancelled_at: row.cancelled_at
      ? timestamp(row.cancelled_at).toISOString()
      : null,
    created_at: timestamp(row.created_at).toISOString(),
    updated_at: timestamp(row.updated_at).toISOString(),
    metadata:
      row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata)
        ? (row.metadata as Record<string, string | number | boolean | null>)
        : {},
  };
}

const ORDER_SELECT = `SELECT id, merchant_id, operation, requested_plan, amount_iqd,
  currency, catalog_version, provider, status, idempotency_key,
  provider_checkout_ref, provider_payment_ref, request_expires_at,
  paid_at, failed_at, cancelled_at, created_at, updated_at, metadata
  FROM saas_billing_orders`;

async function loadOrder(
  client: SubscriptionPlanCycleTransaction,
  orderId: string,
  lock = false,
): Promise<SaasBillingOrderRecord | null> {
  const result = await client.query(
    `${ORDER_SELECT} WHERE id = $1 LIMIT 2${lock ? " FOR UPDATE" : ""}`,
    [orderId],
  );
  if (result.rows.length > 1) {
    fail("SAAS_BILLING_ORDER_AMBIGUOUS", "SaaS billing order is ambiguous", 503);
  }
  return result.rows[0] ? orderFromRow(result.rows[0]) : null;
}

async function validateCheckoutEligibility(
  client: SubscriptionPlanCycleTransaction,
  merchantId: string,
  operation: SubscriptionPlanCycleOperation,
  plan: SaasPaidPlan,
  now: Date,
): Promise<void> {
  const merchantResult = await client.query(
    `SELECT id, status, account_status
       FROM merchants WHERE id = $1 LIMIT 2 FOR UPDATE`,
    [merchantId],
  );
  if (merchantResult.rows.length !== 1) {
    fail("MERCHANT_NOT_FOUND", "merchant not found", 404);
  }
  const merchant = merchantResult.rows[0];
  if (
    String(merchant.status) !== "approved" ||
    String(merchant.account_status) !== "approved"
  ) {
    fail("APPROVED_MERCHANT_REQUIRED", "approved merchant account is required", 403);
  }

  const subscriptionResult = await client.query(
    `SELECT plan_name, expires_at, base_replies_remaining
       FROM subscriptions WHERE merchant_id = $1 LIMIT 2 FOR UPDATE`,
    [merchantId],
  );
  if (subscriptionResult.rows.length > 1) {
    fail("SUBSCRIPTION_ENTITLEMENT_AMBIGUOUS", "merchant subscription authority is ambiguous", 503);
  }
  const subscription = subscriptionResult.rows[0] || null;
  if (operation === "activate" && subscription) {
    fail("SUBSCRIPTION_ALREADY_EXISTS", "merchant already has a subscription");
  }
  if (operation !== "activate" && !subscription) {
    fail("SUBSCRIPTION_NOT_FOUND", "merchant does not have a subscription", 409);
  }
  if (subscription && operation !== "activate") {
    const expired = timestamp(subscription.expires_at).getTime() <= now.getTime();
    const baseRemaining = Number(subscription.base_replies_remaining);
    if (!Number.isSafeInteger(baseRemaining) || baseRemaining < 0) {
      fail("SUBSCRIPTION_ENTITLEMENT_STATE_INVALID", "subscription entitlement state is invalid", 503);
    }
    if (!expired && baseRemaining > 0) {
      fail(
        "SUBSCRIPTION_CYCLE_STILL_ACTIVE",
        "a new subscription cycle requires exhausted base replies or an expired subscription",
        409,
        {
          base_replies_remaining: baseRemaining,
          expires_at: timestamp(subscription.expires_at).toISOString(),
        },
      );
    }
    if (operation === "renew" && String(subscription.plan_name) !== plan) {
      fail("RENEWAL_PLAN_MISMATCH", "renewal must keep the current plan");
    }
  }
}

export async function createSaasBillingCheckout(input: {
  merchantId: string;
  operation: SubscriptionPlanCycleOperation;
  plan: SaasPaidPlan;
  idempotencyKey: string;
  provider?: string;
  now?: Date;
  providerFetch?: SuperQiFetch;
}): Promise<{
  order: SaasBillingOrderRecord;
  duplicate: boolean;
  checkout:
    | { provider: "test_fake"; checkout_reference: string; test_only: true }
    | {
        provider: "superqi_sandbox";
        checkout_reference: string;
        redirect_url: string;
        test_only: true;
      };
}> {
  const provider = resolveSaasBillingCheckoutProvider(input.provider);
  if (!subscriptionPostgresAuthorityRequired()) {
    fail(
      "SAAS_BILLING_ENTITLEMENT_AUTHORITY_NOT_ACTIVE",
      "PostgreSQL subscription entitlement authority is required before checkout",
      503,
    );
  }
  const merchantId = requiredText(input.merchantId, 180);
  const idempotencyKey = requiredText(input.idempotencyKey, 200);
  const now = input.now || new Date();
  const plan = getSaasPlan(input.plan);

  return transaction(async (client) => {
    await client.query(
      `UPDATE saas_billing_orders
          SET status = 'expired', updated_at = $2
        WHERE merchant_id = $1
          AND status = 'pending'
          AND request_expires_at <= $2`,
      [merchantId, now],
    );
    const existingResult = await client.query(
      `${ORDER_SELECT}
        WHERE merchant_id = $1 AND idempotency_key = $2
        LIMIT 2 FOR UPDATE`,
      [merchantId, idempotencyKey],
    );
    if (existingResult.rows.length > 1) {
      fail("SAAS_BILLING_ORDER_AMBIGUOUS", "SaaS billing order is ambiguous", 503);
    }
    if (existingResult.rows[0]) {
      const existing = orderFromRow(existingResult.rows[0]);
      if (
        existing.operation !== input.operation ||
        existing.requested_plan !== input.plan ||
        existing.amount_iqd !== plan.monthly_price_iqd ||
        existing.catalog_version !== SAAS_PLAN_CATALOG_VERSION ||
        existing.provider !== provider.provider
      ) {
        fail(
          "SAAS_BILLING_IDEMPOTENCY_CONFLICT",
          "billing idempotency key was already used for another request",
          409,
        );
      }
      if (provider.provider === "superqi_sandbox") {
        const redirectUrl = String(existing.metadata.provider_form_url || "").trim();
        if (!existing.provider_checkout_ref || !redirectUrl) {
          fail(
            "SAAS_BILLING_PROVIDER_CHECKOUT_INCOMPLETE",
            "SuperQi sandbox checkout is incomplete; use a new checkout request",
            503,
          );
        }
        return {
          order: existing,
          duplicate: true,
          checkout: {
            provider: "superqi_sandbox" as const,
            checkout_reference: existing.provider_checkout_ref,
            redirect_url: redirectUrl,
            test_only: true as const,
          },
        };
      }
      return {
        order: existing,
        duplicate: true,
        checkout: {
          provider: "test_fake" as const,
          checkout_reference: existing.provider_checkout_ref || "",
          test_only: true as const,
        },
      };
    }

    const pendingResult = await client.query(
      `${ORDER_SELECT}
        WHERE merchant_id = $1 AND status = 'pending'
        LIMIT 2 FOR UPDATE`,
      [merchantId],
    );
    if (pendingResult.rows.length > 0) {
      const pending = orderFromRow(pendingResult.rows[0]);
      fail(
        "SAAS_BILLING_CHECKOUT_ALREADY_PENDING",
        "merchant already has a pending SaaS billing checkout",
        409,
        { order_id: pending.id },
      );
    }
    await validateCheckoutEligibility(
      client,
      merchantId,
      input.operation,
      input.plan,
      now,
    );
    const orderId = `saas-billing-${crypto.randomUUID()}`;
    const providerRequestId =
      provider.provider === "superqi_sandbox" ? crypto.randomUUID() : null;
    const checkoutRef =
      provider.provider === "test_fake"
        ? `test-checkout-${crypto.randomUUID()}`
        : null;
    const expiresAt = new Date(now.getTime() + 30 * 60 * 1000);
    const metadata = providerRequestId
      ? { provider_request_id: providerRequestId }
      : {};
    await client.query(
      `INSERT INTO saas_billing_orders (
         id, merchant_id, operation, requested_plan, amount_iqd, currency,
         catalog_version, provider, status, idempotency_key,
         provider_checkout_ref, request_expires_at, metadata, created_at, updated_at
       ) VALUES ($1, $2, $3, $4, $5, 'IQD', $6, $7, 'pending', $8, $9, $10, $11::jsonb, $12, $12)`,
      [
        orderId,
        merchantId,
        input.operation,
        input.plan,
        plan.monthly_price_iqd,
        SAAS_PLAN_CATALOG_VERSION,
        provider.provider,
        idempotencyKey,
        checkoutRef,
        expiresAt,
        JSON.stringify(metadata),
        now,
      ],
    );

    if (provider.provider === "superqi_sandbox") {
      if (!providerRequestId) {
        fail("SAAS_BILLING_PROVIDER_STATE_INVALID", "SuperQi sandbox request ID is missing", 503);
      }
      const payment = await createSuperQiSandboxPayment(
        {
          requestId: providerRequestId,
          orderId,
          amountIqd: plan.monthly_price_iqd,
        },
        input.providerFetch,
      );
      const attached = await client.query(
        `UPDATE saas_billing_orders
            SET provider_checkout_ref = $2,
                metadata = metadata || $3::jsonb,
                updated_at = $4
          WHERE id = $1 AND provider = 'superqi_sandbox'
          RETURNING id`,
        [
          orderId,
          payment.paymentId,
          JSON.stringify({ provider_form_url: payment.formUrl }),
          now,
        ],
      );
      if (attached.rows.length !== 1) {
        fail("SAAS_BILLING_PROVIDER_REFERENCE_FAILED", "SuperQi sandbox reference was not attached", 503);
      }
      const order = await loadOrder(client, orderId, true);
      if (!order) fail("SAAS_BILLING_ORDER_NOT_FOUND", "SaaS billing order not found", 503);
      return {
        order,
        duplicate: false,
        checkout: {
          provider: "superqi_sandbox" as const,
          checkout_reference: payment.paymentId,
          redirect_url: payment.formUrl,
          test_only: true as const,
        },
      };
    }

    const order = await loadOrder(client, orderId, true);
    if (!order) fail("SAAS_BILLING_ORDER_NOT_FOUND", "SaaS billing order not found", 503);
    return {
      order,
      duplicate: false,
      checkout: {
        provider: "test_fake" as const,
        checkout_reference: checkoutRef || "",
        test_only: true as const,
      },
    };
  });
}

export async function listMerchantSaasBillingOrders(
  merchantId: string,
): Promise<SaasBillingOrderRecord[]> {
  const normalizedMerchantId = requiredText(merchantId, 180);
  const database = await pool();
  await database.query(
    `UPDATE saas_billing_orders
        SET status = 'expired', updated_at = NOW()
      WHERE merchant_id = $1
        AND status = 'pending'
        AND request_expires_at <= NOW()`,
    [normalizedMerchantId],
  );
  const result = await database.query(
    `${ORDER_SELECT}
      WHERE merchant_id = $1
      ORDER BY created_at DESC, id DESC
      LIMIT 100`,
    [normalizedMerchantId],
  );
  return result.rows.map(orderFromRow);
}

async function recordEvent(
  client: SubscriptionPlanCycleTransaction,
  input: VerifiedSaasBillingProviderEvent,
  merchantId: string,
  status: "received" | "applied" | "rejected",
  appliedAt: Date | null,
): Promise<void> {
  await client.query(
    `INSERT INTO saas_billing_events (
       id, order_id, merchant_id, provider, provider_event_id, event_type,
       signature_verified, payload_hash, status, occurred_at, applied_at, created_at
     ) VALUES ($1, $2, $3, $4, $5, $6, TRUE, $7, $8, $9, $10, $11)`,
    [
      `saas-billing-event-${crypto.randomUUID()}`,
      input.orderId,
      merchantId,
      input.provider,
      input.providerEventId,
      input.eventType,
      requiredText(input.payloadHash, 128),
      status,
      input.occurredAt,
      appliedAt,
      new Date(),
    ],
  );
}

export async function applyVerifiedSaasBillingProviderEvent(
  input: VerifiedSaasBillingProviderEvent,
): Promise<SaasBillingApplicationOutcome> {
  const configuredProvider = getSaasBillingProviderState(input.provider);
  const providerEventAllowed =
    configuredProvider.checkout_available &&
    ((input.provider === "test_fake" && process.env.NODE_ENV === "test") ||
      (input.provider === "superqi_sandbox" &&
        process.env.NODE_ENV !== "production" &&
        configuredProvider.provider === "superqi_sandbox"));
  if (!providerEventAllowed) {
    fail(
      "SAAS_BILLING_PROVIDER_EVENT_UNAVAILABLE",
      "SaaS billing provider event is not enabled in this environment",
      503,
    );
  }
  if (input.signatureVerified !== true) {
    fail("SAAS_BILLING_SIGNATURE_INVALID", "billing provider signature is invalid", 401);
  }
  if (!subscriptionPostgresAuthorityRequired()) {
    fail(
      "SAAS_BILLING_ENTITLEMENT_AUTHORITY_NOT_ACTIVE",
      "PostgreSQL subscription entitlement authority is required",
      503,
    );
  }
  const eventId = requiredText(input.providerEventId, 300);
  const orderId = requiredText(input.orderId, 180);
  positiveInteger(input.amountIqd);
  if (input.currency !== "IQD") {
    fail("SAAS_BILLING_CURRENCY_MISMATCH", "billing currency mismatch", 409);
  }

  return transaction(async (client) => {
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
      `${input.provider}:${eventId}`,
    ]);
    const duplicateEvent = await client.query(
      `SELECT order_id FROM saas_billing_events
        WHERE provider = $1 AND provider_event_id = $2 LIMIT 2`,
      [input.provider, eventId],
    );
    if (duplicateEvent.rows.length > 0) {
      if (String(duplicateEvent.rows[0].order_id) !== orderId) {
        fail(
          "SAAS_BILLING_PROVIDER_EVENT_COLLISION",
          "provider event identity was reused for another billing order",
          409,
        );
      }
      const order = await loadOrder(client, orderId, true);
      if (!order) fail("SAAS_BILLING_ORDER_NOT_FOUND", "SaaS billing order not found", 404);
      return { status: "duplicate" as const, order };
    }

    const order = await loadOrder(client, orderId, true);
    if (!order) fail("SAAS_BILLING_ORDER_NOT_FOUND", "SaaS billing order not found", 404);
    if (order.provider !== input.provider) {
      fail("SAAS_BILLING_PROVIDER_MISMATCH", "billing provider mismatch", 409);
    }

    if (input.eventType === "payment_failed" || input.eventType === "payment_cancelled") {
      if (order.status === "paid" || order.status === "refunded") {
        fail("SAAS_BILLING_TERMINAL_CONFLICT", "paid billing order cannot be failed or cancelled", 409);
      }
      const nextStatus = input.eventType === "payment_failed" ? "failed" : "cancelled";
      await client.query(
        `UPDATE saas_billing_orders
            SET status = $2,
                failed_at = CASE WHEN $2 = 'failed' THEN $3 ELSE failed_at END,
                cancelled_at = CASE WHEN $2 = 'cancelled' THEN $3 ELSE cancelled_at END,
                updated_at = $3
          WHERE id = $1`,
        [order.id, nextStatus, input.occurredAt],
      );
      await recordEvent(client, input, order.merchant_id, "applied", input.occurredAt);
      const updated = await loadOrder(client, order.id, true);
      if (!updated) fail("SAAS_BILLING_ORDER_NOT_FOUND", "SaaS billing order not found", 503);
      return { status: nextStatus as "failed" | "cancelled", order: updated };
    }

    if (input.eventType === "refund_settled") {
      if (!input.providerRefundRef || order.status !== "paid") {
        fail("SAAS_BILLING_REFUND_INVALID", "billing refund state is invalid", 409);
      }
      if (input.amountIqd !== order.amount_iqd) {
        fail("SAAS_BILLING_REFUND_AMOUNT_INVALID", "V1 requires a full-cycle refund matching the paid order amount", 409);
      }
      await client.query(
        `INSERT INTO saas_billing_refunds (
           id, order_id, merchant_id, provider, provider_refund_ref,
           amount_iqd, status, reason_code, created_at, settled_at
         ) VALUES ($1, $2, $3, $4, $5, $6, 'settled', $7, $8, $8)`,
        [
          `saas-refund-${crypto.randomUUID()}`,
          order.id,
          order.merchant_id,
          input.provider,
          requiredText(input.providerRefundRef, 300),
          input.amountIqd,
          requiredText(input.reasonCode || "provider_refund", 160),
          input.occurredAt,
        ],
      );
      await client.query(
        `UPDATE saas_billing_orders SET status = 'refunded', updated_at = $2 WHERE id = $1`,
        [order.id, input.occurredAt],
      );
      await recordEvent(client, input, order.merchant_id, "applied", input.occurredAt);
      const updated = await loadOrder(client, order.id, true);
      if (!updated) fail("SAAS_BILLING_ORDER_NOT_FOUND", "SaaS billing order not found", 503);
      return { status: "refunded", order: updated };
    }

    const paymentRef = requiredText(input.providerPaymentRef, 300);
    const paymentCollision = await client.query(
      `SELECT id FROM saas_billing_orders
        WHERE provider = $1 AND provider_payment_ref = $2 AND id <> $3
        LIMIT 1 FOR UPDATE`,
      [input.provider, paymentRef, order.id],
    );
    if (paymentCollision.rows.length > 0) {
      fail(
        "SAAS_BILLING_PROVIDER_PAYMENT_COLLISION",
        "provider payment identity was already linked to another billing order",
        409,
      );
    }
    if (input.amountIqd !== order.amount_iqd) {
      await client.query(
        `UPDATE saas_billing_orders
            SET status = 'paid_reconciliation_required', provider_payment_ref = $2,
                paid_at = $3, updated_at = $3,
                metadata = metadata || $4::jsonb
          WHERE id = $1`,
        [
          order.id,
          paymentRef,
          input.occurredAt,
          JSON.stringify({
            reconciliation_code: "SAAS_BILLING_AMOUNT_MISMATCH",
            received_amount_iqd: input.amountIqd,
          }),
        ],
      );
      await recordEvent(client, input, order.merchant_id, "rejected", null);
      const updated = await loadOrder(client, order.id, true);
      if (!updated) fail("SAAS_BILLING_ORDER_NOT_FOUND", "SaaS billing order not found", 503);
      return {
        status: "reconciliation_required" as const,
        order: updated,
        reasonCode: "SAAS_BILLING_AMOUNT_MISMATCH",
      };
    }
    if (order.status === "paid") {
      const application = await client.query(
        `SELECT subscription_id FROM saas_entitlement_applications
          WHERE order_id = $1 AND merchant_id = $2 LIMIT 2`,
        [order.id, order.merchant_id],
      );
      return {
        status: "duplicate" as const,
        order,
        ...(application.rows[0]
          ? { subscriptionId: requiredText(application.rows[0].subscription_id, 180) }
          : {}),
      };
    }
    if (order.status !== "pending") {
      fail("SAAS_BILLING_ORDER_NOT_PAYABLE", "billing order is not payable", 409, {
        status: order.status,
      });
    }

    if (timestamp(order.request_expires_at).getTime() < input.occurredAt.getTime()) {
      await client.query(
        `UPDATE saas_billing_orders
            SET status = 'paid_reconciliation_required', provider_payment_ref = $2,
                paid_at = $3, updated_at = $3
          WHERE id = $1`,
        [order.id, paymentRef, input.occurredAt],
      );
      await recordEvent(client, input, order.merchant_id, "rejected", null);
      const updated = await loadOrder(client, order.id, true);
      if (!updated) fail("SAAS_BILLING_ORDER_NOT_FOUND", "SaaS billing order not found", 503);
      return {
        status: "reconciliation_required",
        order: updated,
        reasonCode: "SAAS_BILLING_ORDER_EXPIRED_AFTER_PAYMENT",
      };
    }

    try {
      const applied = await applySubscriptionPlanCycleInTransaction(client, {
        merchantId: order.merchant_id,
        operation: order.operation,
        plan: order.requested_plan,
        source: "saas_billing",
        billingOrderId: order.id,
        providerPaymentRef: paymentRef,
        now: input.occurredAt,
      });
      await client.query(
        `INSERT INTO saas_entitlement_applications (
           id, order_id, merchant_id, subscription_id, operation, applied_plan,
           amount_iqd, catalog_version, provider, provider_payment_ref, applied_at
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        [
          `saas-entitlement-${crypto.randomUUID()}`,
          order.id,
          order.merchant_id,
          applied.subscriptionId,
          order.operation,
          order.requested_plan,
          order.amount_iqd,
          order.catalog_version,
          input.provider,
          paymentRef,
          input.occurredAt,
        ],
      );
      await client.query(
        `UPDATE saas_billing_orders
            SET status = 'paid', provider_payment_ref = $2, paid_at = $3, updated_at = $3
          WHERE id = $1`,
        [order.id, paymentRef, input.occurredAt],
      );
      await recordEvent(client, input, order.merchant_id, "applied", input.occurredAt);
      const updated = await loadOrder(client, order.id, true);
      if (!updated) fail("SAAS_BILLING_ORDER_NOT_FOUND", "SaaS billing order not found", 503);
      return {
        status: "applied" as const,
        order: updated,
        subscriptionId: applied.subscriptionId,
      };
    } catch (error) {
      if (!(error instanceof SubscriptionPlanCycleError)) throw error;
      await client.query(
        `UPDATE saas_billing_orders
            SET status = 'paid_reconciliation_required', provider_payment_ref = $2,
                paid_at = $3, updated_at = $3,
                metadata = metadata || $4::jsonb
          WHERE id = $1`,
        [
          order.id,
          paymentRef,
          input.occurredAt,
          JSON.stringify({ reconciliation_code: error.code }),
        ],
      );
      await recordEvent(client, input, order.merchant_id, "rejected", null);
      const updated = await loadOrder(client, order.id, true);
      if (!updated) fail("SAAS_BILLING_ORDER_NOT_FOUND", "SaaS billing order not found", 503);
      return {
        status: "reconciliation_required" as const,
        order: updated,
        reasonCode: error.code,
      };
    }
  });
}

export async function getPaidBillingReferenceForSubscription(input: {
  merchantId: string;
  subscriptionId: string;
}): Promise<{ billingState: "paid" | "unknown"; billingReference: string | null }> {
  const database = await pool();
  const result = await database.query(
    `SELECT application.order_id, application.provider_payment_ref
       FROM saas_entitlement_applications AS application
       INNER JOIN saas_billing_orders AS billing_order
         ON billing_order.id = application.order_id
        AND billing_order.merchant_id = application.merchant_id
      WHERE application.merchant_id = $1
        AND application.subscription_id = $2
        AND billing_order.status IN ('paid', 'refunded')
      ORDER BY application.applied_at DESC
      LIMIT 2`,
    [requiredText(input.merchantId, 180), requiredText(input.subscriptionId, 180)],
  );
  if (result.rows.length === 0) {
    return { billingState: "unknown", billingReference: null };
  }
  if (result.rows.length > 1) {
    fail("SAAS_BILLING_REFERENCE_AMBIGUOUS", "billing reference is ambiguous", 503);
  }
  return {
    billingState: "paid",
    billingReference: `saas-billing-order:${requiredText(result.rows[0].order_id, 180)}`,
  };
}
