// P0 offline entitlement cryptographic verification primitive.
// This module deliberately does not authorize offline sales on its own.
// Callers must separately enforce station/device binding, expiry, role and
// subscription state before using verified claims.
const encoder = new TextEncoder();
const decoder = new TextDecoder("utf-8", { fatal: true });

function bytesFromBase64Url(value) {
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]+$/.test(value) || value.length > 16384 || value.length % 4 === 1) {
    throw new Error("Invalid entitlement encoding");
  }
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  const output = [];
  let buffer = 0;
  let bits = 0;
  for (const char of normalized) {
    buffer = (buffer << 6) | alphabet.indexOf(char);
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      output.push((buffer >>> bits) & 255);
    }
  }
  if (bits > 0 && (buffer & ((1 << bits) - 1)) !== 0) {
    throw new Error("Invalid entitlement encoding");
  }
  const result = new Uint8Array(output);
  if (BufferlessBase64Url(result) !== value) throw new Error("Noncanonical entitlement encoding");
  return result;
}

function BufferlessBase64Url(bytes) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
  let result = "";
  let buffer = 0;
  let bits = 0;
  for (const byte of bytes) {
    buffer = (buffer << 8) | byte;
    bits += 8;
    while (bits >= 6) {
      bits -= 6;
      result += alphabet[(buffer >>> bits) & 63];
    }
  }
  if (bits > 0) result += alphabet[(buffer << (6 - bits)) & 63];
  return result;
}

/**
 * Verify the exact signed payload bytes. Public keys are provisioned by the
 * trusted application release, never taken from the untrusted envelope.
 *
 * @param {{payload:string,signature:string,key_id:string,algorithm:string}} envelope
 * @param {Record<string, JsonWebKey>} trustedPublicKeys
 * @returns {Promise<Record<string,unknown>>}
 */
export async function verifyOfflineEntitlementEnvelope(envelope, trustedPublicKeys) {
  if (!envelope || typeof envelope !== "object" || Array.isArray(envelope) ||
      envelope.algorithm !== "ES256" ||
      typeof envelope.key_id !== "string" ||
      !trustedPublicKeys || typeof trustedPublicKeys !== "object" ||
      !Object.hasOwn(trustedPublicKeys, envelope.key_id)) {
    throw new Error("Untrusted entitlement signing key or algorithm");
  }
  const keyJwk = trustedPublicKeys[envelope.key_id];
  if (!keyJwk || typeof keyJwk !== "object" || keyJwk.kty !== "EC" || keyJwk.crv !== "P-256" || keyJwk.d !== undefined ||
      keyJwk.key_ops?.some((operation) => operation !== "verify")) {
    throw new Error("Invalid trusted entitlement public key");
  }
  const payloadBytes = bytesFromBase64Url(envelope.payload);
  const signatureBytes = bytesFromBase64Url(envelope.signature);
  if (signatureBytes.length !== 64) throw new Error("Invalid entitlement signature");
  const key = await crypto.subtle.importKey(
    "jwk", keyJwk, { name: "ECDSA", namedCurve: "P-256" }, false, ["verify"],
  );
  const valid = await crypto.subtle.verify(
    { name: "ECDSA", hash: "SHA-256" }, key, signatureBytes, payloadBytes,
  );
  if (!valid) throw new Error("Entitlement signature verification failed");
  const claims = JSON.parse(decoder.decode(payloadBytes));
  if (!claims || typeof claims !== "object" || Array.isArray(claims)) {
    throw new Error("Invalid signed entitlement claims");
  }
  return claims;
}

export function encodeOfflineEntitlementClaims(claims) {
  // Issuers should pass a fixed-order, validated claim schema.
  return encoder.encode(JSON.stringify(claims));
}

/**
 * Validate the immutable identity and lifecycle of verified claims.
 * Call only with claims returned by verifyOfflineEntitlementEnvelope.
 */
export function assertOfflineEntitlementClaims(claims, binding, nowMs) {
  if (!claims || typeof claims !== "object" || Array.isArray(claims) ||
      !binding || typeof binding !== "object" ||
      claims.purpose !== "fawri.cashier.offline-entitlement.v1" ||
      typeof binding.merchant_id !== "string" || !binding.merchant_id ||
      typeof binding.station_id !== "string" || !binding.station_id ||
      typeof binding.device_id !== "string" || !binding.device_id ||
      claims.merchant_id !== binding.merchant_id ||
      claims.station_id !== binding.station_id ||
      claims.device_id !== binding.device_id ||
      typeof claims.subscription_id !== "string" || !claims.subscription_id ||
      (claims.state !== "active" && claims.state !== "grace") ||
      !Number.isSafeInteger(claims.licensed_seats) || claims.licensed_seats <= 0 ||
      !Number.isSafeInteger(claims.version) || claims.version <= 0 ||
      !Number.isFinite(nowMs) || nowMs < 0) {
    throw new Error("Invalid offline entitlement claims or station binding");
  }
  const issued = Date.parse(claims.server_time);
  const billingEnd = Date.parse(claims.billing_period_end);
  const graceEnd = Date.parse(claims.grace_until);
  if (!Number.isFinite(issued) || !Number.isFinite(billingEnd) ||
      !Number.isFinite(graceEnd) || billingEnd >= graceEnd ||
      issued >= graceEnd || nowMs >= graceEnd ||
      nowMs + 120000 < issued) {
    throw new Error("Offline entitlement is outside its valid period");
  }
  return claims;
}
