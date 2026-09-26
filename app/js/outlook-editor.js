(function(){
  'use strict';
  window.mountOutlookEditor = function(host, user, onSave){
    if (!host || !user || user.isAnonymous || host.dataset.mounted) return;
    host.dataset.mounted = '1';
    var O = window.DBOutlook, current = {}, loaded = false;
    host.innerHTML = '<p class="outlook-help" role="status">Loading your outlook…</p>';
    function request(body){
      return user.getIdToken().then(function(token){
        return fetch('/api/public-outlook', {method:body?'POST':'GET',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});
      }).then(function(r){return r.json().then(function(j){if(!r.ok)throw new Error(j.error || 'Could not save. Try again.');return j;});});
    }
    function render(keepOpen){
      host.innerHTML = '<details class="outlook-editor"'+(keepOpen||!current.label&&!current.belief?' open':'')+'><summary>'+(current.label||current.belief?'Edit your political outlook':'What do you believe?')+'</summary>'
        + '<p class="outlook-help">Give people a little context before the conversation. Both fields are optional.</p>'
        + '<form><label>Political affiliation or outlook<select name="label"><option value="">No label</option>'+O.labels.map(function(l){return '<option'+(current.label===l?' selected':'')+'>'+O.esc(l)+'</option>';}).join('')+'</select></label>'
        + '<label>In your own words<textarea name="belief" maxlength="240" rows="3" placeholder="The issues you care about, a belief you hold, or where you are still undecided.">'+O.esc(current.belief)+'</textarea></label>'
        + '<div class="outlook-help outlook-counter">240 characters max</div>'
        + '<label class="outlook-consent"><input type="checkbox" name="publish"> <span>I want to share this publicly on Debatable.</span></label>'
        + '<p class="outlook-help">Anyone can read a public profile. Your label can also appear on the leaderboard. Your private matching answers stay private. Edit or remove this whenever you like.</p>'
        + '<div class="outlook-actions"><button class="fr-btn pri" type="submit">Publish outlook</button><button class="fr-btn" type="button" data-clear>Remove outlook</button></div>'
        + '<p class="outlook-status" role="status"></p></form></details>';
      var form=host.querySelector('form'), status=host.querySelector('[role="status"]');
      host.querySelector('[data-clear]').hidden=!current.label&&!current.belief;
      function save(body){
        if(!loaded)return;
        var buttons=host.querySelectorAll('button');buttons.forEach(function(b){b.disabled=true;});status.textContent='Saving…';
        request(body).then(function(j){current=j.outlook;render(true);host.querySelector('[role="status"]').textContent=body.publish?'Your outlook is saved.':'Your public outlook was removed.';if(onSave)onSave(current);})
          .catch(function(e){status.textContent=e.message;buttons.forEach(function(b){b.disabled=false;});});
      }
      form.addEventListener('submit',function(e){e.preventDefault();var data=new FormData(form);if(!data.has('publish')){status.textContent='Tick the box to choose public sharing, or leave these fields blank.';return;}save({label:data.get('label'),belief:data.get('belief'),publish:true});});
      host.querySelector('[data-clear]').onclick=function(){save({label:'',belief:'',publish:false});};
    }
    function load(){request().then(function(j){current=j.outlooks[user.uid]||{};loaded=true;render();if(onSave)onSave(current);}).catch(function(){host.innerHTML='<p class="outlook-help">Your outlook could not load.</p><button class="fr-btn" type="button">Try again</button>';host.querySelector('button').onclick=load;});}
    load();
  };
})();
