import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import test from "node:test";
import {
  verifyOfflineEntitlementEnvelope,
  encodeOfflineEntitlementClaims,
} from "../src/lib/cashierOfflineEntitlementSignature.mjs";

const toBase64Url = (bytes) => Buffer.from(bytes).toString("base64url");

async function fixture() {
  const pair = await webcrypto.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"],
  );
  const publicJwk = await webcrypto.subtle.exportKey("jwk", pair.publicKey);
  const claims = {
    merchant_id: "merchant-1",
    station_id: "station-1",
    subscription_id: "subscription-1",
    state: "active",
    expires_at: "2026-11-01T00:00:00.000Z",
  };
  const payloadBytes = encodeOfflineEntitlementClaims(claims);
  const signatureBytes = new Uint8Array(await webcrypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" }, pair.privateKey, payloadBytes,
  ));
  return {
    claims,
    keys: { "test-key": publicJwk },
    envelope: {
      algorithm: "ES256",
      key_id: "test-key",
      payload: toBase64Url(payloadBytes),
      signature: toBase64Url(signatureBytes),
    },
  };
}

test("valid server-style signature verifies and returns signed claims", async () => {
  const { claims, keys, envelope } = await fixture();
  assert.deepEqual(await verifyOfflineEntitlementEnvelope(envelope, keys), claims);
});

test("tampered payload is rejected even when JSON remains well formed", async () => {
  const { keys, envelope } = await fixture();
  const altered = { ...envelope, payload: toBase64Url(encodeOfflineEntitlementClaims({
    merchant_id: "other-merchant",
    station_id: "station-1",
  })) };
  await assert.rejects(verifyOfflineEntitlementEnvelope(altered, keys));
});

test("unknown key identifier and substituted public key are rejected", async () => {
  const { keys, envelope } = await fixture();
  await assert.rejects(verifyOfflineEntitlementEnvelope({ ...envelope, key_id: "unknown" }, keys));
  const other = await fixture();
  await assert.rejects(verifyOfflineEntitlementEnvelope(envelope, other.keys));
});

test("unsupported algorithms, invalid signatures and private JWKs fail closed", async () => {
  const { keys, envelope } = await fixture();
  await assert.rejects(verifyOfflineEntitlementEnvelope({ ...envelope, algorithm: "none" }, keys));
  await assert.rejects(verifyOfflineEntitlementEnvelope({ ...envelope, signature: "invalid" }, keys));
  await assert.rejects(verifyOfflineEntitlementEnvelope(envelope, {
    "test-key": { ...keys["test-key"], d: "unexpected" },
  }));
});

test("missing keyring, missing key and invalid base64url are rejected", async () => {
  const { keys, envelope } = await fixture();
  await assert.rejects(verifyOfflineEntitlementEnvelope(envelope, null));
  await assert.rejects(verifyOfflineEntitlementEnvelope(envelope, { "test-key": null }));
  await assert.rejects(verifyOfflineEntitlementEnvelope({ ...envelope, payload: "A" }, keys));
  await assert.rejects(verifyOfflineEntitlementEnvelope({ ...envelope, signature: "A" }, keys));
});
