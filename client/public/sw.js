// UR Free Here service worker: makes the site installable and lets it open offline.
// Chats, files and settings already live on the device (IndexedDB); this only
// caches the app itself. Live traffic (/api, /socket.io) is never touched.
//
// __BUILD__ is replaced with a build ID at build time, so each deploy gets a
// fresh cache and old files are cleaned up.
const VERSION = '__BUILD__';
const CACHE = `urfree-${VERSION}`;
const SHELL = ['/', '/theme-init.js', '/favicon.svg', '/manifest.webmanifest', '/icons/icon-192.png', '/icons/icon-512.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((c) => c.addAll(SHELL))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('urfree-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // GIFs etc. go straight to the network
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/socket.io')) return;

  // Pages: network first (fresh deploys). Offline, or while the free server is still
  // waking up (no answer within 3.5 s), open the cached app instead.
  if (req.mode === 'navigate') {
    const network = fetch(req).then((res) => {
      if (res.ok) {
        const copy = res.clone();
        void caches.open(CACHE).then((c) => c.put('/', copy));
      }
      return res;
    });
    event.respondWith(
      caches.match('/').then((cached) => {
        if (!cached) return network;
        const slow = new Promise((resolve) => setTimeout(() => resolve(cached), 3500));
        return Promise.race([network.catch(() => cached), slow]);
      }),
    );
    return;
  }

  // Built files have content hashes in their names: once cached, they never change.
  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            if (res.ok) {
              const copy = res.clone();
              void caches.open(CACHE).then((c) => c.put(req, copy));
            }
            return res;
          }),
      ),
    );
    return;
  }

  // Other small files (icons, manifest): use the cache, refresh it in the background.
  event.respondWith(
    caches.match(req).then((hit) => {
      const fresh = fetch(req)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            void caches.open(CACHE).then((c) => c.put(req, copy));
          }
          return res;
        })
        .catch(() => hit || Response.error());
      return hit || fresh;
    }),
  );
});

// A message notification was tapped: bring the app forward on that chat, or open it.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/chat';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      const client = list.find((c) => new URL(c.url).origin === self.location.origin);
      if (client) {
        client.postMessage({ type: 'open', url });
        return client.focus();
      }
      return self.clients.openWindow(url);
    }),
  );
});
