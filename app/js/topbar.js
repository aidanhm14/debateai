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
  /* DARK MODE DISABLED (2026-07-09): the site runs one light surface.
     The whole theme system (sun/moon toggle, saved-pref read, 70/30
     light/crimson bucketing) is KEPT below and dormant; flip this flag
     back to true to restore it. Saved da-theme values are untouched so
     preferences survive a revival. Pair with the same flag in
     landing.html (early-paint script + lighting-nudge toast). Pages
     with data-force-theme (hardcoded dark palettes like /us, /india)
     are unaffected; that's a page palette, not user dark mode. */
  var DARK_MODE_ENABLED = false;

  var here = (location.pathname || '/').replace(/\/$/,'') || '/';

  // Record that this visitor has reached the main page. home-magnet.js (on
  // deep SEO pages) reads this flag and never shows the "go to the main
  // page" popup to someone who has already been there. Path-guarded so it
  // only fires on the landing / app shell, never on a deep content page.
  if (here === '/' || /^\/(landing|index|app)(\.html)?$/.test(here)) {
    try { localStorage.setItem('dit-visited-home', '1'); } catch(e){}
  }

  // ── Brand face: load Crimson Pro reliably on EVERY topbar page ──
  // Crimson Pro is the site-wide house face (switched from Geist 2026-06-15).
  // Most pages ship their own <link> for it, but to guarantee the SAME
  // wordmark + headings render in Crimson Pro page-to-page (and avoid the
  // paint-in-fallback-then-swap flash when a page relies only on a CSS
  // @import), inject the real <link> (+ preconnect) here, once, on any
  // page that doesn't already load it. Identical URL everywhere so the
  // font file is a shared cache hit, not a second download.
  (function ensureBrandFont(){
    try {
      var head = document.head || document.getElementsByTagName('head')[0];
      if (!head) return;
      function addLink(rel, href, opts){
        if (document.querySelector('link[data-da-font][href="' + href + '"]')) return;
        var l = document.createElement('link');
        l.rel = rel; l.href = href; l.setAttribute('data-da-font','1');
        if (opts && opts.crossorigin) l.crossOrigin = 'anonymous';
        head.appendChild(l);
      }
      addLink('preconnect', 'https://fonts.googleapis.com');
      addLink('preconnect', 'https://fonts.gstatic.com', { crossorigin: true });
      var BRAND_FONT = 'https://fonts.googleapis.com/css2?family=Crimson+Pro:wght@300;400;500;600;700;800;900&display=swap';
      if (!document.querySelector('link[href*="family=Crimson"]')) {
        addLink('stylesheet', BRAND_FONT);
      }
    } catch (e) {}
  })();

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

  // 2026-06-23: the site-wide Coach FAB (floating orb + in-tab drawer/
  // iframe session) was RETIRED per Aidan — the in-tab popup was glitchy.
  // Coach now lives only on its own page at /coach (the "Coach" nav link
  // below routes there). /js/coach-fab.js is now a no-op stub; the
  // auto-injector that used to mount the orb on every topbar page is gone.

  // Shared multi-method sign-in modal (Google / email link / phone).
  // Loaded site-wide so legacy auth CTAs can call window.openAuthModal
  // and so its email-link completion handler runs when a user returns
  // via a magic link. It only pulls firebase when actually arriving
  // from a link, so it's cheap on normal loads.
  (function ensureAuthModalLoaded(){
    if (document.querySelector('script[src*="/js/auth-modal.js"]')) return;
    var s = document.createElement('script');
    s.src = '/js/auth-modal.js';
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
  // The Voice AI tab itself is the right-side action. The old separate
  // "Start a round" topbar button was removed so the bar stays lighter.
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
    // 2026-07-09: order follows the product path. Start live, learn the
    // rules, prep the case, judge a round, then schedule and credential.
    { href: '/spar',          label: 'LIVE', pulse: true },
    // 2026-07-01: /scale removed from the topbar per Aidan (declutter).
    // 2026-07-09: /scale now redirects into /future, the combined company philosophy page.
    { href: '/learn',         label: 'Learn'        },
    { href: '/app#case',      label: 'Prep'         },
    // 2026-06-27: /judge (paste a round, get a real ballot) surfaced from
    // deep-link-only. /float and /exhibition were removed from the bar per
    // Aidan (still reachable at /float and /exhibition directly).
    { href: '/judge',         label: 'Judge'        },
    // 2026-07-02: Certificate + Schedule restored per Aidan ("add more
    // back ... not too much") — high-intent product pillars: proof you
    // can earn, and the organized-round board when random live matching
    // is quiet. Held Coaches/Messages/Leaderboard off so the bar does
    // not overflow VOICE AI again at laptop widths. (Two parallel
    // sessions both restored the pair, so the entries were briefly
    // duplicated on the live bar — deduped same day.)
    { href: '/live',          label: 'Schedule'    },
    { href: '/credentials',   label: 'Certificate' },
    // 2026-06-15: Coach surfaced into the bar per Aidan. /coach is the
    // personal voice drill partner (GPT Realtime) that loads your
    // profile + nightly fingerprint.
    { href: '/coach',         label: 'Coach'        },
    // 2026-07-04: Room judge is the live Zoom / Twitch sidecar. Keep the
    // label short so the bar still fits at laptop widths.
    { href: '/room-judge',    label: 'Room'         },
    // FAQ stays off the bar; the landing carries it in-page.
    // 2026-05-22: /champions removed from the topbar nav per user ask.
    // The page stays live + crawlable; just not surfaced in the bar.
    // 2026-07-02: Leaderboard removed from the top bar per Aidan — it's
    // promoted contextually near the landing "who's here" section instead
    // of holding a top-nav slot. Page stays live + crawlable at
    // /leaderboard. (Community was folded into Leaderboard on 2026-06-14;
    // both are now off the bar.)
    // 2026-07-02: Coaches + Messages removed from the bar per Aidan
    // (declutter — the bar overflowed at laptop widths and the VOICE AI
    // button was getting cut off). Both pages stay live: /messages is
    // still reachable via the notifications bell, /coaches from
    // community surfaces. They can return when they fit.
    // 2026-06-24: The Floor surfaced into the bar per Aidan ("advertise
    // it more ... have it in a tab"). /floor is the play-money debate
    // prediction market (back who wins across three windows, AI judge
    // settles, leaderboard). noindex page; this is the on-site entry.
    // 2026-07-19: label Floor -> Bet per Aidan; route stays /floor.
    { href: '/floor',         label: 'Bet'          },
    // 2026-07-05 (later same day): Free vs Paid removed from the bar per
    // Aidan ("advertise this somehow else - remove it from top tab").
    // Promoted contextually instead: the free-tier usage banner CTA
    // (js/usage-banner.js) reads "Free vs Paid" -> /pricing at the
    // moment metering matters, and the landing hero secondary pill rail
    // carries a "Free vs Paid" pill (data-cta="hero-free-vs-paid").
    // /pricing stays live + crawlable; just not a top-nav slot.
    // 2026-07-05: Voice AI moved to the LAST slot per Aidan ("highlight
    // voice ai by putting it on the right side of the tabs") — the
    // rightmost tab, red + dotted via `hot`, sitting next to the primary
    // CTA. Routes to /newvoice (the rebuilt live clash); the classic
    // trainer stays reachable at /voice-debate via /newvoice crosslinks.
    // 2026-07-22: mobileKeep dropped. With Waitlist added below (2026-07-20)
    // the bar carried TWO kept pills on phones, and burger + Voice AI +
    // Waitlist + bell + language measured 398px inside a 375px bar, so the
    // language picker was sliced off the right edge on an iPhone. The
    // --mobile-keep rule was written to keep ONE tab. Waitlist is the
    // primary (solid fill) so it holds the slot; Voice AI stays one tap
    // away in the hamburger sheet, which already lists it.
    { href: '/newvoice',      label: 'Voice AI', hot: true },
    // 2026-07-20 (Aidan: "put the waitlist button at the very top and
    // highlight it top right"). Rightmost slot, solid fill so it reads
    // as the primary action next to the faint Voice AI pill. There is no
    // /waitlist page, only the landing section, so this is an anchor:
    // bare '#waitlist' when already on the landing (no reload), '/#waitlist'
    // from the other 46 pages.
    { href: '#waitlist',      label: 'Waitlist', cta: true, mobileKeep: true },
  ];

  // 2026-07-19: "More" menu. The bar holds the pillars; everything Aidan
  // pulled off it over June-July ("advertise this somehow else", "they can
  // return when they fit") had NO discovery surface left — app pages carry
  // no footer, so off-bar pages were reachable only by URL. One quiet
  // dropdown at the end of the rail (desktop) + a More group in the mobile
  // sheet fixes discovery without re-crowding the bar. Curated, grouped,
  // not a sitemap dump. Clicks land in GA4 as nav_more_open /
  // nav_more_click so usage is measurable per link.
  var MORE_GROUPS = [
    { head: 'Watch & compete', links: [
      // 2026-07-22: async rounds — record now, they answer later. The
      // no-simultaneity surface, so it belongs next to the live ones.
      { href: '/rounds',      label: 'Async rounds' },
      { href: '/spectate',    label: 'Spectate live rounds' },
      { href: '/leaderboard', label: 'Leaderboard' },
      { href: '/community',   label: 'Community' },
      // 2026-07-22: chat moved out of the /community Live tab onto its
      // own surface, so the public room and DMs share one frame.
      { href: '/chat',        label: 'Chat and DMs' },
    ]},
    { head: 'Train', links: [
      { href: '/voice-debate', label: 'Classic voice trainer' },
      { href: '/coaches',      label: 'Coaches' },
    ]},
    { head: 'Site', links: [
      { href: '/how-it-works', label: 'How it works' },
      { href: '/pricing', label: 'Free vs Paid' },
      { href: '/schools', label: 'For schools' },
      { href: '/atlas',   label: 'Debate atlas' },
      { href: '/story',   label: 'Story' },
      { href: '/future',  label: 'Vision' },
    ]},
  ];

  function navTrack(event, meta){
    try {
      if (typeof window.gtag === 'function') window.gtag('event', event, meta || {});
      else if (typeof window.track === 'function') window.track(event, meta || {});
    } catch(e){}
  }

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

    // ── Wordmark: "Debatable" in accent red ────────────────────────────
    // 2026-07-22, per Aidan: the red-vs-black A/B (2026-07-19, weighted
    // 90/10 to red) is CLOSED and red is the wordmark, everywhere, for
    // everyone. The bucketing, the sticky localStorage assignment and the
    // ab_exposure ping are all gone. Stale 'debateos-ab:wordmark_color'
    // keys in returning visitors' localStorage are simply never read
    // again, so nobody keeps a black wordmark from an old assignment.
    // The word sits in the existing accent span (.ui-topbar-logo span =
    // var(--accent)); the sr-only line still teaches crawlers and AT the
    // also-known-as names.
    var left = el('div', { class: 'ui-topbar-left' }, [
      el('a', {
        href: '/',
        class: 'ui-topbar-logo wm-red',
        'aria-label': 'Debatable, home',
        title: 'Back to home',
        html: '<span>Debatable</span>'
            + '<sup style="font-size:.5em;opacity:.55;margin-left:2px;font-weight:400">&trade;</sup>'
            + '<span class="sr-only" style="position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0">'
            + ' Debatable · also known as DebateIt · also known as Debate AI.'
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

    // "More" dropdown — mounted just BEFORE the hot Voice AI tab so the
    // rail reads: ...pillars · More · [VOICE AI] [CTA]. Voice AI stays the
    // rightmost tab per Aidan 2026-07-05. Desktop-only (≤560px hides it;
    // the mobile sheet carries the same links as a More group below).
    function buildMore(){
      var wrap = el('span', { class: 'ui-topbar-more' });
      var btn = el('button', {
        type: 'button',
        class: 'ui-topbar-link ui-topbar-more-btn',
        'aria-haspopup': 'true',
        'aria-expanded': 'false',
      });
      btn.innerHTML = 'More<svg viewBox="0 0 10 6" width="9" height="6" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M1 1l4 4 4-4"/></svg>';
      // hidden attr guards the closed state even when a stale-cached
      // ui.css predates the panel rules (SW skew showed it unstyled).
      var panel = el('div', { class: 'ui-topbar-more-panel', role: 'menu', 'aria-label': 'More pages', hidden: 'hidden' });
      MORE_GROUPS.forEach(function(G){
        var col = el('div', { class: 'ui-topbar-more-col' });
        col.appendChild(el('div', { class: 'ui-topbar-more-head' }, G.head));
        G.links.forEach(function(L){
          var a = el('a', {
            href: L.href,
            role: 'menuitem',
            class: pathMatches(L.href) ? 'is-active' : null,
          }, L.label);
          a.addEventListener('click', function(){ navTrack('nav_more_click', { to: L.href }); });
          col.appendChild(a);
        });
        panel.appendChild(col);
      });
      function closeMore(){
        btn.setAttribute('aria-expanded', 'false');
        panel.classList.remove('is-open');
        panel.hidden = true;
      }
      btn.addEventListener('click', function(e){
        e.stopPropagation();
        var open = panel.classList.toggle('is-open');
        panel.hidden = !open;
        btn.setAttribute('aria-expanded', open ? 'true' : 'false');
        if (open) navTrack('nav_more_open', {});
      });
      document.addEventListener('click', function(e){
        if (panel.classList.contains('is-open') && !wrap.contains(e.target)) closeMore();
      });
      document.addEventListener('keydown', function(e){
        if (e.key === 'Escape' && panel.classList.contains('is-open')) closeMore();
      });
      wrap.appendChild(btn);
      wrap.appendChild(panel);
      return wrap;
    }
    var moreMounted = false;

    LINKS.forEach(function(L){
      if (L.hot && !moreMounted){ right.appendChild(buildMore()); moreMounted = true; }
      var active = !L.external && pathMatches(L.href);
      // No `title` on text links — the label is already visible, and the
      // native tooltip just renders a dark box that floats over page
      // content on hover (e.g. the "Live" chip overlapping the hero).
      // Icon-only controls (SFX/theme/bell/CTA) keep their titles.
      var attrs = {
        href: L.href,
        class: 'ui-topbar-link' + (active ? ' is-active' : '') + (L.mobileKeep ? ' ui-topbar-link--mobile-keep' : ''),
      };
      // External links (YouTube demo, etc.) open in a new tab so the
      // user doesn't lose the page; rel=noopener prevents the popup
      // from reaching back through window.opener.
      if (L.external){
        attrs.target = '_blank';
        attrs.rel = 'noopener noreferrer';
      }
      if (L.cta && attrs.href === '#waitlist' && !/^\/(landing(\.html)?)?$/.test(here)) attrs.href = '/#waitlist';
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
        a.style.fontWeight = '800'; // Spar reads bold: it's the live-human headline action
        if (!document.getElementById('daSparPulseStyle')){
          var ps = document.createElement('style');
          ps.id = 'daSparPulseStyle';
          ps.textContent = '@keyframes daSparPulse{0%,100%{box-shadow:0 0 0 0 rgba(239,68,68,.55)}50%{box-shadow:0 0 0 5px rgba(239,68,68,0)}}.ui-topbar-spar-dot{width:6px;height:6px;border-radius:50%;background:#ef4444;display:inline-block;animation:daSparPulse 1.8s ease-out infinite}@media (prefers-reduced-motion:reduce){.ui-topbar-spar-dot{animation:none}}';
          document.head.appendChild(ps);
        }
        a.appendChild(el('span', { class: 'ui-topbar-spar-dot', 'aria-hidden': 'true' }));
      }
      // `hot` = the highlighted product tab (Voice AI). Red label in a
      // faint red pill so it reads as THE headline feature without
      // shouting over the primary CTA next to it.
      if (L.hot){
        a.style.display = 'inline-flex';
        a.style.alignItems = 'center';
        a.style.gap = '6px';
        a.style.fontWeight = '800';
        a.style.color = '#f87171';
        a.style.background = 'rgba(239,68,68,.10)';
        a.style.border = '1px solid rgba(239,68,68,.35)';
        a.style.borderRadius = '999px';
        a.style.padding = '5px 12px';
        if (!document.getElementById('daSparPulseStyle')){
          var hs = document.createElement('style');
          hs.id = 'daSparPulseStyle';
          hs.textContent = '@keyframes daSparPulse{0%,100%{box-shadow:0 0 0 0 rgba(239,68,68,.55)}50%{box-shadow:0 0 0 5px rgba(239,68,68,0)}}.ui-topbar-spar-dot{width:6px;height:6px;border-radius:50%;background:#ef4444;display:inline-block;animation:daSparPulse 1.8s ease-out infinite}@media (prefers-reduced-motion:reduce){.ui-topbar-spar-dot{animation:none}}';
          document.head.appendChild(hs);
        }
        a.appendChild(el('span', { class: 'ui-topbar-spar-dot', 'aria-hidden': 'true' }));
      }
      // `cta` = the one filled pill on the rail. Solid red on white text,
      // deliberately heavier than `hot` so the rail has a single clear
      // primary action at its right edge.
      if (L.cta){
        a.style.display = 'inline-flex';
        a.style.alignItems = 'center';
        a.style.fontWeight = '800';
        a.style.color = '#fff';
        a.style.background = '#dc2626';
        a.style.border = '1px solid #dc2626';
        a.style.borderRadius = '999px';
        a.style.padding = '5px 14px';
        a.style.boxShadow = '0 6px 18px -8px rgba(220,38,38,.7)';
      }
      a.appendChild(document.createTextNode(L.label));
      right.appendChild(a);
    });
    // No hot link in LINKS (future edit)? Mount More at the rail's end.
    if (!moreMounted){ right.appendChild(buildMore()); moreMounted = true; }

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
    // Positioning: when enabled, this button is appended before the
    // async bell and language picker mount. Dark mode is currently off,
    // so this stays dormant along with the rest of the theme controls.
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
    if (DARK_MODE_ENABLED) right.appendChild(themeBtn);

    // DM notification bell is mounted by /js/notifications.js (a
    // standalone module included site-wide, including on pages without
    // this topbar). It inserts itself into .ui-topbar-right before the
    // user slot. Kept out of here so there's a single source of truth
    // for notifications and no risk of a duplicate bell.
    // Sign-in / account slot at the right edge. Always
    // rendered: shows a "Sign in" button when signed out (not only the
    // signed-in pill), so every page surfaces a path to the free
    // account. hydrateUser() below paints + wires it.
    var userSlot = el('span', { id: 'barUser' });
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
    // More group: same curated off-bar links the desktop dropdown carries,
    // compacted into a two-column grid so the sheet stays one screen tall.
    sheet.appendChild(el('div', { class: 'ui-topbar-sheet-more-head' }, 'More'));
    var sheetMore = el('div', { class: 'ui-topbar-sheet-more' });
    MORE_GROUPS.forEach(function(G){
      G.links.forEach(function(L){
        var a = el('a', {
          href: L.href,
          role: 'menuitem',
          class: pathMatches(L.href) ? 'is-active' : null,
        }, L.label);
        a.addEventListener('click', function(){ navTrack('nav_more_click', { to: L.href, surface: 'sheet' }); });
        sheetMore.appendChild(a);
      });
    });
    sheet.appendChild(sheetMore);
    // Auth row in the mobile sheet. On desktop the Sign in pill lives in
    // the topbar; on mobile the right-side slot is hidden, so the sheet
    // carries it. Label flips to "Sign out" once signed in (hydrateUser
    // updates it); the handler branches on live auth at click time so it
    // always does the right thing.
    var sheetSignIn = el('button', {
      type: 'button',
      id: 'sheetSignIn',
      class: 'ui-topbar-sheet-link',
      role: 'menuitem',
    }, 'Sign in · free');
    sheetSignIn.style.cssText = 'background:none;border:none;width:100%;text-align:left;font:inherit;cursor:pointer;color:inherit';
    sheetSignIn.addEventListener('click', function(){
      closeSheet();
      if (fbRealUser()){ try { window.firebase.auth().signOut(); } catch(e){} }
      else {
        startGoogleSignIn().catch(function(err){
          console.warn('[topbar] google sign-in failed', (err && err.code) || err);
        });
      }
    });
    sheet.appendChild(sheetSignIn);

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
      btn.title = muted ? 'Sounds muted. Click to unmute' : 'Mute sounds';
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
    /* DARK MODE DISABLED (2026-07-09): pin every non-forced page to the
       light token set and stop. Everything below (migration, bucketing,
       click wiring) stays intact for revival via DARK_MODE_ENABLED at
       the top of this file. A saved dark pref is PARKED once under
       da-theme-saved-pref (not deleted) and da-theme is set to light so
       the ~21 pages with their own early-paint theme scripts stop
       flashing dark before this runs. On revival, restore da-theme from
       da-theme-saved-pref. */
    if (!DARK_MODE_ENABLED) {
      try {
        var cur = localStorage.getItem('da-theme');
        if (cur && cur !== 'light') {
          localStorage.setItem('da-theme-saved-pref', cur);
          localStorage.setItem('da-theme', 'light');
        }
        localStorage.setItem('debateos-lighting', 'light');
      } catch(e){}
      document.documentElement.setAttribute('data-theme', 'light');
      document.documentElement.setAttribute('data-lighting', 'light');
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

  // ── Firebase bootstrap (self-contained so the Sign in button works
  //    on every page, including content/SEO pages that don't preload
  //    firebase). Mirrors notifications.js — shared script ids mean
  //    nothing double-loads. ─────────────────────────────────────────
  var FB_APP_SDK = 'https://www.gstatic.com/firebasejs/10.5.0/firebase-app-compat.js';
  var FB_AUTH_SDK = 'https://www.gstatic.com/firebasejs/10.5.0/firebase-auth-compat.js';
  var FB_CONFIG = {
    apiKey: ["AIzaSyDDx","TYlyWLOJnFP99","e7XsLPb3FwIEijNNM"].join(""),
    authDomain: "debateos-78ac5.firebaseapp.com",
    projectId: "debateos-78ac5",
    storageBucket: "debateos-78ac5.firebasestorage.app",
    messagingSenderId: "860359449192",
    appId: "1:860359449192:web:f5dc0060dbd50d6c4fb9dd",
  };
  function fbLoadOnce(id, src, cb){
    var ex = document.getElementById(id);
    if (ex){ if (ex.dataset.loaded) cb(); else ex.addEventListener('load', cb, { once: true }); return; }
    var sc = document.createElement('script'); sc.id = id; sc.src = src;
    sc.addEventListener('load', function(){ sc.dataset.loaded = '1'; cb(); }, { once: true });
    sc.addEventListener('error', function(){});
    document.head.appendChild(sc);
  }
  function fbEnsureApp(){
    try { if (window.firebase && firebase.auth && (!firebase.apps || !firebase.apps.length)) firebase.initializeApp(FB_CONFIG); } catch(e){}
  }
  function fbAuthReady(){ return !!(window.firebase && window.firebase.auth && window.firebase.apps && window.firebase.apps.length); }
  function fbCurrentUser(){ try { return window.firebase && firebase.auth && firebase.auth().currentUser; } catch(e){ return null; } }
  function fbRealUser(){ var u = fbCurrentUser(); return u && !u.isAnonymous ? u : null; }
  function fbBootstrap(cb){
    if (fbAuthReady()){ cb(); return; }
    fbLoadOnce('da-fb-app', FB_APP_SDK, function(){
      fbLoadOnce('da-fb-auth', FB_AUTH_SDK, function(){ fbEnsureApp(); cb(); });
    });
  }
  function trackAuth(ev, meta){
    try { if (window.gtag) window.gtag('event', ev, meta || {}); } catch(e){}
  }
  function startGoogleSignIn(){
    return new Promise(function(resolve, reject){
      fbBootstrap(function(){
        try {
          var auth = window.firebase.auth();
          var provider = new window.firebase.auth.GoogleAuthProvider();
          provider.setCustomParameters({ prompt: 'select_account' });
          var openedAt = Date.now();
          var current = auth.currentUser;
          var attempt = (current && current.isAnonymous && current.linkWithPopup)
            ? current.linkWithPopup(provider).catch(function(err){
                var code = (err && err.code) || '';
                if (code === 'auth/credential-already-in-use' || code === 'auth/email-already-in-use'){
                  return auth.signInWithPopup(provider);
                }
                throw err;
              })
            : auth.signInWithPopup(provider);

          trackAuth('sign_in_start', { method: 'google', surface: 'topbar' });
          attempt.then(function(){
            try { localStorage.setItem('debateos-feedback-given', '1'); } catch(e){}
            trackAuth('sign_in_complete', { method: 'google', surface: 'topbar' });
            resolve();
          }).catch(function(err){
            var code = (err && err.code) || 'unknown';
            if (code === 'auth/popup-closed-by-user' && (Date.now() - openedAt) > 1200){
              reject(err);
              return;
            }
            if (code === 'auth/popup-blocked' || code === 'auth/operation-not-supported-in-this-environment' || code === 'auth/popup-closed-by-user'){
              var redirect = current && current.isAnonymous && current.linkWithRedirect
                ? current.linkWithRedirect(provider)
                : auth.signInWithRedirect(provider);
              Promise.resolve(redirect).then(resolve).catch(reject);
              return;
            }
            reject(err);
          });
        } catch(e){ reject(e); }
      });
    });
  }

  // Signed-OUT state: a ghost "Sign in" button. Click bootstraps
  // firebase if the page didn't preload it, then runs the Google popup.
  function renderSignedOut(slot){
    slot.style.display = 'inline-flex';
    slot.style.alignItems = 'center';
    slot.innerHTML = '';
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.id = 'barSignIn';
    btn.className = 'ui-btn ui-btn-ghost ui-btn-sm';
    btn.title = 'Sign in with Google. Free.';
    btn.textContent = 'Sign in';
    btn.addEventListener('click', function(){
      btn.disabled = true;
      btn.textContent = 'Opening…';
      startGoogleSignIn().catch(function(err){
        console.warn('[topbar] google sign-in failed', (err && err.code) || err);
      }).finally(function(){
        if (document.getElementById('barSignIn') === btn && !fbRealUser()){
          btn.disabled = false;
          btn.textContent = 'Sign in';
        }
      });
    });
    slot.appendChild(btn);
  }

  // Neutral placeholder for a returning (cached) signed-in user while
  // firebase finishes loading, so we never flash "Sign in" at someone
  // who is actually logged in.
  function renderAccountPlaceholder(slot){
    slot.style.display = 'inline-flex';
    slot.style.alignItems = 'center';
    slot.innerHTML = '';
    var a = document.createElement('a');
    a.href = '/profile';
    a.title = 'Open your dashboard';
    a.style.cssText = 'color:var(--text-dim);text-decoration:none;font-weight:700;font-size:.78rem;display:inline-flex;align-items:center;gap:7px;padding:4px 10px;border-radius:999px;border:1px solid var(--border)';
    a.textContent = 'Account';
    slot.appendChild(a);
  }

  // Signed-IN state: name pill (-> /profile) + Sign out. Extension hook:
  // if the page sets window.daTopbarUserSlot(slot, user) BEFORE this
  // script loads, we hand off rendering (e.g. /debate-it adds an Account
  // button that opens its in-app BYOK / plan modal).
  function renderSignedIn(slot, u){
    if (typeof window.daTopbarUserSlot === 'function'){
      slot.style.display = 'inline-flex';
      slot.style.alignItems = 'center';
      slot.style.gap = '8px';
      slot.innerHTML = '';
      try { window.daTopbarUserSlot(slot, u); return; } catch(e){ /* fall through */ }
    }
    slot.style.display = 'inline-flex';
    slot.style.alignItems = 'center';
    slot.style.gap = '10px';
    slot.style.fontSize = '.72rem';
    slot.style.color = 'var(--text-dim)';
    var first = ((u.displayName || u.email || '').split(/\s+/)[0]) || 'Account';
    slot.innerHTML = '';
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
      nameLink.addEventListener('mouseenter', function(){ nameLink.style.background = 'var(--bg-elev)'; nameLink.style.borderColor = 'var(--accent)'; });
      nameLink.addEventListener('mouseleave', function(){ nameLink.style.background = 'var(--bg-card,transparent)'; nameLink.style.borderColor = 'var(--border)'; });
    }
    if (u.photoURL){
      var img = document.createElement('img');
      img.src = u.photoURL; img.alt = ''; img.referrerPolicy = 'no-referrer';
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
    out.addEventListener('click', function(){ try { window.firebase.auth().signOut(); } catch(e){} });
    slot.appendChild(nameLink);
    slot.appendChild(out);
  }

  // Orchestration. Paint immediately (Sign in button, or an Account
  // placeholder for cached-signed-in users), then attach the real auth
  // listener once firebase is ready. notifications.js bootstraps
  // firebase site-wide, so "ready" usually arrives within ~1.5s;
  // cached-signed-in pages force the bootstrap so name + Sign out
  // resolve even where it doesn't.
  function hydrateUser(slot){
    var cachedSignedIn = false;
    try {
      for (var i = 0; i < localStorage.length; i++){
        var key = localStorage.key(i);
        if (/^firebase:authUser:/.test(key)){
          try {
            var raw = localStorage.getItem(key);
            var parsed = raw ? JSON.parse(raw) : null;
            if (parsed && !parsed.isAnonymous){ cachedSignedIn = true; break; }
          } catch(_){}
        }
      }
    } catch(e){}

    if (cachedSignedIn) renderAccountPlaceholder(slot); else renderSignedOut(slot);

    var seenAuth = false;
    function attach(){
      try {
        window.firebase.auth().onAuthStateChanged(function(u){
          var wasFirst = !seenAuth; seenAuth = true;
          var realUser = u && !u.isAnonymous ? u : null;
          if (realUser && !wasFirst){ try { window.SFX && window.SFX.success && window.SFX.success(); } catch(_){ } }
          var ss = document.getElementById('sheetSignIn');
          if (ss) ss.textContent = realUser ? 'Sign out' : 'Sign in · free';
          if (!realUser){ renderSignedOut(slot); return; }
          renderSignedIn(slot, realUser);
        });
      } catch(e){}
    }

    if (cachedSignedIn){
      fbBootstrap(attach);
    } else if (fbAuthReady()){
      attach();
    } else {
      var n = 0;
      var iv = setInterval(function(){
        n++;
        if (fbAuthReady()){ clearInterval(iv); attach(); }
        else if (n > 70){ clearInterval(iv); } // ~7s; Sign in click bootstraps on demand
      }, 100);
    }
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

/* ── Mailto chooser ─────────────────────────────────────────────
   Clicking any mailto: link used to dump visitors into whatever
   desktop mail app the OS picked (often Outlook, often unconfigured).
   Now: a small chooser offers Gmail, Outlook, or the default mail app,
   and shows the address with a copy button. Applies on every page that
   loads topbar.js; pages without it keep the plain mailto fallback. */
(function(){
  function parseMailto(href){
    var rest = (href || '').replace(/^mailto:/i, '').split('?');
    var out = { to: decodeURIComponent(rest[0] || ''), subject: '', body: '' };
    (rest[1] || '').split('&').forEach(function(kv){
      var p = kv.split('=');
      var k = (p[0] || '').toLowerCase();
      var v = decodeURIComponent((p[1] || '').replace(/\+/g, ' '));
      if (k === 'subject') out.subject = v;
      if (k === 'body') out.body = v;
    });
    return out;
  }
  function esc(s){ return encodeURIComponent(s || ''); }
  function show(info, rawHref){
    var old = document.getElementById('ditMailChooser');
    if (old) old.remove();
    var scrim = document.createElement('div');
    scrim.id = 'ditMailChooser';
    scrim.style.cssText = 'position:fixed;inset:0;background:rgba(20,16,12,.5);z-index:2147483000;display:flex;align-items:center;justify-content:center;padding:20px';
    var card = document.createElement('div');
    card.style.cssText = "background:#faf9f4;color:#1d1915;border-radius:14px;padding:20px 20px 16px;max-width:340px;width:100%;font-family:'Crimson Pro',Georgia,serif;box-shadow:0 18px 50px rgba(0,0,0,.3)";
    var gmail = 'https://mail.google.com/mail/?view=cm&fs=1&to=' + esc(info.to) + (info.subject ? '&su=' + esc(info.subject) : '') + (info.body ? '&body=' + esc(info.body) : '');
    var outlook = 'https://outlook.live.com/mail/0/deeplink/compose?to=' + esc(info.to) + (info.subject ? '&subject=' + esc(info.subject) : '') + (info.body ? '&body=' + esc(info.body) : '');
    var row = 'display:block;width:100%;text-align:left;padding:11px 14px;margin:8px 0 0;border:1px solid rgba(29,25,21,.15);border-radius:10px;background:#fff;color:#1d1915;font:inherit;font-size:15px;font-weight:600;cursor:pointer;text-decoration:none;box-sizing:border-box';
    card.innerHTML =
      '<div style="font-weight:800;font-size:17px">Send an email</div>' +
      '<div style="font-size:13.5px;color:rgba(29,25,21,.6);margin-top:2px;word-break:break-all">' + info.to.replace(/</g, '&lt;') + '</div>' +
      '<a data-x="gmail" style="' + row + '" href="' + gmail + '" target="_blank" rel="noopener">Open in Gmail</a>' +
      '<a data-x="outlook" style="' + row + '" href="' + outlook + '" target="_blank" rel="noopener">Open in Outlook</a>' +
      '<a data-x="mailapp" style="' + row + '" href="' + rawHref + '">Use my mail app</a>' +
      '<button data-x="copy" style="' + row + ';border-style:dashed;font-weight:600">Copy address</button>' +
      '<button data-x="close" style="display:block;margin:10px auto 0;border:0;background:none;color:rgba(29,25,21,.55);font:inherit;font-size:13px;cursor:pointer">Cancel</button>';
    scrim.appendChild(card);
    document.body.appendChild(scrim);
    function close(){ scrim.remove(); document.removeEventListener('keydown', onKey); }
    function onKey(e){ if (e.key === 'Escape') close(); }
    document.addEventListener('keydown', onKey);
    scrim.addEventListener('click', function(e){ if (e.target === scrim) close(); });
    card.addEventListener('click', function(e){
      var el = e.target && e.target.closest ? e.target.closest('[data-x]') : null;
      if (!el) return;
      var x = el.getAttribute('data-x');
      if (x === 'copy'){
        e.preventDefault();
        try { navigator.clipboard.writeText(info.to); el.textContent = 'Copied'; } catch(err){ el.textContent = info.to; }
        return;
      }
      if (x === 'close'){ e.preventDefault(); close(); return; }
      setTimeout(close, 150);
    });
  }
  document.addEventListener('click', function(e){
    var a = e.target && e.target.closest ? e.target.closest('a[href^="mailto:"]') : null;
    if (!a) return;
    var href = a.getAttribute('href') || '';
    var info = parseMailto(href);
    if (!info.to) return;
    e.preventDefault();
    show(info, href);
  }, true);
})();

/* ── Page narrator ───────────────────────────────────────────────
   "Listen to this page" — a pre-generated ElevenLabs narration that
   explains the page, and keeps playing while the visitor navigates.
   Loaded from here rather than from a <script> tag on each page so
   one edit covers every topbar page. read-aloud.js self-guards on
   window.__ditReadAloud and removes itself on pages that have no
   narration and nothing to resume, so this is safe everywhere.
   Built by scripts/generate-narration.mjs. */
(function(){
  if (window.__ditReadAloud) return;
  var s = document.createElement('script');
  s.src = '/js/read-aloud.js';
  s.defer = true;
  (document.body || document.head || document.documentElement).appendChild(s);
})();

/* ── Preference sync ─────────────────────────────────────────────
   Settings follow the signed-in account instead of the browser.
   Loaded from here for the same reason the narrator is: one edit
   reaches every topbar page. The module self-guards, does nothing
   at all when the page has no Firebase or nobody is signed in, and
   never touches secrets or A/B arm assignments. */
(function(){
  if (window.__ditPrefsSync) return;
  window.__ditPrefsSync = 1;
  var s = document.createElement('script');
  s.src = '/js/prefs-sync.js';
  s.defer = true;
  (document.body || document.head || document.documentElement).appendChild(s);
})();
