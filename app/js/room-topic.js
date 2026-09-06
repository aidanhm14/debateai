(function () {
  'use strict';
  var talk = null, dialog = null, signature = '', busy = false, opening = false;
  var micStarting = false, speaking = false;
  var capture = null, uploads = [], captured = '', captureError = false, lastSpoken = '';
  function ctx() { return window.__lrTopicContext ? window.__lrTopicContext() : {}; }
  function active(t) { return !!t && ['invited', 'listening', 'generating', 'proposed'].indexOf(t.phase) >= 0 && Date.now() < t.expiresAt; }
  function el(tag, text, cls) { var n = document.createElement(tag); if (text != null) n.textContent = text; if (cls) n.className = cls; return n; }
  function error(text) { var n = dialog && dialog.querySelector('.topic-error'); if (n) n.textContent = text; }
  function api(action, extra) {
    var c = ctx();
    if (!c.user) return Promise.reject(Error('Sign in to choose a topic.'));
    var payload = Object.assign({ action: action, room: c.room, id: talk && talk.id }, extra || {});
    return c.user.getIdToken().then(function(token) {
      return fetch('/api/room-topic', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token }, body: JSON.stringify(payload) });
    }).then(function(r) { return r.json().then(function(d) { if (!r.ok || !d.ok) throw Error(d.error || 'Could not update this discussion. Try again.'); return d; }); })
      .then(function(d) { if (d.talk) render(d.talk); return d; });
  }
  function act(action) {
    if (busy) return;
    busy = true;
    api(action).catch(function(e) { error(e.message); }).then(function() { busy = false; });
  }
  function speak(text, key) {
    if (!window.speechSynthesis || lastSpoken === key) return;
    lastSpoken = key;
    // Each person hears the same chair locally; this audio is not sent to Daily.
    var utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1; speaking = true;
    utterance.onend = utterance.onerror = function(){ speaking = false; };
    speechSynthesis.speak(utterance);
  }
  function cleanupCapture(c) {
    clearTimeout(c.timer); clearInterval(c.meter);
    c.stream.getTracks().forEach(function(t) { t.stop(); });
    if (c.audio) c.audio.close().catch(function() {});
  }
  function stopListening() {
    var c = capture;
    if (!c) return Promise.resolve();
    capture = null; c.stopping = true;
    return new Promise(function(resolve) {
      c.stopped = resolve;
      if (c.rec && c.rec.state !== 'inactive') c.rec.stop();
      else { cleanupCapture(c); resolve(); }
    });
  }
  function upload(blob, heard, id) {
    if (!heard || blob.size < 2048) return Promise.resolve();
    var fd = new FormData(); fd.append('audio', blob, 'topic-segment');
    return fetch('/api/transcribe', { method: 'POST', body: fd }).then(function(r) {
      if (!r.ok) throw Error('Could not capture part of that. Add the missing words below before continuing.');
      return r.json();
    }).then(function(d) {
      var text = String(d.text || '').trim();
      if (!text || !talk || talk.id !== id || talk.phase !== 'listening') return;
      return api('line', { text: text, lineId: crypto.randomUUID() }).then(function() {
        captured += (captured ? '\n' : '') + text;
        var n = dialog && dialog.querySelector('.topic-captured'); if (n) n.textContent = captured;
      });
    }).catch(function(e) { captureError = true; error(e.message); });
  }
  function recordChunk(c) {
    if (capture !== c || c.stopping) return;
    c.samples = 0; var chunks = [];
    var mime = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'].filter(function(m) { return MediaRecorder.isTypeSupported(m); })[0];
    try { c.rec = new MediaRecorder(c.stream, mime ? { mimeType: mime } : undefined); }
    catch (_) { stopListening(); error('AI listening could not start. Type your view below.'); return; }
    c.rec.ondataavailable = function(e) { if (e.data.size) chunks.push(e.data); };
    c.rec.onstop = function() {
      clearTimeout(c.timer);
      var blob = new Blob(chunks, { type: c.rec.mimeType }), heard = c.samples >= 8;
      var previous = uploads.length ? uploads[uploads.length - 1] : Promise.resolve();
      uploads.push(previous.then(function(){ return upload(blob, heard, c.id); }));
      if (capture === c && !c.stopping && active(talk) && talk.phase === 'listening') recordChunk(c);
      else { cleanupCapture(c); if (c.stopped) c.stopped(); }
    };
    c.rec.start();
    c.timer = setTimeout(function() { if (c.rec.state !== 'inactive') c.rec.stop(); }, 12000);
  }
  function startListening() {
    if (capture || micStarting || !talk || talk.phase !== 'listening' || talk.ready[ctx().uid]) return;
    if (!navigator.mediaDevices || !window.MediaRecorder) { error('This browser cannot listen here. Type your view below.'); return; }
    micStarting = true;
    var id = talk.id, source = ctx().audioTrack;
    var get = source && source.readyState === 'live'
      ? Promise.resolve(new MediaStream([source.clone()]))
      : navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    get.then(function(stream) {
      micStarting = false;
      if (document.hidden || !talk || talk.id !== id || talk.phase !== 'listening') { stream.getTracks().forEach(function(t) { t.stop(); }); return; }
      var c = { stream: stream, id: id, samples: 0, stopping: false };
      try {
        var AC = window.AudioContext || window.webkitAudioContext;
        c.audio = new AC(); var analyser = c.audio.createAnalyser(); analyser.fftSize = 2048;
        c.audio.createMediaStreamSource(stream).connect(analyser);
        var values = new Float32Array(analyser.fftSize);
        c.audio.resume();
        c.meter = setInterval(function() {
          analyser.getFloatTimeDomainData(values);
          var sum = 0; for (var i = 0; i < values.length; i++) sum += values[i] * values[i];
          if (Math.sqrt(sum / values.length) >= 0.012) c.samples++;
        }, 50);
      } catch (_) { cleanupCapture(c); error('AI listening could not start. Type your view below.'); return; }
      capture = c; recordChunk(c);
      var b = dialog.querySelector('.topic-listen'); if (b) { b.textContent = 'AI is listening to your microphone. Stop'; b.setAttribute('aria-pressed', 'true'); }
    }).catch(function() { micStarting = false; error('Microphone access was unavailable. Type your view below.'); });
  }
  async function ready() {
    if (busy) return; busy = true; error('');
    try {
      await stopListening(); await Promise.all(uploads); uploads = [];
      var input = dialog.querySelector('textarea'); var text = input ? input.value.trim() : '';
      if (text) {
        await api('line', { text: text, lineId: crypto.randomUUID() });
        captured += (captured ? '\n' : '') + text;
        input.value = ''; captureError = false;
      }
      if (captureError) throw Error('Add a correction for the missing capture before continuing.');
      await api('ready');
    } catch (e) { error(e.message); }
    busy = false;
  }
  function button(label, fn, cls) { var b = el('button', label, cls); b.type = 'button'; b.addEventListener('click', fn); return b; }
  function close() {
    stopListening();
    if (speaking && window.speechSynthesis) { speechSynthesis.cancel(); speaking = false; }
    if (dialog) { dialog.close(); dialog.remove(); dialog = null; }
    signature = '';
  }
  function render(next) {
    if (!next) return;
    var c = ctx(); if (c.spectator || !c.uid) return;
    var changed = !talk || talk.id !== next.id;
    talk = next;
    if (changed) { captured = ''; captureError = false; uploads = []; }
    if (!active(talk)) {
      close();
      if (talk.error && window.__lrTopicNotice) window.__lrTopicNotice(talk.error);
      return;
    }
    if (talk.phase !== 'listening') stopListening();
    var key = JSON.stringify([talk.id, talk.phase, talk.consents, talk.ready, talk.accepts, talk.proposal]);
    if (signature === key) return;
    signature = key;
    var draftText = dialog && dialog.querySelector('textarea') ? dialog.querySelector('textarea').value : '';
    if (!dialog) {
      dialog = el('dialog', null, 'topic-dialog');
      dialog.setAttribute('aria-labelledby', 'topicTitle');
      dialog.addEventListener('cancel', function(e) { e.preventDefault(); act('cancel'); });
      document.body.appendChild(dialog); dialog.showModal();
    }
    dialog.replaceChildren();
    dialog.appendChild(el('strong', 'AI TOPIC MATCHMAKING', 'topic-kicker'));
    var title = el('h2', talk.phase === 'proposed' ? 'I think this might suit you two.' : 'Debate something else'); title.id = 'topicTitle'; dialog.appendChild(title);
    var status = el('p', '', 'topic-status'); status.setAttribute('role', 'status'); dialog.appendChild(status);
    if (talk.phase === 'invited') {
      status.textContent = 'The AI can listen while you both talk through a question, then suggest a resolution. This setup discussion is separate from the scored round.';
      dialog.appendChild(el('p', 'Both people must agree. Each microphone stays off for AI listening until its owner turns it on. You can also type.'));
      if (!talk.consents[c.uid]) dialog.appendChild(button('Talk it through together', function() { act('consent'); }, 'topic-primary'));
      else dialog.appendChild(el('p', 'Waiting for the other person to agree.'));
    } else if (talk.phase === 'listening') {
      status.textContent = talk.ready[c.uid] ? 'Your view is saved. Waiting for the other person to finish.' : 'Tell each other what you think. Turn on AI listening or type your view.';
      dialog.appendChild(el('p', talk.question, 'topic-question'));
      if (!talk.ready[c.uid]) {
        dialog.appendChild(button(capture ? 'AI is listening to your microphone. Stop' : 'Let the AI listen to my microphone', function() {
          if (capture) stopListening().then(function() { var b = dialog && dialog.querySelector('.topic-listen'); if (b) { b.textContent = 'Let the AI listen to my microphone'; b.setAttribute('aria-pressed', 'false'); } });
          else startListening();
        }, 'topic-listen'));
        var label = el('label', 'Your view, or anything the AI missed'); label.htmlFor = 'topicView'; dialog.appendChild(label);
        var input = el('textarea'); input.id = 'topicView'; input.maxLength = 1800; input.rows = 3; input.value = draftText; dialog.appendChild(input);
        var details = el('details'); details.appendChild(el('summary', 'What the AI captured from you'));
        details.appendChild(el('p', captured || 'No words captured yet.', 'topic-captured')); dialog.appendChild(details);
        dialog.appendChild(button('I am ready for a suggestion', ready, 'topic-primary'));
      }
      if (talk.ready[c.uid]) dialog.appendChild(el('p', 'AI listening is off for your microphone.'));
      if (Object.keys(talk.ready).some(function(id){ return id !== c.uid && talk.ready[id]; })) dialog.appendChild(el('p', 'The other person is ready.'));
    } else if (talk.phase === 'generating') {
      status.textContent = 'Both views are in. The AI is looking for a question that gives each of you something worth arguing.';
    } else if (talk.phase === 'proposed') {
      status.textContent = 'The AI proposes:';
      dialog.appendChild(el('p', talk.proposal, 'topic-question'));
      dialog.appendChild(el('p', 'The resolution changes only if you both accept. You can trade sides before starting the round.'));
      if (!talk.accepts[c.uid]) dialog.appendChild(button('Accept this resolution', function() { act('accept'); }, 'topic-primary'));
      else dialog.appendChild(el('p', 'Accepted. Waiting for the other person.'));
      speak('Okay, I think I have an idea that might suit you two. ' + talk.proposal, talk.id + ':proposal');
    }
    var err = el('p', '', 'topic-error'); err.setAttribute('role', 'alert'); dialog.appendChild(err);
    dialog.appendChild(button(talk.phase === 'proposed' ? 'Keep the current resolution' : 'Cancel topic discussion', function() { act('cancel'); }));
    if (talk.phase === 'listening') speak(talk.question, talk.id + ':question');
  }
  window.RoomTopic = {
    render: render,
    isPending: function() { return opening || active(talk || window.__lrTopicSnapshot); },
    open: function() {
      if (opening || !ctx().canChoose) return;
      opening = true;
      api('open').catch(function(e) { if (window.__lrTopicNotice) window.__lrTopicNotice(e.message); }).then(function() { opening = false; });
    }
  };
  document.addEventListener('click', function(e) { if (e.target.closest('#rmbTalkBtn')) window.RoomTopic.open(); });
  setInterval(function() {
    if (talk && dialog && (!active(talk) || !ctx().canChoose)) { api('cancel').catch(function() {}); close(); }
  }, 1000);
  document.addEventListener('visibilitychange', function() { if (document.hidden) stopListening(); });
  window.addEventListener('pagehide', stopListening);
  if (window.__lrTopicSnapshot) render(window.__lrTopicSnapshot);
})();
