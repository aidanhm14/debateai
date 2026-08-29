/* Debatable public broadcast player.
 *
 * Daily remains the transport, but public viewers never see Daily Prebuilt.
 * This receive-only call object paints remote tracks into our own video and
 * audio elements, so there is no meeting chrome, join dialog, camera prompt,
 * microphone prompt, participant tray, or leave button.
 *
 * Usage:
 *   var player = DebatableBroadcast.mount(document.getElementById('player'));
 *   player.set(await fetch('/api/stream-status').then(r => r.json()));
 */
(function(global){
  'use strict';

  var DAILY_SRC = 'https://unpkg.com/@daily-co/daily-js';
  var IDLE_LEAVE_MS = 15000;
  var RETRY_MS = 3500;
  var sdkPromise = null;

  function addStyles(){
    if (document.getElementById('db-broadcast-viewer-css')) return;
    var css = document.createElement('style');
    css.id = 'db-broadcast-viewer-css';
    css.textContent = [
      '.dbv{position:relative;width:100%;aspect-ratio:16/9;overflow:hidden;background:#030407;color:#fff;font-family:Inter,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;isolation:isolate}',
      '.dbv *{box-sizing:border-box}',
      '.dbv-media,.dbv-cams,.dbv-screen,.dbv-embed,.dbv-demo,.dbv-wait{position:absolute;inset:0;width:100%;height:100%}',
      '.dbv-cams{display:grid;grid-template-columns:minmax(0,1fr);gap:2px;background:#000}',
      '.dbv-cams[data-n="2"]{grid-template-columns:repeat(2,minmax(0,1fr))}',
      '.dbv-cams[data-n="3"],.dbv-cams[data-n="4"]{grid-template-columns:repeat(2,minmax(0,1fr));grid-template-rows:repeat(2,minmax(0,1fr))}',
      '.dbv-cam{position:relative;min-width:0;overflow:hidden;background:#06070a}',
      '.dbv-cam video{display:block;width:100%;height:100%;object-fit:cover;background:#06070a}',
      '.dbv-name{position:absolute;left:10px;bottom:10px;z-index:2;max-width:calc(100% - 20px);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;padding:5px 9px;border:1px solid rgba(255,255,255,.14);border-radius:8px;background:rgba(0,0,0,.68);backdrop-filter:blur(8px);font-size:12px;font-weight:800}',
      '.dbv-screen{display:none;z-index:2;object-fit:contain;background:#000}',
      '.dbv.is-screen .dbv-screen{display:block}',
      '.dbv.is-screen .dbv-cams{inset:auto 14px 14px auto;width:min(34%,420px);height:auto;aspect-ratio:16/9;z-index:3;border:1px solid rgba(255,255,255,.22);border-radius:10px;overflow:hidden;box-shadow:0 14px 36px rgba(0,0,0,.6)}',
      '.dbv.is-screen .dbv-name{left:5px;bottom:5px;padding:3px 6px;font-size:10px}',
      '.dbv-embed{display:none;z-index:6;border:0;background:#000}',
      '.dbv.is-embed .dbv-embed{display:block}',
      '.dbv-wait{z-index:1;display:none;place-items:center;padding:24px;background:radial-gradient(circle at 50% 35%,rgba(239,68,68,.14),transparent 34%),#050609;text-align:center}',
      '.dbv.is-waiting .dbv-wait{display:grid}',
      '.dbv-wait-inner{display:grid;justify-items:center;gap:11px;color:rgba(255,255,255,.72);font-size:14px;font-weight:700}',
      '.dbv-spinner{width:24px;height:24px;border:2px solid rgba(255,255,255,.18);border-top-color:#ef4444;border-radius:50%;animation:dbv-spin .85s linear infinite}',
      '@keyframes dbv-spin{to{transform:rotate(360deg)}}',
      '.dbv-demo{display:none;z-index:2;place-items:center;padding:28px;background:radial-gradient(circle at 30% 20%,rgba(239,68,68,.32),transparent 34%),radial-gradient(circle at 75% 70%,rgba(59,130,246,.22),transparent 38%),#07080c;text-align:center}',
      '.dbv.is-demo .dbv-demo{display:grid}',
      '.dbv-demo-k{color:#f87171;font-size:11px;font-weight:900;letter-spacing:.16em;text-transform:uppercase}',
      '.dbv-demo-b{margin-top:9px;font-size:clamp(20px,3vw,34px);font-weight:900;letter-spacing:-.03em}',
      '.dbv-demo-s{margin-top:8px;color:rgba(255,255,255,.62);font-size:13px}',
      '.dbv-hud{position:absolute;z-index:8;top:12px;left:12px;display:flex;align-items:center;gap:8px;pointer-events:none}',
      '.dbv-live,.dbv-viewers{display:inline-flex;align-items:center;gap:6px;padding:6px 9px;border-radius:8px;background:rgba(3,4,7,.72);border:1px solid rgba(255,255,255,.14);backdrop-filter:blur(10px);font-size:11px;font-weight:900;letter-spacing:.08em;text-transform:uppercase}',
      '.dbv-live{background:rgba(185,28,28,.9)}',
      '.dbv-live i{width:7px;height:7px;border-radius:50%;background:#fff;animation:dbv-pulse 1.4s ease-in-out infinite}',
      '.dbv-viewers{color:rgba(255,255,255,.78);letter-spacing:.02em;text-transform:none}',
      '@keyframes dbv-pulse{0%,100%{opacity:1}50%{opacity:.3}}',
      '.dbv-actions{position:absolute;z-index:9;right:12px;bottom:12px;display:flex;align-items:center;gap:8px}',
      '.dbv-action{display:inline-flex;align-items:center;justify-content:center;min-height:36px;padding:0 12px;border:1px solid rgba(255,255,255,.24);border-radius:9px;background:rgba(3,4,7,.72);color:#fff;text-decoration:none;backdrop-filter:blur(10px);font:inherit;font-size:12px;font-weight:800;cursor:pointer}',
      '.dbv-action:hover{background:rgba(20,22,28,.9);border-color:rgba(255,255,255,.5)}',
      '.dbv-action[hidden]{display:none}',
      '.dbv-platforms{display:flex;align-items:center;gap:8px}',
      '.dbv-platforms[hidden]{display:none}',
      '.dbv.is-screen .dbv-actions{right:auto;left:12px}',
      '.dbv.is-embed .dbv-actions,.dbv.is-embed .dbv-hud{display:none}',
      '.dbv-off{display:none}',
      '@media(max-width:640px){.dbv.is-screen .dbv-cams{right:8px;bottom:8px;width:38%}.dbv-name{left:6px;bottom:6px;padding:3px 6px;font-size:10px}.dbv-hud{top:8px;left:8px}.dbv-actions{right:8px;bottom:8px}.dbv.is-screen .dbv-actions{left:8px}.dbv-action{min-height:32px;padding:0 9px;font-size:11px}.dbv-viewers{display:none}}',
      '@media(prefers-reduced-motion:reduce){.dbv-spinner,.dbv-live i{animation:none}}'
    ].join('');
    document.head.appendChild(css);
  }

  function loadDaily(){
    if (global.DailyIframe) return Promise.resolve(global.DailyIframe);
    if (sdkPromise) return sdkPromise;
    sdkPromise = new Promise(function(resolve, reject){
      var s = document.createElement('script');
      s.src = DAILY_SRC;
      s.async = true;
      s.onload = function(){
        if (global.DailyIframe) resolve(global.DailyIframe);
        else { sdkPromise = null; reject(new Error('Daily did not initialize')); }
      };
      s.onerror = function(){ sdkPromise = null; reject(new Error('Daily was blocked')); };
      document.head.appendChild(s);
    });
    return sdkPromise;
  }

  function el(tag, cls, text){
    var node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text != null) node.textContent = text;
    return node;
  }

  function mount(root, options){
    if (!root) throw new Error('Broadcast player needs a root element');
    options = options || {};
    addStyles();

    root.classList.add('dbv');
    root.setAttribute('role', 'region');
    root.setAttribute('aria-label', options.label || 'Live tournament broadcast');
    root.innerHTML = '';

    var cams = el('div', 'dbv-cams');
    cams.setAttribute('data-n', '0');
    var screen = el('video', 'dbv-screen');
    screen.autoplay = true;
    screen.muted = true;
    screen.playsInline = true;
    screen.setAttribute('playsinline', '');
    screen.setAttribute('disablepictureinpicture', '');
    var screenAudio = el('audio', 'dbv-screen-audio');
    screenAudio.autoplay = true;
    screenAudio.muted = true;
    var embed = el('iframe', 'dbv-embed');
    embed.title = options.label || 'Live tournament broadcast';
    embed.allow = 'autoplay; fullscreen; picture-in-picture';
    embed.setAttribute('allowfullscreen', '');
    var wait = el('div', 'dbv-wait');
    var waitInner = el('div', 'dbv-wait-inner');
    waitInner.appendChild(el('span', 'dbv-spinner'));
    var waitText = el('span', 'dbv-wait-text', 'Connecting to the live broadcast');
    waitInner.appendChild(waitText);
    wait.appendChild(waitInner);
    var demo = el('div', 'dbv-demo');
    var demoInner = el('div');
    demoInner.innerHTML = '<div class="dbv-demo-k">Main broadcast preview</div><div class="dbv-demo-b">Host desk and event instructions</div><div class="dbv-demo-s">Camera, screen share, and sound appear here.</div>';
    demo.appendChild(demoInner);
    var hud = el('div', 'dbv-hud');
    var live = el('span', 'dbv-live');
    live.innerHTML = '<i></i>Live';
    var viewers = el('span', 'dbv-viewers', 'Live broadcast');
    hud.appendChild(live);
    hud.appendChild(viewers);
    var actions = el('div', 'dbv-actions');
    var sound = el('button', 'dbv-action', 'Sound on');
    sound.type = 'button';
    sound.hidden = true;
    var platformLinks = el('span', 'dbv-platforms');
    platformLinks.hidden = true;
    var full = el('button', 'dbv-action', 'Fullscreen');
    full.type = 'button';
    actions.appendChild(sound);
    actions.appendChild(platformLinks);
    actions.appendChild(full);
    root.appendChild(cams);
    root.appendChild(screen);
    root.appendChild(screenAudio);
    root.appendChild(embed);
    root.appendChild(wait);
    root.appendChild(demo);
    root.appendChild(hud);
    root.appendChild(actions);

    var muted = true;
    var tiles = {};
    var call = null;
    var joined = '';
    var wantedUrl = '';
    var embedUrl = '';
    var visible = false;
    var idleTimer = null;
    var retryTimer = null;
    var destroyed = false;
    var MAX_CAMS = Number(options.maxCameras) || 4;

    function attach(media, track){
      var current = media.srcObject;
      if (!track){
        if (current) media.srcObject = null;
        return;
      }
      if (current){
        var have = current.getTracks();
        if (have.length === 1 && have[0].id === track.id) return;
      }
      media.srcObject = new MediaStream([track]);
      var p = media.play();
      if (p && p.catch) p.catch(function(){});
    }

    function playable(person, key){
      var track = person && person.tracks && person.tracks[key];
      return track && track.state === 'playable' ? track.persistentTrack : null;
    }

    function tileFor(person){
      var tile = tiles[person.session_id];
      if (tile) return tile;
      var wrap = el('div', 'dbv-cam');
      var video = el('video');
      video.autoplay = true;
      video.muted = true;
      video.playsInline = true;
      video.setAttribute('playsinline', '');
      video.setAttribute('disablepictureinpicture', '');
      var name = el('span', 'dbv-name');
      var audio = el('audio');
      audio.autoplay = true;
      audio.muted = muted;
      wrap.appendChild(video);
      wrap.appendChild(name);
      cams.appendChild(wrap);
      root.appendChild(audio);
      tile = tiles[person.session_id] = { wrap: wrap, video: video, audio: audio, name: name };
      return tile;
    }

    function dropTile(id){
      var tile = tiles[id];
      if (!tile) return;
      tile.video.srcObject = null;
      tile.audio.srcObject = null;
      if (tile.wrap.parentNode) tile.wrap.parentNode.removeChild(tile.wrap);
      if (tile.audio.parentNode) tile.audio.parentNode.removeChild(tile.audio);
      delete tiles[id];
    }

    function updateCount(){
      var count = 0;
      try {
        var counts = call && call.participantCounts ? call.participantCounts() : null;
        count = counts ? (Number(counts.hidden) || 0) : 0;
      } catch(e){}
      viewers.textContent = count > 0 ? count + ' watching' : 'Live broadcast';
    }

    function paint(){
      if (!call) return;
      var people;
      try { people = call.participants() || {}; } catch(e){ return; }
      var speakers = [];
      var shared = null;
      var sharedAudio = null;
      var hasAudio = false;
      Object.keys(people).forEach(function(key){
        if (key === 'local') return;
        var person = people[key];
        if (!person || !person.session_id) return;
        if (!shared && playable(person, 'screenVideo')){
          shared = playable(person, 'screenVideo');
          sharedAudio = playable(person, 'screenAudio');
        }
        if (playable(person, 'video') || playable(person, 'audio')) speakers.push(person);
      });
      speakers = speakers.slice(0, MAX_CAMS);
      var seen = {};
      speakers.forEach(function(person){
        seen[person.session_id] = true;
        var tile = tileFor(person);
        attach(tile.video, playable(person, 'video'));
        var audioTrack = playable(person, 'audio');
        attach(tile.audio, audioTrack);
        if (audioTrack) hasAudio = true;
        tile.name.textContent = person.user_name || 'Speaker';
      });
      Object.keys(tiles).forEach(function(id){ if (!seen[id]) dropTile(id); });
      cams.setAttribute('data-n', String(speakers.length));
      attach(screen, shared);
      attach(screenAudio, sharedAudio);
      screenAudio.muted = muted;
      if (sharedAudio) hasAudio = true;
      root.classList.toggle('is-screen', !!shared);
      root.classList.toggle('is-waiting', !shared && !speakers.some(function(person){ return !!playable(person, 'video'); }));
      sound.hidden = !hasAudio || !muted;
      updateCount();
    }

    function topLayer(c){
      try {
        c.updateReceiveSettings({ '*': { video: { layer: 2 }, screenVideo: { layer: 2 } } });
      } catch(e){}
    }

    function disconnect(){
      if (retryTimer){ clearTimeout(retryTimer); retryTimer = null; }
      if (idleTimer){ clearTimeout(idleTimer); idleTimer = null; }
      if (call){
        var old = call;
        call = null;
        try { old.leave(); } catch(e){}
        try { old.destroy(); } catch(e){}
      }
      joined = '';
      Object.keys(tiles).forEach(dropTile);
      screen.srcObject = null;
      screenAudio.srcObject = null;
      cams.setAttribute('data-n', '0');
      root.classList.remove('is-screen');
      if (wantedUrl) root.classList.add('is-waiting');
    }

    function retry(message){
      if (destroyed || !wantedUrl) return;
      waitText.textContent = message || 'Reconnecting to the live broadcast';
      root.classList.add('is-waiting');
      if (retryTimer) clearTimeout(retryTimer);
      retryTimer = setTimeout(function(){ retryTimer = null; sync(); }, RETRY_MS);
    }

    function connect(url){
      if (destroyed || call || !url) return;
      waitText.textContent = 'Connecting to the live broadcast';
      root.classList.add('is-waiting');
      loadDaily().then(function(Daily){
        if (destroyed || call || wantedUrl !== url || !visible || document.hidden) return;
        var next;
        try {
          next = Daily.createCallObject({ videoSource: false, audioSource: false, subscribeToTracksAutomatically: true });
        } catch(e){ retry('Stream connection paused. Retrying'); return; }
        call = next;
        next.on('joined-meeting', paint)
          .on('participant-joined', paint)
          .on('participant-updated', paint)
          .on('participant-left', paint)
          .on('track-started', paint)
          .on('track-stopped', paint)
          .on('error', function(){ disconnect(); retry(); });
        next.join({ url: url, userName: 'Viewer', startVideoOff: true, startAudioOff: true })
          .then(function(){
            if (call !== next) return;
            joined = url;
            topLayer(next);
            paint();
            try { if (global.gtag) global.gtag('event', options.analyticsEvent || 'broadcast_watch'); } catch(e){}
          })
          .catch(function(){ if (call === next){ disconnect(); retry(); } });
      }).catch(function(){ retry('Stream player was blocked. Retrying'); });
    }

    function sync(){
      if (destroyed) return;
      var shouldConnect = !!wantedUrl && visible && !document.hidden && !embedUrl;
      if (shouldConnect){
        if (idleTimer){ clearTimeout(idleTimer); idleTimer = null; }
        if (call && joined && joined !== wantedUrl) disconnect();
        connect(wantedUrl);
      } else if (call && !idleTimer){
        idleTimer = setTimeout(function(){ idleTimer = null; disconnect(); }, wantedUrl ? IDLE_LEAVE_MS : 0);
      }
    }

    sound.addEventListener('click', function(){
      muted = false;
      Object.keys(tiles).forEach(function(id){
        var audio = tiles[id].audio;
        audio.muted = false;
        var p = audio.play();
        if (p && p.catch) p.catch(function(){});
      });
      screenAudio.muted = false;
      var p = screenAudio.play();
      if (p && p.catch) p.catch(function(){});
      sound.hidden = true;
    });

    full.addEventListener('click', function(){
      if (document.fullscreenElement){
        if (document.exitFullscreen) document.exitFullscreen();
      } else if (root.requestFullscreen){
        root.requestFullscreen();
      }
    });

    var heardIntersection = false;
    if (global.IntersectionObserver){
      new IntersectionObserver(function(entries){
        heardIntersection = true;
        visible = entries[entries.length - 1].isIntersecting;
        sync();
      }, { rootMargin: '180px' }).observe(root);
    } else {
      visible = true;
    }
    document.addEventListener('visibilitychange', sync);
    global.addEventListener('pagehide', disconnect);

    function set(status, setOptions){
      status = status || {};
      setOptions = setOptions || {};
      var isDemo = !!setOptions.demo;
      var isLive = !!status.live && (isDemo || status.url || status.watchEmbedUrl);
      var preferEmbed = status.sitePlayer === 'embed' || !status.url;
      var nextEmbed = isLive && !isDemo && preferEmbed && status.watchEmbedUrl ? status.watchEmbedUrl : '';
      var nextUrl = isLive && !isDemo && !nextEmbed && status.url ? status.url : '';

      root.classList.toggle('dbv-off', !isLive);
      root.classList.toggle('is-demo', isDemo && isLive);
      root.classList.toggle('is-embed', !!nextEmbed);
      if (nextEmbed !== embedUrl){
        embedUrl = nextEmbed;
        if (nextEmbed){ disconnect(); embed.src = nextEmbed; }
        else embed.removeAttribute('src');
      }
      if (nextUrl !== wantedUrl){
        wantedUrl = nextUrl;
        if (call && joined !== wantedUrl) disconnect();
      }
      var links = Array.isArray(status.externalWatchLinks) ? status.externalWatchLinks.slice(0, 3) : [];
      if (!links.length && status.externalWatchUrl) links = [{ label:'Twitch', url:status.externalWatchUrl }];
      platformLinks.innerHTML = '';
      links.forEach(function(link){
        if (!link || !/^https:\/\//.test(String(link.url || ''))) return;
        var anchor = el('a', 'dbv-action', link.label || 'Watch');
        anchor.href = link.url;
        anchor.target = '_blank';
        anchor.rel = 'noopener';
        platformLinks.appendChild(anchor);
      });
      platformLinks.hidden = !platformLinks.childNodes.length;
      if (!isLive){
        wantedUrl = '';
        embedUrl = '';
        embed.removeAttribute('src');
        disconnect();
      } else if (nextUrl){
        root.classList.add('is-waiting');
        setTimeout(function(){
          if (!heardIntersection && !visible){ visible = true; sync(); }
        }, 1200);
      } else {
        root.classList.remove('is-waiting');
      }
      sync();
      return isLive;
    }

    return {
      set: set,
      destroy: function(){
        destroyed = true;
        disconnect();
        root.innerHTML = '';
      }
    };
  }

  global.DebatableBroadcast = { mount: mount };
})(window);
