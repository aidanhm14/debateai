(function(){
  'use strict';
  var $=function(id){return document.getElementById(id);};
  var user=null, selectedRoom='', market=null, ownSide=null, pick=null, myBet=null, busy=false, stateVersion=0;
  var params=new URLSearchParams(location.search);
  var initialRoom=params.get('room')||'';
  if(!/^[A-Za-z0-9_-]{1,80}$/.test(initialRoom)) initialRoom='';
  var returnTo='/watch';
  try{
    var candidate=new URL(params.get('return')||'/watch',location.origin);
    if(candidate.origin===location.origin && /^\/(watch|live-round)(\.html)?$/.test(candidate.pathname)) returnTo=candidate.pathname+candidate.search+candidate.hash;
  }catch(e){}
  document.querySelectorAll('[data-return]').forEach(function(a){a.href=returnTo;if(initialRoom){a.textContent='← Back to the round';a.addEventListener('click',function(){if(history.length===1)window.close();});}});
  function watchUrl(room){return '/live-round?room='+encodeURIComponent(room)+'&spectate=1';}
  function node(tag,text,cls){var n=document.createElement(tag);if(text!=null)n.textContent=text;if(cls)n.className=cls;return n;}
  function call(data){
    return Promise.resolve(user?user.getIdToken():null).then(function(token){
      var headers={'Content-Type':'application/json'};if(token)headers.Authorization='Bearer '+token;
      return fetch('/.netlify/functions/predict',{method:'POST',headers:headers,body:JSON.stringify(data)});
    }).then(function(r){return r.json().then(function(d){if(!r.ok){var e=new Error(d.error||'Could not connect. Try again.');e.code=d.code;throw e;}return d;});});
  }
  function balance(value){$('balance').hidden=value==null;if(value!=null)$('balance').textContent=Number(value).toLocaleString()+' play tokens';}
  function renderRankings(data){
    $('trader-rows').replaceChildren();
    var rows=(data.leaderboard||[]).filter(function(r){return r.bets>0;});
    $('trader-status').hidden=rows.length>0;
    if(data.leaderboardError){$('trader-status').textContent='The standings could not load. Refresh to try again.';return;}
    if(!rows.length){$('trader-status').replaceChildren(node('strong','The first calls are still ahead.','empty-board-title'),node('span','Settled bets will put real people on this board. Your name could be first.'));return;}
    rows.forEach(function(r,i){
      var tr=node('tr');tr.appendChild(node('td',String(i+1).padStart(2,'0')));tr.appendChild(node('td',r.name+(r.me?' (you)':'')));tr.appendChild(node('td',r.wins+' / '+r.bets));tr.appendChild(node('td',Number(r.rating).toLocaleString()));$('trader-rows').appendChild(tr);
    });
  }
  function loadBoard(){
    return call({action:'list'}).then(function(d){
      balance(d.balance);renderRankings(d);$('markets').replaceChildren();
      var open=(d.markets||[]).filter(function(m){return m.status==='open'&&m.lockAt>Date.now();});
      $('market-status').hidden=open.length>0;
      if(d.marketsError){$('market-status').textContent='Open rounds could not load. Refresh to try again.';}
      else if(!open.length){$('market-status').replaceChildren(node('p','No open bets right now. The next public one-on-one round opens a new call.'));var a=node('a','See what is on →');a.href='/watch';$('market-status').appendChild(a);}
      open.forEach(function(m){
        var row=node('article',null,'market'),copy=node('div');copy.appendChild(node('h3',m.motion));copy.appendChild(node('p',m.proName+' · '+m.conName));var b=node('button','Back a side ↗','button primary');b.type='button';b.addEventListener('click',function(){openSlip(m.room);});row.append(copy,b);$('markets').appendChild(row);
      });
    }).catch(function(){ $('market-status').hidden=false;$('market-status').textContent='Could not load the rounds. Refresh to try again.';$('trader-status').hidden=false;$('trader-status').textContent='The standings are temporarily unavailable.'; });
  }
  function openSlip(room,scroll){selectedRoom=room;market=null;pick=null;myBet=null;$('bet-slip').hidden=false;$('slip-motion').textContent='Your round';$('slip-info').textContent='Loading this round…';$('bet-status').textContent='';$('age-confirm').hidden=true;$('age-check').checked=false;$('watch-round').href=watchUrl(room);$('sides').replaceChildren();$('bet-form').hidden=true;if(scroll!==false)$('bet-slip').scrollIntoView({behavior:'smooth',block:'center'});refreshSlip();}
  function refreshSlip(){
    if(!selectedRoom)return Promise.resolve();var room=selectedRoom,version=++stateVersion;
    return call({action:'round',room:room}).then(function(d){
      if(room!==selectedRoom||version!==stateVersion)return;
      market=d.market;ownSide=d.ownSide;myBet=d.myBet;balance(d.balance);
      if(!market){$('slip-motion').textContent='This round is not open for bets.';$('slip-info').textContent='Bets open when a public one-on-one round starts.';$('bet-form').hidden=true;return;}
      $('slip-motion').textContent=market.motion;
      var closed=market.status!=='open'||market.lockAt<=Date.now();
      $('slip-info').textContent=ownSide?'You are in this round. Back your own side.':'Choose who will win the argument.';
      $('sides').replaceChildren();var total=market.poolPro+market.poolCon;
      ['pro','con'].forEach(function(side){var pool=side==='pro'?market.poolPro:market.poolCon;var b=node('button',null,'side');b.type='button';b.setAttribute('aria-pressed',String(pick===side));b.disabled=!!(closed||myBet||busy||(ownSide&&ownSide!==side));b.append(node('b',side==='pro'?market.proName:market.conName),node('span',pool.toLocaleString()+' tokens · '+(total?Math.round(pool/total*100)+'% of pool':'No bets yet')));b.addEventListener('click',function(){pick=side;renderSelection();});b.dataset.side=side;$('sides').appendChild(b);});
      $('bet-form').hidden=closed||!!myBet;
      if(myBet){pick=myBet.pick;$('bet-status').textContent='You backed '+pick.toUpperCase()+' with '+myBet.stake+' play tokens.';}
      if(market.status==='settled')$('bet-status').textContent='The judge chose '+market.verdict.toUpperCase()+'. Tokens and ratings have been settled.';
      else if(market.status==='voided')$('bet-status').textContent='No winning verdict. Every stake was returned.';
      else if(closed)$('bet-status').textContent='Betting is closed. The judge will make the call.';
      renderSelection();
    }).catch(function(e){if(room===selectedRoom){$('slip-info').textContent=e.message;$('bet-form').hidden=true;}});
  }
  function renderSelection(){document.querySelectorAll('[data-side]').forEach(function(b){b.setAttribute('aria-pressed',String(b.dataset.side===pick));b.disabled=!!(busy||myBet||!market||market.status!=='open'||market.lockAt<=Date.now()||(ownSide&&ownSide!==b.dataset.side));});var closed=!market||market.status!=='open'||market.lockAt<=Date.now();$('place-bet').disabled=!!(busy||closed||myBet||(!pick&&user));$('place-bet').textContent=busy?'Placing…':!user?'Sign in to bet':pick?'Bet '+pick.toUpperCase():'Choose a side';}
  function signIn(){
    var proceed=function(){if(typeof window.openAuthModal==='function')window.openAuthModal('signin',{onDone:function(u){user=u&&!u.isAnonymous?u:null;loadBoard();refreshSlip();}});};
    if(window.openAuthModal){proceed();return;}
    var s=document.createElement('script');s.src='/js/auth-modal.js';s.onload=proceed;s.onerror=function(){$('bet-status').textContent='Sign-in could not load. Refresh to try again.';};document.head.appendChild(s);
  }
  function submit(){
    if(!user){signIn();return;}if(busy||!market||!pick||myBet)return;
    var stake=Number($('stake').value);if(!Number.isInteger(stake)||stake<1||stake>5000){$('bet-status').textContent='Choose a whole number from 1 to 5,000.';return;}
    busy=true;renderSelection();$('bet-status').textContent='Placing your bet…';
    call({action:'bet',room:selectedRoom,pick:pick,stake:stake}).then(function(d){balance(d.balance);$('age-confirm').hidden=true;return refreshSlip();}).catch(function(e){if(e.code==='no_attestation'){$('age-confirm').hidden=false;$('age-check').focus();$('bet-status').textContent='Confirm your age to place this bet.';}else $('bet-status').textContent=e.message;}).finally(function(){busy=false;renderSelection();});
  }
  $('bet-form').addEventListener('submit',function(e){e.preventDefault();submit();});
  $('confirm-age').addEventListener('click',function(){if(!$('age-check').checked){$('bet-status').textContent='Confirm you are 18 or older to continue.';return;}$('confirm-age').disabled=true;call({action:'attest',confirm:true}).then(function(d){if(!d.eligible)throw new Error('Betting is not available for this account.');$('age-confirm').hidden=true;submit();}).catch(function(e){$('bet-status').textContent=e.message;}).finally(function(){$('confirm-age').disabled=false;});});
  $('cancel-age').addEventListener('click',function(){$('age-confirm').hidden=true;$('age-check').checked=false;$('bet-status').textContent='No bet placed.';});
  $('close-slip').addEventListener('click',function(){if(busy)return;selectedRoom='';++stateVersion;$('bet-slip').hidden=true;});
  try{
    if(!firebase.apps.length)firebase.initializeApp({apiKey:['AIzaSyDDx','TYlyWLOJnFP99','e7XsLPb3FwIEijNNM'].join(''),authDomain:'debateos-78ac5.firebaseapp.com',projectId:'debateos-78ac5',storageBucket:'debateos-78ac5.firebasestorage.app',messagingSenderId:'860359449192',appId:'1:860359449192:web:f5dc0060dbd50d6c4fb9dd'});
    firebase.auth().onAuthStateChanged(function(u){user=u&&!u.isAnonymous?u:null;loadBoard();if(initialRoom){var room=initialRoom;initialRoom='';openSlip(room,false);}else refreshSlip();});
  }catch(e){loadBoard();if(initialRoom)openSlip(initialRoom,false);}
  setInterval(function(){if(document.hidden||busy)return;if(selectedRoom)refreshSlip();loadBoard();},30000);
  setInterval(function(){if(!document.hidden)renderSelection();},1000);
})();
