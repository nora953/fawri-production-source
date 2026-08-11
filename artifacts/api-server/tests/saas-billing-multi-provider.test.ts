import assert from "node:assert/strict";
import crypto from "node:crypto";
import test from "node:test";
import {
  getSaasBillingCatalog,
  resolveSaasBillingCheckoutProvider,
  SaasBillingAuthorityError,
} from "../src/services/saasBillingAuthority";

const managedEnv = [
  "NODE_ENV",
  "FAWRI_SAAS_BILLING_PROVIDER",
  "FAWRI_SAAS_BILLING_PROVIDERS",
  "FAWRI_SUPERQI_SANDBOX_ENABLED",
  "FAWRI_SUPERQI_SANDBOX_USERNAME",
  "FAWRI_SUPERQI_SANDBOX_PASSWORD",
  "FAWRI_SUPERQI_SANDBOX_TERMINAL_ID",
  "FAWRI_SUPERQI_SANDBOX_NOTIFICATION_URL",
  "FAWRI_SUPERQI_SANDBOX_FINISH_URL",
  "FAWRI_SUPERQI_SANDBOX_WEBHOOK_PUBLIC_KEY_B64",
] as const;

function snapshotEnv() {
  return Object.fromEntries(managedEnv.map((key) => [key, process.env[key]]));
}

function restoreEnv(snapshot: Record<string, string | undefined>) {
  for (const key of managedEnv) {
    const value = snapshot[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

function configureSuperQiSandbox() {
  const { publicKey } = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
  const pem = publicKey.export({ type: "spki", format: "pem" }).toString();
  process.env.FAWRI_SUPERQI_SANDBOX_ENABLED = "1";
  process.env.FAWRI_SUPERQI_SANDBOX_USERNAME = "sandbox-user";
  process.env.FAWRI_SUPERQI_SANDBOX_PASSWORD = "sandbox-password";
  process.env.FAWRI_SUPERQI_SANDBOX_TERMINAL_ID = "sandbox-terminal";
  process.env.FAWRI_SUPERQI_SANDBOX_NOTIFICATION_URL = "https://example.test/superqi/webhook";
  process.env.FAWRI_SUPERQI_SANDBOX_FINISH_URL = "https://example.test/subscription";
  process.env.FAWRI_SUPERQI_SANDBOX_WEBHOOK_PUBLIC_KEY_B64 = Buffer.from(pem, "utf8").toString("base64");
}

test("billing catalog exposes configured providers and FastPay as setup-required", () => {
  const before = snapshotEnv();
  try {
    process.env.NODE_ENV = "test";
    process.env.FAWRI_SAAS_BILLING_PROVIDERS = "test_fake";
    delete process.env.FAWRI_SAAS_BILLING_PROVIDER;

    const catalog = getSaasBillingCatalog();
    const fake = catalog.providers.find((provider) => provider.provider === "test_fake");
    const fastpay = catalog.providers.find((provider) => provider.provider === "fastpay");

    assert.equal(fake?.checkout_available, true);
    assert.equal(fake?.status, "available");
    assert.equal(fastpay?.checkout_available, false);
    assert.equal(fastpay?.status, "merchant_setup_required");
    assert.equal(fastpay?.production_ready, false);
  } finally {
    restoreEnv(before);
  }
});

test("explicit provider selection is required when more than one checkout provider is available", () => {
  const before = snapshotEnv();
  try {
    process.env.NODE_ENV = "test";
    process.env.FAWRI_SAAS_BILLING_PROVIDERS = "test_fake,superqi_sandbox";
    delete process.env.FAWRI_SAAS_BILLING_PROVIDER;
    configureSuperQiSandbox();

    assert.throws(
      () => resolveSaasBillingCheckoutProvider(),
      (error: unknown) =>
        error instanceof SaasBillingAuthorityError &&
        error.code === "SAAS_BILLING_PROVIDER_REQUIRED",
    );

    const superQi = resolveSaasBillingCheckoutProvider("superqi_sandbox");
    assert.equal(superQi.provider, "superqi_sandbox");
    assert.equal(superQi.checkout_available, true);
  } finally {
    restoreEnv(before);
  }
});

test("FastPay cannot be selected until merchant integration credentials are available", () => {
  const before = snapshotEnv();
  try {
    process.env.NODE_ENV = "test";
    process.env.FAWRI_SAAS_BILLING_PROVIDERS = "test_fake";

    assert.throws(
      () => resolveSaasBillingCheckoutProvider("fastpay"),
      (error: unknown) =>
        error instanceof SaasBillingAuthorityError &&
        error.code === "SAAS_BILLING_PROVIDER_DISABLED" &&
        error.details?.provider === "fastpay",
    );
  } finally {
    restoreEnv(before);
  }
});

test("legacy single-provider environment remains backward compatible", () => {
  const before = snapshotEnv();
  try {
    process.env.NODE_ENV = "test";
    delete process.env.FAWRI_SAAS_BILLING_PROVIDERS;
    process.env.FAWRI_SAAS_BILLING_PROVIDER = "test_fake";

    const resolved = resolveSaasBillingCheckoutProvider();
    assert.equal(resolved.provider, "test_fake");
    assert.equal(resolved.checkout_available, true);
  } finally {
    restoreEnv(before);
  }
});
