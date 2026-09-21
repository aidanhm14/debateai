/* Live room presence. Dependencies are explicit; the page owns shared round state. */
(function(){
  window.DBLivePresence = { create: function(context){
  var finishRound = function(){ return context.finishRound.apply(this, arguments); };
  var getRoundDocRef = function(){ return context.getRoundDocRef.apply(this, arguments); };
  var hideNoShow = function(){ return context.hideNoShow.apply(this, arguments); };
  var isSpectator = function(){ return context.isSpectator.apply(this, arguments); };
  var mySide = function(){ return context.mySide.apply(this, arguments); };
  var paintAudCamsToggle = function(){ return context.paintAudCamsToggle.apply(this, arguments); };
  var paintPrivacyToggle = function(){ return context.paintPrivacyToggle.apply(this, arguments); };
  var publicNameOf = function(){ return context.publicNameOf.apply(this, arguments); };
  var reportRoundOver = function(){ return context.reportRoundOver.apply(this, arguments); };
  var showNoShow = function(){ return context.showNoShow.apply(this, arguments); };
  var toast = function(){ return context.toast.apply(this, arguments); };
  var watchMyCallRequest = function(){ return context.watchMyCallRequest.apply(this, arguments); };

  function watchersRef(){
    var r = getRoundDocRef();
    return r ? r.collection('watchers') : null;
  }

  function startWatchPresence(){
    if (context.state.watchInit) return;
    if (!context.state.user || !context.firebaseDb) return;
    var col = watchersRef();
    if (!col) return;
    context.state.watchInit = true;

    // (a) I'm a spectator → write + heartbeat my presence. Only once
    // admitted: an unadmitted watcher is at the door, not in the
    // audience, and counting them would inflate the number the
    // debaters use to decide whether the room is worth opening up.
    if (isSpectator() && context.state.admitted) startSpectatorBeat();

    // (b) Nobody subscribes to the watchers collection. The count arrives
    // on the round doc, which every client in the room already has a
    // listener on, so rendering it costs a spectator nothing. Seated
    // debaters compute it in seatBeat below; see the note there.

    // Only a seated participant can change this round's visibility.
    if (!isSpectator()){
      var tog = document.getElementById('privacyToggle');
      if (tog) tog.addEventListener('click', function(){
        if (tog.disabled) return;
        var next = !context.state.isPrivate;
        var ref = getRoundDocRef();
        if (!ref) return;
        context.state.privacyBusy = true;
        tog.disabled = true;
        tog.textContent = 'Updating…';
        ref.update({ isPrivate: next }).then(function(){
          context.state.isPrivate = next;
          toast(next ? 'Round is private. Only participants can enter.' : 'Round is public. People can now find and watch it.');
        }).catch(function(e){
          console.warn('[watch] visibility change failed', e);
          toast('Could not change round privacy. Try again.');
        }).then(function(){ context.state.privacyBusy = false; paintPrivacyToggle(); });
      });
      var camsTog = document.getElementById('audCamsToggle');
      if (camsTog) camsTog.addEventListener('click', function(){
        var ref = getRoundDocRef();
        if (!ref) return;
        var next = context.state.allowAudienceCams === false;
        camsTog.disabled = true;
        ref.update({ allowAudienceCams: next }).then(function(){
          context.state.allowAudienceCams = next;
          paintAudCamsToggle();
        }).catch(function(){ toast('Could not update audience cameras.'); })
          .then(function(){ camsTog.disabled = false; });
      });
      paintPrivacyToggle();
    }

    // (d) Seated debaters heartbeat their presence onto the round doc
    // itself (separate from the watchers subcollection). /spar's "Watch a
    // live round" list reads this to tell a live room from an abandoned
    // one: when both debaters close their tabs the beat stops and the
    // round ages off the watch list within ~1.5 cycles, instead of
    // lingering 30 min on createdAt (the old ghost-room bug). Server
    // stamped; stops once a ballot exists — a finished round shouldn't
    // keep advertising as live.
    if (!isSpectator()){
      var rref = getRoundDocRef();
      if (rref){
        var seatBeatN = 0;
        var seatBeat = function(){
          if (context.state.phase === 'ballot' || context.state.phase === 'ballot-rendered') return;
          // Presence cannot create a partial room before privacy and seats save.
          if (!context.state.roundDocSeen || !context.state.dailyMounted) return;
          // A beat already in flight when the seat is marked empty would
          // land with a LATER server timestamp and quietly undo the mark,
          // which is the one way this could fail closed.
          if (context.state.seatLeftMarked) return;
          var beat = { lastSeenAt: firebase.firestore.FieldValue.serverTimestamp() };
          // Per-uid presence so each debater can tell whether the OTHER has
          // actually entered the room — the single lastSeenAt can't, since
          // either side writes it. Nested-map merge preserves the opponent's
          // entry. Only signed-in debaters key in (the no-show prompt is for
          // identified human-vs-human rounds).
          if (context.state.user && context.state.user.uid){
            beat.seatSeen = {};
            beat.seatSeen[context.state.user.uid] = firebase.firestore.FieldValue.serverTimestamp();
          }
          // Fold the audience count into this same write so the whole room
          // gets it through the round-doc listener it already has, instead
          // of every viewer subscribing to the watchers collection. The
          // freshness filter runs SERVER-side, so stale heartbeats are
          // never fetched; `ts` is a plain field, so Firestore's automatic
          // single-field index covers it and there is no composite index
          // to deploy. Both debaters do this (2x a small number is still a
          // small number) rather than running a leader election that could
          // strand the count when the leader's tab dies.
          var wcol = watchersRef();
          seatBeatN++;
          if (!wcol || (seatBeatN % 3) !== 1){ rref.set(beat, { merge: true }).catch(function(){}); return; }
          wcol.where('ts', '>', new Date(Date.now() - context.WATCH_STALE_MS))
              .limit(context.WATCH_COUNT_CAP + 1)
              .get()
              .then(function(snap){
                beat.watchCount = snap.size;
                beat.watchCountCapped = snap.size > context.WATCH_COUNT_CAP;
              })
              .catch(function(){ /* count is optional; never block the beat */ })
              .then(function(){
                if (context.state.seatLeftMarked) return;   // re-checked after the await
                rref.set(beat, { merge: true }).catch(function(){});
              });
        };
        seatBeat();
        context.state.seatHbInterval = setInterval(seatBeat, context.SEAT_HB_MS);
        window.addEventListener('pagehide', function(){
          if (context.state.seatHbInterval){ clearInterval(context.state.seatHbInterval); context.state.seatHbInterval = null; }
          markSeatLeft();
        });
        // pagehide is not only "goodbye". iOS fires it when the browser is
        // backgrounded and then restores the page from bfcache, so a mark
        // written there has to be undone the moment the page comes back —
        // otherwise going to check a text message would end your round.
        // Resuming the beat is the whole repair: the next heartbeat is
        // newer than the mark, and every reader ignores a mark older than
        // the seat's last beat.
        window.addEventListener('pageshow', function(e){
          if (!e || !e.persisted) return;
          context.state.seatLeftMarked = false;
          seatBeat();
          if (!context.state.seatHbInterval) context.state.seatHbInterval = setInterval(seatBeat, context.SEAT_HB_MS);
        });
        // Round-abandonment beacon: a debater leaving mid-round is the
        // one exit nothing records. Fires only when the round genuinely
        // started ('round' phase; 'ballot'/'ballot-rendered' mean it
        // finished) so a normal post-ballot departure never counts.
        // Registered here because this branch only runs for a seated
        // debater with a synced round doc, which is exactly the
        // population whose exits matter.
        if (!context.state.exitBeaconWired){
          context.state.exitBeaconWired = true;
          window.addEventListener('pagehide', function(){
            if (!window.RoundExit) return;
            if (context.state.phase !== 'round') return;
            var oppUid = (typeof noShowOpponentUid === 'function') ? noShowOpponentUid() : '';
            RoundExit.beacon({
              surface: 'live',
              stage: context.state.phase || 'speech',
              roundId: context.state.room,
              speechIdx: context.state.speechIdx,
              elapsed: context.state.roundStartedAt ? Math.round((Date.now() - context.state.roundStartedAt) / 1000) : 0,
              oppSeen: !!(oppUid && context.state.seatSeen && context.state.seatSeen[oppUid]),
            });
          });
        }
      }
    }
  }

  function markSeatLeft(){
    try {
      if (context.state.seatLeftMarked) return Promise.resolve();
      if (isSpectator()) return Promise.resolve();
      // A finished round is not an abandoned one. Past the ballot there
      // is nothing left to leave, and watch-live already drops it.
      if (context.state.phase === 'ballot' || context.state.phase === 'ballot-rendered') return Promise.resolve();
      var uid = context.state.user && context.state.user.uid;
      var rref = getRoundDocRef();
      if (!uid || !rref) return Promise.resolve();
      context.state.seatLeftMarked = true;
      if (context.state.seatHbInterval){ clearInterval(context.state.seatHbInterval); context.state.seatHbInterval = null; }
      // Say it out loud first. The data channel is already open, so this
      // reaches the other side in milliseconds and, unlike the Firestore
      // write below, it does not need the browser to keep an unload alive
      // long enough to finish a request. Belt and braces: the mark is
      // still what a reader trusts, this is what makes it arrive fast.
      try {
        if (context.room.call && context.room.joined) context.room.call.sendAppMessage({ t: 'seat-left', uid: uid }, '*');
      } catch(e){}
      var patch = { seatLeft: {} };
      patch.seatLeft[uid] = firebase.firestore.FieldValue.serverTimestamp();
      try { gtag('event', 'live_round_seat_left', { format: context.state.formatKey, speech: context.state.speechIdx }); } catch(e){}
      return rref.set(patch, { merge: true }).catch(function(){});
    } catch(e){ return Promise.resolve(); }
  }

  function startSpectatorBeat(){
    if (context.state.specBeatOn) return;
    if (!context.state.user || !context.firebaseDb) return;
    var col = watchersRef();
    if (!col) return;
    context.state.specBeatOn = true;
    var mine = col.doc(context.state.user.uid);
    var beat = function(){
      var payload = {
        name: publicNameOf(context.state.user),
        ts: firebase.firestore.FieldValue.serverTimestamp(),
      };
      // Camera spectators keep a camAt heartbeat in the same doc; the
      // server counts fresh camAt entries to enforce the audience-cam
      // slot cap. Plain set() (no merge) so turning the camera off
      // drops the field on the next beat.
      if (context.audCam.active) payload.camAt = firebase.firestore.FieldValue.serverTimestamp();
      mine.set(payload).catch(function(){});
    };
    context.audCam.beatNow = beat;
    // The request listener needs a signed-in uid, which may not have
    // existed when the pill was built. Idempotent, so a second call is
    // free.
    if (context.audCam.pill) watchMyCallRequest();
    beat();
    context.state.watchHbInterval = setInterval(beat, context.WATCH_HB_MS);
    window.addEventListener('pagehide', function(){ mine.delete().catch(function(){}); });
  }

  function noShowOpponentUid(){
    var me = context.state.user && context.state.user.uid; if (!me) return '';
    if (me === context.state.proUid) return context.state.conUid || '';
    if (me === context.state.conUid) return context.state.proUid || '';
    return '';
  }

  function checkOpponentPresence(){
    var me = context.state.user && context.state.user.uid;
    var oppUid = noShowOpponentUid();
    // Pre-speech covers BOTH phases on purpose. Spar rounds auto-start
    // (phase flips to 'round' within a second of arrival), so the old
    // setup-only gate made every prompt below unreachable on exactly the
    // surface the matchmaker feeds: an opener sat in an empty room with
    // no explanation. Funnel read 2026-08-18: half of matched rounds
    // still had an empty chair, and nobody in the room was ever told.
    var preSpeech = context.state.phase === 'setup' ||
      (context.state.phase === 'round' && context.state.speechIdx === 0 && context.state.timerState === 'ready');
    // Only identified human-vs-human rounds, pre-speech, non-spectator.
    var eligible = me && oppUid && oppUid !== me && !isSpectator() && preSpeech;
    if (!eligible){ hideNoShow(); return; }
    // Trust the signal only once MY OWN presence write has round-tripped.
    // If the write is denied (rules) or hasn't landed, seatSeen[me] is
    // absent — bail rather than false-fire "opponent hasn't joined" at
    // everyone. This makes the feature degrade safely.
    if (!(context.state.seatSeen && context.state.seatSeen[me])) { hideNoShow(); return; }
    if (context.state.seatSeen[oppUid]) { hideNoShow(); return; }
    // The Daily room is ground truth ahead of the doc beat: a remote
    // debater already on camera is present, whatever the 30s seat
    // heartbeat has round-tripped so far.
    if (context.room && context.room.remoteSeats > 0) { hideNoShow(); return; }
    // Normal arrival and an explicit choice to wait stay quiet. Only a
    // missing opponent past the grace period gets the no-show exit controls.
    if (Date.now() - context.state.arrivedAtMs < context.NOSHOW_GRACE_MS){ hideNoShow(); return; }
    if (context.state.noShowSnoozeUntil && Date.now() < context.state.noShowSnoozeUntil) { return; }
    showNoShow(oppUid);
  }

  function tsMs(v){
    if (!v) return 0;
    if (typeof v.toMillis === 'function') return v.toMillis();
    if (typeof v.getTime === 'function') return v.getTime();
    if (typeof v.seconds === 'number') return v.seconds * 1000;
    if (typeof v === 'number') return v;
    return 0;
  }

  function oppLastSeenMs(){
    var me = context.state.user && context.state.user.uid;
    var opp = noShowOpponentUid();
    if (!me || !opp || isSpectator()) return 0;
    if (!(context.state.seatSeen && context.state.seatSeen[me] && context.state.seatSeen[opp])) return 0;
    return tsMs(context.state.seatSeen[opp]);
  }

  function opponentHasLeft(){
    var seen = oppLastSeenMs();
    if (!seen) return false;
    // The mark counts only while it is NEWER than their last beat, so
    // someone who leaves and comes back clears it by beating again. Both
    // values are SERVER-stamped, so this is one clock against itself —
    // which is why this can afford timestamp math where the no-show
    // check next door deliberately cannot.
    var left = tsMs(context.state.seatLeft && context.state.seatLeft[noShowOpponentUid()]);
    if (left && left >= seen) return true;
    // Fast path: they dropped out of the video room (or said outright
    // that they were leaving) and their heartbeat has not moved since.
    // The stamp check is what keeps this honest — anyone who merely left
    // the call and stayed on the page keeps beating, the stamp advances
    // past oppSeenAtGone, and this stops applying on its own.
    if (context.state.oppGoneAt && seen <= context.state.oppSeenAtGone &&
        (Date.now() - context.state.oppGoneAt) > context.state.oppGoneWaitMs) return true;
    var mine = tsMs(context.state.seatSeen[context.state.user.uid]);
    return mine > 0 && (mine - seen) > context.OPP_QUIET_MS;
  }

  function noteOppGone(waitMs){
    var seen = oppLastSeenMs();
    if (!seen) return;                       // nothing proven about that seat yet
    if (context.state.oppGoneAt && waitMs >= context.state.oppGoneWaitMs) return;  // keep the stronger signal
    context.state.oppGoneAt = Date.now();
    context.state.oppGoneWaitMs = waitMs;
    context.state.oppSeenAtGone = seen;
  }

  function clearOppGone(){
    context.state.oppGoneAt = 0; context.state.oppGoneWaitMs = 0; context.state.oppSeenAtGone = 0;
  }

  function noteOppSaidGone(uid){
    if (!uid || uid !== noShowOpponentUid()) return;
    noteOppGone(2500);
    try { paintRoundQuiet(); } catch(e){}
    try { checkOpponentPresence(); } catch(e){}
  }

  function roomIsQuiet(){
    if (context.state.phase === 'ballot' || context.state.phase === 'ballot-rendered') return false;
    if (context.state.hasBallot) return false;
    if (context.room && context.room.remoteSeats > 0) return false;
    // A SEATED debater cannot answer this from `lastSeenAt`: they write
    // it themselves every 30 seconds, so it is never stale in the one
    // browser that needs it to be, and the debater branch of this strip
    // — the half written for an opponent who leaves mid-round — could
    // never fire for anybody. Their question is about the other chair,
    // and the per-uid presence map is what answers it.
    if (!isSpectator() && mySide()) return opponentHasLeft();
    // No beat has EVER landed. That is only evidence once I have been
    // here long enough for one to have arrived; before that it is just a
    // page that has not finished loading.
    if (!context.state.seatLastSeenMs) return (Date.now() - context.state.arrivedAtMs) > context.QUIET_MS;
    return (Date.now() - context.state.seatLastSeenMs) > context.QUIET_MS;
  }

  function quietForMins(){
    // Same split: a debater is counting the opponent's absence, not the
    // age of their own heartbeat, which is always seconds old.
    var since = (!isSpectator() && mySide() && oppLastSeenMs())
      || context.state.seatLastSeenMs || context.state.arrivedAtMs;
    return Math.max(1, Math.round((Date.now() - since) / 60000));
  }

  function paintRoundQuiet(){
    var el = document.getElementById('roundQuiet');
    if (!el) return;
    var quiet = roomIsQuiet();
    if (!quiet){
      // A debater came back. The strip goes, and so does my own report
      // outcome: the claim it recorded is no longer the state of the
      // room, and leaving "you marked this over" on screen under a live
      // round would be the page arguing with itself.
      if (!el.hidden){ el.hidden = true; el.innerHTML = ''; }
      context.state.quietDone = '';
      return;
    }
    var mins = quietForMins();
    // An ending is only current if no debater has beaten since it was
    // stamped. A round closed while empty, rejoined, played on and left
    // quiet again is quiet on its OWN account, not on the strength of a
    // stamp its own debaters falsified by coming back; it gets the
    // report button again rather than an ending nobody filed for it.
    var ended = context.state.endedAtMs > 0 && context.state.endedAtMs >= context.state.seatLastSeenMs;
    var html;
    if (isSpectator()){
      if (context.state.quietDone === 'ended' || ended){
        html = '<b>This round is over.</b>' +
          '<span class="rq-sub">Nobody is in the room. It has stopped showing as live.</span>' +
          '<span class="rq-row">' +
            '<a class="rq-btn" href="/live">Find a live round</a>' +
            '<a class="rq-btn rq-quiet" href="/spar">Debate someone yourself</a>' +
          '</span>';
      } else if (context.state.quietDone === 'still_live'){
        html = '<b>Reported.</b>' +
          '<span class="rq-sub">Someone is still seated, so the round stays open. The debaters can see that the audience thinks it is finished.</span>';
      } else if (context.state.quietDone === 'judged'){
        html = '<b>This round already has a decision.</b>' +
          '<span class="rq-sub">It finished properly. Scroll down for the decision.</span>';
      } else {
        html = '<b>Nobody has been in this room for ' + mins + ' ' + (mins === 1 ? 'minute' : 'minutes') + '.</b>' +
          '<span class="rq-sub">The debaters may have closed their tabs. You can say the round is over, which stops it showing as live to anyone else.</span>' +
          '<span class="rq-row">' +
            '<button type="button" class="rq-btn" id="rqReport"' + (context.state.quietBusy ? ' disabled' : '') + '>' +
              (context.state.quietBusy ? 'Reporting…' : 'Report the round as over') + '</button>' +
            '<a class="rq-btn rq-quiet" href="/live">Find another round</a>' +
          '</span>';
      }
    } else {
      // A seated debater alone in the room. They already have the
      // no-show prompt when the round has not started; this covers the
      // other half: an opponent who leaves MID-round. What is new is
      // that the audience's read reaches them, and that the round has an
      // ending they can reach from here — a clock running against an
      // empty chair used to have no way out except closing the tab,
      // which is what left finished debates advertising as live.
      var declared = !!(context.state.seatLeft && context.state.seatLeft[noShowOpponentUid()]);
      var judgeable = (context.state.log || []).some(function(l){
        return l && !l.skipped && l.text && String(l.text).trim().length > 40;
      });
      html = '<b style="letter-spacing:.05em">YOU ARE THE ONLY ONE HERE.</b>' +
        '<span class="rq-sub">' +
        (declared
          ? 'Your opponent left the round.'
          : 'Your opponent has not been seen for ' + mins + ' ' + (mins === 1 ? 'minute' : 'minutes') + '.') +
        ' Their seat is held, they can rejoin from the same link.' +
        (context.state.overReports > 0
          ? ' ' + context.state.overReports + ' in the audience ' + (context.state.overReports === 1 ? 'has' : 'have') + ' said this round looks over.'
          : '') + '</span>' +
        '<span class="rq-row">' +
          // The ballot costs a real model call and reads the transcript,
          // so it is only offered when speeches actually happened. An
          // abandoned room with nothing said in it has nothing to judge,
          // and pretending otherwise would put a verdict on silence.
          (judgeable
            ? '<button type="button" class="rq-btn" id="rqEnd">End the round and get the decision</button>'
            : '') +
          '<a class="rq-btn rq-quiet" href="/spar">Find someone else</a>' +
        '</span>';
    }
    if (el.innerHTML !== html){ el.innerHTML = html; }
    el.hidden = false;
    var btn = document.getElementById('rqReport');
    if (btn && !btn.dataset.wired){
      btn.dataset.wired = '1';
      btn.addEventListener('click', reportRoundOver);
    }
    var endBtn = document.getElementById('rqEnd');
    if (endBtn && !endBtn.dataset.wired){
      endBtn.dataset.wired = '1';
      endBtn.addEventListener('click', function(){
        // finishRound() is the ordinary end of every round: it stops the
        // recording, flips the doc to the ballot phase for both screens,
        // and judges the transcript as it stands. Nothing special-cases
        // an abandoned round, which is the point — the speeches that were
        // given are the speeches that get judged.
        try { gtag('event', 'live_round_end_after_walkout', { format: context.state.formatKey, speech: context.state.speechIdx }); } catch(e){}
        try { finishRound(); } catch(e){ console.warn('[quiet room] finishRound', e); }
      });
    }
  }

  return { watchersRef, startWatchPresence, markSeatLeft, startSpectatorBeat, noShowOpponentUid, checkOpponentPresence, tsMs, oppLastSeenMs, opponentHasLeft, noteOppGone, clearOppGone, noteOppSaidGone, roomIsQuiet, quietForMins, paintRoundQuiet };
  } };
})();
