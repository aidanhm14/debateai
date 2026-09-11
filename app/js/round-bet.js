(function(){
  'use strict';
  var root=document.getElementById('roundBet');if(!root)return;
  var $=function(id){return document.getElementById('rb-'+id);};
  var config={},market=null,pick=null,ownSide=null,myBet=null,busy=false,version=0,lastRead=0,authBound=false;
  function user(){try{var u=firebase.auth().currentUser;return u&&!u.isAnonymous?u:null;}catch(e){return null;}}
  function call(data){var u=user();return Promise.resolve(u?u.getIdToken():null).then(function(token){var headers={'Content-Type':'application/json'};if(token)headers.Authorization='Bearer '+token;return fetch('/.netlify/functions/predict',{method:'POST',headers:headers,body:JSON.stringify(data)});}).then(function(r){return r.json().then(function(d){if(!r.ok){var e=new Error(d.error||'Could not connect. Try again.');e.code=d.code;throw e;}return d;});});}
  function closed(){return !market||market.status!=='open'||market.lockAt<=Date.now();}
  function selections(){
    ['pro','con'].forEach(function(s){var b=$('pick-'+s);b.setAttribute('aria-pressed',String(s===pick));b.disabled=!!(busy||closed()||myBet||(ownSide&&s!==ownSide));});
    $('submit').disabled=!!(busy||closed()||myBet||(!pick&&user()));
    $('submit').textContent=busy?'Placing…':!user()?'Sign in to bet':pick?'Bet '+pick.toUpperCase():'Choose a side';
    $('stake').disabled=busy;
    if(market&&market.status==='open'&&!myBet&&market.lockAt<=Date.now()){$('form').hidden=true;$('status').textContent='Betting is closed. The judge will make the call.';}
  }
  function waiting(){
    $('start').hidden=!config.canStart||!!market;
    if(window.DBBetCharts)window.DBBetCharts.pool($('chart'),{poolPro:0,poolCon:0,priceHistory:[]});
    $('caption').textContent=config.viewer?'Back either side once the round starts.':'Back your own side with free play tokens.';
    $('status').textContent=config.started?'Opening this round’s betting pool…':config.canStart?'Start the conversation, then choose your token amount.':config.viewer?'Betting opens when the speakers start.':'Settle the topic and start the conversation to open betting.';
  }
  $('start').addEventListener('click',function(){
    if(config.canStart)document.dispatchEvent(new Event('round-bet-start'));
  });
  function refresh(force){
    if(!config.enabled||config.demo||!config.room||busy||(!force&&Date.now()-lastRead<5000))return Promise.resolve();
    lastRead=Date.now();var request=++version,room=config.room;
    return call({action:'round',room:room}).then(function(d){
      if(request!==version||room!==config.room||!config.enabled)return;
      market=d.market;ownSide=d.ownSide||null;myBet=d.myBet||null;
      $('balance').hidden=d.balance==null;$('balance').textContent=d.balance==null?'':Number(d.balance).toLocaleString()+' tokens';
      $('title').textContent=ownSide?'Bet on yourself.':'Bet on this round.';
      $('market').hidden=!market;
      if(!market){waiting();return;}
      $('start').hidden=true;
      if(ownSide)pick=ownSide;if(myBet)pick=myBet.pick;
      $('caption').textContent=ownSide?'You can only bet on your own side.':'Back either side with free play tokens.';
      var total=market.poolPro+market.poolCon;
      ['pro','con'].forEach(function(s){var pool=s==='pro'?market.poolPro:market.poolCon;$('name-'+s).textContent=(s==='pro'?market.proName:market.conName);$('pool-'+s).textContent=pool.toLocaleString()+' tokens'+(total?' · '+Math.round(pool/total*100)+'%':'');});
      if(window.DBBetCharts)window.DBBetCharts.pool($('chart'),market);
      $('form').hidden=closed()||!!myBet;
      if(market.status==='settled')$('status').textContent='The judge chose '+market.verdict.toUpperCase()+'. Tokens and ratings have settled.';
      else if(market.status==='voided')$('status').textContent='No winning verdict. All stakes were returned.';
      else if(myBet)$('status').textContent='You backed '+myBet.pick.toUpperCase()+' with '+myBet.stake+' tokens.';
      else if(closed())$('status').textContent='Betting is closed. The judge will make the call.';
      else $('status').textContent='One bet per round. Your return depends on the final pool.';
      selections();
    }).catch(function(e){if(request===version){$('status').textContent=e.message;$('form').hidden=true;}});
  }
  function signIn(){
    function show(){if(window.openAuthModal)window.openAuthModal('signin',{onDone:function(){refresh(true);}});}
    if(window.openAuthModal){show();return;}
    var s=document.createElement('script');s.src='/js/auth-modal.js';s.onload=show;s.onerror=function(){$('status').textContent='Sign-in could not load. Refresh to try again.';};document.head.appendChild(s);
  }
  function submit(){
    if(!user()){signIn();return;}if(busy||closed()||myBet||!pick||!config.enabled)return;
    var stake=Number($('stake').value);if(!Number.isInteger(stake)||stake<1||stake>5000){$('status').textContent='Choose a whole number from 1 to 5,000.';return;}
    var room=config.room;busy=true;selections();$('status').textContent='Placing your bet…';
    call({action:'bet',room:room,pick:pick,stake:stake}).then(function(){if(room!==config.room)return;$('age').hidden=true;busy=false;return refresh(true);}).catch(function(e){if(room!==config.room)return;if(e.code==='no_attestation'){$('age').hidden=false;$('age-check').focus();$('status').textContent='Confirm your age to place this bet.';}else $('status').textContent=e.message;}).finally(function(){busy=false;selections();});
  }
  ['pro','con'].forEach(function(side){$('pick-'+side).addEventListener('click',function(){pick=side;selections();});});
  $('form').addEventListener('submit',function(e){e.preventDefault();submit();});
  $('age-confirm').addEventListener('click',function(){
    if(!$('age-check').checked){$('status').textContent='Confirm you are 18 or older to continue.';return;}
    $('age-confirm').disabled=true;var room=config.room;
    call({action:'attest',confirm:true}).then(function(d){if(room!==config.room)return;if(!d.eligible)throw new Error('Betting is not available for this account.');$('age').hidden=true;submit();}).catch(function(e){$('status').textContent=e.message;}).finally(function(){$('age-confirm').disabled=false;});
  });
  $('age-cancel').addEventListener('click',function(){$('age').hidden=true;$('age-check').checked=false;$('status').textContent='No bet placed.';});
  window.DBRoundBet={refresh:function(){return refresh(true);},update:function(next){
    var changed=next.room!==config.room||next.enabled!==config.enabled;config=next;root.hidden=!config.enabled;
    if(changed){++version;market=null;myBet=null;ownSide=null;pick=null;lastRead=0;$('market').hidden=true;$('age').hidden=true;$('age-check').checked=false;$('balance').hidden=true;}
    if(!config.enabled)return;
    $('title').textContent=ownSide||!config.viewer?'Bet on yourself.':'Bet on this round.';
    if(!market)waiting();
    if(config.demo)return;
    if(!authBound){try{firebase.auth().onAuthStateChanged(function(){market=null;myBet=null;ownSide=null;pick=null;refresh(true);});authBound=true;}catch(e){}}
    refresh(false);
  }};
  setInterval(function(){if(!document.hidden)refresh(false);},15000);
  setInterval(function(){if(!root.hidden)selections();},1000);
  document.dispatchEvent(new Event('round-bet-ready'));
})();
