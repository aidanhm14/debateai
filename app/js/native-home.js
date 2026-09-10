/* Native social home. Public discovery reads only; existing pages own
   matching, auth, friendship writes, playback and the round lifecycle. */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var pending = false, timer;
  var photoMotion = $('photoMotion');
  var photoTrack = document.querySelector('.nh-face-track');
  var faceVideos = Array.from(photoTrack.querySelectorAll('video'));
  var visibleFaces = new Set();
  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  function syncFaceMotion() {
    var allowed = !document.hidden && !reduceMotion.matches && photoMotion.getAttribute('aria-pressed') !== 'true';
    faceVideos.forEach(function (video) {
      if (allowed && visibleFaces.has(video)) {
        if (!video.getAttribute('src')) video.src = video.getAttribute('data-src');
        video.muted = true;
        if (video.paused) video.play().catch(function () { /* The poster stays visible if autoplay is unavailable. */ });
      } else video.pause();
    });
  }
  var faceObserver = window.IntersectionObserver ? new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (entry.isIntersecting) visibleFaces.add(entry.target);
      else visibleFaces.delete(entry.target);
    });
    syncFaceMotion();
  }, { threshold: 0.15 }) : { observe: function () {}, disconnect: function () {} };
  faceVideos.forEach(function (video) { faceObserver.observe(video); });
  if (reduceMotion.addEventListener) reduceMotion.addEventListener('change', syncFaceMotion);
  else reduceMotion.addListener(syncFaceMotion);
  photoMotion.addEventListener('click', function () {
    var paused = photoMotion.getAttribute('aria-pressed') !== 'true';
    photoMotion.setAttribute('aria-pressed', String(paused));
    photoMotion.setAttribute('aria-label', paused ? 'Play face animations' : 'Pause face animations');
    photoTrack.classList.toggle('is-paused', paused);
    photoMotion.querySelector('path').setAttribute('d', paused ? 'M9 5l10 7-10 7z' : 'M9 6v12M15 6v12');
    syncFaceMotion();
  });
  document.addEventListener('visibilitychange', function () {
    photoTrack.classList.toggle('is-hidden', document.hidden);
    syncFaceMotion();
  });
  function request(path) {
    var controller = new AbortController();
    var timeout = setTimeout(function () { controller.abort(); }, 8000);
    return fetch(path, { signal: controller.signal }).then(function (r) {
      if (!r.ok) throw new Error('unavailable');
      return r.json();
    }).finally(function () { clearTimeout(timeout); });
  }
  function refreshDiscovery() {
    if (pending || document.hidden) return;
    pending = true;
    var queue = request('/api/spar-queue').then(function (d) {
      var n = Number(d.waiting);
      if (d.error || !Number.isFinite(n) || n < 0) throw new Error('unavailable');
      $('queueStatus').textContent = n > 0 ? n + (n === 1 ? ' person waiting to talk' : ' people waiting to talk') : 'Start the next conversation';
      $('queueStatus').classList.toggle('is-live', n > 0);
    }).catch(function () {
      $('queueStatus').textContent = navigator.onLine === false ? 'Reconnect to meet someone' : 'Voice and video. One on one.';
      $('queueStatus').classList.remove('is-live');
    });
    var watch = request('/api/stream-status').then(function (s) {
      if (s && s.live) {
        $('watchLabel').textContent = 'LIVE NOW';
        $('watchHeading').textContent = s.title || 'A conversation is happening.';
        $('watchDetail').textContent = 'Drop in and hear both sides.';
        $('homeWatch').classList.add('is-live');
        return;
      }
      $('homeWatch').classList.remove('is-live');
      return request('/api/recordings').then(function (d) {
        var recordings = Array.isArray(d.recordings) ? d.recordings : [];
        var playable = recordings.filter(function (r) { return r && !r.teaser; });
        $('watchLabel').textContent = playable.length ? 'FROM THE CONVERSATION' : 'WATCH';
        $('watchHeading').textContent = playable.length ? (playable[0].motion || playable[0].title || 'Hear both sides.') : "Watch a debate.";
        $('watchDetail').textContent = playable.length ? 'Watch this and more conversations.' : 'Explore the watch page.';
      });
    }).catch(function () {
      // A previous live state must expire when the status becomes unknown.
      $('homeWatch').classList.remove('is-live');
      $('watchLabel').textContent = 'WATCH';
      $('watchHeading').textContent = "Watch a debate.";
      $('watchDetail').textContent = 'Live debates and replays.';
    });
    Promise.allSettled([queue, watch]).finally(function () { pending = false; });
  }
  refreshDiscovery();
  timer = setInterval(refreshDiscovery, 45000);
  document.addEventListener('visibilitychange', function () { if (!document.hidden) refreshDiscovery(); });
  window.addEventListener('online', refreshDiscovery);
  window.addEventListener('offline', function () {
    $('queueStatus').textContent = 'Reconnect to meet someone';
    $('queueStatus').classList.remove('is-live');
    $('homeWatch').classList.remove('is-live');
    $('watchLabel').textContent = 'WATCH';
  });
  // Resume only known product destinations on this origin. A stored URL
  // must never become a javascript: link or an external navigation.
  try {
    var saved = localStorage.getItem('dit-native-last-path');
    var resume = saved && new URL(saved, location.origin);
    if (resume && resume.origin === location.origin && /^\/(friends|messages|watch|profile|community|leaderboard)(?:\.html)?$/.test(resume.pathname)) {
      $('resumeLink').href = resume.pathname + resume.search + resume.hash;
      $('resumeLink').hidden = false;
    }
  } catch (e) {}
  function status(message) { $('homeStatus').textContent = message; }
  $('alertsBtn').addEventListener('click', function () {
    if (!window.DBEnableAlerts) { status('Open Debatable on your phone to enable app notifications.'); return; }
    var button = this;
    button.disabled = true;
    window.DBEnableAlerts().then(function (result) {
      var granted = result && (result.receive === 'granted' || result.display === 'granted');
      if (granted) { button.textContent = 'Notifications on'; status('Notifications are enabled.'); }
      else status('Notifications are off. You can change this in your phone settings.');
    }).catch(function () { status('Notifications could not be enabled. Check your phone settings.'); })
      .finally(function () { button.disabled = false; });
  });
  $('shareBtn').addEventListener('click', function () {
    var payload = { title: 'Debatable', text: 'Join me on Debatable.', url: 'https://itsdebatable.com/' };
    var sharing;
    try {
      var plugin = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.Share;
      if (plugin && plugin.share) sharing = plugin.share(payload);
      else if (navigator.share) sharing = navigator.share(payload);
      else if (navigator.clipboard) sharing = navigator.clipboard.writeText(payload.url).then(function () { status('Invite link copied.'); });
      else { status('Invite someone at itsdebatable.com.'); return; }
      Promise.resolve(sharing).catch(function (error) { if (error && error.name !== 'AbortError') status('The invite could not be shared. Try again.'); });
    } catch (e) { status('The invite could not be shared. Try again.'); }
  });

  // Load personal content after the first paint. The homepage remains
  // useful if Firebase is slow or unavailable, and never creates a guest.
  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      var s = document.createElement('script'); s.src = src;
      s.onload = resolve; s.onerror = reject; document.head.appendChild(s);
    });
  }
  var stopFriends = null, authStop = null;
  function clearFriends() {
    if (stopFriends) { stopFriends(); stopFriends = null; }
    document.querySelectorAll('[data-home-friend]').forEach(function (el) { el.remove(); });
    $('friendRequests').hidden = true;
    document.querySelector('.nh-people-note').hidden = false;
  }
  function startPersonalContent() {
    var sdk = 'https://www.gstatic.com/firebasejs/10.13.2/';
    Promise.resolve().then(function () { if (!window.firebase) return loadScript(sdk + 'firebase-app-compat.js'); })
      .then(function () { if (!firebase.auth) return loadScript(sdk + 'firebase-auth-compat.js'); })
      .then(function () { if (!firebase.firestore) return loadScript(sdk + 'firebase-firestore-compat.js'); })
      .then(function () {
        if (!firebase.apps.length) firebase.initializeApp({
          apiKey: ['AIzaSyDDx','TYlyWLOJnFP99','e7XsLPb3FwIEijNNM'].join(''),
          authDomain: 'debateos-78ac5.firebaseapp.com', projectId: 'debateos-78ac5',
          storageBucket: 'debateos-78ac5.firebasestorage.app', messagingSenderId: '860359449192',
          appId: '1:860359449192:web:f5dc0060dbd50d6c4fb9dd'
        });
        authStop = firebase.auth().onAuthStateChanged(function (user) {
          clearFriends();
          if (!user || user.isAnonymous) return;
          stopFriends = firebase.firestore().collection('friendships').where('uids', 'array-contains', user.uid).limit(30)
            .onSnapshot(function (snapshot) {
              document.querySelectorAll('[data-home-friend]').forEach(function (el) { el.remove(); });
              var count = 0, incoming = 0;
              snapshot.forEach(function (doc) {
                var d = doc.data(), other = (d.uids || []).find(function (uid) { return uid !== user.uid; });
                if (!other) return;
                var state = d.state || {};
                if (state[other] === 'accepted' && state[user.uid] !== 'accepted') incoming++;
                if (state[other] !== 'accepted' || state[user.uid] !== 'accepted' || count >= 5) return;
                var name = (d.names || {})[other] || 'Friend';
                var a = document.createElement('a'); a.className = 'nh-person'; a.setAttribute('data-home-friend', '');
                a.href = '/messages?dm=' + encodeURIComponent(other) + '&name=' + encodeURIComponent(name);
                var avatar = document.createElement('span'); avatar.className = 'nh-person-avatar'; avatar.setAttribute('aria-hidden', 'true');
                avatar.textContent = Array.from(name.trim())[0] || '?';
                var label = document.createElement('strong'); label.textContent = name;
                a.append(avatar, label); $('homeFriends').insertBefore(a, $('homeFriends').firstChild); count++;
              });
              document.querySelector('.nh-people-note').hidden = count > 0;
              $('friendRequests').hidden = !incoming;
              $('friendRequests').textContent = incoming + (incoming === 1 ? ' friend request' : ' friend requests') + ' →';
            }, function () { clearFriends(); });
        });
      }).catch(function () { /* Find friends remains a working destination. */ });
  }
  if ('requestIdleCallback' in window) requestIdleCallback(startPersonalContent, { timeout: 1500 });
  else setTimeout(startPersonalContent, 400);
  window.addEventListener('pagehide', function () { clearInterval(timer); if (stopFriends) stopFriends(); if (authStop) authStop(); faceObserver.disconnect(); faceVideos.forEach(function (video) { video.pause(); }); });
  window.addEventListener('pageshow', function (event) {
    if (!event.persisted) return;
    refreshDiscovery();
    timer = setInterval(refreshDiscovery, 45000);
    startPersonalContent();
    faceVideos.forEach(function (video) { faceObserver.observe(video); });
  });
})();
