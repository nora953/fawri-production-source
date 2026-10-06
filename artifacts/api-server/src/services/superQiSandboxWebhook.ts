import crypto from "node:crypto";
import { pool } from "@workspace/db";
import {
  applyVerifiedSaasBillingProviderEvent,
  type SaasBillingApplicationOutcome,
} from "./saasBillingAuthority";
import {
  applyVerifiedCashierBillingProviderEvent,
  discoverCashierBillingOrderByProviderReference,
} from "./cashierBillingAuthority";
import {
  getSuperQiSandboxPaymentStatus,
  getSuperQiSandboxPublicState,
  SUPERQI_SANDBOX_PROVIDER,
  SuperQiSandboxProviderError,
  type SuperQiFetch,
  type SuperQiWebhookPayload,
  superQiWebhookPayloadHash,
  verifySuperQiSandboxWebhookSignature,
} from "./superQiSandboxTransport";

type CashierBillingOutcome = Awaited<
  ReturnType<typeof applyVerifiedCashierBillingProviderEvent>
>;

export type SuperQiSandboxWebhookResult =
  | { status: "ignored"; reason: "non_terminal" | "order_not_found" }
  | {
      status: "processed";
      authority: "bot_subscription" | "cashier_subscription";
      outcome: SaasBillingApplicationOutcome | CashierBillingOutcome;
    };

function required(value: unknown, max = 300): string {
  const normalized = String(value ?? "").trim();
  if (!normalized || normalized.length > max) {
    throw new SuperQiSandboxProviderError(
      "SUPERQI_SANDBOX_WEBHOOK_INVALID",
      "SuperQi sandbox webhook payload is invalid",
      400,
    );
  }
  return normalized;
}

function amount(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0 || !Number.isSafeInteger(parsed)) {
    throw new SuperQiSandboxProviderError(
      "SUPERQI_SANDBOX_WEBHOOK_AMOUNT_INVALID",
      "SuperQi sandbox webhook amount must be a whole IQD amount",
      409,
    );
  }
  return parsed;
}

type BillingOrderMatch = {
  authority: "bot_subscription" | "cashier_subscription";
  id: string;
  amount_iqd: number;
};

async function findBillingOrder(input: {
  paymentId: string;
  requestId: string;
}): Promise<BillingOrderMatch | null> {
  const saasResult = await pool.query(
    `SELECT id, amount_iqd
       FROM saas_billing_orders
      WHERE provider = $1
        AND (
          provider_checkout_ref = $2 OR
          metadata->>'provider_request_id' = $3
        )
      ORDER BY created_at DESC
      LIMIT 2`,
    [SUPERQI_SANDBOX_PROVIDER, input.paymentId, input.requestId],
  );
  if (saasResult.rows.length > 1) {
    throw new SuperQiSandboxProviderError(
      "SUPERQI_SANDBOX_ORDER_AMBIGUOUS",
      "SuperQi sandbox payment maps to more than one Fawri SaaS billing order",
      503,
    );
  }

  const cashier = await discoverCashierBillingOrderByProviderReference({
    provider: SUPERQI_SANDBOX_PROVIDER,
    paymentId: input.paymentId,
    requestId: input.requestId,
  });

  if (saasResult.rows[0] && cashier) {
    throw new SuperQiSandboxProviderError(
      "SUPERQI_SANDBOX_ORDER_AUTHORITY_COLLISION",
      "SuperQi sandbox payment maps to more than one Fawri billing authority",
      503,
    );
  }
  if (saasResult.rows[0]) {
    return {
      authority: "bot_subscription",
      id: required(saasResult.rows[0].id, 180),
      amount_iqd: amount(saasResult.rows[0].amount_iqd),
    };
  }
  if (cashier) {
    return {
      authority: "cashier_subscription",
      id: required(cashier.id, 180),
      amount_iqd: amount(cashier.amount_iqd),
    };
  }
  return null;
}

async function attachProviderPaymentReference(
  order: BillingOrderMatch,
  paymentId: string,
): Promise<void> {
  const table =
    order.authority === "cashier_subscription"
      ? "cashier_billing_orders"
      : "saas_billing_orders";

  const collision = await pool.query(
    `SELECT id
       FROM ${table}
      WHERE provider = $1
        AND provider_checkout_ref = $2
        AND id <> $3
      LIMIT 1`,
    [SUPERQI_SANDBOX_PROVIDER, paymentId, order.id],
  );
  if (collision.rows.length > 0) {
    throw new SuperQiSandboxProviderError(
      "SUPERQI_SANDBOX_PAYMENT_COLLISION",
      "SuperQi sandbox payment reference is already attached to another billing order",
      409,
    );
  }
  const updated = await pool.query(
    `UPDATE ${table}
        SET provider_checkout_ref = $2,
            updated_at = NOW()
      WHERE id = $1
        AND provider = $3
        AND (provider_checkout_ref IS NULL OR provider_checkout_ref = $2)
      RETURNING id`,
    [order.id, paymentId, SUPERQI_SANDBOX_PROVIDER],
  );
  if (updated.rows.length !== 1) {
    throw new SuperQiSandboxProviderError(
      "SUPERQI_SANDBOX_ORDER_REFERENCE_CONFLICT",
      "SuperQi sandbox billing order reference cannot be changed",
      409,
    );
  }
}

function providerEventId(input: {
  paymentId: string;
  status: string;
  canceled: boolean;
  creationDate: string;
}): string {
  return `superqi-${crypto
    .createHash("sha256")
    .update(
      `${input.paymentId}|${input.status}|${input.canceled ? "1" : "0"}|${input.creationDate}`,
      "utf8",
    )
    .digest("hex")}`;
}

export async function handleSuperQiSandboxWebhook(input: {
  payload: SuperQiWebhookPayload;
  signature: string;
  receivedAt?: Date;
  fetchImpl?: SuperQiFetch;
}): Promise<SuperQiSandboxWebhookResult> {
  const readiness = getSuperQiSandboxPublicState();
  if (!readiness.checkout_available) {
    throw new SuperQiSandboxProviderError(
      "SUPERQI_SANDBOX_DISABLED",
      "SuperQi sandbox provider is not available",
      503,
    );
  }
  if (!verifySuperQiSandboxWebhookSignature(input.payload, input.signature)) {
    throw new SuperQiSandboxProviderError(
      "SUPERQI_SANDBOX_SIGNATURE_INVALID",
      "SuperQi sandbox webhook signature is invalid",
      401,
    );
  }

  const paymentId = required(input.payload.paymentId, 300);
  const webhookStatus = required(input.payload.status, 80);
  const webhookCurrency = required(input.payload.currency, 3);
  const webhookAmount = amount(input.payload.amount);
  const webhookCanceled = input.payload.canceled === true;

  if (webhookCurrency !== "IQD") {
    throw new SuperQiSandboxProviderError(
      "SUPERQI_SANDBOX_CURRENCY_MISMATCH",
      "SuperQi sandbox webhook currency is not IQD",
      409,
    );
  }
  if (webhookStatus === "CREATED" && !webhookCanceled) {
    return { status: "ignored", reason: "non_terminal" };
  }
  if (!["SUCCESS", "FAILED", "AUTHENTICATION_FAILED", "CREATED"].includes(webhookStatus)) {
    throw new SuperQiSandboxProviderError(
      "SUPERQI_SANDBOX_STATUS_INVALID",
      "SuperQi sandbox webhook status is unsupported",
      409,
    );
  }

  const confirmed = await getSuperQiSandboxPaymentStatus(paymentId, input.fetchImpl);
  if (
    confirmed.paymentId !== paymentId ||
    confirmed.status !== webhookStatus ||
    confirmed.canceled !== webhookCanceled ||
    confirmed.currency !== "IQD" ||
    confirmed.amount !== webhookAmount
  ) {
    throw new SuperQiSandboxProviderError(
      "SUPERQI_SANDBOX_WEBHOOK_STATUS_MISMATCH",
      "SuperQi sandbox webhook does not match the confirmed gateway payment status",
      409,
    );
  }
  const webhookRequestId = String(input.payload.requestId ?? "").trim();
  if (webhookRequestId && webhookRequestId !== confirmed.requestId) {
    throw new SuperQiSandboxProviderError(
      "SUPERQI_SANDBOX_REQUEST_ID_MISMATCH",
      "SuperQi sandbox webhook request ID does not match the confirmed payment",
      409,
    );
  }

  const order = await findBillingOrder({
    paymentId: confirmed.paymentId,
    requestId: confirmed.requestId,
  });
  if (!order) {
    return { status: "ignored", reason: "order_not_found" };
  }
  await attachProviderPaymentReference(order, confirmed.paymentId);

  const settledAmount = confirmed.confirmedAmount ?? confirmed.amount;
  const eventType = confirmed.canceled
    ? "payment_cancelled"
    : confirmed.status === "SUCCESS"
      ? "payment_succeeded"
      : "payment_failed";
  const commonEvent = {
    provider: SUPERQI_SANDBOX_PROVIDER,
    providerEventId: providerEventId(confirmed),
    orderId: order.id,
    eventType,
    signatureVerified: true as const,
    payloadHash: superQiWebhookPayloadHash(input.payload),
    occurredAt: input.receivedAt || new Date(),
    amountIqd: amount(settledAmount),
    currency: "IQD" as const,
    providerPaymentRef: confirmed.paymentId,
    ...(eventType === "payment_failed" ? { reasonCode: confirmed.status } : {}),
  };

  const outcome =
    order.authority === "cashier_subscription"
      ? await applyVerifiedCashierBillingProviderEvent(commonEvent)
      : await applyVerifiedSaasBillingProviderEvent(commonEvent);

  return {
    status: "processed",
    authority: order.authority,
    outcome,
  };
}
