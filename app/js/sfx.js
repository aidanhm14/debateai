/* sfx.js
 *
 * Global SFX module. Hybrid: prefers pre-rendered ElevenLabs
 * sound-effects MP3s at /audio/sfx/<name>.mp3, falls back to Web Audio
 * synth chimes if the file is missing, still loading, or the browser
 * doesn't support decodeAudioData. The synth path keeps every page
 * audible on first interaction even before the MP3s land.
 *
 * Generate the MP3 bank with:
 *   ELEVENLABS_API_KEY=sk_... node scripts/generate-sfx.mjs
 * (see scripts/generate-sfx.mjs + app/audio/sfx/README.md for prompts
 *  and the per-cue rationale).
 *
 * Mute is persisted in localStorage `da-sfx-muted` ('1' = muted).
 * Initial state: enabled but quiet (master gain 0.6). User can mute
 * via window.SFX.mute() or by setting localStorage directly. Also
 * respects prefers-reduced-motion.
 *
 * Browser autoplay policy: AudioContext starts suspended on Chrome
 * until a user gesture. Each play() call lazily resumes the context,
 * so the first click gets sound from there on. Pre-gesture calls
 * silently no-op (we're not allowed to make sound without user intent
 * and that's the right default anyway).
 *
 * Surface API:
 *   SFX.click()      — UI tick. Use on button taps.
 *   SFX.send()       — user submits. Use on message-send / form-submit.
 *   SFX.receive()    — AI / system reply. Use when an AI response or
 *                       other-party event lands.
 *   SFX.success()    — milestone done. Use on round complete, ballot
 *                       ready, accept confirmed.
 *   SFX.error()      — failure. Use on API failure, validation error.
 *   SFX.confirm()    — committed action. Use on splash tap, post-
 *                       challenge confirm.
 *   SFX.mute() / unmute() / toggleMute() / isMuted()
 *
 * Compatible with the SFX object that already exists inline inside
 * debate-it.html (different methods, no clash). debate-it.html keeps
 * its richer ambience system; other pages use this module.
 */
(function(){
  'use strict';

  var STORAGE_KEY = 'da-sfx-muted';
  var MASTER_GAIN = 0.6;        // global ceiling so nothing is jarring
  var ctx = null;               // lazy AudioContext
  var SFX_BASE = '/audio/sfx/'; // where the pre-rendered MP3 bank lives

  // MP3 cache. Three states per cue:
  //   undefined      → never touched, fall back to synth + kick fetch
  //   'loading'      → fetch in flight, fall back to synth this time
  //   AudioBuffer    → ready, play it
  //   'missing'      → 404 or decode failed, permanent synth fallback
  var mp3 = Object.create(null);

  function isMuted(){
    // Two ways to be muted: explicit user toggle, or system-level
    // reduced-motion preference (we treat that as a strong signal that
    // the user doesn't want UI flourish, sound included). Either wins.
    try {
      if (localStorage.getItem(STORAGE_KEY) === '1') return true;
    } catch(e){}
    try {
      if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return true;
    } catch(e){}
    return false;
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

  // ── MP3 layer ──────────────────────────────────────────────────────
  // Try to play a pre-rendered ElevenLabs sound effect. Returns true if
  // it played the MP3, false if the caller should fall back to synth.
  // Failure modes that return false:
  //   - mute / no AudioContext (synth would also be silent — fine)
  //   - MP3 not yet decoded (kicks the fetch in the background; next
  //     call to this cue is likely to land in the AudioBuffer state)
  //   - MP3 404 / decode error (marked 'missing', permanent synth)
  function playMP3(name){
    if (isMuted()) return false;
    var c = getCtx();
    if (!c) return false;
    var entry = mp3[name];
    if (entry === 'missing') return false;
    if (entry && entry !== 'loading' && entry.constructor) {
      // AudioBuffer ready — play it.
      ensureRunning();
      try {
        var src = c.createBufferSource();
        var g = c.createGain();
        src.buffer = entry;
        g.gain.value = MASTER_GAIN;
        src.connect(g); g.connect(c.destination);
        src.start();
        return true;
      } catch(e){ return false; }
    }
    if (entry === 'loading') return false;
    // First touch: kick the fetch in the background, fall back to synth
    // this call. Subsequent calls hit the cached AudioBuffer.
    mp3[name] = 'loading';
    fetch(SFX_BASE + name + '.mp3', { credentials: 'omit', cache: 'force-cache' })
      .then(function(r){
        if (!r.ok) throw new Error('http ' + r.status);
        return r.arrayBuffer();
      })
      .then(function(ab){
        // decodeAudioData works on a suspended context; we don't need
        // the user gesture to have happened yet.
        return new Promise(function(resolve, reject){
          c.decodeAudioData(ab, resolve, reject);
        });
      })
      .then(function(buf){ mp3[name] = buf; })
      .catch(function(){ mp3[name] = 'missing'; });
    return false;
  }

  // Optional: preload the whole bank in the background so the FIRST
  // call to each cue lands as an MP3 (not synth). Triggered on the
  // first user gesture so we don't create the AudioContext early. No-op
  // if the AudioContext can't be created or the user is muted.
  var preloaded = false;
  function preload(){
    if (preloaded) return;
    preloaded = true;
    ['click','send','receive','success','confirm','error'].forEach(function(name){
      if (mp3[name] === undefined){
        // Same code path as playMP3's first-touch branch, but without
        // attempting to play. Kicks the fetch + decode pipeline so the
        // buffer is warm by the time the user actually triggers the cue.
        var c = getCtx();
        if (!c) return;
        mp3[name] = 'loading';
        fetch(SFX_BASE + name + '.mp3', { credentials: 'omit', cache: 'force-cache' })
          .then(function(r){ if (!r.ok) throw 0; return r.arrayBuffer(); })
          .then(function(ab){
            return new Promise(function(resolve, reject){
              c.decodeAudioData(ab, resolve, reject);
            });
          })
          .then(function(buf){ mp3[name] = buf; })
          .catch(function(){ mp3[name] = 'missing'; });
      }
    });
  }

  // ── Sound palette ──────────────────────────────────────────────────
  // Each cue: try the pre-rendered MP3 first, fall back to the synth
  // chime. Synth chimes are tuned by ear — tweak with caution. Each one
  // is its own paragraph so future contributors can adjust without
  // untangling a chord chart.

  function click(){
    preload();
    if (playMP3('click')) return;
    // Generic tap. 800Hz → 700Hz quick down-tick. Reads as a soft button click.
    tone({ freq: 820, freqEnd: 720, dur: 0.06, peak: 0.10, type: 'sine' });
  }

  function send(){
    preload();
    if (playMP3('send')) return;
    // User commits a message / submit. Upward 600 → 920 sweep, brief.
    tone({ freq: 600, freqEnd: 920, dur: 0.13, peak: 0.16, type: 'sine' });
  }

  function receive(){
    preload();
    if (playMP3('receive')) return;
    // Other party / AI reply lands. Downward 760 → 540 + small tail.
    tone({ freq: 760, freqEnd: 540, dur: 0.18, peak: 0.18, type: 'sine' });
    tone({ freq: 360, dur: 0.22, peak: 0.07, type: 'sine', delayMs: 60 });
  }

  function success(){
    preload();
    if (playMP3('success')) return;
    // Milestone — round complete, ballot ready, accept confirmed.
    // C-E-G major arpeggio at ~120ms intervals.
    tone({ freq: 523.25, dur: 0.18, peak: 0.16, type: 'sine', delayMs: 0 });   // C5
    tone({ freq: 659.25, dur: 0.18, peak: 0.16, type: 'sine', delayMs: 90 });  // E5
    tone({ freq: 783.99, dur: 0.30, peak: 0.18, type: 'sine', delayMs: 180 }); // G5
  }

  function error(){
    preload();
    if (playMP3('error')) return;
    // Failure cue. Low triangle sweep 280 → 180. Triangle gives it a
    // bit more grit than sine without going full square-wave abrasive.
    tone({ freq: 280, freqEnd: 180, dur: 0.22, peak: 0.18, type: 'triangle' });
  }

  function confirm(){
    preload();
    if (playMP3('confirm')) return;
    // User-committed action (splash tap, accept-pressed-yes). Warm
    // 700Hz pure sine, slightly longer than click(), no sweep.
    tone({ freq: 700, dur: 0.16, peak: 0.16, type: 'sine' });
  }

  function notify(){
    preload();
    if (playMP3('notify')) return;
    // Inbound DM / group message. A soft two-note rising "ding-dong"
    // (E6 → A6, perfect fourth) — lighter and quicker than success()'s
    // three-note arpeggio so a chat ping never reads as a milestone.
    // Low peaks so a notification mid-task isn't startling.
    tone({ freq: 1318.51, dur: 0.14, peak: 0.12, type: 'sine', delayMs: 0 });   // E6
    tone({ freq: 1760.00, dur: 0.22, peak: 0.13, type: 'sine', delayMs: 110 }); // A6
  }

  // ── Round-clock sounds ─────────────────────────────────────────────
  // The useTimer in debate-it.html historically fired raw `beep()` calls
  // against its own AudioContext, which (a) duplicated boilerplate and
  // (b) bypassed the global mute. Both now route through SFX so the
  // speaker toggle in the topbar actually silences the room. Pitches
  // preserve the prior debate-ai mapping: lower for "still time," rising
  // as the clock approaches zero (A4 → E5 → A5).
  function timeWarning(secondsLeft){
    // Auto-pick urgency by seconds remaining. Called from inside the
    // timer's tick — caller passes the current remaining seconds and
    // we choose the appropriate chime. Falls back to the mid-tier
    // ping if no argument given.
    var s = +secondsLeft;
    if (s >= 50)       tone({ freq: 440, dur: 0.22, peak: 0.14, type: 'sine' });  // 1 min: A4
    else if (s >= 25)  tone({ freq: 660, dur: 0.16, peak: 0.15, type: 'sine' });  // 30s:  E5
    else               tone({ freq: 880, dur: 0.14, peak: 0.16, type: 'sine' });  // 15s:  A5
  }

  function timeUp(){
    // End of speech. Firmer than a warning ping — debater has to know
    // the round clock just hit zero. Triangle wave at low fundamental
    // gives it a "buzzer" timbre without going full klaxon; a small
    // upward sweep at the tail keeps it from sounding mournful.
    tone({ freq: 220, freqEnd: 260, dur: 0.42, peak: 0.20, type: 'triangle' });
    tone({ freq: 165, dur: 0.30, peak: 0.10, type: 'triangle', delayMs: 80 });
  }

  function rfdReveal(){
    // Judge ballot lands. Bigger than success() — a deeper opening
    // beat (the "envelope opening") followed by a wider four-note
    // ascent (C-E-G-C) so it reads as a verdict, not just a milestone.
    tone({ freq: 110, dur: 0.18, peak: 0.16, type: 'triangle', delayMs: 0 });  // A2 thump
    tone({ freq: 523.25, dur: 0.18, peak: 0.16, type: 'sine', delayMs: 140 }); // C5
    tone({ freq: 659.25, dur: 0.18, peak: 0.16, type: 'sine', delayMs: 240 }); // E5
    tone({ freq: 783.99, dur: 0.18, peak: 0.17, type: 'sine', delayMs: 340 }); // G5
    tone({ freq: 1046.5, dur: 0.42, peak: 0.18, type: 'sine', delayMs: 440 }); // C6
  }

  // ── AI-thinking ambience ──────────────────────────────────────────
  // Sustained two-oscillator drone that signals "model is working on
  // your reply." Returns a stop function so the caller can fade it out
  // when generation finishes. Mirrors the shape of the inline ambience
  // in debate-it.html so /voice-debate's "thinking" beat sounds like
  // the same product. Low carrier with a 2Hz LFO = heartbeat; mid pad
  // with a 0.6Hz LFO = warm shimmer. A short rising starter chime gives
  // the user an immediate "starting" cue (the bare ambience is so quiet
  // some users couldn't tell anything was happening).
  function thinking(){
    // RESTORED 2026-05-24 per user request ("i miss the sound effect on
    // the orb when it was loading for debate AI page"). Scoped revert
    // of the 2026-05-21 blanket "no ambient audio" removal: the
    // thinking ambience is contextual (gated to AI generation), unlike
    // the uninvited landing-scroll ambient() swells which stay no-op'd.
    if (isMuted()) return function(){};
    var c = getCtx();
    if (!c) return function(){};
    ensureRunning();
    var t0 = c.currentTime;
    var nodes = [];

    // Starter chime — 620→880Hz brief sweep so the user gets an
    // immediate "thinking has started" cue. Standalone, doesn't loop.
    try {
      var cO = c.createOscillator();
      var cG = c.createGain();
      cO.connect(cG); cG.connect(c.destination);
      cO.type = 'sine';
      cO.frequency.setValueAtTime(620, t0);
      cO.frequency.exponentialRampToValueAtTime(880, t0 + 0.18);
      cG.gain.setValueAtTime(0, t0);
      cG.gain.linearRampToValueAtTime(0.08 * MASTER_GAIN, t0 + 0.03);
      cG.gain.exponentialRampToValueAtTime(0.001, t0 + 0.32);
      cO.start(t0); cO.stop(t0 + 0.34);
    } catch(e){}

    // Low carrier — 80Hz sine with 2Hz LFO modulation on gain = heartbeat.
    try {
      var o = c.createOscillator();
      var g = c.createGain();
      var lfo = c.createOscillator();
      var lfoG = c.createGain();
      o.connect(g); g.connect(c.destination);
      o.frequency.value = 80; o.type = 'sine';
      lfo.connect(lfoG); lfoG.connect(g.gain);
      lfo.frequency.value = 2; lfo.type = 'sine';
      lfoG.gain.value = 0.05 * MASTER_GAIN;
      g.gain.setValueAtTime(0, t0);
      g.gain.linearRampToValueAtTime(0.08 * MASTER_GAIN, t0 + 0.25);
      o.start(t0); lfo.start(t0);
      nodes.push(o, lfo, g);
    } catch(e){}

    // Mid pad — 240Hz sine with slower 0.6Hz LFO = warm shimmer.
    try {
      var o2 = c.createOscillator();
      var g2 = c.createGain();
      var lfo2 = c.createOscillator();
      var lfo2G = c.createGain();
      o2.connect(g2); g2.connect(c.destination);
      o2.frequency.value = 240; o2.type = 'sine';
      lfo2.connect(lfo2G); lfo2G.connect(g2.gain);
      lfo2.frequency.value = 0.6; lfo2.type = 'sine';
      lfo2G.gain.value = 0.015 * MASTER_GAIN;
      g2.gain.setValueAtTime(0, t0);
      g2.gain.linearRampToValueAtTime(0.04 * MASTER_GAIN, t0 + 0.4);
      o2.start(t0); lfo2.start(t0);
      nodes.push(o2, lfo2, g2);
    } catch(e){}

    return function stop(){
      try {
        var tEnd = c.currentTime;
        nodes.forEach(function(n){
          if (n.gain) {
            try { n.gain.exponentialRampToValueAtTime(0.0001, tEnd + 0.3); } catch(e){}
          }
        });
        nodes.forEach(function(n){
          if (n.stop) {
            try { n.stop(tEnd + 0.4); } catch(e){}
          }
        });
      } catch(e){}
    };
  }

  // ── Ambient pad (one-shot, smooth) ─────────────────────────────────
  // Soft synth swell for passive scroll cues on /landing. Replaces the
  // punchy arpeggio chimes that section-boundary triggers used to fire
  // — those read as "linear, out of nowhere" because arpeggios have a
  // sharp note onset and a clear musical interval. This is the inverse:
  // ~1.2s sine pad with a 300ms gentle attack, slow release, no
  // harmonic shimmer fast enough to read as melody. Brain-wave / focus
  // ambience, not a chime. Caller can pass `pitch` ('low' | 'mid' |
  // 'high') to vary the fundamental between section transitions so
  // consecutive triggers don't feel like the same note repeating.
  function ambient(opts){
    // Brain-wave / focus ambience swell removed 2026-05-21 per user
    // request (no ambient background audio anywhere in the app). No-op.
    return;
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
  // MERGE, don't replace. debate-it.html has an inline `const SFX = {...}`
  // with richer methods (startRound, thinking, ready, preparing, etc.)
  // that get hoisted to window.SFX after Babel transpiles the inline
  // text/babel script (const → var → window prop). topbar.js then
  // injects this file deferred, AFTER the inline scope has already
  // populated window.SFX. A bare `window.SFX = {...}` here would clobber
  // those page-specific methods, breaking Quick Clash + every other
  // round-start path on debate-it.html (the user got
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
    notify: notify,
    timeWarning: timeWarning,
    timeUp: timeUp,
    rfdReveal: rfdReveal,
    thinking: thinking,
    ambient: ambient,
    preload: preload,
    isMuted: isMuted,
    mute: function(){ setMuted(true); },
    unmute: function(){ setMuted(false); },
    toggleMute: function(){ var m = !isMuted(); setMuted(m); return m; },
  };
  window.SFX = Object.assign({}, sharedSFX, window.SFX || {});
})();
