(function(root){
  'use strict';
  function mount(options){
    var host=options.host, key=options.roundId || options.generationId;
    if(!host||!key)return;
    // The consented capture may finish after the form appears. Enrich its
    // reference without discarding a person's draft or submitting twice.
    if(host.firstChild&&host.dataset.feedbackKey===key){Object.keys(options).forEach(function(name){if(options[name]!==undefined&&options[name]!==null&&options[name]!=='')host._roundFeedbackOptions[name]=options[name];});return;}
    host.textContent='';host.dataset.feedbackKey=key;host.dataset.generationId=options.generationId||'';
    host._roundFeedbackOptions=Object.assign({},options);
    var config=host._roundFeedbackOptions;
    var form=document.createElement('form');form.style.cssText='padding:16px 0;display:grid;gap:10px;font:inherit;max-width:560px';
    function field(title,node){var label=document.createElement('label');label.textContent=title;label.style.cssText='display:grid;gap:5px';label.appendChild(node);form.appendChild(label);return node;}
    var score=document.createElement('select');
    [['','Optional rating'],['1','1 · Not useful'],['2','2'],['3','3'],['4','4'],['5','5 · Very useful']].forEach(function(v){score.add(new Option(v[1],v[0]));});
    field(options.surface==='live_round'?'How useful was this decision?':'How useful was this round?',score);
    var issue=document.createElement('select');
    var issues=[['','Nothing specific'],['transcript','Transcript missed or mixed up words'],['audio','Audio or connection'],['judge','Decision or explanation'],['topic','Topic']];
    if(options.surface!=='live_round')issues.push(['opponent','AI opponent']);
    issues.push(['other','Something else']);issues.forEach(function(v){issue.add(new Option(v[1],v[0]));});
    field('Anything we should improve?',issue);
    var notes=document.createElement('textarea');notes.maxLength=600;notes.rows=2;notes.placeholder='What happened? Optional.';field('Your feedback',notes);
    [score,issue,notes].forEach(function(n){n.style.cssText='font:inherit;color:inherit;background:var(--bg,transparent);border:1px solid currentColor;border-radius:7px;padding:9px;width:100%;box-sizing:border-box';});
    var privacy=document.createElement('small');privacy.textContent='Sends your rating and feedback. It does not turn on transcript storage.';form.appendChild(privacy);
    var button=document.createElement('button');button.type='submit';button.textContent='Send feedback';button.className='ctl';form.appendChild(button);
    var status=document.createElement('span');status.setAttribute('role','status');form.appendChild(status);
    form.addEventListener('submit',async function(e){
      e.preventDefault();if(button.disabled)return;
      if(!score.value&&!issue.value&&!notes.value.trim()){status.textContent='Choose a rating or tell us what happened.';return;}
      button.disabled=true;status.textContent='Saving…';
      var abort=typeof AbortController==='function'?new AbortController():null;var timer;
      try{
        await Promise.race([(async function(){
        var token=await config.getToken();if(!token)throw Error('Sign in to send feedback.');
        var payload=config.roundId?{action:'round_feedback',roundId:config.roundId,surface:config.surface,generationId:config.generationId||'',transcriptId:config.transcriptId||'',rating:score.value?Number(score.value):null,issue:issue.value,notes:notes.value}:{action:'signal',generationId:config.generationId,signal:score.value?'rate':'feedback',value:score.value?Number(score.value):null,meta:{issue:issue.value,notes:notes.value,surface:config.surface}};
        var res=await fetch('/api/log-generation',{method:'POST',signal:abort?abort.signal:undefined,headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify(payload)});
        if(!res.ok)throw Error('Could not save. Please try again.');
        })(),new Promise(function(_,reject){timer=setTimeout(function(){if(abort)abort.abort();reject(Error('Saving took too long. Please try again.'));},20000);})]);
        status.textContent='Feedback saved. Thank you.';button.textContent='Sent';score.disabled=true;issue.disabled=true;notes.disabled=true;
      }catch(err){status.textContent=err.message||'Could not save. Please try again.';button.disabled=false;}finally{clearTimeout(timer);}
    });host.appendChild(form);
  }
  root.RoundFeedback={mount:mount};
})(window);
