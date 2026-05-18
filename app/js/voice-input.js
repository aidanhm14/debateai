// voice-input.js
//
// Adds a mic button to every <textarea class="float-input"> on the page
// (and any element opted in with data-voice-input). Press the mic, talk,
// the transcript fills the textarea live. Press again to stop.
//
// Uses the browser's Web Speech API (window.SpeechRecognition /
// webkitSpeechRecognition). If unsupported (Firefox, locked-down
// in-app browsers), the button stays hidden so users never see a
// broken affordance. Same recognizer the in-round speech transcription
// uses in debate-ai.html. No backend, no API keys, no audio leaves
// the device.
//
// Lives at /js/voice-input.js. Loaded by debate-ai.html so the motion
// textarea + the typed-fallback speech textarea get the affordance.
// Cheap enough to load on any page; can be added to other surfaces
// (landing chat preview, voice-debate side panel, learn pages) later
// without changes here.

(function(){
  'use strict';

  var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) {
    // No Web Speech API — silently no-op. We don't show a broken mic
    // icon to users on Firefox / in-app browsers.
    return;
  }

  // React stores controlled-input values on its internal fiber; just
  // assigning `textarea.value = 'foo'` does not trigger onChange. The
  // canonical workaround: use the native value setter, then dispatch
  // a synthetic `input` event so React's bubble listener picks it up.
  var nativeTextareaValueSetter = (function(){
    try {
      var d = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value');
      return d && d.set;
    } catch (e) { return null; }
  })();
  var nativeInputValueSetter = (function(){
    try {
      var d = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value');
      return d && d.set;
    } catch (e) { return null; }
  })();

  function setReactValue(el, value){
    var setter = el.tagName === 'TEXTAREA' ? nativeTextareaValueSetter : nativeInputValueSetter;
    if (setter) {
      setter.call(el, value);
    } else {
      el.value = value;
    }
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }

  // SVG mic glyphs. Two states: idle (filled outline) and recording
  // (filled with a pulsing dot). Stored as inline SVG so no extra
  // network request and so the icon inherits currentColor.
  var SVG_MIC = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="2" width="6" height="11" rx="3"/><path d="M5 10v2a7 7 0 0 0 14 0v-2"/><line x1="12" y1="19" x2="12" y2="22"/><line x1="8" y1="22" x2="16" y2="22"/></svg>';
  var SVG_STOP = '<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" aria-hidden="true"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>';

  // Per-textarea controller. Holds the recognizer instance, tracks
  // active state, and exposes start/stop. We keep the original (typed)
  // text in `baseText` so live interim transcripts can be appended
  // without clobbering what the user already had in the field.
  function attach(el){
    if (el.__voiceInputAttached) return;
    el.__voiceInputAttached = true;

    // Skip pickers we explicitly opt out of.
    if (el.dataset && el.dataset.voiceInput === 'off') return;

    // Wrap the textarea in a relative-positioned container so the
    // mic button can absolute-position to its bottom-right corner
    // without affecting page layout. If the textarea is already in
    // a positioned wrapper, reuse it.
    //
    // CAREFUL: never restructure the DOM on a React-controlled
    // element. React tracks its own parent → child links via its
    // fiber tree; inserting a new wrapper between the React-mounted
    // textarea and its React-mounted parent makes the next React
    // unmount call `parent.removeChild(textarea)` against a parent
    // that no longer contains the textarea (the wrapper does). The
    // resulting NotFoundError crashes the entire React root. For
    // React-controlled inputs, callers should pre-wrap the element
    // in a <span class="voice-input-host"> inside their JSX — we'll
    // detect that and fall through to the else branch.
    var host = el.parentElement;
    if (!host) return;
    var reactControlled = false;
    try {
      for (var k in el) {
        if (k.indexOf('__reactFiber') === 0 || k.indexOf('__reactProps') === 0) {
          reactControlled = true;
          break;
        }
      }
    } catch (e) {}
    var needsWrap = !host.classList.contains('voice-input-host')
                 && getComputedStyle(host).position === 'static'
                 && !reactControlled;
    var wrap;
    if (needsWrap) {
      wrap = document.createElement('span');
      wrap.className = 'voice-input-host';
      wrap.style.position = 'relative';
      wrap.style.display = 'block';
      el.parentElement.insertBefore(wrap, el);
      wrap.appendChild(el);
    } else {
      wrap = host;
      wrap.classList.add('voice-input-host');
      if (getComputedStyle(wrap).position === 'static') wrap.style.position = 'relative';
    }

    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'voice-input-btn';
    btn.setAttribute('aria-label', 'Dictate with mic');
    btn.title = 'Dictate (Web Speech API)';
    btn.innerHTML = SVG_MIC;
    wrap.appendChild(btn);

    var rec = null;
    var active = false;
    var baseText = '';
    var lastInterim = '';

    function setState(on){
      active = on;
      btn.classList.toggle('voice-input-btn-on', on);
      btn.innerHTML = on ? SVG_STOP : SVG_MIC;
      btn.setAttribute('aria-pressed', on ? 'true' : 'false');
      btn.title = on ? 'Stop dictating' : 'Dictate (Web Speech API)';
    }

    function flushTranscript(finalText, interimText){
      // baseText is whatever the user had typed before they hit the
      // mic. We append finalText (locked-in transcript) + interimText
      // (still-being-recognized words) so the field reflects live state.
      var joiner = baseText && !/\s$/.test(baseText) ? ' ' : '';
      var combined = baseText + joiner + finalText + (interimText ? (finalText && !/\s$/.test(finalText) ? ' ' : '') + interimText : '');
      setReactValue(el, combined);
    }

    function start(){
      if (active) return;
      // Capture whatever the user has typed. Live results append from
      // this anchor.
      baseText = el.value || '';
      lastInterim = '';
      try {
        rec = new SR();
      } catch (e) { return; }
      rec.continuous = true;
      rec.interimResults = true;
      rec.lang = (document.documentElement.getAttribute('lang') || 'en-US');
      var finalText = '';
      rec.onresult = function(e){
        var interim = '';
        for (var i = e.resultIndex; i < e.results.length; i++) {
          var r = e.results[i];
          if (r.isFinal) finalText += r[0].transcript + ' ';
          else interim += r[0].transcript;
        }
        lastInterim = interim;
        flushTranscript(finalText.trim(), interim.trim());
      };
      rec.onerror = function(ev){
        if (ev.error === 'not-allowed' || ev.error === 'service-not-allowed') {
          // User denied mic permission. Bail and hide the button so
          // the field still functions as a plain textarea.
          setState(false);
          btn.style.display = 'none';
        }
      };
      rec.onend = function(){
        if (active) {
          // Some browsers stop after a silence. Restart so long-form
          // dictation keeps flowing until the user explicitly stops.
          try { rec.start(); } catch(e){ setState(false); }
        }
      };
      try {
        rec.start();
        setState(true);
      } catch (e) {
        setState(false);
      }
    }

    function stop(){
      if (!active) return;
      setState(false);
      try { if (rec) rec.stop(); } catch (e){}
      // Final flush. baseText + finalText is already in the textarea
      // value via the last flushTranscript call; nothing extra to do.
      rec = null;
    }

    btn.addEventListener('click', function(ev){
      ev.preventDefault();
      ev.stopPropagation();
      if (active) stop(); else start();
    });

    // If the textarea is detached from the DOM (React unmount), the
    // observer below cleans up. No-op here.
  }

  // Selectors we attach to by default. `.float-input` covers the
  // main motion + background textareas in debate-ai.html and the
  // typed-fallback speech textarea. Add `data-voice-input` to any
  // input/textarea elsewhere on a page to opt in.
  var SELECTOR = 'textarea.float-input, textarea[data-voice-input="on"], input[data-voice-input="on"]';

  function scan(root){
    var nodes = (root || document).querySelectorAll(SELECTOR);
    for (var i = 0; i < nodes.length; i++) attach(nodes[i]);
  }

  function ready(){
    // Inject the minimal CSS once. Scoped to .voice-input-btn so it
    // can't bleed onto anything else.
    if (!document.getElementById('voice-input-style')) {
      var s = document.createElement('style');
      s.id = 'voice-input-style';
      s.textContent = [
        '.voice-input-host{position:relative}',
        '.voice-input-btn{position:absolute;right:8px;bottom:8px;display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;padding:0;border-radius:8px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.14);color:rgba(255,255,255,.65);cursor:pointer;transition:background .15s,border-color .15s,color .15s,box-shadow .15s;z-index:2}',
        '.voice-input-btn:hover{background:rgba(255,255,255,.08);border-color:rgba(255,255,255,.28);color:#fff}',
        '.voice-input-btn:focus-visible{outline:2px solid rgba(239,68,68,.5);outline-offset:2px}',
        '.voice-input-btn-on{background:rgba(239,68,68,.16);border-color:rgba(239,68,68,.55);color:#fca5a5;box-shadow:0 0 0 2px rgba(239,68,68,.08), 0 0 12px rgba(239,68,68,.22)}',
        '.voice-input-btn-on:hover{background:rgba(239,68,68,.22);border-color:rgba(239,68,68,.7);color:#fda4af}',
        '.voice-input-btn-on::after{content:"";position:absolute;top:4px;right:4px;width:6px;height:6px;border-radius:50%;background:#ef4444;box-shadow:0 0 6px #ef4444;animation:voice-input-pulse 1.2s ease-in-out infinite}',
        '@keyframes voice-input-pulse{0%,100%{opacity:.95;transform:scale(1)}50%{opacity:.5;transform:scale(1.25)}}',
        '[data-theme="light"] .voice-input-btn{background:rgba(0,0,0,.03);border-color:rgba(0,0,0,.10);color:rgba(0,0,0,.55)}',
        '[data-theme="light"] .voice-input-btn:hover{background:rgba(0,0,0,.06);border-color:rgba(0,0,0,.22);color:#1a1a1f}',
        '[data-theme="light"] .voice-input-btn-on{background:rgba(220,38,38,.08);border-color:rgba(220,38,38,.45);color:#b91c1c;box-shadow:0 0 0 2px rgba(220,38,38,.06)}',
        // When dropped onto an `input` (not a textarea), the field is
        // single-line so the mic button positions right-aligned vertically.
        'input.voice-input-target + .voice-input-btn,.voice-input-host > input + .voice-input-btn{top:50%;bottom:auto;transform:translateY(-50%)}'
      ].join('\n');
      document.head.appendChild(s);
    }

    scan(document);

    // React renders the textareas after this script parses, so
    // observe the body for added nodes and re-scan.
    if (window.MutationObserver) {
      var mo = new MutationObserver(function(mutations){
        for (var i = 0; i < mutations.length; i++) {
          var m = mutations[i];
          for (var j = 0; j < m.addedNodes.length; j++) {
            var n = m.addedNodes[j];
            if (n.nodeType !== 1) continue;
            if (n.matches && n.matches(SELECTOR)) attach(n);
            scan(n);
          }
        }
      });
      mo.observe(document.body, { childList: true, subtree: true });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', ready, { once: true });
  } else {
    ready();
  }
})();
