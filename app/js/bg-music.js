/* Optional landing-page background music.
 *
 * Off by default. A small music-note toggle mounts into the shared
 * topbar's right cluster (next to the SFX + theme + bell toggles).
 * Click once → an instrumental lo-fi track fades in at low volume.
 * Click again → fades out and pauses. Choice persists across
 * navigation via localStorage (`da-bg-music` = 'on' | 'off').
 *
 * Gated to the landing surface (`/`, `/landing`, `/landing.html`)
 * so this never leaks onto the app surface where AI voice/TTS
 * is the active audio.
 *
 * Tracks live under /audio/bg-{1..6}.mp3. They're free-to-use
 * Pixabay Music (CC0) instrumentals — see app/audio/README.md for
 * the source mapping. preload="none" so we don't burn bandwidth
 * for users who never toggle it on.
 */
(function () {
  'use strict';

  // ── gate ──────────────────────────────────────────────────────────
  var path = (location.pathname || '/').toLowerCase();
  var onLanding = path === '/' || path === '/landing' || path === '/landing.html';
  if (!onLanding) return;

  var TRACKS = [
    '/audio/bg-1.mp3',
    '/audio/bg-2.mp3',
    '/audio/bg-3.mp3',
    '/audio/bg-4.mp3',
    '/audio/bg-5.mp3',
    '/audio/bg-6.mp3',
  ];
  var TARGET_VOL = 0.30;
  var FADE_MS = 800;
  var LS_KEY = 'da-bg-music';

  // ── styles (self-injected so we don't touch ui.css mirror pair) ───
  function injectStyles() {
    if (document.getElementById('bg-music-style')) return;
    var s = document.createElement('style');
    s.id = 'bg-music-style';
    s.textContent =
      '.ui-topbar .bg-music-toggle{' +
        'display:inline-flex;align-items:center;justify-content:center;' +
        'width:28px;height:28px;padding:0;border-radius:999px;' +
        'background:transparent;' +
        'border:1px solid var(--border-strong, rgba(255,255,255,.18));' +
        'color:var(--text-dim, rgba(255,255,255,.62));' +
        'cursor:pointer;font-family:inherit;margin-right:6px;' +
        'transition:color .15s, background .15s, border-color .15s;' +
        'position:relative;' +
      '}' +
      '.ui-topbar .bg-music-toggle:hover{' +
        'color:var(--text, #fff);' +
        'border-color:var(--text, #fff);' +
        'background:rgba(255,255,255,.04);' +
      '}' +
      '[data-theme="light"] .ui-topbar .bg-music-toggle{' +
        'border-color:rgba(0,0,0,.18);color:rgba(0,0,0,.55);' +
      '}' +
      '[data-theme="light"] .ui-topbar .bg-music-toggle:hover{' +
        'color:#1a1a1f;border-color:#1a1a1f;background:rgba(0,0,0,.03);' +
      '}' +
      '.ui-topbar .bg-music-toggle svg{width:14px;height:14px;display:block}' +
      '.ui-topbar .bg-music-toggle[aria-pressed="true"]{' +
        'color:var(--accent, #ef4444);' +
        'border-color:var(--accent, #ef4444);' +
      '}' +
      '@media(max-width:560px){' +
        '.ui-topbar .bg-music-toggle{width:24px;height:24px}' +
        '.ui-topbar .bg-music-toggle svg{width:12px;height:12px}' +
      '}';
    document.head.appendChild(s);
  }

  // ── audio element + playback ──────────────────────────────────────
  var audio = null;
  var idx = Math.floor(Math.random() * TRACKS.length);
  var fadeRaf = 0;
  var playing = false;

  function ensureAudio() {
    if (audio) return audio;
    audio = document.createElement('audio');
    audio.preload = 'none';
    audio.volume = 0;
    audio.src = TRACKS[idx];
    audio.addEventListener('ended', function () {
      idx = (idx + 1) % TRACKS.length;
      audio.src = TRACKS[idx];
      audio.play().catch(function () { /* user gesture lost; ignore */ });
    });
    audio.addEventListener('error', function () {
      // Asset missing or decode failed. Try the next track once, then
      // give up silently — no error toast for an optional feature.
      idx = (idx + 1) % TRACKS.length;
      audio.src = TRACKS[idx];
    });
    return audio;
  }

  function fadeTo(target, done) {
    cancelAnimationFrame(fadeRaf);
    var a = audio;
    if (!a) return;
    var start = a.volume;
    var t0 = performance.now();
    function step(now) {
      var k = Math.min(1, (now - t0) / FADE_MS);
      a.volume = start + (target - start) * k;
      if (k < 1) {
        fadeRaf = requestAnimationFrame(step);
      } else if (done) {
        done();
      }
    }
    fadeRaf = requestAnimationFrame(step);
  }

  function start(btn) {
    var a = ensureAudio();
    var p = a.play();
    var onResolved = function () {
      playing = true;
      btn.setAttribute('aria-pressed', 'true');
      btn.title = 'Background music: on';
      fadeTo(TARGET_VOL);
      try { localStorage.setItem(LS_KEY, 'on'); } catch (_) {}
    };
    if (p && typeof p.then === 'function') {
      p.then(onResolved).catch(function () {
        // Autoplay blocked or asset missing — quietly revert.
        playing = false;
        btn.setAttribute('aria-pressed', 'false');
        btn.title = 'Background music: off';
      });
    } else {
      onResolved();
    }
  }

  function stop(btn) {
    if (!audio) return;
    fadeTo(0, function () {
      try { audio.pause(); } catch (_) {}
    });
    playing = false;
    btn.setAttribute('aria-pressed', 'false');
    btn.title = 'Background music: off';
    try { localStorage.setItem(LS_KEY, 'off'); } catch (_) {}
  }

  // ── topbar mount (mirrors the notifications.js retry pattern) ─────
  function buildButton() {
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'bg-music-toggle';
    b.setAttribute('aria-pressed', 'false');
    b.setAttribute('aria-label', 'Toggle background music');
    b.title = 'Background music: off';
    b.innerHTML =
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
      'stroke-width="2" stroke-linecap="round" stroke-linejoin="round" ' +
      'aria-hidden="true">' +
        '<path d="M9 18V5l12-2v13"/>' +
        '<circle cx="6" cy="18" r="3"/>' +
        '<circle cx="18" cy="16" r="3"/>' +
      '</svg>';
    b.addEventListener('click', function () {
      if (playing) stop(b); else start(b);
    });
    return b;
  }

  function placeButton(btn) {
    if (btn.isConnected) return;
    function attempt() {
      var tb = document.querySelector('.ui-topbar-right');
      if (!tb) return false;
      // Sit before the primary CTA so it clusters with sfx + theme + bell.
      var anchor = tb.querySelector('.ui-btn-primary') ||
                   document.getElementById('barUser');
      tb.insertBefore(btn, anchor || null);
      return true;
    }
    if (attempt()) return;
    var n = 0;
    var iv = setInterval(function () {
      n++;
      if (attempt() || n > 15) clearInterval(iv);
    }, 100);
  }

  // ── init ──────────────────────────────────────────────────────────
  function init() {
    injectStyles();
    var btn = buildButton();
    placeButton(btn);
    // If the user explicitly turned it on before, autoplay will be
    // blocked without a fresh gesture — but only by Safari/Chrome's
    // strict modes. Try; fall back silently. We do NOT default-on.
    var saved = null;
    try { saved = localStorage.getItem(LS_KEY); } catch (_) {}
    if (saved === 'on') start(btn);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
