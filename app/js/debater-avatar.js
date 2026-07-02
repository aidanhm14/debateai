/* ============================================================
   debater-avatar.js  ·  window.DebaterAvatar
   ------------------------------------------------------------
   Shared, dependency-free avatar toolkit for DebateIt.

   Promoted from the inline persona-avatar generator that used to
   live in landing.html (the muted-bust SVG set + HAIR variants).
   This is now the single source of truth: landing, voice-debate,
   and any future surface mount avatars through this module.

   Brand aesthetic (see soul.md): warm paper / ink / red #a4201d,
   Crimson Pro serif, MUTED persona hues (low saturation) so the
   busts harmonize with the page instead of shouting.

   Public API (all on window.DebaterAvatar):
     PERSONAS                         -> array of {key,name,style,hue}
     get(personaKey)                  -> persona object (or a fallback)
     svg(personaKey, size)            -> SVG markup string
     render(container, opts)          -> mount an avatar into a node
     pick(container, opts)            -> render a persona-picker grid
     assignFromUid(uid)               -> deterministic persona key
     attach(el)                       -> speaking-state controller
     driveFromStream(stream, ctrl)    -> pump levels from a MediaStream
     driveFromElement(audioEl, ctrl)  -> pump levels from an <audio>/<video>

   No framework. No build step. Plain ES5-ish so it rides safely on
   the precompiled pages (voice-debate.html) as an external file.
   ============================================================ */
(function (global) {
  'use strict';

  /* ---- prefers-reduced-motion (respected by the speaking pulse) ---- */
  var REDUCED_MOTION = false;
  try {
    REDUCED_MOTION = !!(global.matchMedia &&
      global.matchMedia('(prefers-reduced-motion: reduce)').matches);
  } catch (e) { /* no matchMedia: assume motion is fine */ }

  /* ---- Persona roster --------------------------------------------
     Extends the landing's original 6 muted busts to a roster that
     covers the debate-facing TTS personas. Each hue is deliberately
     desaturated so a wall of them reads calm, not carnival. `style`
     is a single lowercase word that renders under the name.

     `key` is the stable identifier used by assignFromUid + callers.
     Where a key matches a voice-debate PERSONALITIES archetype we
     keep the debate-facing name so the two surfaces line up.        */
  var PERSONAS = [
    { key: 'professor',   name: 'The Professor',   style: 'measured',   hue: '#5b6b7a' },
    { key: 'prosecutor',  name: 'The Prosecutor',  style: 'relentless', hue: '#8a3b34' },
    { key: 'diplomat',    name: 'The Diplomat',    style: 'disarming',  hue: '#4f7d76' },
    { key: 'philosopher', name: 'The Philosopher', style: 'patient',    hue: '#6a5b8a' },
    { key: 'firebrand',   name: 'The Firebrand',   style: 'fierce',     hue: '#b85042' },
    { key: 'heckler',     name: 'The Heckler',     style: 'sardonic',   hue: '#6f6553' },
    { key: 'closer',      name: 'The Closer',      style: 'certain',    hue: '#8a5a6a' },
    { key: 'veteran',     name: 'The Veteran',     style: 'unhurried',  hue: '#4a5568' },
    { key: 'surgeon',     name: 'The Surgeon',     style: 'precise',    hue: '#4d6f78' },
    { key: 'debater',     name: 'The Debater',     style: 'versatile',  hue: '#6b6a58' },
    { key: 'storyteller', name: 'The Storyteller', style: 'grounded',   hue: '#8a6a4a' },
    { key: 'statesman',   name: 'The Statesman',   style: 'composed',   hue: '#4a6b5b' },
    { key: 'barrister',   name: 'The Barrister',   style: 'exacting',   hue: '#5a5a72' },
    { key: 'upstart',     name: 'The Upstart',     style: 'restless',   hue: '#9a6b4a' },
    { key: 'disruptor',   name: 'The Disruptor',   style: 'contrarian', hue: '#7a5560' },
    { key: 'tactician',   name: 'The Tactician',   style: 'calculating',hue: '#556676' },
    { key: 'examiner',    name: 'The Examiner',    style: 'exacting',   hue: '#6a5b8a' }
  ];

  var PERSONA_BY_KEY = {};
  for (var pi = 0; pi < PERSONAS.length; pi++) PERSONA_BY_KEY[PERSONAS[pi].key] = PERSONAS[pi];

  /* Hairline variants (three silhouettes). Indexed off the persona
     position so the same key always draws the same head, but the set
     visibly varies across a roster. Straight from the landing set.  */
  var HAIR = [
    'M26 44 Q26 22 50 22 Q74 22 74 44 L74 40 Q68 30 50 30 Q32 30 26 40 Z',
    'M26 44 Q26 22 50 22 Q74 22 74 44 L74 42 Q70 26 50 26 Q40 26 34 34 Q30 38 26 42 Z',
    'M24 46 Q22 20 50 20 Q78 20 76 46 Q72 32 62 30 Q60 24 50 24 Q40 24 38 30 Q28 32 24 46 Z'
  ];

  /* ---- Deterministic hash (stable across sessions/reloads) -------- */
  function hashInt(s) {
    s = String(s == null ? '' : s);
    var h = 0, i;
    for (i = 0; i < s.length; i++) { h = (h * 31 + s.charCodeAt(i)) >>> 0; }
    return h;
  }

  /* Resolve a persona from a key. Unknown/empty keys fall through to
     a deterministic pick so callers never render a blank tile.       */
  function get(personaKey) {
    if (personaKey && PERSONA_BY_KEY[personaKey]) return PERSONA_BY_KEY[personaKey];
    return PERSONAS[hashInt(personaKey) % PERSONAS.length];
  }

  function indexOfKey(personaKey) {
    for (var i = 0; i < PERSONAS.length; i++) if (PERSONAS[i].key === personaKey) return i;
    return hashInt(personaKey) % PERSONAS.length;
  }

  /* Deterministic persona for an anonymous uid / any stable string.
     Same input -> same key, forever. Used so anon users keep one
     avatar identity across visits.                                   */
  function assignFromUid(uid) {
    return PERSONAS[hashInt(uid) % PERSONAS.length].key;
  }

  /* ---- SVG generator --------------------------------------------
     A muted bust: paper tile, shoulders in the persona hue, a small
     red lapel notch (the brand accent), a neutral face, and a hair
     silhouette. The mouth <path> carries id "mouth-*" and a
     data-mouth attribute so the speaking controller can animate it.  */
  var _mouthSeq = 0;
  function svg(personaKey, size) {
    size = size || 66;
    var p = get(personaKey);
    var hair = HAIR[indexOfKey(p.key) % HAIR.length];
    var mid = 'dav-mouth-' + (++_mouthSeq);
    return '<svg viewBox="0 0 100 100" width="' + size + '" height="' + size + '" ' +
      'xmlns="http://www.w3.org/2000/svg" class="dav-svg" data-persona="' + p.key + '" aria-hidden="true">' +
      '<rect x="1" y="1" width="98" height="98" rx="16" fill="#f2ece0" stroke="#e5e0d4"/>' +
      '<path d="M18 100 Q18 68 50 68 Q82 68 82 100 Z" fill="' + p.hue + '"/>' +
      '<path d="M42 88 L50 78 L58 88 Z" fill="#a4201d" opacity="0.9"/>' +
      '<circle cx="50" cy="48" r="22" fill="#e9dfce" stroke="#cbbfa8"/>' +
      '<circle cx="42" cy="47" r="2.1" fill="#3a332a"/><circle cx="58" cy="47" r="2.1" fill="#3a332a"/>' +
      '<path id="' + mid + '" data-mouth="1" d="M44 56 Q50 60 56 56" ' +
      'stroke="#7a6a55" stroke-width="1.6" fill="none" stroke-linecap="round"/>' +
      '<path d="' + hair + '" fill="' + p.hue + '"/>' +
      '</svg>';
  }

  /* ---- render() : mount one avatar ------------------------------- */
  function render(container, opts) {
    if (!container) return null;
    opts = opts || {};
    var personaKey = opts.personaKey || (opts.uid ? assignFromUid(opts.uid) : PERSONAS[0].key);
    container.innerHTML = svg(personaKey, opts.size || 66);
    return container.querySelector('svg');
  }

  /* ---- pick() : a small persona-picker grid ----------------------
     Renders a grid of avatar buttons. Calls opts.onPick(key) on
     selection and marks the current one aria-pressed. Fully styled
     inline so it needs no external CSS; the host page's --card /
     --line / --ink tokens are honored when present.                 */
  function pick(container, opts) {
    if (!container) return;
    opts = opts || {};
    var current = opts.current || null;
    var roster = opts.personas || PERSONAS;
    var size = opts.size || 54;
    container.innerHTML = '';
    container.className = (container.className || '') + ' dav-pick';

    roster.forEach(function (p) {
      var btn = global.document.createElement('button');
      btn.type = 'button';
      btn.className = 'dav-pick-item';
      btn.setAttribute('data-key', p.key);
      btn.setAttribute('aria-pressed', current === p.key ? 'true' : 'false');
      btn.title = p.name + ' · ' + p.style;
      btn.innerHTML =
        '<span class="dav-pick-av">' + svg(p.key, size) + '</span>' +
        '<span class="dav-pick-name">' + p.name + '</span>' +
        '<span class="dav-pick-style">' + p.style + '</span>';
      btn.addEventListener('click', function () {
        var items = container.querySelectorAll('.dav-pick-item');
        for (var i = 0; i < items.length; i++) items[i].setAttribute('aria-pressed', 'false');
        btn.setAttribute('aria-pressed', 'true');
        current = p.key;
        if (typeof opts.onPick === 'function') opts.onPick(p.key);
      });
      container.appendChild(btn);
    });
    return container;
  }

  /* ---- attach() : the speaking-state controller ------------------
     Wraps a mounted-avatar element (the node that holds the <svg>)
     and gives it life:
       setLevel(0..1)   -> glow ring intensity + subtle scale/pulse
                           + mouth open proportional to level
       setSpeaking(bool)-> toggles the "is-speaking" active state
       stop()           -> detaches drivers, cancels rAF, resets

     Visuals are driven by CSS custom properties on the element:
       --dav-level  (0..1)  and  the .dav-live / .dav-speaking classes.
     prefers-reduced-motion suppresses the scale/pulse; the glow ring
     (opacity only) still fades in so speaking is still legible.      */
  function attach(el) {
    if (!el) return null;
    var mouth = el.querySelector('[data-mouth]');
    var mouthBaseD = mouth ? mouth.getAttribute('d') : null;
    var speaking = false;
    var level = 0;
    var target = 0;
    var rafId = null;
    var driverStop = null;   // set by driveFromStream / driveFromElement
    var detached = false;

    el.classList.add('dav-live');

    // Smoothly ease the rendered level toward the latest target so
    // sudden analyser spikes don't strobe the avatar.
    function frame() {
      rafId = global.requestAnimationFrame(frame);
      level += (target - level) * 0.35;
      if (level < 0.001) level = 0;
      applyVisual();
    }

    function applyVisual() {
      // Gate glow on speaking so a hot mic doesn't light up the AI tile.
      var shown = speaking ? level : level * 0.15;
      el.style.setProperty('--dav-level', shown.toFixed(3));
      if (mouth && mouthBaseD) {
        // Open the mouth path proportional to level (only while speaking).
        var open = speaking ? Math.min(1, shown) : 0;
        // Base mouth is a gentle smile at y~56-60; drop the control
        // point to "open" the mouth as level rises (max ~7px).
        var cy = 58 + open * 7;
        var ey = 56 + open * 2.5;
        mouth.setAttribute('d', 'M44 ' + ey.toFixed(1) + ' Q50 ' + cy.toFixed(1) + ' 56 ' + ey.toFixed(1));
      }
    }

    function ensureRaf() {
      if (rafId == null && !detached) rafId = global.requestAnimationFrame(frame);
    }

    var ctrl = {
      el: el,
      setLevel: function (v) {
        target = Math.max(0, Math.min(1, +v || 0));
        ensureRaf();
      },
      setSpeaking: function (on) {
        speaking = !!on;
        el.classList.toggle('dav-speaking', speaking);
        if (!speaking) { target = 0; }
        // In reduced-motion we still toggle the class (CSS decides to
        // show a static ring instead of a pulse).
        el.classList.toggle('dav-reduced', REDUCED_MOTION);
        ensureRaf();
      },
      // Called by the drivers below; kept public so callers can swap.
      _setDriverStop: function (fn) { driverStop = fn; },
      stop: function () {
        detached = true;
        if (rafId != null) { global.cancelAnimationFrame(rafId); rafId = null; }
        if (typeof driverStop === 'function') { try { driverStop(); } catch (e) {} driverStop = null; }
        target = 0; level = 0;
        el.style.setProperty('--dav-level', '0');
        el.classList.remove('dav-speaking');
        if (mouth && mouthBaseD) mouth.setAttribute('d', mouthBaseD);
      }
    };
    return ctrl;
  }

  /* ---- WebAudio helpers ------------------------------------------ */
  var _sharedCtx = null;
  function getCtx() {
    if (_sharedCtx) return _sharedCtx;
    var AC = global.AudioContext || global.webkitAudioContext;
    if (!AC) return null;
    try { _sharedCtx = new AC(); } catch (e) { return null; }
    return _sharedCtx;
  }

  // Compute a normalized 0..1 loudness from an analyser buffer.
  function levelOf(analyser, buf) {
    analyser.getByteFrequencyData(buf);
    var s = 0;
    for (var i = 0; i < buf.length; i++) s += buf[i];
    return Math.min(1, (s / buf.length / 255) * 1.7);
  }

  /* driveFromStream(mediaStream, ctrl)
     Builds an AnalyserNode on a live MediaStream (mic or remote AI
     stream) and pumps ctrl.setLevel every frame. Returns a stop fn;
     it's also registered on the controller so ctrl.stop() cleans up. */
  function driveFromStream(mediaStream, ctrl) {
    var ctx = getCtx();
    if (!ctx || !mediaStream || !ctrl) return function () {};
    var src, an, buf, rafId, stopped = false;
    try {
      src = ctx.createMediaStreamSource(mediaStream);
      an = ctx.createAnalyser();
      an.fftSize = 512;
      an.smoothingTimeConstant = 0.7;
      src.connect(an);
      buf = new Uint8Array(an.frequencyBinCount);
    } catch (e) { return function () {}; }

    function tick() {
      if (stopped) return;
      rafId = global.requestAnimationFrame(tick);
      try { ctrl.setLevel(levelOf(an, buf)); } catch (e) {}
    }
    rafId = global.requestAnimationFrame(tick);

    var stop = function () {
      stopped = true;
      if (rafId != null) { global.cancelAnimationFrame(rafId); rafId = null; }
      try { src.disconnect(); } catch (e) {}
      try { an.disconnect(); } catch (e) {}
    };
    if (ctrl._setDriverStop) ctrl._setDriverStop(stop);
    return stop;
  }

  /* driveFromElement(audioEl, ctrl)
     Same idea but taps a playing <audio>/<video> element. Note: an
     element can only be routed through one MediaElementSource ever,
     so we cache it on the element to avoid the "already connected"
     throw on re-attach. Because createMediaElementSource re-routes
     the element's audio through the graph, we reconnect it to the
     destination so the user still hears it.                          */
  function driveFromElement(audioEl, ctrl) {
    var ctx = getCtx();
    if (!ctx || !audioEl || !ctrl) return function () {};
    var an, buf, rafId, stopped = false, src;
    try {
      if (audioEl._davSource) {
        src = audioEl._davSource;
      } else {
        src = ctx.createMediaElementSource(audioEl);
        audioEl._davSource = src;
        try { src.connect(ctx.destination); } catch (e) {}
      }
      an = ctx.createAnalyser();
      an.fftSize = 512;
      an.smoothingTimeConstant = 0.7;
      src.connect(an);
      buf = new Uint8Array(an.frequencyBinCount);
    } catch (e) { return function () {}; }

    function tick() {
      if (stopped) return;
      rafId = global.requestAnimationFrame(tick);
      try { ctrl.setLevel(levelOf(an, buf)); } catch (e) {}
    }
    rafId = global.requestAnimationFrame(tick);

    var stop = function () {
      stopped = true;
      if (rafId != null) { global.cancelAnimationFrame(rafId); rafId = null; }
      try { an.disconnect(); } catch (e) {}
    };
    if (ctrl._setDriverStop) ctrl._setDriverStop(stop);
    return stop;
  }

  /* ---- Inject the small CSS the module owns ----------------------
     Kept minimal + token-aware. Callers get working visuals without
     copying CSS into every page. Idempotent (guards on an id).       */
  function injectCSS() {
    if (!global.document || global.document.getElementById('dav-style')) return;
    var css =
      '.dav-svg{display:block}' +
      /* Live tile: the glow ring is a box-shadow whose spread/alpha
         scales with --dav-level. Speaking adds a subtle scale pulse. */
      '.dav-live{position:relative;--dav-level:0;transition:transform .12s ease-out;' +
        'border-radius:16px;will-change:transform}' +
      '.dav-live::after{content:"";position:absolute;inset:-3px;border-radius:19px;pointer-events:none;' +
        'box-shadow:0 0 0 2px rgba(164,32,29,calc(var(--dav-level)*0.55)),' +
        '0 0 calc(10px + var(--dav-level)*22px) rgba(164,32,29,calc(var(--dav-level)*0.5));' +
        'opacity:calc(0.15 + var(--dav-level)*0.85);transition:opacity .12s}' +
      '.dav-speaking{transform:scale(calc(1 + var(--dav-level)*0.05))}' +
      /* reduced-motion: no scale, glow ring only (opacity animates,
         which is exempt-ish + cheap; we hold scale at 1). */
      '.dav-reduced.dav-speaking{transform:none}' +
      /* Picker grid */
      '.dav-pick{display:flex;flex-wrap:wrap;gap:10px;justify-content:center}' +
      '.dav-pick-item{width:96px;background:var(--card,#fbfaf5);border:1px solid var(--line,#e5e0d4);' +
        'border-radius:12px;padding:10px 8px 9px;text-align:center;cursor:pointer;' +
        'transition:border-color .15s,box-shadow .15s;font:inherit}' +
      '.dav-pick-item:hover{border-color:var(--accent,#a4201d)}' +
      '.dav-pick-item[aria-pressed="true"]{border-color:var(--accent,#a4201d);' +
        'box-shadow:0 0 0 1px var(--accent,#a4201d)}' +
      '.dav-pick-av{display:block;margin:0 auto 6px;width:54px;height:54px}' +
      '.dav-pick-av svg{width:54px;height:54px}' +
      '.dav-pick-name{display:block;font-family:"Crimson Pro",Georgia,serif;font-weight:600;' +
        'font-size:.9rem;color:var(--ink,#1c1b18);line-height:1.1}' +
      '.dav-pick-style{display:block;font-size:.66rem;letter-spacing:.04em;text-transform:uppercase;' +
        'color:var(--dim,#8b867c);margin-top:2px}';
    var st = global.document.createElement('style');
    st.id = 'dav-style';
    st.textContent = css;
    (global.document.head || global.document.documentElement).appendChild(st);
  }
  if (global.document) {
    // Inject on load; safe to call multiple times.
    injectCSS();
  }

  /* ---- Public surface -------------------------------------------- */
  global.DebaterAvatar = {
    PERSONAS: PERSONAS,
    HAIR: HAIR,
    get: get,
    svg: svg,
    render: render,
    pick: pick,
    assignFromUid: assignFromUid,
    hashInt: hashInt,
    attach: attach,
    driveFromStream: driveFromStream,
    driveFromElement: driveFromElement,
    injectCSS: injectCSS,
    reducedMotion: REDUCED_MOTION
  };

})(typeof window !== 'undefined' ? window : this);
