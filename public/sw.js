const SHELL_CACHE = 'pingrab-shell-v2';
const SEARCH_CACHE = 'pingrab-search-v2';
const MEDIA_CACHE = 'pingrab-media-v2';

const SHELL_ASSETS = ['/', '/index.html'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) => cache.addAll(SHELL_ASSETS).catch(() => undefined))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  const validCaches = new Set([SHELL_CACHE, SEARCH_CACHE, MEDIA_CACHE]);
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.map((key) => {
          if (!validCaches.has(key)) {
            return caches.delete(key);
          }
          return Promise.resolve();
        })
      )
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // 1. Live search API: Network-first, cache fallback when offline or API returns 5xx
  if (url.pathname === '/api/search') {
    event.respondWith(
      (async () => {
        const cache = await caches.open(SEARCH_CACHE);
        try {
          const networkRes = await fetch(request);
          if (networkRes.ok) {
            const clone = networkRes.clone();
            const body = await clone.json().catch(() => null);
            if (body && Array.isArray(body.results) && body.results.length > 0) {
              await cache.put(request, networkRes.clone());
            }
            return networkRes;
          }
          const cachedRes = await cache.match(request);
          if (cachedRes) {
            const headers = new Headers(cachedRes.headers);
            headers.set('x-pingrab-cache', 'HIT');
            return new Response(cachedRes.body, {
              status: cachedRes.status,
              statusText: cachedRes.statusText,
              headers,
            });
          }
          return networkRes;
        } catch {
          const cachedRes = await cache.match(request);
          if (cachedRes) {
            const headers = new Headers(cachedRes.headers);
            headers.set('x-pingrab-cache', 'HIT');
            return new Response(cachedRes.body, {
              status: cachedRes.status,
              statusText: cachedRes.statusText,
              headers,
            });
          }
          return new Response(JSON.stringify({ error: 'Offline and uncached' }), {
            status: 503,
            headers: { 'Content-Type': 'application/json' },
          });
        }
      })()
    );
    return;
  }

  // 2. Pin media images (proxied or direct i.pinimg.com): Cache-first / stale-while-revalidate
  if (
    url.pathname === '/api/download' ||
    url.hostname === 'i.pinimg.com' ||
    url.pathname.startsWith('/src/assets/images/')
  ) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(MEDIA_CACHE);
        const cached = await cache.match(request);
        if (cached) {
          return cached;
        }
        try {
          const res = await fetch(request);
          if (res.ok || res.type === 'opaque') {
            cache.put(request, res.clone()).catch(() => undefined);
          }
          return res;
        } catch {
          return cached || Response.error();
        }
      })()
    );
    return;
  }

  // 3. Same-origin app shell & bundled JS/CSS: Network-first with cache fallback for offline boot
  if (url.origin === self.location.origin) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(SHELL_CACHE);
        try {
          const res = await fetch(request);
          if (res.ok) {
            cache.put(request, res.clone()).catch(() => undefined);
          }
          return res;
        } catch {
          const cached = await cache.match(request);
          if (cached) return cached;
          if (request.mode === 'navigate') {
            return (await cache.match('/index.html')) || Response.error();
          }
          return Response.error();
        }
      })()
    );
  }
});
