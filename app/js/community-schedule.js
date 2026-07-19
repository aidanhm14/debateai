/* community-schedule.js
 *
 * The scheduled-rounds panel on /community — the real Firestore-backed
 * replacement for the fake seed schedule removed 2026-05-21. Anyone
 * can propose a round at a time; anyone can RSVP; no sign-in needed
 * (same anonymous posture as the live chat).
 *
 * Talks to /api/schedule-round (server-mediated, rate-limited).
 * Identity: the chat's anonymous handle (localStorage da-chat-handle,
 * falls back to "anon") + a random device id (da-device-id) that the
 * server uses to dedupe RSVPs. The id never renders anywhere.
 *
 * Failure modes are silent: endpoint down → panel shows the honest
 * empty state; a failed RSVP re-enables the button, no toast spam.
 */
(function(){
  'use strict';

  var ENDPOINT = '/api/schedule-round';
  var DEVICE_KEY = 'da-device-id';
  var HANDLE_KEY = 'da-chat-handle';
  var REFRESH_MS = 120 * 1000;
  var SOON_MS = 20 * 60 * 1000;

  var FORMAT_LABELS = {
    quick: 'Quick Clash', apda: 'APDA', bp: 'BP', worlds: 'Worlds (WUDC)',
    asian: 'Asian Parli', ld: 'LD', pf: 'Public Forum', policy: 'Policy',
  };

  var host = document.getElementById('communitySchedule');
  if (!host) return;

  function deviceId(){
    var id = '';
    try { id = localStorage.getItem(DEVICE_KEY) || ''; } catch(e){}
    if (!id){
      id = 'd' + Math.random().toString(36).slice(2, 12) + Math.random().toString(36).slice(2, 12);
      try { localStorage.setItem(DEVICE_KEY, id); } catch(e){}
    }
    return id;
  }
  function myHandle(){
    var h = '';
    try { h = localStorage.getItem(HANDLE_KEY) || ''; } catch(e){}
    return h || 'anon';
  }
  function esc(s){
    return String(s == null ? '' : s).replace(/[&<>"']/g, function(ch){
      return { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[ch];
    });
  }
  function fmtWhen(ms){
    var d = new Date(ms);
    var now = new Date();
    var opts = { weekday: 'short', month: 'short', day: 'numeric' };
    var day = d.toDateString() === now.toDateString() ? 'Today'
      : d.toLocaleDateString(undefined, opts);
    var time = d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
    return day + ' · ' + time;
  }
  function gcalLink(r){
    var start = new Date(r.startAt), end = new Date(r.startAt + 45 * 60000);
    function z(d){ return d.toISOString().replace(/[-:]|\.\d{3}/g, ''); }
    var title = 'Debatable round · ' + (FORMAT_LABELS[r.format] || r.format);
    var details = (r.motion ? 'Motion: ' + r.motion + '\n' : '') +
      'Queue at https://debateai.com/spar?format=' + r.format + ' when it starts.';
    return 'https://calendar.google.com/calendar/render?action=TEMPLATE' +
      '&text=' + encodeURIComponent(title) +
      '&dates=' + z(start) + '/' + z(end) +
      '&details=' + encodeURIComponent(details);
  }

  var rounds = [];

  function render(){
    var now = Date.now();
    var cards = rounds.map(function(r){
      var soon = r.startAt - now < SOON_MS && r.startAt + 2*60*60*1000 > now;
      var others = r.rsvpCount > 1
        ? r.rsvpCount + ' in — ' + r.names.slice(0, 4).map(esc).join(', ') + (r.rsvpCount > 4 ? '…' : '')
        : 'just the host so far';
      return '' +
        '<div class="sched-card' + (soon ? ' sched-soon' : '') + '" data-id="' + esc(r.id) + '">' +
          '<div class="sched-when">' + (soon ? '<span class="sched-live-dot"></span>starting soon' : esc(fmtWhen(r.startAt))) + '</div>' +
          '<div class="sched-main">' +
            '<div class="sched-motion">' + (r.motion ? esc(r.motion) : '<span class="sched-tbd">Motion TBD — host’s pick</span>') + '</div>' +
            '<div class="sched-meta">' + esc(FORMAT_LABELS[r.format] || r.format) + ' · hosted by ' + esc(r.hostHandle) + ' · ' + esc(others) + '</div>' +
          '</div>' +
          '<div class="sched-actions">' +
            (soon
              ? '<a class="btn primary sched-join" href="/spar?format=' + esc(r.format) + '">Join now →</a>'
              : '<button class="btn sched-rsvp' + (r.mine ? ' on' : '') + '" data-id="' + esc(r.id) + '">' + (r.mine ? 'You’re in ✓' : 'I’m in') + '</button>' +
                (r.mine ? '<a class="sched-cal" target="_blank" rel="noopener" href="' + gcalLink(r) + '">+ calendar</a>' : '')
            ) +
          '</div>' +
        '</div>';
    }).join('');

    host.innerHTML =
      '<div class="sched-head">' +
        '<div>' +
          '<div class="sched-title">Scheduled rounds</div>' +
          '<div class="sched-sub">Propose a time. Show up. Argue. When a round starts, everyone queues at /spar in that format and gets paired.</div>' +
        '</div>' +
        '<button class="btn" id="schedProposeBtn">+ Propose a round</button>' +
      '</div>' +
      (cards || '<div class="sched-empty">Nothing scheduled yet. Propose the first round — it takes ten seconds and anyone can join you.</div>') +
      '<form class="sched-form" id="schedForm" style="display:none">' +
        '<select id="schedFormat" class="sched-input" aria-label="Format">' +
          Object.keys(FORMAT_LABELS).map(function(k){
            return '<option value="' + k + '">' + esc(FORMAT_LABELS[k]) + '</option>';
          }).join('') +
        '</select>' +
        '<input id="schedMotion" class="sched-input sched-input-wide" type="text" maxlength="200" placeholder="Motion (optional — decide at the table)">' +
        '<input id="schedWhen" class="sched-input" type="datetime-local" aria-label="Start time" required>' +
        '<button type="submit" class="btn primary">Post it</button>' +
        '<span class="sched-as">as <b>' + esc(myHandle()) + '</b></span>' +
      '</form>';

    var btn = document.getElementById('schedProposeBtn');
    var form = document.getElementById('schedForm');
    if (btn && form){
      btn.addEventListener('click', function(){
        var open = form.style.display !== 'none';
        form.style.display = open ? 'none' : 'flex';
        if (!open){
          var d = new Date(Date.now() + 24 * 60 * 60 * 1000);
          d.setMinutes(0, 0, 0); d.setHours(19);
          var el = document.getElementById('schedWhen');
          // datetime-local wants local-tz "YYYY-MM-DDTHH:MM".
          var pad = function(n){ return (n < 10 ? '0' : '') + n; };
          el.value = d.getFullYear() + '-' + pad(d.getMonth()+1) + '-' + pad(d.getDate()) + 'T' + pad(d.getHours()) + ':' + pad(d.getMinutes());
        }
      });
      form.addEventListener('submit', function(e){
        e.preventDefault();
        var whenEl = document.getElementById('schedWhen');
        var startAt = whenEl && whenEl.value ? new Date(whenEl.value).getTime() : 0;
        if (!startAt || startAt < Date.now() + 10 * 60 * 1000){
          whenEl.setCustomValidity('Pick a time at least 10 minutes out.');
          whenEl.reportValidity();
          setTimeout(function(){ whenEl.setCustomValidity(''); }, 2500);
          return;
        }
        var submitBtn = form.querySelector('button[type=submit]');
        submitBtn.disabled = true;
        fetch(ENDPOINT, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'create',
            handle: myHandle(),
            deviceId: deviceId(),
            format: document.getElementById('schedFormat').value,
            motion: document.getElementById('schedMotion').value,
            startAt: startAt,
          }),
        }).then(function(r){ return r.json().catch(function(){ return null; }); })
          .then(function(j){
            if (j && j.ok){
              try { gtag('event','schedule_round_create'); } catch(e){}
              load();
            } else { submitBtn.disabled = false; }
          })
          .catch(function(){ submitBtn.disabled = false; });
      });
    }

    host.querySelectorAll('.sched-rsvp').forEach(function(b){
      b.addEventListener('click', function(){
        b.disabled = true;
        fetch(ENDPOINT, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'rsvp', id: b.getAttribute('data-id'), handle: myHandle(), deviceId: deviceId() }),
        }).then(function(r){ return r.json().catch(function(){ return null; }); })
          .then(function(j){
            if (j && j.ok){
              try { gtag('event','schedule_round_rsvp', { going: j.mine }); } catch(e){}
              load();
            } else { b.disabled = false; }
          })
          .catch(function(){ b.disabled = false; });
      });
    });
  }

  function load(){
    fetch(ENDPOINT + '?d=' + encodeURIComponent(deviceId()), { cache: 'no-cache' })
      .then(function(r){ return r.ok ? r.json() : null; })
      .then(function(j){
        rounds = (j && Array.isArray(j.rounds)) ? j.rounds : [];
        render();
      })
      .catch(function(){ rounds = []; render(); });
  }

  load();
  setInterval(function(){ if (!document.hidden) load(); }, REFRESH_MS);
})();
