import {
  getOrCreateCashierDeviceIdentity,
  writeCashierDeviceIdentity,
} from './cashierOperatorSessionRuntime';

const STATION_BINDING_INVALID_CODES = new Set([
  'CASHIER_STATION_CREDENTIAL_INVALID',
  'CASHIER_STATION_PAIRING_REQUIRED',
]);
const DURABLE_STATION_METADATA_EXPIRES_AT = '9999-12-31T23:59:59.999Z';

function codeOf(error: unknown): string {
  if (!error || typeof error !== 'object' || !('code' in error)) return '';
  return String((error as { code?: unknown }).code || '');
}

export function isCashierStationBindingInvalidError(error: unknown): boolean {
  return STATION_BINDING_INVALID_CODES.has(codeOf(error));
}

/**
 * The station credential expiry field is retained as compatibility metadata,
 * but it is never allowed to tear down an otherwise valid paired-device binding.
 * Normalize it to a non-expiring client sentinel before the cashier gate reads
 * the binding; the server remains authoritative for token/device/version/station
 * state and explicit revocation.
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

  if (
    identity.station_credential_expires_at ===
    DURABLE_STATION_METADATA_EXPIRES_AT
  ) {
    return;
  }

  await writeCashierDeviceIdentity({
    ...identity,
    station_credential_expires_at: DURABLE_STATION_METADATA_EXPIRES_AT,
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
