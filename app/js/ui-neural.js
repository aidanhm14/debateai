/* Neural constellation background — shared across all pages.
   Only animates in dark / crimson themes. Looks for #uiNeuralCanvas. */
(function(){
  var c=document.getElementById('uiNeuralCanvas');
  if(!c) return;
  var ctx=c.getContext('2d');
  var nodes=[],pulses=[];
  var W,H,dpr=window.devicePixelRatio||1;
  var NODE_COUNT=40,CONNECT_DIST_DARK=150,CONNECT_DIST_LIGHT=180;
  var MIN_SPEED=.04;

  function resize(){
    W=window.innerWidth;H=window.innerHeight;
    c.width=W*dpr;c.height=H*dpr;
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
    var isLight=document.body.classList.contains('light-theme');
    var isCrimson=document.body.classList.contains('crimson-theme');
    ctx.clearRect(0,0,W,H);
    var R=239,G=68,B=68;
    if(isLight){R=100;G=130;B=180}
    var CDIST=isLight?CONNECT_DIST_LIGHT:CONNECT_DIST_DARK;

    for(var i=0;i<nodes.length;i++){
      var n=nodes[i];
      n.pulse+=.008;
      for(var j=i+1;j<nodes.length;j++){
        var dx=nodes[j].x-n.x,dy=nodes[j].y-n.y;
        var d2=dx*dx+dy*dy;
        if(d2<3600&&d2>1){
          var d=Math.sqrt(d2);
          var force=.003*(60-d)/60;
          n.vx-=dx/d*force;n.vy-=dy/d*force;
          nodes[j].vx+=dx/d*force;nodes[j].vy+=dy/d*force;
        }
      }
      var cx=W/2,cy=H/2;
      var dcx=cx-n.x,dcy=cy-n.y;
      var dc=Math.sqrt(dcx*dcx+dcy*dcy);
      if(dc>Math.min(W,H)*.4){n.vx+=dcx/dc*.0005;n.vy+=dcy/dc*.0005}
      var spd=Math.sqrt(n.vx*n.vx+n.vy*n.vy);
      if(spd<MIN_SPEED&&spd>0){n.vx=n.vx/spd*MIN_SPEED;n.vy=n.vy/spd*MIN_SPEED}
      if(spd>.2){n.vx=n.vx/spd*.2;n.vy=n.vy/spd*.2}
      n.x+=n.vx;n.y+=n.vy;
      var margin=20;
      if(n.x<-margin)n.x=W+margin;
      if(n.x>W+margin)n.x=-margin;
      if(n.y<-margin)n.y=H+margin;
      if(n.y>H+margin)n.y=-margin;
    }

    var edgeAlpha=isLight?.12:.3;
    var lineW=isLight?.4:.5;
    var edges=[];
    for(var i=0;i<nodes.length;i++){
      for(var j=i+1;j<nodes.length;j++){
        var dx=nodes[i].x-nodes[j].x,dy=nodes[i].y-nodes[j].y;
        var d=Math.sqrt(dx*dx+dy*dy);
        if(d<CDIST){
          var alpha=(1-d/CDIST)*edgeAlpha;
          ctx.beginPath();
          ctx.moveTo(nodes[i].x,nodes[i].y);
          ctx.lineTo(nodes[j].x,nodes[j].y);
          ctx.strokeStyle='rgba('+R+','+G+','+B+','+alpha+')';
          ctx.lineWidth=lineW;ctx.stroke();
          edges.push([i,j]);
        }
      }
    }
    var nodeAlpha=isLight?.2:.4;
    for(var i=0;i<nodes.length;i++){
      var n=nodes[i];
      var glow=nodeAlpha+Math.sin(n.pulse)*.1;
      var nr=isLight?n.r*.9:n.r;
      ctx.beginPath();
      ctx.arc(n.x,n.y,nr,0,Math.PI*2);
      ctx.fillStyle='rgba('+R+','+G+','+B+','+glow+')';
      ctx.fill();
    }
    for(var i=pulses.length-1;i>=0;i--){
      var p=pulses[i];
      p.t+=p.speed;
      if(p.t>=1){pulses.splice(i,1);continue}
      var a=nodes[p.from],b=nodes[p.to];
      var px=a.x+(b.x-a.x)*p.t,py=a.y+(b.y-a.y)*p.t;
      var pa=(isLight?.15:.3)*(1-Math.abs(p.t-.5)*2);
      ctx.beginPath();
      ctx.arc(px,py,isLight?1.5:2,0,Math.PI*2);
      ctx.fillStyle='rgba('+R+','+G+','+B+','+pa+')';ctx.fill();
    }
    if(Math.random()<.04&&edges.length>0){
      var e=edges[Math.floor(Math.random()*edges.length)];
      addPulse(e[0],e[1]);
    }
    requestAnimationFrame(tick);
  }
  init();
  window.addEventListener('resize',resize);
  tick();
})();
