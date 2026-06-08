/* Neural constellation background — shared across all pages.
   Only animates in dark / crimson themes. Looks for #uiNeuralCanvas.
   Perf rewrite 2026-04-22: edges and nodes batched into single Path2D
   + single stroke/fill calls each. Old version did one stroke per edge
   and one fill per node — on Chrome that meant N + M state mutations
   per frame, each forcing the compositor onto a software paint path.
   Lost per-edge alpha falloff and per-node twinkle; both were sub-5%
   alpha jitter and not visible against the dark backdrop. */
(function(){
  var c=document.getElementById('uiNeuralCanvas');
  if(!c) return;
  var ctx=c.getContext('2d');
  var nodes=[],edges=[],pulses=[];
  // Render at full Retina (DPR=2) for the wide, high-resolution look.
  // Chrome-specific density cuts were rolled back — Aidan's read is
  // that the constellation isn't the FPS bottleneck, and the lower
  // density made the field feel sparse at desktop widths. Zero-cost
  // wins (frame cap, offscreen pause, single-stroke batching) stay in.
  // 2026-05-27 perf pass: cap the neural-net background at DPR=1.
  // It's a decorative gradient of ~32 nodes + faint edges; nobody can
  // tell it's at half resolution, and a 2560×1440 backing buffer (full
  // DPR on retina) is ~14MB of texture memory for a background canvas
  // that's rarely the user's focus. 1× DPR drops it to ~3.7MB.
  var W,H,dpr=1;
  var isMobile=window.matchMedia&&window.matchMedia('(max-width: 768px)').matches;
  var reduced=false;
  try{reduced=window.matchMedia('(prefers-reduced-motion: reduce)').matches}catch(e){}
  var NODE_COUNT = isMobile ? 16 : 32;
  var CONNECT_DIST_DARK = 150;
  var CONNECT_DIST_LIGHT = 180;
  var MIN_SPEED=.04;
  var TWO_PI=Math.PI*2;
  // Frame cap. rAF fires at the display's native rate (60Hz on most
  // laptops, 120-144Hz on newer phones / iPad / gaming displays).
  // Drawing this background 144× per second is wasted work — the
  // motion is slow enough that 60fps is indistinguishable from 144.
  var FRAME_MIN_MS = 1000/60 - 1;
  var lastDrawAt = 0;
  // Visibility gate. Pause when the canvas scrolls fully offscreen
  // (rAF already throttles hidden tabs, but on a long landing page
  // the constellation runs continuously even after the user scrolls
  // 6 sections down).
  // 2026-05-27 perf pass: previous code kept the rAF chain alive when
  // offscreen and just skip-painted (60 wasted rAF schedules/sec on a
  // long landing page). Now we fully cancel rAF on intersection-out
  // and restart on intersection-in — zero idle cost when the user has
  // scrolled past the hero. start() / stop() handle the rAF lifecycle.
  var inView = true;
  var running=true,rafId=0;
  if ('IntersectionObserver' in window){
    try{
      new IntersectionObserver(function(entries){
        for (var i=0;i<entries.length;i++){
          var hit = entries[i].isIntersecting;
          var wasInView = inView;
          inView = hit;
          if (!hit && rafId) { cancelAnimationFrame(rafId); rafId = 0; }
          else if (hit && !wasInView && running) start();
        }
      }, { threshold: 0.01 }).observe(c);
    }catch(e){}
  }

  // Pre-formatted color strings, refreshed on theme flip via a MutationObserver
  // on body.class (cheap; fires only when theme actually changes).
  var EDGE_COLOR='',NODE_COLOR='',PULSE_COLOR='',CDIST=CONNECT_DIST_DARK,CDIST_SQ=CDIST*CDIST;
  var lineW=.5,nodeRMul=1;
  function refreshTheme(){
    // Read both selectors so we react no matter which page set the theme:
    // landing toggles `data-theme="light"` on <html>; /app + /high-school
    // toggle `body.light-theme`. Either signal flips the constellation
    // colors to the lighter palette.
    var isLight=document.documentElement.getAttribute('data-theme')==='light'
              ||document.body.classList.contains('light-theme');
    var R=isLight?100:239,G=isLight?130:68,B=isLight?180:68;
    var rgb=R+','+G+','+B;
    EDGE_COLOR='rgba('+rgb+','+(isLight?.07:.18)+')';
    NODE_COLOR='rgba('+rgb+','+(isLight?.2:.4)+')';
    PULSE_COLOR='rgba('+rgb+','+(isLight?.3:.55)+')';
    CDIST=isLight?CONNECT_DIST_LIGHT:CONNECT_DIST_DARK;
    CDIST_SQ=CDIST*CDIST;
    lineW=isLight?.4:.5;
    nodeRMul=isLight?.9:1;
  }

  function resize(){
    W=window.innerWidth;H=window.innerHeight;
    c.width=(W*dpr)|0;c.height=(H*dpr)|0;
    c.style.width=W+'px';c.style.height=H+'px';
    ctx.setTransform(dpr,0,0,dpr,0,0);
  }
  function init(){
    resize();refreshTheme();nodes=[];
    for(var i=0;i<NODE_COUNT;i++){
      var angle=Math.random()*TWO_PI;
      var speed=MIN_SPEED+Math.random()*.08;
      nodes.push({
        x:Math.random()*W,y:Math.random()*H,
        vx:Math.cos(angle)*speed,vy:Math.sin(angle)*speed,
        r:Math.random()*1.5+1
      });
    }
  }
  function addPulse(fi,ti){pulses.push({from:fi,to:ti,t:0,speed:.006+Math.random()*.008})}

  function tick(ts){
    if(!running){rafId=0;return}
    // Frame cap — skip the paint if we're firing at 144Hz but only
    // need 60Hz. The rAF re-fire still happens; we just bail out
    // before the expensive O(N²) edge pass.
    var now = ts || performance.now();
    if (now - lastDrawAt < FRAME_MIN_MS) {
      rafId = requestAnimationFrame(tick);
      return;
    }
    // Skip paint entirely when canvas is offscreen — rAF keeps the
    // loop alive so we resume the moment it scrolls back into view.
    if (!inView) {
      lastDrawAt = now;
      rafId = requestAnimationFrame(tick);
      return;
    }
    lastDrawAt = now;
    ctx.clearRect(0,0,W,H);

    // Pass 1: physics + collect edge endpoints. Squared-dist gate skips
    // most sqrts; only the close-pair repulsion needs the actual distance.
    edges.length=0;
    var cxW=W/2,cyH=H/2;
    var i,j,n,nj,dx,dy,d2,d,dcx,dcy,dc2,spd2,spd;
    var edgePathPairs=[];
    for(i=0;i<nodes.length;i++){
      n=nodes[i];
      for(j=i+1;j<nodes.length;j++){
        nj=nodes[j];
        dx=nj.x-n.x;dy=nj.y-n.y;
        d2=dx*dx+dy*dy;
        if(d2<CDIST_SQ&&d2>1){
          edgePathPairs.push(n.x,n.y,nj.x,nj.y);
          edges.push(i,j);
          if(d2<3600){
            d=Math.sqrt(d2);
            var force=.003*(60-d)/60;
            var nx=dx/d*force,ny=dy/d*force;
            n.vx-=nx;n.vy-=ny;
            nj.vx+=nx;nj.vy+=ny;
          }
        }
      }
      dcx=cxW-n.x;dcy=cyH-n.y;
      dc2=dcx*dcx+dcy*dcy;
      var minR=Math.min(W,H)*.4;
      if(dc2>minR*minR){
        var dc=Math.sqrt(dc2);
        n.vx+=dcx/dc*.0005;n.vy+=dcy/dc*.0005;
      }
      spd2=n.vx*n.vx+n.vy*n.vy;
      if(spd2<MIN_SPEED*MIN_SPEED&&spd2>0){
        spd=Math.sqrt(spd2);
        n.vx=n.vx/spd*MIN_SPEED;n.vy=n.vy/spd*MIN_SPEED;
      } else if(spd2>.04){
        spd=Math.sqrt(spd2);
        n.vx=n.vx/spd*.2;n.vy=n.vy/spd*.2;
      }
      n.x+=n.vx;n.y+=n.vy;
      var m=20;
      if(n.x<-m)n.x=W+m;else if(n.x>W+m)n.x=-m;
      if(n.y<-m)n.y=H+m;else if(n.y>H+m)n.y=-m;
    }

    // Edges: ONE path, ONE stroke.
    if(edgePathPairs.length){
      ctx.beginPath();
      for(i=0;i<edgePathPairs.length;i+=4){
        ctx.moveTo(edgePathPairs[i],edgePathPairs[i+1]);
        ctx.lineTo(edgePathPairs[i+2],edgePathPairs[i+3]);
      }
      ctx.strokeStyle=EDGE_COLOR;
      ctx.lineWidth=lineW;
      ctx.stroke();
    }

    // Nodes: ONE path, ONE fill.
    ctx.beginPath();
    for(i=0;i<nodes.length;i++){
      n=nodes[i];
      var nr=n.r*nodeRMul;
      ctx.moveTo(n.x+nr,n.y);
      ctx.arc(n.x,n.y,nr,0,TWO_PI);
    }
    ctx.fillStyle=NODE_COLOR;
    ctx.fill();

    // Pulses: small count (≤10), keep individual fills.
    for(var p=pulses.length-1;p>=0;p--){
      var pu=pulses[p];
      pu.t+=pu.speed;
      if(pu.t>=1){pulses.splice(p,1);continue}
      var a=nodes[pu.from],b=nodes[pu.to];
      var px=a.x+(b.x-a.x)*pu.t,py=a.y+(b.y-a.y)*pu.t;
      ctx.globalAlpha=(1-Math.abs(pu.t-.5)*2);
      ctx.beginPath();
      ctx.arc(px,py,isMobile?1.5:2,0,TWO_PI);
      ctx.fillStyle=PULSE_COLOR;
      ctx.fill();
    }
    ctx.globalAlpha=1;

    if(Math.random()<.04&&edges.length>0){
      var idx=((Math.random()*(edges.length/2))|0)*2;
      addPulse(edges[idx],edges[idx+1]);
    }
    rafId=requestAnimationFrame(tick);
  }
  function start(){if(!rafId&&running){rafId=requestAnimationFrame(tick)}}
  function stop(){running=false;if(rafId){cancelAnimationFrame(rafId);rafId=0}}
  if(reduced){init();return}
  init();
  window.addEventListener('resize',resize,{passive:true});
  document.addEventListener('visibilitychange',function(){
    if(document.hidden){stop()}else{running=true;start()}
  });
  // Re-tint the constellation when the theme flips. Two observers because
  // landing flips `data-theme` on <html> while /app + /high-school flip a
  // class on <body>; either signal should trigger refreshTheme.
  if(window.MutationObserver){
    new MutationObserver(refreshTheme).observe(document.body,{attributes:true,attributeFilter:['class']});
    new MutationObserver(refreshTheme).observe(document.documentElement,{attributes:true,attributeFilter:['data-theme']});
  }
  tick();
})();
