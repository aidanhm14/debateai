/* live-popup.js — "a round is happening right now, go watch it."
 *
 * A sitewide corner card that appears when /api/watch-live reports a
 * public round in progress, shows the ACTUAL room, and hands the
 * visitor to /live-round?room=…&spectate=1.
 *
 * Why this exists: a live round is the single most convincing thing on
 * this site and it is invisible from every page except the three that
 * list it (/live, /watch, /spectate). Someone reading /pricing while
 * two strangers argue in a room has no way to know.
 *
 * THE PICTURE IS REAL AND IT IS NOT ALWAYS THERE. The thumbnail is the
 * still /api/room-shot already publishes: a 320x180 frame of the canvas
 * the room is ALREADY receiving, posted every ~25s by a seated debater,
 * served only while the round is public, running and fresh (75s). So a
 * round with cameras off, or one that just ended, has no still and the
 * card falls back to a typographic tile. It NEVER draws a stand-in
 * frame, because a fake room picture on a card that says LIVE is the
 * one failure this surface cannot absorb. This module is the first
 * consumer of that pipeline; watch-live has been attaching `shot` to
 * its payload with nothing reading it.
 *
 * Blur: BLUR_PX below. 0 ships the still as-is (the honest default: it
 * is the same public artifact the live strip is built on, and a 320x180
 * source at ~112px wide is soft already). Set it to 10 for the frosted
 * "something is happening in here" treatment. One constant, both looks.
 *
 * Restraint, because this is unsolicited and sitewide:
 *   - first read only after 15s of VISIBLE dwell, never on load
 *   - polls stop the moment a card shows, and after 6 reads regardless
 *   - hidden tabs never poll
 *   - at most 2 cards per session, 6 minutes apart, never the same room
 *     twice, and dismissing snoozes every page for 4 hours
 *   - excluded outright from round surfaces, the queue, and the pages
 *     that already list live rounds (see SKIP)
 *
 * QA: ?livepop=off disables, ?livepop=now shows immediately with no
 * dwell, snooze or cap. ?livepop=demo renders the no-still card and
 * ?livepop=demopic the picture version against a real 16:9 asset, so
 * both layouts and the blur setting can be judged on any page when
 * nothing happens to be live.
 */
(function () {
  'use strict';

  if (window.__ditLivePopup) return;
  window.__ditLivePopup = 1;

  /* 0 = show the room still as it is. 10 = frost it. */
  var BLUR_PX = 0;

  var FIRST_DELAY_MS = 15000;   // visible dwell before the first read
  var POLL_MS = 120000;
  var MAX_READS = 6;
  var CARD_LIFE_MS = 30000;     // an ignored card leaves rather than squats
  var GAP_MS = 6 * 60 * 1000;   // between two cards in one session
  var MAX_PER_SESSION = 2;
  var SNOOZE_MS = 4 * 60 * 60 * 1000;

  var SNOOZE_KEY = 'da-livepop-snooze';
  var SEEN_KEY = 'da-livepop-seen';     // rooms already offered this session
  var COUNT_KEY = 'da-livepop-count';
  var LAST_KEY = 'da-livepop-last';

  /* Pages where this would interrupt rather than invite. Round surfaces
     and anything that makes its own sound (the visitor is mid-round);
     /spar and /partners (they are queueing for a round of their own and
     pulling them out costs them the match); and the three pages that
     already list live rounds, where a floating duplicate is noise. */
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
  /* demopic previews the picture layout against a real 16:9 asset, so
     the blur setting can be judged on a page even when no round is
     live and no still exists to fetch. demo shows the no-still tile. */
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
  function seenRooms() {
    try { return JSON.parse(sessionStorage.getItem(SEEN_KEY) || '[]') || []; } catch (e) { return []; }
  }
  function markSeen(room) {
    var list = seenRooms();
    if (list.indexOf(room) < 0) list.push(room);
    try { sessionStorage.setItem(SEEN_KEY, JSON.stringify(list.slice(-30))); } catch (e) {}
  }

  function gated() {
    if (force || demo) return false;
    if (now() - readNum(localStorage, SNOOZE_KEY) < SNOOZE_MS) return true;
    if (readNum(sessionStorage, COUNT_KEY) >= MAX_PER_SESSION) return true;
    if (now() - readNum(sessionStorage, LAST_KEY) < GAP_MS) return true;
    return false;
  }

  /* ── styles ─────────────────────────────────────────────────────
     Self-contained and token-driven, so the card follows whichever of
     the five themes the page is in. Every var() carries a dark literal
     fallback for the handful of pages that do not load ui.css. */
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

      /* Typographic fallback when the round has no fresh still. Reads as
         a deliberate tile, never as a broken image. */
      '.da-livepop__fallback{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;gap:10px;',
      'background:radial-gradient(120% 140% at 50% 0,rgba(239,68,68,.18),transparent 70%),var(--bg-elev,#101014)}',
      '.da-livepop__ini{width:42px;height:42px;border-radius:50%;display:flex;align-items:center;justify-content:center;',
      'background:var(--bg-card,#15151a);border:1px solid var(--border,rgba(255,255,255,.14));',
      'color:var(--text,#fff);font-size:.95rem;font-weight:800}',
      '.da-livepop__vs{font-size:.62rem;font-weight:900;letter-spacing:.14em;color:var(--text-dim,#9aa)}',
      /* No still: shrink the picture area rather than holding 16:9 of
         empty tile. The card should not look like it is showing video
         when it is not. */
      '.da-livepop--nopic .da-livepop__thumb{aspect-ratio:16/6}',

      '.da-livepop__badge{position:absolute;top:9px;left:9px;display:inline-flex;align-items:center;gap:6px;',
      'height:22px;padding:0 9px;border-radius:999px;background:rgba(10,10,12,.82);',
      '-webkit-backdrop-filter:blur(6px);backdrop-filter:blur(6px);',
      'color:#fff;font-size:.58rem;font-weight:900;letter-spacing:.13em}',
      '.da-livepop__dot{width:6px;height:6px;border-radius:50%;background:#ef4444;',
      'animation:daLivePopDot 1.7s ease-out infinite}',
      '@keyframes daLivePopDot{0%{box-shadow:0 0 0 0 rgba(239,68,68,.6)}70%{box-shadow:0 0 0 6px rgba(239,68,68,0)}100%{box-shadow:0 0 0 0 rgba(239,68,68,0)}}',

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

      /* Mobile: full-width above the safe area, and short enough that it
         cannot cover a page's own bottom controls. */
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
     ask. Two rules, split by size, because the failure modes differ:

       - A CARD (tall) gets right of way. We defer and try on a later
         poll rather than stacking, because on a phone both are full
         width and stacking either buries one or pushes ours off the
         screen. Measured: the experience chooser painted straight
         through the middle of this card at 375px.
       - A PILL (short) we stack above, since it is a live control and
         covering it would trade one nudge for another.

     Both checks run at every width. The desktop-only version of this
     missed the mobile collision entirely. */
  var CORNER_SELECTORS = ['#daExpAsk', '.signup-pill', '.ditHP-card', '.lpull', '.da-livepop'];
  var CARD_MIN_H = 120;

  function cornerBoxes() {
    var found = [];
    for (var i = 0; i < CORNER_SELECTORS.length; i++) {
      if (CORNER_SELECTORS[i] === '.da-livepop') continue;
      var el = document.querySelector(CORNER_SELECTORS[i]);
      if (!el) continue;
      var r;
      try { r = el.getBoundingClientRect(); } catch (e) { continue; }
      if (!r || !r.height || !r.width) continue;
      // On screen and parked near the bottom.
      if (r.bottom < 0 || r.top > window.innerHeight) continue;
      if (r.bottom < window.innerHeight - 220) continue;
      found.push(r);
    }
    return found;
  }

  function cornerBusy() {
    var boxes = cornerBoxes();
    for (var i = 0; i < boxes.length; i++) {
      if (boxes[i].height >= CARD_MIN_H) return true;
    }
    return false;
  }

  function bottomOffset() {
    var base = 18;
    var boxes = cornerBoxes();
    for (var i = 0; i < boxes.length; i++) {
      var r = boxes[i];
      if (r.height >= CARD_MIN_H) continue;      // handled by cornerBusy
      if (r.right < window.innerWidth - 420) continue;  // not in this corner
      base = Math.max(base, (window.innerHeight - r.top) + 12);
    }
    return base;
  }

  var shown = false;

  function initials(name) {
    var s = String(name || '').trim();
    return s ? s.charAt(0).toUpperCase() : '?';
  }

  function render(r) {
    if (shown) return;
    shown = true;
    injectCss();

    var href = '/live-round?room=' + encodeURIComponent(r.room) + '&spectate=1';
    var card = document.createElement('a');
    card.className = 'da-livepop' + (r.shot ? '' : ' da-livepop--nopic');
    card.href = href;
    card.setAttribute('role', 'region');
    card.setAttribute('aria-label', 'A debate is live now. Watch it.');
    var off = bottomOffset();
    // Keep the safe-area inset the stylesheet applies on phones; an
    // inline plain-px bottom would drop it and sit under the home bar.
    if (off > 18) card.style.bottom = 'calc(' + off + 'px + env(safe-area-inset-bottom, 0px))';

    var pro = r.proName || 'Debater';
    var con = r.conName || 'Debater';
    var thumb;
    if (r.shot) {
      // Versioned by the shot timestamp: a new still is a new URL, which
      // is what lets room-shot cache the bytes for a minute. shotUrl is
      // only ever set by the ?livepop=demopic QA switch.
      var src = r.shotUrl || ('/api/room-shot?room=' + encodeURIComponent(r.room) +
        '&v=' + encodeURIComponent(r.shot));
      thumb = '<img src="' + esc(src) + '" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer">';
    } else {
      thumb = '<span class="da-livepop__fallback">' +
        '<span class="da-livepop__ini">' + esc(initials(pro)) + '</span>' +
        '<span class="da-livepop__vs">VS</span>' +
        '<span class="da-livepop__ini">' + esc(initials(con)) + '</span>' +
        '</span>';
    }

    card.innerHTML =
      '<span class="da-livepop__thumb">' + thumb +
        '<span class="da-livepop__badge"><span class="da-livepop__dot"></span>LIVE NOW</span>' +
      '</span>' +
      '<span class="da-livepop__body">' +
        '<span class="da-livepop__motion">' + esc(r.motion || 'A debate is running') + '</span>' +
        '<span class="da-livepop__who">' + esc(pro) + ' vs ' + esc(con) + '</span>' +
        '<span class="da-livepop__cta">' +
          '<span class="da-livepop__go">Watch this round &rarr;</span>' +
          '<span class="da-livepop__meta">' + (r.status === 'ballot' ? 'JUDGING' : 'IN PROGRESS') + '</span>' +
        '</span>' +
      '</span>' +
      '<button type="button" class="da-livepop__x" aria-label="Not now">&#10005;</button>';

    // A still that 404s between the list read and the image request
    // (round ended, went private, camera off) collapses to the tile
    // rather than leaving a broken frame under a LIVE badge.
    var img = card.querySelector('img');
    if (img) {
      img.addEventListener('error', function () {
        var holder = card.querySelector('.da-livepop__thumb');
        if (!holder) return;
        img.remove();
        var fb = document.createElement('span');
        fb.className = 'da-livepop__fallback';
        fb.innerHTML = '<span class="da-livepop__ini">' + esc(initials(pro)) + '</span>' +
          '<span class="da-livepop__vs">VS</span>' +
          '<span class="da-livepop__ini">' + esc(initials(con)) + '</span>';
        holder.insertBefore(fb, holder.firstChild);
      });
    }

    var life = null;
    function close(reason) {
      if (life) { clearTimeout(life); life = null; }
      card.classList.remove('in');
      setTimeout(function () { if (card.parentNode) card.remove(); }, 340);
      if (reason === 'dismiss') write(localStorage, SNOOZE_KEY, now());
    }

    card.querySelector('.da-livepop__x').addEventListener('click', function (ev) {
      ev.preventDefault();
      ev.stopPropagation();
      emit('live_popup_dismiss', { room: r.room, had_shot: !!r.shot });
      close('dismiss');
    });
    card.addEventListener('click', function () {
      emit('live_popup_click', { room: r.room, had_shot: !!r.shot, status: r.status || '' });
    });

    document.body.appendChild(card);
    // rAF is the clean frame boundary, but it does not fire at all in a
    // backgrounded tab, and a card stuck at opacity:0 with a 30s life
    // would expire without ever being seen. The timeout is the floor.
    var revealed = false;
    function reveal() { if (revealed) return; revealed = true; card.classList.add('in'); }
    requestAnimationFrame(reveal);
    setTimeout(reveal, 60);

    markSeen(r.room);
    write(sessionStorage, LAST_KEY, now());
    write(sessionStorage, COUNT_KEY, readNum(sessionStorage, COUNT_KEY) + 1);
    emit('live_popup_shown', { room: r.room, had_shot: !!r.shot, status: r.status || '', page: here });

    life = setTimeout(function () { close('timeout'); }, CARD_LIFE_MS);
  }

  /* ── polling ────────────────────────────────────────────────────
     /api/watch-live is public, keyless, and shared-cached 12s server
     side, and app-check.js names it as a route that must never drag
     the App Check bundle in on load. Nothing here is metered per user,
     so the restraint is about invocations, not entitlement. */
  var reads = 0;
  var timer = null;

  function inRoom(room) {
    // Someone who arrived from a shared link to this exact round.
    try { return (location.search || '').indexOf(room) >= 0; } catch (e) { return false; }
  }

  function check() {
    // cornerBusy is checked before the read counter so being deferred by
    // someone else's card never spends one of the six.
    if (shown || document.hidden || gated() || cornerBusy()) return schedule();
    if (++reads > MAX_READS) return;
    fetch('/api/watch-live', { cache: 'no-cache' })
      .then(function (res) { return res.ok ? res.json() : null; })
      .then(function (j) {
        var list = (j && j.rounds) || [];
        if (!list.length) return schedule();
        var seen = seenRooms();
        var pick = null;
        for (var i = 0; i < list.length; i++) {
          var r = list[i];
          if (!r || !r.room) continue;
          if (seen.indexOf(r.room) >= 0 || inRoom(r.room)) continue;
          // A round with a live still is the better card, so prefer one.
          if (r.shot) { pick = r; break; }
          if (!pick) pick = r;
        }
        if (!pick) return schedule();
        if (gated() || cornerBusy()) return schedule();
        render(pick);
      })
      .catch(function () { schedule(); });
  }

  function schedule() {
    if (shown || timer || reads > MAX_READS) return;
    timer = setTimeout(function () { timer = null; check(); }, POLL_MS);
  }

  if (demo) {
    var fake = {
      room: 'demo', motion: 'Billionaire tax should not go up',
      proName: 'banaandebater', conName: 'Yael', status: 'round'
    };
    if (demoPic) { fake.shot = 1; fake.shotUrl = '/landing-shot-live.jpg'; }
    setTimeout(function () { render(fake); }, 400);
    return;
  }

  if (force) {
    setTimeout(check, 300);
    return;
  }

  /* Visible dwell, not wall clock: a tab opened in the background and
     never looked at should not spend a read, and should not have its
     card time out unseen before anyone sees it. */
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
