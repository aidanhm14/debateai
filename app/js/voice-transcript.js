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
   instead of the whole session when the pending writes are acknowledged.

   WRITE PATH. Client to Firestore directly, not through a Netlify
   function. A flush every ~10s through /api/* would be 20-40 function
   invocations per round, which is the exact shape of the 2026-05-18
   credit-burn audit. A Firestore write is far cheaper and the round doc
   is already how this app syncs live state.

   SHAPE.
     voice_transcripts/{id}            header, mutable by its owner
       .uid .surface .motion .mode .format .side .persona
       .startedAt .updatedAt .status ('live' | 'complete' | 'abandoned')
       .turnCount .chunkCount .charCount .pendingChunkCount .captureIssue
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
  var MAX_TURN_CHARS = 4000;     // long turns split into labelled parts
  var MAX_TURNS = 600;           // stored turn parts, explicit session cap
  var MAX_TOTAL_CHARS = 240000;  // runaway guard
  var WRITE_TIMEOUT_MS = 15000;
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

  function acknowledged(write) {
    var timer;
    return Promise.race([Promise.resolve().then(write), new Promise(function (_, reject) {
      timer = setTimeout(function () { reject(new Error('Transcript save timed out')); }, WRITE_TIMEOUT_MS);
    })]).finally(function () { clearTimeout(timer); });
  }

  function Session(ref, meta, uid, header) {
    this.ref = ref;
    this.uid = uid;
    this.meta = meta;
    this.initialHeader = header;
    this.headerSaved = false;
    this.buf = [];
    this.pending = [];
    this.seq = 0;
    this.savedChunks = 0;
    this.savedTurns = 0;
    this.savedChars = 0;
    this.turnCount = 0;
    this.charCount = 0;
    this.closed = false;
    this.timer = null;
    this.retryTimer = null;
    this.retryCount = 0;
    this.saving = null;
    this.capped = false;
    this.captureIssue = '';
    this.summary = null;
    this.finishedSaved = false;
    this.reported = false;
    var self = this;
    this._onHide = function () { self.flush(); };
    this._onVis = function () { if (document.visibilityState === 'hidden') self.flush(); };
    this._onOnline = function () { self.flush(); };
    window.addEventListener('pagehide', this._onHide);
    window.addEventListener('online', this._onOnline);
    document.addEventListener('visibilitychange', this._onVis);
    this._drain();
  }

  Session.prototype.push = function (turn) {
    if (this.closed || this.capped || !turn) return;
    var raw = typeof turn.text === 'string' ? turn.text.trim() : '';
    if (!raw) return;
    var offset = 0, part = 0, split = raw.length > MAX_TURN_CHARS;
    while (offset < raw.length) {
      if (this.turnCount >= MAX_TURNS || this.charCount >= MAX_TOTAL_CHARS) {
        this.capped = true;
        this.captureIssue = 'session_limit';
        this.flush();
        return;
      }
      var end = Math.min(raw.length, offset + MAX_TURN_CHARS, offset + MAX_TOTAL_CHARS - this.charCount);
      // Never split a UTF-16 surrogate pair into invalid stored strings.
      if (end < raw.length && /[\uD800-\uDBFF]/.test(raw.charAt(end - 1)) && /[\uDC00-\uDFFF]/.test(raw.charAt(end))) end--;
      if (end <= offset) { this.capped = true; this.captureIssue = 'session_limit'; this.flush(); return; }
      var text = raw.slice(offset, end);
      var sourceId = str(turn.id, 140);
      this.buf.push({
        who: turn.who === 'ai' ? 'ai' : turn.who === 'system' ? 'system' : 'you',
        text: text,
        sourceId: sourceId ? sourceId + (split ? ':part:' + part : '') : '',
        part: part,
        continuation: part > 0,
        t: typeof turn.t === 'number' && isFinite(turn.t) ? Math.max(0, Math.round(turn.t)) : null,
        phase: str(turn.phase, 40),
        interrupted: !!turn.interrupted,
        typed: !!turn.typed,
      });
      this.turnCount += 1;
      this.charCount += text.length;
      offset = end; part++;
      if (this.buf.length >= TURNS_PER_CHUNK) this.flush();
    }
    if (this.buf.length && !this.timer) {
      var self = this;
      this.timer = setTimeout(function () { self.timer = null; self.flush(); }, FLUSH_MS);
    }
  };

  Session.prototype.flush = function () {
    if (this.timer) { clearTimeout(this.timer); this.timer = null; }
    if (this.retryTimer) { clearTimeout(this.retryTimer); this.retryTimer = null; }
    if (this.buf.length) {
      var turns = this.buf;
      this.buf = [];
      // The queue owns these words until an acknowledgement arrives. A
      // retry uses the same document id, never a new copy of the turn.
      this.pending.push({ uid: this.uid, seq: this.seq++, turns: turns,
        createdAt: firebase.firestore.FieldValue.serverTimestamp() });
    }
    var self = this;
    return this._drain().then(function (saved) {
      // A flush may arrive while the previous drain is completing its
      // header write. Its newly queued words still need their own ack.
      if (saved && (self.pending.length || (self.closed && !self.finishedSaved))) return self.flush();
      return saved;
    });
  };

  Session.prototype._chunk = function (chunk) {
    var ref = this.ref.collection('chunks').doc(String(chunk.seq).padStart(5, '0'));
    return acknowledged(function () { return ref.set(chunk); }).catch(function (error) {
      // An acknowledgement can be lost after the create succeeded. The
      // append-only rule correctly refuses a second write; verify the
      // exact existing content before treating that refusal as success.
      return acknowledged(function () { return ref.get({ source: 'server' }); }).then(function (snap) {
        var saved = snap.exists ? snap.data() : null;
        if (!saved || saved.uid !== chunk.uid || saved.seq !== chunk.seq ||
            !Array.isArray(saved.turns) || saved.turns.length !== chunk.turns.length ||
            !chunk.turns.every(function (turn, index) {
              return Object.keys(turn).every(function (key) { return saved.turns[index][key] === turn[key]; });
            })) throw error;
      });
    });
  };

  Session.prototype._header = function (status, extra) {
    var patch = {
      status: status,
      turnCount: this.savedTurns,
      chunkCount: this.savedChunks,
      charCount: this.savedChars,
      pendingChunkCount: this.pending.length + (this.buf.length ? 1 : 0),
      captureIssue: this.captureIssue || (status === 'incomplete' ? 'save_pending' : ''),
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
    };
    if (extra && typeof extra === 'object') {
      if (typeof extra.score === 'number') patch.score = extra.score;
      if (typeof extra.won === 'boolean') patch.won = extra.won;
      if (typeof extra.generationId === 'string') patch.generationId = extra.generationId.slice(0, 100);
      if (typeof extra.roundId === 'string') patch.roundId = extra.roundId.slice(0, 100);
    }
    var ref = this.ref;
    return acknowledged(function () { return ref.set(patch, { merge: true }); });
  };

  Session.prototype._drain = function () {
    if (this.saving) return this.saving;
    var self = this;
    this.saving = Promise.resolve().then(async function () {
      if (!self.headerSaved) {
        await acknowledged(function () { return self.ref.set(self.initialHeader, { merge: true }); });
        self.headerSaved = true;
      }
      while (self.pending.length) {
        var chunk = self.pending[0];
        await self._chunk(chunk);
        self.pending.shift();
        self.savedChunks++;
        self.savedTurns += chunk.turns.length;
        self.savedChars += chunk.turns.reduce(function (n, turn) { return n + turn.text.length; }, 0);
        if (!self.closed && (self.savedChunks === 1 || self.savedChunks % HEADER_EVERY === 0)) {
          await self._header(self.captureIssue ? 'capped' : 'live');
        }
      }
      if (self.closed || self.captureIssue) {
        var status = self.captureIssue ? 'capped' : (self.summary && self.summary.status === 'abandoned' ? 'abandoned' : 'complete');
        await self._header(status, self.summary);
        if (self.closed) self.finishedSaved = true;
      }
      self.retryCount = 0;
      if (self.closed) {
        self._detach();
        if (!self.reported) {
          self.reported = true;
          try { gtag('event', 'voice_transcript_stored', { surface: self.meta.surface || '',
            turns: self.savedTurns, status: self.captureIssue ? 'capped' : (self.summary && self.summary.status === 'abandoned' ? 'abandoned' : 'complete') }); } catch (e) {}
        }
      }
      return true;
    }).catch(async function (e) {
      console.warn('[voice-transcript] save pending; retrying', e && e.message);
      // A failed or timed-out write never earns a complete marker.
      // Keep its queue even if the status write itself is offline.
      if (self.headerSaved) await self._header('incomplete', self.summary).catch(function () {});
      if (!self.retryTimer) self.retryTimer = setTimeout(function () {
        self.retryTimer = null;
        self._drain();
      }, Math.min(30000, 1000 * Math.pow(2, Math.min(self.retryCount++, 5))));
      return false;
    }).finally(function () { self.saving = null; });
    return this.saving;
  };

  Session.prototype._detach = function () {
    window.removeEventListener('pagehide', this._onHide);
    window.removeEventListener('online', this._onOnline);
    document.removeEventListener('visibilitychange', this._onVis);
  };

  Session.prototype.finish = function (summary) {
    this.closed = true;
    this.summary = this.summary || summary || {};
    return this.flush();
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
        roundId: str(meta.roundId, 100),
        turnCount: 0,
        chunkCount: 0,
        charCount: 0,
        startedAt: firebase.firestore.FieldValue.serverTimestamp(),
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      };
      return new Session(ref, meta, uid, header);
      });
    }).catch(function () { return null; });
  }

  window.VoiceTranscript = { start: start };
})();
