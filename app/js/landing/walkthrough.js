
/* How-it-works color mode: no per-section toggle anymore, it just
   mirrors the site theme. The section is transparent over the page
   background, so its white-paper ink is unreadable on a dark theme. */
(function(){
  try{
    var sec=document.getElementById('how-it-works');
    if(!sec)return;
    var pageDark=(document.documentElement.getAttribute('data-theme')||'light')!=='light';
    sec.classList.toggle('hiw--dark',pageDark);
  }catch(e){}
})();
/* How-it-works deck. Native snap does the touch swiping; this IIFE
   syncs chips/dots/arrows, wires click-to-step, and runs a one-pass
   auto-advance that stops on first interaction. Verified-on-this-page
   constraints (do not re-simplify): native smooth scrolling gets
   cancelled by the landing's scroll machinery, scroll events never
   fire on nested scrollers here, and clientWidth is 0 outside the
   lazy-layout range. Hence the hand-rolled tween + position poller,
   both setTimeout-based so they run in hidden panes too. */
(function(){
  try{
    var vp=document.getElementById('hiwViewport');
    var track=document.getElementById('hiwTrack');
    if(!vp||!track)return;
    var cards=track.children.length;
    var chips=[].slice.call(document.querySelectorAll('[data-hiw-chip]'));
    var dots=[].slice.call(document.querySelectorAll('[data-hiw-dot]'));
    var prev=document.getElementById('hiwPrev');
    var next=document.getElementById('hiwNext');
    var idx=0,seen={0:1},userTouched=false;
    var tween=0;
    function goTo(i,smooth){
      i=Math.max(0,Math.min(cards-1,i));
      if(tween){clearTimeout(tween);tween=0}
      var to=i*vp.clientWidth;
      if(smooth===false){vp.scrollLeft=to}
      else{
        var from=vp.scrollLeft,start=Date.now(),DUR=340;
        (function step(){
          var t=Math.min(1,(Date.now()-start)/DUR);
          var e=1-Math.pow(1-t,3);
          vp.scrollLeft=from+(to-from)*e;
          if(t<1)tween=setTimeout(step,16);else tween=0;
        })();
      }
      if(i!==idx){idx=i;paint()}
    }
    function paint(){
      chips.forEach(function(c,i){c.setAttribute('aria-current',i===idx?'true':'false')});
      dots.forEach(function(d,i){d.setAttribute('aria-current',i===idx?'true':'false')});
      if(prev)prev.disabled=idx===0;
      if(next)next.disabled=idx===cards-1;
      if(!seen[idx]){
        seen[idx]=1;
        if(window.dosTrack)dosTrack('hiw_step_view',{step:idx+1});
      }
    }
    function syncFromScroll(){
      if(tween||vp.clientWidth<10)return;
      var i=Math.round(vp.scrollLeft/vp.clientWidth);
      i=Math.max(0,Math.min(cards-1,i));
      if(i!==idx){idx=i;paint()}
    }
    setInterval(syncFromScroll,350);
    function stopAuto(){userTouched=true}
    chips.forEach(function(c,i){c.addEventListener('click',function(){stopAuto();goTo(i)})});
    dots.forEach(function(d,i){d.addEventListener('click',function(){stopAuto();goTo(i)})});
    if(prev)prev.addEventListener('click',function(){stopAuto();goTo(idx-1)});
    if(next)next.addEventListener('click',function(){stopAuto();goTo(idx+1)});
    vp.addEventListener('pointerdown',stopAuto,{passive:true});
    vp.addEventListener('wheel',stopAuto,{passive:true});
    vp.addEventListener('keydown',function(e){
      if(e.key==='ArrowRight'){stopAuto();goTo(idx+1);e.preventDefault()}
      else if(e.key==='ArrowLeft'){stopAuto();goTo(idx-1);e.preventDefault()}
    });
    /* One-pass auto-advance: in-viewport only, never after the user has
       touched the deck, never under reduced motion, parks at the last
       card instead of looping. */
    var reduced=false;
    try{reduced=window.matchMedia('(prefers-reduced-motion: reduce)').matches}catch(_){}
    if(!reduced){
      var inView=false;
      try{
        new IntersectionObserver(function(es){
          es.forEach(function(en){inView=en.isIntersecting});
        },{threshold:.55}).observe(vp);
      }catch(_){inView=true}
      setInterval(function(){
        if(userTouched||!inView||document.hidden)return;
        if(idx<cards-1)goTo(idx+1);
      },7000);
    }
    window.addEventListener('resize',function(){goTo(idx,false)});
    paint();
  }catch(e){}
})();
