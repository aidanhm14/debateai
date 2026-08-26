/* ──────────────────────────────────────────────────────────────────
   signin-wall.js — the 45-second account wall.

   Founder call, 2026-08-26: "require google sign in after 45 seconds
   on the site, I need to convert the anonymous." So this is a WALL,
   not a nudge. There is no ×, Escape does nothing, a backdrop click
   does nothing, and the page behind it stops scrolling. The visitor
   signs in or they are done reading.

   It is deliberately NOT a wall at the door. The 2026-04-20 reversal
   is still right about full-screen gates on arrival, and its failure
   mode (Safari ITP, in-app browsers, blocked Firebase) is real. This
   arrives after 45 seconds of the visitor actually reading the site,
   which is a different object: they have seen what the account is for
   before they are asked to make one.

   WHAT THE 45 SECONDS MEANS. Visible seconds, not wall clock, and
   cumulative across pages inside one browser session. A backgrounded
   tab accumulates nothing, so a parked tab is never walled and a
   prerendered one is never walled. Someone who reads three pages for
   fifteen seconds each is walled on the third, which is the intent:
   the budget is time on the SITE, not time on a page.

   WHAT IT REUSES. The wall IS js/auth-modal.js opened with
   {locked:true}. Every provider, the anonymous-account linking dance,
   the in-app-browser warning, the emailed-link round trip and the
   error copy are the ones already proven there. A second sign-in card
   is the duplication the founder has cut twice; there is one chooser
   on this site and this opens it.

   WHO IS EXEMPT.
     - anyone with a NAMED account. An anonymous Firebase user is not
       signed in: js/notifications.js mints one on nearly every page,
       so `!!currentUser` here means "has a browser".
     - the native app (its own auth chooser, and an App Store review
       surface).
     - automation. A crawler cannot sign in, and a wall it can see is
       an interstitial Google has an opinion about. Between the
       webdriver flag, the UA test and the fact that no crawler
       accumulates 45 visible seconds, this never renders for one.
     - the surfaces in SKIP_PATHS: anything with a round running in
       it, anything that owns its own sign-in gate, the legal pages
       (walling the privacy policy is the wrong way round when the
       question it answers is whether to make an account), and admin.
     - anyone with a live round riding along in the picture-in-picture
       site shell.

   KILL SWITCH. WALL_SECONDS is the dial; DISABLED = true is the off
   switch; ?wall=off (or localStorage 'debatable-signin-wall' = 'off')
   turns it off for one browser, which is also the QA escape.

   GA4: signin_wall_shown / signin_wall_converted. Read them against
   each other. If shown is large and converted is small, the wall is
   costing readers and buying nothing, and the answer is a better wall
   or a later one, not a wider exemption.
   ────────────────────────────────────────────────────────────────── */
(function () {
  'use strict';
  if (window.__ditSigninWall) return;
  window.__ditSigninWall = true;

  var DISABLED = false;
  var WALL_SECONDS = 45;          // visible seconds on the site, cumulative
  var SETTLE_MS = 1200;           // let a page paint before re-walling a returner
  var TICK_MS = 1000;

  var SPENT_KEY = 'debatable-wall-seconds';
  var SHOWN_KEY = 'debatable-wall-shown';
  var OFF_KEY = 'debatable-signin-wall';

  // Every path here is excluded for a stated reason, not for tidiness.
  var SKIP_PATHS = [
    // A round is running on these. A wall over a live speech is
    // sabotage, and the AI lane already meters rounds server-side.
    /^\/(live-round|voice-debate|newvoice|room-judge|casual-room|exhibition|practice|coach|live)(?:\.html)?(?:[/?#]|$)/,
    // These own their own sign-in gate. Two gates read as broken.
    /^\/(spar|partners|debate-chat)(?:\.html)?(?:[/?#]|$)/,
    // Legal text. Someone reading the privacy policy is deciding
    // whether to trust us with an account; blocking that answer
    // behind the account is backwards.
    /^\/(privacy|terms)(?:\.html)?(?:[/?#]|$)/,
    // Not visitor surfaces.
    /^\/(admin|offline|og-image|native|god|_more-preview)/
  ];

  function off() {
    try {
      if (/[?&]wall=off(?:&|$)/.test(location.search)) return true;
      if (localStorage.getItem(OFF_KEY) === 'off') return true;
    } catch (e) {}
    return false;
  }

  // ?wall=<seconds> retimes it for QA. Bounded so a shared link cannot
  // hand someone a wall on arrival: the floor is 3 seconds and it can
  // only be used to make the wall come SOONER than the real one.
  (function qaOverride() {
    try {
      var m = /[?&]wall=(\d{1,4})(?:&|$)/.exec(location.search);
      if (!m) return;
      var n = parseInt(m[1], 10);
      if (n >= 3 && n <= WALL_SECONDS) WALL_SECONDS = n;
    } catch (e) {}
  })();

  function skippedPath() {
    var p = location.pathname || '/';
    for (var i = 0; i < SKIP_PATHS.length; i++) if (SKIP_PATHS[i].test(p)) return true;
    // Mid-flight emailed sign-in link: auth-modal.js is finishing the
    // trip on this load. Walling someone who is already signing in.
    if (/[?&]oobCode=/.test(location.search)) return true;
    return false;
  }

  function automated() {
    try {
      if (navigator.webdriver) return true;
      return /bot|crawl|spider|slurp|headless|lighthouse|preview|monitor|pingdom|gtmetrix/i
        .test(navigator.userAgent || '');
    } catch (e) { return false; }
  }

  // A round riding along in the site shell or the docked mini player.
  function roundInFlight() {
    try {
      return !!(document.getElementById('lpip-shellbar') ||
                document.getElementById('lpip-mini') ||
                document.documentElement.classList.contains('lpip-shell-on'));
    } catch (e) { return false; }
  }

  // Another sign-in surface, an onboarding modal or a consent card is
  // already on screen. Wait rather than stack.
  function surfaceBusy() {
    try {
      if (document.body.classList.contains('signin-modal-open')) return true;
      if (document.querySelector('.ob-modal.is-open')) return true;
      if (document.documentElement.getAttribute('data-intro') === '1') return true;
    } catch (e) {}
    return false;
  }

  if (DISABLED) return;
  if (window.__DB_NATIVE) return;
  if (off() || automated() || skippedPath()) return;

  // signup-nudge.js stands down when this is armed. One ask, not a
  // dismissible one at 7 seconds followed by an undismissable one at
  // 45, which burns the first ask and reads as a bait and switch.
  window.__ditSigninWallArmed = true;

  function spent() {
    try { return parseInt(sessionStorage.getItem(SPENT_KEY), 10) || 0; } catch (e) { return 0; }
  }
  function setSpent(v) {
    try { sessionStorage.setItem(SPENT_KEY, String(v)); } catch (e) {}
  }
  function alreadyShown() {
    try { return sessionStorage.getItem(SHOWN_KEY) === '1'; } catch (e) { return false; }
  }
  function track(ev, meta) { try { if (window.gtag) gtag('event', ev, meta || {}); } catch (e) {} }

  function named(u) { return !!(u && !u.isAnonymous); }

  var fired = false, timer = null, seconds = spent(), signedIn = false;

  // topbar.js injects the chooser on the ~111 pages it rides. The
  // handful of standalone pages that carry this script directly have no
  // topbar, so pull it here rather than let the wall fire into nothing.
  function ensureChooser() {
    if (typeof window.openAuthModal === 'function') return;
    if (document.querySelector('script[src*="/js/auth-modal.js"]')) return;
    var s = document.createElement('script');
    s.src = '/js/auth-modal.js';
    s.defer = true;
    document.head.appendChild(s);
  }

  var waitingForChooser = 0;
  function show() {
    if (fired || signedIn) return;
    if (typeof window.openAuthModal !== 'function') {
      ensureChooser();
      // Bounded. A chooser that never arrives means no wall, not a
      // timer spinning for the rest of the visit.
      if (waitingForChooser++ < 25) setTimeout(show, 400);
      return;
    }
    if (surfaceBusy() || roundInFlight()) { setTimeout(show, 2000); return; }
    fired = true;
    stop();
    try { sessionStorage.setItem(SHOWN_KEY, '1'); } catch (e) {}
    track('signin_wall_shown', { path: location.pathname, seconds: seconds });
    window.openAuthModal('signup', {
      locked: true,
      // Neutral on purpose: the chooser lets someone flip between
      // creating an account and signing in without the headline going
      // stale, and either one ends the wall.
      headline: 'Sign in to keep going',
      sub: 'Free, and it takes one tap. Rounds, ballots, XP and your place on the board all live on the account, so nothing you do here is lost.'
    });
  }

  function stop() {
    if (timer) { clearInterval(timer); timer = null; }
  }

  function tick() {
    if (signedIn || fired) { stop(); return; }
    if (document.hidden) return;          // hidden time is not time on the site
    if (roundInFlight()) return;          // a live round is not browsing
    seconds += TICK_MS / 1000;
    setSpent(seconds);
    if (seconds >= WALL_SECONDS) show();
  }

  function start() {
    if (timer || fired || signedIn) return;
    // Budget already spent earlier this session: wall on arrival, but
    // let the page paint first so it is clear what is being walled.
    if (seconds >= WALL_SECONDS) { setTimeout(show, SETTLE_MS); return; }
    timer = setInterval(tick, TICK_MS);
  }

  // Firebase may never load (Safari ITP, blockers, an in-app browser).
  // Those visitors are exactly who the 2026-04-20 reversal was written
  // for, so the wall waits for a real answer about who they are and
  // starts the clock anyway if none arrives.
  var decided = false;
  function decide(user) {
    signedIn = named(user);
    if (signedIn) {
      stop();
      // The wall showed earlier this session and this person signed in
      // after it. That is the number the wall lives or dies on.
      if (alreadyShown()) {
        try { sessionStorage.removeItem(SHOWN_KEY); } catch (e) {}
        track('signin_wall_converted', { path: location.pathname });
      }
      try { sessionStorage.removeItem(SPENT_KEY); } catch (e) {}
      return;
    }
    if (!decided) { decided = true; start(); }
  }

  function watchAuth() {
    try {
      if (typeof firebase === 'undefined' || !firebase.auth || !firebase.apps || !firebase.apps.length) return false;
      firebase.auth().onAuthStateChanged(decide);
      return true;
    } catch (e) { return false; }
  }

  var waited = 0;
  var poll = setInterval(function () {
    waited += 300;
    if (watchAuth() || waited >= 6000) {
      clearInterval(poll);
      if (!decided) { decided = true; start(); }
    }
  }, 300);
  if (watchAuth()) { clearInterval(poll); }
  // Listener attached but never answered (an auth SDK that loads and
  // then stalls). Start the clock rather than leaving the wall dead.
  setTimeout(function () { if (!decided) { decided = true; start(); } }, 6500);
})();
