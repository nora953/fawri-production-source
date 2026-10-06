import crypto from "node:crypto";
import {
  createSuperQiSandboxPayment,
  type SuperQiFetch,
} from "./superQiSandboxTransport";
import {
  getSaasBillingProviderState,
  resolveSaasBillingCheckoutProvider,
  type SaasBillingCheckoutProvider,
} from "./saasBillingAuthority";
import {
  addCashierBillingMonth,
  calculateCashierProrationIqd,
  cashierGraceSeconds,
  cashierSeatPriceIqd,
  evaluateCashierEntitlement,
  type CashierSubscriptionRow,
} from "./cashierEntitlementAuthority";
import {
  operationalDatabasePool,
  operationalPostgresAuthorityRequired,
  operationalQueryRows,
  withMerchantOperationalTransaction,
  withOperationalTransaction,
  type OperationalQueryTarget,
} from "./operationalPostgresAuthority";

export type CashierBillingOperation = "activate" | "renew" | "add_seats";

export type CashierBillingOrderRecord = {
  id: string;
  merchant_id: string;
  subscription_id: string | null;
  operation: CashierBillingOperation;
  current_seats: number;
  requested_seats: number;
  resulting_seats: number;
  unit_price_iqd: number;
  amount_iqd: number;
  currency: "IQD";
  billing_period_start: string;
  billing_period_end: string;
  grace_duration_seconds: number;
  status:
    | "pending"
    | "paid"
    | "applied"
    | "failed"
    | "cancelled"
    | "expired"
    | "paid_reconciliation_required";
  idempotency_key: string;
  provider: string;
  provider_checkout_ref: string | null;
  provider_payment_ref: string | null;
  request_expires_at: string;
  paid_at: string | null;
  applied_at: string | null;
  failed_at: string | null;
  metadata: Record<string, string | number | boolean | null>;
  created_at: string;
  updated_at: string;
};

export type VerifiedCashierBillingProviderEvent = {
  provider: "test_fake" | "superqi_sandbox";
  providerEventId: string;
  orderId: string;
  eventType: "payment_succeeded" | "payment_failed" | "payment_cancelled";
  signatureVerified: true;
  payloadHash: string;
  occurredAt: Date;
  amountIqd: number;
  currency: "IQD";
  providerPaymentRef?: string;
  reasonCode?: string;
};

export class CashierBillingAuthorityError extends Error {
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
    this.name = "CashierBillingAuthorityError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

function fail(
  code: string,
  message: string,
  status = 409,
  details?: Record<string, unknown>,
): never {
  throw new CashierBillingAuthorityError(code, message, status, details);
}

function requiredText(value: unknown, field: string, max = 300): string {
  const normalized = String(value ?? "").normalize("NFKC").trim();
  if (!normalized || normalized.length > max) {
    fail("CASHIER_BILLING_INPUT_INVALID", `${field} is invalid`, 400, { field });
  }
  return normalized;
}

function positiveInt(value: unknown, field: string): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    fail("CASHIER_BILLING_INPUT_INVALID", `${field} must be a positive integer`, 400, { field });
  }
  return parsed;
}

function timestamp(value: unknown): Date {
  const result = value instanceof Date ? value : new Date(String(value ?? ""));
  if (!Number.isFinite(result.getTime())) {
    fail("CASHIER_BILLING_STATE_INVALID", "cashier billing timestamp is invalid", 503);
  }
  return result;
}

function subscriptionFromRow(row: Record<string, unknown>): CashierSubscriptionRow {
  return {
    id: requiredText(row.id, "subscription_id", 200),
    merchant_id: requiredText(row.merchant_id, "merchant_id", 200),
    status: String(row.status || ""),
    licensed_seats: Number(row.licensed_seats),
    price_per_seat_iqd: Number(row.price_per_seat_iqd),
    billing_period_start: row.billing_period_start as Date | string | null,
    billing_period_end: row.billing_period_end as Date | string | null,
    grace_duration_seconds: Number(row.grace_duration_seconds),
    scheduled_licensed_seats:
      row.scheduled_licensed_seats === null ? null : Number(row.scheduled_licensed_seats),
    scheduled_change_at: row.scheduled_change_at as Date | string | null,
    version: Number(row.version),
  };
}

async function loadSubscription(
  target: OperationalQueryTarget,
  merchantId: string,
  lock = false,
): Promise<CashierSubscriptionRow | null> {
  const rows = await operationalQueryRows<Record<string, unknown>>(
    target,
    `SELECT id, merchant_id, status, licensed_seats, price_per_seat_iqd,
            billing_period_start, billing_period_end, grace_duration_seconds,
            scheduled_licensed_seats, scheduled_change_at, version
       FROM merchant_cashier_subscriptions
      WHERE merchant_id = $1
      LIMIT 1${lock ? " FOR UPDATE" : ""}`,
    [merchantId],
  );
  return rows[0] ? subscriptionFromRow(rows[0]) : null;
}

function orderFromRow(row: Record<string, unknown>): CashierBillingOrderRecord {
  const operation = String(row.operation) as CashierBillingOperation;
  const status = String(row.status) as CashierBillingOrderRecord["status"];
  if (!["activate", "renew", "add_seats"].includes(operation)) {
    fail("CASHIER_BILLING_STATE_INVALID", "cashier billing operation is invalid", 503);
  }
  if (
    !["pending","paid","applied","failed","cancelled","expired","paid_reconciliation_required"].includes(status)
  ) {
    fail("CASHIER_BILLING_STATE_INVALID", "cashier billing status is invalid", 503);
  }
  const metadata =
    row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata)
      ? row.metadata as Record<string, string | number | boolean | null>
      : {};
  return {
    id: requiredText(row.id, "order_id", 200),
    merchant_id: requiredText(row.merchant_id, "merchant_id", 200),
    subscription_id: row.subscription_id
      ? requiredText(row.subscription_id, "subscription_id", 200)
      : null,
    operation,
    current_seats: Number(row.current_seats),
    requested_seats: Number(row.requested_seats),
    resulting_seats: Number(row.resulting_seats),
    unit_price_iqd: Number(row.unit_price_iqd),
    amount_iqd: Number(row.amount_iqd),
    currency: "IQD",
    billing_period_start: timestamp(row.billing_period_start).toISOString(),
    billing_period_end: timestamp(row.billing_period_end).toISOString(),
    grace_duration_seconds: Number(row.grace_duration_seconds),
    status,
    idempotency_key: requiredText(row.idempotency_key, "idempotency_key", 200),
    provider: requiredText(row.provider, "provider", 100),
    provider_checkout_ref: row.provider_checkout_ref ? String(row.provider_checkout_ref) : null,
    provider_payment_ref: row.provider_payment_ref ? String(row.provider_payment_ref) : null,
    request_expires_at: timestamp(row.request_expires_at).toISOString(),
    paid_at: row.paid_at ? timestamp(row.paid_at).toISOString() : null,
    applied_at: row.applied_at ? timestamp(row.applied_at).toISOString() : null,
    failed_at: row.failed_at ? timestamp(row.failed_at).toISOString() : null,
    metadata,
    created_at: timestamp(row.created_at).toISOString(),
    updated_at: timestamp(row.updated_at).toISOString(),
  };
}

const ORDER_SELECT = `SELECT id, merchant_id, subscription_id, operation,
  current_seats, requested_seats, resulting_seats, unit_price_iqd, amount_iqd,
  currency, billing_period_start, billing_period_end, grace_duration_seconds, status, idempotency_key,
  provider, provider_checkout_ref, provider_payment_ref, request_expires_at,
  paid_at, applied_at, failed_at, metadata, created_at, updated_at
  FROM cashier_billing_orders`;

async function loadOrder(
  target: OperationalQueryTarget,
  orderId: string,
  lock = false,
): Promise<CashierBillingOrderRecord | null> {
  const rows = await operationalQueryRows<Record<string, unknown>>(
    target,
    `${ORDER_SELECT} WHERE id = $1 LIMIT 2${lock ? " FOR UPDATE" : ""}`,
    [orderId],
  );
  if (rows.length > 1) {
    fail("CASHIER_BILLING_ORDER_AMBIGUOUS", "cashier billing order is ambiguous", 503);
  }
  return rows[0] ? orderFromRow(rows[0]) : null;
}

async function assertApprovedMerchant(
  target: OperationalQueryTarget,
  merchantId: string,
): Promise<void> {
  const rows = await operationalQueryRows<{ status: string; account_status: string }>(
    target,
    `SELECT status::text, account_status::text
       FROM merchants
      WHERE id = $1
      LIMIT 1
      FOR UPDATE`,
    [merchantId],
  );
  if (!rows[0]) fail("MERCHANT_NOT_FOUND", "merchant not found", 404);
  if (rows[0].status !== "approved" || rows[0].account_status !== "approved") {
    fail("APPROVED_MERCHANT_REQUIRED", "approved merchant account is required", 403);
  }
}

function plannedOrder(input: {
  operation: CashierBillingOperation;
  requestedSeats: number;
  subscription: CashierSubscriptionRow | null;
  now: Date;
}): {
  subscriptionId: string | null;
  currentSeats: number;
  requestedSeats: number;
  resultingSeats: number;
  unitPriceIqd: number;
  amountIqd: number;
  periodStart: Date;
  periodEnd: Date;
  subscriptionVersion: number;
  nextFullRenewalAmountIqd: number;
} {
  const configuredPrice = cashierSeatPriceIqd();
  const configuredGrace = cashierGraceSeconds();
  void configuredGrace;
  const snapshot = evaluateCashierEntitlement(input.subscription, input.now);

  if (input.operation === "activate") {
    if (
      input.subscription &&
      input.subscription.status !== "inactive" &&
      input.subscription.status !== "cancelled"
    ) {
      fail(
        "CASHIER_SUBSCRIPTION_RENEWAL_REQUIRED",
        "existing cashier subscription must be renewed instead of activated again",
        409,
        { cashier_state: snapshot?.state || "inactive" },
      );
    }
    const start = input.now;
    const end = addCashierBillingMonth(start);
    return {
      subscriptionId: input.subscription?.id || null,
      currentSeats: 0,
      requestedSeats: input.requestedSeats,
      resultingSeats: input.requestedSeats,
      unitPriceIqd: configuredPrice,
      amountIqd: configuredPrice * input.requestedSeats,
      periodStart: start,
      periodEnd: end,
      subscriptionVersion: input.subscription ? Number(input.subscription.version) : 0,
      nextFullRenewalAmountIqd: configuredPrice * input.requestedSeats,
    };
  }

  if (!input.subscription || !snapshot) {
    fail("CASHIER_SUBSCRIPTION_NOT_FOUND", "cashier subscription does not exist", 409);
  }

  if (input.operation === "add_seats") {
    if (snapshot.state !== "active") {
      fail(
        "CASHIER_ACTIVE_SUBSCRIPTION_REQUIRED",
        "additional cashier seats require an active subscription",
        409,
        { cashier_state: snapshot.state },
      );
    }
    if (input.requestedSeats <= snapshot.licensed_seats) {
      fail(
        "CASHIER_SEAT_INCREASE_REQUIRED",
        "requested seats must be greater than current licensed seats",
        400,
      );
    }
    if (!snapshot.billing_period_start || !snapshot.billing_period_end) {
      fail("CASHIER_BILLING_STATE_INVALID", "cashier billing period is missing", 503);
    }
    const additionalSeats = input.requestedSeats - snapshot.licensed_seats;
    const periodStart = new Date(snapshot.billing_period_start);
    const periodEnd = new Date(snapshot.billing_period_end);
    const cyclePrice = snapshot.price_per_seat_iqd;
    const amountIqd = calculateCashierProrationIqd({
      unitPriceIqd: cyclePrice,
      additionalSeats,
      billingPeriodStart: periodStart,
      billingPeriodEnd: periodEnd,
      effectiveAt: input.now,
    });
    return {
      subscriptionId: snapshot.subscription_id,
      currentSeats: snapshot.licensed_seats,
      requestedSeats: input.requestedSeats,
      resultingSeats: input.requestedSeats,
      unitPriceIqd: cyclePrice,
      amountIqd,
      periodStart,
      periodEnd,
      subscriptionVersion: snapshot.version,
      nextFullRenewalAmountIqd: configuredPrice * input.requestedSeats,
    };
  }

  if (!["grace", "restricted"].includes(snapshot.state)) {
    fail(
      "CASHIER_RENEWAL_NOT_DUE",
      "cashier renewal is available after the paid billing period ends",
      409,
      { cashier_state: snapshot.state },
    );
  }
  const renewalSeats = snapshot.scheduled_licensed_seats ?? snapshot.licensed_seats;
  if (input.requestedSeats !== renewalSeats) {
    fail(
      "CASHIER_RENEWAL_SEAT_MISMATCH",
      "renewal quantity is server-authoritative",
      409,
      { authoritative_seats: renewalSeats },
    );
  }
  const oldEnd = snapshot.billing_period_end ? new Date(snapshot.billing_period_end) : input.now;
  const periodStart =
    snapshot.state === "grace" ? oldEnd : input.now;
  const periodEnd = addCashierBillingMonth(periodStart);
  return {
    subscriptionId: snapshot.subscription_id,
    currentSeats: snapshot.licensed_seats,
    requestedSeats: renewalSeats,
    resultingSeats: renewalSeats,
    unitPriceIqd: configuredPrice,
    amountIqd: configuredPrice * renewalSeats,
    periodStart,
    periodEnd,
    subscriptionVersion: snapshot.version,
    nextFullRenewalAmountIqd: configuredPrice * renewalSeats,
  };
}

export function getCashierBillingCatalog() {
  const price = cashierSeatPriceIqd();
  const grace = cashierGraceSeconds();
  return {
    currency: "IQD" as const,
    seat_price_iqd: price,
    grace_seconds: grace,
    provider: getSaasBillingProviderState(),
  };
}

export async function quoteCashierBillingChange(input: {
  merchantId: string;
  operation: CashierBillingOperation;
  requestedSeats: number;
  now?: Date;
}): Promise<{
  operation: CashierBillingOperation;
  current_seats: number;
  requested_seats: number;
  resulting_seats: number;
  unit_price_iqd: number;
  amount_iqd: number;
  currency: "IQD";
  billing_period_start: string;
  billing_period_end: string;
  subscription_version: number;
  next_full_renewal_amount_iqd: number;
  quoted_at: string;
}> {
  if (!operationalPostgresAuthorityRequired()) {
    fail(
      "CASHIER_BILLING_ENTITLEMENT_AUTHORITY_NOT_ACTIVE",
      "PostgreSQL cashier entitlement authority is required before quoting",
      503,
    );
  }
  const merchantId = requiredText(input.merchantId, "merchant_id", 200);
  const requestedSeats = positiveInt(input.requestedSeats, "requested_seats");
  const now = input.now || new Date();

  return withMerchantOperationalTransaction(merchantId, async (client) => {
    await assertApprovedMerchant(client, merchantId);
    const subscription = await loadSubscription(client, merchantId, true);
    const plan = plannedOrder({
      operation: input.operation,
      requestedSeats,
      subscription,
      now,
    });
    return {
      operation: input.operation,
      current_seats: plan.currentSeats,
      requested_seats: requestedSeats,
      resulting_seats: plan.resultingSeats,
      unit_price_iqd: plan.unitPriceIqd,
      amount_iqd: plan.amountIqd,
      currency: "IQD" as const,
      billing_period_start: plan.periodStart.toISOString(),
      billing_period_end: plan.periodEnd.toISOString(),
      subscription_version: plan.subscriptionVersion,
      next_full_renewal_amount_iqd: plan.nextFullRenewalAmountIqd,
      quoted_at: now.toISOString(),
    };
  });
}

export async function createCashierBillingCheckout(input: {
  merchantId: string;
  operation: CashierBillingOperation;
  requestedSeats: number;
  idempotencyKey: string;
  provider?: string;
  now?: Date;
  providerFetch?: SuperQiFetch;
}): Promise<{
  order: CashierBillingOrderRecord;
  duplicate: boolean;
  checkout:
    | { provider: "test_fake"; checkout_reference: string; test_only: true }
    | {
        provider: "superqi_sandbox";
        checkout_reference: string;
        redirect_url: string;
        test_only: true;
      };
  next_full_renewal_amount_iqd: number;
}> {
  if (!operationalPostgresAuthorityRequired()) {
    fail(
      "CASHIER_BILLING_ENTITLEMENT_AUTHORITY_NOT_ACTIVE",
      "PostgreSQL cashier entitlement authority is required before checkout",
      503,
    );
  }
  const merchantId = requiredText(input.merchantId, "merchant_id", 200);
  const idempotencyKey = requiredText(input.idempotencyKey, "idempotency_key", 200);
  const requestedSeats = positiveInt(input.requestedSeats, "requested_seats");
  const now = input.now || new Date();
  const provider = resolveSaasBillingCheckoutProvider(input.provider);

  return withMerchantOperationalTransaction(merchantId, async (client) => {
    await assertApprovedMerchant(client, merchantId);
    await client.query(
      `UPDATE cashier_billing_orders
          SET status = 'expired', updated_at = $2
        WHERE merchant_id = $1 AND status = 'pending' AND request_expires_at <= $2`,
      [merchantId, now],
    );

    const duplicateRows = await operationalQueryRows<Record<string, unknown>>(
      client,
      `${ORDER_SELECT}
        WHERE merchant_id = $1 AND idempotency_key = $2
        LIMIT 2
        FOR UPDATE`,
      [merchantId, idempotencyKey],
    );
    if (duplicateRows.length > 1) {
      fail("CASHIER_BILLING_ORDER_AMBIGUOUS", "cashier billing order is ambiguous", 503);
    }

    const subscription = await loadSubscription(client, merchantId, true);
    if (input.operation === "activate" && subscription?.status === "cancelled") {
      const assignmentRows = await operationalQueryRows<{ assigned: number | string }>(
        client,
        `SELECT count(*)::int AS assigned
           FROM cashier_station_seat_assignments
          WHERE merchant_id = $1
            AND subscription_id = $2
            AND status IN ('active','release_scheduled')`,
        [merchantId, subscription.id],
      );
      const assignedSeats = Number(assignmentRows[0]?.assigned || 0);
      if (requestedSeats < assignedSeats) {
        fail(
          "CASHIER_REACTIVATION_SEATS_BELOW_ASSIGNED",
          "reactivation seats cannot be lower than currently assigned cashier stations",
          409,
          { assigned_stations: assignedSeats, requested_seats: requestedSeats },
        );
      }
    }
    const plan = plannedOrder({ operation: input.operation, requestedSeats, subscription, now });

    if (duplicateRows[0]) {
      const existing = orderFromRow(duplicateRows[0]);
      if (
        existing.operation !== input.operation ||
        existing.requested_seats !== requestedSeats ||
        existing.amount_iqd !== plan.amountIqd ||
        existing.provider !== provider.provider
      ) {
        fail(
          "CASHIER_BILLING_IDEMPOTENCY_CONFLICT",
          "cashier billing idempotency key was already used for another request",
          409,
        );
      }
      if (provider.provider === "superqi_sandbox") {
        const redirectUrl = String(existing.metadata.provider_form_url || "").trim();
        if (!existing.provider_checkout_ref || !redirectUrl) {
          fail(
            "CASHIER_BILLING_PROVIDER_CHECKOUT_INCOMPLETE",
            "cashier payment checkout is incomplete; use a new idempotency key",
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
          next_full_renewal_amount_iqd: plan.nextFullRenewalAmountIqd,
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
        next_full_renewal_amount_iqd: plan.nextFullRenewalAmountIqd,
      };
    }

    const pending = await operationalQueryRows<{ id: string }>(
      client,
      `SELECT id FROM cashier_billing_orders
        WHERE merchant_id = $1 AND status = 'pending'
        LIMIT 1 FOR UPDATE`,
      [merchantId],
    );
    if (pending[0]) {
      fail(
        "CASHIER_BILLING_CHECKOUT_ALREADY_PENDING",
        "merchant already has a pending cashier billing checkout",
        409,
        { order_id: pending[0].id },
      );
    }

    const orderId = `cashier-billing-${crypto.randomUUID()}`;
    const providerRequestId =
      provider.provider === "superqi_sandbox" ? crypto.randomUUID() : null;
    const checkoutRef =
      provider.provider === "test_fake" ? `test-cashier-checkout-${crypto.randomUUID()}` : null;
    const requestExpiresAt = new Date(now.getTime() + 30 * 60 * 1000);
    const metadata: Record<string, string | number | boolean | null> = {
      subscription_version: plan.subscriptionVersion,
      next_full_renewal_amount_iqd: plan.nextFullRenewalAmountIqd,
      ...(providerRequestId ? { provider_request_id: providerRequestId } : {}),
    };

    await client.query(
      `INSERT INTO cashier_billing_orders (
         id, merchant_id, subscription_id, operation, current_seats, requested_seats,
         resulting_seats, unit_price_iqd, amount_iqd, currency, billing_period_start,
         billing_period_end, grace_duration_seconds, status, idempotency_key, provider,
         provider_checkout_ref, request_expires_at, metadata, created_at, updated_at
       ) VALUES (
         $1,$2,$3,$4,$5,$6,$7,$8,$9,'IQD',$10,$11,$12,'pending',$13,$14,$15,$16,$17::jsonb,$18,$18
       )`,
      [
        orderId,
        merchantId,
        plan.subscriptionId,
        input.operation,
        plan.currentSeats,
        requestedSeats,
        plan.resultingSeats,
        plan.unitPriceIqd,
        plan.amountIqd,
        plan.periodStart,
        plan.periodEnd,
        cashierGraceSeconds(),
        idempotencyKey,
        provider.provider,
        checkoutRef,
        requestExpiresAt,
        JSON.stringify(metadata),
        now,
      ],
    );

    if (provider.provider === "superqi_sandbox") {
      if (!providerRequestId) {
        fail("CASHIER_BILLING_PROVIDER_STATE_INVALID", "cashier provider request ID is missing", 503);
      }
      const payment = await createSuperQiSandboxPayment(
        {
          requestId: providerRequestId,
          orderId,
          amountIqd: plan.amountIqd,
        },
        input.providerFetch,
      );
      await client.query(
        `UPDATE cashier_billing_orders
            SET provider_checkout_ref = $2,
                metadata = metadata || $3::jsonb,
                updated_at = $4
          WHERE id = $1 AND merchant_id = $5`,
        [
          orderId,
          payment.paymentId,
          JSON.stringify({ provider_form_url: payment.formUrl }),
          now,
          merchantId,
        ],
      );
      const order = await loadOrder(client, orderId, true);
      if (!order) fail("CASHIER_BILLING_ORDER_NOT_FOUND", "cashier billing order not found", 503);
      return {
        order,
        duplicate: false,
        checkout: {
          provider: "superqi_sandbox" as const,
          checkout_reference: payment.paymentId,
          redirect_url: payment.formUrl,
          test_only: true as const,
        },
        next_full_renewal_amount_iqd: plan.nextFullRenewalAmountIqd,
      };
    }

    const order = await loadOrder(client, orderId, true);
    if (!order) fail("CASHIER_BILLING_ORDER_NOT_FOUND", "cashier billing order not found", 503);
    return {
      order,
      duplicate: false,
      checkout: {
        provider: "test_fake" as const,
        checkout_reference: checkoutRef || "",
        test_only: true as const,
      },
      next_full_renewal_amount_iqd: plan.nextFullRenewalAmountIqd,
    };
  });
}

export async function listMerchantCashierBillingOrders(
  merchantId: string,
): Promise<CashierBillingOrderRecord[]> {
  return withMerchantOperationalTransaction(
    requiredText(merchantId, "merchant_id", 200),
    async (client) => {
      await client.query(
        `UPDATE cashier_billing_orders
            SET status = 'expired', updated_at = now()
          WHERE merchant_id = $1 AND status = 'pending' AND request_expires_at <= now()`,
        [merchantId],
      );
      const rows = await operationalQueryRows<Record<string, unknown>>(
        client,
        `${ORDER_SELECT}
          WHERE merchant_id = $1
          ORDER BY created_at DESC, id DESC
          LIMIT 100`,
        [merchantId],
      );
      return rows.map(orderFromRow);
    },
  );
}

async function applyPaidOrder(
  target: OperationalQueryTarget,
  order: CashierBillingOrderRecord,
  paymentRef: string,
  occurredAt: Date,
): Promise<{ subscriptionId: string; version: number }> {
  let subscription = await loadSubscription(target, order.merchant_id, true);
  const expectedVersion = Number(order.metadata.subscription_version ?? 0);
  const existingApplication = await operationalQueryRows<{ subscription_id: string; resulting_version: number | string }>(
    target,
    `SELECT subscription_id, resulting_version
       FROM cashier_entitlement_applications
      WHERE order_id = $1 AND merchant_id = $2
      LIMIT 1`,
    [order.id, order.merchant_id],
  );
  if (existingApplication[0]) {
    return {
      subscriptionId: existingApplication[0].subscription_id,
      version: Number(existingApplication[0].resulting_version),
    };
  }

  const graceSeconds = cashierGraceSeconds();
  const configuredPrice = cashierSeatPriceIqd();
  let previousSeats = subscription ? Number(subscription.licensed_seats) : 0;
  let previousVersion = subscription ? Number(subscription.version) : 0;
  let subscriptionId = subscription?.id || `cashier-subscription-${crypto.randomUUID()}`;
  let resultingVersion = previousVersion + 1;

  if (order.operation === "activate") {
    if (subscription && previousVersion !== expectedVersion) {
      fail(
        "CASHIER_SUBSCRIPTION_VERSION_CONFLICT",
        "cashier subscription changed before payment was applied",
        409,
      );
    }
    if (!subscription) {
      await target.query(
        `INSERT INTO merchant_cashier_subscriptions (
           id, merchant_id, status, licensed_seats, price_per_seat_iqd,
           billing_period_start, billing_period_end, grace_duration_seconds,
           version, created_at, updated_at
         ) VALUES ($1,$2,'active',$3,$4,$5,$6,$7,1,$8,$8)`,
        [
          subscriptionId,
          order.merchant_id,
          order.resulting_seats,
          order.unit_price_iqd,
          new Date(order.billing_period_start),
          new Date(order.billing_period_end),
          graceSeconds,
          occurredAt,
        ],
      );
      resultingVersion = 1;
      previousVersion = 0;
    } else {
      const rows = await operationalQueryRows<{ version: number | string }>(
        target,
        `UPDATE merchant_cashier_subscriptions
            SET status = 'active',
                licensed_seats = $3,
                price_per_seat_iqd = $4,
                billing_period_start = $5,
                billing_period_end = $6,
                grace_duration_seconds = $7,
                scheduled_licensed_seats = NULL,
                scheduled_change_at = NULL,
                version = version + 1,
                updated_at = $8
          WHERE merchant_id = $1 AND id = $2 AND version = $9
          RETURNING version`,
        [
          order.merchant_id,
          subscriptionId,
          order.resulting_seats,
          order.unit_price_iqd,
          new Date(order.billing_period_start),
          new Date(order.billing_period_end),
          graceSeconds,
          occurredAt,
          expectedVersion,
        ],
      );
      if (rows.length !== 1) fail("CASHIER_SUBSCRIPTION_VERSION_CONFLICT", "cashier subscription changed concurrently", 409);
      resultingVersion = Number(rows[0].version);
    }
  } else {
    if (!subscription) fail("CASHIER_SUBSCRIPTION_NOT_FOUND", "cashier subscription not found", 409);
    if (previousVersion !== expectedVersion) {
      fail(
        "CASHIER_SUBSCRIPTION_VERSION_CONFLICT",
        "cashier subscription changed before payment was applied",
        409,
        { current_version: previousVersion, expected_version: expectedVersion },
      );
    }
    const snapshot = evaluateCashierEntitlement(subscription, occurredAt);
    if (!snapshot) fail("CASHIER_SUBSCRIPTION_NOT_FOUND", "cashier subscription not found", 409);

    if (order.operation === "add_seats") {
      if (snapshot.state !== "active") {
        fail(
          "CASHIER_ADD_SEATS_STATE_CHANGED",
          "cashier subscription is no longer active; paid order requires reconciliation",
          409,
          { cashier_state: snapshot.state },
        );
      }
      if (
        snapshot.licensed_seats !== order.current_seats ||
        snapshot.billing_period_start !== order.billing_period_start ||
        snapshot.billing_period_end !== order.billing_period_end
      ) {
        fail(
          "CASHIER_ADD_SEATS_AUTHORITY_CHANGED",
          "cashier subscription changed before seat payment was applied",
          409,
        );
      }
      const rows = await operationalQueryRows<{ version: number | string }>(
        target,
        `UPDATE merchant_cashier_subscriptions
            SET licensed_seats = $3,
                version = version + 1,
                updated_at = $4
          WHERE merchant_id = $1 AND id = $2 AND version = $5
          RETURNING version`,
        [order.merchant_id, subscriptionId, order.resulting_seats, occurredAt, expectedVersion],
      );
      if (rows.length !== 1) fail("CASHIER_SUBSCRIPTION_VERSION_CONFLICT", "cashier subscription changed concurrently", 409);
      resultingVersion = Number(rows[0].version);
    } else {
      if (!["grace", "restricted"].includes(snapshot.state)) {
        fail(
          "CASHIER_RENEWAL_STATE_CHANGED",
          "cashier subscription is no longer eligible for this renewal",
          409,
          { cashier_state: snapshot.state },
        );
      }
      const renewalSeats = snapshot.scheduled_licensed_seats ?? snapshot.licensed_seats;
      if (renewalSeats !== order.resulting_seats) {
        fail(
          "CASHIER_RENEWAL_SEAT_AUTHORITY_CHANGED",
          "cashier renewal quantity changed before payment was applied",
          409,
        );
      }
      await target.query(
        `UPDATE cashier_station_seat_assignments
            SET status = 'released', released_at = $3, updated_at = $3
          WHERE merchant_id = $1 AND subscription_id = $2
            AND status = 'release_scheduled'`,
        [order.merchant_id, subscriptionId, occurredAt],
      );
      const rows = await operationalQueryRows<{ version: number | string }>(
        target,
        `UPDATE merchant_cashier_subscriptions
            SET status = 'active',
                licensed_seats = $3,
                price_per_seat_iqd = $4,
                billing_period_start = $5,
                billing_period_end = $6,
                grace_duration_seconds = $7,
                scheduled_licensed_seats = NULL,
                scheduled_change_at = NULL,
                version = version + 1,
                updated_at = $8
          WHERE merchant_id = $1 AND id = $2 AND version = $9
          RETURNING version`,
        [
          order.merchant_id,
          subscriptionId,
          order.resulting_seats,
          configuredPrice,
          new Date(order.billing_period_start),
          new Date(order.billing_period_end),
          graceSeconds,
          occurredAt,
          expectedVersion,
        ],
      );
      if (rows.length !== 1) fail("CASHIER_SUBSCRIPTION_VERSION_CONFLICT", "cashier subscription changed concurrently", 409);
      resultingVersion = Number(rows[0].version);
    }
  }

  await target.query(
    `INSERT INTO cashier_entitlement_applications (
       id, merchant_id, subscription_id, order_id, operation, previous_seats,
       resulting_seats, previous_version, resulting_version, amount_iqd,
       provider, provider_payment_ref, applied_at
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
    [
      `cashier-entitlement-${crypto.randomUUID()}`,
      order.merchant_id,
      subscriptionId,
      order.id,
      order.operation,
      previousSeats,
      order.resulting_seats,
      previousVersion,
      resultingVersion,
      order.amount_iqd,
      order.provider,
      paymentRef,
      occurredAt,
    ],
  );
  await target.query(
    `INSERT INTO cashier_entitlement_audit_events (
       id, merchant_id, subscription_id, action, actor_type, actor_ref,
       from_seats, to_seats, from_version, to_version, metadata, created_at
     ) VALUES ($1,$2,$3,$4,'payment_webhook',$5,$6,$7,$8,$9,$10::jsonb,$11)`,
    [
      `cashier_audit_${crypto.randomUUID()}`,
      order.merchant_id,
      subscriptionId,
      order.operation,
      paymentRef,
      previousSeats,
      order.resulting_seats,
      previousVersion,
      resultingVersion,
      JSON.stringify({ billing_order_id: order.id }),
      occurredAt,
    ],
  );
  return { subscriptionId, version: resultingVersion };
}

export async function applyVerifiedCashierBillingProviderEvent(
  input: VerifiedCashierBillingProviderEvent,
): Promise<{
  status: "applied" | "duplicate" | "failed" | "cancelled" | "reconciliation_required";
  order: CashierBillingOrderRecord;
  subscriptionId?: string;
  reasonCode?: string;
}> {
  const providerState = getSaasBillingProviderState(input.provider);
  const providerAllowed =
    providerState.checkout_available &&
    ((input.provider === "test_fake" && process.env.NODE_ENV === "test") ||
      (input.provider === "superqi_sandbox" &&
        process.env.NODE_ENV !== "production" &&
        providerState.provider === "superqi_sandbox"));
  if (!providerAllowed) {
    fail("CASHIER_BILLING_PROVIDER_EVENT_UNAVAILABLE", "cashier billing provider event is unavailable", 503);
  }
  if (input.signatureVerified !== true) {
    fail("CASHIER_BILLING_SIGNATURE_INVALID", "cashier billing signature is invalid", 401);
  }
  if (input.currency !== "IQD") {
    fail("CASHIER_BILLING_CURRENCY_MISMATCH", "cashier billing currency mismatch", 409);
  }
  positiveInt(input.amountIqd, "amount_iqd");
  const orderId = requiredText(input.orderId, "order_id", 200);
  const eventId = requiredText(input.providerEventId, "provider_event_id", 300);
  const paymentRef = input.providerPaymentRef
    ? requiredText(input.providerPaymentRef, "provider_payment_ref", 300)
    : "";

  const pool = await operationalDatabasePool();
  const discovery = await operationalQueryRows<{ merchant_id: string }>(
    pool,
    `SELECT merchant_id FROM cashier_billing_orders WHERE id = $1 LIMIT 2`,
    [orderId],
  );
  if (discovery.length !== 1) {
    fail("CASHIER_BILLING_ORDER_NOT_FOUND", "cashier billing order not found", 404);
  }
  const merchantId = discovery[0].merchant_id;

  return withMerchantOperationalTransaction(merchantId, async (client) => {
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
      `${input.provider}:${eventId}`,
    ]);
    const duplicate = await operationalQueryRows<{ order_id: string }>(
      client,
      `SELECT order_id
         FROM cashier_billing_events
        WHERE provider = $1 AND provider_event_id = $2
        LIMIT 1`,
      [input.provider, eventId],
    );
    if (duplicate[0]) {
      if (duplicate[0].order_id !== orderId) {
        fail("CASHIER_BILLING_PROVIDER_EVENT_COLLISION", "provider event was reused for another order", 409);
      }
      const order = await loadOrder(client, orderId, true);
      if (!order) fail("CASHIER_BILLING_ORDER_NOT_FOUND", "cashier billing order not found", 404);
      const application = await operationalQueryRows<{ subscription_id: string }>(
        client,
        `SELECT subscription_id FROM cashier_entitlement_applications
          WHERE order_id = $1 AND merchant_id = $2 LIMIT 1`,
        [orderId, merchantId],
      );
      return {
        status: "duplicate" as const,
        order,
        ...(application[0] ? { subscriptionId: application[0].subscription_id } : {}),
      };
    }

    const order = await loadOrder(client, orderId, true);
    if (!order) fail("CASHIER_BILLING_ORDER_NOT_FOUND", "cashier billing order not found", 404);
    if (order.provider !== input.provider) {
      fail("CASHIER_BILLING_PROVIDER_MISMATCH", "cashier billing provider mismatch", 409);
    }

    const eventRecord = async (
      status: "applied" | "rejected",
      appliedAt: Date | null,
    ) => {
      await client.query(
        `INSERT INTO cashier_billing_events (
           id, merchant_id, order_id, provider, provider_event_id, event_type,
           payload_hash, status, occurred_at, applied_at, created_at
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
        [
          `cashier-billing-event-${crypto.randomUUID()}`,
          merchantId,
          orderId,
          input.provider,
          eventId,
          input.eventType,
          requiredText(input.payloadHash, "payload_hash", 128),
          status,
          input.occurredAt,
          appliedAt,
          new Date(),
        ],
      );
    };

    if (input.eventType === "payment_failed" || input.eventType === "payment_cancelled") {
      if (order.status !== "pending") {
        fail("CASHIER_BILLING_ORDER_NOT_PAYABLE", "cashier billing order is not payable", 409);
      }
      const status = input.eventType === "payment_failed" ? "failed" : "cancelled";
      await client.query(
        `UPDATE cashier_billing_orders
            SET status = $2,
                failed_at = CASE WHEN $2 = 'failed' THEN $3 ELSE failed_at END,
                updated_at = $3
          WHERE id = $1 AND merchant_id = $4`,
        [order.id, status, input.occurredAt, merchantId],
      );
      await eventRecord("applied", input.occurredAt);
      const updated = await loadOrder(client, order.id, true);
      if (!updated) fail("CASHIER_BILLING_ORDER_NOT_FOUND", "cashier billing order not found", 503);
      return { status: status as "failed" | "cancelled", order: updated };
    }

    if (!paymentRef) {
      fail("CASHIER_BILLING_PAYMENT_REFERENCE_REQUIRED", "cashier billing payment reference is required", 409);
    }
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
      `${input.provider}:cashier-payment:${paymentRef}`,
    ]);
    const paymentRefCollision = await operationalQueryRows<{ id: string }>(
      client,
      `SELECT id
         FROM cashier_billing_orders
        WHERE provider = $1
          AND provider_payment_ref = $2
          AND id <> $3
        LIMIT 1`,
      [input.provider, paymentRef, order.id],
    );
    if (paymentRefCollision[0]) {
      fail(
        "CASHIER_BILLING_PAYMENT_REPLAY",
        "cashier payment reference was already used by another billing order",
        409,
        { existing_order_id: paymentRefCollision[0].id },
      );
    }
    if (input.amountIqd !== order.amount_iqd) {
      await client.query(
        `UPDATE cashier_billing_orders
            SET status = 'paid_reconciliation_required',
                provider_payment_ref = $2,
                paid_at = $3,
                updated_at = $3,
                metadata = metadata || $4::jsonb
          WHERE id = $1 AND merchant_id = $5`,
        [
          order.id,
          paymentRef,
          input.occurredAt,
          JSON.stringify({
            reconciliation_code: "CASHIER_BILLING_AMOUNT_MISMATCH",
            received_amount_iqd: input.amountIqd,
          }),
          merchantId,
        ],
      );
      await eventRecord("rejected", null);
      const updated = await loadOrder(client, order.id, true);
      if (!updated) fail("CASHIER_BILLING_ORDER_NOT_FOUND", "cashier billing order not found", 503);
      return {
        status: "reconciliation_required" as const,
        order: updated,
        reasonCode: "CASHIER_BILLING_AMOUNT_MISMATCH",
      };
    }
    if (order.status === "applied") {
      return { status: "duplicate" as const, order };
    }
    if (order.status !== "pending") {
      fail("CASHIER_BILLING_ORDER_NOT_PAYABLE", "cashier billing order is not payable", 409);
    }
    if (timestamp(order.request_expires_at).getTime() < input.occurredAt.getTime()) {
      await client.query(
        `UPDATE cashier_billing_orders
            SET status = 'paid_reconciliation_required',
                provider_payment_ref = $2,
                paid_at = $3,
                updated_at = $3
          WHERE id = $1 AND merchant_id = $4`,
        [order.id, paymentRef, input.occurredAt, merchantId],
      );
      await eventRecord("rejected", null);
      const updated = await loadOrder(client, order.id, true);
      if (!updated) fail("CASHIER_BILLING_ORDER_NOT_FOUND", "cashier billing order not found", 503);
      return {
        status: "reconciliation_required",
        order: updated,
        reasonCode: "CASHIER_BILLING_ORDER_EXPIRED_AFTER_PAYMENT",
      };
    }

    try {
      const applied = await applyPaidOrder(client, order, paymentRef, input.occurredAt);
      await client.query(
        `UPDATE cashier_billing_orders
            SET status = 'applied',
                provider_payment_ref = $2,
                paid_at = $3,
                applied_at = $3,
                updated_at = $3
          WHERE id = $1 AND merchant_id = $4`,
        [order.id, paymentRef, input.occurredAt, merchantId],
      );
      await eventRecord("applied", input.occurredAt);
      const updated = await loadOrder(client, order.id, true);
      if (!updated) fail("CASHIER_BILLING_ORDER_NOT_FOUND", "cashier billing order not found", 503);
      return {
        status: "applied" as const,
        order: updated,
        subscriptionId: applied.subscriptionId,
      };
    } catch (error) {
      if (!(error instanceof CashierBillingAuthorityError)) throw error;
      await client.query(
        `UPDATE cashier_billing_orders
            SET status = 'paid_reconciliation_required',
                provider_payment_ref = $2,
                paid_at = $3,
                updated_at = $3,
                metadata = metadata || $4::jsonb
          WHERE id = $1 AND merchant_id = $5`,
        [
          order.id,
          paymentRef,
          input.occurredAt,
          JSON.stringify({ reconciliation_code: error.code }),
          merchantId,
        ],
      );
      await eventRecord("rejected", null);
      const updated = await loadOrder(client, order.id, true);
      if (!updated) fail("CASHIER_BILLING_ORDER_NOT_FOUND", "cashier billing order not found", 503);
      return {
        status: "reconciliation_required" as const,
        order: updated,
        reasonCode: error.code,
      };
    }
  });
}

export async function discoverCashierBillingOrderByProviderReference(input: {
  provider: string;
  paymentId: string;
  requestId: string;
}): Promise<{ id: string; amount_iqd: number } | null> {
  const database = await operationalDatabasePool();
  const rows = await operationalQueryRows<{ id: string; amount_iqd: number | string }>(
    database,
    `SELECT id, amount_iqd
       FROM cashier_billing_orders
      WHERE provider = $1
        AND (
          provider_checkout_ref = $2 OR
          metadata->>'provider_request_id' = $3
        )
      ORDER BY created_at DESC
      LIMIT 2`,
    [input.provider, input.paymentId, input.requestId],
  );
  if (rows.length > 1) {
    fail("CASHIER_BILLING_ORDER_AMBIGUOUS", "provider payment maps to multiple cashier orders", 503);
  }
  return rows[0]
    ? { id: rows[0].id, amount_iqd: Number(rows[0].amount_iqd) }
    : null;
}
