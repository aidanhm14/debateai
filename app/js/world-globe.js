/* world-globe.js
 *
 * A rotating 3D globe rendered on Canvas 2D (no WebGL, no libraries).
 * Replaces the flat equirectangular world map with an orthographically
 * projected sphere that smoothly rotates, showing landmasses as faint
 * dots and the live debater network as glowing pins + arcs.
 *
 * Used in two places:
 *   1. landing.html — the "Worldwide network" social-proof section
 *   2. spar.html    — replacing the static red orb while a user is
 *                     waiting in the matchmaking queue (so they SEE
 *                     the network they're trying to match into)
 *
 * Public API:
 *   DebateGlobe.mount(canvasEl, opts?)
 *
 * Opts:
 *   highlightCity   — optional city name to draw an extra-bright pin on
 *                     (used by spar.html to show "you" in your home city)
 *   focusOnHover    — boolean. If true (default), rotation pauses on
 *                     pointerover so the user can read the pins.
 *   idlePulseHz     — pin pulse cadence (default 0.35)
 *   rotateDegPerSec — rotation speed (default 4 → ~90s per full spin)
 *   showArcs        — boolean (default true). spar.html uses false to
 *                     keep the orb less busy.
 *   showScanSweep   — boolean (default false). When true, draws an
 *                     expanding ring pulse from the sphere center every
 *                     ~2.6s. spar.html uses true to communicate
 *                     "actively scanning the queue" while matchmaking.
 *   palette         — 'accent' (default red/coral) | 'cool' (blue tones)
 *
 * The data (continents land mask + city list + arcs) lives in
 * /js/world-data.js so both this globe and the legacy flat map can
 * share one source of truth.
 */

(function(global){
  'use strict';

  // ── Defer to /js/world-data.js for CITIES / ARCS / LAND. The data
  // file dispatches a 'world-data:ready' event when loaded; we hold
  // the mount call until then. ─────────────────────────────────────
  function whenDataReady(cb) {
    if (global.DebateWorldData) return cb(global.DebateWorldData);
    global.addEventListener('world-data:ready', function once(){
      global.removeEventListener('world-data:ready', once);
      cb(global.DebateWorldData);
    });
  }

  // ── Orthographic projection ────────────────────────────────────
  // (lng, lat, lngOffset) → unit-sphere (x, y, z). z>0 means the point
  // is on the front (visible) hemisphere; z<=0 means back side.
  function project(lng, lat, lngOffset) {
    var phi    = lat * Math.PI / 180;
    var lambda = (lng + lngOffset) * Math.PI / 180;
    var cosP = Math.cos(phi), sinP = Math.sin(phi);
    var cosL = Math.cos(lambda), sinL = Math.sin(lambda);
    return {
      x: cosP * sinL,
      y: -sinP,
      z: cosP * cosL,
    };
  }

  // Linear interpolation on the unit sphere, used to draw great-circle
  // arcs that ride the surface (instead of cutting straight through it).
  // Returns a sequence of N projected points along the arc, each tagged
  // with visibility (z>0 means on the front hemisphere).
  function arcPoints(a, b, lngOffset, steps) {
    // Compute 3D Cartesian coords for both endpoints in their TRUE
    // unrotated frame, slerp between them, then rotate the whole arc
    // by lngOffset so it stays glued to the rotating sphere.
    function toXYZ(lng, lat) {
      var phi = lat * Math.PI / 180;
      var lambda = lng * Math.PI / 180;
      var cosP = Math.cos(phi);
      return {
        x: cosP * Math.sin(lambda),
        y: -Math.sin(phi),
        z: cosP * Math.cos(lambda),
      };
    }
    var pa = toXYZ(a.lng, a.lat);
    var pb = toXYZ(b.lng, b.lat);
    var dot = pa.x*pb.x + pa.y*pb.y + pa.z*pb.z;
    dot = Math.max(-1, Math.min(1, dot));
    var omega = Math.acos(dot);
    var sinO = Math.sin(omega);
    var pts = [];
    var lO = lngOffset * Math.PI / 180;
    var cosLO = Math.cos(lO), sinLO = Math.sin(lO);
    for (var i = 0; i <= steps; i++) {
      var t = i / steps;
      var ka, kb;
      if (sinO < 1e-6) { ka = 1 - t; kb = t; }
      else {
        ka = Math.sin((1 - t) * omega) / sinO;
        kb = Math.sin(t * omega) / sinO;
      }
      var x = ka*pa.x + kb*pb.x;
      var y = ka*pa.y + kb*pb.y;
      var z = ka*pa.z + kb*pb.z;
      // Apply rotation around the y-axis (longitude rotation).
      var xr = x * cosLO + z * sinLO;
      var zr = -x * sinLO + z * cosLO;
      pts.push({ x: xr, y: y, z: zr });
    }
    return pts;
  }

  // ── Palette ────────────────────────────────────────────────────
  var PALETTES = {
    accent: {
      sphereInner: 'rgba(36, 32, 42, 1)',
      sphereOuter: 'rgba(8, 6, 12, 1)',
      sphereRim:   'rgba(239, 68, 68, 0.18)',
      sphereRimBlur: 'rgba(239, 68, 68, 0.40)',
      land:        '255,255,255',
      arc:         '239,68,68',
      arcMajor:    '252,165,165',
      pin:         '239,68,68',
      pinMajor:    '252,165,165',
      pinHalo:     '239,68,68',
      highlight:   '34,197,94',
    },
    cool: {
      sphereInner: 'rgba(20, 28, 50, 1)',
      sphereOuter: 'rgba(4, 8, 18, 1)',
      sphereRim:   'rgba(96, 165, 250, 0.20)',
      sphereRimBlur: 'rgba(96, 165, 250, 0.45)',
      land:        '210,224,255',
      arc:         '96,165,250',
      arcMajor:    '147,197,253',
      pin:         '96,165,250',
      pinMajor:    '147,197,253',
      pinHalo:     '96,165,250',
      highlight:   '52,211,153',
    },
  };

  // Pin radius from raw count. sqrt scaling keeps the largest hubs
  // proportionally visible without dwarfing the rest.
  function pinRadius(count) {
    return Math.max(2.0, Math.min(6.5, Math.sqrt(count) / 4.8));
  }

  // ── Mount ──────────────────────────────────────────────────────
  function mount(canvas, opts) {
    if (!canvas || !canvas.getContext) return null;
    opts = opts || {};
    var palette = PALETTES[opts.palette] || PALETTES.accent;
    var rotateDegPerSec = (typeof opts.rotateDegPerSec === 'number') ? opts.rotateDegPerSec : 4;
    var focusOnHover = opts.focusOnHover !== false;
    var showArcs = opts.showArcs !== false;
    var highlightCity = (opts.highlightCity || '').toLowerCase();

    var showScanSweep = opts.showScanSweep === true;
    // When true, skip the opaque dark sphere body (and its inner-shadow
    // vignette + specular highlight) so the disc reads as a soft glass
    // orb defined by the CSS radial-gradient + the rim glow + the pins.
    // The page bg (light or dark) bleeds through. Compositing flips to
    // source-over since 'lighter' blows out on light themes.
    var transparent = opts.transparent === true;

    var ctx = canvas.getContext('2d');
    var dpr = global.devicePixelRatio || 1;

    // State carried between frames.
    var lngOffset = -25;        // start rotated so India is left of center
    var lastFrameTs = 0;
    var paused = false;
    var rafId = 0;
    var data = null;
    var byName = {};
    var hovered = null;         // currently hovered city object
    var pointerXY = null;       // { x, y } in CSS pixels relative to canvas

    // Tooltip element. We attach it to the canvas's parent so absolute
    // positioning works without leaking into the document body.
    var tip = document.createElement('div');
    tip.className = 'globe-tip';
    tip.style.cssText = [
      'position:absolute',
      'pointer-events:none',
      'background:rgba(8,8,14,.95)',
      'border:1px solid rgba(239,68,68,.32)',
      'color:#fff',
      'font:600 .76rem/1 system-ui,sans-serif',
      'padding:7px 10px',
      'border-radius:8px',
      'transform:translate(-50%,-130%)',
      'white-space:nowrap',
      'opacity:0',
      'transition:opacity 120ms ease-out',
      'z-index:5',
      'box-shadow:0 6px 22px rgba(0,0,0,.55)',
    ].join(';');
    if (canvas.parentElement) {
      var ps = window.getComputedStyle(canvas.parentElement).position;
      if (ps === 'static') canvas.parentElement.style.position = 'relative';
      canvas.parentElement.appendChild(tip);
    }

    function showTip(city, x, y) {
      tip.innerHTML = '<span style="color:#fff">' + city.name +
        '</span><span style="color:rgb(' + palette.pinHalo + ');margin-left:8px;font-weight:800">' +
        city.count.toLocaleString() + '</span>';
      tip.style.left = x + 'px';
      tip.style.top  = (y - 6) + 'px';
      tip.style.opacity = '1';
    }
    function hideTip() { tip.style.opacity = '0'; }

    // Hi-DPI sizing — re-run on resize so the globe stays crisp.
    function resize() {
      var rect = canvas.getBoundingClientRect();
      // Logical (CSS) size — use the CSS-set width/height. Canvas
      // backing buffer scales by dpr.
      var w = Math.max(80, rect.width  | 0);
      var h = Math.max(80, rect.height | 0);
      canvas.width  = w * dpr;
      canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    resize();
    var ro = (typeof ResizeObserver !== 'undefined') ? new ResizeObserver(resize) : null;
    if (ro) ro.observe(canvas);
    else global.addEventListener('resize', resize);

    // Pointer hover — find the topmost visible pin under the cursor.
    function updateHover(evt) {
      if (!data) return;
      var rect = canvas.getBoundingClientRect();
      var x = evt.clientX - rect.left;
      var y = evt.clientY - rect.top;
      pointerXY = { x: x, y: y };
      var W = rect.width, H = rect.height;
      var cx = W / 2, cy = H / 2;
      var R = Math.min(W, H) * 0.42;
      var nearest = null, nearestDist = 18 * 18; // 18px hit radius
      for (var i = 0; i < data.cities.length; i++) {
        var c = data.cities[i];
        var p = project(c.lng, c.lat, lngOffset);
        if (p.z <= 0) continue;
        var px = cx + p.x * R;
        var py = cy + p.y * R;
        var dx = px - x, dy = py - y;
        var d2 = dx*dx + dy*dy;
        if (d2 < nearestDist) { nearest = c; nearestDist = d2; }
      }
      if (nearest) {
        hovered = nearest;
        showTip(nearest, x, y);
        if (focusOnHover) paused = true;
      } else {
        if (hovered) { hovered = null; hideTip(); }
        if (focusOnHover) paused = false;
      }
    }
    function clearHover() {
      pointerXY = null;
      if (hovered) { hovered = null; hideTip(); }
      paused = false;
    }
    canvas.addEventListener('mousemove', updateHover);
    canvas.addEventListener('mouseleave', clearHover);
    // Touch: tap-to-show at the touch point.
    canvas.addEventListener('touchstart', function(e){
      if (!e.touches || !e.touches.length) return;
      updateHover(e.touches[0]);
      // Auto-clear after a moment so the tooltip doesn't hang.
      setTimeout(function(){ clearHover(); }, 2200);
    }, { passive: true });

    // Pause when the tab is backgrounded so we don't burn CPU.
    document.addEventListener('visibilitychange', function(){
      // Reset lastFrameTs so we don't get a giant delta jump on resume.
      lastFrameTs = 0;
      if (document.hidden) {
        if (rafId) { global.cancelAnimationFrame(rafId); rafId = 0; }
      } else if (offscreenPaused !== true) {
        // Re-arm only if we weren't ALSO paused by IO (offscreenPaused).
        if (!rafId) rafId = global.requestAnimationFrame(frame);
      }
    });

    // 2026-05-27 perf pass: pause the rAF chain entirely when the canvas
    // scrolls offscreen. Browsers throttle hidden TABS but not offscreen
    // canvases mid-page — a 840×840 sphere with multiple radialGradient
    // recreations per frame is meaningful CPU. Resume on intersection-in,
    // cancel on intersection-out. Big landing-page win when the user
    // scrolls past the founder essay's globe to read the rest of the page.
    var offscreenPaused = false;
    if ('IntersectionObserver' in global) {
      try {
        var io = new IntersectionObserver(function (entries) {
          for (var i = 0; i < entries.length; i++) {
            var hit = entries[i].isIntersecting;
            if (hit) {
              offscreenPaused = false;
              if (!rafId && !document.hidden) {
                lastFrameTs = 0; // avoid frame-delta jump after pause
                rafId = global.requestAnimationFrame(frame);
              }
            } else {
              offscreenPaused = true;
              if (rafId) { global.cancelAnimationFrame(rafId); rafId = 0; }
            }
          }
        }, { rootMargin: '120px', threshold: 0.01 });
        io.observe(canvas);
      } catch (e) {}
    }

    function frame(ts) {
      if (offscreenPaused || document.hidden) { rafId = 0; return; }
      rafId = global.requestAnimationFrame(frame);
      // When the tab is hidden, browsers throttle rAF to ~1Hz on their
      // own. We still paint each tick (so the canvas isn't blank if the
      // user re-shows the tab) but skip rotation so we don't wind up
      // the offset wildly. The rotation resumes from the same position.
      var dt = lastFrameTs ? (ts - lastFrameTs) / 1000 : 0;
      lastFrameTs = ts;
      if (!paused && !document.hidden) lngOffset += rotateDegPerSec * dt;
      if (!data) return;

      var rect = canvas.getBoundingClientRect();
      var W = rect.width, H = rect.height;
      var cx = W / 2, cy = H / 2;
      var R = Math.min(W, H) * 0.42;
      var now = ts || performance.now();

      ctx.clearRect(0, 0, W, H);

      if (!transparent) {
        // ── Sphere body — radial gradient with light from upper-left ──
        var sphereGrad = ctx.createRadialGradient(
          cx - R * 0.32, cy - R * 0.34, R * 0.04,
          cx, cy, R
        );
        sphereGrad.addColorStop(0, palette.sphereInner);
        sphereGrad.addColorStop(1, palette.sphereOuter);
        ctx.fillStyle = sphereGrad;
        ctx.beginPath();
        ctx.arc(cx, cy, R, 0, Math.PI * 2);
        ctx.fill();

        // ── Inner shadow (vignette) — depth so the sphere reads round,
        //    not flat. Pushes the rim into shadow under a top-left light. ──
        var innerShadow = ctx.createRadialGradient(
          cx - R * 0.30, cy - R * 0.34, R * 0.58,
          cx, cy, R * 1.02
        );
        innerShadow.addColorStop(0, 'rgba(0,0,0,0)');
        innerShadow.addColorStop(1, 'rgba(0,0,0,0.55)');
        ctx.fillStyle = innerShadow;
        ctx.beginPath();
        ctx.arc(cx, cy, R, 0, Math.PI * 2);
        ctx.fill();

        // ── Specular highlight — soft bright spot upper-left. Gives the
        //    sphere a liquid/glass feel rather than a matte ball. ──
        var spec = ctx.createRadialGradient(
          cx - R * 0.42, cy - R * 0.44, 0,
          cx - R * 0.42, cy - R * 0.44, R * 0.55
        );
        spec.addColorStop(0, 'rgba(255,255,255,0.10)');
        spec.addColorStop(0.5, 'rgba(255,255,255,0.03)');
        spec.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = spec;
        ctx.beginPath();
        ctx.arc(cx, cy, R, 0, Math.PI * 2);
        ctx.fill();
      }

      // ── Outer atmospheric glow ring ──
      // 2026-05-26 (rev16): shadowBlur 28 -> 52 + double-pass with
      // wider outer halo per Aidan "make this a higher quality globe."
      // Single 28px glow read as a faint edge fade; the two-layer halo
      // makes the sphere feel atmosphere-wrapped, not pasted on. Wider
      // outer halo is brand-tinted at low alpha so it bleeds into the
      // page background as ambient light rather than a hard ring.
      ctx.save();
      // Wide ambient halo (outer atmosphere bleed)
      var halo = ctx.createRadialGradient(cx, cy, R * 0.96, cx, cy, R * 1.18);
      halo.addColorStop(0, palette.sphereRim);
      halo.addColorStop(0.55, palette.sphereRimBlur);
      halo.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = halo;
      ctx.beginPath();
      ctx.arc(cx, cy, R * 1.18, 0, Math.PI * 2);
      ctx.fill();
      // Crisp rim line with glow shadow (the inner atmosphere edge)
      ctx.shadowColor = palette.sphereRimBlur;
      ctx.shadowBlur  = 52;
      ctx.strokeStyle = palette.sphereRim;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.arc(cx, cy, R + 1, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();

      // ── Clip subsequent layers to the sphere disc so arc pulses and
      //    scan-sweep rings can't bleed off the sphere edge ──
      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, R, 0, Math.PI * 2);
      ctx.clip();

      // ── Land dots — subtle topography under the network ──
      // In transparent mode we tint with the brand color at low alpha so
      // dots stay visible on both light and dark page backgrounds (white
      // land dots vanish on a light theme).
      // 2026-06-27: land mask upgraded from a hand-drawn 10° blob grid
      // to a 2° Natural-Earth coastline raster (~5,400 cells, 5x denser
      // linearly). Dots shrink to R*0.0058 so the fine grid reads as a
      // crisp dot-matrix coastline instead of merging into one mass.
      // landR ≈ half the inter-cell spacing (2R/90), so continents stay
      // recognizable with clean dot separation. Alpha bumped slightly
      // to keep the denser-but-smaller dots reading at a glance.
      var landR = Math.max(1.0, R * 0.0058);
      var landFill = transparent
        ? 'rgba(' + palette.pin + ',0.52)'
        : 'rgba(' + palette.land + ',0.55)';
      var landAlphaScale = transparent ? 0.50 : 0.50;
      for (var i = 0; i < data.land.length; i++) {
        var lp = data.land[i];
        var pp = project(lp.lng, lp.lat, lngOffset);
        if (pp.z <= 0.04) continue;
        var lalpha = Math.min(1, (pp.z - 0.04) / 0.30);
        ctx.globalAlpha = landAlphaScale * lalpha;
        ctx.fillStyle = landFill;
        ctx.beginPath();
        ctx.arc(cx + pp.x * R, cy + pp.y * R, landR, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;

      // ── Arcs — additive blending so overlapping arcs brighten into
      //    a hotspot instead of muddying into a darker red. On transparent
      //    mode we stay on source-over since 'lighter' over a light page
      //    bg blows out to white. ──
      ctx.globalCompositeOperation = transparent ? 'source-over' : 'lighter';
      if (showArcs) {
        for (var ai = 0; ai < data.arcs.length; ai++) {
          var arc = data.arcs[ai];
          var a = byName[arc.a], b = byName[arc.b];
          if (!a || !b) continue;
          // 2026-05-26 (rev16): arc tessellation bumped 36 -> 64 steps
          // for visibly smoother great-circle curves at sphere scale.
          var pts = arcPoints(a, b, lngOffset, 64);
          ctx.lineWidth = arc.major ? 1.8 : 1.2;
          var col = arc.major ? palette.arcMajor : palette.arc;
          var path = false;
          for (var pi = 0; pi < pts.length; pi++) {
            var pt = pts[pi];
            if (pt.z <= 0) {
              if (path) { ctx.stroke(); path = false; }
              continue;
            }
            var aalpha = Math.min(1, pt.z * 1.6) * (arc.major ? 0.85 : 0.55);
            if (!path) {
              ctx.beginPath();
              ctx.strokeStyle = 'rgba(' + col + ',' + aalpha.toFixed(3) + ')';
              ctx.moveTo(cx + pt.x * R, cy + pt.y * R);
              path = true;
            } else {
              ctx.lineTo(cx + pt.x * R, cy + pt.y * R);
            }
          }
          if (path) ctx.stroke();

          // Travelling pulse along the arc — sells the "live network"
          // feel. Phase offset by ai so they don't all flow in lockstep.
          var pulseT = ((now / 3200) + ai * 0.137) % 1;
          var pulseIdx = Math.floor(pulseT * (pts.length - 1));
          var pulsePt = pts[pulseIdx];
          if (pulsePt && pulsePt.z > 0.05) {
            var pulseX = cx + pulsePt.x * R;
            var pulseY = cy + pulsePt.y * R;
            var trailAlpha = Math.min(1, pulsePt.z * 1.4);
            ctx.fillStyle = 'rgba(' + col + ',' + (0.55 * trailAlpha).toFixed(3) + ')';
            ctx.beginPath();
            ctx.arc(pulseX, pulseY, 5, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = 'rgba(255,255,255,' + (0.85 * trailAlpha).toFixed(3) + ')';
            ctx.beginPath();
            ctx.arc(pulseX, pulseY, 1.6, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      }

      // ── Scan-sweep rings (opt-in) — concentric pulses expanding from
      //    the center every ~2.6s. Communicates "actively searching"
      //    on the spar matchmaking page. Off by default. ──
      if (showScanSweep) {
        var sweepT = (now / 2600) % 1;
        var sweepR = R * (0.05 + sweepT * 1.0);
        var sweepAlpha = Math.pow(1 - sweepT, 1.4) * 0.42;
        ctx.strokeStyle = 'rgba(' + palette.pinHalo + ',' + sweepAlpha.toFixed(3) + ')';
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.arc(cx, cy, sweepR, 0, Math.PI * 2);
        ctx.stroke();
        // Offset second ring so the sweep feels layered, not single.
        var sweepT2 = ((now / 2600) + 0.5) % 1;
        var sweepR2 = R * (0.05 + sweepT2 * 1.0);
        var sweepAlpha2 = Math.pow(1 - sweepT2, 1.4) * 0.22;
        ctx.strokeStyle = 'rgba(' + palette.pinHalo + ',' + sweepAlpha2.toFixed(3) + ')';
        ctx.lineWidth = 1.0;
        ctx.beginPath();
        ctx.arc(cx, cy, sweepR2, 0, Math.PI * 2);
        ctx.stroke();
      }

      // ── Pin halos (additive) + cores (normal). Two passes so the
      //    soft glow of dense clusters brightens to a hotspot, but the
      //    core dots stay distinct and don't melt into one blob. ──
      for (var ci = 0; ci < data.cities.length; ci++) {
        var city = data.cities[ci];
        var p = project(city.lng, city.lat, lngOffset);
        if (p.z <= 0) continue;
        var fade = Math.min(1, (p.z - 0) / 0.18);
        var x = cx + p.x * R;
        var y = cy + p.y * R;
        var pr = pinRadius(city.count);
        var isHi = highlightCity && city.name.toLowerCase() === highlightCity;

        var phase = (now / 700 + ci * 0.42) % (Math.PI * 2);
        var pulse = (Math.sin(phase) + 1) / 2;
        var pulseR = pr + 1 + pulse * (isHi ? 6 : 3.5);
        var pulseAlpha = (1 - pulse) * (isHi ? 0.45 : 0.26) * fade;
        ctx.fillStyle = 'rgba(' + (isHi ? palette.highlight : palette.pinHalo) + ',' + pulseAlpha.toFixed(3) + ')';
        ctx.beginPath();
        ctx.arc(x, y, pulseR, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = 'rgba(' + (isHi ? palette.highlight : palette.pinHalo) + ',' + (0.16 * fade).toFixed(3) + ')';
        ctx.beginPath();
        ctx.arc(x, y, pr * 1.9, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.globalCompositeOperation = 'source-over';
      for (var ci2 = 0; ci2 < data.cities.length; ci2++) {
        var city2 = data.cities[ci2];
        var p2 = project(city2.lng, city2.lat, lngOffset);
        if (p2.z <= 0) continue;
        var fade2 = Math.min(1, (p2.z - 0) / 0.18);
        var x2 = cx + p2.x * R;
        var y2 = cy + p2.y * R;
        var pr2 = pinRadius(city2.count);
        var isHi2 = highlightCity && city2.name.toLowerCase() === highlightCity;
        var isMajor2 = !!city2.major;

        var coreCol = isHi2 ? palette.highlight : (isMajor2 ? palette.pinMajor : palette.pin);
        ctx.fillStyle = 'rgba(' + coreCol + ',' + fade2.toFixed(3) + ')';
        ctx.beginPath();
        ctx.arc(x2, y2, pr2, 0, Math.PI * 2);
        ctx.fill();

        // Inner bright dot for liveliness (catchlight).
        ctx.fillStyle = 'rgba(255,255,255,' + (0.55 * fade2).toFixed(3) + ')';
        ctx.beginPath();
        ctx.arc(x2 - pr2 * 0.25, y2 - pr2 * 0.30, pr2 * 0.35, 0, Math.PI * 2);
        ctx.fill();

        if (hovered === city2) {
          ctx.strokeStyle = 'rgba(255,255,255,' + (0.85 * fade2).toFixed(3) + ')';
          ctx.lineWidth = 1.4;
          ctx.beginPath();
          ctx.arc(x2, y2, pr2 + 3, 0, Math.PI * 2);
          ctx.stroke();
        }
      }

      ctx.restore();  // unclip + reset composite to default
    }

    whenDataReady(function(d){
      data = d;
      byName = {};
      d.cities.forEach(function(c){ byName[c.name] = c; });
      // Paint one frame synchronously so the canvas isn't blank if the
      // page is hidden at mount time (browsers throttle/pause rAF in
      // background tabs and iframes). The rAF loop then takes over for
      // smooth animation once the user actually looks at the page.
      frame(performance.now());
      rafId = global.requestAnimationFrame(frame);
    });

    return {
      stop: function(){
        if (rafId) global.cancelAnimationFrame(rafId);
        if (ro) ro.disconnect();
        if (tip && tip.parentNode) tip.parentNode.removeChild(tip);
      },
      setRotation: function(deg){ lngOffset = deg; },
      pause: function(){ paused = true; },
      resume: function(){ paused = false; },
    };
  }

  global.DebateGlobe = { mount: mount };
})(window);
