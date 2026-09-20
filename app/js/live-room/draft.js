/* Live room draft. Dependencies are explicit; the page owns shared round state. */
(function(){
  window.DBLiveDraft = { attach: function(context){
  var escHtml = function(){ return context.escHtml.apply(this, arguments); };
  var getRoundDocRef = function(){ return context.getRoundDocRef.apply(this, arguments); };
  var isSpectator = function(){ return context.isSpectator.apply(this, arguments); };
  var onRoundSnapshot = function(){ return context.onRoundSnapshot.apply(this, arguments); };
  var toast = function(){ return context.toast.apply(this, arguments); };

      // ── MOTION DRAFT (the pre-round negotiation) ─────────────────────
    // The strike beat is gone (2026-09-02, the founder). One debater
    // OFFERS a motion, the other ANSWERS it, and every answer costs
    // something. Take it and you pick your side. Send it back once and
    // they owe you a different one, and you still pick your side. Counter
    // with your own and they pick which motion runs AND which bench they
    // take. One person decides the motion, the other decides the side,
    // whichever branch you walk.
    //
    // The server (round-draft.mjs, over lib/motion-draft.mjs) owns every
    // decision. This file renders what the round doc says and posts
    // intent; it never computes a phase or a side, because a client that
    // could decide its own side would decide to win. There is no blindness
    // left to enforce, because there is no simultaneous move left: every
    // beat has exactly one actor and everything on the doc is already
    // public to the room.
    var DF_SEC = { offer: 16, respond: 14, counter: 14, choose: 10, side: 9 }; // must match motion-draft.mjs
    var DRAFT_MOTION_MIN = 12, DRAFT_MOTION_MAX = 200;   // must match MOTION_MIN/MAX
    var dfBusy = false, dfTimer = 0, dfOpened = false, dfLastPhase = '', dfPreviousFocus = null;
    // Composer state for the offer and counter beats. Survives a re-render,
    // because the board repaints on every round snapshot and losing a
    // half-typed motion to somebody else's write would be the board eating
    // the one thing it just asked for.
    var dfWriteOpen = false, dfWriteText = '', dfErr = '';
    var dfRevision = -1, dfLatestRound = null, dfLastSyncAt = 0;
    var dfRead = null, dfReadAgain = false, dfReadAt = 0, dfReadTimer = 0, dfExpireAt = 0;

    // The API reply and the subscription carry the same server revision.
    // Keep unrelated snapshot fields, but never let a delayed snapshot put
    // an old draft, motion, or pair of seats back over a newer decision.
    window.__lrMergeDraftSnapshot = function(d){
      var revision = Number(d.draftRevision) || 0;
      dfLastSyncAt = Date.now();
      if (revision < dfRevision) return Object.assign({}, d, dfLatestRound);
      dfRevision = revision;
      dfLatestRound = {};
      ['draft', 'draftRevision', 'draftPhaseAt', 'motion', 'proUid', 'conUid', 'proName', 'conName'].forEach(function(key){
        if (Object.prototype.hasOwnProperty.call(d, key)) dfLatestRound[key] = d[key];
      });
      return d;
    };
    function dfAnnounce(){
      try {
        if (context.state.dailyFrame) context.state.dailyFrame.sendAppMessage({ t:'draft-changed', room:context.state.room, revision:dfRevision }, '*');
      } catch(e){} // Firestore remains the delivery path before video joins.
    }
    // Daily is a wake-up signal only. All state still comes from Firestore
    // or the authenticated endpoint, never from another browser's message.
    function dfRefresh(){
      if (dfRead){ dfReadAgain = true; return dfRead; }
      var ref = getRoundDocRef();
      if (!ref || document.hidden) return Promise.resolve();
      if (Date.now() - dfReadAt < 250){
        if (!dfReadTimer) dfReadTimer = setTimeout(function(){ dfReadTimer = 0; dfRefresh(); }, 250);
        return Promise.resolve();
      }
      dfReadAt = Date.now();
      dfRead = ref.get({ source:'server' }).then(function(doc){
        if (doc && doc.exists) onRoundSnapshot(doc.data() || {});
      }).catch(function(e){ console.warn('[Draft sync] refresh failed', e); }).then(function(){
        dfRead = null;
        if (dfReadAgain){ dfReadAgain = false; dfRefresh(); }
      });
      return dfRead;
    }
    window.__lrRefreshDraft = dfRefresh;
    window.__lrDraftChanged = function(revision){
      if (Number.isSafeInteger(revision) && revision > dfRevision) dfRefresh();
    };
    window.__lrAnnounceDraft = function(){ if (dfPending()) dfAnnounce(); };
    document.addEventListener('visibilitychange', function(){ if (!document.hidden) dfRefresh(); });

    function dfDraft(){ return context.state.draft || null; }
    function dfPhase(){ var d = dfDraft(); return d ? String(d.phase || '') : ''; }
    function dfPending(){ var ph = dfPhase(); return ph && ph !== 'done'; }
    function dfMyUid(){ return (context.state.user && context.state.user.uid) || ''; }
    function dfIAmDebater(){ return !isSpectator() && !!dfMyUid(); }
    function dfTable(){ var d = dfDraft(); return (d && d.table) || []; }
    function dfPool(){ var d = dfDraft(); return (d && d.pool) || []; }
    function dfMotionText(id){
      var hit = dfTable().filter(function(m){ return m.id === id; })[0];
      return hit ? hit.text : '';
    }
    // Mirrors offerablePool(): the suggestions minus anything already on the
    // table, so the motion just sent back cannot be offered straight back.
    function dfOfferable(){
      var taken = {};
      dfTable().forEach(function(m){ taken[String(m.text || '').toLowerCase()] = true; });
      return dfPool().filter(function(m){ return !taken[String(m.text || '').toLowerCase()]; });
    }
    function dfContenders(){
      var d = dfDraft(); if (!d) return [];
      return [d.offerId, d.counterId].filter(Boolean).map(dfMotionText).map(function(t, i){
        return { id: (i === 0 ? d.offerId : d.counterId), text: t };
      }).filter(function(m){ return m.text; });
    }
    function dfActor(){
      var d = dfDraft(); if (!d) return '';
      if (d.phase === 'offer') return d.offerUid;
      if (d.phase === 'respond' || d.phase === 'counter') return d.respondUid;
      if (d.phase === 'choose') return d.offerUid;
      if (d.phase === 'side') return d.sideUid;
      return '';
    }
    function dfMine(){ return dfActor() === dfMyUid(); }
    function dfNameFor(uid){
      if (uid === dfMyUid()) return 'You';
      if (uid === context.state.proUid) return context.state.proName || 'For';
      if (uid === context.state.conUid) return context.state.conName || 'Against';
      return 'Your opponent';
    }
    function dfOtherName(){
      var d = dfDraft(); if (!d) return 'Your opponent';
      return dfNameFor(d.offerUid === dfMyUid() ? d.respondUid : d.offerUid);
    }
    function dfCanWrite(){
      var d = dfDraft();
      return !!(d && !d.poolLocked);
    }
    function dfErrText(code, message){
      return ({
        blocked: message || 'That motion is off limits here. Try a different one.',
        too_short: 'Give it a few more words.',
        too_long: 'Keep it under ' + DRAFT_MOTION_MAX + ' characters.',
        duplicate: 'That one is already on the table.',
        bad_motion: 'That motion is not available any more.',
        pool_locked: 'This tournament runs its published motions only.',
        no_veto_left: 'You have used your one send-back.',
        not_your_call: 'That call is not yours this round.',
        wrong_phase: 'That step has moved on.',
        stale_draft: 'The topic choice has moved on.',
      })[code] || 'Could not do that. Try again.';
    }

    function dfPost(action, extra){
      if (!context.state.user || !context.state.user.getIdToken) return Promise.reject(new Error('no-user'));
      var payload = Object.assign({ action:action, room:context.state.room }, extra || {});
      if (action !== 'open' && dfRevision >= 0) payload.draftRevision = dfRevision;
      return context.state.user.getIdToken().then(function(tok){
        return fetch('/api/round-draft', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + tok },
          body: JSON.stringify(payload),
        });
      }).then(function(r){ return r.json().catch(function(){ return {}; }); }).then(function(res){
        if (res && res.round){
          // Apply the committed topic and seats together before closing the
          // board. Waiting for a second network delivery caused split screens.
          if ((Number(res.round.draftRevision) || 0) > dfRevision){
            try { onRoundSnapshot(Object.assign({}, context.state.lastRoundDoc || {}, res.round)); }
            catch(e){ console.warn('[Draft sync] round repaint failed', e); }
          }
          dfAnnounce();
        }
        return res;
      });
    }

    // Ask the server to open one. It refuses unless the pair was stamped
    // eligible at match time, so a /live challenge round or a direct link
    // keeps the motion its poster chose and this is a no-op there.
    // On demand only. The round starts on whatever motion the pair arrived
    // with; this is the "we do not know what to argue" door, opened from the
    // resolution bar by either debater. The server still refuses a room
    // that was not stamped eligible at match time, and that refusal has to
    // be SAID here, because a button that does nothing reads as broken.
    function dfOpen(){
      if (dfDraft()){ toast('A draft is already running.'); return; }
      if (!dfIAmDebater()){ toast('Only a seated debater can open a draft.'); return; }
      if (context.state.speechIdx > 0 || (context.state.log && context.state.log.length)){ toast('The round has started. The topic is locked.'); return; }
      if (dfOpened) return;
      dfOpened = true;
      try { gtag('event', 'live_round_draft_open_manual'); } catch(e){}
      dfPost('open').then(function(res){
        dfOpened = false;
        var code = res && (res.ok === false ? res.reason : res.error);
        if (code){
          toast(code === 'not_eligible'
            ? 'This room was not matched through the queue, so there is no draft here. Choose Spin a topic to suggest a different one.'
            : dfErrText(code));
        }
      }).catch(function(){ dfOpened = false; toast('Could not open a draft. Try again.'); });
    }

    function dfClock(){
      var d = dfDraft(); if (!d || !d.phaseAt) return null;
      var total = (DF_SEC[d.phase] || 9) * 1000;
      return Math.max(0, Math.ceil((d.phaseAt + total - Date.now()) / 1000));
    }
    // The clock is what the beat is FOR, so zero always does something.
    // Only the debater whose own clock ran out asks the server to expire
    // the first two beats: before the answer, one person has moved and
    // resolving for the other is how a room opens onto an empty chair. Past
    // the answer either side may, because both have proven they are here.
    function dfOnZero(){
      if (dfBusy || !dfIAmDebater() || Date.now() - dfExpireAt < 2000) return;
      var d = dfDraft(); if (!d) return;
      var eitherMay = d.phase === 'counter' || d.phase === 'choose' || d.phase === 'side'
        || (d.phase === 'offer' && !!d.response);
      if (!eitherMay && !dfMine()) return;
      dfBusy = true;
      dfExpireAt = Date.now();
      dfPost('expire').catch(function(){}).then(function(){ dfBusy = false; renderDraft(); });
    }

    function dfHost(){
      var el = document.getElementById('draftBoard');
      if (el) return el;
      el = document.createElement('div');
      el.id = 'draftBoard';
      el.className = 'draft-board hidden';
      el.setAttribute('role', 'dialog');
      el.setAttribute('aria-modal', 'true');
      el.setAttribute('aria-labelledby', 'dfTitle');
      el.tabIndex = -1;
      document.body.appendChild(el);
      return el;
    }

    // big=true renders the sub as the motion line: the resolution is the
    // one thing on this card a person has to actually read before they
    // pick, so it is set at headline weight, not caption weight
    // (2026-09-04, the founder: "make text much larger for proposed
    // resolution").
    function dfHead(step, title, sub, big){
      return '<div class="df-head"><span class="df-step">' + step + '</span>'
        + '<h3 id="dfTitle">' + title + '</h3><p' + (big ? ' class="df-head-motion"' : '') + '>' + sub + '</p>'
        + (dfErr ? '<div class="df-status error" role="alert">' + escHtml(dfErr) + '</div>' : '')
        + (dfBusy ? '<div class="df-status" role="status">Sending…</div>' : '') + '</div>';
    }
    function dfClockHtml(){
      var left = dfClock();
      if (left === null) return '';
      return '<div class="df-clock' + (left <= 3 ? ' hot' : '') + '" aria-label="Time remaining"><b id="dfSecs">' + left + '</b>s</div>';
    }
    function dfWaiting(step, title, sub, big){
      return '<div class="df-card">' + dfHead(step, title, sub, big) + dfClockHtml() + '</div>';
    }
    // The composer, shared by the offer beat and the counter beat because
    // "name the motion you want" is the same act either way.
    function dfComposer(){
      var cards = dfOfferable().map(function(m, i){
        return '<button type="button" class="df-motion" data-df-pool="' + escHtml(m.id)
          + '" style="--i:' + i + '"><span class="df-motion-copy">' + escHtml(m.text)
          + (m.recommended ? '<span class="df-tag">Suggested for this match</span>' : '')
          + '</span><span class="df-offer-action">Offer →</span></button>';

      }).join('');
      var write = '';
      if (dfCanWrite()){
        write = dfWriteOpen
          ? '<div class="df-add open">'
            + '<label for="dfWriteInput" class="df-add-hint">Your topic</label>'
            + '<input type="text" id="dfWriteInput" maxlength="' + DRAFT_MOTION_MAX + '" placeholder="e.g. Homework should be banned." value="' + escHtml(dfWriteText) + '" autocomplete="off" />'
            + '<div class="df-add-row"><button type="button" class="df-add-go" id="dfWriteGo">Offer this topic</button>'
            + '<button type="button" class="df-add-cancel" id="dfWriteCancel">Cancel</button></div>'
            + '</div>'
          : '<button type="button" class="df-add-open" id="dfWriteOpen">+ Write your own topic</button>';
      }
      return (dfWriteOpen ? '' : '<div class="df-motions">' + cards + '</div>') + write
        + '<div class="df-foot">' + dfClockHtml()
        + '<span class="df-foot-note">A suggestion is offered when time runs out.</span></div>';
    }

    function renderDraft(){
      var host = dfHost();
      var d = dfDraft();
      if (!d || !dfPending() || context.state.phase === 'ballot' || context.state.speechIdx > 0){
        var wasDrafting = document.body.classList.contains('drafting');
        host.className = 'draft-board hidden';
        host.innerHTML = '';
        document.body.classList.remove('drafting');
        // The settled resolution is the last beat of the draft. If its
        // text arrived while the modal board covered the room, reveal it
        // now rather than spending the pop underneath an invisible bar.
        if (wasDrafting && window.__lrRevealResolution){
          requestAnimationFrame(function(){ window.__lrRevealResolution(true); });
        }
        if (dfTimer){ clearInterval(dfTimer); dfTimer = 0; }
        if (dfPreviousFocus && dfPreviousFocus.isConnected) dfPreviousFocus.focus();
        dfPreviousFocus = null;
        return;
      }
      if (!document.body.classList.contains('drafting')) dfPreviousFocus = document.activeElement;
      host.setAttribute('aria-busy', dfBusy ? 'true' : 'false');
      document.body.classList.add('drafting');
      host.className = 'draft-board';
      requestAnimationFrame(function(){
        if (!host.classList.contains('hidden') && !host.contains(document.activeElement)) host.focus();
      });
      if (!dfTimer) dfTimer = setInterval(function(){
        var left = dfClock();
        var n = document.getElementById('dfSecs');
        if (n) n.textContent = left === null ? '' : left;
        var c = n && n.parentNode;
        if (c && left !== null && left <= 3) c.classList.add('hot');
        // While choosing, recover a delayed/missed stream within two
        // seconds. The timer ends with the draft; normal rooms do not poll.
        if (!document.hidden && Date.now() - Math.max(dfLastSyncAt, dfReadAt) >= 2000) dfRefresh();
        if (left === 0) dfOnZero();
      }, 250);

      // A spectator watches; they hold no power here and a board full of
      // buttons they cannot press would be a lie about who decides.
      if (!dfIAmDebater()){
        host.innerHTML = '<div class="df-card">'
          + dfHead('Pre-round', 'They’re choosing a topic together.',
                   'They agree on a topic, then pick who argues for and against it.')
          + '</div>';
        return;
      }

      var ph = d.phase;
      var replacing = ph === 'offer' && d.response === 'back';

      if (ph === 'offer'){
        if (!dfMine()){
          host.innerHTML = dfWaiting('Step 1 of 2',
            escHtml(dfOtherName()) + (replacing ? ' is picking a new topic.' : ' is suggesting a topic.'),
            replacing
              ? 'Their next topic is final. You pick your side.'
              : 'You can accept it or suggest a change next.');
          return;
        }
        host.innerHTML = '<div class="df-card">'
          + dfHead('Step 1 of 2',
                   replacing ? 'Suggest a new topic.' : 'What should you debate?',
                   replacing
                     ? 'Tap a topic to offer it. This one is final, and ' + escHtml(dfOtherName()) + ' picks their side.'
                     : 'Tap a topic to offer it. If ' + escHtml(dfOtherName()) + ' accepts, they pick their side.')
          + dfComposer()
          + '</div>';
        dfFocusWrite();
        return;
      }

      if (ph === 'respond'){
        var offered = dfMotionText(d.offerId);
        if (!dfMine()){
          host.innerHTML = dfWaiting('Step 1 of 2',
            'Waiting for ' + escHtml(dfOtherName()) + ' to answer.',
            escHtml(offered), true);
          return;
        }
        var vetoLeft = Number(d.vetoesLeft || 0) > 0;
        host.innerHTML = '<div class="df-card">'
          + dfHead('Step 1 of 2', 'Want to debate this?',
                   escHtml(dfOtherName()) + ' suggested this topic.')
          + '<div class="df-offer">' + escHtml(offered) + '</div>'
          + '<div class="df-choices">'
          + '<button type="button" class="df-choice take" data-df-respond="take"><b>Yes, pick my side →</b><i>Agree on this topic and choose for or against.</i></button>'
          + (vetoLeft
            ? '<button type="button" class="df-choice back" data-df-respond="back"><b>Ask for another</b><i>Their next topic is final. You still pick your side. Once per round.</i></button>'
            : '<button type="button" class="df-choice back" disabled><b>Ask for another</b><i>Already used this round.</i></button>')
          + '<button type="button" class="df-choice counter" data-df-respond="counter"><b>Suggest my own</b><i>They choose between both topics, then pick their side.</i></button>'
          + '</div>'
          + '<div class="df-foot">' + dfClockHtml() + '</div></div>';
        return;
      }

      if (ph === 'counter'){
        if (!dfMine()){
          host.innerHTML = dfWaiting('Step 1 of 2',
            escHtml(dfOtherName()) + ' is suggesting another topic.',
            'You choose between both topics, then pick your side.');
          return;
        }
        host.innerHTML = '<div class="df-card">'
          + dfHead('Step 1 of 2', 'Suggest another topic.',
                   'Tap a topic to offer it. ' + escHtml(dfOtherName()) + ' chooses between both topics, then picks their side.')
          + dfComposer()
          + '</div>';
        dfFocusWrite();
        return;
      }

      if (ph === 'choose'){
        var list = dfContenders();
        if (!dfMine()){
          host.innerHTML = dfWaiting('Step 1 of 2',
            escHtml(dfOtherName()) + ' is choosing between the two.',
            'They choose the topic and their side. You take the other side.');
          return;
        }
        host.innerHTML = '<div class="df-card">'
          + dfHead('Step 1 of 2', 'Which topic should you debate?',
                   'Tap one to choose it. You pick your side next.')
          + '<div class="df-motions">' + list.map(function(m, i){
              return '<button type="button" class="df-motion" data-df-motion="' + escHtml(m.id)
                + '" style="--i:' + i + '">' + escHtml(m.text)
                + '<span class="df-tag">' + (i === 0 ? 'Yours' : 'Theirs') + '</span></button>';
            }).join('') + '</div>'
          + '<div class="df-foot">' + dfClockHtml() + '</div></div>';
        return;
      }

      if (ph === 'side'){
        var motion = dfMotionText(d.motionId);
        if (!dfMine()){
          host.innerHTML = dfWaiting('Step 2 of 2',
            escHtml(dfNameFor(d.sideUid)) + ' is picking their side.',
            escHtml(motion), true);
          return;
        }
        host.innerHTML = '<div class="df-card">'
          + dfHead('Step 2 of 2', 'Pick your side.',
                   escHtml(motion), true)
          + '<div class="df-sides">'
          + '<button type="button" class="df-side pro" data-df-side="pro"><b>For</b><i>I’ll support this claim</i></button>'
          + '<button type="button" class="df-side con" data-df-side="con"><b>Against</b><i>I’ll challenge this claim</i></button>'
          + '</div><div class="df-foot">' + dfClockHtml() + '</div></div>';
      }
    }

    function dfFocusWrite(){
      if (!dfWriteOpen) return;
      var inp = document.getElementById('dfWriteInput');
      if (inp && document.activeElement !== inp){
        try { inp.focus(); inp.setSelectionRange(inp.value.length, inp.value.length); } catch(e){}
      }
    }

    function dfSendOffer(payload){
      if (dfBusy) return;
      dfBusy = true;
      dfErr = '';
      renderDraft();
      dfPost('offer', payload).then(function(res){
        if (res && res.ok){
          dfWriteOpen = false; dfWriteText = '';
          try { gtag('event', 'live_draft_offer', { format: context.state.formatKey, written: payload.text ? 1 : 0 }); } catch(e){}
        } else {
          dfErr = dfErrText(res && res.reason, res && res.message);
        }
      }).catch(function(){ dfErr = dfErrText(); })
        .then(function(){ dfBusy = false; renderDraft(); });
    }

    document.addEventListener('input', function(ev){
      if (ev.target && ev.target.id === 'dfWriteInput') dfWriteText = ev.target.value;
    }, true);
    document.addEventListener('keydown', function(ev){
      var host = document.getElementById('draftBoard');
      if (host && !host.classList.contains('hidden') && ev.key === 'Tab'){
        var controls = host.querySelectorAll('button:not([disabled]), input:not([disabled])');
        var first = controls[0], last = controls[controls.length - 1];
        if (!first){ ev.preventDefault(); host.focus(); }
        else if (ev.shiftKey && (document.activeElement === first || document.activeElement === host || !host.contains(document.activeElement))){ ev.preventDefault(); last.focus(); }
        else if (!ev.shiftKey && (document.activeElement === last || document.activeElement === host || !host.contains(document.activeElement))){ ev.preventDefault(); first.focus(); }
      }
      if (!ev.target || ev.target.id !== 'dfWriteInput') return;
      if (ev.key === 'Enter'){
        ev.preventDefault();
        var t = String(dfWriteText || '').replace(/\s+/g, ' ').trim();
        if (t.length < DRAFT_MOTION_MIN){ dfErr = dfErrText('too_short'); renderDraft(); return; }
        dfSendOffer({ text: t });
      } else if (ev.key === 'Escape'){
        ev.preventDefault(); dfWriteOpen = false; dfWriteText = ''; dfErr = ''; renderDraft();
      }
    }, true);

    // One delegated listener for the whole board, so a re-render never
    // leaves a dead handler behind.
    document.addEventListener('click', function(ev){
      var host = document.getElementById('draftBoard');
      if (!host || host.classList.contains('hidden') || !host.contains(ev.target)) return;
      if (dfBusy) return;
      if (ev.target.closest('#dfWriteOpen')){ dfWriteOpen = true; dfErr = ''; renderDraft(); return; }
      if (ev.target.closest('#dfWriteCancel')){ dfWriteOpen = false; dfWriteText = ''; dfErr = ''; renderDraft(); return; }
      if (ev.target.closest('#dfWriteGo')){
        var t = String(dfWriteText || '').replace(/\s+/g, ' ').trim();
        if (t.length < DRAFT_MOTION_MIN){ dfErr = dfErrText('too_short'); renderDraft(); return; }
        dfSendOffer({ text: t });
        return;
      }
      var pool = ev.target.closest('[data-df-pool]');
      if (pool){
        dfSendOffer({ poolId: pool.getAttribute('data-df-pool') });
        return;
      }
      var answer = ev.target.closest('[data-df-respond]');
      if (answer){
        if (dfBusy) return;
        dfBusy = true;
        dfErr = '';
        var choice = answer.getAttribute('data-df-respond');
        renderDraft();
        dfPost('respond', { choice: choice }).then(function(res){
          if (res && !res.ok) dfErr = dfErrText(res.reason, res.message);
          try { gtag('event', 'live_draft_respond', { choice: choice, format: context.state.formatKey }); } catch(e){}
        }).catch(function(){ dfErr = 'Could not send your choice. Try again.'; }).then(function(){ dfBusy = false; renderDraft(); });
        return;
      }
      var pick = ev.target.closest('[data-df-motion]');
      if (pick){
        if (dfBusy) return;
        dfBusy = true;
        dfErr = '';
        renderDraft();
        dfPost('motion', { motionId: pick.getAttribute('data-df-motion') })
          .then(function(res){ if (res && !res.ok) dfErr = dfErrText(res.reason, res.message); })
          .catch(function(){ dfErr = 'Could not send your choice. Try again.'; }).then(function(){ dfBusy = false; renderDraft(); });
        return;
      }
      var side = ev.target.closest('[data-df-side]');
      if (side){
        if (dfBusy) return;
        dfBusy = true;
        dfErr = '';
        renderDraft();
        dfPost('side', { side: side.getAttribute('data-df-side') })
          .then(function(res){ if (res && !res.ok) dfErr = dfErrText(res.reason, res.message); })
          .catch(function(){ dfErr = 'Could not send your choice. Try again.'; }).then(function(){ dfBusy = false; renderDraft(); });
      }
    }, true);

    // Snapshot hook. The round doc and committed API reply share one path.
    window.__lrRenderDraft = function(d){
      var next = d && d.draft ? Object.assign({}, d.draft) : null;
      if (next && d.draftPhaseAt && d.draftPhaseAt.toMillis) next.phaseAt = d.draftPhaseAt.toMillis();
      context.state.draft = next;
      var now = next ? String(next.phase || '') : '';
      // A new beat clears the composer: a pool card selected on the offer
      // beat means nothing on the counter beat, and carrying it across
      // would arm a button with somebody else's intent.
      if (now !== dfLastPhase){
        dfWriteOpen = false; dfWriteText = ''; dfErr = '';
        requestAnimationFrame(function(){ var host = dfHost(); if (dfPending()) host.focus(); });
      }
      dfLastPhase = now;
      renderDraft();
    };
    window.__lrDraftPending = dfPending;
    window.__lrOpenDraft = dfOpen;


  } };
})();
