// ──────────────────────────────────────────────────────────────────
// auth-modal.js — shared sign-in helper for Debatable.
//
// Web offers Google, an emailed sign-in link, and email/password. The
// native app adds Apple, then exchanges every provider credential into
// the same Firebase web session used by the live site.
//
// Open it from anywhere with window.openAuthModal(). Self-bootstraps
// Firebase (shared script ids with notifications.js so nothing double-loads).
//
// Firebase providers: Google, email link (passwordless), and
// email/password on web; Apple is also shown in the iOS shell to satisfy
// App Store login-choice rules.
//
// The emailed link is the lowest-friction path and the default for
// someone creating an account: no password to invent, and nothing to
// remember on the next visit. Password sign-in stays first for people
// who already have one, since that is what they will reach for.
// Completing a link is handled on load by completeEmailLink() below,
// which runs on every page topbar.js touches.
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
  function destination() {
    return window.location.pathname + window.location.search + window.location.hash;
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
      '#ditAuth.on{display:flex}' +
      '#ditAuth .da-card{background:' + card + ';color:' + ink + ';width:min(408px,100%);max-height:calc(100vh - 32px);max-height:min(720px,calc(100dvh - 32px));overflow:auto;border:1px solid ' + line + ';border-radius:22px;padding:30px 26px 22px;box-shadow:0 24px 80px rgba(0,0,0,.38);position:relative}' +
      '#ditAuth .da-card::before{content:"";position:absolute;top:0;left:0;right:0;height:4px;background:#ef4444}' +
      '#ditAuth .da-x{position:absolute;top:12px;right:12px;display:flex;align-items:center;justify-content:center;width:32px;height:32px;border:0;background:transparent;color:' + sub + ';font-size:22px;line-height:1;cursor:pointer;border-radius:10px;transition:background .16s ease,color .16s ease}' +
      '#ditAuth .da-x:hover{background:' + field + ';color:' + ink + '}' +
      '#ditAuth h2{font-size:26px;line-height:1.08;font-weight:800;margin:0 34px 8px 0;letter-spacing:0}' +
      '#ditAuth .da-sub{font-size:15px;color:' + sub + ';margin:0 0 20px;line-height:1.5;max-width:32ch}' +
      '#ditAuth .da-btn{display:flex;align-items:center;justify-content:center;gap:10px;width:100%;min-height:48px;padding:12px 14px;border-radius:13px;font-weight:700;font-size:15px;cursor:pointer;border:1px solid ' + line + ';background:' + field + ';color:' + ink + ';font-family:inherit;margin-top:10px;transition:transform .16s ease,box-shadow .16s ease,border-color .16s ease,background .16s ease}' +
      '#ditAuth .da-btn:hover{border-color:' + hover + ';box-shadow:0 8px 22px rgba(0,0,0,.08);transform:translateY(-1px)}' +
      '#ditAuth .da-btn:disabled{opacity:.62;cursor:wait;transform:none;box-shadow:none}' +
      '#ditAuth .da-btn--google{background:#fff;color:#16130f;border-color:rgba(0,0,0,.14)}' +
      '#ditAuth .da-btn--apple{background:#050505;color:#fff;border-color:#050505}' +
      '#ditAuth .da-btn--apple:hover{background:#1b1b1b;border-color:#1b1b1b}' +
      '#ditAuth .da-btn--primary{background:#b91c1c;color:#fff;border-color:#ef4444}' +
      '#ditAuth .da-btn--primary:hover{background:#dc2626;border-color:#dc2626}' +
      '#ditAuth .da-btn--hero{min-height:54px;padding:14px 16px;font-size:17px;font-weight:800;box-shadow:0 10px 28px rgba(0,0,0,.08)}' +
      /* Warning, not decoration: amber is the state colour per the
         2026-05-19 brand rule, red is reserved for actions. */
      '#ditAuth .da-inapp{font-size:13.5px;line-height:1.5;margin:0 0 14px;padding:10px 12px;border-radius:10px;border:1px solid rgba(245,158,11,.38);background:rgba(245,158,11,.10);color:' + sub + '}' +
      '#ditAuth .da-or{display:flex;align-items:center;gap:10px;margin:14px 0 6px;color:' + sub + ';font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase}' +
      '#ditAuth .da-or::before,#ditAuth .da-or::after{content:"";flex:1;height:1px;background:' + line + '}' +
      '#ditAuth .da-form{margin-top:8px}' +
      '#ditAuth .da-label{display:block;margin-top:11px;color:' + ink + ';font-size:13px;font-weight:750}' +
      '#ditAuth .da-input{width:100%;min-height:48px;padding:12px 14px;border-radius:13px;border:1px solid ' + line + ';background:' + field + ';color:' + ink + ';font:inherit;font-size:16px;margin-top:6px}' +
      '#ditAuth .da-input::placeholder{color:' + sub + '}' +
      '#ditAuth .da-input:focus{outline:none;border-color:#ef4444;box-shadow:0 0 0 4px ' + focus + '}' +
      '#ditAuth .da-form-meta{display:flex;align-items:center;justify-content:space-between;gap:12px;margin:8px 2px 0;color:' + sub + ';font-size:12px;line-height:1.4}' +
      '#ditAuth .da-link{padding:0;border:0;background:transparent;color:#dc2626;font:inherit;font-weight:750;cursor:pointer;text-decoration:underline;text-underline-offset:3px}' +
      '#ditAuth .da-switch{margin:16px 0 0;text-align:center;color:' + sub + ';font-size:13px}' +
      '#ditAuth .da-status{font-size:13px;font-weight:700;color:#15803d;margin:10px 4px 0;text-align:center;line-height:1.35}' +
      '#ditAuth .da-status:empty{display:none}' +
      '#ditAuth .da-note{font-size:13px;color:' + sub + ';margin:14px 4px 0;line-height:1.45;text-align:center}' +
      '#ditAuth .da-err{font-size:13px;font-weight:700;color:#ef4444;margin:10px 4px 0;text-align:center;line-height:1.35}' +
      '#ditAuth .da-err:empty{display:none}' +
      '#ditAuth svg{width:20px;height:20px;flex:none}' +
      '@media (max-width:380px){#ditAuth{padding:10px}#ditAuth .da-card{padding:26px 20px 20px;border-radius:18px}#ditAuth h2{font-size:24px}#ditAuth .da-btn--hero{font-size:16px}}';
    document.head.appendChild(s);
  }

  var modal = null, auth = null, lastFocus = null;
  // Set by openAuthModal(mode, {onDone}); consumed once by handOff().
  var onDone = null;
  function el(html) { var d = document.createElement('div'); d.innerHTML = html; return d.firstElementChild; }
  function close() {
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
  // forever. Email and password works perfectly in these webviews; it just
  // sat below the fold under two buttons that could not work.
  // "Try again" is the wrong instruction when the thing cannot succeed on
  // this browser however many times it is tried.
  function providerFailMsg() {
    return isInAppBrowser()
      ? 'This app\'s browser blocks Google sign-in. Use your email below, or open the site in Safari or Chrome.'
      : 'Google sign-in failed. Try again.';
  }

  function isInAppBrowser() {
    try {
      var ua = navigator.userAgent || '';
      // FBAN/FBAV = Facebook, Instagram ships "Instagram" in the UA,
      // Line/MicroMessenger/Snapchat/LinkedIn/Threads/TikTok all self-identify.
      if (/FBAN|FBAV|FB_IAB|Instagram|Threads|TikTok|musical_ly|Snapchat|LinkedInApp|Line\/|MicroMessenger|Twitter/i.test(ua)) return true;
      // iOS webviews that do not self-identify: Safari's UA without "Safari".
      if (/iPhone|iPad|iPod/i.test(ua) && !/Safari/i.test(ua) && !/CriOS|FxiOS/i.test(ua)) return true;
      return false;
    } catch (e) { return false; }
  }

  var GOOGLE_SVG = '<svg viewBox="0 0 48 48" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3 0 5.8 1.1 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.2-.1-2.3-.4-3.5z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 16 19 13 24 13c3 0 5.8 1.1 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.3 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.3-2.2 4.3-4.1 5.7l6.2 5.2C41.9 35 44 29.8 44 24c0-1.2-.1-2.3-.4-3.5z"/></svg>';

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

  function renderChooser(mode, forceEmailMode) {
    var c = home(); if (!c) return;
    // No explicit mode: someone who has signed in on this device before
    // lands on sign-in, not "Create your account".
    if (mode !== 'signin' && mode !== 'signup') mode = lastMethod() ? 'signin' : 'signup';
    var creating = mode === 'signup';
    var last = lastMethod();
    // Which email path leads. Creating an account defaults to the emailed
    // link: a password is a thing to invent now and remember later, and
    // that is the barrier this is here to remove. Signing in defaults to
    // the password form, because someone who set one will reach for it,
    // unless the last thing that worked on this device was a link.
    var emailMode = forceEmailMode === 'link' || forceEmailMode === 'password'
      ? forceEmailMode
      : (creating || last === 'emaillink') ? 'link' : 'password';
    var linkMode = emailMode === 'link';
    var lastHint = !creating && last
      ? '<p class="da-note" style="margin:0 0 14px;text-align:left">Last time you signed in with ' +
        (last === 'google' ? 'Google' : last === 'apple' ? 'Apple' :
         last === 'emaillink' ? 'an emailed link' : 'an email and password') + '.</p>'
      : '';
    // Apple is offered on web too as of 2026-08-18: the Services ID
    // (com.debateai.debateit.web) + return URL were registered in the
    // Apple Developer portal and wired into the Firebase provider, so
    // the web popup flow works. Native keeps its plugin path in
    // doAppleSignIn; the __DB_NATIVE gate only decided visibility.
    var nativeButtons =
      '<button type="button" class="da-btn da-btn--apple da-btn--hero" id="daApple">' + APPLE_SVG + 'Continue with Apple</button>';
    // See isInAppBrowser(). Google and Apple are still rendered rather than
    // hidden, because the detector is a user-agent guess and hiding the
    // button a user was looking for is worse than showing one that warns.
    var inApp = isInAppBrowser();
    var inAppNote = inApp
      ? '<p class="da-inapp">Google and Apple sign-in do not work inside this app\'s browser. Use your email below, or open the site in Safari or Chrome.</p>'
      : '';
    c.innerHTML =
      '<button class="da-x" aria-label="Close">×</button>' +
      '<h2>' + (creating ? 'Create your account' : 'Welcome back') + '</h2>' +
      '<p class="da-sub">' + (creating ? 'Save your rounds, ballots, and style profile across devices.' : 'Sign in to pick up your rounds, rank, and style profile.') + '</p>' +
      lastHint +
      inAppNote +
      nativeButtons +
      '<button type="button" class="da-btn da-btn--google da-btn--hero" id="daG">' + GOOGLE_SVG + 'Continue with Google</button>' +
      '<div class="da-or">or use email</div>' +
      '<form class="da-form" id="daEmailForm" data-mode="' + mode + '" data-email-mode="' + emailMode + '" novalidate>' +
        (creating ? '<label class="da-label" for="daName">Name</label><input class="da-input" id="daName" type="text" autocomplete="name" maxlength="60" placeholder="Your name" />' : '') +
        '<label class="da-label" for="daEmail">Email</label>' +
        '<input class="da-input" id="daEmail" type="email" inputmode="email" autocomplete="email" placeholder="you@email.com" />' +
        (linkMode ? '' :
          '<label class="da-label" for="daPassword">Password</label>' +
          '<input class="da-input" id="daPassword" type="password" autocomplete="' + (creating ? 'new-password' : 'current-password') + '" placeholder="' + (creating ? '8 characters minimum' : 'Your password') + '" />') +
        '<div class="da-form-meta">' +
          '<span>' + (linkMode ? 'No password needed.' : creating ? 'Use at least 8 characters.' : '') + '</span>' +
          (linkMode || creating ? '' : '<button type="button" class="da-link" id="daForgot">Forgot password?</button>') +
        '</div>' +
        '<button type="submit" class="da-btn da-btn--primary" id="daEmailBtn">' +
          (linkMode ? 'Email me a sign-in link' : creating ? 'Create account' : 'Sign in with email') + '</button>' +
        '<p class="da-switch" style="margin-top:11px">' +
          '<button type="button" class="da-link" id="daEmailModeSwitch">' +
            (linkMode ? 'Use a password instead' : 'Email me a link instead') + '</button></p>' +
      '</form>' +
      '<div class="da-status" role="status"></div>' +
      '<div class="da-err" role="alert"></div>' +
      '<p class="da-switch">' + (creating ? 'Already have an account? ' : 'New to Debatable? ') +
        '<button type="button" class="da-link" id="daModeSwitch">' + (creating ? 'Sign in' : 'Create an account') + '</button></p>' +
      '<p class="da-note">Private. I never sell your data or post for you. Sign out anytime.</p>';
    c.querySelector('.da-x').addEventListener('click', close);
    if (c.querySelector('#daApple')) c.querySelector('#daApple').addEventListener('click', doAppleSignIn);
    c.querySelector('#daG').addEventListener('click', doGoogle);
    c.querySelector('#daEmailForm').addEventListener('submit', linkMode ? doEmailLink : doEmailPassword);
    c.querySelector('#daModeSwitch').addEventListener('click', function () { renderChooser(creating ? 'signin' : 'signup'); });
    c.querySelector('#daEmailModeSwitch').addEventListener('click', function () {
      // Carry a typed address across the switch. Retyping it because you
      // changed your mind about passwords is the kind of small tax that
      // loses people at the last step.
      var typed = (c.querySelector('#daEmail') || {}).value || '';
      renderChooser(mode, linkMode ? 'password' : 'link');
      var next = home() && home().querySelector('#daEmail');
      if (next && typed) next.value = typed;
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
    if (handOff(method)) return;
    window.location.href = window.__DB_NATIVE ? '/native' : destination();
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
    close();
    try {
      cb((firebase.auth && firebase.auth().currentUser) || null, method);
    } catch (e) {}
    return true;
  }

  function doGoogle() {
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

  function emailAuthMessage(err, mode) {
    var code = (err && err.code) || '';
    if (code === 'auth/email-already-in-use' || code === 'auth/credential-already-in-use') return 'That email already has an account. Check the password, or use Sign in.';
    if (code === 'auth/user-disabled') return 'That account is disabled. Contact support.';
    if (code === 'auth/invalid-email') return 'Enter a valid email.';
    if (code === 'auth/weak-password') return 'Use a stronger password with at least 8 characters.';
    if (code === 'auth/invalid-credential' || code === 'auth/wrong-password' || code === 'auth/user-not-found') return 'Email or password is incorrect.';
    if (code === 'auth/too-many-requests') return 'Too many attempts. Wait a few minutes and try again.';
    if (code === 'auth/network-request-failed') return 'Could not reach sign-in. Check your connection and try again.';
    if (code === 'auth/operation-not-allowed') return isInAppBrowser() ? 'Email sign-in is temporarily unavailable. Open the site in Safari or Chrome and try Google.' : 'Email sign-in is temporarily unavailable. Continue with Google.';
    return mode === 'signup' ? 'Could not create the account. Try again.' : 'Could not sign in. Try again.';
  }

  function doEmailPassword(event) {
    if (event) event.preventDefault();
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
        var attempt, reused = false;
        if (mode === 'signup') {
          var current = auth.currentUser;
          var credential = firebase.auth.EmailAuthProvider.credential(email, password);
          // Nearly every visitor is already an anonymous Firebase user
          // (notifications.js signs them in on page load), so the normal
          // signup path is a link, not a create. When the email already
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
        attempt.then(function (result) {
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

  function doEmailLink(event) {
    if (event) event.preventDefault();
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
    bootstrap(function () {
      try {
        auth = firebase.auth();
        if (auth.useDeviceLanguage) auth.useDeviceLanguage();
        track('sign_in_start', { method: 'email_link', action: mode });
        auth.sendSignInLinkToEmail(email, emailLinkSettings()).then(function () {
          // Stashed so the return trip does not have to ask again. Same
          // browser is the common case; completeEmailLink() prompts when
          // the link is opened somewhere else.
          try {
            localStorage.setItem(LINK_EMAIL_KEY, email);
            if (name) localStorage.setItem(LINK_NAME_KEY, name);
          } catch (e) {}
          btn.disabled = false;
          btn.textContent = 'Send it again';
          setStatus('Link sent to ' + email + '. Open it on this device and you are in.');
          track('email_link_sent', { action: mode });
        }).catch(function (err) {
          btn.disabled = false;
          btn.textContent = 'Email me a sign-in link';
          setErr(emailLinkMessage(err));
        });
      } catch (e) {
        btn.disabled = false;
        btn.textContent = 'Email me a sign-in link';
        setErr(isInAppBrowser() ? 'Could not send the link. Try a password instead.' : 'Could not send the link. Continue with Google or a password.');
      }
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
        if (!email) {
          email = (window.prompt('Confirm the email this link was sent to') || '').trim();
          if (!email) return;
        }
        var name = '';
        try { name = localStorage.getItem(LINK_NAME_KEY) || ''; } catch (e) {}

        // Same shape as the Google path: notifications.js signs nearly
        // every visitor in anonymously, so currentUser is usually a
        // truthy anonymous user. Link that account when it is free to
        // link, and fall back to a plain sign-in when the email already
        // owns an account, rather than failing the whole trip.
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

        attempt.then(function (result) {
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
          openAuthModal('signin');
          setErr(code === 'auth/invalid-action-code'
            ? 'That sign-in link has expired or was already used. Send a fresh one.'
            : code === 'auth/invalid-email'
              ? 'That email does not match the link. Try again.'
              : 'Could not finish signing you in. Send a fresh link.');
        });
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
    onDone = (opts && typeof opts.onDone === 'function') ? opts.onDone : null;
    injectStyles();
    if (!modal) {
      modal = el('<div id="ditAuth" role="dialog" aria-modal="true" aria-label="Sign in"><div class="da-card" id="ditAuthCard"></div></div>');
      document.body.appendChild(modal);
      modal.addEventListener('click', function (event) { if (event.target === modal) close(); });
      document.addEventListener('keydown', function (event) {
        if (event.key === 'Escape' && modal.classList.contains('on')) close();
      });
    }
    lastFocus = document.activeElement;
    renderChooser(mode);
    modal.classList.add('on');
    document.body.classList.add('signin-modal-open');
    // Retract Google One Tap if it's showing (signup-nudge.js listens);
    // two account choosers at once reads as broken.
    try { window.dispatchEvent(new CustomEvent('debatable:authmodal-open')); } catch (e) {}
    var closeButton = modal.querySelector('.da-x');
    if (closeButton) closeButton.focus();
  }
  window.openAuthModal = openAuthModal;

  // Someone arriving through an emailed link has already done the work;
  // finish it without making them open the modal and ask again.
  completeEmailLink();
})();
