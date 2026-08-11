import assert from "node:assert/strict";
import crypto from "node:crypto";
import test from "node:test";
import { pool } from "@workspace/db";
import {
  createSaasBillingCheckout,
  getSaasBillingCatalog,
} from "../src/services/saasBillingAuthority";
import { getCurrentSubscriptionPostgres } from "../src/services/postgresSubscriptionEntitlement";
import { handleSuperQiSandboxWebhook } from "../src/services/superQiSandboxWebhook";
import {
  type SuperQiFetch,
  superQiWebhookSigningPayload,
} from "../src/services/superQiSandboxTransport";

const merchantId = "merchant-superqi-sandbox-test";

const envNames = [
  "NODE_ENV",
  "FAWRI_SUBSCRIPTION_POSTGRES_AUTHORITY",
  "FAWRI_SAAS_BILLING_PROVIDER",
  "FAWRI_SUPERQI_SANDBOX_ENABLED",
  "FAWRI_SUPERQI_SANDBOX_USERNAME",
  "FAWRI_SUPERQI_SANDBOX_PASSWORD",
  "FAWRI_SUPERQI_SANDBOX_TERMINAL_ID",
  "FAWRI_SUPERQI_SANDBOX_NOTIFICATION_URL",
  "FAWRI_SUPERQI_SANDBOX_FINISH_URL",
  "FAWRI_SUPERQI_SANDBOX_WEBHOOK_PUBLIC_KEY_B64",
] as const;

async function cleanup(): Promise<void> {
  await pool.query(`DELETE FROM accounts WHERE id = $1`, [merchantId]);
}

async function seedMerchant(): Promise<void> {
  await pool.query(
    `INSERT INTO accounts (
       id, kind, phone, password_hash, state, language, phone_verified,
       password_version, security_version, session_version, created_at, updated_at
     ) VALUES ($1, 'merchant', '07700000991', 'test-only-hash', 'active', 'ar', TRUE, 1, 1, 1, NOW(), NOW())`,
    [merchantId],
  );
  await pool.query(
    `INSERT INTO merchants (
       id, account_id, profile_kind, owner_name, store_name, activity_type,
       status, account_status, onboarding_status, trial_status, signup_source,
       warning_stage, products_read_only, metadata, created_at, updated_at
     ) VALUES (
       $1, $1, 'merchant', 'SuperQi Test Owner', 'SuperQi Test Store', 'test',
       'approved', 'approved', 'channel_connected', 'not_started', 'direct',
       0, FALSE, '{}'::jsonb, NOW(), NOW()
     )`,
    [merchantId],
  );
}

function configureSandbox() {
  const before = Object.fromEntries(envNames.map((name) => [name, process.env[name]]));
  const { privateKey, publicKey } = crypto.generateKeyPairSync("rsa", {
    modulusLength: 2048,
  });
  process.env.NODE_ENV = "test";
  process.env.FAWRI_SUBSCRIPTION_POSTGRES_AUTHORITY = "required";
  process.env.FAWRI_SAAS_BILLING_PROVIDER = "superqi_sandbox";
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

test("signed and status-confirmed SuperQi sandbox payment applies one entitlement exactly once", async () => {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
  const setup = configureSandbox();
  let providerRequestId = "";
  const paymentId = "superqi-sandbox-payment-1";
  const creationDate = "2026-08-11T13:30:00";
  const fetchImpl: SuperQiFetch = async (url, init) => {
    if (init?.method === "POST") {
      const body = JSON.parse(String(init.body));
      providerRequestId = String(body.requestId);
      assert.equal(body.amount, 25_000);
      assert.equal(body.currency, "IQD");
      assert.equal(body.additionalInfo.fawriOrderId.startsWith("saas-billing-"), true);
      return {
        ok: true,
        status: 200,
        async json() {
          return {
            requestId: providerRequestId,
            paymentId,
            status: "CREATED",
            canceled: false,
            amount: 25_000,
            currency: "IQD",
            creationDate,
            formUrl: `https://uat-sandbox-3ds-api.qi.iq/api/v1/payment/${paymentId}`,
          };
        },
      };
    }
    assert.equal(
      url,
      `https://uat-sandbox-3ds-api.qi.iq/api/v1/payment/${paymentId}/status`,
    );
    return {
      ok: true,
      status: 200,
      async json() {
        return {
          requestId: providerRequestId,
          paymentId,
          status: "SUCCESS",
          canceled: false,
          amount: 25_000,
          confirmedAmount: 25_000,
          currency: "IQD",
          creationDate,
        };
      },
    };
  };

  try {
    await cleanup();
    await seedMerchant();
    const catalog = getSaasBillingCatalog();
    assert.equal(catalog.provider.provider, "superqi_sandbox");
    assert.equal(catalog.provider.checkout_available, true);
    assert.equal(catalog.provider.production_ready, false);

    const checkout = await createSaasBillingCheckout({
      merchantId,
      operation: "activate",
      plan: "silver",
      idempotencyKey: "superqi-checkout-once",
      now: new Date("2026-08-11T13:29:00.000Z"),
      providerFetch: fetchImpl,
    });
    assert.equal(checkout.duplicate, false);
    assert.equal(checkout.order.provider, "superqi_sandbox");
    assert.equal(checkout.order.amount_iqd, 25_000);
    assert.equal(checkout.order.provider_checkout_ref, paymentId);
    assert.equal(checkout.checkout.provider, "superqi_sandbox");
    if (checkout.checkout.provider !== "superqi_sandbox") {
      throw new Error("expected SuperQi sandbox checkout");
    }
    assert.equal(
      checkout.checkout.redirect_url,
      `https://uat-sandbox-3ds-api.qi.iq/api/v1/payment/${paymentId}`,
    );
    assert.match(providerRequestId, /^[0-9a-f-]{36}$/i);

    const duplicateCheckout = await createSaasBillingCheckout({
      merchantId,
      operation: "activate",
      plan: "silver",
      idempotencyKey: "superqi-checkout-once",
      now: new Date("2026-08-11T13:29:30.000Z"),
      providerFetch: fetchImpl,
    });
    assert.equal(duplicateCheckout.duplicate, true);
    assert.equal(duplicateCheckout.order.id, checkout.order.id);

    const payload = {
      requestId: providerRequestId,
      paymentId,
      status: "SUCCESS",
      canceled: false,
      amount: 25_000,
      confirmedAmount: 25_000,
      currency: "IQD",
      creationDate,
    };
    const signer = crypto.createSign("RSA-SHA256");
    signer.update(superQiWebhookSigningPayload(payload), "utf8");
    signer.end();
    const signature = signer.sign(setup.privateKey).toString("base64");

    const first = await handleSuperQiSandboxWebhook({
      payload,
      signature,
      receivedAt: new Date("2026-08-11T13:31:00.000Z"),
      fetchImpl,
    });
    assert.equal(first.status, "processed");
    if (first.status !== "processed") throw new Error("expected processed webhook");
    assert.equal(first.outcome.status, "applied");

    const duplicate = await handleSuperQiSandboxWebhook({
      payload,
      signature,
      receivedAt: new Date("2026-08-11T13:31:05.000Z"),
      fetchImpl,
    });
    assert.equal(duplicate.status, "processed");
    if (duplicate.status !== "processed") throw new Error("expected duplicate webhook");
    assert.equal(duplicate.outcome.status, "duplicate");

    const subscription = await getCurrentSubscriptionPostgres(
      merchantId,
      new Date("2026-08-11T13:32:00.000Z"),
    );
    assert.equal(subscription?.plan_name, "silver");
    assert.equal(subscription?.price_iqd, 25_000);
    assert.equal(subscription?.base_reply_limit, 4_000);

    const applications = await pool.query(
      `SELECT COUNT(*)::int AS count
         FROM saas_entitlement_applications
        WHERE order_id = $1`,
      [checkout.order.id],
    );
    assert.equal(applications.rows[0].count, 1);
  } finally {
    await cleanup();
    setup.restore();
  }
});

test("SuperQi sandbox webhook rejects a validly-shaped but invalid signature", async () => {
  const setup = configureSandbox();
  try {
    await assert.rejects(
      () =>
        handleSuperQiSandboxWebhook({
          payload: {
            requestId: "fc07c78e-6989-4ed1-a7c8-ef7a4828dbb1",
            paymentId: "superqi-invalid-signature",
            status: "SUCCESS",
            canceled: false,
            amount: 25_000,
            currency: "IQD",
            creationDate: "2026-08-11T14:00:00",
          },
          signature: Buffer.from("not-a-real-signature").toString("base64"),
          fetchImpl: async () => {
            throw new Error("status lookup must not run before signature verification");
          },
        }),
      (error: unknown) =>
        error instanceof Error && error.message.includes("signature is invalid"),
    );
  } finally {
    setup.restore();
  }
});
