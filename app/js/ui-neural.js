/* Neural constellation background — shared across all pages.
   Only animates in dark / crimson themes. Looks for #uiNeuralCanvas.
   Perf-optimized 2026-04-21: single pairwise pass (physics+edges in
   one loop), squared-distance gate before sqrt, mobile node downscale,
   visibility pause. Target <2ms/frame on mid-tier laptops. */
(function(){
  var c=document.getElementById('uiNeuralCanvas');
  if(!c) return;
  var ctx=c.getContext('2d');
  var nodes=[],edges=[],pulses=[];
  var W,H,dpr=Math.min(window.devicePixelRatio||1,2);
  var isMobile=window.matchMedia&&window.matchMedia('(max-width: 768px)').matches;
  var reduced=false;
  try{reduced=window.matchMedia('(prefers-reduced-motion: reduce)').matches}catch(e){}
  var NODE_COUNT=isMobile?16:32;
  var CONNECT_DIST_DARK=150,CONNECT_DIST_LIGHT=180;
  var MIN_SPEED=.04;
  var running=true;

  function resize(){
    W=window.innerWidth;H=window.innerHeight;
    c.width=(W*dpr)|0;c.height=(H*dpr)|0;
    c.style.width=W+'px';c.style.height=H+'px';
    ctx.setTransform(dpr,0,0,dpr,0,0);
  }
  function init(){
    resize();nodes=[];
    for(var i=0;i<NODE_COUNT;i++){
      var angle=Math.random()*Math.PI*2;
      var speed=MIN_SPEED+Math.random()*.08;
      nodes.push({
        x:Math.random()*W,y:Math.random()*H,
        vx:Math.cos(angle)*speed,vy:Math.sin(angle)*speed,
        r:Math.random()*1.5+1,pulse:Math.random()*Math.PI*2
      });
    }
  }
  function addPulse(fi,ti){pulses.push({from:fi,to:ti,t:0,speed:.006+Math.random()*.008})}

  function tick(){
    if(!running)return;
    var isLight=document.body.classList.contains('light-theme');
    var CDIST=isLight?CONNECT_DIST_LIGHT:CONNECT_DIST_DARK;
    var CDIST_SQ=CDIST*CDIST;
    var R=239,G=68,B=68;
    if(isLight){R=100;G=130;B=180}
    ctx.clearRect(0,0,W,H);

    // Single pairwise pass — physics forces AND edge draw in one O(n²) loop.
    // Previous version did this twice. Squared-dist gate avoids most sqrt calls.
    var edgeAlpha=isLight?.12:.3;
    var lineW=isLight?.4:.5;
    edges.length=0;
    var cxW=W/2,cyH=H/2;
    for(var i=0;i<nodes.length;i++){
      var n=nodes[i];
      n.pulse+=.008;
      for(var j=i+1;j<nodes.length;j++){
        var nj=nodes[j];
        var dx=nj.x-n.x,dy=nj.y-n.y;
        var d2=dx*dx+dy*dy;
        if(d2<CDIST_SQ&&d2>1){
          var d=Math.sqrt(d2);
          // Draw edge
          var alpha=(1-d/CDIST)*edgeAlpha;
          ctx.beginPath();
          ctx.moveTo(n.x,n.y);
          ctx.lineTo(nj.x,nj.y);
          ctx.strokeStyle='rgba('+R+','+G+','+B+','+alpha+')';
          ctx.lineWidth=lineW;ctx.stroke();
          edges.push([i,j]);
          // Repulsion force if close
          if(d2<3600){
            var force=.003*(60-d)/60;
            var nx=dx/d*force,ny=dy/d*force;
            n.vx-=nx;n.vy-=ny;
            nj.vx+=nx;nj.vy+=ny;
          }
        }
      }
      // Gentle pull toward center for drifters
      var dcx=cxW-n.x,dcy=cyH-n.y;
      var dc2=dcx*dcx+dcy*dcy;
      var minR=Math.min(W,H)*.4;
      if(dc2>minR*minR){
        var dc=Math.sqrt(dc2);
        n.vx+=dcx/dc*.0005;n.vy+=dcy/dc*.0005;
      }
      var spd2=n.vx*n.vx+n.vy*n.vy;
      if(spd2<MIN_SPEED*MIN_SPEED&&spd2>0){
        var spd=Math.sqrt(spd2);
        n.vx=n.vx/spd*MIN_SPEED;n.vy=n.vy/spd*MIN_SPEED;
      } else if(spd2>.04){
        var spd3=Math.sqrt(spd2);
        n.vx=n.vx/spd3*.2;n.vy=n.vy/spd3*.2;
      }
      n.x+=n.vx;n.y+=n.vy;
      var m=20;
      if(n.x<-m)n.x=W+m;else if(n.x>W+m)n.x=-m;
      if(n.y<-m)n.y=H+m;else if(n.y>H+m)n.y=-m;
    }

    var nodeAlpha=isLight?.2:.4;
    for(var k=0;k<nodes.length;k++){
      var nk=nodes[k];
      var glow=nodeAlpha+Math.sin(nk.pulse)*.1;
      var nr=isLight?nk.r*.9:nk.r;
      ctx.beginPath();
      ctx.arc(nk.x,nk.y,nr,0,Math.PI*2);
      ctx.fillStyle='rgba('+R+','+G+','+B+','+glow+')';
      ctx.fill();
    }
    for(var p=pulses.length-1;p>=0;p--){
      var pu=pulses[p];
      pu.t+=pu.speed;
      if(pu.t>=1){pulses.splice(p,1);continue}
      var a=nodes[pu.from],b=nodes[pu.to];
      var px=a.x+(b.x-a.x)*pu.t,py=a.y+(b.y-a.y)*pu.t;
      var pa=(isLight?.15:.3)*(1-Math.abs(pu.t-.5)*2);
      ctx.beginPath();
      ctx.arc(px,py,isLight?1.5:2,0,Math.PI*2);
      ctx.fillStyle='rgba('+R+','+G+','+B+','+pa+')';ctx.fill();
    }
    if(Math.random()<.04&&edges.length>0){
      var e=edges[(Math.random()*edges.length)|0];
      addPulse(e[0],e[1]);
    }
    requestAnimationFrame(tick);
  }
  if(reduced){init();return}
  init();
  window.addEventListener('resize',resize,{passive:true});
  document.addEventListener('visibilitychange',function(){
    running=!document.hidden;if(running)tick();
  });
  tick();
})();
