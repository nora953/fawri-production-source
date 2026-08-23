export type CashierOfflineShellDiagnostics = {
  service_worker_supported: boolean;
  registration_active: boolean;
  controller_present: boolean;
  cache_api_supported: boolean;
  cashier_shell_cached: boolean;
  loaded_assets_cached: number;
  ready_for_cold_start: boolean;
};

const CASHIER_SW_PATH = '/cashier-sw.js';
const CASHIER_CACHE_NAME = 'fawri-cashier-shell-v1';
const FIXED_WARM_URLS = [
  '/cashier.html',
  '/manifest.webmanifest',
  '/favicon.svg',
  '/fawri-logo.svg',
];

function sameOriginWarmUrls(): string[] {
  if (typeof window === 'undefined') return FIXED_WARM_URLS;
  const urls = new Set<string>(FIXED_WARM_URLS);
  for (const entry of performance.getEntriesByType('resource')) {
    const url = new URL(entry.name, window.location.href);
    if (url.origin !== window.location.origin) continue;
    if (url.pathname.startsWith('/assets/')) urls.add(url.pathname + url.search);
  }
  return [...urls];
}

async function sendWarmCacheMessage(registration: ServiceWorkerRegistration): Promise<void> {
  const worker = registration.active || registration.waiting || registration.installing;
  if (!worker) return;
  worker.postMessage({
    type: 'FAWRI_CASHIER_WARM_CACHE',
    urls: sameOriginWarmUrls(),
  });
}

export async function registerCashierOfflineAppShell(): Promise<ServiceWorkerRegistration | null> {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return null;
  try {
    const registration = await navigator.serviceWorker.register(CASHIER_SW_PATH, {
      scope: '/',
      updateViaCache: 'none',
    });
    await navigator.serviceWorker.ready;
    await sendWarmCacheMessage(registration);
    return registration;
  } catch (error) {
    console.warn('[cashier-offline-shell] service worker registration failed', error);
    return null;
  }
}

export async function getCashierOfflineShellDiagnostics(): Promise<CashierOfflineShellDiagnostics> {
  const serviceWorkerSupported =
    typeof navigator !== 'undefined' && 'serviceWorker' in navigator;
  const cacheSupported = typeof caches !== 'undefined';
  const registration = serviceWorkerSupported
    ? await navigator.serviceWorker.getRegistration('/').catch(() => undefined)
    : undefined;
  const cache = cacheSupported
    ? await caches.open(CASHIER_CACHE_NAME).catch(() => undefined)
    : undefined;
  const shellCached = Boolean(await cache?.match('/cashier.html'));
  let loadedAssetsCached = 0;
  if (cache) {
    for (const url of sameOriginWarmUrls()) {
      if (url.startsWith('/assets/') && (await cache.match(url))) {
        loadedAssetsCached += 1;
      }
    }
  }
  const registrationActive = Boolean(registration?.active);
  const controllerPresent = Boolean(navigator.serviceWorker?.controller);
  return {
    service_worker_supported: serviceWorkerSupported,
    registration_active: registrationActive,
    controller_present: controllerPresent,
    cache_api_supported: cacheSupported,
    cashier_shell_cached: shellCached,
    loaded_assets_cached: loadedAssetsCached,
    ready_for_cold_start:
      serviceWorkerSupported &&
      cacheSupported &&
      registrationActive &&
      controllerPresent &&
      shellCached &&
      loadedAssetsCached > 0,
  };
}
