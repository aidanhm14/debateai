(function(){
  'use strict';
  function esc(value){
    return String(value || '').replace(/[&<>"']/g, function(c){
      return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];
    });
  }

  function people(uid, active, threads){
    var seen = Object.create(null), result = [];
    [active].concat((threads || []).map(function(t){ return t.data; })).filter(Boolean).forEach(function(t){
      (t.participants || []).forEach(function(id){
        if (!id || id === uid || seen[id]) return;
        seen[id] = true;
        var info = (t.participantInfo || {})[id] || {};
        result.push({ uid:id, name:info.name || 'Someone', photo:info.photo || '' });
      });
    });
    return result;
  }

  function open(opts){
    var user = opts.user;
    if (!user || user.isAnonymous){
      if (window.openAuthModal) window.openAuthModal('signin');
      return;
    }
    if (document.getElementById('chatChallenge')) return;
    var peers = people(user.uid, opts.active, opts.threads);
    var dialog = document.createElement('dialog');
    dialog.id = 'chatChallenge';
    dialog.className = 'chat-challenge';
    dialog.setAttribute('aria-labelledby', 'chatChallengeTitle');
    dialog.innerHTML = '<form>' +
      '<h2 id="chatChallengeTitle">Challenge to debate</h2>' +
      (peers.length ?
        '<p>Pick someone from your chats and a question you want to argue.</p>' +
        '<label for="challengePerson">Send to</label><select id="challengePerson" required>' +
        '<option value="">Choose someone</option>' + peers.map(function(p){
          var selected = opts.active && !opts.active.isGroup && (opts.active.participants || []).length === 2 && opts.active.participants.indexOf(p.uid) >= 0;
          return '<option value="' + esc(p.uid) + '"' + (selected ? ' selected' : '') + '>' + esc(p.name) + '</option>';
        }).join('') + '</select>' +
        '<label for="challengeQuestion">What do you want to debate?</label>' +
        '<textarea id="challengeQuestion" required minlength="8" maxlength="300" rows="3" placeholder="Cities should make public transit free."></textarea>' +
        '<label for="challengeSide">Your side</label><select id="challengeSide"><option value="a">For</option><option value="b">Against</option></select>' +
        '<p class="chat-challenge-note">They get a link in a direct message. The challenge also appears on the public board. Only the person you choose can accept.</p>' +
        '<p class="chat-challenge-error" role="alert" hidden></p>' +
        '<div class="chat-challenge-actions"><button type="submit" class="chat-challenge-send">Send challenge</button><button type="button" data-close>Cancel</button></div>' :
        '<p>No chat contacts yet. Start a conversation with someone, then challenge them here.</p>' +
        '<div class="chat-challenge-actions"><a href="/friends">Find someone</a><button type="button" data-close>Close</button></div>') +
      '</form>';
    document.body.appendChild(dialog);
    var busy = false, challenge = null, dm = null, failedId = '', peer = null, thread = null;
    var submit = dialog.querySelector('[type="submit"]');
    var close = dialog.querySelector('[data-close]');
    function dismiss(){ if (!busy) dialog.close(); }
    close.onclick = dismiss;
    dialog.addEventListener('cancel', function(e){ if (busy) e.preventDefault(); });
    dialog.addEventListener('click', function(e){
      var r = dialog.getBoundingClientRect();
      if (e.target === dialog && (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom)) dismiss();
    });
    dialog.addEventListener('close', function(){ if (dm) dm.close(); dialog.remove(); });
    dialog.querySelector('form').onsubmit = async function(e){
      e.preventDefault();
      if (busy || !peers.length) return;
      var error = dialog.querySelector('[role="alert"]');
      var controls = dialog.querySelectorAll('select,textarea');
      busy = true; submit.disabled = true; close.disabled = true; error.hidden = true;
      submit.textContent = challenge ? 'Sending link...' : 'Sending challenge...';
      try {
        var current = firebase.auth().currentUser;
        if (!current || current.uid !== user.uid || current.isAnonymous) throw new Error('Sign in to your account again before sending.');
        if (!challenge){
          peer = peers.filter(function(p){ return p.uid === dialog.querySelector('#challengePerson').value; })[0];
          if (!peer) throw new Error('Choose someone from your chats.');
          var claim = dialog.querySelector('#challengeQuestion').value.trim();
          if (claim.length < 8) throw new Error('Write a question of at least 8 characters.');
          controls.forEach(function(c){ c.disabled = true; });
          var response = await fetch('/api/challenge', {
            method:'POST', headers:{ 'Content-Type':'application/json', Authorization:'Bearer ' + await user.getIdToken() },
            body:JSON.stringify({ action:'create', challengedUid:peer.uid, claim:claim,
              side:dialog.querySelector('#challengeSide').value, sideA:'For', sideB:'Against', format:'quick', mode:'live' })
          });
          var data = await response.json();
          if (!response.ok) throw new Error(data.error || 'Could not create this challenge. Try again.');
          challenge = data.challenge;
        }
        if (!dm){
          var id = [user.uid, peer.uid].sort().join('_');
          var known = (opts.threads || []).filter(function(t){ return t.id === id; })[0];
          var info = Object.assign({}, known && known.data.participantInfo || {});
          info[peer.uid] = { name:peer.name, photo:peer.photo };
          thread = { id:id, participants:[user.uid, peer.uid], participantInfo:info,
            lastMessage:known && known.data.lastMessage || '' };
          dm = DBDM.open({ db:opts.db, uid:user.uid, threadId:id, thread:thread,
            senderName:opts.senderName, senderPhoto:function(){ return user.photoURL || ''; },
            onMessages:function(view){
              var failed = (view.messages || []).filter(function(m){ return m.failed; })[0];
              if (failed) failedId = failed.id;
            }
          });
        }
        // Keep the created challenge and failed message ID on retry. A failed
        // DM must not create a second public challenge or a second message.
        var text = 'Challenge to debate: ' + challenge.claim + '\nI\'ll argue ' +
          (challenge.accepted[0].side === 'b' ? 'against' : 'for') + '. Want to take the other side?\n' +
          'View and accept: https://itsdebatable.com/c/' + encodeURIComponent(challenge.slug);
        var sent = failedId ? await dm.retry(failedId) : await dm.send(text, { preview:'Debate challenge: ' + challenge.claim });
        thread.lastMessage = sent && sent.preview || 'Debate challenge: ' + challenge.claim;
        if (window.gtag) window.gtag('event', 'challenge_create', { source:opts.source, directed:1, mode:'live' });
        busy = false; dialog.close();
        if (opts.onSent) opts.onSent(thread.id, thread);
      } catch(err){
        error.textContent = (challenge ? 'Challenge created, but the message did not send. Retry to send the same link. ' : '') + (err.message || 'Please try again.');
        error.hidden = false;
        busy = false; submit.disabled = false; close.disabled = false;
        submit.textContent = challenge ? 'Retry sending link' : 'Send challenge';
        if (!challenge) controls.forEach(function(c){ c.disabled = false; });
      }
    };
    dialog.showModal();
    var focus = dialog.querySelector('#challengePerson');
    if (focus && focus.value) focus = dialog.querySelector('#challengeQuestion');
    if (focus) focus.focus();
  }
  window.DBChatChallenge = { open:open, people:people };
})();
