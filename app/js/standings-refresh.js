/* Visible boards recover on return and after a result in another tab. */
(function(){
  'use strict';
  if (window.DBStandings) return;
  var key = 'da-standings-changed', listeners = [], pending = null;
  function refresh(){
    if (document.hidden || pending) return;
    pending = setTimeout(function(){
      pending = null;
      if (!document.hidden) listeners.forEach(function(fn){ try { fn(); } catch (_) {} });
    }, 100);
  }
  window.DBStandings = {
    watch: function(fn){ listeners.push(fn); },
    changed: function(){
      try { localStorage.setItem(key, String(Date.now()) + ':' + Math.random()); } catch (_) {}
      refresh();
    }
  };
  window.addEventListener('storage', function(e){ if (e.key === key) refresh(); });
  window.addEventListener('focus', refresh);
  window.addEventListener('pageshow', refresh);
  document.addEventListener('visibilitychange', refresh);
  setInterval(refresh, 45000);
})();
