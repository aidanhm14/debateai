// ──────────────────────────────────────────────────────────────────
// home-magnet.js — sitewide "find your way home" helper for DebateIt.
//
// Drop <script src="/js/home-magnet.js" defer></script> on any page
// that is NOT the marketing home (/). It does two things:
//
//   1. GUARANTEES a top-of-page home link. If the page has no link to
//      "/" near the top (header / nav / topbar), it injects a slim
//      red "← DebateIt home" bar so a visitor who landed deep in the
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
      'a[href="https://debateai.com/"],a[href="https://debateai.com"]'
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
    bar.setAttribute('aria-label', 'DebateIt');
    bar.style.cssText = [
      'position:sticky', 'top:0', 'z-index:2147482000',
      'display:flex', 'align-items:center', 'gap:8px',
      'padding:8px 14px',
      'font:600 13px/1 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif',
      'color:#fff', 'background:#ef4444',
      'box-shadow:0 1px 0 rgba(0,0,0,.10)'
    ].join(';');

    var home = document.createElement('a');
    home.href = HOME;
    home.setAttribute('aria-label', 'Go to the DebateIt home page');
    home.style.cssText = 'display:inline-flex;align-items:center;gap:7px;color:#fff;text-decoration:none;padding:2px 2px;border-radius:7px';
    home.innerHTML =
      '<span aria-hidden="true" style="font-size:15px;line-height:1;transform:translateY(-1px)">←</span>' +
      '<strong style="font-weight:800;letter-spacing:-.01em">DebateIt</strong>' +
      '<span style="opacity:.78;font-weight:600">home</span>';

    var live = document.createElement('a');
    live.href = '/live';
    live.setAttribute('aria-label', 'Browse live debates');
    live.style.cssText = 'margin-left:auto;display:inline-flex;align-items:center;gap:6px;color:#fff;text-decoration:none;font-weight:700;padding:5px 11px;border-radius:999px;background:rgba(255,255,255,.16)';
    live.innerHTML = 'Live debates <span aria-hidden="true">→</span>';

    function hover(el, on, off){
      el.addEventListener('mouseenter', function(){ el.style.background = on; });
      el.addEventListener('mouseleave', function(){ el.style.background = off; });
    }
    hover(home, 'rgba(255,255,255,.14)', 'transparent');
    hover(live, 'rgba(255,255,255,.28)', 'rgba(255,255,255,.16)');

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
  function signedIn() {
    try { return !!(window.firebase && window.firebase.auth && window.firebase.auth().currentUser); } catch (e) { return false; }
  }

  function cameFromUs() {
    try {
      if (!document.referrer) return false; // direct / typed → treat as a cold landing
      var r = new URL(document.referrer);
      return /(^|\.)debateai\.com$/.test(r.hostname) || r.hostname === location.hostname;
    } catch (e) { return false; }
  }

  // Semi-app surfaces where a "go home" popup would be noise. The home
  // bar still applies to these; only the popup is suppressed.
  var NO_POPUP = /\/(leaderboard|users|profile|live|live-round|spar|casual-room|debate-chat|exhibition|predict|voice-rfd|admin|admin-rate|admin-runner|linter|verify)(\.html)?$/.test(lower);

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
      '#ditHomePop{position:fixed;inset:0;z-index:2147483000;font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}' +
      '#ditHomePop .ditHP-back{position:absolute;inset:0;background:rgba(8,6,4,.5);opacity:0;transition:opacity .25s ease}' +
      '#ditHomePop.in .ditHP-back{opacity:1}' +
      '#ditHomePop .ditHP-card{position:absolute;left:50%;top:50%;transform:translate(-50%,calc(-50% + 14px));' +
        'width:min(420px,calc(100vw - 32px));background:' + card + ';color:' + ink + ';' +
        'border:1px solid ' + line + ';border-radius:18px;padding:26px 24px 22px;' +
        'box-shadow:0 24px 70px rgba(0,0,0,.35);opacity:0;transition:opacity .28s ease,transform .28s cubic-bezier(.2,.8,.2,1)}' +
      '#ditHomePop.in .ditHP-card{opacity:1;transform:translate(-50%,-50%)}' +
      '#ditHomePop .ditHP-x{position:absolute;top:12px;right:14px;width:30px;height:30px;border:0;background:transparent;' +
        'color:' + sub + ';font-size:22px;line-height:1;cursor:pointer;border-radius:8px}' +
      '#ditHomePop .ditHP-x:hover{background:' + stayBg + '}' +
      '#ditHomePop .ditHP-kick{display:inline-flex;align-items:center;gap:7px;font-size:.7rem;font-weight:800;' +
        'letter-spacing:.13em;text-transform:uppercase;color:#ef4444;margin-bottom:11px}' +
      '#ditHomePop .ditHP-dot{width:7px;height:7px;border-radius:50%;background:#22c55e;box-shadow:0 0 8px #22c55e}' +
      '#ditHomePop .ditHP-h{font-size:1.32rem;font-weight:800;letter-spacing:-.02em;line-height:1.15;margin:0 0 9px}' +
      '#ditHomePop .ditHP-p{font-size:.95rem;line-height:1.5;color:' + sub + ';margin:0 0 18px}' +
      '#ditHomePop .ditHP-row{display:flex;flex-direction:column;gap:9px}' +
      '#ditHomePop .ditHP-go{display:block;text-align:center;padding:13px 18px;border-radius:11px;background:#ef4444;color:#fff;' +
        'font-weight:800;font-size:1rem;text-decoration:none;transition:background .15s,transform .15s;box-shadow:0 8px 24px rgba(239,68,68,.3)}' +
      '#ditHomePop .ditHP-go:hover{background:#dc2626;transform:translateY(-1px)}' +
      '#ditHomePop .ditHP-stay{padding:11px;border:0;background:' + stayBg + ';color:' + sub + ';font-weight:700;' +
        'font-size:.9rem;border-radius:11px;cursor:pointer}' +
      '#ditHomePop .ditHP-stay:hover{color:' + ink + '}' +
      '@media(max-width:560px){' +
        '#ditHomePop .ditHP-card{left:0;right:0;top:auto;bottom:0;width:auto;transform:translateY(110%);' +
          'border-radius:20px 20px 0 0;padding-bottom:calc(22px + env(safe-area-inset-bottom,0px))}' +
        '#ditHomePop.in .ditHP-card{transform:translateY(0)}' +
      '}' +
      '@media(prefers-reduced-motion:reduce){#ditHomePop .ditHP-back,#ditHomePop .ditHP-card{transition:none}}';
    document.head.appendChild(s);
  }

  function showPopup() {
    if (document.getElementById('ditHomePop')) return;
    injectStyles();
    var wrap = document.createElement('div');
    wrap.id = 'ditHomePop';
    wrap.setAttribute('role', 'dialog');
    wrap.setAttribute('aria-modal', 'true');
    wrap.setAttribute('aria-label', 'Welcome to DebateIt');
    wrap.innerHTML =
      '<div class="ditHP-back"></div>' +
      '<div class="ditHP-card" role="document">' +
        '<button class="ditHP-x" aria-label="Dismiss">×</button>' +
        '<div class="ditHP-kick"><span class="ditHP-dot"></span>New here?</div>' +
        '<h2 class="ditHP-h">Debate real people, live.</h2>' +
        '<p class="ditHP-p">You landed on one page. The main page is where it all runs: live rounds against real debaters in your format, with an AI judge that writes the ballot at the end.</p>' +
        '<div class="ditHP-row">' +
          '<a class="ditHP-go" href="' + HOME + '">Go to the main page →</a>' +
          '<button class="ditHP-stay">Stay on this page</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(wrap);
    markSeen();

    function close() {
      wrap.classList.remove('in');
      setTimeout(function () { if (wrap.parentNode) wrap.parentNode.removeChild(wrap); }, 300);
      document.removeEventListener('keydown', onKey);
    }
    function onKey(e) { if (e.key === 'Escape') close(); }

    wrap.querySelector('.ditHP-x').addEventListener('click', close);
    wrap.querySelector('.ditHP-stay').addEventListener('click', close);
    wrap.querySelector('.ditHP-back').addEventListener('click', close);
    // Let the home button navigate normally; just record intent.
    wrap.querySelector('.ditHP-go').addEventListener('click', function () {
      try { if (window.track) window.track('home_magnet_go', { from: path }); } catch (e) {}
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
    if (NO_POPUP || seen() || cameFromUs() || visitedHome() || signedIn()) return;

    // If firebase is on the page, a sign-in that resolves after this point
    // still cancels the popup (and closes it if it already opened) — a
    // signed-in user already knows the site.
    try {
      if (window.firebase && window.firebase.auth) {
        window.firebase.auth().onAuthStateChanged(function (u) {
          if (!u) return;
          seen.__shown = true;
          var p = document.getElementById('ditHomePop');
          if (p && p.parentNode) p.parentNode.removeChild(p);
        });
      }
    } catch (e) {}

    // ~5s after a first-time cold landing: long enough that it reads as
    // "want the full thing?" rather than an immediate interstitial, and
    // long enough for firebase auth to have resolved.
    setTimeout(function () {
      if (document.hidden || seen.__shown || signedIn()) return;
      showPopup();
    }, 5000);
  });
})();
