/* Live room media. Dependencies are explicit; the page owns shared round state. */
(function(){
  window.DBLiveMedia = { create: function(context){
  var checkOpponentPresence = function(){ return context.checkOpponentPresence.apply(this, arguments); };
  var clearOppGone = function(){ return context.clearOppGone.apply(this, arguments); };
  var dropTile = function(){ return context.dropTile.apply(this, arguments); };
  var ensureTile = function(){ return context.ensureTile.apply(this, arguments); };
  var hideSelfPip = function(){ return context.hideSelfPip.apply(this, arguments); };
  var hintTrack = function(){ return context.hintTrack.apply(this, arguments); };
  var isAssignedRoundSeat = function(){ return context.isAssignedRoundSeat.apply(this, arguments); };
  var isAudienceName = function(){ return context.isAudienceName.apply(this, arguments); };
  var isBoardShare = function(){ return context.isBoardShare.apply(this, arguments); };
  var isSilentWatcher = function(){ return context.isSilentWatcher.apply(this, arguments); };
  var liveJourney = function(){ return context.liveJourney.apply(this, arguments); };
  var markCamMode = function(){ return context.markCamMode.apply(this, arguments); };
  var noteOppGone = function(){ return context.noteOppGone.apply(this, arguments); };
  var paintRoundQuiet = function(){ return context.paintRoundQuiet.apply(this, arguments); };
  var paintTray = function(){ return context.paintTray.apply(this, arguments); };
  var publishTrackFor = function(){ return context.publishTrackFor.apply(this, arguments); };
  var seatLabel = function(){ return context.seatLabel.apply(this, arguments); };
  var setRoomNote = function(){ return context.setRoomNote.apply(this, arguments); };
  var showSelfPip = function(){ return context.showSelfPip.apply(this, arguments); };
  var startGuard = function(){ return context.startGuard.apply(this, arguments); };
  var toast = function(){ return context.toast.apply(this, arguments); };

  function captureConstraints(mode, facing){
    var avatar = mode === 'avatar';
    return {
      width: { ideal: avatar ? 640 : 1280 },
      height: { ideal: avatar ? 480 : 720 },
      frameRate: { ideal: 24, max: 30 },
      facingMode: facing && facing !== 'user' ? { ideal: facing } : 'user'
    };
  }

  function applyCaptureProfile(c, mode){
    var track = c && c.srcStream && c.srcStream.getVideoTracks && c.srcStream.getVideoTracks()[0];
    if (!track || typeof track.applyConstraints !== 'function') return Promise.resolve();
    return track.applyConstraints(captureConstraints(mode, context.room.facing || 'user')).catch(function(e){
      console.warn('[camera profile]', e && e.message);
    });
  }

  function tuneSendQuality(maxQuality){
    var call = context.room.call;
    if (context.room.viewer || !call || typeof call.updateSendSettings !== 'function') return;
    var avatar = context.camConv.mode === 'avatar';
    var settings = {
      video: {
        maxQuality: maxQuality || 'high',
        allowAdaptiveLayers: true,
        encodings: {
          low: { maxBitrate: 180000, scaleResolutionDownBy: 4, maxFramerate: 15 },
          medium: { maxBitrate: avatar ? 650000 : 800000, scaleResolutionDownBy: 2, maxFramerate: 24 },
          high: { maxBitrate: avatar ? 1400000 : 2200000, scaleResolutionDownBy: 1, maxFramerate: 24 }
        }
      }
    };
    try {
      var p = call.updateSendSettings(settings);
      if (p && p.catch) p.catch(function(e){ console.warn('[Daily send settings]', e && e.message); });
    } catch(e){}
  }

  function ensureAvatarCam(mode){
    // Single-flight on the PROMISE, not the resolved instance: the
    // joined-meeting unify call and a quick Avatar tap otherwise race
    // into two parallel pipelines (two camera captures, two draw loops,
    // and a published track that isn't the one in the self-check tile).
    if (context.camConv.camP) return context.camConv.camP;
    // Some in-app browsers expose no media API at all. The bare call below
    // then threw synchronously, which dropped the room onto Daily's own
    // call screen that this page cannot drive, so the round could never
    // start. A rejected promise takes the normal microphone-failure path
    // and its instructions instead.
    if (!navigator.mediaDevices || typeof navigator.mediaDevices.getUserMedia !== 'function'){
      var unsupported = new Error('This browser does not give web pages a microphone');
      unsupported.name = 'NotSupportedError';
      liveJourney('media_capture_failed', { code: 'NotSupportedError', scope: 'no_media_api' });
      return Promise.reject(unsupported);
    }
    // Camera pixels go to the room ONLY in 'camera' (passthrough) mode;
    // in 'avatar' mode they feed the on-device face tracker and nothing
    // else. Camera failure can degrade to audio-only; microphone failure
    // must remain visible so the person can allow it and retry.
    context.camConv.camP = navigator.mediaDevices.getUserMedia({ audio: true, video: captureConstraints(mode || 'camera', context.room.facing || 'user') })
      .catch(function(e){ liveJourney('media_capture_failed', { code: e.name || 'unknown', scope: 'camera_and_microphone' }); return navigator.mediaDevices.getUserMedia({ audio: true, video: false }); })
      .catch(function(e){ liveJourney('media_microphone_failed', { code: e.name || 'unknown' }); throw e; })
      .then(function(ms){
        return Promise.resolve().then(function(){ return window.DebateCam.start(ms, { mode: mode || 'avatar', label: seatLabel() }); }).catch(function(e){
          // The camera renderer can fail after microphone permission
          // succeeded. Preserve the working audio-only fallback.
          ms.getVideoTracks().forEach(function(t){ t.stop(); });
          if (context.room.joinPending) e.liveAudio = ms.getAudioTracks()[0];
          else ms.getAudioTracks().forEach(function(t){ t.stop(); });
          throw e;
        });
      })
      .then(function(c){ context.camConv.cam = c; startGuard(c); return c; })
      .catch(function(e){ context.camConv.camP = null; throw e; });
    return context.camConv.camP;
  }

  function retryCameraAcquire(){
    return navigator.mediaDevices.getUserMedia({ video: captureConstraints('camera', context.room.facing || 'user') })
      .then(function(vs){
        var old = context.camConv.cam;
        var vTrack = vs.getVideoTracks()[0];
        var audio = [];
        try {
          if (old && old.srcStream){
            old.srcStream.getAudioTracks().forEach(function(t){
              audio.push(t);
              // cam.stop() stops every track on its stream; pulling the
              // shared mic off first is what keeps it alive.
              try { old.srcStream.removeTrack(t); } catch(e){}
            });
          }
        } catch(e){}
        var combined = new MediaStream([vTrack].concat(audio));
        context.camConv.camP = Promise.resolve()
          .then(function(){ if (old) try { old.stop(); } catch(e){} })
          .then(function(){ return window.DebateCam.start(combined, { mode: 'camera', label: seatLabel() }); })
          .then(function(c){ context.camConv.cam = c; startGuard(c); return c; })
          .catch(function(e){ context.camConv.camP = null; throw e; });
        return context.camConv.camP;
      });
  }

  function camDeniedToast(){
    var generic = 'Could not start your camera. If nothing asked for permission, it is blocked for this site: click the camera or padlock icon in the address bar, allow it, then press Camera again.';
    try {
      if (navigator.permissions && navigator.permissions.query){
        navigator.permissions.query({ name: 'camera' }).then(function(st){
          toast(st.state === 'denied'
            ? 'Your camera is blocked for this site. Click the camera or padlock icon in the address bar, allow it, then press Camera again.'
            : 'Could not start your camera. It may be in use by another app. Close anything else using it, then press Camera again.');
        }).catch(function(){ toast(generic); });
        return;
      }
    } catch(e){}
    toast(generic);
  }

  function camJoinNoVideoNotice(){
    if (context.camJoinNoticeShown) return;
    context.camJoinNoticeShown = true;
    toast('You joined with your mic only. Your camera looks blocked or busy; press Camera above the video to turn it on.');
    try { gtag('event', 'live_round_join_no_video'); } catch(e){}
  }

  function setCamMode(m){
    var frame = context.state.dailyFrame;
    if (!frame || m === context.camConv.mode) return;
    if (m === 'avatar'){
      // Fail CLOSED, never open. The mask cannot be published on this
      // surface (see CUSTOM_TRACK_OK), and the honest state for someone
      // asking to be anonymous is camera off, not camera on.
      if (!context.CUSTOM_TRACK_OK){
        if (context.camConv.cam) try { context.camConv.cam.setMode('off'); } catch(e){}
        try { frame.setLocalVideo(false); } catch(e){}
        markCamMode('off');
        hideSelfPip();
        toast('Avatar mode is off while the room is rebuilt to carry it. Your camera is off, so nothing is being sent.');
        return;
      }
      if (!window.DebateCam){ toast('Avatar mode is still loading, try again in a second'); return; }
      frame.getInputDevices().then(function(d){
        if (d && d.camera && d.camera.deviceId) context.camConv.savedVideoId = d.camera.deviceId;
      }).catch(function(){});
      ensureAvatarCam('avatar').then(function(c){
        return applyCaptureProfile(c, 'avatar').then(function(){
          c.setMode('avatar');
          return frame.setInputDevicesAsync({ videoSource: publishTrackFor(c, 'avatar') });
        });
      }).then(function(){
        frame.setLocalVideo(true);
        markCamMode('avatar');
        tuneSendQuality(context.room.cpuHigh ? 'medium' : 'high');
        context.camConv.maskAsserted = true;
        showSelfPip();
        toast('Avatar on. The room sees only the animated mask, never your camera. The corner tile is your view of it.');
        try { gtag('event', 'live_round_avatar_on'); } catch(e){}
      }).catch(function(e){
        console.warn('[avatar]', e);
        // Fail CLOSED. If the mask cannot be published, the honest state
        // is camera off, never the raw feed under an Avatar label.
        try { frame.setLocalVideo(false); } catch(e2){}
        if (context.camConv.cam) try { context.camConv.cam.setMode('off'); } catch(e3){}
        markCamMode('off');
        hideSelfPip();
        toast('Avatar could not start here, so your camera was turned off instead');
      });
    } else if (m === 'camera'){
      // Preferred: passthrough through the parent-owned canvas so the
      // safety watchdog sees what the room sees. Fall back to Daily's
      // internal device restore if the pipeline is unavailable.
      // The old gate here (camConv.cam || camConv.unified !== false)
      // routed a fully-degraded join into the raw cycleCamera branch,
      // which publishes the DEVICE camera past the parent pipeline and
      // its safety watchdog. While the custom stack exists, Camera
      // always goes through the pipeline; the retry inside covers the
      // degraded case properly.
      if (context.CUSTOM_TRACK_OK && window.DebateCam){
        ensureAvatarCam('camera').then(function(c){
          var hasVideo = c.srcStream && c.srcStream.getVideoTracks && c.srcStream.getVideoTracks().length;
          // Cached audio-only pipeline: the camera half failed at join.
          // Re-ask for the camera now, in the click's gesture context.
          if (!hasVideo) return retryCameraAcquire();
          return c;
        }).then(function(c){
          return applyCaptureProfile(c, 'camera').then(function(){
            c.setMode('camera');
            return frame.setInputDevicesAsync({ videoSource: publishTrackFor(c, 'camera') }).then(function(){
              frame.setLocalVideo(true);
              markCamMode('camera');
              tuneSendQuality(context.room.cpuHigh ? 'medium' : 'high');
              hideSelfPip();
            });
          });
        }).catch(function(e){
          console.warn('[camera passthrough]', e);
          camDeniedToast();
        });
      } else {
        var restore = context.camConv.savedVideoId
          ? frame.setInputDevicesAsync({ videoDeviceId: context.camConv.savedVideoId })
          : frame.cycleCamera();
        Promise.resolve(restore).then(function(){
          frame.setLocalVideo(true);
          markCamMode('camera');
          tuneSendQuality(context.room.cpuHigh ? 'medium' : 'high');
          hideSelfPip();
        }).catch(function(e){
          console.warn('[camera restore]', e);
          camDeniedToast();
        });
      }
    } else {
      if (context.camConv.cam) try { context.camConv.cam.setMode('off'); } catch(e){}
      frame.setLocalVideo(false);
      markCamMode('off');
      hideSelfPip();
      toast('Camera off. Your mic is unaffected.');
    }
  }

  function reassertMask(ev){
    var p = ev && ev.participant;
    if (!p || !p.local) return;
    if (context.camConv.mode !== 'avatar' || !context.camConv.cam || !context.state.dailyFrame) return;
    var v = p.tracks && p.tracks.video;
    if (!v || v.state !== 'playable'){ context.camConv.maskAsserted = false; return; }
    var live = v.persistentTrack || v.track || null;
    if (live && context.camConv.cam.videoTrack && live.id === context.camConv.cam.videoTrack.id){
      context.camConv.maskAsserted = true;
      return;
    }
    // Track objects can be withheld across the iframe boundary; when we
    // cannot compare ids, re-assert only on the off -> playable edge.
    if (!live && context.camConv.maskAsserted) return;
    var now = Date.now();
    if (context.camConv.reassertAt && now - context.camConv.reassertAt < 1500) return;
    context.camConv.reassertAt = now;
    context.camConv.maskAsserted = true;
    context.state.dailyFrame.setInputDevicesAsync({ videoSource: hintTrack(context.camConv.cam.videoTrack, 'avatar') })
      .catch(function(e){ console.warn('[avatar reassert]', e); });
  }

  function teardownCamPipeline(){
    hideSelfPip();
    if (context.modGuard){ try { context.modGuard.stop(); } catch(e){} context.modGuard = null; }
    if (context.camConv.cam){ try { context.camConv.cam.stop(); } catch(e){} }
    context.camConv.cam = null; context.camConv.camP = null; context.camConv.unified = false;
    context.camConv.maskAsserted = false;
    markCamMode('camera');
  }

  function trackOf(slot){
    if (!slot || slot.state !== 'playable') return null;
    return slot.persistentTrack || slot.track || null;
  }

  function playbackTrack(slot){
    if (!slot || ['playable','loading','interrupted'].indexOf(slot.state) < 0 || slot.subscribed === false) return null;
    var track = slot.persistentTrack || slot.track;
    return track && track.readyState !== 'ended' ? track : null;
  }

  function attachTrack(el, track, play){
    if (!track){
      if (el.srcObject) el.srcObject = null;
      return;
    }
    var cur = el.srcObject && el.srcObject.getTracks && el.srcObject.getTracks()[0];
    if (cur && cur.id === track.id) return;
    el.srcObject = new MediaStream([track]);
    if (play) { play(el); return; }
    var p = el.play && el.play();
    if (p && p.catch) p.catch(function(){});
  }

  function paintTile(t, p, opts){
    var name = (opts.screen ? 'Screen · ' : '') + (p.user_name || (p.local ? 'You' : 'Debater'));
    if (p.local && !opts.screen){
      name = (p.user_name || 'You') + ' (you)';
      // This tile renders the track the room is receiving, so in Avatar
      // mode it is also the proof that the mask is what went out.
      if (context.camConv.mode === 'avatar') name += ' · what the room sees';
    }
    if (t.name.textContent !== name) t.name.textContent = name;
    var letter = (String(p.user_name || 'D').trim().charAt(0) || 'D').toUpperCase();
    if (t.initial.textContent !== letter) t.initial.textContent = letter;
    var slot = opts.screen ? (p.tracks && p.tracks.screenVideo) : (p.tracks && p.tracks.video);
    // Keep the decoder attached through a transient interruption. Off,
    // blocked and unsubscribed media still clear immediately.
    var track = playbackTrack(slot);
    attachTrack(t.video, track);
    t.el.classList.toggle('is-dark', !track);
    t.el.classList.toggle('is-screen', !!opts.screen);
    t.el.classList.toggle('is-self', !!p.local && !opts.screen);
    t.el.classList.toggle('is-speaking', !opts.screen && !!context.room.active && context.room.active === p.session_id);
    // The local tile mirrors in camera mode because a self-view that does
    // not mirror reads as someone else. The avatar canvas carries baked
    // text, so mirroring it would render that text backwards.
    t.el.classList.toggle('is-mirror', !!p.local && !opts.screen && context.camConv.mode === 'camera');
    var muted = !opts.screen && !p.local && !trackOf(p.tracks && p.tracks.audio);
    t.muted.style.display = muted ? '' : 'none';
  }

  var blockedAudio = new Map();
  var soundButton = null;

  function paintSoundButton(){
    blockedAudio.forEach(function(stream, audio){
      if (!audio.isConnected || audio.srcObject !== stream) blockedAudio.delete(audio);
    });
    if (!blockedAudio.size){
      if (soundButton) soundButton.remove();
      soundButton = null;
      return;
    }
    if (!soundButton && context.room.wrap){
      soundButton = document.createElement('button');
      soundButton.type = 'button';
      soundButton.className = 'cv-btn cv-sound';
      soundButton.textContent = 'Enable sound';
      soundButton.title = 'Your browser paused the audio. Enable sound to hear the room.';
      soundButton.addEventListener('click', function(){
        // Every play() must run inside this gesture, before awaiting any
        // of them. A successful speaker must not hide a still-blocked one.
        Object.keys(context.room.audios).forEach(function(key){ playRoomAudio(context.room.audios[key]); });
      });
      context.room.wrap.appendChild(soundButton);
    }
  }

  function playRoomAudio(audio){
    var stream = audio.srcObject;
    if (!stream) return;
    var attempt = {};
    audio._lrPlayAttempt = attempt;
    var pending;
    try { pending = audio.play(); } catch(e){ pending = Promise.reject(e); }
    Promise.resolve(pending).then(function(){
      if (audio._lrPlayAttempt !== attempt || audio.srcObject !== stream) return;
      blockedAudio.delete(audio);
      paintSoundButton();
    }).catch(function(e){
      // Track swaps and teardown abort old plays. They must not bring a
      // sound prompt back after a replacement stream has started.
      if (audio._lrPlayAttempt !== attempt || audio.srcObject !== stream || !audio.isConnected) return;
      if (e && e.name === 'AbortError') return;
      blockedAudio.set(audio, stream);
      paintSoundButton();
    }).finally(function(){
      if (audio._lrPlayAttempt === attempt) audio._lrPlayAttempt = null;
    });
  }

  function removeAudio(sid){
    blockedAudio.delete(context.room.audios[sid]);
    try { context.room.audios[sid].srcObject = null; context.room.audios[sid].remove(); } catch(e){}
    delete context.room.audios[sid];
    paintSoundButton();
  }

  function paintAudio(list){
    var seen = {};
    list.forEach(function(p){
      if (p.local) return;
      // The mic, plus the voice judge the topic host publishes as a
      // custom track named "judge" (js/room-topic.js, 2026-09-06). Same
      // element rules: one <audio> per track, never for ourselves.
      [['audio', p.tracks && p.tracks.audio], ['judge', p.tracks && p.tracks.judge]].forEach(function(pair){
        var track = playbackTrack(pair[1]);
        if (!track) return;
        var key = pair[0] === 'audio' ? p.session_id : p.session_id + ':' + pair[0];
        seen[key] = true;
        var a = context.room.audios[key];
        if (!a){
          a = document.createElement('audio');
          a.autoplay = true; a.playsInline = true;
          a.setAttribute('playsinline', '');
          a.addEventListener('playing', function(){
            blockedAudio.delete(this);
            paintSoundButton();
          });
          context.room.audioHost.appendChild(a);
          context.room.audios[key] = a;
        }
        attachTrack(a, track, playRoomAudio);
        if (a.paused && !a._lrPlayAttempt && !blockedAudio.has(a)) playRoomAudio(a);
      });
    });
    Object.keys(context.room.audios).forEach(function(sid){
      if (seen[sid]) return;
      removeAudio(sid);
    });
  }

  function orderViewerSeats(seats){
    var room = context.room;
    var current = seats.filter(function(p){ return p.session_id === room.viewerLead; })[0];
    var active = seats.filter(function(p){ return p.session_id === room.active && playbackTrack(p.tracks && p.tracks.video); })[0];
    var camera = seats.filter(function(p){ return playbackTrack(p.tracks && p.tracks.video); })[0];
    if (!current || (!playbackTrack(current.tracks && current.tracks.video) && camera)){
      current = active || camera || seats[0];
      room.viewerLead = current ? current.session_id : '';
    }
    // A cough or brief interjection should not swap the full-size picture.
    // The speaking border remains immediate; only the audience focus waits.
    var candidate = active && active.session_id !== room.viewerLead ? active.session_id : '';
    if (candidate !== room.viewerCandidate){
      clearTimeout(room.viewerFocusTimer);
      room.viewerCandidate = candidate;
      room.viewerFocusTimer = candidate ? setTimeout(function(){
        room.viewerLead = candidate;
        room.viewerCandidate = '';
        room.viewerFocusTimer = null;
        paintRoom();
      }, 800) : null;
    }
    return seats.slice().sort(function(a, b){
      if (a.session_id === room.viewerLead) return -1;
      if (b.session_id === room.viewerLead) return 1;
      return 0;
    });
  }

  function paintRoom(){
    var call = context.room.call;
    if (!call || !context.room.stage) return;
    var ps;
    try { ps = call.participants() || {}; } catch(e){ return; }
    var list = [], seats = [], auds = [], screens = [];
    Object.keys(ps).forEach(function(k){
      var p = ps[k];
      if (!p || !p.session_id) return;
      if (isSilentWatcher(p)) return;
      list.push(p);
      if (isAudienceName(p.user_name)) auds.push(p); else seats.push(p);
      if (playbackTrack(p.tracks && p.tracks.screenVideo) && !isBoardShare(p)) screens.push(p);
    });
    // 2026-09-01, the founder off a screenshot of himself twice in one
    // room ("dont make this double camera option possible"): a person
    // whose earlier tab or connection has not been reaped yet shows up
    // as a SECOND tile with their name and a black picture, and the grid
    // dutifully grows to three. One person is one tile. Records sharing
    // a user_id collapse to the one that is local, else the one with a
    // live camera, else the newest. The dropped record leaves the audio
    // list too, so a ghost cannot double a voice either.
    (function dedupeByIdentity(){
      var byUid = {};
      seats.forEach(function(p){
        var uid = p.user_id || '';
        if (!uid) return;
        (byUid[uid] = byUid[uid] || []).push(p);
      });
      var drop = {};
      Object.keys(byUid).forEach(function(uid){
        var group = byUid[uid];
        if (group.length < 2) return;
        group.sort(function(a, b){
          var al = a.local ? 1 : 0, bl = b.local ? 1 : 0;
          if (al !== bl) return bl - al;
          var av = playbackTrack(a.tracks && a.tracks.video) ? 1 : 0;
          var bv = playbackTrack(b.tracks && b.tracks.video) ? 1 : 0;
          if (av !== bv) return bv - av;
          return (b.joined_at ? +new Date(b.joined_at) : 0) - (a.joined_at ? +new Date(a.joined_at) : 0);
        });
        group.slice(1).forEach(function(p){ drop[p.session_id] = true; });
      });
      if (!Object.keys(drop).length) return;
      var keepP = function(p){ return !drop[p.session_id]; };
      seats = seats.filter(keepP);
      screens = screens.filter(keepP);
      list = list.filter(keepP);
    })();
    // A watcher is not on the stage. Their own participant record exists
    // (they are joined, just sending nothing), and rendering it is what
    // put an empty "Guest (You)" tile in front of every round.
    if (context.room.viewer){
      var notMe = function(p){ return !p.local; };
      seats = seats.filter(notMe);
      screens = screens.filter(notMe);
      auds = auds.filter(notMe);
      var assigned = seats.filter(isAssignedRoundSeat);
      // Require a complete known pair before excluding unmatched records.
      // With only one known name in a legacy room, keeping the fallback is
      // better than hiding the other actual speaker. A normal 1v1 has both
      // names or both UIDs and drops any third record here.
      if (context.state.isDuo || assigned.length >= Math.min(2, seats.length)) seats = assigned;
    }
    // Stable DOM order also keeps the two phone seats from trading places.
    // Desktop audience focus changes through a CSS slot, never a DOM move.
    seats.sort(function(a, b){
      if (!!a.local !== !!b.local) return a.local ? 1 : -1;
      return String(a.session_id) < String(b.session_id) ? -1 : 1;
    });
    if (context.room.viewer){
      var seatLimit = context.state.isDuo ? 4 : 2;
      seats = seats.slice(0, seatLimit);
    }
    var viewerOrder = context.room.viewer ? orderViewerSeats(seats) : [];
    var keep = {};
    screens.forEach(function(p){
      var key = 'screen:' + p.session_id;
      keep[key] = true;
      paintTile(ensureTile(context.room.stage, key, p.local), p, { screen:true });
    });
    seats.forEach(function(p){
      var key = 'seat:' + p.session_id;
      keep[key] = true;
      var t = ensureTile(context.room.stage, key, p.local);
      paintTile(t, p, {});
      if (context.room.viewer){
        var slot = String(viewerOrder.indexOf(p));
        if (t.el.getAttribute('data-viewer-slot') !== slot) t.el.setAttribute('data-viewer-slot', slot);
      }
    });
    auds.forEach(function(p){
      var key = 'aud:' + p.session_id;
      keep[key] = true;
      paintTile(ensureTile(context.room.aud, key, p.local), p, {});
    });
    Object.keys(context.room.tiles).forEach(function(key){ if (!keep[key]) dropTile(key); });
    /* Self view, 2026-08-19 per the founder ("make it small or hideable"): in a
       plain 1v1 with nothing shared, the local tile leaves the grid and
       becomes a corner thumbnail so the opponent holds the whole stage.
       It is left in the grid for 2v2, for a real screen share, and in the
       mini/pip shells, all of which have their own cramped layouts.
       Because the tile goes out of flow, it also comes out of data-n, or
       the grid keeps a column open for a tile that is no longer in it. */
    // 2026-09-03 (the founder's phone sketch): on a phone both seats stay in
    // the flow side by side and the speaker's tile grows, so the corner
    // self-view is desktop only.
    var phoneTiles = !!(window.matchMedia && window.matchMedia('(max-width:900px)').matches);
    var mini = !context.room.viewer && seats.length === 2 && screens.length === 0 && !context.room.selfHidden && !phoneTiles
      && !document.body.classList.contains('lr-mini')
      && !document.body.classList.contains('lr-pip');
    context.room.stage.classList.toggle('self-mini', mini);
    context.room.stage.classList.toggle('self-off', !context.room.viewer && !!context.room.selfHidden);
    var inFlow = seats.length + screens.length
      - ((mini || context.room.selfHidden) ? seats.filter(function(p){ return p.local; }).length : 0);
    context.room.stage.setAttribute('data-n', String(Math.max(1, inFlow)));
    context.room.stage.classList.toggle('has-screen', screens.length > 0);
    paintAudio(list);
    var local = ps.local;
    // The board publishes through the local screen track, so this used to
    // read true whenever a recording was running and the tray offered
    // "Stop sharing" for a share the debater never started. Pressing it
    // would have torn the layout out of the recording mid-round.
    context.room.boardLocal = !!(local && trackOf(local.tracks && local.tracks.screenVideo) && isBoardShare(local));
    context.room.sharing = !!(local && trackOf(local.tracks && local.tracks.screenVideo)) && !context.room.boardLocal;
    if (local && local.tracks && local.tracks.audio) context.room.micOn = local.audio !== false;
    paintTray();
    // Live participant truth feeds the presence prompts: the round doc's
    // 30s seat beat can lag a real join by several seconds, and the
    // "Looking for your debater" strip has sat on screen while the
    // opponent was already on camera. Audience cams were split out of
    // `seats` above, so a remote seat here is a debater.
    var remoteSeats = seats.filter(function(p){ return !p.local; }).length;
    if (remoteSeats > 0) context.room.everHadRemote = true;
    if (context.room.remoteSeats !== remoteSeats){
      var wasSeated = context.room.remoteSeats > 0;
      context.room.remoteSeats = remoteSeats;
      // The video room is the fastest thing this page can observe about
      // somebody walking out: Daily drops their participant in about a
      // second, where the seat beat takes a beat and an unannounced
      // departure used to take the full quiet window. Leaving the CALL is
      // not leaving the ROUND, though (the tray's Leave call keeps you in
      // it), so this only starts a short clock. opponentHasLeft() still
      // requires their heartbeat to have stopped with it.
      if (wasSeated && remoteSeats === 0) noteOppGone(12000);
      else if (remoteSeats > 0) clearOppGone();
      try { checkOpponentPresence(); } catch(e){}
      try { paintRoundQuiet(); } catch(e){}
    }
    // "Waiting to join" is wrong once someone HAS been here: an opponent
    // who drops mid-round gets a message that says what happened instead
    // of the fresh-room copy.
    if (context.room.joined && context.room.viewer){
      setRoomNote(seats.length ? '' : 'Waiting for the debaters to turn their cameras on.');
    } else if (context.room.joined) setRoomNote(seats.length > 1 ? ''
      : (context.room.everHadRemote
        ? 'Your opponent’s connection dropped. Their seat is held; they can rejoin from the same link.'
        : 'Waiting for the other debater to join.'));
  }

  function flipCamera(){
    if (!context.CUSTOM_TRACK_OK || !window.DebateCam || !context.state.dailyFrame || context.room.cameraFlipPending) return;
    context.room.cameraFlipPending = true;
    var btn = document.getElementById('cvFlip');
    if (btn) btn.disabled = true;
    var want = context.room.facing === 'user' ? 'environment' : 'user';
    var mode = context.camConv.mode === 'avatar' ? 'avatar' : 'camera';
    var old = context.camConv.cam;
    var frame = context.state.dailyFrame;
    var replacement = null, source = null;
    var audio = old && old.srcStream ? old.srcStream.getAudioTracks() : [];
    if (!audio.length && context.room.fallbackAudioTrack) audio = [context.room.fallbackAudioTrack];
    // A flip changes only video. A second microphone was never published,
    // and stopping the old pipeline ended the microphone Daily still sent.
    return navigator.mediaDevices.getUserMedia({ audio: false, video: captureConstraints(mode, want) })
      .then(function(ms){
        source = ms;
        if (context.camConv.cam !== old || context.state.dailyFrame !== frame) throw new Error('Camera changed during switch');
        audio.forEach(function(t){ if (t.readyState !== 'ended') ms.addTrack(t); });
        return window.DebateCam.start(ms, { mode: mode, label: seatLabel() });
      })
      .then(function(c){
        replacement = c;
        if (context.camConv.cam !== old || context.state.dailyFrame !== frame) throw new Error('Camera changed during switch');
        return frame.setInputDevicesAsync({ videoSource: publishTrackFor(c, mode) }).then(function(){
          if (context.camConv.cam !== old || context.state.dailyFrame !== frame) throw new Error('Camera changed during switch');
          context.camConv.cam = c;
          context.camConv.camP = Promise.resolve(c);
          context.room.facing = want;
          // Transfer ownership before stop(), which closes every source track.
          if (old && old.srcStream) audio.forEach(function(t){ old.srcStream.removeTrack(t); });
          if (old && old !== c) try { old.stop(); } catch(e){}
          replacement = null; source = null;
          startGuard(c);
          if (context.camConv.mode !== 'off') frame.setLocalVideo(true);
          tuneSendQuality(context.room.cpuHigh ? 'medium' : 'high');
          if (context.camConv.mode === 'avatar') showSelfPip();
          paintRoom();
        });
      })
      .catch(function(e){
        // A rejected replacement leaves the existing camera and mic intact.
        if (source) audio.forEach(function(t){ source.removeTrack(t); });
        if (replacement) try { replacement.stop(); } catch(e2){}
        if (source) source.getVideoTracks().forEach(function(t){ t.stop(); });
        console.warn('[flip camera]', e);
        toast('Could not switch cameras');
      })
      .then(function(){ context.room.cameraFlipPending = false; if (btn) btn.disabled = false; });
  }

  return { captureConstraints, applyCaptureProfile, tuneSendQuality, ensureAvatarCam, retryCameraAcquire, camDeniedToast, camJoinNoVideoNotice, setCamMode, reassertMask, teardownCamPipeline, trackOf, attachTrack, paintTile, removeAudio, paintAudio, paintRoom, flipCamera };
  } };
})();
