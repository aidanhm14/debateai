
/* Circulating webcam faces (2026-06-14): every ~8s each .rot-cam swaps
   to another face from the pool with a crossfade, so the hero seats and
   the live-debates wall read as a live, rotating room. Staggered so the
   tiles don't all flip at once. Pauses off-screen + reduced-motion. */
(function(){
  if (typeof window === 'undefined') return;
  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  var POOL = [];
  // SAME-SHOOT collisions — faces that share a room or composition with
  // another tile. Two webcam tiles drawn from the same shoot read as AI-
  // clone instantly (same poster wall, same window, same desk). For each
  // documented same-shoot cluster we keep ONE face and drop the rest.
  // Extend this set when a new collision is spotted.
  //   - 9/35/40 look AI-generated (smooth poreless skin, stock-photo poses)
  //   - 24 same profile as 40: plain grey wall, neutral expression, over-smooth
  //   - 5/14/39 share the same library background as face19 → keep face19
  //   - 32 same distinctive tile-wall + photo-grid background as face20 → keep face20
  //   - seat-you.jpg + seat-opp.jpg were shot in the same dorm room
  //     (matching poster wall, window, couch) → dropped from the
  //     rotator pool entirely; the hero initial src now uses face02 +
  //     face12 (visibly distinct rooms) instead. seat-you/seat-opp
  //     remain as named assets for other surfaces that explicitly want
  //     a paired "you vs opponent" shot, but they should be retaken
  //     before they're re-introduced into the pool.
  var SKIP = { 5:1, 9:1, 14:1, 24:1, 32:1, 35:1, 39:1, 40:1, 1:1, 4:1, 6:1, 30:1, 43:1, 45:1 }; // 1/4/6/30/43/45 are the library and classroom stills, out since 2026-09-03 (see SCHOOL_FACES above): a frozen room of other people behind a moving speaker reads as a paused video // face09.jpg DELETED 2026-07-22 per the founder (read as AI-generated); 9 stays here so nothing re-adds it
  for (var i=1;i<=45;i++){ if (SKIP[i]) continue; POOL.push('/img/round/faces/face'+(i<10?'0':'')+i+'.jpg'); }
  // 2026-08-22: face56-62 are a second GENERATED batch, supplied by the
  // founder from their own image generator, and they ride at weight 1 with the
  // rest of the generated bank. They are NOT real stills and must never be
  // moved into REAL below: the two tiers are the only thing on this page
  // that records which faces are people and which are rendered, and a
  // generated face at REAL_WEIGHT would advertise itself as a consented
  // person five times more often than a consented person.
  // Why they exist: as of 2026-08-20 the real batch is eight stills, all of
  // them men, so every woman on the board and in this rotation was coming
  // from the 2026-06 generated bank. This batch is nine women; seven survived
  // the cut and are the best-looking generated faces we have.
  // What was cut and why, so nobody re-crops the source hoping for more:
  // the grid was twelve tiles but only nine distinct characters (one woman
  // was rendered four times over). One tile was dropped as a duplicate room
  // of face56 (same bookshelf, window and door, the same tell that dropped
  // seat-you/seat-opp above), and one was dropped because a malformed hand
  // sits at shoulder height beside the face, so no 16:9 head-and-shoulders
  // crop clears it. Every kept tile is cropped to cut the hands: hands are
  // where this generator fails, and face09 was deleted outright in 2026-07
  // for reading as AI-generated, which is the bar these have to clear.
  var GEN2 = [56,57,58,59,60,61,62];
  for (var g=0;g<GEN2.length;g++) POOL.push('/img/round/faces/face'+GEN2[g]+'.jpg');
  // 2026-08-19 per the founder: the consented real webcam stills (face46-49,
  // face51-54) read as an actual person on an actual call in a way the
  // generated bank above never does, so they ride the pool at REAL_WEIGHT
  // copies each and come up more often than any single generated face.
  // With 44 generated entries (37 original + the 7 from 2026-08-22) and 8x5
  // real ones the rotation lands real a little under half the time. That is
  // down from slightly over half before this batch; if the real-first
  // preference matters more than the added variety, raise REAL_WEIGHT to 6
  // rather than trimming the generated bank.
  // face50 is the illustrated Anonymous avatar, not a face. It is cast by
  // hand on the one ROUNDS motion about anonymous accounts and must never
  // enter the rotation, or the wall grows a masked cartoon among webcams.
  var REAL = [46,47,48,49,51,52,53,54,63,65], REAL_WEIGHT = 5; // face55 REMOVED 2026-08-20, face64 REMOVED 2026-09-01, face66 REMOVED 2026-09-02, all per the founder; the files are deleted, do not re-add any of them. 63 and 65 added 2026-08-31 (consented live-round stills).
  for (var w=0;w<REAL_WEIGHT;w++){
    for (var r=0;r<REAL.length;r++) POOL.push('/img/round/faces/face'+REAL[r]+'.jpg');
  }
  // Shared so other surfaces (the #face-wall mosaic) rotate through the
  // same curated set instead of re-deriving the SKIP list. Set before the
  // no-tiles bail-out below. Still undefined under reduced-motion, which
  // returns earlier; consumers must not rotate in that case anyway.
  window.__faceRotPool = POOL;
  var cams = Array.prototype.slice.call(document.querySelectorAll('.rot-cam'));
  if (!cams.length) return;
  var live = true, timers = [];
  // A tile during a swap is BOTH still showing its old src (until the
  // ~480ms commit) AND claiming its incoming face (__rotTarget). To
  // guarantee no two tiles ever display the same face, pick() must
  // exclude every visible src AND every in-flight target across all
  // tiles — not just one or the other. (The earlier bug: excluding only
  // committed srcs let a near-simultaneous swap grab a face that was
  // about to appear; excluding only targets let it grab a face still
  // visible on a mid-swap tile.)
  function claimedFaces(){
    var s = [];
    cams.forEach(function(c){ s.push(c.getAttribute('src')); if (c.__rotTarget) s.push(c.__rotTarget); });
    return s;
  }
  function pick(){ var cur = claimedFaces(), p, n=0; do { p = POOL[Math.floor(Math.random()*POOL.length)]; n++; } while (cur.indexOf(p) >= 0 && n < 40); return p; }
  function swap(c){
    var nx = pick(); c.__rotTarget = nx; // claim immediately so siblings exclude it
    var pre = new Image();
    pre.onload = function(){ c.style.opacity = '0'; setTimeout(function(){ c.src = nx; c.__rotTarget = null; c.style.opacity = ''; }, 480); };
    pre.onerror = function(){ c.__rotTarget = null; }; // release the claim if the image fails
    pre.src = nx;
  }
  cams.forEach(function(c){ c.style.transition = 'opacity 1s ease'; });
  function start(){
    if (timers.length) return;
    cams.forEach(function(c, idx){
      var t = setTimeout(function(){
        if (live && !document.hidden) swap(c);
        timers.push(setInterval(function(){ if (live && !document.hidden) swap(c); }, 23000));
      }, idx * 1300 + 5000);
      timers.push(t);
    });
  }
  if ('IntersectionObserver' in window){
    new IntersectionObserver(function(es){
      live = es.some(function(e){ return e.isIntersecting; });
    }, { rootMargin: '160px 0px' }).observe(document.querySelector('.hero') || cams[0]);
  }
  start();
})();
