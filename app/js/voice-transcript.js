/* ──────────────────────────────────────────────────────────────────
   Voice transcript capture.

   One implementation shared by every voice surface (voice-debate,
   newvoice, coach, room-judge) so the four do not drift into four
   different transcript shapes.

   WHAT THIS FIXES. Before this, a spoken round left durable structured
   text only if the user was signed in, on voice-debate specifically,
   AND reached the ballot: voice_rounds is written once, inside
   generateRFD, and its rules set `allow update: false`. Everything else
   was a flattened string on the generations doc, also written once at
   the end. So the rounds most worth having, the long ones and the ones
   that crashed, were exactly the rounds that stored nothing.

   Capture is now INCREMENTAL. Turns buffer and land in immutable chunks
   during the round, so a closed tab costs at most the last few seconds
   instead of the whole session.

   WRITE PATH. Client to Firestore directly, not through a Netlify
   function. A flush every ~10s through /api/* would be 20-40 function
   invocations per round, which is the exact shape of the 2026-05-18
   credit-burn audit. A Firestore write is far cheaper and the round doc
   is already how this app syncs live state.

   SHAPE.
     voice_transcripts/{id}            header, mutable by its owner
       .uid .surface .motion .mode .format .side .persona
       .startedAt .updatedAt .status ('live' | 'complete' | 'abandoned')
       .turnCount .chunkCount .charCount
     voice_transcripts/{id}/chunks/{seq}   append-only, never updated
       .uid .seq .turns[] .createdAt

   Chunks rather than one growing array: appending to an array field is a
   read-modify-write that races two tabs and walks into the 1MB document
   ceiling on a long round. A chunk is one write with no read.

   CONSENT IS THE GATE. start() returns null unless the person has said
   yes, and it will ask if they have not been asked. Nothing buffers,
   nothing writes, no document is created on a decline. Callers must ALSO
   check TranscriptConsent.granted() before putting transcript text in a
   log-generation payload; this module cannot police that for them.

   Usage:
     var s = await VoiceTranscript.start({ surface:'newvoice', motion:m });
     if (s) s.push({ who:'you', text:'...', t:1200, phase:'PMC' });
     if (s) s.finish({ status:'complete', score:27 });
   ────────────────────────────────────────────────────────────── */
(function () {
  if (window.VoiceTranscript) return;

  var TURNS_PER_CHUNK = 25;      // flush at this many buffered turns
  var FLUSH_MS = 10000;          // or this long after the first of them
  var MAX_TURN_CHARS = 4000;     // one spoken turn is never this long
  var MAX_TURNS = 600;           // runaway guard, ~2h of dense clash
  var MAX_TOTAL_CHARS = 240000;  // runaway guard
  var HEADER_EVERY = 4;          // refresh the header every N chunks

  var FS_SDK_URL = 'https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore-compat.js';

  function db() {
    try {
      if (typeof firebase === 'undefined' || !firebase.firestore) return null;
      return firebase.firestore();
    } catch (e) { return null; }
  }

  // newvoice, coach and room-judge deliberately ship firebase app+auth
  // without firestore, because it is ~100KB on a page that otherwise
  // never touches it. Rather than make each of them remember to load it,
  // this module pulls the SDK itself on the one code path that needs it.
  // Shares the `da-fs-sdk` script id with the loaders already on those
  // pages so two callers cannot inject two copies.
  function ensureFirestore() {
    if (db()) return Promise.resolve(true);
    if (typeof firebase === 'undefined') return Promise.resolve(false);
    return new Promise(function (resolve) {
      var ex = document.getElementById('da-fs-sdk');
      if (ex) {
        ex.addEventListener('load', function () { resolve(!!db()); }, { once: true });
        ex.addEventListener('error', function () { resolve(false); }, { once: true });
        return;
      }
      var s = document.createElement('script');
      s.id = 'da-fs-sdk';
      s.src = FS_SDK_URL;
      s.addEventListener('load', function () { resolve(!!db()); }, { once: true });
      s.addEventListener('error', function () { resolve(false); }, { once: true });
      document.head.appendChild(s);
    });
  }

  function uidNow() {
    try {
      var u = firebase.auth().currentUser;
      return u ? u.uid : null;
    } catch (e) { return null; }
  }

  function str(v, max) {
    if (typeof v !== 'string') return '';
    var s = v.trim();
    return s.length > max ? s.slice(0, max) : s;
  }

  function Session(ref, meta, uid) {
    this.ref = ref;
    this.uid = uid;
    this.meta = meta;
    this.buf = [];
    this.seq = 0;
    this.turnCount = 0;
    this.charCount = 0;
    this.closed = false;
    this.timer = null;
    this.capped = false;
    var self = this;
    // A closing tab is the case this whole module exists for, so both
    // signals are wired: pagehide covers navigation and bfcache, and the
    // visibility change covers a backgrounded mobile tab the OS then
    // kills without ever firing pagehide.
    this._onHide = function () { self.flush(); };
    this._onVis = function () { if (document.visibilityState === 'hidden') self.flush(); };
    window.addEventListener('pagehide', this._onHide);
    document.addEventListener('visibilitychange', this._onVis);
  }

  Session.prototype.push = function (turn) {
    if (this.closed || this.capped || !turn) return;
    var text = str(turn.text, MAX_TURN_CHARS);
    if (!text) return;
    if (this.turnCount >= MAX_TURNS || this.charCount >= MAX_TOTAL_CHARS) {
      // Stop silently rather than truncating mid-round in a way that
      // would look like a complete transcript to whatever reads it.
      this.capped = true;
      this.flush();
      try { this.ref.set({ status: 'capped' }, { merge: true }).catch(function () {}); } catch (e) {}
      return;
    }
    this.buf.push({
      who: turn.who === 'ai' ? 'ai' : turn.who === 'system' ? 'system' : 'you',
      text: text,
      t: typeof turn.t === 'number' && isFinite(turn.t) ? Math.max(0, Math.round(turn.t)) : null,
      phase: str(turn.phase, 40),
      interrupted: !!turn.interrupted,
      typed: !!turn.typed,
    });
    this.turnCount += 1;
    this.charCount += text.length;
    if (this.buf.length >= TURNS_PER_CHUNK) { this.flush(); return; }
    if (!this.timer) {
      var self = this;
      this.timer = setTimeout(function () { self.timer = null; self.flush(); }, FLUSH_MS);
    }
  };

  Session.prototype.flush = function () {
    if (!this.buf.length) return;
    if (this.timer) { clearTimeout(this.timer); this.timer = null; }
    var turns = this.buf;
    this.buf = [];
    var seq = this.seq++;
    var self = this;
    try {
      this.ref.collection('chunks').doc(String(seq).padStart(5, '0')).set({
        uid: this.uid,
        seq: seq,
        turns: turns,
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      }).catch(function (e) { console.warn('[voice-transcript] chunk write failed', e && e.message); });
    } catch (e) { return; }
    // The header is a convenience for listing rounds, not the record, so
    // it does not need to be right after every single chunk. Refreshing
    // it every write would double the cost of capture for no gain.
    if (seq === 0 || (seq + 1) % HEADER_EVERY === 0) this._header('live');
  };

  Session.prototype._header = function (status, extra) {
    var patch = {
      status: status,
      turnCount: this.turnCount,
      chunkCount: this.seq,
      charCount: this.charCount,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
    };
    if (extra && typeof extra === 'object') {
      if (typeof extra.score === 'number') patch.score = extra.score;
      if (typeof extra.won === 'boolean') patch.won = extra.won;
      if (typeof extra.generationId === 'string') patch.generationId = extra.generationId.slice(0, 64);
      if (typeof extra.roundId === 'string') patch.roundId = extra.roundId.slice(0, 64);
    }
    try { this.ref.set(patch, { merge: true }).catch(function () {}); } catch (e) {}
  };

  Session.prototype.finish = function (summary) {
    if (this.closed) return;
    this.closed = true;
    this.flush();
    window.removeEventListener('pagehide', this._onHide);
    document.removeEventListener('visibilitychange', this._onVis);
    var s = summary || {};
    this._header(s.status === 'abandoned' ? 'abandoned' : 'complete', s);
    try {
      gtag('event', 'voice_transcript_stored', {
        surface: this.meta.surface || '', turns: this.turnCount,
      });
    } catch (e) {}
  };

  Session.prototype.id = function () { return this.ref.id; };

  // Resolves to a Session, or to null when there is no consent, no
  // Firestore, or no account to own the document. Null is a normal
  // outcome and every caller has to handle it.
  function start(meta) {
    meta = meta || {};
    // SDK first, then the ask. Doing it in this order means the consent
    // module can mirror the answer onto the profile immediately instead
    // of losing it to a page that had no firestore loaded at the moment
    // the person clicked.
    return ensureFirestore().then(function (haveFs) {
      if (!haveFs) return null;
      var d = db();
      if (!d) return null;

      var consent = window.TranscriptConsent;
      var gate = consent ? consent.ensure() : Promise.resolve(false);

      return gate.then(function (ok) {
      if (!ok) return null;
      var uid = uidNow();
      // An account is required because the rules key ownership off the
      // uid. Guests already get an anonymous Firebase account on these
      // surfaces; a visitor with no account at all stores nothing, which
      // is the correct ceiling for data nobody can ever come back to.
      if (!uid) return null;
      var ref;
      try { ref = d.collection('voice_transcripts').doc(); } catch (e) { return null; }
      var header = {
        uid: uid,
        surface: str(meta.surface, 40) || 'voice',
        motion: str(meta.motion, 1000),
        mode: str(meta.mode, 60),
        format: str(meta.format, 60),
        side: str(meta.side, 40),
        persona: str(meta.persona, 60),
        status: 'live',
        turnCount: 0,
        chunkCount: 0,
        charCount: 0,
        startedAt: firebase.firestore.FieldValue.serverTimestamp(),
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      };
      try { ref.set(header).catch(function (e) {
        console.warn('[voice-transcript] header write failed', e && e.message);
      }); } catch (e) { return null; }
      return new Session(ref, meta, uid);
      });
    }).catch(function () { return null; });
  }

  window.VoiceTranscript = { start: start };
})();
