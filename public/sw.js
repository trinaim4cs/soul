/*
 * SOUL service worker: app shell and Web Push (DECISIONS D-040, D-054, SECURITY_MODEL 12).
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
// The local dev server is never cached (the worker is registered there only for push tests).
const LOCAL_DEV = ['localhost', '127.0.0.1', '[::1]'].includes(self.location.hostname);
// Pages a notification may open; anything else opens the app's start page.
const OPENABLE = [
  /^\/chat\/[0-9a-f-]{36}$/,
  /^\/match\/[0-9a-f-]{36}$/,
  /^\/instant\/session\/[0-9a-f-]{36}$/,
  /^\/instant\/chat\/[0-9a-f-]{36}$/,
  /^\/settings\/purchases$/,
];

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
  if (request.method !== 'GET' || LOCAL_DEV) return;
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

function openable(url) {
  return typeof url === 'string' && OPENABLE.some((pattern) => pattern.test(url)) ? url : '/';
}

// A push is always shown (browsers require it). The server sends only a title, a line and the
// page to open: never a message's text (D-054).
self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = {};
  }
  const tag = typeof data.tag === 'string' ? data.tag.slice(0, 64) : undefined;
  event.waitUntil(
    self.registration.showNotification(
      typeof data.title === 'string' ? data.title.slice(0, 80) : 'SOUL',
      {
        body: typeof data.body === 'string' ? data.body.slice(0, 160) : '',
        tag,
        renotify: Boolean(tag),
        icon: '/icons/icon-192.png',
        badge: '/icons/badge-96.png',
        data: { url: openable(data.url) },
      },
    ),
  );
});

// A tap focuses an open SOUL window and routes it, or opens one on that page.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = openable(event.notification.data && event.notification.data.url);
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
      const open = windows.find((client) => new URL(client.url).origin === self.location.origin);
      if (open) {
        return open.focus().then((client) => client.postMessage({ type: 'soul-open', url }));
      }
      return self.clients.openWindow(url);
    }),
  );
});
