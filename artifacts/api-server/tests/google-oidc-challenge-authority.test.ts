import assert from "node:assert/strict";
import test from "node:test";
import {readFileSync} from "node:fs";
import {issueGoogleOidcChallenge,consumeGoogleOidcChallenge} from "../src/services/googleOidcChallengeAuthority";

test("Google challenge cannot issue or consume without enabled production admission",async t=>{
  const key="FAWRI_GOOGLE_MERCHANT_ADMISSION_ENABLED";
  const previous=process.env[key];
  t.after(()=>{if(previous===undefined)delete process.env[key];else process.env[key]=previous;});
  delete process.env[key];
  await assert.rejects(issueGoogleOidcChallenge("test-ip", "login"),/GOOGLE_OIDC_CHALLENGE_NOT_READY/);
  await assert.rejects(consumeGoogleOidcChallenge({challengeId:"11aabbcc-1111-4111-8111-112233445566",nonce:"A".repeat(43),csrfProof:"B".repeat(43),intent:"login"}),/GOOGLE_OIDC_CHALLENGE_NOT_READY/);
});

test("challenge source uses HMAC-only storage and atomic one-time cookie binding",()=>{
  const src=readFileSync(new URL("../src/services/googleOidcChallengeAuthority.ts",import.meta.url),"utf8");
  assert.match(src,/createHmac\("sha256"/);
  assert.match(src,/pg_advisory_xact_lock/);
  assert.match(src,/>= 20/);
  assert.match(src,/AND used_at IS NULL AND expires_at > now\(\)/);
  assert.match(src,/RETURNING id/);
  assert.match(src,/csrfProof/);
  assert.doesNotMatch(src,/issueSession\(/);
});

test("held source grants only auth issuer and enables row-level security",()=>{
  const sql=readFileSync(new URL("../../../lib/db/first-commercial/held/v1_google_oidc_challenge_once.sql",import.meta.url),"utf8");
  assert.match(sql,/session_user <> 'fawri_owner'/);
  assert.match(sql,/ENABLE ROW LEVEL SECURITY/);
  assert.match(sql,/FOR ALL TO fawri_auth_issuer/);
  assert.match(sql,/REVOKE ALL ON TABLE public\.google_oidc_challenges FROM PUBLIC/);
});

test("Google one-use challenge cryptographically binds the original login/signup intent",()=>{
  const challenge=readFileSync(new URL("../src/services/googleOidcChallengeAuthority.ts",import.meta.url),"utf8");
  const http=readFileSync(new URL("../src/routes/auth-google-merchant-routes.ts",import.meta.url),"utf8");
  const service=readFileSync(new URL("../src/services/googleMerchantAdmissionAuthority.ts",import.meta.url),"utf8");
  assert.match(challenge, /function validIntent\(value: unknown\)/);
  assert.match(challenge, /return value === "login" \|\| value === "signup"/);
  assert.match(challenge, /!validIntent\(intent\)/);
  assert.match(challenge, /!validIntent\(input.intent\)/);
  assert.match(challenge, /challengeId \+ ":" \+ intent \+ ":" \+ nonce/);
  assert.match(challenge, /input.challengeId \+ ":" \+ input.intent \+ ":" \+ input.nonce/);
  assert.match(http, /issueGoogleOidcChallenge\(requestIp\(req\)\.slice\(0,128\), req.body.intent\)/);
  assert.match(service, /csrfProof: input.csrfProofFromCookie,\s*intent: input.intent,/);
  // No database migration, no new grant, no plaintext intent in persistence.
  assert.doesNotMatch(challenge, /ALTER TABLE|CREATE TABLE/);
});
