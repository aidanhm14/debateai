// type-stream.js — character-by-character reveal for streaming AI text.
//
// PURPOSE: the landing hero's scripted demo cycles canned motions and reveals
// each character per frame, with a red block cursor (▋) at the typing edge.
// The user wants that same look applied to REAL AI output everywhere — live
// debate speech, devil's advocate, case prep, judge verdict, mini-chat.
//
// The streaming pipeline (callAI / callClaude in debate-ai.html and
// devils-advocate.html) calls onChunk(fullTextSoFar) repeatedly as SSE
// chunks arrive. Most callers pass that straight to setState / textContent,
// which paints text instantly the moment a chunk lands. That's wrong for
// our visual: we want the user to see characters APPEAR one at a time.
//
// Solution: a buffered renderer. The caller feeds the latest accumulated
// text on every chunk; we maintain a "shown" cursor that advances toward
// the buffer at a steady cps (characters per second), driven by rAF. When
// the network is faster than the typewriter (the common case), characters
// trickle out at typewriter pace. When the network is slower, we naturally
// pause at the end of the latest chunk until the next one arrives. When
// the caller calls done(), we finish revealing whatever's left in the
// buffer at the same pace, then drop the cursor.
//
// Usage (vanilla DOM target):
//   const stream = window.TypeStream.create(targetEl, { cps: 90 });
//   await callClaude(sys, user, (text) => stream.feed(text));
//   stream.done();
//
// Usage (React state setter target — pass a function instead of element):
//   const stream = window.TypeStream.create((shown) => setOutput(shown), { cps: 90 });
//   await callClaude(sys, user, (text) => stream.feed(text));
//   stream.done();
//
// The element form auto-toggles a `.type-stream-active` class while typing
// so callers can style the cursor without per-site duplication. The
// function form leaves cursor styling to the caller (typically by
// rendering a separate cursor span next to the text).

(function (global) {
  const DEFAULT_CPS = 90; // characters per second — matches the hero feel
  const MAX_BURST_CHARS = 200; // catch up if the buffer races way ahead

  // Inject the cursor CSS once. Matches the landing hero's beta-msg-typing
  // cursor (▋ block, accent color, 1s blink) so AI streaming text gets the
  // same visual signature everywhere it shows up. Idempotent: if the page
  // already has this style, do nothing.
  if (typeof document !== 'undefined' && !document.getElementById('type-stream-style')) {
    const css = '.type-stream-active::after{' +
      "content:'▋';" +
      'display:inline-block;' +
      'margin-left:2px;' +
      'color:var(--accent,#ef4444);' +
      'animation:type-stream-blink 1s step-end infinite;' +
      'vertical-align:baseline' +
      '}' +
      '@keyframes type-stream-blink{0%,100%{opacity:1}50%{opacity:0}}';
    const style = document.createElement('style');
    style.id = 'type-stream-style';
    style.textContent = css;
    document.head.appendChild(style);
  }

  function create(target, opts) {
    opts = opts || {};
    const cps = Math.max(10, opts.cps || DEFAULT_CPS);
    const isElement = target && typeof target === 'object' && 'classList' in target;
    const setText = isElement
      ? (s) => { target.textContent = s; }
      : (typeof target === 'function' ? target : null);
    if (!setText) {
      // Caller passed something we can't write to — degrade gracefully.
      return { feed: () => {}, done: () => {}, cancel: () => {}, reset: () => {} };
    }

    let buffer = '';     // latest accumulated text we WANT to display
    let shown = 0;       // how many characters currently rendered
    let streamDone = false;
    let raf = null;
    let lastTick = 0;
    let cursorOn = false;

    function setCursor(on) {
      if (!isElement) return; // function targets manage their own cursor
      if (on === cursorOn) return;
      cursorOn = on;
      if (on) target.classList.add('type-stream-active');
      else target.classList.remove('type-stream-active');
    }

    function tick(now) {
      raf = null;
      const dt = lastTick ? now - lastTick : 16;
      lastTick = now;

      // Advance the shown cursor. cps * (dt seconds) chars this frame.
      // Cap at MAX_BURST_CHARS so a long pause doesn't dump everything.
      const want = Math.round((cps * dt) / 1000);
      const advance = Math.max(1, Math.min(want, MAX_BURST_CHARS));
      const next = Math.min(buffer.length, shown + advance);
      if (next !== shown) {
        shown = next;
        setText(buffer.slice(0, shown));
      }

      const caughtUp = shown >= buffer.length;
      if (!caughtUp) {
        raf = requestAnimationFrame(tick);
        return;
      }
      // Buffer drained. If the stream is still open, idle until more arrives.
      if (!streamDone) {
        // Park rAF; feed() will restart when more text arrives.
        return;
      }
      // Stream done AND caught up — drop cursor.
      setCursor(false);
    }

    function startIfNeeded() {
      if (raf != null) return;
      lastTick = 0;
      setCursor(true);
      raf = requestAnimationFrame(tick);
    }

    function feed(fullText) {
      if (typeof fullText !== 'string') return;
      // Accept the new buffer. If shorter than current shown (caller reset
      // the stream), snap shown back so we re-reveal cleanly.
      buffer = fullText;
      if (shown > buffer.length) shown = buffer.length;
      if (shown < buffer.length) startIfNeeded();
    }

    function done() {
      streamDone = true;
      // Restart the rAF so any remaining buffered text gets revealed.
      if (shown < buffer.length) startIfNeeded();
      else setCursor(false);
    }

    function cancel() {
      if (raf) { cancelAnimationFrame(raf); raf = null; }
      streamDone = true;
      setCursor(false);
    }

    function reset() {
      cancel();
      buffer = '';
      shown = 0;
      streamDone = false;
      lastTick = 0;
      setText('');
    }

    return { feed, done, cancel, reset };
  }

  global.TypeStream = { create };
})(typeof window !== 'undefined' ? window : globalThis);
