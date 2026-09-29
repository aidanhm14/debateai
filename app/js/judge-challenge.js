(() => {
  'use strict';const $=id=>document.getElementById(id),status=text=>$('challenge-status').textContent=text;
  try{if(!firebase.apps.length)firebase.initializeApp({apiKey:['AIzaSyDDx','TYlyWLOJnFP99','e7XsLPb3FwIEijNNM'].join(''),authDomain:'itsdebatable.com',projectId:'debateos-78ac5',appId:'1:860359449192:web:f5dc0060dbd50d6c4fb9dd'});
    firebase.auth().onAuthStateChanged(user=>{$('challenge-signin').hidden=!!user&&!user.isAnonymous;});
  }catch{status('Sign-in is unavailable. Reload to try again.');}
  let turnId=0;
  function addTurn(side){
    const host=$('challenge-turns');if(host.children.length>=24)return;
    const id=++turnId,row=document.createElement('fieldset'),legend=document.createElement('legend'),label=document.createElement('label'),select=document.createElement('select'),speech=document.createElement('textarea'),remove=document.createElement('button');
    legend.textContent='Turn '+id;label.textContent='Side';label.htmlFor='challenge-side-'+id;select.id=label.htmlFor;
    for(const [value,text] of [['pro','For'],['con','Against']]){const option=document.createElement('option');option.value=value;option.textContent=text;select.append(option);}select.value=side;
    speech.rows=3;speech.required=true;speech.minLength=12;speech.maxLength=4000;speech.placeholder='What did this person say?';speech.setAttribute('aria-label','Words in turn '+id);
    remove.type='button';remove.textContent='Remove turn';remove.onclick=()=>{if(host.children.length>2)row.remove();else status('Keep at least two turns, with a response from each side.');};row.append(legend,label,select,speech,remove);host.append(row);
  }
  addTurn('pro');addTurn('con');$('challenge-add-turn').onclick=()=>addTurn($('challenge-turns').children.length%2?'con':'pro');
  $('challenge-signin').onclick=()=>window.openAuthModal?.();
  async function send(body){
    const user=window.firebase?.auth().currentUser;if(!user||user.isAnonymous)throw Error('Sign in with an account to submit.');
    const token=await user.getIdToken(),r=await fetch('/api/judge-challenge',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify(body)}),d=await r.json();if(!r.ok)throw Error(d.error||'Could not save');return d;
  }
  $('challenge-form').onsubmit=async e=>{e.preventDefault();$('challenge-submit').disabled=true;try{
    const d=await send({example:{motion:$('challenge-motion').value,turns:[...$('challenge-turns').children].map(row=>({side:row.querySelector('select').value,text:row.querySelector('textarea').value}))},description:$('challenge-description').value,alias:$('challenge-alias').value,synthetic:$('challenge-synthetic').checked,publicConsent:$('challenge-public').checked});
    status(d.message+' Submission ID: '+d.id);$('challenge-withdraw-id').value=d.id;
  }catch(e){status(e.message);}finally{$('challenge-submit').disabled=false;}};
  $('challenge-withdraw').onclick=async()=>{try{await send({action:'withdraw',id:$('challenge-withdraw-id').value.trim()});status('Public badge consent withdrawn.');await badges();}catch(e){status(e.message);}};
  async function badges(){const r=await fetch('/api/judge-challenge',{cache:'no-store'});if(!r.ok)throw Error('Discoveries are temporarily unavailable.');const d=await r.json(),host=$('challenge-badges');host.replaceChildren();
    if(!d.badges.length){host.textContent='No verified discoveries published yet.';return;}
    for(const b of d.badges){const item=document.createElement('article'),name=document.createElement('strong'),text=document.createElement('p');name.textContent=b.alias+' · Verified judge discovery';text.textContent=b.summary;item.append(name,text);host.append(item);}
  }
  badges().catch(e=>{$('challenge-badges').textContent=e.message;});
})();
