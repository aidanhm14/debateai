// The voice judge that helps two people pick a resolution (2026-09-06).
//
// One seat taps Let AI suggest. This browser (the HOST) dials OpenAI
// Realtime over WebRTC, feeds it a mix of the host's own mic and the
// opponent's Daily audio, plays the judge's voice locally, and publishes
// that same voice into the Daily room as a custom audio track named
// "judge" so the opponent and any spectators hear it too. The judge
// greets the room, asks what they want to argue about, and calls the
// propose_motion tool; the host relays that to /api/room-topic, the
// round doc carries the proposal, and each seat gets a one-tap Use it
// over the cameras, alongside a live transcript of the judge.
//
// The 09-02 modal (consent step, textarea, "I am ready" button) is gone.
// See lib/room-topic.mjs for the founder's verdict on it.
(function () {
  'use strict';
  if (window.RoomTopic) return;
  var talk = null, strip = null, signature = '', busy = false, opening = false;
  var voice = null, warm = null, lifecycle = 0, dismissedId = '';
  var blockedSound = null, soundButton = null;
  var caption = { text: '', item: '', status: 'Connecting', seq: 0 }, captionText = null, captionStatus = null;
  // VAD commits room audio after one second; the client then waits another
  // four uninterrupted seconds. Every speaker gets the same right to the floor.
  var QUIET_MS = 4000;
  var LISTEN_REPLY = 'Use the whole conversation so far, including corrections and changes of subject. The room has paused. If they are still thinking or talking to each other, stay silent. If you have only heard one view, invite the other perspective briefly. Suggest only when you understand the tension, or ask one useful question. Do not repeat a suggestion or fill the pause with acknowledgements.';
  // Nudge timers, host only. The judge is a pre-round helper, so while
  // people just chat it reminds them, casually, that the round is one tap
  // away: Start conversation (no clock) or Start timed speeches.
  var nudge = { timer: null, count: 0, key: '' };
  function clearNudge() { clearTimeout(nudge.timer); nudge.timer = null; }
  function armNudge(key, delay, instructions, max) {
    if (!voice || !voice.dc || voice.dc.readyState !== 'open' || !isHost()) return;
    if (nudge.key === key && nudge.timer !== null) return;
    if (nudge.key !== key) { nudge.count = 0; nudge.key = key; }
    clearNudge();
    if (nudge.count >= max) return;
    nudge.timer = setTimeout(function() {
      nudge.timer = null;
      if (!voice || !talk || !active(talk) || !ctx().canChoose) return;
      if (say(instructions, 'nudge')) nudge.count += 1;
      armNudge(key, delay, instructions, max);
    }, delay);
  }
  function armTalkNudge() {
    if (!talk || !active(talk)) return;
    if (talk.phase === 'listening') {
      armNudge('listen:' + talk.id, 75000, 'They have been chatting a while. In one casual line under twenty words, remind them you can suggest a topic whenever they land on a disagreement, or they can just tap Start conversation and argue the resolution on screen. Then keep listening.', 2);
    } else if (talk.phase === 'proposed') {
      armNudge('proposed:' + talk.id + ':' + talk.proposals, 30000, 'The suggestion is still on their screens and nobody has tapped. In one casual line under twenty words: tap Use it if you are both in, then Start conversation or Start timed speeches. Or say something else. Then keep listening.', 2);
    }
  }
  function ctx() { return window.__lrTopicContext ? window.__lrTopicContext() : {}; }
  function active(t) { return !!t && ['listening', 'proposed'].indexOf(t.phase) >= 0 && Date.now() < t.expiresAt; }
  function isHost() { return !!talk && talk.host === ctx().uid; }
  function el(tag, text, cls) { var n = document.createElement(tag); if (text != null) n.textContent = text; if (cls) n.className = cls; return n; }
  function ga(name, extra) { try { if (window.gtag) gtag('event', name, extra || {}); } catch (_) {} }
  function notice(msg) { if (window.__lrTopicNotice) window.__lrTopicNotice(msg); }
  function api(action, extra) {
    var c = ctx();
    var startedIn = lifecycle;
    if (!c.user) return Promise.reject(Error('Sign in to choose a topic.'));
    var payload = Object.assign({ action: action, room: c.room, id: talk && talk.id }, extra || {});
    return c.user.getIdToken().then(function(token) {
      return fetch('/api/room-topic', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token }, body: JSON.stringify(payload) });
    }).then(function(r) { return r.json().then(function(d) { if (!r.ok || !d.ok) throw Error(d.error || 'Could not update this discussion. Try again.'); return d; }); })
      .then(function(d) {
        if (d.talk && startedIn === lifecycle && (action === 'open' || !talk || talk.id === payload.id)) render(d.talk);
        return d;
      });
  }
  function act(action) {
    if (action === 'cancel') { dismiss(); return; }
    if (busy) return;
    busy = true;
    api(action).catch(function(e) { notice(e.message); }).then(function() { busy = false; });
  }

  // ── The voice session (host only) ────────────────────────────────
  function send(msg) { try { if (voice && voice.dc && voice.dc.readyState === 'open') voice.dc.send(JSON.stringify(msg)); } catch (_) {} }
  function currentVoice(v) { return voice === v && !v.stopped && ctx().canChoose && active(talk) && talk.id === v.talkId; }
  function paintCaption() {
    if (captionText) { captionText.textContent = caption.text || (caption.status === 'Listening' ? 'The judge is listening. Pause for a moment to let it speak.' : caption.status === 'Thinking' ? 'The judge is getting ready to speak.' : 'The judge is joining…'); captionText.scrollTop = captionText.scrollHeight; }
    if (captionStatus) captionStatus.textContent = caption.status;
  }
  function shareCaption(v) {
    if (!currentVoice(v) || !v.shared || !v.call) return;
    try { v.call.sendAppMessage({ t: 'topic-caption', id: v.talkId, seq: ++caption.seq, text: caption.text, status: caption.status }, '*'); } catch (_) {}
  }
  function clearSoundButton() {
    if (soundButton) soundButton.remove();
    soundButton = null; blockedSound = null;
  }
  function soundIsCurrent(s) {
    return ctx().canChoose && active(talk) && talk.id !== dismissedId
      && (!s.id || s.id === talk.id) && s.audio.srcObject === s.stream && s.audio.isConnected;
  }
  function paintSoundButton() {
    if (!blockedSound || !soundIsCurrent(blockedSound)) { clearSoundButton(); return; }
    if (!soundButton) soundButton = button('Hear judge', function() {
      var s = blockedSound;
      if (!s || !soundIsCurrent(s)) { clearSoundButton(); return; }
      // Both calls happen inside the gesture, before waiting on either one.
      playSound(s.audio, s.ac);
    }, 'topic-strip-primary');
    mount().appendChild(soundButton);
  }
  function playSound(audio, ac) {
    var s = { audio: audio, ac: ac, stream: audio.srcObject, id: talk && talk.id };
    var resume, play;
    try { resume = ac ? ac.resume() : null; play = audio.play(); }
    catch (e) { play = Promise.reject(e); }
    Promise.all([resume, play]).then(function() {
      if (blockedSound && blockedSound.audio === audio && blockedSound.stream === s.stream) clearSoundButton();
    }).catch(function() {
      if (!soundIsCurrent(s)) return;
      blockedSound = s; paintSoundButton();
    });
  }
  function playVoice(v) { playSound(v.audio, v.ac); }
  function updateCaption(v, status) {
    if (!currentVoice(v)) return;
    if (status) caption.status = status;
    paintCaption();
    if (v.captionTimer) return;
    v.captionTimer = setTimeout(function() { v.captionTimer = null; shareCaption(v); }, 120);
  }
  function pump(v) {
    clearTimeout(v.replyTimer); v.replyTimer = null;
    if (!currentVoice(v) || !v.shared || !v.pending || v.speaking || v.responding || v.playing || v.toolPending) return;
    var wait = v.quietUntil - Date.now();
    if (wait > 0) { v.replyTimer = setTimeout(function() { pump(v); }, wait); return; }
    var next = v.pending; v.pending = null;
    // A request can be cancelled before it makes a sound. Count the
    // greeting only when its audio starts, so a first interruption retries it.
    v.responseKind = next.kind;
    v.responding = true; v.interrupted = false;
    updateCaption(v, 'Thinking');
    clearTimeout(v.responseTimer);
    v.responseTimer = setTimeout(function() { failVoice(v, 'The judge did not respond. Tap Ask the judge to retry.'); }, 20000);
    // response.instructions overrides the session brief. Keep the complete
    // listening/content rules even for a reminder or a tool follow-up.
    send({ type: 'response.create', response: v.instructions
      ? { instructions: v.instructions + '\n\nTHIS TURN:\n' + (next.kind === 'greeting' ? '' : 'The arrival greeting is finished. Continue the conversation without greeting again. ') + next.instructions } : {} });
  }
  function say(instructions, kind) {
    var v = voice;
    if (!v || !currentVoice(v) || !v.dc || v.dc.readyState !== 'open') return false;
    if (kind === 'greeting' && v.greeted) return false;
    // A reminder is optional. Never save it up to cut in after real dialogue.
    if (kind === 'nudge' && (v.pending || v.speaking || v.responding || v.playing || v.toolPending || Date.now() < v.quietUntil)) return false;
    v.pending = { instructions: instructions, kind: kind || 'reply' };
    pump(v);
    return true;
  }
  // Mix every voice in the room into the one track the judge hears. The
  // opponent's track arrives over Daily and can be replaced when they
  // mute and unmute, so this is re-run on a short poll and swaps sources
  // by track id.
  function addSource(v, track, key) {
    var cur = v.sources[key];
    if (!track || track.readyState !== 'live') {
      if (cur) { try { cur.node.disconnect(); } catch (_) {} delete v.sources[key]; }
      return;
    }
    if (cur && cur.id === track.id) return;
    if (cur) { try { cur.node.disconnect(); } catch (_) {} }
    try {
      var node = v.ac.createMediaStreamSource(new MediaStream([track]));
      node.connect(v.dest);
      v.sources[key] = { id: track.id, node: node };
    } catch (_) {}
  }
  function refreshSources(v) {
    var c = ctx();
    // The borrowed camera capture can stay live while Daily is muted.
    // Respect the room control rather than sending that private audio.
    addSource(v, c.micOn === false ? null : (c.audioTrack || (v.ownMic && v.ownMic.getAudioTracks()[0])), 'me');
    var peer = c.peerAudioTrack ? c.peerAudioTrack() : null;
    addSource(v, peer, 'peer');
    // ontrack can beat Daily's joined-meeting event. Keep the output and
    // publish it when the call is ready, before letting the judge speak.
    if (v.outputTrack) publish(v, v.outputTrack);
  }
  function failVoice(v, message) {
    if (!currentVoice(v)) return;
    notice(message);
    dismiss();
  }
  function publish(v, track) {
    var c = ctx();
    if (!currentVoice(v) || !track || !c.call || !c.joined || v.published) return;
    v.published = true;
    v.call = c.call;
    try {
      // Own the published clone. Stopping the judge silences a publication
      // still in flight without ever stopping a person's borrowed mic.
      v.publishedTrack = track.clone();
      Promise.resolve(c.call.startCustomTrack({ track: v.publishedTrack, trackName: 'judge', ignoreAudioLevel: true })).then(function() {
        if (!currentVoice(v)) return;
        v.shared = true;
        if (v.dc && v.dc.readyState === 'open') clearTimeout(v.connectTimer);
        pump(v);
      }).catch(function() {
        failVoice(v, 'The judge could not share its voice with the call. Tap Ask the judge to retry.');
      });
    } catch (e) { failVoice(v, 'The judge could not share its voice with the call. Tap Ask the judge to retry.'); }
  }
  function handleEvent(v, ev) {
    if (!currentVoice(v)) return;
    var msg; try { msg = JSON.parse(ev.data); } catch (_) { return; }
    if (msg.type === 'error') {
      var code = msg.error && msg.error.code || '';
      // Barge-in can race the server's own cancellation. An already-ended
      // response is harmless; an actual provider failure must be visible.
      if (code === 'response_cancel_not_active' || code === 'output_audio_buffer_clear_empty') return;
      console.warn('[room-topic] realtime error', code);
      failVoice(v, 'The judge could not speak. Tap Ask the judge to retry.');
      return;
    }
    if (msg.type === 'response.output_audio_transcript.delta' || msg.type === 'response.audio_transcript.delta'
        || msg.type === 'response.output_audio_transcript.done' || msg.type === 'response.audio_transcript.done') {
      if (v.interrupted) return;
      var item = msg.item_id || msg.response_id || '';
      if (caption.item !== item) { caption.item = item; caption.text = ''; }
      caption.text = (typeof msg.transcript === 'string' ? msg.transcript : caption.text + (msg.delta || '')).slice(-600);
      updateCaption(v);
      return;
    }
    if (msg.type === 'input_audio_buffer.speech_started') {
      v.speaking = true; v.heardSpeech = true; v.turn += 1;
      v.pending = null; clearTimeout(v.replyTimer); v.replyTimer = null;
      v.interrupted = true;
      // interrupt_response handles barge-in on the server. Clear any audio
      // already buffered for WebRTC too, including the published Daily voice.
      if (v.responding || v.playing) send({ type: 'output_audio_buffer.clear' });
      updateCaption(v, 'Listening');
      return;
    }
    if (msg.type === 'input_audio_buffer.speech_stopped') {
      v.speaking = false; v.quietUntil = Date.now() + QUIET_MS;
      say(v.greeted ? LISTEN_REPLY : v.greeting, v.greeted ? 'reply' : 'greeting');
      return;
    }
    if (msg.type === 'response.created') {
      v.responding = true;
      // The request can cross a new speech_started on the wire.
      if (v.speaking || v.interrupted) {
        send({ type: 'response.cancel' }); send({ type: 'output_audio_buffer.clear' });
      }
      return;
    }
    if (msg.type === 'response.done') {
      clearTimeout(v.responseTimer);
      v.responding = false;
      if (msg.response && msg.response.status === 'failed') {
        failVoice(v, 'The judge could not speak. Tap Ask the judge to retry.'); return;
      }
      // Occasionally the provider completes the opening with no audio at
      // all. Retry that empty turn once instead of waiting silently forever.
      var output = msg.response && msg.response.output;
      var hasAudio = Array.isArray(output) && output.some(function(item) {
        return (item.content || []).some(function(part) { return part.type === 'audio' || part.type === 'output_audio'; });
      });
      if (v.responseKind === 'greeting' && !v.greeted && !v.interrupted && !v.speaking
          && msg.response && msg.response.status === 'completed' && Array.isArray(output) && !hasAudio) {
        if (v.greetingRetries) { failVoice(v, 'The judge could not speak. Tap Ask the judge to retry.'); return; }
        v.greetingRetries = 1; say(v.greeting, 'greeting'); return;
      }
      if (!v.playing) updateCaption(v, 'Listening');
      pump(v); return;
    }
    if (msg.type === 'output_audio_buffer.started') {
      v.playing = true;
      if (v.responseKind === 'greeting' && !v.speaking && !v.interrupted) v.greeted = true;
      updateCaption(v, 'Speaking');
      if (v.speaking || v.interrupted) send({ type: 'output_audio_buffer.clear' });
      return;
    }
    if (msg.type === 'output_audio_buffer.stopped' || msg.type === 'output_audio_buffer.cleared') {
      v.playing = false; updateCaption(v, 'Listening'); pump(v); return;
    }
    if (msg.type !== 'response.function_call_arguments.done' || msg.name !== 'propose_motion') return;
    if (v.interrupted || v.speaking || v.toolPending) return;
    var args = {}; try { args = JSON.parse(msg.arguments || '{}'); } catch (_) {}
    var callId = msg.call_id;
    if (v.toolCalls[callId]) return;
    v.toolCalls[callId] = true;
    if (!v.heardSpeech) {
      send({ type: 'conversation.item.create', item: { type: 'function_call_output', call_id: callId, output: JSON.stringify({ ok: false, error: 'Nobody has spoken yet. Wait and listen before suggesting.' }) } });
      return;
    }
    var turn = v.turn;
    v.toolPending = true;
    ga('live_topic_voice_propose', { attempt: talk.proposals + 1 });
    api('propose', { motion: String(args.motion || '') }).then(function() {
      if (!currentVoice(v)) return;
      v.toolPending = false;
      send({ type: 'conversation.item.create', item: { type: 'function_call_output', call_id: callId, output: JSON.stringify({ ok: true, shown: true }) } });
      say(turn === v.turn ? 'The resolution is now on both screens. Read it out loud word for word, then say only: tap Use it if you are both in, or say something else. No commentary, nothing about why you picked it.' : LISTEN_REPLY, 'tool');
    }).catch(function(e) {
      if (!currentVoice(v)) return;
      v.toolPending = false;
      send({ type: 'conversation.item.create', item: { type: 'function_call_output', call_id: callId, output: JSON.stringify({ ok: false, error: e.message }) } });
      say(turn === v.turn ? 'The tool result explains why the proposal was not accepted. Fix its wording while preserving the conversation\'s actual disagreement. Do not repeat the error to them.' : LISTEN_REPLY, 'tool');
    });
  }
  // Prepare only silent local resources. No mic capture, provider request or
  // room publication happens until the person taps Ask the judge.
  function prepareVoice() {
    if (warm || voice || !ctx().canChoose) return;
    var v = { sources: {}, stopped: false };
    try {
      var AC = window.AudioContext || window.webkitAudioContext;
      v.ac = new AC();
      v.dest = v.ac.createMediaStreamDestination();
      v.silence = v.ac.createMediaStreamDestination();
      v.pc = new RTCPeerConnection();
      v.pc.addTrack(v.dest.stream.getAudioTracks()[0], v.dest.stream);
      v.dc = v.pc.createDataChannel('oai-events');
      v.audio = document.createElement('audio');
      v.audio.autoplay = true; v.audio.playsInline = true; v.audio.setAttribute('playsinline', '');
      v.audio.style.display = 'none'; v.audio.srcObject = v.silence.stream;
      document.body.appendChild(v.audio);
      v.offer = v.pc.createOffer().then(async function(offer) { await v.pc.setLocalDescription(offer); return offer; });
      // Handle a speculative failure even if nobody ever opens the judge.
      v.offer.catch(function() { if (warm === v) { warm = null; teardown(v); } });
      warm = v;
      v.warmTimer = setTimeout(function() { if (warm === v) { warm = null; teardown(v); } }, 30000);
    } catch (_) { teardown(v); }
  }
  async function startVoice(result, openedIn) {
    prepareVoice();
    var v = warm; warm = null;
    if (!v) { await result; throw Error('The judge could not prepare its audio. Try again.'); }
    clearTimeout(v.warmTimer);
    voice = v;
    // Unlock both under the original click, before token/network awaits.
    try { v.ac.resume().catch(function() {}); } catch (_) {}
    try { v.audio.play().catch(function() {}); } catch (_) {}
    var c = ctx();
    try {
      var d = await result;
      if (openedIn !== lifecycle || !ctx().canChoose || v.stopped) {
        if (d.talk && active(d.talk) && d.voice) api('cancel', { id: d.talk.id }).catch(function() {});
        teardown(v); return;
      }
      if (!d.voice || !active(d.talk) || d.talk.host !== c.uid) { teardown(v); return; }
      var mint = d.voice;
      Object.assign(v, { talkId: d.talk.id, instructions: mint.instructions || '', speaking: false, responding: false, playing: false, heardSpeech: false, interrupted: false,
        turn: 0, toolPending: false, toolCalls: {}, pending: null, replyTimer: null, quietUntil: 0, greeted: false,
        greeting: 'Say exactly this, once, and nothing else: "' + String(mint.greeting || "Hi, I'm your judge. I'll listen to you both talk and suggest a topic. What do you study, do for work, or feel most passionate about?").replace(/"/g, '') + '" Then stop and listen. Do not call any tool yet.' });
      v.connectTimer = setTimeout(function() { failVoice(v, 'The judge could not connect to the call. Tap Ask the judge to retry.'); }, 20000);
      c = ctx();
      if (!c.audioTrack) {
        // Off the call-object path there is no borrowed track. Ask once.
        var got = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
        if (!currentVoice(v)) { got.getTracks().forEach(function(t) { t.stop(); }); teardown(v); return; }
        v.ownMic = got;
        addSource(v, got.getAudioTracks()[0], 'me');
      }
      refreshSources(v);
      v.poll = setInterval(function() { if (voice === v) { refreshSources(v); shareCaption(v); } }, 1500);

      var pc = v.pc;
      pc.onconnectionstatechange = function() {
        if (pc.connectionState === 'failed') failVoice(v, 'The judge disconnected. Tap Ask the judge to retry.');
      };
      pc.ontrack = function(ev) {
        if (voice !== v || v.stopped || !ctx().canChoose) return;
        var stream = ev.streams && ev.streams[0];
        var track = ev.track || (stream && stream.getAudioTracks()[0]);
        if (!track || track.kind !== 'audio') return;
        if (!stream) stream = new MediaStream([track]);
        v.audio.srcObject = stream;
        playVoice(v);
        v.outputTrack = track;
        publish(v, track);
      };
      var dc = v.dc;
      dc.onmessage = function(ev) { handleEvent(v, ev); };
      dc.onclose = function() {
        if (!currentVoice(v)) return;
        notice('The judge disconnected. Tap Ask the judge to try again.');
        dismiss();
      };
      dc.onopen = function() {
        if (voice !== v || v.stopped || !ctx().canChoose) { teardown(v); return; }
        if (v.shared) clearTimeout(v.connectTimer);
        send({ type: 'session.update', session: { type: 'realtime', output_modalities: ['audio'],
          audio: { input: { turn_detection: { type: 'server_vad', threshold: 0.5, prefix_padding_ms: 500, silence_duration_ms: 1000, create_response: false, interrupt_response: true } },
            output: { voice: mint.voice || 'marin', speed: 1.05 } } } });
        say(v.greeting, 'greeting');
        armTalkNudge();
      };
      var offer = await v.offer;
      if (!currentVoice(v)) { teardown(v); return; }
      var res = await fetch(mint.sdpUrl || 'https://api.openai.com/v1/realtime/calls', {
        method: 'POST', body: offer.sdp,
        headers: { Authorization: 'Bearer ' + mint.client_secret.value, 'Content-Type': 'application/sdp' },
      });
      if (!res.ok) throw Error('The judge could not connect (' + res.status + ').');
      var answer = await res.text();
      if (voice !== v || v.stopped || !ctx().canChoose) { teardown(v); return; }
      await pc.setRemoteDescription({ type: 'answer', sdp: answer });
      if (voice !== v) { teardown(v); return; }
      ga('live_topic_voice_start', { model: mint.model || '' });
    } catch (e) {
      // A failed SDP response from a dismissed session must not cancel
      // a newer judge that the person has already opened.
      if (!currentVoice(v)) { teardown(v); if (openedIn === lifecycle) { close(); notice(e.message); } return; }
      failVoice(v, e.message || 'The judge could not join. Tap Ask the judge to retry.');
    }
  }
  function teardown(v) {
    if (!v || v.stopped) return;
    v.stopped = true;
    if (voice === v) voice = null;
    clearTimeout(v.replyTimer); v.pending = null;
    clearTimeout(v.connectTimer); clearTimeout(v.responseTimer);
    clearTimeout(v.warmTimer); clearTimeout(v.captionTimer);
    clearInterval(v.poll);
    if (v.publishedTrack) { try { v.publishedTrack.stop(); } catch (_) {} }
    if (v.published && v.call) { try { Promise.resolve(v.call.stopCustomTrack('judge')).catch(function() {}); } catch (_) {} }
    try { if (v.dc) v.dc.close(); } catch (_) {}
    try { if (v.pc) v.pc.close(); } catch (_) {}
    try { if (v.ac) v.ac.close(); } catch (_) {}
    if (v.ownMic) v.ownMic.getTracks().forEach(function(t) { t.stop(); });
    if (v.audio) { try { v.audio.srcObject = null; v.audio.remove(); } catch (_) {} }
  }
  function stopVoice() {
    clearNudge();
    if (warm) { teardown(warm); warm = null; }
    var v = voice; if (!v) return;
    teardown(v);
  }

  // ── The compact overlay in front of the cameras ─────────────────
  function button(label, fn, cls) { var b = el('button', label, cls); b.type = 'button'; b.addEventListener('click', fn); return b; }
  function mount() {
    if (strip && strip.isConnected) {
      if (ctx().stage && strip.parentNode !== ctx().stage) { ctx().stage.appendChild(strip); strip.classList.toggle('topic-strip--floating', false); }
      return strip;
    }
    strip = el('div', null, 'topic-strip');
    strip.id = 'topicJudgeStrip';
    strip.setAttribute('role', 'region'); strip.setAttribute('aria-label', 'Your AI judge');
    var stage = ctx().stage;
    strip.classList.toggle('topic-strip--floating', !stage);
    (stage || document.body).appendChild(strip);
    return strip;
  }
  function close() {
    clearSoundButton();
    if (strip) { strip.remove(); strip = null; }
    captionText = null; captionStatus = null;
    signature = '';
  }
  function otherName() {
    var c = ctx(); var names = c.names || {};
    return names[Object.keys(names).filter(function(id) { return id !== c.uid; })[0]] || 'the other person';
  }
  function render(next) {
    if (!next) return;
    var c = ctx(); if (c.spectator || !c.uid) return;
    var changed = !talk || talk.id !== next.id;
    talk = next;
    if (talk.id === dismissedId) return;
    if (!c.canChoose) { close(); stopVoice(); return; }
    if (!active(talk)) {
      close();
      if (voice) stopVoice();
      if (talk.error) notice(talk.error);
      return;
    }
    if (changed) {
      caption = { text: '', item: '', status: 'Connecting', seq: 0 };
      if (voice && voice.talkId && voice.talkId !== talk.id) stopVoice();
    }
    var key = JSON.stringify([talk.id, talk.phase, talk.accepts, talk.proposal, talk.proposals]);
    if (signature === key) return;
    signature = key;
    armTalkNudge();
    var s = mount(); s.replaceChildren();
    s.classList.toggle('topic-strip--proposed', talk.phase === 'proposed');
    var lead = el('div', null, 'topic-strip-lead');
    lead.appendChild(el('span', '●', 'topic-strip-ico'));
    var text = el('div', null, 'topic-strip-text');
    lead.appendChild(text); s.appendChild(lead);
    text.appendChild(el('strong', 'Your judge'));
    captionStatus = el('span', caption.status, 'topic-strip-status'); text.appendChild(captionStatus);
    captionStatus.setAttribute('role', 'status');
    captionText = el('div', '', 'topic-strip-transcript');
    captionText.setAttribute('aria-label', 'Live judge transcript'); captionText.setAttribute('aria-live', 'polite');
    s.appendChild(captionText);
    var row = el('div', null, 'topic-strip-row'); s.appendChild(row);
    if (talk.phase === 'proposed') {
      s.insertBefore(el('div', talk.proposal, 'topic-strip-motion'), row);
      var mine = !!talk.accepts[c.uid];
      var theirs = Object.keys(talk.accepts).some(function(id) { return id !== c.uid && talk.accepts[id]; });
      if (!mine) row.appendChild(button('Use it', function() { ga('live_topic_voice_accept'); act('accept'); }, 'topic-strip-primary'));
      else row.appendChild(el('span', theirs ? 'Both in.' : 'You are in. Waiting for ' + otherName() + '.', 'topic-strip-wait'));
      if (theirs && !mine) row.appendChild(el('span', otherName() + ' is in.', 'topic-strip-wait'));
    }
    row.appendChild(button(talk.phase === 'proposed' ? 'Keep ours' : 'Stop', function() { ga('live_topic_voice_cancel', { phase: talk.phase }); act('cancel'); }, 'topic-strip-quiet'));
    paintSoundButton();
    paintCaption();
  }
  function dismiss() {
    lifecycle += 1;
    dismissedId = talk && talk.id || '';
    if (talk && active(talk)) api('cancel').catch(function() {});
    close(); stopVoice();
  }
  window.RoomTopic = {
    render: render,
    dismiss: dismiss,
    isPending: function() { return opening || !!voice || active(talk || window.__lrTopicSnapshot); },
    prepare: prepareVoice,
    playRemote: function(audio) { playSound(audio, null); },
    receive: function(data, senderUid) {
      if (!talk || talk.id === dismissedId || !active(talk) || !ctx().canChoose || (voice && voice.talkId === talk.id)
          || senderUid !== talk.host || data.id !== talk.id || !Number.isFinite(data.seq) || data.seq <= caption.seq) return;
      if (typeof data.text !== 'string' || data.text.length > 600 || ['Connecting', 'Thinking', 'Speaking', 'Listening'].indexOf(data.status) < 0) return;
      caption.text = data.text; caption.status = data.status; caption.seq = data.seq; paintCaption();
    },
    open: function() {
      if (opening || voice || active(talk) || !ctx().canChoose) return;
      prepareVoice();
      if (!warm) { notice('The judge could not prepare its audio. Try again.'); return; }
      opening = true;
      var openedIn = ++lifecycle;
      caption = { text: '', item: '', status: 'Connecting', seq: 0 };
      var s = mount(); s.replaceChildren();
      s.appendChild(el('strong', 'Your judge'));
      s.appendChild(el('span', 'Joining…'));
      s.appendChild(button('Stop', dismiss, 'topic-strip-quiet'));
      startVoice(api('open'), openedIn).catch(function(e) { close(); notice(e.message); }).then(function() { opening = false; });
    }
  };
  document.addEventListener('click', function(e) { if (e.target.closest('#rmbTalkBtn')) window.RoomTopic.open(); });
  ['pointerover', 'focusin'].forEach(function(type) {
    document.addEventListener(type, function(e) { if (e.target.closest('#rmbTalkBtn, #rmbToolsLabel')) prepareVoice(); });
  });
  setInterval(function() {
    if (voice && !ctx().canChoose) { close(); stopVoice(); }
    if (talk && strip && (!active(talk) || !ctx().canChoose)) { api('cancel').catch(function() {}); close(); stopVoice(); }
  }, 1000);
  window.addEventListener('pagehide', function() { stopVoice(); });
  if (window.__lrTopicSnapshot) render(window.__lrTopicSnapshot);
})();
