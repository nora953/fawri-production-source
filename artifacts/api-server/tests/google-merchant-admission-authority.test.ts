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
      intent: "signup", idToken: "fake", expectedNonce: "client-nonce",
      challengeId: "fake", csrfProofFromCookie: "fake",
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
  assert.match(source, /consumeGoogleOidcChallenge\(/);
  assert.match(source, /csrfProof: input\.csrfProofFromCookie/);
  assert.match(source, /if \(!consumed\) throw new Error\("GOOGLE_OIDC_CHALLENGE_INVALID"\)/);
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

test("Google callback consumes its cookie-bound nonce before any remote signing-key or RSA work", () => {
  const source = readFileSync(
    new URL("../src/services/googleMerchantAdmissionAuthority.ts", import.meta.url), "utf8",
  );
  const begin = source.indexOf("export async function admitPendingGoogleMerchant");
  const consume = source.indexOf("const consumed = await consumeGoogleOidcChallenge({", begin);
  const refuse = source.indexOf('if (!consumed) throw new Error("GOOGLE_OIDC_CHALLENGE_INVALID")', consume);
  const verify = source.indexOf("const identity = await verifyGoogleIdTokenSignature(", begin);
  const admit = source.indexOf("return withAuthenticationTransaction(async client =>", verify);
  assert.ok(begin >= 0 && consume > begin && refuse > consume &&
    verify > refuse && admit > verify,
    "invalid/replayed nonce must be rejected before a Google JWKS fetch or RSA signature check");
  // Nonce still MUST be validated in the signed ID token, not merely consumed.
  assert.match(source.slice(verify, admit), /input\.idToken,\s*clientId,\s*input\.expectedNonce/);
  assert.match(source.slice(consume, verify), /csrfProof: input\.csrfProofFromCookie/);
});

test("returning Google merchant needs only signed subject, never a new-store profile", () => {
  const source = readFileSync(
    new URL("../src/services/googleMerchantAdmissionAuthority.ts", import.meta.url), "utf8",
  );
  const existing = source.indexOf("if (existing[0])");
  const profileValidation = source.indexOf("const ownerName = validatedText(input.ownerName, 160)");
  const profileInsert = source.indexOf("INSERT INTO public.accounts");
  assert.ok(existing >= 0 && profileValidation > existing && profileInsert > profileValidation);
  assert.match(source, /return \{ accountId: existing\[0\]\.id, created: false, trialActivated: false \}/);
  assert.match(source, /if \(input\.language !== "ar" && input\.language !== "en" && input\.language !== "ku"\)/);
  assert.match(source, /GOOGLE_MERCHANT_PROFILE_INVALID/);
  assert.match(source, /if \(!consumed\) throw new Error\("GOOGLE_OIDC_CHALLENGE_INVALID"\)/);
  // Browser input must never link a subject by user-submitted email.
  assert.doesNotMatch(source, /WHERE.*email\s*=/);
});

test("new Google merchant requires explicit server-side legal consent, but linked merchant can return", () => {
  const service = readFileSync(
    new URL("../src/services/googleMerchantAdmissionAuthority.ts", import.meta.url), "utf8",
  );
  const route = readFileSync(
    new URL("../src/routes/auth-google-merchant-routes.ts", import.meta.url), "utf8",
  );
  const existing = service.indexOf("if (existing[0])");
  const consent = service.indexOf("input.agreeTerms !== true || input.confirmLegal !== true");
  const inserted = service.indexOf("INSERT INTO public.accounts");
  assert.ok(existing >= 0 && consent > existing && inserted > consent);
  assert.match(service, /GOOGLE_MERCHANT_LEGAL_CONSENT_REQUIRED/);
  assert.match(route, /agreeTerms: req.body.agree_terms/);
  assert.match(route, /confirmLegal: req.body.confirm_legal/);
});

test("new Google merchant persists approved legal revisions transactionally, returning merchant never rewrites", () => {
  const source = readFileSync(
    new URL("../src/services/googleMerchantAdmissionAuthority.ts", import.meta.url), "utf8",
  );
  const sql = readFileSync(
    new URL("../../../lib/db/first-commercial/held/v1_google_merchant_legal_consent_source.sql", import.meta.url), "utf8",
  );
  const existing = source.indexOf("if (existing[0])");
  // The shared readiness helper appears earlier in the file; assert the
  // actual transaction-local policy pin is after linked-account lookup.
  const versions = source.indexOf("const termsVersion = String(process.env.FAWRI_V1_TERMS_VERSION", existing);
  const insert = source.indexOf("INSERT INTO public.merchants");
  assert.ok(existing >= 0 && versions > existing && insert > versions);
  assert.match(source, /GOOGLE_MERCHANT_LEGAL_VERSION_NOT_READY/);
  assert.match(source, /google_signup_terms_version, google_signup_privacy_version, google_signup_consented_at/);
  assert.match(source, /'ineligible', 'direct', \$8, \$9, \$10, now\(\)/);
  assert.match(source, /termsVersion, privacyVersion/);
  assert.match(source, /withAuthenticationTransaction\(async client =>/);
  assert.match(sql, /HELD \/ REVIEW REQUIRED \/ NOT IN DRIZZLE LEDGER/);
  assert.match(sql, /CREATE TRIGGER merchants_google_signup_consent_immutable_guard/);
  assert.match(sql, /CHECK \(/);
  assert.match(sql, /google_signup_terms_version IS NULL/);
  assert.match(sql, /google_signup_privacy_version IS NOT NULL/);
  assert.match(sql, /GOOGLE_SIGNUP_CONSENT_IMMUTABLE/);
  assert.doesNotMatch(sql, /UPDATE public\.merchants\s+SET/);
  assert.doesNotMatch(sql, /DEFAULT\s+(true|now\(\))/i);
  assert.equal(sql.split("COMMIT;").length, 2);
});


test("login-only Google challenge cannot create an unlinked merchant even with a crafted full profile", () => {
  const service = readFileSync(
    new URL("../src/services/googleMerchantAdmissionAuthority.ts", import.meta.url), "utf8",
  );
  const route = readFileSync(
    new URL("../src/routes/auth-google-merchant-routes.ts", import.meta.url), "utf8",
  );
  const existing = service.indexOf("if (existing[0])");
  const loginGuard = service.indexOf('if (input.intent !== "signup")', existing);
  const consent = service.indexOf("input.agreeTerms !== true || input.confirmLegal !== true", loginGuard);
  const insert = service.indexOf("INSERT INTO public.accounts", consent);
  assert.ok(existing >= 0 && loginGuard > existing && consent > loginGuard && insert > consent,
    "login-only admission must reject before new merchant insert/consent path");
  assert.match(service, /GOOGLE_MERCHANT_SIGNUP_INTENT_REQUIRED/);
  assert.match(route, /intent: req\.body\.intent/);
});
