/* cam-avatar.js — the camera converter for DebateIt video rooms.
 *
 * Wraps the user's media stream and publishes ONE stable processed video
 * track with three live-switchable modes:
 *
 *   'camera' — passthrough: the raw camera drawn to the canvas (cover-fit).
 *   'avatar' — anonymous animated avatar. Camera pixels are NEVER drawn
 *              in this mode; if a video track is present it is used only
 *              to run an on-device face tracker (MediaPipe FaceLandmarker,
 *              lazy-loaded from CDN) whose motion data drives the mask:
 *              head turn/tilt/lean, real blinks, brow raises, smile, and
 *              jaw movement. No frames and no landmarks ever leave the
 *              device; the room receives only the cartoon. If the tracker
 *              or camera is unavailable, the avatar falls back to a
 *              mic-level mouth plus idle head sway, so it always reads
 *              as a live human.
 *   'off'    — a quiet "camera off" tile.
 *
 * Because the published track is always the same canvas.captureStream(),
 * switching modes never renegotiates the call; it only changes what the
 * draw loop paints.
 *
 * Usage:
 *   const cam = await DebateCam.start(mediaStream, { mode:'avatar', label:'PRO' });
 *   cam.stream    -> MediaStream (converted video + original audio)
 *   cam.setMode('camera'|'avatar'|'off'); cam.setLabel('CON');
 *   cam.mode()    -> current mode      cam.level() -> 0..1 mic level
 *   cam.debugFace(sig|null) -> QA hook: override face signals (demo pages)
 *   cam.stop()
 */
(function () {
  const OUT_W = 1280, OUT_H = 720, FPS = 24;
  const INK = '#0b0b0c', BONE = '#f0ede6', RED = '#dd2e2e', DIM = '#232326';
  const HEAD = '#1b1b1f', TORSO = '#131317', THROAT = '#a51f1f';

  // ── Face tracker (shared across instances, loaded once per page) ──────
  // MediaPipe tasks-vision, WASM, runs entirely in this tab. ~3MB model,
  // fetched only the first time avatar mode starts with a camera present.
  const MP_CDN = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14';
  const MP_MODEL = 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';
  const tracker = { status: 'idle', lm: null, lastTs: 0 };
  function loadTracker() {
    if (tracker.status !== 'idle') return;
    tracker.status = 'loading';
    import(MP_CDN + '/vision_bundle.mjs')
      .then(function (vision) {
        return vision.FilesetResolver.forVisionTasks(MP_CDN + '/wasm').then(function (files) {
          function create(delegate) {
            return vision.FaceLandmarker.createFromOptions(files, {
              baseOptions: { modelAssetPath: MP_MODEL, delegate: delegate },
              runningMode: 'VIDEO', numFaces: 1, outputFaceBlendshapes: true,
            });
          }
          return create('GPU').catch(function () { return create('CPU'); });
        });
      })
      .then(function (lm) { tracker.lm = lm; tracker.status = 'ready'; })
      .catch(function (e) {
        tracker.status = 'failed';
        console.warn('[cam-avatar] face tracker unavailable, mic-driven fallback', e);
      });
  }

  function makeMouthMeter(stream) {
    // Mic level -> smoothed 0..1 "openness". No audio is played anywhere.
    const track = stream.getAudioTracks()[0];
    if (!track) return { level: () => 0, close: () => {} };
    const Ctx = window.AudioContext || window.webkitAudioContext;
    const ctx = new Ctx();
    const src = ctx.createMediaStreamSource(new MediaStream([track]));
    const an = ctx.createAnalyser();
    an.fftSize = 512; an.smoothingTimeConstant = 0.6;
    src.connect(an);
    const buf = new Uint8Array(an.fftSize);
    let smooth = 0, lastT = performance.now();
    return {
      level: function () {
        an.getByteTimeDomainData(buf);
        let sum = 0;
        for (let i = 0; i < buf.length; i++) { const d = (buf[i] - 128) / 128; sum += d * d; }
        const rms = Math.sqrt(sum / buf.length);            // ~0.01 quiet, ~0.2 loud
        const target = Math.min(1, Math.max(0, (rms - 0.015) * 9));
        // Time-based smoothing (fast attack, slower release) so the mouth
        // behaves the same at 30fps and in a 1fps background-throttled tab.
        const now = performance.now();
        const dt = Math.min(1000, now - lastT); lastT = now;
        const a = 1 - Math.exp(-dt / (target > smooth ? 60 : 250));
        smooth += (target - smooth) * a;
        return smooth;
      },
      close: function () { try { ctx.close(); } catch (e) {} },
    };
  }

  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

  // Face signal set. Pose values are normalized (-1..1-ish), roll is
  // radians, expressions are 0..1. Everything is smoothed before drawing.
  function zeroFace() {
    return { x: 0, y: 0, s: 1, yaw: 0, pitch: 0, roll: 0,
             jaw: 0, smile: 0, pucker: 0, browUp: 0, browDown: 0,
             blinkL: 0, blinkR: 0, gazeX: 0, gazeY: 0 };
  }

  // Landmarks + blendshapes -> face signals. Coordinates are mirrored
  // (selfie-style) so leaning left moves the avatar the way a mirror
  // would, which is what feels correct when previewing yourself.
  function parseDetection(res) {
    const pts = res.faceLandmarks && res.faceLandmarks[0];
    if (!pts) return null;
    const b = {};
    const cats = res.faceBlendshapes && res.faceBlendshapes[0] && res.faceBlendshapes[0].categories;
    if (cats) for (let i = 0; i < cats.length; i++) b[cats[i].categoryName] = cats[i].score;
    const g = function (k) { return b[k] || 0; };

    const L = pts[234], R = pts[454], nose = pts[1], top = pts[10], chin = pts[152];
    const eyeR = pts[33], eyeL = pts[263];
    const w = Math.hypot(R.x - L.x, R.y - L.y) || 0.001;
    const cx = (L.x + R.x) / 2, cy = (L.y + R.y) / 2;

    const f = zeroFace();
    f.x = clamp((0.5 - cx) * 2.4, -1, 1);                       // mirrored
    f.y = clamp((cy - 0.5) * 2.0, -1, 1);
    f.s = clamp(w / 0.30, 0.82, 1.15);                          // lean in = bigger
    f.yaw = clamp(-((nose.x - cx) / w) / 0.22, -1, 1);          // mirrored
    const faceH = (chin.y - top.y) || 0.001;
    f.pitch = clamp(((nose.y - top.y) / faceH - 0.53) * 4.5, -1, 1);
    f.roll = clamp(-Math.atan2(eyeL.y - eyeR.y, eyeL.x - eyeR.x), -0.4, 0.4);

    f.jaw = clamp(g('jawOpen') * 1.7, 0, 1);
    f.smile = clamp((g('mouthSmileLeft') + g('mouthSmileRight')) * 0.75, 0, 1);
    f.pucker = clamp(Math.max(g('mouthPucker'), g('mouthFunnel')) * 1.1, 0, 1);
    f.browUp = clamp(g('browInnerUp') * 0.8 + (g('browOuterUpLeft') + g('browOuterUpRight')) * 0.35, 0, 1);
    f.browDown = clamp((g('browDownLeft') + g('browDownRight')) * 0.7, 0, 1);
    const bl = function (v) { return clamp((v - 0.22) / 0.38, 0, 1); };
    f.blinkL = bl(g('eyeBlinkRight'));                          // mirrored swap
    f.blinkR = bl(g('eyeBlinkLeft'));
    f.gazeX = clamp(((g('eyeLookOutLeft') + g('eyeLookInRight')) - (g('eyeLookOutRight') + g('eyeLookInLeft'))) * 0.9, -1, 1);
    f.gazeY = clamp(((g('eyeLookUpLeft') + g('eyeLookUpRight')) - (g('eyeLookDownLeft') + g('eyeLookDownRight'))) * 0.7, -1, 1);
    return f;
  }

  // ── Drawing ───────────────────────────────────────────────────────────
  function drawBackdrop(ctx, w, h) {
    const grad = ctx.createRadialGradient(w / 2, h * 0.42, h * 0.1, w / 2, h * 0.5, h * 0.85);
    grad.addColorStop(0, '#17171a');
    grad.addColorStop(1, '#09090a');
    ctx.fillStyle = grad; ctx.fillRect(0, 0, w, h);
  }

  function drawAvatar(ctx, w, h, label, f, level, now) {
    drawBackdrop(ctx, w, h);
    const baseR = Math.min(w, h) * 0.335;
    const R = baseR * f.s * (1 + level * 0.015);
    const hx = w / 2 + f.x * baseR * 0.42;
    const hy = h / 2 - baseR * 0.06 + f.y * baseR * 0.28;

    // speaking glow ring (behind everything)
    const talk = Math.max(level, f.jaw * 0.8);
    if (talk > 0.04) {
      ctx.beginPath(); ctx.arc(hx, hy, R + 16 + talk * 12, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(221,46,46,' + (0.10 + talk * 0.30) + ')';
      ctx.lineWidth = 7 + talk * 9; ctx.stroke();
    }

    // shoulders: follow the head at a fraction of its offset, no roll,
    // so the head moves against them (parallax reads as a body)
    const sx = w / 2 + f.x * baseR * 0.16, sy = h / 2 + baseR * 0.98;
    ctx.beginPath();
    ctx.moveTo(sx - R * 1.55, h + 4);
    ctx.bezierCurveTo(sx - R * 1.5, sy + R * 0.1, sx - R * 0.95, sy - R * 0.32, sx, sy - R * 0.34);
    ctx.bezierCurveTo(sx + R * 0.95, sy - R * 0.32, sx + R * 1.5, sy + R * 0.1, sx + R * 1.55, h + 4);
    ctx.closePath();
    ctx.fillStyle = TORSO; ctx.fill();
    ctx.strokeStyle = 'rgba(221,46,46,0.20)'; ctx.lineWidth = 3; ctx.stroke();

    // head group: rotate with roll; features shift with yaw/pitch to fake
    // a 3D turn; head squashes slightly on strong turns
    ctx.save();
    ctx.translate(hx, hy);
    ctx.rotate(f.roll * 0.85);
    const squash = 1 - Math.abs(f.yaw) * 0.10;
    const fx = f.yaw * R * 0.34;                 // feature shift, x
    const fy = f.pitch * R * 0.26;               // feature shift, y

    ctx.beginPath(); ctx.ellipse(0, 0, R * 0.90 * squash, R * 1.02, 0, 0, Math.PI * 2);
    ctx.fillStyle = HEAD; ctx.fill();
    ctx.lineWidth = Math.max(3, R * 0.035); ctx.strokeStyle = RED; ctx.stroke();
    // soft top light so the head reads as a form, not a flat disc
    const hl = ctx.createRadialGradient(-R * 0.3, -R * 0.55, R * 0.1, 0, 0, R * 1.15);
    hl.addColorStop(0, 'rgba(240,237,230,0.07)');
    hl.addColorStop(0.55, 'rgba(240,237,230,0.015)');
    hl.addColorStop(1, 'rgba(240,237,230,0)');
    ctx.beginPath(); ctx.ellipse(0, 0, R * 0.90 * squash, R * 1.02, 0, 0, Math.PI * 2);
    ctx.fillStyle = hl; ctx.fill();

    // domino mask band (the anonymity mark): two lobes + bridge
    const my = -R * 0.20 + fy, mw = R * 1.12 * squash, mh = R * 0.44;
    ctx.beginPath();
    ctx.ellipse(fx - mw * 0.32, my, mw * 0.31, mh * 0.52, -0.10 + f.roll * 0.1, 0, Math.PI * 2);
    ctx.ellipse(fx + mw * 0.32, my, mw * 0.31, mh * 0.52, 0.10 + f.roll * 0.1, 0, Math.PI * 2);
    ctx.rect(fx - mw * 0.34, my - mh * 0.22, mw * 0.68, mh * 0.44);
    ctx.fillStyle = RED; ctx.fill();

    // eyes: bone sclera + ink pupil, lids close per-eye on real blinks
    const ex = mw * 0.30, eyeW = mw * 0.115;
    const drawEye = function (side, blink) {
      const cxE = fx + side * ex, open = Math.max(0.04, 1 - blink);
      const eyeH = mh * 0.30 * open;
      ctx.beginPath(); ctx.ellipse(cxE, my, eyeW, eyeH, 0, 0, Math.PI * 2);
      ctx.fillStyle = BONE; ctx.fill();
      if (open > 0.25) {
        ctx.save();
        ctx.beginPath(); ctx.ellipse(cxE, my, eyeW, eyeH, 0, 0, Math.PI * 2); ctx.clip();
        const px = cxE + (f.gazeX + f.yaw * 0.4) * eyeW * 0.40;
        const py = my + (-f.gazeY + f.pitch * 0.4) * eyeH * 0.45;
        ctx.beginPath(); ctx.arc(px, py, eyeW * 0.52, 0, Math.PI * 2);
        ctx.fillStyle = INK; ctx.fill();
        ctx.beginPath(); ctx.arc(px - eyeW * 0.14, py - eyeW * 0.16, eyeW * 0.11, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(240,237,230,0.8)'; ctx.fill();
        ctx.restore();
      }
    };
    drawEye(-1, f.blinkL);
    drawEye(1, f.blinkR);

    // brows: above the mask, raise with browUp, pinch with browDown
    const by = my - mh * 0.62 - f.browUp * R * 0.11;
    const bw2 = eyeW * 1.5;
    ctx.lineCap = 'round'; ctx.lineWidth = Math.max(3, R * 0.055); ctx.strokeStyle = BONE;
    const browTilt = R * 0.03 + f.browDown * R * 0.05;
    ctx.beginPath();
    ctx.moveTo(fx - ex - bw2 * 0.5, by - R * 0.015);
    ctx.quadraticCurveTo(fx - ex, by - R * 0.05 + f.browDown * R * 0.02, fx - ex + bw2 * 0.5, by + browTilt - R * 0.03);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(fx + ex + bw2 * 0.5, by - R * 0.015);
    ctx.quadraticCurveTo(fx + ex, by - R * 0.05 + f.browDown * R * 0.02, fx + ex - bw2 * 0.5, by + browTilt - R * 0.03);
    ctx.stroke();

    // mouth: corners lift with smile, opens with jaw/mic, teeth + throat
    const moY = R * 0.47 + fy * 0.9, open = 3 + f.jaw * R * 0.36;
    const moW = R * (0.46 + f.smile * 0.16 - f.pucker * 0.18) * squash;
    const cornerY = moY - f.smile * R * 0.11;
    ctx.beginPath();
    ctx.moveTo(fx - moW, cornerY);
    ctx.quadraticCurveTo(fx, moY - open * 0.75, fx + moW, cornerY);
    ctx.quadraticCurveTo(fx, moY + open + f.smile * R * 0.08, fx - moW, cornerY);
    ctx.closePath();
    ctx.fillStyle = RED; ctx.fill();
    if (open > R * 0.09) {
      ctx.save(); ctx.clip();
      ctx.fillStyle = THROAT;
      ctx.fillRect(fx - moW, moY + open * 0.15, moW * 2, open);
      ctx.fillStyle = 'rgba(240,237,230,0.92)';
      ctx.fillRect(fx - moW * 0.72, cornerY - open * 0.55, moW * 1.44, open * 0.42);
      ctx.restore();
    }

    ctx.restore();

    // seat label on the torso, screen-space so it never rides the chin
    if (label) {
      ctx.font = '600 ' + Math.round(R * 0.22) + 'px Georgia, serif';
      ctx.fillStyle = 'rgba(240,237,230,0.82)'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(label, hx, hy + R * 1.24);
    }

    // corner chip, bottom-right: Daily's participant name label owns the
    // bottom-left of the tile, so keep clear of it
    const chipY = h - 36, chipW = 236, chipX = w - chipW - 22;
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(chipX, chipY - 16, chipW, 32, 16);
    else ctx.rect(chipX, chipY - 16, chipW, 32);
    ctx.fillStyle = 'rgba(11,11,12,0.55)'; ctx.fill();
    ctx.beginPath(); ctx.arc(chipX + 22, chipY, 5 + talk * 3, 0, Math.PI * 2);
    ctx.fillStyle = RED; ctx.fill();
    ctx.font = '14px monospace'; ctx.fillStyle = 'rgba(240,237,230,0.78)';
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillText('ANONYMOUS · LIVE', chipX + 40, chipY + 1);
  }

  function drawCameraFrame(ctx, w, h, videoEl) {
    // cover-fit: crop the source instead of stretching it
    const vw = videoEl.videoWidth || w, vh = videoEl.videoHeight || h;
    const scale = Math.max(w / vw, h / vh);
    const sw = w / scale, sh = h / scale;
    ctx.drawImage(videoEl, (vw - sw) / 2, (vh - sh) / 2, sw, sh, 0, 0, w, h);
  }

  function drawOff(ctx, w, h, label) {
    ctx.fillStyle = INK; ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = DIM; ctx.lineWidth = 1;
    ctx.strokeRect(14.5, 14.5, w - 29, h - 29);
    ctx.font = '14px monospace'; ctx.fillStyle = 'rgba(240,237,230,.5)';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('CAMERA OFF' + (label ? ' · ' + label : ''), w / 2, h / 2);
  }

  async function start(mediaStream, opts) {
    opts = opts || {};
    let mode = ['camera', 'avatar', 'off'].indexOf(opts.mode) >= 0 ? opts.mode : 'avatar';
    let label = (opts.label || '').slice(0, 3).toUpperCase();

    const canvas = document.createElement('canvas');
    canvas.width = OUT_W; canvas.height = OUT_H;
    const ctx = canvas.getContext('2d');

    const videoEl = document.createElement('video');
    videoEl.muted = true; videoEl.playsInline = true;
    const vTracks = mediaStream.getVideoTracks();
    if (vTracks.length) {
      videoEl.srcObject = new MediaStream(vTracks);
      try { await videoEl.play(); } catch (e) { /* camera modes just show off-tile */ }
    }

    const meter = makeMouthMeter(mediaStream);

    // Smoothed face state + the raw targets the smoother chases.
    const face = zeroFace();
    let target = zeroFace();
    let lastFaceTs = 0;       // last successful detection
    let lastVideoTime = -1;
    let demoFace = null;      // QA override (debugFace)

    let running = true;
    let lastTick = performance.now();
    let nextBlink = performance.now() + 2500 + Math.random() * 4000;
    let blinkUntil = 0;
    // idle wander phases (per-instance so tiles don't move in lockstep)
    const ph1 = Math.random() * 7, ph2 = Math.random() * 7, ph3 = Math.random() * 7;

    function detect(now) {
      if (tracker.status === 'idle' && vTracks.length) loadTracker();
      if (tracker.status !== 'ready' || videoEl.readyState < 2) return;
      if (videoEl.currentTime === lastVideoTime) return;
      lastVideoTime = videoEl.currentTime;
      // detectForVideo timestamps must increase monotonically even across
      // instances sharing the landmarker
      const ts = Math.max(now, tracker.lastTs + 1); tracker.lastTs = ts;
      try {
        const parsed = parseDetection(tracker.lm.detectForVideo(videoEl, ts));
        if (parsed) { target = parsed; lastFaceTs = now; }
      } catch (e) { /* a bad frame never kills the loop */ }
    }

    function idleTargets(now, level) {
      // No tracking: mic mouth + slow head wander + scripted blinks,
      // so the tile still reads as a live human, never a static badge.
      const t = zeroFace();
      const s = now / 1000;
      t.yaw = Math.sin(s * 0.33 + ph1) * 0.22 + Math.sin(s * 0.11 + ph2) * 0.12;
      t.pitch = Math.sin(s * 0.21 + ph3) * 0.10 + level * 0.12;
      t.roll = Math.sin(s * 0.17 + ph2) * 0.05;
      t.x = Math.sin(s * 0.13 + ph1) * 0.10;
      t.y = Math.sin(s * 0.19 + ph3) * 0.06;
      t.jaw = level * 0.9;
      t.browUp = clamp(level * 0.5 - 0.05, 0, 0.5);
      t.gazeX = t.yaw * 0.5;
      if (now > nextBlink) { blinkUntil = now + 150; nextBlink = now + 2500 + Math.random() * 4000; }
      t.blinkL = t.blinkR = now < blinkUntil ? 1 : 0;
      return t;
    }

    function smoothInto(dst, src, dt) {
      // pose eases slower than expressions; blinks snap
      const aPose = 1 - Math.exp(-dt / 110);
      const aExpr = 1 - Math.exp(-dt / 65);
      const aBlink = 1 - Math.exp(-dt / 28);
      const P = ['x', 'y', 's', 'yaw', 'pitch', 'roll'];
      const E = ['jaw', 'smile', 'pucker', 'browUp', 'browDown', 'gazeX', 'gazeY'];
      for (let i = 0; i < P.length; i++) dst[P[i]] += (src[P[i]] - dst[P[i]]) * aPose;
      for (let i = 0; i < E.length; i++) dst[E[i]] += (src[E[i]] - dst[E[i]]) * aExpr;
      dst.blinkL += (src.blinkL - dst.blinkL) * aBlink;
      dst.blinkR += (src.blinkR - dst.blinkR) * aBlink;
    }

    // Timer-driven, NOT requestAnimationFrame: rAF stalls in background
    // tabs, which would freeze the published avatar (and its mouth) the
    // moment a debater switches tabs to read their notes. A timer keeps
    // painting (browsers clamp hidden-tab timers to ~1fps, which still
    // reads as live to the room).
    function loop() {
      if (!running) return;
      const now = performance.now();
      const dt = Math.min(1000, now - lastTick); lastTick = now;
      const lv = meter.level();
      if (mode === 'camera' && videoEl.readyState >= 2) {
        drawCameraFrame(ctx, OUT_W, OUT_H, videoEl);
      } else if (mode === 'camera') {
        drawOff(ctx, OUT_W, OUT_H, label);
      } else if (mode === 'avatar') {
        let src;
        if (demoFace) { src = demoFace; }
        else {
          detect(now);
          const tracked = now - lastFaceTs < 450;
          src = tracked ? target : idleTargets(now, lv);
          // even while tracked, loud speech guarantees some mouth motion
          // (covers tracking lag and off-axis faces)
          if (tracked) src.jaw = Math.max(src.jaw, lv * 0.55);
        }
        smoothInto(face, src, dt);
        drawAvatar(ctx, OUT_W, OUT_H, label, face, lv, now);
      } else {
        drawOff(ctx, OUT_W, OUT_H, label);
      }
    }
    const drawTimer = setInterval(loop, 33);
    loop();

    const outVideo = canvas.captureStream(FPS).getVideoTracks()[0];
    const out = new MediaStream([outVideo].concat(mediaStream.getAudioTracks()));

    return {
      stream: out,
      videoTrack: outVideo,
      canvas: canvas,
      setMode: function (m) { if (['camera', 'avatar', 'off'].indexOf(m) >= 0) mode = m; },
      mode: function () { return mode; },
      setLabel: function (s) { label = String(s || '').slice(0, 3).toUpperCase(); },
      level: function () { return meter.level(); },
      debugFace: function (sig) { demoFace = sig ? Object.assign(zeroFace(), sig) : null; },
      stop: function () {
        running = false; clearInterval(drawTimer);
        outVideo.stop(); meter.close();
        videoEl.srcObject = null;
      },
    };
  }

  window.DebateCam = { start: start };
})();
