# Background edge shapes

Removed 2026-09-06 at Aidan’s request: use the original moving constellation everywhere, with more even spacing. This static rose perimeter introduced a second shape style. Previously rendered into an offscreen canvas and composited before the moving web. Restoring this requires a new design decision.

```javascript
  // Approved rose edge treatment. Cache the geometry once per size/theme:
  // it stays in the exposed margins instead of drifting behind the cards.
  function paintDepth(light){
    depth.width=c.width;depth.height=c.height;
    depthCtx.setTransform(dpr,0,0,dpr,0,0);
    var ink=light?'169,92,100':'239,105,123';
    [[0,H*.3,W*.38],[W,H*.73,W*.36]].forEach(function(p){
      var glow=depthCtx.createRadialGradient(p[0],p[1],0,p[0],p[1],p[2]);
      glow.addColorStop(0,'rgba('+(light?'222,164,166':'163,40,70')+','+(light?.19:.14)+')');
      glow.addColorStop(1,'rgba('+ink+',0)');
      depthCtx.fillStyle=glow;depthCtx.fillRect(0,0,W,H);
    });
    var sx=W/1440,sy=H/1000;
    var paths=[[[0,65],[78,112],[153,45],[203,158],[105,238],[17,198],[0,315]],[[78,112],[105,238],[44,364],[166,442],[214,320],[105,238]],[[0,506],[85,566],[171,520],[205,670],[125,750],[30,668],[0,796]],[[85,566],[30,668],[125,750],[68,885],[170,974],[0,934]]];
    depthCtx.beginPath();
    [false,true].forEach(function(right){
      paths.forEach(function(points){points.forEach(function(p,i){
        var x=(right?1440-p[0]:p[0])*sx,y=p[1]*sy;
        if(i)depthCtx.lineTo(x,y);else depthCtx.moveTo(x,y);
      });});
    });
    depthCtx.strokeStyle='rgba('+ink+','+(light?.34:.38)+')';
    depthCtx.lineWidth=isMobile?.85:1.3;depthCtx.stroke();
    depthCtx.beginPath();
    [[32,475,80],[1438,850,110]].forEach(function(p){
      depthCtx.moveTo((p[0]+p[2])*sx,p[1]*sy);
      depthCtx.ellipse(p[0]*sx,p[1]*sy,p[2]*sx,p[2]*sy,0,0,TWO_PI);
    });
    depthCtx.stroke();depthCtx.beginPath();
    [false,true].forEach(function(right){
      [[78,112],[153,45],[105,238],[44,364],[166,442],[85,566],[30,668],[125,750],[68,885]].forEach(function(p){
        var x=(right?1440-p[0]:p[0])*sx,y=p[1]*sy,r=isMobile?1.8:3.5;
        depthCtx.moveTo(x+r,y);depthCtx.arc(x,y,r,0,TWO_PI);
      });
    });
    depthCtx.fillStyle='rgba('+(light?'171,61,74':'250,137,151')+',.52)';depthCtx.fill();
  }

```
