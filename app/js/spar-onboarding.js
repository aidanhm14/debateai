(function () {
  'use strict';
  var trusted = false, last = '', busy = false;
  function activity() {
    if (document.hidden || navigator.webdriver || !trusted) return 'left';
    if (document.querySelector('.match-profile-flow')) return 'questions';
    if (document.getElementById('sparGateCard')) return 'signing_in';
    return 'left';
  }
  function beat() {
    var stage = activity();
    if (stage === 'left' && last === 'left') return;
    last = stage;
    fetch('/api/spar-onboarding', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ stage: stage }), keepalive: true }).catch(function () {});
  }
  function tick() {
    beat();
    var note = document.getElementById('deskWaitingNote');
    if (!note || document.hidden || busy) return;
    busy = true;
    fetch('/api/spar-onboarding', { cache: 'no-store' }).then(function(r) { if (!r.ok) throw Error(); return r.json(); }).then(function(d) {
      note.hidden = !d.questions && !d.signingIn;
      note.textContent = d.questions
        ? 'Someone is answering the matching questions now. They still need to sign in before joining the queue.'
        : d.signingIn ? 'Someone is at the sign-in step. We will look for a match once they join the queue.' : '';
    }).catch(function() { note.hidden = true; }).then(function() { busy = false; });
  }
  function interact(e) { if (e.isTrusted && !trusted) { trusted = true; tick(); } }
  document.addEventListener('pointerdown', interact, { passive: true });
  document.addEventListener('keydown', interact);
  document.addEventListener('visibilitychange', tick);
  window.addEventListener('pagehide', function() {
    last = 'left';
    fetch('/api/spar-onboarding', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"stage":"left"}', keepalive: true }).catch(function() {});
  });
  setInterval(tick, 15000);
})();
