/* ──────────────────────────────────────────────────────────────────
   Cross-page account sign-up nudge for unsigned visitors.

   Drop <script defer src="/js/signup-nudge.js"></script> on any
   page where you want a soft "sign up to save your stuff" prompt
   for unsigned users. The script:

     1. Waits 10 seconds of VISIBLE-tab time and at least one
        scroll (see armInitial). Tool pages that were already
        deliberately patient keep their longer delay.
     2. Reads Firebase auth state. If a user is already signed
        in, never mounts. If Firebase isn't loaded on this page,
        skips silently — this isn't a hard requirement.
     3. Checks a single localStorage flag so a dismissal on /
        carries to /practice and back.
     4. Picks copy based on URL path: landing, debate-ai, voice,
        learn, etc. each get a contextual line about WHAT the
        user is being asked to save.
     5. Mounts a CENTERED modal over a blurred page (2026-08-12,
        replacing the bottom-right pill this used to be) with a
        Google CTA, a "Not now", and a × dismiss. Escape and a
        click on the blurred page both dismiss.

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
  // Seconds of visible-tab time before the first prompt (2026-08-12).
  var TRIGGER_SECONDS = 10;
  // The reminder cadence was tuned for a corner pill. This surface takes the
  // whole screen, so it comes back later and fewer times: 150s of real
  // interaction instead of 60, and one reminder instead of two. Three
  // full-screen interruptions in a session is a different product.
  var REMIND_ACTIVE_SECONDS = 150;  // active-use seconds before a re-nudge
  var MAX_ATTEMPTS_PER_SESSION = 2; // initial + one reminder

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
  // `delay` is now a FLOOR that only applies when it is 30s or more (see
  // armInitial): everything faster than that is normalised to the 10-second
  // scroll trigger, and the patient tool-page delays are kept because a
  // full-screen modal cannot interrupt a spoken round.
  // `variant` no longer changes the styling, only the GA4 label.
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
      // 2026-08-11 this was 3s, put deliberately early while intent was
      // fresh. 2026-08-12 the surface became a full-screen modal and the
      // trigger moved to 10 seconds plus a scroll: at 3 seconds the modal
      // would cover the hero before anyone had read it. The hero still
      // carries its own Google row, so this stays the second touch, and the
      // copy still leads with what an account buys.
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
    // /debate-online has a persistent Google button in the first screen.
    // Offer native One Tap on arrival, but do not stack the floating pill
    // over that inline account path.
    { match: /^\/debate-online(?:\.html)?(?:[/?#]|$)/,
      inlineAuth: true,
      msg: '<strong>Join the debate pool with Google.</strong> Enter the human queue, keep every ballot, and use AI fallback when the queue is quiet.' },
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

  // Self-contained CSS — injected once. The prompt is a CENTERED modal over
  // a blurred page (2026-08-12), replacing the bottom-right pill that shipped
  // here before. The blur is a backdrop-filter on the overlay rather than a
  // filter on the page body: filtering the body creates a containing block
  // for fixed-position children, which would drag the topbar and any open
  // player into the blurred layer and break their positioning.
  function injectStyle(){
    if (document.getElementById('signupNudgeStyle')) return;
    var s = document.createElement('style');
    s.id = 'signupNudgeStyle';
    s.textContent =
      '.signup-nudge{position:fixed;inset:0;z-index:100000;display:flex;align-items:center;justify-content:center;padding:20px;font-family:"Crimson Pro","Inter",system-ui,-apple-system,sans-serif;opacity:0;transition:opacity .22s ease}' +
      '.signup-nudge.is-in{opacity:1}' +
      '.signup-nudge .su-veil{position:absolute;inset:0;background:rgba(12,8,9,.44);backdrop-filter:blur(9px) saturate(.9);-webkit-backdrop-filter:blur(9px) saturate(.9)}' +
      // Browsers without backdrop-filter (older Firefox) get a heavier dim so
      // the card still separates from the page instead of floating on text.
      '@supports not ((backdrop-filter:blur(2px)) or (-webkit-backdrop-filter:blur(2px))){.signup-nudge .su-veil{background:rgba(12,8,9,.78)}}' +
      '.signup-nudge .su-card{position:relative;width:min(460px,100%);max-height:calc(100vh - 40px);overflow-y:auto;padding:30px 30px 26px;border-radius:20px;background:#fff;color:#1a1a1f;border:1px solid rgba(220,38,38,.34);box-shadow:0 30px 80px rgba(0,0,0,.34);text-align:left;transform:translateY(10px) scale(.985);transition:transform .24s cubic-bezier(.2,.8,.3,1)}' +
      '.signup-nudge.is-in .su-card{transform:none}' +
      // padding-right keeps the first line clear of the × button, which sits
      // absolutely in the same corner and would otherwise be run into by a
      // long headline at narrow widths.
      '.signup-nudge .su-title{margin:0 0 10px;padding-right:34px;font-size:1.42rem;line-height:1.22;font-weight:700;letter-spacing:-.01em;color:#15151a}' +
      '.signup-nudge .su-line{margin:0;font-size:1.02rem;line-height:1.45;color:rgba(0,0,0,.68)}' +
      '.signup-nudge .su-line strong{color:#15151a;font-weight:700}' +
      '.signup-nudge .su-optin{display:flex;align-items:flex-start;gap:9px;margin:18px 0 0;font-size:.86rem;line-height:1.4;color:rgba(0,0,0,.62);cursor:pointer}' +
      '.signup-nudge .su-optin input{width:16px;height:16px;margin:2px 0 0;accent-color:#dc2626;flex:none}' +
      '.signup-nudge .su-actions{display:flex;align-items:center;gap:14px;margin:20px 0 0;flex-wrap:wrap}' +
      '.signup-nudge .su-cta{display:inline-flex;align-items:center;justify-content:center;gap:9px;padding:12px 22px;border:none;border-radius:999px;cursor:pointer;background:#dc2626;color:#fff;font-family:inherit;font-size:1rem;font-weight:700;letter-spacing:.01em}' +
      '.signup-nudge .su-cta:hover{background:#b91c1c}' +
      '.signup-nudge .su-g{width:18px;height:18px;flex:none;background:#fff;border-radius:50%;padding:2px;box-sizing:border-box}' +
      '.signup-nudge .su-later{border:none;background:transparent;padding:6px 2px;cursor:pointer;font-family:inherit;font-size:.92rem;color:rgba(0,0,0,.55);text-decoration:underline;text-underline-offset:3px}' +
      '.signup-nudge .su-later:hover{color:#15151a}' +
      '.signup-nudge .su-close{position:absolute;top:12px;right:12px;width:34px;height:34px;border:none;background:transparent;border-radius:50%;color:rgba(0,0,0,.5);cursor:pointer;font-size:1.35rem;line-height:1;font-family:inherit}' +
      '.signup-nudge .su-close:hover{background:rgba(0,0,0,.06);color:#15151a}' +
      '.signup-nudge :focus-visible{outline:2px solid #dc2626;outline-offset:2px}' +
      // Dark surfaces: the card inverts so it does not glare on a black page.
      '[data-theme="dark"] .signup-nudge .su-card{background:#171113;color:#fff;border-color:rgba(220,38,38,.46);box-shadow:0 30px 80px rgba(0,0,0,.6)}' +
      '[data-theme="dark"] .signup-nudge .su-title{color:#fff}' +
      '[data-theme="dark"] .signup-nudge .su-line{color:rgba(255,255,255,.76)}' +
      '[data-theme="dark"] .signup-nudge .su-line strong{color:#fff}' +
      '[data-theme="dark"] .signup-nudge .su-optin{color:rgba(255,255,255,.66)}' +
      '[data-theme="dark"] .signup-nudge .su-later{color:rgba(255,255,255,.62)}' +
      '[data-theme="dark"] .signup-nudge .su-later:hover{color:#fff}' +
      '[data-theme="dark"] .signup-nudge .su-close{color:rgba(255,255,255,.62)}' +
      '[data-theme="dark"] .signup-nudge .su-close:hover{background:rgba(255,255,255,.08);color:#fff}' +
      // A sign-in modal owns the screen while open; never stack this under it.
      'body.signin-modal-open .signup-nudge{display:none!important}' +
      // The page is locked while the modal is up, so nothing else should be
      // competing for a tap: the floating Feedback pill yields and returns.
      'body.signup-nudge-open .fb-floating{display:none!important}' +
      '@media (prefers-reduced-motion:reduce){.signup-nudge,.signup-nudge .su-card{transition:none}}' +
      '@media (max-width:520px){.signup-nudge{padding:14px}.signup-nudge .su-card{padding:26px 20px 22px;border-radius:16px}.signup-nudge .su-title{font-size:1.24rem}.signup-nudge .su-line{font-size:.96rem}.signup-nudge .su-actions{gap:10px}.signup-nudge .su-cta{width:100%}.signup-nudge .su-later{width:100%;text-align:center}}';
    document.head.appendChild(s);
  }

  // The pageConfig lines are one string ("<strong>Headline.</strong> Body.").
  // The modal needs them as two, so split on the leading <strong> when there
  // is one and on the first sentence when there is not.
  function splitMsg(msg){
    var m = /^\s*<strong>([\s\S]*?)<\/strong>\s*([\s\S]*)$/.exec(msg || '');
    if (m) return { title: m[1], body: m[2] };
    m = /^\s*([^.!?]+[.!?])\s*([\s\S]*)$/.exec(msg || '');
    if (m) return { title: m[1], body: m[2] };
    return { title: msg || '', body: '' };
  }

  function isRealUser(user){
    return !!(user && !user.isAnonymous);
  }

  function rememberInviteChoice(cfg){
    if (!cfg.inviteOptIn || !bar) return;
    try {
      var optin = bar.querySelector('.su-optin input, .sum-optin input');
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

  function doSignIn(cfg, source){
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
      // Every sign-in surface offers the same choices. The shared modal
      // carries Google, an emailed link, and email/password; this Google
      // popup stays as the fallback for a page that loads without it.
      if (typeof window.openAuthModal === 'function') { window.openAuthModal(); return; }
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
          if (window.gtag) gtag('event', 'sign_in_complete', { method: 'google', source: source || 'signup_nudge', path: location.pathname });
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
        if (window.gtag) gtag('event', 'sign_up_start', { method: 'Google', source: source || 'signup_nudge', path: location.pathname });
      } catch (e) {}
    } catch (e) {}
  }

  // Public hook for first-screen Google buttons on acquisition pages. It
  // deliberately reuses this module's anonymous-account linking and mobile
  // redirect fallback instead of creating a second auth implementation.
  window.debatableGoogleSignIn = function(source){
    if (typeof firebase !== 'undefined' && firebase.auth){
      doSignIn(getConfig(), source || 'inline_google');
      return;
    }
    // If the content-page Firebase bootstrap is still in flight, preserve
    // the user's click by opening the shared modal. Its Google button gives
    // the account chooser a fresh user gesture after auth is ready.
    if (typeof window.openAuthModal === 'function'){
      window.openAuthModal('signin');
      return;
    }
    var attempts = 0;
    var wait = setInterval(function(){
      attempts += 1;
      if (typeof window.openAuthModal === 'function'){
        clearInterval(wait);
        window.openAuthModal('signin');
      } else if (attempts >= 30) clearInterval(wait);
    }, 100);
  };

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
            context: 'signin'
          });
          // FedCM owns the prompt UI. Do not depend on legacy display/skip
          // moment callbacks, which Google is removing from the API.
          window.google.accounts.id.prompt();
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
    // One account chooser at a time: the native One Tap chip is retracted so
    // it does not sit on top of a modal asking for the same thing.
    try { window.google.accounts.id.cancel(); } catch (e) {}
    var parts = splitMsg(msg);
    bar = document.createElement('div');
    bar.className = 'signup-nudge' + (cfg.variant ? ' signup-nudge--' + cfg.variant : '');
    bar.setAttribute('role', 'dialog');
    bar.setAttribute('aria-modal', 'true');
    bar.setAttribute('aria-label', 'Sign in with Google to save your work');
    var optin = cfg.inviteOptIn
      ? '<label class="su-optin"><input type="checkbox"> <span>Email me occasional round invites and product updates.</span></label>'
      : '';
    bar.innerHTML =
      '<div class="su-veil"></div>' +
      '<div class="su-card">' +
        '<button type="button" class="su-close" aria-label="Dismiss">×</button>' +
        '<h2 class="su-title">' + parts.title + '</h2>' +
        (parts.body ? '<p class="su-line">' + parts.body + '</p>' : '') +
        optin +
        '<div class="su-actions">' +
          '<button type="button" class="su-cta"><svg class="su-g" viewBox="0 0 18 18" aria-hidden="true"><path fill="#4285F4" d="M17.6 9.2c0-.6-.1-1.2-.2-1.7H9v3.2h4.8a4.1 4.1 0 0 1-1.8 2.7v2.2h2.9c1.7-1.6 2.7-3.8 2.7-6.4Z"/><path fill="#34A853" d="M9 18c2.4 0 4.5-.8 6-2.2l-2.9-2.2c-.8.5-1.8.9-3.1.9-2.3 0-4.3-1.6-5-3.7H1v2.3A9 9 0 0 0 9 18Z"/><path fill="#FBBC05" d="M4 10.8a5.4 5.4 0 0 1 0-3.6V4.9H1a9 9 0 0 0 0 8.2l3-2.3Z"/><path fill="#EA4335" d="M9 3.6c1.3 0 2.5.5 3.4 1.3L15 2.3A8.6 8.6 0 0 0 9 0a9 9 0 0 0-8 4.9l3 2.3c.7-2.1 2.7-3.6 5-3.6Z"/></svg>Continue with Google</button>' +
          '<button type="button" class="su-later">Not now</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(bar);
    lockScroll();
    document.body.classList.add('signup-nudge-open');
    bumpSessionAttempts();
    requestAnimationFrame(function(){
      bar.classList.add('is-in');
      requestAnimationFrame(function(){ syncFeedbackPill(); bindSync(); });
    });

    var cta = bar.querySelector('.su-cta');
    cta.addEventListener('click', function(){ doSignIn(cfg); });
    var dismiss = function(how){
      markDismissed();
      unmount();
      try {
        if (window.gtag) gtag('event', 'signup_nudge_dismissed', { path: location.pathname, attempt: attempt, method: how });
      } catch (e) {}
      armReminder(attempt + 1);
    };
    bar.querySelector('.su-close').addEventListener('click', function(){ dismiss('close'); });
    bar.querySelector('.su-later').addEventListener('click', function(){ dismiss('later'); });
    // Clicking the blurred page behind the card dismisses, same as Escape.
    // Both are "not now" and both feed the reminder cadence.
    bar.querySelector('.su-veil').addEventListener('click', function(){ dismiss('backdrop'); });
    _onKey = function(e){
      if (e.key === 'Escape'){ dismiss('escape'); return; }
      if (e.key !== 'Tab' || !bar) return;
      // Keep focus inside the card while it owns the screen.
      var f = bar.querySelectorAll('button, input, a[href]');
      if (!f.length) return;
      var first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first){ e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last){ e.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', _onKey, true);
    _lastFocus = document.activeElement;
    try { cta.focus({ preventScroll: true }); } catch (e) {}

    try {
      if (window.gtag) gtag('event', 'signup_nudge_shown', { path: location.pathname, variant: attempt > 0 ? 'reminder' : (cfg.variant || 'standard'), delay: cfg.delay, attempt: attempt, surface: 'center_modal' });
    } catch (e) {}
  }

  // Scroll lock. The page is blurred behind the card, so letting it scroll
  // underneath reads as a rendering fault; the scroll position is restored on
  // close because position:fixed on <body> otherwise jumps the visitor to the
  // top of the page they were reading.
  var _scrollY = 0;
  var _locked = false;
  var _onKey = null;
  var _lastFocus = null;
  function lockScroll(){
    if (_locked) return;
    _locked = true;
    _scrollY = window.pageYOffset || document.documentElement.scrollTop || 0;
    var b = document.body;
    b.style.position = 'fixed';
    b.style.top = (-_scrollY) + 'px';
    b.style.left = '0';
    b.style.right = '0';
    b.style.width = '100%';
  }
  function unlockScroll(){
    if (!_locked) return;
    _locked = false;
    var b = document.body;
    b.style.removeProperty('position');
    b.style.removeProperty('top');
    b.style.removeProperty('left');
    b.style.removeProperty('right');
    b.style.removeProperty('width');
    window.scrollTo(0, _scrollY);
  }

  function unmount(){
    if (!bar) return;
    if (_onKey){ document.removeEventListener('keydown', _onKey, true); _onKey = null; }
    unlockScroll();
    document.body.classList.remove('signup-nudge-open');
    bar.classList.remove('is-in');
    var ref = bar;
    setTimeout(function(){ if (ref && ref.parentNode) ref.parentNode.removeChild(ref); }, 260);
    bar = null;
    try { if (_lastFocus && _lastFocus.focus) _lastFocus.focus({ preventScroll: true }); } catch (e) {}
    _lastFocus = null;
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

  var startAttempts = 0;
  function start(){
    // Content pages get Firebase asynchronously from topbar.js and
    // notifications.js. Wait briefly rather than permanently skipping One
    // Tap because those shared bootstraps finished after DOMContentLoaded.
    if (typeof firebase === 'undefined' || !firebase.auth){
      startAttempts += 1;
      if (startAttempts <= 80) setTimeout(start, 100);
      return;
    }
    // One Tap runs regardless of the pill's dismissal cooloff: it is a
    // different surface with Chrome's own escalating backoff (a visitor
    // who closes it gets hours-to-weeks of native quiet), so gating it
    // on the pill's 24h key would only starve the higher-converting
    // surface to protect the lower one.
    tryOneTap();
    var cfg = getConfig();
    if (cfg.inlineAuth) return;
    if (recentlyDismissed()) return;

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

    armInitial(cfg);
  }

  // 2026-08-12, per Aidan: the prompt arrives "10 seconds into site
  // scrolling". Two conditions, not one timer. Seconds are counted only while
  // the tab is VISIBLE, so a background tab left open all afternoon does not
  // greet the visitor with a modal the moment they return to it. And on a page
  // long enough to scroll, at least one scroll is required, so the modal
  // follows engagement rather than landing on someone who has not read a
  // sentence yet. A page too short to scroll waives that half rather than
  // suppressing the prompt forever.
  function armInitial(cfg){
    // Tool pages that were already deliberately patient (voice rounds at 60s,
    // /learn at 30s) keep their delay: a full-screen modal 10 seconds into a
    // spoken round would interrupt the product mid-sentence.
    var seconds = (cfg.delay && cfg.delay >= 30) ? cfg.delay : TRIGGER_SECONDS;
    var scrollable = (document.documentElement.scrollHeight - window.innerHeight) > 120;
    var scrolled = !scrollable;
    var onScroll = function(){ scrolled = true; };
    if (scrollable) window.addEventListener('scroll', onScroll, { passive: true });
    var elapsed = 0;
    var timer = setInterval(function(){
      if (document.hidden) return;
      elapsed += 1;
      if (elapsed < seconds || !scrolled) return;
      clearInterval(timer);
      window.removeEventListener('scroll', onScroll);
      // Re-check just before mounting in case auth resolved during the wait.
      try {
        if (isRealUser(firebase.auth().currentUser)) return;
      } catch (e) { return; }
      mount(0);
    }, 1000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
