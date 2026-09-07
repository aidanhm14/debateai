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
// on the resolution bar. No modal, nothing to read.
//
// The 09-02 modal (consent step, textarea, "I am ready" button) is gone.
// See lib/room-topic.mjs for the founder's verdict on it.
(function () {
  'use strict';
  var talk = null, strip = null, signature = '', busy = false, opening = false;
  var voice = null, lifecycle = 0;
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
  function pump(v) {
    clearTimeout(v.replyTimer); v.replyTimer = null;
    if (!currentVoice(v) || !v.pending || v.speaking || v.responding || v.playing || v.toolPending) return;
    var wait = v.quietUntil - Date.now();
    if (wait > 0) { v.replyTimer = setTimeout(function() { pump(v); }, wait); return; }
    var next = v.pending; v.pending = null;
    if (next.kind === 'greeting') v.greeted = true;
    v.responding = true; v.interrupted = false;
    // response.instructions overrides the session brief. Keep the complete
    // listening/content rules even for a reminder or a tool follow-up.
    send({ type: 'response.create', response: v.instructions
      ? { instructions: v.instructions + '\n\nTHIS TURN:\n' + next.instructions } : {} });
  }
  function say(instructions, kind) {
    var v = voice;
    if (!v || !currentVoice(v) || !v.dc || v.dc.readyState !== 'open') return false;
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
    addSource(v, c.audioTrack || (v.ownMic && v.ownMic.getAudioTracks()[0]), 'me');
    var peer = c.peerAudioTrack ? c.peerAudioTrack() : null;
    addSource(v, peer, 'peer');
  }
  function publish(v, track) {
    var c = ctx();
    if (!c.call || !c.joined || v.published) return;
    v.published = true;
    try {
      var p = c.call.startCustomTrack({ track: track, trackName: 'judge' });
      if (p && p.catch) p.catch(function(e) { console.warn('[room-topic] judge track publish failed', e); v.published = false; });
    } catch (e) { console.warn('[room-topic] judge track publish failed', e); v.published = false; }
  }
  function handleEvent(v, ev) {
    if (!currentVoice(v)) return;
    var msg; try { msg = JSON.parse(ev.data); } catch (_) { return; }
    if (msg.type === 'error') { console.warn('[room-topic] realtime error', msg.error); return; }
    if (msg.type === 'input_audio_buffer.speech_started') {
      v.speaking = true; v.heardSpeech = true; v.turn += 1;
      v.pending = null; clearTimeout(v.replyTimer); v.replyTimer = null;
      v.interrupted = true;
      // interrupt_response handles barge-in on the server. Clear any audio
      // already buffered for WebRTC too, including the published Daily voice.
      if (v.responding || v.playing) send({ type: 'output_audio_buffer.clear' });
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
    if (msg.type === 'response.done') { v.responding = false; pump(v); return; }
    if (msg.type === 'output_audio_buffer.started') {
      v.playing = true;
      if (v.speaking || v.interrupted) send({ type: 'output_audio_buffer.clear' });
      return;
    }
    if (msg.type === 'output_audio_buffer.stopped' || msg.type === 'output_audio_buffer.cleared') {
      v.playing = false; pump(v); return;
    }
    if (msg.type !== 'response.function_call_arguments.done' || msg.name !== 'propose_motion') return;
    if (v.interrupted || v.speaking || v.toolPending) return;
    var args = {}; try { args = JSON.parse(msg.arguments || '{}'); } catch (_) {}
    var callId = msg.call_id;
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
  async function startVoice(mint) {
    stopVoice();
    var c = ctx();
    var v = { pc: null, dc: null, ac: null, dest: null, sources: {}, audio: null, poll: null, published: false, stopped: false,
      talkId: talk.id, instructions: mint.instructions || '', speaking: false, responding: false, playing: false, heardSpeech: false, interrupted: false,
      turn: 0, toolPending: false, pending: null, replyTimer: null, quietUntil: Date.now() + QUIET_MS, greeted: false,
      greeting: 'Say exactly this, once, and nothing else: "' + String(mint.greeting || 'Hi, I am your judge. What do you two actually disagree on?').replace(/"/g, '') + '" Then stop and listen. Do not call any tool yet.' };
    voice = v;
    try {
      var AC = window.AudioContext || window.webkitAudioContext;
      v.ac = new AC();
      v.dest = v.ac.createMediaStreamDestination();
      try { v.ac.resume(); } catch (_) {}
      if (!c.audioTrack) {
        // Off the call-object path there is no borrowed track. Ask once.
        var got = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
        if (!currentVoice(v)) { got.getTracks().forEach(function(t) { t.stop(); }); teardown(v); return; }
        v.ownMic = got;
        addSource(v, got.getAudioTracks()[0], 'me');
      }
      refreshSources(v);
      v.poll = setInterval(function() { if (voice === v) refreshSources(v); }, 1500);

      var pc = new RTCPeerConnection();
      v.pc = pc;
      pc.addTrack(v.dest.stream.getAudioTracks()[0], v.dest.stream);
      v.audio = document.createElement('audio');
      v.audio.autoplay = true; v.audio.playsInline = true; v.audio.setAttribute('playsinline', '');
      v.audio.style.display = 'none';
      document.body.appendChild(v.audio);
      pc.ontrack = function(ev) {
        if (voice !== v || v.stopped || !ctx().canChoose) return;
        var stream = ev.streams && ev.streams[0];
        if (!stream) return;
        v.audio.srcObject = stream;
        var p = v.audio.play(); if (p && p.catch) p.catch(function() {});
        publish(v, stream.getAudioTracks()[0]);
      };
      var dc = pc.createDataChannel('oai-events');
      v.dc = dc;
      dc.onmessage = function(ev) { handleEvent(v, ev); };
      dc.onclose = function() {
        if (!currentVoice(v)) return;
        notice('The judge disconnected. Tap Ask the judge to try again.');
        dismiss();
      };
      dc.onopen = function() {
        if (voice !== v || v.stopped || !ctx().canChoose) { teardown(v); return; }
        v.quietUntil = Date.now() + QUIET_MS;
        send({ type: 'session.update', session: { type: 'realtime', output_modalities: ['audio'],
          audio: { input: { turn_detection: { type: 'server_vad', threshold: 0.5, prefix_padding_ms: 500, silence_duration_ms: 1000, create_response: false, interrupt_response: true } },
            output: { voice: mint.voice || 'marin', speed: 1.05 } } } });
        say(v.greeting, 'greeting');
        armTalkNudge();
      };
      var offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
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
      teardown(v); if (voice === v) voice = null;
      notice(e.message || 'The judge could not join. Try Spin a motion.');
      api('cancel').catch(function() {});
    }
  }
  function teardown(v) {
    if (!v || v.stopped) return;
    v.stopped = true;
    if (voice === v) voice = null;
    clearTimeout(v.replyTimer); v.pending = null;
    clearInterval(v.poll);
    var c = ctx();
    if (v.published && c.call) { try { c.call.stopCustomTrack('judge'); } catch (_) {} }
    try { if (v.dc) v.dc.close(); } catch (_) {}
    try { if (v.pc) v.pc.close(); } catch (_) {}
    try { if (v.ac) v.ac.close(); } catch (_) {}
    if (v.ownMic) v.ownMic.getTracks().forEach(function(t) { t.stop(); });
    if (v.audio) { try { v.audio.srcObject = null; v.audio.remove(); } catch (_) {} }
  }
  function stopVoice() {
    clearNudge();
    var v = voice; if (!v) return;
    teardown(v);
  }

  // ── The strip on the resolution bar ─────────────────────────────
  function button(label, fn, cls) { var b = el('button', label, cls); b.type = 'button'; b.addEventListener('click', fn); return b; }
  function mount() {
    if (strip && strip.isConnected) return strip;
    strip = el('div', null, 'topic-strip');
    strip.id = 'topicJudgeStrip';
    strip.setAttribute('role', 'status');
    var anchor = document.getElementById('rmbTools');
    if (anchor && anchor.parentNode) anchor.parentNode.insertBefore(strip, anchor);
    else document.body.appendChild(strip);
    return strip;
  }
  function close() {
    if (strip) { strip.remove(); strip = null; }
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
    if (!c.canChoose) { close(); stopVoice(); return; }
    if (!active(talk)) {
      close();
      if (voice) stopVoice();
      if (talk.error) notice(talk.error);
      return;
    }
    if (changed && voice && !isHost()) stopVoice();
    var key = JSON.stringify([talk.id, talk.phase, talk.accepts, talk.proposal, talk.proposals]);
    if (signature === key) return;
    signature = key;
    armTalkNudge();
    var s = mount(); s.replaceChildren();
    s.classList.toggle('topic-strip--proposed', talk.phase === 'proposed');
    var lead = el('div', null, 'topic-strip-lead');
    lead.appendChild(el('span', '🎙', 'topic-strip-ico'));
    var text = el('div', null, 'topic-strip-text');
    lead.appendChild(text); s.appendChild(lead);
    var row = el('div', null, 'topic-strip-row'); s.appendChild(row);
    if (talk.phase === 'listening') {
      text.appendChild(el('strong', 'The judge is in the room.'));
      text.appendChild(el('span', isHost()
        ? ' It hears you through your mic and ' + otherName() + ' through the call. Just talk about what you want to argue.'
        : ' It is listening to you both. Just talk about what you want to argue.'));
    } else {
      text.appendChild(el('strong', 'Judge suggests: '));
      text.appendChild(el('span', talk.proposal, 'topic-strip-motion'));
      var mine = !!talk.accepts[c.uid];
      var theirs = Object.keys(talk.accepts).some(function(id) { return id !== c.uid && talk.accepts[id]; });
      if (!mine) row.appendChild(button('Use it', function() { ga('live_topic_voice_accept'); act('accept'); }, 'topic-strip-primary'));
      else row.appendChild(el('span', theirs ? 'Both in.' : 'You are in. Waiting for ' + otherName() + '.', 'topic-strip-wait'));
      if (theirs && !mine) row.appendChild(el('span', otherName() + ' is in.', 'topic-strip-wait'));
      if (talk.proposals < 3) row.appendChild(el('span', 'Want another? Just say so.', 'topic-strip-hint'));
    }
    row.appendChild(button(talk.phase === 'proposed' ? 'Keep our topic' : 'Stop the judge', function() { ga('live_topic_voice_cancel', { phase: talk.phase }); act('cancel'); }, 'topic-strip-quiet'));
  }
  function dismiss() {
    lifecycle += 1;
    if (talk && active(talk)) api('cancel').catch(function() {});
    close(); stopVoice();
  }
  window.RoomTopic = {
    render: render,
    dismiss: dismiss,
    isPending: function() { return opening || !!voice || active(talk || window.__lrTopicSnapshot); },
    open: function() {
      if (opening || !ctx().canChoose) return;
      opening = true;
      var openedIn = ++lifecycle;
      api('open').then(function(d) {
        if (openedIn !== lifecycle || !ctx().canChoose) {
          if (d.talk && active(d.talk)) api('cancel', { id: d.talk.id }).catch(function() {});
          return;
        }
        if (!d.talk || !active(d.talk)) return;
        if (d.voice && d.talk && d.talk.host === ctx().uid) return startVoice(d.voice);
      }).catch(function(e) { notice(e.message); }).then(function() { opening = false; });
    }
  };
  document.addEventListener('click', function(e) { if (e.target.closest('#rmbTalkBtn')) window.RoomTopic.open(); });
  setInterval(function() {
    if (voice && !ctx().canChoose) { close(); stopVoice(); }
    if (talk && strip && (!active(talk) || !ctx().canChoose)) { api('cancel').catch(function() {}); close(); stopVoice(); }
  }, 1000);
  window.addEventListener('pagehide', function() { stopVoice(); });
  if (window.__lrTopicSnapshot) render(window.__lrTopicSnapshot);
})();
