(function(){
  'use strict';
  var NS='http://www.w3.org/2000/svg';
  function svgNode(tag,attrs,text){var n=document.createElementNS(NS,tag);Object.keys(attrs||{}).forEach(function(k){n.setAttribute(k,attrs[k]);});if(text!=null)n.textContent=text;return n;}
  function poolChart(host,market,options){
    if(!host)return;options=options||{};host.replaceChildren();
    var total=Number(market.poolPro)+Number(market.poolCon);
    if(!total){var empty=document.createElement('p');empty.className='pool-chart-empty';empty.textContent='The graph starts with the first bet.';host.appendChild(empty);return;}
    var history=(market.priceHistory||[]).filter(function(p){return Number.isFinite(p.at)&&Number.isFinite(p.proPct);}).slice(-60);
    var latest=Math.round(Number(market.poolPro)/total*100);
    if(!history.length)history=[{at:1,proPct:latest}];
    // The opening 50/50 entry is a placeholder, not a token-backed observation.
    if(!options.illustration&&history.length>1&&history.length===Number(market.betCount)+1)history=history.slice(1);
    var start=history[0].at,end=history[history.length-1].at,span=Math.max(1,end-start);
    var W=600,H=232,left=35,right=561,top=20,bottom=187;
    function x(p){return history.length===1?(left+right)/2:left+(p.at-start)/span*(right-left);}
    function y(v){return bottom-Math.max(0,Math.min(100,v))/100*(bottom-top);}
    var svg=svgNode('svg',{viewBox:'0 0 '+W+' '+H,role:'img','aria-label':(options.illustration?'Illustrative':'Recorded')+' play-token pool share. Pro '+latest+' percent, Con '+(100-latest)+' percent. This is not a win probability.'});
    [0,50,100].forEach(function(v){svg.append(svgNode('line',{x1:left,y1:y(v),x2:right,y2:y(v),class:'pool-grid'}),svgNode('text',{x:0,y:y(v)+4,class:'pool-axis'},v+'%'));});
    ['pro','con'].forEach(function(side){
      var pts=history.map(function(p){return [x(p),y(side==='pro'?p.proPct:100-p.proPct)];});
      if(side==='pro'&&pts.length>1){var area='M '+pts[0][0]+' '+bottom+' L '+pts.map(function(p){return p.join(' ');}).join(' L ')+' L '+pts[pts.length-1][0]+' '+bottom+' Z';svg.appendChild(svgNode('path',{d:area,class:'pool-area'}));}
      svg.appendChild(svgNode('polyline',{points:pts.map(function(p){return p.join(',');}).join(' '),class:'pool-line pool-line-'+side}));
      var last=pts[pts.length-1];svg.append(svgNode('circle',{cx:last[0],cy:last[1],r:4,class:'pool-dot pool-dot-'+side}));
    });
    svg.append(svgNode('text',{x:left,y:220,class:'pool-axis'},options.illustration?'Opening':'First bet'),svgNode('text',{x:right,y:220,'text-anchor':'end',class:'pool-axis'},options.endLabel||(market.status==='open'?'Latest bet':'Final pool')));
    host.appendChild(svg);
  }
  window.DBBetCharts={pool:poolChart};
  var demo=document.getElementById('conviction-chart');
  if(demo){
    var values=[50,46,48,41,39,42,38,40,49,45,53,59,56,63,68,65,72,68];
    var copy=['A close opening. Both sides have a case.','A strong response. More tokens follow Pro.','Betting closes. The judge still makes the call.'];
    var stops=[6,12,18];
    function drawDemo(step){
      var points=values.slice(0,stops[step]),pct=points[points.length-1];
      poolChart(demo,{poolPro:pct,poolCon:100-pct,status:'open',priceHistory:points.map(function(v,i){return {at:i+1,proPct:v};})},{illustration:true,endLabel:['Opening','Response','Betting closes'][step]});
      document.getElementById('conviction-pro').textContent=pct+'%';document.getElementById('conviction-con').textContent=(100-pct)+'%';document.getElementById('conviction-caption').textContent=copy[step];
      document.querySelectorAll('[data-chart-step]').forEach(function(b){b.setAttribute('aria-pressed',String(Number(b.dataset.chartStep)===step));});
    }
    document.querySelectorAll('[data-chart-step]').forEach(function(b){b.addEventListener('click',function(){drawDemo(Number(b.dataset.chartStep));});});drawDemo(2);
  }
  var share=document.getElementById('example-share');
  if(share){
    function drawReturn(){var pct=Number(share.value),payout=Math.floor(5000/pct);document.getElementById('share-value').textContent=pct+'%';document.getElementById('example-payout').textContent=payout;document.getElementById('example-pool-you').style.width=pct+'%';document.getElementById('example-pool-other').style.width=(100-pct)+'%';document.getElementById('example-return-bar').style.width=payout/500*100+'%';document.getElementById('example-pool-label').textContent=pct*10+' on your side · '+(100-pct)*10+' on the other';}
    share.addEventListener('input',drawReturn);drawReturn();
  }
})();
