# Live popup photographic fallback

The fixed room screenshot and randomized face pairs in `app/js/live-popup.js`, removed on 2026-09-06. Aidan asked for “an animated image of ppl debating diff genders sometimes” and an image of the actual room when the debate has started.

The replacement prefers a current room snapshot for every visitor. With no snapshot, it shows a labeled animated illustration. The old fixed screenshot could depict a different topic and people from the advertised room; do not restore that mismatch.

## Original constants, helpers and styles

These are verbatim from `3c80d17c:app/js/live-popup.js`:

```js
  /* Real screenshot of /live-round in the audience view (see header).
     Stands in on the LIVE card when /api/room-shot has no fresh frame. */
  var ROOM_SHOT = '/img/room-shot-live.jpg';

  /* The deck: the landing example-round face bank, mirrored from
     landing.html's FACE_M_REAL / FACE_M_GEN / FACE_W. Keep the three lists
     in step with the landing when a face is added or pulled there. The
     two 'tile' room faces (20, 32) share one backdrop and are left out
     so a pair never shows the same wall behind two different people. */
  var DECK_REAL = [46,47,48,49,51,52,53,54,63,65];
  var DECK_GEN = [2,3,8,10,12,16,17,19,21,22,24,26,28,29,31,33,34,36,40,42,44,
                  7,11,13,15,18,23,25,27,35,37,38,41,56,57,58,59,60,61,62];
  var SEEN_FACES_KEY = 'da-faces-seen';
  var FACE_DIR = '/img/round/faces/';

  function faceId(n) { return 'face' + (n < 10 ? '0' : '') + n; }
  function seenFaces() {
    try { var a = JSON.parse(localStorage.getItem(SEEN_FACES_KEY) || '[]'); return a && a.length ? a : []; }
    catch (e) { return []; }
  }
  function markFacesSeen(ids) {
    try {
      var a = seenFaces();
      for (var i = 0; i < ids.length; i++) if (a.indexOf(ids[i]) < 0) a.push(ids[i]);
      localStorage.setItem(SEEN_FACES_KEY, JSON.stringify(a.slice(-400)));
    } catch (e) {}
  }
  function shuffle(a) {
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1)), t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }
  /* Two deck faces this browser has not been shown, real stills first.
     Once the whole deck has been seen the seen list is reset rather than
     repeating the last pair forever. */
  function deckPair() {
    var seen = seenFaces();
    var fresh = function (n) { return seen.indexOf(faceId(n)) < 0; };
    var real = shuffle(DECK_REAL.filter(fresh)), gen = shuffle(DECK_GEN.filter(fresh));
    var pool = real.concat(gen);
    if (pool.length < 2) {
      try { localStorage.removeItem(SEEN_FACES_KEY); } catch (e) {}
      pool = shuffle(DECK_REAL.slice()).concat(shuffle(DECK_GEN.slice()));
    }
    var pair = [faceId(pool[0]), faceId(pool[1])];
    markFacesSeen(pair);
    return pair;
  }
  function pairHtml(pair) {
    return '<span class="da-livepop__pair">' +
      '<span class="da-livepop__seat"><img src="' + FACE_DIR + esc(pair[0]) + '.jpg" alt="" loading="lazy" decoding="async"><span class="da-livepop__side">For</span></span>' +
      '<span class="da-livepop__seat"><img src="' + FACE_DIR + esc(pair[1]) + '.jpg" alt="" loading="lazy" decoding="async"><span class="da-livepop__side da-livepop__side--con">Against</span></span>' +
    '</span>';
  }

      /* Two equal seats side by side (signed-out visitors). 2:1 so each
         seat is square and neither reads as the small picture-in-picture
         tile of a video call. */
      '.da-livepop--pair .da-livepop__thumb{aspect-ratio:2/1}',
      '.da-livepop__pair{position:absolute;inset:0;display:grid;grid-template-columns:1fr 1fr;gap:3px;background:var(--bg,#0a0a0c)}',
      '.da-livepop__seat{position:relative;display:block;overflow:hidden;background:var(--bg-elev,#101014)}',
      '.da-livepop__seat img{width:100%;height:100%;object-fit:cover;display:block;filter:none;transform:none}',
      '.da-livepop__side{position:absolute;left:7px;bottom:7px;height:18px;padding:0 7px;border-radius:999px;',
      'display:inline-flex;align-items:center;background:rgba(10,10,12,.78);color:#fff;font-size:.56rem;font-weight:900;letter-spacing:.1em;text-transform:uppercase}',
      '.da-livepop__side--con{background:rgba(220,38,38,.86)}',

```

## Restore notes

The image file `/img/room-shot-live.jpg` and face bank remain in the repository. Any future use should be explicitly labeled as an example, separately from a live room card. The old card wiring is in `3c80d17c` (`liveItem`, `render` and the demo block); it branched on Google sign-in, used `item.pair`, and added `da-livepop--pair`. Restoring a photographic example is a product decision. Preserve the current real-room refresh, server presence/privacy checks, and upload timestamp fix.
