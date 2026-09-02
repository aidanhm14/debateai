# Landing: the face wall ("Somebody is always up for a round.")

**Removed 2026-09-01.** Founder, on a screenshot of the band: "get rid of this".

## What it was

`#face-wall` on `app/landing.html`: a full-bleed dark mosaic of 21 webcam
tiles drawn from the shared face bank, with a centred title bar ("The room",
"Somebody is always up for a round.", one line of copy, a red "Find an
opponent" button to `/spar`). A small rotator swapped six of the tiles on a
slow stagger. It was chapter 09 ("People") in the tour TOC and sat between
`#community-band` and `#reviews` inside the gated tour.

Added 2026-07-22 to break the cream run with a dark band of faces. The tiles
were the generated bank (face13 to face44), which the founder has called
"look ai" on other surfaces since (see the 2026-08-22 board decision in
soul.md), so a restore should probably re-cast onto consented stills.

## Where it lived

`app/landing.html`, immediately before the comment that opens `#reviews`,
after `#community-band`.

## What else was touched on removal

- TOC `<li>` for `#face-wall` (num 09, label People) removed; Reviews,
  Choose a path and FAQ renumbered 09, 10, 11.
- `TOUR_NOTES['face-wall']` and `TOUR_GROUP_OF['face-wall']` entries removed.
- `#face-wall` removed from the `.landing-more-ready` hide list, the
  `landing-more-open` cv override list, the containment selector list, the
  `forceRenderAbove` chapters array, and the two anchor scroll-margin lists.
- `window.__faceRotPool` is left in place: the hero rotator still owns it and
  this band was only a consumer.

## The exact markup, CSS and script

```html
<!-- ── Face wall (2026-07-22) ───────────────────────────────────────
     The page front-loaded all its human imagery into the hero and the
     live-humans band, so everything below ~2000px read as text on
     paper. This is a full-bleed dark mosaic of webcam tiles: it breaks
     the cream run with contrast, carries the skin tones and lit rooms
     the middle of the page was missing, and reminds the reader the
     product is people arguing, not a form.

     Tiles are seeded distinct and drawn from the same curated pool the
     hero rotator uses (window.__faceRotPool, minus the same-shoot
     collisions). Rotation is deliberately partial: only a handful of
     tiles ever swap, so the wall breathes without churning.

     2026-07-22: the AI-generated portrait disclosures were dropped per
     the founder, first the one under this mosaic (said twice on one page) and
     then the .livenow-attribution line under the live-humans wall.
     2026-08-19: the leaderboard band's .rb-attr went too, but by removing
     what it disclaimed rather than the sentence. Those rows pair a name
     and a score from leaderboard_entries, so they now render initials and
     no portrait at all. Do not put stand-in faces back on a row that
     carries somebody's result. -->
<section id="face-wall" class="facewall" aria-label="People on Debatable">
  <style>
    /* Every colour-bearing rule is #face-wall scoped on purpose. The page's
       theme blocks carry selectors like [data-theme="light"] h2 / p, which
       out-specify a bare .fw-* class and were repainting this band's type
       near-black on a near-black background. The band is deliberately dark
       under every theme, so it states its own colours and wins outright. */
    #face-wall.facewall{position:relative;background:#141010;overflow:hidden;isolation:isolate}
    #face-wall .fw-mosaic{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:4px;padding:4px}
    #face-wall .fw-tile{position:relative;aspect-ratio:16/9;overflow:hidden;border-radius:4px;background:#241b16}
    #face-wall .fw-tile img{width:100%;height:100%;object-fit:cover;display:block;filter:saturate(.98) brightness(.86);transition:opacity 1s ease}
    /* Vignette: corners sink so the grid bleeds into the band instead of
       ending on a hard rectangle edge. */
    #face-wall .fw-mosaic::after{content:"";position:absolute;inset:0;pointer-events:none;
      background:radial-gradient(125% 86% at 50% 50%,transparent 42%,rgba(20,16,16,.62) 80%,#141010 100%)}
    #face-wall .fw-copy{position:absolute;inset:0;z-index:2;display:flex;flex-direction:column;align-items:center;justify-content:center;
      gap:9px;text-align:center;padding:28px 20px;pointer-events:none}
    /* Cinematic title bar rather than a floating plate: a full-width
       horizontal scrim, opaque through the middle third and feathered top
       and bottom, so the wall stays continuous and the type stays legible
       no matter which faces rotate in behind it. */
    #face-wall .fw-copy::before{content:"";position:absolute;inset:0;z-index:-1;
      background:linear-gradient(180deg,transparent 0%,rgba(13,10,10,.42) 15%,rgba(13,10,10,.86) 41%,
        rgba(13,10,10,.86) 60%,rgba(13,10,10,.42) 85%,transparent 100%)}
    #face-wall .fw-eyebrow{display:inline-flex;align-items:center;gap:7px;font-size:.62rem;font-weight:800;letter-spacing:.19em;
      text-transform:uppercase;color:#f9b4b4}
    #face-wall .fw-eyebrow i{width:6px;height:6px;border-radius:50%;background:#ef4444;box-shadow:0 0 9px rgba(239,68,68,.9)}
    #face-wall .fw-title{font-family:var(--font-display);font-size:clamp(1.55rem,3.5vw,2.6rem);font-weight:700;
      letter-spacing:-.022em;line-height:1.08;margin:0;color:#fffdf7;text-wrap:balance;
      text-shadow:0 2px 18px rgba(0,0,0,.7)}
    #face-wall .fw-sub{margin:0;max-width:520px;font-size:clamp(.86rem,1.15vw,.98rem);line-height:1.5;color:rgba(255,253,247,.82);
      text-shadow:0 1px 12px rgba(0,0,0,.6)}
    #face-wall .fw-cta{pointer-events:auto;margin-top:5px;display:inline-flex;align-items:center;gap:7px;padding:11px 21px;border-radius:999px;
      background:#dc2626;color:#fff;font-size:.85rem;font-weight:800;text-decoration:none;transition:transform .15s,background .15s;
      box-shadow:0 10px 30px rgba(0,0,0,.45)}
    #face-wall .fw-cta:hover{transform:translateY(-1px);background:#ef4444}
    @media(max-width:1080px){#face-wall .fw-mosaic{grid-template-columns:repeat(5,minmax(0,1fr))}#face-wall .fw-tile:nth-child(n+16){display:none}}
    @media(max-width:680px){
      #face-wall .fw-mosaic{grid-template-columns:repeat(3,minmax(0,1fr));gap:3px;padding:3px}
      #face-wall .fw-tile:nth-child(n+13){display:none}
      #face-wall .fw-copy{padding:22px 16px}
      #face-wall .fw-sub{display:none}
    }
    @media(prefers-reduced-motion:reduce){#face-wall .fw-tile img{transition:none}}
  </style>
  <div class="fw-mosaic" aria-hidden="true">
    <span class="fw-tile"><img class="fw-cam" src="/img/round/faces/face13.jpg" alt="" loading="lazy" decoding="async" /></span>
    <span class="fw-tile"><img class="fw-cam" src="/img/round/faces/face25.jpg" alt="" loading="lazy" decoding="async" /></span>
    <span class="fw-tile"><img class="fw-cam" src="/img/round/faces/face17.jpg" alt="" loading="lazy" decoding="async" /></span>
    <span class="fw-tile"><img class="fw-cam" src="/img/round/faces/face36.jpg" alt="" loading="lazy" decoding="async" /></span>
    <span class="fw-tile"><img class="fw-cam" src="/img/round/faces/face22.jpg" alt="" loading="lazy" decoding="async" /></span>
    <span class="fw-tile"><img class="fw-cam" src="/img/round/faces/face41.jpg" alt="" loading="lazy" decoding="async" /></span>
    <span class="fw-tile"><img class="fw-cam" src="/img/round/faces/face28.jpg" alt="" loading="lazy" decoding="async" /></span>
    <span class="fw-tile"><img class="fw-cam" src="/img/round/faces/face30.jpg" alt="" loading="lazy" decoding="async" /></span>
    <span class="fw-tile"><img class="fw-cam" src="/img/round/faces/face18.jpg" alt="" loading="lazy" decoding="async" /></span>
    <span class="fw-tile"><img class="fw-cam" src="/img/round/faces/face43.jpg" alt="" loading="lazy" decoding="async" /></span>
    <span class="fw-tile"><img class="fw-cam" src="/img/round/faces/face26.jpg" alt="" loading="lazy" decoding="async" /></span>
    <span class="fw-tile"><img class="fw-cam" src="/img/round/faces/face33.jpg" alt="" loading="lazy" decoding="async" /></span>
    <span class="fw-tile"><img class="fw-cam" src="/img/round/faces/face15.jpg" alt="" loading="lazy" decoding="async" /></span>
    <span class="fw-tile"><img class="fw-cam" src="/img/round/faces/face38.jpg" alt="" loading="lazy" decoding="async" /></span>
    <span class="fw-tile"><img class="fw-cam" src="/img/round/faces/face23.jpg" alt="" loading="lazy" decoding="async" /></span>
    <span class="fw-tile"><img class="fw-cam" src="/img/round/faces/face42.jpg" alt="" loading="lazy" decoding="async" /></span>
    <span class="fw-tile"><img class="fw-cam" src="/img/round/faces/face29.jpg" alt="" loading="lazy" decoding="async" /></span>
    <span class="fw-tile"><img class="fw-cam" src="/img/round/faces/face34.jpg" alt="" loading="lazy" decoding="async" /></span>
    <span class="fw-tile"><img class="fw-cam" src="/img/round/faces/face27.jpg" alt="" loading="lazy" decoding="async" /></span>
    <span class="fw-tile"><img class="fw-cam" src="/img/round/faces/face44.jpg" alt="" loading="lazy" decoding="async" /></span>
    <span class="fw-tile"><img class="fw-cam" src="/img/round/faces/face31.jpg" alt="" loading="lazy" decoding="async" /></span>
  </div>
  <div class="fw-copy">
    <span class="fw-eyebrow"><i aria-hidden="true"></i>The room</span>
    <h2 class="fw-title">Somebody is always up for a round.</h2>
    <p class="fw-sub" data-plain="Post a topic, pick a side, and get the verdict when the clock runs out.">Post a motion, take a side, and get the judge's decision when the clock runs out.</p>
    <a class="fw-cta" href="/spar" data-cta="face-wall-spar">Find an opponent <span aria-hidden="true">&rarr;</span></a>
  </div>
</section>
<script>
/* Face-wall rotator (2026-07-22). Deliberately partial: with 21 tiles on
   screen, swapping all of them reads as a screensaver. Only ROTATORS of
   them ever change, on a slow stagger, so the wall breathes.
   Runs off its own IntersectionObserver — the hero rotator gates on .hero
   being visible, which is ~7000px away by the time this band is on screen. */
(function(){
  if (typeof window === 'undefined') return;
  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  var wall = document.getElementById('face-wall');
  var POOL = window.__faceRotPool;
  if (!wall || !POOL || !POOL.length) return;
  var cams = Array.prototype.slice.call(wall.querySelectorAll('.fw-cam'));
  if (cams.length < 4) return;
  // Only tiles the mobile breakpoint keeps visible are worth rotating.
  var ROTATORS = 6;
  var movers = cams.slice(0, ROTATORS);
  // Same claim discipline as the hero rotator: a tile mid-swap both still
  // shows its old src and has claimed its next one, so exclude both or two
  // tiles can land on the same face.
  function claimed(){
    var s = [];
    cams.forEach(function(c){ s.push(c.getAttribute('src')); if (c.__t) s.push(c.__t); });
    return s;
  }
  function pick(){
    var cur = claimed(), p, n = 0;
    do { p = POOL[Math.floor(Math.random()*POOL.length)]; n++; } while (cur.indexOf(p) >= 0 && n < 40);
    return cur.indexOf(p) >= 0 ? null : p;
  }
  function swap(c){
    var nx = pick();
    if (!nx) return;                     // wall is saturated; skip this beat
    c.__t = nx;
    var pre = new Image();
    pre.onload = function(){
      c.style.opacity = '0';
      setTimeout(function(){ c.src = nx; c.__t = null; c.style.opacity = ''; }, 520);
    };
    pre.onerror = function(){ c.__t = null; };
    pre.src = nx;
  }
  // Same shape as the hero rotator above: timers are always scheduled and
  // `live` only gates whether a tick actually swaps. Starting from the
  // observer instead would mean no rotation at all anywhere the callback
  // never fires, so the timers own the loop and the observer just mutes it.
  var live = true, started = false;
  function start(){
    if (started) return;
    started = true;
    movers.forEach(function(c, idx){
      setTimeout(function(){
        setInterval(function(){ if (live && !document.hidden) swap(c); }, 16000 + idx * 1400);
      }, idx * 1500 + 2200);
    });
  }
  if ('IntersectionObserver' in window){
    new IntersectionObserver(function(es){
      live = es.some(function(e){ return e.isIntersecting; });
    }, { rootMargin: '200px 0px' }).observe(wall);
  }
  start();
})();
</script>
```

## How to put it back

Paste the block above before the `#reviews` section comment, re-add the TOC
row (renumber Reviews, Choose a path and FAQ back to 10, 11, 12), and re-add
`'face-wall'` to the six lists named above. The `#face-wall` full-bleed
opt-out comment near the `.landing-more-shell` width rule still describes the
band and was left in place.
