// ──────────────────────────────────────────────────────────────────
// auth-modal.js — shared sign-in helper for DebateIt.
//
// Google is the only normal sign-in provider. This file keeps the older
// window.openAuthModal() entry point alive for site-wide callers, but that
// entry point now starts Google directly instead of showing a second chooser.
//
// Open it from anywhere with window.openAuthModal(). Self-bootstraps
// firebase (shared script ids with notifications.js so nothing double-
// loads) and completes the email-link flow automatically on page load.
//
// Firebase provider: Google.
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
  var EMAIL_KEY = 'dit-emaillink-addr';
  var DEST = '/app#chat';

  function loadOnce(id, src, cb) {
    var ex = document.getElementById(id);
    if (ex) { if (ex.dataset.loaded) cb(); else ex.addEventListener('load', cb, { once: true }); return; }
    var s = document.createElement('script'); s.id = id; s.src = src;
    s.addEventListener('load', function () { s.dataset.loaded = '1'; cb(); }, { once: true });
    s.addEventListener('error', function () {});
    document.head.appendChild(s);
  }
  function ensureApp() { try { if (window.firebase && firebase.auth && (!firebase.apps || !firebase.apps.length)) firebase.initializeApp(CONFIG); } catch (e) {} }
  function ready() { return !!(window.firebase && window.firebase.auth && window.firebase.apps && window.firebase.apps.length); }
  function bootstrap(cb) {
    if (ready()) { cb(); return; }
    loadOnce('da-fb-app', APP_SDK, function () { loadOnce('da-fb-auth', AUTH_SDK, function () { ensureApp(); cb(); }); });
  }
  function track(ev, meta) { try { if (window.gtag) gtag('event', ev, meta || {}); } catch (e) {} }

  // ── Complete an email-link sign-in if we arrived from one ──────────
  function maybeCompleteEmailLink() {
    // Cheap URL check first so normal page loads never pull firebase —
    // only an actual email-link arrival (mode=signIn + oobCode) does.
    var h = window.location.href;
    if (h.indexOf('oobCode=') < 0 || h.indexOf('mode=signIn') < 0) return;
    bootstrap(function () {
      try {
        var auth = firebase.auth();
        if (!auth.isSignInWithEmailLink || !auth.isSignInWithEmailLink(window.location.href)) return;
        var email = '';
        try { email = localStorage.getItem(EMAIL_KEY) || ''; } catch (e) {}
        if (!email) email = window.prompt('Confirm the email you used to finish signing in:') || '';
        if (!email) return;
        auth.signInWithEmailLink(email, window.location.href).then(function () {
          try { localStorage.removeItem(EMAIL_KEY); localStorage.setItem('debateos-feedback-given', '1'); } catch (e) {}
          track('sign_in_complete', { method: 'email_link' });
          window.location.href = DEST;
        }).catch(function (e) { console.warn('[auth] email-link complete failed', e && e.code); });
      } catch (e) {}
    });
  }

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
      '#ditAuth .da-btn--primary{background:#ef4444;color:#fff;border-color:#ef4444}' +
      '#ditAuth .da-btn--primary:hover{background:#dc2626;border-color:#dc2626}' +
      '#ditAuth .da-btn--hero{min-height:54px;padding:14px 16px;font-size:17px;font-weight:800;box-shadow:0 10px 28px rgba(0,0,0,.08)}' +
      '#ditAuth .da-more-toggle{display:flex;align-items:center;justify-content:center;width:100%;min-height:38px;margin:14px 0 0;padding:8px 12px;background:' + field + ';border:1px solid ' + line + ';border-radius:999px;color:' + ink + ';font-size:13px;font-weight:700;cursor:pointer;font-family:inherit;transition:border-color .16s ease,background .16s ease,color .16s ease}' +
      '#ditAuth .da-more-toggle:hover{border-color:' + hover + ';background:' + (dark ? 'rgba(255,255,255,.08)' : 'rgba(0,0,0,.04)') + '}' +
      '#ditAuth .da-more[hidden]{display:none}' +
      '#ditAuth .da-more{padding-top:2px}' +
      '#ditAuth .da-or{display:flex;align-items:center;gap:10px;margin:14px 0 6px;color:' + sub + ';font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase}' +
      '#ditAuth .da-or::before,#ditAuth .da-or::after{content:"";flex:1;height:1px;background:' + line + '}' +
      '#ditAuth .da-input{width:100%;min-height:48px;padding:12px 14px;border-radius:13px;border:1px solid ' + line + ';background:' + field + ';color:' + ink + ';font:inherit;font-size:16px;margin-top:10px}' +
      '#ditAuth .da-input::placeholder{color:' + sub + '}' +
      '#ditAuth .da-input:focus{outline:none;border-color:#ef4444;box-shadow:0 0 0 4px ' + focus + '}' +
      '#ditAuth .da-note{font-size:13px;color:' + sub + ';margin:14px 4px 0;line-height:1.45;text-align:center}' +
      '#ditAuth .da-err{font-size:13px;font-weight:700;color:#ef4444;margin:10px 4px 0;text-align:center;line-height:1.35}' +
      '#ditAuth .da-err:empty{display:none}' +
      '#ditAuth svg{width:20px;height:20px;flex:none}' +
      '@media (max-width:380px){#ditAuth{padding:10px}#ditAuth .da-card{padding:26px 20px 20px;border-radius:18px}#ditAuth h2{font-size:24px}#ditAuth .da-btn--hero{font-size:16px}}';
    document.head.appendChild(s);
  }

  var modal = null, auth = null;
  function el(html) { var d = document.createElement('div'); d.innerHTML = html; return d.firstElementChild; }
  function close() { if (modal) modal.classList.remove('on'); }

  var GOOGLE_SVG = '<svg viewBox="0 0 48 48" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3 0 5.8 1.1 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.2-.1-2.3-.4-3.5z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 16 19 13 24 13c3 0 5.8 1.1 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.3 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.3-2.2 4.3-4.1 5.7l6.2 5.2C41.9 35 44 29.8 44 24c0-1.2-.1-2.3-.4-3.5z"/></svg>';

  function home() { return document.getElementById('ditAuthCard'); }
  function setErr(m) { var e = home() && home().querySelector('.da-err'); if (e) e.textContent = m || ''; }

  function renderChooser() {
    var c = home(); if (!c) return;
    try { if (recaptcha && recaptcha.clear) recaptcha.clear(); } catch (e) {}
    recaptcha = null;
    confirmationResult = null;
    c.innerHTML =
      '<button class="da-x" aria-label="Close">×</button>' +
      '<h2>Save your progress</h2>' +
      '<p class="da-sub">Your rounds, ballots, and style profile follow you across devices.</p>' +
      '<button type="button" class="da-btn da-btn--google da-btn--hero" id="daG">' + GOOGLE_SVG + 'Continue with Google</button>' +
      '<button type="button" class="da-more-toggle" id="daMoreToggle" aria-expanded="false" aria-controls="daMore">Use email or phone instead</button>' +
      '<div class="da-more" id="daMore" hidden>' +
        '<div class="da-or">or</div>' +
      '<input class="da-input" id="daEmail" type="email" inputmode="email" autocomplete="email" placeholder="you@email.com" />' +
      '<button type="button" class="da-btn" id="daEmailBtn">Email me a sign-in link</button>' +
      '<input class="da-input" id="daPhone" type="tel" inputmode="tel" autocomplete="tel" placeholder="+1 555 123 4567" />' +
      '<button type="button" class="da-btn" id="daPhoneBtn">Text me a code</button>' +
      '</div>' +
      '<div class="da-err"></div>' +
      '<p class="da-note">Private. I never sell your data or post for you. Sign out anytime.</p>';
    c.querySelector('.da-x').addEventListener('click', close);
    c.querySelector('#daG').addEventListener('click', doGoogle);
    c.querySelector('#daEmailBtn').addEventListener('click', doEmail);
    c.querySelector('#daPhoneBtn').addEventListener('click', doPhone);
    c.querySelector('#daMoreToggle').addEventListener('click', function(){
      var m = c.querySelector('#daMore'), t = c.querySelector('#daMoreToggle');
      if (m) m.hidden = false; if (t) { t.setAttribute('aria-expanded', 'true'); t.style.display = 'none'; }
    });
  }

  function doGoogle() {
    setErr('');
    bootstrap(function () {
      try {
        var provider = new firebase.auth.GoogleAuthProvider();
        provider.setCustomParameters({ prompt: 'select_account' });
        track('sign_in_start', { method: 'google' });
        var t0 = Date.now();
        auth = firebase.auth();
        auth.signInWithPopup(provider).then(function () {
          try { localStorage.setItem('debateos-feedback-given', '1'); } catch (e) {}
          track('sign_in_complete', { method: 'google' });
          window.location.href = DEST;
        }).catch(function (err) {
          var code = (err && err.code) || 'unknown';
          if (code === 'auth/popup-closed-by-user' && (Date.now() - t0) > 1200) return;
          try { auth.signInWithRedirect(provider); } catch (e) { setErr('Sign-in failed: ' + code); }
        });
      } catch (e) { setErr('Sign-in unavailable, try again.'); }
    });
  }

  function doEmail() {
    setErr('');
    var input = home().querySelector('#daEmail');
    var email = (input && input.value || '').trim();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { setErr('Enter a valid email.'); return; }
    var btn = home().querySelector('#daEmailBtn');
    btn.disabled = true; btn.textContent = 'Sending…';
    bootstrap(function () {
      try {
        auth = firebase.auth();
        try { localStorage.setItem(EMAIL_KEY, email); } catch (e) {}
        track('sign_in_start', { method: 'email_link' });
        var settings = { url: window.location.origin + window.location.pathname, handleCodeInApp: true };
        auth.sendSignInLinkToEmail(email, settings).then(function () {
          var c = home();
          c.innerHTML = '<button class="da-x" aria-label="Close">×</button>' +
            '<h2>Check your inbox</h2>' +
            '<p class="da-sub">We sent a sign-in link to <strong>' + email.replace(/[<>&]/g, '') + '</strong>. Open it on this device to finish.</p>' +
            '<button type="button" class="da-btn da-btn--primary" id="daDone">Got it</button>';
          c.querySelector('.da-x').addEventListener('click', close);
          c.querySelector('#daDone').addEventListener('click', close);
        }).catch(function (err) {
          btn.disabled = false; btn.textContent = 'Email me a sign-in link';
          setErr('Could not send link: ' + ((err && err.code) || 'error'));
        });
      } catch (e) { btn.disabled = false; btn.textContent = 'Email me a sign-in link'; setErr('Email sign-in unavailable.'); }
    });
  }

  var confirmationResult = null, recaptcha = null;
  function doPhone() {
    setErr('');
    var input = home().querySelector('#daPhone');
    var phone = (input && input.value || '').replace(/[^\d+]/g, '');
    if (phone.length < 8) { setErr('Enter your phone with country code, e.g. +15551234567'); return; }
    if (phone[0] !== '+') { setErr('Include the country code (start with +).'); return; }
    var btn = home().querySelector('#daPhoneBtn');
    btn.disabled = true; btn.textContent = 'Sending…';
    bootstrap(function () {
      try {
        auth = firebase.auth();
        if (!recaptcha) {
          // invisible reCAPTCHA attached to the phone button (required for web phone auth)
          btn.disabled = false;
          recaptcha = new firebase.auth.RecaptchaVerifier('daPhoneBtn', { size: 'invisible' });
          btn.disabled = true;
        }
        track('sign_in_start', { method: 'phone' });
        auth.signInWithPhoneNumber(phone, recaptcha).then(function (res) {
          confirmationResult = res;
          renderCode(phone);
        }).catch(function (err) {
          btn.disabled = false; btn.textContent = 'Text me a code';
          try { if (recaptcha && recaptcha.clear) recaptcha.clear(); recaptcha = null; } catch (e) {}
          setErr('Could not text a code: ' + ((err && err.code) || 'error'));
        });
      } catch (e) {
        btn.disabled = false; btn.textContent = 'Text me a code';
        try { if (recaptcha && recaptcha.clear) recaptcha.clear(); recaptcha = null; } catch (err) {}
        setErr('Phone sign-in is not available here. Try Google or email.');
      }
    });
  }
  function renderCode(phone) {
    var c = home();
    c.innerHTML = '<button class="da-x" aria-label="Close">×</button>' +
      '<h2>Enter the code</h2>' +
      '<p class="da-sub">We texted a 6-digit code to <strong>' + phone.replace(/[<>&]/g, '') + '</strong>.</p>' +
      '<input class="da-input" id="daCode" inputmode="numeric" autocomplete="one-time-code" maxlength="6" placeholder="123456" />' +
      '<button type="button" class="da-btn da-btn--primary" id="daCodeBtn">Verify + sign in</button>' +
      '<div class="da-err"></div>';
    c.querySelector('.da-x').addEventListener('click', close);
    c.querySelector('#daCodeBtn').addEventListener('click', function () {
      var code = (c.querySelector('#daCode').value || '').trim();
      if (code.length < 6) { setErr('Enter the 6-digit code.'); return; }
      if (!confirmationResult) { setErr('Code expired, start over.'); return; }
      var b = c.querySelector('#daCodeBtn'); b.disabled = true; b.textContent = 'Verifying…';
      confirmationResult.confirm(code).then(function () {
        try { localStorage.setItem('debateos-feedback-given', '1'); } catch (e) {}
        track('sign_in_complete', { method: 'phone' });
        window.location.href = DEST;
      }).catch(function (err) {
        b.disabled = false; b.textContent = 'Verify + sign in';
        setErr('Wrong or expired code: ' + ((err && err.code) || 'error'));
      });
    });
  }

  function openAuthModal() {
    doGoogle();
  }
  window.openAuthModal = openAuthModal;

  // Complete email-link arrivals automatically.
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', maybeCompleteEmailLink);
  else maybeCompleteEmailLink();
})();
