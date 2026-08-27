// Bumped to v10 to invalidate the cached React bundle that predates the
// Competitive-tab reshuffle (Case Feedback + Vocab Quiz added, Feedback
// removed from Other; the 4-tier pricing gate; BYOK "Claude only" error).
// Without this bump, users on v9 kept seeing the old dropdown with only
// 8 items and the old 3-card pricing panel.



const CACHE_NAME = 'debateos-v3021';



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
// 2026-07-28: '/native' added. It is the iOS app's entry point, so the app
// hit the network for it on EVERY cold launch while the shell precached
// /splash and /landing, two pages the app never opens (the bridge redirects
// both to /native). See the '/native' branch in the fetch handler below.
// 2026-08-05 perf pass: d3 removed from the shell. index.html lazy-loads it
// via loadD3() for a MindMapView that rarely mounts, and the cdnjs
// cache-first fetch branch below caches it on first real use anyway —
// precaching re-downloaded ~270KB on every CACHE_NAME bump for a view
// nobody opens. Same class of waste as the babel-standalone entry above.
const APP_SHELL = [
  '/native',
  '/splash',
  '/landing',
  '/offline.html',
  'https://cdnjs.cloudflare.com/ajax/libs/react/18.2.0/umd/react.production.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/react-dom/18.2.0/umd/react-dom.production.min.js',
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
  catch (e) { data = { title: 'Debatable', body: (event.data && event.data.text && event.data.text()) || '' }; }
  const title = data.title || 'Debatable';
  const options = {
    body: data.body || '',
    icon: data.icon || '/favicon.svg',
    badge: data.badge || '/favicon.svg',
    tag: data.tag || 'da-push',
    renotify: true,
    data: { url: data.url || '/' },
  };
  const roundPush = options.tag === 'da-spar-match' || options.tag.startsWith('da-live-');
  event.waitUntil((roundPush
    ? self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((cls) => {
        const inRound = cls.some((c) => {
          try { return /^\/(live-round|voice-debate|exhibition|casual-room|newvoice|room-judge)(?:\.html)?(?:\/|$)/.test(new URL(c.url).pathname); }
          catch (e) { return false; }
        });
        return inRound ? null : self.registration.showNotification(title, options);
      })
    : self.registration.showNotification(title, options)));
});
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  // Tag the destination so the open is measurable. Measured 2026-08-24:
  // 131 go-live broadcasts went out to a median of 18 people each, roughly
  // 2,350 notifications, and NOTHING recorded whether a single one was ever
  // opened. Every argument for the ping channel (and for the SMS channel
  // built on the same premise) rests on an open rate nobody had measured.
  //
  // The SW cannot post the event itself: log-event's anonymous path needs a
  // real metadata.session_id and a worker has no session. So it tags the URL
  // and js/track.js, which owns the session, records the open on load.
  let url = (event.notification.data && event.notification.data.url) || '/';
  try {
    const u = new URL(url, self.location.origin);
    u.searchParams.set('src', 'push');
    // Record the KIND, never the raw tag: go-live tags are 'da-live-<uid>'
    // and a DM tag carries a thread id, so passing them through would put a
    // uid fragment in the URL and give the analytics field unbounded
    // cardinality. Four buckets is all the question needs.
    const tag = String(event.notification.tag || '');
    const kind = tag.indexOf('da-live-') === 0 ? 'golive'
      : tag === 'da-spar-match' ? 'match'
      : tag.indexOf('da-dm-') === 0 ? 'dm'
      : '';
    if (kind) u.searchParams.set('pk', kind);
    // Same-origin only. A payload url pointing elsewhere is not ours to
    // decorate, and appending our params to a third-party link would leak
    // where the click came from.
    url = u.origin === self.location.origin ? u.pathname + u.search + u.hash : url;
  } catch (e) { /* a malformed url still navigates, just untagged */ }
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

  // Never intercept Firebase realtime / auth endpoints.
  // Firestore's Listen and Write channels are long-poll GETs that return 200
  // CORS responses, which shouldCache() happily accepts. Every one carries a
  // unique gsessionid/SID/AID, so each got written to the cache and could
  // never be read back: one browsing session left ~40 dead channel entries
  // in there, growing without bound and eventually risking storage quota.
  // Auth and installations are per-request too, and replaying either would
  // be worse than useless.
  //
  // Scoped by exact host so fonts.googleapis.com and fonts.gstatic.com stay
  // cacheable, which is what makes the webfont survive a cold launch.
  if (/^(firestore|firebaseinstallations|identitytoolkit|securetoken|firebaseremoteconfig)\.googleapis\.com$/.test(url.hostname) ||
      /\.firebaseio\.com$/.test(url.hostname)) {
    return;
  }

  // Never intercept POST/PUT/DELETE — SW caching of mutations is a footgun
  if (request.method !== 'GET') {
    return;
  }

  // ── /native: serve from cache, refresh behind it ──────────────────
  // Every other page is network-first below, which is right for a website:
  // a visitor should never read stale copy. But /native is the iOS app's
  // launch screen, so network-first meant the app sat on a cream splash
  // waiting for a round trip on every single cold start (measured 3.6s in
  // the simulator, on fast network with a warm cache). It is a 13KB static
  // shell whose live content all arrives client-side from Firebase, so
  // last launch's copy is safe to paint immediately.
  //
  // Staleness is bounded to one launch two ways: the revalidate below
  // writes the fresh copy for next time, and CACHE_NAME bumps on every
  // client deploy, which drops the whole cache and forces a real fetch.
  if (request.mode === 'navigate' && /^\/native(?:\.html)?\/?$/.test(url.pathname)) {
    event.respondWith(
      caches.match(request).then((cached) => {
        const network = fetch(request)
          .then((response) => {
            if (shouldCache(response) && isCacheableRequest(request)) {
              const clone = response.clone();
              caches.open(CACHE_NAME).then((cache) => cache.put(request, clone)).catch(()=>{});
            }
            return response;
          })
          .catch(() => cached || caches.match('/offline.html'));
        return cached || network;
      })
    );
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

  // Page narration (read-aloud.js) — cache-first, and never cache a partial.
  //
  // These files are the one asset the site replays across navigations, so
  // serving them from cache is what makes "keep listening while you browse"
  // resume instantly instead of re-fetching on every page load.
  //
  // Range requests are passed straight through. A media element commonly
  // asks for a byte range and gets a 206, which passes response.ok and
  // would otherwise be stored and later replayed as if it were the whole
  // file, producing audio that truncates for no visible reason. Only a
  // full 200 is ever written to the cache.
  //
  // manifest.json is deliberately NOT included: it is the index that
  // changes every time narration is rebuilt, and serving it cache-first
  // pins a visitor to an old page list until CACHE_NAME moves. It falls
  // through to the network-first default below. Only the MP3s, whose
  // contents are stable for a given CACHE_NAME, are cached here.
  if (url.origin === self.location.origin &&
      url.pathname.startsWith('/audio/narration/') &&
      url.pathname.endsWith('.mp3')) {
    if (request.headers.get('range')) {
      event.respondWith(fetch(request));
      return;
    }
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ||
          fetch(request).then((response) => {
            if (response && response.status === 200 && shouldCache(response) && isCacheableRequest(request)) {
              const clone = response.clone();
              caches.open(CACHE_NAME).then((cache) => cache.put(request, clone)).catch(()=>{});
            }
            return response;
          })
      )
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
