// Service worker: offline reading, cache-as-you-read.
//
// The corpus is far too large to precache wholesale (~hundreds of MB), so the
// contract is honest and simple: anything you have read is available offline.
//
//  - Navigations (page HTML): network-first so deploys show up immediately,
//    falling back to the cached copy offline, then to the offline page.
//  - Hashed build assets (/_astro/): cache-first — content-addressed names
//    make them immutable, and a deploy's new HTML references new names.
//  - Corpus data (/data/) and other same-scope files: network-first, cache
//    fallback. Fresh HTML must never pair with a prior deploy's cached JSON
//    (schema drift), so data is only served from cache when actually offline
//    — where it pairs with equally-old cached HTML, which is consistent.
//  - Fonts: cache-first (immutable binaries).
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

async function networkFirst(request, { offlineFallback = false } = {}) {
  const cache = await caches.open(VERSION);
  try {
    const fresh = await fetch(request);
    if (fresh.ok) cache.put(request, fresh.clone());
    return fresh;
  } catch (err) {
    const cached = await cache.match(request);
    if (cached) return cached;
    if (offlineFallback) return cache.match(OFFLINE_URL);
    throw err;
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

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);

  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request, { offlineFallback: true }));
    return;
  }

  if (url.origin === location.origin) {
    if (url.pathname.includes('/_astro/')) {
      event.respondWith(cacheFirst(request));
    } else if (url.pathname.startsWith(SCOPE_PATH)) {
      // Corpus data, favicons, manifest — always fresh online (a new deploy's
      // HTML must never read an old deploy's JSON), cached copy offline.
      event.respondWith(networkFirst(request));
    }
    return;
  }

  // Web fonts (fonts.googleapis.com stylesheets, fonts.gstatic.com binaries).
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    event.respondWith(cacheFirst(request));
  }
});
