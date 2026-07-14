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
 *   3. Latest chat line    — /api/chat-feed (same endpoint the Live
 *      tab polls). Clicking it switches to the Live tab. Hidden
 *      when the room has never spoken.
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
  var elChat   = document.getElementById('pulseChat');
  var tabDot   = document.querySelector('.tab[data-tab="live"] .tab-dot');

  var chatFresh = false, sparWaiting = 0;

  function show(el){ if (el) el.style.display = 'inline-flex'; }
  function hide(el){ if (el) el.style.display = 'none'; }
  function setBarVisible(){
    // The bar itself only appears once at least one row has real
    // content — an empty pill strip is dead chrome.
    var any = [elOnline, elSpar, elChat].some(function(el){
      return el && el.style.display !== 'none' && el.style.display !== '';
    });
    bar.style.display = any ? 'flex' : 'none';
  }

  function esc(s){
    return String(s == null ? '' : s).replace(/[&<>"']/g, function(ch){
      return { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[ch];
    });
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

  function loadSpar(){
    fetch('/api/live-now', { cache: 'no-cache' })
      .then(function(r){ return r.ok ? r.json() : null; })
      .then(function(j){
        if (!j || typeof j.count !== 'number') return;
        sparWaiting = Math.max(0, j.count | 0);
        paintDot();
        if (sparWaiting < 1){ hide(elSpar); setBarVisible(); return; }
        elSpar.innerHTML = '<b>' + sparWaiting + '</b> waiting to spar → jump in';
        show(elSpar); setBarVisible();
      })
      .catch(function(){ /* endpoint down — row stays hidden */ });
  }

  function loadChat(){
    fetch('/api/chat-feed', { method: 'GET' })
      .then(function(r){ return r.ok ? r.json() : null; })
      .then(function(j){
        if (!j || !Array.isArray(j.rows) || !j.rows.length){ hide(elChat); setBarVisible(); return; }
        var last = j.rows[j.rows.length - 1];
        var when = Number(last.ts || last.when || last.createdAt || 0);
        chatFresh = when > 0 && (Date.now() - when) < CHAT_FRESH_MS;
        paintDot();
        var text = String(last.text || '').slice(0, 90);
        elChat.innerHTML = '<span class="pulse-chat-handle">' + esc(last.handle || 'anon') + ':</span> ' +
          esc(text) + ' <span class="pulse-go">join the chat →</span>';
        show(elChat); setBarVisible();
      })
      .catch(function(){ /* endpoint down — row stays hidden */ });
  }

  if (elSpar) elSpar.addEventListener('click', function(){
    try { gtag('event', 'pulse_spar_click'); } catch(e){}
    location.href = '/spar';
  });
  if (elChat) elChat.addEventListener('click', function(){
    try { gtag('event', 'pulse_chat_click'); } catch(e){}
    var liveTab = document.querySelector('.tab[data-tab="live"]');
    if (liveTab) liveTab.click();
    var tabs = document.querySelector('.tabs');
    if (tabs && tabs.scrollIntoView) tabs.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });

  function tick(){ loadOnline(); loadSpar(); loadChat(); }
  tick();
  setInterval(function(){ if (!document.hidden) tick(); }, POLL_MS);
})();
