// voice-input.js
//
// Speech-to-text affordance for text inputs and textareas across the
// site. A single floating mic button is appended to <body> (outside
// any React root) and re-positions itself over whichever eligible
// field is currently focused. Click the mic, talk, the transcript
// fills the field live. Click again to stop.
//
// Why floating + outside React: the earlier implementation wrapped
// each textarea in a <span> so the mic could absolute-position to it.
// That moved the textarea out of the slot React rendered it into;
// React's next commit phase called removeChild on the original parent,
// the textarea wasn't there anymore, and the page silently blanked
// (commit 97d3fe0). Floating-against-rect avoids any DOM mutation of
// React-owned subtrees.
//
// Uses the Web Speech API (window.SpeechRecognition /
// webkitSpeechRecognition). Silently no-ops on browsers without it
// (Firefox, some in-app browsers) so users never see a broken mic.
//
// Opt out per-field with data-no-voice-input or data-voice-input="off".
// Eligibility: textareas, contentEditable, and text/search/url inputs
// at least 220px wide. The width gate keeps the button off small
// inline / toolbar fields where it would collide with submit buttons.

(function () {
  'use strict';

  var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) return;

  // React stores controlled-input values on its private fiber; plain
  // .value assignment doesn't trip onChange. Canonical workaround:
  // use the prototype setter + dispatch a synthetic input event.
  var nativeTextareaValueSetter = (function () {
    try { var d = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value'); return d && d.set; } catch (_) { return null; }
  })();
  var nativeInputValueSetter = (function () {
    try { var d = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value'); return d && d.set; } catch (_) { return null; }
  })();
  function setControlledValue(el, value) {
    var setter = el.tagName === 'TEXTAREA' ? nativeTextareaValueSetter : nativeInputValueSetter;
    if (setter) setter.call(el, value); else el.value = value;
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }

  // Inject CSS once. Scoped under .vi-mic so it can't bleed onto anything.
  if (!document.getElementById('voice-input-style')) {
    var style = document.createElement('style');
    style.id = 'voice-input-style';
    style.textContent = [
      '.vi-mic{position:fixed;width:32px;height:32px;display:flex;align-items:center;justify-content:center;border-radius:10px;background:rgba(20,18,16,.78);border:1px solid rgba(255,255,255,.16);color:rgba(255,255,255,.78);cursor:pointer;padding:0;z-index:2147483646;opacity:0;pointer-events:none;transition:opacity .14s ease,background .14s ease,color .14s ease,border-color .14s ease,transform .14s ease;backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);box-shadow:0 4px 14px rgba(0,0,0,.22);font:inherit;-webkit-appearance:none;appearance:none}',
      '.vi-mic.vi-on{opacity:1;pointer-events:auto}',
      '.vi-mic:hover{background:rgba(20,18,16,.92);color:#fff;border-color:rgba(255,255,255,.30);transform:scale(1.06)}',
      '.vi-mic:focus-visible{outline:2px solid rgba(239,68,68,.55);outline-offset:2px}',
      '.vi-mic.vi-rec{background:rgba(220,38,38,.95);color:#fff;border-color:#dc2626;box-shadow:0 0 0 3px rgba(220,38,38,.18),0 4px 14px rgba(220,38,38,.32);animation:vi-mic-pulse 1.3s ease-in-out infinite}',
      '.vi-mic.vi-rec:hover{background:#dc2626;transform:scale(1.06)}',
      '@keyframes vi-mic-pulse{0%,100%{box-shadow:0 0 0 0 rgba(220,38,38,.55),0 4px 14px rgba(220,38,38,.30)}50%{box-shadow:0 0 0 10px rgba(220,38,38,0),0 4px 14px rgba(220,38,38,.30)}}',
      '.vi-mic svg{width:15px;height:15px}',
      '[data-theme="light"] .vi-mic,[data-lighting="light"] .vi-mic{background:rgba(255,255,255,.94);color:#3a3a3a;border-color:rgba(0,0,0,.14)}',
      '[data-theme="light"] .vi-mic:hover,[data-lighting="light"] .vi-mic:hover{background:#fff;color:#1a1a1f;border-color:rgba(0,0,0,.24)}',
      '[data-theme="light"] .vi-mic.vi-rec,[data-lighting="light"] .vi-mic.vi-rec{background:#dc2626;color:#fff;border-color:#dc2626}',
      '@media (prefers-reduced-motion:reduce){.vi-mic,.vi-mic:hover,.vi-mic.vi-rec{transform:none;animation:none}}'
    ].join('');
    document.head.appendChild(style);
  }

  var SVG_MIC = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="2" width="6" height="11" rx="3"/><path d="M5 10v2a7 7 0 0 0 14 0v-2"/><line x1="12" y1="19" x2="12" y2="22"/><line x1="8" y1="22" x2="16" y2="22"/></svg>';
  var SVG_STOP = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>';

  var btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'vi-mic';
  btn.setAttribute('aria-label', 'Speak instead of typing');
  btn.title = 'Speak (Web Speech)';
  btn.innerHTML = SVG_MIC;

  function appendBtn() {
    if (!document.body || document.body.contains(btn)) return;
    document.body.appendChild(btn);
  }
  if (document.body) appendBtn();
  else document.addEventListener('DOMContentLoaded', appendBtn, { once: true });

  // Eligibility — what counts as a dictatable field.
  function isEligible(el) {
    if (!el || el.nodeType !== 1) return false;
    if (el.disabled || el.readOnly) return false;
    var ds = el.dataset || {};
    if (ds.voiceInput === 'off' || 'noVoiceInput' in ds) return false;
    // Skip the mic button itself
    if (el === btn) return false;
    var tag = el.tagName;
    if (tag === 'TEXTAREA') return true;
    if (tag === 'INPUT') {
      var t = (el.type || 'text').toLowerCase();
      if (t !== 'text' && t !== 'search' && t !== 'url') return false;
      // Don't overlay on tiny inputs (toolbars, inline edit fields).
      var r = el.getBoundingClientRect();
      if (r.width < 220) return false;
      return true;
    }
    if (el.isContentEditable) {
      var r2 = el.getBoundingClientRect();
      if (r2.width < 220) return false;
      return true;
    }
    return false;
  }

  function isVisible(el) {
    if (!el || !document.body.contains(el)) return false;
    var r = el.getBoundingClientRect();
    if (r.width < 4 || r.height < 4) return false;
    var vh = window.innerHeight || document.documentElement.clientHeight || 0;
    var vw = window.innerWidth || document.documentElement.clientWidth || 0;
    // Only enforce off-screen culling when we actually know the viewport
    if (vh > 0 && (r.bottom < 0 || r.top > vh)) return false;
    if (vw > 0 && (r.right < 0 || r.left > vw)) return false;
    var cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.display === 'none' || parseFloat(cs.opacity) === 0) return false;
    return true;
  }

  var target = null;
  var rec = null;
  var recording = false;
  var baseText = '';
  var finalAccum = '';

  function setState(on) {
    recording = on;
    btn.classList.toggle('vi-rec', on);
    btn.innerHTML = on ? SVG_STOP : SVG_MIC;
    btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    btn.title = on ? 'Stop dictation' : 'Speak (Web Speech)';
  }

  function positionBtn() {
    if (!target || !isVisible(target)) { btn.classList.remove('vi-on'); return; }
    var r = target.getBoundingClientRect();
    var size = 32;
    var pad = 8;
    var top, left;
    if (target.tagName === 'INPUT') {
      // Single-line: vertically center, right-aligned inside the field.
      top = r.top + r.height / 2 - size / 2;
      left = r.right - size - pad;
    } else {
      // Textarea / contentEditable: bottom-right inside the field.
      top = r.bottom - size - pad;
      left = r.right - size - pad;
    }
    // Clamp to viewport so the button never floats off-screen
    var vh = window.innerHeight || document.documentElement.clientHeight;
    var vw = window.innerWidth || document.documentElement.clientWidth;
    top = Math.max(8, Math.min(top, vh - size - 8));
    left = Math.max(8, Math.min(left, vw - size - 8));
    btn.style.top = Math.round(top) + 'px';
    btn.style.left = Math.round(left) + 'px';
    btn.classList.add('vi-on');
  }

  function show(el) {
    if (target === el) { positionBtn(); return; }
    if (recording) stopRec();
    target = el;
    positionBtn();
  }
  function hide() {
    if (recording) stopRec();
    target = null;
    btn.classList.remove('vi-on');
  }

  // Focus-driven visibility. Hover would be noisier; focus matches the
  // moment the user is about to type anyway.
  document.addEventListener('focusin', function (e) {
    if (isEligible(e.target)) show(e.target);
  }, true);
  document.addEventListener('focusout', function (e) {
    // Defer so a click on the mic button (which steals focus briefly)
    // doesn't immediately hide it. If focus lands on another eligible
    // field, follow it.
    setTimeout(function () {
      var a = document.activeElement;
      if (a === btn) return;
      if (a && isEligible(a)) { show(a); return; }
      hide();
    }, 50);
  }, true);

  // Reposition on layout changes
  function relayout() { if (target) positionBtn(); }
  window.addEventListener('scroll', relayout, true);
  window.addEventListener('resize', relayout);
  if (window.ResizeObserver) {
    try { new ResizeObserver(relayout).observe(document.documentElement); } catch (_) {}
  }

  function startRec() {
    if (recording || !target) return;
    baseText = (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')
      ? (target.value || '')
      : (target.isContentEditable ? (target.innerText || '') : '');
    finalAccum = '';
    try { rec = new SR(); } catch (_) { return; }
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = (document.documentElement.getAttribute('lang') || navigator.language || 'en-US');

    rec.onresult = function (e) {
      if (!target || !document.body.contains(target)) { stopRec(); return; }
      var interim = '';
      for (var i = e.resultIndex; i < e.results.length; i++) {
        var r = e.results[i];
        if (r.isFinal) finalAccum += r[0].transcript + ' ';
        else interim += r[0].transcript;
      }
      var joiner = baseText && !/\s$/.test(baseText) ? ' ' : '';
      var f = finalAccum.trim();
      var n = interim.trim();
      var inter = n ? ((f && !/\s$/.test(f)) ? ' ' : '') + n : '';
      var combined = baseText + joiner + f + inter;
      if (target.isContentEditable) {
        target.innerText = combined;
        target.dispatchEvent(new Event('input', { bubbles: true }));
      } else {
        setControlledValue(target, combined);
      }
    };
    rec.onerror = function (ev) {
      if (ev && (ev.error === 'not-allowed' || ev.error === 'service-not-allowed')) {
        setState(false);
        // Hide for the rest of the session so a denied user doesn't keep
        // re-prompting on every focus.
        btn.style.display = 'none';
      }
    };
    rec.onend = function () {
      // Web Speech auto-stops after silence; restart for continuous
      // dictation until the user explicitly clicks stop.
      if (recording) {
        try { rec.start(); } catch (_) { setState(false); }
      }
    };
    try {
      rec.start();
      setState(true);
    } catch (_) {
      setState(false);
    }
  }

  function stopRec() {
    if (!recording) return;
    setState(false);
    try { if (rec) rec.stop(); } catch (_) {}
    rec = null;
  }

  // Don't steal focus from the field when the user clicks the mic
  btn.addEventListener('mousedown', function (e) { e.preventDefault(); });
  btn.addEventListener('click', function (e) {
    e.preventDefault(); e.stopPropagation();
    if (!target) return;
    if (recording) { stopRec(); return; }
    try { target.focus(); } catch (_) {}
    startRec();
  });

  // Keyboard: Escape stops dictation
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && recording) stopRec();
  });

  // Stop recording if the tab is hidden so the recognizer doesn't
  // keep running in the background.
  document.addEventListener('visibilitychange', function () {
    if (document.hidden && recording) stopRec();
  });
})();
