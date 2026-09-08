const CACHE_PREFIX = 'fawri-cashier-shell-';
const CACHE_VERSION = 'v3';
const CACHE_NAME = `fawri-cashier-shell-${CACHE_VERSION}`;
const FIXED_SUPPORT = [
  '/manifest.webmanifest',
  '/favicon.svg',
  '/fawri-logo.svg',
];
const MAX_ASSET_GRAPH = 200;

function sameOriginAssetPath(raw, base = self.location.origin) {
  try {
    const url = new URL(raw, base);
    if (url.origin !== self.location.origin) return null;
    if (!url.pathname.startsWith('/assets/')) return null;
    return url.pathname + url.search;
  } catch {
    return null;
  }
}

function htmlAssetPaths(html) {
  const result = new Set();
  const pattern = /(?:src|href)=["']([^"']+)["']/g;
  let match;
  while ((match = pattern.exec(html))) {
    const path = sameOriginAssetPath(match[1]);
    if (path) result.add(path);
  }
  return [...result];
}

function javascriptDependencyPaths(source, baseUrl) {
  const result = new Set();
  const patterns = [
    /\bfrom\s*["']([^"']+)["']/g,
    /\bimport\s*["']([^"']+)["']/g,
    /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g,
  ];
  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(source))) {
      const path = sameOriginAssetPath(match[1], baseUrl);
      if (path) result.add(path);
    }
  }
  return [...result];
}

function cssDependencyPaths(source, baseUrl) {
  const result = new Set();
  const pattern = /url\(\s*["']?([^"')]+)["']?\s*\)/g;
  let match;
  while ((match = pattern.exec(source))) {
    const path = sameOriginAssetPath(match[1], baseUrl);
    if (path) result.add(path);
  }
  return [...result];
}

async function fetchRequired(url) {
  const response = await fetch(url, { cache: 'reload' });
  if (!response.ok) {
    throw new Error(`FAWRI_CASHIER_SHELL_FETCH_FAILED:${response.status}:${url}`);
  }
  return response;
}

async function collectAssetGraph(entryPaths) {
  const queue = [...entryPaths];
  const responses = new Map();

  while (queue.length > 0) {
    if (responses.size >= MAX_ASSET_GRAPH) {
      throw new Error('FAWRI_CASHIER_SHELL_ASSET_GRAPH_TOO_LARGE');
    }
    const path = queue.shift();
    if (!path || responses.has(path)) continue;

    const response = await fetchRequired(path);
    responses.set(path, response.clone());

    const contentType = response.headers.get('content-type') || '';
    const isJavaScript =
      contentType.includes('javascript') || /\.m?js(?:\?|$)/.test(path);
    const isCss = contentType.includes('text/css') || /\.css(?:\?|$)/.test(path);
    if (!isJavaScript && !isCss) continue;

    const text = await response.text();
    const baseUrl = new URL(path, self.location.origin).href;
    const dependencies = isJavaScript
      ? javascriptDependencyPaths(text, baseUrl)
      : cssDependencyPaths(text, baseUrl);
    for (const dependency of dependencies) {
      if (!responses.has(dependency)) queue.push(dependency);
    }
  }

  return responses;
}

async function installAtomicCashierShell() {
  const shellResponse = await fetchRequired('/cashier.html');
  const shellText = await shellResponse.clone().text();
  const entryAssets = htmlAssetPaths(shellText);
  if (entryAssets.length === 0) {
    throw new Error('FAWRI_CASHIER_SHELL_ENTRY_ASSET_MISSING');
  }

  const assetResponses = await collectAssetGraph(entryAssets);
  if (assetResponses.size === 0) {
    throw new Error('FAWRI_CASHIER_SHELL_ASSET_GRAPH_EMPTY');
  }

  await caches.delete(CACHE_NAME);
  const cache = await caches.open(CACHE_NAME);
  await cache.put('/cashier.html', shellResponse.clone());
  for (const [path, response] of assetResponses.entries()) {
    await cache.put(path, response.clone());
  }

  for (const path of FIXED_SUPPORT) {
    try {
      const response = await fetchRequired(path);
      await cache.put(path, response.clone());
    } catch {
      // Support resources do not determine whether the executable cashier shell
      // can cold-start. They are warmed best-effort after the required graph.
    }
  }
}

self.addEventListener('install', event => {
  event.waitUntil(
    installAtomicCashierShell().then(() => self.skipWaiting()),
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
      FIXED_SUPPORT.includes(url.pathname) ||
      url.pathname.startsWith('/assets/'))
  );
}

self.addEventListener('message', event => {
  if (event.data?.type === 'FAWRI_CASHIER_STATUS') {
    event.ports?.[0]?.postMessage({
      cache_name: CACHE_NAME,
      version: CACHE_VERSION,
    });
    return;
  }

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
          // Warmup is best-effort. The atomic install already caches the
          // executable dependency graph required for a cold start.
        }
      }
    }),
  );
});

async function networkWithCacheFallback(request, fallbackKey) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(fallbackKey);
  try {
    const response = await fetch(request);
    if (response.ok) {
      await cache.put(fallbackKey, response.clone());
      return response;
    }

    if (response.status >= 500 && cached) return cached;
    return response;
  } catch {
    if (cached) return cached;
    throw new Error('FAWRI_CASHIER_OFFLINE_SHELL_MISSING');
  }
}

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (url.pathname.startsWith('/api/')) return;

  if (request.mode === 'navigate' && url.pathname === '/cashier.html') {
    event.respondWith(networkWithCacheFallback(request, '/cashier.html'));
    return;
  }

  if (
    url.pathname.startsWith('/assets/') ||
    FIXED_SUPPORT.includes(url.pathname)
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
