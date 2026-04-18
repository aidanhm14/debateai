// Firebase App Check init + auto-attach helper.
//
// Setup (one-time, in Firebase Console):
//   1. Build → App Check → register the web app with reCAPTCHA Enterprise.
//   2. Copy the site key Firebase shows you.
//   3. Paste it as APP_CHECK_SITE_KEY below.
//   4. (Server) set APP_CHECK_REQUIRED=true in Netlify env vars to enforce.
//
// Until the site key is filled in, this file is a graceful no-op — pages still
// work, fetch still works, App Check just doesn't activate. Server matches:
// it soft-passes missing tokens unless APP_CHECK_REQUIRED=true.

(function () {
  var APP_CHECK_SITE_KEY = '__FILL_IN_FROM_FIREBASE_CONSOLE__';

  var activated = false;
  var activationAttempted = false;

  function tryActivate() {
    if (activationAttempted) return;
    if (typeof firebase === 'undefined') return;
    if (!firebase.apps || !firebase.apps.length) return;
    if (!firebase.appCheck) return;
    activationAttempted = true;
    if (!APP_CHECK_SITE_KEY || APP_CHECK_SITE_KEY === '__FILL_IN_FROM_FIREBASE_CONSOLE__') {
      console.info('[appcheck] site key not set — skipping activation (see app/js/app-check.js)');
      return;
    }
    try {
      firebase.appCheck().activate(APP_CHECK_SITE_KEY, /* isTokenAutoRefreshEnabled */ true);
      activated = true;
      console.info('[appcheck] activated');
    } catch (e) {
      console.warn('[appcheck] activation failed:', e && e.message);
    }
  }

  // firebase.initializeApp() runs from inline scripts on most pages, which may
  // execute before or after this file depending on script ordering. Poll briefly
  // until the SDK is ready, then stop.
  var pollCount = 0;
  var poll = setInterval(function () {
    tryActivate();
    pollCount++;
    if (activationAttempted || pollCount > 50) clearInterval(poll); // ~5s max
  }, 100);
  document.addEventListener('DOMContentLoaded', tryActivate);
  window.addEventListener('load', tryActivate);

  // Public API: callers can await this to get a fresh App Check token. Returns
  // null when App Check isn't activated so callers can fall through gracefully.
  window.getAppCheckToken = async function () {
    if (!activated) return null;
    try {
      var result = await firebase.appCheck().getToken(/* forceRefresh */ false);
      return (result && result.token) || null;
    } catch (e) {
      return null;
    }
  };

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
      var token = await window.getAppCheckToken();
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
    return origFetch(input, init);
  };
})();
