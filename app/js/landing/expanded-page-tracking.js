
(function(){
  var TEST = 'landing_onepager_v1';
  function arm(){
    var rec = (window.__abAssignments || {})[TEST] || {};
    return rec.forced ? '' : (rec.variant || '');   // forced = QA, never counted
  }
  function fire(target){
    var v = arm();
    if (!v) return;
    var key = '_da_onepager_cv:' + target;
    try {
      if (sessionStorage.getItem(key) === '1') return;
      sessionStorage.setItem(key, '1');
    } catch(e){}
    var params = { test: TEST, variant: v, target: target, path: location.pathname || '/' };
    try {
      if (typeof window.gtag === 'function') window.gtag('event', 'ab_conversion', params);
      else if (typeof window.track === 'function') window.track('app_event', Object.assign({ name:'ab_conversion' }, params));
    } catch(e){}
  }
  var MAP = [
    ['[data-cta="first-screen-spar"]',      'start_round'],
    ['[data-cta="first-screen-spectate"]',  'spectate'],
    ['#landing-more-toggle',                'gate_open'],
    ['.ui-btn-signin, #googleSignupBtn',    'signin']
  ];
  document.addEventListener('click', function(e){
    var t = e.target;
    if (!t || !t.closest) return;
    for (var i = 0; i < MAP.length; i++){
      if (t.closest(MAP[i][0])){
        // The gate only converts on OPEN. Counting the close click too
        // would score "read it and collapsed it" as engagement.
        if (MAP[i][1] === 'gate_open' &&
            document.body.classList.contains('landing-more-open')) return;
        fire(MAP[i][1]);
        return;
      }
    }
  }, true);
  // Waitlist is a form, so the click target is the button but the real
  // signal is a submit that passed validation.
  document.addEventListener('submit', function(e){
    if (e.target && e.target.id === 'wlForm') fire('waitlist');
  }, true);
})();
