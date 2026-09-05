/* Account wall, 2026-09-05. Forty visible seconds across pages.
   A direct human round and a round in the site shell stay uninterrupted.
   AI starts have their own immediate account gate, including server checks. */
(function () {
  'use strict';
  if (window.__ditSigninWall) return;
  window.__ditSigninWall = true;
  if (window.__DB_NATIVE) return;
  var SKIP_PATHS = [
    // Human rooms own entry. Never put an account ask over a live speech.
    /^\/(live-round|live|casual-room|stage|studio|room-judge)(?:\.html)?(?:\/|$)/,
    // These pages already require an account at the door.
    /^\/(partners|debate-chat)(?:\.html)?(?:\/|$)/,
    /^\/(privacy|terms)(?:\.html)?(?:\/|$)/,
    /^\/(admin|offline|og-image|native|god|_more-preview)/
  ];
  if (SKIP_PATHS.some(function (rule) { return rule.test(location.pathname); })) return;
  if (/[?&]oobCode=/.test(location.search)) return;
  if (/bot|crawl|spider|slurp|lighthouse|preview|monitor|pingdom|gtmetrix/i.test(navigator.userAgent || '')) return;
  window.__ditSigninWallArmed = true;
  var WALL_SECONDS = 40;
  var SPENT_KEY = 'debatable-wall-seconds';
  var SHOWN_KEY = 'debatable-wall-shown';
  var seconds = 0, shown = false, signedIn = false, watching = false;
  var lastTick = performance.now(), wasVisible = !document.hidden;
  try { seconds = Math.max(0, Number(sessionStorage.getItem(SPENT_KEY)) || 0); } catch (e) {}

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
        document.getElementById('sparGateCard') ||
        document.querySelector('.ob-modal.is-open') ||
        document.documentElement.getAttribute('data-intro') === '1') return;
    if (!window.openAuthModal) { ensureChooser(); return; }
    shown = true;
    try { sessionStorage.setItem(SHOWN_KEY, '1'); } catch (e) {}
    track('signin_wall_shown', { path: location.pathname, seconds: Math.floor(seconds) });
    var livePerson = !/^\/(newvoice|practice|voice-debate)(?:\.html)?(?:\/|$)/.test(location.pathname);
    window.openAuthModal('signup', {
      locked: true,
      livePerson: livePerson,
      headline: 'Sign in to keep going',
      sub: livePerson
        ? 'Debate real people face to face on live video. Sign in to keep your rounds. Your account is free.'
        : 'Sign in with Google, Apple or email to save your rounds, scores and progress. Your account is free.',
      onDone: function (user) { shown = false; decide(user); }
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
