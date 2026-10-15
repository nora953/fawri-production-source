import assert from "node:assert/strict";
import crypto from "node:crypto";
import test from "node:test";
import {
  createSuperQiSandboxPayment,
  getSuperQiSandboxPaymentStatus,
  getSuperQiSandboxPublicState,
  SuperQiSandboxProviderError,
  type SuperQiFetch,
  superQiWebhookSigningPayload,
  verifySuperQiSandboxWebhookSignature,
} from "../src/services/superQiSandboxTransport";

const envNames = [
  "NODE_ENV",
  "FAWRI_SUPERQI_SANDBOX_ENABLED",
  "FAWRI_SUPERQI_SANDBOX_USERNAME",
  "FAWRI_SUPERQI_SANDBOX_PASSWORD",
  "FAWRI_SUPERQI_SANDBOX_TERMINAL_ID",
  "FAWRI_SUPERQI_SANDBOX_NOTIFICATION_URL",
  "FAWRI_SUPERQI_SANDBOX_FINISH_URL",
  "FAWRI_SUPERQI_SANDBOX_WEBHOOK_PUBLIC_KEY_B64",
] as const;

function withSandboxEnv() {
  const before = Object.fromEntries(envNames.map((name) => [name, process.env[name]]));
  const { privateKey, publicKey } = crypto.generateKeyPairSync("rsa", {
    modulusLength: 2048,
  });
  process.env.NODE_ENV = "test";
  process.env.FAWRI_SUPERQI_SANDBOX_ENABLED = "1";
  process.env.FAWRI_SUPERQI_SANDBOX_USERNAME = "sandbox-user";
  process.env.FAWRI_SUPERQI_SANDBOX_PASSWORD = "sandbox-password";
  process.env.FAWRI_SUPERQI_SANDBOX_TERMINAL_ID = "sandbox-terminal";
  process.env.FAWRI_SUPERQI_SANDBOX_NOTIFICATION_URL =
    "https://sandbox-api.example.test/api/auth/billing/providers/superqi/webhook";
  process.env.FAWRI_SUPERQI_SANDBOX_FINISH_URL =
    "https://sandbox-app.example.test/dashboard/subscription?provider=superqi";
  process.env.FAWRI_SUPERQI_SANDBOX_WEBHOOK_PUBLIC_KEY_B64 = Buffer.from(
    publicKey.export({ type: "spki", format: "pem" }).toString(),
    "utf8",
  ).toString("base64");
  return {
    privateKey,
    restore() {
      for (const name of envNames) {
        const value = before[name];
        if (value === undefined) delete process.env[name];
        else process.env[name] = value;
      }
    },
  };
}

test("SuperQi sandbox is fail-closed in production", () => {
  const setup = withSandboxEnv();
  try {
    process.env.NODE_ENV = "production";
    const state = getSuperQiSandboxPublicState();
    assert.equal(state.checkout_available, false);
    assert.equal(state.production_ready, false);
    assert.equal(state.reason, "production_forbidden");
  } finally {
    setup.restore();
  }
});

test("create payment sends only server authority amount and sandbox callback data", async () => {
  const setup = withSandboxEnv();
  try {
    let requestUrl = "";
    let requestInit: Parameters<SuperQiFetch>[1];
    const requestId = "2d64e644-35de-4ddc-b705-a119551aaa51";
    const fetchImpl: SuperQiFetch = async (url, init) => {
      requestUrl = url;
      requestInit = init;
      return {
        ok: true,
        status: 200,
        async json() {
          return {
            requestId,
            paymentId: "qi-payment-1",
            status: "CREATED",
            canceled: false,
            amount: 25_000,
            currency: "IQD",
            creationDate: "2026-08-11T10:00:00Z",
            formUrl:
              "https://uat-sandbox-3ds-api.qi.iq/api/v1/payment/qi-payment-1",
          };
        },
      };
    };

    const payment = await createSuperQiSandboxPayment(
      {
        requestId,
        orderId: "saas-billing-order-1",
        amountIqd: 25_000,
      },
      fetchImpl,
    );
    assert.equal(payment.paymentId, "qi-payment-1");
    assert.equal(payment.amount, 25_000);
    assert.equal(requestUrl, "https://uat-sandbox-3ds-api.qi.iq/api/v1/payment");
    assert.equal(requestInit?.method, "POST");
    assert.equal(requestInit?.headers?.["X-Terminal-Id"], "sandbox-terminal");
    assert.match(String(requestInit?.headers?.Authorization), /^Basic /);
    const body = JSON.parse(String(requestInit?.body));
    assert.deepEqual(
      {
        requestId: body.requestId,
        amount: body.amount,
        currency: body.currency,
        finishPaymentUrl: body.finishPaymentUrl,
        notificationUrl: body.notificationUrl,
        appChannel: body.appChannel,
      },
      {
        requestId,
        amount: 25_000,
        currency: "IQD",
        finishPaymentUrl:
          "https://sandbox-app.example.test/dashboard/subscription?provider=superqi",
        notificationUrl:
          "https://sandbox-api.example.test/api/auth/billing/providers/superqi/webhook",
        appChannel: false,
      },
    );
    assert.equal(body.additionalInfo.fawriOrderId, "saas-billing-order-1");
    assert.equal("paid" in body, false);
  } finally {
    setup.restore();
  }
});

test("status confirmation is bound to the requested SuperQi payment", async () => {
  const setup = withSandboxEnv();
  try {
    const fetchImpl: SuperQiFetch = async (url, init) => {
      assert.equal(
        url,
        "https://uat-sandbox-3ds-api.qi.iq/api/v1/payment/qi-payment-2/status",
      );
      assert.equal(init?.method, "GET");
      assert.equal(init?.headers?.["X-Terminal-Id"], "sandbox-terminal");
      return {
        ok: true,
        status: 200,
        async json() {
          return {
            requestId: "1c74022c-67c6-49ae-86e6-0ced6e6089ea",
            paymentId: "qi-payment-2",
            status: "SUCCESS",
            canceled: false,
            amount: 49_000,
            confirmedAmount: 49_000,
            currency: "IQD",
            creationDate: "2026-08-11T11:00:00Z",
          };
        },
      };
    };
    const status = await getSuperQiSandboxPaymentStatus("qi-payment-2", fetchImpl);
    assert.equal(status.status, "SUCCESS");
    assert.equal(status.confirmedAmount, 49_000);
  } finally {
    setup.restore();
  }
});

test("webhook signature must verify with the configured Qi public key", () => {
  const setup = withSandboxEnv();
  try {
    const payload = {
      requestId: "cfaf8a53-7d5d-40fb-8a0b-0ea376e45be3",
      paymentId: "qi-payment-3",
      status: "SUCCESS",
      canceled: false,
      amount: 75_000,
      currency: "IQD",
      creationDate: "2026-08-11T12:00:00",
    };
    const signer = crypto.createSign("RSA-SHA256");
    signer.update(superQiWebhookSigningPayload(payload), "utf8");
    signer.end();
    const signature = signer.sign(setup.privateKey).toString("base64");
    assert.equal(verifySuperQiSandboxWebhookSignature(payload, signature), true);
    assert.equal(
      verifySuperQiSandboxWebhookSignature(
        { ...payload, amount: 1 },
        signature,
      ),
      false,
    );
  } finally {
    setup.restore();
  }
});

test("create payment rejects a non-sandbox checkout URL", async () => {
  const setup = withSandboxEnv();
  try {
    const requestId = "47a46fca-f687-4f73-a32b-f82c3b648e64";
    const fetchImpl: SuperQiFetch = async () => ({
      ok: true,
      status: 200,
      async json() {
        return {
          requestId,
          paymentId: "qi-payment-bad-url",
          status: "CREATED",
          canceled: false,
          amount: 25_000,
          currency: "IQD",
          creationDate: "2026-08-11T13:00:00Z",
          formUrl: "https://evil.example.test/payment",
        };
      },
    });
    await assert.rejects(
      () =>
        createSuperQiSandboxPayment(
          { requestId, orderId: "billing-bad-url", amountIqd: 25_000 },
          fetchImpl,
        ),
      (error: unknown) =>
        error instanceof SuperQiSandboxProviderError &&
        error.code === "SUPERQI_SANDBOX_FORM_URL_INVALID",
    );
  } finally {
    setup.restore();
  }
});
