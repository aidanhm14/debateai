/* community-pulse.js
 *
 * The "is anything happening right now?" strip at the top of
 * /community, above the tabs. Three signals, all REAL data, in
 * keeping with this page's no-fake-crowds rule:
 *
 *   1. "N here right now"  — /api/online-count (5-min presence,
 *      30s server cache). Hidden until the endpoint answers.
 *   2. "N waiting to spar" — /api/live-now (matchmaking_queue).
 *      The actionable one: links straight to /spar. Hidden at 0.
 *
 * The third row used to be the latest chat line, fetched here from
 * /api/chat-feed. It is gone (2026-08-26) for two reasons: the whole
 * room is now on screen in the rail, so a 90-character echo of its
 * last line is a worse copy of something the reader can already see;
 * and it was a SECOND poll loop against a rate-limited endpoint on a
 * page that only needs one. Chat freshness still reaches this file,
 * it just arrives from the room's own poll as a `commons:rows` event
 * rather than being fetched again. Do not re-add the fetch.
 *
 * Also owns the Live tab's green dot: it used to be hardcoded on,
 * which is exactly the fake-liveness signal this page argues
 * against. Now it pulses only when there was a chat message in the
 * last 15 minutes OR someone is actually in the spar queue.
 *
 * Budget: one fetch x3 on load, then every 90s while the tab is
 * visible (same cadence notifications.js uses). Hidden tab = no
 * polling. Every failure path is silent: a row that can't load
 * stays hidden, never spins, never toasts.
 */
(function(){
  'use strict';

  var POLL_MS = 90 * 1000;
  var CHAT_FRESH_MS = 15 * 60 * 1000;

  var bar = document.getElementById('communityPulse');
  if (!bar) return;

  var elOnline = document.getElementById('pulseOnline');
  var elSpar   = document.getElementById('pulseSpar');
  var tabDot   = document.querySelector('.tab[data-tab="live"] .tab-dot');

  var chatFresh = false, sparWaiting = 0;

  function show(el){ if (el) el.style.display = 'inline-flex'; }
  function hide(el){ if (el) el.style.display = 'none'; }
  function setBarVisible(){
    // The bar itself only appears once at least one row has real
    // content — an empty pill strip is dead chrome.
    var any = [elOnline, elSpar].some(function(el){
      return el && el.style.display !== 'none' && el.style.display !== '';
    });
    bar.style.display = any ? 'flex' : 'none';
  }

  function paintDot(){
    // Honest dot: only pulse when there is something live to find.
    if (!tabDot) return;
    tabDot.style.display = (chatFresh || sparWaiting > 0) ? 'inline-block' : 'none';
  }

  function loadOnline(){
    fetch('/api/online-count', { cache: 'no-cache' })
      .then(function(r){ return r.ok ? r.json() : null; })
      .then(function(j){
        if (!j || typeof j.online !== 'number') return;
        var n = Math.max(0, j.online | 0);
        if (n < 1){ hide(elOnline); setBarVisible(); return; }
        elOnline.innerHTML = '<span class="pulse-dot"></span>' +
          (n === 1 ? 'you’re the one here right now' : '<b>' + n + '</b> here right now');
        show(elOnline); setBarVisible();
      })
      .catch(function(){ /* endpoint down — row stays hidden */ });
  }

  /* Subtract yourself. /api/live-now is shared-cached and counts every
     waiting doc, yours included, so a lone available user was told "1
     waiting to spar" and sent to meet themselves. isAvailable() is the
     exact answer for the background matcher; the uid scan covers a queue
     joined on another surface, and is exact whenever the count fits
     inside the sample the endpoint returns. */
  function minusSelf(j) {
    var n = Math.max(0, (j && j.count | 0) || 0);
    if (!n) return 0;
    var mine = false;
    try { mine = !!(window.DASparLive && window.DASparLive.isAvailable && window.DASparLive.isAvailable()); } catch (e) {}
    if (!mine) {
      var me = '';
      try {
        if (window.DASparLive && window.DASparLive.uid) me = String(window.DASparLive.uid() || '');
        if (!me) {
          var fb = window.firebase;
          if (fb && fb.apps && fb.apps.length && typeof fb.auth === 'function') {
            var cu = fb.auth().currentUser;
            me = (cu && cu.uid) ? String(cu.uid) : '';
          }
        }
      } catch (e) {}
      var rows = (j && j.debaters) || [];
      for (var i = 0; me && i < rows.length; i++) {
        if (rows[i] && String(rows[i].uid) === me) { mine = true; break; }
      }
    }
    return Math.max(0, n - (mine ? 1 : 0));
  }

  function loadSpar(){
    fetch('/api/live-now', { cache: 'no-cache' })
      .then(function(r){ return r.ok ? r.json() : null; })
      .then(function(j){
        if (!j || typeof j.count !== 'number') return;
        sparWaiting = minusSelf(j);
        paintDot();
        if (sparWaiting < 1){ hide(elSpar); setBarVisible(); return; }
        elSpar.innerHTML = '<b>' + sparWaiting + '</b> waiting to spar → jump in';
        show(elSpar); setBarVisible();
      })
      .catch(function(){ /* endpoint down — row stays hidden */ });
  }

  /* Chat freshness, from the room's own poll. community-chat.js emits
     `commons:rows` on every fetch it already makes; nothing here asks
     the network for it. If the room is not mounted the event never
     fires and the dot simply stays dark, which is the honest state. */
  document.addEventListener('commons:rows', function(e){
    var rows = (e && e.detail && e.detail.rows) || [];
    var msgs = rows.filter(function(r){ return r.kind !== 'join' && String(r.text || '').trim(); });
    if (!msgs.length){ chatFresh = false; paintDot(); return; }
    // The feed's timestamp field is `at`.
    var when = Number(msgs[msgs.length - 1].at || 0);
    chatFresh = when > 0 && (Date.now() - when) < CHAT_FRESH_MS;
    paintDot();
  });

  if (elSpar) elSpar.addEventListener('click', function(){
    try { gtag('event', 'pulse_spar_click'); } catch(e){}
    location.href = '/spar';
  });
  function tick(){ loadOnline(); loadSpar(); }
  tick();
  setInterval(function(){ if (!document.hidden) tick(); }, POLL_MS);
})();
