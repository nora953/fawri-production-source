const ADMIN_DEVICE_ID_KEY = 'fawri_admin_device_id';
const LEGACY_ADMIN_TOKEN_KEY = 'fawri_admin_session_token';

let installed = false;

function createDeviceId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `device-${crypto.randomUUID()}`;
  }
  return `device-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function getStableAuthDeviceId(): string {
  let deviceId = localStorage.getItem(ADMIN_DEVICE_ID_KEY) || '';
  if (!/^[A-Za-z0-9._:-]{16,128}$/.test(deviceId)) {
    deviceId = createDeviceId().slice(0, 128);
    localStorage.setItem(ADMIN_DEVICE_ID_KEY, deviceId);
  }
  return deviceId;
}

export function authDeviceLabel(): string {
  const userAgent = navigator.userAgent;
  const platform = /Android/i.test(userAgent)
    ? 'Android phone'
    : /iPhone|iPad|iPod/i.test(userAgent)
      ? 'Apple mobile device'
      : /Windows/i.test(userAgent)
        ? 'Windows computer'
        : /Macintosh|Mac OS X/i.test(userAgent)
          ? 'Mac computer'
          : /Linux/i.test(userAgent)
            ? 'Linux computer'
            : 'Browser device';
  const browser = /OPR\/|Opera\//i.test(userAgent)
    ? 'Opera'
    : /Edg\//i.test(userAgent)
      ? 'Edge'
      : /Firefox\//i.test(userAgent)
        ? 'Firefox'
        : /Chrome\//i.test(userAgent)
          ? 'Chrome'
          : /Safari\//i.test(userAgent)
            ? 'Safari'
            : 'Browser';
  return `${platform} / ${browser}`;
}

function apiUrl(input: RequestInfo | URL): URL | null {
  try {
    if (typeof input === 'string' || input instanceof URL) {
      return new URL(String(input), window.location.origin);
    }
    return new URL(input.url, window.location.origin);
  } catch {
    return null;
  }
}

function mergedHeaders(input: RequestInfo | URL, init?: RequestInit): Headers {
  const headers = new Headers(input instanceof Request ? input.headers : undefined);
  new Headers(init?.headers).forEach((value, key) => headers.set(key, value));
  return headers;
}

/**
 * Installs the v2 browser transport boundary once.
 *
 * HttpOnly cookies are the only authentication credential. Historical callers
 * may still construct Authorization headers, but this boundary strips them
 * before same-origin API traffic leaves the browser and adds the non-secret,
 * stable device identifier required whenever Auth v2 validates a device-bound
 * session, including operational routes outside /api/auth.
 */
export function installAuthClientCutover(): void {
  if (installed || typeof window === 'undefined') return;
  installed = true;

  sessionStorage.removeItem(LEGACY_ADMIN_TOKEN_KEY);
  const nativeFetch = window.fetch.bind(window);

  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = apiUrl(input);
    if (!url || url.origin !== window.location.origin || !url.pathname.startsWith('/api/')) {
      return nativeFetch(input, init);
    }

    const headers = mergedHeaders(input, init);
    if (/^Bearer\s+/i.test(headers.get('Authorization') || '')) {
      headers.delete('Authorization');
    }
    headers.set('X-Fawri-Device-Id', getStableAuthDeviceId());

    let target = url.pathname + url.search;
    let method = String(init?.method || (input instanceof Request ? input.method : 'GET')).toUpperCase();
    let body = init?.body;

    if (url.pathname === '/api/auth/admin/session/logout') {
      target = '/api/auth/admin/logout';
      method = 'POST';
      body = undefined;
    }
    if (url.pathname === '/api/auth/admin/session/heartbeat') {
      target = '/api/auth/admin/me';
      method = 'GET';
      body = undefined;
      headers.delete('Content-Type');
    }

    const nextInit: RequestInit = {
      ...init,
      method,
      body,
      headers,
      credentials: 'same-origin',
    };

    return nativeFetch(target, nextInit);
  };
}

export async function secureAdminLogout(): Promise<void> {
  await fetch('/api/auth/admin/logout', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'X-Fawri-Device-Id': getStableAuthDeviceId() },
    keepalive: true,
  }).catch(() => undefined);
}

export async function secureMerchantLogout(): Promise<void> {
  await fetch('/api/auth/logout', {
    method: 'POST',
    credentials: 'same-origin',
    keepalive: true,
  }).catch(() => undefined);
}
