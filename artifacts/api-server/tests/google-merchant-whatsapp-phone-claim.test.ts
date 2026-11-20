import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { isPendingMerchantPathAllowed } from "../src/services/authPolicy";
import { googlePhoneClaimSourceReady } from "../src/services/postgresMerchantAuthSecurityAuthority";

const routes = readFileSync(new URL("../src/routes/auth-google-merchant-routes.ts", import.meta.url), "utf8");
const issuer = readFileSync(new URL("../src/services/postgresMerchantAuthSecurityAuthority.ts", import.meta.url), "utf8");
const ui = readFileSync(new URL("../../fawri/src/components/GoogleMerchantPhoneVerification.tsx", import.meta.url), "utf8");
const pending = readFileSync(new URL("../../fawri/src/pages/PendingPage.tsx", import.meta.url), "utf8");

test("Google WhatsApp phone proof is not enabled by ordinary Google OIDC rollout", t => {
  const flag = "FAWRI_GOOGLE_PHONE_CLAIM_ENABLED";
  const was = process.env[flag];
  t.after(() => { if (was === undefined) delete process.env[flag]; else process.env[flag] = was; });
  delete process.env[flag];
  assert.equal(googlePhoneClaimSourceReady(), false);
  process.env[flag] = "1";
  // This is never sufficient without production WhatsApp proof admission.
  assert.equal(googlePhoneClaimSourceReady(), false);
});

test("pending Google phone endpoints only allow POST and do not enable commerce", () => {
  for (const path of ["/api/auth/google/phone/begin", "/api/auth/google/phone/verify"]) {
    assert.equal(isPendingMerchantPathAllowed("POST", path), true);
    assert.equal(isPendingMerchantPathAllowed("GET", path), false);
    assert.equal(isPendingMerchantPathAllowed("DELETE", path), false);
  }
  assert.equal(isPendingMerchantPathAllowed("POST", "/api/orders"), false);
  assert.match(routes, /router.post\("\/google\/phone\/begin", requireSecureMerchantSession/);
  assert.match(routes, /router.post\("\/google\/phone\/verify", requireSecureMerchantSession/);
  assert.match(routes, /googleOriginAllowed\(req\)/);
  assert.match(routes, /isGoogleMerchantIdentityLinked\(accountId\)/);
  assert.match(routes, /googleMerchantHttpReady\(\) \|\| !googlePhoneClaimSourceReady\(\)/);
  assert.match(routes, /googleMerchantAccountId: accountId/);
  assert.match(routes, /expectedGoogleAccountId: accountId/);
  assert.doesNotMatch(routes, /googleMerchantAccountId: req.body/);
  assert.doesNotMatch(routes, /expectedGoogleAccountId: req.body/);
});

test("Google WhatsApp is accepted by provider before proof and claimed only after OTP redemption", () => {
  assert.match(routes, /deliverAuthOtpWithProviderReceipt\(phone, issued.code, "signup"\)/);
  assert.match(routes, /recordAcceptedSignupWhatsAppTemplate/);
  assert.match(routes, /revokeMerchantOtpChallengeAuthoritative\(challengeId\)/);
  assert.match(routes, /status !== "verified"/);
  assert.match(routes, /trial_activated: false/);
  assert.match(issuer, /process.env.FAWRI_GOOGLE_PHONE_CLAIM_ENABLED === "1"/);
  assert.match(issuer, /process.env.FAWRI_WHATSAPP_TRIAL_PROOF_SOURCE_ENABLED === "1"/);
  assert.match(issuer, /a.phone IS NULL AND a.phone_verified=false/);
  assert.match(issuer, /googleUnbound = Boolean\(input.expectedGoogleAccountId/);
  assert.match(issuer, /input.expectedGoogleAccountId === challenge.account_id/);
  assert.match(issuer, /"phone=$2," : ""/);
  assert.match(issuer, /trial_wa_proof_challenge_id=\$5/);
  assert.match(issuer, /"SELECT id FROM public.accounts WHERE phone=\$1 LIMIT 1 FOR UPDATE"/);
  assert.match(issuer, /return "invalid" as const/);
  assert.match(routes, /\/\^\\d\{6\}\$\//);
});

test("pending page reveals WhatsApp form only to session-confirmed phone-less merchants", () => {
  assert.match(pending, /view === 'pending_review' && <GoogleMerchantPhoneVerification/);
  assert.match(ui, /VITE_FAWRI_GOOGLE_MERCHANT_SIGNUP === '1'/);
  assert.match(ui, /VITE_FAWRI_GOOGLE_PHONE_CLAIM === '1'/);
  assert.match(ui, /fetch\('\/api\/auth\/me'/);
  assert.match(ui, /!account.account.phone && account.account.otp_verified === false/);
  assert.match(ui, /account.merchant_profile\?\.accountStatus === 'pending_review'/);
  assert.match(ui, /credentials: 'same-origin'/);
  assert.match(ui, /trial_activated !== false/);
  assert.doesNotMatch(ui, /localStorage|sessionStorage/);
});
