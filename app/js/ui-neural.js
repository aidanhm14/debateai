/* Neural constellation background — shared across all pages.
   Animates in dark / crimson and opted-in light themes. Looks for #uiNeuralCanvas.
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
  // Chrome-specific density cuts were rolled back — the founder's read is
  // that the constellation isn't the FPS bottleneck, and the lower
  // density made the field feel sparse at desktop widths. Zero-cost
  // wins (frame cap, offscreen pause, single-stroke batching) stay in.
  // 2026-05-27 perf pass: cap the neural-net background at DPR=1.
  // It's a decorative gradient of ~32 nodes + faint edges; nobody can
  // tell it's at half resolution, and a 2560×1440 backing buffer (full
  // DPR on retina) is ~14MB of texture memory for a background canvas
  // that's rarely the user's focus. 1× DPR drops it to ~3.7MB.
  // 2026-08-25: DPR cap raised 1 -> 1.5. The 2026-05-27 cut was made when
  // this layer only painted on near-black, where half resolution genuinely
  // was invisible; at 1x the .5px edges and ~1.5px nodes antialias into
  // grey smudges on both arms. Full 2x read too hard-edged for a layer
  // that is meant to sit behind the page, so 1.5 is the settled point
  // (Aidan, same day): most of the sharpening, none of the etched look,
  // and ~8MB of backing buffer on a retina desktop rather than ~14MB.
  var W,H,dpr=Math.min(window.devicePixelRatio||1,1.5);
  var isMobile=window.matchMedia&&window.matchMedia('(max-width: 768px)').matches;
  var reduced=false;
  try{reduced=window.matchMedia('(prefers-reduced-motion: reduce)').matches}catch(e){}
  var NODE_COUNT = 0;
  var CONNECT_DIST_DARK = 150;
  var CONNECT_DIST_LIGHT = 180;
  var MIN_SPEED=.04;
  var TWO_PI=Math.PI*2;
  // Frame cap. rAF fires at the display's native rate (60Hz on most
  // laptops, 120-144Hz on newer phones / iPad / gaming displays).
  // This is a slow decorative drift in the background. Capping at 30fps
  // (was 60) halves the per-second canvas + O(N^2) physics work and the
  // battery draw during a long active session — this layer runs on /app
  // and /practice where users sit for minutes. Integration is per-tick
  // (n.x += n.vx), so the drift is correspondingly gentler at 30fps;
  // for a background constellation that reads as calmer, not broken.
  var FRAME_MIN_MS = 1000/30 - 1;
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
  var themeActive=true,themeInitialized=false;
  var lineW=.5,nodeRMul=1;
  function refreshTheme(){
    // Read both selectors so we react no matter which page set the theme:
    // landing toggles `data-theme="light"` on <html>; /app + /high-school
    // toggle `body.light-theme`. Either signal flips the constellation
    // colors to the lighter palette.
    var isLight=document.documentElement.getAttribute('data-theme')==='light'
              ||document.body.classList.contains('light-theme');
    // landing.html permanently opts into geometry on its light surface.
    // Use warm graphite ink sized to land at roughly the same perceptual
    // weight the red lines carry on black, and keep the loop running.
    // Other light pages omit data-lightweb and remain unchanged.
    var lightWeb=isLight&&document.documentElement.getAttribute('data-lightweb')==='web';
    themeActive=!isLight||lightWeb;
    var R=lightWeb?74:(isLight?100:239),
        G=lightWeb?64:(isLight?130:68),
        B=lightWeb?68:(isLight?180:68);
    var rgb=R+','+G+','+B;
    // Dark carries the same small contrast lift the light arm got: the
    // sharper render alone does not compensate for red-on-near-black,
    // where the edges were sitting a couple of levels off the backdrop.
    EDGE_COLOR='rgba('+rgb+','+(lightWeb?.34:(isLight?.07:.22))+')';
    NODE_COLOR='rgba('+rgb+','+(lightWeb?.68:(isLight?.2:.46))+')';
    // Pulses stay brand red on the light arm: the ink carries the
    // structure, the red carries the life.
    PULSE_COLOR=lightWeb?'rgba(200,60,60,.7)':'rgba('+rgb+','+(isLight?.3:.55)+')';
    CDIST=isLight?CONNECT_DIST_LIGHT:CONNECT_DIST_DARK;
    CDIST_SQ=CDIST*CDIST;
    lineW=lightWeb?.5:(isLight?.4:.5);
    // Nodes carry the depth on cream: a sub-1px dot antialiases away to
    // nothing, so the web arm keeps them at full size rather than the
    // light theme's .9 shrink.
    nodeRMul=(isLight&&!lightWeb)?.9:1;
    // The constellation stays off on light surfaces that do not explicitly
    // opt in. Stop the frame loop instead of painting a transparent canvas.
    if(!themeActive){
      if(rafId){cancelAnimationFrame(rafId);rafId=0}
      ctx.clearRect(0,0,W,H);
    }else if(reduced&&themeInitialized){
      tick(0,true);
    }else if(running&&themeInitialized){
      start();
    }
  }

  // Best-of-random placement fills empty areas without a visible grid.
  // Keep this same density on wide screens instead of stretching 32 points.
  function addNode(){
    var x=0,y=0,best=-1;
    for(var attempt=0;attempt<12;attempt++){
      var px=12+Math.random()*(W-24),py=12+Math.random()*(H-24),nearest=Infinity;
      for(var j=0;j<nodes.length;j++){
        var dx=px-nodes[j].x,dy=py-nodes[j].y;
        nearest=Math.min(nearest,dx*dx+dy*dy);
      }
      if(nearest>best){best=nearest;x=px;y=py}
    }
    var angle=Math.random()*TWO_PI,speed=MIN_SPEED+Math.random()*.08;
    nodes.push({x:x,y:y,vx:Math.cos(angle)*speed,vy:Math.sin(angle)*speed,r:Math.random()*1.5+1});
  }
  function resize(){
    var oldW=W,oldH=H;
    W=window.innerWidth;H=window.innerHeight;
    isMobile=W<=768;
    NODE_COUNT=Math.max(16,Math.min(isMobile?24:72,Math.round(W*H/26000)));
    c.width=(W*dpr)|0;c.height=(H*dpr)|0;
    c.style.width=W+'px';c.style.height=H+'px';
    ctx.setTransform(dpr,0,0,dpr,0,0);
    if(oldW&&oldH){
      for(var i=0;i<nodes.length;i++){nodes[i].x*=W/oldW;nodes[i].y*=H/oldH}
    }
    nodes.length=Math.min(nodes.length,NODE_COUNT);
    while(nodes.length<NODE_COUNT)addNode();
    pulses.length=0;
  }
  function init(){resize();refreshTheme()}
  function addPulse(fi,ti){pulses.push({from:fi,to:ti,t:0,speed:.006+Math.random()*.008})}

  function tick(ts,still){
    if(!running||!themeActive){rafId=0;return}
    // Frame cap — skip the paint if we're firing at 144Hz but only
    // need 60Hz. The rAF re-fire still happens; we just bail out
    // before the expensive O(N²) edge pass.
    var now = ts || performance.now();
    if (!still && now - lastDrawAt < FRAME_MIN_MS) {
      rafId = requestAnimationFrame(tick);
      return;
    }
    // Skip paint entirely when canvas is offscreen — rAF keeps the
    // loop alive so we resume the moment it scrolls back into view.
    if (!inView && !still) {
      lastDrawAt = now;
      rafId = requestAnimationFrame(tick);
      return;
    }
    lastDrawAt = now;
    ctx.clearRect(0,0,W,H);

    // Pass 1: physics + collect edge endpoints. Squared-dist gate skips
    // most sqrts; only the close-pair repulsion needs the actual distance.
    edges.length=0;
    var i,j,n,nj,dx,dy,d2,d,spd2,spd;
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
          if(!still&&d2<12100){
            d=Math.sqrt(d2);
            var force=.002*(110-d)/110;
            var nx=dx/d*force,ny=dy/d*force;
            n.vx-=nx;n.vy-=ny;
            nj.vx+=nx;nj.vy+=ny;
          }
        }
      }
      if(still)continue;
      // No pull toward the center: the field should keep covering the margins.
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
      if(n.x<m){n.x=m;n.vx=Math.abs(n.vx)}else if(n.x>W-m){n.x=W-m;n.vx=-Math.abs(n.vx)}
      if(n.y<m){n.y=m;n.vy=Math.abs(n.vy)}else if(n.y>H-m){n.y=H-m;n.vy=-Math.abs(n.vy)}
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

    if(!still&&Math.random()<.04&&edges.length>0){
      var idx=((Math.random()*(edges.length/2))|0)*2;
      addPulse(edges[idx],edges[idx+1]);
    }
    if(!still)rafId=requestAnimationFrame(tick);
  }
  function start(){if(!reduced&&themeActive&&!rafId&&running){rafId=requestAnimationFrame(tick)}}
  function stop(){running=false;if(rafId){cancelAnimationFrame(rafId);rafId=0}}
  init();
  themeInitialized=true;
  window.addEventListener('resize',function(){resize();refreshTheme()},{passive:true});
  // Canvas paints compete directly with scrolling on the main thread.
  // Freeze the decorative loop while the user is actively scrolling,
  // then resume after the scroll has settled.
  var scrollResumeTimer=0;
  window.addEventListener('scroll',function(){
    if(reduced||!running||!themeActive)return;
    if(rafId){cancelAnimationFrame(rafId);rafId=0}
    if(scrollResumeTimer)clearTimeout(scrollResumeTimer);
    scrollResumeTimer=setTimeout(start,140);
  },{passive:true});
  document.addEventListener('visibilitychange',function(){
    if(document.hidden){stop()}else{running=true;if(!reduced)start()}
  });
  // Re-tint the constellation when the theme flips. Two observers because
  // landing flips `data-theme` on <html> while /app + /high-school flip a
  // class on <body>; either signal should trigger refreshTheme.
  if(window.MutationObserver){
    new MutationObserver(refreshTheme).observe(document.body,{attributes:true,attributeFilter:['class']});
    new MutationObserver(refreshTheme).observe(document.documentElement,{attributes:true,attributeFilter:['data-theme','data-lightweb']});
  }
  tick(0,reduced);
})();
