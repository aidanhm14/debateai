/* Live room connection. Dependencies are explicit; the page owns shared round state. */
(function(){
  window.DBLiveConnection = { create: function(context){
  var aimJudgeEyes = function(){ return context.aimJudgeEyes.apply(this, arguments); };
  var armGuestWall = function(){ return context.armGuestWall.apply(this, arguments); };
  var buildRoomUI = function(){ return context.buildRoomUI.apply(this, arguments); };
  var camJoinNoVideoNotice = function(){ return context.camJoinNoVideoNotice.apply(this, arguments); };
  var dropTile = function(){ return context.dropTile.apply(this, arguments); };
  var ensureAvatarCam = function(){ return context.ensureAvatarCam.apply(this, arguments); };
  var liveJourney = function(){ return context.liveJourney.apply(this, arguments); };
  var myRoomName = function(){ return context.myRoomName.apply(this, arguments); };
  var noteOppSaidGone = function(){ return context.noteOppSaidGone.apply(this, arguments); };
  var onGuardCleared = function(){ return context.onGuardCleared.apply(this, arguments); };
  var paintRoom = function(){ return context.paintRoom.apply(this, arguments); };
  var paintTray = function(){ return context.paintTray.apply(this, arguments); };
  var publishTrackFor = function(){ return context.publishTrackFor.apply(this, arguments); };
  var reassertMask = function(){ return context.reassertMask.apply(this, arguments); };
  var removeAudio = function(){ return context.removeAudio.apply(this, arguments); };
  var showGuardReviewCard = function(){ return context.showGuardReviewCard.apply(this, arguments); };
  var startRoomShots = function(){ return context.startRoomShots.apply(this, arguments); };
  var teardownCamPipeline = function(){ return context.teardownCamPipeline.apply(this, arguments); };
  var tuneSendQuality = function(){ return context.tuneSendQuality.apply(this, arguments); };
  var wireAudienceReceiveSettings = function(){ return context.wireAudienceReceiveSettings.apply(this, arguments); };
  // Both optional: an older page (or a test fixture) may not supply them.
  var noteMyCallState = function(){ return context.noteMyCallState ? context.noteMyCallState.apply(this, arguments) : undefined; };
  var watchMicPermission = function(){ return context.watchMicPermission ? context.watchMicPermission.apply(this, arguments) : undefined; };

  // Why the microphone did not start, in the four shapes browsers actually
  // report. The kind is published to the round doc so the OTHER chair can
  // read it: a Daily participant list only says who is absent, never why,
  // and "Waiting for your opponent to connect" was the whole story for a
  // person who was on the page the entire time with a denied mic.
  function micFailKind(e){
    var n = (e && e.name) || '';
    if (n === 'NotAllowedError' || n === 'SecurityError' || n === 'PermissionDeniedError') return 'mic_blocked';
    if (n === 'NotReadableError' || n === 'AbortError' || n === 'TrackStartError') return 'mic_busy';
    if (n === 'NotFoundError' || n === 'OverconstrainedError' || n === 'DevicesNotFoundError') return 'mic_missing';
    return 'mic_failed';
  }
  function micFailCopy(kind){
    var tail = ' The round cannot start until you are in the call. Your opponent can see you are here.';
    if (kind === 'mic_blocked') return 'Allow microphone access for this site (the camera or lock icon beside the address bar), then rejoin. Camera access is optional.' + tail;
    if (kind === 'mic_busy') return 'Another app or tab is using your microphone. Close it, then rejoin.' + tail;
    if (kind === 'mic_missing') return 'No microphone was found. Plug one in or pick one in your browser settings, then rejoin.' + tail;
    return 'Allow microphone access for this site in your browser, or close another app using it. Then rejoin. Camera access is optional.' + tail;
  }

  function setRoomNote(msg){
    if (!context.room.note) return;
    context.room.note.classList.remove('cv-note--card');
    context.room.note.textContent = msg || '';
    context.room.note.style.display = msg ? '' : 'none';
  }

  function paintMediaHealth(){
    var el = context.room.qualityEl;
    if (!el) return;
    var msg = '';
    var bad = context.room.networkState === 'bad';
    if (bad){
      msg = context.room.viewer
        ? 'Poor connection. Keeping audio clear and lowering video quality.'
        : 'Poor connection. Video quality will adjust while audio stays prioritized.';
    } else if (context.room.networkState === 'warning'){
      msg = context.room.viewer
        ? 'Connection is unstable. Lowering video quality for smoother playback.'
        : 'Connection is unstable. Video quality is adjusting automatically.';
    } else if (context.room.cpuHigh){
      msg = context.room.viewer
        ? 'This device is busy. Lowering playback quality.'
        : 'This device is busy. Lowering camera quality.';
    }
    el.className = 'cv-quality' + (msg ? ' is-visible' : '') + (bad ? ' is-bad' : '');
    el.innerHTML = msg ? '<i aria-hidden="true"></i><span></span>' : '';
    var span = el.querySelector('span');
    if (span) span.textContent = msg;
  }

  function wantedReceiveCap(){
    if (context.room.networkState === 'bad') return 0;
    if (context.room.networkState === 'warning' || context.room.cpuHigh) return 1;
    return 'inherit';
  }

  function applyViewerReceiveCap(){
    var call = context.room.call;
    if (!context.room.viewer || !call || typeof call.updateReceiveSettings !== 'function') return;
    var cap = wantedReceiveCap();
    if (context.room.receiveCap === cap) return;
    context.room.receiveCap = cap;
    // Keep shared screens at the room default so small text stays legible.
    // Only camera video steps down under receiver pressure.
    var settings = { '*': { video: { layer: cap } } };
    try {
      var p = call.updateReceiveSettings(settings);
      if (p && p.catch) p.catch(function(e){ console.warn('[Daily receive settings]', e && e.message); });
    } catch(e){}
  }

  function rememberMediaHealth(){
    var key = context.room.networkState + '|' + (context.room.cpuHigh ? 'high' : 'low') + '|' + context.room.networkReasons.join(',');
    if (key === context.room.lastHealthKey) return;
    context.room.lastHealthKey = key;
    var call = context.room.call;
    var read = call && typeof call.getNetworkStats === 'function'
      ? call.getNetworkStats().catch(function(){ return null; })
      : Promise.resolve(null);
    read.then(function(result){
      // Local support hook only. Connection details never leave the tab.
      window.__lrMediaDiagnostics = {
        network: context.room.networkState,
        reasons: context.room.networkReasons.slice(0),
        cpu: context.room.cpuHigh ? 'high' : 'low',
        viewer: context.room.viewer,
        sdk: window.DebatableDaily ? window.DebatableDaily.version : '',
        source: window.DebatableDaily ? window.DebatableDaily.source() : '',
        stats: result && result.stats ? result.stats : null
      };
      console.info('[Daily media health]', window.__lrMediaDiagnostics);
    });
  }

  function onNetworkQuality(ev){
    var next = ev && ev.networkState;
    if (!next && ev && ev.threshold){
      next = ev.threshold === 'very-low' ? 'bad' : (ev.threshold === 'low' ? 'warning' : 'good');
    }
    if (['good','warning','bad','unknown'].indexOf(next) < 0) next = 'unknown';
    context.room.networkState = next;
    context.room.networkReasons = ev && Array.isArray(ev.networkStateReasons) ? ev.networkStateReasons.slice(0, 4) : [];
    applyViewerReceiveCap();
    paintMediaHealth();
    rememberMediaHealth();
  }

  function onCpuLoad(ev){
    context.room.cpuHigh = !!(ev && ev.cpuLoadState === 'high');
    if (context.room.viewer) applyViewerReceiveCap();
    else tuneSendQuality(context.room.cpuHigh ? 'medium' : 'high');
    paintMediaHealth();
    rememberMediaHealth();
  }

  function setRoomExit(title, sub){
    if (!context.room.note) return;
    context.room.note.innerHTML = '';
    context.room.note.classList.add('cv-note--card');
    var h = document.createElement('div');
    h.className = 'cv-exit-h'; h.textContent = title;
    var p = document.createElement('p');
    p.className = 'cv-exit-p'; p.textContent = sub;
    var row = document.createElement('div');
    row.className = 'cv-exit-row';
    var again = document.createElement('button');
    again.type = 'button';
    again.className = 'cv-exit-btn cv-exit-btn--go';
    again.textContent = 'Rejoin the room';
    again.addEventListener('click', function(){
      setRoomNote('Connecting to the video room.');
      joinRoomCall();
    });
    var back = document.createElement('a');
    back.className = 'cv-exit-btn';
    back.href = '/live';
    back.textContent = 'Back to the board';
    row.appendChild(again); row.appendChild(back);
    context.room.note.appendChild(h); context.room.note.appendChild(p); context.room.note.appendChild(row);
    context.room.note.style.display = '';
  }

  function joinWith(videoSource, audioSource){
    // The token key is OMITTED rather than set to undefined when there is
    // none: daily-js validates on the key's presence, so `token:undefined`
    // fails with "token should be a string" and takes the whole join with
    // it. Tokenless joins are a real case (create-daily-room returns no
    // token when Firebase is unreachable), so this is not hypothetical.
    var props = {
      url: context.state.dailyUrl,
      userName: context.room.viewer ? 'Watching' : myRoomName(),
      videoSource: videoSource,
    };
    // No device is opened for a watcher, in either direction. That is
    // what keeps the browser from ever asking them for a camera, and it
    // is also the only honest name to join under: the token already
    // carries hasPresence:false, so nobody in the round sees them at all.
    if (context.room.viewer) props.audioSource = false;
    else if (audioSource) props.audioSource = audioSource;
    if (typeof context.room.token === 'string' && context.room.token) props.token = context.room.token;
    return Promise.resolve(context.room.loadPending).then(function(){
      return context.room.call.join(props);
    }).then(function(r){
      tuneSendQuality();
      return r;
    }).catch(function(e){
      liveJourney('call_join_failed', { code: e.name || 'unknown' });
      console.warn('[Daily join]', e);
      noteMyCallState('join_failed');
      setRoomExit('Could not join the video room.',
        'Rejoin to start the round. Your opponent can see you are here.');
      context.room.joined = false;
      paintTray();
    });
  }

  function joinRoomCall(){
    if (!context.room.call || context.room.joined || context.room.joinPending) return;
    context.room.joinPending = true;
    if (context.room.fallbackAudioTrack){ context.room.fallbackAudioTrack.stop(); context.room.fallbackAudioTrack = null; }
    liveJourney('call_join_started');
    setRoomNote('Connecting to the video room.');
    // Daily's call engine is a second download after the small SDK. Load
    // it while the browser opens devices, without requesting any itself.
    var call = context.room.call;
    context.room.loadPending = Promise.resolve().then(function(){
      if (typeof call.load === 'function') return call.load();
    }).catch(function(e){
      // join() owns the visible retry/error path and can retry a failed load.
      liveJourney('call_preload_failed', { code: (e && e.name) || 'unknown' });
    });
    var pending;
    if (context.room.viewer){
      context.camConv.unified = false;
      pending = joinWith(false);
    } else {
      context.camConv.unified = true;
      // An unanswered browser permission prompt has no built-in timeout.
      // Keep it pending, but give the person an explanation after 10s.
      var permissionHint = setTimeout(function(){
        if (!context.room.joined){
          setRoomNote('Allow microphone access in your browser to join. Camera access is optional.');
          liveJourney('media_permission_wait');
          noteMyCallState('mic_pending');
        }
      }, 10000);
      pending = ensureAvatarCam('camera').then(function(c){
        clearTimeout(permissionHint);
        var audio = c.srcStream && c.srcStream.getAudioTracks()[0];
        var hasVideo = c.srcStream && c.srcStream.getVideoTracks().length;
        if (!audio || audio.readyState === 'ended') throw new Error('Microphone unavailable');
        liveJourney('media_ready', { camera: !!hasVideo, microphone: true });
        // Pass the capture already granted to us. Leaving audioSource out
        // asks Daily to open the microphone a second time, which can fail
        // on devices that cannot service two captures at once.
        return joinWith(hasVideo ? publishTrackFor(c, 'camera') : false, audio).then(function(){
          if (context.room.joined && !hasVideo) camJoinNoVideoNotice();
        });
      }).catch(function(e){
        clearTimeout(permissionHint);
        context.camConv.unified = false;
        context.camConv.camP = null;
        if (e.liveAudio && e.liveAudio.readyState !== 'ended'){
          context.room.fallbackAudioTrack = e.liveAudio;
          liveJourney('media_renderer_failed', { code: e.name || 'unknown' });
          return joinWith(false, e.liveAudio).then(function(){
            if (context.room.joined) camJoinNoVideoNotice();
            else { e.liveAudio.stop(); context.room.fallbackAudioTrack = null; }
          });
        }
        var kind = micFailKind(e);
        liveJourney('call_media_blocked', { code: e.name || 'unknown', kind: kind });
        noteMyCallState(kind);
        setRoomExit('Your microphone did not start.', micFailCopy(kind));
        context.room.joined = false;
        paintTray();
        // The moment the person allows the mic from the address bar, join
        // without asking them to find the Rejoin button.
        if (kind === 'mic_blocked') watchMicPermission();
      });
    }
    return Promise.resolve(pending).then(function(){ context.room.joinPending = false; });
  }

  function teardownRoom(){
    clearTimeout(context.room.viewerFocusTimer);
    context.room.viewerFocusTimer = null;
    context.room.viewerLead = '';
    context.room.viewerCandidate = '';
    if (context.room.fallbackAudioTrack){ context.room.fallbackAudioTrack.stop(); context.room.fallbackAudioTrack = null; }
    Object.keys(context.room.tiles).forEach(dropTile);
    Object.keys(context.room.audios).forEach(removeAudio);
    context.room.joined = false;
    context.room.networkState = 'unknown';
    context.room.networkReasons = [];
    context.room.cpuHigh = false;
    context.room.receiveCap = 'inherit';
    context.room.lastHealthKey = '';
    paintMediaHealth();
  }

  function mountCallObject(shell, token, viewer){
    var call = window.DailyIframe.createCallObject({ subscribeToTracksAutomatically: true });
    context.room.call = call;
    context.room.token = token || '';
    context.room.viewer = !!viewer;
    // state.dailyFrame is the handle every camera path publishes through.
    // A watcher has no camera to publish, and leaving it null is what
    // keeps the avatar pipeline, the flip, and the mask reassert from
    // finding anything to act on.
    if (!viewer) context.state.dailyFrame = call;
    // The link interceptor and the pop-out guard both read this. It stays
    // true for the call object: there is no iframe to look for, and
    // reparenting the pane into a Document PiP window would move every
    // <video> across documents mid-round.
    window.__lrDailyWrapper = true;
    buildRoomUI(shell);
    call.on('joined-meeting', function(){
      liveJourney('call_joined');
      context.room.joined = true;
      if (!context.room.viewer) noteMyCallState('joined');
      paintTray();
      setRoomNote('');
      armGuestWall();
      // The canvas track went in with join(), so there is nothing to
      // publish here. A camera on stage means the room still has a
      // picture worth posting to the homepage strip.
      if (!context.room.viewer){
        if (context.camConv.cam) startRoomShots();
        try { gtag('event', 'live_round_cam_unified'); } catch(e){}
      }
      paintRoom();
      if (window.__lrRefreshDraft) window.__lrRefreshDraft();
    });
    call.on('participant-joined', function(){
      paintRoom();
      if (window.__lrAnnounceDraft) window.__lrAnnounceDraft();
    });
    call.on('participant-updated', function(ev){ paintRoom(); if (!context.room.viewer) reassertMask(ev); });
    call.on('app-message', function(ev){
      var data = ev && ev.data;
      if (!data || typeof data !== 'object') return;
      if (data.t === 'topic-caption'){
        var topicSender = call.participants()[ev.fromId];
        if (topicSender && window.RoomTopic) window.RoomTopic.receive(data, topicSender.user_id);
        return;
      }
      if (data.t === 'guard-review'){ try { showGuardReviewCard(); } catch(e){} }
      else if (data.t === 'guard-clear'){ try { onGuardCleared(); } catch(e){} }
      else if (data.t === 'seat-left'){ try { noteOppSaidGone(data.uid); } catch(e){} }
      else if (data.t === 'draft-changed' && data.room === context.state.room){
        var sender = call.participants()[ev.fromId];
        if (sender && sender.user_id && (sender.user_id === context.state.proUid || sender.user_id === context.state.conUid)){
          if (window.__lrDraftChanged) window.__lrDraftChanged(data.revision);
        }
      }
    });
    call.on('participant-left', paintRoom);
    call.on('track-started', paintRoom);
    call.on('track-stopped', paintRoom);
    call.on('network-quality-change', onNetworkQuality);
    call.on('cpu-load-change', onCpuLoad);
    call.on('active-speaker-change', function(ev){
      context.room.active = (ev && ev.activeSpeaker && ev.activeSpeaker.peerId) || '';
      paintRoom();
      // paintRoom moves the .is-speaking class; the gaze follows it here
      // rather than waiting for the next timer transition, which is what
      // makes the judge look like it is tracking the room in real time.
      if (context.state.phase === 'round') { try { aimJudgeEyes(); } catch(e){} }
    });
    call.on('camera-error', function(ev){ console.warn('[Daily camera]', ev && ev.errorMsg); });
    call.on('error', function(ev){
      liveJourney('call_error', { code: (ev && ev.error && ev.error.type) || 'unknown' });
      console.warn('[Daily]', ev);
      if (!context.room.viewer) noteMyCallState('dropped');
      if (context.room.viewer){
        setRoomExit('The video dropped.',
          'The round carries on. Rejoin the video, or keep following the clock and the transcript.');
      } else {
        setRoomExit('The video room dropped.',
          'Your round is still running. Rejoin when you are ready, or carry on from the board.');
      }
      context.room.joined = false;
      paintTray();
    });
    call.on('left-meeting', function(){
      context.room.joined = false;
      teardownRoom();
      // The audience-camera path leaves and rejoins the same call object
      // to swap tokens; that leave is not the watcher stopping.
      if (context.room.viewer && context.audCam.rejoining) return;
      if (context.room.viewer){
        setRoomExit('You stopped watching the video.',
          'The round is still running. The clock, the transcript and the decision keep arriving here.');
      } else {
        noteMyCallState('left');
        teardownCamPipeline();
        setRoomExit('You left the video room.',
          'You are still in the round. Your speeches, the clock and the decision are unaffected.');
      }
      paintTray();
    });
    wireAudienceReceiveSettings(call);
    joinRoomCall();
    return call;
  }

  return { setRoomNote, paintMediaHealth, wantedReceiveCap, applyViewerReceiveCap, rememberMediaHealth, onNetworkQuality, onCpuLoad, setRoomExit, joinWith, joinRoomCall, teardownRoom, mountCallObject };
  } };
})();
