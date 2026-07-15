/* spar-night.js — Open Spar Night countdown (2026-07-15).
 *
 * The liquidity fix for /spar: one fixed weekly hour when everyone
 * queues at once, instead of visitors trickling in across the week and
 * never overlapping in the 60s matchmaking window. Wednesdays 8:00 PM
 * ET (America/New_York), 90-minute live window. First event
 * 2026-07-22; before that the countdown targets the first event, after
 * that it always targets the next Wednesday.
 *
 * Deterministic and client-side only: no server dependency, no
 * Firestore reads. The weekly reminder email rides a separate cron
 * (netlify/functions/scheduled-spar-night.mjs) that computes the same
 * schedule server-side.
 *
 * Mounting: any element with data-spar-night="banner|rail" gets the
 * matching card. The scanner re-checks for a few seconds after load so
 * dynamically inserted slots (the /spar waitlist rail builds its DOM in
 * JS) get picked up without coupling. QA escape: ?sparnight=off.
 */
(function () {
  if (typeof window === 'undefined') return;
  try {
    if (/[?&]sparnight=off\b/.test(location.search)) return;
  } catch (e) {}

  var TZ = 'America/New_York';
  var EVENT_HOUR = 20;              // 8:00 PM ET
  var LIVE_MS = 90 * 60 * 1000;     // event window: 8:00–9:30 PM ET
  // First event: Wed 2026-07-22 20:00 EDT = 2026-07-23 00:00 UTC.
  var FIRST_EVENT_UTC = Date.UTC(2026, 6, 23, 0, 0, 0);

  // ── Timezone math (no libraries) ─────────────────────
  // Wall-clock parts of a UTC instant as seen in New York.
  var partsFmt = null;
  function nyParts(utcMs) {
    if (!partsFmt) {
      partsFmt = new Intl.DateTimeFormat('en-US', {
        timeZone: TZ, weekday: 'short', year: 'numeric', month: '2-digit',
        day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false,
      });
    }
    var out = {};
    partsFmt.formatToParts(new Date(utcMs)).forEach(function (p) { out[p.type] = p.value; });
    return out;
  }

  // UTC instant for a New York wall-clock time. Two correction passes
  // converge across DST boundaries.
  function nyToUtc(y, mo, d, hh, mm) {
    var want = Date.UTC(y, mo - 1, d, hh, mm);
    var guess = want;
    for (var i = 0; i < 2; i++) {
      var p = nyParts(guess);
      var asUtc = Date.UTC(+p.year, +p.month - 1, +p.day, (+p.hour) % 24, +p.minute);
      guess += want - asUtc;
    }
    return guess;
  }

  // Next event start (UTC ms) whose live window hasn't ended yet.
  function nextEventStart(nowMs) {
    for (var i = 0; i < 10; i++) {
      var p = nyParts(nowMs + i * 86400000);
      if (p.weekday !== 'Wed') continue;
      var start = nyToUtc(+p.year, +p.month, +p.day, EVENT_HOUR, 0);
      if (start + LIVE_MS <= nowMs) continue; // this Wednesday already done
      return Math.max(start, FIRST_EVENT_UTC);
    }
    return FIRST_EVENT_UTC; // unreachable; safety
  }

  function eventState(nowMs) {
    var start = nextEventStart(nowMs);
    var live = nowMs >= start && nowMs < start + LIVE_MS;
    return { start: start, live: live, endsAt: start + LIVE_MS };
  }

  // ── Display helpers ──────────────────────────────────
  function two(n) { return n < 10 ? '0' + n : '' + n; }
  function countdownLabel(ms) {
    if (ms <= 0) return 'now';
    var s = Math.floor(ms / 1000);
    var d = Math.floor(s / 86400);
    var h = Math.floor((s % 86400) / 3600);
    var m = Math.floor((s % 3600) / 60);
    if (d > 0) return d + 'd ' + two(h) + 'h ' + two(m) + 'm';
    if (h > 0) return h + 'h ' + two(m) + 'm';
    return m + 'm ' + two(s % 60) + 's';
  }
  // The event start in the visitor's own timezone, only when it reads
  // differently from the ET label (saves non-US visitors the math).
  function localLabel(startMs) {
    try {
      var loc = new Date(startMs).toLocaleString(undefined, {
        weekday: 'short', hour: 'numeric', minute: '2-digit',
      });
      var ny = new Date(startMs).toLocaleString('en-US', {
        weekday: 'short', hour: 'numeric', minute: '2-digit', timeZone: TZ,
      });
      if (loc === ny) return '';
      return loc + ' your time';
    } catch (e) { return ''; }
  }

  // Recurring Google Calendar template (weekly, Wednesdays, ET).
  var GCAL_URL = 'https://calendar.google.com/calendar/render?action=TEMPLATE'
    + '&text=' + encodeURIComponent('Open Spar Night · DebateIt')
    + '&details=' + encodeURIComponent('Weekly live hour on DebateIt. Everyone queues at once: real opponents, timed rounds, an AI judge ballot at the end. Join the queue at debateai.com/spar')
    + '&location=' + encodeURIComponent('https://debateai.com/spar')
    + '&dates=20260722T200000/20260722T213000'
    + '&ctz=' + encodeURIComponent(TZ)
    + '&recur=' + encodeURIComponent('RRULE:FREQ=WEEKLY;BYDAY=WE');

  function ga(name, meta) {
    try { if (window.track) window.track(name, meta || {}); } catch (e) {}
    try { if (window.gtag) window.gtag('event', name, meta || {}); } catch (e) {}
  }

  // ── Styles (shared once) ─────────────────────────────
  var CSS = '' +
    '.sn-card{border:1px solid var(--border,rgba(255,255,255,.14));border-radius:14px;' +
      'background:var(--bg-card,rgba(255,255,255,.03));text-align:left;font-family:inherit}' +
    '.sn-card.sn-live{border-color:rgba(34,197,94,.55)}' +
    '.sn-eyebrow{display:flex;align-items:center;gap:7px;font-size:.62rem;font-weight:800;' +
      'letter-spacing:.14em;text-transform:uppercase;color:var(--text-dim,rgba(255,255,255,.6))}' +
    '.sn-dot{width:7px;height:7px;border-radius:50%;background:var(--accent,#ef4444);' +
      'box-shadow:0 0 8px var(--accent,#ef4444);animation:snDot 1.8s ease-in-out infinite}' +
    '.sn-live .sn-dot{background:#22c55e;box-shadow:0 0 8px #22c55e}' +
    '@keyframes snDot{0%,100%{opacity:1}50%{opacity:.4}}' +
    '.sn-title{font-weight:800;color:var(--text,#f4f4f2);line-height:1.25}' +
    '.sn-sub{color:var(--text-dim,rgba(255,255,255,.62));line-height:1.5}' +
    '.sn-count{font-variant-numeric:tabular-nums;font-weight:800;color:var(--text,#f4f4f2)}' +
    '.sn-local{color:var(--text-dim,rgba(255,255,255,.5))}' +
    '.sn-cta{display:inline-flex;align-items:center;gap:6px;border-radius:999px;font-weight:800;' +
      'text-decoration:none;transition:transform .15s,background .15s,border-color .15s;cursor:pointer}' +
    '.sn-cta--solid{background:var(--accent,#ef4444);color:#fff}' +
    '.sn-cta--solid:hover{background:#dc2626;transform:translateY(-1px)}' +
    '.sn-live .sn-cta--solid{background:#16a34a}.sn-live .sn-cta--solid:hover{background:#15803d}' +
    '.sn-cta--ghost{border:1px solid var(--border,rgba(255,255,255,.18));' +
      'color:var(--text-dim,rgba(255,255,255,.66));background:transparent}' +
    '.sn-cta--ghost:hover{color:var(--text,#f4f4f2);border-color:var(--border-strong,rgba(255,255,255,.34))}' +
    /* banner variant (landing) */
    '.sn-card--banner{display:flex;flex-wrap:wrap;align-items:center;justify-content:center;' +
      'gap:14px 26px;max-width:760px;margin:0 auto 26px;padding:14px 22px}' +
    '.sn-card--banner .sn-main{text-align:left;min-width:0}' +
    '.sn-card--banner .sn-title{font-size:.98rem;margin:3px 0 1px}' +
    '.sn-card--banner .sn-sub{font-size:.8rem;margin:0}' +
    '.sn-card--banner .sn-right{display:flex;align-items:center;gap:12px;flex-wrap:wrap;justify-content:center}' +
    '.sn-card--banner .sn-count{font-size:1.15rem}' +
    '.sn-card--banner .sn-local{display:block;font-size:.66rem;margin-top:1px}' +
    '.sn-card--banner .sn-cta{font-size:.8rem;padding:9px 16px}' +
    '[data-theme="light"] .sn-card--banner{background:rgba(0,0,0,.02);border-color:rgba(0,0,0,.12)}' +
    /* rail variant (/spar sidebar) */
    '.sn-card--rail{display:block;padding:11px 12px;margin:0}' +
    '.sn-card--rail .sn-title{font-size:.78rem;margin:5px 0 2px}' +
    '.sn-card--rail .sn-sub{font-size:.68rem;margin:0 0 8px}' +
    '.sn-card--rail .sn-count{font-size:.86rem}' +
    '.sn-card--rail .sn-local{display:block;font-size:.62rem;margin-top:1px}' +
    '.sn-card--rail .sn-row{display:flex;align-items:center;justify-content:space-between;gap:10px}' +
    '.sn-card--rail .sn-cta{font-size:.66rem;padding:5px 11px;flex:none}';

  function injectCss() {
    if (document.getElementById('sparNightCss')) return;
    var st = document.createElement('style');
    st.id = 'sparNightCss';
    st.textContent = CSS;
    document.head.appendChild(st);
  }

  // ── Render ───────────────────────────────────────────
  var mounted = [];
  function render(el, variant, page) {
    var st = eventState(Date.now());
    var live = st.live;
    el.className = 'sn-card sn-card--' + variant + (live ? ' sn-live' : '');
    var local = localLabel(st.start);
    var eyebrow = '<div class="sn-eyebrow"><span class="sn-dot"></span>' +
      (live ? 'Open Spar Night · live now' : 'Open Spar Night') + '</div>';
    var title = live
      ? 'Spar Night is on. Rounds matching until 9:30 PM ET.'
      : 'Wednesdays · 8:00 PM ET';
    var sub = live
      ? 'Real opponents, timed rounds, a judge ballot at the end.'
      : 'One hour a week when everyone queues at once. Real opponents, instant matches, AI ballots.';
    var count = live
      ? 'ends in <span class="sn-count" data-sn-count></span>'
      : 'next one in <span class="sn-count" data-sn-count></span>';
    var solid = live
      ? '<a class="sn-cta sn-cta--solid" data-sn-act="join" href="/spar">Join the queue &rarr;</a>'
      : (page === 'spar'
          ? '<a class="sn-cta sn-cta--solid" data-sn-act="calendar" href="' + GCAL_URL + '" target="_blank" rel="noopener">Add to calendar</a>'
          : '<a class="sn-cta sn-cta--solid" data-sn-act="spar" href="/spar">See the queue &rarr;</a>');
    var ghost = live ? '' : (page === 'spar' ? ''
      : '<a class="sn-cta sn-cta--ghost" data-sn-act="calendar" href="' + GCAL_URL + '" target="_blank" rel="noopener">Add to calendar</a>');

    if (variant === 'rail') {
      el.innerHTML = eyebrow +
        '<div class="sn-title">' + title + '</div>' +
        '<div class="sn-sub">' + sub + '</div>' +
        '<div class="sn-row"><span class="sn-sub" style="margin:0">' + count +
        (local ? '<span class="sn-local">' + local + '</span>' : '') + '</span>' + solid + '</div>';
    } else {
      el.innerHTML =
        '<div class="sn-main">' + eyebrow +
          '<div class="sn-title">' + title + '</div>' +
          '<div class="sn-sub">' + sub + '</div></div>' +
        '<div class="sn-right"><span class="sn-sub" style="margin:0">' + count +
        (local ? '<span class="sn-local">' + local + '</span>' : '') + '</span>' + solid + ghost + '</div>';
    }
    el.querySelectorAll('[data-sn-act]').forEach(function (a) {
      a.addEventListener('click', function () {
        ga('spar_night_click', { action: a.getAttribute('data-sn-act'), page: page, live: live ? 1 : 0 });
      });
    });
    return { el: el, variant: variant, page: page, live: live, start: st.start, endsAt: st.endsAt };
  }

  function tick() {
    var now = Date.now();
    mounted.forEach(function (m) {
      // Re-render on phase change (countdown → live → next week).
      if ((now >= m.start && now < m.endsAt) !== m.live || now >= m.endsAt) {
        var r = render(m.el, m.variant, m.page);
        m.live = r.live; m.start = r.start; m.endsAt = r.endsAt;
        return;
      }
      var target = m.live ? m.endsAt : m.start;
      var span = m.el.querySelector('[data-sn-count]');
      if (span) span.textContent = countdownLabel(target - now);
    });
  }

  function scan() {
    var slots = document.querySelectorAll('[data-spar-night]:not([data-sn-mounted])');
    if (!slots.length) return;
    injectCss();
    slots.forEach(function (slot) {
      slot.setAttribute('data-sn-mounted', '1');
      var variant = slot.getAttribute('data-spar-night') === 'rail' ? 'rail' : 'banner';
      var page = /^\/spar/.test(location.pathname) ? 'spar' : 'landing';
      var m = render(slot, variant, page);
      mounted.push(m);
      ga('spar_night_seen', { page: page, variant: variant, live: m.live ? 1 : 0 });
    });
    tick();
  }

  function boot() {
    scan();
    // Catch slots inserted after load (the /spar rail builds in JS).
    var tries = 0;
    var late = setInterval(function () {
      scan();
      if (++tries >= 15) clearInterval(late); // ~30s of coverage
    }, 2000);
    setInterval(tick, 1000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

  window.SparNight = { scan: scan };
})();
