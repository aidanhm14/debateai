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
  // Normalize a few synonyms so "/" and "/landing" both light up Home.
  function pathMatches(href){
    var h = href.replace(/\/$/,'') || '/';
    if (h === here) return true;
    if (h === '/' && (here === '' || here === '/landing')) return true;
    if (h === '/debate-ai' && /\/debate-ai/.test(here)) return true;
    return false;
  }

  // Canonical link order. Keep tight — this is the bar, not a sitemap.
  // The primary CTA on the right (Debate AI pill) is always present;
  // it doubles as a back-to-app for visitors who landed on a marketing
  // page mid-flow.
  var LINKS = [
    { href: '/app#case',      label: 'College Prep' },
    { href: '/high-school',   label: 'High School'  },
    { href: '/learn',         label: 'Learn to Argue' },
    { href: '/voice-debate',  label: '🎙 Voice'     },
    { href: '/live',          label: 'Live', live: true },
    { href: '/community',     label: 'Community'    },
    { href: '/leaderboard',   label: 'Leaderboard'  },
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
      var active = pathMatches(L.href);
      var a = el('a', {
        href: L.href,
        class: 'ui-topbar-link' + (active ? ' is-active' : ''),
        title: L.label,
      });
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

    // SFX mute toggle. Sits between the page links and the theme
    // dots so it's consistent across pages. Inline SVG speaker icon —
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

    var dots = el('div', {
      class: 'theme-dots',
      role: 'group',
      'aria-label': 'Change lighting',
      title: 'Change lighting',
    });
    [
      { t: 'crimson', label: 'Crimson, default dark' },
      { t: 'grey',    label: 'Grey, neutral dark'    },
      { t: 'light',   label: 'Light, off-white'      },
    ].forEach(function(opt){
      var btn = el('button', {
        class: 'theme-dot',
        'data-t': opt.t,
        'aria-label': opt.label,
        title: opt.label,
        type: 'button',
      });
      dots.appendChild(btn);
    });
    right.appendChild(dots);

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

    wireThemeDots();
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
      window.SFX.toggleMute();
      syncBtn();
    });
  }

  // Theme picker — three dots, syncs with [data-theme] on <html> and
  // localStorage `da-theme`. Reads the current theme once on mount so
  // the active dot lights up correctly across page loads.
  //
  // Per-page lock: if the page sets `window.daLockTheme = 'crimson'`
  // (or any theme) before topbar.js runs, we honor it: don't read
  // localStorage, don't override the html attribute, hide the dots.
  // Landing uses this because the orb + casual-chat panel + sparring
  // CTAs were designed for crimson tokens only and break on the light
  // token set. Other pages are unaffected.
  function wireThemeDots(){
    if (window.daLockTheme){
      var locked = window.daLockTheme;
      document.documentElement.setAttribute('data-theme', locked);
      // Hide the dots — they exist in markup but mean nothing here.
      document.querySelectorAll('.ui-topbar .theme-dots').forEach(function(host){
        host.style.display = 'none';
      });
      return;
    }
    var current = '';
    try { current = localStorage.getItem('da-theme') || ''; } catch(e){}
    if (!current) current = document.documentElement.getAttribute('data-theme') || 'crimson';
    document.documentElement.setAttribute('data-theme', current);
    sync(current);
    document.querySelectorAll('.ui-topbar .theme-dot').forEach(function(d){
      d.addEventListener('click', function(){
        var t = d.getAttribute('data-t');
        var prev = document.documentElement.getAttribute('data-theme') || '';
        try { localStorage.setItem('da-theme', t); } catch(e){}
        // Hard reload on theme change so token cascade, ui.css
        // body-class rebinds, and any per-section <style> blocks
        // settle from scratch. Avoids half-flipped pages when
        // switching grey ↔ light ↔ crimson on surfaces with
        // section-scoped style blocks.
        if (prev !== t) {
          document.documentElement.setAttribute('data-theme', t);
          window.location.reload();
          return;
        }
        document.documentElement.setAttribute('data-theme', t);
        sync(t);
      });
    });
    function sync(t){
      document.querySelectorAll('.ui-topbar .theme-dot').forEach(function(x){
        x.classList.toggle('active', x.getAttribute('data-t') === t);
      });
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
    try {
      window.firebase.auth().onAuthStateChanged(function(u){
        if (!u){ slot.style.display = 'none'; slot.innerHTML = ''; return; }
        if (typeof window.daTopbarUserSlot === 'function'){
          slot.style.display = 'inline-flex';
          slot.style.alignItems = 'center';
          slot.style.gap = '8px';
          try { window.daTopbarUserSlot(slot, u); return; } catch(e){ /* fall through */ }
        }
        slot.style.display = 'inline-flex';
        slot.style.alignItems = 'center';
        slot.style.gap = '8px';
        slot.style.fontSize = '.72rem';
        slot.style.color = 'var(--text-dim)';
        var first = ((u.displayName || u.email || '').split(/\s+/)[0]) || 'Account';
        slot.innerHTML = '';
        var name = document.createElement('span');
        name.textContent = first;
        var out = document.createElement('button');
        out.type = 'button';
        out.textContent = 'Sign out';
        out.style.cssText = 'background:transparent;border:none;color:var(--text-dim);cursor:pointer;font-family:inherit;font-size:.7rem;padding:0';
        out.addEventListener('click', function(){
          try { window.firebase.auth().signOut(); } catch(e){}
        });
        slot.appendChild(name);
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
