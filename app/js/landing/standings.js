
/* Ranked band data: one fetch, shared with the first-screen rail when it
   already ran. The landing board renders only real rows. Loading, empty,
   and unavailable states say exactly what they are. */
(function(){
  /* Define the helpers before checking the band. The first-screen rail
     also uses them, so it must keep working in debug views where the band
     is absent. */
  var band = document.getElementById('ranked-band');
  function esc(s){
    return String(s == null ? '' : s).replace(/[&<>"']/g, function(ch){
      return { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[ch];
    });
  }
  function fmtScore(n){
    if (typeof n !== 'number') return '';
    // Public judging is one 1-100 scale. Current leaderboard rows are
    // already migrated; convert a stray legacy 25-30 record instead of
    // exposing the retired scale on a current surface.
    if (n > 30) return String(Math.round(n));
    return String(Math.round(Math.max(1, Math.min(100, 50 + (n - 25) * 10))));
  }
  function initials(name){
    var parts = String(name || '').trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return '?';
    var s = parts[0].charAt(0) + (parts.length > 1 ? parts[parts.length - 1].charAt(0) : '');
    return s.replace(/[^A-Za-z]/g, '').toUpperCase() || '?';
  }
  /* Generated "marble" avatar, ported from /leaderboard so a debater wears
     the same face on both surfaces. Deterministic off the name hash, so the
     avatar is stable across sessions. Deliberately NOT a stock photo: these
     rows carry real account names, and pasting a stranger's face onto one
     would be a lie. Initials ride on top so the row still reads as a person.
     Palette matches leaderboard.html (a rainbow was tried and rejected
     2026-07-19 for fighting the red-on-warm-paper system). */
  function hashStr(s){
    var h = 2166136261 >>> 0;
    s = String(s);
    for (var i = 0; i < s.length; i++){ h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
    return h >>> 0;
  }
  /* ── Row portraits ────────────────────────────────────────────────
     These rows pair a real name with a real score, so the standing rule
     (see the note above #face-wall) is that a portrait must BE the
     debater or not be there at all. That killed the stock-face version
     and its disclaimer footnote, and left a column of grey letters.

     The way out is not a better stand-in, it is asking what the debater
     themselves chose. Four tiers, tightest claim first:

       1. photoURL      their own Google picture. A real face, theirs.
       2. avatarIdentity the avatar they built in the designer. Also theirs.
       3. named row     no portrait of any kind, so a generated EMBLEM:
                        a seeded backdrop, orbital geometry and their
                        monogram. Abstract on purpose. A procedural
                        FACE would assign a stranger a skin tone and a
                        hairline, which is the same invented claim in
                        friendlier clothes.
       4. Anonymous     a masked emblem. Five of eight rows on the board
                        today are anonymous, and drawing a face for
                        somebody who declined to be named asserts a
                        person who is not there.

     Everything is seeded off the uid (name as fallback), so a debater
     keeps the same emblem across reloads and across surfaces. A portrait
     that reshuffles on refresh reads as broken.

     Zero new page weight for tiers 1, 3 and 4: photos are one <img> and
     emblems are inline SVG. Tier 2 is the only one that needs the avatar
     engine, so /js/avatar.js loads lazily and only when a row on the
     board actually carries an identity to render. */

  /* Backdrop pairs. Deeper and more saturated than /leaderboard's muted
     list, which was tuned for a page of paper and went to mud at 44px.
     Red still leads the set because it is the house colour, but a board
     of eight needs real hue travel or every row reads as the same tile.
     This is not the full-spectrum rainbow rejected 2026-07-19: it is a
     jewel set with a red-family plurality, and it sits on the row's own
     white/dark card rather than directly on the paper. */
  var AVA_INK = [
    ['#e0362c','#7a1410'], ['#f0603a','#8c2a12'], ['#f0912b','#8a4210'],
    ['#d8b33a','#7d5a12'], ['#7fae3c','#2f5417'], ['#2fa88a','#0d4a3f'],
    ['#2f97c4','#0f3f61'], ['#4763cc','#1a2668'], ['#7a55d6','#33196e'],
    ['#c145a6','#5c1550'], ['#e0446e','#75122f'], ['#5c6b86','#232c3d'],
    ['#c9622a','#6b2a0e'], ['#3aa657','#12522a']
  ];
  /* Seven geometry families, so eight rows on one board do not repeat a
     shape. Every stroke is deliberately heavy: the first version drew
     hairlines at 1.1-1.5 and they vanished at 44px, which is the only
     size that matters here. Each family is one <g> the CSS animates. */
  function avaArt(kind, num){
    var rot = num % 360;
    if (kind === 0){ // orbit
      return '<g class="rb-ava-spin" style="animation-duration:' + (24 + num % 14) + 's">'
        + '<ellipse cx="32" cy="32" rx="28" ry="12" fill="none" stroke="rgba(255,255,255,.5)" stroke-width="3" transform="rotate(' + rot + ' 32 32)"/>'
        + '<ellipse cx="32" cy="32" rx="28" ry="12" fill="none" stroke="rgba(255,255,255,.28)" stroke-width="3" transform="rotate(' + (rot + 58) + ' 32 32)"/>'
        + '<circle cx="60" cy="32" r="4" fill="#fff" transform="rotate(' + rot + ' 32 32)"/></g>';
    }
    if (kind === 1){ // burst
      var w = '';
      for (var i = 0; i < 6; i++){
        w += '<path d="M32 32 L32 -12 A44 44 0 0 1 60 4 Z" fill="rgba(255,255,255,' + (i % 2 ? '.14' : '.3') + ')" transform="rotate(' + (rot + i * 60) + ' 32 32)"/>';
      }
      return '<g class="rb-ava-spin" style="animation-duration:' + (34 + num % 16) + 's">' + w + '</g>';
    }
    if (kind === 2){ // bands
      return '<g class="rb-ava-drift" style="animation-duration:' + (16 + num % 10) + 's">'
        + '<path d="M-24 64 L20 -8 L36 -8 L-8 64Z" fill="rgba(255,255,255,.32)"/>'
        + '<path d="M8 72 L52 0 L62 0 L18 72Z" fill="rgba(255,255,255,.18)"/>'
        + '<path d="M40 72 L84 0 L92 0 L50 72Z" fill="rgba(0,0,0,.2)"/></g>';
    }
    if (kind === 3){ // arc stack
      return '<g class="rb-ava-breathe" style="animation-duration:' + (8 + num % 5) + 's" transform="rotate(' + (rot % 90) + ' 32 32)">'
        + '<circle cx="32" cy="32" r="26" fill="none" stroke="rgba(255,255,255,.42)" stroke-width="4" stroke-dasharray="52 200"/>'
        + '<circle cx="32" cy="32" r="18" fill="none" stroke="rgba(255,255,255,.3)" stroke-width="4" stroke-dasharray="38 200" stroke-dashoffset="20"/>'
        + '<circle cx="32" cy="32" r="8" fill="rgba(255,255,255,.34)"/></g>';
    }
    if (kind === 4){ // prism
      return '<g class="rb-ava-breathe" style="animation-duration:' + (10 + num % 6) + 's">'
        + '<path d="M32 2 L64 58 L0 58Z" fill="rgba(255,255,255,.26)"/>'
        + '<path d="M32 20 L50 54 L14 54Z" fill="rgba(0,0,0,.22)"/></g>';
    }
    if (kind === 5){ // lattice
      var d = '';
      for (var r = 0; r < 3; r++){
        for (var c = 0; c < 3; c++){
          d += '<circle cx="' + (12 + c * 20) + '" cy="' + (12 + r * 20) + '" r="' + (2 + ((num >> (r * 3 + c)) % 4))
            + '" fill="rgba(255,255,255,' + (0.22 + ((r + c) % 3) * 0.16) + ')"/>';
        }
      }
      return '<g class="rb-ava-breathe" style="animation-duration:' + (7 + num % 6) + 's">' + d + '</g>';
    }
    // 6: horizon
    return '<g class="rb-ava-drift" style="animation-duration:' + (20 + num % 9) + 's">'
      + '<circle cx="32" cy="' + (26 + num % 10) + '" r="' + (14 + num % 7) + '" fill="rgba(255,255,255,.3)"/>'
      + '<path d="M-8 46 Q32 ' + (32 + num % 14) + ' 72 46 L72 72 L-8 72Z" fill="rgba(0,0,0,.28)"/></g>';
  }
  /* seed drives backdrop + geometry, label drives the monogram. `masked`
     drops the monogram for an incognito figure. It deliberately does NOT
     flatten the backdrop: five of eight rows on the board today are
     anonymous, and one shared grey tile repeated five times is a worse
     board than the initials this replaced. Each anonymous debater keeps
     their own colour and shape and is individually recognisable; the
     figure is what says "not named". */
  function avaEmblem(seed, label, masked, used){
    // 14 inks x 7 shapes is 98 combinations, which still collides across
    // eight rows often enough to matter: two identical tiles on one board
    // reads as a bug, and it is the same collision the retired face
    // rotator had to probe around. Salt the seed until the pair is free.
    // Board order is stable, so the result is stable too.
    var num = hashStr(String(seed || 'anon'));
    if (used){
      for (var salt = 0; salt < 24; salt++){
        var key = (num % AVA_INK.length) + ':' + (num % 7);
        if (!used[key]){ used[key] = 1; break; }
        num = hashStr(String(seed || 'anon') + '#' + salt);
      }
    }
    var id = 'rb' + num.toString(36);
    var pair = AVA_INK[num % AVA_INK.length];
    var ini = masked ? '' : initials(label != null ? label : seed);
    return '<svg class="rb-ava-art" viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" preserveAspectRatio="xMidYMid slice">'
      + '<defs><linearGradient id="g' + id + '" x1="0" y1="0" x2="1" y2="1">'
      + '<stop offset="0" stop-color="' + pair[0] + '"/><stop offset="1" stop-color="' + pair[1] + '"/></linearGradient>'
      + '<radialGradient id="s' + id + '" cx="50%" cy="50%" r="50%">'
      + '<stop offset="0" stop-color="rgba(0,0,0,.45)"/><stop offset="1" stop-color="rgba(0,0,0,0)"/></radialGradient></defs>'
      + '<rect width="64" height="64" fill="url(#g' + id + ')"/>'
      + avaArt(num % 7, num)
      // Scrim under the monogram only. Without it a letter can land on a
      // white ring or a bright wedge and disappear.
      + (masked ? '' : '<circle cx="32" cy="32" r="22" fill="url(#s' + id + ')"/>')
      + (ini
          ? '<text x="32" y="33" text-anchor="middle" dominant-baseline="central" fill="#fff"'
            + ' font-family="Archivo,system-ui,sans-serif" font-size="25" font-weight="900" letter-spacing="-.5"'
            + ' style="paint-order:stroke" stroke="rgba(0,0,0,.35)" stroke-width="1.4">' + esc(ini) + '</text>'
          : '')
      + (masked
          ? '<g opacity=".8"><circle cx="32" cy="27" r="7.2" fill="#fff"/>'
            + '<path d="M18 54c0-8 6.4-12.6 14-12.6S46 46 46 54z" fill="#fff"/>'
            + '<rect x="23.4" y="24.2" width="17.2" height="5" rx="2.5" fill="rgba(16,14,18,.92)"/></g>'
          : '')
      + '</svg>';
  }
  /* True when the row is a person who declined to be named. The API
     passes the stored displayName through untouched, and both the
     literal "Anonymous" and the "A debater" write-time fallback mean the
     same thing here. */
  function avaAnon(name){
    var t = String(name || '').trim();
    return !t || /^anonymous$/i.test(t) || /^a debater$/i.test(t) || /^guest$/i.test(t);
  }
  /* ── The profile-picture set ───────────────────────────────────────
     Moved to /js/pfp-set.js on 2026-08-24, when the founder asked for the set to
     be pickable ("those should be options yea") and for more of it ("i
     want more variety too"). It had been inlined here for the zero-request
     reason; it is now a shared module because the avatar designer, the
     profile and every surface that renders somebody's identity need the
     same 49 tiles, and a second copy would drift the moment one was added.
     ~9KB, deferred, and this page is the only one that loads it eagerly.

     Two tiers live in there. The first-screen rail and the full landing
     leaderboard draw the PHOTO tier (2026-08-29, the founder, on seeing
     abstract letter tiles beside the names: "use these"). The drawn set
     remains what the picker offers. See the header of pfp-set.js. */
  function pfpArt(seed, taken){
    var lib = global_DBPfp();
    if (!lib) return '';
    /* Photos first, and pickSvg only for a cached older library that has
       no photo tier, so a stale script costs register rather than tiles. */
    if (lib.pickPhotoSvg) return lib.pickPhotoSvg(seed, taken);
    return lib.pickSvg ? lib.pickSvg(seed, taken) : '';
  }
  function global_DBPfp(){ return window.DBPfp; }

  var avaWantsEngine = false;
  function avaCell(r, i, used, taken){
    var masked = avaAnon(r && r.name);
    var seed = (r && r.uid) || (r && r.name) || ('row' + i);
    /* 2026-08-29: the founder supplied the photo set shown in the rail and
       explicitly asked for those pictures on this full board too. They are
       stable per row and de-duplicated across the visible eight. The two
       truer tiers below are unchanged and still outrank the stand-in. */
    var emblem = pfpArt(seed, taken) || avaEmblem(seed, r && r.name, masked, used);
    var cls = 'rb-ava' + (masked ? ' rb-ava--anon' : '')
      + (i === 1 ? ' rb-ava--silver' : i === 2 ? ' rb-ava--bronze' : '');
    // The avatar they built comes FIRST, ahead of the Google picture,
    // which is the order /leaderboard already uses. DBAvatar.getPublicIdentity
    // reads saved storage and returns null when nobody ever opened the
    // designer, so an identity on a row means a deliberate choice made
    // for this product. A googleusercontent photo is whatever their
    // Google account happens to carry. The emblem paints now and the
    // engine swaps in on load, so a slow or blocked script costs texture
    // rather than leaving a hole.
    if (r && r.avatarIdentity){
      avaWantsEngine = true;
      var payload;
      try { payload = JSON.stringify(r.avatarIdentity); } catch (e) { payload = ''; }
      if (payload){
        return '<span class="' + cls + '" data-rb-identity="' + esc(payload) + '"'
          + ' data-rb-uid="' + esc(seed) + '">' + emblem + '</span>';
      }
    }
    // Their own photo. onerror is load-bearing: googleusercontent URLs go
    // stale when an account changes its picture, and without the swap a
    // dead one leaves an empty box on the top row of the board.
    if (r && r.photoURL){
      return '<span class="' + cls + ' rb-ava--photo"><img src="' + esc(r.photoURL) + '" alt="" loading="lazy" decoding="async"'
        + ' referrerpolicy="no-referrer" onerror="this.parentNode.removeChild(this)">'
        + emblem + '</span>';
    }
    return '<span class="' + cls + '">' + emblem + '</span>';
  }
  /* Load the avatar engine only when a row on the board actually carries
     a built identity to render. It is ~27KB gzipped and this is the
     highest-traffic page on the site, so it must not ride along for a
     board of monograms. */
  function avaUpgrade(host){
    var cells = host.querySelectorAll('[data-rb-identity]');
    if (!cells.length) return;
    function paint(){
      if (!window.DBAvatar || !DBAvatar.publicSvg) return;
      Array.prototype.forEach.call(cells, function(cell){
        var id;
        try { id = JSON.parse(cell.getAttribute('data-rb-identity')); } catch (e) { return; }
        var markup;
        try { markup = DBAvatar.publicSvg(id, '100%', { uid: cell.getAttribute('data-rb-uid') }); } catch (e) { return; }
        if (markup) cell.innerHTML = markup;
      });
    }
    if (window.DBAvatar) { paint(); return; }
    if (document.querySelector('script[data-rb-avatar]')) {
      document.addEventListener('dbav-ready', paint, { once: true });
      return;
    }
    var tag = document.createElement('script');
    tag.src = '/js/avatar.js';
    tag.defer = true;
    tag.setAttribute('data-rb-avatar', '1');
    tag.onload = function(){ paint(); try { document.dispatchEvent(new Event('dbav-ready')); } catch (e) {} };
    document.head.appendChild(tag);
  }
  // Every row gets a portrait from the shared 42-face bank, picked by a
  // stable hash of the name so a given debater keeps the same face across
  // reloads (a face that reshuffles on refresh reads as broken). These are
  // the same AI-generated portraits the live-humans wall uses, and the
  // board carries the same attribution line the wall does — they stand in
  // for a photo, they are not claimed to BE the debater.
  // Explicit list, not a 1..N counter: the bank on disk has gaps (no
  // face05/09/14/39, plus face43-45 above the old 42 cap), and hashing
  // into a missing file 404'd the img, whose onerror removed it and left
  // a silently blank avatar box on the board.
  // `used` de-duplicates within a single board: with ~40 faces and 8 rows
  // a straight hash collides often enough to matter (Ananya R. and Dhruv
  // M. both landed on face01 in testing), and two identical portraits on
  // one board reads as a bug. Probe forward to the next free slot.
  // Ranked rows show initials, not portraits. The rows pair a name and a
  // score pulled from leaderboard_entries, so a stand-in face beside a real
  // debater's result was a claim we had to disclaim in a footnote. Initials
  // make no claim at all, which is why the footnote could go with it.
  // 2026-08-24: the founder reversed this for the FIRST-SCREEN RAIL only
  // (#lbRail, "use them!"), which takes the bank faces back and carries the
  // footnote again while it is open. This board is unchanged and stays on
  // initials and emblems. Do not read the rail as permission to change it.
  function initialsFor(name){
    var parts = String(name || '').trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return '?';
    var first = parts[0].charAt(0);
    var last = parts.length > 1 ? parts[parts.length - 1].charAt(0) : '';
    return (first + last).toUpperCase().replace(/[\s.,'"\-_()\[\]{}\u2018\u2019\u201C\u201D\u00B4`]/g, '') || '?';
  }

  function renderBoard(rows, total, state){
    var host = document.getElementById('rbBoard');
    if (!host) return;
    if (state === 'loading'){
      host.setAttribute('aria-busy', 'true');
      var loading = '<div class="rb-loading" aria-label="Loading live standings">';
      for (var li = 0; li < 5; li++) loading += '<span class="rb-load-row" aria-hidden="true"><i></i><i></i><i></i><i></i></span>';
      host.innerHTML = loading + '</div>';
      return;
    }
    host.setAttribute('aria-busy', 'false');
    if (!Array.isArray(rows) || !rows.length){
      var unavailable = state === 'error';
      host.innerHTML = '<div class="rb-empty"><b>'
        + (unavailable ? 'The live standings could not load.' : 'The top spot is open.')
        + '</b><span>'
        + (unavailable ? 'The complete leaderboard is still available.' : 'Finish the first rated human round and put your name on the board.')
        + '</span><br><a href="/leaderboard">Open the leaderboard &rarr;</a></div>';
      return;
    }
    // The band is a single full-width card now, so the board carries a
    // deeper cut of the standings than it did in the old 2-up layout.
    var n = Math.min(rows.length, 8);
    var html = '';
    avaWantsEngine = false;
    var avaUsed = {};           // ink+shape pairs already spent on this board
    // The supplied stand-in photos now cover this board as well as the rail.
    // A saved avatar or account photo still replaces the stand-in inside
    // avaCell, and the map keeps all eight fallback pictures distinct.
    var avaTaken = {};
    // Keep all eight places in one compact ladder. The numbered race is
    // easier to scan on both desktop and mobile than a split podium-and-row
    // treatment.
    html += '<div class="rb-board">';
    for (var i = 0; i < n; i++){
      var r = rows[i];
      var isRated = r.kind === 'rating' && typeof r.rating === 'number';
      var medal = i === 1 ? ' rb-rk--silver' : i === 2 ? ' rb-rk--bronze' : '';
      // Challenge deep link: real uid → the /spar DM flow /leaderboard
      // already uses; otherwise challenge mode on the full board.
      var chalHref = r.uid
        ? '/spar?dm=' + encodeURIComponent(r.uid) + '&challenge=1'
        : '/leaderboard?challenge=1';
      html += '<div class="rb-row' + (r.rank === 1 ? ' rb-row--top' : '') + '" data-href="/leaderboard" data-rb="leaderboard-row">'
        + '<span class="rb-rk' + medal + '">' + (r.rank || '·') + '</span>'
        + avaCell(r, i, avaUsed, avaTaken)
        + '<span class="rb-who"><span class="rb-nm">' + esc(r.name) + '</span>' + (r.rank ? '' : '<small>In placement</small>') + '</span>'
        + '<span class="rb-pts"><span class="rb-metric"><span class="rb-metric-value">' + (isRated ? Math.round(r.rating) : fmtScore(r.score)) + '</span><small class="rb-metric-label">' + (isRated ? 'Rating' : 'Round score') + '</small></span>'
        + '<a class="rb-chal-btn" href="' + chalHref + '" data-rb="leaderboard-challenge">Challenge</a>'
        + '</span></div>';
    }
    html += '<a class="rb-row rb-row--ghost" href="/spar" data-rb="leaderboard-ghost">'
      + '<span class="rb-rk">' + (n + 1) + '</span>'
      + '<span class="rb-ava">?</span>'
      + '<span class="rb-who"><span class="rb-nm">Your name here.</span></span>'
      + '<span class="rb-ghost-cta">Run a round &rarr;</span>'
      + '</a></div>'
      ;
    host.innerHTML = html;
    if (avaWantsEngine) avaUpgrade(host);
  }
  /* The first-screen leaderboard rail (#lbRail) consumes the same rows
     and borrows these sanitizers and picture helpers. Both leaderboard
     surfaces now share the founder-supplied stand-in tier. */
  window.__rbAva = { emblem: avaEmblem, anon: avaAnon, upgrade: avaUpgrade, fmtScore: fmtScore, pfp: pfpArt };
  /* Debug views may omit the in-flow board while keeping the rail. */
  if (!band) return;
  var fired = false;
  function boardPicturesReady(){
    if (window.DBPfp) return Promise.resolve();
    return new Promise(function(resolve){
      var done = false;
      function go(){ if (!done){ done = true; resolve(); } }
      var tag = document.querySelector('script[src="/js/pfp-set.js"]');
      if (tag){
        tag.addEventListener('load', go);
        tag.addEventListener('error', go);
      }
      /* A blocked picture module must not block the standings. avaCell
         falls back to the inline abstract emblem after this deadline. */
      setTimeout(go, 3000);
    });
  }
  function loadOnce(){
    if (fired) return; fired = true;
    var received = false;
    function paint(j){
      if (!j || j.error || !Array.isArray(j.rows)) { if (!received) renderBoard([], 0, 'error'); return; }
      received = true;
      boardPicturesReady().then(function(){ renderBoard(j.rows, j.total, 'ready'); });
    }
    if (window.__lbTop && window.__lbTop.subscribe){
      window.__lbTop.subscribe(paint);
      window.__lbTop.start(true);
    } else {
      fetch('/api/leaderboard-top', { cache: 'no-cache' }).then(function(r){ return r.json(); }).then(paint).catch(function(){ paint(null); });
    }
  }
  // Paint an explicit loading skeleton immediately. The board is now in
  // the main landing flow, so unlabeled sample names would flash before
  // the live payload and undermine the exact race this section exposes.
  renderBoard(null, 0, 'loading');
  if ('IntersectionObserver' in window){
    // 1400px of rootMargin is roughly a screen and a half of runway, so
    // the swap to real rows has usually resolved before the band is on
    // screen. Still lazy: visitors who never scroll this far cost no
    // Firestore read, which matters given the 2026-07-22 quota episode.
    var io = new IntersectionObserver(function(entries){
      if (entries.some(function(e){ return e.isIntersecting; })){ loadOnce(); io.disconnect(); }
    }, { rootMargin: '1400px' });
    io.observe(band);
  } else { loadOnce(); }
  band.addEventListener('click', function(e){
    var t = e.target;
    var a = t && t.closest ? t.closest('[data-rb]') : null;
    if (a){ try { gtag('event', 'ranked_band_click', { door: a.getAttribute('data-rb') }); } catch(err){} }
    // Rows are divs so the Challenge link can live inside them. A click
    // on any real anchor (Challenge, ghost row) navigates itself; any
    // other click on a row follows its data-href to /leaderboard.
    if (t && t.closest && t.closest('a')) return;
    var row = t && t.closest ? t.closest('.rb-row[data-href]') : null;
    if (row) location.href = row.getAttribute('data-href');
  });
})();
