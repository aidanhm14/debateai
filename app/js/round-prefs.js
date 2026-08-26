/* round-prefs.js — the tunables behind a live round, in one place.
 *
 * /settings lets someone change how responsive the AI is; newvoice.html is
 * what actually obeys it. Those are two files, and a knob whose label lives
 * in one and whose number lives in the other drifts the first time either is
 * edited. So the option list, the labels, and the numbers all live here, and
 * both sides read them: the page renders itself off DEFS, the engine reads
 * val() at the moment it needs a number.
 *
 * DEFAULTS ARE TODAY'S BEHAVIOR, exactly. Every `def` below is the constant
 * newvoice.html shipped with, so a visitor who never opens /settings gets a
 * byte-identical round, and every accessor falls back to that default if this
 * file fails to load. A settings module that can brick the mic when it 404s
 * is a bad trade for a preference nobody set.
 *
 * Keys are synced per-account by prefs-sync.js, so these follow the person to
 * their phone rather than being a fresh factory reset on every device.
 */
(function () {
  'use strict';

  // Each option carries the numbers the engine uses AND the copy the page
  // shows. `hint` is the concrete consequence, not a restatement of the
  // label: someone tuning this wants to know what changes, in seconds.
  var DEFS = {
    mic: {
      key: 'da-nv-mic',
      def: 'free',
      label: 'Microphone',
      help: 'Hands free listens for a pause. Tap to speak holds the floor until you tap again, so a long pause never hands it over.',
      opts: [
        { id: 'free', label: 'Hands free', hint: 'The AI answers when you pause.' },
        { id: 'ptt',  label: 'Tap to speak', hint: 'The AI answers when you tap.' },
      ],
    },
    turnWait: {
      key: 'da-turn-wait',
      def: 'balanced',
      label: 'Pause before the AI replies',
      help: 'How long you can go quiet mid-thought before the AI treats your turn as finished. Longer is safer if you think out loud. Hands free only.',
      opts: [
        { id: 'snappy',   label: 'Short',  hint: 'About 1.2 seconds.', ms: 1200 },
        { id: 'balanced', label: 'Normal', hint: 'About 2.4 seconds.', ms: 2400 },
        { id: 'patient',  label: 'Long',   hint: 'About 3.2 seconds.', ms: 3200 },
      ],
    },
    // Framed as the room, not as "sensitivity". A sensitivity slider reads
    // backwards half the time (does high sensitivity mean it hears more, or
    // that it takes more to trigger?); nobody misreads which room they are in.
    room: {
      key: 'da-room-noise',
      def: 'normal',
      label: 'Your room',
      help: 'Sets how loud something has to be before it counts as you talking. The round also measures your actual background noise on connect; this scales that.',
      opts: [
        { id: 'quiet',  label: 'Quiet',  hint: 'Picks up a soft voice.', gate: 0.72 },
        { id: 'normal', label: 'Normal', hint: 'The default.',           gate: 1 },
        { id: 'noisy',  label: 'Noisy',  hint: 'Ignores more background.', gate: 1.35 },
      ],
    },
    barge: {
      key: 'da-barge',
      def: 'normal',
      label: 'Cutting the AI off',
      help: 'How much it takes to interrupt the AI mid-sentence by talking over it. In tap to speak, one tap always cuts in and this is ignored.',
      opts: [
        { id: 'easy',   label: 'Easy',   hint: 'A word or two takes the floor.', lvl: 0.8,  ms: 750 },
        { id: 'normal', label: 'Normal', hint: 'A clear sentence takes it.',     lvl: 1,    ms: 1100 },
        { id: 'hard',   label: 'Hard',   hint: 'Let it finish unless you insist.', lvl: 1.3, ms: 1600 },
      ],
    },
  };

  // The base gate numbers, so /settings can draw the exact bar your voice has
  // to clear rather than a decorative meter. newvoice.html keeps its own
  // copies as the fallback for when this file is missing, which means these
  // two can drift; scripts/test-round-prefs.mjs asserts they are equal.
  var GATE = { speech: 0.18, noiseMargin: 0.09, noiseCap: 0.24 };

  function optsOf(name) { return (DEFS[name] && DEFS[name].opts) || []; }

  function get(name) {
    var d = DEFS[name];
    if (!d) return null;
    var v = null;
    try { v = localStorage.getItem(d.key); } catch (e) {}
    for (var i = 0; i < d.opts.length; i++) if (d.opts[i].id === v) return v;
    return d.def;   // unknown or absent value is the default, never a crash
  }

  function set(name, id) {
    var d = DEFS[name];
    if (!d) return false;
    for (var i = 0; i < d.opts.length; i++) {
      if (d.opts[i].id !== id) continue;
      try { localStorage.setItem(d.key, id); } catch (e) {}
      return true;
    }
    return false;
  }

  // The engine's accessor. `field` is the number it wants ('ms', 'gate',
  // 'lvl'); `fallback` is the constant it would have used on its own, which
  // is what comes back if anything at all is off.
  function val(name, field, fallback) {
    var id = get(name);
    var opts = optsOf(name);
    for (var i = 0; i < opts.length; i++) {
      if (opts[i].id === id && typeof opts[i][field] === 'number') return opts[i][field];
    }
    return fallback;
  }

  function reset() {
    Object.keys(DEFS).forEach(function (name) {
      try { localStorage.removeItem(DEFS[name].key); } catch (e) {}
    });
  }

  function isDefault() {
    return Object.keys(DEFS).every(function (name) { return get(name) === DEFS[name].def; });
  }

  window.RoundPrefs = {
    DEFS: DEFS, GATE: GATE,
    get: get, set: set, val: val, reset: reset, isDefault: isDefault,
  };
})();
