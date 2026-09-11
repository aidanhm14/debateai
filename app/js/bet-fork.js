(function(){
  'use strict';
  var fork=document.getElementById('bet-fork'),stage=document.getElementById('fork-stage');
  if(!fork||!stage)return;
  var animated=window.matchMedia('(min-width:801px) and (min-height:700px) and (hover:hover) and (pointer:fine) and (prefers-reduced-motion:no-preference)');
  var links=Array.from(fork.querySelectorAll('[data-bet-route]'));
  var choice='self',routedRoom='',frame=0,progress=0,balance=0,target=0,explicit=false;
  var guides={},lanes={};
  links.forEach(function(link){
    var key=link.dataset.betRoute,guide=document.getElementById(key==='self'?'bet-yourself':'bet-others');
    var lane=document.createElement('div'),reveal=document.createElement('div');
    lane.className=link.className;link.className='fork-pick';
    link.parentNode.replaceChild(lane,link);lane.appendChild(link);
    reveal.className='fork-guide';reveal.appendChild(guide);lane.appendChild(reveal);
    link.setAttribute('aria-controls',guide.id);guides[key]=guide;lanes[key]=lane;
    link.addEventListener('click',function(event){
      event.preventDefault();explicit=true;choose(key);measure();
      if(animated.matches)window.scrollTo({top:window.scrollY+fork.getBoundingClientRect().top+window.innerHeight*.7,behavior:'smooth'});
    });
    link.addEventListener('focus',function(){choose(key);});
  });
  document.getElementById('how').hidden=true;
  function choose(key){choice=key;paintAccess();request();}
  function paintAccess(){
    var reveal=animated.matches?target>.08:explicit;
    links.forEach(function(link){
      var key=link.dataset.betRoute,active=reveal&&key===choice;
      link.setAttribute('aria-expanded',String(active));
      lanes[key].classList.toggle('is-focused',active);
      guides[key].inert=!active;guides[key].setAttribute('aria-hidden',String(!active));
    });
    fork.dataset.choice=reveal?choice:'';
  }
  function measure(){
    fork.classList.toggle('fork-animated',animated.matches);
    if(animated.matches){
      fork.style.height=(stage.offsetHeight+window.innerHeight*.7)+'px';
      target=Math.max(0,Math.min(1,-fork.getBoundingClientRect().top/(window.innerHeight*.7)));
    }else{fork.style.height='';target=explicit?1:0;}
    paintAccess();request();
  }
  function request(){if(!frame)frame=requestAnimationFrame(draw);}
  function draw(){
    frame=0;
    var goal=animated.matches?target*(choice==='self'?1:-1):0;
    progress+= (target-progress)*.16;balance+=(goal-balance)*.16;
    if(Math.abs(target-progress)<.001)progress=target;
    if(Math.abs(goal-balance)<.001)balance=goal;
    fork.style.setProperty('--focus',progress.toFixed(4));
    fork.style.setProperty('--balance',balance.toFixed(4));
    if(progress!==target||balance!==goal)request();
  }
  window.addEventListener('pointermove',function(event){
    if(!animated.matches||event.pointerType==='touch')return;
    var rect=stage.getBoundingClientRect();
    if(rect.bottom<100||rect.top>window.innerHeight*.8)return;
    var x=event.clientX/window.innerWidth;
    if(x<.45&&choice!=='self')choose('self');
    else if(x>.55&&choice!=='others')choose('others');
  },{passive:true});
  window.addEventListener('scroll',measure,{passive:true});
  window.addEventListener('resize',measure);
  animated.addEventListener('change',measure);
  new ResizeObserver(measure).observe(stage);
  function readHash(){
    if(location.hash!=='#bet-yourself'&&location.hash!=='#bet-others')return;
    explicit=true;choose(location.hash==='#bet-yourself'?'self':'others');measure();
  }
  window.addEventListener('hashchange',readHash);
  // Membership comes from the market server, never a role claimed by the URL.
  window.DBBetFork={openRound:function(ownSide,room){
    if(routedRoom===room)return;
    routedRoom=room;explicit=true;choose(ownSide?'self':'others');measure();
  }};
  readHash();measure();
})();
