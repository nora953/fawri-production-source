import {
  getOrCreateCashierDeviceIdentity,
  writeCashierDeviceIdentity,
} from './cashierOperatorSessionRuntime';

const STATION_BINDING_INVALID_CODES = new Set([
  'CASHIER_STATION_CREDENTIAL_INVALID',
  'CASHIER_STATION_PAIRING_REQUIRED',
]);
const DURABLE_STATION_METADATA_TTL_MS = 180 * 24 * 60 * 60 * 1000;

function codeOf(error: unknown): string {
  if (!error || typeof error !== 'object' || !('code' in error)) return '';
  return String((error as { code?: unknown }).code || '');
}

export function isCashierStationBindingInvalidError(error: unknown): boolean {
  return STATION_BINDING_INVALID_CODES.has(codeOf(error));
}

/**
 * The station credential expiry field is retained as compatibility metadata,
 * but it is no longer allowed to tear down a valid paired-device binding.
 * Refresh stale metadata before the cashier gate reads the binding; the server
 * still validates token/device/version/station state and explicit revocation.
 */
export async function refreshDurableCashierStationBindingMetadata(): Promise<void> {
  const identity = await getOrCreateCashierDeviceIdentity();
  if (
    !identity.cloud_merchant_id ||
    !identity.station_id ||
    !identity.station_token
  ) {
    return;
  }

  const expiresAt = identity.station_credential_expires_at
    ? new Date(identity.station_credential_expires_at).getTime()
    : Number.NaN;
  if (Number.isFinite(expiresAt) && expiresAt > Date.now()) return;

  await writeCashierDeviceIdentity({
    ...identity,
    station_credential_expires_at: new Date(
      Date.now() + DURABLE_STATION_METADATA_TTL_MS,
    ).toISOString(),
  });
}

/**
 * Clear only the cloud station binding. The stable device identity, merchant
 * binding, and local cashier operation stores remain untouched so recovery
 * cannot silently discard unsynchronized commerce data.
 */
export async function clearInvalidCashierStationBinding(): Promise<void> {
  const identity = await getOrCreateCashierDeviceIdentity();
  const next = { ...identity };
  delete next.station_id;
  delete next.station_name;
  delete next.branch_key;
  delete next.branch_label;
  delete next.offline_inventory_authority;
  delete next.station_token;
  delete next.station_credential_expires_at;
  delete next.last_catalog_sync_at;
  await writeCashierDeviceIdentity(next);
}
