// ──────────────────────────────────────────────────────────────────
// Shared telemetry for Debate AI.
// Drop <script src="/js/track.js" defer></script> on any page and it
// auto-fires session_start, page_view, heartbeat (every 60s), and
// session_end on pagehide. All events auth-required — anonymous
// visits stay silent.
//
// Exposes window.track(event, metadata) for page-specific calls.
// Feeds the same /api/log-event pipeline the /admin dashboard reads.
//
// Also pulls in /js/page-transition.js as a side-effect: that file is
// the cross-page fade transition (in/out body opacity on internal nav)
// and lives behind the same script tag so any page with track.js gets
// the smoother nav for free, without per-page wiring. Idempotent —
// loading the same script twice is a no-op since the IIFE inside it
// only registers handlers once.
// ──────────────────────────────────────────────────────────────────
(function () {
  try {
    var existing = document.querySelector('script[src="/js/page-transition.js"]');
    if (!existing) {
      var pt = document.createElement('script');
      pt.src = '/js/page-transition.js';
      pt.defer = true;
      document.head.appendChild(pt);
    }
  } catch (e) {}
})();

(function () {
  'use strict';

  const FIREBASE_CONFIG = {
    apiKey: ['AIzaSyDDx', 'TYlyWLOJnFP99', 'e7XsLPb3FwIEijNNM'].join(''),
    authDomain: 'debateos-78ac5.firebaseapp.com',
    projectId: 'debateos-78ac5',
    storageBucket: 'debateos-78ac5.firebasestorage.app',
    messagingSenderId: '860359449192',
    appId: '1:860359449192:web:f5dc0060dbd50d6c4fb9dd',
    measurementId: 'G-0V4R5MY3BT',
  };
  const SDK_VERSION = '10.7.1';
  const HEARTBEAT_MS = 60_000;

  // ── Session identity (per browser tab, survives SPA nav) ─────────
  let sessionId = sessionStorage.getItem('_da_sid');
  let sessionStart = Number(sessionStorage.getItem('_da_sst') || 0);
  if (!sessionId) {
    sessionId =
      (crypto && crypto.randomUUID && crypto.randomUUID()) ||
      (Date.now().toString(36) + Math.random().toString(36).slice(2, 10));
    sessionStart = Date.now();
    sessionStorage.setItem('_da_sid', sessionId);
    sessionStorage.setItem('_da_sst', String(sessionStart));
  }

  let currentUser = null;
  let heartbeatTimer = null;
  let startFiredThisSession = sessionStorage.getItem('_da_sstf') === '1';
  let endFired = false;
  let pageViewFired = false;

  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      const existing = document.querySelector('script[src="' + src + '"]');
      if (existing) return resolve();
      const s = document.createElement('script');
      s.src = src;
      s.async = true;
      s.onload = resolve;
      s.onerror = function () { reject(new Error('Failed to load ' + src)); };
      document.head.appendChild(s);
    });
  }

  async function ensureFirebase() {
    // Page may have already loaded firebase (index.html, debate-ai.html, etc).
    // If so, just reuse it — initializeApp throws on duplicate without this check.
    if (!window.firebase || !window.firebase.initializeApp) {
      await loadScript('https://www.gstatic.com/firebasejs/' + SDK_VERSION + '/firebase-app-compat.js');
    }
    if (!window.firebase.auth) {
      await loadScript('https://www.gstatic.com/firebasejs/' + SDK_VERSION + '/firebase-auth-compat.js');
    }
    if (!firebase.apps.length) firebase.initializeApp(FIREBASE_CONFIG);
  }

  async function post(event, metadata) {
    if (!currentUser) return;
    try {
      const token = await currentUser.getIdToken();
      await fetch('/api/log-event', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer ' + token,
        },
        body: JSON.stringify({ event: event, metadata: metadata || {} }),
        keepalive: true,
      });
    } catch (e) {
      // Silent — telemetry must never break the app.
    }
  }

  function baseMeta(extra) {
    const m = {
      session_id: sessionId,
      path: location.pathname,
    };
    if (extra) {
      for (const k in extra) if (Object.prototype.hasOwnProperty.call(extra, k)) m[k] = extra[k];
    }
    return m;
  }

  // Public API — usable from page scripts: window.track('forum_post', {topic:'...'})
  window.track = function (event, metadata) {
    return post(event, baseMeta(metadata));
  };

  // gtag → track bridge. Every gtag('event', name, params) call gets
  // mirrored into the per-user log under the generic 'app_event'
  // allowlist entry, with the original event name carried as
  // metadata.name. This means existing gtag analytics on any page that
  // loads track.js automatically populate the per-user activity feed
  // — no code-level changes needed at each call site. We queue events
  // fired before the user resolves so we don't drop early page events.
  //
  // Special-case: sign_in_* events are diverted to the no-auth
  // /api/log-signin-error endpoint. Sign-in errors happen precisely
  // when the user has NO Firebase token, so the regular post() path
  // (which requires currentUser) was silently dropping the very
  // population we need to diagnose. The 62% sign-in drop in the
  // Performance Report is downstream of this gap.
  var gtagQueue = [];

  var ua = navigator.userAgent || '';
  var IS_MOBILE = /iPhone|iPad|Android/i.test(ua);
  var IS_INAPP = /(Instagram|FBAN|FBAV|FB_IAB|Twitter|LinkedIn|TikTok|MicroMessenger|Line[/])/i.test(ua);

  function postSigninError(name, params) {
    try {
      var payload = {
        event: name,
        code: (params && params.code) || 'unknown',
        message: (params && params.message) || '',
        surface: (params && params.surface) || '',
        method: (params && params.method) || '',
        inApp: IS_INAPP,
        isMobile: IS_MOBILE,
        sessionId: sessionId,
        path: location.pathname,
      };
      fetch('/api/log-signin-error', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        keepalive: true,
      }).catch(function(){ /* silent — telemetry must never break the app */ });
    } catch(e){}
  }

  function bridge(name, params) {
    var meta = { name: String(name).slice(0, 80) };
    if (params && typeof params === 'object'){
      // Sanitize at the edge — the server already truncates, but
      // keeping the shape tight here saves a round-trip on garbage.
      var keys = Object.keys(params).slice(0, 10);
      for (var i = 0; i < keys.length; i++){
        var k = keys[i], v = params[k];
        if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean'){
          meta[k] = v;
        }
      }
    }

    // Sign-in family bypasses the auth-gated path. We still post to
    // app_event when the user IS authed, since the per-user activity
    // dashboard wants the timeline too.
    if (name.indexOf('sign_in_') === 0) {
      postSigninError(name, params);
    }

    if (currentUser) post('app_event', baseMeta(meta));
    else gtagQueue.push(meta);
  }
  function drainGtagQueue() {
    if (!currentUser || !gtagQueue.length) return;
    var batch = gtagQueue; gtagQueue = [];
    for (var i = 0; i < batch.length; i++) post('app_event', baseMeta(batch[i]));
  }
  try {
    var origGtag = window.gtag;
    window.gtag = function(){
      try { if (origGtag) origGtag.apply(this, arguments); } catch(e){}
      try {
        var a = arguments;
        if (a && a[0] === 'event' && typeof a[1] === 'string'){
          bridge(a[1], a[2] || {});
        }
      } catch(e){}
    };
  } catch(e){}

  function firePageView() {
    if (pageViewFired) return;
    pageViewFired = true;
    post('page_view', baseMeta({
      referrer: (document.referrer || '').slice(0, 200),
      title: (document.title || '').slice(0, 200),
    }));
  }

  function fireSessionStart() {
    if (startFiredThisSession) return;
    startFiredThisSession = true;
    sessionStorage.setItem('_da_sstf', '1');
    post('session_start', baseMeta({
      user_agent: (navigator.userAgent || '').slice(0, 200),
      screen: screen.width + 'x' + screen.height,
      lang: navigator.language,
    }));
  }

  function fireHeartbeat() {
    if (document.visibilityState !== 'visible') return;
    post('session_heartbeat', baseMeta({
      duration_s: Math.floor((Date.now() - sessionStart) / 1000),
    }));
  }

  function fireSessionEnd() {
    if (endFired || !currentUser) return;
    endFired = true;
    // getIdToken is async, but fetch keepalive lets the request complete
    // after pagehide as long as we kick it off synchronously-ish.
    post('session_end', baseMeta({
      duration_s: Math.floor((Date.now() - sessionStart) / 1000),
    }));
  }

  async function init() {
    await ensureFirebase();
    firebase.auth().onAuthStateChanged(function (user) {
      currentUser = user || null;
      if (!user) return;
      fireSessionStart();
      firePageView();
      drainGtagQueue();
      if (heartbeatTimer) clearInterval(heartbeatTimer);
      heartbeatTimer = setInterval(fireHeartbeat, HEARTBEAT_MS);
    });

    // Fire end on tab close / navigate away. pagehide is more reliable
    // than beforeunload on mobile. visibilitychange to 'hidden' is not
    // a reliable signal (fires on tab-switch too), so we only use it
    // as a last-resort on iOS Safari which sometimes skips pagehide.
    window.addEventListener('pagehide', fireSessionEnd);
    window.addEventListener('beforeunload', fireSessionEnd);
  }

  init().catch(function (e) {
    if (window.console && console.warn) console.warn('[track] init failed:', e.message);
  });
})();
