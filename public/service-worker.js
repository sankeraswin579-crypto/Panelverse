const VERSION = 'panelverse-shell-v16';

const APP_SHELL = [
  '/',
  '/login',
  '/styles.css',
  '/app.js',
  '/discovery.js',
  '/login.js',
  '/manifest.webmanifest',
  '/icon.svg'
];

// Install the updated application shell.
self.addEventListener('install', event => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(VERSION);
      await cache.addAll(APP_SHELL);
      await self.skipWaiting();
    })()
  );
});

// Clean up old PanelVerse caches only.
self.addEventListener('activate', event => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();

      await Promise.all(
        keys
          .filter(
            key =>
              key.startsWith('panelverse-shell-') &&
              key !== VERSION
          )
          .map(key => caches.delete(key))
      );

      await self.clients.claim();
    })()
  );
});

// Handle application requests.
self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);

  if (
    request.method !== 'GET' ||
    url.origin !== self.location.origin
  ) {
    return;
  }

  // Never cache personal account or API responses.
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(fetch(request));
    return;
  }

  // Network-first navigation with offline fallback.
  if (request.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          return await fetch(request);
        } catch {
          const fallback =
            url.pathname === '/login' ? '/login' : '/';

          return (
            await caches.match(fallback)
          ) || new Response(
            'PanelVerse is offline. Please reconnect and try again.',
            {
              status: 503,
              headers: {
                'Content-Type': 'text/plain; charset=utf-8'
              }
            }
          );
        }
      })()
    );

    return;
  }

  // Cache-first strategy for static resources.
  event.respondWith(
    (async () => {
      const cache = await caches.open(VERSION);
      const cached = await cache.match(request);

      if (cached) {
        return cached;
      }

      const response = await fetch(request);

      if (
        response.ok &&
        response.type === 'basic'
      ) {
        await cache.put(request, response.clone());
      }

      return response;
    })()
  );
});
