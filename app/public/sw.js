// Service worker: offline reading, cache-as-you-read.
//
// The corpus is far too large to precache wholesale (~hundreds of MB), so the
// contract is honest and simple: anything you have read is available offline.
//
//  - Navigations (page HTML): network-first so deploys show up immediately,
//    falling back to the cached copy offline, then to the offline page.
//  - Hashed build assets (/_astro/): cache-first — content-addressed names
//    make them immutable, and a deploy's new HTML references new names.
//  - Corpus data (/data/, or the off-origin DATA_ROOT) and other same-scope
//    files: network-first, cache fallback. Fresh HTML must never pair with a
//    prior deploy's cached JSON (schema drift), so data is only served from
//    cache when actually offline — where it pairs with equally-old cached
//    HTML, which is consistent.
//  - Fonts: cache-first (immutable binaries).
//
// Versioned cache: bump VERSION to invalidate everything after a breaking
// deploy. On activate we drop only OUR own prior versions — caches.keys() is
// origin-wide, so on a shared github.io origin another project's PWA can own
// caches here too; deleting by CACHE_PREFIX (not "everything that isn't
// VERSION") avoids wiping a sibling app's offline data.
const CACHE_PREFIX = 'aristotle-reader-';
const VERSION = CACHE_PREFIX + 'v1';
const SCOPE_PATH = new URL(self.registration.scope).pathname; // '/' at the custom domain
const OFFLINE_URL = SCOPE_PATH + 'offline.html';

// The corpus data can live on another origin (a Cloudflare R2 bucket). This
// file is copied verbatim into dist, so app/scripts/postbuild-data-root.mjs writes
// the build's PUBLIC_DATA_ROOT into the literal below. Empty = same-origin data
// under SCOPE_PATH, which the scope branch in the fetch handler covers.
const DATA_ROOT = '';
const DATA_BASE = DATA_ROOT ? new URL(DATA_ROOT, location.href).href.replace(/\/+$/, '') : '';
const isDataRequest = (url) => DATA_BASE !== ''
  && (url.href === DATA_BASE || url.href.startsWith(DATA_BASE + '/'));

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(VERSION).then((c) => c.addAll([OFFLINE_URL])).then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => k.startsWith(CACHE_PREFIX) && k !== VERSION).map((k) => caches.delete(k)),
      ))
      .then(() => self.clients.claim()),
  );
});

async function networkFirst(event, { offlineFallback = false } = {}) {
  const { request } = event;
  const cache = await caches.open(VERSION);
  try {
    const fresh = await fetch(request);
    // The write is handed to waitUntil, not awaited: the reader gets the
    // response at network speed, while the event stays alive until the copy
    // has actually landed in the cache.
    if (fresh.ok) event.waitUntil(cache.put(request, fresh.clone()));
    return fresh;
  } catch (err) {
    const cached = await cache.match(request);
    if (cached) return cached;
    if (offlineFallback) return cache.match(OFFLINE_URL);
    throw err;
  }
}

async function cacheFirst(event) {
  const { request } = event;
  const cache = await caches.open(VERSION);
  const cached = await cache.match(request);
  if (cached) return cached;
  const fresh = await fetch(request);
  if (fresh.ok || fresh.type === 'opaque') event.waitUntil(cache.put(request, fresh.clone()));
  return fresh;
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);

  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(event, { offlineFallback: true }));
    return;
  }

  // Off-origin corpus data: the same network-first policy as same-origin
  // /data/ below. The responses are CORS-enabled, so they cache normally.
  if (isDataRequest(url)) {
    event.respondWith(networkFirst(event));
    return;
  }

  if (url.origin === location.origin) {
    if (url.pathname.includes('/_astro/')) {
      event.respondWith(cacheFirst(event));
    } else if (url.pathname.startsWith(SCOPE_PATH)) {
      // Corpus data, favicons, manifest — always fresh online (a new deploy's
      // HTML must never read an old deploy's JSON), cached copy offline.
      event.respondWith(networkFirst(event));
    }
    return;
  }

  // Web fonts (fonts.googleapis.com stylesheets, fonts.gstatic.com binaries).
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    event.respondWith(cacheFirst(event));
  }
});
