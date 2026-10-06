import assert from "node:assert/strict";
import test from "node:test";
import {
  FASTPAY_IPN_URL_ENV,
  FASTPAY_RETURN_URL_ENV,
  FASTPAY_STORE_ID_ENV,
  FASTPAY_STORE_PASSWORD_ENV,
  FASTPAY_VALIDATION_URL_ENV,
  getFastPayProductionReadiness,
} from "../src/services/fastPayProductionReadiness";
import { getSaasBillingProviderState } from "../src/services/saasBillingAuthority";

const ENV_KEYS = [
  FASTPAY_STORE_ID_ENV,
  FASTPAY_STORE_PASSWORD_ENV,
  FASTPAY_VALIDATION_URL_ENV,
  FASTPAY_IPN_URL_ENV,
  FASTPAY_RETURN_URL_ENV,
  "FAWRI_SAAS_BILLING_PROVIDER",
  "FAWRI_SAAS_BILLING_PROVIDERS",
] as const;

function withEnvironment(
  values: Partial<Record<(typeof ENV_KEYS)[number], string | undefined>>,
  run: () => void,
): void {
  const previous = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));
  try {
    for (const key of ENV_KEYS) {
      const value = values[key];
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    run();
  } finally {
    for (const key of ENV_KEYS) {
      const value = previous[key];
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

test("FastPay remains fail-closed before merchant credentials exist", () => {
  withEnvironment(
    {
      FAWRI_SAAS_BILLING_PROVIDERS: "fastpay",
    },
    () => {
      const readiness = getFastPayProductionReadiness();
      assert.equal(readiness.production_ready, false);
      assert.equal(readiness.adapter_implemented, false);
      assert.equal(readiness.merchant_credentials_configured, false);
      assert.ok(readiness.blockers.includes("merchant_credentials_required"));
      assert.ok(readiness.blockers.includes("production_adapter_pending"));

      const state = getSaasBillingProviderState("fastpay");
      assert.equal(state.checkout_available, false);
      assert.equal(state.production_ready, false);
      assert.equal(state.status, "merchant_setup_required");
      assert.equal(state.readiness?.merchant_credentials_configured, false);
    },
  );
});

test("FastPay rejects insecure production callback and validation URLs", () => {
  withEnvironment(
    {
      FAWRI_SAAS_BILLING_PROVIDERS: "fastpay",
      [FASTPAY_STORE_ID_ENV]: "merchant-store-123",
      [FASTPAY_STORE_PASSWORD_ENV]: "merchant-password-123",
      [FASTPAY_VALIDATION_URL_ENV]: "http://payments.example.test/validate",
      [FASTPAY_IPN_URL_ENV]: "https://api.example.com/fastpay/ipn",
      [FASTPAY_RETURN_URL_ENV]: "https://app.example.com/billing/return",
    },
    () => {
      const readiness = getFastPayProductionReadiness();
      assert.equal(readiness.merchant_credentials_configured, true);
      assert.equal(readiness.validation_api_configured, false);
      assert.equal(readiness.configuration_complete, false);
      assert.ok(readiness.blockers.includes("https_required"));

      const state = getSaasBillingProviderState("fastpay");
      assert.equal(state.status, "configuration_incomplete");
      assert.equal(state.checkout_available, false);
    },
  );
});

test("complete FastPay configuration still cannot enable checkout before official adapter exists", () => {
  withEnvironment(
    {
      FAWRI_SAAS_BILLING_PROVIDERS: "fastpay",
      [FASTPAY_STORE_ID_ENV]: "merchant-store-123",
      [FASTPAY_STORE_PASSWORD_ENV]: "merchant-password-123",
      [FASTPAY_VALIDATION_URL_ENV]: "https://gateway.example.com/validate",
      [FASTPAY_IPN_URL_ENV]: "https://api.example.com/billing/providers/fastpay/ipn",
      [FASTPAY_RETURN_URL_ENV]: "https://app.example.com/billing/return",
    },
    () => {
      const readiness = getFastPayProductionReadiness();
      assert.equal(readiness.configuration_complete, true);
      assert.equal(readiness.production_ready, false);
      assert.equal(readiness.adapter_implemented, false);
      assert.deepEqual(readiness.blockers, ["production_adapter_pending"]);

      const state = getSaasBillingProviderState("fastpay");
      assert.equal(state.status, "configuration_incomplete");
      assert.equal(state.checkout_available, false);
      assert.equal(state.production_ready, false);
      assert.equal(state.readiness?.configuration_complete, true);

      const serialized = JSON.stringify(state);
      assert.equal(serialized.includes("merchant-password-123"), false);
      assert.equal(serialized.includes("merchant-store-123"), false);
    },
  );
});
