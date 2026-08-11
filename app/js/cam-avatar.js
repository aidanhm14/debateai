/* cam-avatar.js — the camera converter for Debatable video rooms.
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
 *   cam.setDesign({...}); DebateCam.openDesigner({ cam:cam });
 *   cam.mode()    -> current mode      cam.level() -> 0..1 mic level
 *   cam.debugFace(sig|null) -> QA hook: override face signals (demo pages)
 *   cam.stop()
 */
(function () {
  // 960x540 out: the camera source is captured at 640x480, so a 720p
  // canvas was a pure upscale that nearly doubled paint + encode work.
  // 540p keeps the mask crisp on a call tile and cuts CPU enough to
  // stay under Daily's high-CPU warning on ordinary laptops.
  const OUT_W = 960, OUT_H = 540, FPS = 24;
  const INK = '#0b0b0c', BONE = '#f0ede6', RED = '#dd2e2e', DIM = '#232326';
  const HEAD = '#1b1b1f';
  const DESIGN_KEY = 'debatable-live-avatar-v1';
  const LOOKS_KEY = 'debatable-avatar-looks-v1';
  const DESIGN_EVENT = 'debatable-avatar-design';
  const DEFAULT_DESIGN = { scene: 'arena', accent: 'crimson', outfit: 'ink', mask: 'blade', eyes: 'focus' };
  const DESIGN_OPTIONS = {
    scene: [
      { key: 'arena', label: 'Arena', sample: 'radial-gradient(circle at 50% 45%,#492028,#16161a 48%,#070708)' },
      { key: 'skyline', label: 'Skyline', sample: 'linear-gradient(#101b38 0 54%,#16213a 55%,#05070d 56%)' },
      { key: 'library', label: 'Library', sample: 'linear-gradient(90deg,#19100d,#3a2117 47%,#17100e)' },
      { key: 'studio', label: 'Studio', sample: 'linear-gradient(135deg,#07121d,#18304b 48%,#090b11)' },
      { key: 'orbit', label: 'Orbit', sample: 'radial-gradient(circle at 68% 30%,#654676 0 12%,#10122a 13%,#04050b 65%)' },
      { key: 'forest', label: 'Forest', sample: 'linear-gradient(#142c34,#17262b 48%,#07100f)' },
    ],
    accent: [
      { key: 'crimson', label: 'Crimson', color: '#dd2e2e' },
      { key: 'electric', label: 'Electric', color: '#4f7cff' },
      { key: 'violet', label: 'Violet', color: '#9b5de5' },
      { key: 'teal', label: 'Teal', color: '#17b6a4' },
      { key: 'rose', label: 'Rose', color: '#e44878' },
      { key: 'silver', label: 'Silver', color: '#b8c1cf' },
    ],
    outfit: [
      { key: 'ink', label: 'Ink', color: '#27272f', dark: '#09090b' },
      { key: 'navy', label: 'Navy', color: '#20334d', dark: '#090e18' },
      { key: 'plum', label: 'Plum', color: '#392942', dark: '#110b16' },
      { key: 'pine', label: 'Pine', color: '#1f3a35', dark: '#08110f' },
      { key: 'slate', label: 'Slate', color: '#414956', dark: '#101318' },
    ],
    mask: [
      { key: 'blade', label: 'Blade' },
      { key: 'classic', label: 'Classic' },
      { key: 'visor', label: 'Visor' },
    ],
    eyes: [
      { key: 'focus', label: 'Focused' },
      { key: 'sharp', label: 'Sharp' },
      { key: 'open', label: 'Open' },
      { key: 'calm', label: 'Calm' },
    ],
  };

  function findOption(group, key) {
    const opts = DESIGN_OPTIONS[group];
    for (let i = 0; i < opts.length; i++) if (opts[i].key === key) return opts[i];
    return opts[0];
  }
  function normalizeDesign(input) {
    input = input || {};
    const out = {};
    Object.keys(DEFAULT_DESIGN).forEach(function (group) {
      const key = input[group];
      out[group] = findOption(group, key).key;
    });
    return out;
  }
  function getSavedDesign() {
    try { return normalizeDesign(JSON.parse(localStorage.getItem(DESIGN_KEY) || '{}')); }
    catch (e) { return normalizeDesign(); }
  }
  function makeLookId() {
    try { if (window.crypto && crypto.randomUUID) return crypto.randomUUID(); } catch (e) {}
    return 'look-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
  }
  function getLooksState() {
    try {
      const raw = JSON.parse(localStorage.getItem(LOOKS_KEY) || '{}');
      const looks = (Array.isArray(raw.looks) ? raw.looks : []).slice(0, 8).map(function (look, index) {
        return {
          id: String(look && look.id || ('look-' + index)).replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64),
          name: String(look && look.name || ('Look ' + (index + 1))).trim().slice(0, 32) || ('Look ' + (index + 1)),
          design: normalizeDesign(look && look.design),
          updatedAtMs: Math.max(0, Number(look && look.updatedAtMs) || 0),
        };
      });
      let activeId = String(raw.activeId || '').slice(0, 64);
      if (!looks.some(function (look) { return look.id === activeId; })) activeId = looks[0] ? looks[0].id : '';
      return { activeId: activeId, looks: looks, updatedAtMs: Math.max(0, Number(raw.updatedAtMs) || 0) };
    } catch (e) { return { activeId:'', looks:[], updatedAtMs:0 }; }
  }
  function storeLooksState(state) {
    try { localStorage.setItem(LOOKS_KEY, JSON.stringify(state)); } catch (e) {}
  }
  function saveLook(input, name, id) {
    const design = normalizeDesign(input);
    const state = getLooksState();
    const now = Date.now();
    let look = state.looks.filter(function (item) { return item.id === id; })[0];
    if (!look) {
      look = { id: makeLookId(), name:'', design:design, updatedAtMs:now };
      state.looks.unshift(look);
      state.looks = state.looks.slice(0, 8);
    }
    look.name = String(name || 'My avatar').trim().slice(0, 32) || 'My avatar';
    look.design = design; look.updatedAtMs = now;
    state.activeId = look.id; state.updatedAtMs = now;
    storeLooksState(state);
    try { localStorage.setItem(DESIGN_KEY, JSON.stringify(design)); } catch (e) {}
    try { window.dispatchEvent(new CustomEvent(DESIGN_EVENT, { detail: design })); } catch (e) {}
    return { id:look.id, name:look.name, design:design };
  }
  function activateLook(id) {
    const state = getLooksState();
    const look = state.looks.filter(function (item) { return item.id === id; })[0];
    if (!look) return null;
    state.activeId = look.id; state.updatedAtMs = Date.now(); storeLooksState(state);
    return saveLook(look.design, look.name, look.id);
  }
  function deleteLook(id) {
    const state = getLooksState();
    state.looks = state.looks.filter(function (look) { return look.id !== id; });
    state.activeId = state.looks[0] ? state.looks[0].id : '';
    state.updatedAtMs = Date.now(); storeLooksState(state);
    if (state.looks[0]) return activateLook(state.looks[0].id);
    try { localStorage.removeItem(DESIGN_KEY); } catch (e) {}
    const design = normalizeDesign();
    try { window.dispatchEvent(new CustomEvent(DESIGN_EVENT, { detail: design })); } catch (e) {}
    return null;
  }
  function saveDesign(input) {
    const design = normalizeDesign(input);
    const state = getLooksState();
    const active = state.looks.filter(function (look) { return look.id === state.activeId; })[0];
    if (active) {
      active.design = design; active.updatedAtMs = Date.now(); state.updatedAtMs = active.updatedAtMs;
      storeLooksState(state);
    }
    try { localStorage.setItem(DESIGN_KEY, JSON.stringify(design)); } catch (e) {}
    try { window.dispatchEvent(new CustomEvent(DESIGN_EVENT, { detail: design })); } catch (e) {}
    return design;
  }
  function rgba(hex, alpha) {
    const n = parseInt(String(hex).replace('#', ''), 16);
    return 'rgba(' + ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + alpha + ')';
  }
  function shade(hex, amount) {
    const n = parseInt(String(hex).replace('#', ''), 16);
    const part = function (shift) { return Math.max(0, Math.min(255, ((n >> shift) & 255) + Math.round(255 * amount))); };
    return '#' + [part(16), part(8), part(0)].map(function (v) { return v.toString(16).padStart(2, '0'); }).join('');
  }

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
    // Mic energy -> smoothed openness plus a coarse tonal shape. The tonal
    // split is not transcription. It only gives the fallback avatar enough
    // information to alternate between rounded and wider mouth poses instead
    // of moving one generic hinge. No audio is played or sent anywhere.
    const track = stream.getAudioTracks()[0];
    const silent = { level: 0, round: 0, wide: 0 };
    if (!track) return { sample: () => silent, level: () => 0, close: () => {} };
    const Ctx = window.AudioContext || window.webkitAudioContext;
    const ctx = new Ctx();
    const src = ctx.createMediaStreamSource(new MediaStream([track]));
    const an = ctx.createAnalyser();
    an.fftSize = 512; an.smoothingTimeConstant = 0.6;
    src.connect(an);
    const buf = new Uint8Array(an.fftSize);
    const freq = new Uint8Array(an.frequencyBinCount);
    let smooth = 0, roundSmooth = 0, wideSmooth = 0, lastT = performance.now();
    let sampledAt = -Infinity, cached = silent;
    function band(lo, hi) {
      const hz = ctx.sampleRate / 2 / freq.length;
      const a = Math.max(1, Math.floor(lo / hz));
      const b = Math.min(freq.length, Math.ceil(hi / hz));
      let sum = 0;
      for (let i = a; i < b; i++) sum += freq[i];
      return sum / Math.max(1, b - a);
    }
    function sample() {
      const now = performance.now();
      if (now - sampledAt < 16) return cached;
      sampledAt = now;
      an.getByteTimeDomainData(buf);
      an.getByteFrequencyData(freq);
      let sum = 0;
      for (let i = 0; i < buf.length; i++) { const d = (buf[i] - 128) / 128; sum += d * d; }
      const rms = Math.sqrt(sum / buf.length);            // ~0.01 quiet, ~0.2 loud
      const raw = Math.min(1, Math.max(0, (rms - 0.012) * 10));
      const target = Math.pow(raw, 0.72);

      // Low resonance tends to read rounder; presence/brightness reads wider.
      // Multiplying by energy makes the shape disappear cleanly in silence.
      const low = band(140, 650), presence = band(650, 1800), bright = band(1800, 3800);
      const tonal = Math.max(1, low + presence + bright);
      const roundTarget = target * clamp((low * 1.35 - bright * 0.35) / tonal, 0, 0.72);
      const wideTarget = target * clamp((presence * 0.8 + bright * 1.2) / tonal, 0, 0.78);

      const dt = Math.min(1000, now - lastT); lastT = now;
      const a = 1 - Math.exp(-dt / (target > smooth ? 38 : 190));
      const shapeA = 1 - Math.exp(-dt / 72);
      smooth += (target - smooth) * a;
      roundSmooth += (roundTarget - roundSmooth) * shapeA;
      wideSmooth += (wideTarget - wideSmooth) * shapeA;
      cached = { level: smooth, round: roundSmooth, wide: wideSmooth };
      return cached;
    }
    return {
      sample: sample,
      level: function () { return sample().level; },
      close: function () { try { ctx.close(); } catch (e) {} },
    };
  }

  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

  // Face signal set. Pose values are normalized (-1..1-ish), roll is
  // radians, expressions are 0..1. Everything is smoothed before drawing.
  function zeroFace() {
    return { x: 0, y: 0, s: 1, yaw: 0, pitch: 0, roll: 0,
             jaw: 0, jawSide: 0, smile: 0, pucker: 0, wide: 0, press: 0,
             browUp: 0, browDown: 0,
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
    f.jawSide = clamp((g('jawLeft') - g('jawRight')) * 1.5, -1, 1);
    f.smile = clamp((g('mouthSmileLeft') + g('mouthSmileRight')) * 0.75, 0, 1);
    f.pucker = clamp(Math.max(g('mouthPucker'), g('mouthFunnel')) * 1.1, 0, 1);
    f.wide = clamp((g('mouthStretchLeft') + g('mouthStretchRight')) * 0.7 +
                   (g('mouthUpperUpLeft') + g('mouthUpperUpRight')) * 0.18, 0, 1);
    f.press = clamp((g('mouthPressLeft') + g('mouthPressRight')) * 0.8, 0, 1);
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
  function drawBackdrop(ctx, w, h, now, talk, design) {
    const accent = findOption('accent', design.accent).color;
    const scene = design.scene;
    const horizon = h * 0.70;
    let grad = ctx.createRadialGradient(w / 2, h * 0.38, h * 0.06, w / 2, h * 0.52, h * 0.92);
    grad.addColorStop(0, scene === 'studio' ? '#17304a' : scene === 'forest' ? '#18343b' : scene === 'orbit' ? '#171633' : '#202026');
    grad.addColorStop(0.48, scene === 'skyline' ? '#10172c' : scene === 'library' ? '#241611' : '#111114');
    grad.addColorStop(1, scene === 'forest' ? '#050d0c' : '#060607');
    ctx.fillStyle = grad; ctx.fillRect(0, 0, w, h);

    if (scene === 'skyline') {
      // A night skyline with stable procedural windows. No image or live
      // camera pixels are involved, so this is scenery rather than a filter.
      const moon = ctx.createRadialGradient(w * 0.76, h * 0.20, 2, w * 0.76, h * 0.20, h * 0.14);
      moon.addColorStop(0, 'rgba(240,237,230,.38)'); moon.addColorStop(1, 'rgba(240,237,230,0)');
      ctx.fillStyle = moon; ctx.fillRect(0, 0, w, h * 0.5);
      for (let i = 0; i < 15; i++) {
        const bw = w * (0.055 + (i % 3) * 0.012);
        const bx = i * w / 14 - bw * 0.5;
        const bh = h * (0.14 + ((i * 37) % 23) / 100);
        const by = horizon - bh;
        ctx.fillStyle = i % 2 ? '#0a0e18' : '#0d1322'; ctx.fillRect(bx, by, bw, bh + h * 0.3);
        ctx.fillStyle = rgba(accent, 0.12 + talk * 0.08);
        for (let row = 0; row < 4; row++) for (let col = 0; col < 2; col++) {
          if ((i + row + col) % 3) ctx.fillRect(bx + bw * (0.2 + col * 0.42), by + 16 + row * 22, 5, 8);
        }
      }
    } else if (scene === 'library') {
      ctx.fillStyle = 'rgba(16,8,6,.64)';
      for (let side = 0; side < 2; side++) {
        const x0 = side ? w * 0.72 : w * 0.03;
        ctx.fillRect(x0, h * 0.08, w * 0.25, h * 0.66);
        for (let shelf = 0; shelf < 4; shelf++) {
          const sy = h * (0.20 + shelf * 0.15);
          ctx.fillStyle = '#4a2b1e'; ctx.fillRect(x0, sy, w * 0.25, 7);
          for (let book = 0; book < 8; book++) {
            const bh = h * (0.055 + ((book + shelf * 3) % 4) * 0.008);
            ctx.fillStyle = book % 3 === 0 ? rgba(accent, 0.30) : (book % 2 ? '#5b3a29' : '#26353a');
            ctx.fillRect(x0 + 8 + book * w * 0.028, sy - bh, w * 0.019, bh - 3);
          }
        }
      }
      const lamp = ctx.createRadialGradient(w * 0.15, h * 0.28, 0, w * 0.15, h * 0.28, h * 0.28);
      lamp.addColorStop(0, 'rgba(255,209,143,.16)'); lamp.addColorStop(1, 'rgba(255,209,143,0)');
      ctx.fillStyle = lamp; ctx.fillRect(0, 0, w * 0.5, h * 0.7);
    } else if (scene === 'studio') {
      for (let i = 0; i < 9; i++) {
        const x = i * w / 9;
        ctx.fillStyle = i % 2 ? 'rgba(255,255,255,.018)' : 'rgba(0,0,0,.14)';
        ctx.fillRect(x, 0, w / 9 - 3, h * 0.72);
      }
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      const beamL = ctx.createLinearGradient(0, 0, w * 0.55, h * 0.75);
      beamL.addColorStop(0, rgba(accent, 0.13)); beamL.addColorStop(1, rgba(accent, 0));
      ctx.fillStyle = beamL; ctx.beginPath(); ctx.moveTo(w * 0.05, 0); ctx.lineTo(w * 0.40, h); ctx.lineTo(w * 0.61, h); ctx.lineTo(w * 0.17, 0); ctx.fill();
      const beamR = ctx.createLinearGradient(w, 0, w * 0.45, h * 0.75);
      beamR.addColorStop(0, 'rgba(180,220,255,.10)'); beamR.addColorStop(1, 'rgba(180,220,255,0)');
      ctx.fillStyle = beamR; ctx.beginPath(); ctx.moveTo(w * 0.95, 0); ctx.lineTo(w * 0.40, h); ctx.lineTo(w * 0.58, h); ctx.lineTo(w * 0.82, 0); ctx.fill();
      ctx.restore();
      ctx.strokeStyle = rgba(accent, 0.22 + talk * 0.12); ctx.lineWidth = 3;
      ctx.strokeRect(w * 0.20, h * 0.10, w * 0.60, h * 0.46);
    } else if (scene === 'orbit') {
      for (let i = 0; i < 70; i++) {
        const x = ((i * 83) % 997) / 997 * w, y = ((i * 47) % 541) / 541 * h * 0.78;
        const r = 0.7 + (i % 4) * 0.38;
        ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fillStyle = i % 9 === 0 ? rgba(accent, 0.55) : 'rgba(240,237,230,.48)'; ctx.fill();
      }
      const planet = ctx.createRadialGradient(w * 0.82, h * 0.20, h * 0.02, w * 0.82, h * 0.20, h * 0.16);
      planet.addColorStop(0, shade(accent, 0.16)); planet.addColorStop(0.48, rgba(accent, 0.74)); planet.addColorStop(1, rgba(accent, 0));
      ctx.fillStyle = planet; ctx.fillRect(w * 0.62, 0, w * 0.38, h * 0.45);
      ctx.strokeStyle = rgba(BONE, 0.16); ctx.lineWidth = 2;
      ctx.beginPath(); ctx.ellipse(w * 0.82, h * 0.20, h * 0.22, h * 0.06, -0.22, 0, Math.PI * 2); ctx.stroke();
    } else if (scene === 'forest') {
      ctx.beginPath(); ctx.arc(w * 0.78, h * 0.18, h * 0.095, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(218,230,219,.24)'; ctx.fill();
      ctx.fillStyle = 'rgba(7,18,17,.76)';
      ctx.beginPath(); ctx.moveTo(0, h * 0.58);
      for (let i = 0; i <= 10; i++) ctx.lineTo(i * w / 10, h * (0.43 + ((i * 31) % 13) / 100));
      ctx.lineTo(w, h); ctx.lineTo(0, h); ctx.fill();
      for (let i = 0; i < 15; i++) {
        const x = i * w / 14, th = h * (0.16 + ((i * 17) % 15) / 100), y = h * 0.72;
        ctx.fillStyle = i % 2 ? '#07100f' : '#0a1715';
        ctx.beginPath(); ctx.moveTo(x, y - th); ctx.lineTo(x - th * 0.34, y); ctx.lineTo(x + th * 0.34, y); ctx.fill();
      }
    }

    // Every scene shares a low reactive floor glow. It ties custom scenes
    // back to the mask and makes speaking energy legible on small tiles.
    const glow = ctx.createRadialGradient(w / 2, horizon, 0, w / 2, horizon, w * 0.54);
    glow.addColorStop(0, rgba(accent, 0.07 + talk * 0.08));
    glow.addColorStop(0.55, rgba(accent, 0.018));
    glow.addColorStop(1, rgba(accent, 0));
    ctx.fillStyle = glow; ctx.fillRect(0, h * 0.38, w, h * 0.62);

    if (scene === 'arena') {
      ctx.save(); ctx.strokeStyle = 'rgba(240,237,230,0.035)'; ctx.lineWidth = 1;
      for (let i = -7; i <= 7; i++) {
        ctx.beginPath(); ctx.moveTo(w / 2 + i * 8, horizon); ctx.lineTo(w / 2 + i * w * 0.12, h); ctx.stroke();
      }
      for (let i = 0; i < 6; i++) {
        const y = horizon + (1 - Math.pow(0.68, i + 1)) * (h - horizon);
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
      }
      ctx.restore();
    }

    const spin = now * 0.00008;
    ctx.save(); ctx.translate(w / 2, h * 0.46); ctx.rotate(spin);
    ctx.strokeStyle = rgba(accent, 0.14 + talk * 0.16); ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.arc(0, 0, h * 0.39, -2.65, -0.38); ctx.stroke();
    ctx.beginPath(); ctx.arc(0, 0, h * 0.39, 0.52, 2.48); ctx.stroke();
    ctx.restore();
  }

  function drawAvatar(ctx, w, h, label, f, level, now, design) {
    design = normalizeDesign(design);
    const accent = findOption('accent', design.accent).color;
    const outfit = findOption('outfit', design.outfit);
    const talk = Math.max(level, f.jaw * 0.8);
    drawBackdrop(ctx, w, h, now, talk, design);
    const baseR = Math.min(w, h) * 0.305;
    const R = baseR * f.s * (1 + level * 0.015);
    const hx = w / 2 + f.x * baseR * 0.42;
    const hy = h / 2 - baseR * 0.10 + f.y * baseR * 0.28;

    // Speaking energy expands in two clean rings and a pair of small level
    // stacks. These stay legible when the call shrinks this to a corner tile.
    if (talk > 0.04) {
      const pulse = (now % 1100) / 1100;
      for (let i = 0; i < 2; i++) {
        const p = (pulse + i * 0.5) % 1;
        ctx.beginPath(); ctx.arc(hx, hy, R * (1.05 + p * 0.24), 0, Math.PI * 2);
        ctx.strokeStyle = rgba(accent, (1 - p) * (0.10 + talk * 0.24));
        ctx.lineWidth = 3 + talk * 5; ctx.stroke();
      }
      for (let i = 0; i < 5; i++) {
        const bh = R * (0.05 + talk * (0.08 + (i % 3) * 0.035));
        ctx.fillStyle = rgba(accent, 0.18 + talk * 0.42);
        ctx.fillRect(hx - R * 1.43 - i * R * 0.075, hy + R * 0.34 - bh / 2, R * 0.025, bh);
        ctx.fillRect(hx + R * 1.40 + i * R * 0.075, hy + R * 0.34 - bh / 2, R * 0.025, bh);
      }
    }

    // Hood behind the head. The split accent rim keeps the silhouette crisp
    // against a black video tile without reading as a plain circle.
    ctx.save(); ctx.translate(hx, hy);
    const hood = ctx.createRadialGradient(-R * 0.25, -R * 0.35, R * 0.15, 0, R * 0.08, R * 1.3);
    hood.addColorStop(0, shade(outfit.color, 0.06)); hood.addColorStop(0.62, shade(outfit.color, -0.08)); hood.addColorStop(1, outfit.dark);
    ctx.beginPath();
    ctx.moveTo(-R * 1.07, R * 0.82);
    ctx.bezierCurveTo(-R * 1.25, R * 0.08, -R * 1.03, -R * 0.88, -R * 0.38, -R * 1.16);
    ctx.bezierCurveTo(0, -R * 1.33, R * 0.38, -R * 1.16, R * 0.82, -R * 0.78);
    ctx.bezierCurveTo(R * 1.22, -R * 0.34, R * 1.23, R * 0.30, R * 1.08, R * 0.82);
    ctx.closePath(); ctx.fillStyle = hood; ctx.fill();
    ctx.strokeStyle = rgba(accent, 0.52); ctx.lineWidth = Math.max(3, R * 0.025); ctx.stroke();
    ctx.restore();

    // Shoulders follow the head at a fraction of its offset, so the face
    // moves against them and reads as a person rather than a floating badge.
    const sx = w / 2 + f.x * baseR * 0.16, sy = h / 2 + baseR * 0.98;
    const bodyGrad = ctx.createLinearGradient(sx, sy - R * 0.4, sx, h);
    bodyGrad.addColorStop(0, outfit.color); bodyGrad.addColorStop(1, outfit.dark);
    ctx.beginPath();
    ctx.moveTo(sx - R * 1.72, h + 4);
    ctx.bezierCurveTo(sx - R * 1.58, sy - R * 0.02, sx - R * 0.86, sy - R * 0.40, sx, sy - R * 0.36);
    ctx.bezierCurveTo(sx + R * 0.86, sy - R * 0.40, sx + R * 1.58, sy - R * 0.02, sx + R * 1.72, h + 4);
    ctx.closePath();
    ctx.fillStyle = bodyGrad; ctx.fill();
    ctx.strokeStyle = rgba(accent, 0.28); ctx.lineWidth = 3; ctx.stroke();
    // Jacket seams and hood drawstrings give the lower half structure.
    ctx.strokeStyle = 'rgba(240,237,230,0.10)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(sx - R * 0.54, sy - R * 0.28); ctx.quadraticCurveTo(sx - R * 0.35, sy + R * 0.12, sx - R * 0.22, h); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(sx + R * 0.54, sy - R * 0.28); ctx.quadraticCurveTo(sx + R * 0.35, sy + R * 0.12, sx + R * 0.22, h); ctx.stroke();

    // head group: rotate with roll; features shift with yaw/pitch to fake
    // a 3D turn; head squashes slightly on strong turns
    ctx.save();
    ctx.translate(hx, hy);
    ctx.rotate(f.roll * 0.85);
    const squash = 1 - Math.abs(f.yaw) * 0.10;
    const fx = f.yaw * R * 0.34;                 // feature shift, x
    const fy = f.pitch * R * 0.26;               // feature shift, y

    // Openness drives the whole lower face, not just the lips. A real jaw
    // lengthens the head as it drops; without this the mouth reads as a hole
    // punched in a rigid mask.
    const openAmt = Math.pow(clamp(Math.max(f.jaw, level * 0.85), 0, 1), 0.75);
    const jawDrop = openAmt * R * 0.075;

    const headW = R * 0.88 * squash;
    function headPath() {
      ctx.beginPath();
      ctx.moveTo(0, -R * 1.01);
      ctx.bezierCurveTo(headW * 0.72, -R * 1.00, headW, -R * 0.55, headW * 0.96, -R * 0.08);
      ctx.bezierCurveTo(headW * 0.93, R * 0.48, headW * 0.62, R * 0.90, 0, R * 1.04 + jawDrop);
      ctx.bezierCurveTo(-headW * 0.62, R * 0.90, -headW * 0.93, R * 0.48, -headW * 0.96, -R * 0.08);
      ctx.bezierCurveTo(-headW, -R * 0.55, -headW * 0.72, -R * 1.00, 0, -R * 1.01);
      ctx.closePath();
    }
    headPath(); ctx.fillStyle = HEAD; ctx.fill();
    ctx.lineWidth = Math.max(3, R * 0.034); ctx.strokeStyle = accent; ctx.stroke();
    // soft top light so the head reads as a form, not a flat disc
    const hl = ctx.createRadialGradient(-R * 0.3, -R * 0.55, R * 0.1, 0, 0, R * 1.15);
    hl.addColorStop(0, 'rgba(240,237,230,0.07)');
    hl.addColorStop(0.55, 'rgba(240,237,230,0.015)');
    hl.addColorStop(1, 'rgba(240,237,230,0)');
    headPath(); ctx.fillStyle = hl; ctx.fill();
    // Side shade moves opposite the turn, a cheap but effective depth cue.
    ctx.save(); headPath(); ctx.clip();
    const side = ctx.createLinearGradient(-headW, 0, headW, 0);
    side.addColorStop(0, f.yaw < 0 ? 'rgba(0,0,0,0.04)' : 'rgba(0,0,0,0.34)');
    side.addColorStop(0.52, 'rgba(0,0,0,0)');
    side.addColorStop(1, f.yaw > 0 ? 'rgba(0,0,0,0.04)' : 'rgba(0,0,0,0.34)');
    ctx.fillStyle = side; ctx.fillRect(-R, -R * 1.1, R * 2, R * 2.3); ctx.restore();

    // Three silhouettes let the avatar feel owned without weakening the
    // shared anonymous-mask identity.
    const my = -R * 0.20 + fy, mw = R * 1.13 * squash, mh = R * 0.48;
    const maskGrad = ctx.createLinearGradient(fx - mw, my, fx + mw, my);
    maskGrad.addColorStop(0, shade(accent, -0.24)); maskGrad.addColorStop(0.5, shade(accent, 0.08)); maskGrad.addColorStop(1, shade(accent, -0.24));
    ctx.beginPath();
    if (design.mask === 'classic') {
      ctx.moveTo(fx - mw * 0.66, my - mh * 0.10);
      ctx.bezierCurveTo(fx - mw * 0.58, my - mh * 0.58, fx - mw * 0.22, my - mh * 0.66, fx, my - mh * 0.24);
      ctx.bezierCurveTo(fx + mw * 0.22, my - mh * 0.66, fx + mw * 0.58, my - mh * 0.58, fx + mw * 0.66, my - mh * 0.10);
      ctx.bezierCurveTo(fx + mw * 0.61, my + mh * 0.56, fx + mw * 0.24, my + mh * 0.62, fx, my + mh * 0.18);
      ctx.bezierCurveTo(fx - mw * 0.24, my + mh * 0.62, fx - mw * 0.61, my + mh * 0.56, fx - mw * 0.66, my - mh * 0.10);
    } else if (design.mask === 'visor') {
      ctx.moveTo(fx - mw * 0.70, my - mh * 0.42);
      ctx.quadraticCurveTo(fx, my - mh * 0.68, fx + mw * 0.70, my - mh * 0.42);
      ctx.lineTo(fx + mw * 0.58, my + mh * 0.42);
      ctx.quadraticCurveTo(fx + mw * 0.24, my + mh * 0.58, fx, my + mh * 0.22);
      ctx.quadraticCurveTo(fx - mw * 0.24, my + mh * 0.58, fx - mw * 0.58, my + mh * 0.42);
      ctx.closePath();
    } else {
      ctx.moveTo(fx - mw * 0.62, my - mh * 0.12);
      ctx.quadraticCurveTo(fx - mw * 0.38, my - mh * 0.65, fx - mw * 0.08, my - mh * 0.24);
      ctx.quadraticCurveTo(fx, my - mh * 0.08, fx + mw * 0.08, my - mh * 0.24);
      ctx.quadraticCurveTo(fx + mw * 0.38, my - mh * 0.65, fx + mw * 0.62, my - mh * 0.12);
      ctx.lineTo(fx + mw * 0.54, my + mh * 0.36);
      ctx.quadraticCurveTo(fx + mw * 0.30, my + mh * 0.63, fx + mw * 0.08, my + mh * 0.22);
      ctx.quadraticCurveTo(fx, my + mh * 0.09, fx - mw * 0.08, my + mh * 0.22);
      ctx.quadraticCurveTo(fx - mw * 0.30, my + mh * 0.63, fx - mw * 0.54, my + mh * 0.36);
    }
    ctx.closePath(); ctx.fillStyle = maskGrad; ctx.fill();
    ctx.strokeStyle = 'rgba(240,237,230,0.18)'; ctx.lineWidth = Math.max(1.5, R * 0.012); ctx.stroke();

    // Eye shape is cosmetic; gaze and independent blink tracking stay live.
    const ex = mw * 0.30, eyeW = mw * 0.122;
    const drawEye = function (side, blink) {
      const cxE = fx + side * ex, open = Math.max(0.04, 1 - blink);
      const eyeScale = design.eyes === 'open' ? 1.28 : design.eyes === 'calm' ? 0.58 : design.eyes === 'sharp' ? 0.76 : 1;
      const eyeH = mh * 0.19 * eyeScale * open;
      const angle = design.eyes === 'sharp' ? side * -0.12 : 0;
      ctx.save(); ctx.translate(cxE, my); ctx.rotate(angle);
      const eyePath = function () {
        ctx.beginPath(); ctx.moveTo(-eyeW, 0);
        ctx.bezierCurveTo(-eyeW * 0.46, -eyeH, eyeW * 0.46, -eyeH, eyeW, 0);
        ctx.bezierCurveTo(eyeW * 0.46, eyeH, -eyeW * 0.46, eyeH, -eyeW, 0);
        ctx.closePath();
      };
      eyePath(); ctx.fillStyle = BONE; ctx.fill();
      if (open > 0.25) {
        ctx.save(); eyePath(); ctx.clip();
        const px = (f.gazeX + f.yaw * 0.4) * eyeW * 0.40;
        const py = (-f.gazeY + f.pitch * 0.4) * eyeH * 0.45;
        const pupilR = Math.min(eyeW * 0.38, eyeH * 0.76);
        ctx.beginPath(); ctx.arc(px, py, pupilR, 0, Math.PI * 2);
        ctx.fillStyle = INK; ctx.fill();
        ctx.beginPath(); ctx.arc(px - pupilR * 0.26, py - pupilR * 0.30, pupilR * 0.18, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(240,237,230,0.8)'; ctx.fill();
        ctx.restore();
      }
      ctx.strokeStyle = 'rgba(11,11,12,0.42)'; ctx.lineWidth = Math.max(1.5, R * 0.012);
      ctx.beginPath(); ctx.moveTo(-eyeW * 0.86, -eyeH * 0.12);
      ctx.quadraticCurveTo(0, -eyeH * 1.08, eyeW * 0.86, -eyeH * 0.12); ctx.stroke();
      ctx.restore();
    };
    drawEye(-1, f.blinkL);
    drawEye(1, f.blinkR);

    // Nose bridge is deliberately minimal. It anchors the moving features
    // without making the anonymous face look like a blank sticker.
    ctx.strokeStyle = 'rgba(240,237,230,0.16)'; ctx.lineWidth = Math.max(1.5, R * 0.012); ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(fx + R * 0.015, my + mh * 0.24); ctx.quadraticCurveTo(fx + R * 0.09, my + mh * 0.68, fx - R * 0.015, my + mh * 0.78); ctx.stroke();

    // brows: above the mask, raise with browUp, pinch with browDown
    const by = my - mh * 0.62 - f.browUp * R * 0.11;
    const bw2 = eyeW * 1.5;
    ctx.lineCap = 'round'; ctx.lineWidth = Math.max(3, R * 0.034); ctx.strokeStyle = 'rgba(240,237,230,0.72)';
    const browTilt = R * 0.03 + f.browDown * R * 0.05;
    ctx.beginPath();
    ctx.moveTo(fx - ex - bw2 * 0.5, by - R * 0.015);
    ctx.quadraticCurveTo(fx - ex, by - R * 0.05 + f.browDown * R * 0.02, fx - ex + bw2 * 0.5, by + browTilt - R * 0.03);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(fx + ex + bw2 * 0.5, by - R * 0.015);
    ctx.quadraticCurveTo(fx + ex, by - R * 0.05 + f.browDown * R * 0.02, fx + ex - bw2 * 0.5, by + browTilt - R * 0.03);
    ctx.stroke();

    // Mouth. Camera blendshapes provide round, wide, pressed, smile, and
    // side-shift poses. The mic-only path estimates round vs wide from the
    // audio spectrum. Either way, speech changes silhouette, not just height.
    const mouthX = fx + f.jawSide * R * 0.055;
    const round = clamp(f.pucker, 0, 1), wide = clamp(f.wide, 0, 1), pressed = clamp(f.press, 0, 1);
    const moY = R * 0.43 + fy * 0.9 + jawDrop * 0.76;
    const openH = R * (0.048 + openAmt * 0.31) * (1 + round * 0.42) * (1 - pressed * 0.42);
    const moW = R * (0.38 + f.smile * 0.14 + wide * 0.16 - round * 0.15 - openAmt * 0.05) * squash;
    const cornerY = moY - f.smile * R * 0.09;
    const upperY = moY - openH * (0.30 + wide * 0.06) - f.smile * R * 0.02;
    const lowerY = moY + openH * (0.82 + round * 0.10) + f.smile * R * 0.04;

    // lip body: cupid's bow on top (two curves meeting at centre), one
    // sweep underneath, so the silhouette is a mouth and not a lens
    // Outer control points stay near the corner height on both curves, so the
    // corners close to a soft point. Pulling them to the lip extremes instead
    // darts the corners into spikes at wide openings.
    ctx.beginPath();
    ctx.moveTo(mouthX - moW, cornerY);
    ctx.bezierCurveTo(mouthX - moW * 0.70, cornerY - openH * 0.32, mouthX - moW * 0.30, upperY, mouthX, upperY + openH * 0.05);
    ctx.bezierCurveTo(mouthX + moW * 0.30, upperY, mouthX + moW * 0.70, cornerY - openH * 0.32, mouthX + moW, cornerY);
    ctx.bezierCurveTo(mouthX + moW * 0.74, cornerY + openH * 0.42, mouthX + moW * 0.34, lowerY, mouthX, lowerY);
    ctx.bezierCurveTo(mouthX - moW * 0.34, lowerY, mouthX - moW * 0.74, cornerY + openH * 0.42, mouthX - moW, cornerY);
    ctx.closePath();
    const lip = ctx.createLinearGradient(0, upperY, 0, lowerY);
    lip.addColorStop(0, '#ff4a4a'); lip.addColorStop(0.52, RED); lip.addColorStop(1, '#a9151d');
    ctx.fillStyle = lip; ctx.fill();

    // cavity: only once the mouth is genuinely open, and inset from the lip
    // line so the lips stay readable as lips at every openness
    if (openAmt > 0.11 && pressed < 0.78) {
      ctx.save(); ctx.clip();
      const inner = ctx.createLinearGradient(0, moY - openH, 0, moY + openH);
      inner.addColorStop(0, '#391014');
      inner.addColorStop(1, '#080809');
      ctx.fillStyle = inner;
      ctx.beginPath();
      ctx.ellipse(mouthX, moY + openH * 0.22, moW * 0.76, openH * 0.70, 0, 0, Math.PI * 2);
      ctx.fill();
      const teeth = clamp((openAmt - 0.20) / 0.55, 0, 1);
      if (teeth > 0) {
        ctx.fillStyle = 'rgba(240,237,230,' + (0.84 * teeth) + ')';
        ctx.beginPath();
        ctx.ellipse(mouthX, upperY + openH * 0.24, moW * 0.56, openH * 0.14 * teeth, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      const tongue = clamp((openAmt - 0.48) / 0.36, 0, 1);
      if (tongue > 0) {
        ctx.fillStyle = 'rgba(174,35,50,' + (0.72 * tongue) + ')';
        ctx.beginPath(); ctx.ellipse(mouthX, lowerY - openH * 0.14, moW * 0.42, openH * 0.18, 0, 0, Math.PI * 2); ctx.fill();
      }
      ctx.restore();
    }
    // Lower-lip glint remains visible at rest, so the mouth never collapses
    // back into the thin red scratch seen in the old tile.
    ctx.strokeStyle = 'rgba(255,132,132,0.42)'; ctx.lineWidth = Math.max(1.4, R * 0.012);
    ctx.beginPath(); ctx.moveTo(mouthX - moW * 0.38, lowerY - openH * 0.10);
    ctx.quadraticCurveTo(mouthX, lowerY + openH * 0.02, mouthX + moW * 0.38, lowerY - openH * 0.10); ctx.stroke();

    ctx.restore();

    // seat label on the torso, screen-space so it never rides the chin
    if (label) {
      const labelY = hy + R * 1.29;
      ctx.strokeStyle = rgba(accent, 0.72); ctx.lineWidth = Math.max(2, R * 0.018);
      ctx.beginPath(); ctx.moveTo(hx - R * 0.28, labelY - R * 0.13); ctx.lineTo(hx + R * 0.28, labelY - R * 0.13); ctx.stroke();
      ctx.font = '700 ' + Math.round(R * 0.18) + 'px ui-monospace, Menlo, monospace';
      ctx.fillStyle = 'rgba(240,237,230,0.86)'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(label, hx, labelY);
    }

    // corner chip, bottom-right: Daily's participant name label owns the
    // bottom-left of the tile, so keep clear of it
    const chipY = h - 36, chipW = 236, chipX = w - chipW - 22;
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(chipX, chipY - 16, chipW, 32, 16);
    else ctx.rect(chipX, chipY - 16, chipW, 32);
    ctx.fillStyle = 'rgba(11,11,12,0.55)'; ctx.fill();
    ctx.beginPath(); ctx.arc(chipX + 22, chipY, 5 + talk * 3, 0, Math.PI * 2);
    ctx.fillStyle = accent; ctx.fill();
    ctx.font = '14px monospace'; ctx.fillStyle = 'rgba(240,237,230,0.78)';
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillText(talk > 0.10 ? 'ANONYMOUS · SPEAKING' : 'ANONYMOUS · LIVE', chipX + 40, chipY + 1);
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
    let design = normalizeDesign(opts.design || getSavedDesign());
    const syncDesign = function (ev) { design = normalizeDesign(ev && ev.detail); };
    window.addEventListener(DESIGN_EVENT, syncDesign);

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
    let lastDetect = 0;       // detection throttle clock
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
      // ~15fps tracker budget: the landmarker is the most expensive step
      // in the loop, and smoothInto interpolates the gap invisibly.
      if (now - lastDetect < 62) return;
      if (videoEl.currentTime === lastVideoTime) return;
      lastVideoTime = videoEl.currentTime;
      lastDetect = now;
      // detectForVideo timestamps must increase monotonically even across
      // instances sharing the landmarker
      const ts = Math.max(now, tracker.lastTs + 1); tracker.lastTs = ts;
      try {
        const parsed = parseDetection(tracker.lm.detectForVideo(videoEl, ts));
        if (parsed) { target = parsed; lastFaceTs = now; }
      } catch (e) { /* a bad frame never kills the loop */ }
    }

    function idleTargets(now, audio) {
      // No tracking: mic mouth + slow head wander + scripted blinks,
      // so the tile still reads as a live human, never a static badge.
      const t = zeroFace();
      const level = audio.level;
      const s = now / 1000;
      t.yaw = Math.sin(s * 0.33 + ph1) * 0.22 + Math.sin(s * 0.11 + ph2) * 0.12;
      t.pitch = Math.sin(s * 0.21 + ph3) * 0.10 + level * 0.12;
      t.roll = Math.sin(s * 0.17 + ph2) * 0.05;
      t.x = Math.sin(s * 0.13 + ph1) * 0.10;
      t.y = Math.sin(s * 0.19 + ph3) * 0.06;
      // Syllable wobble: a mouth driven by a smoothed envelope alone opens
      // and closes like a hinge. Two detuned oscillators, scaled by how loud
      // the speech is, break the envelope into something with a beat.
      const wob = (Math.sin(s * 17.0 + ph1) * 0.5 + Math.sin(s * 26.3 + ph2) * 0.3) * level * 0.18;
      t.jaw = clamp(level + wob, 0, 1);
      t.pucker = clamp(audio.round * 1.25 + Math.max(0, Math.sin(s * 9.1 + ph3)) * level * 0.08, 0, 0.82);
      t.wide = clamp(audio.wide * 1.18 + Math.max(0, Math.sin(s * 13.7 + ph2)) * level * 0.06, 0, 0.82);
      t.press = clamp(Math.max(0, Math.sin(s * 21.4 + ph1) - 0.72) * level * 0.34, 0, 0.25);
      t.browUp = clamp(level * 0.5 - 0.05, 0, 0.5);
      t.gazeX = t.yaw * 0.5;
      if (now > nextBlink) { blinkUntil = now + 150; nextBlink = now + 2500 + Math.random() * 4000; }
      t.blinkL = t.blinkR = now < blinkUntil ? 1 : 0;
      return t;
    }

    function smoothInto(dst, src, dt) {
      // pose eases slower than expressions; jaw is faster than the rest of
      // the face (speech is the fastest thing on a face, and a jaw eased at
      // expression speed lags the audio enough to read as a dub); blinks snap
      const aPose = 1 - Math.exp(-dt / 110);
      const aExpr = 1 - Math.exp(-dt / 65);
      const aJaw = 1 - Math.exp(-dt / (src.jaw > dst.jaw ? 26 : 80));
      const aBlink = 1 - Math.exp(-dt / 28);
      const P = ['x', 'y', 's', 'yaw', 'pitch', 'roll'];
      const E = ['smile', 'pucker', 'wide', 'press', 'jawSide', 'browUp', 'browDown', 'gazeX', 'gazeY'];
      for (let i = 0; i < P.length; i++) dst[P[i]] += (src[P[i]] - dst[P[i]]) * aPose;
      for (let i = 0; i < E.length; i++) dst[E[i]] += (src[E[i]] - dst[E[i]]) * aExpr;
      dst.jaw += (src.jaw - dst.jaw) * aJaw;
      dst.blinkL += (src.blinkL - dst.blinkL) * aBlink;
      dst.blinkR += (src.blinkR - dst.blinkR) * aBlink;
    }

    // Timer-driven, NOT requestAnimationFrame: rAF stalls in background
    // tabs, which would freeze the published avatar (and its mouth) the
    // moment a debater switches tabs to read their notes. A timer keeps
    // painting (browsers clamp hidden-tab timers to ~1fps, which still
    // reads as live to the room).
    // The off tile (and camera mode before video is ready) is a still
    // image: repaint it at 1fps as a keep-alive heartbeat instead of
    // burning a full-rate draw on pixels that never change.
    let staticAt = 0, staticKey = '';
    function paintStatic() {
      const key = 'off|' + label;
      const now = performance.now();
      if (key === staticKey && now - staticAt < 1000) return;
      staticKey = key; staticAt = now;
      drawOff(ctx, OUT_W, OUT_H, label);
    }
    function loop() {
      if (!running) return;
      const now = performance.now();
      const dt = Math.min(1000, now - lastTick); lastTick = now;
      if (mode === 'camera' && videoEl.readyState >= 2) {
        staticKey = '';
        drawCameraFrame(ctx, OUT_W, OUT_H, videoEl);
      } else if (mode === 'avatar') {
        staticKey = '';
        const audio = meter.sample();
        const lv = audio.level;
        let src;
        if (demoFace) { src = demoFace; }
        else {
          detect(now);
          const tracked = now - lastFaceTs < 450;
          src = tracked ? Object.assign({}, target) : idleTargets(now, audio);
          // Audio fills tracking gaps and adds faster syllable detail without
          // replacing the person's real expression when the camera sees it.
          if (tracked) {
            src.jaw = Math.max(src.jaw, lv * 0.8);
            src.pucker = Math.max(src.pucker, audio.round * 0.62);
            src.wide = Math.max(src.wide, audio.wide * 0.64);
          }
        }
        smoothInto(face, src, dt);
        drawAvatar(ctx, OUT_W, OUT_H, label, face, lv, now, design);
      } else {
        paintStatic();
      }
    }
    // 42ms ≈ 24fps, matching the captureStream cap; painting faster than
    // the capture rate was pure waste.
    const drawTimer = setInterval(loop, 42);
    loop();

    const outVideo = canvas.captureStream(FPS).getVideoTracks()[0];
    const out = new MediaStream([outVideo].concat(mediaStream.getAudioTracks()));

    return {
      stream: out,
      videoTrack: outVideo,
      canvas: canvas,
      // Raw camera element + source stream, exposed for the on-device
      // NSFW guard (nsfw-guard.js) which samples the LOCAL feed only.
      videoEl: videoEl,
      srcStream: mediaStream,
      setMode: function (m) { if (['camera', 'avatar', 'off'].indexOf(m) >= 0) mode = m; },
      mode: function () { return mode; },
      setLabel: function (s) { label = String(s || '').slice(0, 3).toUpperCase(); },
      setDesign: function (d) { design = saveDesign(d); return Object.assign({}, design); },
      design: function () { return Object.assign({}, design); },
      level: function () { return meter.level(); },
      debugFace: function (sig) { demoFace = sig ? Object.assign(zeroFace(), sig) : null; },
      stop: function () {
        running = false; clearInterval(drawTimer);
        window.removeEventListener(DESIGN_EVENT, syncDesign);
        outVideo.stop(); meter.close();
        videoEl.srcObject = null;
        // Terminal: release the source camera + mic too, so the recording
        // light goes off the moment the pipeline is stopped.
        try { mediaStream.getTracks().forEach(function (t) { t.stop(); }); } catch (e) {}
      },
    };
  }

  // ── Avatar designer ──────────────────────────────────────────────────
  // Kept inside this module so every room gets the same editor, preview,
  // persistence, and privacy language without duplicating modal code.
  let activeDesigner = null;
  function installDesignerStyles() {
    if (document.getElementById('debatable-avatar-designer-css')) return;
    const style = document.createElement('style');
    style.id = 'debatable-avatar-designer-css';
    style.textContent =
      '.dac-overlay{position:fixed;inset:0;z-index:2147483000;display:grid;place-items:center;padding:18px;background:rgba(2,2,4,.82);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);font-family:Crimson Pro,Georgia,serif;color:#f0ede6}' +
      '.dac-modal{width:min(760px,100%);max-height:min(860px,94vh);overflow:auto;border:1px solid rgba(255,255,255,.17);border-radius:22px;background:#0c0c0f;box-shadow:0 30px 90px rgba(0,0,0,.72)}' +
      '.dac-head{display:flex;gap:18px;align-items:flex-start;justify-content:space-between;padding:21px 22px 15px}' +
      '.dac-kicker{font:700 11px/1.2 ui-monospace,Menlo,monospace;letter-spacing:.16em;text-transform:uppercase;color:#dd2e2e}' +
      '.dac-title{margin:5px 0 4px;font-size:clamp(22px,4vw,31px);letter-spacing:-.035em;line-height:1.05}' +
      '.dac-sub{margin:0;color:rgba(240,237,230,.58);font-size:13px;line-height:1.45}' +
      '.dac-close{flex:0 0 auto;width:36px;height:36px;border:1px solid rgba(255,255,255,.14);border-radius:50%;background:rgba(255,255,255,.04);color:#f0ede6;font-size:22px;cursor:pointer}' +
      '.dac-body{display:grid;grid-template-columns:minmax(260px,.9fr) minmax(300px,1.1fr);gap:20px;padding:0 22px 22px}' +
      '.dac-preview-wrap{position:sticky;top:0;align-self:start}' +
      '.dac-preview{display:block;width:100%;height:auto;border-radius:16px;background:#060607;border:1px solid rgba(255,255,255,.14);box-shadow:0 14px 38px rgba(0,0,0,.45)}' +
      '.dac-private{display:flex;gap:8px;margin:10px 3px 0;color:rgba(240,237,230,.56);font-size:11px;line-height:1.45}' +
      '.dac-private b{color:#67d7c8}' +
      '.dac-controls{min-width:0}' +
      '.dac-group{margin:0 0 16px}' +
      '.dac-label{display:block;margin:0 0 8px;color:rgba(240,237,230,.52);font:700 10px/1.2 ui-monospace,Menlo,monospace;letter-spacing:.15em;text-transform:uppercase}' +
      '.dac-look-row{display:flex;flex-wrap:wrap;gap:7px;margin-bottom:8px}' +
      '.dac-look-name{width:100%;height:38px;border:1px solid rgba(255,255,255,.14);border-radius:10px;background:rgba(255,255,255,.04);color:#f0ede6;padding:0 11px;font:650 12px/1 Crimson Pro,Georgia,serif;outline:none}' +
      '.dac-look-name:focus{border-color:var(--dac-accent,#dd2e2e);box-shadow:0 0 0 2px color-mix(in srgb,var(--dac-accent,#dd2e2e) 18%,transparent)}' +
      '.dac-choices{display:flex;flex-wrap:wrap;gap:7px}' +
      '.dac-choice{appearance:none;border:1px solid rgba(255,255,255,.13);border-radius:10px;background:rgba(255,255,255,.035);color:rgba(240,237,230,.72);min-height:35px;padding:8px 11px;font:650 12px/1 Crimson Pro,Georgia,serif;cursor:pointer;transition:border-color .15s,background .15s,color .15s,transform .15s}' +
      '.dac-choice:hover{color:#fff;border-color:rgba(255,255,255,.32);transform:translateY(-1px)}' +
      '.dac-choice.is-selected{color:#fff;border-color:var(--dac-accent,#dd2e2e);background:color-mix(in srgb,var(--dac-accent,#dd2e2e) 18%,transparent);box-shadow:0 0 0 1px color-mix(in srgb,var(--dac-accent,#dd2e2e) 20%,transparent)}' +
      '.dac-choice--scene{display:grid;grid-template-columns:35px auto;align-items:center;gap:8px;padding:4px 9px 4px 4px}' +
      '.dac-scene-sample{display:block;width:35px;height:27px;border-radius:7px;border:1px solid rgba(255,255,255,.14)}' +
      '.dac-choice--swatch{display:inline-flex;align-items:center;gap:7px}' +
      '.dac-swatch{display:block;width:15px;height:15px;border-radius:50%;border:1px solid rgba(255,255,255,.32);box-shadow:inset 0 0 0 2px rgba(0,0,0,.18)}' +
      '.dac-foot{display:flex;align-items:center;gap:9px;padding:15px 22px 20px;border-top:1px solid rgba(255,255,255,.09)}' +
      '.dac-foot button{appearance:none;border:1px solid rgba(255,255,255,.15);border-radius:10px;padding:10px 14px;background:rgba(255,255,255,.04);color:#f0ede6;font:700 12px/1 Crimson Pro,Georgia,serif;cursor:pointer}' +
      '.dac-foot button:hover{border-color:rgba(255,255,255,.35)}' +
      '.dac-foot .dac-save{margin-left:auto;border-color:var(--dac-accent,#dd2e2e);background:var(--dac-accent,#dd2e2e);color:#fff;padding-inline:18px}' +
      '@media(max-width:650px){.dac-overlay{padding:0;place-items:end center}.dac-modal{width:100%;max-height:94vh;border-radius:20px 20px 0 0}.dac-head{padding:18px 16px 13px}.dac-body{display:block;padding:0 16px 16px}.dac-preview-wrap{position:relative;margin-bottom:18px}.dac-preview{max-height:260px;object-fit:contain}.dac-foot{position:sticky;bottom:0;background:rgba(12,12,15,.96);padding:12px 16px calc(12px + env(safe-area-inset-bottom))}}' +
      '@media(prefers-reduced-motion:reduce){.dac-choice{transition:none}}';
    document.head.appendChild(style);
  }

  function buildDesignerGroup(host, title, group) {
    const section = document.createElement('div'); section.className = 'dac-group';
    const label = document.createElement('span'); label.className = 'dac-label'; label.textContent = title;
    const choices = document.createElement('div'); choices.className = 'dac-choices';
    DESIGN_OPTIONS[group].forEach(function (option) {
      const button = document.createElement('button');
      button.type = 'button'; button.className = 'dac-choice';
      button.setAttribute('data-group', group); button.setAttribute('data-value', option.key);
      button.setAttribute('aria-pressed', 'false');
      if (group === 'scene') {
        button.className += ' dac-choice--scene';
        const sample = document.createElement('span'); sample.className = 'dac-scene-sample'; sample.style.background = option.sample;
        const name = document.createElement('span'); name.textContent = option.label;
        button.appendChild(sample); button.appendChild(name);
      } else if (group === 'accent' || group === 'outfit') {
        button.className += ' dac-choice--swatch';
        const swatch = document.createElement('span'); swatch.className = 'dac-swatch'; swatch.style.background = option.color;
        const name = document.createElement('span'); name.textContent = option.label;
        button.appendChild(swatch); button.appendChild(name);
      } else button.textContent = option.label;
      choices.appendChild(button);
    });
    section.appendChild(label); section.appendChild(choices); host.appendChild(section);
  }

  function openDesigner(opts) {
    opts = opts || {};
    if (activeDesigner) activeDesigner.close();
    installDesignerStyles();
    let draft = getSavedDesign();
    const looksState = getLooksState();
    const initialLook = looksState.looks.filter(function (look) { return look.id === looksState.activeId; })[0] || null;
    let editLookId = initialLook ? initialLook.id : '';
    let lookName = initialLook ? initialLook.name : 'My avatar';
    let alive = true, raf = 0, lastPaint = 0;
    const oldOverflow = document.body.style.overflow;
    const overlay = document.createElement('div'); overlay.className = 'dac-overlay';
    overlay.innerHTML =
      '<section class="dac-modal" role="dialog" aria-modal="true" aria-labelledby="dacTitle">' +
        '<header class="dac-head"><div><div class="dac-kicker">Live identity</div><h2 class="dac-title" id="dacTitle">Design your avatar</h2><p class="dac-sub">Build a look that follows you into every room.</p></div><button type="button" class="dac-close" aria-label="Close avatar designer">×</button></header>' +
        '<div class="dac-body"><div class="dac-preview-wrap"><canvas class="dac-preview" width="960" height="540"></canvas><p class="dac-private"><b>PRIVATE</b><span>Only this animated canvas is sent to the room. Your real background stays hidden.</span></p></div><div class="dac-controls"></div></div>' +
        '<footer class="dac-foot"><button type="button" data-action="surprise">Surprise me</button><button type="button" data-action="cancel">Cancel</button><button type="button" class="dac-save" data-action="save">Save avatar</button></footer>' +
      '</section>';
    const controls = overlay.querySelector('.dac-controls');
    const looksGroup = document.createElement('div'); looksGroup.className = 'dac-group';
    looksGroup.innerHTML = '<span class="dac-label">Saved looks</span><div class="dac-look-row"></div><input class="dac-look-name" maxlength="32" aria-label="Look name" placeholder="Name this look">';
    controls.appendChild(looksGroup);
    const lookRow = looksGroup.querySelector('.dac-look-row');
    const lookInput = looksGroup.querySelector('.dac-look-name');
    lookInput.value = lookName;
    buildDesignerGroup(controls, 'Scene', 'scene');
    buildDesignerGroup(controls, 'Mask', 'mask');
    buildDesignerGroup(controls, 'Color', 'accent');
    buildDesignerGroup(controls, 'Outfit', 'outfit');
    buildDesignerGroup(controls, 'Eyes', 'eyes');
    const canvas = overlay.querySelector('canvas');
    const ctx = canvas.getContext('2d');

    function paintLooks() {
      lookRow.innerHTML = '';
      getLooksState().looks.forEach(function (look) {
        const button = document.createElement('button'); button.type = 'button'; button.className = 'dac-choice';
        button.setAttribute('data-look-id', look.id); button.textContent = look.name;
        if (look.id === editLookId) button.classList.add('is-selected');
        lookRow.appendChild(button);
      });
      const fresh = document.createElement('button'); fresh.type = 'button'; fresh.className = 'dac-choice';
      fresh.setAttribute('data-look-new', '1'); fresh.textContent = '+ New look'; lookRow.appendChild(fresh);
    }

    function sync() {
      const accent = findOption('accent', draft.accent).color;
      overlay.style.setProperty('--dac-accent', accent);
      Array.prototype.forEach.call(overlay.querySelectorAll('[data-group]'), function (button) {
        const selected = draft[button.getAttribute('data-group')] === button.getAttribute('data-value');
        button.classList.toggle('is-selected', selected);
        button.setAttribute('aria-pressed', selected ? 'true' : 'false');
      });
      paintLooks();
    }
    function close() {
      if (!alive) return;
      alive = false; cancelAnimationFrame(raf);
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = oldOverflow;
      overlay.remove();
      if (activeDesigner && activeDesigner.overlay === overlay) activeDesigner = null;
    }
    function onKey(ev) { if (ev.key === 'Escape') close(); }
    function animate(now) {
      if (!alive) return;
      if (now - lastPaint > 41) {
        lastPaint = now;
        const s = now / 1000, f = zeroFace();
        const phrase = Math.sin(s * 1.05) > -0.45 ? 1 : 0;
        const voice = phrase * clamp(0.24 + Math.sin(s * 10.7) * 0.18 + Math.sin(s * 17.3) * 0.12, 0.02, 0.58);
        f.x = Math.sin(s * 0.55) * 0.045; f.yaw = Math.sin(s * 0.46) * 0.13;
        f.pitch = Math.sin(s * 0.35) * 0.05; f.roll = Math.sin(s * 0.31) * 0.025;
        f.jaw = voice; f.wide = voice * (0.32 + Math.max(0, Math.sin(s * 3.4)) * 0.42);
        f.pucker = voice * Math.max(0, Math.sin(s * 2.7 + 1.4)) * 0.44;
        f.smile = 0.13; f.browUp = voice * 0.28; f.gazeX = Math.sin(s * 0.67) * 0.16;
        const blink = (now % 4200) > 4050 ? 1 : 0; f.blinkL = f.blinkR = blink;
        drawAvatar(ctx, canvas.width, canvas.height, String(opts.label || 'YOU').slice(0, 3).toUpperCase(), f, voice, now, draft);
      }
      raf = requestAnimationFrame(animate);
    }
    overlay.addEventListener('click', function (ev) {
      const savedLookButton = ev.target.closest('[data-look-id]');
      if (savedLookButton) {
        const state = getLooksState();
        const selected = state.looks.filter(function (look) { return look.id === savedLookButton.getAttribute('data-look-id'); })[0];
        if (selected) {
          editLookId = selected.id; lookName = selected.name; draft = normalizeDesign(selected.design);
          lookInput.value = lookName; sync();
        }
        return;
      }
      if (ev.target.closest('[data-look-new]')) {
        editLookId = ''; lookName = 'New look'; lookInput.value = lookName; lookInput.select(); sync(); return;
      }
      const choice = ev.target.closest('[data-group]');
      if (choice) {
        draft[choice.getAttribute('data-group')] = choice.getAttribute('data-value');
        draft = normalizeDesign(draft); sync(); return;
      }
      const action = ev.target.closest('[data-action]');
      if (action) {
        const key = action.getAttribute('data-action');
        if (key === 'cancel') close();
        else if (key === 'surprise') {
          Object.keys(DEFAULT_DESIGN).forEach(function (group) {
            const options = DESIGN_OPTIONS[group]; draft[group] = options[Math.floor(Math.random() * options.length)].key;
          });
          sync();
        } else if (key === 'save') {
          const saved = saveLook(draft, lookInput.value, editLookId);
          if (typeof opts.onSave === 'function') opts.onSave(saved);
          close();
        }
        return;
      }
      if (ev.target === overlay || ev.target.closest('.dac-close')) close();
    });
    document.addEventListener('keydown', onKey);
    document.body.appendChild(overlay); document.body.style.overflow = 'hidden';
    sync(); raf = requestAnimationFrame(animate);
    activeDesigner = { overlay: overlay, close: close };
    window.setTimeout(function () { const first = overlay.querySelector('.dac-close'); if (first) first.focus(); }, 0);
    return activeDesigner;
  }

  window.DebateCam = {
    start: start,
    getDesign: getSavedDesign,
    setDesign: saveDesign,
    getLooks: getLooksState,
    activateLook: activateLook,
    deleteLook: deleteLook,
    openDesigner: openDesigner,
    designOptions: DESIGN_OPTIONS,
  };
})();
