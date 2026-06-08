/* Shared topbar — single source of truth for /landing, /debate-it,
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
  // dropped from /debate-it but still rendered by some old caches.
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

  // /js/sfx.js is lazy-loaded on first interaction with the mute
  // toggle (see wireSfxToggle below) — the vast majority of sessions
  // never touch the button, so eagerly parsing the module + spinning
  // up its Web Audio context on every page was wasted work. The
  // muted-state visual is read directly from localStorage so the
  // button's initial icon is accurate without the script.
  //   Prior to 2026-05-27 this was an eager appendChild auto-inject.
  // The original concern ("user clicks and nothing happens") is
  // handled by the click-time load in wireSfxToggle: the click
  // handler awaits the import, then runs toggle + confirm tone.
  function ensureSfxLoadedOnDemand(){
    if (window.SFX) return Promise.resolve();
    if (ensureSfxLoadedOnDemand._inFlight) return ensureSfxLoadedOnDemand._inFlight;
    ensureSfxLoadedOnDemand._inFlight = new Promise(function(resolve){
      var existing = document.querySelector('script[src*="/js/sfx.js"]');
      if (existing){ existing.addEventListener('load', function(){ resolve(); }, { once: true }); return; }
      var s = document.createElement('script');
      s.src = '/js/sfx.js';
      s.async = true;
      s.addEventListener('load', function(){ resolve(); }, { once: true });
      s.addEventListener('error', function(){ resolve(); }, { once: true });
      document.head.appendChild(s);
    });
    return ensureSfxLoadedOnDemand._inFlight;
  }

  // Site-wide Coach FAB — bottom-right floating button on every page
  // that mounts the shared topbar. The FAB script itself is a
  // self-rendering IIFE that hides on /coach (would be redundant)
  // and inside the /tools/copy-edit iframe shell. Same auto-injection
  // pattern as sfx.js above so individual page HTML never has to
  // think about including it. Idempotent.
  (function ensureCoachFabLoaded(){
    if (document.querySelector('script[src*="/js/coach-fab.js"]')) return;
    var s = document.createElement('script');
    s.src = '/js/coach-fab.js';
    s.defer = true;
    document.head.appendChild(s);
  })();

  // Normalize a few synonyms so "/" and "/landing" both light up Home.
  function pathMatches(href){
    var h = href.replace(/\/$/,'') || '/';
    if (h === here) return true;
    if (h === '/' && (here === '' || here === '/landing')) return true;
    if (h === '/debate-it' && /\/debate-it/.test(here)) return true;
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
  //
  // 2026-05-18: Learn restored. The /learn surface has grown into a
  // real educational hub (fundamentals + format references + 10
  // long-tail guides + 4 education primers). It's now one of the
  // strongest SEO surfaces on the site and needs first-class
  // navigation, not footer-only access. Positioned between Prep
  // (where users build cases) and Live so it reads as the natural
  // "before you compete, learn" entry point.
  // 2026-05-22: /today removed from the topbar nav. The daily-motion
  // pages stay live + crawlable for SEO, but the weekly motion in /app
  // (the "Debate of the week" card) is the front-and-center surface now.
  // 2026-05-26: Spar added per Aidan "have the button for this somewhere
  // early on the nav." /spar is the live-human matchmaker + DM waitlist
  // marketplace ("Finding you a debater" page). Positioned right after
  // Voice so the two real-time-entry actions sit adjacent at the front
  // of the bar — Voice = match against AI, Spar = match against a human.
  var LINKS = [
    { href: '/voice-debate',  label: 'Voice'        },
    { href: '/spar',          label: 'Spar', pulse: true },
    { href: '/app#case',      label: 'Prep'         },
    { href: '/learn',         label: 'Learn'        },
    // 2026-05-26: /credentials surfaced into the topbar per user ask.
    // It's a recently-shipped feature ("earn a verifiable DebateIt
    // credential"), still acquiring distribution. Sits after Learn
    // because cert is the outcome of a learning loop — natural pairing
    // on the bar. Short "Cert" label matches the one-word convention.
    { href: '/credentials',   label: 'Cert'         },
    // 2026-05-18: /rounds standalone listing retired — the published-
    // rounds tab now lives inside /community. The topbar already links
    // to Community below, so a separate Rounds entry would just point
    // to the same surface twice.
    { href: '/live',          label: 'Live', live: true },
    // 2026-05-22: /champions removed from the topbar nav per user ask.
    // The page stays live + crawlable; just not surfaced in the bar.
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

    // ── Rotating wordmark (2026-05-26) ────────────────────────────────
    // Three-word brand system: product name = "DebateIt" (matches the
    // domain), personality = "DebateIt", CTA verb = "Debate it".
    // Wordmark picks one of the three on every page load so the brand
    // surface feels alive without confusing visitors — same accent-red
    // styling on the lead word, same TM mark, same size. Picks are
    // weighted so the canonical "DebateIt" lands ~50% of the time and
    // the two personality words split the rest, keeping product-name
    // recognition stable while still surfacing "DebateIt" / "Debate it"
    // as known brand variants. Fixed for the lifetime of a single page
    // view via sessionStorage so navigating between pages doesn't
    // flicker between forms (only a hard reload re-rolls).
    //
    // SEO note: Googlebot executes JS but takes one snapshot per crawl,
    // so the rotation only surfaces ONE variant per indexing pass.
    // The static "Also known as" line below + the alternateName JSON-LD
    // on landing/pricing/debate-it/debatable are what actually teach
    // Google that all three are the same brand entity.
    var BRAND_VARIANTS = [
      // 2026-05-26: weights flipped to pin the wordmark to "Debate it."
      // Per the broader DebateIt brand pivot (commit aafbe94 made /live
      // the canonical hub under the DebateIt brand). Weights are kept on
      // the other two so a future un-pin is a one-number edit, not a
      // structural revert. Aria + JSON-LD alternateName still teach
      // Google the three names are the same entity.
      { key: 'debate_ai',  lead: 'Debate', tail: ' AI.',  weight: 0, aria: 'DebateIt, home' },
      { key: 'debatable',  lead: 'DebateIt', tail: '.',  weight: 0, aria: 'DebateIt, home' },
      { key: 'debate_it',  lead: 'Debate', tail: ' it.',  weight: 10, aria: 'Debate it, home' }
    ];
    function pickWordmark(){
      // sessionStorage so a page navigation within the same tab keeps
      // the same wordmark — only a hard reload (or new tab) re-rolls.
      // This avoids the brand-name flickering as the user clicks around.
      try {
        var cached = sessionStorage.getItem('da-wordmark-variant');
        if (cached) {
          for (var i = 0; i < BRAND_VARIANTS.length; i++) {
            // Only honor the cached pick if its weight is still > 0.
            // Otherwise the rotation has been re-weighted since the user's
            // last visit (e.g. a variant retired); re-roll so they see a
            // currently-active brand instead of a stale one.
            if (BRAND_VARIANTS[i].key === cached && BRAND_VARIANTS[i].weight > 0) {
              return BRAND_VARIANTS[i];
            }
          }
        }
      } catch (e) {}
      var total = 0;
      for (var j = 0; j < BRAND_VARIANTS.length; j++) total += BRAND_VARIANTS[j].weight;
      var r = Math.random() * total;
      var acc = 0;
      var picked = BRAND_VARIANTS[0];
      for (var k = 0; k < BRAND_VARIANTS.length; k++) {
        acc += BRAND_VARIANTS[k].weight;
        if (r < acc) { picked = BRAND_VARIANTS[k]; break; }
      }
      try { sessionStorage.setItem('da-wordmark-variant', picked.key); } catch (e) {}
      // GA event so we can see which name gets the most click-through
      // over time. Tells us which brand name to lean into.
      try {
        if (window.gtag) window.gtag('event', 'wordmark_render', {
          event_category: 'brand', event_label: picked.key
        });
        if (window.dosTrack) window.dosTrack('wordmark_render', { variant: picked.key });
      } catch (e) {}
      return picked;
    }
    var WM = pickWordmark();

    var left = el('div', { class: 'ui-topbar-left' }, [
      el('a', {
        href: '/',
        class: 'ui-topbar-logo',
        'aria-label': WM.aria,
        title: 'Back to home',
        // First word in accent-red (.ui-topbar-logo span color is var(--accent)),
        // remainder in default text color. Trailing period + TM are common
        // across all three variants for visual consistency.
        // Also: a screen-reader-only "Also known as" line so crawlers + AT
        // users get all three brand names regardless of which variant the
        // JS picked. The .sr-only span is in every render so SEO indexing
        // doesn't depend on the rotation snapshot Google happens to take.
        html: '<span>' + WM.lead + '</span>' + WM.tail
            + '<sup style="font-size:.5em;opacity:.55;margin-left:2px;font-weight:400">&trade;</sup>'
            + '<span class="sr-only" style="position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0">'
            + ' DebateIt · also known as Debate AI · also known as Debate it.'
            + '</span>',
      }),
      // 2026-05-18: the "Beta · Updating daily" chip used to sit next to
      // the wordmark on every page. It read as crowded chrome that
      // pushed the nav links rightward without earning the pixels.
      // Beta state still lives in the /pricing FAQ and the floating
      // upgrade-cta pill; the topbar doesn't need to also pin it.
    ]);

    var right = el('div', { class: 'ui-topbar-right' });
    // 2026-05-26: mobile-only hamburger. Topbar links display:none at
    // ≤560px (see ui.css), leaving mobile users with no in-bar nav.
    // This button toggles a slide-down sheet that mirrors LINKS so
    // /voice, /spar, /prep, /learn, /live, /community, /leaderboard,
    // /cert, /faq are all reachable on mobile. Hidden on desktop via
    // CSS (display:none above 560px).
    var burger = el('button', {
      class: 'ui-topbar-burger',
      type: 'button',
      'aria-label': 'Menu',
      'aria-expanded': 'false',
      title: 'Menu',
    });
    burger.innerHTML =
      '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true">' +
        '<line x1="4" y1="7"  x2="20" y2="7"/>' +
        '<line x1="4" y1="12" x2="20" y2="12"/>' +
        '<line x1="4" y1="17" x2="20" y2="17"/>' +
      '</svg>';
    right.appendChild(burger);
    LINKS.forEach(function(L){
      var active = !L.external && pathMatches(L.href);
      // No `title` on text links — the label is already visible, and the
      // native tooltip just renders a dark box that floats over page
      // content on hover (e.g. the "Live" chip overlapping the hero).
      // Icon-only controls (SFX/theme/bell/CTA) keep their titles.
      var attrs = {
        href: L.href,
        class: 'ui-topbar-link' + (active ? ' is-active' : ''),
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
      // Spar: a pulsing dot (vs Live's static one) so the live-human
      // matchmaker reads as "jump in, real-time" without a fake "N online"
      // claim. Animation injected once; honors prefers-reduced-motion.
      if (L.pulse){
        a.style.display = 'inline-flex';
        a.style.alignItems = 'center';
        a.style.gap = '6px';
        if (!document.getElementById('daSparPulseStyle')){
          var ps = document.createElement('style');
          ps.id = 'daSparPulseStyle';
          ps.textContent = '@keyframes daSparPulse{0%,100%{box-shadow:0 0 0 0 rgba(239,68,68,.55)}50%{box-shadow:0 0 0 5px rgba(239,68,68,0)}}.ui-topbar-spar-dot{width:6px;height:6px;border-radius:50%;background:#ef4444;display:inline-block;animation:daSparPulse 1.8s ease-out infinite}@media (prefers-reduced-motion:reduce){.ui-topbar-spar-dot{animation:none}}';
          document.head.appendChild(ps);
        }
        a.appendChild(el('span', { class: 'ui-topbar-spar-dot', 'aria-hidden': 'true' }));
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
    // 2026-05-26: SFX mute toggle retired from the topbar everywhere
    // per Aidan. JS button construction skipped so the DOM node never
    // exists, ui.css display:none guards as a second layer in case a
    // future commit revives this block without removing the CSS rule.
    // window.SFX still loads + reads localStorage so existing per-page
    // sound state (mute / unmute set in an earlier session) is honored;
    // only the topbar control surface is gone.
    var sfxBtn = null;

    // Theme toggle. Single sun/moon button (not the old 3-dot tray)
    // so the topbar stays uncluttered while users can still flip to
    // the light token set. Three-way cycle (2026-05-14): light →
    // crimson → stone → light. Stone is the warm-graphite dark
    // variant; crimson is the pure-black brand-red variant. Icon
    // shows sun when current is any dark family (click goes light)
    // and moon when current is light (click goes dark). Legacy
    // `da-theme=grey` is honored on load and treated as dark-family
    // for cycle purposes (click → light). CSS lives in /css/ui.css
    // under .theme-toggle.
    // 2026-05-27 plane session: theme toggle REVIVED per Aidan's
    // request ("have the option to change lighting here"). Single
    // sun/moon button — sun shows when current theme is dark-family,
    // moon shows when current is light. The sun↔moon swap is a pure
    // CSS opacity flip keyed on [data-theme] (see ui.css .theme-toggle
    // .ti-sun / .ti-moon rules). The click handler lives in
    // wireThemeToggle() below and reloads the page so the token
    // cascade settles from a clean slate.
    //
    // Positioning: this button is appended to ui-topbar-right BEFORE
    // the bell and lang-picker mount (those run async on
    // DOMContentLoaded and both insertBefore(..., CTA)). The
    // lang-picker IIFE in landing.html does a final reorder so the
    // visual sequence reads as: bell | theme-toggle | lang-picker |
    // Voice AI CTA. On pages without a lang-picker the toggle just
    // sits between the bell and the CTA.
    var themeBtn = el('button', {
      type: 'button',
      class: 'theme-toggle',
      'aria-label': 'Toggle lighting',
      title: 'Toggle lighting',
    });
    // Sun + moon SVGs share the same 16x16 viewbox. CSS positions
    // them absolute-stacked so the opacity flip swaps them in place.
    // currentColor inherits from .theme-toggle so the hover/focus
    // state recolors both icons together.
    themeBtn.innerHTML =
      '<svg class="ti-sun" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
        '<circle cx="8" cy="8" r="2.6"/>' +
        '<path d="M8 1.6v1.6M8 12.8v1.6M1.6 8h1.6M12.8 8h1.6M3.34 3.34l1.13 1.13M11.53 11.53l1.13 1.13M3.34 12.66l1.13-1.13M11.53 4.47l1.13-1.13"/>' +
      '</svg>' +
      '<svg class="ti-moon" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
        '<path d="M13.2 9.6A5.6 5.6 0 0 1 6.4 2.8a5.6 5.6 0 1 0 6.8 6.8z"/>' +
      '</svg>';
    right.appendChild(themeBtn);

    // DM notification bell is mounted by /js/notifications.js (a
    // standalone module included site-wide, including on pages without
    // this topbar). It inserts itself into .ui-topbar-right before the
    // primary CTA. Kept out of here so there's a single source of truth
    // for notifications and no risk of a duplicate bell.

    // Primary CTA is Voice AI everywhere — voice is the moat
    // against ChatGPT (real-time, sub-200ms, full interruption) and
    // the user-flagged most-important surface. Brand red keeps the
    // topbar visually calm; the prior gold-amber gradient read as
    // braggy. Falls back to the "Debate it" CTA verb when already
    // on /voice-debate so the bar still has a working CTA on every
    // page (and the verb stays consistent across surfaces).
    var onVoiceDebate = /\/voice-debate(\b|\/)/.test(here);
    var cta;
    if (onVoiceDebate) {
      cta = el('a', {
        href: '/debate-it',
        class: 'ui-btn ui-btn-primary ui-btn-sm',
        style: { padding: '8px 18px' },
      }, 'Debate it');
    } else {
      cta = el('a', {
        href: '/voice-debate',
        class: 'ui-btn ui-btn-primary ui-btn-sm',
        title: 'Talk out loud. The AI cuts in.',
        style: { padding: '8px 18px' },
      }, 'Voice AI');
    }
    right.appendChild(cta);

    var userSlot = el('span', { id: 'barUser' });
    userSlot.style.display = 'none';
    right.appendChild(userSlot);

    nav.appendChild(left);
    nav.appendChild(right);

    // ── Mobile sheet (slide-down panel triggered by the hamburger) ──
    // Built once per page mount. Holds a stacked list of LINKS + the
    // CTA so mobile users get the same nav surface desktop has. Sheet
    // sits as a sibling of <nav> inside the mount so it's positioned
    // relative to the topbar, not the page.
    var sheet = el('div', {
      class: 'ui-topbar-sheet',
      role: 'menu',
      'aria-label': 'Mobile navigation',
      hidden: 'hidden',
    });
    LINKS.forEach(function(L){
      var sheetLink = el('a', {
        href: L.href,
        class: 'ui-topbar-sheet-link' + (pathMatches(L.href) ? ' is-active' : ''),
        role: 'menuitem',
      });
      if (L.live){
        var sdot = el('span', { class: 'ui-topbar-sheet-dot' });
        sheetLink.appendChild(sdot);
      }
      sheetLink.appendChild(document.createTextNode(L.label));
      sheet.appendChild(sheetLink);
    });
    var sheetCta = el('a', {
      href: onVoiceDebate ? '/debate-it' : '/voice-debate',
      class: 'ui-topbar-sheet-cta',
      role: 'menuitem',
    }, onVoiceDebate ? 'Debate it →' : 'Voice AI →');
    sheet.appendChild(sheetCta);

    var sheetBackdrop = el('div', {
      class: 'ui-topbar-sheet-backdrop',
      hidden: 'hidden',
      'aria-hidden': 'true',
    });

    mount.replaceChildren(nav, sheetBackdrop, sheet);

    // Hamburger wiring. Open/close toggles aria-expanded + .is-open
    // on the burger, and hidden + .is-open on the sheet/backdrop.
    // Closes on: outside tap (backdrop), ESC, or link click (navigation
    // implicitly closes since the page reloads, but we explicitly close
    // anyway so a same-page hash link doesn't leave the sheet open).
    function openSheet(){
      burger.setAttribute('aria-expanded', 'true');
      burger.classList.add('is-open');
      sheet.removeAttribute('hidden');
      sheetBackdrop.removeAttribute('hidden');
      // Defer the class flip one frame so the transition catches.
      requestAnimationFrame(function(){
        sheet.classList.add('is-open');
        sheetBackdrop.classList.add('is-open');
      });
      document.body.style.overflow = 'hidden';
    }
    function closeSheet(){
      burger.setAttribute('aria-expanded', 'false');
      burger.classList.remove('is-open');
      sheet.classList.remove('is-open');
      sheetBackdrop.classList.remove('is-open');
      document.body.style.overflow = '';
      // Hide after transition so it doesn't steal taps mid-fade.
      setTimeout(function(){
        if (!sheet.classList.contains('is-open')) {
          sheet.setAttribute('hidden', 'hidden');
          sheetBackdrop.setAttribute('hidden', 'hidden');
        }
      }, 220);
    }
    burger.addEventListener('click', function(){
      if (burger.classList.contains('is-open')) closeSheet(); else openSheet();
    });
    sheetBackdrop.addEventListener('click', closeSheet);
    sheet.addEventListener('click', function(e){
      if (e.target && e.target.tagName === 'A') closeSheet();
    });
    document.addEventListener('keydown', function(e){
      if (e.key === 'Escape' && burger.classList.contains('is-open')) closeSheet();
    });

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
    function readMutedFromStorage(){
      // Mirror SFX.isMuted's storage key so we can paint the right
      // initial state before /js/sfx.js has been lazy-loaded.
      try { return localStorage.getItem('da-sfx-muted') === '1'; } catch(_){ return false; }
    }
    function syncBtn(){
      var muted = window.SFX && window.SFX.isMuted ? !!window.SFX.isMuted() : readMutedFromStorage();
      btn.setAttribute('aria-pressed', muted ? 'true' : 'false');
      btn.title = muted ? 'Sounds muted — click to unmute' : 'Mute sounds';
    }
    syncBtn();
    btn.addEventListener('click', function(){
      // Lazy-load /js/sfx.js on FIRST click. Subsequent clicks find
      // window.SFX already present and skip the import. The promise
      // resolves immediately on the second click since the script
      // is already in cache.
      ensureSfxLoadedOnDemand().then(function(){
        if (!window.SFX || typeof window.SFX.toggleMute !== 'function') return;
        var nowMuted = window.SFX.toggleMute();
        syncBtn();
        // Acoustic confirmation when sound comes BACK on. Going-to-
        // muted is silent by construction (SFX.confirm() would no-op
        // after the toggle). Without this, the user hits unmute and
        // gets no signal that anything happened.
        if (!nowMuted) { try { window.SFX.confirm && window.SFX.confirm(); } catch(_){} }
      });
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
    // Page-level opt-out: pages whose <body> palette is hardcoded (e.g.
    // /us, /india) set <html data-force-theme="crimson"> so the shared
    // topbar always renders its matching DARK token set regardless of
    // the visitor's saved da-theme. Without this, a visitor carrying
    // da-theme=light from the app gets dark-on-dark, unreadable nav on
    // a body that can't go light. Pin the theme, hide the (meaningless
    // here) toggle, and skip the localStorage read + toggle wiring.
    var forced = document.documentElement.getAttribute('data-force-theme');
    if (forced) {
      document.documentElement.setAttribute('data-theme', forced);
      document.documentElement.setAttribute('data-lighting', forced === 'light' ? 'light' : 'dark');
      var ft = document.querySelector('.ui-topbar .theme-toggle');
      if (ft) ft.style.display = 'none';
      return;
    }
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
    if (!saved) {
      // No explicit pick yet (and not arrived via the landing, which sets
      // da-theme itself). Bucket ~70% light / ~30% crimson per Aidan
      // 2026-06-01 ("default to white 70%+ sitewide"), and persist to
      // da-theme — same key the landing uses — so the default is stable
      // across pages and consistent whichever surface the visitor hits
      // first. An explicit topbar toggle still overrides it.
      saved = (Math.random() < 0.70) ? 'light' : 'crimson';
      try {
        localStorage.setItem('da-theme', saved);
        if (!localStorage.getItem('da-theme-ab')) localStorage.setItem('da-theme-ab', saved);
      } catch(e){}
    }
    document.documentElement.setAttribute('data-theme', saved);
    // Auto-sync data-lighting from data-theme on every page load. Fixes
    // the legacy out-of-sync state where /debate-it set data-lighting
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
      // Binary toggle (2026-05-18): user wants only dark + light, no
      // middle grey/stone variant. Anything that isn't `light` flips to
      // light; light flips back to crimson. Legacy values (grey, stone)
      // are treated as dark for the purpose of "next click goes light",
      // so users who had those saved get a sensible one-click escape
      // hatch without us having to migrate localStorage.
      var next = (prev === 'light') ? 'crimson' : 'light';
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
      // Tooltip names the only other state since the cycle is now
      // binary. Legacy grey/stone values are treated as dark — next
      // click goes light.
      var nextLabel = isLight ? 'Dark' : 'Light';
      b.setAttribute('aria-label', 'Switch to ' + nextLabel);
      b.title = 'Switch to ' + nextLabel;
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
  // is known. /debate-it uses this to add an "Account" button that
  // opens its in-app modal — without that hook we'd lose access to
  // BYOK / API key / plan settings on /debate-it.
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
