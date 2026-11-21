// Release-provisioned public keys only. Never populate this ring from an API
// response, entitlement envelope or IndexedDB. An empty ring disables offline.
export function cashierOfflineTrustedKeys(): Record<string, JsonWebKey> {
  try {
    const value = JSON.parse(import.meta.env?.VITE_FAWRI_CASHIER_OFFLINE_PUBLIC_KEYS || '{}');
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
    for (const key of Object.values(value) as JsonWebKey[]) {
      if (!key || key.kty !== 'EC' || key.crv !== 'P-256' || key.d !== undefined ||
          !key.x || !key.y || key.key_ops?.some(op => op !== 'verify')) return {};
    }
    return value;
  } catch {
    return {};
  }
}
