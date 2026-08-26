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
  // ~6.4s of CONTINUOUS flagging before anything happens (2026-08-24).
  // Two samples was a 3.2s window, which is the length of a stretch, a
  // lean-back, or a reach for a glass of water. Sustained is the signal
  // that separates a camera pointed at explicit content from a person
  // moving their body: content stays in frame, a gesture does not. Any
  // single clean sample resets the streak to zero.
  var TRIP_CONSECUTIVE = 4;

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

  // ── Where the classification actually runs ────────────────────────
  // Measured 2026-08-26 on an M3 Pro, against this exact vendored model:
  // classifying IN PAGE blocked the main thread for a median of 39ms and
  // up to 80ms per sample, and 4 of 20 samples registered as long tasks
  // (>=50ms). One sample per 1.6s inside a live video call is therefore a
  // 2 to 5 frame stall on a fixed rhythm, for the whole round, on the
  // very thread that composites the video. It was the page's single
  // largest source of stutter and it was invisible because the work is
  // correct and the feature is silent.
  //
  // The same model on the same webgl backend, inside a Worker: 0.1ms
  // median on the main thread (1.2ms worst), zero long tasks.
  //
  // DETECTION IS UNCHANGED. Same weights, same 1.6s cadence, same
  // thresholds, same two-consecutive-samples rule, same evidence-only
  // posture from 2026-08-18. Only the thread moved.
  //
  // The in-page path below is kept as the fallback, because a browser
  // without Worker or createImageBitmap still has a camera and still
  // needs watching. A guard that runs nowhere is worse than one that
  // stutters.
  var workerSupported = (function () {
    return typeof Worker === 'function'
      && typeof createImageBitmap === 'function'
      && typeof MessageChannel === 'function';
  })();

  var workerPromise = null;

  // Resolves to a { classify(videoEl) -> Promise<preds> } or rejects, in
  // which case the caller falls back to the in-page model.
  function startWorker() {
    if (workerPromise) return workerPromise;
    workerPromise = new Promise(function (resolve, reject) {
      var w;
      try { w = new Worker('/js/nsfw-worker.js'); }
      catch (e) { reject(e); return; }

      var settled = false;
      var seq = 0;
      var waiting = {};          // id -> {resolve, reject}
      // A worker that never answers 'ready' must not leave the guard
      // waiting forever with no detector running at all.
      var initTimer = setTimeout(function () {
        if (settled) return;
        settled = true;
        try { w.terminate(); } catch (e) {}
        reject(new Error('worker init timed out'));
      }, 20000);

      w.onerror = function (e) {
        if (!settled) {
          settled = true;
          clearTimeout(initTimer);
          try { w.terminate(); } catch (err) {}
          reject(new Error((e && e.message) || 'worker error'));
          return;
        }
        // After init, a hard worker error fails every call in flight
        // rather than hanging the sampler.
        Object.keys(waiting).forEach(function (k) {
          try { waiting[k].reject(new Error('worker died')); } catch (err) {}
          delete waiting[k];
        });
      };

      w.onmessage = function (e) {
        var m = e.data || {};
        if (m.cmd === 'ready') {
          if (settled) return;
          settled = true;
          clearTimeout(initTimer);
          resolve({
            kind: 'worker',
            backend: m.backend || '',
            classify: function (videoEl) {
              // Resize during decode, so the main thread never draws the
              // frame into a canvas at all. This is the whole handoff.
              return createImageBitmap(videoEl, {
                resizeWidth: 224, resizeHeight: 224, resizeQuality: 'low',
              }).then(function (bmp) {
                return new Promise(function (res, rej) {
                  var id = ++seq;
                  waiting[id] = { resolve: res, reject: rej };
                  try { w.postMessage({ cmd: 'classify', id: id, bitmap: bmp }, [bmp]); }
                  catch (err) {
                    delete waiting[id];
                    try { bmp.close(); } catch (e2) {}
                    rej(err);
                  }
                });
              });
            },
            stop: function () { try { w.terminate(); } catch (e) {} },
          });
          return;
        }
        if (m.cmd === 'fail') {
          if (settled) return;
          settled = true;
          clearTimeout(initTimer);
          try { w.terminate(); } catch (err) {}
          reject(new Error(m.error || 'worker model load failed'));
          return;
        }
        if (m.cmd === 'scores') {
          var slot = waiting[m.id];
          if (!slot) return;
          delete waiting[m.id];
          if (m.error) slot.reject(new Error(m.error));
          else slot.resolve(m.preds || []);
        }
      };

      w.postMessage({ cmd: 'init', vendor: VENDOR });
    }).catch(function (e) {
      console.warn('[nsfw-guard] worker unavailable, falling back in-page', e);
      workerPromise = null;      // a later attach may still succeed
      throw e;
    });
    return workerPromise;
  }

  // The in-page classifier, wrapped to the same interface. Draws the
  // frame into a 224px canvas exactly as it always did.
  function startInPage() {
    return loadModel().then(function (model) {
      var canvas = document.createElement('canvas');
      canvas.width = 224; canvas.height = 224;
      var ctx = canvas.getContext('2d', { willReadFrequently: true });
      return {
        kind: 'page',
        backend: '',
        classify: function (videoEl) {
          ctx.drawImage(videoEl, 0, 0, 224, 224);
          return model.classify(canvas);
        },
        stop: function () {},
      };
    });
  }

  // Worker first, in-page second. Never both: each loads ~5MB of model.
  function startClassifier() {
    if (!workerSupported) return startInPage();
    return startWorker().catch(function () { return startInPage(); });
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

  // Only a flagrant feed trips this. 'drawing'/'neutral' never flag.
  //
  // 2026-08-24, from a user report that it flagged EVERY TIME THEY
  // RAISED THEIR ARMS TO STRETCH: `sexy` is not an explicit-content
  // class. It fires on ordinary posture and skin, and a stretch is the
  // worst case for it — arms up, torso open, shirt riding up — so it
  // scored high enough on `sexy` ALONE to clear the old porn+sexy>=0.92
  // sum while `porn` sat near zero. That rule had no floor on the porn
  // term, so the combined branch was really a bare `sexy` branch.
  // It now requires a substantial porn score of its own: `sexy` can
  // reinforce a real signal, never carry a trip by itself.
  //
  // The hard thresholds moved up with it (porn .72 -> .90, hentai .78
  // -> .92) because this layer is deliberately for the egregious case:
  // a machine flag cuts the person's own camera and interrupts the
  // round to ask their opponent about them, which is far too expensive
  // to spend on a maybe. Everything short of flagrant is covered by the
  // peer Report button, which a human aims on purpose.
  function isFlagged(sc) {
    return (sc.porn >= 0.90) ||
           (sc.hentai >= 0.92) ||
           (sc.porn >= 0.55 && sc.porn + sc.sexy >= 0.94);
  }

  function attach(opts) {
    var running = true, tripped = false, streak = 0, timer = null;
    // The 224px canvas moved into the classifier: the worker path never
    // needs one, because createImageBitmap does the resize during decode.
    var inFlight = false;

    function videoEl() {
      return typeof opts.videoEl === 'function' ? opts.videoEl() : opts.videoEl;
    }

    function tick(clf) {
      if (!running || tripped) return;
      // Single-flight. A sample takes ~40ms against a 1600ms interval, so
      // this only ever bites when the machine is badly behind, and there
      // queueing more work is the wrong answer.
      if (inFlight) return;
      var v = videoEl();
      var active = !opts.isActive || opts.isActive();
      if (!active || !v || v.readyState < 2 || !v.videoWidth) { streak = 0; return; }
      inFlight = true;
      var settle = function () { inFlight = false; };
      var p;
      try { p = clf.classify(v); }
      catch (e) { settle(); return; }
      p.then(function (preds) {
        settle();
        if (!running || tripped) return;
        var sc = {};
        (preds || []).forEach(function (p2) { sc[String(p2.className).toLowerCase()] = p2.probability; });
        sc.porn = sc.porn || 0; sc.sexy = sc.sexy || 0; sc.hentai = sc.hentai || 0;
        if (isFlagged(sc)) {
          streak++;
          if (streak >= TRIP_CONSECUTIVE) trip(sc);
        } else {
          streak = 0;
        }
      }).catch(function () { settle(); /* one bad frame never matters */ });
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

    var classifier = null;
    startClassifier().then(function (clf) {
      if (!running) { try { clf.stop(); } catch (e) {} return; }
      classifier = clf;
      timer = setInterval(function () { tick(clf); }, SAMPLE_MS);
      try { gtag('event', 'video_guard_on', { engine: clf.kind }); } catch (e) {}
    }).catch(function () { /* inert */ });

    return {
      stop: function () {
        running = false;
        if (timer) clearInterval(timer);
        // The worker owns a webgl context and ~5MB of weights. A round
        // that ends without releasing it leaves both alive for the rest
        // of the session.
        if (classifier) { try { classifier.stop(); } catch (e) {} classifier = null; }
      },
      tripped: function () { return tripped; },
      // Re-arm after the opponent cleared a flag as a false positive, so
      // the camera can come back WITH the watchdog still running.
      reset: function () {
        if (!running || !tripped) return;
        tripped = false; streak = 0; inFlight = false;
        if (timer) clearInterval(timer);
        if (classifier) timer = setInterval(function () { tick(classifier); }, SAMPLE_MS);
      },
    };
  }

  window.DebateGuard = {
    attach: attach,
    report: function (p) { return post(Object.assign({ action: 'report' }, p)); },
    check: function () { return post({ action: 'check' }); },
  };
})();
