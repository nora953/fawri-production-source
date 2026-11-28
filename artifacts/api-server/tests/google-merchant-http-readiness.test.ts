import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { googleMerchantHttpReady, googleOriginAllowed, googleMerchantIntentPolicyReady, googleMerchantIntentPhoneReady } from "../src/routes/auth-google-merchant-routes";
import { googleMerchantSignupLegalVersionsReady } from "../src/services/googleMerchantAdmissionAuthority";
import { isGoogleMerchantIdentityLinked } from "../src/services/googleMerchantIdentityAssurance";

const ready = {
  FAWRI_GOOGLE_OIDC_HTTP_READY: "1",
  FAWRI_GOOGLE_MERCHANT_ADMISSION_ENABLED: "1",
  FAWRI_OPERATIONAL_POSTGRES_AUTHORITY: "required",
  FAWRI_AUTH_POSTGRES_SESSION_AUTHORITY: "required",
  FAWRI_AUTH_DATABASE_URL: "postgresql://stub.local/fawri",
  FAWRI_GOOGLE_OAUTH_CLIENT_ID: "12345-fawri.apps.googleusercontent.com",
  FAWRI_AUTH_SECURITY_SECRET: "A".repeat(40),
  FAWRI_ALLOWED_ORIGINS: "https://fawri.example,https://merchant.fawri.example",
};

test("new Google merchant admission never begins without published legal policy versions", () => {
  assert.equal(googleMerchantSignupLegalVersionsReady({}), false);
  assert.equal(googleMerchantIntentPolicyReady("signup", {}), false);
  // Returning signed-in Google subject is not prevented by missing
  // versions; it creates no new merchant or legal acceptance.
  assert.equal(googleMerchantIntentPolicyReady("login", {}), true);
  // Missing, malformed and unknown intent cannot skip signup policy readiness.
  assert.equal(googleMerchantIntentPolicyReady(undefined, {}), false);
  assert.equal(googleMerchantIntentPolicyReady("", {}), false);
  const pinned = {
    FAWRI_V1_TERMS_VERSION: "terms-2026-11",
    FAWRI_V1_PRIVACY_VERSION: "privacy-2026-11",
  };
  assert.equal(googleMerchantSignupLegalVersionsReady(pinned), true);
  assert.equal(googleMerchantIntentPolicyReady("signup", pinned), true);
  assert.equal(googleMerchantIntentPolicyReady("unknown", pinned), false);
  assert.equal(googleMerchantIntentPolicyReady(undefined, pinned), false);
  for (const invalid of [
    { ...pinned, FAWRI_V1_TERMS_VERSION: "" },
    { ...pinned, FAWRI_V1_PRIVACY_VERSION: "?" },
    { ...pinned, FAWRI_V1_PRIVACY_VERSION: "a" },
  ]) {
    assert.equal(googleMerchantIntentPolicyReady("signup", invalid), false);
    assert.equal(googleMerchantIntentPolicyReady("login", invalid), true);
  }
});

test("Google merchant HTTP entry is securely disabled by default and if any prerequisite is missing", () => {
  assert.equal(googleMerchantHttpReady({}), false);
  assert.equal(googleMerchantHttpReady(ready), true);
  for (const key of Object.keys(ready).filter(k=>k!=="FAWRI_ALLOWED_ORIGINS")) {
    const incomplete = { ...ready };
    delete (incomplete as Record<string,string>)[key];
    assert.equal(googleMerchantHttpReady(incomplete), false, key);
  }
  assert.equal(googleMerchantHttpReady({...ready, FAWRI_ALLOWED_ORIGINS:undefined}), false);
  assert.equal(googleMerchantHttpReady({...ready, FAWRI_ALLOWED_ORIGINS:" ,  , "}), false);
  assert.equal(googleMerchantHttpReady({...ready, FAWRI_GOOGLE_OAUTH_CLIENT_ID:"attacker"}), false);
});

test("production Google readiness requires the exact canonical Fawri origin", () => {
  // This gate is relevant to the first commercial HTTPS hostname only; it
  // cannot be satisfied by the default Render/test origin or by www alone.
  const hosted = { ...ready, NODE_ENV: "production", FAWRI_DEPLOYMENT_MODE: "production" };
  assert.equal(googleMerchantHttpReady(hosted), false);
  assert.equal(googleMerchantHttpReady({
    ...hosted, FAWRI_ALLOWED_ORIGINS: "https://www.fawrireply.com,https://fawri-v1-commercial-gated-k9yj.onrender.com",
  }), false);
  assert.equal(googleMerchantHttpReady({
    ...hosted, FAWRI_ALLOWED_ORIGINS: "https://fawrireply.com",
  }), true);
  assert.equal(googleMerchantHttpReady({
    ...hosted, FAWRI_ALLOWED_ORIGINS: "https://fawrireply.com,https://www.fawrireply.com",
  }), true);
  assert.equal(googleMerchantHttpReady({
    ...hosted, FAWRI_ALLOWED_ORIGINS: "https://fawrireply.com.attacker.invalid",
  }), false);
  assert.equal(googleMerchantHttpReady({
    ...hosted, FAWRI_ALLOWED_ORIGINS: "http://fawrireply.com",
  }), false);
  assert.equal(googleMerchantHttpReady({
    ...ready, FAWRI_DEPLOYMENT_MODE: "staging",
  }), true);
});

test("Google merchant callback requires a POST with explicitly allowed browser origin", () => {
  const good = { method:"POST", headers:{origin:"https://merchant.fawri.example"} };
  assert.equal(googleOriginAllowed(good,ready), true);
  assert.equal(googleOriginAllowed({method:"GET",headers:good.headers},ready), false);
  assert.equal(googleOriginAllowed({method:"POST",headers:{}},ready), false);
  assert.equal(googleOriginAllowed({method:"POST",headers:{origin:"https://evil.invalid"}},ready), false);
  assert.equal(googleOriginAllowed(good,{...ready, FAWRI_ALLOWED_ORIGINS:""}), false);
});

test("Google-only identity assurance is false until explicit release approval", async t => {
  const names = ["FAWRI_GOOGLE_OIDC_HTTP_READY","FAWRI_GOOGLE_MERCHANT_ADMISSION_ENABLED"];
  const before = names.map(n=>process.env[n]);
  t.after(()=>names.forEach((n,i)=>{if(before[i]===undefined)delete process.env[n];else process.env[n]=before[i];}));
  delete process.env.FAWRI_GOOGLE_OIDC_HTTP_READY;
  assert.equal(await isGoogleMerchantIdentityLinked("merchant-"+ "1".repeat(36)),false);
  assert.equal(await isGoogleMerchantIdentityLinked("admin-one"),false);
});


test("new merchant Google signup refuses to strand the user when WhatsApp phone proof is OFF", () => {
  assert.equal(googleMerchantIntentPhoneReady("signup", false), false);
  assert.equal(googleMerchantIntentPhoneReady("signup", true), true);
  // Existing linked Google logins must remain usable even if WhatsApp
  // authentication or its production sender is temporarily unavailable.
  assert.equal(googleMerchantIntentPhoneReady("login", false), true);
  assert.equal(googleMerchantIntentPhoneReady("login", true), true);
  assert.equal(googleMerchantIntentPhoneReady(undefined, true), false);
  assert.equal(googleMerchantIntentPhoneReady("other", true), false);
});

test("WhatsApp signup readiness is checked before OIDC challenge issue and completion", () => {
  const route = readFileSync(new URL("../src/routes/auth-google-merchant-routes.ts", import.meta.url), "utf8");
  const begin = route.slice(route.indexOf('router.post("/google/begin"'), route.indexOf('router.post("/google/complete"'));
  const complete = route.slice(route.indexOf('router.post("/google/complete"'), route.indexOf('router.post("/google/phone/begin"'));
  assert.match(route, /phoneReady: boolean = googlePhoneClaimSourceReady\(\)/);
  for (const [part, action] of [
    [begin, "await issueGoogleOidcChallenge"],
    [complete, "const csrfProof = String"],
  ]) {
    const legal = part.indexOf('googleMerchantIntentPolicyReady(req.body?.intent)');
    const phone = part.indexOf('googleMerchantIntentPhoneReady(req.body?.intent)');
    const actionStart = part.indexOf(action);
    assert.ok(legal >= 0 && phone > legal && actionStart > phone,
      "new signup must reject before challenge issuance/consumption, without harming returning logins");
    assert.match(part, /GOOGLE_SIGNUP_PHONE_NOT_READY/);
  }
});
