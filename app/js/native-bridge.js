/* ──────────────────────────────────────────────────────────────────
   native-bridge.js — makes the web app behave when it runs INSIDE the
   Capacitor iOS/Android shell (the App Store build).

   On the plain web this file is inert: window.Capacitor is undefined, so
   nothing below runs. Inside the native app it:

     1. flags native mode — window.__DB_NATIVE = true and <html class="dbnative">
        so any script or stylesheet can branch on it.
     2. hides IN-APP PURCHASE surfaces. Apple Guideline 3.1.1 forbids
        linking out to web / Stripe payment for digital subscriptions, and
        3.1.3 forbids even *steering* users to buy elsewhere. Since the
        product is free in beta, the clean, fully-compliant move is to hide
        every pricing / upgrade / checkout surface in the native build.
        (When real Apple IAP lands, swap the hide for an IAP purchase flow.)

   Load it FIRST (before other app scripts) on any page the app can reach.
   ────────────────────────────────────────────────────────────────── */
(function () {
  'use strict';

  // Capacitor injects window.Capacitor into the WKWebView. isNativePlatform()
  // is the canonical check; fall back to a couple of tells for older shells.
  function detectNative() {
    try {
      var C = window.Capacitor;
      if (C && typeof C.isNativePlatform === 'function') return C.isNativePlatform();
      if (C && C.platform && C.platform !== 'web') return true;
      // Last-ditch: a custom UA marker the shell can set, or the app scheme.
      if (/ DebateItApp\//.test(navigator.userAgent || '')) return true;
    } catch (e) {}
    return false;
  }

  var isNative = detectNative();
  window.__DB_NATIVE = isNative;
  window.DBNative = {
    isNative: isNative,
    platform: (window.Capacitor && window.Capacitor.getPlatform) ? window.Capacitor.getPlatform() : (isNative ? 'native' : 'web')
  };

  if (!isNative) return; // web: do nothing.

  document.documentElement.classList.add('dbnative');

  // Load the APP DESIGN LAYER (app/css/native-app.css). This stylesheet is
  // the one place app-specific design lives; it loads ONLY in the app, so
  // it never affects the website. Injected as early as possible so app
  // styling is present before first paint.
  (function loadAppCss() {
    if (document.getElementById('db-native-app-css')) return;
    var l = document.createElement('link');
    l.id = 'db-native-app-css';
    l.rel = 'stylesheet';
    l.href = '/css/native-app.css';
    (document.head || document.documentElement).appendChild(l);
  })();

  // Hide payment / upgrade / checkout surfaces. Two layers:
  //   - explicit opt-in: anything tagged [data-native-hide]
  //   - defensive selectors: links to pricing / checkout / stripe / upgrade,
  //     and the floating upgrade pill (also guarded in upgrade-cta.js).
  function injectHideCss() {
    var css =
      'html.dbnative [data-native-hide],' +
      'html.dbnative .upgrade-cta,' +
      'html.dbnative .ui-beta-strip,' +
      'html.dbnative .beta-strip,' +
      'html.dbnative a[href*="/pricing"],' +
      'html.dbnative a[href*="checkout"],' +
      'html.dbnative a[href*="stripe"],' +
      'html.dbnative a[href*="/upgrade"]{display:none !important}' +
      // Give tagged "web only" blocks a way to show a native-friendly note.
      'html.dbnative [data-native-only]{display:revert}' +
      'html:not(.dbnative) [data-native-only]{display:none}';
    var s = document.createElement('style');
    s.id = 'db-native-css';
    s.textContent = css;
    (document.head || document.documentElement).appendChild(s);
  }
  if (document.head) injectHideCss();
  else document.addEventListener('DOMContentLoaded', injectHideCss);

  // If the app deep-navigates to the pricing route, bounce it — a hard
  // guarantee the reviewer never sees a purchase surface even if a stray
  // link slips the CSS net.
  try {
    if (/^\/pricing(?:\.html)?$/.test(location.pathname)) {
      location.replace('/coach');
    }
  } catch (e) {}
})();
