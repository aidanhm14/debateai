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

  var currentPath = (location.pathname || '/').replace(/\/$/, '') || '/';
  var immersive = /^\/(newvoice|voice-debate|live-round|room-judge)(?:\.html)?$/.test(currentPath);
  if (immersive) document.documentElement.classList.add('dbnative-immersive');
  if (/^\/native(?:\.html)?$/.test(currentPath)) document.documentElement.classList.add('dbnative-home');

  try {
    if (!immersive && !/^\/(native|pricing)(?:\.html)?$/.test(currentPath)) {
      localStorage.setItem('dit-native-last-path', currentPath + location.search + location.hash);
    }
  } catch (e) {}

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

  // Load the shared sign-in modal. Apple Guideline 4.8 requires Sign in with
  // Apple anywhere we offer another social login, and most pages ship their
  // own Google-only button. auth-modal.js is the one surface that offers
  // both, so the app pulls it in everywhere and routes sign-in through it
  // (see the interceptor below). It self-guards against double-loading and
  // costs nothing until opened.
  (function loadAuthModal() {
    if (window.__ditAuthModal || document.getElementById('db-native-auth-modal')) return;
    var s = document.createElement('script');
    s.id = 'db-native-auth-modal';
    s.src = '/js/auth-modal.js';
    (document.head || document.documentElement).appendChild(s);
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

  function icon(paths) {
    return '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + paths + '</svg>';
  }

  function mountNativeTabs() {
    if (immersive || document.querySelector('.db-native-tabs')) return;
    var items = [
      { href: '/native', label: 'Home', match: /^\/native(?:\.html)?$/, icon: '<path d="m3 11 9-9 9 9"/><path d="M5 10v10h14V10"/><path d="M9 20v-6h6v6"/>' },
      { href: '/newvoice', label: 'Debate', match: /^\/(newvoice|voice-debate|debate-it)(?:\.html)?$/, icon: '<path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><path d="M12 19v3"/>' },
      { href: '/coach', label: 'Coach', match: /^\/coach(?:\.html)?$/, icon: '<path d="m12 3-1.9 4.1L6 9l4.1 1.9L12 15l1.9-4.1L18 9l-4.1-1.9L12 3Z"/><path d="m5 16-.9 1.9L2 19l2.1 1.1L5 22l.9-1.9L8 19l-2.1-1.1L5 16Z"/><path d="m19 14-1.2 2.8L15 18l2.8 1.2L19 22l1.2-2.8L23 18l-2.8-1.2L19 14Z"/>' },
      { href: '/spar', label: 'Live', match: /^\/(spar|live|spectate)(?:\.html)?$/, icon: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>' },
      { href: '/profile', label: 'Me', match: /^\/profile(?:\.html)?$/, icon: '<circle cx="12" cy="8" r="4"/><path d="M4 22a8 8 0 0 1 16 0"/>' }
    ];
    var nav = document.createElement('nav');
    nav.className = 'db-native-tabs';
    nav.setAttribute('aria-label', 'App navigation');
    items.forEach(function (item) {
      var a = document.createElement('a');
      var active = item.match.test(currentPath);
      a.href = item.href;
      a.className = 'db-native-tab' + (active ? ' is-active' : '');
      if (active) a.setAttribute('aria-current', 'page');
      a.innerHTML = icon(item.icon) + '<span>' + item.label + '</span>';
      nav.appendChild(a);
    });
    document.body.appendChild(nav);
  }

  function mountOfflineNotice() {
    if (document.getElementById('dbNativeOffline')) return;
    var notice = document.createElement('div');
    notice.id = 'dbNativeOffline';
    notice.className = 'db-native-offline';
    notice.setAttribute('role', 'status');
    notice.textContent = 'You are offline. Reconnect to start a round.';
    document.body.appendChild(notice);
    function update(connected) { notice.classList.toggle('is-visible', !connected); }
    update(navigator.onLine !== false);
    window.addEventListener('online', function () { update(true); });
    window.addEventListener('offline', function () { update(false); });
    try {
      var network = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.Network;
      if (network && network.getStatus) network.getStatus().then(function (s) { update(s.connected); });
      if (network && network.addListener) network.addListener('networkStatusChange', function (s) { update(s.connected); });
    } catch (e) {}
  }

  window.DBShareLandingPayload = function (text) {
    var variant = Math.random() < 0.5 ? 'bet' : 'opinion';
    var title = variant === 'opinion'
      ? 'Debatable - Everyone has an opinion'
      : 'Debatable - Bet on your words';
    try {
      if (window.gtag) gtag('event', 'share_title_created', {
        test: 'share_title_v1',
        variant: variant,
      });
    } catch (e) {}
    return {
      title: title,
      text: text || 'Practice a real debate out loud.',
      url: 'https://itsdebatable.com/?share_title=' + variant,
    };
  };

  window.DBShareApp = function () {
    var payload = window.DBShareLandingPayload();
    try {
      var share = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.Share;
      if (share && share.share) return share.share(payload);
    } catch (e) {}
    if (navigator.share) return navigator.share(payload);
    return Promise.resolve();
  };

  window.DBEnableAlerts = function () {
    try {
      var messaging = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.FirebaseMessaging;
      if (messaging && messaging.requestPermissions) {
        return messaging.requestPermissions().then(function (result) {
          document.dispatchEvent(new CustomEvent('db-native-alerts', { detail: result }));
          return result;
        });
      }
      var push = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.PushNotifications;
      if (push && push.requestPermissions) return push.requestPermissions();
    } catch (e) {}
    return Promise.reject(new Error('Notifications are unavailable.'));
  };

  function wireNativeDeepLinks() {
    try {
      var app = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.App;
      if (!app || !app.addListener) return;
      app.addListener('appUrlOpen', function (data) {
        try {
          var url = new URL(data.url);
          if (url.hostname === 'itsdebatable.com' || url.hostname.endsWith('.itsdebatable.com')) {
            location.href = url.pathname + url.search + url.hash;
          }
        } catch (e) {}
      });
    } catch (e) {}
  }

  function mountNativeChrome() {
    mountNativeTabs();
    mountOfflineNotice();
    wireNativeDeepLinks();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mountNativeChrome);
  else mountNativeChrome();

  // If the app deep-navigates to the pricing route, bounce it — a hard
  // guarantee the reviewer never sees a purchase surface even if a stray
  // link slips the CSS net.
  //
  // Same treatment for the marketing front door. On the web "/" is the
  // landing page; in the app the home is /native, so a stray "/" would
  // drop the user out of the app and onto a sign-up pitch they already
  // took.
  try {
    if (/^\/pricing(?:\.html)?$/.test(location.pathname)) {
      location.replace('/native');
    } else if (/^\/(?:landing(?:\.html)?)?$/.test(location.pathname)) {
      location.replace('/native');
    }
  } catch (e) {}

  // ── Home-link rewriter ─────────────────────────────────────────────
  // Nearly every page points its wordmark and back arrow at "/", which is
  // the marketing landing. In the app that is a dead end: the immersive
  // rounds (newvoice, voice-debate, live-round, room-judge) hide the tab
  // bar, so the back arrow is the ONLY way out and it was leaving the app
  // shell entirely. Repoint them at the app home.
  function isHomeHref(a) {
    try {
      var raw = a.getAttribute('href') || '';
      // A bare in-page jump ("#faq") resolves to the site root, which would
      // otherwise look like a home link and eject the user mid-page.
      if (!raw || raw.charAt(0) === '#') return false;
      var u = new URL(raw, location.href);
      if (u.origin !== location.origin) return false;
      if (!/^\/(?:landing(?:\.html)?)?$/.test(u.pathname)) return false;
      // Same page, just a hash: still a jump, not a trip home.
      if (u.hash && u.pathname === location.pathname) return false;
      return true;
    } catch (e) { return false; }
  }
  function rewriteHomeLinks(root) {
    var as;
    try { as = (root || document).querySelectorAll('a[href]'); } catch (e) { return; }
    for (var i = 0; i < as.length; i++) {
      var a = as[i];
      if (a.__dbHomed) continue;
      if (isHomeHref(a)) { a.setAttribute('href', '/native'); a.__dbHomed = true; }
    }
  }
  // Click net, for anchors built after the last sweep or navigations done
  // in JS off a click handler.
  document.addEventListener('click', function (ev) {
    try {
      var a = ev.target && ev.target.closest ? ev.target.closest('a[href]') : null;
      if (!a || !isHomeHref(a)) return;
      ev.preventDefault();
      location.href = '/native';
    } catch (e) {}
  }, true);

  // ── Sign-in router (Apple 4.8) ─────────────────────────────────────
  // Nine in-app surfaces ship their own "Sign in with Google" button and
  // never load the chooser, which would leave the app offering a social
  // login with no Sign in with Apple beside it. In the app those buttons
  // open the shared chooser instead, which offers both. Capture phase and
  // stopped propagation so the page's own popup handler never runs.
  function isGoogleSignIn(el) {
    if (!el || (el.closest && el.closest('#ditAuth'))) return false; // the chooser's own button
    var t = (el.textContent || '').trim().toLowerCase().replace(/\s+/g, ' ');
    if (!t || t.length > 48) return false;
    if (t.indexOf('google') === -1) return false;
    return /sign\s?in|sign\s?up|continue|log\s?in/.test(t);
  }
  document.addEventListener('click', function (ev) {
    try {
      if (typeof window.openAuthModal !== 'function') return;
      var el2 = ev.target && ev.target.closest
        ? ev.target.closest('button, a, [role="button"]') : null;
      if (!isGoogleSignIn(el2)) return;
      ev.preventDefault();
      ev.stopPropagation();
      if (ev.stopImmediatePropagation) ev.stopImmediatePropagation();
      window.openAuthModal();
    } catch (e) {}
  }, true);

  // ── Purchase-CTA sweeper (Apple 3.1.1) ─────────────────────────────
  // The app pages build upgrade buttons in JS with no shared class
  // ("Upgrade to Unlock", "Upgrade to Pro", ...), so the CSS net can't
  // catch them. Hide by EXACT label match — a closed list, so a normal
  // button whose copy merely mentions a plan can't be swallowed. Runs on
  // a MutationObserver so React re-renders stay covered.
  var CTA_LABELS = [
    'upgrade to unlock',
    'upgrade to pro',
    'upgrade to customize',
    'keep going with a plan',
    'see pricing',
    'view plans',
    'pro, upgrade to unlock',
    'upgrade',
    'go pro',
    'upgrade plan',
    'manage billing',
    'manage subscription on stripe →',
    'see plans',
    'see plans →',
    'view plans & subscribe',
    'subscribe to continue.'
  ];
  function sweepPurchaseCtas(root) {
    var els;
    try { els = (root || document).querySelectorAll('button, a, [role="button"]'); } catch (e) { return; }
    for (var i = 0; i < els.length; i++) {
      var el2 = els[i];
      if (el2.__dbSwept) continue;
      var t = (el2.textContent || '').trim().toLowerCase();
      if (t && CTA_LABELS.indexOf(t) !== -1) {
        el2.style.setProperty('display', 'none', 'important');
        el2.__dbSwept = true;
      }
    }
  }
  function armSweeper() {
    sweepPurchaseCtas(document);
    rewriteHomeLinks(document);
    try {
      var pending = false;
      new MutationObserver(function () {
        if (pending) return;
        pending = true;
        setTimeout(function () {
          pending = false;
          sweepPurchaseCtas(document);
          rewriteHomeLinks(document);
        }, 120);
      }).observe(document.body, { childList: true, subtree: true });
    } catch (e) {}
  }
  if (document.body) armSweeper();
  else document.addEventListener('DOMContentLoaded', armSweeper);
})();
