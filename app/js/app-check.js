// Firebase App Check init + auto-attach helper.
//
// Provider: reCAPTCHA Enterprise (score-based site key below), registered on
// the DebateOS web app in Firebase project debateos-78ac5 on 2026-07-27.
//
// Server enforcement: set APP_CHECK_REQUIRED=true in the Netlify prod env for
// the AI functions to hard-enforce. Until that flag is on, the server
// soft-passes missing/invalid tokens and only logs.
//
// WHY ACTIVATION IS DEFERRED (2026-08-18): activate() is what pulls the
// reCAPTCHA Enterprise bundle, ~804KB — the single largest asset on the site,
// and it used to download on every page load including for a visitor who
// bounced off the homepage without touching anything. It now activates on the
// first real sign of intent (pointer, key, touch) or on the first call to a
// gated endpoint, whichever comes first.
//
// The ordering rule that keeps this safe under hard enforcement: a call to a
// GATED route always activates and waits for the token before going out. A
// call to any other route attaches a token only if App Check is already up,
// and never triggers activation on its own — otherwise the homepage's own
// /api/watch-live poll would drag the 804KB back in on page load and undo the
// whole thing.

(function () {
  var APP_CHECK_SITE_KEY = '6LcCG2gtAAAAANR70uPFdOC0TeixdQqspYYciOac';

  // Routes whose server side calls checkAppCheck(). A fetch to one of these
  // must carry a token, so it activates App Check and waits. Keep in sync
  // with the functions that import lib/appcheck.mjs.
  var GATED = [
    '/api/argument-lint', '/api/blocks', '/api/claude', '/api/coach-session',
    '/api/deepseek', '/api/extract-claims', '/api/flow', '/api/gemini',
    '/api/grok', '/api/log-generation', '/api/log-opinion-delta',
    '/api/record-extract',
    '/api/openai-chat', '/api/openlab', '/api/realtime-session',
    '/api/room-judge-session', '/api/submit-audience-question',
    '/api/suggest-topic', '/api/topic-vote', '/api/transcribe',
    '/api/translate', '/api/tts', '/api/upvote-question',
    '/.netlify/functions/counter-doc', '/.netlify/functions/docs-agent'
  ];

  // Routes that meter per account. These get the Firebase ID token attached
  // too, for BOTH named and anonymous users.
  //
  // Why anonymous users need to send a token: the free round used to be
  // metered in localStorage, which any visitor can reset, so nothing
  // server-side actually enforced it. The server now meters the free round
  // against the anonymous Firebase uid that js/notifications.js already mints
  // on nearly every page, and tells the two apart via the token's
  // sign_in_provider claim. No token means no identity to meter, so the
  // free round leaks again.
  //
  // Deliberately NOT the whole /api/* surface. Sending an anonymous token to
  // the account endpoints is what produced the /api/teams/usage 404 and
  // /api/user/style-summary 500 documented in practice.html — those read it
  // as a signed-in user and go looking for records that cannot exist. Only
  // endpoints that call isNamedAccount() belong on this list.
  var AUTH_ROUTES = [
    '/api/claude', '/api/gemini', '/api/grok',
    '/api/openai-chat', '/api/deepseek', '/api/openlab',
    // Added 2026-08-19 with the per-caller metering pass. /api/tts in
    // particular MUST get the token: it now resolves the paid plan from the
    // account rather than trusting body.premium, so a tokenless call means a
    // paying user silently drops to the free voice.
    '/api/tts', '/api/transcribe', '/api/translate',
    '/api/flow', '/api/extract-claims'
  ];

  function needsAuth(url) {
    for (var i = 0; i < AUTH_ROUTES.length; i++) {
      if (url.indexOf(AUTH_ROUTES[i]) >= 0) return true;
    }
    return false;
  }

  // Read the CURRENT Firebase user's token. Never mints one: if auth has not
  // settled (or the page never loaded it) this resolves null and the call
  // goes out tokenless, landing in the per-IP lane. Degrading is correct —
  // stalling a round on an auth handshake is not.
  //
  // EXCEPT when a session is on disk and simply has not rehydrated yet.
  // Firebase restores `currentUser` asynchronously, so a call fired in
  // that window went out tokenless and the server read the caller as
  // free. On /api/tts that is not a metering nicety: entitlement to the
  // ElevenLabs voice resolves from the account, so a paying user got
  // the free voice for the chunks that raced the handshake, and the
  // voice CHANGED mid-speech once it settled. Reported as the HD voice
  // going missing. If localStorage holds a persisted Firebase session
  // we wait briefly for it rather than degrading; with no persisted
  // session nobody can be signed in, so that path still never waits.
  var AUTH_SETTLE_MS = 2000;
  function hasPersistedSession() {
    try {
      for (var i = 0; i < localStorage.length; i++) {
        if (String(localStorage.key(i) || '').indexOf('firebase:authUser:') === 0) return true;
      }
    } catch (e) {}
    return false;
  }
  function currentIdToken() {
    try {
      if (typeof firebase === 'undefined' || !firebase.auth) return Promise.resolve(null);
      if (!firebase.apps || !firebase.apps.length) return Promise.resolve(null);
      var u = firebase.auth().currentUser;
      if (u && typeof u.getIdToken === 'function') {
        return u.getIdToken().catch(function () { return null; });
      }
      if (!hasPersistedSession()) return Promise.resolve(null);
      return new Promise(function (resolve) {
        var done = false;
        var unsub = null;
        function finish(tok) {
          if (done) return;
          done = true;
          try { if (unsub) unsub(); } catch (e) {}
          resolve(tok || null);
        }
        // Bounded: a slow or failed handshake still lets the round run,
        // just on the free lane, which is the old behaviour.
        setTimeout(function () { finish(null); }, AUTH_SETTLE_MS);
        try {
          unsub = firebase.auth().onAuthStateChanged(function (user) {
            if (!user || typeof user.getIdToken !== 'function') return finish(null);
            user.getIdToken().then(finish).catch(function () { finish(null); });
          }, function () { finish(null); });
        } catch (e) { finish(null); }
      });
    } catch (e) {
      return Promise.resolve(null);
    }
  }

  function hasAuthHeader(h) {
    try {
      if (!h) return false;
      if (typeof Headers !== 'undefined' && h instanceof Headers) return !!h.get('Authorization');
      for (var k in h) { if (String(k).toLowerCase() === 'authorization') return true; }
    } catch (e) {}
    return false;
  }

  var activated = false;
  var activating = null;   // non-null once activation has been kicked off

  var APP_CHECK_SDK =
    'https://www.gstatic.com/firebasejs/10.13.2/firebase-app-check-compat.js';

  function appReady() {
    return typeof firebase !== 'undefined'
      && firebase.apps && firebase.apps.length;
  }

  // Six client modules (track, usage-banner, upgrade-cta, topbar,
  // notifications, auth-modal) each lazily inject firebase-app-compat when
  // they find no firebase on the page. Whichever injection lands last owns
  // window.firebase, and it takes the appCheck component with it — a static
  // app-check-compat tag that loaded against an earlier namespace is simply
  // gone. Measured on /high-school, where two app-compat tags raced and
  // firebase.appCheck came out undefined.
  //
  // Rather than try to win that race, load the App Check SDK here, at
  // activation time. Activation is deferred to first intent, by which point
  // every injector has settled, so whatever we register onto is the
  // namespace that survives.
  function ensureAppCheckSdk() {
    if (typeof firebase !== 'undefined' && firebase.appCheck) return Promise.resolve(true);
    return new Promise(function (resolve) {
      var existing = document.querySelector('script[data-appcheck-sdk]');
      if (existing) {
        existing.addEventListener('load', function () { resolve(!!(firebase && firebase.appCheck)); }, { once: true });
        existing.addEventListener('error', function () { resolve(false); }, { once: true });
        return;
      }
      var s = document.createElement('script');
      s.src = APP_CHECK_SDK;
      s.async = true;
      s.setAttribute('data-appcheck-sdk', '1');
      s.addEventListener('load', function () { resolve(!!(firebase && firebase.appCheck)); }, { once: true });
      s.addEventListener('error', function () { resolve(false); }, { once: true });
      document.head.appendChild(s);
    });
  }

  // firebase.initializeApp() runs from inline scripts on most pages, which may
  // execute before or after this file. Wait for it, but never forever.
  function waitForSdk(timeoutMs) {
    return new Promise(function (resolve) {
      if (appReady()) { resolve(true); return; }
      var start = Date.now();
      var iv = setInterval(function () {
        if (appReady()) { clearInterval(iv); resolve(true); }
        else if (Date.now() - start > timeoutMs) { clearInterval(iv); resolve(false); }
      }, 60);
    });
  }

  function ensureActivated() {
    if (activated) return Promise.resolve(true);
    if (activating) return activating;
    activating = waitForSdk(8000).then(function (ready) {
      if (!ready) { activating = null; return false; }
      return ensureAppCheckSdk();
    }).then(function (haveSdk) {
      if (haveSdk === false) { activating = null; return false; }
      if (!APP_CHECK_SITE_KEY || APP_CHECK_SITE_KEY === '__FILL_IN_FROM_FIREBASE_CONSOLE__') {
        console.info('[appcheck] site key not set — skipping activation (see app/js/app-check.js)');
        return false;
      }
      try {
        // reCAPTCHA Enterprise: activate() takes a provider instance, not a
        // bare string (the bare-string form is the reCAPTCHA v3 shape). If the
        // compat SDK didn't load the class for any reason this throws and is
        // caught below, leaving App Check inactive (graceful soft-pass under
        // soft mode) rather than broken.
        var provider = new firebase.appCheck.ReCaptchaEnterpriseProvider(APP_CHECK_SITE_KEY);
        firebase.appCheck().activate(provider, /* isTokenAutoRefreshEnabled */ true);
        activated = true;
        console.info('[appcheck] activated (reCAPTCHA Enterprise)');
        return true;
      } catch (e) {
        console.warn('[appcheck] activation failed:', e && e.message);
        activating = null;   // let a later call retry
        return false;
      }
    });
    return activating;
  }

  // Warm on the first sign of intent, so the token is already minted by the
  // time a click turns into an API call. Deliberately NOT on scroll: a scroll
  // is not intent, and passive readers are exactly who this saves the download
  // for. A user who somehow reaches a gated call without any of these still
  // works — the gated path below activates and waits.
  var WARM = ['pointerdown', 'keydown', 'touchstart'];
  function warm() {
    for (var i = 0; i < WARM.length; i++) window.removeEventListener(WARM[i], warm, true);
    ensureActivated();
  }
  for (var i = 0; i < WARM.length; i++) {
    window.addEventListener(WARM[i], warm, { capture: true, passive: true });
  }

  // Public API: callers can await this for a fresh App Check token. Activates
  // if needed. Returns null when App Check can't come up, so callers fall
  // through gracefully (which the server soft-passes until enforcement).
  window.getAppCheckToken = async function () {
    var ok = await ensureActivated();
    if (!ok) return null;
    try {
      var result = await firebase.appCheck().getToken(/* forceRefresh */ false);
      return (result && result.token) || null;
    } catch (e) {
      return null;
    }
  };

  // Token for a non-gated call: never starts activation, but does wait for one
  // already in flight so a call landing mid-activation still carries a token.
  async function tokenIfAlreadyUp() {
    if (!activated && !activating) return null;
    return window.getAppCheckToken();
  }

  function isGated(url) {
    for (var g = 0; g < GATED.length; g++) {
      if (url.indexOf(GATED[g]) === 0 || url.indexOf(GATED[g]) > 0) return true;
    }
    return false;
  }

  // Auto-attach App Check token to every /api/* fetch call. Wrapping fetch
  // means every existing call site picks this up with zero edits — there are
  // ~10 fetch('/api/claude') sites across HTML files; centralizing here is
  // safer than touching each.
  var origFetch = window.fetch.bind(window);
  window.fetch = async function (input, init) {
    var url = '';
    try {
      url = typeof input === 'string' ? input : (input && input.url) || '';
    } catch (e) {}
    var isApi = url.indexOf('/api/') === 0 || url.indexOf('/.netlify/functions/') >= 0;
    if (!isApi) return origFetch(input, init);
    try {
      var token = isGated(url) ? await window.getAppCheckToken() : await tokenIfAlreadyUp();
      if (token) {
        init = init || {};
        var h = init.headers;
        if (typeof Headers !== 'undefined' && h instanceof Headers) {
          h.set('X-Firebase-AppCheck', token);
        } else {
          init.headers = Object.assign({}, h || {}, { 'X-Firebase-AppCheck': token });
        }
      }
    } catch (e) {}
    // Identity, for the endpoints that meter per account. Never clobbers an
    // Authorization header a call site set for itself.
    try {
      if (needsAuth(url) && !hasAuthHeader(init && init.headers)) {
        var idToken = await currentIdToken();
        if (idToken) {
          init = init || {};
          var ah = init.headers;
          if (typeof Headers !== 'undefined' && ah instanceof Headers) {
            ah.set('Authorization', 'Bearer ' + idToken);
          } else {
            init.headers = Object.assign({}, ah || {}, { Authorization: 'Bearer ' + idToken });
          }
        }
      }
    } catch (e) {}
    return origFetch(input, init);
  };
})();
