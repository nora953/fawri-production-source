import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { deliverAuthOtp } from "../src/services/authOtpDelivery";
import type { OtpPurpose } from "../src/services/authSecurityTypes";

function configure(t: TestContext, overrides: NodeJS.ProcessEnv = {}) {
  const settings: NodeJS.ProcessEnv = {
    NODE_ENV: "production",
    FAWRI_DEPLOYMENT_MODE: undefined,
    AUTH_ALLOW_DEV_OTP_BYPASS: "true",
    OTP_DELIVERY_CHANNEL: "whatsapp",
    WHATSAPP_ACCESS_TOKEN: "synthetic-test-token",
    WHATSAPP_PHONE_NUMBER_ID: "synthetic-sender",
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
  t.mock.method(globalThis, "fetch", async (_url: unknown, options: RequestInit) => {
    recipients.push(JSON.parse(String(options.body)).to);
    return new Response(null, { status: 200 });
  });
  return recipients;
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
      const recipients = configure(t, env);
      assert.deepEqual(await deliverAuthOtp("+1 (555) 000-0001", "123456", purpose), { ok: true });
      assert.deepEqual(recipients, ["15550000001"]);
    });
  }
}

for (const nodeEnv of ["development", "test"]) {
  test(`${nodeEnv} retains explicit test recipient override`, async t => {
    const recipients = configure(t, { NODE_ENV: nodeEnv, AUTH_ALLOW_DEV_OTP_BYPASS: "false" });
    assert.deepEqual(await deliverAuthOtp("+15550000001", "123456", "signup"), { ok: true });
    assert.deepEqual(recipients, ["15550000002"]);
  });
  test(`${nodeEnv} retains explicitly enabled delivery bypass`, async t => {
    const recipients = configure(t, { NODE_ENV: nodeEnv });
    assert.deepEqual(await deliverAuthOtp("+15550000001", "123456", "signup"), { ok: true });
    assert.deepEqual(recipients, []);
  });
}

test("a production test recipient cannot replace a missing intended recipient", async t => {
  const recipients = configure(t);
  const result = await deliverAuthOtp("", "123456", "signup");
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.code, "OTP_DELIVERY_NOT_CONFIGURED");
  assert.deepEqual(recipients, []);
});
