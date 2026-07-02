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
        carries to /debate-it and back.
     4. Picks copy based on URL path: landing, debate-ai, voice,
        learn, etc. each get a contextual line about WHAT the
        user is being asked to save.
     5. Mounts a bottom-right pill with a Google CTA and a ×
        dismiss. The CTA reuses window.triggerGoogleSignIn if
        the host page already defines one; otherwise runs its
        own signInWithPopup against firebase.auth().

   Dismissal is "not now", not "never" (2026-07-02 re-nudge policy):
   while the visitor keeps actively using the page, the nudge returns
   after ~60s of real interaction with benefit-first copy explaining
   why the email link matters (saved rounds + streaks, the AI learns
   your style, saved practice, DMs reach you). Caps: 3 shows per
   session, 24h cooloff across visits, 14 days after three separate
   dismissals. Signing in still auto-unmounts everything via
   onAuthStateChanged, and pages that own their sign-in CTA stay
   skipped. Other surfaces can route their own "Maybe later" into
   this cadence via  window.dispatchEvent(new CustomEvent(
   'debateit:maybe-later')).
   ────────────────────────────────────────────────────────────── */
(function(){
  if (window.__debateaiSignupNudge) return;
  window.__debateaiSignupNudge = true;

  var DISMISS_KEY = 'debateos-signup-reminder-dismissed';
  var DISMISS_TS_KEY = 'debateos-signup-reminder-dismissed-at';
  var DISMISS_COUNT_KEY = 'debateos-signup-reminder-dismiss-count';
  var SESSION_ATTEMPTS_KEY = 'debateos-nudge-session-attempts';
  // Re-nudge policy (2026-07-02): a dismissal is "not now", not "never".
  // While the visitor KEEPS ACTIVELY USING a tool page (real interactions,
  // not idle time), the nudge comes back after ~60s of continued use with
  // copy that explains WHY linking a Google email matters. Caps keep it
  // firm instead of obnoxious: max 3 appearances per session; across
  // visits the cooloff is 24h, stretching to 14 days once someone has
  // dismissed it three separate times (they've heard us).
  var DISMISS_TTL_MS = 24 * 60 * 60 * 1000;
  var DISMISS_TTL_LONG_MS = 14 * 24 * 60 * 60 * 1000;
  var REMIND_ACTIVE_SECONDS = 60;   // active-use seconds before a re-nudge
  var MAX_ATTEMPTS_PER_SESSION = 3; // initial + two reminders

  // Benefit-first copy for reminders. The first pass is contextual per
  // page (pageConfig); reminders answer the visitor's actual question,
  // "why does signing in matter," with concrete things tied to their
  // email: work that persists, an AI that learns them, saved practice,
  // DMs that reach them. Honest, no invented urgency.
  var REMIND_MSGS = [
    '<strong>Why sign in?</strong> Your rounds, ballots, and streaks save to your Google email and follow you on any device. You are not training GPT or Claude. You are training DebateIt.',
    '<strong>Still one tap.</strong> Without an email link your work vanishes when this tab closes. With it: saved history, a style profile DebateIt learns from, DMs from sparring partners, a real leaderboard rank.'
  ];

  // Per-path config. First match wins. Generic fallback at the end.
  // Delay is biased longer on tool pages because the user is mid-
  // flow and doesn't want a prompt while they're typing or speaking.
  // Stakes-driven copy. The vibe: signing in is when the AI starts
  // becoming yours. Loss aversion on patterns the user actually
  // built, not a generic "keep your rounds" pitch. Founder-voice
  // first-person where it fits.
  var pageConfig = [
    // /spar and /live own their sign-in prompt (the gate + the "board
    // becomes yours" guest tooltip). Skip the global nudge there so the
    // two don't stack into a doubled sign-in nag. 2026-06-14.
    { match: /^\/(spar|live)(?:\.html)?(?:[/?#]|$)/, skip: true },
    { match: /^\/(landing|index)?(\.html)?($|\?)/,
      delay: 8,
      variant: 'community',
      msg: '<strong>You\'re early.</strong> Sign in to save your rounds and ballots, and help shape where this goes.' },
    { match: /^\/debate-it/,
      delay: 8,
      variant: 'community',
      msg: '<strong>You\'re early.</strong> Sign in to save your rounds and ballots, and help shape where this goes.' },
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
      msg: '<strong>You\'re early.</strong> Sign in to save your rounds and ballots, and help shape where this goes.' },
    { match: /^\/pricing/,
      delay: 25,
      msg: "Beta is free for everyone. Sign in to keep your rounds when pricing turns on." },
    { match: /.*/,
      delay: 25,
      msg: 'Sign in and your rounds train DebateIt, not GPT or Claude. Rounds, ballots, style profile follow you.' },
  ];

  function getConfig(){
    var path = location.pathname || '/';
    for (var i = 0; i < pageConfig.length; i++){
      if (pageConfig[i].match.test(path)) return pageConfig[i];
    }
    return pageConfig[pageConfig.length - 1];
  }

  function dismissCount(){
    try { return parseInt(localStorage.getItem(DISMISS_COUNT_KEY), 10) || 0; } catch (e) { return 0; }
  }

  function sessionAttempts(){
    try { return parseInt(sessionStorage.getItem(SESSION_ATTEMPTS_KEY), 10) || 0; } catch (e) { return 0; }
  }

  function bumpSessionAttempts(){
    try { sessionStorage.setItem(SESSION_ATTEMPTS_KEY, String(sessionAttempts() + 1)); } catch (e) {}
  }

  function recentlyDismissed(){
    try {
      if (localStorage.getItem(DISMISS_KEY) !== '1') return false;
      var ts = parseInt(localStorage.getItem(DISMISS_TS_KEY), 10) || 0;
      if (!ts) return true; // legacy dismissal — respect it
      // Same-session dismissals don't suppress the page-load arm: the
      // activity-based reminder is the whole point. Cross-visit, honor
      // a 24h cooloff (14d once they've said no three separate times).
      if (sessionAttempts() > 0 && sessionAttempts() < MAX_ATTEMPTS_PER_SESSION) return false;
      var ttl = dismissCount() >= 3 ? DISMISS_TTL_LONG_MS : DISMISS_TTL_MS;
      return (Date.now() - ts) < ttl;
    } catch (e) { return false; }
  }

  function markDismissed(){
    try {
      localStorage.setItem(DISMISS_KEY, '1');
      localStorage.setItem(DISMISS_TS_KEY, String(Date.now()));
      localStorage.setItem(DISMISS_COUNT_KEY, String(dismissCount() + 1));
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
      '.signup-nudge{position:fixed;right:18px;bottom:18px;z-index:9999;display:flex;align-items:center;gap:10px;padding:10px 12px 10px 16px;border-radius:14px;background:rgba(20,10,12,.94);color:#fff;border:1px solid rgba(220,38,38,.42);box-shadow:0 14px 36px rgba(0,0,0,.32);font-family:"Crimson Pro","Inter",system-ui,-apple-system,sans-serif;font-size:.82rem;line-height:1.35;max-width:calc(100vw - 36px);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);transform:translateY(14px);opacity:0;transition:transform .26s ease,opacity .26s ease}' +
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
      // A sign-in modal owns the screen while open; never stack the nudge
      // under it (the mobile overwhelm was modal + nudge + go-live card).
      'body.signin-modal-open .signup-nudge{display:none!important}' +
      // 2026-05-20: this nudge pins to right:18/bottom:18 — the same spot as
      // the floating Feedback pill (.fb-floating), so they'd stack and hide
      // each other. The lift is now done in JS (syncFeedbackPill) off the
      // nudge's measured height — deterministic, no `:has()` support needed.
      // Keep a transition here so the pill glides when JS sets its bottom.
      '.fb-floating{transition:bottom .26s ease, transform .18s ease, box-shadow .18s ease}' +
      '@media (max-width:520px){.signup-nudge{right:8px;left:8px;bottom:8px;flex-wrap:wrap;font-size:.78rem;padding:10px 10px 10px 12px}.signup-nudge .su-line{flex:1 1 100%;order:1}.signup-nudge .su-cta{order:2}.signup-nudge .su-close{order:3;margin-left:auto}}';
    document.head.appendChild(s);
  }

  function googleSvg(){
    return '<svg width="14" height="14" viewBox="0 0 48 48" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3 0 5.8 1.1 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.2-.1-2.3-.4-3.5z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 16 19 13 24 13c3 0 5.8 1.1 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.3 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.3-2.2 4.3-4.1 5.7l6.2 5.2C41.9 35 44 29.8 44 24c0-1.2-.1-2.3-.4-3.5z"/></svg>';
  }

  function isRealUser(user){
    return !!(user && !user.isAnonymous);
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

  // Keep the floating Feedback pill clear of the nudge. The CSS `:has()`
  // lift (injectStyle) is the fast path, but `:has()` support is uneven, so
  // we also set the pill's bottom inline (highest priority) from the nudge's
  // measured height. Works whether the nudge is a corner pill (desktop) or a
  // full-width bottom sheet (mobile).
  function syncFeedbackPill(){
    var fb = document.querySelector('.fb-floating');
    if (!fb) return;
    if (bar && bar.classList.contains('is-in')) {
      var r = bar.getBoundingClientRect();
      var gapBelow = Math.max(0, window.innerHeight - r.bottom);
      var lift = Math.round(r.height + gapBelow + 12);
      fb.style.setProperty('bottom', lift + 'px', 'important');
    } else {
      fb.style.removeProperty('bottom');
    }
  }
  var _syncBound = false;
  function bindSync(){
    if (_syncBound) return;
    _syncBound = true;
    window.addEventListener('resize', syncFeedbackPill, { passive: true });
  }

  function introSeen(){
    try { return localStorage.getItem('debateai-intro-seen') === '1'; }
    catch (e) { return false; }
  }

  function mount(attempt){
    if (bar) return;
    attempt = attempt || 0;
    var cfg = getConfig();
    if (cfg.skip) return; // page owns its own sign-in CTA (e.g. /spar, /live)
    // A sign-in modal (onboarding / intro) is up — defer; the body class is
    // cleared on dismiss, then the nudge appears on its own.
    if (document.body.classList.contains('signin-modal-open') || document.querySelector('.ob-modal.is-open')){ setTimeout(function(){ mount(attempt); }, 1500); return; }
    // One bottom sheet at a time on mobile: if the go-live card is already
    // showing, it owns the bottom. yield to it.
    if (document.querySelector('.da-golive')){ return; }
    // Don't stack on top of the first-visit intro modal (it's the same
    // ask, and the two collided at the bottom of the screen). Defer until
    // that modal is dismissed; the bar then appears on its own.
    if (document.querySelector('.intro-modal.is-open')){ setTimeout(function(){ mount(attempt); }, 1500); return; }
    // If a first-visit intro modal lives on this page but hasn't been
    // resolved yet, it's the SAME sign-in ask and is about to open after
    // the visitor scrolls. Skip the nudge entirely for this page-load so
    // the two never stack at the bottom of the screen. On the next visit
    // (intro already seen) the nudge takes over as the recurring prompt.
    if (document.getElementById('introModal') && !introSeen()){ return; }
    injectStyle();
    // Reminders swap the page-contextual line for the benefits pitch:
    // the visitor already saw the ask, so answer "why bother" instead.
    var msg = attempt > 0 ? REMIND_MSGS[Math.min(attempt - 1, REMIND_MSGS.length - 1)] : cfg.msg;
    bar = document.createElement('div');
    bar.className = 'signup-nudge';
    bar.setAttribute('role', 'dialog');
    bar.setAttribute('aria-label', 'Sign up to save your work');
    bar.innerHTML =
      '<span class="su-line">' + msg.replace(/^(Sign in[^.]*\.)/, '<strong>$1</strong>') + '</span>' +
      '<button type="button" class="su-cta">' + googleSvg() + 'Continue with Google</button>' +
      '<button type="button" class="su-close" aria-label="Dismiss">×</button>';
    document.body.appendChild(bar);
    bumpSessionAttempts();
    requestAnimationFrame(function(){
      bar.classList.add('is-in');
      // Measure after is-in is applied so the pill lift matches real height.
      requestAnimationFrame(function(){ syncFeedbackPill(); bindSync(); });
    });
    bar.querySelector('.su-cta').addEventListener('click', doSignIn);
    bar.querySelector('.su-close').addEventListener('click', function(){
      markDismissed();
      unmount();
      try {
        if (window.gtag) gtag('event', 'signup_nudge_dismissed', { path: location.pathname, attempt: attempt });
      } catch (e) {}
      armReminder(attempt + 1);
    });
    try {
      if (window.gtag) gtag('event', 'signup_nudge_shown', { path: location.pathname, variant: attempt > 0 ? 'reminder' : (cfg.variant || 'standard'), delay: cfg.delay, attempt: attempt });
    } catch (e) {}
  }

  function unmount(){
    if (!bar) return;
    bar.classList.remove('is-in');
    var ref = bar;
    setTimeout(function(){ if (ref && ref.parentNode) ref.parentNode.removeChild(ref); }, 260);
    bar = null;
    syncFeedbackPill(); // restore the Feedback pill to its resting position
  }

  // ── Active-use tracking for reminders ─────────────────────────────
  // "Active" = real interactions (pointer, keys, scroll), sampled in 5s
  // buckets, only while the tab is visible. Idle time in an open tab
  // never triggers a reminder; a minute of genuine tool use does.
  var _lastInteraction = 0;
  var _activityBound = false;
  function bindActivity(){
    if (_activityBound) return;
    _activityBound = true;
    var poke = function(){ _lastInteraction = Date.now(); };
    window.addEventListener('pointerdown', poke, { passive: true });
    window.addEventListener('keydown', poke, { passive: true });
    window.addEventListener('scroll', poke, { passive: true });
  }

  function armReminder(attempt){
    if (sessionAttempts() >= MAX_ATTEMPTS_PER_SESSION) return;
    bindActivity();
    var activeSeconds = 0;
    var timer = setInterval(function(){
      try { if (isRealUser(firebase.auth().currentUser)) { clearInterval(timer); return; } } catch (e) {}
      if (document.hidden) return;
      if (Date.now() - _lastInteraction < 5000) activeSeconds += 5;
      if (activeSeconds >= REMIND_ACTIVE_SECONDS){
        clearInterval(timer);
        if (!bar) mount(attempt);
      }
    }, 5000);
  }

  // Any page surface with its own "Maybe later" button can hand its
  // dismissal to the same reminder cadence:
  //   window.dispatchEvent(new CustomEvent('debateit:maybe-later'))
  window.addEventListener('debateit:maybe-later', function(){
    markDismissed();
    armReminder(Math.max(1, sessionAttempts()));
  });

  function start(){
    if (recentlyDismissed()) return;
    var cfg = getConfig();
    var delayMs = (cfg.delay || 25) * 1000;

    // Firebase not on this page → bail. Don't show a nudge that
    // can't actually authenticate.
    if (typeof firebase === 'undefined' || !firebase.auth) return;

    // If we already know the user is signed in (auth state cached
    // by Firebase SDK), no nudge.
    if (isRealUser(firebase.auth().currentUser)) return;

    // Watch auth state from now on. If they sign in via any
    // surface while the nudge is up (or queued), drop it.
    var unsub = firebase.auth().onAuthStateChanged(function(user){
      if (isRealUser(user)) {
        unmount();
        if (typeof unsub === 'function') unsub();
      }
    });

    // Dismissed earlier this session (possibly on another page)?
    // Skip the fresh intro delay and go straight to the active-use
    // reminder cadence with benefits copy.
    if (sessionAttempts() > 0){
      armReminder(sessionAttempts());
      return;
    }

    setTimeout(function(){
      // Re-check just before mounting in case auth resolved during
      // the delay.
      try {
        if (isRealUser(firebase.auth().currentUser)) return;
      } catch (e) { return; }
      mount(0);
    }, delayMs);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
