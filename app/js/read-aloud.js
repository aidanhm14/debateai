/* ──────────────────────────────────────────────────────────────────
   read-aloud.js — "listen to this page" narration, sitewide.

   Every content page has a pre-generated ElevenLabs narration that
   explains what the page is and what you can do on it. Files live at
   /audio/narration/<slug>.mp3 and are built by
   scripts/generate-narration.mjs. Nothing here calls a TTS API at
   runtime, so a visitor listening to ten pages costs nothing and
   cannot hit the /api/tts rate limit.

   NAVIGATION IS THE POINT. The site is a multi-document app, so an
   <audio> element dies on every page load. This module keeps a
   narration going across navigation by writing {slug, time, playing}
   to sessionStorage on every tick, then resuming that same narration
   when the next document boots. The mp3 is already in the HTTP and
   service-worker caches by then, so the resume is effectively instant
   and the listener hears a short seam rather than a restart.

   One caveat worth knowing: browsers gate autoplay per document. The
   resume attempt is a genuine play() call on a fresh page with no user
   gesture, so it can be refused. When that happens the player does not
   fail silently, it surfaces a Resume control that takes one tap.
   Chrome generally stops refusing once the visitor has played media on
   the origin a few times; Safari tends to keep asking.

   USAGE: loaded automatically by topbar.js on every page that mounts
   the shared topbar. Nothing to wire per page.
   ────────────────────────────────────────────────────────────────── */
(function () {
  'use strict';

  if (window.__ditReadAloud) return;
  window.__ditReadAloud = true;

  var MANIFEST_URL = '/audio/narration/manifest.json';
  var AUDIO_BASE = '/audio/narration/';
  var STATE_KEY = 'dit-narration';       // survives navigation, dies with the tab
  var PREF_KEY = 'dit-narration-rate';   // playback speed, survives sessions
  var SEEN_KEY = 'dit-narration-seen';   // has this visitor ever pressed play

  var SPEEDS = [0.9, 1, 1.15, 1.3, 1.5];

  var reduced = false;
  try { reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) {}

  // ── persisted state ─────────────────────────────────────────────
  function readState() {
    try { return JSON.parse(sessionStorage.getItem(STATE_KEY) || 'null'); }
    catch (e) { return null; }
  }
  function writeState(s) {
    try {
      if (!s) sessionStorage.removeItem(STATE_KEY);
      else sessionStorage.setItem(STATE_KEY, JSON.stringify(s));
    } catch (e) {}
  }
  function readRate() {
    try {
      var r = parseFloat(localStorage.getItem(PREF_KEY));
      return SPEEDS.indexOf(r) >= 0 ? r : 1;
    } catch (e) { return 1; }
  }
  function writeRate(r) { try { localStorage.setItem(PREF_KEY, String(r)); } catch (e) {} }
  function markSeen() { try { localStorage.setItem(SEEN_KEY, '1'); } catch (e) {} }
  function hasSeen() { try { return localStorage.getItem(SEEN_KEY) === '1'; } catch (e) { return false; } }

  // ── route → narration slug ──────────────────────────────────────
  // Normalize the way the site's own redirects do: strip a trailing
  // slash, strip .html, and treat /landing as the site root.
  function normalizePath(p) {
    var s = (p || '/').split('?')[0].split('#')[0];
    s = s.replace(/\.html$/, '');
    s = s.replace(/\/+$/, '');
    // A directory index resolves to the directory: /topics/index and
    // /compare/index are the same page as /topics and /compare.
    s = s.replace(/\/index$/, '');
    if (s === '' || s === '/landing') return '/';
    return s;
  }

  // ── styles ──────────────────────────────────────────────────────
  // Self-contained so the module is a single drop-in. Uses the shared
  // ui.css tokens where they exist and falls back to literals so the
  // player still renders correctly on pages that predate the tokens.
  function injectStyles() {
    if (document.getElementById('dit-ra-styles')) return;
    var css = [
      // z-index 9500 is a deliberate slot: above the usage banner (9000)
      // so it stays reachable, below every real modal (the landing intro
      // gate and signup-nudge both sit at 9999) so a full-screen overlay
      // covers it rather than having a narration pill float over a gate.
      '.ra-host{position:fixed;left:16px;bottom:16px;z-index:9500;',
      '  font-family:inherit;max-width:calc(100vw - 32px);}',
      '.ra-host *{box-sizing:border-box;}',
      '.ra-card{display:flex;align-items:center;gap:10px;',
      '  background:var(--bg-elev-solid,#fff);color:var(--text,#1a1a1f);',
      '  border:1px solid var(--border,rgba(0,0,0,.10));',
      '  border-radius:var(--radius-pill,999px);padding:7px 8px 7px 7px;',
      '  box-shadow:0 6px 22px rgba(0,0,0,.13);',
      '  transition:border-radius .18s ease,box-shadow .18s ease;}',
      '.ra-host[data-open="1"] .ra-card{border-radius:var(--radius,16px);',
      '  flex-direction:column;align-items:stretch;gap:9px;padding:11px 12px 12px;width:312px;',
      '  box-shadow:0 14px 44px rgba(0,0,0,.19);}',
      '.ra-row{display:flex;align-items:center;gap:10px;}',
      // primary play / pause button
      '.ra-btn{flex:0 0 auto;width:34px;height:34px;border-radius:50%;border:0;cursor:pointer;',
      '  background:var(--accent,#dc2626);color:#fff;display:flex;align-items:center;',
      '  justify-content:center;padding:0;transition:transform .12s ease,background .12s ease;}',
      '.ra-btn:hover{background:var(--accent-hover,#b91c1c);}',
      '.ra-btn:active{transform:scale(.94);}',
      '.ra-btn svg{width:14px;height:14px;display:block;fill:currentColor;}',
      // label block
      '.ra-label{min-width:0;flex:1 1 auto;text-align:left;background:none;border:0;padding:0;',
      '  cursor:pointer;color:inherit;font:inherit;}',
      '.ra-title{display:block;font-size:13px;font-weight:600;line-height:1.25;',
      '  white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}',
      '.ra-sub{display:block;font-size:11px;line-height:1.3;margin-top:1px;',
      '  color:var(--text-ghost,rgba(0,0,0,.45));white-space:nowrap;overflow:hidden;',
      '  text-overflow:ellipsis;}',
      // small square controls
      '.ra-mini{flex:0 0 auto;height:26px;min-width:26px;padding:0 7px;border-radius:8px;',
      '  border:1px solid var(--border,rgba(0,0,0,.10));background:transparent;cursor:pointer;',
      '  color:var(--text-dim,rgba(0,0,0,.6));font-size:11px;font-weight:600;line-height:1;',
      '  display:flex;align-items:center;justify-content:center;}',
      '.ra-mini:hover{border-color:var(--border-strong,rgba(0,0,0,.2));color:var(--text,#1a1a1f);}',
      '.ra-mini svg{width:12px;height:12px;fill:currentColor;display:block;}',
      // scrubber
      '.ra-scrub{display:flex;align-items:center;gap:8px;}',
      '.ra-time{font-size:10px;font-variant-numeric:tabular-nums;',
      '  color:var(--text-ghost,rgba(0,0,0,.45));flex:0 0 auto;min-width:30px;}',
      '.ra-range{flex:1 1 auto;-webkit-appearance:none;appearance:none;height:4px;border-radius:99px;',
      '  background:var(--border,rgba(0,0,0,.12));outline:none;cursor:pointer;padding:0;margin:0;}',
      '.ra-range::-webkit-slider-thumb{-webkit-appearance:none;width:12px;height:12px;border-radius:50%;',
      '  background:var(--accent,#dc2626);cursor:pointer;border:2px solid var(--bg-elev-solid,#fff);}',
      '.ra-range::-moz-range-thumb{width:12px;height:12px;border-radius:50%;border:2px solid #fff;',
      '  background:var(--accent,#dc2626);cursor:pointer;}',
      '.ra-range:focus-visible{box-shadow:0 0 0 3px var(--accent-soft,rgba(220,38,38,.15));}',
      // panel extras
      '.ra-actions{display:flex;align-items:center;gap:6px;}',
      '.ra-spacer{flex:1 1 auto;}',
      '.ra-note{font-size:11px;line-height:1.4;color:var(--text-dim,rgba(0,0,0,.6));',
      '  background:var(--accent-soft,rgba(220,38,38,.07));border-radius:9px;padding:7px 9px;}',
      '.ra-note button{background:none;border:0;padding:0;font:inherit;font-weight:700;',
      '  color:var(--accent,#dc2626);cursor:pointer;text-decoration:underline;}',
      '.ra-transcript{max-height:170px;overflow-y:auto;font-size:12px;line-height:1.55;',
      '  color:var(--text-dim,rgba(0,0,0,.68));border-top:1px solid var(--border,rgba(0,0,0,.08));',
      '  padding-top:9px;margin:0;overscroll-behavior:contain;}',
      // playing indicator bars
      '.ra-eq{display:inline-flex;align-items:flex-end;gap:2px;height:9px;',
      '  vertical-align:-1px;margin-right:5px;}',
      '.ra-eq i{width:2px;background:var(--accent,#dc2626);border-radius:1px;height:3px;',
      '  animation:ra-eq 900ms ease-in-out infinite;}',
      '.ra-eq i:nth-child(2){animation-delay:150ms;}',
      '.ra-eq i:nth-child(3){animation-delay:300ms;}',
      '@keyframes ra-eq{0%,100%{height:3px;}50%{height:9px;}}',
      // entrance
      '.ra-host{opacity:0;transform:translateY(8px);transition:opacity .22s ease,transform .22s ease;}',
      '.ra-host.ra-in{opacity:1;transform:none;}',
      '@media (prefers-reduced-motion: reduce){',
      '  .ra-host{transition:none;}.ra-eq i{animation:none;height:6px;}',
      '  .ra-btn{transition:none;}}',
      '@media (max-width:540px){',
      '  .ra-host{left:10px;right:10px;bottom:10px;}',
      '  .ra-host[data-open="1"] .ra-card{width:auto;}',
      '  .ra-card{width:100%;}}',
      // never fight the print stylesheet
      '@media print{.ra-host{display:none;}}',
    ].join('\n');
    var el = document.createElement('style');
    el.id = 'dit-ra-styles';
    el.textContent = css;
    (document.head || document.documentElement).appendChild(el);
  }

  var ICON_PLAY = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg>';
  var ICON_PAUSE = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 4h4v16H6zM14 4h4v16h-4z"/></svg>';
  var ICON_CLOSE = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19 6.4 17.6 5 12 10.6 6.4 5 5 6.4 10.6 12 5 17.6 6.4 19 12 13.4 17.6 19 19 17.6 13.4 12z"/></svg>';

  function fmt(sec) {
    if (!isFinite(sec) || sec < 0) sec = 0;
    var m = Math.floor(sec / 60), s = Math.floor(sec % 60);
    return m + ':' + (s < 10 ? '0' : '') + s;
  }

  // ── player ──────────────────────────────────────────────────────
  function boot(manifest) {
    var byRoute = {};
    var pages = manifest.pages || {};
    Object.keys(pages).forEach(function (slug) {
      var p = pages[slug];
      if (p && p.route) byRoute[normalizePath(p.route)] = p;
    });

    var here = normalizePath(location.pathname);
    var pageEntry = byRoute[here] || null;
    var saved = readState();
    var resuming = saved && saved.slug && pages[saved.slug] && saved.playing;

    // Nothing to offer and nothing to resume: stay out of the way entirely.
    if (!pageEntry && !resuming) return;

    injectStyles();

    // `current` is what the player is pointed at. On a page with its own
    // narration that is the page; when resuming across navigation it is
    // whatever the listener started somewhere else.
    var current = resuming ? pages[saved.slug] : pageEntry;
    var open = false;
    var blocked = false;      // autoplay refused, waiting on a tap
    var showTranscript = false;
    var rate = readRate();

    var audio = new Audio();
    audio.preload = 'metadata';
    audio.playbackRate = rate;

    var host = document.createElement('div');
    host.className = 'ra-host';
    host.setAttribute('data-open', '0');

    var card = document.createElement('div');
    card.className = 'ra-card';
    host.appendChild(card);

    // -- collapsed / always-visible row
    var row = document.createElement('div');
    row.className = 'ra-row';

    var playBtn = document.createElement('button');
    playBtn.className = 'ra-btn';
    playBtn.type = 'button';
    playBtn.innerHTML = ICON_PLAY;

    var label = document.createElement('button');
    label.className = 'ra-label';
    label.type = 'button';
    label.setAttribute('aria-expanded', 'false');
    var titleEl = document.createElement('span');
    titleEl.className = 'ra-title';
    var subEl = document.createElement('span');
    subEl.className = 'ra-sub';
    label.appendChild(titleEl);
    label.appendChild(subEl);

    var closeBtn = document.createElement('button');
    closeBtn.className = 'ra-mini';
    closeBtn.type = 'button';
    closeBtn.innerHTML = ICON_CLOSE;
    closeBtn.setAttribute('aria-label', 'Close the page narrator');

    row.appendChild(playBtn);
    row.appendChild(label);
    row.appendChild(closeBtn);
    card.appendChild(row);

    // -- expanded panel
    var panel = document.createElement('div');
    panel.style.display = 'none';

    var scrub = document.createElement('div');
    scrub.className = 'ra-scrub';
    var tCur = document.createElement('span');
    tCur.className = 'ra-time';
    tCur.textContent = '0:00';
    var range = document.createElement('input');
    range.className = 'ra-range';
    range.type = 'range';
    range.min = '0';
    range.max = '1000';
    range.value = '0';
    range.setAttribute('aria-label', 'Seek within the narration');
    var tDur = document.createElement('span');
    tDur.className = 'ra-time';
    tDur.style.textAlign = 'right';
    tDur.textContent = current && current.seconds ? fmt(current.seconds) : '0:00';
    scrub.appendChild(tCur);
    scrub.appendChild(range);
    scrub.appendChild(tDur);
    panel.appendChild(scrub);

    var actions = document.createElement('div');
    actions.className = 'ra-actions';
    var speedBtn = document.createElement('button');
    speedBtn.className = 'ra-mini';
    speedBtn.type = 'button';
    speedBtn.textContent = rate + '×';
    speedBtn.setAttribute('aria-label', 'Change narration speed');
    var scriptBtn = document.createElement('button');
    scriptBtn.className = 'ra-mini';
    scriptBtn.type = 'button';
    scriptBtn.textContent = 'Text';
    scriptBtn.setAttribute('aria-pressed', 'false');
    var spacer = document.createElement('span');
    spacer.className = 'ra-spacer';
    // Only meaningful while a different page's narration is still running.
    var thisPageBtn = document.createElement('button');
    thisPageBtn.className = 'ra-mini';
    thisPageBtn.type = 'button';
    thisPageBtn.textContent = 'This page';
    thisPageBtn.style.display = 'none';
    actions.appendChild(speedBtn);
    actions.appendChild(scriptBtn);
    actions.appendChild(spacer);
    actions.appendChild(thisPageBtn);
    panel.appendChild(actions);

    var note = document.createElement('div');
    note.className = 'ra-note';
    note.style.display = 'none';
    panel.appendChild(note);

    var transcript = document.createElement('p');
    transcript.className = 'ra-transcript';
    transcript.style.display = 'none';
    panel.appendChild(transcript);

    card.appendChild(panel);

    // ── rendering ─────────────────────────────────────────────────
    function isOtherPage() {
      return !!(current && pageEntry && current.slug !== pageEntry.slug) ||
             !!(current && !pageEntry);
    }

    function render() {
      var playing = !audio.paused && !audio.ended;
      playBtn.innerHTML = playing ? ICON_PAUSE : ICON_PLAY;
      playBtn.setAttribute('aria-label', playing ? 'Pause narration' : 'Play narration');

      var eq = playing && !reduced ? '<span class="ra-eq"><i></i><i></i><i></i></span>' : '';
      if (isOtherPage()) {
        // Carried over from another page. Once it stops, say so — a
        // finished narration still reading "Still playing" is a lie the
        // listener can see.
        titleEl.innerHTML = playing ? (eq + 'Still playing')
          : (audio.ended ? 'Finished' : 'Paused');
        subEl.textContent = (current.title || current.slug).split('·')[0].trim();
      } else if (playing) {
        titleEl.innerHTML = eq + 'Narrating this page';
        subEl.textContent = fmt(audio.currentTime) + ' of ' +
          fmt(isFinite(audio.duration) ? audio.duration : (current.seconds || 0));
      } else if (blocked) {
        titleEl.textContent = 'Narration paused';
        subEl.textContent = 'Tap resume to continue';
      } else if (audio.currentTime > 0) {
        titleEl.textContent = 'Paused';
        subEl.textContent = fmt(audio.currentTime) + ' of ' +
          fmt(isFinite(audio.duration) ? audio.duration : (current.seconds || 0));
      } else {
        titleEl.textContent = 'Listen to this page';
        subEl.textContent = 'About ' + fmt(current.seconds || 60) + ', keeps playing as you browse';
      }

      thisPageBtn.style.display = (isOtherPage() && pageEntry) ? '' : 'none';

      if (blocked) {
        note.style.display = '';
        note.innerHTML = 'Your browser paused the audio on this page. ' +
          '<button type="button" data-ra-resume>Resume</button>';
      } else {
        note.style.display = 'none';
      }
    }

    function setOpen(v) {
      open = v;
      host.setAttribute('data-open', v ? '1' : '0');
      panel.style.display = v ? '' : 'none';
      label.setAttribute('aria-expanded', v ? 'true' : 'false');
      if (v) syncTranscript();
      render();
    }

    function syncTranscript() {
      transcript.textContent = current && current.script ? current.script : '';
      transcript.style.display = showTranscript ? '' : 'none';
      scriptBtn.setAttribute('aria-pressed', showTranscript ? 'true' : 'false');
    }

    // ── source + playback ─────────────────────────────────────────
    function load(entry, startAt) {
      current = entry;
      audio.src = AUDIO_BASE + entry.slug + '.mp3';
      audio.playbackRate = rate;
      if (startAt > 0) {
        // currentTime only sticks once metadata is in.
        audio.addEventListener('loadedmetadata', function once() {
          audio.removeEventListener('loadedmetadata', once);
          try { audio.currentTime = startAt; } catch (e) {}
        });
      }
      tDur.textContent = fmt(entry.seconds || 0);
      syncTranscript();
      render();
    }

    function play() {
      markSeen();
      var p = audio.play();
      if (p && p.catch) {
        p.then(function () {
          blocked = false;
          render();
        }).catch(function () {
          // Autoplay policy, almost always. Keep the position and let
          // the listener resume with one tap rather than dying quietly.
          // Deliberately does NOT expand the panel: on a browser that
          // refuses every resume, that would pop a panel open on every
          // page the visitor touches. The collapsed pill already reads
          // "tap resume" and its play button is the resume.
          blocked = true;
          persist();
          render();
        });
      }
    }

    function pause() {
      audio.pause();
      blocked = false;
      persist();
      render();
    }

    function toggle() {
      if (audio.paused || audio.ended) play();
      else pause();
    }

    // ── cross-page persistence ────────────────────────────────────
    var lastPersist = 0;
    function persist(force) {
      var now = Date.now();
      if (!force && now - lastPersist < 900) return;
      lastPersist = now;
      if (!current) return;
      // `playing` is what drives the resume on the next document. A
      // narration the listener deliberately paused should stay paused.
      writeState({
        slug: current.slug,
        time: audio.currentTime || 0,
        playing: (!audio.paused && !audio.ended) || blocked,
        rate: rate,
      });
    }

    function clearState() { writeState(null); }

    // ── media session (lock screen / keyboard media keys) ─────────
    function updateMediaSession() {
      if (!('mediaSession' in navigator)) return;
      try {
        navigator.mediaSession.metadata = new window.MediaMetadata({
          title: (current.title || 'Page narration').split('·')[0].trim(),
          artist: 'DebateIt',
          album: 'Page narration',
        });
        navigator.mediaSession.setActionHandler('play', play);
        navigator.mediaSession.setActionHandler('pause', pause);
        navigator.mediaSession.setActionHandler('seekbackward', function () {
          audio.currentTime = Math.max(0, audio.currentTime - 10);
        });
        navigator.mediaSession.setActionHandler('seekforward', function () {
          audio.currentTime = Math.min(audio.duration || 0, audio.currentTime + 10);
        });
      } catch (e) {}
    }

    // ── events ────────────────────────────────────────────────────
    playBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      toggle();
      if (!open && !audio.paused) setOpen(true);
    });

    label.addEventListener('click', function () { setOpen(!open); });

    closeBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      audio.pause();
      clearState();
      host.classList.remove('ra-in');
      window.setTimeout(function () {
        if (host.parentNode) host.parentNode.removeChild(host);
      }, reduced ? 0 : 220);
    });

    speedBtn.addEventListener('click', function () {
      var i = SPEEDS.indexOf(rate);
      rate = SPEEDS[(i + 1) % SPEEDS.length];
      audio.playbackRate = rate;
      writeRate(rate);
      speedBtn.textContent = rate + '×';
      persist(true);
    });

    scriptBtn.addEventListener('click', function () {
      showTranscript = !showTranscript;
      syncTranscript();
    });

    thisPageBtn.addEventListener('click', function () {
      if (!pageEntry) return;
      load(pageEntry, 0);
      play();
      updateMediaSession();
    });

    note.addEventListener('click', function (e) {
      if (e.target && e.target.hasAttribute('data-ra-resume')) play();
    });

    var seeking = false;
    range.addEventListener('input', function () {
      seeking = true;
      var d = isFinite(audio.duration) ? audio.duration : 0;
      tCur.textContent = fmt((range.value / 1000) * d);
    });
    range.addEventListener('change', function () {
      var d = isFinite(audio.duration) ? audio.duration : 0;
      if (d) audio.currentTime = (range.value / 1000) * d;
      seeking = false;
      persist(true);
    });

    audio.addEventListener('timeupdate', function () {
      if (!seeking && isFinite(audio.duration) && audio.duration > 0) {
        range.value = String(Math.round((audio.currentTime / audio.duration) * 1000));
        tCur.textContent = fmt(audio.currentTime);
      }
      persist();
      if (open || !audio.paused) render();
    });

    audio.addEventListener('loadedmetadata', function () {
      if (isFinite(audio.duration)) tDur.textContent = fmt(audio.duration);
      render();
    });

    audio.addEventListener('play', function () { blocked = false; render(); persist(true); });
    audio.addEventListener('pause', function () { render(); persist(true); });
    audio.addEventListener('ended', function () {
      range.value = '0';
      clearState();
      render();
    });
    audio.addEventListener('error', function () {
      // A missing or corrupt mp3 should not leave a dead control on screen.
      if (host.parentNode) host.parentNode.removeChild(host);
      clearState();
    });

    // Persist hard on the way out. pagehide fires reliably on nav and on
    // mobile background, where unload does not.
    window.addEventListener('pagehide', function () { persist(true); });
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'hidden') persist(true);
    });

    // ── yield to the sign-up nudge ────────────────────────────────
    // Under 520px signup-nudge.js pins itself full-width at bottom:8px,
    // which is exactly where this pill goes on mobile. This one has the
    // higher z-index, so without this it would sit on top of a
    // conversion surface and hide it. Narration is the lower-priority
    // element of the two, so it moves.
    function avoidNudge() {
      var nudge = document.querySelector('.signup-nudge');
      var stacked = window.innerWidth <= 540;
      if (nudge && stacked) {
        var h = nudge.getBoundingClientRect().height || 56;
        host.style.bottom = (h + 18) + 'px';
      } else {
        host.style.bottom = '';
      }
    }
    try {
      new window.MutationObserver(avoidNudge)
        .observe(document.body, { childList: true, subtree: false });
    } catch (e) {}
    window.addEventListener('resize', avoidNudge);

    // ── mount ─────────────────────────────────────────────────────
    document.body.appendChild(host);
    avoidNudge();
    window.requestAnimationFrame(function () { host.classList.add('ra-in'); });

    if (resuming) {
      load(pages[saved.slug], saved.time || 0);
      if (saved.rate && SPEEDS.indexOf(saved.rate) >= 0) {
        rate = saved.rate;
        audio.playbackRate = rate;
        speedBtn.textContent = rate + '×';
      }
      updateMediaSession();
      // Stays collapsed. The listener already knows they started this;
      // what they need from a page they just navigated to is a small
      // "still playing" marker and a pause button, not a panel.
      play();
    } else {
      load(pageEntry, saved && saved.slug === pageEntry.slug ? (saved.time || 0) : 0);
      updateMediaSession();
      render();
    }
  }

  // ── init ────────────────────────────────────────────────────────
  function init() {
    // The manifest is small and immutable between deploys, so let the
    // HTTP cache do the work. A failed fetch means no narration bank on
    // this deploy, which is a silent no-op rather than an error.
    fetch(MANIFEST_URL, { credentials: 'omit' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (m) { if (m && m.pages) boot(m); })
      .catch(function () {});
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
