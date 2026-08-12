/* ──────────────────────────────────────────────────────────────────
   Cross-page account sign-up nudge for unsigned visitors.

   Drop <script defer src="/js/signup-nudge.js"></script> on any
   page where you want a soft "sign up to save your stuff" prompt
   for unsigned users. The script:

     1. Waits the configured delay (default 25s, longer on
        tool pages because the user is mid-flow).
     2. Reads Firebase auth state. If a user is already signed
        in, never mounts. If Firebase isn't loaded on this page,
        skips silently — this isn't a hard requirement.
     3. Checks a single localStorage flag so a dismissal on /
        carries to /practice and back.
     4. Picks copy based on URL path: landing, debate-ai, voice,
        learn, etc. each get a contextual line about WHAT the
        user is being asked to save.
     5. Mounts a bottom-right pill with an account CTA and a ×
        dismiss. The CTA opens the shared email/password + Google
        chooser, with the legacy Google path as a fallback.

   Dismissal is "not now", not "never" (2026-07-02 re-nudge policy):
   while the visitor keeps actively using the page, the nudge returns
   after ~60s of real interaction with benefit-first copy explaining
   why an account matters (saved rounds + streaks, the AI learns
   your style, saved practice, DMs reach you). Caps: 3 shows per
   session, 24h cooloff across visits, 14 days after three separate
   dismissals. Signing in still auto-unmounts everything via
   onAuthStateChanged, and pages that own their sign-in CTA stay
   skipped. Other surfaces can route their own "Maybe later" into
   this cadence via  window.dispatchEvent(new CustomEvent(
   'debatable:maybe-later')).
   ────────────────────────────────────────────────────────────── */
(function(){
  if (window.__debateaiSignupNudge) return;
  window.__debateaiSignupNudge = true;

  // Restored 2026-08-10. The prompt remains dismissible, capped, and
  // suppressed for signed-in visitors and pages with their own auth gate.
  var DISABLED = false;
  if (DISABLED) return;

  var DISMISS_KEY = 'debateos-signup-reminder-dismissed';
  var DISMISS_TS_KEY = 'debateos-signup-reminder-dismissed-at';
  var DISMISS_COUNT_KEY = 'debateos-signup-reminder-dismiss-count';
  var SESSION_ATTEMPTS_KEY = 'debateos-nudge-session-attempts';
  var INVITE_OPT_IN_KEY = 'debatable-signin-invite-opt-in';
  var LAST_METHOD_KEY = 'debateos-last-signin-method';
  // Google One Tap. This is the Firebase project's own Google-provider
  // web client (Identity Platform defaultSupportedIdpConfigs/google.com),
  // NOT the Drive-integration client in index.html — One Tap ID tokens
  // must be minted against this client or signInWithCredential rejects
  // them with an audience mismatch.
  var ONE_TAP_CLIENT_ID = '860359449192-5ic17i3lgbrri1j2va41p9d4a9f0o7em.apps.googleusercontent.com';
  // Re-nudge policy (2026-07-02): a dismissal is "not now", not "never".
  // While the visitor KEEPS ACTIVELY USING a tool page (real interactions,
  // not idle time), the nudge comes back after ~60s of continued use with
  // copy that explains WHY creating an account matters. Caps keep it
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
  // account: work that persists, an AI that learns them, saved practice,
  // DMs that reach them. Honest, no invented urgency.
  var REMIND_MSGS = [
    '<strong>Why sign in?</strong> Your rounds, ballots, and streaks save to your account and follow you on any device. You are not training GPT or Claude. You are training Debatable.',
    '<strong>Keep what you build.</strong> Without an account your work vanishes when this tab closes. With one: saved history, a style profile Debatable learns from, DMs from sparring partners, a real leaderboard rank.'
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
      // Put the account ask on the first screen while intent is fresh.
      // 2026-08-11, per Aidan ("advertise google sign in much earlier and
      // quicker"): 6s -> 3s. Three seconds is still past Firebase's auth
      // resolve on a warm cache, so a returning signed-in visitor is
      // recognised before the prompt is eligible to mount and never sees
      // it. The hero now carries its own Google row, so this is the
      // second touch rather than the first, and the copy leads with the
      // same thing that row does: the score is what an account buys.
      delay: 3,
      variant: 'prominent',
      inviteOptIn: true,
      msg: '<strong>Sign in with Google and your rounds count.</strong> XP, round recordings, a place on the leaderboard, and every ballot saved.' },
    // /practice owns the account moment. Let a guest finish the sample
    // round, then offer to claim the ballot that now exists. A timer-based
    // prompt during prep competes with the round before the value is real.
    { match: /^\/practice/, skip: true },
    // 2026-08-11, per Aidan: the voice surfaces are the ONLY ones whose
    // rounds are ranked (typed rounds never write a leaderboard entry),
    // so their nudge sells the thing signing in actually buys here: a
    // score that counts, XP, a place on a public board. The
    // style-profile line stayed abstract to anyone who had not yet run
    // enough rounds to feel it.
    { match: /^\/(voice-debate|newvoice|coach)/,
      delay: 60,
      msg: '<strong>Signed out, the score is worth nothing.</strong> Sign in and every judged voice round banks XP, moves your level, and puts your best score on the leaderboard.' },
    { match: /^\/learn/,
      delay: 30,
      msg: "Sign in and I'll track which formats you've drilled, so the AI knows what to push you on." },
    { match: /^\/today/,
      delay: 25,
      msg: "Sign in to bookmark today's motion. Tomorrow's lands in your inbox-less feed, not your email." },
    { match: /^\/leaderboard/,
      delay: 25,
      msg: '<strong>Every name here earned it in a judged round.</strong> Sign in, debate the AI out loud, and your best score takes a place on this board.' },
    { match: /^\/spar|\/live|\/community|\/rounds/,
      delay: 20,
      variant: 'community',
      msg: '<strong>You\'re early.</strong> Sign in to save your rounds and ballots, and help shape where this goes.' },
    { match: /^\/pricing/,
      delay: 25,
      msg: "Beta is free for everyone. Sign in to keep your rounds when pricing turns on." },
    { match: /.*/,
      delay: 25,
      msg: 'Sign in and your rounds start counting. XP, round recordings, a leaderboard place, and ballots that follow you on any device.' },
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
      '.signup-nudge .su-g{width:15px;height:15px;flex:none}' +
      '.signup-nudge .su-cta:hover{background:#f3f3f0}' +
      '.signup-nudge .su-close{border:none;background:transparent;color:rgba(255,255,255,.68);cursor:pointer;font-size:1.1rem;line-height:1;padding:2px 6px;font-family:inherit}' +
      '.signup-nudge .su-close:hover{color:#fff}' +
      '.signup-nudge .su-optin{display:flex;align-items:flex-start;gap:8px;flex:1 1 100%;font-family:Crimson Pro,Georgia,serif;font-size:.68rem;line-height:1.35;color:rgba(255,255,255,.68);cursor:pointer}' +
      '.signup-nudge .su-optin input{width:15px;height:15px;margin:1px 0 0;accent-color:#dc2626;flex:none}' +
      '.signup-nudge--prominent{width:min(390px,calc(100vw - 36px));flex-wrap:wrap;padding:18px;border-radius:18px}' +
      '.signup-nudge--prominent .su-line{flex:1 1 100%;font-size:.9rem;line-height:1.45}' +
      '[data-theme="light"] .signup-nudge{background:#fff;color:#1a1a1f;border-color:rgba(220,38,38,.32);box-shadow:0 14px 36px rgba(0,0,0,.10)}' +
      '[data-theme="light"] .signup-nudge .su-line{color:rgba(0,0,0,.7)}' +
      '[data-theme="light"] .signup-nudge .su-line strong{color:#1a1a1f}' +
      '[data-theme="light"] .signup-nudge .su-optin{color:rgba(0,0,0,.64)}' +
      '[data-theme="light"] .signup-nudge .su-cta{background:#dc2626;color:#fff}' +
      '[data-theme="light"] .signup-nudge .su-cta:hover{background:#b91c1c}' +
      '[data-theme="light"] .signup-nudge .su-close{color:rgba(0,0,0,.64)}' +
      '[data-theme="light"] .signup-nudge .su-close:hover{color:#1a1a1f}' +
      // A sign-in modal owns the screen while open; never stack the nudge
      // under it (the mobile overwhelm was modal + nudge + go-live card).
      'body.signin-modal-open .signup-nudge{display:none!important}' +
      // Keep a transition for the floating Feedback pill. It stays in the
      // bottom-left slot now, so this nudge no longer lifts it upward.
      '.fb-floating{transition:bottom .26s ease, transform .18s ease, box-shadow .18s ease}' +
      // Under 520px the nudge goes full-bleed (left:8px right:8px), which is
      // the same bottom-left slot the Feedback pill owns, so the pill landed
      // ON TOP of "Continue with Google" and ate taps on its left third.
      // One bottom sheet at a time on mobile: the pill yields while the
      // nudge is up and comes back on dismiss. Lifting it instead is what
      // produced the "pill floating halfway up the screen" bug above.
      '@media (max-width:520px){body.signup-nudge-open .fb-floating{display:none!important}}' +
      '@media (max-width:520px){.signup-nudge{right:8px;left:8px;bottom:8px;flex-wrap:wrap;font-size:.78rem;padding:10px 10px 10px 12px}.signup-nudge .su-line{flex:1 1 100%;order:1}.signup-nudge .su-cta{order:2}.signup-nudge .su-close{order:3;margin-left:auto}}';
    document.head.appendChild(s);
  }

  function isRealUser(user){
    return !!(user && !user.isAnonymous);
  }

  function rememberInviteChoice(cfg){
    if (!cfg.inviteOptIn || !bar) return;
    try {
      var optin = bar.querySelector('.su-optin input');
      if (optin && optin.checked) localStorage.setItem(INVITE_OPT_IN_KEY, '1');
      else localStorage.removeItem(INVITE_OPT_IN_KEY);
    } catch (e) {}
  }

  function flushInviteOptIn(user){
    var optedIn = false;
    try { optedIn = localStorage.getItem(INVITE_OPT_IN_KEY) === '1'; } catch(e){}
    if (!optedIn || !user || !user.email) return;
    try { localStorage.removeItem(INVITE_OPT_IN_KEY); } catch(e){}
    try {
      fetch('/api/early-signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: user.email, displayName: user.displayName || '', source: 'google-signin-nudge' }),
        keepalive: true
      }).catch(function(){});
    } catch (e) {}
  }

  function rememberMethod(method){
    try { localStorage.setItem(LAST_METHOD_KEY, method); } catch (e) {}
  }

  function doSignIn(cfg){
    rememberInviteChoice(cfg);
    // Landing owns the most resilient Google flow: popup first, then a
    // redirect fallback for Safari and in-app browsers. Use its hidden
    // delegate when present so every landing CTA shares that path.
    try {
      var landingDelegate = document.getElementById('googleSignupBtn');
      if (landingDelegate) { landingDelegate.click(); return; }
    } catch(e){}
    // Other pages open Google's account chooser directly from this click.
    try {
      if (typeof firebase === 'undefined' || !firebase.auth) return;
      var provider = new firebase.auth.GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });
      var auth = firebase.auth();
      // Guests carry an ANONYMOUS Firebase account whose uid owns their
      // rounds and prefs. A plain signInWithPopup here minted a fresh
      // account and orphaned that work, which is the opposite of the
      // "sign in to keep your rounds" pitch this pill makes. Link the
      // anonymous account like auth-modal.js does; fall back to a plain
      // sign-in only when the Google account already exists.
      var current = auth.currentUser;
      var attempt = current && current.isAnonymous && current.linkWithPopup
        ? current.linkWithPopup(provider).catch(function(err){
            var code = (err && err.code) || '';
            if (code === 'auth/credential-already-in-use' || code === 'auth/email-already-in-use') {
              return auth.signInWithPopup(provider);
            }
            throw err;
          })
        : auth.signInWithPopup(provider);
      attempt.then(function(result){
        rememberMethod('google');
        flushInviteOptIn(result && result.user);
        try {
          if (window.gtag) gtag('event', 'sign_in_complete', { method: 'google', source: 'signup_nudge', path: location.pathname });
        } catch (e) {}
      }).catch(function(){
        try {
          var redirect = current && current.isAnonymous && current.linkWithRedirect
            ? current.linkWithRedirect(provider)
            : auth.signInWithRedirect(provider);
          Promise.resolve(redirect).catch(function(){});
        } catch (e) {}
      });
      try {
        if (window.gtag) gtag('event', 'sign_up_start', { method: 'Google', source: 'signup_nudge', path: location.pathname });
      } catch (e) {}
    } catch (e) {}
  }

  // ── Google One Tap ────────────────────────────────────────────────
  // The native account chip (the visitor's own Google avatar, one click,
  // no popup window) — the highest-converting capture surface Google
  // ships. Runs alongside the pill: it starts at page load while the
  // pill waits out its 6-60s delay, and Chrome's own One Tap backoff
  // suppresses it for visitors who keep dismissing it, so the two rarely
  // stack. Sign-in through it links anonymous accounts the same way the
  // pill and auth-modal do. Skipped in the native shell (no Google web
  // session in WKWebView) and on pages that own their sign-in flow.
  // If it errors (origin not authorized, ITP, FedCM off) it fails
  // silently and the pill cadence is unaffected.
  function onOneTapCredential(resp){
    if (!resp || !resp.credential) return;
    try {
      var cred = firebase.auth.GoogleAuthProvider.credential(resp.credential);
      var auth = firebase.auth();
      var current = auth.currentUser;
      var attempt = current && current.isAnonymous && current.linkWithCredential
        ? current.linkWithCredential(cred).catch(function(err){
            var code = (err && err.code) || '';
            if (code === 'auth/credential-already-in-use' || code === 'auth/email-already-in-use') {
              return auth.signInWithCredential(cred);
            }
            throw err;
          })
        : auth.signInWithCredential(cred);
      attempt.then(function(result){
        rememberMethod('google');
        flushInviteOptIn(result && result.user);
        try {
          if (window.gtag) gtag('event', 'sign_in_complete', { method: 'google_one_tap', path: location.pathname });
        } catch (e) {}
        // Reload so every signed-in surface on the page hydrates — same
        // posture as auth-modal.js finishSignIn.
        setTimeout(function(){ window.location.reload(); }, 400);
      }).catch(function(err){
        try {
          if (window.gtag) gtag('event', 'one_tap_error', { code: (err && err.code) || 'signin_failed' });
        } catch (e) {}
      });
    } catch (e) {}
  }

  function tryOneTap(){
    try {
      if (window.__DB_NATIVE) return;
      if (getConfig().skip) return;
      if (typeof firebase === 'undefined' || !firebase.auth) return;
      if (isRealUser(firebase.auth().currentUser)) return;
      var s = document.createElement('script');
      s.src = 'https://accounts.google.com/gsi/client';
      s.async = true;
      s.defer = true;
      s.onload = function(){
        try {
          if (isRealUser(firebase.auth().currentUser)) return;
          window.google.accounts.id.initialize({
            client_id: ONE_TAP_CLIENT_ID,
            callback: onOneTapCredential,
            cancel_on_tap_outside: false,
            context: 'signin',
            use_fedcm_for_prompt: true
          });
          window.google.accounts.id.prompt(function(moment){
            try {
              if (!window.gtag || !moment) return;
              if (moment.isSkippedMoment && moment.isSkippedMoment()) {
                gtag('event', 'one_tap_skipped', { path: location.pathname });
              } else if (moment.isDismissedMoment && moment.isDismissedMoment()) {
                gtag('event', 'one_tap_dismissed', {
                  reason: (moment.getDismissedReason && moment.getDismissedReason()) || '',
                  path: location.pathname
                });
              }
            } catch (e) {}
          });
          try { if (window.gtag) gtag('event', 'one_tap_attempted', { path: location.pathname }); } catch (e) {}
        } catch (e) {}
      };
      document.head.appendChild(s);
    } catch (e) {}
  }
  // Opening the shared auth modal supersedes One Tap; retract the chip
  // so the two account choosers never show at once.
  window.addEventListener('debatable:authmodal-open', function(){
    try { window.google.accounts.id.cancel(); } catch (e) {}
  });

  var bar = null;

  // The Feedback pill owns the bottom-left slot. Older code lifted it above
  // the signup nudge and could leave it floating halfway up the screen.
  function syncFeedbackPill(){
    var fb = document.querySelector('.fb-floating');
    if (!fb) return;
    fb.style.removeProperty('bottom');
  }
  var _syncBound = false;
  function bindSync(){
    if (_syncBound) return;
    _syncBound = true;
    window.addEventListener('resize', syncFeedbackPill, { passive: true });
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
    // The landing welcome flow (2026-07-09) owns the whole screen while
    // up. Defer until it lifts. The two older guards here tracked the
    // first-visit intro modal, deleted 2026-06-23: one matched a class
    // that no longer renders, the other gated on a localStorage key
    // nothing has written since. Both were permanent no-ops. Removed
    // 2026-07-22.
    if (document.documentElement.getAttribute('data-intro') === '1'){ setTimeout(function(){ mount(attempt); }, 1500); return; }
    injectStyle();
    // Reminders swap the page-contextual line for the benefits pitch:
    // the visitor already saw the ask, so answer "why bother" instead.
    var msg = attempt > 0 ? REMIND_MSGS[Math.min(attempt - 1, REMIND_MSGS.length - 1)] : cfg.msg;
    // A visitor who signed in before but is signed out now (new browser,
    // cleared storage, explicit sign-out) gets recognition instead of
    // the cold pitch: their account already holds the things the pitch
    // promises.
    try {
      if (attempt === 0 && localStorage.getItem(LAST_METHOD_KEY)) {
        msg = '<strong>Welcome back.</strong> Sign in again and your rounds, ballots, and rank pick up where they left off.';
      }
    } catch (e) {}
    bar = document.createElement('div');
    bar.className = 'signup-nudge' + (cfg.variant ? ' signup-nudge--' + cfg.variant : '');
    bar.setAttribute('role', 'dialog');
    bar.setAttribute('aria-label', 'Sign in with Google to save your work');
    var optin = cfg.inviteOptIn
      ? '<label class="su-optin"><input type="checkbox"> <span>Email me occasional round invites and product updates.</span></label>'
      : '';
    bar.innerHTML =
      '<span class="su-line">' + msg.replace(/^(Sign in[^.]*\.)/, '<strong>$1</strong>') + '</span>' +
      optin +
      '<button type="button" class="su-cta"><svg class="su-g" viewBox="0 0 18 18" aria-hidden="true"><path fill="#4285F4" d="M17.6 9.2c0-.6-.1-1.2-.2-1.7H9v3.2h4.8a4.1 4.1 0 0 1-1.8 2.7v2.2h2.9c1.7-1.6 2.7-3.8 2.7-6.4Z"/><path fill="#34A853" d="M9 18c2.4 0 4.5-.8 6-2.2l-2.9-2.2c-.8.5-1.8.9-3.1.9-2.3 0-4.3-1.6-5-3.7H1v2.3A9 9 0 0 0 9 18Z"/><path fill="#FBBC05" d="M4 10.8a5.4 5.4 0 0 1 0-3.6V4.9H1a9 9 0 0 0 0 8.2l3-2.3Z"/><path fill="#EA4335" d="M9 3.6c1.3 0 2.5.5 3.4 1.3L15 2.3A8.6 8.6 0 0 0 9 0a9 9 0 0 0-8 4.9l3 2.3c.7-2.1 2.7-3.6 5-3.6Z"/></svg>Continue with Google</button>' +
      '<button type="button" class="su-close" aria-label="Dismiss">×</button>';
    document.body.appendChild(bar);
    document.body.classList.add('signup-nudge-open');
    bumpSessionAttempts();
    requestAnimationFrame(function(){
      bar.classList.add('is-in');
      // Measure after is-in is applied so the pill lift matches real height.
      requestAnimationFrame(function(){ syncFeedbackPill(); bindSync(); });
    });
    bar.querySelector('.su-cta').addEventListener('click', function(){ doSignIn(cfg); });
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
    document.body.classList.remove('signup-nudge-open');
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
  //   window.dispatchEvent(new CustomEvent('debatable:maybe-later'))
  window.addEventListener('debatable:maybe-later', function(){
    markDismissed();
    armReminder(Math.max(1, sessionAttempts()));
  });

  function start(){
    // One Tap runs regardless of the pill's dismissal cooloff: it is a
    // different surface with Chrome's own escalating backoff (a visitor
    // who closes it gets hours-to-weeks of native quiet), so gating it
    // on the pill's 24h key would only starve the higher-converting
    // surface to protect the lower one.
    tryOneTap();
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
