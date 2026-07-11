// Service worker: offline reading, cache-as-you-read.
//
// The corpus is far too large to precache wholesale (~hundreds of MB), so the
// contract is honest and simple: anything you have read is available offline.
//
//  - Navigations (page HTML): network-first so deploys show up immediately,
//    falling back to the cached copy offline, then to the offline page.
//  - Hashed build assets (/_astro/): cache-first — content-addressed names
//    make them immutable, and a deploy's new HTML references new names.
//  - Corpus data (/data/) and fonts: stale-while-revalidate — instant reads
//    from cache, refreshed in the background when online.
//
// Versioned cache: bump VERSION to invalidate everything after a breaking
// deploy. Old caches are dropped on activate.
const VERSION = 'aristotle-reader-v1';
const SCOPE_PATH = new URL(self.registration.scope).pathname; // e.g. /aristotle-reader/
const OFFLINE_URL = SCOPE_PATH + 'offline.html';

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(VERSION).then((c) => c.addAll([OFFLINE_URL])).then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

async function networkFirst(request) {
  const cache = await caches.open(VERSION);
  try {
    const fresh = await fetch(request);
    if (fresh.ok) cache.put(request, fresh.clone());
    return fresh;
  } catch {
    const cached = await cache.match(request);
    return cached ?? cache.match(OFFLINE_URL);
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(VERSION);
  const cached = await cache.match(request);
  if (cached) return cached;
  const fresh = await fetch(request);
  if (fresh.ok || fresh.type === 'opaque') cache.put(request, fresh.clone());
  return fresh;
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(VERSION);
  const cached = await cache.match(request);
  const refresh = fetch(request)
    .then((fresh) => {
      if (fresh.ok || fresh.type === 'opaque') cache.put(request, fresh.clone());
      return fresh;
    })
    .catch((err) => {
      // Never resolve undefined into respondWith — an uncached miss while
      // offline must reject like a plain network error would.
      if (cached) return cached;
      throw err;
    });
  return cached ?? refresh;
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);

  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request));
    return;
  }

  if (url.origin === location.origin) {
    if (url.pathname.includes('/_astro/')) {
      event.respondWith(cacheFirst(request));
    } else if (url.pathname.startsWith(SCOPE_PATH)) {
      // Corpus data, favicons, manifest — serve cached, refresh behind.
      event.respondWith(staleWhileRevalidate(request));
    }
    return;
  }

  // Web fonts (fonts.googleapis.com stylesheets, fonts.gstatic.com binaries).
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    event.respondWith(cacheFirst(request));
  }
});
