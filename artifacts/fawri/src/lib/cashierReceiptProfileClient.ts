import {
  cashierOperatorHeaders,
  getCashierOperatorSession,
} from './cashierOperatorSessionRuntime';

const RECEIPT_PROFILE_PREFIX = 'fawri.cashier.receipt-profile.v1';
const STORE_NAME_MAX_LENGTH = 200;

export type CashierReceiptProfile = {
  store_name: string;
  cached_at: string;
};

function cacheKey(deviceId: string): string {
  return `${RECEIPT_PROFILE_PREFIX}.${encodeURIComponent(String(deviceId || 'unknown'))}`;
}

function normalizeStoreName(value: unknown): string | null {
  const storeName = String(value ?? '').normalize('NFKC').trim();
  if (
    !storeName ||
    storeName.length > STORE_NAME_MAX_LENGTH ||
    /[\u0000-\u001f\u007f]/.test(storeName)
  ) {
    return null;
  }
  return storeName;
}

export function readCachedCashierReceiptProfile(
  deviceId: string,
): CashierReceiptProfile | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(cacheKey(deviceId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<CashierReceiptProfile>;
    const storeName = normalizeStoreName(parsed.store_name);
    const cachedAt = String(parsed.cached_at || '').trim();
    if (!storeName || !cachedAt || !Number.isFinite(new Date(cachedAt).getTime())) {
      return null;
    }
    return { store_name: storeName, cached_at: cachedAt };
  } catch {
    return null;
  }
}

function writeCachedCashierReceiptProfile(
  deviceId: string,
  profile: CashierReceiptProfile,
): boolean {
  if (typeof localStorage === 'undefined') return false;
  try {
    localStorage.setItem(cacheKey(deviceId), JSON.stringify(profile));
    return true;
  } catch {
    return false;
  }
}

export async function refreshCurrentCashierReceiptProfile(): Promise<CashierReceiptProfile | null> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return null;
  const session = await getCashierOperatorSession();
  if (!session) return null;

  const response = await fetch('/api/cashier/operator/receipt-profile', {
    headers: cashierOperatorHeaders(session),
    cache: 'no-store',
  });
  const payload = await response.json().catch(() => null) as Record<string, unknown> | null;
  if (!response.ok || payload?.ok !== true) return null;

  const rawProfile = payload.receipt_profile;
  if (!rawProfile || typeof rawProfile !== 'object' || Array.isArray(rawProfile)) return null;
  const storeName = normalizeStoreName((rawProfile as Record<string, unknown>).store_name);
  if (!storeName) return null;

  const profile: CashierReceiptProfile = {
    store_name: storeName,
    cached_at: new Date().toISOString(),
  };
  writeCachedCashierReceiptProfile(session.context.device_id, profile);
  return profile;
}

export function installCashierReceiptProfileRefresh(): () => void {
  if (typeof window === 'undefined') return () => undefined;

  const refresh = () => {
    void refreshCurrentCashierReceiptProfile().catch(() => undefined);
  };
  const timer = window.setTimeout(refresh, 0);
  window.addEventListener('online', refresh);
  window.addEventListener('focus', refresh);
  window.addEventListener('fawri:cashier-operator-session-changed', refresh);

  return () => {
    window.clearTimeout(timer);
    window.removeEventListener('online', refresh);
    window.removeEventListener('focus', refresh);
    window.removeEventListener('fawri:cashier-operator-session-changed', refresh);
  };
}
