/* ──────────────────────────────────────────────────────────────────
   auth-prompt.js — a timed, dismissible "sign in with Google" popup.

   Fires ~30s after a signed-out visitor lands. It is NOT a blocking
   gate (auth is advised, not required): backdrop-click, Esc, "Not now",
   and × all dismiss it, and it never locks scroll for long. The
   "Continue with Google" button carries the user gesture, so the real
   OAuth popup opens reliably (a bare setTimeout -> signInWithPopup would
   be swallowed by popup blockers with no gesture).

   Gating:
     - signed-out only (skips if a real, non-anonymous user is present)
     - once per browser session (sessionStorage)
     - after a dismissal, quiet for QUIET_DAYS (localStorage)
     - never stacks on an open modal / sign-in surface / micro-poll

   Experiment: a sticky bucket splits visitors into 'on' (gets the
   prompt) and 'holdback' (never sees it) so lift is measurable. Every
   GA4 event carries the bucket. Set HOLDBACK_PCT to 0 to show everyone.

   Events: auth_prompt_shown / auth_prompt_google / auth_prompt_dismiss.
   ────────────────────────────────────────────────────────────────── */
(function () {
  'use strict';
  if (window.__ditAuthPrompt) return;
  window.__ditAuthPrompt = true;

  var DELAY_MS = 30000;            // ~30s after landing
  var QUIET_DAYS = 4;              // cooloff after a dismissal
  var HOLDBACK_PCT = 15;           // % of visitors who never see it (control). 0 = show everyone.
  var DEST = '/app#chat';

  var SESSION_KEY = 'debateit-authprompt-session';
  var QUIET_KEY = 'debateit-authprompt-quiet-until';
  var AB_KEY = 'debateit-authprompt-ab';

  var CONFIG = {
    apiKey: ['AIzaSyDDx', 'TYlyWLOJnFP99', 'e7XsLPb3FwIEijNNM'].join(''),
    authDomain: 'debateos-78ac5.firebaseapp.com',
    projectId: 'debateos-78ac5',
    storageBucket: 'debateos-78ac5.firebasestorage.app',
    messagingSenderId: '860359449192',
    appId: '1:860359449192:web:f5dc0060dbd50d6c4fb9dd'
  };

  function track(ev, meta) { try { if (window.gtag) gtag('event', ev, meta || {}); } catch (e) {} }
  function ls(get, key, val) {
    try { return get ? localStorage.getItem(key) : localStorage.setItem(key, val); } catch (e) { return null; }
  }

  // Sticky experiment bucket.
  function bucket() {
    var b = ls(true, AB_KEY);
    if (b !== 'on' && b !== 'holdback') {
      b = (Math.random() * 100 < HOLDBACK_PCT) ? 'holdback' : 'on';
      ls(false, AB_KEY, b);
    }
    return b;
  }

  function shownThisSession() { try { return sessionStorage.getItem(SESSION_KEY) === '1'; } catch (e) { return false; } }
  function markSession() { try { sessionStorage.setItem(SESSION_KEY, '1'); } catch (e) {} }
  function inQuiet() {
    var until = parseInt(ls(true, QUIET_KEY), 10) || 0;
    return Date.now() < until;
  }
  function armQuiet() { ls(false, QUIET_KEY, String(Date.now() + QUIET_DAYS * 864e5)); }

  function anotherSurfaceOpen() {
    try {
      if (document.body.classList.contains('signin-modal-open')) return true;
      if (document.querySelector('.dit-authprompt-back')) return true;
      if (document.querySelector('.ob-modal.is-open')) return true;
      if (document.querySelector('.intro-modal.is-open')) return true;
      if (document.querySelector('.da-golive')) return true;
      if (document.querySelector('.micro-poll.is-in')) return true;
      if (document.querySelector('.signup-nudge.is-in')) return true;
    } catch (e) {}
    return false;
  }

  // Firebase — reuse the page's app if it already booted; otherwise init.
  function fbReady() { return !!(window.firebase && firebase.auth); }
  function ensureApp() {
    try { if (fbReady() && (!firebase.apps || !firebase.apps.length)) firebase.initializeApp(CONFIG); } catch (e) {}
  }
  function signedIn() {
    try {
      ensureApp();
      var u = firebase.auth().currentUser;
      return !!(u && !u.isAnonymous);
    } catch (e) { return false; }
  }

  function doGoogle(btn) {
    if (!fbReady()) { window.location.href = DEST; return; }
    ensureApp();
    var auth = firebase.auth();
    var provider = new firebase.auth.GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    track('auth_prompt_google', { bucket: 'on' });
    if (btn) btn.textContent = 'Opening Google…';
    var t0 = Date.now();
    auth.signInWithPopup(provider).then(function () {
      try { if (window.gtag) gtag('event', 'sign_up', { method: 'Google', surface: 'auth_prompt_30s' }); } catch (e) {}
      window.location.href = DEST;
    }).catch(function (err) {
      var code = (err && err.code) || 'unknown';
      // A quick "closed by user" is a real cancel; leave them be.
      if (code === 'auth/popup-closed-by-user' && (Date.now() - t0) < 1200) { close('cancel'); return; }
      if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') { close('cancel'); return; }
      // Popup blocked (Safari / mobile) — fall back to redirect.
      try { auth.signInWithRedirect(provider); } catch (e) { if (btn) btn.textContent = 'Continue with Google'; }
    });
  }

  var back = null;
  function close(reason) {
    if (!back) return;
    track('auth_prompt_dismiss', { bucket: 'on', reason: reason || 'x' });
    document.body.classList.remove('signin-modal-open');
    document.removeEventListener('keydown', onKey);
    var ref = back; back = null;
    ref.classList.remove('is-in');
    setTimeout(function () { if (ref && ref.parentNode) ref.parentNode.removeChild(ref); }, 240);
    armQuiet();
  }
  function onKey(e) { if (e.key === 'Escape') close('esc'); }

  var GOOGLE_G =
    '<svg viewBox="0 0 18 18" width="17" height="17" aria-hidden="true" style="flex-shrink:0">' +
    '<path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62z"/>' +
    '<path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18z"/>' +
    '<path fill="#FBBC05" d="M3.97 10.72a5.4 5.4 0 0 1 0-3.44V4.95H.96a9 9 0 0 0 0 8.1l3.01-2.33z"/>' +
    '<path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58C13.47.9 11.43 0 9 0A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58z"/>' +
    '</svg>';

  function injectStyle() {
    if (document.getElementById('dit-authprompt-css')) return;
    var s = document.createElement('style'); s.id = 'dit-authprompt-css';
    s.textContent =
      '.dit-authprompt-back{position:fixed;inset:0;z-index:2147483200;display:flex;align-items:center;justify-content:center;' +
        'padding:18px;background:rgba(8,6,10,.5);backdrop-filter:blur(4px);-webkit-backdrop-filter:blur(4px);' +
        'opacity:0;transition:opacity .24s ease}' +
      '.dit-authprompt-back.is-in{opacity:1}' +
      '.dit-authprompt{width:100%;max-width:384px;box-sizing:border-box;background:#fff;color:#1a1a1f;border-radius:20px;' +
        'padding:26px 24px 22px;box-shadow:0 26px 80px rgba(0,0,0,.4);font-family:"Crimson Pro","Inter",system-ui,sans-serif;' +
        'transform:translateY(12px) scale(.98);transition:transform .26s cubic-bezier(.2,.7,.3,1)}' +
      '.dit-authprompt-back.is-in .dit-authprompt{transform:none}' +
      '.dit-authprompt .ap-x{position:absolute;top:12px;right:14px;border:none;background:transparent;color:rgba(0,0,0,.4);' +
        'font-size:1.4rem;line-height:1;cursor:pointer;padding:2px 6px;font-family:inherit}' +
      '.dit-authprompt .ap-x:hover{color:#1a1a1f}' +
      '.dit-authprompt{position:relative}' +
      '.dit-authprompt .ap-eyebrow{font-size:.62rem;font-weight:800;letter-spacing:.14em;text-transform:uppercase;color:#ef4444;margin-bottom:9px}' +
      '.dit-authprompt h3{font-size:1.28rem;font-weight:800;letter-spacing:-.01em;margin:0 0 7px;line-height:1.18}' +
      '.dit-authprompt p{font-size:.9rem;line-height:1.5;color:rgba(0,0,0,.6);margin:0 0 18px}' +
      '.dit-authprompt .ap-google{display:flex;align-items:center;justify-content:center;gap:10px;width:100%;box-sizing:border-box;' +
        'border:1px solid rgba(0,0,0,.14);background:#fff;color:#1a1a1f;border-radius:999px;padding:12px 16px;cursor:pointer;' +
        'font-family:inherit;font-size:.92rem;font-weight:700;transition:background .15s,border-color .15s,box-shadow .15s}' +
      '.dit-authprompt .ap-google:hover{background:#faf9f6;border-color:rgba(0,0,0,.24);box-shadow:0 4px 14px rgba(0,0,0,.08)}' +
      '.dit-authprompt .ap-not{display:block;width:100%;margin-top:11px;border:none;background:transparent;color:rgba(0,0,0,.5);' +
        'font-family:inherit;font-size:.82rem;cursor:pointer;padding:4px}' +
      '.dit-authprompt .ap-not:hover{color:#1a1a1f}' +
      '.dit-authprompt .ap-fine{margin:12px 0 0;font-size:.72rem;color:rgba(0,0,0,.4);text-align:center}' +
      // dark themes
      '[data-theme="grey"] .dit-authprompt,[data-theme="crimson"] .dit-authprompt{background:#17151a;color:#f3f2f5}' +
      '[data-theme="grey"] .dit-authprompt h3,[data-theme="crimson"] .dit-authprompt h3{color:#fff}' +
      '[data-theme="grey"] .dit-authprompt p,[data-theme="crimson"] .dit-authprompt p{color:rgba(255,255,255,.62)}' +
      '[data-theme="grey"] .dit-authprompt .ap-google,[data-theme="crimson"] .dit-authprompt .ap-google{background:#fff;color:#1a1a1f;border-color:transparent}' +
      '[data-theme="grey"] .dit-authprompt .ap-x,[data-theme="crimson"] .dit-authprompt .ap-x{color:rgba(255,255,255,.5)}' +
      '[data-theme="grey"] .dit-authprompt .ap-not,[data-theme="crimson"] .dit-authprompt .ap-not{color:rgba(255,255,255,.55)}' +
      '[data-theme="grey"] .dit-authprompt .ap-fine,[data-theme="crimson"] .dit-authprompt .ap-fine{color:rgba(255,255,255,.38)}' +
      '@media (prefers-reduced-motion:reduce){.dit-authprompt-back,.dit-authprompt{transition:opacity .2s ease}}';
    document.head.appendChild(s);
  }

  function show() {
    if (back || signedIn() || anotherSurfaceOpen()) return;
    injectStyle();
    back = document.createElement('div');
    back.className = 'dit-authprompt-back';
    back.innerHTML =
      '<div class="dit-authprompt" role="dialog" aria-modal="true" aria-label="Sign in">' +
        '<button type="button" class="ap-x" aria-label="Close">×</button>' +
        '<div class="ap-eyebrow">DebateIt</div>' +
        '<h3>Keep your rounds.</h3>' +
        '<p>Sign in with Google to save your history, ballots, and streak, and pick up right where you left off.</p>' +
        '<button type="button" class="ap-google">' + GOOGLE_G + '<span>Continue with Google</span></button>' +
        '<button type="button" class="ap-not">Not now</button>' +
        '<p class="ap-fine">Free. Two seconds. No card.</p>' +
      '</div>';
    document.body.appendChild(back);
    document.body.classList.add('signin-modal-open');
    requestAnimationFrame(function () { if (back) back.classList.add('is-in'); });

    back.addEventListener('click', function (e) { if (e.target === back) close('backdrop'); });
    back.querySelector('.ap-x').addEventListener('click', function () { close('x'); });
    back.querySelector('.ap-not').addEventListener('click', function () { close('not_now'); });
    back.querySelector('.ap-google').addEventListener('click', function () { doGoogle(this); });
    document.addEventListener('keydown', onKey);

    markSession();
    track('auth_prompt_shown', { bucket: 'on', page: location.pathname });
  }

  // ── Arm the timer ──────────────────────────────────────────────────
  function arm() {
    if (shownThisSession() || inQuiet()) return;
    if (bucket() !== 'on') { track('auth_prompt_holdback', { bucket: 'holdback' }); return; }
    setTimeout(function () {
      if (shownThisSession() || inQuiet() || signedIn()) return;
      // If a surface is open at 30s, wait a bit and try once more.
      if (anotherSurfaceOpen()) { setTimeout(function () { if (!signedIn()) show(); }, 8000); return; }
      show();
    }, DELAY_MS);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', arm);
  else arm();
})();
