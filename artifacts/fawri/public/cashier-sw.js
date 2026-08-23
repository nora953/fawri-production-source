const CACHE_PREFIX = 'fawri-cashier-shell-';
const CACHE_NAME = 'fawri-cashier-shell-v1';
const FIXED_SHELL = [
  '/cashier.html',
  '/manifest.webmanifest',
  '/favicon.svg',
  '/fawri-logo.svg',
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then(cache => cache.addAll(FIXED_SHELL))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches
      .keys()
      .then(keys =>
        Promise.all(
          keys
            .filter(key => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME)
            .map(key => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

function isAllowedWarmPath(url) {
  return (
    url.origin === self.location.origin &&
    (url.pathname === '/cashier.html' ||
      url.pathname === '/manifest.webmanifest' ||
      url.pathname === '/favicon.svg' ||
      url.pathname === '/fawri-logo.svg' ||
      url.pathname.startsWith('/assets/'))
  );
}

self.addEventListener('message', event => {
  if (event.data?.type !== 'FAWRI_CASHIER_WARM_CACHE') return;
  const urls = Array.isArray(event.data.urls) ? event.data.urls : [];
  event.waitUntil(
    caches.open(CACHE_NAME).then(async cache => {
      for (const raw of urls) {
        try {
          const url = new URL(raw, self.location.origin);
          if (!isAllowedWarmPath(url)) continue;
          const response = await fetch(url.href, { cache: 'reload' });
          if (response.ok) await cache.put(url.pathname + url.search, response.clone());
        } catch {
          // Warmup is best-effort. Cold-start readiness diagnostics remain false
          // until all required shell resources are actually cached.
        }
      }
    }),
  );
});

async function networkWithCacheFallback(request, fallbackKey) {
  const cache = await caches.open(CACHE_NAME);
  try {
    const response = await fetch(request);
    if (response.ok) await cache.put(fallbackKey, response.clone());
    return response;
  } catch {
    const cached = await cache.match(fallbackKey);
    if (cached) return cached;
    throw new Error('FAWRI_CASHIER_OFFLINE_SHELL_MISSING');
  }
}

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Never manufacture offline responses for APIs or cloud/admin/dashboard pages.
  if (url.pathname.startsWith('/api/')) return;

  if (request.mode === 'navigate' && url.pathname === '/cashier.html') {
    event.respondWith(networkWithCacheFallback(request, '/cashier.html'));
    return;
  }

  if (
    url.pathname.startsWith('/assets/') ||
    url.pathname === '/manifest.webmanifest' ||
    url.pathname === '/favicon.svg' ||
    url.pathname === '/fawri-logo.svg'
  ) {
    event.respondWith(
      caches.open(CACHE_NAME).then(async cache => {
        const key = url.pathname + url.search;
        const cached = await cache.match(key);
        if (cached) return cached;
        const response = await fetch(request);
        if (response.ok) await cache.put(key, response.clone());
        return response;
      }),
    );
  }
});
