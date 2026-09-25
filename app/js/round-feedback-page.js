(function(){
  'use strict';
  var rid = new URLSearchParams(location.search).get('round') || '';
  if (!/^[A-Za-z0-9_.:-]{1,80}$/.test(rid)) rid = '';
  if (rid) { document.getElementById('roundId').textContent = rid; document.getElementById('roundRef').hidden = false; }
  var status = document.getElementById('formStatus');
  function unavailable(){ status.textContent = 'The dedicated round form is not available yet. You can use general feedback below and include your round id.'; }
  fetch('/api/round-feedback-form', { signal: AbortSignal.timeout(8000) }).then(function(r){ if (!r.ok) throw Error(); return r.json(); }).then(function(data){
    // Configuration must point at a Google form even if an upstream cache is bad.
    var u; try { u = new URL(data.url); } catch(e) { unavailable(); return; }
    if (u.protocol !== 'https:' || u.username || u.password || !((u.hostname === 'docs.google.com' && /^\/forms\/d\/(?:e\/)?[\w-]+\/viewform$/.test(u.pathname)) || (u.hostname === 'forms.gle' && /^\/[\w-]+$/.test(u.pathname)))) { unavailable(); return; }
    var a = document.getElementById('googleForm'); a.href = u.href; a.hidden = false;
    status.textContent = rid ? 'Include the round id above so we can find the right decision.' : 'A round id helps us investigate. Include it if you have it.';
  }).catch(unavailable);
})();
