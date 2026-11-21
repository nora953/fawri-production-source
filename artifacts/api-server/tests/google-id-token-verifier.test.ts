import assert from "node:assert/strict";
import crypto from "node:crypto";
import test, { type TestContext } from "node:test";
import { verifyGoogleIdTokenSignature } from "../src/services/googleIdTokenVerifier";

const AUD = "12345-fawri-testing.apps.googleusercontent.com";
const JWKS = "https://www.googleapis.com/oauth2/v3/certs";

function fixture() {
  const { privateKey, publicKey } = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
  const jwk = publicKey.export({ format: "jwk" });
  const kid = crypto.randomUUID();
  const body = JSON.stringify({ keys: [{ ...jwk, kid, use: "sig", alg: "RS256" }] });
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iss: "https://accounts.google.com", aud: AUD, sub: "123456789012345678901",
    iat: now - 10, exp: now + 1200, email: "first@example.invalid",
    email_verified: true,
    nonce: "UjhdERBrgdoZdB1YZz_7IexTPlSuVz9IJ4TAjtQmB3c",
  };
  function sign(claims = payload, header = { alg: "RS256", kid, typ: "JWT" }) {
    const first = Buffer.from(JSON.stringify(header)).toString("base64url");
    const second = Buffer.from(JSON.stringify(claims)).toString("base64url");
    const signature = crypto.sign("RSA-SHA256", Buffer.from(first + "." + second), privateKey).toString("base64url");
    return first + "." + second + "." + signature;
  }
  return { body, payload, kid, sign };
}

function mockKeys(t: TestContext, body: string) {
  const calls: string[] = [];
  t.mock.method(globalThis, "fetch", async (url: unknown, init?: RequestInit) => {
    calls.push(String(url));
    assert.equal(String(url), JWKS);
    assert.equal(init?.redirect, "error");
    return new Response(body, {
      status: 200,
      headers: { "cache-control": "public, max-age=300" },
    });
  });
  return calls;
}

test("cryptographically verified stable Google sub; never trusts mutable email as identity", async t => {
  const f = fixture();
  const calls = mockKeys(t, f.body);
  const result = await verifyGoogleIdTokenSignature(f.sign(), AUD);
  assert.deepEqual(result, {
    issuer: "https://accounts.google.com", subject: f.payload.sub, audience: AUD,
  });
  assert.deepEqual(Object.keys(result).sort(), ["audience", "issuer", "subject"]);
  assert.equal(calls.length, 1);
});

test("different email with same signed sub cannot create a different identity", async t => {
  const f = fixture();
  mockKeys(t, f.body);
  const a = await verifyGoogleIdTokenSignature(f.sign(), AUD);
  const b = await verifyGoogleIdTokenSignature(f.sign({ ...f.payload, email: "changed@example.invalid" }), AUD);
  assert.equal(a.subject, b.subject);
});

test("rejects wrong issuer, audience, authorized party, expiry, future iat and invalid sub", async t => {
  const f = fixture();
  mockKeys(t, f.body);
  for (const overrides of [
    { iss: "https://attacker.example" },
    { aud: "12345-other.apps.googleusercontent.com" },
    { azp: "12345-other.apps.googleusercontent.com" },
    { exp: f.payload.iat },
    { exp: Math.floor(Date.now() / 1000) - 1 },
    { iat: Math.floor(Date.now() / 1000) + 3600 },
    { sub: "" },
    { sub: "invalid id!" },
    { exp: String(f.payload.exp) },
  ]) {
    await assert.rejects(
      verifyGoogleIdTokenSignature(f.sign({ ...f.payload, ...overrides }), AUD),
      /GOOGLE_ID_TOKEN_REJECTED/,
    );
  }
});

test("rejects unsigned, wrong algorithm, tampered signature and wrong client config", async t => {
  const f = fixture();
  mockKeys(t, f.body);
  const valid = f.sign();
  for (const input of [
    ["", AUD],
    [valid.split(".").slice(0, 2).join(".") + ".", AUD],
    [f.sign(f.payload, { alg: "none", kid: f.kid }), AUD],
    [f.sign(f.payload, { alg: "HS256", kid: f.kid }), AUD],
    [valid.slice(0, -1) + (valid.at(-1) === "A" ? "B" : "A"), AUD],
    [valid, "12345-different.apps.googleusercontent.com"],
    [valid, ""],
  ]) {
    await assert.rejects(
      verifyGoogleIdTokenSignature(input[0]!, input[1]!),
      /GOOGLE_ID_TOKEN_REJECTED/,
    );
  }
});

test("rejects arbitrary unknown signing key even if correctly signed by attacker", async t => {
  const f = fixture();
  mockKeys(t, f.body);
  await assert.rejects(
    verifyGoogleIdTokenSignature(
      f.sign(f.payload, { alg: "RS256", kid: crypto.randomUUID() }), AUD,
    ), /GOOGLE_ID_TOKEN_REJECTED/,
  );
});

test("rejects JWKS service errors instead of accepting unverified tokens", async t => {
  const f = fixture();
  t.mock.method(globalThis, "fetch", async () => new Response("unavailable", { status: 503 }));
  await assert.rejects(verifyGoogleIdTokenSignature(f.sign(), AUD), /GOOGLE_ID_TOKEN_REJECTED/);
});

test("never accepts a forged payload with modified subject but original signature", async t => {
  const f = fixture();
  mockKeys(t, f.body);
  const parts = f.sign().split(".");
  parts[1] = Buffer.from(JSON.stringify({ ...f.payload, sub: "attacker" })).toString("base64url");
  await assert.rejects(verifyGoogleIdTokenSignature(parts.join("."), AUD), /GOOGLE_ID_TOKEN_REJECTED/);
});

test("login-bound verifier accepts only a matching signed nonce, never missing/replayed browser input", async t => {
  const f = fixture();
  mockKeys(t, f.body);
  const verified = await verifyGoogleIdTokenSignature(f.sign(), AUD, f.payload.nonce);
  assert.equal(verified.subject, f.payload.sub);
  for (const expected of ["", "not-base64", "UjhdERBrgdoZdB1YZz_7IexTPlSuVz9IJ4TAjtQmB3d"]) {
    await assert.rejects(verifyGoogleIdTokenSignature(f.sign(), AUD, expected), /GOOGLE_ID_TOKEN_REJECTED/);
  }
  await assert.rejects(
    verifyGoogleIdTokenSignature(f.sign({ ...f.payload, nonce: "" }), AUD, f.payload.nonce),
    /GOOGLE_ID_TOKEN_REJECTED/,
  );
});
