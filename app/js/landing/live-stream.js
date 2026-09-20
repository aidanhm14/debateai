
(function(){
  'use strict';

  var IDLE_LEAVE_MS = 15000;

  var card = document.getElementById('fsLive');
  var screenEl = document.getElementById('first-screen');
  if (!card || !screenEl) return;

  var cams = document.getElementById('fsLiveCams');
  var embedEl = document.getElementById('fsLiveEmbed');
  var screenEl2 = document.getElementById('fsLiveScreen');
  var capEl = document.getElementById('fsLiveCap');
  var soundBtn = document.getElementById('fsLiveSound');
  var MAX_CAMS = 2;          // a round is two people
  var muted = true;
  var tiles = {};            // session_id -> { wrap, video, audio, name }

  var want = null;          // the Daily room URL to join, or null
  var embedUrl = null;      // the restream player URL, or null
  var call = null;          // daily-js call object while connected
  var joined = '';          // the URL `call` is actually on
  var onScreen = false;
  var idleTimer = null;
  var sdk = null;           // pending or resolved daily-js load

  function loadDaily(){
    if (window.DailyIframe) return Promise.resolve(window.DailyIframe);
    if (sdk) return sdk;
    sdk = window.DebatableDaily
      ? window.DebatableDaily.load()
      : Promise.reject(new Error('Daily loader unavailable'));
    sdk.catch(function(){ sdk = null; });
    return sdk;
  }

  // Swapping srcObject on every event would restart playback mid-round,
  // so an unchanged track is left exactly where it is.
  function attach(elm, track){
    var cur = elm.srcObject;
    if (!track){
      if (cur) elm.srcObject = null;
      return;
    }
    if (cur){
      var have = cur.getTracks();
      if (have.length === 1 && have[0].id === track.id) return;
    }
    elm.srcObject = new MediaStream([track]);
    var p = elm.play();
    if (p && p.catch) p.catch(function(){});
  }

  function playable(p, key){
    var t = p && p.tracks && p.tracks[key];
    return t && t.state === 'playable' ? t.persistentTrack : null;
  }

  // One tile per speaker, created on arrival and destroyed on exit, so
  // the DOM matches the room rather than a fixed pair of slots.
  function tileFor(p){
    var t = tiles[p.session_id];
    if (t) return t;
    var wrap = document.createElement('div');
    wrap.className = 'fs-live-cam';
    var v = document.createElement('video');
    v.autoplay = true; v.muted = true; v.playsInline = true;
    v.setAttribute('playsinline', '');
    v.setAttribute('disablepictureinpicture', '');
    var nm = document.createElement('span');
    nm.className = 'fs-live-nm';
    // Audio rides its own element per speaker: a <video> muted for
    // autoplay cannot also carry sound, and two speakers need two
    // independent streams anyway.
    var a = document.createElement('audio');
    a.autoplay = true;
    a.muted = muted;
    wrap.appendChild(v);
    wrap.appendChild(nm);
    cams.appendChild(wrap);
    card.appendChild(a);
    t = tiles[p.session_id] = { wrap: wrap, video: v, audio: a, name: nm };
    return t;
  }

  function dropTile(id){
    var t = tiles[id];
    if (!t) return;
    t.video.srcObject = null;
    t.audio.srcObject = null;
    if (t.wrap.parentNode) t.wrap.parentNode.removeChild(t.wrap);
    if (t.audio.parentNode) t.audio.parentNode.removeChild(t.audio);
    delete tiles[id];
  }

  function paint(){
    if (!call) return;
    var people;
    try { people = call.participants() || {}; } catch(e){ return; }

    var live = [], screen = null, anyAudio = false;
    Object.keys(people).forEach(function(k){
      if (k === 'local') return;
      var p = people[k];
      if (!p || !p.session_id) return;
      // A screen share wins the stage. This is the case the first
      // version missed entirely: it read tracks.video and nothing else,
      // so a host sharing a deck broadcast their webcam instead.
      if (!screen){
        var s = playable(p, 'screenVideo');
        if (s) screen = { track: s, from: p };
      }
      if (playable(p, 'video') || playable(p, 'audio')) live.push(p);
    });
    live = live.slice(0, MAX_CAMS);

    var seen = {};
    live.forEach(function(p){
      seen[p.session_id] = true;
      var t = tileFor(p);
      attach(t.video, playable(p, 'video'));
      var a = playable(p, 'audio');
      attach(t.audio, a);
      if (a) anyAudio = true;
      t.name.textContent = p.user_name || 'Speaker';
    });
    Object.keys(tiles).forEach(function(id){ if (!seen[id]) dropTile(id); });
    cams.setAttribute('data-n', String(live.length));

    attach(screenEl2, screen ? screen.track : null);
    card.classList.toggle('is-screen', !!screen);
    // Waiting only when there is genuinely nothing to look at. A round
    // running with cameras off but a deck up is not "waiting".
    card.classList.toggle('is-waiting', !screen && !live.some(function(p){ return playable(p, 'video'); }));
    soundBtn.hidden = !anyAudio || !muted;
  }

  // Ask for the top simulcast layer. Without this the subscriber picks a
  // layer from the size of the element it thinks it is rendering into,
  // and a card that starts hidden gets scored as tiny, so the stream
  // arrives soft and stays soft even after it is full width. Layer 2 is
  // the highest a desktop publishes; Daily clamps to whatever actually
  // exists, so asking for more than the sender publishes is safe.
  function pullTopLayer(c){
    try {
      c.updateReceiveSettings({
        '*': { video: { layer: 2 }, screenVideo: { layer: 2 } }
      });
    } catch(e){ /* older daily-js: adaptive default stands */ }
  }

  function disconnect(){
    if (!call) return;
    var c = call;
    call = null; joined = '';
    try { c.leave(); } catch(e){}
    try { c.destroy(); } catch(e){}
    Object.keys(tiles).forEach(dropTile);
    screenEl2.srcObject = null;
    cams.setAttribute('data-n', '0');
    card.classList.remove('is-screen');
    card.classList.add('is-waiting');
  }

  function connect(url){
    if (call || !url) return;
    loadDaily().then(function(D){
      // The card may have gone away or the stream ended while the SDK
      // was downloading.
      if (call || want !== url || !onScreen) return;
      var c;
      try {
        // videoSource/audioSource false is the receive-only shape: no
        // camera or mic permission prompt is ever raised on a watcher.
        c = D.createCallObject({ videoSource: false, audioSource: false, subscribeToTracksAutomatically: true });
      } catch(e){ return; }
      call = c;
      c.on('participant-joined', paint)
       .on('participant-updated', paint)
       .on('participant-left', paint)
       .on('track-started', paint)
       .on('track-stopped', paint)
       .on('error', function(){ disconnect(); });
      c.join({ url: url, userName: 'Viewer', startVideoOff: true, startAudioOff: true })
        .then(function(){
          if (call !== c) return;
          joined = url;
          pullTopLayer(c);
          paint();
          try { if (window.gtag) gtag('event', 'home_live_watch'); } catch(e){}
        })
        .catch(function(){ if (call === c) disconnect(); });
    }).catch(function(){
      // daily-js blocked or offline. The card keeps its waiting state
      // and the Watch page link, which is a working way through.
    });
  }

  function sync(){
    var live = !!want && onScreen && !document.hidden;
    if (live){
      if (idleTimer){ clearTimeout(idleTimer); idleTimer = null; }
      if (call && joined !== want) disconnect();
      connect(want);
      return;
    }
    if (call && !idleTimer){
      idleTimer = setTimeout(function(){ idleTimer = null; disconnect(); }, want ? IDLE_LEAVE_MS : 0);
    }
  }

  soundBtn.addEventListener('click', function(){
    muted = false;
    Object.keys(tiles).forEach(function(id){
      var a = tiles[id].audio;
      a.muted = false;
      var p = a.play();
      if (p && p.catch) p.catch(function(){});
    });
    soundBtn.hidden = true;
  });

  // Viewport gate, with a deadline. The connect-only-while-watched rule
  // is a cost control, and a cost control that can strand the card on
  // "Waiting for the camera" forever is worse than the cost: if no
  // observer callback has arrived shortly after a stream goes live,
  // assume the card is being looked at and connect. Measured cause for
  // the deadline rather than a hypothetical one: IntersectionObserver
  // does not fire at all in the preview browser this page is checked in.
  var heard = false;
  if (window.IntersectionObserver){
    new IntersectionObserver(function(entries){
      heard = true;
      onScreen = entries[entries.length - 1].isIntersecting;
      sync();
    }, { rootMargin: '150px' }).observe(card);
  } else {
    onScreen = true;
  }
  function assumeVisible(){
    if (heard || onScreen) return;
    onScreen = true;
    sync();
  }
  document.addEventListener('visibilitychange', sync);

  // The band poller owns /api/stream-status and hands the result here,
  // so the two never poll the same endpoint twice.
  window.__fsLive = {
    set: function(s){
      var live = !!(s && s.live);
      // The public-site default is our own player, even while the same
      // room is being restreamed to Twitch. Ops can switch sitePlayer to
      // `embed` for an audience larger than the Daily room cap.
      var preferEmbed = s.sitePlayer === 'embed' || !s.url;
      var embed = live && preferEmbed && s.watchEmbedUrl ? s.watchEmbedUrl : null;
      var url = live && !embed && s.url ? s.url : null;

      if (embed !== embedUrl){
        embedUrl = embed;
        card.classList.toggle('is-embed', !!embed);
        // Only touch src on a real change. Reassigning it, even to the
        // same URL, reloads the player and restarts the stream under
        // anyone already watching.
        if (embed){ disconnect(); embedEl.src = embed; }
        else { embedEl.removeAttribute('src'); }
      }
      if (url === want && embed === embedUrl && card.classList.contains('is-on') === live) return;

      want = url;
      card.classList.toggle('is-on', live);
      screenEl.classList.toggle('has-live', live);
      if (live){
        capEl.textContent = s.title || 'Live from the arena';
        if (url){
          card.classList.add('is-waiting');
          setTimeout(assumeVisible, 1200);
        }
      } else {
        disconnect();
      }
      sync();
    }
  };
})();
