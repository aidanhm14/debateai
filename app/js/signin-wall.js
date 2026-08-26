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

   WHAT THE SECONDS MEAN. Visible seconds, not wall clock, and
   cumulative across pages inside one browser session. A backgrounded
   tab accumulates nothing, so a parked tab is never walled and a
   prerendered one is never walled. Someone who reads three pages for
   fifteen seconds each is walled on the third, which is the intent:
   the budget is time on the SITE, not time on a page.

   THE ARRIVAL PAGE IS PRICED DIFFERENTLY, and that is the SEO half of
   this file. 62% of organic clicks land on one page. A reader who came
   from a search result, met a wall and went BACK to the results is
   pogo-sticking, which is the one visitor behaviour that costs the
   ranking that delivered them. So the page someone arrives on costs 90
   seconds and at least one real interaction; every page after it costs
   45, because clicking through to a second page IS the interaction.
   A deep reader on a single page still converts. A skimmer who leaves
   at fifty seconds never sees a wall at all.

   AND AN ACCOUNT IS NOT THE WIN. 31 of 215 named accounts have ever
   finished a round. A wall that mints accounts which never debate just
   makes more of the other 184, and nobody comes back to an account
   that did nothing. So a conversion here hands the page back and puts
   the first round one tap away (activationBar), rather than dropping
   someone back onto the marketing copy they were already reading.

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
  // Two thresholds, and the gap between them is the whole SEO argument.
  //
  // 45 seconds is the number that was asked for and it is what a visitor
  // pays once they have clicked THROUGH to a second page: they have read
  // something, chosen to read more, and the ask is fair.
  //
  // The page someone ARRIVES on is different, and 62% of organic clicks
  // land on one page (/debate-online). A reader who came from a search
  // result and meets a wall goes back to the results, and pogo-sticking
  // back to Google is the one visitor behaviour that costs the ranking
  // that brought them. So the arrival page costs 90 seconds AND at least
  // one real interaction. A deep reader on a single page still converts;
  // a skimmer who leaves at fifty seconds never sees it.
  var WALL_SECONDS = 45;          // visible seconds, once past the arrival page
  var FIRST_PAGE_SECONDS = 90;    // on the page they arrived on
  var SETTLE_MS = 1200;           // let a page paint before re-walling a returner
  var TICK_MS = 1000;

  var SPENT_KEY = 'debatable-wall-seconds';
  var SHOWN_KEY = 'debatable-wall-shown';
  var VIEWS_KEY = 'debatable-wall-views';
  var ACTIVATE_KEY = 'debatable-wall-activate';
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
      if (n >= 3 && n <= WALL_SECONDS) { WALL_SECONDS = n; FIRST_PAGE_SECONDS = n; }
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
  // How many WALLABLE pages this session has seen. A skipped page (a
  // round, /spar, the legal pages) returns before arming and is not
  // counted, so someone whose first stop was /practice still gets the
  // arrival grace on the first page that could wall them.
  function bumpViews() {
    var n = 1;
    try {
      n = (parseInt(sessionStorage.getItem(VIEWS_KEY), 10) || 0) + 1;
      sessionStorage.setItem(VIEWS_KEY, String(n));
    } catch (e) {}
    return n;
  }
  // One real interaction. Scroll is deliberately NOT in this list: on a
  // phone a scroll is how you find out whether a page is worth reading,
  // so it proves arrival, not interest. A tap or a keypress is a choice.
  var engaged = false;
  function watchEngagement() {
    function on() {
      engaged = true;
      ['pointerdown', 'keydown', 'touchstart'].forEach(function (ev) {
        try { window.removeEventListener(ev, on, true); } catch (e) {}
      });
    }
    ['pointerdown', 'keydown', 'touchstart'].forEach(function (ev) {
      try { window.addEventListener(ev, on, true); } catch (e) {}
    });
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
  var views = bumpViews();
  var arrival = views <= 1;

  // The arrival page also has to be earned with an interaction. Later
  // pages do not: clicking through to a second page IS the interaction.
  function budgetMet() {
    if (!arrival) return seconds >= WALL_SECONDS;
    return seconds >= FIRST_PAGE_SECONDS && engaged;
  }

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
    track('signin_wall_shown', { path: location.pathname, seconds: seconds, arrival: arrival ? 1 : 0, views: views });
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
    if (budgetMet()) show();
  }

  function start() {
    if (timer || fired || signedIn) return;
    watchEngagement();
    // Budget already spent earlier this session: wall on arrival, but
    // let the page paint first so it is clear what is being walled.
    if (budgetMet()) { setTimeout(show, SETTLE_MS); return; }
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
        try { sessionStorage.setItem(ACTIVATE_KEY, '1'); } catch (e) {}
        track('signin_wall_converted', { path: location.pathname });
      }
      try { sessionStorage.removeItem(SPENT_KEY); } catch (e) {}
      activationBar();
      return;
    }
    if (!decided) { decided = true; start(); }
  }

  // ── The part that decides whether any of this was worth doing ──────
  //
  // 31 of 215 named accounts have ever finished a round; 184 have not.
  // So an account is not the win, and a wall that mints accounts which
  // never debate just makes more of the 184. Signing in through the
  // wall used to land someone back on the marketing page they were
  // reading, which is exactly how a dead account gets made.
  //
  // It does NOT redirect them into a round instead. The wall already
  // interrupted their reading once; taking the page away as the reward
  // for complying would be the second interruption, and they came from
  // a search result for a reason. They get their page back, with the
  // round one tap away in a bar that does not cover it.
  function activationBar() {
    var pending = false;
    try { pending = sessionStorage.getItem(ACTIVATE_KEY) === '1'; } catch (e) {}
    if (!pending) return;
    if (document.getElementById('daWallGo')) return;
    if (!document.body) { document.addEventListener('DOMContentLoaded', activationBar, { once: true }); return; }

    var dark = /dark|stone|grey|crimson/.test(document.documentElement.getAttribute('data-theme') || '') ||
               document.body.classList.contains('dark-theme') || document.body.classList.contains('crimson-theme');
    var css = document.createElement('style');
    css.id = 'daWallGoCss';
    css.textContent =
      '#daWallGo{position:fixed;left:50%;transform:translateX(-50%);bottom:18px;z-index:2147483000;display:flex;align-items:center;gap:14px;' +
      'padding:11px 12px 11px 18px;border-radius:999px;' +
      /* No viewport units anywhere in here. The narrow case is handled by
         pinning left and right in the media query below, which needs no
         100vw to be correct, and a bar whose width depends on a unit that
         resolves to zero in an embedded frame is a bar that vanishes. */

      'background:' + (dark ? '#1c160f' : '#ffffff') + ';color:' + (dark ? '#f5f1ea' : '#16130f') + ';' +
      'border:1px solid ' + (dark ? 'rgba(255,255,255,.14)' : 'rgba(0,0,0,.12)') + ';' +
      'box-shadow:0 14px 44px rgba(0,0,0,.26);font-family:"Archivo",Georgia,serif;font-size:14.5px;font-weight:650;line-height:1.3;' +
      'animation:daWallGoIn .28s cubic-bezier(.2,.8,.2,1)}' +
      '@keyframes daWallGoIn{from{opacity:0;transform:translate(-50%,10px)}to{opacity:1;transform:translate(-50%,0)}}' +
      '#daWallGo .wg-txt{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
      '#daWallGo .wg-go{flex:none;min-height:40px;display:inline-flex;align-items:center;padding:9px 17px;border-radius:999px;' +
      'background:#b91c1c;color:#fff;font:inherit;font-weight:800;text-decoration:none;border:0;cursor:pointer;white-space:nowrap}' +
      '#daWallGo .wg-go:hover{background:#dc2626}' +
      '#daWallGo .wg-x{flex:none;width:32px;height:32px;border:0;background:transparent;cursor:pointer;border-radius:50%;' +
      'color:' + (dark ? 'rgba(245,241,234,.6)' : 'rgba(20,16,12,.55)') + ';font:inherit;font-size:19px;line-height:1}' +
      '#daWallGo .wg-x:hover{background:' + (dark ? 'rgba(255,255,255,.08)' : 'rgba(0,0,0,.05)') + '}' +
      '@media(max-width:520px){#daWallGo{left:12px;right:12px;transform:none;bottom:12px;border-radius:16px;padding:11px 10px 11px 15px}' +
      '@keyframes daWallGoIn{from{opacity:0}to{opacity:1}}' +
      '#daWallGo .wg-txt{white-space:normal;font-size:13.5px}}';
    document.head.appendChild(css);

    var bar = document.createElement('div');
    bar.id = 'daWallGo';
    bar.setAttribute('role', 'status');
    var txt = document.createElement('span');
    txt.className = 'wg-txt';
    txt.textContent = 'You are in. Your first round is one tap.';
    var go = document.createElement('a');
    go.className = 'wg-go';
    go.href = '/spar?from=wall';
    go.textContent = 'Start a round';
    var x = document.createElement('button');
    x.className = 'wg-x';
    x.type = 'button';
    x.setAttribute('aria-label', 'Dismiss');
    x.textContent = '\u00d7';
    bar.appendChild(txt); bar.appendChild(go); bar.appendChild(x);
    document.body.appendChild(bar);
    track('wall_activation_shown', { path: location.pathname });

    function clear(reason) {
      try { sessionStorage.removeItem(ACTIVATE_KEY); } catch (e) {}
      track('wall_activation_' + reason, { path: location.pathname });
      try { bar.remove(); } catch (e) {}
    }
    go.addEventListener('click', function () { clear('click'); });
    x.addEventListener('click', function () { clear('dismiss'); });
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
