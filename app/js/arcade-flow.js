/* ─────────────────────────────────────────────────────────────
   ARCADE FLOW — the option-select run.

   Takes a list of questions and runs them one per screen: pick, hear a
   blip, travel to the next, land on a launch panel. Skip answers the
   rest with their defaults and goes straight there.

   window.ArcadeFlow.start({
     steps: [{ key, q, hint, options:[{value,label,sub}], default }],
     onDone: function (answers) { ... },     // required
     onSkip: function (answers) { ... },     // optional, defaults to onDone
     launch: { title, hint, cta }            // the last panel
   })

   SOUND IS SYNTHESISED, NOT DOWNLOADED. Three tones out of WebAudio
   costs zero bytes and zero requests, where a sprite of click.mp3 would
   be a new asset on every page load and another entry in the service
   worker's cache list for something a user hears for 60ms. It also
   means no decode delay before the first press, which is exactly the
   press where a lag reads as a broken button.

   The AudioContext is created on the FIRST PRESS, never on load. Every
   browser refuses to start one before a gesture, and a context created
   at load lands in 'suspended' and stays there, so the first few blips
   are silently dropped. Building it inside the gesture means the first
   press is also the first sound.

   Mute is remembered in localStorage under 'da-arcade-sound'. It is
   honoured before the context is ever built, so a muted visitor never
   constructs an audio graph at all.

   PROGRESSIVE ENHANCEMENT: if this file fails to load, callers keep
   their normal links and buttons. Nothing here is the only path to
   anything.
   ───────────────────────────────────────────────────────────── */
(function () {
  'use strict';

  var SOUND_KEY = 'da-arcade-sound';
  var ctx = null;

  function muted() {
    try { return localStorage.getItem(SOUND_KEY) === 'off'; } catch (e) { return false; }
  }
  function setMuted(v) {
    try { localStorage.setItem(SOUND_KEY, v ? 'off' : 'on'); } catch (e) {}
  }

  /* One short tone. Gain rides an exponential ramp to near-zero rather
     than stopping flat, because an abruptly gated oscillator clicks, and
     that click is louder than the note it is ending. */
  function tone(freq, startAt, dur, peak) {
    var osc = ctx.createOscillator();
    var gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, startAt);
    gain.gain.setValueAtTime(0.0001, startAt);
    gain.gain.exponentialRampToValueAtTime(peak, startAt + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, startAt + dur);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(startAt);
    osc.stop(startAt + dur + 0.02);
  }

  function play(kind) {
    if (muted()) return;
    try {
      if (!ctx) {
        var AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        ctx = new AC();
      }
      // Safari suspends the context when the tab backgrounds and does
      // not resume it on its own.
      if (ctx.state === 'suspended' && ctx.resume) ctx.resume();
      var t = ctx.currentTime;
      if (kind === 'select') {
        tone(660, t, 0.07, 0.06);
        tone(990, t + 0.045, 0.09, 0.045);
      } else if (kind === 'back') {
        tone(420, t, 0.08, 0.05);
      } else if (kind === 'go') {
        tone(587.33, t, 0.1, 0.06);
        tone(880, t + 0.08, 0.14, 0.055);
      } else {
        tone(520, t, 0.05, 0.04);
      }
    } catch (e) { /* audio is decoration; never let it break the flow */ }
  }

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  function start(cfg) {
    if (!cfg || !cfg.steps || !cfg.steps.length || typeof cfg.onDone !== 'function') return null;

    var steps = cfg.steps;
    var answers = {};
    steps.forEach(function (s) {
      answers[s.key] = s['default'] != null ? s['default'] : (s.options[0] && s.options[0].value);
    });

    var root = el('div', 'afl');
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-modal', 'true');
    root.setAttribute('aria-label', cfg.label || 'Set up your round');

    /* ── optional top slot ──
       An element the caller hangs ABOVE the rail, spanning the width and
       staying put while the panels travel underneath. /brain uses it for
       the live-rounds strip: the point of the surface is that you are
       building a brain while real rounds are happening, so that has to be
       visible on every step rather than on a step of its own.

       Purely additive. Callers that pass nothing (native.html) get the
       rail flush to the top exactly as before. */
    if (cfg.topSlot && cfg.topSlot.nodeType === 1) {
      cfg.topSlot.classList.add('afl-top');
      root.appendChild(cfg.topSlot);
    }

    /* ── rail ── */
    var rail = el('div', 'afl-rail');
    var dots = el('div', 'afl-dots');
    var dotEls = [];
    for (var d = 0; d <= steps.length; d++) {
      var dot = el('span', 'afl-dot');
      dots.appendChild(dot);
      dotEls.push(dot);
    }
    rail.appendChild(dots);

    var muteBtn = el('button', 'afl-btn afl-mute');
    muteBtn.type = 'button';
    function paintMute() {
      var off = muted();
      muteBtn.setAttribute('aria-pressed', off ? 'true' : 'false');
      muteBtn.setAttribute('aria-label', off ? 'Turn sound on' : 'Turn sound off');
      muteBtn.innerHTML = off
        ? '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M11 5 6 9H3v6h3l5 4V5Z"/><path d="M22 9.5 20.5 8 18 10.5 15.5 8 14 9.5l2.5 2.5L14 14.5 15.5 16 18 13.5 20.5 16 22 14.5 19.5 12 22 9.5Z"/></svg>'
        : '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M11 5 6 9H3v6h3l5 4V5Z"/><path d="M16 8.5a5 5 0 0 1 0 7v-7Z"/><path d="M18.5 6a8 8 0 0 1 0 12v-2a6 6 0 0 0 0-8V6Z"/></svg>';
    }
    paintMute();
    muteBtn.addEventListener('click', function () {
      setMuted(!muted());
      paintMute();
      play('move');
    });
    rail.appendChild(muteBtn);

    var skipBtn = el('button', 'afl-btn', 'Skip');
    skipBtn.type = 'button';
    rail.appendChild(skipBtn);

    var closeBtn = el('button', 'afl-btn', 'Close');
    closeBtn.type = 'button';
    rail.appendChild(closeBtn);
    root.appendChild(rail);

    /* ── panels ── */
    var track = el('div', 'afl-track');
    /* Set inline and !important, not left to the stylesheet. This element
       must honour a scrollTop write synchronously, because the travel is
       animated frame by frame below. Under `smooth` each write becomes an
       animation instead, and where that animation does not complete it
       swallows every later write and the run freezes on the first panel.
       Measured on /native: the container computed `smooth` from the host
       page even with `scroll-behavior:auto` declared in arcade-flow.css,
       so the only reliable place to win is the element itself. */
    track.style.setProperty('scroll-behavior', 'auto', 'important');
    var panels = [];

    steps.forEach(function (step, i) {
      var panel = el('section', 'afl-panel');
      var inner = el('div', 'afl-panel-in');
      inner.appendChild(el('p', 'afl-step', 'Step ' + (i + 1) + ' of ' + steps.length));
      inner.appendChild(el('h2', 'afl-q', step.q));
      if (step.hint) inner.appendChild(el('p', 'afl-hint', step.hint));

      var group = el('div', 'afl-opts');
      group.setAttribute('role', 'radiogroup');
      group.setAttribute('aria-label', step.q);

      step.options.forEach(function (opt) {
        var b = el('button', 'afl-opt');
        b.type = 'button';
        b.setAttribute('role', 'radio');
        b.setAttribute('aria-checked', answers[step.key] === opt.value ? 'true' : 'false');
        var txt = el('span');
        txt.appendChild(el('span', 'afl-opt-t', opt.label));
        if (opt.sub) txt.appendChild(el('span', 'afl-opt-s', opt.sub));
        b.appendChild(txt);
        b.appendChild(el('span', 'afl-opt-mark', '✓'));
        b.addEventListener('click', function () {
          answers[step.key] = opt.value;
          Array.prototype.forEach.call(group.children, function (sib) {
            sib.setAttribute('aria-checked', sib === b ? 'true' : 'false');
          });
          play('select');
          go(i + 1);
        });
        group.appendChild(b);
      });
      inner.appendChild(group);

      if (i > 0) {
        var back = el('button', 'afl-back', '← Back');
        back.type = 'button';
        back.addEventListener('click', function () { play('back'); go(i - 1); });
        inner.appendChild(back);
      }
      panel.appendChild(inner);
      track.appendChild(panel);
      panels.push(panel);
    });

    /* ── launch panel ── */
    var launch = cfg.launch || {};
    var lp = el('section', 'afl-panel');
    var lpIn = el('div', 'afl-panel-in');
    lpIn.appendChild(el('p', 'afl-step', 'Ready'));
    lpIn.appendChild(el('h2', 'afl-q', launch.title || 'That is the setup.'));
    if (launch.hint) lpIn.appendChild(el('p', 'afl-hint', launch.hint));
    var summary = el('ul', 'afl-summary');
    lpIn.appendChild(summary);
    var goBtn = el('button', 'afl-go', launch.cta || 'Start the round');
    goBtn.type = 'button';
    goBtn.addEventListener('click', function () {
      play('go');
      close();
      cfg.onDone(answers);
    });
    lpIn.appendChild(goBtn);
    var lback = el('button', 'afl-back', '← Change something');
    lback.type = 'button';
    lback.addEventListener('click', function () { play('back'); go(steps.length - 1); });
    lpIn.appendChild(lback);
    lp.appendChild(lpIn);
    track.appendChild(lp);
    panels.push(lp);
    root.appendChild(track);

    function paintSummary() {
      summary.innerHTML = '';
      steps.forEach(function (step) {
        var picked = null;
        step.options.forEach(function (o) { if (o.value === answers[step.key]) picked = o; });
        var li = el('li');
        li.appendChild(el('span', null, step.summaryLabel || step.q));
        li.appendChild(el('b', null, picked ? picked.label : String(answers[step.key])));
        summary.appendChild(li);
      });
    }

    var at = 0;
    var tween = 0;
    var settleTimer = 0;

    /* The travel is animated by hand rather than with behavior:'smooth'.
       Native smooth scrolling is a request the engine may simply never
       complete, and when it does not, the pending animation SWALLOWS
       every later scrollTop write, so the menu freezes on panel one and
       nothing you do afterwards moves it. Measured directly: a smooth
       scrollTo never arrived, and a plain scrollTop assignment issued
       after it was discarded too. A rAF tween lands every time, is
       cancellable, and is the same few lines.

       Mandatory snap is turned off for the duration: snapping and a
       per-frame scrollTop write are two things steering one scroller,
       and the snap wins by yanking the position back mid-tween. It is
       restored on the frame after landing, so touch scrolling keeps
       snapping normally. */
    function travelTo(top) {
      if (tween) cancelAnimationFrame(tween);
      var from = track.scrollTop;
      var dist = top - from;
      var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (reduce || Math.abs(dist) < 2 || !window.requestAnimationFrame) {
        track.scrollTop = top;
        return;
      }
      var prevSnap = track.style.scrollSnapType;
      track.style.scrollSnapType = 'none';
      var t0 = 0;
      var DUR = 380;
      function land() {
        if (tween) { cancelAnimationFrame(tween); tween = 0; }
        if (settleTimer) { clearTimeout(settleTimer); settleTimer = 0; }
        track.scrollTop = top;
        track.style.scrollSnapType = prevSnap;
      }
      /* Belt to the tween's braces. requestAnimationFrame does not tick in
         every environment the app runs in (a backgrounded tab, a webview
         that has throttled the compositor, an automation browser that
         never paints), and if it never fires the panel would sit half
         travelled with snapping still disabled. A timer is a different
         clock, so it lands the scroll even when frames never arrive. In a
         normal browser the tween finishes first and this is cancelled. */
      settleTimer = setTimeout(land, DUR + 90);
      tween = requestAnimationFrame(function step(ts) {
        if (!t0) t0 = ts;
        var k = Math.min(1, (ts - t0) / DUR);
        // ease-out cubic: quick off the press, settles rather than stops
        var e = 1 - Math.pow(1 - k, 3);
        track.scrollTop = from + dist * e;
        if (k < 1) { tween = requestAnimationFrame(step); }
        else { land(); }
      });
    }

    function paintDots() {
      dotEls.forEach(function (dot, i) {
        dot.setAttribute('data-state', i === at ? 'now' : (i < at ? 'done' : 'todo'));
      });
    }
    function go(i) {
      if (i < 0) i = 0;
      if (i > panels.length - 1) i = panels.length - 1;
      at = i;
      if (i === panels.length - 1) paintSummary();
      paintDots();
      travelTo(i * track.clientHeight);
      // Move focus with the panel or the keyboard stays on the previous
      // question, which strands anyone not using a pointer.
      var target = panels[i].querySelector('.afl-opt[aria-checked="true"], .afl-opt, .afl-go');
      if (target) {
        try { target.focus({ preventScroll: true }); } catch (e) { target.focus(); }
      }
    }

    /* Trackpad and touch scrolling move the panel without going through
       go(), so the dots would drift out of step with what is on screen.
       Watching the scroller keeps them honest. */
    var settle = null;
    track.addEventListener('scroll', function () {
      if (settle) clearTimeout(settle);
      settle = setTimeout(function () {
        var h = track.clientHeight || 1;
        var i = Math.round(track.scrollTop / h);
        if (i !== at && i >= 0 && i < panels.length) {
          at = i;
          if (i === panels.length - 1) paintSummary();
          paintDots();
        }
      }, 90);
    }, { passive: true });

    function close() {
      if (tween) cancelAnimationFrame(tween);
      if (settleTimer) clearTimeout(settleTimer);
      if (settle) clearTimeout(settle);
      document.removeEventListener('keydown', onKey);
      if (root.parentNode) root.parentNode.removeChild(root);
      document.documentElement.style.overflow = prevOverflow;
    }
    function onKey(e) {
      if (e.key === 'Escape') { e.preventDefault(); close(); if (cfg.onClose) cfg.onClose(); }
      else if (e.key === 'PageDown') { e.preventDefault(); go(at + 1); }
      else if (e.key === 'PageUp') { e.preventDefault(); go(at - 1); }
    }

    skipBtn.addEventListener('click', function () {
      play('go');
      close();
      (cfg.onSkip || cfg.onDone)(answers);
    });
    closeBtn.addEventListener('click', function () {
      play('back');
      close();
      if (cfg.onClose) cfg.onClose();
    });

    var prevOverflow = document.documentElement.style.overflow;
    document.documentElement.style.overflow = 'hidden';
    document.body.appendChild(root);
    document.addEventListener('keydown', onKey);
    paintDots();
    go(0);

    return { close: close, answers: answers };
  }

  window.ArcadeFlow = { start: start, play: play, muted: muted, setMuted: setMuted };
})();
