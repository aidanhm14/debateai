/* Read-only meter. The session service remains the authority to start a call. */
(function () {
  'use strict';
  var state = null, uid = '', sequence = 0, lastRead = 0, pending = null;
  var seen = new Set();
  function user() {
    try { return window.firebase.auth().currentUser; } catch (_) { return null; }
  }
  function event(name, placement) {
    try {
      if (window.track) window.track('app_event', {
        name: name, surface: 'newvoice', placement: placement,
        period: state && state.period, remaining: state && state.remaining,
        allowanceReason: state && state.reason
      });
    } catch (_) {}
  }
  function add(parent, tag, text, className) {
    var el = document.createElement(tag);
    el.textContent = text;
    if (className) el.className = className;
    parent.appendChild(el);
    return el;
  }
  function render() {
    var current = user();
    var key = document.getElementById('openaiVoiceKey');
    var byok = !!(key && key.value.trim() && state && (state.hasPlan || state.reason === 'owner'));
    document.querySelectorAll('[data-voice-allowance]').forEach(function (box) {
      box.replaceChildren();
      box.hidden = !current || current.isAnonymous || current.uid !== uid || !state || state.reason === 'sign_in_required' || (state.reason === 'owner' && !byok);
      if (box.hidden) return;
      var placement = box.dataset.voiceAllowance;
      var title, detail, href = '', label = '';
      if (byok) {
        title = 'Using your OpenAI key';
        detail = 'OpenAI bills this round. Your Debatable minutes and tokens stay available.';
      } else if (state.reason === 'voice_disabled') {
        title = 'AI voice is temporarily unavailable';
        detail = 'You can still debate a real person.';
      } else if (!state.resolved || !Number.isFinite(state.remaining) || !Number.isFinite(state.limit)) {
        title = 'Allowance unavailable';
        detail = 'Your minutes will be checked when you start.';
      } else if (state.tokenFunded) {
        title = 'Your tokens cover another round';
        detail = 'Starting a round uses ' + state.tokenCost + ' tokens. Your included minutes are used up.';
      } else {
        title = state.remaining > 0 ? state.remaining + ' voice minutes left' : state.hasPlan ? 'This month’s voice minutes are used' : 'Your free voice minutes are used';
        detail = state.hasPlan ? state.remaining + ' of ' + state.limit + ' minutes left this month.' : state.remaining + ' of ' + state.limit + ' free minutes left.';
        if (state.hasPlan && state.resetsAt) {
          var reset = new Date(state.resetsAt);
          if (Number.isFinite(reset.getTime())) detail += ' Refills ' + reset.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }) + ' (UTC).';
        }
        if (!state.hasPlan && (placement === 'recap' || state.remaining <= 8)) {
          href = '/pricing#plans'; label = 'See voice plans';
        } else if (state.hasPlan && state.remaining < 1 && state.tokensLive) {
          href = '/voice-tokens'; label = 'Get voice tokens';
        }
      }
      add(box, 'strong', title, 'va-title');
      add(box, 'p', detail, 'va-detail');
      if (href && !window.__DB_NATIVE) {
        var link = add(box, 'a', label, 'va-link');
        link.href = href; link.setAttribute('data-native-hide', '');
        link.addEventListener('click', function () { event('voice_upgrade_click', placement); });
      }
      if (!byok && state.resolved && state.ok === false) {
        var human = add(box, 'a', 'Debate a real person', 'va-link');
        human.href = '/spar';
      }
      // Count an impression only when this part of the wizard/recap is visible.
      if (box.getClientRects().length) {
        var signature = [uid, placement, state.reason, state.remaining, byok].join(':');
        if (!seen.has(signature)) { seen.add(signature); event('voice_allowance_view', placement); }
      }
    });
  }
  async function refresh(force) {
    var current = user(), nextUid = current && !current.isAnonymous ? current.uid : '';
    if (nextUid !== uid) {
      uid = nextUid; state = null; lastRead = 0; pending = null; sequence++; seen.clear();
    }
    render();
    if (!uid) return;
    if (!force && pending) return pending;
    if (!force && state && Date.now() - lastRead < 10000) return;
    var requestId = ++sequence, requestUid = uid;
    pending = (async function () {
      var timer, controller = new AbortController();
      try {
        var token = await current.getIdToken();
        if (requestId !== sequence || requestUid !== uid) return;
        timer = setTimeout(function () { controller.abort(); }, 6000);
        var response = await fetch('/api/voice-allowance', {
          headers: { Authorization: 'Bearer ' + token }, cache: 'no-store', signal: controller.signal
        });
        if (!response.ok) throw new Error('Allowance read failed');
        var data = await response.json();
        if (requestId !== sequence || requestUid !== uid) return;
        state = data;
      } catch (_) {
        if (requestId !== sequence || requestUid !== uid) return;
        state = { resolved: false };
      } finally {
        clearTimeout(timer);
        if (requestId === sequence) { pending = null; lastRead = Date.now(); render(); }
      }
    })();
    return pending;
  }
  window.DBVoiceAllowance = { refresh: refresh, render: render };
  function init() {
    var key = document.getElementById('openaiVoiceKey');
    if (key) key.addEventListener('input', render);
    var clear = document.getElementById('clearVoiceKey');
    if (clear) clear.addEventListener('click', function () { queueMicrotask(render); });
    try { window.firebase.auth().onAuthStateChanged(function () { refresh(true); }); } catch (_) { refresh(); }
    window.addEventListener('pageshow', function () { refresh(); });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
