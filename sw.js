// Bumped to v10 to invalidate the cached React bundle that predates the
// Competitive-tab reshuffle (Case Feedback + Vocab Quiz added, Feedback
// removed from Other; the 4-tier pricing gate; BYOK "Claude only" error).
// Without this bump, users on v9 kept seeing the old dropdown with only
// 8 items and the old 3-card pricing panel.



const CACHE_NAME = 'debateos-v1498';



// NOTE: '/' was previously precached here. That's why routing changes to the
// root URL never appeared for existing users — the SW kept serving the old
// cached HTML of '/'. Removed; the app shell now caches only explicit paths.
// /splash is the new root entry (2026-05-10) so we precache it for fast
// first paint on repeat visits; /landing stays in the shell for the click-through.
// 2026-05-27 perf pass: removed babel-standalone (~600KB cached for
// nothing). Inline React-via-CDN blocks across the six big pages used
// to be runtime-transpiled by babel-standalone; that cost ~1GB heap
// per tab and was retired ~2026-05-19 in favor of the
// scripts/precompile-inline-babel.mjs commit-time precompiler. The
// browser no longer loads or executes babel at all, but the SW kept
// dragging the file down on every first visit. Removed.
const APP_SHELL = [
  '/splash',
  '/landing',
  '/offline.html',
  'https://cdnjs.cloudflare.com/ajax/libs/react/18.2.0/umd/react.production.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/react-dom/18.2.0/umd/react-dom.production.min.js',
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

// ── Web Push ──────────────────────────────────────────────────────
// Show the notification the server sent (a spar match, a DM) even when the
// tab or installed PWA is closed, and focus/open the app on tap. The push
// payload is JSON: { title, body, url, tag }.
self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; }
  catch (e) { data = { title: 'DebateIt', body: (event.data && event.data.text && event.data.text()) || '' }; }
  const title = data.title || 'DebateIt';
  const options = {
    body: data.body || '',
    icon: data.icon || '/favicon.svg',
    badge: data.badge || '/favicon.svg',
    tag: data.tag || 'da-push',
    renotify: true,
    data: { url: data.url || '/' },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((cls) => {
      for (const c of cls) {
        if ('focus' in c) { try { c.navigate && c.navigate(url); } catch (e) {} return c.focus(); }
      }
      return self.clients.openWindow ? self.clients.openWindow(url) : null;
    })
  );
});

// Only cache successful, basic/cors responses. Never cache 4xx/5xx.
function shouldCache(response) {
  return response && response.ok && (response.type === 'basic' || response.type === 'cors');
}

// Cache only http(s) requests. Defense-in-depth so a future caller path
// can't bypass the protocol guard at the top of the fetch handler.
function isCacheableRequest(request) {
  if (!request || !request.url) return false;
  return request.url.indexOf('http:') === 0 || request.url.indexOf('https:') === 0;
}

// Fetch handler
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // ── HARD GUARD: only ever intercept http(s) ─────────────────────
  // Browser extensions (Grammarly, password managers, ad blockers,
  // ChatGPT helpers, Apollo, ChromePolyfill, etc.) inject content
  // scripts that surface here as chrome-extension:// (Chrome / Edge),
  // moz-extension:// (Firefox), or safari-extension:// (Safari). We
  // were calling event.respondWith on those, then cache.put(request,
  // ...) — which throws synchronously with "Failed to execute 'put'
  // on 'Cache': Request scheme '...' is unsupported" because Cache
  // only accepts http(s). Each failure surfaces as an unhandled
  // promise rejection; with a chatty extension installed the console
  // fills with 100+ errors per page load. Same applies to data:,
  // blob:, file:. Returning without calling event.respondWith() lets
  // the browser handle natively.
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return;
  }

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
          if (shouldCache(response) && isCacheableRequest(request)) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone)).catch(()=>{});
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
            if (shouldCache(response) && isCacheableRequest(request)) {
              const clone = response.clone();
              caches.open(CACHE_NAME).then((cache) => cache.put(request, clone)).catch(()=>{});
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
        if (shouldCache(response) && isCacheableRequest(request)) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone)).catch(()=>{});
        }
        return response;
      })
      .catch(() => caches.match(request))
  );
});
