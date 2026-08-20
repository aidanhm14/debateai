// ──────────────────────────────────────────────────────────────────
// Shared telemetry for Debatable.
// Drop <script src="/js/track.js" defer></script> on any page and it
// auto-fires session_start, page_view, heartbeat (every 60s), and
// session_end on pagehide. Signed-in visitors get the full session
// lifecycle; anonymous visitors get the ANON_OK subset below (the
// arena funnel + the gtag bridge), never the heartbeat.
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
  const SDK_VERSION = '10.13.2';
  // 3-minute heartbeat. Was 60s but at ~7K MAU that's ~210K
  // /api/log-event invocations/month from heartbeats alone — enough
  // to push the Netlify free tier (125K/mo) into usage_exceeded.
  // Session-length precision drops from ±60s to ±180s, which is
  // invisible for retention curves and cohort math.
  const HEARTBEAT_MS = 180_000;

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

  // Durable anonymous id. sessionId resets per tab; this survives, so
  // the signed-out half of the funnel (side_selected -> prediction_saved
  // -> signup_completed) can be joined into one subject. Never sent as
  // the auth key — the server still buckets anon writes under
  // 'anon:' + sessionId so admin-funnel's unique-starter dedupe is
  // unchanged. This rides along in metadata only.
  let anonId = '';
  try {
    anonId = localStorage.getItem('_da_aid') || '';
    if (!anonId) {
      anonId =
        (crypto && crypto.randomUUID && crypto.randomUUID()) ||
        (Date.now().toString(36) + Math.random().toString(36).slice(2, 10));
      localStorage.setItem('_da_aid', anonId);
    }
  } catch (e) {}

  let currentUser = null;
  let heartbeatTimer = null;
  let startFiredThisSession = sessionStorage.getItem('_da_sstf') === '1';
  let endFired = false;
  let pageViewFired = false;
  let pageViews = 0;

  // ── Anonymous presence beat (/api/presence-live) ──────────────────
  // Feeds the real "live in the last 30 minutes" pins on the /spar
  // globe. Separate from the auth-gated /api/log-event pipeline by
  // design: presence is anonymous-friendly (the GA realtime map counts
  // everyone, so should ours), carries ONLY the random per-tab session
  // id (server stamps city-level edge geo; nothing else), and never
  // touches Firebase. 5-min cadence + a 2-min sessionStorage floor so
  // cross-page nav doesn't spam the endpoint.
  //
  // 2026-08-14: the FIRST beat of a session now waits for evidence that a
  // human is here. It used to fire on load, unconditionally, which made
  // this a counter of page renders rather than of people.
  //
  // Measured: of 747 sessions recorded on 2026-08-14, 660 entered on
  // `/today/{YYYY-MM-DD}` across 576 DISTINCT dates, 509 of them seen
  // exactly once, essentially all from one 11 km cell in Dallas. That is
  // not abuse. `/today` is our own server-rendered daily-motion archive,
  // sitemapped and bounded at +/- 5 years, so a JS-executing crawler
  // walking ~3650 stable URLs is the SEO surface doing exactly what it
  // was built to do. The crawl is WANTED. Counting it as visitors was
  // the bug, and it reached both the landing globe and /admin.
  //
  // Two gates, and neither needs an IP, a user-agent sniff, or a shared
  // rate limiter:
  //   1. `navigator.webdriver` vetoes outright. This catches automation
  //      frameworks; it does NOT catch the search renderers, which
  //      deliberately do not set it. Gate 2 is what handles those.
  //   2. The first beat waits for one real interaction, or for
  //      PRESENCE_DWELL_MS of VISIBLE dwell (hidden time does not count)
  //      for someone who is only reading. A renderer executes for a few
  //      seconds and never scrolls or clicks.
  //
  // Later beats are ungated: the tab already proved itself, and
  // `_da_plast` survives same-tab navigation exactly like `_da_sid`, so
  // a person who engaged on page one is counted from page two onward
  // without re-earning it.
  //
  // Accepted cost, and it is the safe direction: a real visitor who
  // lands, reads nothing, touches nothing and leaves inside 20 seconds
  // is not counted. Presence should mean presence.
  const PRESENCE_MS = 5 * 60 * 1000;
  const PRESENCE_MIN_GAP_MS = 2 * 60 * 1000;
  const PRESENCE_DWELL_MS = 20 * 1000;
  const PRESENCE_SIGNALS = ['pointerdown', 'keydown', 'scroll', 'touchstart', 'wheel'];

  let presenceAutomated = false;
  try {
    presenceAutomated = navigator.webdriver === true;
  } catch (e) {}

  // A tab that has already beaten is already trusted.
  let presenceReady = Number(sessionStorage.getItem('_da_plast') || 0) > 0;
  let presenceDwellTimer = null;

  function presenceGateOff() {
    if (presenceDwellTimer) {
      clearInterval(presenceDwellTimer);
      presenceDwellTimer = null;
    }
    PRESENCE_SIGNALS.forEach(function (t) {
      try {
        window.removeEventListener(t, presenceUnlock, true);
      } catch (e) {}
    });
  }

  function presenceUnlock() {
    if (presenceReady) return;
    presenceReady = true;
    presenceGateOff();
    presenceBeat();
  }

  function presenceGateOn() {
    PRESENCE_SIGNALS.forEach(function (t) {
      try {
        window.addEventListener(t, presenceUnlock, { passive: true, capture: true });
      } catch (e) {
        window.addEventListener(t, presenceUnlock, true);
      }
    });
    // Visible dwell only. A backgrounded tab is not someone reading, and
    // a prerendered or preloaded page can sit hidden for a long time.
    let visibleMs = 0;
    let lastTick = Date.now();
    presenceDwellTimer = setInterval(function () {
      const now = Date.now();
      if (!document.hidden) visibleMs += now - lastTick;
      lastTick = now;
      if (visibleMs >= PRESENCE_DWELL_MS) presenceUnlock();
    }, 2000);
  }

  function presenceBeat() {
    try {
      if (document.hidden) return;
      if (presenceAutomated || !presenceReady) return;
      const last = Number(sessionStorage.getItem('_da_plast') || 0);
      if (Date.now() - last < PRESENCE_MIN_GAP_MS) return;
      // No prior beat in this tab = first beat of this session. Same
      // sessionStorage lifecycle as `_da_sid`, so it lines up with the
      // sid the server keys on. The server counts a session in
      // presence_daily only when this is true, and only then reads
      // `path` for the entry-page tally — it cannot infer "first beat"
      // on its own without paying a read per beat.
      const isFirst = !last;
      sessionStorage.setItem('_da_plast', String(Date.now()));
      fetch('/api/presence-live', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sid: sessionId,
          first: isFirst,
          path: location.pathname,
        }),
        keepalive: true,
      }).catch(function () {});
    } catch (e) {
      // Presence must never break the page.
    }
  }
  if (presenceAutomated) {
    // Nothing to arm. An automated agent never becomes a visitor.
  } else if (presenceReady) {
    presenceBeat(); // this tab already engaged on an earlier page
  } else {
    presenceGateOn();
  }
  setInterval(presenceBeat, PRESENCE_MS);
  document.addEventListener('visibilitychange', function () {
    if (!document.hidden) presenceBeat();
  });

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
    // Page may have already loaded firebase (index.html, practice.html, etc).
    // If so, just reuse it — initializeApp throws on duplicate without this check.
    if (!window.firebase || !window.firebase.initializeApp) {
      await loadScript('https://www.gstatic.com/firebasejs/' + SDK_VERSION + '/firebase-app-compat.js');
    }
    if (!window.firebase.auth) {
      await loadScript('https://www.gstatic.com/firebasejs/' + SDK_VERSION + '/firebase-auth-compat.js');
    }
    if (!firebase.apps.length) firebase.initializeApp(FIREBASE_CONFIG);
  }

  // Anon-allowed events. Mirrors VALID_EVENTS_ANON in log-event.mjs —
  // anything outside this set is silently dropped when the user isn't
  // signed in, since the server would reject it with a 401 anyway. We
  // keep the auth gate for the sensitive events (conversion, forum_post,
  // etc.) where an anon write would mean nothing.
  //
  // Arena funnel (added 2026-07-23): the whole point of these events is
  // the signed-out cohort, so gating them on auth measures nothing.
  // Volume note — the 2026-05-18 credit-burn envelope still holds. These
  // are user-ACTION events (a tap, a save, a share), not per-pageview
  // beacons, with two exceptions: arena_view and challenge_view. Anon
  // page_view is still suppressed in init(), so those two do not stack
  // on top of an existing anon beacon; they replace one that never
  // fired. If /api/log-event volume approaches the Netlify tier, cut
  // arena_view + challenge_view first and keep the action events.
  const ANON_OK = {
    battle_started: 1,
    page_view: 1,
    session_start: 1,
    session_heartbeat: 1,
    session_end: 1,
    app_event: 1,

    // discovery
    landing_view: 1,
    arena_view: 1,
    challenge_view: 1,
    creator_arena_viewed: 1,
    // participation
    side_selected: 1,
    prediction_started: 1,
    prediction_saved: 1,
    // account
    signup_prompted: 1,
    signup_completed: 1,
    // outcome + distribution
    verdict_viewed: 1,
    clip_viewed: 1,
    clip_shared: 1,
    sponsor_cta_clicked: 1,
  };

  async function post(event, metadata) {
    // Funnel events need to fire for anonymous users too — they're the
    // cohort the round-complete metric is supposed to measure, and the
    // pre-2026-05-18 version of this function silently dropped them.
    // Sign-in events still bypass via postSigninError below.
    const isAnon = !currentUser;
    if (isAnon && !ANON_OK[event]) return;
    try {
      const headers = { 'Content-Type': 'application/json' };
      if (currentUser) {
        try {
          const token = await currentUser.getIdToken();
          headers.Authorization = 'Bearer ' + token;
        } catch (e) {
          // Token fetch failed (revoked, network blip, etc.). Fall
          // through to the anon path rather than dropping the event.
          if (!ANON_OK[event]) return;
        }
      }
      await fetch('/api/log-event', {
        method: 'POST',
        headers,
        body: JSON.stringify({ event: event, metadata: metadata || {} }),
        keepalive: true,
      });
    } catch (e) {
      // Silent — telemetry must never break the app.
    }
  }

  /* Campaign attribution (2026-08-19).
   *
   * Every event carried `path: location.pathname`, which drops the query
   * string, and /tournaments carries no GA4 tag at all. So a utm-tagged
   * link was invisible to BOTH pipelines: nothing on the page could say
   * where a visitor came from, which makes any ad spend unmeasurable
   * rather than merely unoptimised.
   *
   * Captured once per session and held in sessionStorage, not read from
   * the URL each time: attribution belongs to the SESSION, and a visitor
   * who lands on a tagged link and then clicks through to /tournaments
   * would otherwise lose the source on the second page, which is exactly
   * the page where the entry happens.
   *
   * Two fields, not five, and only when present, so an organic visitor
   * adds zero bytes to every event. utm_content and utm_term are read
   * into the stash for the session_start row but are not carried on
   * every heartbeat; source and campaign are what answer "which channel
   * produced entrants", which is the whole question.
   */
  const UTM_KEY = '_da_utm';
  let campaign = null;
  try {
    const stashed = sessionStorage.getItem(UTM_KEY);
    if (stashed) {
      campaign = JSON.parse(stashed);
    } else {
      const q = new URLSearchParams(location.search);
      const src = (q.get('utm_source') || '').slice(0, 40);
      if (src) {
        campaign = {
          utm_source: src,
          utm_medium: (q.get('utm_medium') || '').slice(0, 40),
          utm_campaign: (q.get('utm_campaign') || '').slice(0, 60),
          utm_content: (q.get('utm_content') || '').slice(0, 60),
        };
        sessionStorage.setItem(UTM_KEY, JSON.stringify(campaign));
      }
    }
  } catch (e) {
    campaign = null; // storage blocked, or a malformed stash: attribution is not worth an exception
  }

  function baseMeta(extra) {
    const m = {
      session_id: sessionId,
      path: location.pathname,
    };
    if (campaign && campaign.utm_source) {
      m.utm_source = campaign.utm_source;
      if (campaign.utm_campaign) m.utm_campaign = campaign.utm_campaign;
    }
    if (anonId) m.anon_id = anonId;
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

    // Always send — anon path (added 2026-05-18) lets post() route the
    // event under a synthetic anon:{sessionId} uid on the server when
    // the user hasn't signed in. The pre-anon queue (drainGtagQueue,
    // gtagQueue) is gone because the queue's purpose — hold events
    // until auth resolves — is moot once anon is a valid auth state.
    post('app_event', baseMeta(meta));
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
    pageViews += 1;
    post('page_view', baseMeta({
      referrer: (document.referrer || '').slice(0, 200),
      title: (document.title || '').slice(0, 200),
      // Recorded, never filtered on the way in. The 2026-08-14 presence
      // work established that this site's dominant traffic source is our
      // own /today crawl, and that dropping it at the client is how a
      // visit stops existing anywhere. So every view is written and the
      // reader decides: `automated` is navigator.webdriver, and `engaged`
      // (on session_end) says whether the human gate ever opened. A count
      // of PEOPLE filters on those; a count of VISITS does not.
      automated: presenceAutomated,
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
    if (endFired) return;
    endFired = true;
    // getIdToken is async, but fetch keepalive lets the request complete
    // after pagehide as long as we kick it off synchronously-ish.
    post('session_end', baseMeta({
      duration_s: Math.floor((Date.now() - sessionStart) / 1000),
      // Did this session ever prove a human was here? Same gate the
      // presence beat uses (one real interaction, or 20s of VISIBLE
      // dwell). Written here rather than enforced at the door so a
      // session that never engaged is still on the record as a visit.
      engaged: presenceReady,
      views: pageViews,
    }));
  }

  // session_start + page_view, for everyone. Guarded internally, so the
  // auth callback firing twice (null, then a user) records one session
  // and one view rather than two.
  function fireLifecycle() {
    fireSessionStart();
    firePageView();
  }

  // ── Anonymous visits are recorded (2026-08-14) ────────────────────
  // This REVERSES the 2026-05-18 rule that anonymous visitors got no
  // session_start and no page_view. That rule was a Netlify-invocation
  // decision taken against a ~7K MAU estimate from the ad spike, and
  // §8 has since recorded that spike as an artifact: real engaged usage
  // is roughly two orders of magnitude below the number the envelope was
  // sized against. Its cost is that the majority of traffic on this site
  // has left no record of ever arriving, which is the thing being fixed.
  //
  // The heartbeat stays signed-in only, deliberately. That is the one
  // event that fires per 3 minutes rather than per visit, so it is the
  // only part of the lifecycle whose volume scales with dwell instead
  // of with people, and it is what the 2026-05-18 audit was actually
  // about. Anonymous visitors get exactly three events per session:
  // session_start, page_view, session_end.
  //
  // Nothing here is filtered on the way in. See firePageView.

  // Waiting for Firebase before recording a visit means a browser that
  // cannot load Firebase records nothing, and that population is real
  // and already documented (Safari ITP, in-app browsers, strict
  // blockers) — it is the same population the 2026-04-20 gate reversal
  // was for. So: no persisted Firebase session in localStorage means
  // nobody can be signed in here, and the visit is recorded immediately
  // under the anonymous path. With a persisted session we wait, so the
  // events attach to the real uid rather than to a device id.
  function hasPersistedAuth() {
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.indexOf('firebase:authUser:') === 0) return true;
      }
    } catch (e) {
      // localStorage blocked, so no persisted session is readable
      // either way. Record now rather than wait for an answer that
      // cannot arrive.
    }
    return false;
  }

  async function init() {
    // Fire end on tab close / navigate away. Registered BEFORE the
    // await so a page unloaded during the Firebase fetch still closes
    // its session. pagehide is more reliable than beforeunload on
    // mobile; both are registered because iOS Safari skips pagehide.
    window.addEventListener('pagehide', fireSessionEnd);
    window.addEventListener('beforeunload', fireSessionEnd);

    if (!hasPersistedAuth()) fireLifecycle();
    // Backstop: a persisted session whose SDK never loads (blocked CDN,
    // dead network) would otherwise record nothing at all. Record it
    // anonymously instead. The guards inside make this a no-op if auth
    // resolved first.
    else setTimeout(fireLifecycle, 6000);

    await ensureFirebase();
    firebase.auth().onAuthStateChanged(function (user) {
      currentUser = user && !user.isAnonymous ? user : null;
      fireLifecycle();
      // Heartbeat stays signed-in only. See the note above.
      if (!currentUser) return;
      if (heartbeatTimer) clearInterval(heartbeatTimer);
      heartbeatTimer = setInterval(fireHeartbeat, HEARTBEAT_MS);
    });
  }

  init().catch(function (e) {
    // Firebase failed to load. The visit is still recorded: either it
    // already fired above, or the 6s backstop is pending.
    fireLifecycle();
    if (window.console && console.warn) console.warn('[track] init failed:', e.message);
  });
})();
