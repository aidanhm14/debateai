
(function(){
  var root = document.getElementById('first-screen');
  if (!root) return;
  if (document.documentElement.getAttribute('data-first-screen') !== 'ticker') return;

  /* Twenty-four example rounds. `drift` is where the room's read on Pro ends up;
     the price walks toward it on a tick while the round runs, so the bar
     is genuinely moving rather than a static number. `won` is the ballot,
     which is deliberately not always where the room landed. That gap is
     the interesting part.
     2026-07-22: was five rounds and ten faces, and it opened on the only
     same-gender pair in the set, so the first thing a visitor saw was two
     men. Expanded again on 2026-08-10 to twelve rounds and twenty-four
     distinct faces, with a broader global mix of names and formats. The
     same-day motion pass doubled the advertised rotation to twenty-four,
     remixing that cast across sharper culture, technology, power and
     everyday-life resolutions. The opener stays a mixed pair.
     2026-08-12: the `face` key came off every entry with the portraits.
     A tile now shows the debater's initial, so a name is the only thing
     a round carries about who argued it. Keep the global mix in the
     names; that is what the cast is for now.
     2026-08-18: the founder reversed course for a supplied batch: face46-49
     and face51-54 are real webcam stills he provided directly, with his confirmation
     on record that everyone shown is 18+ and consented to appearing as
     example-round debaters. face50 is the illustrated Anonymous avatar,
     deliberately cast on the one motion about anonymous accounts and
     nowhere else. The bar from 08-12 still holds for anything NOT in
     this batch: no unlicensed photo of a real person, ever.
     2026-08-19: the founder prefers the real stills to the generated bank, so
     eight rounds that had two generated faces were re-cast with one real
     debater each (Miguel, Elena, Luka, Dev, Timothee, Marcus, Emeka,
     Mateo). Twenty-three of the twenty-four rounds now show at least one
     real person; the exception is the anonymous-accounts motion, which is
     Priya against the illustrated avatar by design. Every re-cast seat
     took its name into the RFD with it, so no ballot names a debater who
     is not in the round. Nobody was dropped from the cast: each replaced
     character still appears in another round. If you want more women on
     the board, the batch is the limit, not the casting.
     2026-08-20 per the founder: face55 was pulled and the file deleted, so Elena
     runs on a generated face (face12) and the real batch is now eight
     stills, ALL of them men. Two consequences worth knowing before the next
     casting pass. The board's women are now entirely generated, and three
     rounds (Kenji vs Elena twice, Arjun vs Elena) dropped to two generated
     faces, so 30 of the 34 rounds still show at least one real person
     rather than all but one. The remaining exception is unchanged and
     deliberate: the anonymous-accounts motion is Priya against the
     illustrated avatar. Recasting Kenji and Arjun onto real stills would
     restore the old property, but that changes two characters nobody asked
     to change, so it is left for a decision rather than done quietly.
     2026-08-22 per the founder, off a screenshot of the board: the generated
     faces "look ai", so the board is now REAL STILLS ONLY. Every seat in
     every round is one of the eight consented webcam people (Marcus,
     Mateo, Luka, Miguel, Timothee, Emeka, Dev, Danylo) plus the
     illustrated Anonymous avatar on the anonymous-accounts motion.
     Motions, winners, numbers and scores are untouched; each recast seat
     took its name into the RFD with it, pronouns included, so no ballot
     names a debater who is not in the round. Known and accepted cost,
     stated on the record: the real batch is all men, so the visible cast
     is all male until more consented stills exist. Do not fix that by
     reintroducing generated faces; fix it with a new consented batch.
     2026-08-24, second pass the same day, per the founder ("bring back the
     guys too, theres a lot of missing images in circulation" plus "the
     motions should be diversified and pertinent to even a more serious
     degree"). Three things moved and one bug died.
     (1) CAST: 24 characters became 56, sized to the face bank exactly so
     every portrait deals every load. See the castFaces note below for why
     the men were the half actually missing.
     (2) MOTIONS: nine slots moved off dating and etiquette onto domains the
     deck had none of, so the board reads as a serious argument surface
     rather than a group chat: global health (drug patents in an emergency),
     healthcare and employment, criminal justice, automation and retraining,
     energy, water as a resource, embryo editing, climate displacement, and
     whether rich countries should pay reparations to countries they colonized. The accessible
     on-ramps from the 08-19 pass are deliberately NOT all gone (tipping,
     drinking age, influencers, athletes and teachers stay), because a deck
     of nothing but institutions is the civics syllabus that pass was
     written against. The 08-19 exclusion still binds: contested is the
     goal, targeted is not, so nothing here gets its charge from putting a
     group's rights up for a vote.
     (3) A LIVE BUG: the "Is it ever okay to date a friend's ex?" card was
     shipping the right-to-be-forgotten ballot. Its motion had been swapped
     at some earlier pass and its rfd was never rewritten, so the card
     printed a verdict about a round it was not describing. That slot is now
     the criminal-justice motion with its own ballot. Worth a habit: an
     rfd is prose and will not fail a build, so a motion edit that leaves
     the ballot behind is invisible until somebody reads the card.
     2026-08-24 (first pass) per the founder ("bring back all the photos we had ... make it
     match the vibe to not give ai"): the mixed cast is RESTORED, which
     SUPERSEDES the 08-22 real-stills-only note above. All 40 rounds are recast
     across 24 characters (the 11 FS_MALE + 13 FS_FEMALE names below), so
     castFaces deals ~24 distinct faces again, real stills first and the
     generated bank behind them. The generated faces were re-reviewed and read
     as real webcam frames (real rooms, natural light, gestures), not AI, which
     is why they are back. Every motion, score and winner is byte-untouched;
     only the two names per round and the verdict pronouns moved. The later
     2026-08-31 quality pass removed the fine grain and colour filter so each
     approved source renders cleanly. If the AI read ever returns, the fix is
     a new consented batch, not deleting women from the board again.
     2026-08-27, per the founder: the first run of cards is explicitly adult
     political and culture-war material. `lead:true` is an editorial rail,
     not a duplicate or a weight. Each bucket still shuffles on every load,
     then the lead bucket is dealt first. This keeps the deck varied while
     preventing school-phone and soft lifestyle prompts from becoming the
     first impression.
     2026-09-11: superseded by the founder. Everyday relationship, friendship,
     work and money disagreements now lead alongside clear US policy choices.
     2026-09-19: specific choices replace vague claims and definition debates;
     each changed example decision follows the revised question. */
  var ROUNDS = window.DBLandingExampleRounds();


  /* 2026-08-18, per the founder: circulate the deck. Each page load shuffles the
     round order and flips seats on a coin toss so a returning visitor sees
     a different opener, sequence, and left/right placement instead of the
     same 24 cards in the same order. The authored pairings, winners, and
     ballots are untouched; a flip swaps the two seat objects and mirrors
     open/drift/score so the bar and clock still read left-seat-first.
     The opener rule from 2026-07-22 survives the shuffle: the first card
     shown is always a mixed pair of real tiles, never two same-list names
     and never the Anonymous avatar. */
  var FS_MALE = {Jake:1, Marcus:1, Tyler:1, Danny:1, Kevin:1, Aaron:1, Luke:1, Matt:1, Mike:1, Alex:1, Eric:1, Ryan:1, Ian:1, Tom:1, Nick:1, Josh:1, Andrew:1, Ben:1, Cole:1, Jon:1, Diego:1, Malik:1, Hunter:1, Owen:1, Sam:1, Caleb:1, Adam:1, Lucas:1, Victor:1, Henry:1};
  var FS_FEMALE = {Anna:1, Paige:1, Elena:1, Mia:1, Sofia:1, Claire:1, Jenna:1, Zoe:1, Sarah:1, Hannah:1, Sydney:1, Amy:1, Rose:1, Faith:1, Grace:1, Camila:1, Natalie:1, Lily:1, Ashley:1, Maddie:1, Chloe:1, Taylor:1, Nora:1, Abby:1, Vanessa:1, Megan:1};
  (function circulateRounds(){
    var i, j, t, r, leadDeck = [], restDeck = [];
    for (i = ROUNDS.length - 1; i > 0; i--) {
      j = Math.floor(Math.random() * (i + 1));
      t = ROUNDS[i]; ROUNDS[i] = ROUNDS[j]; ROUNDS[j] = t;
    }
    /* Everyday disagreements and a few clear political choices lead without
       duplication. Random order survives inside both buckets. */
    for (i = 0; i < ROUNDS.length; i++) {
      (ROUNDS[i].lead ? leadDeck : restDeck).push(ROUNDS[i]);
    }
    ROUNDS = leadDeck.concat(restDeck);
    for (i = 0; i < ROUNDS.length; i++) {
      // A challenge card has one creator and one empty seat, so a flip would
      // put the empty chair in the speaking position. Judged rounds only.
      if (ROUNDS[i].kind === 'challenge') continue;
      if (Math.random() < 0.5) {
        r = ROUNDS[i];
        t = r.a; r.a = r.b; r.b = t;
        r.won = r.won === 'a' ? 'b' : 'a';
        r.open = 100 - r.open;
        r.drift = 100 - r.drift;
        r.score = r.score.split(' - ').reverse().join(' - ');
      }
    }
    /* Opener rule. Draw from the lead bucket, never the Anonymous avatar,
       and never a challenge card:
       the first thing a cold visitor sees has to be a finished round with a
       verdict on it, because that is the product. A challenge card is an
       invitation, which only means something once you know what a round is.
       2026-08-24: the mixed-pair half of the 2026-07-22 rule is back, since
       the cast is mixed again (the 08-22 note below it was written while the
       board was all men and had nothing to match). */
    for (i = 0; i < ROUNDS.length; i++) {
      r = ROUNDS[i];
      if (r.kind === 'challenge') continue;
      if (r.a.nm === 'Anonymous' || r.b.nm === 'Anonymous') continue;
      if ((FS_MALE[r.a.nm] && FS_FEMALE[r.b.nm]) || (FS_FEMALE[r.a.nm] && FS_MALE[r.b.nm])) {
        if (i > 0) { t = ROUNDS[0]; ROUNDS[0] = ROUNDS[i]; ROUNDS[i] = t; }
        break;
      }
    }
  })();

  /* Keep the finished-round opener, then offer the visitor's own round on
     card two and every third card. Only ordinary wildcard pairs repeat;
     creator invitations are never duplicated. */
  (function featureYourRound(){
    var choices = [], examples = [], featured = [], next = 0;
    ROUNDS.forEach(function(r){
      (r.matched && r.openTopic && !r.title ? choices : examples).push(r);
    });
    examples.forEach(function(r, i){
      featured.push(r);
      if (choices.length && i % 2 === 0) featured.push(choices[next++ % choices.length]);
    });
    ROUNDS = featured;
  })();

  /* 2026-08-22, per the founder: circulate the FACES too, not just the deck.
     circulateRounds above reshuffles order and seats, but every character was
     welded to one hand-cast portrait, so the same 24 faces appeared on every
     load in the same pairs and the bank's other 30-odd stills were never seen
     by anyone who did not open the hidden rotator wall. Now each load deals a
     fresh portrait to each character from the bank.

     Dealt per CHARACTER, not per seat, so a character keeps one face for the
     whole session and paging through 34 rounds does not morph Mia between
     cards. Names are load-bearing: they are written into the `rfd` strings, so
     the name is fixed and the face is what moves.

     Cast within FS_MALE / FS_FEMALE (already authored above for the opener
     rule) because the names are gendered and the board prints the name beside
     the portrait. Random across the whole bank would caption a bearded man
     "Mia" a third of the time. This is apparent presentation only, which is
     what the hand-cast already encoded; no attempt is made to match ethnicity
     to a name, which would be a worse decision made more often.
     A character in NEITHER map keeps its authored face. That is what pins the
     Anonymous avatar to face50, so the illustrated mask can never be dealt to
     a person or a person to the anonymous-accounts motion.

     2026-08-22: the board's cast is the eight real-still characters only
     (see the ROUNDS comment above), so the deal is now 8 real faces over
     8 male characters: every tile a visitor sees is a consented webcam
     still, and the generated pools below are dormant until a character
     outside the real batch is ever cast again. WHICH character wears
     which real face still moves every load.
     2026-08-24 SUPERSEDES that: the roster below is now exactly as long as
     the bank it draws from, 30 male characters against 30 male faces and 26
     female against 26 female, so EVERY portrait in the bank is dealt on
     every single load. That is the point of the change (the founder:
     "theres a lot of missing images in circulation"). Before it, 24
     characters drew from 56 faces, and the male side was worse than the
     ratio suggests: mPool puts the eight real stills first, so with only 11
     male characters just three of the 22 generated men were ever dealt, and
     19 male faces were effectively out of rotation. That ordering is now
     moot rather than removed, since a 1:1 roster deals the whole pool
     whatever order it is in; keep the real-first concat so the property
     survives if the roster ever shrinks again. Adding a face to the bank
     without adding a character puts it straight back on the bench, so the
     two lists move together.
     Creator challenge cards carry no character: their names are real people
     and their portraits are fixed files, so castFaces must never deal them a
     stock tile. Matched wildcard cards deliberately use ordinary cast names,
     so both of their seats receive a rotating portrait below.

     FACE_ROOM is not decoration. Several stills were shot in the same room and
     the board shows two portraits side by side, so an unguarded deal
     eventually prints one room twice and the board reads staged. Same reason
     the rotator's SKIP list drops duplicates; this is the two-up version. */
  /* 2026-09-03, per the founder ("get rid of the school images"): every
     still shot in a library, classroom or cafeteria is OUT of circulation:
     face01, face04, face06, face30, face43, face45 (and fictional-chloe on
     the /spar gate). The board's hover clips animate the speaker over a
     frozen still, so a room full of other people behind them reads as a
     paused video rather than a live call. The files stay on disk for the
     static uses elsewhere; SCHOOL_FACES below keeps them out of every pool
     here. Do not re-add a number to FACE_W or FACE_M_GEN without checking
     the background first. */
  var SCHOOL_FACES = {1:1, 4:1, 6:1, 30:1, 43:1, 45:1};
  var FACE_W = [7,11,13,15,18,20,23,25,27,32,35,37,38,41,56,57,58,59,60,61,62];
  /* face63 and face65 are real webcam stills cropped from live rounds,
     supplied by the founder 2026-08-31 with consent + 18+ confirmed on
     record (Ray, Yael). Same standing as the face46-54 batch.
     face64 (Pascal) was PULLED 2026-09-01 on the founder's call: the still
     is dark and low-light and read badly on the board. The file is deleted
     and the number stays out of every pool, same posture as face05/09/14/
     39/55. Do not re-add it; a replacement needs a fresh crop. */
  var FACE_M_REAL = [46,47,48,49,51,52,53,54,63,65];
  /* face66 was added 2026-09-02 and PULLED the same day on the founder's
     call ("get rid of her image"). The file is deleted and the number stays
     out of every pool, same posture as face05/09/14/39/55/64. Do not re-add
     it. The women's bank has no real still today; a replacement needs a
     fresh consented crop. */
  var FACE_W_REAL = [];
  var FACE_M_GEN = [2,3,8,10,12,16,17,19,21,22,24,26,28,29,31,33,34,36,40,42,44];
  /* The 'stacks' and 'campus' rooms were the school stills; they left the
     bank on 2026-09-03, so only the tile wall remains as a shared room. */
  var FACE_ROOM = {20:'tile',32:'tile'};
  (function castFaces(){
    function shuffle(a){
      for (var i = a.length - 1; i > 0; i--) {
        var j = Math.floor(Math.random() * (i + 1)), t = a[i]; a[i] = a[j]; a[j] = t;
      }
      return a;
    }
    function faceName(n){ return 'face' + (n < 10 ? '0' : '') + n; }

    var men = [], women = [], seen = {}, i, r, seat;
    for (i = 0; i < ROUNDS.length; i++) {
      r = ROUNDS[i];
      for (var k = 0; k < 2; k++) {
        seat = k ? r.b : r.a;
        if (seen[seat.nm]) continue;
        seen[seat.nm] = 1;
        if (FS_MALE[seat.nm]) men.push(seat.nm);
        else if (FS_FEMALE[seat.nm]) women.push(seat.nm);
      }
    }

    var cast = {};
    var mPool = shuffle(FACE_M_REAL.slice()).concat(shuffle(FACE_M_GEN.slice()));
    var wPool = shuffle(FACE_W_REAL.slice()).concat(shuffle(FACE_W.slice()));
    /* 2026-09-03: the women's bank (21) is now shorter than the female
       roster (26), so the deal wraps around the pool. Without the wrap the
       overflow characters kept the literal `face:` on their ROUNDS entry,
       which is a stale value that could be a retired or wrong-gender file.
       A wrapped deal can put one face on both seats of a card; the repair
       sweep below treats that as a clash and trades it away. */
    for (i = 0; i < men.length; i++) cast[men[i]] = mPool[i % mPool.length];
    for (i = 0; i < women.length; i++) cast[women[i]] = wPool[i % wPool.length];

    /* Repair same-room pairings by trading two characters' faces rather than
       redealing, so the deal stays a permutation and no face appears twice.
       A trade can seed a collision elsewhere, hence the bounded re-sweep;
       it settles in one or two passes at this bank size, and if it somehow
       does not, the board falls through wearing one repeated room, which is
       a cosmetic miss rather than a broken card. */
    var groupOf = {};
    for (i = 0; i < men.length; i++) groupOf[men[i]] = men;
    for (i = 0; i < women.length; i++) groupOf[women[i]] = women;
    for (var pass = 0; pass < 12; pass++) {
      var clashed = false;
      for (i = 0; i < ROUNDS.length; i++) {
        r = ROUNDS[i];
        var ra = FACE_ROOM[cast[r.a.nm]], rb = FACE_ROOM[cast[r.b.nm]];
        var sameFace = cast[r.a.nm] === cast[r.b.nm];
        if (!sameFace && (!ra || !rb || ra !== rb)) continue;
        clashed = true;
        /* Trade with a peer holding a ROOMLESS face by preference. Trading
           into another family member is what left a collision standing once
           in 3000 measured deals: it clears this card and seeds a new clash
           the sweep then has to chase. A roomless face cannot re-collide, so
           the preferred branch terminates. The different-room branch stays as
           a fallback for the deal where no roomless face is left. */
        var peers = groupOf[r.b.nm] || [], p, other, tmp, pick = -1;
        for (p = 0; p < peers.length; p++) {
          other = peers[p];
          if (other === r.b.nm || other === r.a.nm) continue;
          if (cast[other] === cast[r.a.nm]) continue;
          if (!FACE_ROOM[cast[other]]) { pick = p; break; }
          if (pick < 0 && FACE_ROOM[cast[other]] !== ra) pick = p;
        }
        if (pick >= 0) {
          other = peers[pick];
          tmp = cast[other]; cast[other] = cast[r.b.nm]; cast[r.b.nm] = tmp;
        }
      }
      if (!clashed) break;
    }

    for (i = 0; i < ROUNDS.length; i++) {
      r = ROUNDS[i];
      if (cast[r.a.nm]) r.a.face = faceName(cast[r.a.nm]);
      if (cast[r.b.nm]) r.b.face = faceName(cast[r.b.nm]);
    }
  })();

  var el = {};
  ['fsMotion','fsTitle','fsFaceA','fsFaceB','fsNameA','fsNameB','fsSideA','fsSideB',
   'fsNameAmini','fsNameBmini','fsPctA','fsPctB','fsFill','fsMark','fsLine','fsDot','fsClock',
   'fsOddsLive','fsBallot','fsBallotK','fsWinner','fsScore','fsCard','fsBallotCard','fsWaitLabel','fsWaitCopy',
   'fsViewers','fsVolume','fsChance','fsChanceNm',
   'fsArea','fsMid','fsVol','fsFlag','fsAxHi','fsAxLo','fsDelta','fsOpenFig','fsYouAvatar',
   'fsChalLine','fsChalAlt','fsChalNote']
    .forEach(function(id){ el[id] = document.getElementById(id); });
  var board = document.getElementById('fsBoard');
  var tileA = board && board.querySelector('.fs-tile--speaking');
  var tileB = board && board.querySelectorAll('.fs-tile')[1];
  if (!tileA || !tileB) return;

  var reduced = false;
  try { reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch(e){}

  var BLANK_PX = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';

  /* ── Hover clips (2026-09-02) ──────────────────────────────────────
     /img/round/faces/<face>.mp4 is a silent 3s loop of the matching
     still (440x244, H.264, ~30KB each). It plays only while the pointer
     is over the board or the board holds focus, pauses and rewinds the
     moment it leaves, and never plays under prefers-reduced-motion.
     2026-09-05, the founder: "when ppl get on site have animations
     already going actually doing require user to hover over them". The
     loops now play on ARRIVAL: hot from the first deal, paused only while
     the board is scrolled off screen or the tab is hidden. Hover and
     focus no longer gate them. Muted autoplay needs no gesture. The
     src is set only for the two faces on screen and only for faces that
     have a clip, so a face with no loop (the fictional set, the creator
     portraits) keeps its still and costs no request. */
  var HOVER_CLIPS = {};
  ["face01", "face02", "face03", "face04", "face06", "face07", "face08", "face10", "face11", "face12", "face13", "face15", "face16", "face17", "face18", "face19", "face20", "face21", "face22", "face23", "face24", "face25", "face26", "face27", "face28", "face29", "face30", "face31", "face32", "face33", "face34", "face35", "face36", "face37", "face38", "face40", "face41", "face42", "face43", "face44", "face45", "face46", "face47", "face48", "face49", "face50", "face51", "face52", "face53", "face54", "face56", "face57", "face58", "face59", "face60", "face61", "face62"].forEach(function(id){ HOVER_CLIPS[id] = true; });
  var vidA = document.getElementById('fsVidA'), vidB = document.getElementById('fsVidB');
  var clipsHot = false;
  function clipStop(v){
    if (!v) return;
    v.classList.remove('is-on');
    try { v.pause(); if (v.currentTime) v.currentTime = 0; } catch(e){}
  }
  function clipPlay(v){
    if (!v || reduced || !v.getAttribute('src')) return;
    v.muted = true;
    var p; try { p = v.play(); } catch(e){ return; }
    if (p && p.then) p.then(function(){ if (clipsHot) v.classList.add('is-on'); else clipStop(v); }).catch(function(){});
    else v.classList.add('is-on');
  }
  function clipSet(v, face){
    if (!v) return;
    var src = face && HOVER_CLIPS[face] ? '/img/round/faces/' + face + '.mp4' : '';
    if (v.getAttribute('src') === src) { if (clipsHot && src) clipPlay(v); return; }
    clipStop(v);
    if (src){ v.setAttribute('src', src); if (clipsHot) clipPlay(v); }
    else { v.removeAttribute('src'); try { v.load(); } catch(e){} }
  }
  /* Every face the board paints is recorded under 'da-faces-seen' so the
     sitewide live pop-up (js/live-popup.js) can draw a pair this browser
     has NOT seen on the board yet. Same key, same 'faceNN' ids. */
  function noteFacesSeen(faceA, faceB){
    try {
      var a = JSON.parse(localStorage.getItem('da-faces-seen') || '[]'); if (!a || !a.length) a = [];
      [faceA, faceB].forEach(function(f){ if (f && /^face\d+$/.test(f) && a.indexOf(f) < 0) a.push(f); });
      localStorage.setItem('da-faces-seen', JSON.stringify(a.slice(-400)));
    } catch(e){}
  }
  function setClips(faceA, faceB){ noteFacesSeen(faceA, faceB); clipSet(vidA, faceA); clipSet(vidB, faceB); }
  function clipsOn(){ if (clipsHot || reduced) return; clipsHot = true; clipPlay(vidA); clipPlay(vidB); }
  function clipsOff(){ clipsHot = false; clipStop(vidA); clipStop(vidB); }
  var boardOnScreen = true;
  if (board && !reduced){
    clipsOn();
    if ('IntersectionObserver' in window){
      new IntersectionObserver(function(entries){
        entries.forEach(function(en){
          boardOnScreen = en.isIntersecting;
          if (boardOnScreen && !document.hidden) clipsOn(); else clipsOff();
        });
      }, { threshold: 0.15 }).observe(board);
    }
    document.addEventListener('visibilitychange', function(){
      if (document.hidden) clipsOff(); else if (boardOnScreen) clipsOn();
    });
  }

  /* The untaken seat. A dashed empty box next to a creator portrait read as
     a tile that had failed to load; a silhouette in the chair reads as the
     person who has not arrived. It stays a flat anonymous shape on purpose.
     Nobody has accepted these challenges, so a face here would assert a
     participant, which is the same line the rest of the board holds.
     Eight builds vary hair, headwear and shoulder width, seeded off the
     creator's name so one card keeps its figure across the rotation while
     the ten challenge cards do not all seat the same stock person. */
  /* Torsos, not domes. A semicircle under a ball is the generic account
     glyph, which is exactly what this looked like. Real shoulders run
     out along the trapezius and turn down at the deltoid, so each build
     rises toward the neck and breaks at a corner rather than curving
     continuously from hem to hem. */
  var SEAT_SHOULDER = [
    // narrow
    '<path d="M31 84c0-12.5 4.6-19 12.4-22 4.6-1.8 10-2.6 16.6-2.6s12 .8 16.6 2.6c7.8 3 12.4 9.5 12.4 22z"/>',
    // regular
    '<path d="M24 84c0-13.5 5.4-20.5 14.4-23.6 5.2-1.8 12-2.7 21.6-2.7s16.4.9 21.6 2.7c9 3.1 14.4 10.1 14.4 23.6z"/>',
    // broad
    '<path d="M14 84c0-15 6.6-23 17.4-26.4 6.2-2 15.2-3 28.6-3s22.4 1 28.6 3c10.8 3.4 17.4 11.4 17.4 26.4z"/>'
  ];
  /* One flat tone, painted by opacity on the <svg> rather than alpha in the
     fill: overlapping shapes at a fractional fill compound where they cross,
     which turned the hair into a darker patch and the whole figure into an
     accidental two-tone. A silhouette has one value. */
  /* A head is taller than it is wide and narrows at the jaw; a circle
     reads as a ball. The neck is also NOT the old 16-wide rounded rect
     (half the head's width, which is what made the figure look moulded
     rather than drawn): it is narrow and flares into the traps so the
     head sits ON the body instead of balancing on a post. */
  var SEAT_HEAD = '<path d="M54.6 40.5h10.8v7.4c0 5.2 5.4 7.2 10.4 8.6H44.2c5-1.4 10.4-3.4 10.4-8.6z"/>'
    + '<path d="M60 11.4c8.5 0 14.5 6.5 14.5 15.4 0 6.3-1.2 11.2-3.6 14.5-2.6 3.6-6.5 5.5-10.9 5.5s-8.3-1.9-10.9-5.5c-2.4-3.3-3.6-8.2-3.6-14.5 0-8.9 6-15.4 14.5-15.4z"/>';
  /* Hair sits ON the skull rather than as a lozenge behind it, so every
     shape here follows the head's 14.5 x 15.4 curve and breaks at the
     temple. Retuned when the head stopped being a circle. */
  var SEAT_BUILD = [
    // cropped short
    '<path d="M45.6 28.4c-.6-10.6 6-17 14.4-17s15 6.4 14.4 17c-1.2-5.6-3-8.6-6.2-9.9-3-1.2-5.4-1.5-8.2-1.5s-5.2.3-8.2 1.5c-3.2 1.3-5 4.3-6.2 9.9z"/>'
      + SEAT_HEAD + SEAT_SHOULDER[1],
    // long, past the shoulders
    '<path d="M60 9.4c10.2 0 17.4 7.5 16.4 18.4 1.3 5.8 2 12.2 2 19.2V84H41.6V47c0-7 .7-13.4 2-19.2C42.6 16.9 49.8 9.4 60 9.4z"/>'
      + SEAT_HEAD + SEAT_SHOULDER[0],
    // tied up
    '<circle cx="60" cy="7.6" r="6.4"/>'
      + '<path d="M45.6 28.2c-.7-10.7 6-17.4 14.4-17.4s15.1 6.7 14.4 17.4c-1.3-5.7-3.1-8.7-6.3-10-3-1.1-5.3-1.5-8.1-1.5s-5.1.4-8.1 1.5c-3.2 1.3-5 4.3-6.3 10z"/>'
      + SEAT_HEAD + SEAT_SHOULDER[0],
    // volume
    '<ellipse cx="60" cy="24.6" rx="20.4" ry="18.6"/>'
      + SEAT_HEAD + SEAT_SHOULDER[1],
    // cap — the brim angles down and tapers; the old one was a plank
    '<path d="M45 27.2c-.8-10.8 6-17.2 15-17.2s15.8 6.4 15 17.2c-1.2-5-3-7.6-6-8.8-2.8-1.1-5.4-1.5-9-1.5s-6.2.4-9 1.5c-3 1.2-4.8 3.8-6 8.8z"/>'
      + '<path d="M70.8 20.6c7.8.5 14.3 2.3 19 5.4 2.2 1.5 3 3.5 1.9 5.1-1.1 1.6-3.1 1.8-5.6.7-4.9-2.1-10-3.3-15.3-3.7z"/>'
      + SEAT_HEAD + SEAT_SHOULDER[1],
    // headphones
    '<path d="M45.8 28c-.6-10.5 6.1-16.9 14.2-16.9S74.8 17.5 74.2 28c-1.2-5.5-3-8.4-6.1-9.7-2.9-1.1-5.2-1.5-8.1-1.5s-5.2.4-8.1 1.5c-3.1 1.3-4.9 4.2-6.1 9.7z"/>'
      + SEAT_HEAD
      + '<path d="M39.4 32.6a20.6 20.6 0 0 1 41.2 0h-5.4a15.2 15.2 0 0 0-30.4 0z"/>'
      + '<rect x="34.6" y="28.6" width="10" height="17" rx="5"/><rect x="75.4" y="28.6" width="10" height="17" rx="5"/>'
      + SEAT_SHOULDER[1],
    // covered
    '<path d="M42 38.6c-1-4.2-1.5-8.2-1.5-11.8 0-11 8-18.4 19.5-18.4s19.5 7.4 19.5 18.4c0 3.6-.5 7.6-1.5 11.8-.8 4.6.8 8.4 5 12.4H37c4.2-4 5.8-7.8 5-12.4z"/>'
      + SEAT_HEAD + SEAT_SHOULDER[1],
    // broader build
    '<path d="M46 27.2c-.5-10.2 5.9-16.4 14-16.4s14.5 6.2 14 16.4c-1.1-5.2-2.8-8-5.8-9.2-2.7-1.1-5-1.4-8.2-1.4s-5.5.3-8.2 1.4c-3 1.2-4.7 4-5.8 9.2z"/>'
      + SEAT_HEAD + SEAT_SHOULDER[2]
  ];
  /* Dealt, not hashed. Walking a shuffled build deck prevents the remaining
     creator challenges from all showing the same empty-seat silhouette, and
     reshuffling per load means a returning visitor does not meet the same
     creator in the same chair. */
  (function dealSeats(){
    var order = [], i, j, t;
    for (i = 0; i < SEAT_BUILD.length; i++) order.push(i);
    for (i = order.length - 1; i > 0; i--) {
      j = Math.floor(Math.random() * (i + 1));
      t = order[i]; order[i] = order[j]; order[j] = t;
    }
    for (i = 0, j = 0; i < ROUNDS.length; i++) {
      if (ROUNDS[i].kind !== 'challenge' || ROUNDS[i].matched) continue;
      ROUNDS[i].seat = order[j++ % order.length];
    }
  })();
  function seatFigure(n){
    return '<svg viewBox="0 0 120 84" fill="currentColor" xmlns="http://www.w3.org/2000/svg">'
      + SEAT_BUILD[(n || 0) % SEAT_BUILD.length] + '</svg>';
  }
  function paintYouSeat(){
    if (!board.classList.contains('is-you') || !el.fsYouAvatar) return;
    var user = null;
    try { user = window.firebase && firebase.auth().currentUser; } catch(e){}
    el.fsYouAvatar.innerHTML = seatFigure(0);
    if (!user || user.isAnonymous) return;
    if (window.DBAvatar && DBAvatar.mountIdentity){
      var picture = document.createElement('span');
      el.fsYouAvatar.textContent = '';
      el.fsYouAvatar.appendChild(picture);
      DBAvatar.mountIdentity(picture, {
        uid:user.uid, name:'You', photo:user.photoURL, size:140,
        publicIdentity:DBAvatar.getPublicIdentity()
      });
      return;
    }
    var tag = document.querySelector('script[src="/js/avatar.js"]');
    if (tag){ tag.addEventListener('load', paintYouSeat, { once:true }); return; }
    tag = document.createElement('script');
    tag.src = '/js/avatar.js'; tag.defer = true;
    tag.onload = paintYouSeat;
    document.head.appendChild(tag);
  }
  window.__fsRefreshYou = paintYouSeat;
  window.addEventListener('debatable-avatar-change', paintYouSeat);
  window.addEventListener('debatable-avatar-account-ready', paintYouSeat);
  var idx = 0, price = 50, hist = [], volHist = [], tick = null, slot = null, elapsed = 0;
  var viewers = 0, vol = 0;
  /* Whether the card in the slot actually has a decision to show. The
     eyebrow names the card's author ("AI judge's decision"), which is a
     claim about content, so it only gets to say that once the content is
     there. An empty verdict used to paint the label over a blank block,
     which reads as a broken card rather than one still working. */
  var verdictReady = false;
  // The verdict is the payoff, so it holds LONGER than the deciding
  // animation. Before 2026-08-22 the split was 4600/2600, which meant a
  // visitor glancing at the card mostly caught "The AI judge is deciding".
  var TICK_MS = 420, RUN_MS = 3400, HOLD_MS = 6200;

  function paintMkt(){
    if (el.fsViewers) el.fsViewers.textContent = viewers;
    if (el.fsVolume) el.fsVolume.textContent = vol;
    /* The strip ships [hidden] so a JS-off visitor never reads zeros;
       reveal it once the simulation actually has values to show. */
    if (viewers > 0 && el.fsViewers) {
      var mkt = el.fsViewers.closest ? el.fsViewers.closest('.fs-mkt') : null;
      if (mkt && mkt.hidden) mkt.hidden = false;
    }
    var r = ROUNDS[idx], p = Math.round(price);
    var leadNm = p >= 50 ? r.a.nm : r.b.nm, leadP = p >= 50 ? p : 100 - p;
    if (el.fsChance) el.fsChance.textContent = leadP + '%';
    if (el.fsChanceNm) el.fsChanceNm.textContent = leadNm + ' to win';
  }

  function clamp(v){ return Math.max(14, Math.min(86, v)); }

  /* Chart geometry inside the 0-40 viewBox: the price line gets the top
     band, the volume histogram gets the floor. Constants so the rail labels
     can be positioned off the same numbers. */
  var L_TOP = 2, L_BOT = 27, V_TOP = 29, V_BOT = 39;

  function drawChart(){
    if (!el.fsLine || hist.length < 2) return;
    // Scale to the history's own range so a 45-55 walk still fills the
    // box like a price chart instead of flattening to a hairline.
    var lo = Math.min.apply(null, hist), hi = Math.max.apply(null, hist);
    var pad = Math.max(3, (hi - lo) * .15);
    lo -= pad; hi += pad;
    var span = (hi - lo) || 1;
    var n = hist.length, pts = [], i, x, y;
    for (i = 0; i < n; i++){
      x = i * (100 / (n - 1));
      y = L_BOT - (hist[i] - lo) / span * (L_BOT - L_TOP);
      pts.push(x.toFixed(2) + ',' + y.toFixed(2));
    }
    var joined = pts.join(' ');
    el.fsLine.setAttribute('points', joined);
    // Area is the same line closed down to the floor of the price band.
    if (el.fsArea) el.fsArea.setAttribute('points', '0,' + L_BOT + ' ' + joined + ' 100,' + L_BOT);

    // The coin-flip line only earns its place when 50 is actually inside the
    // window on screen; on an edge it would imply a level that is not there.
    if (el.fsMid){
      if (50 > lo && 50 < hi){
        var my = (L_BOT - (50 - lo) / span * (L_BOT - L_TOP)).toFixed(2);
        el.fsMid.setAttribute('y1', my);
        el.fsMid.setAttribute('y2', my);
        el.fsMid.style.display = '';
      } else {
        el.fsMid.style.display = 'none';
      }
    }

    // Volume histogram, scaled to its own peak and tinted by tick direction.
    if (el.fsVol && volHist.length){
      var vmax = Math.max.apply(null, volHist) || 1;
      var bw = Math.max(.8, (100 / n) * .62), out = '';
      for (i = 0; i < n; i++){
        var h = Math.max(1.2, (volHist[i] / vmax) * (V_BOT - V_TOP));
        var up = i === 0 ? true : hist[i] >= hist[i - 1];
        // Clamp into the viewBox so the first and last bars are not half-cut.
        var bx = Math.min(100 - bw, Math.max(0, i * (100 / (n - 1)) - bw / 2));
        out += '<rect class="fs-volbar' + (up ? '' : ' is-dn') + '" x="' + bx.toFixed(2) +
               '" y="' + (V_BOT - h).toFixed(2) + '" width="' + bw.toFixed(2) +
               '" height="' + h.toFixed(2) + '"/>';
      }
      el.fsVol.innerHTML = out;
    }

    // Live end: dot on the plot, price flag on the rail, both on one figure.
    var lastY = L_BOT - (hist[n-1] - lo) / span * (L_BOT - L_TOP);
    var topPct = (lastY / 40 * 100).toFixed(1) + '%';
    if (el.fsDot) el.fsDot.style.top = topPct;
    if (el.fsFlag){
      var fp = Math.round(price);
      el.fsFlag.style.top = topPct;
      el.fsFlag.textContent = fp + '%';
      el.fsFlag.classList.toggle('is-con', fp < 50);
    }
    if (el.fsAxHi) el.fsAxHi.textContent = Math.round(hi) + '%';
    if (el.fsAxLo) el.fsAxLo.textContent = Math.round(lo) + '%';
  }

  /* Move since the round opened, which is the number a market board leads
     with. Signed against Pro so it agrees with the bar and the flag. */
  function paintDelta(){
    if (!el.fsDelta) return;
    var d = price - ROUNDS[idx].open;
    var r = Math.abs(d) < .05 ? 0 : d;
    el.fsDelta.textContent = (r > 0 ? '\u25B2 ' : r < 0 ? '\u25BC ' : '') + Math.abs(r).toFixed(1);
    el.fsDelta.classList.toggle('is-down', r < 0);
    el.fsDelta.classList.toggle('is-flat', r === 0);
  }

  function paintPrice(){
    var p = Math.round(price), c = 100 - p;
    if (el.fsPctA) el.fsPctA.textContent = p + '%';
    if (el.fsPctB) el.fsPctB.textContent = c + '%';
    if (el.fsFill) el.fsFill.style.width = p + '%';
    if (el.fsMark) el.fsMark.style.left = p + '%';
    drawChart();
    paintDelta();
  }

  /* The scorecard (2026-08-26). Six axes, the plain-language cut of the
     rubric the real ballot scores. The marks
     are DERIVED from the round's speaker points, not authored per round:
     each side's mean is its own points over ten, and the per-axis gaps
     are dealt from a seed made of the motion text. So one card always
     shows the same scorecard, different cards break on different axes,
     and no card can contradict the score printed above it. The loser
     takes an axis outright when the round was close, draws one when it
     was clear, and takes none in a blowout, which is what a ballot
     actually looks like at each of those margins. */
  // 2026-09-04, the founder, on the settled card: "remove 1 or 2 of the
  // eval mechanisms when the judge rules so the display thing here can
  // look a bit wider instead of tall". Six rows down to four. Weighing
  // and Strategy went: they are the two a stranger has to be taught, and
  // the numbers are dealt from the same seed, so the card still cannot
  // contradict the score above it.
  var AXES = ['Logic','Response','Clarity','Persuasion'];

  function cardSeed(str){
    var h = 2166136261, i;
    for (i = 0; i < str.length; i++){
      h ^= str.charCodeAt(i);
      h = (h * 16777619) >>> 0;
    }
    return h || 1;
  }
  function cardRand(seed){
    var s = seed;
    return function(){
      s ^= s << 13; s >>>= 0;
      s ^= s >>> 17;
      s ^= s << 5;  s >>>= 0;
      return s / 4294967296;
    };
  }
  function cardShuffle(arr, rnd){
    for (var i = arr.length - 1; i > 0; i--){
      var j = Math.floor(rnd() * (i + 1)), t = arr[i];
      arr[i] = arr[j]; arr[j] = t;
    }
  }
  function axisMarks(r, pts){
    var A = parseFloat(pts[0]) / 10, B = parseFloat(pts[1]) / 10;
    if (!(A > 0) || !(B > 0)) return null;
    var winA = r.won === 'a';
    var W = winA ? A : B, L = winA ? B : A;
    var d = Math.max(W - L, 0);
    var tail = d < 1.5 ? -1 : (d < 3 ? 0 : 1);
    // Sized off AXES.length, so adding or removing an axis is one edit.
    var n = AXES.length;
    var rest = (n * d - tail) / (n - 1);
    var spread = [], jit = [], i0;
    for (i0 = 0; i0 < n - 1; i0++) spread.push(rest + ((n - 2) / 2 - i0) * (2 / Math.max(1, n - 2)));
    for (i0 = 0; i0 < n; i0++) jit.push(((n - 1) / 2 - i0) * (1.6 / Math.max(1, n - 1)));
    var rnd = cardRand(cardSeed(r.motion));
    cardShuffle(spread, rnd); cardShuffle(jit, rnd);
    // The loser's chance goes on the axis the winner is weakest on, which
    // is the only way it survives the cap: against a winner already at 10
    // the tail gap can only produce a draw.
    var lo = 0, q = 0, gaps = [], i;
    for (i = 1; i < jit.length; i++) if (jit[i] < jit[lo]) lo = i;
    for (i = 0; i < AXES.length; i++) gaps.push(i === lo ? tail : spread[q++]);
    var rows = [], w, l;
    for (i = 0; i < AXES.length; i++){
      w = Math.min(10, Math.max(4, Math.round(W + jit[i])));
      // The loser is capped a mark below perfect: taking an axis is fine,
      // taking it with a 10 on a round they lost is not.
      l = Math.min(9, Math.max(3, Math.round(w - gaps[i])));
      rows.push({ k: AXES[i], a: winA ? w : l, b: winA ? l : w });
    }
    return rows;
  }
  function paintCard(r, pts){
    if (!el.fsCard) return;
    el.fsCard.textContent = '';
    var rows = axisMarks(r, pts);
    if (!rows) return;
    rows.forEach(function(row){
      // Scaled off the MARGIN, not the raw ratio: 9 against 6 is a rout on
      // a ten-point axis and 60/40 does not look like one. Nine points of
      // bar per mark of lead, capped so neither side ever disappears.
      var share = Math.min(88, Math.max(12, 50 + (row.a - row.b) * 9));
      var k = document.createElement('span');
      k.className = 'fs-card-k';
      k.textContent = row.k;
      var na = document.createElement('span');
      na.className = 'fs-card-n' + (row.a > row.b ? ' is-up' : '');
      na.textContent = row.a;
      var bar = document.createElement('span');
      bar.className = 'fs-card-bar';
      bar.setAttribute('aria-hidden', 'true');
      var fill = document.createElement('i');
      fill.style.width = share + '%';
      bar.appendChild(fill);
      var nb = document.createElement('span');
      nb.className = 'fs-card-n fs-card-n--b' + (row.b > row.a ? ' is-up' : '');
      nb.textContent = row.b;
      el.fsCard.appendChild(k); el.fsCard.appendChild(na);
      el.fsCard.appendChild(bar); el.fsCard.appendChild(nb);
    });
  }

  function paintRound(i){
    var r = ROUNDS[i];
    el.fsMotion.textContent = r.motion;
    el.fsMotion.classList.toggle('is-open-topic', !!r.openTopic && !r.title);
    if (el.fsTitle){ el.fsTitle.textContent = r.title || ''; el.fsTitle.hidden = !r.title; }

    /* Challenge card. Everything a judged card asserts (a result, points,
       a clock, a viewer read) is absent here on purpose, so this branch
       returns before any of it is painted rather than painting it and
       hiding it. */
    var isChal = r.kind === 'challenge';
    var isMatched = isChal && !!r.matched;
    var isYou = isMatched && r.openTopic && !r.title;
    el.fsWaitLabel.textContent = isChal ? (isMatched ? 'Your round' : 'Open challenge') : 'Judge';
    el.fsWaitCopy.textContent = isChal
      ? (isMatched ? 'Pick a topic. Take a side.' : 'Win rounds. Earn your shot.')
      : 'The judge is deciding';
    board.classList.toggle('is-chal', isChal);
    board.classList.toggle('is-matched', isMatched);
    board.classList.toggle('is-you', !!isYou);
    tileA.classList.toggle('fs-tile--open', false);
    tileB.classList.toggle('fs-tile--open', isChal && !isMatched);
    if (isChal){
      if (isMatched){
        el.fsFaceA.src = '/img/round/faces/' + r.a.face + '.jpg';
        el.fsFaceB.src = isYou ? BLANK_PX : '/img/round/faces/' + r.b.face + '.jpg';
        setClips(r.a.face, isYou ? null : r.b.face);
        el.fsFaceA.alt = ''; el.fsFaceB.alt = '';
        if (el.fsOpenFig) el.fsOpenFig.innerHTML = '';
        el.fsNameA.textContent = r.a.nm; el.fsSideA.textContent = isYou ? 'Opponent' : 'Matched';
        el.fsNameB.textContent = isYou ? 'You' : r.b.nm; el.fsSideB.textContent = isYou ? 'Your seat' : 'Matched';
        if (isYou) paintYouSeat();
        if (el.fsChalLine) el.fsChalLine.textContent = 'Choose the topic. We match you with someone ready to argue the other side.';
        if (el.fsChalAlt){
          el.fsChalAlt.textContent = 'How matching works'; el.fsChalAlt.href = '/how-it-works';
          el.fsChalAlt.setAttribute('data-cta', 'first-screen-match-how');
        }
        if (el.fsChalNote) el.fsChalNote.hidden = true;
      } else {
        el.fsFaceA.src = '/img/creator-watchlist/' + r.a.img + '.jpg';
        el.fsFaceA.alt = r.a.nm;
        el.fsFaceB.src = BLANK_PX; el.fsFaceB.alt = '';
        setClips(null, null);
        if (el.fsOpenFig) el.fsOpenFig.innerHTML = seatFigure(r.seat);
        el.fsNameA.textContent = r.a.nm; el.fsSideA.textContent = 'Invited';
        el.fsNameB.textContent = r.b.nm; el.fsSideB.textContent = 'Yours';
        if (el.fsChalLine) el.fsChalLine.textContent = 'Nobody has taken the other seat yet. Win rounds and it could be you.';
        if (el.fsChalAlt){
          el.fsChalAlt.textContent = 'How the seat gets filled'; el.fsChalAlt.href = '#creator-sweepstakes';
          el.fsChalAlt.setAttribute('data-cta', 'first-screen-challenge-how');
        }
        if (el.fsChalNote) el.fsChalNote.hidden = false;
      }
      el.fsBallot.classList.remove('is-in');
      verdictReady = false;
      elapsed = 0;
      return;
    }
    el.fsFaceA.alt = '';
    el.fsFaceA.src = '/img/round/faces/' + r.a.face + '.jpg';
    el.fsFaceB.src = '/img/round/faces/' + r.b.face + '.jpg';
    setClips(r.a.face, r.b.face);
    el.fsNameA.textContent = r.a.nm;   el.fsSideA.textContent = r.a.side;
    el.fsNameB.textContent = r.b.nm;   el.fsSideB.textContent = r.b.side;
    if (el.fsNameAmini) el.fsNameAmini.textContent = r.a.nm;
    if (el.fsNameBmini) el.fsNameBmini.textContent = r.b.nm;
    el.fsWinner.textContent = (r.won === 'a' ? r.a.nm : r.b.nm) + ' wins';
    if (el.fsBallotCard) el.fsBallotCard.classList.toggle('is-b', r.won === 'b');
    // The score strings are "aPts - bPts" on the 100 scale. Render them
    // name-attributed so the numbers read as each debater's speaker
    // points rather than a bare sports line a newcomer has to decode.
    // The dot before each name is the colour key the scorecard rows use.
    var pts = String(r.score).split(/\s*[-–]\s*/);
    el.fsScore.textContent = '';
    if (pts.length === 2){
      el.fsScore.appendChild(document.createElement('i'));
      el.fsScore.appendChild(document.createTextNode(r.a.nm + ' ' + pts[0] + ' '));
      var dotB = document.createElement('i'); dotB.className = 'b';
      el.fsScore.appendChild(dotB);
      el.fsScore.appendChild(document.createTextNode(r.b.nm + ' ' + pts[1]));
    } else {
      el.fsScore.textContent = r.score;
    }
    paintCard(r, pts);

    verdictReady = !!(el.fsWinner.textContent.trim()
      && el.fsCard && el.fsCard.children.length >= 4);
    if (el.fsBallotK){
      el.fsBallotK.textContent = verdictReady ? 'Decision' : 'Generating result';
    }

    price = r.open;
    hist = [];
    var seed = r.open;
    volHist = [];
    for (var k = 0; k < 22; k++){
      seed = clamp(seed + (Math.random() * 6 - 3));
      hist.push(seed);
      volHist.push(Math.random() * 9 + 2);
    }
    price = clamp(seed);
    viewers = r.crowd; vol = r.vol;
    paintPrice();
    paintMkt();
    el.fsBallot.classList.remove('is-in');
    if (el.fsOddsLive){ el.fsOddsLive.classList.remove('is-settled'); el.fsOddsLive.innerHTML = '<i></i>In progress'; }
    elapsed = 0;
  }

  function settle(){
    /* Nothing to reveal without a decision. The waiting line keeps running
       instead, so the slot never shows a label over an empty card. */
    if (!verdictReady) return;
    el.fsBallot.classList.add('is-in');
    if (el.fsOddsLive){ el.fsOddsLive.classList.add('is-settled'); el.fsOddsLive.innerHTML = '<i></i>Result ready'; }
    // 2026-08-22: the winner line is always the winner's green. It used to
    // flip amber when the hidden viewer read disagreed with the decision,
    // which was market signalling on a strip that no longer renders, and
    // amber on a result reads as a warning.
    if (el.fsWinner) el.fsWinner.style.color = '';
  }

  // 2026-09-03: a manual step holds the auto-advance for a while so the
  // card the visitor picked is not painted over mid-read. The market tick
  // keeps running so the card still looks live.
  var HOLD_AFTER_MANUAL_MS = 20000;
  var manualHoldUntil = 0;
  function held(){ return Date.now() < manualHoldUntil; }

  function step(){
    if (document.hidden) return;
    elapsed += TICK_MS;
    if (ROUNDS[idx].kind === 'challenge'){
      // Nothing to run, so it holds for one judged card's worth of time and
      // hands the board back. Shorter than RUN+HOLD would leave a reader
      // halfway through the motion.
      if (elapsed >= RUN_MS + HOLD_MS && !held()) go(idx + 1);
      return;
    }
    if (elapsed <= RUN_MS){
      var r = ROUNDS[idx];
      // Walk toward the drift target with noise on top, so it reads as a
      // market finding a level rather than a straight line.
      var pull = (r.drift - price) * 0.16;
      var prevPrice = price;
      price = clamp(price + pull + (Math.random() * 5.4 - 2.7));
      hist.push(price);
      // Bigger price moves trade heavier, which is what gives the histogram
      // a shape instead of thirty bars of identical noise.
      var lot = Math.round(Math.abs(price - prevPrice) * 2.6 + Math.random() * 5 + 2);
      volHist.push(lot);
      if (hist.length > 30){ hist.shift(); volHist.shift(); }
      viewers = Math.max(8, viewers + Math.round(Math.random() * 5 - 1.6));
      vol += lot;
      paintPrice();
      paintMkt();
      if (el.fsClock){
        var t = 102 + Math.round(elapsed / 1000);
        el.fsClock.textContent = '0' + Math.floor(t / 60) + ':' + ('0' + (t % 60)).slice(-2);
      }
      if (elapsed > RUN_MS - TICK_MS) settle();
    } else if (elapsed >= RUN_MS + HOLD_MS && !held()){
      go(idx + 1);
    }
  }

  function go(i){
    idx = (i + ROUNDS.length) % ROUNDS.length;
    if (reduced){ paintRound(idx); if (ROUNDS[idx].kind !== 'challenge') settle(); return; }
    board.classList.add('is-swapping');
    setTimeout(function(){ paintRound(idx); board.classList.remove('is-swapping'); }, 260);
  }

  function manual(dir){
    manualHoldUntil = Date.now() + HOLD_AFTER_MANUAL_MS;
    go(idx + dir);
    try { if (window.dosTrack) dosTrack('first_screen_board_nav', { dir: dir > 0 ? 'next' : 'prev', round: idx + 1 }); } catch(e){}
  }

  paintRound(0);
  if (reduced && ROUNDS[0].kind !== 'challenge') settle();

  function stop(){ if (tick){ clearInterval(tick); tick = null; } }
  function start(){ if (reduced || tick) return; tick = setInterval(step, TICK_MS); }

  // Only run while the board is actually on screen.
  if ('IntersectionObserver' in window){
    new IntersectionObserver(function(es){
      if (es.some(function(e){ return e.isIntersecting; })) start(); else stop();
    }, { rootMargin: '120px 0px' }).observe(root);
  } else { start(); }

  // Arrows, swipe and keys. Manual steps go through manual() so the hold
  // above applies whichever way the visitor stepped.
  (function(){
    var prev = document.getElementById('fsPrev'), next = document.getElementById('fsNext');
    var stage = board.querySelector('.fs-stage');
    if (!prev || !next || !stage) return;
    function press(dir){ return function(e){ e.preventDefault(); e.stopPropagation(); manual(dir); }; }
    prev.addEventListener('click', press(-1));
    next.addEventListener('click', press(1));
    // The arrows sit at the vertical centre of the tiles. Measured from
    // rects, not offsetTop: the board's offset parent changes when the card
    // moves into #mhome, and the tiles change height as faces load.
    function place(){
      var br = board.getBoundingClientRect(), sr = stage.getBoundingClientRect();
      if (!sr.height) return;
      board.style.setProperty('--fs-nav-top', Math.round(sr.top - br.top + sr.height / 2) + 'px');
      board.style.setProperty('--fs-nav-right', Math.max(0, Math.round(br.right - sr.right - 18)) + 'px');
    }
    place();
    window.addEventListener('resize', place);
    window.addEventListener('load', place);
    if ('ResizeObserver' in window) new ResizeObserver(place).observe(stage);
    board.addEventListener('transitionend', place);
    var _go = go;
    go = function(i){ _go(i); setTimeout(place, 300); };
    // Swipe on the card: horizontal only, so scrolling the page over the
    // card is left alone. A plain tap still reaches the hit anchor.
    var sx = 0, sy = 0, tracking = false;
    board.addEventListener('touchstart', function(e){
      if (e.touches.length !== 1) return;
      sx = e.touches[0].clientX; sy = e.touches[0].clientY; tracking = true;
    }, { passive: true });
    board.addEventListener('touchend', function(e){
      if (!tracking) return; tracking = false;
      var t = e.changedTouches[0]; var dx = t.clientX - sx, dy = t.clientY - sy;
      if (Math.abs(dx) >= 40 && Math.abs(dx) > Math.abs(dy) * 1.2){ e.preventDefault(); manual(dx < 0 ? 1 : -1); }
    }, { passive: false });
    board.addEventListener('keydown', function(e){
      if (e.key === 'ArrowRight'){ e.preventDefault(); manual(1); }
      else if (e.key === 'ArrowLeft'){ e.preventDefault(); manual(-1); }
    });
  })();
})();
