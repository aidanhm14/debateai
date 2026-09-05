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
      // Write-ins can accompany a single choice or a multi-select answer.
      if (s.writeDefaults) Object.keys(s.writeDefaults).forEach(function (k) { answers[k] = String(s.writeDefaults[k] || ''); });
      if (s.multi) {
        // Multi-select (2026-09-04): the answer is an ARRAY of option
        // values. An empty array is a real answer ("none of them"), not a
        // missing one, so nothing is defaulted in for the caller.
        answers[s.key] = Array.isArray(s['default']) ? s['default'].slice() : [];
        return;
      }
      answers[s.key] = s['default'] != null ? s['default'] : (s.options[0] && s.options[0].value);
    });
    function isPicked(step, value) {
      return step.multi ? answers[step.key].indexOf(value) !== -1 : answers[step.key] === value;
    }

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

    var skipBtn = el('button', 'afl-btn', cfg.skipLabel || 'Skip');
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
      if (step.className) panel.className += ' ' + step.className;
      var inner = el('div', 'afl-panel-in');
      inner.appendChild(el('p', 'afl-step', 'Step ' + (i + 1) + ' of ' + steps.length));
      if (step.visual && step.visual.nodeType === 1) {
        step.visual.classList.add('afl-visual');
        inner.appendChild(step.visual);
      }
      inner.appendChild(el('h2', 'afl-q', step.q));
      if (step.hint) inner.appendChild(el('p', 'afl-hint', step.hint));

      var group = el('div', 'afl-opts');
      group.setAttribute('role', step.multi ? 'group' : 'radiogroup');
      group.setAttribute('aria-label', step.q);
      /* Aside options (2026-09-04): an option flagged `aside` renders in
         its own slot ABOVE the list, beside the question, instead of at
         the foot of it. The founder's reason: "none of them" means the
         person has nothing to pick, and making them scroll past every
         option to say so is the opposite of what the answer means. Same
         answer state and semantics; only the placement moves. */
      var aside = null;
      var optBtns = [];
      function paintChecks() {
        optBtns.forEach(function (pair) {
          pair.btn.setAttribute('aria-checked', isPicked(step, pair.opt.value) ? 'true' : 'false');
        });
      }
      var nextBtn = null;
      var nextCount = null;
      function paintNext() {
        if (!nextBtn) return;
        var n = answers[step.key].filter(function (v) {
          var o = null;
          step.options.forEach(function (x) { if (x.value === v) o = x; });
          return o && !o.exclusive && (!o.write || String(answers[o.write.key] || '').trim());
        }).length;
        nextCount.textContent = n ? (n + ' picked') : (step.emptyLabel || 'None picked');
      }

      step.options.forEach(function (opt) {
        var b = el('button', 'afl-opt');
        if (opt.className) b.className += ' ' + opt.className;
        b.type = 'button';
        b.setAttribute('role', step.multi ? 'checkbox' : 'radio');
        b.setAttribute('aria-checked', isPicked(step, opt.value) ? 'true' : 'false');
        // Optional portrait (2026-09-04): an option can carry an image,
        // for questions about a person. Decorative, so alt is empty; the
        // label carries the name.
        if (opt.img) {
          var im = el('img', 'afl-opt-img');
          im.src = opt.img; im.alt = ''; im.decoding = 'async';
          b.appendChild(im);
          b.classList.add('afl-opt--img');
        }
        var txt = el('span');
        txt.appendChild(el('span', 'afl-opt-t', opt.label));
        if (opt.sub) txt.appendChild(el('span', 'afl-opt-s', opt.sub));
        b.appendChild(txt);
        b.appendChild(el('span', 'afl-opt-mark', '✓'));
        b.addEventListener('click', function () {
          if (step.multi) {
            // Toggle. An `exclusive` option ("none of them") clears the
            // rest and is cleared by any other pick, so the array never
            // says both "none" and "these".
            var cur = answers[step.key];
            var idx = cur.indexOf(opt.value);
            if (idx !== -1) cur.splice(idx, 1);
            else if (opt.exclusive) answers[step.key] = cur = [opt.value];
            else {
              cur.push(opt.value);
              answers[step.key] = cur = cur.filter(function (v) {
                var o = null;
                step.options.forEach(function (x) { if (x.value === v) o = x; });
                return !(o && o.exclusive);
              });
            }
            if (step.writeKeys) step.writeKeys.forEach(function (key) {
              var picked = step.options.some(function (o) { return o.write && o.write.key === key && isPicked(step, o.value); });
              if (!picked) answers[key] = '';
            });
            if (writeFor && !isPicked(step, writeFor.value)) { writeBox.hidden = true; writeFor = null; }
            paintChecks();
            paintNext();
            play('select');
            if (opt.write && isPicked(step, opt.value)) openWrite(opt, true);
            // Choosing "none" is a complete answer; move on like a radio.
            if (opt.exclusive && idx === -1) go(i + 1);
            return;
          }
          answers[step.key] = opt.value;
          paintChecks();
          play('select');
          // A write-in option (2026-09-04, the founder: "have options to
          // do a 'nuanced' answer and write more") opens a box instead of
          // advancing. The text lives under opt.write.key; picking any
          // other option on this step clears it, so a note can never
          // outlive the answer it explains.
          if (opt.write && opt.write.key) { openWrite(opt, true); return; }
          if (writeBox) { writeBox.hidden = true; if (step.writeKeys) step.writeKeys.forEach(function (k) { answers[k] = ''; }); }
          go(i + 1);
        });
        optBtns.push({ btn: b, opt: opt });
        if (opt.aside) {
          if (!aside) {
            aside = el('div', 'afl-aside');
            aside.setAttribute('role', step.multi ? 'group' : 'radiogroup');
            aside.setAttribute('aria-label', step.q);
          }
          aside.appendChild(b);
        } else {
          group.appendChild(b);
        }
      });
      if (aside) inner.appendChild(aside);
      inner.appendChild(group);

      if (step.multi) {
        nextBtn = el('button', 'afl-next');
        nextBtn.type = 'button';
        nextBtn.appendChild(el('b', null, step.nextLabel || 'Next'));
        nextCount = el('small');
        nextBtn.appendChild(nextCount);
        nextBtn.appendChild(el('span', 'afl-next-arrow', '→'));
        nextBtn.addEventListener('click', function () { play('select'); go(i + 1); });
        paintNext();
        inner.appendChild(nextBtn);
      }

      var writeBox = null, writeArea = null, writeFor = null;
      var writeOpts = step.options.filter(function (o) { return o.write && o.write.key; });
      if (writeOpts.length) {
        step.writeKeys = writeOpts.map(function (o) { return o.write.key; });
        step.writeKeys.forEach(function (k) { if (answers[k] == null) answers[k] = ''; });
        writeBox = el('div', 'afl-write');
        writeBox.hidden = true;
        var singleLine = writeOpts.every(function (o) { return o.write.singleLine; });
        writeArea = el(singleLine ? 'input' : 'textarea', 'afl-write-area');
        if (singleLine) writeArea.type = 'text';
        else writeArea.rows = 3;
        writeArea.setAttribute('aria-label', step.q);
        var writeCount = el('span', 'afl-write-count');
        var writeGo = el('button', 'afl-write-go', 'Continue');
        writeGo.type = 'button';
        var writeRow = el('div', 'afl-write-row');
        writeRow.appendChild(writeCount);
        if (!step.multi) writeRow.appendChild(writeGo);
        writeBox.appendChild(writeArea);
        writeBox.appendChild(writeRow);
        inner.insertBefore(writeBox, group.nextSibling);
        var syncCount = function () {
          var max = (writeFor && writeFor.write.maxLength) || 240;
          writeCount.textContent = writeArea.value.length + ' / ' + max;
        };
        writeArea.addEventListener('input', function () {
          if (!writeFor) return;
          var max = writeFor.write.maxLength || 240;
          if (writeArea.value.length > max) writeArea.value = writeArea.value.slice(0, max);
          answers[writeFor.write.key] = writeArea.value;
          syncCount();
          paintNext();
        });
        writeArea.addEventListener('keydown', function (e) {
          // Enter alone moves on; Shift+Enter keeps writing.
          if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); (nextBtn || writeGo).click(); }
        });
        writeGo.addEventListener('click', function () { play('select'); go(i + 1); });
      }
      function openWrite(opt, reveal) {
        writeFor = opt;
        if (!step.multi) step.writeKeys.forEach(function (k) { if (k !== opt.write.key) answers[k] = ''; });
        writeArea.setAttribute('aria-label', opt.write.label || step.q);
        writeArea.placeholder = opt.write.placeholder || 'Say it in a sentence or two.';
        writeArea.maxLength = opt.write.maxLength || 240;
        writeArea.value = answers[opt.write.key] || '';
        writeBox.hidden = false;
        syncCount();
        if (reveal) writeBox.scrollIntoView({ block: 'nearest' });
        try { writeArea.focus({ preventScroll: true }); } catch (e) { writeArea.focus(); }
      }
      // A saved write-in comes back open on its option.
      writeOpts.forEach(function (o) { if (isPicked(step, o.value)) openWrite(o); });

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
    var lp = el('section', 'afl-panel afl-panel--launch');
    var lpIn = el('div', 'afl-panel-in');
    lpIn.appendChild(el('p', 'afl-step', 'Ready'));
    lpIn.appendChild(el('h2', 'afl-q', launch.title || 'That is the setup.'));
    if (launch.hint) lpIn.appendChild(el('p', 'afl-hint', launch.hint));
    var summary = el('ul', 'afl-summary');
    lpIn.appendChild(summary);
    var launchExtra = el('div', 'afl-launch-extra');
    lpIn.appendChild(launchExtra);
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
        if (step.summary === false) return;
        var li = el('li');
        li.appendChild(el('span', null, step.summaryLabel || step.q));
        if (step.multi) {
          var names = [];
          step.options.forEach(function (o) {
            if (answers[step.key].indexOf(o.value) !== -1 && !o.exclusive) {
              var name = o.write ? String(answers[o.write.key] || '').trim() : (o.summaryLabel || o.label);
              if (name) names.push(name);
            }
          });
          li.appendChild(el('b', null, names.length ? names.join(', ') : (step.emptyLabel || 'None')));
          summary.appendChild(li);
          return;
        }
        var picked = null;
        step.options.forEach(function (o) { if (o.value === answers[step.key]) picked = o; });
        li.appendChild(el('b', null, picked ? (picked.summaryLabel || picked.label) : String(answers[step.key])));
        // Write-in text is rendered as text, never markup.
        if (picked && picked.write && picked.write.key && answers[picked.write.key]) {
          li.appendChild(el('i', 'afl-summary-note', String(answers[picked.write.key])));
        }
        summary.appendChild(li);
      });
      launchExtra.innerHTML = '';
      if (typeof launch.extra === 'function') {
        var extra = launch.extra(answers);
        if (extra && extra.nodeType === 1) launchExtra.appendChild(extra);
      }
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
