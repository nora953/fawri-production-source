import crypto from "node:crypto";

export const SUPERQI_SANDBOX_API_BASE_URL =
  "https://uat-sandbox-3ds-api.qi.iq/api/v1";
export const SUPERQI_SANDBOX_PROVIDER = "superqi_sandbox" as const;

const ENV = {
  enabled: "FAWRI_SUPERQI_SANDBOX_ENABLED",
  username: "FAWRI_SUPERQI_SANDBOX_USERNAME",
  password: "FAWRI_SUPERQI_SANDBOX_PASSWORD",
  terminalId: "FAWRI_SUPERQI_SANDBOX_TERMINAL_ID",
  notificationUrl: "FAWRI_SUPERQI_SANDBOX_NOTIFICATION_URL",
  finishUrl: "FAWRI_SUPERQI_SANDBOX_FINISH_URL",
  webhookPublicKeyB64: "FAWRI_SUPERQI_SANDBOX_WEBHOOK_PUBLIC_KEY_B64",
} as const;

export type SuperQiSandboxPublicState = {
  configured: boolean;
  checkout_available: boolean;
  production_ready: false;
  reason:
    | null
    | "disabled"
    | "production_forbidden"
    | "configuration_incomplete"
    | "callback_url_invalid"
    | "webhook_key_invalid";
};

type SuperQiSandboxConfig = {
  username: string;
  password: string;
  terminalId: string;
  notificationUrl: string;
  finishUrl: string;
  webhookPublicKeyPem: string;
};

export type SuperQiHttpResponse = {
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
};

export type SuperQiFetch = (
  url: string,
  init?: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
  },
) => Promise<SuperQiHttpResponse>;

export type SuperQiPaymentStatus = {
  requestId: string;
  paymentId: string;
  status: "CREATED" | "SUCCESS" | "FAILED" | "AUTHENTICATION_FAILED";
  canceled: boolean;
  amount: number;
  confirmedAmount: number | null;
  currency: "IQD";
  creationDate: string;
  formUrl: string | null;
};

export type SuperQiWebhookPayload = {
  requestId?: unknown;
  paymentId?: unknown;
  status?: unknown;
  canceled?: unknown;
  amount?: unknown;
  confirmedAmount?: unknown;
  currency?: unknown;
  creationDate?: unknown;
  details?: unknown;
};

export class SuperQiSandboxProviderError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, message: string, status = 503) {
    super(message);
    this.name = "SuperQiSandboxProviderError";
    this.code = code;
    this.status = status;
  }
}

function required(value: unknown, max = 2048): string {
  const normalized = String(value ?? "").trim();
  if (!normalized || normalized.length > max) {
    throw new SuperQiSandboxProviderError(
      "SUPERQI_SANDBOX_CONFIGURATION_INVALID",
      "SuperQi sandbox configuration is invalid",
    );
  }
  return normalized;
}

function positiveAmount(value: unknown): number {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new SuperQiSandboxProviderError(
      "SUPERQI_SANDBOX_AMOUNT_INVALID",
      "SuperQi sandbox amount is invalid",
      400,
    );
  }
  return amount;
}

function callbackUrl(value: unknown): string {
  const raw = required(value, 1024);
  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== "https:" || parsed.username || parsed.password) {
      throw new Error("invalid callback URL");
    }
    return parsed.toString();
  } catch {
    throw new SuperQiSandboxProviderError(
      "SUPERQI_SANDBOX_CALLBACK_URL_INVALID",
      "SuperQi sandbox callback URL must be HTTPS",
    );
  }
}

function decodePublicKey(value: unknown): string {
  try {
    const pem = Buffer.from(required(value, 20_000), "base64").toString("utf8").trim();
    if (!pem.includes("BEGIN PUBLIC KEY") && !pem.includes("BEGIN RSA PUBLIC KEY")) {
      throw new Error("not a PEM public key");
    }
    crypto.createPublicKey(pem);
    return pem;
  } catch (error) {
    if (error instanceof SuperQiSandboxProviderError) throw error;
    throw new SuperQiSandboxProviderError(
      "SUPERQI_SANDBOX_WEBHOOK_KEY_INVALID",
      "SuperQi sandbox webhook verification key is invalid",
    );
  }
}

function loadConfig(env: NodeJS.ProcessEnv = process.env): SuperQiSandboxConfig {
  if (env.NODE_ENV === "production") {
    throw new SuperQiSandboxProviderError(
      "SUPERQI_SANDBOX_PRODUCTION_FORBIDDEN",
      "SuperQi sandbox provider cannot run in production",
    );
  }
  if (String(env[ENV.enabled] || "").trim() !== "1") {
    throw new SuperQiSandboxProviderError(
      "SUPERQI_SANDBOX_DISABLED",
      "SuperQi sandbox provider is disabled",
    );
  }
  return {
    username: required(env[ENV.username], 300),
    password: required(env[ENV.password], 1000),
    terminalId: required(env[ENV.terminalId], 200),
    notificationUrl: callbackUrl(env[ENV.notificationUrl]),
    finishUrl: callbackUrl(env[ENV.finishUrl]),
    webhookPublicKeyPem: decodePublicKey(env[ENV.webhookPublicKeyB64]),
  };
}

export function getSuperQiSandboxPublicState(
  env: NodeJS.ProcessEnv = process.env,
): SuperQiSandboxPublicState {
  if (env.NODE_ENV === "production") {
    return {
      configured: false,
      checkout_available: false,
      production_ready: false,
      reason: "production_forbidden",
    };
  }
  if (String(env[ENV.enabled] || "").trim() !== "1") {
    return {
      configured: false,
      checkout_available: false,
      production_ready: false,
      reason: "disabled",
    };
  }
  const requiredValues = [
    env[ENV.username],
    env[ENV.password],
    env[ENV.terminalId],
    env[ENV.notificationUrl],
    env[ENV.finishUrl],
    env[ENV.webhookPublicKeyB64],
  ];
  if (requiredValues.some((value) => !String(value || "").trim())) {
    return {
      configured: false,
      checkout_available: false,
      production_ready: false,
      reason: "configuration_incomplete",
    };
  }
  try {
    callbackUrl(env[ENV.notificationUrl]);
    callbackUrl(env[ENV.finishUrl]);
  } catch {
    return {
      configured: false,
      checkout_available: false,
      production_ready: false,
      reason: "callback_url_invalid",
    };
  }
  try {
    decodePublicKey(env[ENV.webhookPublicKeyB64]);
  } catch {
    return {
      configured: false,
      checkout_available: false,
      production_ready: false,
      reason: "webhook_key_invalid",
    };
  }
  return {
    configured: true,
    checkout_available: true,
    production_ready: false,
    reason: null,
  };
}

function basicAuthorization(config: SuperQiSandboxConfig): string {
  return `Basic ${Buffer.from(`${config.username}:${config.password}`, "utf8").toString("base64")}`;
}

async function defaultFetch(
  url: string,
  init?: Parameters<SuperQiFetch>[1],
): Promise<SuperQiHttpResponse> {
  return fetch(url, init) as unknown as Promise<SuperQiHttpResponse>;
}

async function responseJson(response: SuperQiHttpResponse): Promise<Record<string, unknown>> {
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    body = null;
  }
  if (!response.ok || !body || typeof body !== "object" || Array.isArray(body)) {
    throw new SuperQiSandboxProviderError(
      "SUPERQI_SANDBOX_UPSTREAM_ERROR",
      "SuperQi sandbox payment gateway request failed",
      502,
    );
  }
  return body as Record<string, unknown>;
}

function paymentStatusFromBody(body: Record<string, unknown>): SuperQiPaymentStatus {
  const requestId = required(body.requestId, 200);
  const paymentId = required(body.paymentId, 300);
  const status = required(body.status, 80) as SuperQiPaymentStatus["status"];
  if (!["CREATED", "SUCCESS", "FAILED", "AUTHENTICATION_FAILED"].includes(status)) {
    throw new SuperQiSandboxProviderError(
      "SUPERQI_SANDBOX_STATUS_INVALID",
      "SuperQi sandbox returned an unsupported payment status",
      502,
    );
  }
  const currency = required(body.currency, 3);
  if (currency !== "IQD") {
    throw new SuperQiSandboxProviderError(
      "SUPERQI_SANDBOX_CURRENCY_MISMATCH",
      "SuperQi sandbox returned a non-IQD payment",
      502,
    );
  }
  const amount = positiveAmount(body.amount);
  const confirmedAmount = body.confirmedAmount == null
    ? null
    : positiveAmount(body.confirmedAmount);
  const creationDate = required(body.creationDate, 100);
  const formUrl = body.formUrl ? required(body.formUrl, 2048) : null;
  if (formUrl) {
    try {
      const parsed = new URL(formUrl);
      if (
        parsed.protocol !== "https:" ||
        parsed.hostname !== "uat-sandbox-3ds-api.qi.iq"
      ) {
        throw new Error("unexpected checkout host");
      }
    } catch {
      throw new SuperQiSandboxProviderError(
        "SUPERQI_SANDBOX_FORM_URL_INVALID",
        "SuperQi sandbox returned an invalid checkout URL",
        502,
      );
    }
  }
  return {
    requestId,
    paymentId,
    status,
    canceled: body.canceled === true,
    amount,
    confirmedAmount,
    currency: "IQD",
    creationDate,
    formUrl,
  };
}

export async function createSuperQiSandboxPayment(
  input: { requestId: string; orderId: string; amountIqd: number },
  fetchImpl: SuperQiFetch = defaultFetch,
): Promise<SuperQiPaymentStatus & { formUrl: string }> {
  const config = loadConfig();
  const requestId = required(input.requestId, 200);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(requestId)) {
    throw new SuperQiSandboxProviderError(
      "SUPERQI_SANDBOX_REQUEST_ID_INVALID",
      "SuperQi sandbox request ID must be a UUID v4",
      400,
    );
  }
  const amountIqd = positiveAmount(input.amountIqd);
  if (!Number.isSafeInteger(amountIqd)) {
    throw new SuperQiSandboxProviderError(
      "SUPERQI_SANDBOX_AMOUNT_INVALID",
      "Fawri SaaS sandbox billing amount must be a whole IQD amount",
      400,
    );
  }
  const response = await fetchImpl(`${SUPERQI_SANDBOX_API_BASE_URL}/payment`, {
    method: "POST",
    headers: {
      Authorization: basicAuthorization(config),
      "Content-Type": "application/json",
      "X-Terminal-Id": config.terminalId,
    },
    body: JSON.stringify({
      requestId,
      amount: amountIqd,
      currency: "IQD",
      finishPaymentUrl: config.finishUrl,
      notificationUrl: config.notificationUrl,
      additionalInfo: { fawriOrderId: required(input.orderId, 180) },
      appChannel: false,
    }),
  });
  const payment = paymentStatusFromBody(await responseJson(response));
  if (
    payment.requestId !== requestId ||
    payment.amount !== amountIqd ||
    payment.status !== "CREATED" ||
    !payment.formUrl
  ) {
    throw new SuperQiSandboxProviderError(
      "SUPERQI_SANDBOX_CREATE_RESPONSE_MISMATCH",
      "SuperQi sandbox create-payment response does not match the Fawri billing order",
      502,
    );
  }
  return payment as SuperQiPaymentStatus & { formUrl: string };
}

export async function getSuperQiSandboxPaymentStatus(
  paymentId: string,
  fetchImpl: SuperQiFetch = defaultFetch,
): Promise<SuperQiPaymentStatus> {
  const config = loadConfig();
  const normalizedPaymentId = required(paymentId, 300);
  const response = await fetchImpl(
    `${SUPERQI_SANDBOX_API_BASE_URL}/payment/${encodeURIComponent(normalizedPaymentId)}/status`,
    {
      method: "GET",
      headers: {
        Authorization: basicAuthorization(config),
        "X-Terminal-Id": config.terminalId,
      },
    },
  );
  const payment = paymentStatusFromBody(await responseJson(response));
  if (payment.paymentId !== normalizedPaymentId) {
    throw new SuperQiSandboxProviderError(
      "SUPERQI_SANDBOX_STATUS_RESPONSE_MISMATCH",
      "SuperQi sandbox status response references another payment",
      502,
    );
  }
  return payment;
}

function webhookAmount(value: unknown): number {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new SuperQiSandboxProviderError(
      "SUPERQI_SANDBOX_WEBHOOK_INVALID",
      "SuperQi sandbox webhook amount is invalid",
      400,
    );
  }
  return amount;
}

export function superQiWebhookSigningPayload(payload: SuperQiWebhookPayload): string {
  const paymentId = required(payload.paymentId, 300);
  const amount = webhookAmount(payload.amount);
  const currency = required(payload.currency, 3);
  const creationDate = required(payload.creationDate, 100);
  const status = required(payload.status, 80);
  return `${paymentId}|${amount.toFixed(3)}|${currency}|${creationDate}|${status}`;
}

export function superQiWebhookPayloadHash(payload: SuperQiWebhookPayload): string {
  return crypto
    .createHash("sha256")
    .update(superQiWebhookSigningPayload(payload), "utf8")
    .digest("hex");
}

export function verifySuperQiSandboxWebhookSignature(
  payload: SuperQiWebhookPayload,
  signatureBase64: string,
): boolean {
  const config = loadConfig();
  const signature = required(signatureBase64, 10_000);
  let decoded: Buffer;
  try {
    decoded = Buffer.from(signature, "base64");
    if (decoded.length === 0) return false;
  } catch {
    return false;
  }
  try {
    const verifier = crypto.createVerify("RSA-SHA256");
    verifier.update(superQiWebhookSigningPayload(payload), "utf8");
    verifier.end();
    return verifier.verify(config.webhookPublicKeyPem, decoded);
  } catch {
    return false;
  }
}
