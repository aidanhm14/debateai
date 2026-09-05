// ──────────────────────────────────────────────────────────────────
// auth-modal.js — shared sign-in helper for Debatable.
//
// Google, Apple, email/password and emailed links share one Firebase
// session. Email/password stays signed in on this device by default;
// visitors can untick "Keep me signed in" for a session-only login.
//
// Open it from anywhere with window.openAuthModal(). Self-bootstraps
// Firebase (shared script ids with notifications.js so nothing double-loads).
//
// Provider-specific admin and live-video gates keep their restrictions.
// Returning email accounts get the password form, with account creation
// and password recovery available in the same chooser.
// ──────────────────────────────────────────────────────────────────
(function () {
  'use strict';
  if (window.__ditAuthModal) return;
  window.__ditAuthModal = true;

  var APP_SDK = 'https://www.gstatic.com/firebasejs/10.13.2/firebase-app-compat.js';
  var AUTH_SDK = 'https://www.gstatic.com/firebasejs/10.13.2/firebase-auth-compat.js';
  var CONFIG = {
    apiKey: ["AIzaSyDDx", "TYlyWLOJnFP99", "e7XsLPb3FwIEijNNM"].join(""),
    authDomain: "debateos-78ac5.firebaseapp.com",
    projectId: "debateos-78ac5",
    storageBucket: "debateos-78ac5.firebasestorage.app",
    messagingSenderId: "860359449192",
    appId: "1:860359449192:web:f5dc0060dbd50d6c4fb9dd",
  };
  var destinationOverride = '';
  function safeDestination(value) {
    if (!value) return '';
    try {
      var parsed = new URL(String(value), window.location.origin);
      if (parsed.origin !== window.location.origin) return '';
      return parsed.pathname + parsed.search + parsed.hash;
    } catch (e) { return ''; }
  }
  function destination() {
    return destinationOverride || window.location.pathname + window.location.search + window.location.hash;
  }

  function loadOnce(id, src, cb) {
    var ex = document.getElementById(id);
    if (ex) {
      if (ex.dataset.loaded || ex.dataset.failed) cb();
      else {
        ex.addEventListener('load', cb, { once: true });
        ex.addEventListener('error', cb, { once: true });
      }
      return;
    }
    var s = document.createElement('script'); s.id = id; s.src = src;
    s.addEventListener('load', function () { s.dataset.loaded = '1'; cb(); }, { once: true });
    s.addEventListener('error', function () { s.dataset.failed = '1'; cb(); }, { once: true });
    document.head.appendChild(s);
  }
  function ensureApp() { try { if (window.firebase && firebase.auth && (!firebase.apps || !firebase.apps.length)) firebase.initializeApp(CONFIG); } catch (e) {} }
  function ready() { return !!(window.firebase && window.firebase.auth && window.firebase.apps && window.firebase.apps.length); }
  function bootstrap(cb) {
    if (ready()) { cb(); return; }
    loadOnce('da-fb-app', APP_SDK, function () { loadOnce('da-fb-auth', AUTH_SDK, function () { ensureApp(); cb(); }); });
  }
  function track(ev, meta) { try { if (window.gtag) gtag('event', ev, meta || {}); } catch (e) {} }

  // ── Styles ─────────────────────────────────────────────────────────
  function ensureBrandFont() {
    try {
      if (document.querySelector('link[href*="family=Crimson"]')) return;
      var link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = 'https://fonts.googleapis.com/css2?family=Archivo:wdth,wght@62..125,100..900&family=Inter:wght@400..900&family=Source+Serif+4:opsz,wght@8..60,400;8..60,600&display=swap';
      link.setAttribute('data-da-font', '1');
      document.head.appendChild(link);
    } catch (e) {}
  }
  function injectStyles() {
    ensureBrandFont();
    if (document.getElementById('ditAuthCss')) return;
    var dark = /dark|stone|grey|crimson/.test(document.documentElement.getAttribute('data-theme') || '') ||
               document.body.classList.contains('dark-theme') || document.body.classList.contains('crimson-theme');
    var card = dark ? '#1c160f' : '#ffffff';
    var ink = dark ? '#f5f1ea' : '#16130f';
    var sub = dark ? 'rgba(245,241,234,.62)' : 'rgba(20,16,12,.6)';
    var line = dark ? 'rgba(255,255,255,.12)' : 'rgba(0,0,0,.12)';
    var field = dark ? 'rgba(255,255,255,.05)' : 'rgba(0,0,0,.025)';
    var veil = dark ? 'rgba(5,4,3,.72)' : 'rgba(17,14,10,.48)';
    var hover = dark ? 'rgba(255,255,255,.24)' : 'rgba(0,0,0,.22)';
    var focus = dark ? 'rgba(248,113,113,.42)' : 'rgba(239,68,68,.34)';
    var s = document.createElement('style');
    s.id = 'ditAuthCss';
    s.textContent =
      '#ditAuth{position:fixed;inset:0;z-index:2147483600;display:none;align-items:center;justify-content:center;padding:16px;background:' + veil + ';backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);font-family:"Archivo","Fraunces",Georgia,"Times New Roman",serif;font-size:16px;line-height:1.4;-webkit-font-smoothing:antialiased}' +
      '#ditAuth *{box-sizing:border-box}' +
      /* Locked mode only: the page behind a wall should not scroll away
         under it. Set on <html> rather than as a filter on body, which
         would make body a containing block for fixed children. */
      'html.da-auth-locked,html.da-auth-locked body{overflow:hidden!important}' +
      '#ditAuth.on{display:flex}' +
      '#ditAuth .da-card{background:' + card + ';color:' + ink + ';width:min(480px,100%);max-height:calc(100vh - 32px);max-height:calc(100dvh - 32px);overflow:auto;border:1px solid ' + line + ';border-radius:22px;padding:26px;box-shadow:0 24px 80px rgba(0,0,0,.38);position:relative}' +
      '#ditAuth .da-card:has(.da-email-options){width:min(780px,100%)}' +
      '#ditAuth .da-auth-methods,#ditAuth .da-provider-options,#ditAuth .da-email-options{min-width:0}' +
      '#ditAuth .da-provider-buttons{display:grid;gap:10px}' +
      '#ditAuth .da-provider-buttons .da-btn{margin:0}' +
      '#ditAuth .da-card::before{content:"";position:absolute;top:0;left:0;right:0;height:4px;background:#ef4444}' +
      '#ditAuth .da-x{position:absolute;top:12px;right:12px;display:flex;align-items:center;justify-content:center;width:32px;height:32px;border:0;background:transparent;color:' + sub + ';font-size:22px;line-height:1;cursor:pointer;border-radius:10px;transition:background .16s ease,color .16s ease}' +
      '#ditAuth .da-x:hover{background:' + field + ';color:' + ink + '}' +
      '#ditAuth h2{font-size:26px;line-height:1.08;font-weight:800;margin:0 34px 8px 0;letter-spacing:0}' +
      '#ditAuth .da-sub{font-size:15px;color:' + sub + ';margin:0 0 18px;line-height:1.5}' +
      '#ditAuth .da-sub strong{font-weight:800;color:' + ink + '}' +
      '#ditAuth .da-live-person{display:inline-flex;align-items:center;gap:7px;margin:0 28px 14px 0;padding:7px 10px;border-radius:999px;background:rgba(22,163,74,.1);color:' + (dark ? '#bbf7d0' : '#166534') + ';font-family:"Archivo","Inter",system-ui,sans-serif;font-size:11px;font-weight:800;line-height:1.3;letter-spacing:.06em;text-transform:uppercase}' +
      '#ditAuth .da-live-person-dot{width:7px;height:7px;flex:none;border-radius:50%;background:#16a34a}' +
      '#ditAuth .da-btn{display:flex;align-items:center;justify-content:center;gap:10px;width:100%;min-height:48px;padding:12px 14px;border-radius:13px;font-weight:700;font-size:15px;cursor:pointer;border:1px solid ' + line + ';background:' + field + ';color:' + ink + ';font-family:inherit;text-decoration:none;margin-top:10px;transition:transform .16s ease,box-shadow .16s ease,border-color .16s ease,background .16s ease}' +
      '#ditAuth .da-btn:hover{border-color:' + hover + ';box-shadow:0 8px 22px rgba(0,0,0,.08);transform:translateY(-1px)}' +
      '#ditAuth .da-btn:disabled{opacity:.62;cursor:not-allowed;transform:none;box-shadow:none}' +
      '#ditAuth .da-btn--google{background:#fff;color:#16130f;border-color:rgba(0,0,0,.14)}' +
      '#ditAuth .da-btn--apple{background:#050505;color:#fff;border-color:#050505}' +
      '#ditAuth .da-btn--apple:hover{background:#1b1b1b;border-color:#1b1b1b}' +
      '#ditAuth .da-btn--discord{background:#5865F2;color:#fff;border-color:#5865F2}' +
      '#ditAuth .da-btn--discord:hover{background:#4752c4;border-color:#4752c4}' +
      '#ditAuth .da-btn--primary{background:#b91c1c;color:#fff;border-color:#ef4444}' +
      '#ditAuth .da-btn--primary:hover{background:#dc2626;border-color:#dc2626}' +
      '#ditAuth .da-btn--hero{min-height:54px;padding:14px 16px;font-size:17px;font-weight:800;box-shadow:0 10px 28px rgba(0,0,0,.08)}' +
      /* Warning, not decoration: amber is the state colour per the
         2026-05-19 brand rule, red is reserved for actions. */
      '#ditAuth .da-inapp{font-size:13.5px;line-height:1.5;margin:0 0 14px;padding:10px 12px;border-radius:10px;border:1px solid rgba(245,158,11,.38);background:rgba(245,158,11,.10);color:' + sub + '}' +
      '#ditAuth .da-copy{display:inline-block;margin-top:6px;padding:5px 10px;border-radius:8px;border:1px solid rgba(245,158,11,.55);background:transparent;color:inherit;font:inherit;font-size:13px;cursor:pointer}' +
      '#ditAuth .da-copy:hover{background:rgba(245,158,11,.18)}' +
      '#ditAuth .da-terms{display:flex;align-items:flex-start;gap:10px;margin:0 0 14px;padding:12px;border:1px solid ' + line + ';border-radius:12px;background:' + field + ';color:' + sub + ';font-size:12.5px;line-height:1.45}' +
      '#ditAuth .da-terms input{width:18px;height:18px;margin:1px 0 0;flex:none;accent-color:#dc2626}' +
      '#ditAuth .da-terms a{color:#dc2626;font-weight:750;text-decoration:underline;text-underline-offset:2px}' +
      '#ditAuth .da-or{display:flex;align-items:center;gap:10px;margin:14px 0 6px;color:' + sub + ';font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase}' +
      '#ditAuth .da-or::before,#ditAuth .da-or::after{content:"";flex:1;height:1px;background:' + line + '}' +
      '#ditAuth .da-form{margin-top:8px}' +
      '#ditAuth .da-label{display:block;margin-top:11px;color:' + ink + ';font-size:13px;font-weight:750}' +
      '#ditAuth .da-input{width:100%;min-height:48px;padding:12px 14px;border-radius:13px;border:1px solid ' + line + ';background:' + field + ';color:' + ink + ';font:inherit;font-size:16px;margin-top:6px}' +
      '#ditAuth .da-input::placeholder{color:' + sub + '}' +
      '#ditAuth .da-input:focus{outline:none;border-color:#ef4444;box-shadow:0 0 0 4px ' + focus + '}' +
      '#ditAuth .da-form-meta{display:flex;align-items:center;justify-content:space-between;gap:12px;margin:8px 2px 0;color:' + sub + ';font-size:12px;line-height:1.4}' +
      '#ditAuth .da-remember{display:flex;align-items:center;gap:9px;margin:14px 0 4px;color:' + ink + ';font-size:13px;cursor:pointer}' +
      '#ditAuth .da-remember input{width:18px;height:18px;margin:0;accent-color:#dc2626}' +
      '#ditAuth .da-link{padding:0;border:0;background:transparent;color:#dc2626;font:inherit;font-weight:750;cursor:pointer;text-decoration:underline;text-underline-offset:3px}' +
      '#ditAuth .da-switch{margin:16px 0 0;text-align:center;color:' + sub + ';font-size:13px}' +
      '#ditAuth .da-switch--row{margin-top:11px;display:flex;flex-wrap:wrap;align-items:center;justify-content:center;gap:6px 18px}' +
      '#ditAuth .da-status{font-size:13px;font-weight:700;color:#15803d;margin:10px 4px 0;text-align:center;line-height:1.35}' +
      '#ditAuth .da-status:empty{display:none}' +
      '#ditAuth .da-note{font-size:13px;color:' + sub + ';margin:14px 4px 0;line-height:1.45;text-align:center}' +
      '#ditAuth .da-err{font-size:13px;font-weight:700;color:#ef4444;margin:10px 4px 0;text-align:center;line-height:1.35}' +
      '#ditAuth .da-err:empty{display:none}' +
      '#ditAuth svg{width:20px;height:20px;flex:none}' +
      '#ditAuth .da-steps{margin:0 0 16px;padding:0 0 0 20px;color:' + ink + ';font-size:14.5px;line-height:1.5}' +
      '#ditAuth .da-steps li{margin:0 0 8px}' +
      '#ditAuth .da-sent-to{font-weight:800;word-break:break-word}' +
      /* Amber, same as the in-app warning: this is a state the person
         has to act on, and red is the action colour on this card. */
      '#ditAuth .da-spam{font-size:13.5px;line-height:1.5;margin:0 0 4px;padding:11px 13px;border-radius:12px;border:1px solid rgba(245,158,11,.42);background:rgba(245,158,11,.10);color:' + ink + '}' +
      '#ditAuth .da-spam strong{display:block;margin-bottom:3px}' +
      '@media (min-width:700px){#ditAuth .da-auth-methods:has(.da-email-options){display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:28px}#ditAuth .da-email-options{border-left:1px solid ' + line + ';padding-left:28px}#ditAuth .da-email-options .da-or{margin:0 0 12px}#ditAuth .da-email-options .da-form{margin:0}#ditAuth .da-email-options .da-label:first-child{margin-top:0}}' +
      '@media (max-width:699px){#ditAuth{padding:12px}#ditAuth .da-card{padding:20px;max-height:calc(100dvh - 24px);border-radius:18px}#ditAuth h2{font-size:24px}#ditAuth .da-live-person{margin-bottom:10px;padding:5px 8px}#ditAuth .da-sub{font-size:14px;line-height:1.4;margin-bottom:12px}#ditAuth .da-terms{font-size:12px;line-height:1.4;padding:8px;margin-bottom:10px}#ditAuth .da-provider-buttons{grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:8px}#ditAuth .da-btn--hero{min-height:48px;padding:9px 8px;font-size:14px;gap:6px}#ditAuth .da-or{margin:12px 0 6px}#ditAuth .da-form{margin-top:0}#ditAuth .da-label{margin-top:8px;font-size:12px}#ditAuth .da-input{min-height:44px;padding:10px 12px;margin-top:4px}#ditAuth .da-form-meta{margin-top:6px}#ditAuth .da-remember{margin-top:10px}#ditAuth .da-btn--primary{min-height:44px;padding:10px 12px;margin-top:8px}#ditAuth .da-switch{font-size:12px}}' +
      '@media (max-height:700px){#ditAuth .da-card{padding:16px}#ditAuth h2{margin-bottom:6px}#ditAuth .da-live-person{padding:5px 8px;margin-bottom:8px}#ditAuth .da-sub{margin-bottom:10px}#ditAuth .da-terms{padding:8px;margin-bottom:8px}#ditAuth .da-or{margin:8px 0 4px}#ditAuth .da-label{margin-top:6px}#ditAuth .da-input{min-height:44px;padding:10px 12px}#ditAuth .da-form-meta{margin-top:6px}#ditAuth .da-remember{margin-top:8px}#ditAuth .da-switch--row{margin-top:8px}}';
    document.head.appendChild(s);
  }

  var modal = null, auth = null, lastFocus = null;
  // Set by openAuthModal(mode, {onDone}); consumed once by handOff().
  var onDone = null;
  // LOCKED mode (2026-08-26). openAuthModal(mode, {locked:true}) opens the
  // same chooser as a wall rather than a dialog: no ×, Escape does nothing,
  // a backdrop click does nothing. js/signin-wall.js is the only caller.
  // Locking the SHARED chooser rather than building a second card is
  // deliberate — every provider, the anonymous-account linking, the
  // in-app-browser warning and the emailed-link round trip are the ones
  // already proven here, and a second sign-in surface is the duplication
  // the founder has cut twice.
  var locked = false;
  var lockCopy = null;
  // Some product doors are provider-specific. The /admin gates are Google-
  // only. Live video (/spar, the video room) takes Google on the web and
  // Google or Apple in the iOS app, and nothing else (2026-09-03: phone
  // sign-in retired, see soul.md), so its prompts open this card in
  // liveVideo mode: no email door advertised that the queue would reject.
  // Inside an in-app browser there is no key that turns for live video;
  // the note says to open the site in Safari or Chrome and offers the link.
  var googleOnly = false;
  var liveVideo = false;
  function el(html) { var d = document.createElement('div'); d.innerHTML = html; return d.firstElementChild; }
  function esc(v) {
    return String(v == null ? '' : v)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function close() {
    // A locked chooser has no dismissal. Every dismissal path (×, Escape,
    // backdrop) funnels through here, so refusing here is what makes the
    // lock hold rather than three separate guards that can drift apart.
    if (locked) return;
    forceClose();
  }
  function forceClose() {
    // Dismissing the modal abandons whatever action opened it, and the
    // caller has to be TOLD that. handOff() clears the callback before
    // calling close(), so anything still set here is a real dismissal and
    // gets onDone(null). The contract is therefore: onDone fires exactly
    // once, with a user or with null, never not at all. A caller that
    // wraps this in a promise would otherwise await forever on a close.
    if (typeof onDone === 'function') {
      var abandoned = onDone;
      onDone = null;
      try { abandoned(null, null); } catch (e) {}
    }
    locked = false;
    lockCopy = null;
    googleOnly = false;
    liveVideo = false;
    destinationOverride = '';
    try { document.documentElement.classList.remove('da-auth-locked'); } catch (e) {}
    if (modal) modal.classList.remove('on');
    document.body.classList.remove('signin-modal-open');
    if (lastFocus && lastFocus.focus) {
      try { lastFocus.focus(); } catch (e) {}
    }
  }

  // In-app browsers (the webview you get tapping a link inside Instagram,
  // Facebook, TikTok, Snapchat, LinkedIn, Threads, X) cannot complete a
  // Google or Apple sign-in. This is not our bug and not fixable from here:
  // Google refuses OAuth in embedded webviews outright, returning
  // `disallowed_useragent`. The popup fails, the code falls back to
  // signInWithRedirect, and that fails too — our authDomain is on
  // firebaseapp.com, a different domain to the site, and third-party
  // storage partitioning broke cross-domain redirect sign-in.
  //
  // So a visitor arriving from a social link used to tap the biggest button
  // on the modal, get "Google sign-in failed. Try again.", and try again
  // forever. "Try again" is the wrong instruction when the thing cannot
  // succeed on this browser however many times it is tried. Because web
  // sign-in is Google-only, the honest instruction is to open the same URL
  // in Safari or Chrome.
  function providerFailMsg() {
    return isInAppBrowser()
      ? 'This app\'s browser blocks Google sign-in. Open the site in Safari or Chrome.'
      : 'Google sign-in failed. Try again.';
  }

  function isInAppBrowser() {
    try {
      // The Debatable iOS app IS a WKWebView, so the iOS heuristic below
      // matches it, and on 2026-09-01 the sheet told an App Review build
      // that "Google sign-in does not work inside this app's browser".
      // It does: the native build carries the Firebase Authentication
      // plugin and doGoogle() routes through it. The warning is for
      // Instagram, TikTok and friends, never for our own shell.
      if (window.__DB_NATIVE) return false;
      var ua = navigator.userAgent || '';
      // FBAN/FBAV = Facebook, Instagram ships "Instagram" in the UA,
      // Line/MicroMessenger/Snapchat/LinkedIn/Threads/TikTok all self-identify.
      if (/FBAN|FBAV|FB_IAB|Instagram|Threads|TikTok|musical_ly|Snapchat|LinkedInApp|Line\/|MicroMessenger|Twitter/i.test(ua)) return true;
      // iOS webviews that do not self-identify: Safari's UA without "Safari".
      if (/iPhone|iPad|iPod/i.test(ua) && !/Safari/i.test(ua) && !/CriOS|FxiOS/i.test(ua)) return true;
      return false;
    } catch (e) { return false; }
  }

  // Shared so every module tests "can this browser complete an OAuth
  // sign-in" against ONE definition. signup-nudge.js prompted Google One
  // Tap with no check at all: on 2026-08-24 that fired 314 times across
  // 340 paid TikTok sessions, every one of them inside TikTok's webview,
  // where Google refuses OAuth outright. A second copy of this regex is
  // how the two drift apart, so there is only this one.
  window.__ditIsInAppBrowser = isInAppBrowser;

  // navigator.clipboard needs a secure context AND is missing in some
  // webviews; the execCommand path is the one that still works there.
  function legacyCopy(text, done){
    try {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0';
      document.body.appendChild(ta);
      ta.select();
      ta.setSelectionRange(0, text.length);
      document.execCommand('copy');
      document.body.removeChild(ta);
      if (done) done();
    } catch (e) {}
  }

  var GOOGLE_SVG = '<svg viewBox="0 0 48 48" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3 0 5.8 1.1 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.2-.1-2.3-.4-3.5z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 16 19 13 24 13c3 0 5.8 1.1 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.3 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.3-2.2 4.3-4.1 5.7l6.2 5.2C41.9 35 44 29.8 44 24c0-1.2-.1-2.3-.4-3.5z"/></svg>';

  var DISCORD_SIGNIN_READY = false;
  var DISCORD_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor"><path d="M19.6 5.6A17 17 0 0 0 15.4 4.3l-.2.4a15.8 15.8 0 0 1 3.8 1.9 13.6 13.6 0 0 0-14 0 15.8 15.8 0 0 1 3.8-1.9l-.2-.4a17 17 0 0 0-4.2 1.3C1.9 9.6 1.2 13.5 1.5 17.3a17.2 17.2 0 0 0 5.2 2.6l1.1-1.8a11 11 0 0 1-1.8-.8l.4-.3a12.2 12.2 0 0 0 11.2 0l.4.3a11 11 0 0 1-1.8.8l1.1 1.8a17.2 17.2 0 0 0 5.2-2.6c.4-4.4-.7-8.3-2.9-11.7ZM8.7 15c-1 0-1.9-1-1.9-2.2s.8-2.2 1.9-2.2 1.9 1 1.9 2.2S9.8 15 8.7 15Zm6.6 0c-1 0-1.9-1-1.9-2.2s.8-2.2 1.9-2.2 1.9 1 1.9 2.2-.8 2.2-1.9 2.2Z"/></svg>';
  var APPLE_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor"><path d="M16.7 12.9c0-2.6 2.1-3.8 2.2-3.9-1.2-1.8-3.2-2-3.9-2-1.7-.2-3.2 1-4 1-.7 0-2.1-1-3.5-.9-1.8 0-3.5 1.1-4.4 2.7-1.9 3.3-.5 8.2 1.3 10.8.9 1.3 2 2.8 3.4 2.7 1.4-.1 1.9-.9 3.6-.9s2.2.9 3.7.9c1.5 0 2.5-1.3 3.4-2.7 1-1.5 1.5-3 1.5-3.1-.1 0-3.3-1.3-3.3-4.6ZM13.9 5.3c.8-1 1.4-2.4 1.2-3.8-1.2.1-2.6.8-3.5 1.8-.8.9-1.5 2.3-1.3 3.7 1.3.1 2.7-.7 3.6-1.7Z"/></svg>';

  function home() { return document.getElementById('ditAuthCard'); }
  function setErr(m) {
    var c = home();
    var e = c && c.querySelector('.da-err');
    var s = c && c.querySelector('.da-status');
    if (e) e.textContent = m || '';
    if (m && s) s.textContent = '';
  }
  function setStatus(m) {
    var c = home();
    var s = c && c.querySelector('.da-status');
    var e = c && c.querySelector('.da-err');
    if (s) s.textContent = m || '';
    if (m && e) e.textContent = '';
  }

  // APP STORE UGC TERMS (2026-08-26). Apple Guideline 1.2 requires an
  // affirmative terms agreement before registration OR login. Version the
  // receipt so a future material safety change can be presented again.
  var TERMS_VERSION = '2026-08-26';
  var TERMS_KEY = 'debatable-terms-accepted-' + TERMS_VERSION;
  function termsAccepted() {
    try { return localStorage.getItem(TERMS_KEY) === '1'; } catch (e) { return false; }
  }
  function rememberTerms(accepted) {
    try {
      if (accepted) localStorage.setItem(TERMS_KEY, '1');
      else localStorage.removeItem(TERMS_KEY);
    } catch (e) {}
  }
  // ONE definition of the agreement field, because it now has to appear
  // on more than one screen. Apple 1.2 wants affirmative acceptance
  // before auth, and scripts/test-ios-review-compliance.mjs pins both
  // this markup and the requireTerms() call inside every sign-in
  // handler, so neither may be dropped.
  function termsFieldHtml() {
    return '<label class="da-terms"><input id="daTerms" type="checkbox" ' +
      (termsAccepted() ? 'checked ' : '') +
      '/><span>I agree to the <a href="/terms">Terms of Use</a> and <a href="/privacy">Privacy Policy</a>. ' +
      'Debatable has zero tolerance for objectionable content or abusive users.</span></label>';
  }
  // Persist on CHANGE only. The old sync ran on every render and called
  // rememberTerms(false) before the reader had touched anything, so a
  // screen that happened to render without the field could revoke a
  // receipt the reader had already given.
  function wireTermsField(container) {
    var input = container && container.querySelector('#daTerms');
    if (!input) return;
    input.addEventListener('change', function () {
      rememberTerms(!!input.checked);
      if (input.checked) setErr('');
    });
  }

  function requireTerms() {
    var c = home();
    var input = c && c.querySelector('#daTerms');
    if ((input && input.checked) || (!input && termsAccepted())) {
      rememberTerms(true);
      return true;
    }
    // The message has to point at something the reader can actually
    // reach. Before 2026-09-02 it did not: the (since retired) phone
    // screen carried no agreement field, so a visitor who had never
    // accepted got "Agree to the Terms of Use before signing in" on a
    // screen with no checkbox on it and no way to agree. Measured on
    // production. Every screen that can ask this question now renders
    // the field, so `input` is present whenever the ask is made.
    setErr(input
      ? 'Tick the box to agree to the Terms of Use, then continue.'
      : 'Agree to the Terms of Use before signing in.');
    try {
      if (input) {
        if (input.scrollIntoView) input.scrollIntoView({ block: 'center' });
        input.focus();
      }
    } catch (e) {}
    return false;
  }

  function renderChooser(mode, forceEmailMode) {
    var c = home(); if (!c) return;
    var last = lastMethod();
    if (last === 'phone') last = '';
    if ((googleOnly || liveVideo) && last !== 'google' && !(liveVideo && last === 'apple')) last = '';
    // No explicit mode: someone who has signed in on this device before
    // lands on sign-in, not "Create your account".
    if (mode !== 'signin' && mode !== 'signup') mode = last ? 'signin' : 'signup';
    var creating = mode === 'signup';
    // Email/password is visible by default again (2026-09-05). Preserve
    // a returning link user's choice and explicit link-recovery requests.
    var emailMode = forceEmailMode === 'link' || forceEmailMode === 'password'
      ? forceEmailMode
      : last === 'emaillink' ? 'link' : 'password';
    var linkMode = emailMode === 'link';
    var keepSignedIn = true;
    try { keepSignedIn = localStorage.getItem('debateos-auth-remember') !== '0'; } catch (e) {}
    var lastHint = !creating && last
      ? '<p class="da-note" style="margin:0 0 14px;text-align:left">Last time you signed in with ' +
        (last === 'google' ? 'Google' : last === 'apple' ? 'Apple' :
         last === 'emaillink' ? 'an emailed link' : 'an email and password') + '.</p>'
      : '';
    // APPLE IS THE APP'S BUTTON ONLY (2026-08-26, Aidan: "dont allow
    // apple sign in, bc i cant email ppl for apple, only allow apple for
    // the APP"). This REVERSES the 2026-08-18 decision to offer it on
    // web, and the reason is not the plumbing: the Services ID, the
    // signing key and the Firebase provider config all still work, and
    // are left in place. Hide My Email is the reason. Apple hands most
    // accounts a @privaterelay.appleid.com address, and a relay address
    // is not reachable from our sender: every lifecycle email we run
    // (the digest, winback, the first-round note, spar night, the Open
    // announcement) goes out through Resend from a verified debateai.com
    // domain, and Apple only forwards relay mail from a sender
    // registered in the developer portal's Sign in with Apple
    // configuration. So a web Apple signup was an account we could
    // never email again, on the one surface where the whole point of an
    // account is that it lets us come back to someone.
    //
    // The App Store's login-choice rule is what keeps it in the app:
    // an iOS app offering Google must also offer Apple. That rule binds
    // the binary, not the website. Restoring it on web is one condition
    // (__DB_NATIVE) plus registering the sender with Apple so relay mail
    // is deliverable, in that order.
    // 2026-09-04, Aidan: Apple is BACK on web (a second door for the
    // people the Google-only card was turning away). The Hide My Email
    // caveat above still holds; the fix for it is registering the sender
    // domain in the developer portal's Sign in with Apple configuration,
    // which is his action and is noted in the decision log.
    var appleBtn = !googleOnly
      ? '<button type="button" class="da-btn da-btn--apple da-btn--hero" id="daApple">' + APPLE_SVG + 'Continue with Apple</button>'
      : '';
    // Discord (2026-09-04, Aidan: "can we get other platforms beyond
    // google"). Discord publishes OpenID discovery at
    // https://discord.com/.well-known/openid-configuration, so it rides
    // Identity Platform as a generic OIDC provider named oidc.discord.
    // The provider does not exist on the project yet: it needs a Discord
    // application (his account) whose client id and secret go into
    // identitytoolkit.googleapis.com/admin/v2/.../oauthIdpConfigs. Flip
    // DISCORD_SIGNIN_READY once that config exists; before then the
    // button would open a popup that errors.
    var discordBtn = DISCORD_SIGNIN_READY && !googleOnly
      ? '<button type="button" class="da-btn da-btn--discord da-btn--hero" id="daDiscord">' + DISCORD_SVG + 'Continue with Discord</button>'
      : '';
    var nativeButtons = '';
    // See isInAppBrowser(). Google and Apple are still rendered rather than
    // hidden, because the detector is a user-agent guess and hiding the
    // button a user was looking for is worse than showing one that warns.
    var inApp = isInAppBrowser();
    var noEmail = googleOnly || liveVideo;
    var inAppNote = inApp
      ? '<p class="da-inapp">Google sign-in does not work inside this app\'s browser. ' +
        (noEmail ? 'Open the site in Safari or Chrome to sign in with Google. ' : 'Use email below, or open the site in Safari or Chrome. ') +
        '<button type="button" class="da-copy" id="daCopyLink">Copy link</button></p>'
      : '';
    var googleBtn = '<button type="button" class="da-btn da-btn--google da-btn--hero" id="daG">' + GOOGLE_SVG + 'Continue with Google</button>';
    var providerButtons = googleBtn + appleBtn + discordBtn;
    // A locked chooser has no close control at all. Rendering a dead × is
    // worse than rendering none: it reads as a way out and is not one.
    // The general account door explains the social product. A specific
    // account action keeps its own context, especially an AI round.
    var aiPage = /^\/(newvoice|practice|voice-debate)(?:\.html)?(?:\/|$)/.test(location.pathname);
    var showLivePerson = !!(lockCopy && lockCopy.livePerson) || liveVideo || (!lockCopy && !googleOnly && !aiPage);
    var headline = (lockCopy && lockCopy.headline) || 'Sign in to Debatable';
    var subline = (lockCopy && lockCopy.sub) ||
      (showLivePerson
        ? 'Debate real people face to face on live video. Sign in to keep your rounds and conversations.'
        : noEmail
        ? (googleOnly ? 'Continue with Google to access this page.' : 'Continue with Google or Apple to join live video.')
        : 'Use Google, Apple, or your email and password. New here? Create an account below.');
    // Only fixed emphasis markup is inserted; supplied copy stays escaped.
    var sublineHtml = esc(subline);
    if (locked) sublineHtml = sublineHtml.replace('For safety', '<strong>For safety</strong>');
    c.innerHTML =
      (locked ? '' : '<button class="da-x" aria-label="Close">×</button>') +
      (showLivePerson ? '<div class="da-live-person"><span class="da-live-person-dot" aria-hidden="true"></span>Real person · Live video</div>' : '') +
      '<h2>' + esc(headline) + '</h2>' +
      '<p class="da-sub">' + sublineHtml + '</p>' +
      lastHint +
      inAppNote +
      '<div class="da-auth-methods"><div class="da-provider-options">' +
      termsFieldHtml() +
      nativeButtons +
      '<div class="da-provider-buttons">' + providerButtons + '</div></div>' +
      (noEmail ? '' : '<div class="da-email-options">') +
      (noEmail ? '' : '<div class="da-or">or use email</div>' +
      '<form class="da-form" id="daEmailForm" data-mode="' + mode + '" data-email-mode="' + emailMode + '" novalidate>' +
        (creating ? '<label class="da-label" for="daName">Name</label><input class="da-input" id="daName" type="text" autocomplete="name" maxlength="60" placeholder="Your name" />' : '') +
        '<label class="da-label" for="daEmail">Email</label>' +
        '<input class="da-input" id="daEmail" name="username" type="email" inputmode="email" autocomplete="username" placeholder="you@email.com" />' +
        (linkMode ? '' :
          '<label class="da-label" for="daPassword">Password</label>' +
          '<input class="da-input" id="daPassword" name="password" type="password" autocomplete="' + (creating ? 'new-password' : 'current-password') + '" placeholder="' + (creating ? '8 characters minimum' : 'Your password') + '" />') +
        '<div class="da-form-meta">' +
          '<span>' + (linkMode
            ? 'We email you a link. It works whether you have an account or not.'
            : creating ? 'Use at least 8 characters.' : 'For accounts that already have a password.') + '</span>' +
          (linkMode || creating ? '' : '<button type="button" class="da-link" id="daForgot">Forgot password?</button>') +
        '</div>' +
        (linkMode ? '' : '<label class="da-remember"><input id="daRemember" type="checkbox"' + (keepSignedIn ? ' checked' : '') + '> <span>Keep me signed in</span></label>') +
        '<button type="submit" class="da-btn da-btn--primary" id="daEmailBtn">' +
          (linkMode ? 'Email me a sign-in link' : creating ? 'Create account' : 'Sign in with email') + '</button>' +
        '<p class="da-switch da-switch--row">' +
          '<button type="button" class="da-link" id="daEmailModeSwitch">' +
            (linkMode ? 'Use a password instead' : 'Email me a link instead') + '</button>' +
          // The only surviving sign-in/sign-up question, and it is asked
          // where the answer changes what happens: a password is created
          // or it is checked. The link door never renders it.
          (linkMode ? '' :
            '<button type="button" class="da-link" id="daModeSwitch">' +
              (creating ? 'I already have an account' : 'Create an account') + '</button>') +
        '</p>' +
      '</form></div>') +
      '</div>' +
      '<div class="da-status" role="status"></div>' +
      '<div class="da-err" role="alert"></div>';
    var xBtn = c.querySelector('.da-x');
    if (xBtn) xBtn.addEventListener('click', close);
    // "Open it in Safari or Chrome" is not an instruction anyone can follow
    // inside a webview with no address bar. Hand them the URL.
    var copyBtn = c.querySelector('#daCopyLink');
    if (copyBtn) copyBtn.addEventListener('click', function(){
      var url = location.href;
      var done = function(){
        copyBtn.textContent = 'Copied';
        setTimeout(function(){ try { copyBtn.textContent = 'Copy link'; } catch (e) {} }, 2200);
        try { if (window.gtag) gtag('event', 'inapp_copy_link', { path: location.pathname }); } catch (e) {}
      };
      try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(url).then(done, function(){ legacyCopy(url, done); });
        } else { legacyCopy(url, done); }
      } catch (e) { legacyCopy(url, done); }
    });
    // The provider buttons are NOT disabled while the box is unticked,
    // and that is the fix rather than an oversight. A disabled button
    // dispatches no click, so requireTerms() -- the whole of the
    // feedback this gate has, its message and its focus -- sat behind
    // an event the browser would never deliver. Tapping a provider
    // button did nothing at all, twice, and people reported sign-in as
    // broken. Acceptance is still enforced: every handler calls
    // requireTerms() before it touches Firebase, which is what the iOS
    // review guard pins.
    wireTermsField(c);
    if (c.querySelector('#daApple')) c.querySelector('#daApple').addEventListener('click', doAppleSignIn);
    if (c.querySelector('#daDiscord')) c.querySelector('#daDiscord').addEventListener('click', doDiscordSignIn);
    c.querySelector('#daG').addEventListener('click', doGoogle);
    var emailForm = c.querySelector('#daEmailForm');
    if (emailForm) emailForm.addEventListener('submit', linkMode ? doEmailLink : doEmailPassword);
    var rememberInput = c.querySelector('#daRemember');
    if (rememberInput) rememberInput.addEventListener('change', function () {
      try { localStorage.setItem('debateos-auth-remember', rememberInput.checked ? '1' : '0'); } catch (e) {}
    });
    // Carry what has been typed across either switch. Retyping an address
    // because you changed your mind about passwords is the kind of small
    // tax that loses people at the last step.
    function reRender(nextMode, nextEmailMode) {
      var typedEmail = (c.querySelector('#daEmail') || {}).value || '';
      var typedName = (c.querySelector('#daName') || {}).value || '';
      renderChooser(nextMode, nextEmailMode);
      var next = home();
      if (!next) return;
      var e = next.querySelector('#daEmail');
      var n = next.querySelector('#daName');
      if (e && typedEmail) e.value = typedEmail;
      if (n && typedName) n.value = typedName;
    }
    var modeSwitch = c.querySelector('#daModeSwitch');
    if (modeSwitch) modeSwitch.addEventListener('click', function () {
      reRender(creating ? 'signin' : 'signup', 'password');
    });
    var emailModeSwitch = c.querySelector('#daEmailModeSwitch');
    if (emailModeSwitch) emailModeSwitch.addEventListener('click', function () {
      reRender(mode, linkMode ? 'password' : 'link');
    });
    if (c.querySelector('#daForgot')) c.querySelector('#daForgot').addEventListener('click', doPasswordReset);
  }

  function nativeAuthPlugin() {
    try {
      return window.__DB_NATIVE && window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.FirebaseAuthentication;
    } catch (e) { return null; }
  }

  function lastMethod() {
    try { return localStorage.getItem('debateos-last-signin-method') || ''; } catch (e) { return ''; }
  }

  function finishSignIn(method) {
    rememberTerms(true);
    try { localStorage.setItem('debateos-feedback-given', '1'); } catch (e) {}
    // Remember how this person signs in, normalized to the provider
    // family. Next visit the modal opens in sign-in mode with their
    // method called out, instead of restarting them at "Create your
    // account" with three equal choices.
    try {
      var fam = /google/.test(method) ? 'google' : /apple/.test(method) ? 'apple'
        : /link/.test(method) ? 'emaillink' : 'email';
      localStorage.setItem('debateos-last-signin-method', fam);
    } catch (e) {}
    track('sign_in_complete', { method: method });
    // Fire sign_up when this completion created the account, so GA4
    // can tell a new account from a returning sign-in (nothing else on
    // the shared modal ever fired one). The signup method string is
    // explicit for email/password; every other provider is detected
    // from Auth metadata: an account created within the last 10
    // minutes is new. That window also catches an anonymous uid minted
    // this visit and then linked, which IS a new account. Known
    // undercount, accepted: a days-old guest who finally links records
    // only sign_in_complete.
    try {
      var u = firebase.auth().currentUser;
      var createdMs = u && u.metadata && u.metadata.creationTime ? Date.parse(u.metadata.creationTime) : NaN;
      var isNew = /signup/.test(method) || (isFinite(createdMs) && (Date.now() - createdMs) < 10 * 60 * 1000);
      if (isNew) track('sign_up', { method: method });
      // The welcome email (2026-09-03). Fired here so it lands while the
      // tab is still open; the server decides eligibility from Auth's
      // own creation time and stamps the profile, so a re-fire is a
      // no-op and a miss is caught by scheduled-welcome-sweep.mjs.
      // keepalive: finishSignIn navigates right after this, and a plain
      // fetch would be cancelled with the page.
      if (u && !u.isAnonymous && u.getIdToken) {
        u.getIdToken().then(function (idToken) {
          return fetch('/api/welcome-email', {
            method: 'POST',
            headers: { Authorization: 'Bearer ' + idToken },
            keepalive: true
          });
        }).catch(function () {});
      }
    } catch (e) {}
    if (handOff(method)) return;
    // Close before navigating. Assigning the current URL can be delayed or
    // treated as a no-op by the browser, while onboarding reacts to the auth
    // state immediately. Leaving this card mounted hides that onboarding
    // beneath its higher z-index even though sign-in already succeeded.
    var nextDestination = window.__DB_NATIVE ? '/native' : destination();
    forceClose();
    window.location.href = nextDestination;
  }

  // A caller mid-action (entering a tournament, paying in) cannot survive
  // the reload finishSignIn normally does: the click that started it is
  // gone by the time the page comes back. openAuthModal(mode, {onDone})
  // registers a callback that receives the signed-in user INSTEAD of
  // navigating, which is what lets a page keep its flow. Callers that
  // pass nothing are byte-identical to before.
  //
  // One-shot on purpose: the callback is cleared before it runs, so a
  // second sign-in on the same page cannot re-fire a stale action, and a
  // throw inside it still leaves the modal closed rather than stuck open
  // over a page the person can no longer reach.
  function handOff(method) {
    if (typeof onDone !== 'function') return false;
    var cb = onDone;
    onDone = null;
    forceClose();
    try {
      cb((firebase.auth && firebase.auth().currentUser) || null, method);
    } catch (e) {}
    return true;
  }

  function doGoogle() {
    if (!requireTerms()) return;
    setErr('');
    bootstrap(function () {
      try {
        var nativePlugin = nativeAuthPlugin();
        if (nativePlugin && nativePlugin.signInWithGoogle) {
          track('sign_in_start', { method: 'google_native' });
          nativePlugin.signInWithGoogle({ skipNativeAuth: true }).then(function (result) {
            var c = result && result.credential;
            if (!c || !c.idToken) throw new Error('missing-google-credential');
            var credential = firebase.auth.GoogleAuthProvider.credential(c.idToken, c.accessToken || null);
            var nativeAuth = firebase.auth();
            var current = nativeAuth.currentUser;
            return current && current.isAnonymous && current.linkWithCredential
              ? current.linkWithCredential(credential).catch(function (err) {
                  var code = (err && err.code) || '';
                  if (code === 'auth/credential-already-in-use' || code === 'auth/email-already-in-use') {
                    return nativeAuth.signInWithCredential(credential);
                  }
                  throw err;
                })
              : nativeAuth.signInWithCredential(credential);
          }).then(function () { finishSignIn('google_native'); }).catch(function (err) {
            var code = (err && (err.code || err.message)) || 'unknown';
            if (/cancel|closed/i.test(code)) return;
            setErr(providerFailMsg());
          });
          return;
        }
        var provider = new firebase.auth.GoogleAuthProvider();
        provider.setCustomParameters({ prompt: 'select_account' });
        track('sign_in_start', { method: 'google' });
        var t0 = Date.now();
        auth = firebase.auth();
        var current = auth.currentUser;
        // A RETURNING user is the case this has to get right, and it is
        // the one that used to be impossible. js/notifications.js signs
        // every visitor in anonymously on page load, so currentUser is
        // almost always a truthy anonymous user and this path is the
        // normal one, not the edge case. Linking that anonymous account
        // to a Google account that ALREADY EXISTS can never succeed:
        // Firebase rejects it with auth/credential-already-in-use.
        //
        // The recovery must not be another popup. The user gesture was
        // spent on the first one, so a second popup is blocked by the
        // browser, and the outer catch then retried the SAME doomed link
        // over a redirect, which failed for the same reason after a full
        // page round-trip. That loop is why a returning user could not
        // sign back in at all.
        //
        // Firebase hands back the credential the user just proved they
        // own on that error, so sign in with it directly: no second
        // popup, no redirect, no gesture needed. `linkRejected` records
        // that linking is off the table so the redirect fallback below
        // signs in rather than re-attempting the link.
        var linkRejected = false;
        var attempt = current && current.isAnonymous && current.linkWithPopup
          ? current.linkWithPopup(provider).catch(function (err) {
              var code = (err && err.code) || '';
              if (code === 'auth/credential-already-in-use' || code === 'auth/email-already-in-use') {
                linkRejected = true;
                var cred = err && err.credential;
                if (cred && auth.signInWithCredential) return auth.signInWithCredential(cred);
                return auth.signInWithPopup(provider);
              }
              throw err;
            })
          : auth.signInWithPopup(provider);
        attempt.then(function () {
          finishSignIn('google');
        }).catch(function (err) {
          var code = (err && err.code) || 'unknown';
          if (code === 'auth/popup-closed-by-user' && (Date.now() - t0) > 1200) return;
          try {
            var canLink = current && current.isAnonymous && current.linkWithRedirect && !linkRejected;
            var redirect = canLink
              ? current.linkWithRedirect(provider)
              : auth.signInWithRedirect(provider);
            Promise.resolve(redirect).catch(function () { setErr(providerFailMsg()); });
          } catch (e) { setErr(providerFailMsg()); }
        });
      } catch (e) { setErr('Sign-in unavailable, try again.'); }
    });
  }

  // Sign in with Apple. REQUIRED in the iOS App Store build: Apple Guideline
  // 4.8 mandates offering Sign in with Apple whenever you offer other social
  // logins (we offer Google). This web-SDK path works once the Apple provider
  // is enabled in the Firebase console (needs an Apple Developer Services ID +
  // key). Inside the Capacitor shell the reliable path is the native
  // @capacitor-firebase/authentication plugin — see mobile/IOS_SETUP.md.
  // Exposed as window.dbAppleSignIn so the native sign-in UI can call it.
  function doAppleSignIn() {
    if (!requireTerms()) return;
    setErr('');
    bootstrap(function () {
      try {
        var nativePlugin = nativeAuthPlugin();
        if (nativePlugin && nativePlugin.signInWithApple) {
          track('sign_in_start', { method: 'apple_native' });
          nativePlugin.signInWithApple({ skipNativeAuth: true }).then(function (result) {
            var c = result && result.credential;
            if (!c || !c.idToken || !c.nonce) throw new Error('missing-apple-credential');
            var provider = new firebase.auth.OAuthProvider('apple.com');
            var credential = provider.credential({ idToken: c.idToken, rawNonce: c.nonce });
            return firebase.auth().signInWithCredential(credential);
          }).then(function () { finishSignIn('apple_native'); }).catch(function (err) {
            var code = (err && (err.code || err.message)) || 'unknown';
            if (/cancel|1001/i.test(code)) return;
            setErr('Apple sign-in failed. Try again.');
          });
          return;
        }
        var provider = new firebase.auth.OAuthProvider('apple.com');
        provider.addScope('email');
        provider.addScope('name');
        track('sign_in_start', { method: 'apple' });
        var t0 = Date.now();
        auth = firebase.auth();
        // Same shape as the Google path: nearly every visitor is a truthy
        // ANONYMOUS user (notifications.js), so link first to carry their
        // local state; when the Apple account already exists Firebase
        // rejects the link and hands back the proven credential, which
        // signs in directly with no second popup (the gesture is spent).
        var current = auth.currentUser;
        var appleLinkRejected = false;
        var attempt = current && current.isAnonymous && current.linkWithPopup
          ? current.linkWithPopup(provider).catch(function (err) {
              var code = (err && err.code) || '';
              if (code === 'auth/credential-already-in-use' || code === 'auth/email-already-in-use') {
                appleLinkRejected = true;
                var cred = err && err.credential;
                if (cred && auth.signInWithCredential) return auth.signInWithCredential(cred);
                return auth.signInWithPopup(provider);
              }
              throw err;
            })
          : auth.signInWithPopup(provider);
        attempt.then(function () {
          try { localStorage.setItem('debateos-feedback-given', '1'); } catch (e) {}
          track('sign_in_complete', { method: 'apple' });
          if (handOff('apple')) return;
          window.location.href = destination();
        }).catch(function (err) {
          var code = (err && err.code) || 'unknown';
          if (code === 'auth/popup-closed-by-user' && (Date.now() - t0) > 1200) return;
          try {
            var canLink = current && current.isAnonymous && current.linkWithRedirect && !appleLinkRejected;
            var redirect = canLink ? current.linkWithRedirect(provider) : auth.signInWithRedirect(provider);
            Promise.resolve(redirect).catch(function () { setErr('Apple sign-in failed. Try again.'); });
          } catch (e) { setErr('Apple sign-in failed: ' + code); }
        });
      } catch (e) { setErr('Apple sign-in unavailable, try again.'); }
    });
  }
  window.dbAppleSignIn = doAppleSignIn;

  // Discord through Identity Platform's generic OIDC provider. Same link-
  // first shape as Google and Apple: an anonymous visitor's local state
  // travels into the account; an existing Discord account signs in
  // directly off the rejected link's credential.
  function doDiscordSignIn() {
    if (!requireTerms()) return;
    setErr('');
    bootstrap(function () {
      try {
        var provider = new firebase.auth.OAuthProvider('oidc.discord');
        provider.addScope('identify');
        provider.addScope('email');
        track('sign_in_start', { method: 'discord' });
        var t0 = Date.now();
        auth = firebase.auth();
        var current = auth.currentUser;
        var linkRejected = false;
        var attempt = current && current.isAnonymous && current.linkWithPopup
          ? current.linkWithPopup(provider).catch(function (err) {
              var code = (err && err.code) || '';
              if (code === 'auth/credential-already-in-use' || code === 'auth/email-already-in-use') {
                linkRejected = true;
                var cred = err && err.credential;
                if (cred && auth.signInWithCredential) return auth.signInWithCredential(cred);
                return auth.signInWithPopup(provider);
              }
              throw err;
            })
          : auth.signInWithPopup(provider);
        attempt.then(function () {
          try { localStorage.setItem('debateos-feedback-given', '1'); } catch (e) {}
          track('sign_in_complete', { method: 'discord' });
          if (handOff('discord')) return;
          window.location.href = destination();
        }).catch(function (err) {
          var code = (err && err.code) || 'unknown';
          if (code === 'auth/popup-closed-by-user' && (Date.now() - t0) > 1200) return;
          try {
            var canLink = current && current.isAnonymous && current.linkWithRedirect && !linkRejected;
            var redirect = canLink ? current.linkWithRedirect(provider) : auth.signInWithRedirect(provider);
            Promise.resolve(redirect).catch(function () { setErr('Discord sign-in failed. Try again.'); });
          } catch (e) { setErr('Discord sign-in failed: ' + code); }
        });
      } catch (e) { setErr('Discord sign-in unavailable, try again.'); }
    });
  }
  window.dbDiscordSignIn = doDiscordSignIn;

  function emailAuthMessage(err, mode) {
    var code = (err && err.code) || '';
    if (code === 'auth/email-already-in-use' || code === 'auth/credential-already-in-use') return 'That email already has an account. If you made it with Google, use Continue with Google above.';
    if (code === 'auth/user-disabled') return 'That account is disabled. Contact support.';
    if (code === 'auth/invalid-email') return 'Enter a valid email.';
    if (code === 'auth/weak-password') return 'Use a stronger password with at least 8 characters.';
    // Email-enumeration protection is ON for this project, so Firebase
    // collapses "wrong password" and "no such account" into one code and
    // will never tell us which. "Email or password is incorrect" is the
    // literal truth and a dead end: the most likely reason a password
    // fails here is that the account is a Google one and has no password
    // at all. Name the two doors that can actually open instead. Naming
    // them costs nothing in enumeration terms, because it is a
    // conditional and confirms nothing about whether the account exists.
    if (code === 'auth/invalid-credential' || code === 'auth/wrong-password' || code === 'auth/user-not-found') return 'That email and password do not match. If you made this account with Google, use Continue with Google above, or email yourself a sign-in link.';
    if (code === 'auth/too-many-requests') return 'Too many attempts. Wait a few minutes and try again.';
    if (code === 'auth/network-request-failed') return 'Could not reach sign-in. Check your connection and try again.';
    if (code === 'auth/web-storage-unsupported') return 'This browser could not save your sign-in. Turn off Keep me signed in and try again, or allow site storage in your browser.';
    if (code === 'auth/operation-not-allowed') return isInAppBrowser() ? 'Email sign-in is temporarily unavailable. Open the site in Safari or Chrome and try Google.' : 'Email sign-in is temporarily unavailable. Continue with Google.';
    return mode === 'signup' ? 'Could not create the account. Try again.' : 'Could not sign in. Try again.';
  }

  function doEmailPassword(event) {
    if (event) event.preventDefault();
    if (!requireTerms()) return;
    setErr('');
    setStatus('');
    var c = home();
    var form = c && c.querySelector('#daEmailForm');
    var mode = form && form.getAttribute('data-mode') === 'signin' ? 'signin' : 'signup';
    var emailInput = c && c.querySelector('#daEmail');
    var passInput = c && c.querySelector('#daPassword');
    var nameInput = c && c.querySelector('#daName');
    var email = (emailInput && emailInput.value || '').trim();
    var password = passInput && passInput.value || '';
    var rememberInput = c && c.querySelector('#daRemember');
    var remember = !rememberInput || rememberInput.checked;
    var name = (nameInput && nameInput.value || '').trim().replace(/\s+/g, ' ').slice(0, 60);
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { setErr('Enter a valid email.'); return; }
    if (mode === 'signup' && name.length < 2) { setErr('Enter your name.'); return; }
    if (mode === 'signup' && password.length < 8) { setErr('Use at least 8 characters for your password.'); return; }
    if (mode === 'signin' && !password) { setErr('Enter your password.'); return; }
    var btn = c.querySelector('#daEmailBtn');
    btn.disabled = true;
    btn.textContent = mode === 'signup' ? 'Creating account…' : 'Signing in…';
    bootstrap(function () {
      try {
        auth = firebase.auth();
        if (auth.useDeviceLanguage) auth.useDeviceLanguage();
        track('sign_in_start', { method: 'email_password', action: mode });
        var reused = false;
        // Await persistence before linking or signing in: otherwise the
        // page can navigate away before the returning session is saved.
        Promise.resolve().then(function () {
          return auth.setPersistence(remember ? firebase.auth.Auth.Persistence.LOCAL : firebase.auth.Auth.Persistence.SESSION);
        }).then(function () {
          var attempt;
          if (mode === 'signup') {
            var current = auth.currentUser;
            var credential = firebase.auth.EmailAuthProvider.credential(email, password);
            // Preserve work owned by an existing anonymous Firebase user
            // by linking that account instead of creating a new uid. When the email already
            // has an account the link throws; sign in with the same
            // password instead of dead-ending them, same as Google does.
            var reuse = function (err) {
              var code = (err && err.code) || '';
              if (code === 'auth/credential-already-in-use' || code === 'auth/email-already-in-use') {
                reused = true;
                return auth.signInWithEmailAndPassword(email, password);
              }
              throw err;
            };
            attempt = current && current.isAnonymous && current.linkWithCredential
              ? current.linkWithCredential(credential).catch(reuse)
              : auth.createUserWithEmailAndPassword(email, password).catch(reuse);
          } else {
            attempt = auth.signInWithEmailAndPassword(email, password);
          }
          return attempt;
        }).then(function (result) {
          var user = result && result.user;
          if (mode === 'signup' && !reused && user && user.updateProfile) {
            return user.updateProfile({ displayName: name }).then(function () { return user; });
          }
          return user;
        }).then(function (user) {
          if (mode === 'signup' && !reused && user && !user.emailVerified && user.sendEmailVerification) {
            user.sendEmailVerification().catch(function () {});
          }
          finishSignIn(mode === 'signup' && !reused ? 'email_password_signup' : 'email_password_signin');
        }).catch(function (err) {
          btn.disabled = false;
          btn.textContent = mode === 'signup' ? 'Create account' : 'Sign in with email';
          setErr(emailAuthMessage(err, mode));
        });
      } catch (e) {
        btn.disabled = false;
        btn.textContent = mode === 'signup' ? 'Create account' : 'Sign in with email';
        setErr(isInAppBrowser() ? 'Email sign-in is unavailable. Open the site in Safari or Chrome and try Google.' : 'Email sign-in is unavailable. Continue with Google.');
      }
    });
  }

  // ── Emailed sign-in link (passwordless) ────────────────────────────
  // Firebase calls this "email link" auth; the person using it calls it
  // a magic link. Two halves: send it here, finish it in
  // completeEmailLink() when they come back through the link.
  var LINK_EMAIL_KEY = 'debateos-emaillink-email';
  var LINK_NAME_KEY = 'debateos-emaillink-name';

  function emailLinkSettings() {
    return {
      // Land them back where they started rather than on a generic page.
      // The whole point of the link is that it costs them nothing, and
      // losing their place is a cost.
      url: window.location.origin + destination(),
      handleCodeInApp: true,
    };
  }

  // The send half, on its own and public. A surface that ALREADY shows
  // the sign-in choices on the page (the /spar gate) must be able to
  // take an email inline instead of stacking this modal on top of its
  // own card — the founder cut that duplicate twice on 2026-08-23 — and
  // it must not grow a second copy of the send, or the two drift. What
  // is stashed here is exactly what completeEmailLink() reads back, so
  // an inline send finishes through the same return trip. Rejections
  // carry `userMessage`: a caller renders that, never err.message.
  function sendSignInLink(email, name, action) {
    email = String(email || '').trim();
    name = String(name || '').trim().replace(/\s+/g, ' ').slice(0, 60);
    return new Promise(function (resolve, reject) {
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
        var bad = new Error('invalid-email');
        bad.userMessage = 'Enter a valid email.';
        reject(bad);
        return;
      }
      // What completeEmailLink() reads back on the return trip. Stashed
      // on BOTH send paths, or a link that arrives cannot be finished.
      function stash() {
        try {
          localStorage.setItem(LINK_EMAIL_KEY, email);
          if (name) localStorage.setItem(LINK_NAME_KEY, name);
        } catch (e) {}
      }
      function done(via) {
        stash();
        track('email_link_sent', { action: action || 'signup', via: via });
        resolve(email);
      }
      track('sign_in_start', { method: 'email_link', action: action || 'signup' });

      // Firebase's own mailer, kept as the fallback only. It sends from
      // noreply@debateos-78ac5.firebaseapp.com, which Gmail spam-foldered
      // on 2026-08-26 with "similar to messages that were identified as
      // spam in the past" — a fair verdict on a shared Google sending
      // domain carrying the stock template. A link in Spam still beats no
      // link, so this stays reachable when our own sender cannot run.
      function viaFirebase() {
        bootstrap(function () {
          try {
            auth = firebase.auth();
            if (auth.useDeviceLanguage) auth.useDeviceLanguage();
            auth.sendSignInLinkToEmail(email, emailLinkSettings()).then(function () {
              done('firebase');
            }).catch(function (err) {
              var wrapped = err || new Error('send-failed');
              wrapped.userMessage = emailLinkMessage(wrapped);
              reject(wrapped);
            });
          } catch (e) {
            e.userMessage = isInAppBrowser()
              ? 'Could not send the link. Try a password instead.'
              : 'Could not send the link. Continue with Google or a password.';
            reject(e);
          }
        });
      }

      // Our own sender first: /api/signin-link generates the same Firebase
      // code and mails it from the verified itsdebatable.com address every
      // other lifecycle email already ships from, with the link rehosted on
      // our own domain. See netlify/functions/signin-link.mjs.
      //
      // Deliberately NOT timed out into the fallback: a slow function that
      // then succeeds would mail two links off one tap. A failure answers,
      // and an answer is what switches paths.
      try {
        fetch('/api/signin-link', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: email,
            name: name,
            continueUrl: window.location.origin + destination(),
          }),
        }).then(function (res) {
          if (res && res.ok) { done('resend'); return; }
          // A rate limit is OURS and must not be laundered through
          // Firebase's sender, or the cap means nothing.
          if (res && res.status === 429) {
            var busy = new Error('rate-limited');
            busy.userMessage = 'That is a few links already. Check your inbox and your spam folder, or use a password instead.';
            reject(busy);
            return;
          }
          viaFirebase();
        }).catch(function () { viaFirebase(); });
      } catch (e) { viaFirebase(); }
    });
  }
  window.debatableSendSignInLink = sendSignInLink;

  function doEmailLink(event) {
    if (event) event.preventDefault();
    if (!requireTerms()) return;
    setErr('');
    setStatus('');
    var c = home();
    var form = c && c.querySelector('#daEmailForm');
    var mode = form && form.getAttribute('data-mode') === 'signin' ? 'signin' : 'signup';
    var emailInput = c && c.querySelector('#daEmail');
    var nameInput = c && c.querySelector('#daName');
    var email = (emailInput && emailInput.value || '').trim();
    var name = (nameInput && nameInput.value || '').trim().replace(/\s+/g, ' ').slice(0, 60);
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { setErr('Enter a valid email.'); return; }
    if (mode === 'signup' && name.length < 2) { setErr('Enter your name.'); return; }
    var btn = c.querySelector('#daEmailBtn');
    btn.disabled = true;
    btn.textContent = 'Sending the link…';
    sendSignInLink(email, name, mode).then(function () {
      renderLinkSent(email, mode, name);
    }).catch(function (err) {
      btn.disabled = false;
      btn.textContent = 'Email me a sign-in link';
      setErr((err && err.userMessage) || 'Could not send the link. Try again.');
    });
  }

  // A deep link into the webmail that is about to hold the message. Only
  // for the four providers whose URL is stable and unambiguous; anything
  // else gets no button rather than a guess that opens the wrong place.
  // Gmail's search carries `in:anywhere`, which is what makes it find the
  // message when the filter put it in Spam — the case this exists for.
  function mailboxLink(email) {
    var domain = String(email || '').split('@')[1] || '';
    domain = domain.toLowerCase();
    if (domain === 'gmail.com' || domain === 'googlemail.com') {
      return { label: 'Open Gmail', url: 'https://mail.google.com/mail/u/0/#search/from%3Aitsdebatable.com+in%3Aanywhere' };
    }
    if (domain === 'outlook.com' || domain === 'hotmail.com' || domain === 'live.com' || domain === 'msn.com') {
      return { label: 'Open Outlook', url: 'https://outlook.live.com/mail/0/' };
    }
    if (domain === 'yahoo.com' || domain === 'ymail.com') {
      return { label: 'Open Yahoo Mail', url: 'https://mail.yahoo.com/' };
    }
    if (domain === 'icloud.com' || domain === 'me.com' || domain === 'mac.com') {
      return { label: 'Open iCloud Mail', url: 'https://www.icloud.com/mail/' };
    }
    return null;
  }

  // The sent state is its own screen, not a green line under a form that
  // still looks unfinished. Someone who has just asked for a link has one
  // job and needs three things: where it went, what to do when it lands,
  // and where to look when it does not. The spam line is the reason this
  // screen exists at all — a link nobody finds is a sign-up that never
  // happens, and the person cannot know to check Spam unless we say so.
  function renderLinkSent(email, mode, name) {
    var c = home(); if (!c) return;
    var box = mailboxLink(email);
    c.innerHTML =
      (locked ? '' : '<button class="da-x" aria-label="Close">×</button>') +
      '<h2>Check your email</h2>' +
      '<p class="da-sub">The sign-in link is on its way to <span class="da-sent-to">' + esc(email) + '</span>. It usually lands within a minute.</p>' +
      '<ol class="da-steps">' +
        '<li>Open the email from <strong>Debatable</strong> (hello@itsdebatable.com).</li>' +
        '<li>Tap <strong>Sign in to Debatable</strong>.</li>' +
        '<li>You land back on this page, signed in. Nothing to remember next time.</li>' +
      '</ol>' +
      '<div class="da-spam"><strong>Not there after 2 minutes? Check spam.</strong>' +
        'A first email from a new sender often lands there. Move it to your inbox and mark it Not spam, and the next one arrives properly.</div>' +
      (box ? '<a class="da-btn da-btn--primary da-btn--hero" id="daOpenMail" href="' + esc(box.url) + '" target="_blank" rel="noopener">' + esc(box.label) + '</a>' : '') +
      '<button type="button" class="da-btn" id="daLinkResend">Send it again</button>' +
      '<div class="da-status" role="status"></div>' +
      '<div class="da-err" role="alert"></div>' +
      '<p class="da-switch"><button type="button" class="da-link" id="daLinkBack">Use a different email</button>' +
        '<span style="opacity:.5"> · </span>' +
        '<button type="button" class="da-link" id="daLinkPassword">Use a password instead</button></p>';

    var xBtn = c.querySelector('.da-x');
    if (xBtn) xBtn.addEventListener('click', close);
    var mail = c.querySelector('#daOpenMail');
    if (mail) mail.addEventListener('click', function () { track('email_link_open_mailbox', { action: mode }); });

    // Resend, on a cooldown. Tapping it twice in six seconds mails two
    // links, and the second one silently retires the first, so an
    // impatient person can end up clicking the dead one.
    var resend = c.querySelector('#daLinkResend');
    var left = 0, ticker = null;
    function cool() {
      left = 30;
      resend.disabled = true;
      resend.textContent = 'Send it again in ' + left + 's';
      ticker = setInterval(function () {
        left -= 1;
        if (left <= 0) {
          clearInterval(ticker); ticker = null;
          resend.disabled = false;
          resend.textContent = 'Send it again';
          return;
        }
        resend.textContent = 'Send it again in ' + left + 's';
      }, 1000);
    }
    cool();
    resend.addEventListener('click', function () {
      if (ticker) { clearInterval(ticker); ticker = null; }
      setErr(''); setStatus('');
      resend.disabled = true;
      resend.textContent = 'Sending…';
      track('email_link_resend', { action: mode });
      sendSignInLink(email, name, mode).then(function () {
        setStatus('Sent again. If two arrive, use the newest one.');
        cool();
      }).catch(function (err) {
        resend.disabled = false;
        resend.textContent = 'Send it again';
        setErr((err && err.userMessage) || 'Could not send the link. Try again.');
      });
    });

    c.querySelector('#daLinkBack').addEventListener('click', function () {
      if (ticker) clearInterval(ticker);
      renderChooser(mode, 'link');
      var next = home() && home().querySelector('#daEmail');
      if (next) next.value = email;
      var nm = home() && home().querySelector('#daName');
      if (nm && name) nm.value = name;
    });
    c.querySelector('#daLinkPassword').addEventListener('click', function () {
      if (ticker) clearInterval(ticker);
      renderChooser(mode, 'password');
      var next = home() && home().querySelector('#daEmail');
      if (next) next.value = email;
      var nm2 = home() && home().querySelector('#daName');
      if (nm2 && name) nm2.value = name;
    });
  }

  function emailLinkMessage(err) {
    var code = (err && err.code) || '';
    if (code === 'auth/invalid-email') return 'Enter a valid email.';
    if (code === 'auth/too-many-requests') return 'Too many attempts. Wait a few minutes and try again.';
    if (code === 'auth/network-request-failed') return 'Could not reach sign-in. Check your connection and try again.';
    if (code === 'auth/operation-not-allowed') return 'Sign-in links are unavailable right now. Use a password or Google.';
    if (code === 'auth/unauthorized-continue-uri') return 'Sign-in links are unavailable on this address. Use a password or Google.';
    return 'Could not send the link. Try again.';
  }

  // Finishes the round trip. Runs on load on every page, so it is gated
  // on a cheap URL test first and only then pays for the Firebase SDK.
  // The completion half, reusable. Called on load with the address we
  // stashed when the link was sent, and again from renderLinkReturn with
  // an address the visitor typed on a different browser.
  function finishEmailLink(email, href, onFail) {
    var name = '';
    try { name = localStorage.getItem(LINK_NAME_KEY) || ''; } catch (e) {}

    // Same shape as the Google path: notifications.js signs nearly
    // every visitor in anonymously, so currentUser is usually a
    // truthy anonymous user. Link that account when it is free to
    // link, and fall back to a plain sign-in when the email already
    // owns an account, rather than failing the whole trip.
    //
    // The fallback re-derives from the same href, and that is CORRECT
    // rather than lucky: measured against the live API on 2026-08-26, a
    // link attempt that fails with EMAIL_EXISTS leaves the one-time code
    // unspent, and the same code then signs in fine. Only a SUCCESSFUL
    // use consumes it. Do not "fix" this into err.credential on the
    // strength of the Google path, which fails for a different reason.
    var credential = firebase.auth.EmailAuthProvider.credentialWithLink(email, href);
    var current = auth.currentUser;
    var attempt = current && current.isAnonymous && current.linkWithCredential
      ? current.linkWithCredential(credential).catch(function (err) {
          var code = (err && err.code) || '';
          if (code === 'auth/credential-already-in-use' || code === 'auth/email-already-in-use') {
            return auth.signInWithEmailLink(email, href);
          }
          throw err;
        })
      : auth.signInWithEmailLink(email, href);

    return attempt.then(function (result) {
      var user = (result && result.user) || auth.currentUser;
      if (name && user && user.updateProfile && !user.displayName) {
        return user.updateProfile({ displayName: name }).catch(function () {});
      }
    }).then(function () {
      try {
        localStorage.removeItem(LINK_EMAIL_KEY);
        localStorage.removeItem(LINK_NAME_KEY);
      } catch (e) {}
      // Strip the link parameters so a refresh does not re-run a
      // now-spent code and surface an error on a page that worked.
      var clean = window.location.pathname + window.location.hash;
      try { history.replaceState(null, '', clean); } catch (e) {}
      finishSignIn('email_link');
    }).catch(function (err) {
      var code = (err && err.code) || '';
      try { localStorage.removeItem(LINK_EMAIL_KEY); } catch (e) {}
      var msg = code === 'auth/invalid-action-code'
        ? 'That sign-in link has expired or was already used. Continue with Google.'
        : code === 'auth/invalid-email'
          ? 'That email does not match the link. Try again.'
          : 'Could not finish signing you in. Continue with Google.';
      if (typeof onFail === 'function') { onFail(msg, code); return; }
      stripLinkParams();
      // Email is no longer a public provider. An old link may finish, but
      // a failed one returns to the supported Google door.
      openAuthModal('signin');
      setErr(msg);
    });
  }

  // The link was opened somewhere other than the browser that asked for
  // it, so Firebase needs the address restated. Asking here rather than
  // in a native prompt keeps the question visible, the answer retryable,
  // and Google on the same card for anyone who would rather not bother.
  // Take the link parameters off the address bar once we hold the href
  // in a closure. Leaving them there is not cosmetic: emailLinkSettings()
  // builds the continue URL from destination(), so a visitor who gives up
  // on a dead link and sends themselves a FRESH one would get a link whose
  // continue URL still carried the dead oobCode, and the return trip would
  // then arrive holding two codes with no way to tell which is live.
  function stripLinkParams() {
    try {
      var clean = window.location.pathname + window.location.hash;
      history.replaceState(null, '', clean);
    } catch (e) {}
  }

  function renderLinkReturn(href) {
    stripLinkParams();
    openAuthModal('signin');
    var c = home(); if (!c) return;
    c.innerHTML =
      '<button class="da-x" aria-label="Close">\u00d7</button>' +
      '<h2>Finish signing in</h2>' +
      '<p class="da-sub">Confirm the email this link was sent to. Restating it is what stops a forwarded link signing in whoever finds it.</p>' +
      '<form class="da-form" id="daLinkForm" novalidate>' +
        '<label class="da-label" for="daLinkEmail">Email</label>' +
        '<input class="da-input" id="daLinkEmail" type="email" inputmode="email" autocomplete="email" placeholder="you@email.com" />' +
        '<button type="submit" class="da-btn da-btn--primary da-btn--hero" id="daLinkBtn">Finish signing in</button>' +
      '</form>' +
      '<div class="da-err" role="alert"></div>' +
      '<p class="da-switch"><button type="button" class="da-link" id="daLinkBail">Continue with Google</button></p>';
    var xBtn = c.querySelector('.da-x');
    if (xBtn) xBtn.addEventListener('click', close);
    c.querySelector('#daLinkBail').addEventListener('click', function () {
      renderChooser('signin', 'link');
    });
    c.querySelector('#daLinkForm').addEventListener('submit', function (event) {
      event.preventDefault();
      setErr('');
      var input = c.querySelector('#daLinkEmail');
      var typed = (input && input.value || '').trim();
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(typed)) { setErr('Enter the email the link was sent to.'); return; }
      var btn = c.querySelector('#daLinkBtn');
      btn.disabled = true;
      btn.textContent = 'Signing you in\u2026';
      finishEmailLink(typed, href, function (msg, code) {
        // Stay on this card. A wrong address is a typo, not a dead end,
        // and re-rendering the chooser would throw away the href. The
        // copy is card-specific because the shared message points at a
        // Google button and a send form that this card does not carry;
        // pointing someone at a control that is not on screen is how a
        // helpful error becomes another dead end.
        btn.disabled = false;
        btn.textContent = 'Finish signing in';
        setErr(code === 'auth/invalid-email' || code === 'auth/user-not-found'
          ? 'That address does not match this link. Check it and try again.'
          : code === 'auth/invalid-action-code'
            ? 'This link has expired or was already used. Continue with Google below.'
            : 'Could not finish signing you in. Use another way in, below.');
      });
    });
    var first = c.querySelector('#daLinkEmail');
    if (first) first.focus();
  }

  function completeEmailLink() {
    var href = window.location.href;
    if (!/[?&]oobCode=/.test(href) || !/[?&]mode=signIn/.test(href)) return;
    bootstrap(function () {
      try {
        auth = firebase.auth();
        if (!auth.isSignInWithEmailLink || !auth.isSignInWithEmailLink(href)) return;
        var email = '';
        try { email = localStorage.getItem(LINK_EMAIL_KEY) || ''; } catch (e) {}
        // Opened on a different device or browser than the one that
        // asked for it. Firebase requires the address to be re-stated,
        // which is what stops a leaked link from signing in whoever
        // found it.
        //
        // This used to be a native window.prompt(), and a prompt is the
        // wrong instrument for a step a sign-in depends on. It fires
        // during load, a browser is entitled to suppress it, and
        // dismissing it returned an empty string that this function
        // treated as "give up" IN SILENCE: the visitor was left on a
        // signed-out page holding a link that had visibly done nothing,
        // with no way to tell a sign-in had been in flight at all.
        if (!email) { renderLinkReturn(href); return; }
        finishEmailLink(email, href);
      } catch (e) {}
    });
  }

  function doPasswordReset() {
    setErr('');
    setStatus('');
    var c = home();
    var input = c && c.querySelector('#daEmail');
    var email = (input && input.value || '').trim();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { setErr('Enter your email first.'); return; }
    var btn = c.querySelector('#daForgot');
    btn.disabled = true;
    btn.textContent = 'Sending…';
    bootstrap(function () {
      try {
        auth = firebase.auth();
        if (auth.useDeviceLanguage) auth.useDeviceLanguage();
        auth.sendPasswordResetEmail(email).then(function () {
          btn.disabled = false;
          btn.textContent = 'Forgot password?';
          setStatus('If an account exists for that email, a reset link is on the way.');
          track('password_reset_requested', { method: 'email' });
        }).catch(function (err) {
          btn.disabled = false;
          btn.textContent = 'Forgot password?';
          if (err && err.code === 'auth/user-not-found') {
            setStatus('If an account exists for that email, a reset link is on the way.');
          } else {
            setErr(emailAuthMessage(err, 'signin'));
          }
        });
      } catch (e) {
        btn.disabled = false;
        btn.textContent = 'Forgot password?';
        setErr('Could not send a reset link. Try again.');
      }
    });
  }

  function openAuthModal(mode, opts) {
    // A caller asking for 'signup' is saying "this person needs an
    // account", not "this person is new", and almost every one of them
    // passes it blind. A device that has signed in before is evidence
    // the caller does not have, so it wins: the card drops the Name
    // field rather than asking a returning debater to introduce
    // themselves again. Only the outermost open is corrected; the
    // password door's own create/sign-in toggle re-renders directly and
    // must be able to reach 'signup'.
    if (mode === 'signup' && lastMethod()) mode = 'signin';
    onDone = (opts && typeof opts.onDone === 'function') ? opts.onDone : null;
    // A gated link can finish the action that opened the chooser. Only a
    // same-origin path is accepted, so a caller cannot turn sign-in into an
    // open redirect. Email links inherit this path as their continue URL.
    destinationOverride = safeDestination(opts && opts.destination);
    locked = !!(opts && opts.locked);
    googleOnly = !!(opts && opts.googleOnly);
    liveVideo = !!(opts && opts.liveVideo) && !googleOnly;
    lockCopy = (opts && (opts.headline || opts.sub || opts.livePerson))
      ? { headline: opts.headline || '', sub: opts.sub || '', livePerson: !!opts.livePerson }
      : null;
    injectStyles();
    if (!modal) {
      modal = el('<div id="ditAuth" role="dialog" aria-modal="true" aria-label="Sign in"><div class="da-card" id="ditAuthCard"></div></div>');
      document.body.appendChild(modal);
      modal.addEventListener('click', function (event) { if (event.target === modal) close(); });
      document.addEventListener('keydown', function (event) {
        if (event.key === 'Escape' && modal.classList.contains('on')) close();
        if (event.key === 'Tab' && modal.classList.contains('on')) {
          var controls = Array.prototype.filter.call(modal.querySelectorAll('button, a[href], input, [tabindex="0"]'), function (control) {
            return !control.disabled && control.getClientRects().length;
          });
          var first = controls[0], last = controls[controls.length - 1];
          if (!first) return;
          if (event.shiftKey && (document.activeElement === first || !modal.contains(document.activeElement))) {
            event.preventDefault(); last.focus();
          } else if (!event.shiftKey && (document.activeElement === last || !modal.contains(document.activeElement))) {
            event.preventDefault(); first.focus();
          }
        }
      });
    }
    lastFocus = document.activeElement;
    // opts.emailMode lets a caller pin which email door leads, for the
    // cases where the default would be actively wrong: a failed link
    // must not land on a password form.
    renderChooser(mode, opts && opts.emailMode);
    modal.classList.add('on');
    document.body.classList.add('signin-modal-open');
    try { document.documentElement.classList.toggle('da-auth-locked', locked); } catch (e) {}
    // Retract Google One Tap if it's showing (signup-nudge.js listens);
    // two account choosers at once reads as broken.
    try { window.dispatchEvent(new CustomEvent('debatable:authmodal-open')); } catch (e) {}
    var closeButton = modal.querySelector('.da-x') || modal.querySelector('#daG') || modal.querySelector('#daEmail');
    if (closeButton) closeButton.focus();
  }
  window.openAuthModal = openAuthModal;

  window.hasDebatableAccount = function () {
    try { var u = firebase.auth().currentUser; return !!(u && !u.isAnonymous); }
    catch (e) { return false; }
  };
  window.closeDebatableSigninWall = function () {
    // Firebase publishes auth before the popup promise resolves. Let the
    // normal completion consume onDone first, or it falls through to a reload.
    setTimeout(function () {
      if (locked && window.hasDebatableAccount()) handOff('restored');
    }, 0);
  };

  // Keep the initiating page and its topic/side choices alive through OAuth.
  // Wait for Firebase's first answer so restored accounts never see a gate.
  var accountRequestPending = false;
  window.requireDebatableAccount = function (opts) {
    opts = opts || {};
    if (accountRequestPending) return;
    accountRequestPending = true;
    function done(user) {
      accountRequestPending = false;
      if (typeof opts.onDone === 'function') opts.onDone(user);
    }
    bootstrap(function () {
      var settled = false, unsubscribe = null;
      function decide(user) {
        if (settled) return;
        settled = true;
        if (unsubscribe) unsubscribe();
        if (user && !user.isAnonymous) { done(user); return; }
        track('ai_signin_required', { path: location.pathname, source: opts.source || 'ai_start' });
        openAuthModal('signup', {
          googleOnly: !window.__DB_NATIVE,
          headline: 'Sign in to debate the AI',
          sub: 'Save your rounds, scores and progress with a free account.',
          onDone: function (u) {
            if (u && !u.isAnonymous) track('ai_signin_converted', { path: location.pathname, source: opts.source || 'ai_start' });
            done(u && !u.isAnonymous ? u : null);
          }
        });
      }
      try {
        unsubscribe = firebase.auth().onAuthStateChanged(decide);
        if (settled && unsubscribe) unsubscribe();
      } catch (e) { decide(null); }
      setTimeout(function () { decide(null); }, 3000);
    });
  };

  // Someone arriving through an emailed link has already done the work;
  // finish it without making them open the modal and ask again.
  completeEmailLink();
})();
