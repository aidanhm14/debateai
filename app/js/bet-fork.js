(function(){
  'use strict';
  var fork=document.getElementById('bet-fork'),stage=document.getElementById('fork-stage');
  if(!fork||!stage)return;
  var content=document.getElementById('bet-content'),heading=document.getElementById('ways-title');
  var choice='',routedRoom='';
  function selectGuide(focus){
    var hash=location.hash;
    if(hash==='#bet-yourself')choice='self';
    else if(hash==='#bet-others')choice='others';
    else if(!hash||hash==='#choose-path')choice='';
    fork.hidden=!!choice;
    content.hidden=!choice;
    document.querySelector('.rank-link').hidden=!choice;
    document.getElementById('bet-yourself').hidden=choice!=='self';
    document.getElementById('bet-others').hidden=choice!=='others';
    heading.textContent=choice==='self'?'Bet on yourself.':'Bet on others.';
    document.querySelectorAll('[data-bet-route]').forEach(function(a){
      if(a.dataset.betRoute===choice)a.setAttribute('aria-current','location');
      else a.removeAttribute('aria-current');
    });
    if(focus && (hash==='#bet-yourself'||hash==='#bet-others'||hash==='#choose-path'||!hash)){
      window.scrollTo({top:0,behavior:'instant'});
      (choice?heading:fork.querySelector('[data-bet-route]')).focus({preventScroll:true});
    }
  }
  window.addEventListener('hashchange',function(){selectGuide(true);});
  // A link from an existing round already chose a role. Keep its bet slip
  // reachable using the membership returned by the server, never a URL claim.
  window.DBBetFork={openRound:function(ownSide,room){
    if(routedRoom===room)return;
    routedRoom=room;
    if(choice)return;
    history.replaceState(null,'',location.pathname+location.search+(ownSide?'#bet-yourself':'#bet-others'));
    selectGuide(false);
  }};
  selectGuide(false);
})();
