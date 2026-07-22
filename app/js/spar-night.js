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
  var MON_ABBR = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN',
                  'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
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
    + '&text=' + encodeURIComponent('Open Spar Night · Debatable')
    + '&details=' + encodeURIComponent('Weekly live hour on Debatable. Everyone queues at once: real opponents, timed rounds, an AI judge ballot at the end. Join the queue at debateai.com/spar')
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
    '.sn-eyebrow{display:flex;align-items:center;gap:7px;font-size:.66rem;font-weight:900;' +
      'letter-spacing:.13em;text-transform:uppercase;color:var(--text-dim,rgba(255,255,255,.6))}' +
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
    // Calendar tile: a torn-off desk-calendar page. Red cap with the
    // month, big Eastern date, weekday under it. Reads as "a date" at a
    // glance, which the countdown alone did not.
    '.sn-cal{align-self:center;flex:none;width:74px;border-radius:12px;overflow:hidden;text-align:center;' +
      'border:1px solid var(--border,rgba(255,255,255,.16));background:var(--bg-card,rgba(255,255,255,.05));' +
      'box-shadow:0 8px 20px -10px rgba(0,0,0,.5)}' +
    '.sn-cal-m{display:block;padding:4px 0 3px;background:var(--accent,#ef4444);color:#fff;' +
      'font-size:.6rem;font-weight:900;letter-spacing:.12em}' +
    '.sn-live .sn-cal-m{background:#22c55e}' +
    '.sn-cal-d{display:block;padding:5px 0 1px;font-size:1.7rem;font-weight:800;line-height:1;' +
      'font-variant-numeric:tabular-nums;color:var(--text,#f4f4f2)}' +
    '.sn-cal-w{display:block;padding:0 0 7px;font-size:.58rem;font-weight:800;letter-spacing:.1em;' +
      'color:var(--text-dim,rgba(255,255,255,.55))}' +
    '[data-theme="light"] .sn-cal,[data-theme="stone"] .sn-cal{background:#fff;border-color:rgba(29,25,21,.14);' +
      'box-shadow:0 8px 18px -12px rgba(80,42,28,.5)}' +
    '.sn-card--banner{position:relative;display:grid;grid-template-columns:auto minmax(0,1.2fr) minmax(350px,.8fr);' +
      'gap:28px;max-width:1040px;margin:0 auto 24px;padding:24px 28px;overflow:hidden;' +
      'box-shadow:0 24px 70px -44px rgba(0,0,0,.7)}' +
    '.sn-card--banner:before{content:"";position:absolute;inset:0 auto 0 0;width:3px;background:var(--accent,#ef4444)}' +
    '.sn-card--banner.sn-live:before{background:#22c55e}' +
    '.sn-card--banner .sn-main{text-align:left;min-width:0;align-self:center}' +
    '.sn-card--banner .sn-title{font-family:"Crimson Pro","Fraunces",Georgia,serif;' +
      'font-size:clamp(1.25rem,1.6vw,1.5rem);letter-spacing:-.015em;margin:6px 0 4px}' +
    '.sn-card--banner .sn-sub{font-size:.9rem;margin:0;max-width:560px}' +
    '.sn-card--banner .sn-right{display:grid;grid-template-columns:minmax(118px,auto) 1fr;' +
      'align-items:center;gap:18px;padding-left:26px;border-left:1px solid var(--border,rgba(255,255,255,.14))}' +
    '.sn-card--banner .sn-timer{display:flex;flex-direction:column;align-items:flex-start;min-width:0}' +
    '.sn-card--banner .sn-timer-label{font-size:.65rem;font-weight:900;letter-spacing:.13em;' +
      'text-transform:uppercase;color:var(--text-dim,rgba(255,255,255,.5));margin-bottom:2px}' +
    '.sn-card--banner .sn-count{font-size:clamp(1.4rem,2vw,1.8rem);line-height:1.05;white-space:nowrap}' +
    '.sn-card--banner .sn-local{display:block;font-size:.65rem;margin-top:4px}' +
    '.sn-card--banner .sn-actions{display:grid;grid-template-columns:1fr;gap:8px;min-width:166px}' +
    '.sn-card--banner .sn-cta{width:100%;min-height:44px;box-sizing:border-box;justify-content:center;' +
      'font-size:.86rem;padding:10px 15px;white-space:nowrap}' +
    '[data-theme="light"] .sn-card--banner,[data-theme="stone"] .sn-card--banner{' +
      'background:linear-gradient(135deg,#fff 0%,#fbfaf6 100%);border-color:rgba(29,25,21,.14);' +
      'box-shadow:0 26px 70px -42px rgba(80,42,28,.38),0 1px 0 rgba(255,255,255,.9)}' +
    '[data-theme="light"] .sn-card--banner .sn-right,[data-theme="stone"] .sn-card--banner .sn-right{' +
      'border-left-color:rgba(29,25,21,.12)}' +
    // Tile stays beside the copy rather than alone on its own row, so
    // .sn-right spans both columns underneath them.
    '@media(max-width:820px){.sn-card--banner{grid-template-columns:auto minmax(0,1fr);gap:18px;padding:22px 24px}' +
      '.sn-card--banner .sn-right{grid-column:1 / -1;grid-template-columns:1fr auto;padding:18px 0 0;border-left:0;' +
        'border-top:1px solid var(--border,rgba(255,255,255,.14))}' +
      '[data-theme="light"] .sn-card--banner .sn-right,[data-theme="stone"] .sn-card--banner .sn-right{' +
        'border-top-color:rgba(29,25,21,.12)}}' +
    '@media(max-width:560px){.sn-card--banner{padding:20px 20px 20px 23px;border-radius:16px}' +
      '.sn-cal{width:60px}.sn-cal-d{font-size:1.42rem}' +
      '.sn-card--banner .sn-right{grid-template-columns:1fr;gap:14px}' +
      '.sn-card--banner .sn-actions{grid-template-columns:repeat(2,minmax(0,1fr));min-width:0}' +
      '.sn-card--banner .sn-cta{padding-left:10px;padding-right:10px}}' +
    '@media(max-width:390px){.sn-card--banner .sn-actions{grid-template-columns:1fr}}' +
    '@media(prefers-reduced-motion:reduce){.sn-dot{animation:none}.sn-cta{transition:none}}' +
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
    // Calendar tile (2026-07-22). Built from nyParts so it shows the
    // event's OWN Eastern date, matching the "8:00 PM ET" headline.
    // Deliberately not the viewer's local date: east of ET the local
    // date is already the next day, and the .sn-local line under the
    // countdown is what carries that. Banner only; the rail variant is
    // too small to take a tile.
    var cp = nyParts(st.start);
    var cal =
      '<div class="sn-cal" aria-hidden="true">' +
        '<span class="sn-cal-m">' + (MON_ABBR[+cp.month - 1] || '') + '</span>' +
        '<span class="sn-cal-d">' + (+cp.day) + '</span>' +
        '<span class="sn-cal-w">' + (cp.weekday || '').toUpperCase() + '</span>' +
      '</div>';
    var title = live
      ? 'Spar Night is on. Rounds matching until 9:30 PM ET.'
      : 'Every Wednesday at 8:00 PM ET';
    var sub = live
      ? 'Real opponents, timed rounds, a judge ballot at the end.'
      : 'Ninety minutes when everyone queues at once. Real opponents, instant matches, AI ballots.';
    var count = live
      ? 'ends in <span class="sn-count" data-sn-count></span>'
      : 'next one in <span class="sn-count" data-sn-count></span>';
    var solid = live
      ? '<a class="sn-cta sn-cta--solid" data-sn-act="join" href="/spar">Join the queue &rarr;</a>'
      : (page === 'spar'
          ? '<a class="sn-cta sn-cta--solid" data-sn-act="calendar" href="' + GCAL_URL + '" target="_blank" rel="noopener">Add to calendar</a>'
          : '<a class="sn-cta sn-cta--solid" data-sn-act="spar" href="/spar">View the queue &rarr;</a>');
    var ghost = live ? '' : (page === 'spar' ? ''
      : '<a class="sn-cta sn-cta--ghost" data-sn-act="calendar" href="' + GCAL_URL + '" target="_blank" rel="noopener">Add to calendar</a>');

    if (variant === 'rail') {
      el.innerHTML = eyebrow +
        '<div class="sn-title">' + title + '</div>' +
        '<div class="sn-sub">' + sub + '</div>' +
        '<div class="sn-row"><span class="sn-sub" style="margin:0">' + count +
        (local ? '<span class="sn-local">' + local + '</span>' : '') + '</span>' + solid + '</div>';
    } else {
      el.innerHTML = cal +
        '<div class="sn-main">' + eyebrow +
          '<div class="sn-title">' + title + '</div>' +
          '<div class="sn-sub">' + sub + '</div></div>' +
        '<div class="sn-right"><div class="sn-timer">' +
          '<span class="sn-timer-label">' + (live ? 'Ends in' : 'Starts in') + '</span>' +
          '<span class="sn-count" data-sn-count></span>' +
          (local ? '<span class="sn-local">' + local + '</span>' : '') + '</div>' +
          '<div class="sn-actions">' + solid + ghost + '</div></div>';
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
