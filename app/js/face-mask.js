/* face-mask.js — anonymous camera pipeline for DebateIt video rooms.
 *
 * Takes a camera MediaStream, returns a processed MediaStream whose video
 * track has the speaker's face covered by a drawn mask, suitable for
 * publishing to Daily (setInputDevicesAsync({ videoSource: track })) so
 * the raw feed never leaves the device.
 *
 * Leak-safe by construction:
 *   - The output canvas starts FULLY covered; camera pixels are never
 *     drawn until the face detector has locked on.
 *   - If detection drops for more than LOST_MS, the whole frame covers
 *     again (no "one glitched frame shows the face" failure mode).
 *   - The mask is drawn at 2.3x the detected face box, centered, so
 *     jitter and fast movement stay inside the covered region.
 *
 * Detection: MediaPipe Tasks FaceDetector (BlazeFace short-range) via CDN,
 * ~1MB wasm + model, runs at DETECT_FPS on a downscaled frame. No frames
 * or landmarks are sent anywhere; everything is on-device.
 *
 * Usage:
 *   const masked = await DebateMask.start(cameraStream, { label: 'PRO' });
 *   // masked.stream        -> MediaStream (masked video + original audio)
 *   // masked.setLabel(s)   -> change the letter drawn on the mask
 *   // masked.state()       -> 'covered' | 'tracking'
 *   // masked.stop()        -> tear down
 */
(function () {
  const CDN = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14';
  const MODEL = 'https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite';
  const OUT_W = 640, OUT_H = 480;
  const DETECT_FPS = 12;      // detector cadence; draw loop runs at full fps
  const LOST_MS = 600;        // no face this long -> cover the whole frame
  const MASK_SCALE = 2.3;     // mask diameter vs detected face box

  const INK = '#0b0b0c', BONE = '#f0ede6', RED = '#dd2e2e';

  async function loadDetector() {
    const vision = await import(CDN + '/vision_bundle.mjs');
    const fileset = await vision.FilesetResolver.forVisionTasks(CDN + '/wasm');
    return vision.FaceDetector.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: MODEL },
      runningMode: 'VIDEO',
      minDetectionConfidence: 0.4,
    });
  }

  function drawMask(ctx, cx, cy, r, label, t) {
    // matte disc
    ctx.save();
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = INK; ctx.fill();
    ctx.lineWidth = Math.max(3, r * 0.05); ctx.strokeStyle = RED; ctx.stroke();
    // domino mask band
    const bw = r * 1.15, bh = r * 0.42, by = cy - r * 0.18;
    ctx.beginPath();
    ctx.ellipse(cx - bw * 0.32, by, bw * 0.30, bh * 0.5, -0.12, 0, Math.PI * 2);
    ctx.ellipse(cx + bw * 0.32, by, bw * 0.30, bh * 0.5, 0.12, 0, Math.PI * 2);
    ctx.fillStyle = RED; ctx.fill();
    // eye slits
    ctx.beginPath();
    ctx.ellipse(cx - bw * 0.30, by, bw * 0.10, bh * 0.16, 0, 0, Math.PI * 2);
    ctx.ellipse(cx + bw * 0.30, by, bw * 0.10, bh * 0.16, 0, 0, Math.PI * 2);
    ctx.fillStyle = INK; ctx.fill();
    // label (seat letter), quiet
    if (label) {
      ctx.font = '600 ' + Math.round(r * 0.34) + 'px Georgia, serif';
      ctx.fillStyle = BONE; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(label, cx, cy + r * 0.45);
    }
    ctx.restore();
  }

  function drawCovered(ctx, w, h, label, t) {
    ctx.fillStyle = INK; ctx.fillRect(0, 0, w, h);
    const pulse = 0.5 + 0.5 * Math.sin(t / 600);
    drawMask(ctx, w / 2, h / 2, Math.min(w, h) * 0.28, label, t);
    ctx.font = '12px monospace';
    ctx.fillStyle = 'rgba(240,237,230,' + (0.35 + 0.25 * pulse) + ')';
    ctx.textAlign = 'center';
    ctx.fillText('MASKED · CAMERA HIDDEN UNTIL LOCK', ctx.canvas.width / 2, h - 18);
  }

  async function start(cameraStream, opts) {
    opts = opts || {};
    const detector = await loadDetector();

    const videoEl = document.createElement('video');
    videoEl.muted = true; videoEl.playsInline = true;
    videoEl.srcObject = new MediaStream(cameraStream.getVideoTracks());
    await videoEl.play();

    const canvas = document.createElement('canvas');
    canvas.width = OUT_W; canvas.height = OUT_H;
    const ctx = canvas.getContext('2d');

    let label = (opts.label || '').slice(0, 3).toUpperCase();
    let running = true;
    let lastSeen = 0;          // last detection timestamp
    let face = null;           // {cx, cy, r} smoothed
    let lastDetect = 0;

    function smooth(next) {
      if (!face) { face = next; return; }
      const a = 0.35;
      face = { cx: face.cx + (next.cx - face.cx) * a,
               cy: face.cy + (next.cy - face.cy) * a,
               r:  face.r  + (next.r  - face.r)  * a };
    }

    function loop(t) {
      if (!running) return;
      const now = performance.now();

      if (now - lastDetect >= 1000 / DETECT_FPS && videoEl.readyState >= 2) {
        lastDetect = now;
        try {
          const res = detector.detectForVideo(videoEl, now);
          const d = res && res.detections && res.detections[0];
          if (d && d.boundingBox) {
            const b = d.boundingBox;
            const sx = OUT_W / videoEl.videoWidth, sy = OUT_H / videoEl.videoHeight;
            smooth({
              cx: (b.originX + b.width / 2) * sx,
              cy: (b.originY + b.height / 2) * sy,
              r: Math.max(b.width * sx, b.height * sy) * MASK_SCALE / 2,
            });
            lastSeen = now;
          }
        } catch (e) { /* detector hiccup: treated as no detection */ }
      }

      const locked = face && (now - lastSeen) < LOST_MS;
      if (locked) {
        ctx.drawImage(videoEl, 0, 0, OUT_W, OUT_H);
        drawMask(ctx, face.cx, face.cy, face.r, label, now);
      } else {
        drawCovered(ctx, OUT_W, OUT_H, label, now);
      }
      requestAnimationFrame(loop);
    }
    requestAnimationFrame(loop);

    const outVideo = canvas.captureStream(24).getVideoTracks()[0];
    const out = new MediaStream([outVideo].concat(cameraStream.getAudioTracks()));

    return {
      stream: out,
      videoTrack: outVideo,
      canvas: canvas,
      setLabel: function (s) { label = String(s || '').slice(0, 3).toUpperCase(); },
      state: function () { return (face && (performance.now() - lastSeen) < LOST_MS) ? 'tracking' : 'covered'; },
      stop: function () {
        running = false;
        outVideo.stop();
        videoEl.srcObject = null;
        try { detector.close(); } catch (e) {}
      },
    };
  }

  window.DebateMask = { start: start };
})();
