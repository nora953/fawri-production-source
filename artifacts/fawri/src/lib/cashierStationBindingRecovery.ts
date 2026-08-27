import {
  getOrCreateCashierDeviceIdentity,
  writeCashierDeviceIdentity,
} from './cashierOperatorSessionRuntime';

const STATION_BINDING_INVALID_CODES = new Set([
  'CASHIER_STATION_CREDENTIAL_INVALID',
  'CASHIER_STATION_PAIRING_REQUIRED',
]);

function codeOf(error: unknown): string {
  if (!error || typeof error !== 'object' || !('code' in error)) return '';
  return String((error as { code?: unknown }).code || '');
}

export function isCashierStationBindingInvalidError(error: unknown): boolean {
  return STATION_BINDING_INVALID_CODES.has(codeOf(error));
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
