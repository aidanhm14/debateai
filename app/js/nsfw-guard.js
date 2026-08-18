/* nsfw-guard.js — on-device explicit-content watchdog for video rooms.
 *
 * Runs a small NSFW image classifier (self-hosted at /vendor/nsfw/,
 * TF.js bundled inside nsfwjs.min.js) over the debater's OWN outgoing
 * camera feed while it is live in Camera mode. Everything stays on the
 * device: no frames, no pixels, and no images ever leave the browser —
 * on a trip, only the score numbers are sent to /api/video-moderate as
 * EVIDENCE. Nothing punitive happens from a machine flag alone
 * (2026-08-18: the classifier false-positived on normal webcams and was
 * auto-banning people): the page cuts its own outgoing video and asks
 * the OPPONENT to confirm; a confirming peer report is what removes.
 *
 * The guard only needs to watch the LOCAL feed because Avatar and Off
 * modes never transmit camera pixels at all (cam-avatar.js draws a
 * cartoon or a blank tile), so the outgoing camera is the only path
 * explicit content can take to the room. Remote participants each run
 * their own copy of this watchdog, and the Report button covers what a
 * classifier can't judge (trolling, harassment, non-serious behavior).
 *
 * Usage:
 *   var guard = DebateGuard.attach({
 *     videoEl: fn|el,          // raw camera <video> (or fn returning it)
 *     isActive: fn,            // sample only when this returns true
 *     room: 'Debatable-x',     // Daily room name
 *     roundId: '',             // optional round doc id for the report
 *     sessionId: fn,           // fn → own Daily session id (or '')
 *     onTrip: fn(result)       // video already cut; update the UI
 *   });
 *   guard.stop()
 *
 *   DebateGuard.report({room, category, offender, sessionId, roundId, note})
 *     → Promise<{ok, ejected}>   // manual peer report
 *   DebateGuard.check() → Promise<{banned, until}>
 *
 * Never breaks video: if the model fails to load (old browser, blocked
 * storage, low memory) the guard silently stays inert.
 */
(function () {
  var VENDOR = '/vendor/nsfw/';
  var SAMPLE_MS = 1600;        // one classification pass per ~1.6s
  var TRIP_CONSECUTIVE = 2;    // two flagged samples in a row → act

  var modelPromise = null;

  function loadScript(src) {
    return new Promise(function (res, rej) {
      var s = document.createElement('script');
      s.src = src; s.async = true;
      s.onload = res; s.onerror = function () { rej(new Error('load failed ' + src)); };
      document.head.appendChild(s);
    });
  }

  function loadModel() {
    if (modelPromise) return modelPromise;
    modelPromise = (window.nsfwjs ? Promise.resolve() : loadScript(VENDOR + 'nsfwjs.min.js'))
      .then(function () { return window.nsfwjs.load(VENDOR); })
      .catch(function (e) {
        console.warn('[nsfw-guard] detector unavailable', e);
        modelPromise = null;   // allow a later retry
        throw e;
      });
    return modelPromise;
  }

  function authHeader() {
    try {
      var u = window.firebase && firebase.auth && firebase.auth().currentUser;
      if (u) return u.getIdToken().then(function (t) { return { 'Authorization': 'Bearer ' + t }; });
    } catch (e) {}
    return Promise.resolve({});
  }

  function post(payload) {
    return authHeader().then(function (h) {
      return fetch('/api/video-moderate', {
        method: 'POST',
        headers: Object.assign({ 'Content-Type': 'application/json' }, h),
        body: JSON.stringify(payload),
      }).then(function (r) { return r.json().catch(function () { return {}; }); });
    }).catch(function () { return {}; });
  }

  // porn/hentai are hard signals; porn+sexy combined catches partial
  // undress. 'drawing'/'neutral' never flag. Thresholds sit high so a
  // normal webcam at a desk (faces, walls, gestures) never trips —
  // two consecutive flagged samples are required on top.
  function isFlagged(sc) {
    return (sc.porn >= 0.72) || (sc.hentai >= 0.78) || (sc.porn + sc.sexy >= 0.92);
  }

  function attach(opts) {
    var running = true, tripped = false, streak = 0, timer = null;
    var canvas = document.createElement('canvas');
    canvas.width = 224; canvas.height = 224;
    var ctx = canvas.getContext('2d', { willReadFrequently: true });

    function videoEl() {
      return typeof opts.videoEl === 'function' ? opts.videoEl() : opts.videoEl;
    }

    function tick(model) {
      if (!running || tripped) return;
      var v = videoEl();
      var active = !opts.isActive || opts.isActive();
      if (!active || !v || v.readyState < 2 || !v.videoWidth) { streak = 0; return; }
      try { ctx.drawImage(v, 0, 0, 224, 224); } catch (e) { return; }
      model.classify(canvas).then(function (preds) {
        if (!running || tripped) return;
        var sc = {};
        (preds || []).forEach(function (p) { sc[p.className.toLowerCase()] = p.probability; });
        sc.porn = sc.porn || 0; sc.sexy = sc.sexy || 0; sc.hentai = sc.hentai || 0;
        if (isFlagged(sc)) {
          streak++;
          if (streak >= TRIP_CONSECUTIVE) trip(sc);
        } else {
          streak = 0;
        }
      }).catch(function () { /* one bad frame never matters */ });
    }

    function trip(scores) {
      tripped = true;
      clearInterval(timer);
      var sess = '';
      try { sess = typeof opts.sessionId === 'function' ? (opts.sessionId() || '') : (opts.sessionId || ''); } catch (e) {}
      // Tell the page FIRST so it cuts the outgoing video this frame.
      try { if (opts.onTrip) opts.onTrip({ scores: scores }); } catch (e) {}
      post({
        action: 'self_flag',
        room: opts.room || '',
        roundId: opts.roundId || '',
        sessionId: sess,
        scores: {
          porn: +scores.porn.toFixed(3), sexy: +scores.sexy.toFixed(3),
          hentai: +scores.hentai.toFixed(3),
          neutral: +((scores.neutral || 0)).toFixed(3),
        },
      }).then(function (res) {
        try { if (opts.onDecision) opts.onDecision(res || {}); } catch (e) {}
      });
      try { gtag('event', 'video_guard_trip'); } catch (e) {}
    }

    var loadedModel = null;
    loadModel().then(function (model) {
      if (!running) return;
      loadedModel = model;
      timer = setInterval(function () { tick(model); }, SAMPLE_MS);
      try { gtag('event', 'video_guard_on'); } catch (e) {}
    }).catch(function () { /* inert */ });

    return {
      stop: function () { running = false; if (timer) clearInterval(timer); },
      tripped: function () { return tripped; },
      // Re-arm after the opponent cleared a flag as a false positive, so
      // the camera can come back WITH the watchdog still running.
      reset: function () {
        if (!running || !tripped) return;
        tripped = false; streak = 0;
        if (timer) clearInterval(timer);
        if (loadedModel) timer = setInterval(function () { tick(loadedModel); }, SAMPLE_MS);
      },
    };
  }

  window.DebateGuard = {
    attach: attach,
    report: function (p) { return post(Object.assign({ action: 'report' }, p)); },
    check: function () { return post({ action: 'check' }); },
  };
})();
