// Firebase App Check init + auto-attach helper.
//
// Provider: reCAPTCHA Enterprise (score-based site key below), registered on
// the DebateOS web app in Firebase project debateos-78ac5 on 2026-07-27.
//
// Server enforcement: set APP_CHECK_REQUIRED=true in the Netlify prod env for
// the AI functions to hard-enforce. Do that ONLY once real sessions are minting
// valid tokens (verify X-Firebase-AppCheck flows on /api/* calls), or anonymous
// calls will 401. Until enforced, the server soft-passes missing/invalid tokens
// and only logs, so this activation is safe to ship ahead of the flip.

(function () {
  var APP_CHECK_SITE_KEY = '6LcCG2gtAAAAANR70uPFdOC0TeixdQqspYYciOac';

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
      // reCAPTCHA Enterprise: activate() takes a provider instance, not a bare
      // string (the bare-string form is the reCAPTCHA v3 shape). If the compat
      // SDK didn't load the class for any reason, this throws and is caught
      // below, leaving App Check inactive (graceful soft-pass), not broken.
      var provider = new firebase.appCheck.ReCaptchaEnterpriseProvider(APP_CHECK_SITE_KEY);
      firebase.appCheck().activate(provider, /* isTokenAutoRefreshEnabled */ true);
      activated = true;
      console.info('[appcheck] activated (reCAPTCHA Enterprise)');
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
