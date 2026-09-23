(function(root){
  'use strict';
  function mount(options){
    var host=options.host;
    if(!host||!options.generationId||host.dataset.generationId===options.generationId)return;
    host.textContent='';host.dataset.generationId=options.generationId;
    var form=document.createElement('form');form.style.cssText='padding:16px 0;display:grid;gap:10px;font:inherit;max-width:560px';
    function field(title,node){var label=document.createElement('label');label.textContent=title;label.style.cssText='display:grid;gap:5px';label.appendChild(node);form.appendChild(label);return node;}
    var score=document.createElement('select');score.required=true;
    [['','Choose a rating'],['1','1 · Not useful'],['2','2'],['3','3'],['4','4'],['5','5 · Very useful']].forEach(function(v){score.add(new Option(v[1],v[0]));});
    field(options.surface==='live_round'?'How useful was this decision?':'How useful was this round?',score);
    var issue=document.createElement('select');
    [['','Nothing specific'],['transcript','Transcript missed or mixed up words'],['audio','Audio or connection'],['judge','Decision or explanation'],['topic','Topic'],['opponent','AI opponent'],['other','Something else']].forEach(function(v){issue.add(new Option(v[1],v[0]));});
    field('Anything we should improve?',issue);
    var notes=document.createElement('textarea');notes.maxLength=600;notes.rows=2;notes.placeholder='What happened? Optional.';field('Your feedback',notes);
    [score,issue,notes].forEach(function(n){n.style.cssText='font:inherit;color:inherit;background:var(--bg,transparent);border:1px solid currentColor;border-radius:7px;padding:9px;width:100%;box-sizing:border-box';});
    var button=document.createElement('button');button.type='submit';button.textContent='Send feedback';button.className='ctl';form.appendChild(button);
    var status=document.createElement('span');status.setAttribute('role','status');form.appendChild(status);
    form.addEventListener('submit',async function(e){
      e.preventDefault();if(button.disabled||!score.value)return;button.disabled=true;status.textContent='Saving…';
      try{
        var token=await options.getToken();if(!token)throw Error('Sign in to send feedback.');
        var res=await fetch('/api/log-generation',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify({action:'signal',generationId:options.generationId,signal:'rate',value:Number(score.value),meta:{issue:issue.value,notes:notes.value,surface:options.surface}})});
        if(!res.ok)throw Error('Could not save. Please try again.');
        status.textContent='Feedback saved. Thank you.';button.textContent='Sent';score.disabled=true;issue.disabled=true;notes.disabled=true;
      }catch(err){status.textContent=err.message||'Could not save. Please try again.';button.disabled=false;}
    });host.appendChild(form);
  }
  root.RoundFeedback={mount:mount};
})(window);
