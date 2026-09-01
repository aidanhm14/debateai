/* live-popup.js — "there is something real to watch right now."
 *
 * A sitewide corner card that surfaces the arena from every other page.
 * Three sources, tried in this order, first hit wins:
 *
 *   1. LIVE ROUND   (/api/watch-live)  → watch two strangers argue now
 *   2. WAITING      (/api/live-now)    → someone is queued, go debate them
 *   3. REPLAY       (/api/recordings)  → a finished round, with a real
 *                                        frame from the recording itself
 *
 * Why three. A live public round is the most convincing thing on this
 * site and it is invisible from every page except the three that list
 * it. But live rounds are rare, so a live-only card almost never fires
 * and the arena stays invisible anyway. The other two sources are real
 * inventory that exists most of the time.
 *
 * EVERY PICTURE IS A REAL FRAME OF A REAL ROUND, or there is no picture.
 * A live round's still comes from /api/room-shot (the canvas the room is
 * already receiving, posted by a seated debater). A replay's comes from
 * /api/recording-thumb (a frame of the actual recording). When neither
 * exists the card falls back to a typographic tile and NEVER draws a
 * stand-in image: a stock photo under a LIVE badge is the one failure
 * this surface cannot absorb.
 *
 * Copy is per source and never overstates. A replay says REPLAY and
 * "Watch the replay", not LIVE NOW. Only a round actually in progress
 * gets the live badge and the pulsing dot.
 *
 * Spectating needs no account, so the live and replay cards hand an
 * anonymous visitor straight through. The waiting card points at /spar,
 * which does ask for one, because the person on the other bench is real.
 *
 * Blur: BLUR_PX below. 0 ships frames as they are, which is what the
 * live strip and /watch already do. 10 gives the frosted treatment.
 *
 * Restraint, because this is unsolicited and sitewide:
 *   - first read only after 15s of VISIBLE dwell, never on load
 *   - polls stop the moment a card shows, and after 6 rounds regardless
 *   - hidden tabs never poll
 *   - at most 2 cards per session, 6 minutes apart, never the same item
 *     twice, and dismissing snoozes every page for 4 hours
 *   - a taller corner card elsewhere on the page gets right of way
 *   - excluded outright from round surfaces, the queue, and the pages
 *     that already list rounds (see SKIP)
 *
 * QA: ?livepop=off disables. ?livepop=now skips the dwell, snooze and
 * caps. ?livepop=demo renders the no-picture tile and ?livepop=demopic
 * the picture layout, so both looks and the blur setting can be judged
 * on any page when nothing happens to be live.
 */
(function () {
  'use strict';

  if (window.__ditLivePopup) return;
  window.__ditLivePopup = 1;

  /* 0 = show the frame as it is. 10 = frost it. */
  var BLUR_PX = 0;

  /* LIVE-ONLY MODE (2026-08-31, the founder: when someone joins while a
     round is live, notify them asap and let them join anonymously).
     The sitewide loader was retired 2026-08-25 because the REPLAY source
     kept putting the same recorded participant's face on unrelated
     pages. That objection is about replays, not live rounds, so the
     loader is back with only the live fast lane armed sitewide: a round
     actually happening is the strongest thing this site can show and it
     names nobody who is not already live in public on /watch and /.
     Flip to false to re-arm the waiting/replay chain — but reread the
     2026-08-25 note in topbar.js first; the inventory-depth concern is
     what has to have changed. */
  var LIVE_ONLY = true;

  var FIRST_DELAY_MS = 15000;   // visible dwell before the first read
  var POLL_MS = 120000;
  /* THE LIVE FAST LANE (2026-08-31). A round that is LIVE right now is
     time-boxed inventory: by the time the 15s dwell and 120s polls get
     around to it, the round is half over. So the live source alone gets
     its own lane: first read ~2.5s after arrival, then a 60s watcher for
     the length of the visit, so a round that goes live mid-browse
     reaches the visitor within a minute. Spectating needs no account,
     so the card hands an anonymous visitor straight into the room.
     Restraint the lane KEEPS: hidden tabs never poll, a dismissal's 4h
     snooze holds, someone mid-round is never poked, and another corner
     card gets right of way. What it BYPASSES, deliberately: the 15s
     dwell, the 2-cards-per-session cap and the 6-minute gap — those
     exist for unsolicited replay/waiting nudges, and a genuinely live
     round is the one thing this site can least afford to sit on.
     /api/watch-live is keyless and CDN-cached 12s, so the watcher costs
     one cached GET per visible minute. */
  var LIVE_FIRST_DELAY_MS = 2500;
  var LIVE_POLL_MS = 60000;
  var LIVE_CARD_LIFE_MS = 75000;   // a live card may outstay a replay's 30s
  var MAX_ROUNDS = 6;           // poll cycles, not debate rounds
  var CARD_LIFE_MS = 30000;     // an ignored card leaves rather than squats
  var GAP_MS = 6 * 60 * 1000;   // between two cards in one session
  var MAX_PER_SESSION = 2;
  var SNOOZE_MS = 4 * 60 * 60 * 1000;
  var REPLAY_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

  var SNOOZE_KEY = 'da-livepop-snooze';
  var SEEN_KEY = 'da-livepop-seen';     // items already offered this session
  var COUNT_KEY = 'da-livepop-count';
  var LAST_KEY = 'da-livepop-last';

  /* Pages where this would interrupt rather than invite. Round surfaces
     and anything that makes its own sound (the visitor is mid-round);
     /spar and /partners (they are queueing for a round of their own and
     pulling them out costs them the match); and the pages that already
     list rounds and replays, where a floating duplicate is noise. */
  var SKIP = [
    '/live-round', '/voice-debate', '/newvoice', '/room-judge', '/casual-room',
    '/voice-rfd', '/practice', '/exhibition', '/coach', '/brain',
    '/spectate', '/watch', '/replays', '/live', '/livedebates',
    '/spar', '/debate-chat', '/partners', '/app', '/index'
  ];

  var qs = '';
  try { qs = (location.search || '').toLowerCase(); } catch (e) {}
  var off = /[?&]livepop=off(?:&|$)/.test(qs);
  var force = /[?&]livepop=now(?:&|$)/.test(qs);
  var demo = /[?&]livepop=demo(?:&|$)/.test(qs);
  var demoPic = /[?&]livepop=demopic(?:&|$)/.test(qs);
  if (demoPic) demo = true;
  if (off) return;

  /* Never inside a frame. live-pip.js keeps a round alive in a
     same-origin site shell while the visitor browses, so a card here
     would be advertising a different round at someone already in one. */
  try { if (window.top !== window.self) return; } catch (e) { return; }

  var here = '';
  try {
    here = (location.pathname || '/').replace(/\.html$/, '').replace(/\/+$/, '');
    if (!here) here = '/';
  } catch (e) { return; }
  if (!force && !demo && SKIP.indexOf(here) >= 0) return;

  function now() { return Date.now(); }
  function readNum(store, key) {
    try { return Number(store.getItem(key) || 0) || 0; } catch (e) { return 0; }
  }
  function write(store, key, val) {
    try { store.setItem(key, String(val)); } catch (e) {}
  }
  function emit(name, params) {
    try { if (typeof window.gtag === 'function') window.gtag('event', name, params || {}); } catch (e) {}
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function seenItems() {
    try { return JSON.parse(sessionStorage.getItem(SEEN_KEY) || '[]') || []; } catch (e) { return []; }
  }
  function markSeen(key) {
    var list = seenItems();
    if (list.indexOf(key) < 0) list.push(key);
    try { sessionStorage.setItem(SEEN_KEY, JSON.stringify(list.slice(-40))); } catch (e) {}
  }
  function unseen(key) { return seenItems().indexOf(key) < 0; }

  /* Mid-round in ANOTHER tab. SKIP above only knows this tab's path, so a
     debater who opened a second tab while speaking got the card anyway —
     the one case the SKIP list exists to prevent. js/round-presence.js
     heartbeats from the round tab; read it inline (same key and window as
     that file) so a page without the writer fails open rather than throws.
     Checked per cycle, not once at boot, because the round usually starts
     after this page was opened. */
  function busyInRound() {
    try {
      var d = JSON.parse(localStorage.getItem('da-round-presence') || 'null');
      if (!d || !d.kind) return false;
      return (now() - (d.at || 0)) <= 150000;
    } catch (e) { return false; }
  }

  function snoozed() {
    return now() - readNum(localStorage, SNOOZE_KEY) < SNOOZE_MS;
  }
  function gated() {
    if (force || demo) return false;
    if (busyInRound()) return true;
    if (snoozed()) return true;
    if (readNum(sessionStorage, COUNT_KEY) >= MAX_PER_SESSION) return true;
    if (now() - readNum(sessionStorage, LAST_KEY) < GAP_MS) return true;
    return false;
  }
  /* The fast lane's gate: everything about consent and courtesy, nothing
     about pacing. */
  function liveGated() {
    return busyInRound() || snoozed() || cornerBusy();
  }

  function clock(sec) {
    sec = Math.max(0, Math.round(Number(sec) || 0));
    var m = Math.floor(sec / 60), s = sec % 60;
    return m + ':' + (s < 10 ? '0' : '') + s;
  }
  function initial(name) {
    var s = String(name || '').trim();
    return s ? s.charAt(0).toUpperCase() : '?';
  }
  function getJSON(url) {
    return fetch(url, { cache: 'no-cache' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .catch(function () { return null; });
  }

  /* ── styles ─────────────────────────────────────────────────────
     Self-contained and token-driven, so the card follows whichever of
     the real themes the page is in (light, crimson, grey). Every var()
     carries a dark literal fallback for pages that skip ui.css. */
  var STYLE_ID = 'da-livepop-css';
  function injectCss() {
    if (document.getElementById(STYLE_ID)) return;
    var st = document.createElement('style');
    st.id = STYLE_ID;
    st.textContent = [
      '.da-livepop{position:fixed;right:18px;bottom:18px;z-index:12050;width:min(330px,calc(100vw - 28px));',
      'display:block;text-decoration:none;color:inherit;border-radius:16px;overflow:hidden;',
      'background:linear-gradient(var(--bg-card,#15151a),var(--bg-card,#15151a)),var(--bg,#0a0a0c);',
      'border:1px solid var(--border-strong,rgba(239,68,68,.34));',
      'box-shadow:0 18px 52px rgba(0,0,0,.46),0 0 0 1px rgba(239,68,68,.07);',
      'font-family:"Archivo","Inter",system-ui,-apple-system,sans-serif;',
      'opacity:0;transform:translateY(16px) scale(.98);',
      'transition:opacity .28s ease,transform .34s cubic-bezier(.2,.8,.2,1)}',
      '.da-livepop.in{opacity:1;transform:none}',
      '.da-livepop:hover{border-color:var(--accent,#ef4444)}',

      /* Thumb. 16:9 so a 320x180 still lands with no crop. */
      '.da-livepop__thumb{position:relative;display:block;width:100%;aspect-ratio:16/9;',
      'background:var(--bg-elev,#101014);overflow:hidden}',
      '.da-livepop__thumb img{width:100%;height:100%;object-fit:cover;display:block;',
      'filter:blur(' + BLUR_PX + 'px);transform:scale(' + (BLUR_PX ? 1.12 : 1.001) + ')}',

      /* Typographic fallback when there is no real frame. Reads as a
         deliberate tile, never as a broken image. */
      '.da-livepop__fallback{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;gap:10px;',
      'background:radial-gradient(120% 140% at 50% 0,rgba(239,68,68,.18),transparent 70%),var(--bg-elev,#101014)}',
      '.da-livepop__ini{width:42px;height:42px;border-radius:50%;display:flex;align-items:center;justify-content:center;',
      'background:var(--bg-card,#15151a);border:1px solid var(--border,rgba(255,255,255,.14));',
      'color:var(--text,#fff);font-size:.95rem;font-weight:800}',
      '.da-livepop__vs{font-size:.62rem;font-weight:900;letter-spacing:.14em;color:var(--text-dim,#9aa)}',
      /* No picture: shrink the frame rather than holding 16:9 of empty
         tile. The card must not look like it is showing video when it
         is not. */
      '.da-livepop--nopic .da-livepop__thumb{aspect-ratio:16/6}',

      '.da-livepop__badge{position:absolute;top:9px;left:9px;display:inline-flex;align-items:center;gap:6px;',
      'height:22px;padding:0 9px;border-radius:999px;background:rgba(10,10,12,.82);',
      '-webkit-backdrop-filter:blur(6px);backdrop-filter:blur(6px);',
      'color:#fff;font-size:.58rem;font-weight:900;letter-spacing:.13em}',
      '.da-livepop__dot{width:6px;height:6px;border-radius:50%;background:#ef4444}',
      /* Only a round actually in progress pulses. A replay is not live
         and must not borrow the signal that says it is. */
      '.da-livepop--live .da-livepop__dot{animation:daLivePopDot 1.7s ease-out infinite}',
      '.da-livepop--wait .da-livepop__dot{background:#22c55e;animation:daLivePopDotG 1.7s ease-out infinite}',
      '.da-livepop--replay .da-livepop__dot{background:rgba(255,255,255,.55)}',
      '@keyframes daLivePopDot{0%{box-shadow:0 0 0 0 rgba(239,68,68,.6)}70%{box-shadow:0 0 0 6px rgba(239,68,68,0)}100%{box-shadow:0 0 0 0 rgba(239,68,68,0)}}',
      '@keyframes daLivePopDotG{0%{box-shadow:0 0 0 0 rgba(34,197,94,.6)}70%{box-shadow:0 0 0 6px rgba(34,197,94,0)}100%{box-shadow:0 0 0 0 rgba(34,197,94,0)}}',

      '.da-livepop__x{position:absolute;top:7px;right:7px;width:26px;height:26px;border:0;border-radius:50%;',
      'display:flex;align-items:center;justify-content:center;cursor:pointer;',
      'background:rgba(10,10,12,.72);color:#fff;font-size:.82rem;line-height:1;padding:0;',
      '-webkit-backdrop-filter:blur(6px);backdrop-filter:blur(6px)}',
      '.da-livepop__x:hover{background:rgba(10,10,12,.95)}',

      /* These children are spans (the card is an <a>, so it may not
         contain <div>). display:block is load-bearing, not tidiness: on
         an inline box the horizontal padding never lays the block
         children in, the vertical margins are dropped, and ellipsis
         does not apply. Measured flush to the card edge without it. */
      '.da-livepop__body{display:block;padding:12px 14px 13px}',
      '.da-livepop__motion{display:-webkit-box;margin:0;font-size:.92rem;font-weight:800;line-height:1.3;',
      'color:var(--text,#fff);-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}',
      '.da-livepop__who{display:block;margin:5px 0 0;font-size:.74rem;color:var(--text-dim,#9aa);',
      'white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
      '.da-livepop__cta{margin-top:10px;display:flex;align-items:center;justify-content:space-between;gap:8px}',
      /* Pinned #dc2626 rather than var(--accent): on the crimson and grey
         themes --accent is #ef4444, and white on it measures 3.76:1 at
         this size and weight, under AA (the 3:1 large-text allowance
         needs 18.66px bold). Same measurement and same fix as the /spar
         sign-in gate's email button. #dc2626 is 4.83:1. */
      '.da-livepop__go{display:inline-flex;align-items:center;gap:6px;height:32px;padding:0 14px;border-radius:999px;',
      'background:#dc2626;color:#fff;font-size:.78rem;font-weight:800}',
      '.da-livepop__meta{font-size:.64rem;font-weight:700;letter-spacing:.08em;color:var(--text-ghost,#8a8a95)}',

      /* Light themes: the card is a surface, not a hole. */
      '[data-theme="light"] .da-livepop,[data-lighting="light"] .da-livepop,body.light-theme .da-livepop{',
      'box-shadow:0 18px 46px rgba(0,0,0,.16),0 0 0 1px rgba(239,68,68,.1)}',

      '@media(max-width:560px){.da-livepop{left:12px;right:12px;width:auto;',
      'bottom:calc(12px + env(safe-area-inset-bottom,0px))}}',
      '@media(prefers-reduced-motion:reduce){.da-livepop{transition:opacity .2s ease}',
      '.da-livepop.in{transform:none}.da-livepop__dot{animation:none}}'
    ].join('');
    document.head.appendChild(st);
  }

  /* Other things that park at the bottom of the screen. This site has
     several (the experience chooser, the signup pill, the landing's
     live-pull card, the home magnet), and they are all someone else's
     ask. Two rules, split by size:

       - A CARD (tall) gets right of way. We defer and try on a later
         poll rather than stacking, because on a phone both are full
         width and stacking either buries one or pushes ours off the
         screen. Measured: the experience chooser painted straight
         through the middle of this card at 375px.
       - A PILL (short) we stack above, since it is a live control and
         covering it would trade one nudge for another.

     Both checks run at every width. */
  var CORNER_SELECTORS = ['#daExpAsk', '.signup-pill', '.ditHP-card', '.lpull'];
  var CARD_MIN_H = 120;

  function cornerBoxes() {
    var found = [];
    for (var i = 0; i < CORNER_SELECTORS.length; i++) {
      var el = document.querySelector(CORNER_SELECTORS[i]);
      if (!el) continue;
      var r;
      try { r = el.getBoundingClientRect(); } catch (e) { continue; }
      if (!r || !r.height || !r.width) continue;
      if (r.bottom < 0 || r.top > window.innerHeight) continue;
      if (r.bottom < window.innerHeight - 220) continue;
      found.push(r);
    }
    return found;
  }
  function cornerBusy() {
    var boxes = cornerBoxes();
    for (var i = 0; i < boxes.length; i++) if (boxes[i].height >= CARD_MIN_H) return true;
    return false;
  }
  function bottomOffset() {
    var base = 18, boxes = cornerBoxes();
    for (var i = 0; i < boxes.length; i++) {
      var r = boxes[i];
      if (r.height >= CARD_MIN_H) continue;
      if (r.right < window.innerWidth - 420) continue;
      base = Math.max(base, (window.innerHeight - r.top) + 12);
    }
    return base;
  }

  /* ── sources ────────────────────────────────────────────────────
     Each returns a normalized item or null. Tried in priority order:
     a round happening now beats a person waiting, which beats a round
     that already finished. */

  function liveItem() {
    return getJSON('/api/watch-live').then(function (j) {
      var list = (j && j.rounds) || [];
      var pick = null;
      for (var i = 0; i < list.length; i++) {
        var r = list[i];
        if (!r || !r.room) continue;
        if (!unseen('live:' + r.room) || inUrl(r.room)) continue;
        if (r.shot) { pick = r; break; }   // a real frame is the better card
        if (!pick) pick = r;
      }
      if (!pick) return null;
      return {
        kind: 'live',
        key: 'live:' + pick.room,
        badge: 'LIVE NOW',
        headline: pick.motion || 'A debate is running',
        who: (pick.proName || 'Debater') + ' vs ' + (pick.conName || 'Debater'),
        // watch-live announces a room from the moment both debaters are
        // seated (2026-08-27), which is before the clock starts, so the
        // meta line reads off `started` rather than asserting a speech.
        meta: pick.status === 'ballot' ? 'JUDGING'
          : (pick.started === false ? 'STARTING' : 'IN PROGRESS'),
        cta: 'Watch this round',
        href: '/live-round?room=' + encodeURIComponent(pick.room) + '&spectate=1',
        // Versioned by the shot timestamp: a new still is a new URL,
        // which is what lets room-shot cache the bytes for a minute.
        img: pick.shot
          ? '/api/room-shot?room=' + encodeURIComponent(pick.room) + '&v=' + encodeURIComponent(pick.shot)
          : null,
        initials: [initial(pick.proName), initial(pick.conName)]
      };
    });
  }

  /* Who is holding this browser. /api/live-now is shared-cached across
     every caller, so it cannot personalise its payload, and its header
     says so: self-filtering is the client's job. This card had no auth
     access whatsoever, so it did the one thing the queue must never do
     and offered a user their own open seat as an opponent to debate.
     DASparLive is the authority (it owns the queue doc and rides nearly
     every page); firebase is the fallback for a page that loads this
     card before the matcher. Read-only in both cases: nothing here may
     trigger an SDK load just to render a suggestion. */
  function selfUid() {
    try {
      if (window.DASparLive && window.DASparLive.uid) {
        var u = window.DASparLive.uid();
        if (u) return String(u);
      }
    } catch (e) {}
    try {
      var fb = window.firebase;
      if (fb && fb.apps && fb.apps.length && typeof fb.auth === 'function') {
        var cu = fb.auth().currentUser;
        if (cu && cu.uid) return String(cu.uid);
      }
    } catch (e) {}
    return '';
  }

  function waitingItem() {
    return getJSON('/api/live-now').then(function (j) {
      var all = (j && j.debaters) || [];
      var me = selfUid();
      // Drop yourself before anything counts you: the pick, the "and N
      // others" line, and the decision to show the card at all. Being the
      // only person in the queue must read as nobody waiting, not as one
      // stranger who happens to share your name.
      var list = [];
      for (var k = 0; k < all.length; k++) {
        if (all[k] && all[k].uid && (!me || String(all[k].uid) !== me)) list.push(all[k]);
      }
      if (!list.length) return null;
      var pick = null;
      for (var i = 0; i < list.length; i++) {
        if (unseen('wait:' + list[i].uid)) { pick = list[i]; break; }
      }
      if (!pick) return null;
      var name = pick.name || 'Someone';
      var more = list.length - 1;
      return {
        kind: 'wait',
        key: 'wait:' + pick.uid,
        badge: 'WAITING NOW',
        headline: name + ' is looking for a round',
        who: more > 0 ? ('and ' + more + ' other' + (more > 1 ? 's' : '') + ' in the queue') : 'No opponent yet',
        meta: 'OPEN SEAT',
        cta: 'Debate them',
        href: '/spar',
        img: null,
        initials: [initial(name), '?']
      };
    });
  }

  // The replay list changes rarely, so it is fetched once per page and
  // reused across polls rather than re-read every two minutes.
  var replayCache = null;
  function waitReplays() {
    if (replayCache) return Promise.resolve(replayCache);
    return getJSON('/api/recordings').then(function (j) {
      replayCache = (j && j.recordings) || [];
      return replayCache;
    });
  }
  function replayItem() {
    return waitReplays().then(function (list) {
      var fresh = [];
      for (var i = 0; i < list.length; i++) {
        var r = list[i];
        if (!r || !r.id || r.teaser === true) continue;
        if (!unseen('replay:' + r.id)) continue;
        // startTs is seconds. A months-old round is not news.
        if (r.startTs && (now() - r.startTs * 1000) > REPLAY_MAX_AGE_MS) continue;
        fresh.push(r);
      }
      if (!fresh.length) return null;
      // Rotate rather than always offering the newest, so a returning
      // visitor is not shown the same round every session.
      var pick = fresh[Math.floor(Math.random() * fresh.length)];
      return {
        kind: 'replay',
        key: 'replay:' + pick.id,
        badge: 'REPLAY',
        headline: pick.motion || pick.title || 'A finished round',
        who: (pick.proName || 'Debater') + ' vs ' + (pick.conName || 'Debater'),
        meta: pick.duration ? clock(pick.duration) : 'FINISHED',
        cta: 'Watch the replay',
        href: '/w/' + encodeURIComponent(pick.id),
        img: '/api/recording-thumb?id=' + encodeURIComponent(pick.id) +
             (pick.thumbV ? '&v=' + encodeURIComponent(pick.thumbV) : ''),
        initials: [initial(pick.proName), initial(pick.conName)]
      };
    });
  }

  function inUrl(id) {
    try { return (location.search || '').indexOf(id) >= 0; } catch (e) { return false; }
  }

  /* ── render ─────────────────────────────────────────────────── */
  var shown = false;        // the slow loop fires at most once, ever
  var cardVisible = false;  // is a card on screen RIGHT NOW (never stack)

  function fallbackHtml(item) {
    return '<span class="da-livepop__fallback">' +
      '<span class="da-livepop__ini">' + esc(item.initials[0]) + '</span>' +
      '<span class="da-livepop__vs">VS</span>' +
      '<span class="da-livepop__ini">' + esc(item.initials[1]) + '</span>' +
      '</span>';
  }

  function render(item, opts) {
    opts = opts || {};
    if (cardVisible) return;
    /* The slow loop spends its one card and stops. The fast lane may
       render again later in the visit (a NEW round going live is new
       information), but never on top of a card already up. */
    if (shown && !opts.fast) return;
    shown = true;
    cardVisible = true;
    injectCss();

    var card = document.createElement('a');
    card.className = 'da-livepop da-livepop--' + item.kind + (item.img ? '' : ' da-livepop--nopic');
    card.href = item.href;
    card.setAttribute('role', 'region');
    card.setAttribute('aria-label', item.badge + '. ' + item.headline + '. ' + item.cta + '.');
    var off = bottomOffset();
    // Keep the safe-area inset the stylesheet applies on phones; an
    // inline plain-px bottom would drop it and sit under the home bar.
    if (off > 18) card.style.bottom = 'calc(' + off + 'px + env(safe-area-inset-bottom, 0px))';

    var thumb = item.img
      ? '<img src="' + esc(item.img) + '" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer">'
      : fallbackHtml(item);

    card.innerHTML =
      '<span class="da-livepop__thumb">' + thumb +
        '<span class="da-livepop__badge"><span class="da-livepop__dot"></span>' + esc(item.badge) + '</span>' +
      '</span>' +
      '<span class="da-livepop__body">' +
        '<span class="da-livepop__motion">' + esc(item.headline) + '</span>' +
        '<span class="da-livepop__who">' + esc(item.who) + '</span>' +
        '<span class="da-livepop__cta">' +
          '<span class="da-livepop__go">' + esc(item.cta) + ' &rarr;</span>' +
          '<span class="da-livepop__meta">' + esc(item.meta) + '</span>' +
        '</span>' +
      '</span>' +
      '<button type="button" class="da-livepop__x" aria-label="Not now">&#10005;</button>';

    // A frame that 404s between the list read and the image request
    // (round ended, went private, camera off, thumbnail not built yet)
    // collapses to the tile rather than leaving a broken frame under a
    // badge that says a round is there.
    var img = card.querySelector('img');
    if (img) {
      img.addEventListener('error', function () {
        var holder = card.querySelector('.da-livepop__thumb');
        if (!holder) return;
        img.remove();
        var fb = document.createElement('span');
        fb.className = 'da-livepop__fallback';
        fb.innerHTML = '<span class="da-livepop__ini">' + esc(item.initials[0]) + '</span>' +
          '<span class="da-livepop__vs">VS</span>' +
          '<span class="da-livepop__ini">' + esc(item.initials[1]) + '</span>';
        holder.insertBefore(fb, holder.firstChild);
        card.classList.add('da-livepop--nopic');
      });
    }

    var life = null;
    function close(reason) {
      if (life) { clearTimeout(life); life = null; }
      cardVisible = false;
      card.classList.remove('in');
      setTimeout(function () { if (card.parentNode) card.remove(); }, 340);
      if (reason === 'dismiss') write(localStorage, SNOOZE_KEY, now());
    }

    card.querySelector('.da-livepop__x').addEventListener('click', function (ev) {
      ev.preventDefault();
      ev.stopPropagation();
      emit('live_popup_dismiss', { kind: item.kind, had_pic: !!item.img });
      close('dismiss');
    });
    card.addEventListener('click', function () {
      emit('live_popup_click', { kind: item.kind, had_pic: !!item.img, page: here, fast: !!opts.fast });
    });

    document.body.appendChild(card);
    // rAF is the clean frame boundary, but it does not fire at all in a
    // backgrounded tab, and a card stuck at opacity:0 with a 30s life
    // would expire without ever being seen. The timeout is the floor.
    var revealed = false;
    function reveal() { if (revealed) return; revealed = true; card.classList.add('in'); }
    requestAnimationFrame(reveal);
    setTimeout(reveal, 60);

    markSeen(item.key);
    write(sessionStorage, LAST_KEY, now());
    write(sessionStorage, COUNT_KEY, readNum(sessionStorage, COUNT_KEY) + 1);
    emit('live_popup_shown', { kind: item.kind, had_pic: !!item.img, page: here, fast: !!opts.fast });

    /* A live round is worth holding the corner for longer than a replay
       nudge: it is happening now and the invitation expires with it. */
    life = setTimeout(function () { close('timeout'); },
      item.kind === 'live' ? LIVE_CARD_LIFE_MS : CARD_LIFE_MS);
  }

  /* ── polling ────────────────────────────────────────────────────
     watch-live and live-now are public, keyless and shared-cached
     server side, and app-check.js names watch-live as a route that must
     never drag the App Check bundle in on load. Sources are tried in
     order and the walk stops at the first hit, so a live round costs
     exactly one request. */
  var rounds = 0;
  var timer = null;

  function pickItem() {
    return liveItem()
      .then(function (it) { return it || waitingItem(); })
      .then(function (it) { return it || replayItem(); })
      .catch(function () { return null; });
  }

  function check() {
    // cornerBusy is checked before the counter so being deferred by
    // someone else's card never spends one of the six cycles.
    if (shown || document.hidden || gated() || cornerBusy()) return schedule();
    if (++rounds > MAX_ROUNDS) return;
    pickItem().then(function (item) {
      if (!item) return schedule();
      if (gated() || cornerBusy()) return schedule();
      render(item);
    });
  }

  function schedule() {
    if (shown || timer || rounds > MAX_ROUNDS) return;
    timer = setTimeout(function () { timer = null; check(); }, POLL_MS);
  }

  if (demo) {
    var fake = {
      kind: 'live', key: 'demo', badge: 'LIVE NOW',
      headline: 'Billionaire tax should not go up',
      who: 'banaandebater vs Yael', meta: 'IN PROGRESS',
      cta: 'Watch this round', href: '/live-round?room=demo&spectate=1',
      img: demoPic ? '/landing-shot-live.jpg' : null,
      initials: ['B', 'Y']
    };
    setTimeout(function () { render(fake); }, 400);
    return;
  }

  if (force) { setTimeout(check, 300); return; }

  /* ── The live fast lane ─────────────────────────────────────────
     One cheap read shortly after arrival, then a once-a-minute watcher
     for the whole visit. liveItem() already refuses rounds this session
     was offered before (unseen), so the watcher can run forever without
     nagging about the same room twice. */
  var liveTimer = null;
  function scheduleLive(ms) {
    if (liveTimer) return;
    liveTimer = setTimeout(function () { liveTimer = null; liveCheck(); }, ms);
  }
  function liveCheck() {
    if (document.hidden) return scheduleLive(LIVE_POLL_MS);
    /* Gated is usually another corner card (the experience chooser
       mounts around the same 2s mark). Retry sooner than the poll: no
       fetch is spent while gated, and the chooser being answered should
       not cost a live round a whole minute of invisibility. */
    if (cardVisible || liveGated()) return scheduleLive(15000);
    liveItem().then(function (it) {
      if (it && !cardVisible && !liveGated()) render(it, { fast: true });
      scheduleLive(LIVE_POLL_MS);
    }).catch(function () { scheduleLive(LIVE_POLL_MS); });
  }
  document.addEventListener('visibilitychange', function () {
    /* Coming back to the tab is the moment to know what is live; waiting
       out the remainder of a 60s timer there costs real seconds of a
       real round. */
    if (!document.hidden && liveTimer) {
      clearTimeout(liveTimer);
      liveTimer = null;
      scheduleLive(1200);
    }
  });
  scheduleLive(LIVE_FIRST_DELAY_MS);

  /* Visible dwell, not wall clock: a tab opened in the background and
     never looked at should not spend a read, and should not have its
     card time out unseen before anyone sees it. In LIVE_ONLY mode the
     slow waiting/replay chain never starts; the fast lane above is the
     whole surface. */
  if (LIVE_ONLY) return;
  var dwell = 0;
  var since = document.hidden ? 0 : now();
  function tick() {
    if (!document.hidden && since) dwell += now() - since;
    since = document.hidden ? 0 : now();
    if (dwell >= FIRST_DELAY_MS) { check(); return; }
    setTimeout(tick, 2000);
  }
  document.addEventListener('visibilitychange', function () {
    if (!document.hidden && !since) since = now();
    else if (document.hidden && since) { dwell += now() - since; since = 0; }
  });
  setTimeout(tick, 2000);
})();
