/* ──────────────────────────────────────────────────────────────────
   Cross-page Google sign-up nudge for unsigned visitors.

   Drop <script defer src="/js/signup-nudge.js"></script> on any
   page where you want a soft "sign up to save your stuff" prompt
   for unsigned users. The script:

     1. Waits the configured delay (default 25s, longer on
        tool pages because the user is mid-flow).
     2. Reads Firebase auth state. If a user is already signed
        in, never mounts. If Firebase isn't loaded on this page,
        skips silently — this isn't a hard requirement.
     3. Checks a single localStorage flag so a dismissal on /
        carries to /debate-ai and back.
     4. Picks copy based on URL path: landing, debate-ai, voice,
        learn, etc. each get a contextual line about WHAT the
        user is being asked to save.
     5. Mounts a bottom-right pill with a Google CTA and a ×
        dismiss. The CTA reuses window.triggerGoogleSignIn if
        the host page already defines one; otherwise runs its
        own signInWithPopup against firebase.auth().

   Dismissal is sticky for 14 days, not forever, so the next
   round of returning visitors gets the prompt once. After they
   sign up the nudge auto-unmounts via onAuthStateChanged.
   ────────────────────────────────────────────────────────────── */
(function(){
  if (window.__debateaiSignupNudge) return;
  window.__debateaiSignupNudge = true;

  var DISMISS_KEY = 'debateos-signup-reminder-dismissed';
  var DISMISS_TS_KEY = 'debateos-signup-reminder-dismissed-at';
  // 14 days. Long enough not to nag, short enough that the prompt
  // comes back for users who haven't signed up after two weeks.
  var DISMISS_TTL_MS = 14 * 24 * 60 * 60 * 1000;

  // Per-path config. First match wins. Generic fallback at the end.
  // Delay is biased longer on tool pages because the user is mid-
  // flow and doesn't want a prompt while they're typing or speaking.
  // Stakes-driven copy. The vibe: signing in is when the AI starts
  // becoming yours. Loss aversion on patterns the user actually
  // built, not a generic "keep your rounds" pitch. Founder-voice
  // first-person where it fits.
  var pageConfig = [
    { match: /^\/(landing|index)?($|\?)/,
      delay: 18,
      msg: 'Sign in and the AI starts learning how you argue.' },
    { match: /^\/debate-ai/,
      delay: 60,
      msg: 'The AI is recognizing your patterns. Sign in to keep them.' },
    { match: /^\/voice-debate/,
      delay: 60,
      msg: 'Sign in and the voice round becomes part of your style profile.' },
    { match: /^\/learn/,
      delay: 30,
      msg: "Sign in and I'll track which formats you've drilled, so the AI knows what to push you on." },
    { match: /^\/today/,
      delay: 25,
      msg: "Sign in to bookmark today's motion. Tomorrow's lands in your inbox-less feed, not your email." },
    { match: /^\/leaderboard/,
      delay: 25,
      msg: 'Sign in and your rounds become rated. The rank is real, not anonymous.' },
    { match: /^\/spar|\/live|\/community|\/rounds/,
      delay: 5,
      variant: 'community',
      msg: '<strong>95% of people here never sign in.</strong> No accounts, no community, no one to spar. Sign in and help build it.' },
    { match: /^\/pricing/,
      delay: 25,
      msg: "Beta is free for everyone. Sign in to keep your rounds when pricing turns on." },
    { match: /.*/,
      delay: 25,
      msg: 'Sign in and the AI starts learning how you argue. Rounds, ballots, style profile follow you.' },
  ];

  function getConfig(){
    var path = location.pathname || '/';
    for (var i = 0; i < pageConfig.length; i++){
      if (pageConfig[i].match.test(path)) return pageConfig[i];
    }
    return pageConfig[pageConfig.length - 1];
  }

  function recentlyDismissed(){
    try {
      if (localStorage.getItem(DISMISS_KEY) !== '1') return false;
      var ts = parseInt(localStorage.getItem(DISMISS_TS_KEY), 10) || 0;
      if (!ts) return true; // legacy dismissal — respect it
      return (Date.now() - ts) < DISMISS_TTL_MS;
    } catch (e) { return false; }
  }

  function markDismissed(){
    try {
      localStorage.setItem(DISMISS_KEY, '1');
      localStorage.setItem(DISMISS_TS_KEY, String(Date.now()));
    } catch (e) {}
  }

  // Self-contained CSS — injected once. Mirrors the styling that
  // shipped inline on /landing earlier so the nudge feels native
  // wherever it appears.
  function injectStyle(){
    if (document.getElementById('signupNudgeStyle')) return;
    var s = document.createElement('style');
    s.id = 'signupNudgeStyle';
    s.textContent =
      '.signup-nudge{position:fixed;right:18px;bottom:18px;z-index:9999;display:flex;align-items:center;gap:10px;padding:10px 12px 10px 16px;border-radius:14px;background:rgba(20,10,12,.94);color:#fff;border:1px solid rgba(220,38,38,.42);box-shadow:0 14px 36px rgba(0,0,0,.32);font-family:"Inter",system-ui,-apple-system,sans-serif;font-size:.82rem;line-height:1.35;max-width:calc(100vw - 36px);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);transform:translateY(14px);opacity:0;transition:transform .26s ease,opacity .26s ease}' +
      '.signup-nudge.is-in{transform:translateY(0);opacity:1}' +
      '.signup-nudge .su-line{flex:1;color:rgba(255,255,255,.82)}' +
      '.signup-nudge .su-line strong{color:#fff;font-weight:700}' +
      '.signup-nudge .su-cta{display:inline-flex;align-items:center;gap:7px;padding:7px 12px;border:none;border-radius:999px;cursor:pointer;background:#fff;color:#1a1a1f;font-family:inherit;font-size:.76rem;font-weight:700;letter-spacing:.01em;white-space:nowrap}' +
      '.signup-nudge .su-cta:hover{background:#f3f3f0}' +
      '.signup-nudge .su-close{border:none;background:transparent;color:rgba(255,255,255,.55);cursor:pointer;font-size:1.1rem;line-height:1;padding:2px 6px;font-family:inherit}' +
      '.signup-nudge .su-close:hover{color:#fff}' +
      '[data-theme="light"] .signup-nudge{background:#fff;color:#1a1a1f;border-color:rgba(220,38,38,.32);box-shadow:0 14px 36px rgba(0,0,0,.10)}' +
      '[data-theme="light"] .signup-nudge .su-line{color:rgba(0,0,0,.7)}' +
      '[data-theme="light"] .signup-nudge .su-line strong{color:#1a1a1f}' +
      '[data-theme="light"] .signup-nudge .su-cta{background:#dc2626;color:#fff}' +
      '[data-theme="light"] .signup-nudge .su-cta:hover{background:#b91c1c}' +
      '[data-theme="light"] .signup-nudge .su-close{color:rgba(0,0,0,.45)}' +
      '[data-theme="light"] .signup-nudge .su-close:hover{color:#1a1a1f}' +
      // 2026-05-20: this nudge pins to right:18/bottom:18 — the exact spot
      // as the floating Feedback pill (.fb-floating). They were stacking
      // in the same corner, the dark nudge sitting hidden behind Feedback.
      // While the nudge is in, lift the Feedback pill above it so both are
      // visible. Scoped to .is-in so the lift animates in/out with the
      // nudge and reverts the moment it's dismissed.
      'body:has(.signup-nudge.is-in) .fb-floating{bottom:86px !important;transition:bottom .26s ease}' +
      '@media (max-width:520px){.signup-nudge{right:8px;left:8px;bottom:8px;flex-wrap:wrap;font-size:.78rem;padding:10px 10px 10px 12px}.signup-nudge .su-line{flex:1 1 100%;order:1}.signup-nudge .su-cta{order:2}.signup-nudge .su-close{order:3;margin-left:auto}body:has(.signup-nudge.is-in) .fb-floating{bottom:128px !important}}';
    document.head.appendChild(s);
  }

  function googleSvg(){
    return '<svg width="14" height="14" viewBox="0 0 48 48" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3 0 5.8 1.1 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.2-.1-2.3-.4-3.5z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 16 19 13 24 13c3 0 5.8 1.1 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.3 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.3-2.2 4.3-4.1 5.7l6.2 5.2C41.9 35 44 29.8 44 24c0-1.2-.1-2.3-.4-3.5z"/></svg>';
  }

  function doSignIn(){
    // If the host page already wired triggerGoogleSignIn, reuse it
    // so any source-tagging / post-auth redirects are consistent.
    try {
      if (typeof window.triggerGoogleSignIn === 'function') {
        window.triggerGoogleSignIn('signup_nudge');
        return;
      }
    } catch (e) {}
    // Fallback: run our own popup against firebase.auth(). Falls
    // through silently if Firebase isn't loaded on this page.
    try {
      if (typeof firebase === 'undefined' || !firebase.auth) return;
      var provider = new firebase.auth.GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });
      firebase.auth().signInWithPopup(provider).catch(function(err){
        // Popup blocked / cancelled. Try redirect-based auth.
        try { firebase.auth().signInWithRedirect(provider); } catch (e) {}
      });
      try {
        if (window.gtag) gtag('event', 'sign_up_start', { method: 'Google', source: 'signup_nudge', path: location.pathname });
      } catch (e) {}
    } catch (e) {}
  }

  var bar = null;
  function mount(){
    if (bar) return;
    var cfg = getConfig();
    injectStyle();
    bar = document.createElement('div');
    bar.className = 'signup-nudge';
    bar.setAttribute('role', 'dialog');
    bar.setAttribute('aria-label', 'Sign up to save your work');
    bar.innerHTML =
      '<span class="su-line">' + cfg.msg.replace(/^(Sign in[^.]*\.)/, '<strong>$1</strong>') + '</span>' +
      '<button type="button" class="su-cta">' + googleSvg() + 'Continue with Google</button>' +
      '<button type="button" class="su-close" aria-label="Dismiss">×</button>';
    document.body.appendChild(bar);
    requestAnimationFrame(function(){ bar.classList.add('is-in'); });
    bar.querySelector('.su-cta').addEventListener('click', doSignIn);
    bar.querySelector('.su-close').addEventListener('click', function(){
      markDismissed();
      unmount();
    });
    try {
      if (window.gtag) gtag('event', 'signup_nudge_shown', { path: location.pathname, variant: cfg.variant || 'standard', delay: cfg.delay });
    } catch (e) {}
  }

  function unmount(){
    if (!bar) return;
    bar.classList.remove('is-in');
    var ref = bar;
    setTimeout(function(){ if (ref && ref.parentNode) ref.parentNode.removeChild(ref); }, 260);
    bar = null;
  }

  function start(){
    if (recentlyDismissed()) return;
    var cfg = getConfig();
    var delayMs = (cfg.delay || 25) * 1000;

    // Firebase not on this page → bail. Don't show a nudge that
    // can't actually authenticate.
    if (typeof firebase === 'undefined' || !firebase.auth) return;

    // If we already know the user is signed in (auth state cached
    // by Firebase SDK), no nudge.
    if (firebase.auth().currentUser) return;

    // Watch auth state from now on. If they sign in via any
    // surface while the nudge is up (or queued), drop it.
    var unsub = firebase.auth().onAuthStateChanged(function(user){
      if (user) {
        unmount();
        if (typeof unsub === 'function') unsub();
      }
    });

    setTimeout(function(){
      // Re-check just before mounting in case auth resolved during
      // the delay.
      try {
        if (firebase.auth().currentUser) return;
      } catch (e) { return; }
      mount();
    }, delayMs);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
