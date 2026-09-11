(function(){
  'use strict';
  var fork=document.getElementById('bet-fork'),stage=document.getElementById('fork-stage');
  if(!fork||!stage)return;
  var motion=window.matchMedia('(prefers-reduced-motion: reduce)'),frame=0;
  function paint(){
    frame=0;var r=fork.getBoundingClientRect(),distance=Math.max(1,r.height-stage.offsetHeight);
    var progress=motion.matches?1:Math.max(0,Math.min(1,-r.top/distance));
    fork.style.setProperty('--split',progress.toFixed(3));
  }
  function schedule(){if(!frame)frame=requestAnimationFrame(paint);}
  function selectGuide(){
    var choice=location.hash==='#bet-yourself'?'self':location.hash==='#bet-others'?'others':'';
    document.querySelectorAll('[data-bet-route]').forEach(function(a){if(a.dataset.betRoute===choice)a.setAttribute('aria-current','location');else a.removeAttribute('aria-current');});
  }
  window.addEventListener('scroll',schedule,{passive:true});window.addEventListener('resize',schedule,{passive:true});window.addEventListener('hashchange',selectGuide);
  if(motion.addEventListener)motion.addEventListener('change',schedule);
  paint();selectGuide();
})();
