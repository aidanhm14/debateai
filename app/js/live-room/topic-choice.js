(function(){
  window.DBLiveTopicChoice = { attach: function(context){
    var busy = false, selected = [], selectionId = '', revision = 0, latest = null, paintKey = '';
    var box = document.getElementById('topicStrikes');
    function uid(){ return context.state.user && context.state.user.uid; }
    function pending(){ var d = context.state.topicStrikes; return !!d && d.phase !== 'done' && d.phase !== 'cancelled'; }
    function name(id){ return id === uid() ? 'You' : id === context.state.proUid ? context.state.proName : context.state.conName; }
    function esc(s){ return context.escHtml(s); }
    function button(action, text, value){ return '<button type="button" data-topic-action="' + action + '"' + (value ? ' data-topic-value="' + esc(value) + '"' : '') + (busy ? ' disabled' : '') + '>' + text + '</button>'; }
    function paint(){
      if (!box) return;
      var d = context.state.topicStrikes;
      var key = JSON.stringify([d, uid(), context.isSpectator(), busy, selected, context.state.proName, context.state.conName]);
      if (key === paintKey) return;
      paintKey = key;
      box.hidden = !pending();
      if (box.hidden) return;
      var focused = box.contains(document.activeElement) ? document.activeElement : null;
      var focusPick = focused && focused.getAttribute('data-topic-pick');
      var focusAction = focused && focused.getAttribute('data-topic-action');
      var seated = !context.isSpectator() && [context.state.proUid, context.state.conUid].indexOf(uid()) !== -1;
      if (selectionId !== d.id){ selectionId = d.id; selected = []; }
      var title = '', copy = '', actions = '', cards = '';
      if (d.phase === 'offered'){
        title = 'Choose with strikes?';
        copy = 'Five topics. Strike two each in private, then reveal together. A coin flip gives one person the topic choice and the other the side choice.';
        if (seated && d.by !== uid()) actions = button('accept', 'Use strikes') + button('cancel', 'Not now');
        else copy += ' Waiting for ' + esc(name(d.by === context.state.proUid ? context.state.conUid : context.state.proUid)) + '.';
      } else if (d.phase === 'strike'){
        title = d.committed[uid()] ? 'Your strikes are locked' : 'Strike two topics';
        copy = 'Your choices stay private until both people have locked theirs.';
        cards = d.pool.map(function(p){
          var picked = selected.indexOf(p.id) !== -1;
          return '<button type="button" class="topic-strike-card' + (picked ? ' is-selected' : '') + '" data-topic-pick="' + esc(p.id) + '" aria-pressed="' + picked + '"' + (!seated || busy || d.committed[uid()] ? ' disabled' : '') + '>' + esc(p.text) + '</button>';
        }).join('');
        if (seated && !d.committed[uid()]) actions = '<button type="button" data-topic-action="strike"' + (busy || selected.length !== 2 ? ' disabled' : '') + '>Lock two strikes</button>';
        else copy += ' Waiting for the other person.';
      } else if (d.phase === 'motion'){
        title = d.motionUid === uid() ? 'Choose the topic' : esc(name(d.motionUid)) + ' chooses the topic';
        copy = esc(name(d.sideUid)) + ' will choose which side to argue.';
        cards = d.pool.filter(function(p){ return d.survivors.indexOf(p.id) !== -1; }).map(function(p){
          return seated && d.motionUid === uid() ? button('motion', esc(p.text), p.id) : '<p>' + esc(p.text) + '</p>';
        }).join('');
      } else if (d.phase === 'side'){
        title = d.sideUid === uid() ? 'Choose your side' : esc(name(d.sideUid)) + ' chooses a side';
        copy = esc((d.pool.filter(function(p){ return p.id === d.chosenId; })[0] || {}).text || '');
        if (seated && d.sideUid === uid()) actions = button('side', 'For', 'pro') + button('side', 'Against', 'con');
      }
      if (seated && !(d.phase === 'offered' && d.by !== uid())) actions += button('cancel', d.phase === 'offered' ? 'Withdraw' : 'Cancel strikes');
      box.innerHTML = '<h3>' + title + '</h3><p>' + copy + '</p><div class="topic-strike-cards">' + cards + '</div><div class="topic-strike-actions">' + actions + '</div>' + (busy ? '<p role="status">Saving choice…</p>' : '');
      if (focused){
        var next = focusPick ? box.querySelector('[data-topic-pick="' + CSS.escape(focusPick) + '"]') : focusAction ? box.querySelector('[data-topic-action="' + CSS.escape(focusAction) + '"]') : null;
        if (!next || next.disabled){ next = box.querySelector('h3'); next.tabIndex = -1; }
        next.focus({ preventScroll: true });
      }
    }
    async function send(action, value){
      if (busy || context.isSpectator() || !context.state.user) return;
      var user = context.state.user, room = context.state.room, d = context.state.topicStrikes;
      var body = { room: room, action: action, revision: revision, id: d && d.id };
      if (action === 'strike') body.ids = selected.slice();
      if (action === 'motion') body.motionId = value;
      if (action === 'side') body.side = value;
      busy = true; paint();
      try {
        var token = await user.getIdToken();
        if (user !== context.state.user || room !== context.state.room) return;
        var response = await fetch('/api/room-topic-strikes', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token }, body: JSON.stringify(body) });
        var data = await response.json();
        if (user !== context.state.user || room !== context.state.room) return;
        if (!response.ok) throw new Error(data.error || 'Could not save that choice. Try again.');
        context.onRoundSnapshot(Object.assign({}, context.state.lastRoundDoc || {}, data.round));
      } catch (error){
        context.toast(error.message || 'Could not save that choice. Try again.');
        var ref = context.getRoundDocRef();
        if (ref) ref.get({ source: 'server' }).then(function(s){ if (s.exists && context.state.room === room) context.onRoundSnapshot(s.data()); }).catch(function(){});
      } finally { busy = false; paint(); }
    }
    if (box) box.addEventListener('click', function(event){
      var pick = event.target.closest('[data-topic-pick]');
      if (pick && !pick.disabled){
        var id = pick.getAttribute('data-topic-pick'), index = selected.indexOf(id);
        if (index >= 0) selected.splice(index, 1); else if (selected.length < 2) selected.push(id);
        paint(); return;
      }
      var action = event.target.closest('[data-topic-action]');
      if (action && !action.disabled) send(action.getAttribute('data-topic-action'), action.getAttribute('data-topic-value'));
    });
    window.__lrTopicStrikesPending = pending;
    window.__lrInviteStrikes = function(){ send('invite'); };
    window.__lrPaintTopicChoice = paint;
    window.__lrMergeTopicChoice = function(d){
      var next = Number(d.topicStrikesRevision) || 0;
      if (next < revision && latest) d = Object.assign({}, d, latest);
      else {
        revision = next; latest = {};
        ['topicStrikes', 'topicStrikesRevision', 'motion', 'background', 'proUid', 'conUid', 'proName', 'conName', 'judgePicks', 'motionProposal', 'motionProposalAccepts', 'sideSwap'].forEach(function(k){ if (Object.prototype.hasOwnProperty.call(d, k)) latest[k] = d[k]; });
      }
      context.state.topicStrikes = d.topicStrikes || null;
      return d;
    };
  } };
})();
