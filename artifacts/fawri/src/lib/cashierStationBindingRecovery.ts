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

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

export function isCashierStationBindingInvalidError(error: unknown): boolean {
  return STATION_BINDING_INVALID_CODES.has(codeOf(error));
}

/**
 * Upgrade a pre-location cashier binding in place.
 *
 * Older paired devices can have a valid durable station token but no
 * `location_id`, because location identity was introduced after those devices
 * were paired. Re-pairing would violate the durable-device contract and can
 * also rotate an otherwise valid credential. Instead, authenticate the
 * existing token/device pair against the server and hydrate the canonical
 * location metadata into the same IndexedDB identity.
 */
export async function recoverLegacyCashierStationBinding(): Promise<boolean> {
  const identity = await getOrCreateCashierDeviceIdentity();
  if (
    identity.location_id ||
    !identity.cloud_merchant_id ||
    !identity.station_id ||
    !identity.station_token ||
    !identity.device_id
  ) {
    return false;
  }
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return false;
  }

  let response: Response;
  try {
    response = await fetch('/api/cashier/station/me', {
      method: 'GET',
      headers: {
        'X-Fawri-Cashier-Station-Token': identity.station_token,
        'X-Fawri-Cashier-Device-Id': identity.device_id,
      },
      credentials: 'same-origin',
      cache: 'no-store',
    });
  } catch {
    return false;
  }
  if (!response.ok) return false;

  const payload = record(await response.json().catch(() => null));
  if (payload.ok !== true) return false;
  const station = record(payload.station);
  const merchantId = String(station.merchant_id || '').trim();
  const stationId = String(station.station_id || '').trim();
  const stationName = String(station.station_name || '').trim();
  const locationId = String(station.location_id || '').trim();
  const branchKey = String(station.branch_key || '').trim();
  const deviceId = String(station.device_id || '').trim();

  if (
    !merchantId ||
    !stationId ||
    !stationName ||
    !locationId ||
    !branchKey ||
    !deviceId ||
    merchantId !== identity.cloud_merchant_id ||
    stationId !== identity.station_id ||
    deviceId !== identity.device_id
  ) {
    return false;
  }

  const next = {
    ...identity,
    station_name: stationName,
    location_id: locationId,
    branch_key: branchKey,
    offline_inventory_authority:
      station.offline_inventory_authority === true,
    station_credential_expires_at: DURABLE_STATION_METADATA_EXPIRES_AT,
  };
  if (station.branch_label) {
    next.branch_label = String(station.branch_label);
  } else {
    delete next.branch_label;
  }

  await writeCashierDeviceIdentity(next);
  return true;
}

/**
 * The station credential expiry field is retained as compatibility metadata,
 * but it is never allowed to tear down an otherwise valid paired-device binding.
 * Normalize it to a non-expiring client sentinel before the cashier gate reads
 * the binding; the server remains authoritative for token/device/version/station
 * state and explicit revocation.
 */
export async function refreshDurableCashierStationBindingMetadata(): Promise<void> {
  let identity = await getOrCreateCashierDeviceIdentity();
  if (
    !identity.cloud_merchant_id ||
    !identity.station_id ||
    !identity.station_token
  ) {
    return;
  }

  if (!identity.location_id) {
    const recovered = await recoverLegacyCashierStationBinding();
    if (recovered) {
      identity = await getOrCreateCashierDeviceIdentity();
    }
  }

  if (
    !identity.location_id ||
    !identity.station_name ||
    !identity.branch_key
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
  delete next.location_id;
  delete next.branch_key;
  delete next.branch_label;
  delete next.offline_inventory_authority;
  delete next.station_token;
  delete next.station_credential_expires_at;
  delete next.last_catalog_sync_at;
  await writeCashierDeviceIdentity(next);
}
