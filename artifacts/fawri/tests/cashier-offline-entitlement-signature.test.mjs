import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import test from "node:test";
import {
  verifyOfflineEntitlementEnvelope,
  assertOfflineEntitlementClaims,
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

test("noncanonical base64url encodings are rejected", async () => {
  const { keys, envelope } = await fixture();
  await assert.rejects(verifyOfflineEntitlementEnvelope({ ...envelope, payload: "Zh" }, keys));
  await assert.rejects(verifyOfflineEntitlementEnvelope({ ...envelope, signature: "Zh" }, keys));
});

test("valid signature remains bound to the exact original claim bytes", async () => {
  const { keys, envelope } = await fixture();
  const claims = await verifyOfflineEntitlementEnvelope(envelope, keys);
  assert.equal(claims.merchant_id, "merchant-1");
  assert.equal(claims.station_id, "station-1");
  assert.equal(claims.subscription_id, "subscription-1");
  assert.equal(claims.state, "active");
});

test("signature verification rejects payload mutation after signing", async () => {
  const { keys, envelope, claims } = await fixture();
  const changed = { ...claims, licensed_seats: 999 };
  await assert.rejects(
    verifyOfflineEntitlementEnvelope({
      ...envelope,
      payload: toBase64Url(encodeOfflineEntitlementClaims(changed)),
    }, keys),
  );
});

test("verified claims enforce purpose, station, device and expiry", async () => {
  const { claims } = await fixture();
  const signedClaims = {
    ...claims,
    purpose: "fawri.cashier.offline-entitlement.v1",
    device_id: "device-1",
    licensed_seats: 1,
    version: 1,
    server_time: "2026-10-24T00:00:00.000Z",
    billing_period_end: "2026-10-25T00:00:00.000Z",
    grace_until: "2026-11-01T00:00:00.000Z",
  };
  const binding = { merchant_id: "merchant-1", station_id: "station-1", device_id: "device-1" };
  const now = Date.parse("2026-10-24T12:00:00.000Z");
  assert.equal(assertOfflineEntitlementClaims(signedClaims, binding, now), signedClaims);
  assert.throws(() => assertOfflineEntitlementClaims(signedClaims, { ...binding, device_id: "other" }, now));
  assert.throws(() => assertOfflineEntitlementClaims(signedClaims, { ...binding, station_id: "other" }, now));
  assert.throws(() => assertOfflineEntitlementClaims({ ...signedClaims, purpose: "other" }, binding, now));
  assert.throws(() => assertOfflineEntitlementClaims(signedClaims, binding, Date.parse("2026-11-01T00:00:00.000Z")));
});
