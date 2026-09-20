
(function(){
  if (document.documentElement.getAttribute('data-verdict-ticker') !== 'on') return;
  var sec = document.getElementById('verdict-ticker');
  var track = document.getElementById('vtTrack');
  if (!sec || !track) return;

  function esc(s){
    return String(s == null ? '' : s).replace(/[&<>"']/g, function(c){
      return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];
    });
  }
  // First name only, same posture as /api/recent-activity: public feed,
  // no full display names on a marketing surface.
  function nm(seat){
    if (!seat || seat.uid === 'ai') return 'The AI';
    var t = String(seat.name || '').trim().split(/\s+/)[0].replace(/[^\wÀ-ɏ-]/g, '').slice(0, 16);
    return t || 'A debater';
  }
  function ago(ms){
    var d = Date.now() - (ms || 0);
    if (!ms || d < 0) return '';
    var m = Math.floor(d / 60000);
    if (m < 1) return 'just now';
    if (m < 60) return m + 'm ago';
    var h = Math.floor(m / 60);
    if (h < 24) return h + 'h ago';
    return Math.floor(h / 24) + 'd ago';
  }

  function render(rows){
    var items = [];
    for (var i = 0; i < rows.length && items.length < 14; i++){
      var r = rows[i];
      if (!r || !r.motion || (r.winner !== 'prop' && r.winner !== 'opp')) continue;
      var winSeat  = r.winner === 'prop' ? r.prop : r.opp;
      var loseSeat = r.winner === 'prop' ? r.opp  : r.prop;
      var winAi  = (winSeat  && winSeat.uid  === 'ai') || (r.winner === 'opp'  && r.aiOpp);
      var loseAi = (loseSeat && loseSeat.uid === 'ai') || (r.winner === 'prop' && r.aiOpp);
      if (winAi && loseAi) continue;
      var w = winAi ? 'The AI' : nm(winSeat);
      var loser = loseAi ? 'the AI' : nm(loseSeat);
      var motion = String(r.motion).length > 72 ? String(r.motion).slice(0, 71).replace(/\s+\S*$/, '') + '…' : String(r.motion);
      items.push(
        '<a class="vt-item" href="/r/' + encodeURIComponent(r.id) + '" data-cta="vticker-round" ' +
          'data-ab-test="verdict_ticker_v1" data-ab-target="round" title="' + esc(r.motion) + '">' +
          '<span class="vt-fmt">' + esc(r.formatName || r.format || 'Round') + '</span>' +
          '<span><b>' + esc(w) + '</b> beat <b>' + esc(loser) + '</b> on ' +
          '<span class="vt-motion">&ldquo;' + esc(motion) + '&rdquo;</span></span>' +
          (ago(r.completedAt) ? '<span class="vt-when">' + ago(r.completedAt) + '</span>' : '') +
        '</a>'
      );
    }
    if (items.length < 3) return false;
    var half = items.join('');
    // Second copy makes the -50% translate loop seamless; hidden from AT.
    track.innerHTML = half + '<div style="display:contents" aria-hidden="true">' + half + '</div>';
    track.style.setProperty('--vt-dur', Math.min(84, Math.max(34, items.length * 5)) + 's');
    sec.hidden = false;
    // Run the marquee only while visible (RAM/compositor care).
    try {
      if ('IntersectionObserver' in window){
        var io = new IntersectionObserver(function(es){
          for (var i = 0; i < es.length; i++) sec.classList.toggle('vt-live', es[i].isIntersecting);
        }, { threshold: 0 });
        io.observe(sec);
      } else sec.classList.add('vt-live');
    } catch(e){ sec.classList.add('vt-live'); }
    try { window.dosTrackOnce && window.dosTrackOnce('vticker_shown', { count: items.length }); } catch(e){}
    return true;
  }
  window.__vtRender = render; // QA hook: __vtRender([{id,motion,winner,prop,opp,aiOpp,formatName,completedAt}])

  function load(){
    try {
      fetch('/api/async/feed').then(function(res){ return res.ok ? res.json() : null; }).then(function(j){
        if (j && j.done && j.done.length) render(j.done);
      }).catch(function(){});
    } catch(e){}
  }
  // After idle: the strip sits above the footer; nobody needs it in the
  // first paint and the feed is 60s-cached upstream anyway.
  if ('requestIdleCallback' in window) requestIdleCallback(load, { timeout: 4000 });
  else setTimeout(load, 2500);
})();
