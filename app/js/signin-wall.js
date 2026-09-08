/* Account ask, 2026-09-08. Five visible minutes across pages, then the
   shared chooser opens LOCKED: no x, Escape does nothing, a backdrop click
   does nothing, and the page behind it stops scrolling.

   The history matters, because this is the third position on one control.
   It was a locked wall at 45s from 2026-08-26. On 2026-09-07 the founder
   unlocked it and moved it to 3 minutes so readers stayed on the page for
   search dwell instead of bouncing off a wall. On 2026-09-08 he asked to
   require the account again, at five minutes: "require a sign in after 5
   mins on site without doing anything, esp if they are into it."

   FIVE MINUTES IS WHAT RECONCILES THOSE TWO CALLS, so do not shorten it
   and keep the lock. The pogo-sticking risk that unlocked this is a risk
   about SKIMMERS: someone who meets a wall early, goes back to the search
   results, and takes the ranking down with them. Nobody reads for five
   visible minutes and then pogo-sticks; by then the dwell Google measures
   has already been spent. What is left at five minutes is a reader who is
   into it, and that is the one this is allowed to stop. Moving the number
   down without unlocking puts it back in front of skimmers.

   VISIBLE seconds, cumulative across pages in one browser session. A
   backgrounded tab accumulates nothing, so a parked or prerendered tab is
   never asked, and no crawler gets near the budget.

   IT NEVER LANDS MID-SENTENCE. A locked card that steals focus while
   someone is typing costs them the sentence and they cannot even close it
   to finish, so an active text field defers the ask to a later tick.
   A live round, a round riding in the site shell, and every surface that
   owns its own gate are exempt outright.

   It reuses js/auth-modal.js: every provider, the anonymous-account
   linking dance, the in-app-browser warning and the emailed-link round
   trip are the ones already proven there. There is one chooser on this
   site and this opens it.

   Google-only live-video pairing lives on /spar and the server, not here.
   AI starts have their own immediate account gate, server checks included.

   KILL SWITCH: LOCKED = false restores the closable 2026-09-07 ask without
   touching anything else. GA4: signin_wall_shown / signin_wall_converted.
   Read them against each other, and against organic dwell. */
(function () {
  'use strict';
  if (window.__ditSigninWall) return;
  window.__ditSigninWall = true;
  if (window.__DB_NATIVE) return;
  var SKIP_PATHS = [
    // Human rooms own entry. Never put an account ask over a live speech.
    /^\/(live-round|live|casual-room|stage|studio|room-judge)(?:\.html)?(?:\/|$)/,
    // Voice owns its brief exchange and the account ask that follows.
    /^\/newvoice(?:\.html)?(?:\/|$)/,
    // These pages already require an account at the door.
    /^\/(partners|debate-chat)(?:\.html)?(?:\/|$)/,
    /^\/(privacy|terms)(?:\.html)?(?:\/|$)/,
    /^\/(admin|offline|og-image|native|god|_more-preview)/
  ];
  if (SKIP_PATHS.some(function (rule) { return rule.test(location.pathname); })) return;
  if (/[?&]oobCode=/.test(location.search)) return;
  if (/bot|crawl|spider|slurp|lighthouse|preview|monitor|pingdom|gtmetrix/i.test(navigator.userAgent || '')) return;
  window.__ditSigninWallArmed = true;
  var WALL_SECONDS = 300;   // five visible minutes; see the head
  var LOCKED = true;        // the ask has no dismissal at this length
  var SPENT_KEY = 'debatable-wall-seconds';
  var SHOWN_KEY = 'debatable-wall-shown';
  var seconds = 0, shown = false, signedIn = false, watching = false;
  var lastTick = performance.now(), wasVisible = !document.hidden;
  try { seconds = Math.max(0, Number(sessionStorage.getItem(SPENT_KEY)) || 0); } catch (e) {}
  // Asked and closed earlier this session: do not ask again on this page.
  try { shown = sessionStorage.getItem(SHOWN_KEY) === '1'; } catch (e) {}

  function track(event, meta) { try { if (window.gtag) window.gtag('event', event, meta); } catch (e) {} }
  function named(user) { return !!(user && !user.isAnonymous); }
  function currentUser() {
    try { return window.firebase && firebase.auth && firebase.apps.length ? firebase.auth().currentUser : null; }
    catch (e) { return null; }
  }
  function roundInFlight() {
    return !!(document.getElementById('lpip-shellbar') || document.getElementById('lpip-mini') ||
      document.documentElement.classList.contains('lpip-shell-on') || window.__debatableRoundInFlight);
  }
  function persist() {
    try { sessionStorage.setItem(SPENT_KEY, String(Math.min(seconds, WALL_SECONDS))); } catch (e) {}
  }
  function decide(user) {
    signedIn = named(user);
    if (!signedIn) return;
    seconds = 0;
    var converted = shown;
    try {
      converted = converted || sessionStorage.getItem(SHOWN_KEY) === '1';
      sessionStorage.removeItem(SHOWN_KEY);
      sessionStorage.removeItem(SPENT_KEY);
    } catch (e) {}
    shown = false;
    if (converted) track('signin_wall_converted', { path: location.pathname });
    // Also release a wall if the account was restored in another tab.
    if (window.closeDebatableSigninWall) window.closeDebatableSigninWall();
  }
  function watchAuth() {
    if (watching) return;
    try {
      if (!window.firebase || !firebase.auth || !firebase.apps.length) return;
      watching = true;
      firebase.auth().onAuthStateChanged(decide);
    } catch (e) { watching = false; }
  }
  function ensureChooser() {
    if (window.openAuthModal || document.querySelector('script[src*="/js/auth-modal.js"]')) return;
    var script = document.createElement('script');
    script.src = '/js/auth-modal.js';
    script.addEventListener('error', function () { script.remove(); }, { once: true });
    document.head.appendChild(script);
  }
  function show() {
    if (shown || signedIn || document.hidden || roundInFlight() || !document.body) return;
    if (named(currentUser())) { decide(currentUser()); return; }
    // Let an existing account ask finish. Dismissal does not reset the budget.
    if (document.body.classList.contains('signin-modal-open') ||
        document.documentElement.classList.contains('da-debate-invite-open') ||
        document.querySelector('.da-match-overlay') ||
        document.getElementById('sparGateCard') ||
        document.querySelector('.match-profile-flow') ||
        document.querySelector('.ob-modal.is-open') ||
        document.documentElement.getAttribute('data-intro') === '1') return;
    // Mid-sentence is the one moment a locked card is indefensible: it
    // takes focus, and the visitor cannot close it to finish the thought.
    // Defer rather than skip, so the ask still arrives a tick later.
    try {
      var el = document.activeElement;
      if (el && (/^(input|textarea|select)$/i.test(el.tagName) || el.isContentEditable)) return;
    } catch (e) {}
    if (!window.openAuthModal) { ensureChooser(); return; }
    if (window.__sparSaveDeskProgress) window.__sparSaveDeskProgress();
    shown = true;
    try { sessionStorage.setItem(SHOWN_KEY, '1'); } catch (e) {}
    track('signin_wall_shown', { path: location.pathname, seconds: Math.floor(seconds) });
    var livePerson = !/^\/(newvoice|practice|voice-debate)(?:\.html)?(?:\/|$)/.test(location.pathname);
    window.openAuthModal('signup', {
      locked: LOCKED,
      livePerson: livePerson,
      liveVideo: /^\/spar(?:\.html)?(?:\/|$)/.test(location.pathname),
      headline: 'Sign in to keep going',
      sub: livePerson
        ? 'Debate real people face to face on live video. Sign in to keep your rounds and progress. Your account is free.'
        : 'Sign in with Google, Apple or email to save your rounds, scores and progress. Your account is free.',
      onDone: function (user) {
        if (named(user)) { shown = false; decide(user); return; }
        // Unreachable while LOCKED, because auth-modal's close() refuses every
        // dismissal path. Kept honest for the unlocked mode: `shown` stays set
        // so the ask does not reopen on the next tick, and the session key
        // keeps it away on later pages.
        track('signin_wall_dismissed', { path: location.pathname });
      }
    });
  }
  function tick() {
    var now = performance.now();
    var elapsed = Math.max(0, now - lastTick) / 1000;
    lastTick = now;
    watchAuth();
    if (!signedIn && !shown && wasVisible && !roundInFlight()) {
      seconds += elapsed;
      persist();
    }
    wasVisible = !document.hidden;
    if (seconds >= WALL_SECONDS) show();
  }
  // Flush fractional seconds so refreshing and short page hops keep counting.
  window.addEventListener('pagehide', tick);
  document.addEventListener('visibilitychange', tick);
  watchAuth();
  setInterval(tick, 250);
})();
