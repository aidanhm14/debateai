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
    if (!opts.ageReady){
      ensureAge().then(function(){ open(Object.assign({}, opts, { ageReady:true })); })
        .catch(function(err){ window.alert(err.message); });
      return;
    }
    var peers = people(user.uid, opts.active, opts.threads);
    var dialog = document.createElement('dialog');
    dialog.id = 'chatChallenge';
    dialog.className = 'chat-challenge';
    dialog.setAttribute('aria-labelledby', 'chatChallengeTitle');
    dialog.innerHTML = '<form>' +
      '<h2 id="chatChallengeTitle">Challenge to debate</h2>' +
      (peers.length ?
        '<p>Choose a question. They can accept and join you from this chat.</p>' +
        '<label for="challengePerson">Send to</label><select id="challengePerson" required>' +
        '<option value="">Choose someone</option>' + peers.map(function(p){
          var selected = opts.active && !opts.active.isGroup && (opts.active.participants || []).length === 2 && opts.active.participants.indexOf(p.uid) >= 0;
          return '<option value="' + esc(p.uid) + '"' + (selected ? ' selected' : '') + '>' + esc(p.name) + '</option>';
        }).join('') + '</select>' +
        '<label for="challengeQuestion">What do you want to debate?</label>' +
        '<textarea id="challengeQuestion" required minlength="8" maxlength="300" rows="3" placeholder="Cities should make public transit free."></textarea>' +
        '<label for="challengeSide">Your side</label><select id="challengeSide"><option value="a">For</option><option value="b">Against</option></select>' +
        '<p class="chat-challenge-note">Only this person can accept. You both get a button for the same live video room. The challenge also appears on the public board.</p>' +
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
  var ageScript = null;
  function ensureAge(){
    if (!ageScript) ageScript = new Promise(function(resolve, reject){
      if (window.daAskAgeBand) return resolve();
      var script = document.createElement('script'); script.src = '/js/age-gate.js';
      script.onload = resolve;
      script.onerror = function(){ ageScript = null; reject(new Error('Could not load the age check. Try again.')); };
      document.head.appendChild(script);
    });
    return ageScript.then(function(){ return new Promise(function(resolve, reject){
      window.daAskAgeBand(function(band){
        window.daRecordAgeBand(band, function(saved){
          if (saved) resolve(); else reject(new Error('Could not confirm your age. Try again.'));
        });
      });
    }); });
  }

  function challengeSlug(text){
    var matches = String(text || '').match(/https:\/\/itsdebatable\.com\/c\/([a-z0-9-]+)(?=[\s/?#).,;:!?]|$)/i);
    return matches ? matches[1] : '';
  }

  async function post(action, c, user){
    var response = await fetch('/api/challenge', {
      method:'POST', headers:{'Content-Type':'application/json', Authorization:'Bearer ' + await user.getIdToken()},
      body:JSON.stringify({ action:action, id:c.id })
    });
    var data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Could not update the challenge. Try again.');
    return data;
  }

  async function enter(c, user, accept){
    if (!user || user.isAnonymous) throw new Error('Sign in before joining this debate.');
    await ensureAge();
    if (accept) await post('accept', c, user);
    return post('join', c, user);
  }

  // One live card for the current conversation. Old plain-text challenge
  // links work too; the API, not the message text, supplies all actions.
  function mount(opts){
    var host = opts.host, candidate = null, current = null, stopped = false, busy = false, loading = false, revision = 0, error = '', lastPaint = '';
    function paint(){
      if (stopped) return;
      host.hidden = !candidate;
      if (!candidate) { host.innerHTML = ''; lastPaint = ''; return; }
      if (!current){
        lastPaint = '';
        host.innerHTML = '<p role="status">' + esc(error || 'Loading debate invite...') + '</p>';
        if (error){
          var retry = document.createElement('button'); retry.type = 'button'; retry.textContent = 'Retry';
          retry.onclick = function(){ error = ''; refresh(); }; host.appendChild(retry);
        }
        return;
      }
      var mine = current.creator.uid === opts.user.uid;
      var open = current.status === 'open';
      var ready = ['accepted', 'live'].indexOf(current.status) >= 0;
      var peer = mine ? current.challengedName || opts.peerName || 'the other person' : current.creator.name || opts.peerName || 'the other person';
      var own = (current.accepted || []).filter(function(p){return p.uid === opts.user.uid;})[0];
      var side = own ? own.side : ((current.accepted || [])[0] || {}).side === 'a' ? 'b' : 'a';
      var note = open ? (mine ? 'Waiting for ' + peer + ' to accept.' : peer + ' invited you to a live video debate.')
        : ready ? 'Accepted. Join the same room when you are ready.' : 'This challenge is ' + current.status + '.';
      var markup = '<div class="chat-invite-copy"><span class="chat-invite-label">Live debate</span>' +
        '<strong>' + esc(current.claim) + '</strong><p role="status">' + esc(note) + '</p>' +
        ((open || ready) ? '<small>Your side: ' + esc((current.sides || {})[side] || (side === 'a' ? 'For' : 'Against')) + '</small>' : '') + '</div>' +
        '<div class="chat-invite-actions">' +
        (ready || (open && !mine) ? '<button type="button" data-enter>' + (busy ? 'Opening debate...' : ready ? 'Join debate' : 'Accept and join') + '</button>' : '') +
        (open && mine ? '<button type="button" data-cancel>Cancel invite</button>' : '') +
        '<a href="/c/' + encodeURIComponent(current.slug) + '">Details</a></div>' +
        (error ? '<p class="chat-invite-error" role="alert">' + esc(error) + '</p>' : '');
      // Unchanged refreshes preserve keyboard focus and in-progress clicks.
      if (markup === lastPaint) return;
      host.innerHTML = markup; lastPaint = markup;
      var button = host.querySelector('[data-enter]');
      if (button){ button.disabled = busy; button.onclick = async function(){
        if (busy) return;
        var version = revision, c = current;
        busy = true; error = ''; paint();
        try {
          var result = await enter(c, opts.user, c.status === 'open');
          if (!stopped && version === revision) window.location.href = result.url;
        } catch(err){ if (!stopped && version === revision) error = err.message; }
        finally { if (!stopped && version === revision){ busy = false; await refresh(); paint(); } }
      }; }
      var cancel = host.querySelector('[data-cancel]');
      if (cancel){ cancel.disabled = busy; cancel.onclick = async function(){
        busy = true; error = ''; paint();
        try { await post('cancel', current, opts.user); }
        catch(err){ error = err.message; }
        busy = false; await refresh(); paint();
      }; }
    }
    async function refresh(){
      if (stopped || !candidate || loading || document.hidden) return;
      var version = revision, selected = candidate;
      loading = true;
      try {
        var response = await fetch('/api/challenge?slug=' + encodeURIComponent(selected.slug), { cache:'no-store' });
        var data = await response.json();
        if (stopped || version !== revision) return;
        if (!response.ok) throw new Error(data.error || 'Could not load the invite.');
        var c = data.challenge;
        // A forwarded or forged link is not an invitation from this peer.
        if (!c || c.mode !== 'live' || c.creator.uid !== selected.fromUid ||
          [opts.user.uid, opts.peerUid].indexOf(c.challengedUid) < 0 ||
          c.creator.uid === c.challengedUid){ candidate = null; current = null; }
        else current = c;
      } catch(err){ if (!stopped && version === revision) error = err.message; }
      finally {
        loading = false;
        if (!stopped && version === revision) paint();
        else if (!stopped) refresh();
      }
    }
    var timer = setInterval(function(){ if (!busy) refresh(); }, 8000);
    function resume(){ if (!document.hidden) refresh(); }
    document.addEventListener('visibilitychange', resume);
    return {
      update:function(messages){
        var next = null;
        (messages || []).forEach(function(m){
          var slug = !m.pending && !m.failed && challengeSlug(m.text);
          if (slug && [opts.user.uid, opts.peerUid].indexOf(m.fromUid) >= 0) next = { slug:slug, fromUid:m.fromUid };
        });
        if (candidate && next && candidate.slug === next.slug && candidate.fromUid === next.fromUid) return;
        revision++; candidate = next; current = null; error = ''; busy = false;
        paint(); refresh();
      },
      close:function(){ stopped = true; revision++; clearInterval(timer); document.removeEventListener('visibilitychange', resume); host.hidden = true; host.innerHTML = ''; }
    };
  }
  window.DBChatChallenge = { open:open, people:people, challengeSlug:challengeSlug, mount:mount, enter:enter };
})();
