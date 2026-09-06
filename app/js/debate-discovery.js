(function () {
  'use strict';
  // These are explicitly examples. Play portraits when visible, without
  // spending bandwidth in hidden tabs or for reduced-motion visitors.
  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  document.querySelectorAll('[data-debate-preview]').forEach(function (preview) {
    var videos = preview.querySelectorAll('video[data-src]');
    var button = preview.querySelector('[data-preview-pause]');
    var visible = false, paused = false;
    function sync() {
      var play = visible && !document.hidden && !reduced.matches && !paused;
      videos.forEach(function (video) {
        if (!play) { video.pause(); return; }
        if (!video.getAttribute('src')) video.src = video.getAttribute('data-src');
        video.muted = true;
        var attempt = video.play();
        if (attempt && attempt.catch) attempt.catch(function () {});
      });
      if (button) {
        button.hidden = reduced.matches;
        button.textContent = paused ? 'Play animation' : 'Pause animation';
      }
    }
    if (button) button.addEventListener('click', function () { paused = !paused; sync(); });
    document.addEventListener('visibilitychange', sync);
    if (reduced.addEventListener) reduced.addEventListener('change', sync);
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (entries) { visible = entries[0].isIntersecting; sync(); }).observe(preview);
    } else { visible = true; }
    sync();
  });

  var activity = document.getElementById('onlineActivity');
  if (!activity) return;
  var queue = document.getElementById('onlineQueue');
  var watch = document.getElementById('onlineWatch');
  var presence = document.getElementById('onlinePresence');
  var room = document.getElementById('onlineLiveRoom');
  var kicker = document.getElementById('onlineMatchKicker');
  var busy = false;
  function count(value) { return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : null; }
  function label(el, text, active) {
    el.querySelector('[data-activity-label]').textContent = text;
    el.setAttribute('data-active', active ? 'true' : 'false');
  }
  async function read(path) {
    var controller = new AbortController();
    var timeout = setTimeout(function () { controller.abort(); }, 6000);
    try {
      var response = await fetch(path, { signal: controller.signal, cache: 'no-cache' });
      if (!response.ok) throw Error('unavailable');
      var data = await response.json();
      if (!data || data.error) throw Error('unavailable');
      if (data.at != null && (typeof data.at !== 'number' || Math.abs(Date.now() - data.at) > 120000)) throw Error('stale');
      return data;
    } finally { clearTimeout(timeout); }
  }
  async function refresh() {
    if (busy || document.hidden) return;
    busy = true;
    try {
      await Promise.allSettled([
        read('/api/spar-queue').then(function (data) {
          var n = count(data.waiting);
          if (n === null) throw Error('invalid count');
          label(queue, n ? n + (n === 1 ? ' person waiting to debate' : ' people waiting to debate') : 'Be first in the live queue', n > 0);
          kicker.textContent = n ? 'Someone is ready. Find your match.' : 'Answer a few questions. Find your match.';
        }).catch(function () {
          label(queue, 'Check the live queue', false);
          kicker.textContent = 'Answer a few questions. Find your match.';
        }),
        read('/api/watch-live').then(function (data) {
          if (!Array.isArray(data.rounds)) throw Error('invalid rounds');
          var rounds = data.rounds.filter(function (r) { return r && typeof r.room === 'string' && /^[a-zA-Z0-9_-]{1,80}$/.test(r.room); });
          var n = rounds.length;
          label(watch, n ? n + (n === 1 ? ' debate live now' : ' debates live now') : 'Explore rounds and replays', n > 0);
          room.hidden = !n;
          if (n) {
            var link = room.querySelector('a');
            link.textContent = String(rounds[0].motion || 'Watch this live debate').slice(0, 160);
            link.href = '/live-round?room=' + encodeURIComponent(rounds[0].room) + '&spectate=1&from=debate-online';
          }
        }).catch(function () { label(watch, 'Explore rounds and replays', false); room.hidden = true; }),
        read('/api/presence-live').then(function (data) {
          var n = count(data.online5);
          presence.hidden = !n;
          if (n) presence.textContent = n.toLocaleString() + ' active in the last 5 minutes';
        }).catch(function () { presence.hidden = true; })
      ]);
    } finally { busy = false; }
  }
  refresh();
  setInterval(refresh, 30000);
  document.addEventListener('visibilitychange', refresh);
  document.querySelectorAll('[data-cta^="debate-online-"]').forEach(function (link) {
    link.addEventListener('click', function () {
      try { if (window.gtag) window.gtag('event', 'debate_online_continue', { destination: link.getAttribute('href'), surface: link.getAttribute('data-cta') }); } catch (e) {}
    });
  });
})();
