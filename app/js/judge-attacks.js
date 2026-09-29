(() => {
  'use strict';
  const $=id=>document.getElementById(id), node=(tag,text)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;return n;};
  let job=null,running=false,pumping=false,catalog=null;
  const notice=text=>$('attack-notice').textContent=text;
  async function api(body,query=''){
    const r=await fetch('/api/judge-attacks'+query,{method:body?'POST':'GET',credentials:'same-origin',cache:'no-store',headers:body?{'Content-Type':'application/json'}:{},...(body?{body:JSON.stringify(body)}:{})});
    const d=await r.json();if(!r.ok)throw Error(d.error||'Request failed');return d;
  }
  const save=(data,name)=>{const a=node('a');a.href=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);};
  function render(){
    $('attack-create').querySelector('button').disabled=pumping;
    $('attack-output').replaceChildren();if(!job)return;
    $('attack-output').append(node('h3',job.example.motion),node('p',job.status+' · '+job.results.length+'/12 panel runs · '+job.season.id));
    $('attack-output').append(node('p','Council: '+job.season.panel.jurors.map(j=>j.model+(j.effort?' ('+j.effort+')':'')).join(' · ')));
    const transcript=node('details');transcript.open=true;transcript.append(node('summary','Saved case transcript'));
    for(const [i,t] of job.example.turns.entries()){const turn=node('article');turn.append(node('strong',(i+1)+'. '+(t.side==='pro'?'For':'Against')),node('p',t.text));transcript.append(turn);}
    $('attack-output').append(transcript);
    if(job.attackText){const d=node('details');d.append(node('summary','Attacking speech'),node('p',job.attackText));$('attack-output').append(d);}
    for(const r of job.results){
      const d=node('details');d.append(node('summary',r.kind+' #'+r.repetition+' · '+(r.result.ballot?.winner||'incomplete')+' · '+r.result.panel.votesCast+' votes'));
      for(const j of r.result.jurorResults || []){
        d.append(node('h4',j.model+(j.effort?' · '+j.effort:'')),node('p',j.ballot?.rfd || j.error));
        for(const receipt of j.ballot?.receipts || []){d.append(node('strong',receipt.side+' · '+receipt.turnId),node('blockquote',receipt.quote),node('p',receipt.explanation));if(receipt.responseQuote)d.append(node('p','Reply · '+receipt.responseTurnId),node('blockquote',receipt.responseQuote));}
      }
      $('attack-output').append(d);
    }
    $('attack-review').hidden=job.status!=='complete'||!!job.review;
    $('attack-continue').disabled=pumping||job.status==='complete';
    $('attack-award').hidden=!(job.submissionId&&job.review?.confirmed&&job.review.expert);
    if(job.review?.confirmed){const replay=node('button','Replay this regression against the current council');replay.disabled=pumping;replay.onclick=()=>!pumping&&api({action:'replay',id:job.id}).then(d=>{job=d.job;render();return run();}).catch(e=>notice(e.message));$('attack-output').append(replay);}
    const base=job.results.filter(r=>r.kind==='baseline').map(r=>r.result.ballot?.winner);
    const flips=job.results.filter(r=>['aliases','anonymous','repetition'].includes(r.kind)&&r.result.ballot?.winner&&base[r.repetition-1]&&r.result.ballot.winner!==base[r.repetition-1]);
    if(flips.length)$('attack-output').append(node('p','Investigate '+flips.length+' verdict changes under superficial edits. Human review must distinguish a real failure from sampling variation.'));
    if(job.review)$('attack-output').append(node('p','Human review: '+job.review.reviewer+' · '+job.review.failureType),node('p',job.review.notes));
    if(job.error)notice(job.error);
  }
  async function refresh(){
    catalog=await api();$('attack-runs').replaceChildren();
    if(!$('attack-case').value)$('attack-case').value=JSON.stringify(catalog.example,null,2);
    $('attack-benchmark').textContent=catalog.benchmark.cases?JSON.stringify(catalog.benchmark,null,2):'No expert-reviewed cases yet. Higher effort is experimental and cannot promote itself.';
    for(const r of catalog.runs){const b=node('button',r.motion+' · '+r.steps+'/12'+(r.review?' · reviewed':''));b.type='button';b.onclick=()=>!pumping&&api(null,'?id='+r.id).then(d=>{job=d.job;render();}).catch(e=>notice(e.message));$('attack-runs').append(b);}
    $('attack-submissions').replaceChildren();
    for(const s of catalog.submissions){const d=node('details'),b=node('button','Create private reproduction');b.type='button';d.append(node('summary',s.example.motion+' · '+s.status),node('p',s.description),node('pre',JSON.stringify(s.example,null,2)),b);b.onclick=()=>!pumping&&api({action:'create',submissionId:s.id,attack:$('attack-kind').value}).then(d=>{job=d.job;render();}).catch(e=>notice(e.message));$('attack-submissions').append(d);}
  }
  async function run(){
    if(!job||pumping)return;pumping=true;running=true;render();notice('Running saved background stages. You can pause between stages.');
    try{while(running&&!$('workspace').hidden&&job.status!=='complete'){
      const next=(await api({action:'step',id:job.id})).job;if($('workspace').hidden)break;job=next;render();
      while(running&&job.status==='running'){
        await new Promise(r=>setTimeout(r,4000));if($('workspace').hidden)break;
        const next=(await api(null,'?id='+job.id)).job;if($('workspace').hidden)break;job=next;render();
      }
      if(job?.error)throw Error(job.error);
    }}catch(e){notice(e.message);}finally{running=false;pumping=false;render();if(!$('workspace').hidden)await refresh().catch(e=>notice(e.message));}
  }
  $('attack-create').onsubmit=async e=>{e.preventDefault();if(pumping)return;try{job=(await api({action:'create',example:JSON.parse($('attack-case').value),attack:$('attack-kind').value})).job;render();await run();}catch(e){notice(e.message);}};
  $('attack-continue').onclick=run;$('attack-pause').onclick=()=>{running=false;notice('The current background stage will finish and save. Continue when ready.');};
  $('attack-export').onclick=()=>api({action:'regressions'}).then(d=>save(d,'judge-regressions.json')).catch(e=>notice(e.message));
  $('attack-raw').onclick=()=>job&&api(null,'?id='+job.id+'&raw=1').then(d=>save(d,'judge-attack-'+job.id+'.json')).catch(e=>notice(e.message));
  $('attack-review').onsubmit=async e=>{e.preventDefault();try{job=(await api({action:'review',id:job.id,reviewer:$('attack-reviewer').value,notes:$('attack-notes').value,expectedWinner:$('attack-winner').value,failingVariant:$('attack-variant').value,failureType:$('attack-failure').value,checked:$('attack-checked').checked,expert:$('attack-expert').checked,qualification:$('attack-qualification').value})).job;render();await refresh();notice('Human review saved. Confirmed failures are included in regression exports.');}catch(e){notice(e.message);}};
  $('attack-award').onsubmit=async e=>{e.preventDefault();try{await api({action:'award',id:job.id,summary:$('attack-summary').value});notice('Verified discovery badge published with the submitter’s consent.');}catch(e){notice(e.message);}};
  new MutationObserver(()=>{if($('workspace').hidden){running=false;job=null;$('attack-output').replaceChildren();$('attack-runs').replaceChildren();$('attack-submissions').replaceChildren();}else refresh().catch(e=>notice(e.message));}).observe($('workspace'),{attributes:true,attributeFilter:['hidden']});
})();
