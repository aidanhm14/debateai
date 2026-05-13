/* Shared topbar — single source of truth for /landing, /debate-ai,
   /learn, /high-school, /leaderboard, /live, /pricing.
   Each page gets the SAME markup, the SAME link order, the SAME theme
   dots, and the SAME auth slot, so navigation no longer feels jumpy
   between pages.

   USAGE: include `<div id="daTopbar"></div>` at the top of <body>, then
   load this script with `defer`. The script:
     1. Looks up the current path to mark the active link.
     2. Renders the topbar into #daTopbar.
     3. Wires up the theme dots (writes/reads localStorage `da-theme`).
     4. Hydrates the sign-in slot if `firebase` is loaded.

   Pages that already have their own `.bar` / `.ui-topbar` / `.hs-bar`
   markup should remove it before mounting this. The CSS lives in
   /css/ui.css under .ui-topbar* — every page already loads ui.css. */
(function(){
  var here = (location.pathname || '/').replace(/\/$/,'') || '/';

  // ── Defensive: nuke any stray theme-dot / lighting-toggle markup ──
  // The grey/red/white "theme dot" tray was removed across the site on
  // 2026-05-10 (brand consolidation), but cached old HTML still ships
  // the markup to users who haven't picked up a fresh deploy. Rather
  // than wait for SW invalidation, sweep the DOM at topbar-load time
  // so the dots disappear immediately on any page they leak into. The
  // topbar (rendered below) does NOT include theme dots, so removing
  // any `.theme-dots` host that exists in the DOM is always correct.
  // Same for `.lighting-toggle` (the dark/dim/light pill) which was
  // dropped from /debate-ai but still rendered by some old caches.
  function sweepStaleTheming(){
    document.querySelectorAll('.theme-dots, .lighting-toggle').forEach(function(el){
      try { el.remove(); } catch(e){}
    });
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', sweepStaleTheming);
  } else {
    sweepStaleTheming();
  }

  // Ensure /js/sfx.js is loaded. The SFX mute toggle (rendered + wired
  // below) calls window.SFX.toggleMute() and isMuted(), so the module
  // needs to be present on every page that mounts the shared topbar.
  // landing/learn/voice-debate/community/pricing/spar don't include
  // sfx.js explicitly; without this auto-inject the toggle button
  // rendered fine but its click handler short-circuited because
  // window.SFX was undefined and the user got "this button doesn't
  // work." Idempotent: skips if SFX already on window or a script tag
  // is already in the head. Defer so it doesn't block topbar render.
  (function ensureSfxLoaded(){
    if (window.SFX) return;
    if (document.querySelector('script[src*="/js/sfx.js"]')) return;
    var s = document.createElement('script');
    s.src = '/js/sfx.js';
    s.defer = true;
    document.head.appendChild(s);
  })();

  // Normalize a few synonyms so "/" and "/landing" both light up Home.
  function pathMatches(href){
    var h = href.replace(/\/$/,'') || '/';
    if (h === here) return true;
    if (h === '/' && (here === '' || here === '/landing')) return true;
    if (h === '/debate-ai' && /\/debate-ai/.test(here)) return true;
    return false;
  }

  // Canonical link order. Keep tight — this is the bar, not a sitemap.
  // The primary CTA on the right (Voice AI pill, set further down) is
  // always present; it doubles as a back-to-app for visitors who landed
  // on a marketing page mid-flow.
  //
  // 2026-05-13: trimmed from 9 → 5 links. College Prep, High School,
  // Learn to Argue, and India were carrying second-tier audience
  // entry points that landed on the topbar of every page on the site,
  // pushing the bar's link list past the eye's scan budget. Those
  // surfaces still exist; they just route via in-page CTAs + footer +
  // the audience-page redirects rather than top-nav real estate.
  // Pricing dropped because /pricing was unused after the canonical
  // pricing data moved into the FAQ + JSON-LD.
  var LINKS = [
    { href: '/voice-debate',  label: 'Voice'        },
    // YouTube demo. external:true → opens in a new tab + adds
    // rel=noopener so the popup can't reach back through window.opener.
    // Points at the DebateAI channel landing for now; swap the href to
    // a specific video URL (https://youtu.be/XXXX) once the canonical
    // demo is recorded.
    { href: 'https://www.youtube.com/@debateai', label: 'Demo', external: true },
    { href: '/live',          label: 'Live', live: true },
    { href: '/community',     label: 'Community'    },
    { href: '/leaderboard',   label: 'Leaderboard'  },
    { href: '/#faq',          label: 'FAQ'          },
  ];

  function el(tag, attrs, children){
    var n = document.createElement(tag);
    if (attrs) for (var k in attrs){
      if (k === 'style' && typeof attrs[k] === 'object'){
        for (var s in attrs[k]) n.style[s] = attrs[k][s];
      } else if (k === 'html') {
        n.innerHTML = attrs[k];
      } else if (k.indexOf('on') === 0 && typeof attrs[k] === 'function'){
        n.addEventListener(k.slice(2).toLowerCase(), attrs[k]);
      } else if (attrs[k] !== false && attrs[k] != null){
        n.setAttribute(k, attrs[k]);
      }
    }
    if (children) {
      (Array.isArray(children) ? children : [children]).forEach(function(c){
        if (c == null || c === false) return;
        n.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
      });
    }
    return n;
  }

  function render(mountId){
    var mount = document.getElementById(mountId || 'daTopbar');
    if (!mount) return;

    var nav = el('nav', { class: 'ui-topbar', 'aria-label': 'Site navigation' });
    var left = el('div', { class: 'ui-topbar-left' }, [
      el('a', {
        href: '/',
        class: 'ui-topbar-logo',
        'aria-label': 'Debate AI, home',
        title: 'Back to home',
        html: '<span>Debate</span> AI.<sup style="font-size:.5em;opacity:.55;margin-left:2px;font-weight:400">&trade;</sup>',
      }),
    ]);

    var right = el('div', { class: 'ui-topbar-right' });
    LINKS.forEach(function(L){
      var active = !L.external && pathMatches(L.href);
      var attrs = {
        href: L.href,
        class: 'ui-topbar-link' + (active ? ' is-active' : ''),
        title: L.label,
      };
      // External links (YouTube demo, etc.) open in a new tab so the
      // user doesn't lose the page; rel=noopener prevents the popup
      // from reaching back through window.opener.
      if (L.external){
        attrs.target = '_blank';
        attrs.rel = 'noopener noreferrer';
      }
      var a = el('a', attrs);
      if (L.live){
        a.style.display = 'inline-flex';
        a.style.alignItems = 'center';
        a.style.gap = '6px';
        var dot = el('span');
        dot.style.cssText = 'width:6px;height:6px;border-radius:50%;background:#ef4444;box-shadow:0 0 8px #ef4444;display:inline-block';
        a.appendChild(dot);
      }
      a.appendChild(document.createTextNode(L.label));
      right.appendChild(a);
    });

    // SFX mute toggle. Sits between the page links and the auth slot
    // so it's consistent across pages. Inline SVG speaker icon —
    // not an emoji (per the 2026-05-10 emoji sweep). aria-pressed
    // flips when the user toggles, the strike-through line in the
    // SVG appears via CSS when [aria-pressed=true]. State is read
    // from window.SFX.isMuted() (localStorage da-sfx-muted) so it
    // picks up whatever the user set on a previous page.
    var sfxBtn = el('button', {
      class: 'sfx-toggle',
      type: 'button',
      'aria-pressed': 'false',
      'aria-label': 'Toggle sound effects',
      title: 'Mute sounds',
    });
    sfxBtn.innerHTML =
      '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
        '<path d="M11 5 6 9H2v6h4l5 4z"/>' +
        '<path class="sfx-wave" d="M15.5 8.5a5 5 0 0 1 0 7"/>' +
        '<path class="sfx-wave" d="M19 5a9 9 0 0 1 0 14"/>' +
        '<line class="sfx-strike" x1="3" y1="3" x2="21" y2="21"/>' +
      '</svg>';
    right.appendChild(sfxBtn);

    // Theme toggle. Single sun/moon button (not the old 3-dot tray)
    // so the topbar stays uncluttered while users can still flip to
    // the light token set. Cycles dark (crimson) ↔ light. Anyone
    // with `da-theme=grey` saved in localStorage keeps grey applied
    // on load but the toggle treats it as "dark family" — click goes
    // to light, click again goes to crimson. Inline SVG (no emoji per
    // 2026-05-10 sweep); CSS lives in /css/ui.css under .theme-toggle.
    var themeBtn = el('button', {
      class: 'theme-toggle',
      type: 'button',
      'aria-label': 'Toggle light theme',
      title: 'Switch to light theme',
    });
    themeBtn.innerHTML =
      // Sun (shown when in dark theme → click goes light)
      '<svg class="ti-sun" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
        '<circle cx="12" cy="12" r="4"/>' +
        '<path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/>' +
      '</svg>' +
      // Moon (shown when in light theme → click goes dark)
      '<svg class="ti-moon" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
        '<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>' +
      '</svg>';
    right.appendChild(themeBtn);

    // Primary CTA is now Voice AI everywhere — voice is the moat
    // against ChatGPT (real-time, sub-200ms, full interruption) and
    // the user-flagged most-important surface. Gold-amber gradient
    // makes it pop against the red brand wall. Falls back to
    // "Debate AI" when already on /voice-debate so the bar still
    // has a working CTA on every page.
    var onVoiceDebate = /\/voice-debate(\b|\/)/.test(here);
    var cta;
    if (onVoiceDebate) {
      cta = el('a', {
        href: '/debate-ai',
        class: 'ui-btn ui-btn-primary ui-btn-sm',
        style: { padding: '8px 18px' },
      }, 'Debate AI');
    } else {
      cta = el('a', {
        href: '/voice-debate',
        class: 'ui-btn ui-btn-sm ui-btn-voice',
        title: 'Talk out loud. The AI cuts in.',
        style: { padding: '8px 18px' },
      });
      // Removed the red recording-dot pulse — it read as "live recording"
      // which was misleading on a CTA that just routes to /voice-debate.
      // Plain text label per the 2026-05-10 emoji sweep; the gold-amber
      // gradient still does the visual identity work.
      cta.appendChild(document.createTextNode('Voice AI'));
    }
    right.appendChild(cta);

    var userSlot = el('span', { id: 'barUser' });
    userSlot.style.display = 'none';
    right.appendChild(userSlot);

    nav.appendChild(left);
    nav.appendChild(right);
    mount.replaceChildren(nav);

    wireThemeToggle();
    wireSfxToggle();
    hydrateUser(userSlot);
  }

  // SFX mute toggle. Reads window.SFX.isMuted() (localStorage-backed)
  // on mount + on click. SFX module loads with `defer` on every page
  // that needs it, but topbar.js may render before sfx.js parses —
  // we read defensively and re-sync via a window 'load' listener so
  // late-arriving state is reflected without a reload.
  function wireSfxToggle(){
    var btn = document.querySelector('.ui-topbar .sfx-toggle');
    if (!btn) return;
    function syncBtn(){
      var muted = !!(window.SFX && window.SFX.isMuted && window.SFX.isMuted());
      btn.setAttribute('aria-pressed', muted ? 'true' : 'false');
      btn.title = muted ? 'Sounds muted — click to unmute' : 'Mute sounds';
    }
    syncBtn();
    // Re-sync once the page is fully loaded in case sfx.js was deferred.
    window.addEventListener('load', syncBtn, { once: true });
    btn.addEventListener('click', function(){
      if (!window.SFX || typeof window.SFX.toggleMute !== 'function') return;
      var nowMuted = window.SFX.toggleMute();
      syncBtn();
      // Acoustic confirmation when sound comes BACK on. Going-to-muted
      // is silent by construction (SFX.confirm() would no-op after the
      // toggle). Without this, the user hits unmute and gets no signal
      // that anything happened — they have to interact with something
      // else to verify sound returned. confirm() is short + warm.
      if (!nowMuted) { try { window.SFX.confirm && window.SFX.confirm(); } catch(_){} }
    });
  }

  // Theme toggle — applies the saved theme on mount and wires the
  // sun/moon button. Cycle is dark (crimson) ↔ light. Treats grey
  // (legacy) as part of the "dark family": click from grey goes to
  // light, click again to crimson; grey is no longer reachable from
  // the toggle but still honored if saved in localStorage by an older
  // session. Hard reload on change so the token cascade and any
  // per-section <style> blocks settle from a clean slate.
  function wireThemeToggle(){
    // Migration v2026-05: dark is the brand default. One-time sweep
    // clears a legacy `da-theme=light` so subpages match the marketing
    // landing's dark front door. Gated by `da-theme-default-v2` so it
    // only runs once per browser; users who explicitly re-toggle to
    // light afterward keep their preference (the sentinel is already
    // set, so the migration won't fire again).
    try {
      if (!localStorage.getItem('da-theme-default-v2')) {
        if (localStorage.getItem('da-theme') === 'light') {
          localStorage.removeItem('da-theme');
        }
        localStorage.setItem('da-theme-default-v2', '1');
      }
    } catch(e){}
    var saved = '';
    try { saved = localStorage.getItem('da-theme') || ''; } catch(e){}
    if (!saved) saved = document.documentElement.getAttribute('data-theme') || 'crimson';
    document.documentElement.setAttribute('data-theme', saved);
    // Auto-sync data-lighting from data-theme on every page load. Fixes
    // the legacy out-of-sync state where /debate-ai set data-lighting
    // independently of data-theme and a user-toggled `da-theme=light`
    // wasn't reflected as `debateos-lighting=light`. Without this, the
    // topbar text picked up the [data-theme="light"] dark-text rule
    // from ui.css while the body kept the dark bg — unreadable nav.
    // Pages that explicitly want a different lighting (e.g. debate-ai's
    // React `lighting` state) can still override after this runs; the
    // attribute is just no longer left stale on first paint.
    var lighting = (saved === 'light') ? 'light' : 'dark';
    try { localStorage.setItem('debateos-lighting', lighting); } catch(e){}
    document.documentElement.setAttribute('data-lighting', lighting);
    syncBtn(saved);

    var btn = document.querySelector('.ui-topbar .theme-toggle');
    if (!btn) return;
    btn.addEventListener('click', function(){
      var prev = document.documentElement.getAttribute('data-theme') || 'crimson';
      var next = (prev === 'light') ? 'crimson' : 'light';
      // Mirror the choice into `debateos-lighting` too. /debate-ai has
      // its own page-local "lighting" attribute that controls body bg
      // + bar-links color; without this mirror, flipping the topbar to
      // light on /landing then opening /debate-ai gave data-theme=light
      // (so ui.css colored topbar text dark) but data-lighting=dark
      // (so debate-ai kept the body dark). Dark text on dark bg = the
      // unreadable nav contrast bug. Keep both attrs in lockstep here.
      var lighting = (next === 'light') ? 'light' : 'dark';
      try {
        localStorage.setItem('da-theme', next);
        localStorage.setItem('debateos-lighting', lighting);
      } catch(e){}
      document.documentElement.setAttribute('data-theme', next);
      document.documentElement.setAttribute('data-lighting', lighting);
      window.location.reload();
    });

    function syncBtn(t){
      var b = document.querySelector('.ui-topbar .theme-toggle');
      if (!b) return;
      var isLight = (t === 'light');
      b.setAttribute('aria-label', isLight ? 'Switch to dark theme' : 'Switch to light theme');
      b.title = isLight ? 'Switch to dark theme' : 'Switch to light theme';
      // Sun/moon visibility flips via CSS attribute selector on the
      // <html> data-theme so we don't have to do anything else here.
    }
  }

  // Sign-in slot. Only hydrates if the page already loaded firebase
  // (so we don't bloat pages that don't need it). Shows initial +
  // signs out on click.
  //
  // Extension hook: if the page sets `window.daTopbarUserSlot = function(slot, user){...}`
  // BEFORE this script loads, we hand off rendering after auth state
  // is known. /debate-ai uses this to add an "Account" button that
  // opens its in-app modal — without that hook we'd lose access to
  // BYOK / API key / plan settings on /debate-ai.
  function hydrateUser(slot){
    if (typeof window.firebase === 'undefined' || !window.firebase.auth) return;
    // Track the first auth event so we can distinguish "page loaded
    // with an already-signed-in user" (no sound) from "user just
    // completed the OAuth flow" (chime). Without this guard, every
    // page navigation while signed in would re-fire the chime.
    var seenAuth = false;
    try {
      window.firebase.auth().onAuthStateChanged(function(u){
        var wasFirst = !seenAuth;
        seenAuth = true;
        // Fire SFX.success only on a genuine sign-in: the very FIRST
        // auth event in this page session was a null user (or no event
        // came before) and now we have a user. The pre-existing case
        // (first event already has u set) means they were already
        // signed in from a prior page — no chime.
        if (u && !wasFirst) {
          try { window.SFX && window.SFX.success && window.SFX.success(); } catch(_){}
        }
        if (!u){ slot.style.display = 'none'; slot.innerHTML = ''; return; }
        if (typeof window.daTopbarUserSlot === 'function'){
          slot.style.display = 'inline-flex';
          slot.style.alignItems = 'center';
          slot.style.gap = '8px';
          try { window.daTopbarUserSlot(slot, u); return; } catch(e){ /* fall through */ }
        }
        slot.style.display = 'inline-flex';
        slot.style.alignItems = 'center';
        slot.style.gap = '10px';
        slot.style.fontSize = '.72rem';
        slot.style.color = 'var(--text-dim)';
        var first = ((u.displayName || u.email || '').split(/\s+/)[0]) || 'Account';
        slot.innerHTML = '';
        // Name doubles as the entry point to /profile so every signed-in
        // page surfaces a path to the dashboard. Pill chrome (rounded
        // border, optional photo, hover highlight) signals it's
        // clickable. On the /profile page itself we render a non-link
        // span so we don't show a "you are here → here" dead link;
        // the pill border switches to the accent to indicate "you're
        // already on this page."
        var onProfile = /^\/profile/.test(here);
        var nameLink;
        if (onProfile){
          nameLink = document.createElement('span');
          nameLink.style.cssText = 'color:var(--text);font-weight:700;font-size:.78rem;display:inline-flex;align-items:center;gap:7px;padding:4px 10px;border-radius:999px;border:1px solid var(--accent);background:var(--bg-elev)';
        } else {
          nameLink = document.createElement('a');
          nameLink.href = '/profile';
          nameLink.title = 'Open your dashboard';
          nameLink.style.cssText = 'color:var(--text);text-decoration:none;font-weight:700;font-size:.78rem;display:inline-flex;align-items:center;gap:7px;padding:4px 10px;border-radius:999px;border:1px solid var(--border);background:var(--bg-card,transparent);transition:background .15s,border-color .15s';
          nameLink.addEventListener('mouseenter', function(){
            nameLink.style.background = 'var(--bg-elev)';
            nameLink.style.borderColor = 'var(--accent)';
          });
          nameLink.addEventListener('mouseleave', function(){
            nameLink.style.background = 'var(--bg-card,transparent)';
            nameLink.style.borderColor = 'var(--border)';
          });
        }
        if (u.photoURL){
          var img = document.createElement('img');
          img.src = u.photoURL;
          img.alt = '';
          img.referrerPolicy = 'no-referrer';
          img.style.cssText = 'width:18px;height:18px;border-radius:50%;object-fit:cover';
          nameLink.appendChild(img);
        }
        var nameText = document.createElement('span');
        nameText.textContent = first;
        nameLink.appendChild(nameText);
        var out = document.createElement('button');
        out.type = 'button';
        out.textContent = 'Sign out';
        out.style.cssText = 'background:transparent;border:none;color:var(--text-dim);cursor:pointer;font-family:inherit;font-size:.68rem;padding:0';
        out.addEventListener('click', function(){
          try { window.firebase.auth().signOut(); } catch(e){}
        });
        slot.appendChild(nameLink);
        slot.appendChild(out);
      });
    } catch(e){}
  }

  if (document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', function(){ render(); });
  } else {
    render();
  }

  // Public hook so per-page code can re-render after auth or theme
  // changes if it needs to (rare).
  window.daTopbar = { render: render };
})();
