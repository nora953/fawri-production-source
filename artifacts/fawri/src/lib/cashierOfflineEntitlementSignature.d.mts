export type CashierOfflineEnvelope = {
  algorithm: string; key_id: string; payload: string; signature: string;
};
export type CashierOfflineBinding = {
  merchant_id: string; station_id: string; device_id: string;
  location_id: string; credential_version: number;
};
export type CashierOfflineClaims = CashierOfflineBinding & {
  purpose: string; key_id: string; offline_inventory_authority: true;
  subscription_id: string; state: 'active' | 'grace'; licensed_seats: number;
  version: number; server_time: string; billing_period_end: string;
  grace_until: string; expires_at: string;
};
export function verifyCashierOfflineAuthorization(envelope: CashierOfflineEnvelope, keys: Record<string, JsonWebKey>, binding: CashierOfflineBinding, nowMs: number): Promise<CashierOfflineClaims>;
export function verifyOfflineEntitlementEnvelope(envelope: CashierOfflineEnvelope, keys: Record<string, JsonWebKey>): Promise<Record<string, unknown>>;
export function assertOfflineEntitlementClaims(claims: Record<string, unknown>, binding: Record<string, unknown>, nowMs: number): Record<string, unknown>;
export function encodeOfflineEntitlementClaims(claims: unknown): Uint8Array;
