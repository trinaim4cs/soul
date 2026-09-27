/*
 * SOUL service worker: app shell only (DECISIONS D-040, SECURITY_MODEL section 12).
 *
 * Cached: same-origin static files (hashed JS/CSS bundles, fonts, icons, logo) and the HTML
 * shell as an offline fallback. The shell holds no user data.
 * Never cached: any cross-origin request (Supabase API, Auth, Storage, Realtime, Functions,
 * payment provider), any non-GET request, and any same-origin API-like path.
 */
const CACHE = 'soul-shell-v1';
const SHELL = '/';
const MAX_ENTRIES = 80;
const STATIC_PREFIXES = ['/_expo/static/', '/assets/', '/icons/'];
const NEVER = ['/auth/', '/rest/', '/storage/', '/realtime/', '/functions/', '/api/'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll([SHELL, '/manifest.webmanifest']))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (NEVER.some((prefix) => url.pathname.startsWith(prefix))) return;

  if (request.mode === 'navigate') {
    // Network first so a deploy is picked up at once; the cached shell only when offline.
    event.respondWith(
      fetch(request).catch(() => caches.match(SHELL).then((cached) => cached || Response.error())),
    );
    return;
  }

  if (STATIC_PREFIXES.some((prefix) => url.pathname.startsWith(prefix))) {
    event.respondWith(cacheFirst(request));
  }
});

async function cacheFirst(request) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok && response.type === 'basic') {
    await cache.put(request, response.clone());
    await trim(cache);
  }
  return response;
}

// Hashed bundles from older deploys are dropped oldest first.
async function trim(cache) {
  const keys = await cache.keys();
  const excess = keys.length - MAX_ENTRIES;
  for (let i = 0; i < excess; i += 1) {
    const url = new URL(keys[i].url);
    if (url.pathname !== SHELL && url.pathname !== '/manifest.webmanifest') {
      await cache.delete(keys[i]);
    }
  }
}
