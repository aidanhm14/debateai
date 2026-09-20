/* Live room timers. Dependencies are explicit; the page owns shared round state. */
(function(){
  window.DBLiveTimers = { create: function(context){
  var $ = function(){ return context.$.apply(this, arguments); };
  var clearFloorRemark = function(){ return context.clearFloorRemark.apply(this, arguments); };
  var conversationIsFinishing = function(){ return context.conversationIsFinishing.apply(this, arguments); };
  var fmtTime = function(){ return context.fmtTime.apply(this, arguments); };
  var foldAidesForSpeech = function(){ return context.foldAidesForSpeech.apply(this, arguments); };
  var getElapsed = function(){ return context.getElapsed.apply(this, arguments); };
  var getRoundDocRef = function(){ return context.getRoundDocRef.apply(this, arguments); };
  var hidePrepBanner = function(){ return context.hidePrepBanner.apply(this, arguments); };
  var hideStartCueReminder = function(){ return context.hideStartCueReminder.apply(this, arguments); };
  var holdMandatoryRecordingModal = function(){ return context.holdMandatoryRecordingModal.apply(this, arguments); };
  var isMyTurn = function(){ return context.isMyTurn.apply(this, arguments); };
  var isSpectator = function(){ return context.isSpectator.apply(this, arguments); };
  var judgeLockKey = function(){ return context.judgeLockKey.apply(this, arguments); };
  var liveJourney = function(){ return context.liveJourney.apply(this, arguments); };
  var openMode = function(){ return context.openMode.apply(this, arguments); };
  var pushRoomShot = function(){ return context.pushRoomShot.apply(this, arguments); };
  var renderExtUI = function(){ return context.renderExtUI.apply(this, arguments); };
  var renderJudgeDraft = function(){ return context.renderJudgeDraft.apply(this, arguments); };
  var restoreAidesAfterSpeech = function(){ return context.restoreAidesAfterSpeech.apply(this, arguments); };
  var setMicActive = function(){ return context.setMicActive.apply(this, arguments); };
  var showCloudRecordingConsent = function(){ return context.showCloudRecordingConsent.apply(this, arguments); };
  var toast = function(){ return context.toast.apply(this, arguments); };
  var updateJudgeOverview = function(){ return context.updateJudgeOverview.apply(this, arguments); };
  var updatePlayPauseBtn = function(){ return context.updatePlayPauseBtn.apply(this, arguments); };

  function drawTimer(){
    var elapsed = getElapsed();
    updateJudgeOverview();
    var remaining = context.state.timerTotalSec - elapsed;
    var num = $('timerNum'), bar = $('timerBar');
    if (!num) return;
    if (openMode()){
      // Just argue: elapsed, nothing else. No target, no warn, no
      // overtime note, no judge cutoff.
      num.textContent = fmtTime(elapsed);
      num.className = 'timer-num' + (context.state.timerState === 'paused' ? ' paused' : '');
      if (bar){ bar.style.width = '0%'; bar.className = 'timer-bar'; }
      var oc = $('rmbTimerNum');
      if (oc){ oc.textContent = num.textContent; oc.className = 'rmb-timer-num' + (context.state.timerState === 'paused' ? ' paused' : ''); }
      var on = $('overtimeNote'); if (on) on.hidden = true;
      return;
    }
    num.textContent = fmtTime(Math.max(0, Math.ceil(remaining)));
    var pct = Math.min(100, Math.max(0, 100 * elapsed / Math.max(1, context.state.timerTotalSec)));
    bar.style.width = pct + '%';
    var warnClass = '';
    if (context.state.timerState === 'paused') warnClass = 'paused';
    else if (remaining <= 0) warnClass = 'over';
    else if (remaining < 30 && context.state.timerState === 'running') warnClass = 'warn';
    num.className = 'timer-num' + (warnClass ? ' ' + warnClass : '');
    bar.className = 'timer-bar' + (warnClass && warnClass !== 'paused' ? ' ' + warnClass : '');
    var motionClock = $('rmbTimerNum');
    if (motionClock){
      motionClock.textContent = num.textContent;
      motionClock.className = 'rmb-timer-num' + (warnClass ? ' ' + warnClass : '');
    }
    // Overtime costs speaker points (judge prompts carry the scale), so
    // the room is told WHILE it is happening rather than discovering the
    // deduction on the ballot. Factual for everyone in the room; clears
    // itself when the speech ends or the clock resets.
    var otNote = $('overtimeNote');
    if (otNote){
      var showOt = context.state.timerState === 'running' && remaining < -context.OVERTIME_GRACE_SEC;
      if (showOt && otNote.hidden){
        otNote.textContent = 'Over time. From here the judge stops counting new arguments, and your score drops the longer this runs.';
        otNote.hidden = false;
      } else if (!showOt && !otNote.hidden){
        otNote.hidden = true;
      }
      // The judge cutoff (2026-08-31, the founder: "judge stops
      // considering"): the moment the grace runs out, the SPEAKER's
      // client records where the transcript stood. endSpeech splits the
      // text there with a [TIME EXPIRED] marker and every ballot builder
      // is told the material below it is off the flow. A granted
      // extension clears the mark (applyTimeExt), so words inside the
      // agreed window count.
      if (showOt && isMyTurn() && !isSpectator() && context.state.overCut[context.state.speechIdx] === undefined){
        var box = $('speechText');
        context.state.overCut[context.state.speechIdx] = box ? String(box.value || '').length : 0;
      }
    }
    try { renderExtUI(); } catch(e){}
  }

  function prepareTimer(targetSec){
    stopTimer();
    // Loading a new speech clears any stale talking-before-start reminder.
    try { hideStartCueReminder(); } catch(e){}
    context.state.timerTotalSec = targetSec;
    context.state._extApplied = 0;
    context.state.timerElapsed = 0;
    context.state.timerStart = 0;
    context.state.timerState = 'ready';
    drawTimer();
    updatePlayPauseBtn();
    var hint = $('readyHint');
    if (hint) hint.style.display = '';
  }

  function startSpeechTimer(){
    if (conversationIsFinishing()) return;
    liveJourney('speech_start_requested', { timer: context.state.timerState });
    if (context.state.isDuo && context.state.lastRoundDoc && context.state.lastRoundDoc.teamEnding) return;
    if (context.state.isDuo && !context.state.teamLockedAt){
      if (context.state.teamStartPending) return;
      if (!context.teamSeatControls){toast('Team seats are loading. Try again in a moment.');return;}
      context.state.teamStartPending = true;
      context.teamSeatControls.begin(context.state.formatKey).then(function(){
        context.state.teamStartPending = false; context.state.teamLockedAt = Date.now(); startSpeechTimer();
      }).catch(function(e){context.state.teamStartPending = false;toast(e.message);});
      return;
    }
    // The voice judge is a PRE-ROUND helper (2026-09-06, Aidan: "it cant
    // happen once a round has started"). Pressing Start is the decision
    // to argue the resolution on screen, so it sends the judge away rather
    // than being refused by it.
    if (window.RoomTopic && window.RoomTopic.isPending()){ try { window.RoomTopic.dismiss(); } catch(e){} }
    if (context.state.timerState === 'running' || context.state.timerState === 'ended') return;
    // A modal is not a security boundary. Tournament Speech 1 also stops
    // here unless the server-backed room state says the required capture
    // is already live. A tournament-shaped URL waits for the admission
    // response instead of briefly falling through as an ordinary room.
    if (context.state.phase === 'round' && context.state.speechIdx === 0 && !isSpectator()
        && context.state.recordingRequired !== false){
      if (context.state.recordingRequired === null){
        liveJourney('speech_start_blocked', { reason: 'recording_check' });
        toast('Checking the tournament recording before Speech 1.');
        return;
      }
      if (!context.cloudRec.doc || context.cloudRec.doc.recordingStatus !== 'recording'){
        liveJourney('speech_start_blocked', { reason: 'recording_consent' });
        showCloudRecordingConsent();
        if (context.cloudRec.doc && context.cloudRec.doc.recordingConsents
            && context.state.user && context.cloudRec.doc.recordingConsents[context.state.user.uid] === true){
          holdMandatoryRecordingModal();
        }
        toast('Speech 1 opens when the required tournament recording is live.');
        return;
      }
    }
    // 2026-08-18 (the founder): the judge has to be settled before the round
    // starts. judgeLockKey() is 'chair' when both benches sit on the
    // untouched default (that IS agreement, no friction added) and ''
    // only when the two picks differ, which is the one state the round
    // must not start in: someone would be judged by a lens they never
    // accepted. Speech 1 only; mid-round the picks are already locked.
    // The motion is not settled until the draft says it is. Starting on
    // it would run the round on a motion the strikes were about to
    // overrule, and rewrite both sides mid-speech when they landed.
    // ...and it has to SAY so. A bare return here reads as a dead button:
    // measured on real rounds, this is the beat where people press Start,
    // nothing happens, and they conclude the site is broken ("is button
    // not working?", "you have to start it bro, I don't know what to tell
    // you", "we should reload"). The draft is the normal path for every
    // spar-matched pair, so silence here is the common case, not the edge.
    if (context.state.phase === 'round' && context.state.speechIdx === 0 && !isSpectator()
        && window.__lrDraftPending && window.__lrDraftPending()){
      liveJourney('speech_start_blocked', { reason: 'topic_pending' });
      var dHint = $('readyHint');
      if (dHint){
        dHint.style.display = '';
        dHint.innerHTML = '<strong>Finish the draft first.</strong> '
          + 'One of you opened a motion draft, and the resolution is not settled until it closes. '
          + 'Then press Start to begin Speech 1.';
      }
      toast('The topic is still being chosen. Once it is settled, press Start.');
      var dBoard = document.getElementById('draftBoard');
      if (dBoard && dBoard.scrollIntoView) dBoard.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    if (context.state.phase === 'round' && context.state.speechIdx === 0 && !isSpectator() && !judgeLockKey()){
      liveJourney('speech_start_blocked', { reason: 'judge_agreement' });
      context.state.judgeDraftOpen = true;
      renderJudgeDraft();
      var jHint = $('readyHint');
      if (jHint){
        jHint.style.display = '';
        jHint.innerHTML = '<strong>Settle the judge first.</strong> You and your opponent picked different judge types. Pick the same option above, or reset to Standard. Then start the round.';
      }
      var jd = document.getElementById('judgeDraft');
      if (jd && jd.scrollIntoView) jd.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    hidePrepBanner();   // prep is over once a speech actually starts
    var wasReady = context.state.timerState === 'ready';
    context.state.timerStart = Date.now();
    context.state.timerState = 'running';
    liveJourney('speech_started', { mic_available: !!(context.state.micSupport && context.state.micSupport.available) });
    // While someone is actually speaking, the panel collapses to the two
    // things anyone looks at: the clock and the transcript. Everything
    // else in there is SETUP, and setup is over.
    document.body.classList.add('speech-live');
    document.body.classList.add('round-running');
    foldAidesForSpeech();
    context.state.timerInterval = setInterval(drawTimer, 200);
    drawTimer();
    updatePlayPauseBtn();
    var hint = $('readyHint');
    if (hint) hint.style.display = 'none';
    // A speech going live makes any between-speech judge remark stale.
    if (wasReady){ try { clearFloorRemark(); } catch(e){} }
    // Auto-engage the mic when the active speaker starts the speech.
    // Only on the ready→running transition (not on resume from pause —
    // if they hit pause they may have explicitly killed the mic) and
    // only when it's actually their turn (otherwise we're an off-side
    // viewer mirroring the timer state and shouldn't grab the mic).
    // Skipped on no-mic browsers + when the user has unticked the
    // 'Auto-mic' toggle in the speech panel.
    if (wasReady && isMyTurn() && !context.state.micActive && context.state.autoMic && context.state.micSupport && context.state.micSupport.available){
      try { setMicActive(true); } catch(e){ console.warn('[mic auto]', e); }
    }
    // Mirror the timer state to the off-side speaker. The remote peer
    // reads this and starts its own ticking display so they can see
    // the active speaker's clock count up.
    publishTimerState();
    // Refresh the public preview promptly when the debate actually starts.
    try { pushRoomShot(); } catch(e){}
  }

  function pauseSpeechTimer(){
    if (context.state.timerState !== 'running') return;
    context.state.timerElapsed += (Date.now() - context.state.timerStart) / 1000;
    context.state.timerStart = 0;
    context.state.timerState = 'paused';
    document.body.classList.remove('speech-live');
    document.body.classList.remove('round-running');
    restoreAidesAfterSpeech();
    if (context.state.timerInterval){ clearInterval(context.state.timerInterval); context.state.timerInterval = null; }
    drawTimer();
    updatePlayPauseBtn();
    publishTimerState();
  }

  function publishTimerState(){
    if (isSpectator()) return;
    if (!isMyTurn()) return;
    var ref = getRoundDocRef();
    if (!ref) return;
    var payload = {
      currentTimer: {
        speechIdx: context.state.speechIdx,
        state: context.state.timerState,
        startMs: context.state.timerState === 'running' ? context.state.timerStart : 0,
        accumulatedMs: Math.round(context.state.timerElapsed * 1000),
        totalSec: context.state.timerTotalSec,
        // updatedAtMs lets the off-side detect a stale timer from a
        // prior speech and ignore it across speech boundaries.
        updatedAtMs: Date.now(),
        updatedAtServer: firebase.firestore.FieldValue.serverTimestamp(),
      },
    };
    ref.set(payload, { merge: true }).catch(function(e){ console.warn('[timer sync]', e); });
  }

  function applyRemoteTimer(t){
    if (!t || typeof t !== 'object') return;
    if (t.speechIdx !== context.state.speechIdx) return; // stale from a prior speech
    if (t.state === 'running' && (!Number.isFinite(t.startMs) || t.startMs <= 0)) return;
    // Arrival time is not clock skew: a watcher may join minutes after
    // this write. Translate the original start via the shared server clock.
    context.state.remoteTimerPayload = t;
    context.state.timerTotalSec = t.totalSec || context.state.timerTotalSec;
    context.state.timerState = t.state || 'ready';
    context.state.timerElapsed = (t.accumulatedMs || 0) / 1000;
    context.state.timerStart = t.state === 'running'
      ? (window.DBRoomClock ? DBRoomClock.localStart(t) : t.startMs)
      : 0;
    if (context.state.timerInterval){ clearInterval(context.state.timerInterval); context.state.timerInterval = null; }
    if (context.state.timerState === 'running'){
      context.state.timerInterval = setInterval(drawTimer, 200);
      // Off-side mirror: the speech is live, drop any stale judge remark.
      try { clearFloorRemark(); } catch(e){}
    }
    // Setup is over for the person listening as well, so the settled
    // configuration collapses on their screen too. NOT speech-live: they
    // are not delivering anything, so their aides stay where they are.
    document.body.classList.toggle('round-running', context.state.timerState === 'running');
    drawTimer();
    updatePlayPauseBtn();
  }

  function stopTimer(){
    if (context.state.timerInterval){ clearInterval(context.state.timerInterval); context.state.timerInterval = null; }
    context.state.timerState = 'ended';
  }

  return { drawTimer, prepareTimer, startSpeechTimer, pauseSpeechTimer, publishTimerState, applyRemoteTimer, stopTimer };
  } };
})();
