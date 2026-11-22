import assert from "node:assert/strict";
import test from "node:test";
import { googleMerchantHttpReady, googleOriginAllowed } from "../src/routes/auth-google-merchant-routes";
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
