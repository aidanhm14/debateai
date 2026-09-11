/* Fixed invitations recorded with GPT-Live 1 / Marin. No microphone or
   live model session is opened by browsing or hovering. */
(function () {
  'use strict';
  function fresh(data, now, maxAge) {
    return !!data && !data.error && Number.isFinite(data.at) && now - data.at >= -5000 && now - data.at <= maxAge;
  }
  function canInvite(online, queue, watch, stream, uid, now) {
    if (!fresh(online, now, 360000) || !Number.isInteger(online.online) || online.online < 0 || online.online > 1) return false;
    if (!fresh(queue, now, 60000) || !Number.isInteger(queue.count) || queue.count < 0 || !Array.isArray(queue.debaters)) return false;
    var self = uid && queue.debaters.some(function (p) { return p.uid === uid; }) ? 1 : 0;
    return queue.count - self === 0 && fresh(watch, now, 60000) && watch.count === 0 && Array.isArray(watch.rounds) && watch.rounds.length === 0 && !!stream && !stream.error && stream.live === false;
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = { canInvite: canInvite };
  if (typeof document === 'undefined') return;
  var links = Array.from(document.querySelectorAll('[data-ai-invite]'));
  if (!links.length) return;
  var reduced = matchMedia('(prefers-reduced-motion: reduce)');
  var SEEN = 'da-ai-alone-invited-v1';
  var seen = false, eligibleUntil = 0, lastSpoke = 0, busy = false, checking = false;
  var active = null, pending = null, attemptId = 0, hoverTimer = 0, raf = 0, previousFrame = 0, energy = 0;
  var arrived = Date.now(), audioContext, analyser, samples;
  var audio = new Audio();
  audio.preload = 'none'; audio.volume = 0.65;
  try { seen = sessionStorage.getItem(SEEN) === '1'; } catch (_) {}
  var caption = document.createElement('div');
  caption.className = 'ai-invite-caption'; caption.hidden = true;
  var words = document.createElement('span'); words.setAttribute('role', 'status');
  var dismiss = document.createElement('button'); dismiss.type = 'button'; dismiss.textContent = '×'; dismiss.setAttribute('aria-label', 'Dismiss AI invitation');
  caption.appendChild(words); caption.appendChild(dismiss); document.body.appendChild(caption);

  function muted() { try { return localStorage.getItem('da-sfx-muted') === '1'; } catch (_) { return false; } }
  function blocked() {
    if (document.hidden || muted()) return true;
    if (Array.from(document.querySelectorAll('[role="dialog"],#ditAuth,#ljModal')).some(function (el) { return el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden'; })) return true;
    return Array.from(document.querySelectorAll('audio,video')).some(function (el) { return !el.paused && !el.muted && el.volume > 0; });
  }
  function visible(link) {
    var r = link.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < innerHeight;
  }
  function markSeen() { seen = true; try { sessionStorage.setItem(SEEN, '1'); } catch (_) {} }
  function stop() {
    attemptId++;
    audio.pause(); busy = false; active = null; pending = null;
    links.forEach(function (link) { link.classList.remove('is-ai-speaking'); });
    caption.hidden = true;
  }
  dismiss.addEventListener('click', function () { markSeen(); stop(); });
  function connectAudio() {
    if (audioContext) return;
    var Context = window.AudioContext || window.webkitAudioContext;
    if (!Context) return;
    audioContext = new Context(); analyser = audioContext.createAnalyser(); analyser.fftSize = 256;
    samples = new Uint8Array(analyser.fftSize);
    audioContext.createMediaElementSource(audio).connect(analyser); analyser.connect(audioContext.destination);
  }
  async function speak(kind, link) {
    if (busy || blocked() || !visible(link) || Date.now() - lastSpoke < 15000) return;
    if (kind === 'alone' && (seen || Date.now() > eligibleUntil)) return;
    busy = true; active = kind; pending = null;
    var attempt = ++attemptId;
    audio.src = '/audio/ai-invite/' + kind + '.mp3';
    try {
      // Resume inside the user gesture when one exists. A cold hover may
      // be denied by autoplay policy; the next interaction can retry.
      if (audioContext && audioContext.state === 'suspended') await audioContext.resume();
      if (attempt !== attemptId) return;
      if (!busy || blocked() || !visible(link) || (kind === 'alone' && Date.now() > eligibleUntil)) { stop(); return; }
      await audio.play();
      if (attempt !== attemptId) return;
      if (!busy || blocked() || !visible(link)) { stop(); return; }
      lastSpoke = Date.now();
      if (kind === 'alone') markSeen();
      link.classList.add('is-ai-speaking');
      animate();
      words.textContent = kind === 'alone' ? 'Wanna debate me? Press Debate the AI, and get a ranking.' : 'Hey, wanna debate me?';
      caption.hidden = false;
    } catch (error) {
      if (attempt !== attemptId) return;
      stop();
      // Fresh browsers can reject sound before a click, regardless of
      // sign-in. Retry only on a trusted interaction, never fake playback.
      if (error && error.name === 'NotAllowedError') pending = { kind: kind, link: link };
    }
  }
  audio.addEventListener('ended', stop);
  audio.addEventListener('pause', function () { if (busy) stop(); });
  audio.addEventListener('error', stop);
  audio.addEventListener('timeupdate', function () { if (busy && blocked()) stop(); });
  links.forEach(function (link) {
    link.addEventListener('pointerenter', function (e) {
      if (e.pointerType === 'touch') return;
      animate();
      clearTimeout(hoverTimer);
      hoverTimer = setTimeout(function () { speak('hover', link); }, 220);
    });
    link.addEventListener('pointerleave', function () {
      clearTimeout(hoverTimer);
      if (active === 'hover' || (pending && pending.kind === 'hover')) stop();
    });
    link.addEventListener('focus', function () { if (link.matches(':focus-visible')) speak('hover', link); });
    link.addEventListener('blur', function () { if (active === 'hover' || (pending && pending.kind === 'hover')) stop(); });
    link.addEventListener('click', stop);
  });

  var canvases = links.map(function (link) {
    var canvas = document.createElement('canvas'); canvas.className = 'ai-invite-wave'; canvas.setAttribute('aria-hidden', 'true'); link.prepend(canvas);
    return { link: link, canvas: canvas, ctx: canvas.getContext('2d'), onScreen: false };
  });
  function draw(now) {
    raf = 0;
    if (document.hidden) return;
    var shown = canvases.filter(function (item) {
      return item.onScreen && (item.link.matches(':hover') || item.link.classList.contains('is-ai-speaking'));
    });
    if (!shown.length) return;
    if (!reduced.matches) raf = requestAnimationFrame(draw);
    if (!reduced.matches && now - previousFrame < 33) return;
    previousFrame = now;
    var raw = 0;
    if (analyser && busy && !audio.paused) {
      analyser.getByteTimeDomainData(samples);
      for (var i = 0; i < samples.length; i++) raw += Math.pow((samples[i] - 128) / 128, 2);
      raw = Math.min(1, Math.sqrt(raw / samples.length) * 5);
    } else if (busy && !audio.paused) raw = 0.35;
    energy += (raw - energy) * 0.2;
    shown.forEach(function (item) {
      var c = item.canvas, cx = item.ctx, w = item.link.clientWidth, h = item.link.clientHeight;
      if (!cx || !w || !h) return;
      var dpr = Math.min(devicePixelRatio || 1, 2);
      if (c.width !== Math.round(w * dpr) || c.height !== Math.round(h * dpr)) { c.width = Math.round(w * dpr); c.height = Math.round(h * dpr); }
      cx.setTransform(dpr, 0, 0, dpr, 0, 0); cx.clearRect(0, 0, w, h);
      var light = document.documentElement.dataset.theme === 'light';
      var gradient = cx.createLinearGradient(0, 0, w, 0);
      gradient.addColorStop(0, light ? '#73737b' : '#d5d5de'); gradient.addColorStop(0.5, '#f87171'); gradient.addColorStop(1, '#dc2626');
      var t = reduced.matches ? 0 : now / 1000;
      var amp = reduced.matches ? 3 : 4 + energy * 15 + (item.link.matches(':hover') ? 3 : 0);
      [6, 2.5, 1.2].forEach(function (width, pass) {
        cx.beginPath();
        for (var x = 0; x <= w; x += 3) {
          var envelope = 0.3 + 0.7 * Math.sin(Math.PI * x / w);
          var y = h / 2 + envelope * (Math.sin(x * 0.038 - t * 3.7) * amp + Math.sin(x * 0.019 + t * 2.2) * amp * 0.45);
          if (!x) cx.moveTo(x, y); else cx.lineTo(x, y);
        }
        cx.strokeStyle = gradient; cx.lineWidth = width; cx.globalAlpha = [0.08, 0.22, 0.72][pass]; cx.stroke();
      });
      cx.globalAlpha = 1;
    });
  }
  function animate() { if (!raf) raf = requestAnimationFrame(draw); }
  if ('IntersectionObserver' in window) {
    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) { canvases.forEach(function (item) { if (item.link === entry.target) item.onScreen = entry.isIntersecting; }); });
      animate();
    });
    canvases.forEach(function (item) { observer.observe(item.link); });
  } else { canvases.forEach(function (item) { item.onScreen = true; }); animate(); }
  if (reduced.addEventListener) reduced.addEventListener('change', animate);
  window.addEventListener('resize', animate);

  async function read(url) {
    var response = await fetch(url, { cache: 'no-cache', signal: AbortSignal.timeout(6000) });
    if (!response.ok) throw Error('Unavailable');
    return response.json();
  }
  async function checkAlone() {
    if (seen || checking || document.hidden) return;
    checking = true;
    try {
      var data = await Promise.all([read('/api/online-count'), read('/api/live-now'), window.watchLive ? window.watchLive() : read('/api/watch-live'), read('/api/stream-status')]);
      var uid = ''; try { uid = window.firebase.auth().currentUser.uid; } catch (_) {}
      eligibleUntil = canInvite(data[0], data[1], data[2], data[3], uid, Date.now()) ? Date.now() + 20000 : 0;
      if (!eligibleUntil && active === 'alone') stop();
      maybeInvite();
    } catch (_) { eligibleUntil = 0; } finally { checking = false; }
  }
  function maybeInvite() {
    if (seen || Date.now() - arrived < 8000 || Date.now() > eligibleUntil || reduced.matches) return;
    var link = links.find(visible);
    if (link) speak('alone', link);
  }
  function interaction(e) {
    if (!e.isTrusted) return;
    try { connectAudio(); if (audioContext) audioContext.resume().catch(function () {}); } catch (_) {}
    if (e.target.closest('a,input,select,textarea,[contenteditable]')) return;
    if (pending && pending.kind === 'hover' && pending.link.matches(':hover,:focus-visible')) {
      speak('hover', pending.link);
    } else maybeInvite();
  }
  document.addEventListener('pointerup', interaction);
  document.addEventListener('keydown', interaction);
  document.addEventListener('play', function (e) { if (e.target !== audio && !e.target.muted && e.target.volume > 0) stop(); }, true);
  document.addEventListener('visibilitychange', function () { if (document.hidden) stop(); else { animate(); checkAlone(); } });
  window.addEventListener('pagehide', stop);
  setTimeout(checkAlone, 8000);
  var poll = setInterval(function () { if (seen) clearInterval(poll); else checkAlone(); }, 45000);
})();
