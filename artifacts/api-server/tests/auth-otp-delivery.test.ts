import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { deliverAuthOtp, deliverAuthOtpWithProviderReceipt, createProductionOtpReadinessCheck, productionOtpDeliveryConfigurationReady } from "../src/services/authOtpDelivery";
import type { OtpPurpose } from "../src/services/authSecurityTypes";

function configure(
  t: TestContext,
  overrides: NodeJS.ProcessEnv = {},
  providerResponse: Response = new Response(JSON.stringify({ messages: [{ id: "wamid.synthetic-test" }] }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  }),
) {
  const settings: NodeJS.ProcessEnv = {
    NODE_ENV: "production",
    FAWRI_DEPLOYMENT_MODE: undefined,
    AUTH_ALLOW_DEV_OTP_BYPASS: "true",
    FAWRI_STAGING_OTP_BYPASS: undefined,
    FAWRI_PRODUCTION_RELEASE_GATE: undefined,
    OTP_DELIVERY_CHANNEL: "whatsapp",
    WHATSAPP_ACCESS_TOKEN: "synthetic-test-token",
    WHATSAPP_PHONE_NUMBER_ID: "123456789012345",
    WHATSAPP_AUTH_TEMPLATE_NAME: "fawri_otp_copy_code",
    WHATSAPP_AUTH_TEMPLATE_LANGUAGE: "en_US",
    WHATSAPP_TEST_TO: "+15550000002",
    ...overrides,
  };
  const previous = Object.fromEntries(Object.keys(settings).map(key => [key, process.env[key]]));
  const apply = (values: NodeJS.ProcessEnv) => {
    for (const [key, value] of Object.entries(values)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  };
  apply(settings);
  t.after(() => apply(previous));
  const recipients: string[] = [];
  const payloads: Array<Record<string, unknown>> = [];
  t.mock.method(globalThis, "fetch", async (_url: unknown, options: RequestInit) => {
    const body = JSON.parse(String(options.body));
    recipients.push(body.to);
    payloads.push(body);
    return providerResponse;
  });
  return { recipients, payloads };
}

const purposes: OtpPurpose[] = ["signup", "password_reset", "admin_recovery", "admin_device_verification"];
for (const env of [
  { NODE_ENV: "production" },
  { NODE_ENV: "production", FAWRI_DEPLOYMENT_MODE: "staging" },
  { NODE_ENV: "development", FAWRI_DEPLOYMENT_MODE: "production" },
  { NODE_ENV: "test", FAWRI_DEPLOYMENT_MODE: "production" },
  { NODE_ENV: undefined },
]) {
  for (const purpose of purposes) {
    test(`${purpose} preserves recipient and ignores bypass in ${JSON.stringify(env)}`, async t => {
      const { recipients } = configure(t, env);
      assert.deepEqual(await deliverAuthOtp("+1 (555) 000-0001", "123456", purpose), { ok: true });
      assert.deepEqual(recipients, ["15550000001"]);
    });
  }
}

for (const nodeEnv of ["development", "test"]) {
  test(`${nodeEnv} retains explicit test recipient override`, async t => {
    const { recipients } = configure(t, { NODE_ENV: nodeEnv, AUTH_ALLOW_DEV_OTP_BYPASS: "false" });
    assert.deepEqual(await deliverAuthOtp("+15550000001", "123456", "signup"), { ok: true });
    assert.deepEqual(recipients, ["15550000002"]);
  });
  test(`${nodeEnv} retains explicitly enabled delivery bypass`, async t => {
    const { recipients } = configure(t, { NODE_ENV: nodeEnv });
    assert.deepEqual(await deliverAuthOtp("+15550000001", "123456", "signup"), { ok: true });
    assert.deepEqual(recipients, []);
  });
}

test("a production test recipient cannot replace a missing intended recipient", async t => {
  const { recipients } = configure(t);
  const result = await deliverAuthOtp("", "123456", "signup");
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.code, "OTP_DELIVERY_NOT_CONFIGURED");
  assert.deepEqual(recipients, []);
});


test("production-node staging can explicitly bypass delivery for manual QA", async t => {
  const { recipients } = configure(t, {
    NODE_ENV: "production",
    FAWRI_DEPLOYMENT_MODE: "staging",
    FAWRI_STAGING_OTP_BYPASS: "1",
    OTP_DELIVERY_CHANNEL: undefined,
    WHATSAPP_ACCESS_TOKEN: undefined,
    WHATSAPP_PHONE_NUMBER_ID: undefined,
  });
  assert.deepEqual(
    await deliverAuthOtp("+15550000001", "123456", "admin_device_verification"),
    { ok: true },
  );
  assert.deepEqual(recipients, []);
});

test("staging bypass flag is ignored in production deployment mode", async t => {
  const { recipients } = configure(t, {
    NODE_ENV: "production",
    FAWRI_DEPLOYMENT_MODE: "production",
    FAWRI_STAGING_OTP_BYPASS: "1",
  });
  assert.deepEqual(
    await deliverAuthOtp("+15550000001", "123456", "admin_device_verification"),
    { ok: true },
  );
  assert.deepEqual(recipients, ["15550000001"]);
});

test("production release gate disables staging OTP bypass", async t => {
  const { recipients } = configure(t, {
    NODE_ENV: "production",
    FAWRI_DEPLOYMENT_MODE: "staging",
    FAWRI_STAGING_OTP_BYPASS: "1",
    FAWRI_PRODUCTION_RELEASE_GATE: "required",
  });
  assert.deepEqual(
    await deliverAuthOtp("+15550000001", "123456", "admin_device_verification"),
    { ok: true },
  );
  assert.deepEqual(recipients, ["15550000001"]);
});


test("staging bypass does not bypass merchant signup or recovery OTP delivery", async t => {
  const { recipients } = configure(t, {
    NODE_ENV: "production",
    FAWRI_DEPLOYMENT_MODE: "staging",
    FAWRI_STAGING_OTP_BYPASS: "1",
    OTP_DELIVERY_CHANNEL: undefined,
    WHATSAPP_ACCESS_TOKEN: undefined,
    WHATSAPP_PHONE_NUMBER_ID: undefined,
  });
  for (const purpose of ["signup", "password_reset", "admin_recovery"] as const) {
    const result = await deliverAuthOtp("+15550000001", "123456", purpose);
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.code, "OTP_DELIVERY_NOT_CONFIGURED");
  }
  assert.deepEqual(recipients, []);
});

test("production signup OTP readiness requires a real provider configuration, never a bypass", () => {
  const base = {
    NODE_ENV: "production",
    FAWRI_DEPLOYMENT_MODE: "production",
    FAWRI_V1_MANUAL_COMMERCE: "1",
    OTP_DELIVERY_CHANNEL: "whatsapp",
    WHATSAPP_ACCESS_TOKEN: "synthetic-nonproduction-test-token",
    WHATSAPP_PHONE_NUMBER_ID: "123456789012345",
    WHATSAPP_AUTH_TEMPLATE_NAME: "fawri_otp_copy_code",
    WHATSAPP_AUTH_TEMPLATE_LANGUAGE: "en_US",
    FAWRI_STAGING_OTP_BYPASS: "1",
    AUTH_ALLOW_DEV_OTP_BYPASS: "true",
  };
  assert.equal(productionOtpDeliveryConfigurationReady(base), true);
  assert.doesNotThrow(() => createProductionOtpReadinessCheck(base).check());
  for (const missing of [
    { OTP_DELIVERY_CHANNEL: undefined },
    { OTP_DELIVERY_CHANNEL: "sms" },
    { WHATSAPP_ACCESS_TOKEN: undefined },
    { WHATSAPP_ACCESS_TOKEN: "  " },
    { WHATSAPP_PHONE_NUMBER_ID: undefined },
    { WHATSAPP_PHONE_NUMBER_ID: "  " },
    { WHATSAPP_PHONE_NUMBER_ID: "not-a-numeric-sender" },
    { WHATSAPP_AUTH_TEMPLATE_NAME: undefined },
    { WHATSAPP_AUTH_TEMPLATE_NAME: "INVALID-CODE" },
    { WHATSAPP_AUTH_TEMPLATE_LANGUAGE: undefined },
    { WHATSAPP_AUTH_TEMPLATE_LANGUAGE: "en-US" },
  ]) {
    const env = { ...base, ...missing };
    assert.equal(productionOtpDeliveryConfigurationReady(env), false);
    assert.throws(
      () => createProductionOtpReadinessCheck(env).check(),
      /OTP_DELIVERY_NOT_CONFIGURED/,
    );
  }
  // Staging/dev do not falsely claim a production-delivery acceptance.
  assert.doesNotThrow(() => createProductionOtpReadinessCheck({
    NODE_ENV: "test", FAWRI_DEPLOYMENT_MODE: "staging",
  }).check());
  assert.equal(createProductionOtpReadinessCheck(base).name, "signup_otp_delivery_configuration");
});

test("WhatsApp OTP sends approved-copy-code template shape only, never free-form text or SMS", async t => {
  const { recipients, payloads } = configure(t);
  assert.deepEqual(await deliverAuthOtp("+15550000001", "123456", "signup"), { ok: true });
  assert.deepEqual(recipients, ["15550000001"]);
  assert.deepEqual(payloads, [{
    messaging_product: "whatsapp",
    to: "15550000001",
    type: "template",
    template: {
      name: "fawri_otp_copy_code",
      language: { code: "en_US" },
      components: [
        { type: "body", parameters: [{ type: "text", text: "123456" }] },
        { type: "button", sub_type: "url", index: "0",
          parameters: [{ type: "text", text: "123456" }] },
      ],
    },
  }]);
  assert.equal("text" in payloads[0], false);
});

test("missing approved-template configuration fails closed without a provider request", async t => {
  const { recipients } = configure(t, { WHATSAPP_AUTH_TEMPLATE_NAME: undefined });
  const result = await deliverAuthOtp("+15550000001", "123456", "signup");
  assert.deepEqual(result, { ok: false, code: "OTP_DELIVERY_NOT_CONFIGURED", message: "OTP delivery is not configured" });
  assert.deepEqual(recipients, []);
});

test("provider success without a WhatsApp message id is not OTP send acceptance", async t => {
  const { recipients } = configure(t, {}, new Response(JSON.stringify({ messages: [] }), {
    status: 200, headers: { "Content-Type": "application/json" },
  }));
  const result = await deliverAuthOtp("+15550000001", "123456", "admin_device_verification");
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.code, "OTP_DELIVERY_FAILED");
  assert.deepEqual(recipients, ["15550000001"]);
});

for (const [caseName, messageId] of [
  ["truncated", "wamid."],
  ["too short", "wamid.short"],
  ["invalid characters", "wamid.abcdefgh!"],
  ["oversized", "wamid." + "a".repeat(501)],
] as const) {
  test(`provider 2xx with ${caseName} WhatsApp message id cannot create a trusted receipt`, async t => {
    const { recipients } = configure(t, {}, new Response(JSON.stringify({
      messages: [{ id: messageId }],
    }), { status: 200, headers: { "Content-Type": "application/json" } }));
    const result = await deliverAuthOtpWithProviderReceipt("+15550000001", "123456", "signup");
    assert.deepEqual(result, {
      ok: false, code: "OTP_DELIVERY_FAILED",
      message: "Unable to deliver the verification code",
    });
    assert.deepEqual(recipients, ["15550000001"]);
  });
}

test("malformed code and recipient are rejected before external send", async t => {
  const { recipients } = configure(t);
  for (const [phone, code] of [["", "123456"], ["+15550000001", "12345"], ["+15550000001", "ABC123"]]) {
    const result = await deliverAuthOtp(phone, code, "signup");
    assert.equal(result.ok, false);
  }
  assert.deepEqual(recipients, []);
});

test("trusted sender preserves provider message acceptance only for internal challenge binding", async t => {
  const { recipients } = configure(t);
  const tracked = await deliverAuthOtpWithProviderReceipt("+15550000001", "123456", "signup");
  assert.equal(tracked.ok, true);
  assert.equal("providerReceipt" in tracked, true);
  if (tracked.ok && "providerReceipt" in tracked) {
    assert.deepEqual(tracked.providerReceipt, {
      messageId: "wamid.synthetic-test",
      templateName: "fawri_otp_copy_code",
      templateLanguage: "en_US",
    });
  }
  assert.deepEqual(recipients, ["15550000001"]);
});

test("development OTP bypass cannot produce a trusted WhatsApp provider receipt", async t => {
  const { recipients } = configure(t, { NODE_ENV: "test" });
  const result = await deliverAuthOtpWithProviderReceipt("+15550000001", "123456", "signup");
  assert.deepEqual(result, { ok: true });
  assert.deepEqual(recipients, []);
});

test("provider 2xx without message ID cannot mint trusted provider receipt", async t => {
  const { recipients } = configure(t, {},
    new Response(JSON.stringify({ messages: [] }), {
      status: 200, headers: { "Content-Type": "application/json" },
    }));
  const result = await deliverAuthOtpWithProviderReceipt("+15550000001", "123456", "signup");
  assert.equal(result.ok, false);
  assert.deepEqual(recipients, ["15550000001"]);
});
