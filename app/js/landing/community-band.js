
/* Community band live strip: one fetch per endpoint, fired once when
   the band first scrolls into view (keeps function invocations off
   visitors who never reach it). Real data only; a pill with nothing
   real stays hidden, and the strip only appears once a pill lands. */
(function(){
  var band = document.getElementById('community-band');
  if (!band) return;
  var strip = document.getElementById('cbLive');
  function pill(id, html){
    var el = document.getElementById(id);
    if (!el) return;
    el.innerHTML = html;
    el.style.display = 'inline-flex';
    strip.style.display = 'flex';
  }
  function esc(s){
    return String(s == null ? '' : s).replace(/[&<>"']/g, function(ch){
      return { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[ch];
    });
  }
  // Shared daily city schedule; deferred script is ready at DOMContentLoaded.
  var LIVE_MS = 90 * 60 * 1000;
  function nextWed(now){ return window.DBClashSchedule.nextSession(now); }
  function fmtLeft(ms){
    var h = Math.floor(ms / 3600000), m = Math.floor((ms % 3600000) / 60000);
    if (h >= 48) return 'in ' + Math.round(h / 24) + ' days';
    return 'in ' + (h > 0 ? h + 'h ' : '') + m + 'm';
  }
  function paintWeek(){
    var whenEl = document.getElementById('cbWedWhen');
    var localEl = document.getElementById('cbWedLocal');
    if (!whenEl) return;
    var now = Date.now(), next = nextWed(now), start = next.start;
    if (now >= start && now < start + LIVE_MS){
      whenEl.textContent = 'Live now · in the queue';
    } else {
      whenEl.textContent = '9:00 PM ' + next.session.city + ' · ' + fmtLeft(start - now);
    }
    var whatEl = document.getElementById('cbWedWhat');
    if (whatEl) whatEl.textContent = 'Next live session · ' + next.session.name;
    var calEl = document.getElementById('cbWedCal');
    if (calEl) calEl.href = window.DBClashSchedule.calendarPageUrl(next);
    if (localEl){
      var local = new Date(start).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
      var wd = new Date(start).toLocaleDateString(undefined, { weekday: 'short' });
      localEl.textContent = wd + ' ' + local + ' your time';
    }
    // today marker, viewer-local
    var today = new Date().getDay();
    var cells = document.querySelectorAll('#cbDays .cb-day');
    for (var i = 0; i < cells.length; i++){
      cells[i].classList.toggle('today', +cells[i].getAttribute('data-day') === today);
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', paintWeek);
  else paintWeek();
  setInterval(function(){ if (!document.hidden) paintWeek(); }, 60000);

  // Real scheduled rounds pin to their day cell. Fed by the same
  // schedule fetch the cbNext pill uses (see loadOnce below).
  function pinSchedule(rounds){
    if (!rounds || !rounds.length) return;
    var byDay = {};
    rounds.slice(0, 6).forEach(function(r){
      if (!r || !r.startAt || r.startAt < Date.now()) return;
      var d = new Date(r.startAt);
      var key = d.getDay();
      if (byDay[key]) return; // one chip per day keeps the strip readable
      byDay[key] = d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }) +
        (r.format ? ' · ' + String(r.format).slice(0, 14) : '');
    });
    Object.keys(byDay).forEach(function(k){
      var cell = document.querySelector('#cbDays .cb-day[data-day="' + k + '"]');
      if (!cell || cell.classList.contains('cb-day--wed')) return;
      var chip = document.createElement('span');
      chip.className = 'cb-sched';
      chip.textContent = byDay[k];
      cell.appendChild(chip);
    });
  }

  var fired = false;
  function loadOnce(){
    if (fired) return; fired = true;
    fetch('/api/online-count', { cache: 'no-cache' })
      .then(function(r){ return r.ok ? r.json() : null; })
      .then(function(j){
        if (j && typeof j.online === 'number' && j.online >= 2){
          pill('cbOnline', '<span class="dot"></span><b>' + (j.online|0) + '</b>&nbsp;on the site right now');
        }
      }).catch(function(){});
    fetch('/api/schedule-round', { cache: 'no-cache' })
      .then(function(r){ return r.ok ? r.json() : null; })
      .then(function(j){
        var rounds = j && Array.isArray(j.rounds) ? j.rounds : [];
        pinSchedule(rounds);
        var next = rounds.length ? rounds[0] : null;
        if (next && next.startAt > Date.now()){
          var d = new Date(next.startAt);
          var day = d.toDateString() === new Date().toDateString() ? 'today'
            : d.toLocaleDateString(undefined, { weekday: 'short' });
          var t = d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
          pill('cbNext', 'next scheduled round:&nbsp;<b>' + esc(day + ' ' + t) + '</b>');
        }
      }).catch(function(){});
    fetch('/api/chat-feed')
      .then(function(r){ return r.ok ? r.json() : null; })
      .then(function(j){
        var rows = j && Array.isArray(j.rows) ? j.rows.filter(function(r){ return r.kind === 'message'; }) : [];
        var last = rows.length ? rows[rows.length - 1] : null;
        if (last && last.text){
          pill('cbChat', '<b>' + esc(last.handle || 'anon') + ':</b>&nbsp;' + esc(String(last.text).slice(0, 60)));
        }
      }).catch(function(){});
  }
  if ('IntersectionObserver' in window){
    var io = new IntersectionObserver(function(entries){
      if (entries.some(function(e){ return e.isIntersecting; })){ loadOnce(); io.disconnect(); }
    }, { rootMargin: '300px' });
    io.observe(band);
  } else { loadOnce(); }
  band.addEventListener('click', function(e){
    var a = e.target && e.target.closest ? e.target.closest('[data-cb]') : null;
    if (a){ try { gtag('event', 'community_band_click', { door: a.getAttribute('data-cb') }); } catch(err){} }
  });
})();
