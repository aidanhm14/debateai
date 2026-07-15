/* cam-avatar.js — the camera converter for DebateIt video rooms.
 *
 * Wraps the user's media stream and publishes ONE stable processed video
 * track with three live-switchable modes:
 *
 *   'camera' — passthrough: the raw camera drawn to the canvas.
 *   'avatar' — anonymous animated avatar. Camera pixels are NEVER drawn
 *              in this mode (anonymity by construction, no face tracking
 *              to fail). The avatar's mouth moves with the speaker's mic
 *              level, it blinks, and a red ring glows while speaking, so
 *              the tile reads as a live human without showing one.
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
 *   cam.stop()
 */
(function () {
  const OUT_W = 640, OUT_H = 480, FPS = 24;
  const INK = '#0b0b0c', BONE = '#f0ede6', RED = '#dd2e2e', DIM = '#232326';

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

  function drawAvatar(ctx, w, h, label, level, t, blink) {
    ctx.fillStyle = INK; ctx.fillRect(0, 0, w, h);
    const cx = w / 2, cy = h / 2 - 10;
    const R = Math.min(w, h) * 0.30 * (1 + level * 0.02);   // subtle talk bob

    // speaking glow ring
    if (level > 0.04) {
      ctx.beginPath(); ctx.arc(cx, cy, R + 14 + level * 10, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(221,46,46,' + (0.12 + level * 0.35) + ')';
      ctx.lineWidth = 6 + level * 8; ctx.stroke();
    }

    // head disc
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.fillStyle = INK; ctx.fill();
    ctx.lineWidth = Math.max(3, R * 0.05); ctx.strokeStyle = RED; ctx.stroke();

    // domino mask band + eye slits (blink shrinks the slits)
    const bw = R * 1.15, by = cy - R * 0.22, bh = R * 0.42;
    ctx.beginPath();
    ctx.ellipse(cx - bw * 0.32, by, bw * 0.30, bh * 0.5, -0.12, 0, Math.PI * 2);
    ctx.ellipse(cx + bw * 0.32, by, bw * 0.30, bh * 0.5, 0.12, 0, Math.PI * 2);
    ctx.fillStyle = RED; ctx.fill();
    const eyeH = bh * 0.16 * blink;
    ctx.beginPath();
    ctx.ellipse(cx - bw * 0.30, by, bw * 0.10, Math.max(0.5, eyeH), 0, 0, Math.PI * 2);
    ctx.ellipse(cx + bw * 0.30, by, bw * 0.10, Math.max(0.5, eyeH), 0, 0, Math.PI * 2);
    ctx.fillStyle = INK; ctx.fill();

    // mouth: opens with mic level, idle line when silent
    const my = cy + R * 0.42, mw = R * 0.46;
    const open = 2 + level * R * 0.34;
    ctx.beginPath();
    ctx.ellipse(cx, my, mw, open, 0, 0, Math.PI * 2);
    ctx.fillStyle = RED; ctx.fill();
    if (open > R * 0.10) {  // teeth line for wide-open frames, keeps it friendly
      ctx.fillStyle = INK;
      ctx.fillRect(cx - mw * 0.55, my - open * 0.28, mw * 1.1, open * 0.2);
    }

    // label
    if (label) {
      ctx.font = '600 ' + Math.round(R * 0.30) + 'px Georgia, serif';
      ctx.fillStyle = BONE; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(label, cx, cy + R * 0.80);
    }
    ctx.font = '11px monospace'; ctx.fillStyle = 'rgba(240,237,230,.4)';
    ctx.textAlign = 'center';
    ctx.fillText('ANONYMOUS · VOICE LIVE', cx, h - 16);
  }

  function drawOff(ctx, w, h, label) {
    ctx.fillStyle = INK; ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = DIM; ctx.lineWidth = 1;
    ctx.strokeRect(10.5, 10.5, w - 21, h - 21);
    ctx.font = '13px monospace'; ctx.fillStyle = 'rgba(240,237,230,.5)';
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

    let running = true;
    let nextBlink = performance.now() + 2500 + Math.random() * 4000;
    let blinkUntil = 0;

    // Timer-driven, NOT requestAnimationFrame: rAF stalls in background
    // tabs, which would freeze the published avatar (and its mouth) the
    // moment a debater switches tabs to read their notes. A timer keeps
    // painting (browsers clamp hidden-tab timers to ~1fps, which still
    // reads as live to the room).
    function loop() {
      if (!running) return;
      const now = performance.now();
      const lv = meter.level();
      if (mode === 'camera' && videoEl.readyState >= 2) {
        ctx.drawImage(videoEl, 0, 0, OUT_W, OUT_H);
      } else if (mode === 'camera') {
        drawOff(ctx, OUT_W, OUT_H, label);
      } else if (mode === 'avatar') {
        if (now > nextBlink) { blinkUntil = now + 140; nextBlink = now + 2500 + Math.random() * 4000; }
        const blink = now < blinkUntil ? 0.12 : 1;
        drawAvatar(ctx, OUT_W, OUT_H, label, lv, now, blink);
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
      stop: function () {
        running = false; clearInterval(drawTimer);
        outVideo.stop(); meter.close();
        videoEl.srcObject = null;
      },
    };
  }

  window.DebateCam = { start: start };
})();
