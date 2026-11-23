/* global self, caches, fetch, URL */
const offlineCache = 'consulens-offline-v1';
const offlinePage = '/offline.html';

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(offlineCache).then((cache) => cache.add(offlinePage)));
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) {
      if (key.startsWith('consulens-offline-') && key !== offlineCache) await caches.delete(key);
    }
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (request.method !== 'GET' || request.mode !== 'navigate' ||
      url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;
  event.respondWith(fetch(request).catch(() => caches.match(offlinePage)));
});
