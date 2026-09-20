
(function(){
  'use strict';

  var BAND_ID = 'homeLiveBand';
  var POLL_MS = 90000;
  var MAX_TILES = 6;

  // Slugs come off the round doc. Anything unmapped renders its own slug
  // rather than a guess, so a format added later is ugly, not wrong.
  var FORMAT_NAMES = { quick: 'Casual 1v1' };

  var mode = null;        // null | 'wall'
  var tileKey = '';       // so an unchanged room list never touches the DOM

  /* The first screen normally starts underneath the fixed topbar, so it
     carries its own top clearance and a full-viewport minimum height. A
     live band takes over that clearance and occupies real document height.
     Keep its measured height on the shared frame so the first screen can
     use only the viewport that remains instead of opening a second shelf. */
  function syncBandHeight(band){
    if (!band || !band.parentNode) return;
    band.parentNode.style.setProperty('--home-live-band-height', band.offsetHeight + 'px');
  }

  function watchBandHeight(band){
    syncBandHeight(band);
    if (!band || typeof ResizeObserver !== 'function') return;
    band.__heightObserver = new ResizeObserver(function(){
      if (band.isConnected) syncBandHeight(band);
    });
    band.__heightObserver.observe(band);
  }

  function clearBandHeight(band){
    if (band && band.__heightObserver) band.__heightObserver.disconnect();
    var frame = band && band.parentNode;
    if (!frame) frame = document.querySelector('.hero-founder-frame');
    if (frame) frame.style.removeProperty('--home-live-band-height');
  }

  function el(tag, cls, text){
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    // textContent, never innerHTML: motions and display names are typed
    // by users and this renders them on the front page.
    if (text != null) n.textContent = text;
    return n;
  }

  function formatName(slug){
    return FORMAT_NAMES[slug] || (slug || 'Debate');
  }

  function roundStatus(r){
    if (r.status === 'ballot') return 'Being judged';
    // watch-live announces a room once BOTH debaters are seated, which is
    // before anyone presses start (2026-08-27). `started` is the only
    // thing that knows the clock is running; without this the strip would
    // print "Speech 1" over two people still setting up. `=== false` on
    // purpose, so a payload cached from before the field existed keeps
    // the old label rather than reading every round as unstarted.
    if (r.started === false) return 'Getting started';
    var n = (typeof r.speechIdx === 'number' ? r.speechIdx : 0) + 1;
    return 'Speech ' + n;
  }

  function tile(r){
    var a = el('a', 'hlb-tile');
    a.href = '/live-round?room=' + encodeURIComponent(r.room) + '&spectate=1';
    a.setAttribute('data-room', r.room);

    // A still exists only when the round is public AND a debater has a
    // camera on: /api/room-shot refuses anything else, and watch-live
    // only reports one that landed in the last 75 seconds. The timestamp
    // doubles as the cache-buster. No still, no placeholder rectangle —
    // the chip is just text, and nothing pretends to be a picture.
    if (r.shot){
      var img = document.createElement('img');
      img.className = 'hlb-shot';
      img.alt = '';
      img.loading = 'lazy';
      img.src = '/api/room-shot?room=' + encodeURIComponent(r.room) + '&v=' + r.shot;
      img.addEventListener('error', function(){ img.remove(); });
      a.appendChild(img);
    }

    var txt = el('span', 'hlb-tile-txt');
    txt.appendChild(el('span', 'hlb-tile-motion', r.motion || 'Live debate'));

    var bits = [formatName(r.format)];
    var names = [r.proName, r.conName].filter(Boolean);
    if (names.length === 2) bits.push(names[0] + ' vs ' + names[1]);
    bits.push(roundStatus(r));
    txt.appendChild(el('span', 'hlb-tile-meta', bits.join(' · ')));
    a.appendChild(txt);

    a.addEventListener('click', function(){
      try { if (window.gtag) gtag('event', 'home_room_tile_click', { room: r.room, format: r.format || '' }); } catch(e){}
    });
    return a;
  }

  var STYLE =
    // The band is now the first thing in the frame, so it owns the
    // clearance under the fixed topbar that #first-screen used to.
    // Wall mode is a compact rail directly under the fixed topbar. Give
    // it only the clearance the visible chrome actually needs, then add
    // a small breathing gap before the room row. The dismissed beta-strip
    // state used to keep the full 84px offset and left a tall black shelf.
    // Measured 2026-08-26 at 1280px: the band's top sits 27px above the
    // fixed topbar's bottom edge, so only the padding beyond that is
    // visible space. The band begins in flow below the ticker spacer, but
    // the fixed topbar occupies the next 52px. A 65px inset clears it and
    // leaves the same ~13px above the room row as below it.
    '#homeLiveBand{background:#0b0b0d;border-bottom:1px solid rgba(239,68,68,.35);padding:65px 20px 13px}' +
    '#homeLiveBand.hlb-is-wall{padding:65px clamp(14px,3vw,28px) 13px}' +
    // The band's own top already sits below the beta strip, so its
    // clearance only has to cover the fixed topbar. The old 96px override
    // added the strip's height a second time and left 44px of dead black
    // above the row against 13px below it.
    // The band already clears the fixed topbar. Drop the first screen's
    // duplicate 84-120px clearance and, on desktop, subtract the band's
    // measured height so the two pieces still fit in one viewport.
    '#homeLiveBand + .fscreen{align-items:flex-start;padding-top:clamp(28px,4vh,44px)}' +
    '@media(min-width:941px){#homeLiveBand + .fscreen{min-height:calc(100svh - var(--home-live-band-height,0px))}}' +
    // A centered 1080px rail keeps a lone room from huddling against the
    // left edge on wide screens. The room card fills the middle column,
    // so the space between LIVE and Watch belongs to content, not void.
    '#homeLiveBand .hlb-in{max-width:1080px;margin:0 auto}' +
    // The strip head: LIVE pill, the scrollable room row, the watch link.
    // No title line — the chips say what is live, and a sentence above
    // them would double the height to repeat them.
    '#homeLiveBand .hlb-strip{display:grid;grid-template-columns:auto minmax(0,auto) auto;' +
      'justify-content:center;align-items:center;gap:12px;min-width:0}' +
    '#homeLiveBand .hlb-pill{display:inline-flex;align-items:center;gap:7px;background:#b91c1c;color:#fff;font-weight:800;font-size:13px;letter-spacing:.08em;padding:5px 12px;border-radius:999px}' +
    '#homeLiveBand .hlb-strip .hlb-pill{flex:0 0 auto;font-size:11.5px;padding:4px 10px;letter-spacing:.1em}' +
    '#homeLiveBand .hlb-dot{width:8px;height:8px;border-radius:50%;background:#fff;animation:hlbPulse 1.4s infinite}' +
    '#homeLiveBand .hlb-strip .hlb-dot{width:6px;height:6px}' +
    '@keyframes hlbPulse{0%,100%{opacity:1}50%{opacity:.35}}' +
    '#homeLiveBand .hlb-open{margin-left:auto;color:rgba(244,244,242,.7);font-size:14.5px;text-decoration:none;border:1px solid rgba(255,255,255,.15);border-radius:10px;padding:7px 13px}' +
    '#homeLiveBand .hlb-open:hover{color:#fff;border-color:rgba(239,68,68,.5)}' +
    '#homeLiveBand .hlb-strip .hlb-open{display:flex;align-items:center;justify-content:center;align-self:stretch;margin-left:0;' +
      'min-height:46px;font-size:13px;padding:0 16px;border-radius:9px;white-space:nowrap}' +
    // The room row scrolls sideways instead of wrapping: wrapping is
    // what turned this into a block in the first place, and a sixth
    // room should cost a swipe, not another line of the front page.
    // The middle column owns the available width. One room stretches to
    // fill it; two rooms share it; a longer list scrolls. This preserves
    // the compact one-row behavior without marooning the controls at
    // opposite ends of an empty black band.
    '#homeLiveBand .hlb-wall{display:flex;gap:8px;width:auto;min-width:0;overflow-x:auto;overflow-y:hidden;' +
      'scrollbar-width:none;-ms-overflow-style:none;scroll-snap-type:x proximity;padding:1px 0}' +
    '#homeLiveBand .hlb-wall::-webkit-scrollbar{display:none}' +
    // Only fades while there is actually more to the right, so a cut-off
    // chip reads as "keep scrolling" instead of as a broken edge.
    '#homeLiveBand .hlb-wall.hlb-more{-webkit-mask-image:linear-gradient(to right,#000 calc(100% - 34px),transparent);' +
      'mask-image:linear-gradient(to right,#000 calc(100% - 34px),transparent)}' +
    // Chips take their own width and never shrink: a longer list runs past
    // the edge and scrolls, which is the behaviour the mask is drawn for.
    // A lone room gets more room than a chip in a list, but not the whole
    // rail, so the strip stays a row rather than one wide empty rectangle.
    '#homeLiveBand .hlb-wall .hlb-tile{flex:0 0 auto;max-width:min(420px,100%);scroll-snap-align:start}' +
    '#homeLiveBand .hlb-wall .hlb-tile:only-child{max-width:min(620px,100%)}' +
    // A chip: the room's own still when there is one, the motion, and
    // one muted line of format, names, and where the round has got to.
    '#homeLiveBand .hlb-tile{display:flex;align-items:center;gap:9px;padding:5px 11px 5px 5px;min-width:0;' +
      'background:#141417;border:1px solid rgba(255,255,255,.08);border-radius:10px;text-decoration:none;' +
      'transition:border-color .15s ease,background .15s ease}' +
    '#homeLiveBand .hlb-tile:hover{border-color:rgba(239,68,68,.5);background:#18181c}' +
    // The still is the frame the room is already receiving, posted by a
    // debater whose camera is on in a public round. 16:9 so it reads as
    // video, not as an avatar.
    '#homeLiveBand .hlb-shot{width:64px;height:36px;flex:0 0 auto;display:block;object-fit:cover;' +
      'border-radius:6px;background:#000}' +
    '#homeLiveBand .hlb-tile-txt{display:flex;flex-direction:column;gap:1px;min-width:0;padding:3px 0}' +
    '#homeLiveBand .hlb-tile-motion{color:#f4f4f2;font-size:13.5px;font-weight:600;line-height:1.25;' +
      'overflow:hidden;text-overflow:ellipsis;white-space:nowrap}' +
    '#homeLiveBand .hlb-tile-meta{color:rgba(244,244,242,.5);font-size:11px;font-weight:600;line-height:1.3;' +
      'overflow:hidden;text-overflow:ellipsis;white-space:nowrap}' +
    // Phone: the strip stays one row and the chips get narrower rather
    // than taller. The row scrolls, so nothing is hidden.
    '@media(max-width:520px){' +
      '#homeLiveBand{padding-top:59px}' +
      '#homeLiveBand.hlb-is-wall{padding:59px 12px 10px}' +
      '#homeLiveBand .hlb-open{margin-left:auto;padding:6px 11px;font-size:13.5px}' +
      '#homeLiveBand .hlb-strip .hlb-open{padding:5px 9px;font-size:12px}' +
      '#homeLiveBand .hlb-open-rest{display:none}' +
      '#homeLiveBand .hlb-strip{gap:8px}' +
      '#homeLiveBand .hlb-strip .hlb-pill{font-size:10px;padding:4px 8px;gap:5px}' +
      '#homeLiveBand .hlb-wall .hlb-tile{max-width:min(230px,100%)}' +
      '#homeLiveBand .hlb-wall .hlb-tile:only-child{max-width:100%}' +
      '#homeLiveBand .hlb-shot{width:56px;height:32px}' +
      '#homeLiveBand .hlb-rail .hlb-tile:nth-child(n+3){display:none}' +
    '}';

  // The band used to anchor on `section.hero`, and that had quietly
  // stopped meaning the first screen: the page keeps deprecated hero arms
  // in the DOM at display:none, and since the 2026-07-22 A/B call the
  // real first screen is #first-screen. Measured, a stream was injecting
  // roughly 2000px down the page, below every visible section, which is
  // the one place a live band is worth nothing. Anchor on the first child
  // of the frame that actually renders, so this survives the next time
  // the first screen is renamed.
  function anchorNode(){
    var frame = document.querySelector('.hero-founder-frame');
    if (frame){
      for (var i = 0; i < frame.children.length; i++){
        var c = frame.children[i];
        if (c.id === BAND_ID || c.tagName === 'SCRIPT' || c.tagName === 'STYLE') continue;
        if (c.offsetHeight > 0) return c;
      }
    }
    return document.getElementById('first-screen') || document.querySelector('section.hero');
  }

  function markMore(wall){
    if (!wall) return;
    var more = wall.scrollWidth - wall.clientWidth - wall.scrollLeft > 4;
    wall.classList.toggle('hlb-more', more);
  }

  function makeBand(){
    var band = document.createElement('section');
    band.id = BAND_ID;
    var style = document.createElement('style');
    style.textContent = STYLE;
    band.appendChild(style);
    return band;
  }

  // Mounting above the hero shoves everything below it down. If the
  // reader is already past that point their viewport has to be held
  // still, and the same applies in reverse on unmount and on any height
  // change from tiles arriving or leaving.
  function withHeightHeld(node, fn){
    var band = node || document.getElementById(BAND_ID);
    var above = !!band && band.getBoundingClientRect().bottom < 0;
    var before = band ? band.offsetHeight : 0;
    fn();
    if (!above) return;
    var after = 0;
    var now = document.getElementById(BAND_ID);
    if (now) after = now.offsetHeight;
    if (after !== before) window.scrollBy(0, after - before);
  }

  function unmount(){
    if (!mode) return;
    withHeightHeld(null, function(){
      var band = document.getElementById(BAND_ID);
      clearBandHeight(band);
      if (band) band.remove();
    });
    mode = null; tileKey = '';
  }

  // The CTA used to be a fixed link to /watch, which is the REPLAYS page:
  // pressing Watch under a live pill took you to recordings and clips, not
  // to the round the strip was advertising. It now points at what is
  // actually live: the round itself when there is only one, the spectate
  // list when there are several. It is repointed whenever the row
  // changes, since the band outlives any one round.
  // "a round" / "this round" is dropped on a phone, where the row is only
  // ~350px wide and every word the CTA keeps is a word of motion lost.
  function setWatchCta(open, rounds){
    if (!open) return;
    var one = rounds.length === 1 ? rounds[0] : null;
    open.href = one
      ? '/live-round?room=' + encodeURIComponent(one.room) + '&spectate=1'
      : '/spectate';
    open.setAttribute('data-room', one ? one.room : '');
    open.textContent = 'Watch';
    // Non-breaking space: the strip's CTA is a flex container, so a plain
    // leading space in the suffix is trimmed and it renders "Watcha round".
    open.appendChild(el('span', 'hlb-open-rest', one ? ' this round' : ' a round'));
  }

  function mountWall(rounds){
    var at = anchorNode();
    if (!at || !at.parentNode) return;
    var band = makeBand();
    band.className = 'hlb-is-wall';
    band.setAttribute('aria-label', 'Debate rounds happening now');

    var strip = el('div', 'hlb-strip');
    var pill = el('span', 'hlb-pill');
    pill.appendChild(el('span', 'hlb-dot'));
    pill.appendChild(el('span', null, 'LIVE'));
    strip.appendChild(pill);
    var wall = el('div', 'hlb-wall');
    wall.addEventListener('scroll', function(){ markMore(wall); });
    strip.appendChild(wall);
    var open = el('a', 'hlb-open', 'Watch');
    open.addEventListener('click', function(){
      try { if (window.gtag) gtag('event', 'home_live_watch_click', { room: open.getAttribute('data-room') || '' }); } catch(e){}
    });
    strip.appendChild(open);
    setWatchCta(open, rounds);

    var inner = el('div', 'hlb-in');
    inner.appendChild(strip);
    band.appendChild(inner);

    withHeightHeld(null, function(){ at.parentNode.insertBefore(band, at); });
    watchBandHeight(band);
    mode = 'wall'; tileKey = '';
    try { if (window.gtag) gtag('event', 'home_room_wall_shown', { rooms: rounds.length }); } catch(e){}
  }

  // Room lists are repainted only when they actually change, so a poll
  // during a stream never blows away hover or reflows the stage.
  function paintTiles(rounds){
    var band = document.getElementById(BAND_ID);
    if (!band) return;
    // Ahead of the repaint guard: the CTA tracks the room list, so a band
    // that survives a round ending must not keep pointing at it.
    setWatchCta(band.querySelector('.hlb-open'), rounds);
    var key = rounds.map(function(r){ return r.room + ':' + r.status + ':' + r.speechIdx + ':' + (r.shot || 0); }).join('|');
    if (key === tileKey) return;

    withHeightHeld(band, function(){
      var wall = band.querySelector('.hlb-wall');
      if (!wall) return;
      wall.textContent = '';
      rounds.forEach(function(r){ wall.appendChild(tile(r)); });
      markMore(wall);
    });
    tileKey = key;
  }

  function apply(s, rounds){
    rounds = (rounds || []).slice(0, MAX_TILES);

    // The stream itself no longer lives up here. It renders inside the
    // first screen (#fsLive), in the slot the example board holds when
    // nothing is on air, so a visitor sees the live round where they
    // were already looking instead of a second video block above the
    // hero. This poller still owns /api/stream-status so the two never
    // ask the same endpoint twice.
    try { if (window.__fsLive) window.__fsLive.set(s); } catch(e){}

    // What is left of the band is the room strip: a line of rounds
    // running right now, which the stream never replaced anyway.
    if (!rounds.length){ unmount(); return; }
    if (mode !== 'wall'){ unmount(); mountWall(rounds); }
    paintTiles(rounds);
  }

  function check(){
    // One failing endpoint must not blank the other: a dead watch-live
    // should never take a running stream off the page.
    Promise.all([
      fetch('/api/stream-status').then(function(r){ return r.json(); }).catch(function(){ return null; }),
      window.watchLive()
    ]).then(function(out){
      var s = out[0];
      var live = out[1];
      apply(s, live && live.rounds);
    }).catch(function(){});
  }
  check();
  setInterval(function(){ if (!document.hidden) check(); }, POLL_MS);
})();
