(function(root,factory){
  if(typeof module==='object'&&module.exports)module.exports=factory();
  else root.RoundCapture=factory();
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  function sideOf(value){
    var s=String(value||'').toLowerCase().trim();
    if(/^(pro|prop|proposition|gov|government|aff|affirmative|for)$/.test(s))return 'pro';
    if(/^(con|contra|opp|opposition|neg|negative|against)$/.test(s))return 'con';
    return null;
  }
  function ownSpeeches(speeches,side,conversation,labels){
    side=sideOf(side);if(!side)return [];
    return (speeches||[]).flatMap(function(s){
      if(!s||s.skipped||!s.text)return [];
      if(!s.open&&!conversation)return sideOf(s.side)===side&&s.text!=='(no transcript)'?[{code:s.code||'',text:s.text}]:[];
      // The container's side is the clock owner. Only explicit labels
      // identify whose words may enter that person's consented record.
      var active=null,lines=[],parts=[];
      function flush(){if(active===side&&lines.join('\n').trim())parts.push(lines.join('\n').trim());lines=[];}
      String(s.text).split('\n').forEach(function(line){
        var m=line.match(/^\s*[^\n]*?\(([^)]+)\):\s*(.*)$/);
        if(m){flush();active=sideOf(m[1]);if(!active&&labels){var label=m[1].trim();if(label===labels.pro&&label!==labels.con)active='pro';else if(label===labels.con&&label!==labels.pro)active='con';}lines=[m[2]];}else if(active)lines.push(line);
      });flush();
      return parts.length?[{code:s.code||'TALK',text:parts.join('\n\n')}]:[];
    });
  }
  return {ownSpeeches:ownSpeeches};
});
