import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { admitPendingGoogleMerchant } from "../src/services/googleMerchantAdmissionAuthority";

test("Google account admission cannot activate without approved environment gates", async t => {
  const keys = [
    "FAWRI_GOOGLE_MERCHANT_ADMISSION_ENABLED",
    "FAWRI_OPERATIONAL_POSTGRES_AUTHORITY",
    "FAWRI_AUTH_POSTGRES_SESSION_AUTHORITY",
    "FAWRI_GOOGLE_OAUTH_CLIENT_ID",
  ];
  const previous = Object.fromEntries(keys.map(k => [k, process.env[k]]));
  t.after(() => {
    for (const [k, v] of Object.entries(previous)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  });
  delete process.env.FAWRI_GOOGLE_MERCHANT_ADMISSION_ENABLED;
  delete process.env.FAWRI_GOOGLE_OAUTH_CLIENT_ID;
  await assert.rejects(
    admitPendingGoogleMerchant({
      idToken: "fake", expectedNonce: "client-nonce",
      ownerName: "Owner", storeName: "Shop", activityType: "retail",
      countryCode: "US", language: "en",
    }),
    /GOOGLE_MERCHANT_ADMISSION_NOT_READY/,
  );
});

test("Google account admission is subject-scoped, pending only, never an automatic free trial", () => {
  const source = readFileSync(
    new URL("../src/services/googleMerchantAdmissionAuthority.ts", import.meta.url), "utf8",
  );
  assert.match(source, /verifyGoogleIdTokenSignature\(/);
  assert.match(source, /input\.idToken,\s*clientId,\s*input\.expectedNonce/);
  assert.match(source, /withAuthenticationTransaction\(async client =>/);
  assert.match(source, /a\.google_issuer = \$1 AND a\.google_subject = \$2/);
  assert.match(source, /FOR UPDATE OF a/);
  assert.match(source, /JOIN public\.merchants AS m/);
  assert.match(source, /'merchant', NULL, \$2, 'active', \$3, false, \$4, \$5/);
  assert.match(source, /'ineligible', 'direct', \$8/);
  assert.match(source, /return \{ accountId, created: true, trialActivated: false \}/);
  assert.doesNotMatch(source, /trial_started_at\s*=/);
  assert.doesNotMatch(source, /phone_verified\s*=\s*true/);
  assert.doesNotMatch(source, /issueSession\(/);
  assert.doesNotMatch(source, /INSERT INTO public\.subscriptions/);
});
