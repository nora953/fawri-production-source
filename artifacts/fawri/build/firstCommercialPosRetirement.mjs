import { writeFile } from 'node:fs/promises';
import path from 'node:path';

/**
 * Build-only commercial V1 POS retirement.
 * Do NOT delete IndexedDB, CacheStorage, local sales or financial receipts.
 * Retire the old offline service worker on the next online update instead.
 */
export const POS_V1_RETIREMENT_WORKER = `/* FAWRI commercial V1: POS retired; all prior local finance remains untouched. */
self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting());
});
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    await self.clients.claim();
    // Unregister executable offline caching, not its underlying data stores.
    await self.registration.unregister();
  })());
});
// No fetch or offline cache fallback: all navigations use the server's 410.
// Deliberately no caches.delete(), indexedDB.deleteDatabase(), or storage.clear().
`;

export const POS_V1_MERCHANT_MANIFEST = {
  name: 'Fawri',
  short_name: 'Fawri',
  description: 'Fawri merchant order management',
  start_url: '/',
  scope: '/',
  display: 'standalone',
  background_color: '#f8fafc',
  theme_color: '#ff5a00',
  lang: 'ar',
  dir: 'rtl',
  icons: [
    { src: '/fawri-logo.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
  ],
};

/** Vite has already copied publicDir at closeBundle time. */
export async function retirePosForCommercialBuild(publicDist) {
  await writeFile(path.join(publicDist, 'cashier-sw.js'), POS_V1_RETIREMENT_WORKER);
  await writeFile(
    path.join(publicDist, 'manifest.webmanifest'),
    JSON.stringify(POS_V1_MERCHANT_MANIFEST, null, 2) + '\n',
  );
}
