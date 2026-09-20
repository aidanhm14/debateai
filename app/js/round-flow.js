(function(root){
  'use strict';
  var current = null, dialog = null, signature = '', storageKey = '', personal = {}, saved = true;
  function esc(value){ return String(value == null ? '' : value).replace(/[&<>"']/g, function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]; }); }
  function side(value){ return value === 'pro' || value === 'gov' ? 'pro' : 'con'; }
  function label(value){ return side(value) === 'pro' ? 'For' : 'Against'; }
  function name(data, value){ return data.names && data.names[side(value)] || label(value); }
  function points(note){ return (note && Array.isArray(note.points) ? note.points : []).filter(function(p){ return p && p.note; }).map(function(p){ return {tag:String(p.tag || 'Argument'),note:String(p.note)}; }); }
  function columns(data){
    var notes = data.notes || [], log = data.log || [], pending = data.pending || {};
    if (data.open){
      // Excerpts use server-synced indices >= 1000. Final per-side summaries
      // use 0/1; they are summaries, never fabricated extra speaking turns.
      var excerpts = notes.filter(function(n){ return n && n.idx >= 1000; }).sort(function(a,b){ return (a.atMs || 0)-(b.atMs || 0) || a.idx-b.idx; });
      var rows = excerpts.map(function(n,i){ return {
        key:'conversation-'+n.idx, side:side(n.side), who:n.speakerName || name(data,n.side),
        title:'Excerpt '+(i+1),
        status:'Shared notes', points:points(n), transcript:'', active:false
      }; });
      ['pro','con'].forEach(function(s){
        var summary=notes.filter(function(n){return n && n.idx < 1000 && side(n.side)===s;}).slice(-1)[0];
        rows.push({key:'conversation-'+s,side:s,who:name(data,s),title:'Round notes',status:summary?'Shared summary':data.finished?'No shared summary':'Shared summary appears when the round ends',points:points(summary),transcript:'',active:false});
      });
      return rows;
    }
    return (data.speeches || []).map(function(sp,i){
      var note = notes.filter(function(n){ return n && Number(n.idx) === i && side(n.side) === side(sp.side); }).slice(-1)[0];
      var entry = log.filter(function(row,j){ return row && (row.idx == null ? j : Number(row.idx)) === i && side(row.side) === side(sp.side); })[0];
      var active = !data.finished && data.index === i;
      var transcript = entry && entry.text || '';
      if (/^\((?:skipped|no transcript)\)$/.test(transcript)) transcript = '';
      var status = note ? 'Shared notes' : pending[i] === 'failed' ? 'Notes unavailable' : pending[i] ? 'Writing notes…' : entry && entry.skipped ? 'Speech skipped' : entry || data.finished || i < data.index ? 'No shared notes for this speech' : active ? (data.running ? 'Speaking now' : 'Up next') : 'Upcoming';
      return {key:'speech-'+i,side:side(sp.side),who:note && note.speakerName || sp.speakerName || name(data,sp.side),title:'Speech '+(i+1),stage:sp.name || '',status:status,points:points(note),transcript:transcript,active:active};
    });
  }
  function toHtml(data, ownNotes){
    return columns(data).map(function(col){
      var mine = data.mySide && side(data.mySide) === col.side;
      return '<section class="rf-column" data-side="'+col.side+'" data-key="'+esc(col.key)+'"'+(col.active?' aria-current="step"':'')+'>'+
        '<header class="rf-column-head"><div class="rf-step">'+esc(col.title)+'<span class="rf-side">'+label(col.side)+'</span></div>'+
        '<h3>'+esc(col.who)+(mine?' <small>(you)</small>':'')+'</h3>'+(col.stage?'<p class="rf-stage">'+esc(col.stage)+'</p>':'')+'</header>'+
        '<p class="rf-status">'+esc(col.status)+'</p><div class="rf-arguments">'+(col.points.length?col.points.map(function(p,i){
          return '<article class="rf-argument"><span class="rf-point-number">'+(i+1)+'</span><div><h4>'+esc(p.tag)+'</h4><p>'+esc(p.note)+'</p></div></article>';
        }).join(''):'<p class="rf-empty">'+(col.status==='Upcoming' || col.active?'Arguments appear after this speech.':'Use your notes below to keep track.')+'</p>')+'</div>'+
        (col.transcript?'<details class="rf-transcript"><summary>Read speech transcript</summary><p>'+esc(col.transcript)+'</p></details>':'')+
        '<label class="rf-personal">Your notes <span>Private</span><textarea class="rr-mask" data-clarity-mask="true" maxlength="3000" data-note="'+esc(col.key)+'" aria-label="Your private notes for '+esc(col.title)+' by '+esc(col.who)+', '+label(col.side)+'" placeholder="Note a claim, question, or reply…">'+esc(ownNotes && ownNotes[col.key] || '')+'</textarea></label></section>';
    }).join('');
  }
  function keyFor(data){ return data.room ? 'db-round-flow:'+encodeURIComponent(data.owner || 'guest')+':'+encodeURIComponent(data.room)+':'+(data.open?'conversation':'timed') : ''; }
  function readPersonal(key){
    try { var value = key && JSON.parse(root.localStorage.getItem(key) || '{}'); return value && typeof value === 'object' && !Array.isArray(value) ? value : {}; }
    catch(e){ return {}; }
  }
  function paint(){
    if (!dialog || !dialog.open || !current) return;
    var next = JSON.stringify(current);
    if (next === signature) return;
    signature = next;
    var board = dialog.querySelector('.rf-board'), left = board.scrollLeft, top = board.scrollTop;
    var focused = document.activeElement, noteKey = focused && focused.getAttribute('data-note');
    var start = noteKey ? focused.selectionStart : 0, end = noteKey ? focused.selectionEnd : 0;
    var expanded = Array.from(board.querySelectorAll('.rf-transcript[open]')).map(function(el){return el.closest('[data-key]').dataset.key;});
    dialog.querySelector('.rf-motion').textContent = current.motion || 'This round';
    dialog.querySelector('.rf-help').textContent = current.open ? 'Conversation excerpts in the order notes arrived. Both sides see the same arguments.' : 'Follow each speech from left to right. Both sides see the same arguments.';
    dialog.querySelector('.rf-people').innerHTML = ['pro','con'].map(function(s){return '<span data-side="'+s+'"><b>'+label(s)+'</b> '+esc(name(current,s))+(current.mySide && side(current.mySide)===s?' (you)':'')+'</span>';}).join('');
    board.innerHTML = toHtml(current,personal);
    board.querySelectorAll('[data-key]').forEach(function(el){
      var details = el.querySelector('details'); if(details && expanded.indexOf(el.dataset.key)>=0) details.open=true;
      var field = el.querySelector('textarea'); if(field && field.dataset.note===noteKey){field.focus({preventScroll:true});field.setSelectionRange(start,end);}
    });
    board.scrollLeft=left; board.scrollTop=top;
    dialog.querySelector('.rf-storage').textContent = saved && storageKey ? 'Your notes are saved on this browser. Only you can see them. They are not sent to the judge.' : 'Your notes stay in this tab. They are not sent to the judge.';
  }
  function ensureDialog(){
    if (dialog) return;
    dialog=document.createElement('dialog');dialog.className='round-flow-dialog';dialog.setAttribute('aria-labelledby','roundFlowTitle');
    dialog.innerHTML='<div class="rf-shell"><header class="rf-header"><div><p class="rf-eyebrow">Speech by speech</p><h2 id="roundFlowTitle">Round flow</h2></div><button type="button" class="rf-close" aria-label="Close round flow" autofocus>Close <span aria-hidden="true">×</span></button></header><p class="rf-motion"></p><div class="rf-people"></div><p class="rf-help"></p><div class="rf-board" role="region" aria-label="Speech flow. Scroll horizontally to follow the round." tabindex="0"></div><footer class="rf-footer"><span class="rf-storage" role="status"></span><span>AI summaries may miss details. Check the transcript.</span></footer></div>';
    document.body.appendChild(dialog);
    dialog.querySelector('.rf-close').addEventListener('click',function(){dialog.close();});
    dialog.addEventListener('click',function(event){if(event.target===dialog)dialog.close();});
    dialog.addEventListener('input',function(event){
      var field=event.target, key=field.getAttribute('data-note');if(!key)return;
      personal[key]=field.value;
      saved=false;
      try{if(storageKey){root.localStorage.setItem(storageKey,JSON.stringify(personal));saved=true;}}catch(e){}
      var status=dialog.querySelector('.rf-storage');
      status.textContent=saved?'Your notes are saved on this browser. Only you can see them. They are not sent to the judge.':'Your notes stay in this tab. They could not be saved on this browser.';
    });
  }
  root.DBRoundFlow={columns:columns,toHtml:toHtml,keyFor:keyFor,
    update:function(data){
      var nextKey=keyFor(data);
      if(nextKey!==storageKey){storageKey=nextKey;personal=readPersonal(storageKey);saved=true;signature='';}
      current=data;paint();
    },
    open:function(){if(!current)return;ensureDialog();signature='';if(!dialog.open)dialog.showModal();paint();}
  };
})(typeof window !== 'undefined' ? window : globalThis);
