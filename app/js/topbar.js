/* Shared topbar — single source of truth for /landing, /practice,
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
  /* DARK MODE is on sitewide via the sun/moon toggle (re-enabled as an
     opt-in 2026-08-10). The 2026-08-19 70/30 light/crimson assignment
     was retired 2026-08-22, per the founder: light is the default for
     every unset visitor, and auto-bucketed crimson visitors migrate
     back once (da-theme-light-v3). The toggle still overrides
     permanently on the first click, so nobody is stuck. Prefs parked by the
     2026-07-09 disable are restored once from da-theme-saved-pref.
     Pair with the same flag in landing.html (early-paint script +
     lighting-nudge toast). Pages with data-force-theme (hardcoded dark
     palettes like /us, /india) are unaffected. */
  var DARK_MODE_ENABLED = true;

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
      var BRAND_FONT = 'https://fonts.googleapis.com/css2?family=Archivo:wdth,wght@62..125,100..900&family=Inter:wght@400..900&family=Source+Serif+4:opsz,wght@8..60,400;8..60,600&display=swap';
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
  // dropped from /practice but still rendered by some old caches.
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
  // iframe session) was RETIRED per the founder — the in-tab popup was glitchy.
  // Coach now lives only on its own page at /coach (the "Coach" nav link
  // below routes there). /js/coach-fab.js is now a no-op stub; the
  // auto-injector that used to mount the orb on every topbar page is gone.

  // Shared sign-in modal (email/password + Google; Apple in the native app).
  // Loaded site-wide so every auth CTA can offer the same choices.
  (function ensureAuthModalLoaded(){
    if (document.querySelector('script[src*="/js/auth-modal.js"]')) return;
    var s = document.createElement('script');
    s.src = '/js/auth-modal.js';
    s.defer = true;
    document.head.appendChild(s);
  })();

  // Audience mode rides every topbar page: it stamps
  // data-debate-experience on <html> and swaps data-plain copy for
  // visitors who said they are new to debate, so any page can offer
  // plain-language variants of debate-register copy.
  (function ensureAudienceModeLoaded(){
    if (document.querySelector('script[src*="/js/audience-mode.js"]')) return;
    var s = document.createElement('script');
    s.src = '/js/audience-mode.js';
    s.defer = true;
    document.head.appendChild(s);
  })();

  // Notifications + availability ride every topbar page. notifications.js
  // owns the DM bell, the "Available" pill, and the background spar
  // matcher, and availability is supposed to follow the user across the
  // WHOLE app (2026-08-23) — but the script was hand-included on only ~52
  // pages, so on the rest (/watch, /tournaments, ...) the pill and the
  // queue silently vanished. Same trap as track.js: topbar presence is
  // not coverage. notifications.js is idempotent (__daNotificationsLoaded
  // + shared firebase script ids), so pages that already include it are
  // unaffected, and it handles its own round-page//spar exclusions.
  (function ensureNotificationsLoaded(){
    if (document.querySelector('script[src*="/js/notifications.js"]')) return;
    var s = document.createElement('script');
    s.src = '/js/notifications.js';
    s.defer = true;
    document.head.appendChild(s);
  })();

  function openSharedAuth(mode){
    mode = mode || 'signin';
    if (typeof window.openAuthModal === 'function'){
      window.openAuthModal(mode);
      return;
    }
    var script = document.querySelector('script[src*="/js/auth-modal.js"]');
    if (script){
      script.addEventListener('load', function(){
        if (typeof window.openAuthModal === 'function') window.openAuthModal(mode);
        else startGoogleSignIn().catch(function(){});
      }, { once: true });
      return;
    }
    startGoogleSignIn().catch(function(){});
  }

  // Normalize a few synonyms so "/" and "/landing" both light up Home.
  function pathMatches(href){
    var h = href.replace(/\/$/,'') || '/';
    if (h === here) return true;
    if (h === '/' && (here === '' || here === '/landing')) return true;
    if (h === '/practice' && /\/practice/.test(here)) return true;
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
  // 2026-05-26: Spar added per the founder "have the button for this somewhere
  // early on the nav." /spar is the live-human matchmaker + DM waitlist
  // marketplace ("Finding you a debater" page). Positioned right after
  // Voice so the two real-time-entry actions sit adjacent at the front
  // of the bar — Voice = match against AI, Spar = match against a human.
  var LINKS = [
    // 2026-08-18: the signed-in home feed. Social platforms open on
    // "what's happening", and this is that surface: live band, open
    // challenges, fresh results, top of the board.
    { href: '/home',          label: 'Home', compactKeep: true },
    // 2026-07-09: order follows the product path. Start live, learn the
    // rules, prep the case, judge a round, then schedule and credential.
    // 2026-08-22: 'LIVE' -> 'Debate live'. LINKS no longer feeds the
    // desktop rail (that carries Explore only, see the note further
    // down), so this label is what the MOBILE SHEET shows, and there
    // 'LIVE' named a state rather than an action beside /watch,
    // /spectate and /live. The founder's steer that day was to emphasise
    // the debate-a-stranger vertical and direct people into it. The
    // pulse and the compactKeep flag are unchanged.
    { href: '/spar',          label: 'Debate live', pulse: true, compactKeep: true },
    // 2026-07-24: first-class orientation tab. This used to live only
    // inside More, which made the product explanation invisible until a
    // visitor already knew to open the overflow menu. It stays visible
    // beside LIVE in the compact tablet rail, then moves into the mobile
    // sheet with the rest of the primary links on phones.
    // 2026-08-12: `strong` is the new MIDDLE tier in the Explore menu
    // (see ui.css .ui-topbar-more-item.is-strong). The Improve column had
    // no `big` row at all, so it rendered as six identical rows and the
    // eye had nowhere to land. "How it works" is the first question a
    // stranger asks, so it is the one that gets the weight.
    { href: '/how-it-works',  label: 'How it works', compactKeep: true, strong: true },
    // 2026-08-20: Bet returns to the rail, and the label goes back to
    // the word two earlier passes took off it. Every note above about
    // keeping this out of permanent chrome was written to stop the site
    // scanning as a betting product to someone skimming. the founder has since
    // moved the product to exactly that ("betting is here", "bring more
    // betting obviously into the app"), so the objection is retired
    // rather than overruled: it was optics protecting a different
    // positioning, and the positioning changed. 2026-08-22: `money`
    // replaces `hot` on this row per the founder ("make the bet button on
    // nav green actually, so it screams money") — a filled green pill,
    // the one green in the bar, so money reads as money. `hot` (the
    // faint-red treatment) stays available for a future headline tab.
    // 2026-08-22, later the same day: REMOVED per the founder ("for now
    // remove betting from website"), reversing this morning's green pill
    // and the 2026-08-20 restore. The `money` render branch below stays
    // dormant. 2026-08-22, final pass ("remove betting entirely from the
    // site tbh we cant do it"): the pages themselves are gone too —
    // /predict, /floor, /ladder, /bounties and /bet-on-your-words all
    // 301 away in netlify.toml, so restoring this row also means
    // restoring the route. 2026-08-23: RESTORED, points-only, per the
    // founder ("bring back bet on who will win 'tokens for now'").
    // /predict serves again with its cash-round section hidden; the
    // other betting routes stay 301'd. This row and the /predict route
    // move together, per the note above.
    { href: '/predict', label: 'Bet', money: true, compactKeep: true },

    // 2026-08-23: Bounty sits immediately to the right of Bet, per the
    // founder. Red rather than green, and the colour is the distinction,
    // not decoration: Bet is a points market you win by predicting a
    // result, a bounty is money you put up to make a round HAPPEN, and it
    // pays for finishing rather than for winning (lib/bounty.mjs splits
    // the pot evenly, no cut, refunded past the deadline). Green is
    // already spoken for by the market next door, so the bounty tab takes
    // the brand red. `bounty` renders its own filled-pill branch below;
    // it is deliberately not `cta`, which is the rail's single primary
    // action and lives at the far right edge.
    { href: '/bounties', label: 'Bounties', bounty: true, compactKeep: true },

    // 2026-07-01: /scale removed from the topbar per the founder (declutter).
    // 2026-07-09: /scale now redirects into /future, the combined company philosophy page.
    { href: '/learn',         label: 'Learn'        },
    { href: '/app#case',      label: 'Prep', strong: true },
    // 2026-06-27: /judge (paste a round, get a real ballot) surfaced from
    // deep-link-only. /float and /exhibition were removed from the bar per
    // the founder (still reachable at /float and /exhibition directly).
    { href: '/judge',         label: 'Judge', strong: true },
    // 2026-07-02: Certificate + Schedule restored per the founder ("add more
    // back ... not too much") — high-intent product pillars: proof you
    // can earn, and the organized-round board when random live matching
    // is quiet. Held Coaches/Messages/Leaderboard off so the bar does
    // not overflow VOICE AI again at laptop widths. (Two parallel
    // sessions both restored the pair, so the entries were briefly
    // duplicated on the live bar — deduped same day.)
    { href: '/live',          label: 'Schedule'    },
    // 2026-08-10 (later, per the founder): the Watch button came OFF the rail
    // the same day it landed there — the bar was carrying one tab too
    // many. Same demotion shape as Money/Leaderboard on 2026-07-30: no
    // rail flag, so it lives in Explore's Debate group and the mobile
    // sheet. Its promoted home is now the landing's opened section (the
    // Watch CTA beside "Match me with a stranger" in #live-now).
    // 2026-08-10 (again, per the founder): `big` renders the Explore-menu row
    // as a large flagship tile. Sized by venture weight, not traffic:
    // Watch (the audience surface), Predict (the market) and Tournaments
    // (the event engine) are the scale bets; utility rows stay small so
    // the hierarchy means something.
    { href: '/watch',         label: 'Watch', big: true },
    { href: '/credentials',   label: 'Certificate' },
    // 2026-06-15: Coach surfaced into the bar per the founder. /coach is the
    // personal voice drill partner (GPT Realtime) that loads your
    // profile + nightly fingerprint.
    { href: '/coach',         label: 'Coach', wip: true },
    // 2026-07-04: Room judge is the live Zoom / Twitch sidecar. Keep the
    // label short so the bar still fits at laptop widths.
    { href: '/room-judge',    label: 'Room'         },
    // FAQ stays off the bar; the landing carries it in-page.
    // 2026-05-22: /champions removed from the topbar nav per user ask.
    // The page stays live + crawlable; just not surfaced in the bar.
    // 2026-07-02: Leaderboard removed from the top bar per the founder — it's
    // promoted contextually near the landing "who's here" section instead
    // of holding a top-nav slot. Page stays live + crawlable at
    // /leaderboard. (Community was folded into Leaderboard on 2026-06-14;
    // both are now off the bar.)
    // 2026-07-02: Coaches + Messages removed from the bar per the founder
    // (declutter — the bar overflowed at laptop widths and the VOICE AI
    // button was getting cut off). Both pages stay live: /messages is
    // still reachable via the notifications bell, /coaches from
    // community surfaces. They can return when they fit.
    // 2026-06-24: The Floor surfaced into the bar per the founder ("advertise
    // it more ... have it in a tab"). 2026-07-19: label Floor -> Bet.
    // 2026-07-23: route moved /floor -> /predict. Bet pointed at a page
    // that cannot take a bet — floor.html sets PREVIEW = true and hard
    // blocks every call, and its markets settle from a rating model
    // rather than a real ballot. /predict is the working market: points
    // only, server-authoritative, settled from the AI ballot of an
    // actual live round. The Floor stays reachable at /floor as the
    // interface preview it says it is.
    // 2026-07-28: label was 'Bet'. It is a points market settled from an
    // AI ballot, so 'Predict' names the route it already points at and
    // stops the one word on every page of the site from reading as a
    // gambling product to anyone scanning the nav.
    // 2026-08-19: Predict removed from every topbar surface per the founder
    // ("remove the betting / point system from website for now"). The
    // page stays live at /predict for direct links; it just is not
    // surfaced in the nav. PARTIALLY REVERSED later the same day: see the
    // note on the /predict row in MORE_GROUPS below. It is back in the
    // Explore menu only, via MORE_GROUPS, so it can never reach the rail.
    // The rest of the cluster (/floor, /ladder, /get-paid-to-debate)
    // stays off.
    // 2026-07-30 (later same day, per the founder): these three came OFF the
    // rail and into the Explore menu. The `rail: true` flag is gone from
    // all of them. Reason is optics, not clutter: "Money" sitting in the
    // permanent top nav of every page makes the site scan as a betting
    // product to an investor who is skimming, which is the same reason
    // "Bet" was renamed to "Predict" two days earlier. The destinations
    // still answer the three questions a first-time visitor asks after
    // "what is this", so they stay one click away in Explore (Money and
    // Leaderboard under Debate, Judging under Improve) and keep their
    // slots in the mobile hamburger sheet, which renders LINKS in full.
    //   Money      -> /get-paid-to-debate. The prize story, not /pricing:
    //                 the question is "how does money work here", and
    //                 that page answers it honestly (free board today,
    //                 Play Points never convert, prizes when the rules
    //                 are published) and links on to /predict and
    //                 /season-1. Label deliberately is not "Bet" — see
    //                 the 2026-07-28 note above on why that word came off
    //                 the bar in the first place.
    //   Judging    -> /judge-integrity, the explainer (published rubric,
    //                 three-family panel, human appeal), NOT /judge,
    //                 which is the paste-a-round tool and stays in
    //                 Explore. "How does the judging work" and "judge my
    //                 round" are different questions.
    //   Leaderboard-> off the bar since 2026-07-02, and staying off.
    // 2026-08-19: Money (/get-paid-to-debate) removed from the nav in the
    // same betting/points de-surfacing pass as Predict above. Page stays
    // live for direct links.
    { href: '/judge-integrity',    label: 'Judging'     },
    // 2026-08-12: Leaderboard removed from every topbar surface. The
    // ranking system is not strong enough yet to deserve a permanent
    // rail tab, an Explore tile or a mobile-sheet entry. The page stays
    // live for direct and contextual links while the ranking improves.
    // 2026-07-05 (later same day): Free vs Paid removed from the bar per
    // the founder ("advertise this somehow else - remove it from top tab").
    // Promoted contextually instead: the free-tier usage banner CTA
    // (js/usage-banner.js) reads "Free vs Paid" -> /pricing at the
    // moment metering matters, and the landing hero secondary pill rail
    // carries a "Free vs Paid" pill (data-cta="hero-free-vs-paid").
    // /pricing stays live + crawlable; just not a top-nav slot.
    // 2026-08-10: the global "Debate an AI" pill came off the rail per
    // the founder. AI sparring now lives in Explore and on /spar when the queue
    // is quiet, where choosing AI reads as intentional instead of global
    // chrome.
  ];

  // Curated secondary destinations for the desktop Explore menu and the
  // mobile sheet. App pages carry no footer, so these links are the quiet
  // discovery surface for pages that do not need permanent topbar space.
  // ── `wip`: the row is live but still being built ────────────────────
  // 2026-08-23, the founder, marking six rows on a screenshot of this menu.
  // The panel had grown to ~35 destinations that all read as equally
  // finished, so a visitor could not tell the surfaces we stand behind
  // from the ones still coming together. Deleting them is worse: they
  // are reachable, indexed, and some of them are the only entry point
  // to work that is nearly done.
  //
  // So the row keeps its name and its link and gains a quiet "In
  // progress" mark, and the row itself sits back a step. The name stays
  // at full strength on purpose — the point is that a visitor still
  // learns the surface EXISTS and can go look; what changes is that
  // nothing here is being sold as finished.
  //
  // Clearing one is deleting `wip: true` from its row. Nothing else
  // reads this flag.
  var MORE_GROUPS = [
    // 2026-08-19 (the founder: "its too crowded - distribute across to take
    // less space on Y axis"). This was ONE 15-item "Watch & compete"
    // column against 4 / 6 / 9 in the others. A CSS grid is as tall as
    // its tallest child, so that single column set the height of the
    // whole panel and left the flagship card and the three short columns
    // standing beside a column of empty space.
    //
    // Split along the seam the old name was already admitting to:
    // entering a contest is a different intent from watching one or
    // finding people to do it with. Nothing was dropped and no link
    // changed; the rows moved with their own notes. Tallest column is
    // now Train at 9, so the panel loses about a third of its height.
    { head: 'Compete', links: [
      // 2026-07-22: async rounds — record now, they answer later. The
      // no-simultaneity surface, so it belongs next to the live ones.
      { href: '/rounds',      label: 'Async rounds', strong: true, wip: true },
      // 2026-08-11: the challenge board. A challenge is the one object a
      // stranger understands without knowing a format: someone claimed
      // something, take the other side. It is `big` because it is the
      // shortest path from landing on the site to being in a round.
      { href: '/challenges',  label: 'Claims & challenges', big: true },
      { href: '/tournaments', label: 'Tournaments', big: true },
      // 2026-08-22: the two real-money surfaces get a way in. Both take
      // a card today and neither was reachable from the nav, so the
      // only people who could find them were the ones already holding a
      // link. Cash rounds sit under /predict, which is on the rail, so
      // this row is the bounty board: somebody else pays to watch a
      // debate happen and the pot goes to the two people who have it.
      // 2026-08-22, later the same day: REMOVED per the founder ("for now
      // remove betting from website"), which also 301'd the page away.
      // 2026-08-23: BACK, per the founder ("bounty comes back and is
      // advertised well"). The betting sweep caught the wrong page. A
      // bounty pays both debaters for COMPLETING the round, carries no
      // winner term, takes no house cut and refunds if the debate never
      // happens, so there is no outcome to bet on. /predict, /floor,
      // /ladder and /bet-on-your-words stay out: those were bets.
      // 2026-08-23 (later the same day): moved OUT of Explore and onto the
      // rail as 'Bounty', beside Bet, per the founder. A row cannot be in
      // both without rendering twice — Explore draws MORE_GROUPS in full
      // and the mobile sheet draws MORE_GROUPS *plus* every LINKS row —
      // so the Explore entry comes out as the rail entry goes in. Same
      // trade the /predict row made on 2026-08-20.
      // 2026-07-28: the two surfaces behind running a real competition.
      // /partners is where a 2v2 team gets formed (and the only place it
      // can be, since a tournament of teams needs the teams to exist
      // first); /tournament is the draw, the tab and the bracket.
      { href: '/partners',    label: 'Find a 2v2 partner' },
      { href: '/tournament',  label: 'Enter a tournament' },
      // 2026-08-19: a round nobody can stumble into. Same clock, same
      // transcript, same AI judge; the room is just kept off the live
      // board, the homepage band and the spectator feed. Sits here
      // rather than in Train because it pairs two real people.
      { href: '/private',     label: 'Private round' },
      // 2026-08-14 (the founder: "bring leaderboard back"): REVERSES the rule
      // that used to sit here, which kept Leaderboard out of navigation
      // "until the ranking system is strong enough to promote". It sits
      // in the competition cluster because that is the question it
      // answers: you entered a tournament, where did you land.
      //
      // The board is not empty and has not been since the 2026-07-18
      // seed pass, so the original reason (promoting a blank page) does
      // not apply. What IS still true, and is worth knowing before
      // anyone treats this surface as a scoreboard: most of what renders
      // is seeded (`seed:true` in `leaderboard_entries`), real ranked
      // entries are few because rounds were not completing, and
      // `user_ratings` holds a handful of debaters at high rating
      // deviation. Promoting the page is fine; quoting a standing off it
      // is not.
      { href: '/leaderboard', label: 'Leaderboard', big: true },
      // 2026-08-19: /claim and /debate-rating join Leaderboard so the
      // three surfaces that answer "where do I stand" sit together. The
      // board is the question, the rating page is how the number works,
      // and /claim is the only action a competitive debater can take
      // about it. Claim had exactly one nav-adjacent entry point (a body
      // link on /leaderboard), which is thin for a surface that only
      // works ONCE, and only before a debater's first rated round: a
      // debater who plays a round before finding it is locked out for
      // good. `strong` because that ordering constraint makes discovery
      // time-critical in a way no other row here is.
      { href: '/claim',       label: 'Import your record', strong: true },
      { href: '/debate-rating', label: 'How rating works' },
    ]},
    // The other half of the old "Watch & compete". Spectating and
    // finding people are the same visit: someone here is not trying to
    // enter anything, they are looking for a round to watch or a person
    // to talk to. /predict sits here rather than in Compete for the
    // reason its own note below gives: a market settled from a live
    // round's ballot belongs with the round you watch.
    { head: 'Watch & community', links: [
      { href: '/spectate',    label: 'Spectate live rounds' },
      // 2026-08-10: the debate shows people already watch (Surrounded,
      // Middle Ground, full Oxford Union debates) plus the standing
      // opinion panel measuring whether any of it moves anyone. Sits in
      // Watch rather than Site because a visitor arriving on it is
      // looking for rounds to watch, not for company pages.
      { href: '/debate-shows', label: 'Debate shows' },
      // 2026-08-20: Money returns alongside the rail's Bet tab. It was
      // pulled in the same de-surfacing pass and comes back for the same
      // reason: it is the page that answers "how does money work here",
      // which is now the first question the product invites.
      // 2026-08-22: REMOVED again per the founder ("for now remove
      // betting from website") — it returned as part of the betting
      // positioning, so it leaves with it. The page stays live and
      // indexed, swept of betting copy the same day (it carries the
      // Open's prize copy; tournaments are prize events, not betting).
      // Restore = re-add:
      // { href: '/get-paid-to-debate', label: 'Money' },

      // 2026-07-27: standalone lobby prototype. It gathers the public
      // network signals into one venue without replacing the landing.
      // 2026-07-25: /tournaments is now the indexable Tournament OS pilot
      // page. It stays off the main bar because the primary product is
      // still debate practice; Explore is the right discovery surface.
      // 2026-08-19 (later same day, per the founder: the prediction angle "can
      // stay in some way"): PARTIALLY reverses the de-surfacing logged
      // above. /predict returns, and only /predict — /floor settles on
      // Math.random() and calls itself a demo, /ladder has no rankable
      // debaters to trade yet, and /get-paid-to-debate is indexed so it
      // is already findable without a nav slot.
      //
      // Two deliberate constraints on the restore:
      //   - It lives in MORE_GROUPS, not LINKS. The rail only draws rows
      //     flagged hot/cta/rail, and MORE_GROUPS rows are never rail
      //     candidates, so this cannot drift back into permanent chrome
      //     on every page. That was the whole objection in the 2026-07-30
      //     and 2026-08-19 notes above.
      //   - Not `big`. The flagship tiles are the scale bets; a points
      //     market that is still finding its footing does not need to be
      //     the largest thing in the column.
      //
      // Sits in Watch & compete rather than the Debate group the restore
      // note above predicted, because Leaderboard moved here on
      // 2026-08-14 and a market settled from a live round's ballot
      // belongs with the round you watch, not with going to debate one.
      // 2026-08-20: moved OUT of Explore and onto the rail as 'Bet'.
      // A row cannot be in both without rendering twice.

      // 2026-08-10: moved up out of the "Site" group, which is pricing,
      // story and vision — pages about the company. The Atlas is a
      // product surface (a live map of real programs), and it lost its
      // only prominent entry point the same day, when the landing's
      // globe stopped being a link to it. Sits next to Community
      // because both answer "who else is out there".
      { href: '/atlas',       label: 'Debate atlas' },
      { href: '/community',   label: 'Community', strong: true },
      // Sits with Community and the Atlas: all three answer "who else is
      // out there and what do they want". This one is the only surface
      // where a visitor tells us what to run rather than reading what we
      // already picked, so it needs a nav entry to get any traffic.
      { href: '/what-to-debate', label: 'Request a topic' },
      // 2026-07-22: chat moved out of the /community Live tab onto its
      // own surface, so the public room and DMs share one frame.
      { href: '/chat',        label: 'Chat and DMs' },
    ]},
    // 2026-07-24: Train was two links against six in the columns either
    // side, so the menu read half-built. Filled with the practice
    // surfaces and resources that had no nav entry at all:
    //   /practice   the 15-format typed trainer. The landing links it
    //                four times and how-it-works twice, but the bar
    //                points Prep at /app#case (index.html), a different
    //                app, so the timed-round surface was reachable only
    //                by following a body link.
    //   /topics      the motion bank, PF / LD / Policy / BQ / Worlds.
    //                Indexed, live, and previously unreachable from any
    //                nav. (APDA stays out of it by design — impromptu,
    //                no rolling motion.)
    //   /argument-coach  paste an argument, get claim / warrant / impact.
    //                noindex; the menu is its internal discovery surface.
    //   /oral-exam-prep  the viva vertical. Last because it is the
    //                narrowest audience, not because it is unfinished.
    // Deliberately NOT added: /research (a corpus-licensing page aimed
    // at AI labs, not a debater resource) and /exhibition (watching two
    // AI brains argue is Watch, not Train).
    { head: 'Train', links: [
      // 2026-07-30: the 8-week course. First in Train because it is the
      // only entry here that sequences the others: each week hands off to
      // /learn, /coach, and /practice in order. Everything below is a
      // surface you have to already know you need.
      { href: '/masterclass', label: 'Masterclass', strong: true, wip: true },
      { href: '/voice-debate', label: 'Competitive Voice AI', big: true },
      { href: '/practice',    label: 'Timed rounds vs AI', strong: true },
      // 2026-08-10: daily-use flow desk. It accepts one speech or a
      // whole round and keeps true drops distinct from unanswered excerpts.
      { href: '/flow',        label: 'Flow a speech', wip: true },
      { href: '/coaches',      label: 'Coaches', wip: true },
      // 2026-08-19: the coach's own surface, not the directory next to
      // it. A roster joined by code, each member's judged rounds, and
      // private rounds the coach sets for pairs. `strong` because
      // /coaches is where a coach lands by mistake looking for this.
      { href: '/squad',        label: 'Coach a squad', strong: true },
      // 2026-07-27: was "Topics and motions", which the landing's plain-
      // audience jargon layer (motion -> topic, lowercase) rendered as
      // the shipped "Topics and topics". The jargon word sits second so
      // the layer yields "Browse topics" with casing intact.
      { href: '/topics',       label: 'Browse motions' },
      { href: '/argument-coach', label: 'Argument coach' },
      // 2026-08-19: indexed, live, and reachable from no nav surface.
      // Sits in Train rather than Improve because it is prep reading
      // (what a judge rewards before you speak), not the /judge tool.
      { href: '/judge-paradigms', label: 'Judge paradigms' },
      { href: '/oral-exam-prep', label: 'Oral exam prep', wip: true },
    ]},
    { head: 'Site', links: [
      { href: '/pricing', label: 'Free vs Paid' },
      { href: '/schools', label: 'For schools' },
      { href: '/story',   label: 'Story' },
      { href: '/future',  label: 'Vision' },
    ]},
  ];

  // ── Social accounts ────────────────────────────────────────────────
  // 2026-08-12: Instagram surfaced per the founder, then YouTube, Twitch, TikTok
  // and X the same day once those handles were claimed (all five are
  // trydebatable). 2026-08-22, per the founder: INSTAGRAM IS OUT of the nav
  // rail. The handle still exists and the footer and the JSON-LD `sameAs`
  // still carry it; this is a nav demotion, not a retired account, so
  // restoring it is re-adding one entry to this array and nothing else.
  // Only accounts that ACTUALLY EXIST go in here: a nav
  // icon pointing at a 404 is worse than no icon. Adding one is a single
  // entry; the topbar rail, the mobile sheet row, and the hover colour all
  // read this array.
  //
  // `brand` is the platform's own colour, used for the hover wash. An entry
  // may also carry `gradient`, which paints the glyph itself in the
  // platform's real colours at rest: one stop paints solid, two or more
  // sweep diagonally. The earlier note here said a second network was the
  // moment to revisit colour and go back to monochrome. the founder asked for the
  // opposite, and he is right for one reason: at 16px these marks are read
  // by colour before shape, and a monochrome Twitch glyph next to a
  // monochrome TikTok note is a row of grey smudges. Colour is what makes
  // the rail scannable, so it stays.
  //
  // X is the exception that proves the rule rather than a break from it:
  // its mark IS monochrome, so `brand` is `var(--text)` and the glyph
  // inherits the theme's text colour, black on the light bar and white on
  // the dark one. That is the platform's real palette, not a fallback.
  // The rail is four wide at 30px a slot, so ~126px, down from five and
  // 158px. Width was never what capped this: measured at 901px, one pixel
  // above the breakpoint that hides the rail entirely, the five-wide right
  // group still ended 230px clear of the wordmark with neither the bar nor
  // the document scrolling sideways. Attention is what caps it, which is
  // why the count went DOWN rather than a sixth being added. A fifth
  // network is a rethink of the rail, not another entry.
  var SOCIALS = [
    {
      key: 'youtube',
      label: 'YouTube',
      handle: '@trydebatable',
      href: 'https://www.youtube.com/@trydebatable',
      brand: '#FF0000',
      // One stop, so the glyph paints solid red rather than sweeping.
      gradient: ['#FF0000'],
      // Rounded plate + play triangle.
      icon: '<rect x="2.6" y="5.3" width="18.8" height="13.4" rx="4.2"/>'
          + '<path d="M10.2 9.3l5.5 2.7-5.5 2.7z"/>',
    },
    {
      key: 'twitch',
      label: 'Twitch',
      handle: 'trydebatable',
      href: 'https://www.twitch.tv/trydebatable',
      brand: '#9146FF',
      gradient: ['#9146FF'],
      // The glitch: a bevelled panel with the tab dropping off the
      // bottom-left, plus the two eye bars.
      icon: '<path d="M7.2 2.7L3.6 6.3v12.6h4.3v3.4l3.6-3.4h2.9l5.9-5.9V2.7z"/>'
          + '<path d="M11.6 8.2v4.3M15.5 8.2v4.3"/>',
    },
    {
      key: 'tiktok',
      label: 'TikTok',
      handle: '@trydebatable',
      href: 'https://www.tiktok.com/@trydebatable',
      brand: '#FE2C55',
      // TikTok's mark is black with cyan and magenta offset prints, so a
      // monochrome version is the one thing it cannot be. The cyan-to-pink
      // sweep is what those offsets read as at 16px. Pink is repeated so it
      // takes the top half of the sweep rather than a third of it: cyan
      // carries the recognition but is the palest colour in the rail
      // against a white bar, and a two-stop version rendered visibly
      // fainter than its three neighbours at icon size.
      gradient: ['#25F4EE', '#FE2C55', '#FE2C55'],
      // 2026-08-12, per the founder ("hard to see"): the note head is FILLED and
      // the strokes are heavier than the rail default. This mark carries
      // far less ink than its neighbours by construction. YouTube is a
      // plate with a triangle, Twitch a bevelled panel, X a filled slab,
      // and TikTok is one open ring and
      // one thin curve. At 16px an open ring next to three enclosed shapes
      // reads as the faint one no matter what colour it is, and the real
      // mark's head is solid anyway, so outlining it was both weaker and
      // less accurate. Filling the head roughly doubles the mark's ink.
      strokeWidth: 2.5,
      icon: '<circle cx="10.3" cy="14.4" r="4" fill="%PAINT%" stroke="none"/>'
          + '<path d="M14.3 14.4V3.6a5.4 5.4 0 0 0 5.4 5.4"/>',
    },
    {
      key: 'x',
      label: 'X',
      handle: '@trydebatable',
      href: 'https://x.com/trydebatable',
      // Not a hex value: X's mark is black on light and white on dark, so
      // the theme's own text token IS the brand colour. Custom properties
      // resolve at the element, so this picks up whichever theme block is
      // live without a per-theme CSS rule.
      brand: 'var(--text, #fff)',
      // The one FILLED glyph in the rail, and it has to be. Stroked, X is
      // two crossing lines with round caps, which reads as a close button
      // sitting in a nav bar. The real mark is two tapered slabs, so the
      // path is filled and the svg's stroke is turned off for it.
      //
      // Filled from --brand rather than currentColor so it sits at full
      // strength like the four coloured marks, instead of the 58% wash the
      // bar applies to inherited glyph colour. It goes in `style` because a
      // presentation attribute is a weaker source for a var() reference
      // than an inline declaration.
      icon: '<path style="fill:var(--brand,currentColor)" stroke="none" d="M18.24 2.6h3.3l-7.22 8.26 8.5 11.24h-6.66l-5.21-6.82-5.97 6.82H1.68l7.73-8.84L1.25 2.6h6.83l4.71 6.23zm-1.16 17.52h1.83L7.08 4.48H5.12z"/>',
    },
  ];

  // Gradient ids have to be unique per document: socialIcon runs twice per
  // network (desktop rail + mobile sheet) and two <linearGradient> nodes
  // sharing an id makes every later reference resolve to the first one.
  var socialGradSeq = 0;
  function socialIcon(s){
    var stroke = 'currentColor';
    var defs = '';
    if (s.gradient && s.gradient.length === 1){
      // A one-stop gradient is legal SVG but paints inconsistently across
      // engines, and a flat brand colour does not need one anyway.
      stroke = s.gradient[0];
    } else if (s.gradient && s.gradient.length){
      var gid = 'dbsoc-' + s.key + '-' + (++socialGradSeq);
      var stops = s.gradient.map(function(c, i){
        var pct = s.gradient.length === 1 ? 0 : Math.round((i / (s.gradient.length - 1)) * 100);
        return '<stop offset="' + pct + '%" stop-color="' + c + '"/>';
      }).join('');
      // x1/y1 at the bottom-left corner mirrors the real mark's sweep.
      defs = '<defs><linearGradient id="' + gid + '" x1="0" y1="1" x2="1" y2="0">' + stops + '</linearGradient></defs>';
      stroke = 'url(#' + gid + ')';
    }
    // %PAINT% lets one entry fill a shape with whatever this icon is
    // stroked in (flat colour or the gradient just minted), which a
    // per-entry literal cannot do because the gradient id is generated
    // here, per call. TikTok is the only user: see its note head.
    var body = s.icon.split('%PAINT%').join(stroke);
    return '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="' + stroke + '" '
      + 'stroke-width="' + (s.strokeWidth || 1.9) + '" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'
      + defs + body + '</svg>';
  }

  // Desktop Explore panel presentation layer: one small stroke icon and
  // one plain sentence per destination, keyed by href. Labels keep living
  // in LINKS / MORE_GROUPS; the mobile sheet stays label-only.
  var MENU_META = {
    '/home':           { desc: 'What is happening right now', icon: '<path d="M4.4 10.6L12 4.4l7.6 6.2M6.2 9.2v9.2a1.4 1.4 0 0 0 1.4 1.4h8.8a1.4 1.4 0 0 0 1.4-1.4V9.2M9.8 19.8v-5.4h4.4v5.4"/>' },
    '/spar':           { desc: 'Random matchmaking, right now', icon: '<circle cx="12" cy="12" r="2.1"/><path d="M8.2 8.2a5.4 5.4 0 0 0 0 7.6M15.8 8.2a5.4 5.4 0 0 1 0 7.6M5.4 5.4a9.3 9.3 0 0 0 0 13.2M18.6 5.4a9.3 9.3 0 0 1 0 13.2"/>' },
    '/how-it-works':   { desc: 'Your first round, explained', icon: '<circle cx="12" cy="12" r="8.6"/><path d="M15.4 8.6l-2.1 4.7-4.7 2.1 2.1-4.7z"/>' },
    '/learn':          { desc: 'Lessons, drills, and formats', icon: '<path d="M12 6.6C10.4 5.1 8.2 4.6 5.6 4.6c-.9 0-1.6.6-1.6 1.4v10.3c0 .9.7 1.5 1.6 1.5 2.6 0 4.8.5 6.4 2 1.6-1.5 3.8-2 6.4-2 .9 0 1.6-.6 1.6-1.5V6c0-.8-.7-1.4-1.6-1.4-2.6 0-4.8.5-6.4 2zM12 6.6v13.2"/>' },
    '/app#case':       { desc: 'Case builder and prep tools', icon: '<path d="M12 5.2H6.6A2.4 2.4 0 0 0 4.2 7.6v9.8a2.4 2.4 0 0 0 2.4 2.4h9.8a2.4 2.4 0 0 0 2.4-2.4V12"/><path d="M17.7 4.3a2 2 0 0 1 2.8 2.8l-7.3 7.3-3.8 1 1-3.8z"/>' },
    '/judge':          { desc: 'Paste a round, get the verdict', icon: '<rect x="6" y="4.6" width="12" height="15.8" rx="2.2"/><path d="M9.5 4.6a2.5 2.5 0 0 1 5 0M9.3 13.4l2 2 3.6-3.9"/>' },
    '/live':           { desc: 'Schedule a live round on the board', icon: '<rect x="4" y="6" width="16" height="14" rx="2.2"/><path d="M4 10.6h16M8.5 3.8v3.6M15.5 3.8v3.6"/>' },
    '/credentials':    { desc: 'Proof of your record', icon: '<circle cx="12" cy="9.4" r="4.8"/><path d="M9.1 13.4L7.6 20l4.4-2.3L16.4 20l-1.5-6.6"/>' },
    '/coach':          { desc: 'Personal drills, tuned to you', icon: '<path d="M4.6 14v-2.4a7.4 7.4 0 0 1 14.8 0V14"/><rect x="3.6" y="13" width="4" height="5.8" rx="1.8"/><rect x="16.4" y="13" width="4" height="5.8" rx="1.8"/>' },
    '/room-judge':     { desc: 'AI judge for your video call', icon: '<rect x="3.6" y="5" width="16.8" height="11.8" rx="2"/><path d="M9 20.4h6M12 16.8v3.6"/>' },
    '/predict':        { desc: 'Call winners, earn points', icon: '<path d="M4 17l5.5-5.5 3.5 3.5L19.5 8.4"/><path d="M14.8 8.4h4.7v4.7"/>' },
    // 2026-07-30: these two moved off the rail into the menu, so they now
    // need the icon + one-line description every menu row carries. The
    // descriptions do the disambiguating the one-word labels used to do
    // on the bar: "Judge" is the paste-a-round tool, "Judging" is how the
    // verdict gets made, and they sit in the same column.
    '/get-paid-to-debate': { desc: 'Prizes, points, and payouts', icon: '<circle cx="12" cy="12" r="8.4"/><path d="M14.4 9.3a2.7 2.7 0 0 0-2.4-1.2c-1.5 0-2.4.8-2.4 1.9 0 2.6 5 1.3 5 3.9 0 1.1-1 1.9-2.6 1.9a2.8 2.8 0 0 1-2.5-1.3M12 6.4v1.7M12 15.8v1.8"/>' },
    '/judge-integrity':    { desc: 'The rubric, appeals, open to critiques', icon: '<path d="M12 4.6v14.8M7.4 19.4h9.2M5 8.2h14M5 8.2l-2.2 5a2.6 2.6 0 0 0 4.4 0zM19 8.2l-2.2 5a2.6 2.6 0 0 0 4.4 0zM12 4.6a1.4 1.4 0 1 0 0 2.8 1.4 1.4 0 0 0 0-2.8z"/>' },
    '/rounds':         { desc: 'Record now, they answer later', icon: '<path d="M16.5 4L20 7.5 16.5 11M20 7.5H7.8M7.5 20L4 16.5 7.5 13M4 16.5h12.2"/>' },
    '/spectate':       { desc: 'Watch rounds as they happen', icon: '<path d="M3.6 12S6.9 5.9 12 5.9 20.4 12 20.4 12 17.1 18.1 12 18.1 3.6 12 3.6 12z"/><circle cx="12" cy="12" r="2.7"/>' },
    '/watch':          { desc: 'Streams, replays, and clips', icon: '<rect x="4" y="5.4" width="16" height="11.6" rx="2.2"/><path d="M10.4 8.8l4.4 2.8-4.4 2.8zM8.2 20.4h7.6"/>' },
    // Speech-bubble pair: the page is about watching people argue, and
    // about what the room thinks afterwards.
    '/debate-shows':   { desc: 'Surrounded, and who changed their mind', icon: '<path d="M4.2 6.4a1.8 1.8 0 0 1 1.8-1.8h7.6a1.8 1.8 0 0 1 1.8 1.8v4.4a1.8 1.8 0 0 1-1.8 1.8H8.6L5 15.6v-3H6a1.8 1.8 0 0 1-1.8-1.8z"/><path d="M9.4 15.4h1.2l3.6 3v-3h1.8a1.8 1.8 0 0 0 1.8-1.8V9.2"/>' },
    '/tournaments':    { desc: 'Brackets, tab, and results', icon: '<path d="M8 4.6h8v4.7a4 4 0 0 1-8 0zM8 6.3H4.7c0 2.7 1.5 4.3 3.5 4.6M16 6.3h3.3c0 2.7-1.5 4.3-3.5 4.6M12 13.2v3.1M8.4 19.7h7.2M10 16.3h4l.9 3.4H9.1z"/>' },
    '/partners':       { desc: 'Team up for two on two', icon: '<circle cx="8.4" cy="9.2" r="2.6"/><circle cx="15.6" cy="9.2" r="2.6"/><path d="M4.2 18.6a4.2 4.2 0 0 1 8.4 0M11.4 18.6a4.2 4.2 0 0 1 8.4 0"/>' },
    '/tournament':     { desc: 'Register, draw, tab, bracket', icon: '<path d="M4.7 5.6h14.6M6.8 5.6v4.1a5.2 5.2 0 0 0 10.4 0V5.6M12 14.9v3.3M8.6 20.2h6.8"/>' },
    // 2026-08-19: /challenges shipped 2026-08-11 as a `big` flagship tile
    // but never got a MENU_META row, so the largest tile in the column
    // was the only one rendering with no sentence under it.
    '/challenges':     { desc: 'Post a claim or a live round, someone takes it', icon: '<path d="M12 4.4l6.6 3v5c0 3.6-2.7 6.5-6.6 7.6-3.9-1.1-6.6-4-6.6-7.6v-5z"/><path d="M9.6 11.8l1.7 1.7 3.3-3.5"/>' },
    '/claim':          { desc: 'Seed your rating from Tabroom', icon: '<path d="M12 4.2l2.3 4.7 5.2.8-3.8 3.6.9 5.1-4.6-2.4-4.6 2.4.9-5.1L4.5 9.7l5.2-.8z"/>' },
    '/debate-rating':  { desc: 'What the number actually means', icon: '<path d="M4.6 16.4l4.3-4.8 3.3 2.7 4.2-5.6"/><path d="M16.4 8.7h3v3"/><circle cx="12" cy="12" r="8.6"/>' },
    '/judge-paradigms': { desc: 'What judges actually reward', icon: '<path d="M12 5.2v13.6M7.4 5.2h9.2M5 9.8h4.2M14.8 9.8H19M7.1 9.8L5 14.2h4.2zM16.9 9.8l-2.1 4.4H19z"/>' },
    '/leaderboard':    { desc: 'Site-wide rankings', icon: '<path d="M3 20.2h18"/><path d="M9.3 20.2v-8.6h5.4v8.6"/><path d="M3.9 20.2v-5.4h5.4"/><path d="M14.7 20.2v-6.8h5.4v6.8"/><path d="M12 3.2l1.16 2.35 2.6.38-1.88 1.83.44 2.58L12 9.11l-2.32 1.21.44-2.58-1.88-1.83 2.6-.38z"/>' },
    '/atlas':          { desc: 'Map of real debate programs', icon: '<circle cx="12" cy="12" r="8.6"/><path d="M3.4 12h17.2M12 3.4c2.2 2.4 3.4 5.4 3.4 8.6s-1.2 6.2-3.4 8.6c-2.2-2.4-3.4-5.4-3.4-8.6s1.2-6.2 3.4-8.6z"/>' },
    '/community':      { desc: 'Find people and clubs', icon: '<circle cx="9" cy="8.4" r="3.2"/><path d="M3.6 19.4c.6-3.1 2.6-4.8 5.4-4.8s4.8 1.7 5.4 4.8M15.4 5.6a3.2 3.2 0 0 1 0 5.6M17.2 14.8c2 .6 3 2 3.4 4"/>' },
    '/what-to-debate': { desc: 'Post a motion, upvote the rest', icon: '<path d="M4.6 6.2a1.8 1.8 0 0 1 1.8-1.8h11.2a1.8 1.8 0 0 1 1.8 1.8v7.2a1.8 1.8 0 0 1-1.8 1.8H9.4l-4.8 3.8v-3.8a1.8 1.8 0 0 1-1.8-1.8z"/><path d="M12 7.4v3.4M12 12.6v.1"/>' },
    '/chat':           { desc: 'The public room and your DMs', icon: '<path d="M20.2 11.4a7.8 7.8 0 0 1-8.2 7.5 8.7 8.7 0 0 1-3.5-.7L4 19.6l1.4-4a7.3 7.3 0 0 1-1.6-4.2A7.8 7.8 0 0 1 12 3.9a7.8 7.8 0 0 1 8.2 7.5z"/>' },
    '/masterclass':    { desc: 'Eight weeks, one round a week', icon: '<path d="M3.4 8.4L12 4.6l8.6 3.8L12 12.2z"/><path d="M6.8 10v4.6c0 1.6 2.3 2.8 5.2 2.8s5.2-1.2 5.2-2.8V10M20.6 8.4v5"/>' },
    '/practice':       { desc: 'Full rounds against the clock', icon: '<circle cx="12" cy="13.4" r="6.9"/><path d="M12 9.6v3.9l2.7 1.6M9.6 3.6h4.8M12 3.6v3"/>' },
    '/flow':           { desc: 'Speech to flow, clash, and answers', icon: '<path d="M5 5.2h14M5 10.1h14M5 15h9M5 19.9h6"/><circle cx="18" cy="15.3" r="2.5"/>' },
    '/voice-debate':   { desc: 'Realtime speeches, POIs, and a ballot', icon: '<rect x="9" y="3.6" width="6" height="10.8" rx="3"/><path d="M5.6 11.5a6.4 6.4 0 0 0 12.8 0M12 17.9v2.5M9.2 20.4h5.6"/>' },
    '/coaches':        { desc: 'Find a human coach', icon: '<circle cx="10" cy="8" r="3.4"/><path d="M4.1 19.4c.7-3.3 2.9-5 5.9-5 1.4 0 2.7.4 3.7 1.1M15.4 17.4l1.9 1.9 3.3-3.6"/>' },
    '/topics':         { desc: 'PF, LD, Policy, BQ, Worlds', icon: '<path d="M4 6.6h1.6M4 12h1.6M4 17.4h1.6M8.6 6.6H20M8.6 12H20M8.6 17.4H20"/>' },
    '/argument-coach': { desc: 'Claim, warrant, impact checks', icon: '<circle cx="12" cy="12" r="8.4"/><circle cx="12" cy="12" r="4.6"/><circle cx="12" cy="12" r="1.1"/>' },
    '/oral-exam-prep': { desc: 'Defend your work out loud', icon: '<path d="M2.6 9.4L12 4.6l9.4 4.8-9.4 4.8z"/><path d="M6.6 11.9v4.2c3.6 2.7 7.2 2.7 10.8 0v-4.2M21.4 9.4v5"/>' },
  };
  function menuIcon(href){
    var m = MENU_META[href];
    var inner = m && m.icon ? m.icon : '<circle cx="12" cy="12" r="3.5"/>';
    return '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + inner + '</svg>';
  }

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
    // Room Judge is a specialist streaming sidecar, not a first-step
    // landing action. Keep it discoverable from the rest of the site,
    // but leave it out of both landing-page nav surfaces.
    var onLanding = here === '/' || /^\/landing(?:\.html)?$/.test(here);
    var pageLinks = onLanding
      ? LINKS.filter(function(L){ return L.href !== '/room-judge'; })
      : LINKS;

    // ── Wordmark: "Debatable" in accent red ────────────────────────────
    // 2026-07-22, per the founder: the red-vs-black A/B (2026-07-19, weighted
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
            + ' Debatable, home at itsdebatable.com.'
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
    // /voice, /spar, /prep, /learn, /live, /community, /cert and /faq
    // are all reachable on mobile. Hidden on desktop via
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

    // Desktop navigation disclosure. The old rail rendered ten text links
    // plus "More" at once, which made the header feel like a sitemap. Keep
    // one quiet Explore trigger beside the two highlighted actions, then
    // reveal the full grouped menu only when the visitor asks for it.
    //
    // Hover is the fast desktop path. Click, focus, Escape and outside-click
    // handling keep the same interaction usable by keyboard, touch and
    // assistive technology.
    function buildExplore(){
      var wrap = el('span', { class: 'ui-topbar-more' });
      var btn = el('button', {
        type: 'button',
        class: 'ui-topbar-link ui-topbar-more-btn',
        'aria-haspopup': 'true',
        'aria-expanded': 'false',
      });
      btn.innerHTML = 'Explore<svg viewBox="0 0 10 6" width="9" height="6" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M1 1l4 4 4-4"/></svg>';
      // hidden attr guards the closed state even when a stale-cached
      // ui.css predates the panel rules (SW skew showed it unstyled).
      var panel = el('div', { class: 'ui-topbar-more-panel', role: 'menu', 'aria-label': 'Explore Debatable', hidden: 'hidden' });
      var intro = el('div', { class: 'ui-topbar-more-intro' }, [
        el('div', { class: 'ui-topbar-more-intro-title' }, 'Explore Debatable'),
        el('div', { class: 'ui-topbar-more-intro-sub' }, 'Debate, train, watch, and build a record.'),
      ]);
      panel.appendChild(intro);

      // Left spotlight: the one action a first-time opener should take.
      // A real opponent stays the headline; Voice AI is the quiet alternate.
      var spotWrap = el('div', { class: 'ui-topbar-more-spotwrap' });
      var spot = el('a', { href: '/spar', role: 'menuitem', class: 'ui-topbar-more-spot' });
      spot.innerHTML =
        '<span class="ui-topbar-more-spot-eyebrow"><span class="ui-topbar-more-live-dot" aria-hidden="true"></span>Live</span>' +
        '<span class="ui-topbar-more-spot-title">Debate a stranger</span>' +
        '<span class="ui-topbar-more-spot-sub">Get matched, argue it out, and get a verdict.</span>' +
        '<span class="ui-topbar-more-spot-proof">' +
          '<img src="/img/round/faces/face02.jpg" alt="" loading="lazy" decoding="async">' +
          '<img src="/img/round/faces/face07.jpg" alt="" loading="lazy" decoding="async">' +
          '<img src="/img/round/faces/face10.jpg" alt="" loading="lazy" decoding="async">' +
          '<img src="/img/round/faces/face01.jpg" alt="" loading="lazy" decoding="async">' +
          '<span>Real people first. AI if the queue is quiet.</span>' +
        '</span>' +
        '<span class="ui-topbar-more-spot-cta">Go LIVE' +
          '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>' +
        '</span>';
      spot.addEventListener('click', function(){ navTrack('nav_more_click', { to: '/spar', via: 'spotlight' }); });
      spotWrap.appendChild(spot);
      var spotAlt = el('a', { href: '/voice-debate', role: 'menuitem', class: 'ui-topbar-more-spot-alt' }, [
        el('span', { class: 'ui-topbar-more-ico', 'aria-hidden': 'true', html: menuIcon('/voice-debate') }),
        el('span', null, 'Debate Realtime Voice AI'),
      ]);
      spotAlt.addEventListener('click', function(){ navTrack('nav_more_click', { to: '/voice-debate', via: 'spotlight' }); });
      spotWrap.appendChild(spotAlt);
      panel.appendChild(spotWrap);

      var primaryGroups = [
        // /spar lives in the spotlight card, so it is not repeated here.
        { head: 'Debate', links: pageLinks.filter(function(L){
          return ['/app#case', '/live', '/watch', '/room-judge'].indexOf(L.href) !== -1;
        })},
        { head: 'Improve', links: pageLinks.filter(function(L){
          return ['/how-it-works', '/learn', '/judge', '/credentials', '/coach',
                  '/judge-integrity'].indexOf(L.href) !== -1;
        })},
      ];
      var columnGroups = primaryGroups.concat(MORE_GROUPS.filter(function(G){ return G.head !== 'Site'; }));
      // 2026-08-12: each column carries its own accent through a `--col`
      // custom property set by `ui-col-N` in ui.css, and every coloured
      // part of a row (icon tile, active label, big-tile border, the
      // numeral in the heading) reads `var(--col)` rather than
      // `var(--accent)`. Before this the whole panel was one red, so four
      // groups of destinations read as one long list.
      //
      // Colours are navigational category codes, not decoration, which is
      // the same licence /profile already takes for per-format colours.
      // Amber and orange are deliberately NOT in the set: the 2026-05-19
      // sweep reserved them for state (warn, achievement, tier), and a
      // decorative orange here would quietly reopen that.
      columnGroups.forEach(function(G, groupIndex){
        var col = el('div', { class: 'ui-topbar-more-col ui-col-' + (groupIndex + 1), style: '--ci:' + groupIndex });
        var head = el('div', { class: 'ui-topbar-more-head' }, [
          el('span', { class: 'ui-topbar-more-head-num', 'aria-hidden': 'true' }, '0' + (groupIndex + 1)),
          el('span', null, G.head),
        ]);
        col.appendChild(head);
        G.links.forEach(function(L){
          var meta = MENU_META[L.href] || {};
          var a = el('a', {
            href: L.href,
            role: 'menuitem',
            class: 'ui-topbar-more-item' + (pathMatches(L.href) ? ' is-active' : '')
                     + (L.strong ? ' is-strong' : '')
                     + (L.big ? ' is-big' : '')
                     + (L.wip ? ' is-wip' : ''),
          }, [
            el('span', { class: 'ui-topbar-more-ico', 'aria-hidden': 'true', html: menuIcon(L.href) }),
            el('span', { class: 'ui-topbar-more-item-text' }, [
              el('span', { class: 'ui-topbar-more-item-label' }, [
                el('span', null, L.label),
                L.pulse ? el('span', { class: 'ui-topbar-more-live-dot', 'aria-hidden': 'true' }) : null,
              ]),
              // The mark rides the DESCRIPTION line, never the name line.
              // Beside the name it wins an argument it should not be in:
              // `strong` and `big` labels are nowrap-with-ellipsis, so
              // the first build shipped "Maste... IN PROGRESS" and
              // "Oral exa... IN PROGRESS" — the caveat rendered and the
              // destination did not. The whole point is that a visitor
              // still learns the surface exists.
              (meta.desc || L.wip) ? el('span', { class: 'ui-topbar-more-item-desc' }, [
                L.wip ? el('span', { class: 'ui-topbar-more-wip' }, 'In progress') : null,
                meta.desc ? el('span', null, meta.desc) : null,
              ]) : null,
            ]),
          ]);
          a.addEventListener('click', function(){ navTrack('nav_more_click', { to: L.href }); });
          col.appendChild(a);
        });
        panel.appendChild(col);
      });

      // Site pages read as chrome, not product. They close the panel as a
      // one-line footer strip instead of holding a fifth column.
      var siteGroup = null;
      MORE_GROUPS.forEach(function(G){ if (G.head === 'Site') siteGroup = G; });
      if (siteGroup){
        var strip = el('div', { class: 'ui-topbar-more-site' });
        strip.appendChild(el('span', { class: 'ui-topbar-more-site-head' }, siteGroup.head));
        siteGroup.links.forEach(function(L){
          var a = el('a', {
            href: L.href,
            role: 'menuitem',
            class: pathMatches(L.href) ? 'is-active' : null,
          }, L.label);
          a.addEventListener('click', function(){ navTrack('nav_more_click', { to: L.href }); });
          strip.appendChild(a);
        });
        panel.appendChild(strip);
      }
      var closeTimer = null;
      var pinnedOpen = false;
      function openExplore(source){
        if (closeTimer){ clearTimeout(closeTimer); closeTimer = null; }
        if (panel.classList.contains('is-open')) return;
        panel.hidden = false;
        panel.classList.add('is-open');
        btn.setAttribute('aria-expanded', 'true');
        navTrack('nav_more_open', { surface: source || 'desktop' });
      }
      function closeExplore(){
        if (closeTimer){ clearTimeout(closeTimer); closeTimer = null; }
        pinnedOpen = false;
        btn.setAttribute('aria-expanded', 'false');
        panel.classList.remove('is-open');
        panel.hidden = true;
      }
      function scheduleClose(){
        if (closeTimer) clearTimeout(closeTimer);
        closeTimer = setTimeout(function(){
          if (!wrap.matches(':hover') && !wrap.contains(document.activeElement)) closeExplore();
        }, 140);
      }
      btn.addEventListener('click', function(e){
        e.stopPropagation();
        // A pointer reaches the button before its click, so hover may have
        // already opened the panel. The first click pins that open state
        // instead of immediately toggling it shut. A second click closes.
        if (panel.classList.contains('is-open') && pinnedOpen) closeExplore();
        else {
          pinnedOpen = true;
          openExplore('click');
        }
      });
      btn.addEventListener('keydown', function(e){
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          if (panel.classList.contains('is-open') && pinnedOpen) closeExplore();
          else {
            pinnedOpen = true;
            openExplore('keyboard');
          }
        } else if (e.key === 'ArrowDown') {
          e.preventDefault();
          pinnedOpen = true;
          openExplore('keyboard');
          var firstLink = panel.querySelector('a');
          if (firstLink) firstLink.focus();
        }
      });
      wrap.addEventListener('mouseenter', function(){ openExplore('hover'); });
      wrap.addEventListener('mouseleave', function(){
        if (!pinnedOpen) scheduleClose();
      });
      wrap.addEventListener('focusout', scheduleClose);
      document.addEventListener('click', function(e){
        if (panel.classList.contains('is-open') && !wrap.contains(e.target)) closeExplore();
      });
      document.addEventListener('keydown', function(e){
        if (e.key === 'Escape' && panel.classList.contains('is-open')) {
          closeExplore();
          btn.focus();
        }
      });
      wrap.appendChild(btn);
      wrap.appendChild(panel);
      return wrap;
    }

    // The rail carries Explore only. Every destination remains in Explore
    // and in the mobile sheet below; AI sparring is promoted inside those
    // menus and contextually on /spar, not as a permanent pill.
    // "How this works" sits directly beside the Explore trigger, as a
    // button rather than one more text link in a rail of text links.
    // Rationale (the founder, 2026-08-11): a first-time visitor's actual first
    // question is "what is this and what do I do", and the answer was a
    // low-contrast nav word competing with nine siblings. A stranger
    // should be able to find the explanation without reading the menu.
    var howBtn = el('a', {
      href: '/how-it-works',
      class: 'ui-topbar-howbtn' + (pathMatches('/how-it-works') ? ' is-active' : ''),
      'aria-label': 'How this works',
    });
    howBtn.innerHTML = '<svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'
      + '<circle cx="8" cy="8" r="6.4"/><path d="M6.2 6.1a1.9 1.9 0 1 1 2.4 2.2c-.5.2-.8.6-.8 1.1v.3"/><path d="M8 12.1h.01"/></svg>'
      + '<span>How this works</span>';
    howBtn.addEventListener('click', function(){ navTrack('nav_howitworks_click', { from: location.pathname }); });
    right.appendChild(howBtn);

    right.appendChild(buildExplore());
    pageLinks.filter(function(L){ return L.hot || L.money || L.bounty || L.cta || L.rail; }).forEach(function(L){
      var active = !L.external && pathMatches(L.href);
      // No `title` on text links — the label is already visible, and the
      // native tooltip just renders a dark box that floats over page
      // content on hover (e.g. the "Live" chip overlapping the hero).
      // Icon-only controls (SFX/theme/bell/CTA) keep their titles.
      var attrs = {
        href: L.href,
        class: 'ui-topbar-link'
          + (active ? ' is-active' : '')
          + (L.mobileKeep ? ' ui-topbar-link--mobile-keep' : '')
          + (L.compactKeep ? ' ui-topbar-link--compact-keep' : ''),
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
      // `money` = the Bet tab (2026-08-22, founder: green "so it screams
      // money"). Filled green pill, the only green in the bar, so money
      // reads as money at a glance. The dollar-dot pulses green; red
      // stays the brand-action color everywhere else.
      if (L.money){
        a.style.display = 'inline-flex';
        a.style.alignItems = 'center';
        a.style.gap = '6px';
        a.style.fontWeight = '800';
        a.style.color = '#fff';
        a.style.background = '#16a34a';
        a.style.border = '1px solid #15803d';
        a.style.borderRadius = '999px';
        a.style.padding = '5px 13px';
        a.style.boxShadow = '0 6px 18px -8px rgba(22,163,74,.8)';
        if (!document.getElementById('daMoneyPulseStyle')){
          var ms = document.createElement('style');
          ms.id = 'daMoneyPulseStyle';
          ms.textContent = '@keyframes daMoneyPulse{0%,100%{box-shadow:0 0 0 0 rgba(74,222,128,.6)}50%{box-shadow:0 0 0 5px rgba(74,222,128,0)}}.ui-topbar-money-dot{width:6px;height:6px;border-radius:50%;background:#4ade80;display:inline-block;animation:daMoneyPulse 1.8s ease-out infinite}@media (prefers-reduced-motion:reduce){.ui-topbar-money-dot{animation:none}}';
          document.head.appendChild(ms);
        }
        a.appendChild(el('span', { class: 'ui-topbar-money-dot', 'aria-hidden': 'true' }));
      }
      // `bounty` = the Bounty tab (2026-08-23). Filled red pill, sized
      // and weighted like `money` so the two read as a pair, with the
      // colour carrying the difference between predicting a result and
      // funding a round. No pulsing dot: one animated dot in the bar is a
      // signal, two is a fairground, and the green one next door is
      // already the thing meant to catch the eye first.
      if (L.bounty){
        a.style.display = 'inline-flex';
        a.style.alignItems = 'center';
        a.style.gap = '6px';
        a.style.fontWeight = '800';
        a.style.color = '#fff';
        a.style.background = '#dc2626';
        a.style.border = '1px solid #b91c1c';
        a.style.borderRadius = '999px';
        a.style.padding = '5px 13px';
        a.style.boxShadow = '0 6px 18px -8px rgba(220,38,38,.8)';
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
      if (L.watch){
        a.style.display = 'inline-flex';
        a.style.alignItems = 'center';
        a.style.gap = '7px';
        a.style.fontWeight = '750';
        var play = el('span', { 'aria-hidden': 'true' });
        play.style.cssText = 'width:19px;height:19px;border-radius:50%;display:inline-grid;place-items:center;background:#dc2626;color:#fff;box-shadow:0 5px 13px -7px rgba(220,38,38,.9)';
        play.innerHTML = '<svg viewBox="0 0 16 16" width="9" height="9" fill="currentColor" aria-hidden="true"><path d="M5 3.4v9.2L12 8z"/></svg>';
        a.appendChild(play);
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
    // per the founder. JS button construction skipped so the DOM node never
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
    // 2026-05-27 plane session: theme toggle REVIVED per the founder's
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

    // Social rail. Icon-only so it costs almost no width on a bar that has
    // overflowed before (see the 2026-07-02 declutter notes above), and it
    // sits after the page links rather than among them because following
    // the account is not a step in the product path.
    //
    // Hidden below 900px by ui.css: the mobile sheet carries the same
    // links as a labelled row, which is the readable form on a phone.
    if (SOCIALS.length){
      var socialWrap = el('span', { class: 'ui-topbar-socials' });
      SOCIALS.forEach(function(s){
        var a = el('a', {
          href: s.href,
          class: 'ui-topbar-social ui-topbar-social--' + s.key,
          target: '_blank',
          rel: 'noopener noreferrer',
          'aria-label': s.label + ', ' + s.handle,
          title: s.label + ' ' + s.handle,
        });
        a.style.setProperty('--brand', s.brand);
        a.innerHTML = socialIcon(s);
        a.addEventListener('click', function(){
          navTrack('social_click', { network: s.key, surface: 'topbar', from: location.pathname });
        });
        socialWrap.appendChild(a);
      });
      right.appendChild(socialWrap);
    }

    // ── Points chip (removed 2026-08-19) ─────────────────────────────
    // The 2026-08-12 "your prediction points" wallet chip (the 1,000 pts
    // pill on every page) is gone per the founder: "remove the betting / point
    // system from website for now". The whole points economy is
    // de-surfaced sitewide in this pass (this chip, the Predict tile,
    // the Money link); /predict itself stays live for direct links. The
    // 08-12 rationale (37 of 38 wallets untouched at the opening grant)
    // still reads as the history of why the chip existed; see git for
    // the mountPointsChip implementation if it comes back.

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
    pageLinks.forEach(function(L){
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
          class: ((pathMatches(L.href) ? 'is-active ' : '') + (L.wip ? 'is-wip' : '')).trim() || null,
        }, [
          el('span', null, L.label),
          L.wip ? el('span', { class: 'ui-topbar-more-wip' }, 'In progress') : null,
        ]);
        a.addEventListener('click', function(){ navTrack('nav_more_click', { to: L.href, surface: 'sheet' }); });
        sheetMore.appendChild(a);
      });
    });
    sheet.appendChild(sheetMore);
    // Signed-in users get a direct route to the full account controls.
    // Keep this separate from Sign out so the top-right menu is useful for
    // managing an account, not just leaving it.
    var sheetAccount = el('a', {
      href: '/profile#settings',
      id: 'sheetAccountSettings',
      class: 'ui-topbar-sheet-link',
      role: 'menuitem',
      hidden: 'hidden',
    }, 'Account & settings');
    sheet.appendChild(sheetAccount);

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
        openSharedAuth('signin');
      }
    });
    sheet.appendChild(sheetSignIn);

    // Permanent way back to the name picker, for anyone who dismissed the
    // one-time prompt or simply wants a different name later. Hidden until
    // there is an account to attach a name to; flipped on by syncIdentity.
    var sheetName = el('button', {
      type: 'button',
      id: 'sheetSetName',
      class: 'ui-topbar-sheet-link',
      role: 'menuitem',
      hidden: 'hidden',
    }, 'Change your name');
    sheetName.style.cssText = 'background:none;border:none;width:100%;text-align:left;font:inherit;cursor:pointer;color:inherit';
    sheetName.addEventListener('click', function(){
      closeSheet();
      openNameEditor();
    });
    sheet.appendChild(sheetName);

    // Social row in the mobile sheet. The desktop rail is icon-only and
    // hidden on phones, so this is where a phone visitor finds the
    // accounts. Labelled, because a bare glyph in a text list is a guess.
    if (SOCIALS.length){
      var sheetSocial = el('div', { class: 'ui-topbar-sheet-socials' });
      SOCIALS.forEach(function(s){
        var a = el('a', {
          href: s.href,
          class: 'ui-topbar-sheet-social',
          target: '_blank',
          rel: 'noopener noreferrer',
          role: 'menuitem',
        });
        a.style.setProperty('--brand', s.brand);
        a.innerHTML = socialIcon(s);
        a.appendChild(el('span', null, s.label));
        a.appendChild(el('span', { class: 'ui-topbar-sheet-social-h' }, s.handle));
        a.addEventListener('click', function(){
          navTrack('social_click', { network: s.key, surface: 'sheet', from: location.pathname });
        });
        sheetSocial.appendChild(a);
      });
      sheet.appendChild(sheetSocial);
    }

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
      // Floating bottom-left widgets outrank the sheet on z-index and
      // would cover its last links. See ui.css `body.ui-sheet-open`.
      document.body.classList.add('ui-sheet-open');
    }
    function closeSheet(){
      document.body.classList.remove('ui-sheet-open');
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
    /* 2026-08-10 revival, reverted same day: ~31 pages self-pin
       data-force-theme="light" in an inline early-paint script from the
       light-only era. A same-day change briefly treated that pin as a
       default rather than a lock, so a visitor with a saved dark pick
       got a dark topbar force-injected onto these pages too - including
       the 16 that were pinned in the first place specifically because
       they have NO dark palette on the body (see the 2026-08-10 "theme:
       dark mode back as a sitewide opt-in" commit's file list). Result:
       dark topbar over a body that never got dark styling, breaking
       layout. Pins are locks again, full stop, same as pre-revival.
       Reaching the toggle onto the pages that genuinely have dual
       palettes needs a real per-page audit, not a blanket override. */
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
    // Restore the pref parked by the 2026-07-09 disable, once. The
    // disable overwrote da-theme with 'light' after saving the real
    // pick to da-theme-saved-pref; a visitor who kept the forced light
    // value gets their dark pick back, and anyone who has since
    // toggled explicitly (da-theme no longer 'light') keeps that.
    // The old v2026-05 dark-default migration is retired: dark is
    // opt-in now, so nothing may clear a light pref.
    try {
      var parked = localStorage.getItem('da-theme-saved-pref');
      if (parked) {
        localStorage.removeItem('da-theme-saved-pref');
        if ((localStorage.getItem('da-theme') || 'light') === 'light') {
          localStorage.setItem('da-theme', parked);
        }
      }
    } catch(e){}
    /* The old da-theme-default-v2 migration (cleared light prefs to make
       dark the brand default) stays retired: light is the default now. */
    var saved = '';
    try { saved = localStorage.getItem('da-theme') || ''; } catch(e){}
    /* 2026-08-22 per the founder: the 2026-08-19 70/30 light/crimson
       bucket is retired, light is the default for everyone. Visitors the
       old split AUTO-bucketed into crimson (da-theme-ab === 'crimson',
       never toggled away) are migrated back to light exactly once,
       gated by da-theme-light-v3 so a later deliberate toggle to dark
       sticks. The landing's <head> script runs the same migration
       before first paint; this covers everyone else. */
    try {
      if (saved === 'crimson' && !localStorage.getItem('da-theme-light-v3')) {
        localStorage.setItem('da-theme-light-v3', '1');
        if ((localStorage.getItem('da-theme-ab') || '') === 'crimson') {
          saved = 'light';
          localStorage.setItem('da-theme', 'light');
        }
      } else if (saved) {
        localStorage.setItem('da-theme-light-v3', '1');
      }
    } catch(e){}
    if (!saved) {
      /* Light for every unset visitor. ?themeAb=crimson stays as a QA
         force for the dark surface; da-theme-ab keeps the assigned arm
         for the GA4 property below. */
      saved = 'light';
      try {
        var q = (location.search || '').toLowerCase();
        if (/[?&]themeab=crimson(?:&|$)/.test(q)) saved = 'crimson';
      } catch(e){ saved = 'light'; }
      try {
        localStorage.setItem('da-theme', saved);
        localStorage.setItem('da-theme-ab', saved);
        localStorage.setItem('da-theme-light-v3', '1');
      } catch(e){}
    }
    /* Report the arm on every topbar page, not just the landing, so
       conversions anywhere in the funnel segment by theme. Reads the
       assigned arm and falls back to the live pick for the visitors who
       predate this key. */
    try {
      var abArm = localStorage.getItem('da-theme-ab') || saved;
      var abAssigned = !!window.__themeAbAssigned;
      window.__themeAb = abArm;
      /* The landing's early-paint script reports the arm itself when
         gtag happens to be ready by then; this only covers the case it
         could not, plus every other topbar page. */
      if (window.gtag && !window.__themeAbSent) {
        gtag('set', 'user_properties', { theme_ab: abArm });
        gtag('event', 'theme_ab_view', { variant: abArm, assigned: abAssigned });
        window.__themeAbSent = true;
      }
    } catch(e){}
    document.documentElement.setAttribute('data-theme', saved);
    // Auto-sync data-lighting from data-theme on every page load. Fixes
    // the legacy out-of-sync state where /practice set data-lighting
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
  var FB_APP_SDK = 'https://www.gstatic.com/firebasejs/10.13.2/firebase-app-compat.js';
  var FB_AUTH_SDK = 'https://www.gstatic.com/firebasejs/10.13.2/firebase-auth-compat.js';
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
          // Every sign-in surface offers the same choices. The shared modal
          // carries Google, an emailed link, and email/password; this Google
          // popup stays as the fallback for a page that loads without it.
          if (typeof window.openAuthModal === 'function') { window.openAuthModal(); return; }
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

  // Signed-OUT state: a ghost "Sign in" button. Click opens the shared
  // email/password + Google chooser.
  function renderSignedOut(slot){
    slot.style.display = 'inline-flex';
    slot.style.alignItems = 'center';
    slot.innerHTML = '';
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.id = 'barSignIn';
    btn.className = 'ui-btn ui-btn-ghost ui-btn-sm';
    btn.title = 'Sign in or create an account. Free.';
    btn.textContent = 'Sign in';
    btn.addEventListener('click', function(){
      openSharedAuth('signin');
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

  /* ── the topbar face ────────────────────────────────────────────────
     2026-07-23. The bar used to render u.photoURL and nothing else, so a
     debater who built an avatar never saw it here, and one whose Google
     photo 403s (lh3 URLs rotate) or who never had one got an empty
     circle. DBAvatar.identity() now decides, and its last rung is a
     portrait seeded off the uid, so there is no faceless case left.

     The engine is 80KB, so we only fetch it when it can change what is
     on screen: they built an avatar (which outranks the Google photo),
     or there is no photo, or the photo we tried failed. A Google user
     with a working photo and no custom avatar pays nothing. */
  function paintTopbarFace(host, u){
    var built = false;
    try {
      var avatarValue = localStorage.getItem('debatable-avatar');
      if (!avatarValue) avatarValue = localStorage.getItem('debate' + 'it-avatar');
      built = !!avatarValue;
    } catch(e){}

    if (!built && u.photoURL){
      var img = document.createElement('img');
      img.alt = ''; img.referrerPolicy = 'no-referrer'; img.decoding = 'async';
      img.style.cssText = 'width:100%;height:100%;object-fit:cover;display:block';
      var toEngine = function(){ withAvatarEngine(host, u); };
      img.addEventListener('error', toEngine);
      img.addEventListener('load', function(){ if (!img.naturalWidth) toEngine(); });
      img.src = u.photoURL;
      host.appendChild(img);
      // Building an avatar mid-session should show up here without a
      // reload, and this path has no engine listening yet.
      window.addEventListener('debatable-avatar-change', toEngine, { once: true });
      return;
    }
    withAvatarEngine(host, u);
  }
  function withAvatarEngine(host, u){
    var draw = function(){
      if (!window.DBAvatar || !window.DBAvatar.mountIdentity) return;
      window.DBAvatar.mountIdentity(host, {
        uid: u.uid,
        name: topbarAvatarName(u),
        photo: null,          // resolved above; here we want the portrait
        size: 18,             // ui.css bumps this to 24 on phones
        live: true            // repaint when the builder saves
      });
    };
    if (window.DBAvatar && window.DBAvatar.mountIdentity) draw();
    else fbLoadOnce('da-avatar-engine', '/js/avatar.js', draw);
  }

  // Signed-IN state: name pill (-> /profile) + Settings. Sign out lives in
  // Account & settings and the mobile sheet, where it cannot be mistaken
  // for the account's only available action. Extension hook:
  // if the page sets window.daTopbarUserSlot(slot, user) BEFORE this
  // script loads, we hand off rendering (e.g. /practice adds an Account
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
    var first = topbarName(u);
    slot.innerHTML = '';
    var onProfile = /^\/profile/.test(here);
    var nameLink;
    if (onProfile){
      nameLink = document.createElement('span');
      nameLink.className = 'ui-topbar-userpill';
      nameLink.style.cssText = 'color:var(--text);font-weight:700;font-size:.78rem;display:inline-flex;align-items:center;gap:7px;padding:4px 10px;border-radius:999px;border:1px solid var(--accent);background:var(--bg-elev)';
    } else {
      nameLink = document.createElement('a');
      nameLink.className = 'ui-topbar-userpill';
      nameLink.href = '/profile';
      nameLink.title = 'Open your dashboard';
      nameLink.style.cssText = 'color:var(--text);text-decoration:none;font-weight:700;font-size:.78rem;display:inline-flex;align-items:center;gap:7px;padding:4px 10px;border-radius:999px;border:1px solid var(--border);background:var(--bg-card,transparent);transition:background .15s,border-color .15s';
      nameLink.addEventListener('mouseenter', function(){ nameLink.style.background = 'var(--bg-elev)'; nameLink.style.borderColor = 'var(--accent)'; });
      nameLink.addEventListener('mouseleave', function(){ nameLink.style.background = 'var(--bg-card,transparent)'; nameLink.style.borderColor = 'var(--border)'; });
    }
    // Everyone gets a face now, photo or not, so this host is
    // unconditional where the old <img> was built only when photoURL
    // existed. That is also what retires the name-only fallback below.
    var avaHost = document.createElement('span');
    avaHost.className = 'ui-topbar-useravatar';
    avaHost.style.cssText = 'width:18px;height:18px;border-radius:50%;overflow:hidden;flex-shrink:0;display:block;position:relative;background:var(--bg-elev)';
    nameLink.appendChild(avaHost);
    paintTopbarFace(avaHost, u);
    // 2026-07-23: the name and trailing action both drop off the bar on phones
    // (see ui.css ≤560px). The avatar already says who is signed in, and
    // the avatar opens the profile and the hamburger sheet carries both
    // Account & settings and Sign out, so on a 390px
    // bar these two were duplicating the sheet and crowding the wordmark.
    // Classed, not conditionally built, so a resize needs no re-render.
    var nameText = document.createElement('span');
    nameText.className = 'ui-topbar-username';
    nameText.textContent = first;
    nameLink.appendChild(nameText);
    var settings = document.createElement('a');
    settings.href = '/profile#settings';
    settings.className = 'ui-topbar-settings';
    settings.textContent = 'Settings';
    settings.title = 'Open account settings';
    settings.style.cssText = 'background:transparent;border:none;color:var(--text-dim);cursor:pointer;font-family:inherit;font-size:.68rem;padding:0;text-decoration:none';
    slot.appendChild(nameLink);
    slot.appendChild(settings);
  }

  // Orchestration. Paint immediately (Sign in button, or an Account
  // placeholder for cached-signed-in users), then attach the real auth
  // listener once firebase is ready. notifications.js bootstraps
  // firebase site-wide, so "ready" usually arrives within ~1.5s;
  // cached-signed-in pages force the bootstrap so the account controls
  // resolve even where it doesn't.
  // ── Display name ──────────────────────────────────────────────────
  // The name a debater picks lives in /js/public-identity.js and is what
  // every community surface renders. Two jobs here, both of which have to
  // happen on the topbar because the topbar is the only thing on all 63
  // pages: pull the stored name down on sign-in so it follows the account
  // across devices, and ask for one exactly once when an account is still
  // running on a generated alias.
  //
  // ASK ONCE is the whole design. A prompt that reappears until it is
  // answered turns a nicety into a toll gate on a product whose first
  // principle is that auth is advised rather than required, so a dismissal
  // is remembered permanently and the entry point moves to the sheet row
  // and /profile, which are always there.
  var NAME_ASKED_KEY = 'debatable-name-asked';

  // Never ASK on a surface where a round can be running. A dialog that
  // opens over someone mid-speech is worse than a generated alias, and
  // sign-in can complete at any moment on these pages. Same reasoning and
  // follows the same no-interruption rule as other live-audio surfaces; a
  // new page that runs or plays a round belongs here too. Hydration still happens
  // everywhere, so the name itself is correct on these pages, and the
  // sheet row and /profile still open the picker on purpose.
  var NO_PROMPT_ROUTES = [
    '/live-round', '/voice-debate', '/newvoice', '/room-judge', '/casual-room',
    '/voice-rfd', '/practice', '/coach', '/exhibition', '/spectate', '/watch'
  ];
  function promptAllowedHere(){
    for (var i = 0; i < NO_PROMPT_ROUTES.length; i++){
      if (here.indexOf(NO_PROMPT_ROUTES[i]) === 0) return false;
    }
    return true;
  }

  function withIdentity(cb){
    if (window.DBIdentity) { cb(window.DBIdentity); return; }
    fbLoadOnce('da-public-identity', '/js/public-identity.js', function(){
      if (window.DBIdentity) cb(window.DBIdentity);
    });
  }

  function openNameEditor(){
    withIdentity(function(ID){
      if (!ID.openEditor) return;
      try { localStorage.setItem(NAME_ASKED_KEY, '1'); } catch(e){}
      ID.openEditor().then(function(res){
        if (res && res.ok) navTrack('display_name_set', { surface: 'topbar' });
      });
    });
  }
  window.daOpenNameEditor = openNameEditor;

  function syncIdentity(user, slot){
    if (!user) return;
    withIdentity(function(ID){
      if (!ID.hydrate) return;
      ID.hydrate(user).then(function(){
        paintUserName(slot, user);
        if (!ID.needsName || !ID.needsName(user)) return;
        if (!promptAllowedHere()) return;
        var asked = '';
        try { asked = localStorage.getItem(NAME_ASKED_KEY) || ''; } catch(e){}
        if (asked) return;
        // Deferred a beat so it lands after the page has painted rather
        // than on top of whatever the visitor was already reading.
        setTimeout(openNameEditor, 1200);
      });
    });
  }

  // Repaint the account pill from the chosen name. Kept separate from
  // renderSignedIn so a name saved mid-session updates the bar without a
  // reload, which is what the change event below is for.
  function paintUserName(slot, user){
    var node = (slot || document).querySelector('.ui-topbar-username');
    if (!node) return;
    node.textContent = topbarName(user);
  }

  // The alias IS the identity on this site, chosen or generated, so the
  // pill renders it either way. The old `id.chosen` condition meant an
  // account that never picked a name fell through to displayName, or to
  // the EMAIL, and Google accounts carry a real name — so the bar read
  // "Aidan" on an account whose whole point is that it does not. There is
  // no fallback to the real identity any more: if the identity module has
  // not loaded yet we say Account and repaint on dbidentity:change.
  function topbarName(u){
    if (window.DBIdentity && window.DBIdentity.forUser){
      var id = window.DBIdentity.forUser(u);
      if (id && id.name) return id.name.split(/\s+/)[0];
    }
    return 'Account';
  }
  // Same rule for the portrait: it derives initials from whatever name it
  // is handed, so passing the real one put a real initial next to an alias.
  function topbarAvatarName(u){
    if (window.DBIdentity && window.DBIdentity.forUser){
      var id = window.DBIdentity.forUser(u);
      if (id && id.name) return id.name;
    }
    return '';
  }

  window.addEventListener('dbidentity:change', function(){
    var u = fbRealUser();
    if (u) paintUserName(document.getElementById('barUser'), u);
  });

  // Points-chip fetch/paint helpers removed 2026-08-19 with the chip
  // itself (betting/points de-surfacing pass). /predict calls
  // window.daPointsChanged behind an existence guard, so its absence is
  // safe.

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
          var sa = document.getElementById('sheetAccountSettings');
          if (sa){ if (realUser) sa.removeAttribute('hidden'); else sa.setAttribute('hidden', 'hidden'); }
          var sn = document.getElementById('sheetSetName');
          if (sn){ if (realUser) sn.removeAttribute('hidden'); else sn.setAttribute('hidden', 'hidden'); }
          // Live debate pages use anonymous Firebase auth as a real guest
          // seat. They can opt into painting that identity without making
          // anonymous sessions look signed in across the rest of the site.
          if (!realUser){
            if (u && u.isAnonymous && typeof window.daTopbarGuestSlot === 'function'){
              slot.style.display = 'inline-flex';
              slot.style.alignItems = 'center';
              slot.style.gap = '8px';
              slot.innerHTML = '';
              try { window.daTopbarGuestSlot(slot, u); return; } catch(e){}
            }
            renderSignedOut(slot);
            return;
          }
          renderSignedIn(slot, realUser);
          syncIdentity(realUser, slot);
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
    card.style.cssText = "background:#faf9f4;color:#1d1915;border-radius:14px;padding:20px 20px 16px;max-width:340px;width:100%;font-family:'Archivo',Georgia,serif;box-shadow:0 18px 50px rgba(0,0,0,.3)";
    var gmail = 'https://mail.google.com/mail/?view=cm&fs=1&to=' + esc(info.to) + (info.subject ? '&su=' + esc(info.subject) : '') + (info.body ? '&body=' + esc(info.body) : '');
    var outlook = 'https://outlook.live.com/mail/0/deeplink/compose?to=' + esc(info.to) + (info.subject ? '&subject=' + esc(info.subject) : '') + (info.body ? '&body=' + esc(info.body) : '');
    var row = 'display:block;width:100%;text-align:left;padding:11px 14px;margin:8px 0 0;border:1px solid rgba(29,25,21,.15);border-radius:10px;background:#fff;color:#1d1915;font:inherit;font-size:15px;font-weight:600;cursor:pointer;text-decoration:none;box-sizing:border-box';
    card.innerHTML =
      '<div style="font-weight:800;font-size:17px">Send an email</div>' +
      '<div style="font-size:13.5px;color:rgba(29,25,21,.64);margin-top:2px;word-break:break-all">' + info.to.replace(/</g, '&lt;') + '</div>' +
      '<a data-x="gmail" style="' + row + '" href="' + gmail + '" target="_blank" rel="noopener">Open in Gmail</a>' +
      '<a data-x="outlook" style="' + row + '" href="' + outlook + '" target="_blank" rel="noopener">Open in Outlook</a>' +
      '<a data-x="mailapp" style="' + row + '" href="' + rawHref + '">Use my mail app</a>' +
      '<button data-x="copy" style="' + row + ';border-style:dashed;font-weight:600">Copy address</button>' +
      '<button data-x="close" style="display:block;margin:10px auto 0;border:0;background:none;color:rgba(29,25,21,.64);font:inherit;font-size:13px;cursor:pointer">Cancel</button>';
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

/* ── Audience mode + plain-language motions ─────────────────────
   The sign-in onboarding answer follows the account and gives pages a
   stable beginner/competitive hook. The same module expands THBT, THW,
   and related shorthand in visible copy, including dynamically rendered
   cards. */
(function(){
  if (window.__debatableAudienceMode || document.querySelector('script[src*="/js/audience-mode.js"]')) return;
  var s = document.createElement('script');
  s.src = '/js/audience-mode.js';
  s.defer = true;
  (document.body || document.head || document.documentElement).appendChild(s);
})();

/* The chooser that feeds audience-mode.js. It reads
   debateos-experience and, until 2026-08-22, nothing on a page a
   stranger actually lands on ever set it: the only prompts were one
   line below the fold on the landing and the post-signup onboarding
   card. Injected here so the question reaches every topbar page;
   experience-ask.js decides on its own whether to render (already
   answered, already dismissed, or a page where a round is running). */
(function(){
  if (window.__daExperienceAsk || document.querySelector('script[src*="/js/experience-ask.js"]')) return;
  var s = document.createElement('script');
  s.src = '/js/experience-ask.js';
  s.defer = true;
  (document.body || document.head || document.documentElement).appendChild(s);
})();

/* ── The Debatable Open countdown strip ─────────────────────────
   One-line dismissible strip pinned above the topbar on every page
   that loads this file. Uses the dormant .ui-beta-strip CSS in
   ui.css (fixed top, 32px) — .ui-topbar already offsets itself when
   body carries .has-beta-strip, and native-bridge.js already hides
   .ui-beta-strip inside the iOS shell, which is wanted: cash-prize
   copy stays out of the App Store build.

   Self-retiring: the strip renders nothing after the event day ends
   (Aug 29, 11:59 PM ET), and the free-entry clause swaps out on its
   own once the publicly promised Friday deadline passes. Dismiss is
   sessionStorage, so it stays gone for the visit but returns next
   session — a 10-day campaign strip, not a permanent banner.
   Skipped on /tournaments and /tournament-rules (no self-ads), and on
   /unblock: that page exists to convince a school filter reviewer the
   domain is Education, and a cash-prize strip above the fold is the
   exact signal that got the domain miscategorized in the first place. */
(function(){
  if (window.__daOpenStrip) return;
  window.__daOpenStrip = 1;

  var path = (location.pathname || '/').replace(/\/$/, '') || '/';
  if (/^\/(tournaments|tournament-rules|unblock)(\.html)?$/.test(path)) return;
  try { if (sessionStorage.getItem('da-open-strip-dismissed') === '1') return; } catch (e) {}

  // All boundaries in ET (UTC-4 in August).
  //
  // Entry is FREE for everyone as of 2026-08-22, so the strip carries
  // the prize, the date, and one trust token (no card), framed so a
  // stranger reads a contest rather than a giveaway. It has now said "Free to
  // enter", then "$20", then "$5", then free again, which is exactly
  // why no price appears in this string any more: a ribbon on 60 pages
  // is the slowest surface to correct and the most expensive to get
  // wrong. The prize figure is the one number here, it is fixed and
  // funded by the organizer, and /tournaments owns everything else.
  var now = Date.now();
  var EVENT_DAY  = Date.parse('2026-08-29T00:00:00-04:00');
  var EVENT_OVER = Date.parse('2026-08-29T23:59:59-04:00');
  if (now > EVENT_OVER) return;

  var tail = (now >= EVENT_DAY)
    ? 'rush hours 12, 3 & 6 PM ET'
    : 'free to enter, no card';

  function mount(){
    if (document.querySelector('.ui-beta-strip')) return;
    var strip = document.createElement('div');
    strip.className = 'ui-beta-strip';
    strip.setAttribute('role', 'region');
    strip.setAttribute('aria-label', 'Tournament announcement');
    // Only the hook survives on a phone. Everything else rides the
    // .ui-open-strip-tail span, which is hidden under 560px, because
    // body.has-beta-strip reserves a fixed 32px and this bar is 48px
    // the moment it wraps to a second line, which clips the wordmark
    // underneath it. One line on mobile is also the better hook.
    // The DATE rides in the hook, not the tail. Under 560px the tail is
    // hidden, so the hook alone has to carry the prize, the day, AND
    // enough frame that "$100 free" does not read as a giveaway: it is
    // "$100 for winning a debate", a prize you compete for, which is the
    // whole anti-scam move (the tail adds "no card" where there is room).
    // Keep the hook short enough that the date survives the ellipsis at
    // ~320px: prize-frame plus day is the ceiling.
    var msg = '$100 for winning a debate · ' + (now >= EVENT_DAY ? 'live today' : 'Sat Aug 29');
    var rest = ' · The Debatable Open · ' + tail;
    strip.innerHTML =
      '<a href="/tournaments" data-cta="open-strip">' + msg +
      '<span class="ui-open-strip-tail">' + rest + '</span> →</a>' +
      '<button type="button" class="ui-beta-strip-dismiss" aria-label="Dismiss">×</button>';
    var css = document.createElement('style');
    css.textContent =
      '.ui-beta-strip a{text-decoration:none}' +
      '.ui-beta-strip a:hover{text-decoration:underline}' +
      '@media (max-width:560px){.ui-open-strip-tail{display:none}}';
    document.head.appendChild(css);
    document.body.appendChild(strip);
    document.body.classList.add('has-beta-strip');
    strip.querySelector('.ui-beta-strip-dismiss').addEventListener('click', function(){
      try { sessionStorage.setItem('da-open-strip-dismissed', '1'); } catch (e) {}
      strip.remove();
      document.body.classList.remove('has-beta-strip');
    });
    strip.querySelector('a').addEventListener('click', function(){
      try { if (typeof gtag === 'function') gtag('event', 'open_strip_click', { path: path }); } catch (e) {}
    });
  }

  if (document.body) mount();
  else document.addEventListener('DOMContentLoaded', mount);
})();

/* ── The Debatable Open: one modal, 30 seconds in ────────────────
   Aidan, 2026-08-22: "advertise it as a pop up 30 seconds in to all
   users." Shipped alongside the removal of the landing's first-screen
   Open card, which he retired in the same breath ("the line at the top
   resolves it"), so the event now reaches people through the passive
   strip above and this one active interruption, and not at all on the
   first screen.

   A modal is the most expensive thing a site can spend on a visitor, so
   every rule below is about spending it once and spending it on the
   right moment. Read them before loosening any of them.

   NEVER fires:
   - more than once per person, ever. sessionStorage would make it a
     nag that returns tomorrow; localStorage makes it an announcement.
     Dismissing IS the answer, and it is remembered.
   - on a surface where the visitor is mid-task. A round, a voice call,
     a queue, the tab room, checkout: covering any of those with a
     tournament ad is worse than not advertising at all.
   - to somebody who already entered (the entry page stamps
     `da-open-entered`), or who dismissed the strip about this same
     event in this session. Both are people who have already answered.
   - in the iOS shell. Same reason the strip is hidden there: cash-prize
     copy stays out of the App Store build (Apple 3.1.1).
   - while the visitor is typing. A modal that steals focus mid-sentence
     costs a sentence.

   The 30 seconds are VISIBLE seconds. A backgrounded tab accrues
   nothing, so a page left open in another window does not "read" for
   half an hour and get interrupted the moment it is looked at. Same
   discipline as the presence gate (2026-08-14): dwell means dwell.

   Self-retiring on the same clock as the strip. */
(function(){
  if (window.__daOpenModal) return;
  window.__daOpenModal = 1;

  var DWELL_MS = 30000;
  var SEEN_KEY = 'da-open-modal-seen';
  var ENTERED_KEY = 'da-open-entered';
  var EVENT_OVER = Date.parse('2026-08-29T23:59:59-04:00');
  var EVENT_DAY  = Date.parse('2026-08-29T00:00:00-04:00');

  // Surfaces where an interruption lands on top of something the person
  // is actually doing. Wider than the strip's skip list on purpose: the
  // strip is a line they can ignore, this takes the screen.
  var SKIP = /^\/(tournaments|tournament-rules|tournament|open|unblock|live-round|voice-debate|newvoice|room-judge|casual-room|spar|debate-chat|partners|exhibition|coach|watch|w|pricing|admin)(\/|$)/;

  if (Date.now() > EVENT_OVER) return;
  if (document.documentElement.classList.contains('dbnative')) return;

  var path = (location.pathname || '/').replace(/\.html$/, '').replace(/\/$/, '') || '/';
  if (SKIP.test(path)) return;

  try {
    if (localStorage.getItem(SEEN_KEY) === '1') return;
    if (localStorage.getItem(ENTERED_KEY) === '1') return;
  } catch (e) {}

  function ev(name, meta){
    try { if (typeof window.track === 'function') window.track(name, meta || {}); } catch (e) {}
    try { if (typeof gtag === 'function') gtag('event', name, meta || {}); } catch (e) {}
  }

  // Someone who closed the ribbon about this event 20 seconds ago has
  // answered the question. Checked at fire time rather than at load,
  // because the dismissal usually happens during the wait.
  function stripDismissed(){
    try { return sessionStorage.getItem('da-open-strip-dismissed') === '1'; } catch (e) { return false; }
  }
  function isTyping(){
    var el = document.activeElement;
    if (!el) return false;
    var tag = (el.tagName || '').toLowerCase();
    return tag === 'input' || tag === 'textarea' || tag === 'select' || el.isContentEditable === true;
  }

  var visibleMs = 0, last = Date.now(), timer = null, fired = false;

  function tick(){
    var now = Date.now();
    if (!document.hidden) visibleMs += now - last;
    last = now;
    if (visibleMs < DWELL_MS) return;
    // Ready, but not at any cost: a person mid-sentence keeps the floor
    // and gets it on the next tick after they stop.
    if (isTyping()) return;
    clearInterval(timer);
    if (stripDismissed()) return;
    show();
  }

  document.addEventListener('visibilitychange', function(){
    var now = Date.now();
    if (!document.hidden) { last = now; return; }
    visibleMs += now - last;
    last = now;
  });

  function show(){
    if (fired || document.querySelector('.ui-open-modal')) return;
    fired = true;
    try { localStorage.setItem(SEEN_KEY, '1'); } catch (e) {}

    var reduce = false;
    try { reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) {}

    var css = document.createElement('style');
    css.textContent =
      '.ui-open-modal{position:fixed;inset:0;z-index:2147483000;display:flex;align-items:center;justify-content:center;padding:20px;' +
        'background:rgba(12,12,14,.62);backdrop-filter:blur(3px);' + (reduce ? '' : 'animation:uiOpenFade .18s ease-out') + '}' +
      '@keyframes uiOpenFade{from{opacity:0}to{opacity:1}}' +
      '@keyframes uiOpenRise{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}' +
      // max-height + scroll rather than a shorter card: a landscape
      // phone or a short window would otherwise push the CTA off the
      // bottom, which turns a modal into a dead end with no visible way
      // out except Escape.
      '.ui-open-card{position:relative;width:100%;max-width:432px;background:#fdfbf7;color:#1a1a1c;border-radius:18px;' +
        'max-height:calc(100vh - 40px);overflow-y:auto;' +
        'padding:30px 28px 24px;box-shadow:0 24px 64px rgba(0,0,0,.34);' +
        'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;text-align:left;' +
        (reduce ? '' : 'animation:uiOpenRise .22s cubic-bezier(.2,.7,.3,1)') + '}' +
      '.ui-open-tag{display:inline-block;background:#b91c1c;color:#fff;font-size:.7rem;font-weight:800;letter-spacing:.11em;' +
        'text-transform:uppercase;padding:6px 12px;border-radius:999px;margin:0 0 16px}' +
      '.ui-open-h{margin:0 0 10px;font-size:1.6rem;line-height:1.16;font-weight:800;letter-spacing:-.02em}' +
      '.ui-open-p{margin:0 0 8px;font-size:.98rem;line-height:1.55;color:#4a4a52}' +
      '.ui-open-fine{margin:0 0 20px;font-size:.8rem;line-height:1.5;color:#6f6f79}' +
      '.ui-open-go{display:block;width:100%;box-sizing:border-box;text-align:center;background:#b91c1c;color:#fff;' +
        'font-size:1rem;font-weight:800;padding:14px 18px;border-radius:12px;text-decoration:none;border:0;cursor:pointer}' +
      '.ui-open-go:hover{background:#991b1b}' +
      '.ui-open-no{display:block;width:100%;margin-top:10px;background:none;border:0;color:#6f6f79;' +
        'font-size:.88rem;font-weight:600;padding:9px;cursor:pointer;font-family:inherit}' +
      '.ui-open-no:hover{color:#1a1a1c;text-decoration:underline}' +
      '.ui-open-x{position:absolute;top:12px;right:12px;width:32px;height:32px;border:0;background:none;' +
        'color:#8a8a94;font-size:1.35rem;line-height:1;cursor:pointer;border-radius:8px}' +
      '.ui-open-x:hover{background:rgba(0,0,0,.06);color:#1a1a1c}' +
      '@media (prefers-color-scheme:dark){:root:not([data-theme="light"]) .ui-open-card{background:#1c1c1f;color:#f5efe7}' +
        ':root:not([data-theme="light"]) .ui-open-p{color:rgba(245,239,231,.76)}' +
        ':root:not([data-theme="light"]) .ui-open-fine{color:rgba(245,239,231,.58)}' +
        ':root:not([data-theme="light"]) .ui-open-no{color:rgba(245,239,231,.6)}' +
        ':root:not([data-theme="light"]) .ui-open-no:hover{color:#f5efe7}}' +
      ':root[data-theme="dark"] .ui-open-card{background:#1c1c1f;color:#f5efe7}' +
      ':root[data-theme="dark"] .ui-open-p{color:rgba(245,239,231,.76)}' +
      ':root[data-theme="dark"] .ui-open-fine{color:rgba(245,239,231,.58)}' +
      ':root[data-theme="dark"] .ui-open-no{color:rgba(245,239,231,.6)}' +
      'html.dbnative .ui-open-modal{display:none !important}' +
      '@media (max-width:420px){.ui-open-card{padding:26px 20px 20px}.ui-open-h{font-size:1.42rem}}';
    document.head.appendChild(css);

    var wrap = document.createElement('div');
    wrap.className = 'ui-open-modal';
    wrap.setAttribute('role', 'dialog');
    wrap.setAttribute('aria-modal', 'true');
    wrap.setAttribute('aria-labelledby', 'uiOpenH');
    var today = Date.now() >= EVENT_DAY;
    wrap.innerHTML =
      '<div class="ui-open-card">' +
        '<button type="button" class="ui-open-x" aria-label="Close">&times;</button>' +
        '<span class="ui-open-tag">' + (today ? 'Today' : 'Sat Aug 29') + '</span>' +
        '<h2 class="ui-open-h" id="uiOpenH">Win $100 for winning an argument.</h2>' +
        '<p class="ui-open-p">The Debatable Open is a one day online tournament. You turn up whenever suits you, get paired with a real person, and every round ends with a written verdict. Rush hours at 12, 3 and 6 PM Eastern are when pairing is fastest. $100 for first, $50 for second, $25 for third.</p>' +
        '<p class="ui-open-fine">Free to enter, no card at any point. Cash prizes go to entrants 18 or over; under 18 plays the same field for the placement and the ranking.</p>' +
        '<a class="ui-open-go" href="/tournaments#enter" data-cta="open-modal">Enter free</a>' +
        '<button type="button" class="ui-open-no">Not interested</button>' +
      '</div>';

    var prevFocus = document.activeElement;
    var prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    document.body.appendChild(wrap);

    var go = wrap.querySelector('.ui-open-go');
    go.focus({ preventScroll: true });
    ev('open_modal_shown', { path: path });

    function close(how){
      document.removeEventListener('keydown', onKey, true);
      document.body.style.overflow = prevOverflow;
      wrap.remove();
      try { if (prevFocus && prevFocus.focus) prevFocus.focus({ preventScroll: true }); } catch (e) {}
      ev('open_modal_dismiss', { path: path, how: how });
    }
    // Focus stays inside while it is open, and Escape always closes it.
    // A modal you cannot tab out of and cannot escape is a trap; one you
    // can tab behind is a modal in name only.
    function onKey(e){
      if (e.key === 'Escape') { e.preventDefault(); close('escape'); return; }
      if (e.key !== 'Tab') return;
      var f = wrap.querySelectorAll('a[href],button');
      if (!f.length) return;
      var first = f[0], lastEl = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); lastEl.focus(); }
      else if (!e.shiftKey && document.activeElement === lastEl) { e.preventDefault(); first.focus(); }
    }
    document.addEventListener('keydown', onKey, true);

    wrap.querySelector('.ui-open-x').addEventListener('click', function(){ close('x'); });
    wrap.querySelector('.ui-open-no').addEventListener('click', function(){ close('no'); });
    wrap.addEventListener('click', function(e){ if (e.target === wrap) close('backdrop'); });
    go.addEventListener('click', function(){ ev('open_modal_click', { path: path }); });
  }

  timer = setInterval(tick, 1000);
})();
