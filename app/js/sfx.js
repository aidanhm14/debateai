/* sfx.js
 *
 * Global SFX module. Web Audio API synthesized so we ship zero MP3
 * assets and zero network requests. Tiny — every sound is < 400ms
 * and uses sine/triangle waves with sharp envelopes so they read as
 * UI feedback rather than musical events.
 *
 * Mute is persisted in localStorage `da-sfx-muted` ('1' = muted).
 * Initial state: enabled but quiet (master gain 0.6). User can mute
 * via window.SFX.mute() or by setting localStorage directly.
 *
 * Browser autoplay policy: AudioContext starts suspended on Chrome
 * until a user gesture. Each play() call lazily resumes the context,
 * so the first click gets sound from there on. Pre-gesture calls
 * silently no-op (we're not allowed to make sound without user intent
 * and that's the right default anyway).
 *
 * Surface API:
 *   SFX.click()      — UI tick. Subtle, ~50ms. Use on button taps.
 *   SFX.send()       — user submits. ~130ms upward sweep. Use on
 *                       message-send / form-submit.
 *   SFX.receive()    — AI / system reply. ~200ms downward sweep + tail.
 *                       Use when an AI response or other-party event lands.
 *   SFX.success()    — milestone done. ~400ms C-E-G arpeggio.
 *                       Use on round complete, ballot ready, accept
 *                       confirmed.
 *   SFX.error()      — failure. ~250ms low triangle sweep.
 *                       Use on API failure, validation error.
 *   SFX.confirm()    — committed action. ~150ms warm chime.
 *                       Use on splash tap, post-challenge confirm.
 *   SFX.mute() / unmute() / toggleMute() / isMuted()
 *
 * Compatible with the SFX object that already exists inline inside
 * debate-ai.html (different methods, no clash). debate-ai.html keeps
 * its richer ambience system; other pages use this module.
 */
(function(){
  'use strict';

  var STORAGE_KEY = 'da-sfx-muted';
  var MASTER_GAIN = 0.6;        // global ceiling so nothing is jarring
  var ctx = null;               // lazy AudioContext

  function isMuted(){
    try { return localStorage.getItem(STORAGE_KEY) === '1'; } catch(e){ return false; }
  }
  function setMuted(v){
    try { localStorage.setItem(STORAGE_KEY, v ? '1' : '0'); } catch(e){}
  }
  function getCtx(){
    if (ctx) return ctx;
    try {
      var Ctor = window.AudioContext || window.webkitAudioContext;
      if (!Ctor) return null;
      ctx = new Ctor();
    } catch(e){ return null; }
    return ctx;
  }
  // Resume on every play call. Cheap + idempotent. Without it, the
  // first sound after a fresh page load is silent because Chrome
  // suspends the context until a user gesture.
  function ensureRunning(){
    if (!ctx) return;
    if (ctx.state === 'suspended'){
      try { ctx.resume(); } catch(e){}
    }
  }

  // Build a one-shot tone with attack-decay envelope. All sounds
  // compose from these so we keep the audio surface small + tunable.
  //   freq        — Hz
  //   freqEnd     — optional Hz to ramp to (creates pitch sweep)
  //   dur         — seconds
  //   peak        — peak gain (multiplied by MASTER_GAIN)
  //   type        — 'sine' (default) | 'triangle' | 'square' | 'sawtooth'
  //   delayMs     — when to start, ms from now (for arpeggios)
  function tone(opts){
    if (isMuted()) return;
    var c = getCtx();
    if (!c) return;
    ensureRunning();
    var t0 = c.currentTime + (opts.delayMs || 0) / 1000;
    var dur = opts.dur || 0.12;
    var peak = (opts.peak || 0.18) * MASTER_GAIN;
    try {
      var o = c.createOscillator();
      var g = c.createGain();
      o.connect(g); g.connect(c.destination);
      o.type = opts.type || 'sine';
      o.frequency.setValueAtTime(opts.freq, t0);
      if (opts.freqEnd && opts.freqEnd !== opts.freq){
        o.frequency.exponentialRampToValueAtTime(opts.freqEnd, t0 + dur * 0.85);
      }
      // Quick attack, exponential decay. Sharp enough to read as UI,
      // soft enough to not click-pop.
      g.gain.setValueAtTime(0, t0);
      g.gain.linearRampToValueAtTime(peak, t0 + Math.min(0.012, dur * 0.15));
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      o.start(t0);
      o.stop(t0 + dur + 0.02);
    } catch(e){}
  }

  // ── Sound palette ──────────────────────────────────────────────────
  // Tuned by ear; tweak with caution. Each one is its own paragraph so
  // future contributors can adjust without untangling a chord chart.

  function click(){
    // Generic tap. 800Hz → 700Hz quick down-tick. Reads as a soft button click.
    tone({ freq: 820, freqEnd: 720, dur: 0.06, peak: 0.10, type: 'sine' });
  }

  function send(){
    // User commits a message / submit. Upward 600 → 920 sweep, brief.
    tone({ freq: 600, freqEnd: 920, dur: 0.13, peak: 0.16, type: 'sine' });
  }

  function receive(){
    // Other party / AI reply lands. Downward 760 → 540 + small tail.
    tone({ freq: 760, freqEnd: 540, dur: 0.18, peak: 0.18, type: 'sine' });
    tone({ freq: 360, dur: 0.22, peak: 0.07, type: 'sine', delayMs: 60 });
  }

  function success(){
    // Milestone — round complete, ballot ready, accept confirmed.
    // C-E-G major arpeggio at ~120ms intervals.
    tone({ freq: 523.25, dur: 0.18, peak: 0.16, type: 'sine', delayMs: 0 });   // C5
    tone({ freq: 659.25, dur: 0.18, peak: 0.16, type: 'sine', delayMs: 90 });  // E5
    tone({ freq: 783.99, dur: 0.30, peak: 0.18, type: 'sine', delayMs: 180 }); // G5
  }

  function error(){
    // Failure cue. Low triangle sweep 280 → 180. Triangle gives it a
    // bit more grit than sine without going full square-wave abrasive.
    tone({ freq: 280, freqEnd: 180, dur: 0.22, peak: 0.18, type: 'triangle' });
  }

  function confirm(){
    // User-committed action (splash tap, accept-pressed-yes). Warm
    // 700Hz pure sine, slightly longer than click(), no sweep.
    tone({ freq: 700, dur: 0.16, peak: 0.16, type: 'sine' });
  }

  // ── Public API ─────────────────────────────────────────────────────
  // Voice-debate semantic aliases. The shared SFX palette has six core
  // sounds; voice-debate calls additional verbs (start / interrupt /
  // end) for round-lifecycle moments. Aliased rather than duplicated
  // so palette tweaks stay in one place.
  //   start     → success  (round goes live, same "milestone reached"
  //                          arpeggio semantics)
  //   interrupt → click    (user cut into the AI mid-turn; subtle tick,
  //                          NOT a celebration — it's a cut, not a win)
  //   end       → confirm  (session ended cleanly; warm closing chime)
  //
  // MERGE, don't replace. debate-ai.html has an inline `const SFX = {...}`
  // with richer methods (startRound, thinking, ready, preparing, etc.)
  // that get hoisted to window.SFX after Babel transpiles the inline
  // text/babel script (const → var → window prop). topbar.js then
  // injects this file deferred, AFTER the inline scope has already
  // populated window.SFX. A bare `window.SFX = {...}` here would clobber
  // those page-specific methods, breaking Quick Clash + every other
  // round-start path on debate-ai.html (the user got
  // "SFX.startRound is not a function" the moment they clicked START
  // ROUND). Object.assign with the existing SFX as the LAST source
  // means page-specific methods win on conflicting keys, and pages
  // without an inline SFX (splash, learn, live, voice-debate) still
  // get the full shared API.
  var sharedSFX = {
    click: click,
    send: send,
    receive: receive,
    success: success,
    start: success,
    interrupt: click,
    end: confirm,
    error: error,
    confirm: confirm,
    isMuted: isMuted,
    mute: function(){ setMuted(true); },
    unmute: function(){ setMuted(false); },
    toggleMute: function(){ var m = !isMuted(); setMuted(m); return m; },
  };
  window.SFX = Object.assign({}, sharedSFX, window.SFX || {});
})();
