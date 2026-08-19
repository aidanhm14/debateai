// ──────────────────────────────────────────────────────────────────
// home-magnet.js — sitewide "find your way home" helper for Debatable.
//
// Drop <script src="/js/home-magnet.js" defer></script> on any page
// that is NOT the marketing home (/). It does two things:
//
//   1. GUARANTEES a top-of-page home link. If the page has no link to
//      "/" near the top (header / nav / topbar), it injects a slim
//      red "← Debatable home" bar so a visitor who landed deep in the
//      site from a search result is always one tap from the main page.
//
//   2. FIRST-TIME POPUP. For a cold visitor (first time on the site,
//      arriving from search or direct — not internal navigation) it
//      shows a single dismissible "head to the main page?" card. Gated
//      on a localStorage flag + referrer so it never nags returning or
//      internal users. Delayed 1.5s and rendered as a bottom sheet on
//      mobile so it stays clear of Google's intrusive-interstitial
//      rules (which target popups that block content immediately on
//      arrival).
//
// Self-contained, framework-free, idempotent. Matches the injection
// pattern used by signup-nudge.js / corpus-nudge.js.
// ──────────────────────────────────────────────────────────────────
(function () {
  'use strict';
  if (window.__ditHomeMagnet) return;
  window.__ditHomeMagnet = true;

  // Never run inside an iframe (extension side panel, embeds).
  try { if (window.top !== window.self) return; } catch (e) { return; }

  var HOME = '/';
  var path = (location.pathname || '/').replace(/\/+$/, '') || '/';
  var lower = path.toLowerCase();

  var SEEN_KEY = 'dit-home-prompt-seen';
  var VISITED_HOME_KEY = 'dit-visited-home';

  // ── A/B home_magnet_dest_v1 (2026-08-14) ─────────────────────────
  // Where a search visitor gets sent. CONTROL is today's behaviour, the
  // main page. The other arm sends them straight into a round, on the
  // reasoning that the main page then has to sell them a second time and
  // a stranger who is already reading a debate dossier has arguably been
  // sold once. Neither is obviously right, which is why it is an
  // experiment and not an edit.
  //
  // Sticky per browser; ?magnet=home|round forces an arm for QA and a
  // forced arm is excluded from telemetry entirely.
  //
  // Telemetry does NOT ride the shared experiments.js rail, for the same
  // reason signup-nudge.js does not: measured today, 1 of the 92 pages
  // carrying this module also loads that file, so registering on
  // window.__abAssignments would report roughly a hundredth of the
  // traffic and read as the whole. Worse, that rail sends its impression
  // at DOMContentLoaded, and this card mounts ~6s later and usually not
  // at all, so it would have counted a view for every page load rather
  // than for every card actually shown. Both are emitted below in
  // experiments.js's exact event shape via gtag, which track.js bridges
  // to /api/log-event and log-event.mjs turns into experiment_events
  // rows. Same Mission Control rollup, honest denominator.
  var DEST_KEY = 'da-ab-magnet-dest';
  var DEST_TEST = 'home_magnet_dest_v1';
  var destArm = 'home';
  var destForced = false;
  (function assignDest(){
    try {
      var qp = (location.search || '').toLowerCase();
      if (/[?&]magnet=home(?:&|$)/.test(qp)) { destArm = 'home'; destForced = true; return; }
      if (/[?&]magnet=round(?:&|$)/.test(qp)) { destArm = 'round'; destForced = true; return; }
    } catch (e) {}
    try {
      var v = localStorage.getItem(DEST_KEY) || '';
      if (v !== 'home' && v !== 'round') {
        v = Math.random() < 0.5 ? 'home' : 'round';
        localStorage.setItem(DEST_KEY, v);
      }
      destArm = v;
    } catch (e) { destArm = 'home'; }
  })();

  var ARMS = {
    home: {
      href: HOME,
      label: 'Go to the main page →',
      head: 'Debate real people, live.',
      body: 'You landed on one page. The main page is where it all runs: live rounds against real people in your format, with an AI judge that writes the ballot at the end.'
    },
    round: {
      href: '/practice',
      label: 'Start a round →',
      head: 'Argue this one yourself.',
      body: 'You have been reading one side of it. Pick a side and say it out loud against an opponent that argues back, on a clock, and an AI judge writes the ballot at the end.'
    }
  };
  var ARM = ARMS[destArm] || ARMS.home;

  function abEmit(name, params){
    if (destForced) return;
    try { if (window.gtag) window.gtag('event', name, params || {}); } catch (e) {}
  }
  // One impression per session per path, using experiments.js's dedupe
  // key so the two can never double-count the same page.
  function abImpression(){
    var p = location.pathname || '/';
    var assignments = DEST_TEST + '=' + destArm;
    try {
      var k = '_da_ab_imp:' + p + ':' + assignments;
      if (sessionStorage.getItem(k) === '1') return;
      sessionStorage.setItem(k, '1');
    } catch (e) {}
    abEmit('ab_impression', { assignments: assignments, experiment_count: 1, path: p });
  }
  function abConversion(target){
    abEmit('ab_conversion', {
      test: DEST_TEST, variant: destArm,
      target: String(target || 'click').slice(0, 64),
      path: location.pathname || '/'
    });
  }

  // Already on the home / app shell? Record the visit — once someone has
  // seen the main page, the "go to the main page" popup should never fire
  // for them again — then do nothing else here.
  if (path === '/' || /\/(landing|index)(\.html)?$/.test(lower)) {
    try { localStorage.setItem(VISITED_HOME_KEY, '1'); } catch (e) {}
    return;
  }

  function ready(fn) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', fn, { once: true });
    } else { fn(); }
  }

  // ── 1. Guarantee a top-of-page home link ─────────────────────────
  function topHomeLinkExists() {
    // The shared topbar (#daTopbar, rendered by topbar.js) mounts a home
    // wordmark asynchronously — after this check would otherwise run. Treat
    // its presence as "a top home link exists" so we don't inject a
    // redundant bar above it.
    if (document.getElementById('daTopbar')) return true;
    var links = document.querySelectorAll(
      'a[href="/"],a[href="/landing"],a[href="/landing.html"],' +
      'a[href="https://itsdebatable.com/"],a[href="https://itsdebatable.com"]'
    );
    for (var i = 0; i < links.length; i++) {
      var a = links[i];
      if (a.closest('header,nav,[class*="topbar"],[class*="nav"],[id*="topbar"],[id*="nav"]')) return true;
      var r = a.getBoundingClientRect();
      if (r.top >= 0 && r.top < 220 && r.width > 0) return true;
    }
    return false;
  }

  function injectHomeBar() {
    if (document.getElementById('ditHomeBar')) return;
    // Two real, separate destinations. The old bar was one <a href="/"> whose
    // right edge read "Live debates →" — the label promised /live but the tap
    // went home. Now the home label goes home and the live label goes to /live.
    var bar = document.createElement('div');
    bar.id = 'ditHomeBar';
    bar.setAttribute('role', 'navigation');
    bar.setAttribute('aria-label', 'Debatable');
    bar.style.cssText = [
      'position:sticky', 'top:0', 'z-index:2147482000',
      'display:flex', 'align-items:center', 'gap:8px',
      'padding:8px 14px',
      'font:600 13px/1 Archivo,Georgia,serif',
      'color:#fff', 'background:#b91c1c',
      'box-shadow:0 1px 0 rgba(0,0,0,.10)'
    ].join(';');

    var home = document.createElement('a');
    home.href = HOME;
    home.setAttribute('aria-label', 'Go to the Debatable home page');
    home.style.cssText = 'display:inline-flex;align-items:center;gap:7px;color:#fff;text-decoration:none;padding:2px 2px;border-radius:7px';
    home.innerHTML =
      '<span aria-hidden="true" style="font-size:15px;line-height:1;transform:translateY(-1px)">←</span>' +
      '<strong style="font-weight:800;letter-spacing:-.01em">Debatable</strong>' +
      '<span style="opacity:.95;font-weight:600">home</span>';

    var live = document.createElement('a');
    live.href = '/live';
    live.setAttribute('aria-label', 'Browse live debates');
    live.style.cssText = 'margin-left:auto;display:inline-flex;align-items:center;gap:6px;color:#fff;text-decoration:none;font-weight:700;padding:5px 11px;border-radius:999px;background:rgba(0,0,0,.12)';
    live.innerHTML = 'Live debates <span aria-hidden="true">→</span>';

    function hover(el, on, off){
      el.addEventListener('mouseenter', function(){ el.style.background = on; });
      el.addEventListener('mouseleave', function(){ el.style.background = off; });
    }
    hover(home, 'rgba(255,255,255,.14)', 'transparent');
    hover(live, 'rgba(0,0,0,.22)', 'rgba(0,0,0,.12)');

    bar.appendChild(home);
    bar.appendChild(live);
    document.body.insertBefore(bar, document.body.firstChild);
  }

  // ── 2. First-time popup ──────────────────────────────────────────
  function seen() { try { return localStorage.getItem(SEEN_KEY) === '1'; } catch (e) { return false; } }
  function markSeen() { try { localStorage.setItem(SEEN_KEY, '1'); } catch (e) {} }
  function visitedHome() { try { return localStorage.getItem(VISITED_HOME_KEY) === '1'; } catch (e) { return false; } }

  // Signed-in visitors are not "new here", so the popup is pointless for
  // them. Auth state is whatever firebase resolves to (topbar.js loads it
  // lazily); it's null until it settles, which is why the decision is
  // deferred ~5s and re-checked via onAuthStateChanged below.
  //
  // NAMED accounts only, and that word is load-bearing. This read used to
  // be a bare !!currentUser, which is true for an ANONYMOUS user, and
  // nearly every visitor is signed in anonymously within a second of
  // landing (notifications.js mints one for the background Spar pill).
  // So the popup asked "is this a stranger?", got told "no", and never
  // fired for anyone on any page. Measured on a live /debate page:
  // currentUser was anonymous-truthy at t=1s. Same test firestore.rules
  // already uses via isNamedAccount().
  function signedIn() {
    try {
      var u = window.firebase && window.firebase.auth && window.firebase.auth().currentUser;
      return !!(u && !u.isAnonymous);
    } catch (e) { return false; }
  }

  function cameFromUs() {
    try {
      if (!document.referrer) return false; // direct / typed → treat as a cold landing
      var r = new URL(document.referrer);
      return /(^|\.)debateai\.com$/.test(r.hostname) || r.hostname === location.hostname;
    } catch (e) { return false; }
  }

  // One prompt per page. signup-nudge.js runs its own timed card on the
  // pages it is loaded on, and two cards arriving seconds apart reads as a
  // site that is nagging rather than offering. Whichever page carries the
  // nudge, the nudge wins: it asks for the account, which is the larger
  // commitment, and this popup's "go to the main page" is also reachable
  // from the topbar wordmark on every page that has one. Caught on /watch,
  // where a parallel change added the nudge the same day this shipped.
  function nudgeOwnsThisPage() {
    return !!document.querySelector('script[src*="/js/signup-nudge.js"]');
  }

  // Semi-app surfaces where a "go home" popup would be noise. The home
  // bar still applies to these; only the popup is suppressed.
  var NO_POPUP = /\/(leaderboard|users|profile|live|live-round|spar|casual-room|debate-chat|exhibition|predict|voice-rfd|admin|admin-rate|admin-runner|linter|argument-coach|verify|voice-debate|newvoice|messages|room-judge|practice|float|debate-online)(\.html)?$/.test(lower);

  // One sign-in chooser, same as everywhere else (2026-08-12). Mirrors
  // topbar.js's openSharedAuth, but has to load the script itself: this
  // popup's whole audience is the SEO cluster, and /debate/* and
  // /learn/guides/* are server-rendered WITHOUT a topbar, so the thing
  // that pulls auth-modal.js in on the other ~85 pages is absent exactly
  // where this runs. Falls through to the main page rather than dead-ending
  // on a button that does nothing.
  function openSharedAuth() {
    if (typeof window.openAuthModal === 'function') { window.openAuthModal('signin'); return; }
    var existing = document.querySelector('script[src*="/js/auth-modal.js"]');
    if (existing) {
      existing.addEventListener('load', function () {
        if (typeof window.openAuthModal === 'function') window.openAuthModal('signin');
        else location.href = HOME;
      }, { once: true });
      return;
    }
    var s = document.createElement('script');
    s.src = '/js/auth-modal.js';
    s.defer = true;
    s.onload = function () {
      if (typeof window.openAuthModal === 'function') window.openAuthModal('signin');
      else location.href = HOME;
    };
    s.onerror = function () { location.href = HOME; };
    document.head.appendChild(s);
  }

  function injectStyles() {
    if (document.getElementById('ditHomePopCss')) return;
    var dark = /dark|stone|grey/.test(document.documentElement.getAttribute('data-theme') || '') ||
               document.body.classList.contains('dark-theme');
    var card = dark ? '#1c160f' : '#ffffff';
    var ink = dark ? '#f5f1ea' : '#16130f';
    var sub = dark ? 'rgba(245,241,234,.66)' : 'rgba(20,16,12,.62)';
    var line = dark ? 'rgba(255,255,255,.10)' : 'rgba(0,0,0,.09)';
    var stayBg = dark ? 'rgba(255,255,255,.05)' : 'rgba(0,0,0,.04)';
    var s = document.createElement('style');
    s.id = 'ditHomePopCss';
    s.textContent =
      // Bottom-RIGHT card, not a centred modal over a dimmed page. Two
      // reasons. This fires on pages whose whole job is arriving from a
      // search result, and a full-screen interstitial over search-landed
      // content is the exact pattern Google's intrusive-interstitial
      // guidance penalises; a corner card leaves the content readable and
      // the page usable. The wrapper therefore takes pointer-events:none
      // so the invisible full-screen box cannot swallow clicks meant for
      // the article underneath, and only the card takes them back.
      '#ditHomePop{position:fixed;inset:0;z-index:2147483000;pointer-events:none;font-family:Archivo,Georgia,serif}' +
      '#ditHomePop .ditHP-card{position:absolute;right:20px;bottom:20px;pointer-events:auto;' +
        'width:min(380px,calc(100vw - 32px));background:' + card + ';color:' + ink + ';' +
        'border:1px solid ' + line + ';border-radius:18px;padding:22px 22px 20px;' +
        'box-shadow:0 24px 70px rgba(0,0,0,.35);opacity:0;transform:translateY(14px);' +
        'transition:opacity .28s ease,transform .28s cubic-bezier(.2,.8,.2,1)}' +
      '#ditHomePop.in .ditHP-card{opacity:1;transform:translateY(0)}' +
      '#ditHomePop .ditHP-x{position:absolute;top:12px;right:14px;width:30px;height:30px;border:0;background:transparent;' +
        'color:' + sub + ';font-size:22px;line-height:1;cursor:pointer;border-radius:8px}' +
      '#ditHomePop .ditHP-x:hover{background:' + stayBg + '}' +
      '#ditHomePop .ditHP-kick{display:inline-flex;align-items:center;gap:7px;font-size:.7rem;font-weight:800;' +
        'letter-spacing:.13em;text-transform:uppercase;color:#ef4444;margin-bottom:11px}' +
      '#ditHomePop .ditHP-dot{width:7px;height:7px;border-radius:50%;background:#22c55e;box-shadow:0 0 8px #22c55e}' +
      '#ditHomePop .ditHP-h{font-size:1.32rem;font-weight:800;letter-spacing:-.02em;line-height:1.15;margin:0 0 9px;color:' + ink + '!important}' +
      '#ditHomePop .ditHP-p{font-size:.95rem;line-height:1.5;color:' + sub + '!important;margin:0 0 18px}' +
      '#ditHomePop .ditHP-row{display:flex;flex-direction:column;gap:9px}' +
      '#ditHomePop .ditHP-go{display:block;text-align:center;padding:13px 18px;border-radius:11px;background:#b91c1c;color:#fff;' +
        'font-weight:800;font-size:1rem;text-decoration:none;transition:background .15s,transform .15s;box-shadow:0 8px 24px rgba(239,68,68,.3)}' +
      '#ditHomePop .ditHP-go:hover{background:#dc2626;transform:translateY(-1px)}' +
      '#ditHomePop .ditHP-signin{display:block;width:100%;text-align:center;padding:12px 18px;border-radius:11px;' +
        'border:1px solid ' + line + ';background:transparent;color:' + ink + ';font-family:inherit;' +
        'font-weight:800;font-size:.95rem;cursor:pointer;transition:background .15s,border-color .15s}' +
      '#ditHomePop .ditHP-signin:hover{background:' + stayBg + ';border-color:#ef4444}' +
      '#ditHomePop .ditHP-stay{padding:11px;border:0;background:' + stayBg + ';color:' + sub + ';font-weight:700;' +
        'font-size:.9rem;border-radius:11px;cursor:pointer;font-family:inherit}' +
      '#ditHomePop .ditHP-stay:hover{color:' + ink + '}' +
      '@media(max-width:560px){' +
        '#ditHomePop .ditHP-card{left:0;right:0;top:auto;bottom:0;width:auto;transform:translateY(110%);' +
          'border-radius:20px 20px 0 0;padding-bottom:calc(22px + env(safe-area-inset-bottom,0px))}' +
        '#ditHomePop.in .ditHP-card{transform:translateY(0)}' +
      '}' +
      '@media(prefers-reduced-motion:reduce){#ditHomePop .ditHP-card{transition:none}}';
    document.head.appendChild(s);
  }

  function showPopup() {
    if (document.getElementById('ditHomePop')) return;
    injectStyles();
    var wrap = document.createElement('div');
    wrap.id = 'ditHomePop';
    wrap.setAttribute('role', 'dialog');
    // NOT aria-modal. It no longer covers the page or trap focus, and
    // claiming modality would tell a screen reader the article behind it
    // has stopped existing when it has not.
    wrap.setAttribute('aria-label', 'Welcome to Debatable');
    wrap.innerHTML =
      '<div class="ditHP-card" role="document">' +
        '<button class="ditHP-x" aria-label="Dismiss">×</button>' +
        '<div class="ditHP-kick"><span class="ditHP-dot"></span>New here?</div>' +
        '<h2 class="ditHP-h">' + ARM.head + '</h2>' +
        '<p class="ditHP-p">' + ARM.body + '</p>' +
        '<div class="ditHP-row">' +
          '<a class="ditHP-go" href="' + ARM.href + '">' + ARM.label + '</a>' +
          '<button class="ditHP-signin">Sign in</button>' +
          '<button class="ditHP-stay">Stay on this page</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(wrap);
    markSeen();
    // The denominator, and the reason it is emitted HERE rather than at
    // boot: this counts cards actually shown, not page loads. Most loads
    // never reach this line (seen, internal navigation, already visited
    // the main page, signed in, app surface), and counting those would
    // have made a working popup look like it converts at ~1%.
    abImpression();

    function close() {
      wrap.classList.remove('in');
      setTimeout(function () { if (wrap.parentNode) wrap.parentNode.removeChild(wrap); }, 300);
      document.removeEventListener('keydown', onKey);
    }
    function onKey(e) { if (e.key === 'Escape') { abConversion('dismiss'); close(); } }

    // Both refusals are recorded, not just the accepts. A card measured
    // only by its clicks cannot tell "nobody wanted this" from "nobody
    // saw it", and dismiss-vs-stay is the difference between annoying and
    // merely ignored.
    wrap.querySelector('.ditHP-x').addEventListener('click', function () {
      abConversion('dismiss'); close();
    });
    wrap.querySelector('.ditHP-stay').addEventListener('click', function () {
      abConversion('stay'); close();
    });
    // Let the primary button navigate normally; just record intent first.
    wrap.querySelector('.ditHP-go').addEventListener('click', function () {
      abConversion('go');
      try { if (window.track) window.track('home_magnet_go', { from: path, arm: destArm, to: ARM.href }); } catch (e) {}
    });
    wrap.querySelector('.ditHP-signin').addEventListener('click', function () {
      abConversion('signin');
      try { if (window.track) window.track('home_magnet_signin', { from: path, arm: destArm }); } catch (e) {}
      close();
      openSharedAuth();
    });
    document.addEventListener('keydown', onKey);

    requestAnimationFrame(function () {
      requestAnimationFrame(function () { wrap.classList.add('in'); });
    });
  }

  // ── Run ──────────────────────────────────────────────────────────
  ready(function () {
    if (!topHomeLinkExists()) injectHomeBar();

    // The popup only makes sense for a genuinely new, signed-out visitor
    // who landed deep from search and has never seen the main page. Skip
    // it for app-ish pages, repeat shows, internal navigation, anyone who
    // has already visited the landing/main page, and signed-in users.
    if (NO_POPUP || nudgeOwnsThisPage() || seen() || cameFromUs() || visitedHome() || signedIn()) return;

    // If firebase is on the page, a sign-in that resolves after this point
    // still cancels the popup (and closes it if it already opened) — a
    // signed-in user already knows the site.
    try {
      if (window.firebase && window.firebase.auth) {
        window.firebase.auth().onAuthStateChanged(function (u) {
          // Named accounts only, for the same reason signedIn() checks it:
          // the anonymous sign-in that lands on nearly every visitor would
          // otherwise cancel this for everybody, permanently.
          if (!u || u.isAnonymous) return;
          seen.__shown = true;
          var p = document.getElementById('ditHomePop');
          if (p && p.parentNode) p.parentNode.removeChild(p);
        });
      }
    } catch (e) {}

    // ~6s after a first-time cold landing: long enough that it reads as
    // "want the full thing?" rather than an immediate interstitial, and
    // long enough for firebase auth to have resolved.
    //
    // A hidden tab DEFERS rather than cancels. The old version returned
    // outright, so a visitor who opened the page in a background tab (the
    // normal way people open a search result they mean to read later) was
    // never offered the main page at all, on the one visit where they had
    // clearly decided to read. Now the timer just waits for the tab to
    // become visible, then shows it, re-checking the sign-in state at that
    // point because auth may have resolved in the meantime.
    var fire = function () {
      if (seen.__shown || seen() || signedIn()) return;
      if (document.hidden) {
        document.addEventListener('visibilitychange', function onVis() {
          if (document.hidden) return;
          document.removeEventListener('visibilitychange', onVis);
          if (!seen.__shown && !seen() && !signedIn()) showPopup();
        });
        return;
      }
      showPopup();
    };
    setTimeout(fire, 6000);
  });
})();
