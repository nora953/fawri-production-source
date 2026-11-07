import { createPrivateKey, createPublicKey, sign } from "node:crypto";
import type { CashierEntitlementSnapshot } from "./cashierEntitlementAuthority";
import type { CashierStationContext } from "./postgresCashierStaffAuthority";

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
export type CashierOfflineEnvelope = {
  algorithm: "ES256";
  key_id: string;
  payload: string;
  signature: string;
};

// Input comes exclusively from the authenticated station + licensed subscription
// middleware, never from request body fields. Configuration errors disable offline
// issuance only; existing server-authorized online operations remain available.
export function issueCashierOfflineEntitlement(
  snapshot: CashierEntitlementSnapshot | null,
  station: CashierStationContext | null,
  env: NodeJS.ProcessEnv = process.env,
): CashierOfflineEnvelope | null {
  try {
    if (!snapshot || !station || station.offline_inventory_authority !== true ||
        snapshot.merchant_id !== station.merchant_id ||
        !station.station_id || !station.device_id || !station.location_id ||
        !Number.isSafeInteger(station.credential_version) || station.credential_version <= 0 ||
        (snapshot.state !== "active" && snapshot.state !== "grace") ||
        !snapshot.subscription_id || !Number.isSafeInteger(snapshot.version) || snapshot.version <= 0 ||
        !Number.isSafeInteger(snapshot.licensed_seats) || snapshot.licensed_seats <= 0) return null;
    const issued = Date.parse(snapshot.server_time);
    const billingEnd = Date.parse(snapshot.billing_period_end || "");
    const graceEnd = Date.parse(snapshot.grace_until || "");
    const credentialEnd = Date.parse(station.credential_expires_at);
    const expires = Math.min(graceEnd, billingEnd + SEVEN_DAYS_MS, credentialEnd, issued + SEVEN_DAYS_MS);
    if (![issued, billingEnd, graceEnd, credentialEnd, expires].every(Number.isFinite) ||
        graceEnd <= billingEnd || expires <= issued) return null;
    const keyId = env.FAWRI_CASHIER_OFFLINE_KEY_ID || "";
    if (!/^[A-Za-z0-9_-]{1,80}$/.test(keyId)) return null;
    const jwk = JSON.parse(env.FAWRI_CASHIER_OFFLINE_PRIVATE_JWK || "null");
    const ring = JSON.parse(env.FAWRI_CASHIER_OFFLINE_PUBLIC_KEYS || "null");
    if (!jwk || jwk.kty !== "EC" || jwk.crv !== "P-256" || !jwk.d ||
        !ring || !Object.hasOwn(ring, keyId)) return null;
    // Reject private material anywhere in the public distribution configuration.
    for (const publicJwk of Object.values(ring) as Record<string, unknown>[]) {
      if (!publicJwk || publicJwk.kty !== "EC" || publicJwk.crv !== "P-256" ||
          publicJwk.d !== undefined) return null;
    }
    const privateKey = createPrivateKey({ key: jwk, format: "jwk" });
    const publicKey = createPublicKey(privateKey).export({ format: "jwk" });
    if (publicKey.x !== ring[keyId].x || publicKey.y !== ring[keyId].y) return null;
    const claims = {
      purpose: "fawri.cashier.offline-entitlement.v1",
      key_id: keyId,
      merchant_id: station.merchant_id,
      station_id: station.station_id,
      device_id: station.device_id,
      location_id: station.location_id,
      credential_version: station.credential_version,
      offline_inventory_authority: true,
      subscription_id: snapshot.subscription_id,
      state: snapshot.state,
      licensed_seats: snapshot.licensed_seats,
      version: snapshot.version,
      server_time: new Date(issued).toISOString(),
      billing_period_end: new Date(billingEnd).toISOString(),
      grace_until: new Date(graceEnd).toISOString(),
      expires_at: new Date(expires).toISOString(),
    };
    const bytes = Buffer.from(JSON.stringify(claims), "utf8");
    return {
      algorithm: "ES256", key_id: keyId, payload: bytes.toString("base64url"),
      signature: sign("sha256", bytes, { key: privateKey, dsaEncoding: "ieee-p1363" }).toString("base64url"),
    };
  } catch {
    // No configuration values, key material or raw crypto errors enter logs/API.
    return null;
  }
}
