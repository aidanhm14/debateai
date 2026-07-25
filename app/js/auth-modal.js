// ──────────────────────────────────────────────────────────────────
// auth-modal.js — shared sign-in helper for Debatable.
//
// Web offers email/password and Google. The native app adds Apple, then
// exchanges every provider credential into the same Firebase web session
// used by the live site.
//
// Open it from anywhere with window.openAuthModal(). Self-bootstraps
// Firebase (shared script ids with notifications.js so nothing double-loads).
//
// Firebase providers: email/password + Google on web; Apple is also shown
// in the iOS shell to satisfy App Store login-choice rules.
// ──────────────────────────────────────────────────────────────────
(function () {
  'use strict';
  if (window.__ditAuthModal) return;
  window.__ditAuthModal = true;

  var APP_SDK = 'https://www.gstatic.com/firebasejs/10.5.0/firebase-app-compat.js';
  var AUTH_SDK = 'https://www.gstatic.com/firebasejs/10.5.0/firebase-auth-compat.js';
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
  function injectStyles() {
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
      '#ditAuth{position:fixed;inset:0;z-index:2147483600;display:none;align-items:center;justify-content:center;padding:16px;background:' + veil + ';backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;font-size:16px;line-height:1.4;-webkit-font-smoothing:antialiased}' +
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
      '#ditAuth .da-btn--primary{background:#ef4444;color:#fff;border-color:#ef4444}' +
      '#ditAuth .da-btn--primary:hover{background:#dc2626;border-color:#dc2626}' +
      '#ditAuth .da-btn--hero{min-height:54px;padding:14px 16px;font-size:17px;font-weight:800;box-shadow:0 10px 28px rgba(0,0,0,.08)}' +
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
  function el(html) { var d = document.createElement('div'); d.innerHTML = html; return d.firstElementChild; }
  function close() {
    if (modal) modal.classList.remove('on');
    document.body.classList.remove('signin-modal-open');
    if (lastFocus && lastFocus.focus) {
      try { lastFocus.focus(); } catch (e) {}
    }
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

  function renderChooser(mode) {
    var c = home(); if (!c) return;
    mode = mode === 'signin' ? 'signin' : 'signup';
    var creating = mode === 'signup';
    var nativeButtons = window.__DB_NATIVE ?
      '<button type="button" class="da-btn da-btn--apple da-btn--hero" id="daApple">' + APPLE_SVG + 'Continue with Apple</button>' : '';
    c.innerHTML =
      '<button class="da-x" aria-label="Close">×</button>' +
      '<h2>' + (creating ? 'Create your account' : 'Welcome back') + '</h2>' +
      '<p class="da-sub">' + (creating ? 'Save your rounds, ballots, and style profile across devices.' : 'Sign in to pick up your rounds, rank, and style profile.') + '</p>' +
      nativeButtons +
      '<button type="button" class="da-btn da-btn--google da-btn--hero" id="daG">' + GOOGLE_SVG + 'Continue with Google</button>' +
      '<div class="da-or">or use email</div>' +
      '<form class="da-form" id="daEmailForm" data-mode="' + mode + '" novalidate>' +
        (creating ? '<label class="da-label" for="daName">Name</label><input class="da-input" id="daName" type="text" autocomplete="name" maxlength="60" placeholder="Your name" />' : '') +
        '<label class="da-label" for="daEmail">Email</label>' +
        '<input class="da-input" id="daEmail" type="email" inputmode="email" autocomplete="email" placeholder="you@email.com" />' +
        '<label class="da-label" for="daPassword">Password</label>' +
        '<input class="da-input" id="daPassword" type="password" autocomplete="' + (creating ? 'new-password' : 'current-password') + '" placeholder="' + (creating ? '8 characters minimum' : 'Your password') + '" />' +
        '<div class="da-form-meta">' +
          '<span>' + (creating ? 'Use at least 8 characters.' : '') + '</span>' +
          (creating ? '' : '<button type="button" class="da-link" id="daForgot">Forgot password?</button>') +
        '</div>' +
        '<button type="submit" class="da-btn da-btn--primary" id="daEmailBtn">' + (creating ? 'Create account' : 'Sign in with email') + '</button>' +
      '</form>' +
      '<div class="da-status" role="status"></div>' +
      '<div class="da-err" role="alert"></div>' +
      '<p class="da-switch">' + (creating ? 'Already have an account? ' : 'New to Debatable? ') +
        '<button type="button" class="da-link" id="daModeSwitch">' + (creating ? 'Sign in' : 'Create an account') + '</button></p>' +
      '<p class="da-note">Private. I never sell your data or post for you. Sign out anytime.</p>';
    c.querySelector('.da-x').addEventListener('click', close);
    if (c.querySelector('#daApple')) c.querySelector('#daApple').addEventListener('click', doAppleSignIn);
    c.querySelector('#daG').addEventListener('click', doGoogle);
    c.querySelector('#daEmailForm').addEventListener('submit', doEmailPassword);
    c.querySelector('#daModeSwitch').addEventListener('click', function () { renderChooser(creating ? 'signin' : 'signup'); });
    if (c.querySelector('#daForgot')) c.querySelector('#daForgot').addEventListener('click', doPasswordReset);
  }

  function nativeAuthPlugin() {
    try {
      return window.__DB_NATIVE && window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.FirebaseAuthentication;
    } catch (e) { return null; }
  }

  function finishSignIn(method) {
    try { localStorage.setItem('debateos-feedback-given', '1'); } catch (e) {}
    track('sign_in_complete', { method: method });
    window.location.href = window.__DB_NATIVE ? '/native' : destination();
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
            setErr('Google sign-in failed. Try again.');
          });
          return;
        }
        var provider = new firebase.auth.GoogleAuthProvider();
        provider.setCustomParameters({ prompt: 'select_account' });
        track('sign_in_start', { method: 'google' });
        var t0 = Date.now();
        auth = firebase.auth();
        var current = auth.currentUser;
        var attempt = current && current.isAnonymous && current.linkWithPopup
          ? current.linkWithPopup(provider).catch(function (err) {
              var code = (err && err.code) || '';
              if (code === 'auth/credential-already-in-use' || code === 'auth/email-already-in-use') {
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
            var redirect = current && current.isAnonymous && current.linkWithRedirect
              ? current.linkWithRedirect(provider)
              : auth.signInWithRedirect(provider);
            Promise.resolve(redirect).catch(function () { setErr('Google sign-in failed. Try again.'); });
          } catch (e) { setErr('Google sign-in failed. Try again.'); }
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
        auth.signInWithPopup(provider).then(function () {
          try { localStorage.setItem('debateos-feedback-given', '1'); } catch (e) {}
          track('sign_in_complete', { method: 'apple' });
          window.location.href = destination();
        }).catch(function (err) {
          var code = (err && err.code) || 'unknown';
          if (code === 'auth/popup-closed-by-user' && (Date.now() - t0) > 1200) return;
          try { auth.signInWithRedirect(provider); } catch (e) { setErr('Apple sign-in failed: ' + code); }
        });
      } catch (e) { setErr('Apple sign-in unavailable, try again.'); }
    });
  }
  window.dbAppleSignIn = doAppleSignIn;

  function emailAuthMessage(err, mode) {
    var code = (err && err.code) || '';
    if (code === 'auth/email-already-in-use') return 'That email already has an account. Sign in instead.';
    if (code === 'auth/invalid-email') return 'Enter a valid email.';
    if (code === 'auth/weak-password') return 'Use a stronger password with at least 8 characters.';
    if (code === 'auth/invalid-credential' || code === 'auth/wrong-password' || code === 'auth/user-not-found') return 'Email or password is incorrect.';
    if (code === 'auth/too-many-requests') return 'Too many attempts. Wait a few minutes and try again.';
    if (code === 'auth/network-request-failed') return 'Could not reach sign-in. Check your connection and try again.';
    if (code === 'auth/operation-not-allowed') return 'Email sign-in is temporarily unavailable. Continue with Google.';
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
        var attempt;
        if (mode === 'signup') {
          var current = auth.currentUser;
          var credential = firebase.auth.EmailAuthProvider.credential(email, password);
          attempt = current && current.isAnonymous && current.linkWithCredential
            ? current.linkWithCredential(credential)
            : auth.createUserWithEmailAndPassword(email, password);
        } else {
          attempt = auth.signInWithEmailAndPassword(email, password);
        }
        attempt.then(function (result) {
          var user = result && result.user;
          if (mode === 'signup' && user && user.updateProfile) {
            return user.updateProfile({ displayName: name }).then(function () { return user; });
          }
          return user;
        }).then(function (user) {
          if (mode === 'signup' && user && user.sendEmailVerification) {
            user.sendEmailVerification().catch(function () {});
          }
          finishSignIn(mode === 'signup' ? 'email_password_signup' : 'email_password_signin');
        }).catch(function (err) {
          btn.disabled = false;
          btn.textContent = mode === 'signup' ? 'Create account' : 'Sign in with email';
          setErr(emailAuthMessage(err, mode));
        });
      } catch (e) {
        btn.disabled = false;
        btn.textContent = mode === 'signup' ? 'Create account' : 'Sign in with email';
        setErr('Email sign-in is unavailable. Continue with Google.');
      }
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

  function openAuthModal(mode) {
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
    var closeButton = modal.querySelector('.da-x');
    if (closeButton) closeButton.focus();
  }
  window.openAuthModal = openAuthModal;
})();
