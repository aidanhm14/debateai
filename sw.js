// Bumped to v10 — see app/sw.js for detail.
const CACHE_NAME = 'debateos-v83';

// NOTE: '/' was previously precached here. That's why routing changes to the
// root URL never appeared for existing users — the SW kept serving the old
// cached HTML of '/'. Removed; the app shell now caches only explicit paths.
// /splash is the new root entry (2026-05-10).
const APP_SHELL = [
  '/splash',
  '/landing',
  '/offline.html',
  'https://cdnjs.cloudflare.com/ajax/libs/react/18.2.0/umd/react.production.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/react-dom/18.2.0/umd/react-dom.production.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/babel-standalone/7.23.9/babel.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/d3/7.8.5/d3.min.js',
];

// Install: cache app shell (don't fail install if any asset fails to cache)
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      Promise.all(
        APP_SHELL.map((url) =>
          cache.add(url).catch((err) => {
            console.warn('[SW] Failed to precache', url, err);
          })
        )
      )
    )
  );
  self.skipWaiting();
});

// Activate: clean old caches and take control
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

// Only cache successful, basic/cors responses. Never cache 4xx/5xx.
function shouldCache(response) {
  return response && response.ok && (response.type === 'basic' || response.type === 'cors');
}

// Fetch handler
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Never intercept API calls — let them go straight to the network.
  // API 404s were being cached and replayed, which broke /api/claude etc.
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/.netlify/')) {
    return;
  }

  // Never intercept POST/PUT/DELETE — SW caching of mutations is a footgun
  if (request.method !== 'GET') {
    return;
  }

  // Network-first for navigation requests (HTML pages). Fall back to cache,
  // and ONLY show offline.html if the user is verifiably offline.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (shouldCache(response)) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return response;
        })
        .catch(async () => {
          // Try the cache first
          const cached = await caches.match(request);
          if (cached) return cached;
          // Try the app shell
          const shell = await caches.match('/') || await caches.match('/landing');
          if (shell) return shell;
          // Only show offline.html if actually offline. Otherwise, let the
          // browser show its native error rather than a confusing "offline"
          // page when the user has connectivity (common in Reddit in-app
          // browser where fetch fails for unrelated reasons).
          if (!self.navigator || self.navigator.onLine === false) {
            return caches.match('/offline.html');
          }
          // Genuinely uncertain — surface the real error to the browser
          throw new Error('SW navigation fetch failed and user appears online');
        })
    );
    return;
  }

  // Cache-first for CDN libraries, fonts, and static assets
  if (
    url.hostname.includes('cdnjs.cloudflare.com') ||
    url.hostname.includes('fonts.googleapis.com') ||
    url.hostname.includes('fonts.gstatic.com') ||
    url.hostname.includes('gstatic.com/firebasejs') ||
    request.destination === 'font' ||
    request.destination === 'style' ||
    request.destination === 'image'
  ) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ||
          fetch(request).then((response) => {
            if (shouldCache(response)) {
              const clone = response.clone();
              caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
            }
            return response;
          })
      )
    );
    return;
  }

  // Default: network-first with cache fallback — but only cache successful responses
  event.respondWith(
    fetch(request)
      .then((response) => {
        if (shouldCache(response)) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
        }
        return response;
      })
      .catch(() => caches.match(request))
  );
});
