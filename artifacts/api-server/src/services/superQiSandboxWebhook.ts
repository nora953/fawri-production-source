import crypto from "node:crypto";
import { pool } from "@workspace/db";
import {
  applyVerifiedSaasBillingProviderEvent,
  type SaasBillingApplicationOutcome,
} from "./saasBillingAuthority";
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

export type SuperQiSandboxWebhookResult =
  | { status: "ignored"; reason: "non_terminal" | "order_not_found" }
  | { status: "processed"; outcome: SaasBillingApplicationOutcome };

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

async function findBillingOrder(input: {
  paymentId: string;
  requestId: string;
}): Promise<{ id: string; amount_iqd: number } | null> {
  const result = await pool.query(
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
  if (result.rows.length > 1) {
    throw new SuperQiSandboxProviderError(
      "SUPERQI_SANDBOX_ORDER_AMBIGUOUS",
      "SuperQi sandbox payment maps to more than one Fawri billing order",
      503,
    );
  }
  if (!result.rows[0]) return null;
  return {
    id: required(result.rows[0].id, 180),
    amount_iqd: amount(result.rows[0].amount_iqd),
  };
}

async function attachProviderPaymentReference(orderId: string, paymentId: string): Promise<void> {
  const collision = await pool.query(
    `SELECT id
       FROM saas_billing_orders
      WHERE provider = $1
        AND provider_checkout_ref = $2
        AND id <> $3
      LIMIT 1`,
    [SUPERQI_SANDBOX_PROVIDER, paymentId, orderId],
  );
  if (collision.rows.length > 0) {
    throw new SuperQiSandboxProviderError(
      "SUPERQI_SANDBOX_PAYMENT_COLLISION",
      "SuperQi sandbox payment reference is already attached to another billing order",
      409,
    );
  }
  const updated = await pool.query(
    `UPDATE saas_billing_orders
        SET provider_checkout_ref = $2,
            updated_at = NOW()
      WHERE id = $1
        AND provider = $3
        AND (provider_checkout_ref IS NULL OR provider_checkout_ref = $2)
      RETURNING id`,
    [orderId, paymentId, SUPERQI_SANDBOX_PROVIDER],
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
  await attachProviderPaymentReference(order.id, confirmed.paymentId);

  const settledAmount = confirmed.confirmedAmount ?? confirmed.amount;
  const eventType = confirmed.canceled
    ? "payment_cancelled"
    : confirmed.status === "SUCCESS"
      ? "payment_succeeded"
      : "payment_failed";

  const outcome = await applyVerifiedSaasBillingProviderEvent({
    provider: SUPERQI_SANDBOX_PROVIDER,
    providerEventId: providerEventId(confirmed),
    orderId: order.id,
    eventType,
    signatureVerified: true,
    payloadHash: superQiWebhookPayloadHash(input.payload),
    occurredAt: input.receivedAt || new Date(),
    amountIqd: amount(settledAmount),
    currency: "IQD",
    providerPaymentRef: confirmed.paymentId,
    ...(eventType === "payment_failed"
      ? { reasonCode: confirmed.status }
      : {}),
  });

  return { status: "processed", outcome };
}
