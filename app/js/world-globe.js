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
    });

    function frame(ts) {
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

      ctx.clearRect(0, 0, W, H);

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

      // Subtle outer atmospheric glow ring.
      ctx.save();
      ctx.shadowColor = palette.sphereRimBlur;
      ctx.shadowBlur  = 22;
      ctx.strokeStyle = palette.sphereRim;
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.arc(cx, cy, R + 1, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();

      // ── Land dots — only the visible hemisphere ──
      // Edge-fade them with z so they ease into the rim instead of
      // popping in/out.
      ctx.fillStyle = 'rgba(' + palette.land + ',0.16)';
      var landR = Math.max(0.9, R * 0.0042);
      for (var i = 0; i < data.land.length; i++) {
        var lp = data.land[i];
        var pp = project(lp.lng, lp.lat, lngOffset);
        if (pp.z <= 0.04) continue;
        var alpha = Math.min(1, (pp.z - 0.04) / 0.30);
        ctx.globalAlpha = 0.18 * alpha;
        ctx.beginPath();
        ctx.arc(cx + pp.x * R, cy + pp.y * R, landR, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;

      // ── Arcs — slerp along the sphere surface ──
      if (showArcs) {
        for (var ai = 0; ai < data.arcs.length; ai++) {
          var arc = data.arcs[ai];
          var a = byName[arc.a], b = byName[arc.b];
          if (!a || !b) continue;
          var pts = arcPoints(a, b, lngOffset, 28);
          // If the arc spans the back side, we still draw the visible
          // segments — split by visibility transitions.
          ctx.lineWidth = arc.major ? 1.5 : 1.0;
          var col = arc.major ? palette.arcMajor : palette.arc;
          var path = false;
          for (var pi = 0; pi < pts.length; pi++) {
            var pt = pts[pi];
            if (pt.z <= 0) {
              if (path) { ctx.stroke(); path = false; }
              continue;
            }
            var alpha = Math.min(1, pt.z * 1.6) * (arc.major ? 0.55 : 0.35);
            if (!path) {
              ctx.beginPath();
              ctx.strokeStyle = 'rgba(' + col + ',' + alpha.toFixed(3) + ')';
              ctx.moveTo(cx + pt.x * R, cy + pt.y * R);
              path = true;
            } else {
              ctx.lineTo(cx + pt.x * R, cy + pt.y * R);
            }
          }
          if (path) ctx.stroke();
        }
      }

      // ── Pins ──
      var now = ts || performance.now();
      for (var ci = 0; ci < data.cities.length; ci++) {
        var city = data.cities[ci];
        var p = project(city.lng, city.lat, lngOffset);
        if (p.z <= 0) continue;
        var fade = Math.min(1, (p.z - 0) / 0.18);
        var x = cx + p.x * R;
        var y = cy + p.y * R;
        var pr = pinRadius(city.count);
        var isHi = highlightCity && city.name.toLowerCase() === highlightCity;
        var isMajor = !!city.major;

        // Pulse halo — phase offset by index so they don't all blink together.
        var phase = (now / 700 + ci * 0.42) % (Math.PI * 2);
        var pulse = (Math.sin(phase) + 1) / 2;
        var pulseR = pr + 1 + pulse * (isHi ? 7 : 4);
        var pulseAlpha = (1 - pulse) * (isHi ? 0.55 : 0.32) * fade;
        ctx.fillStyle = 'rgba(' + (isHi ? palette.highlight : palette.pinHalo) + ',' + pulseAlpha.toFixed(3) + ')';
        ctx.beginPath();
        ctx.arc(x, y, pulseR, 0, Math.PI * 2);
        ctx.fill();

        // Soft glow halo (constant).
        ctx.fillStyle = 'rgba(' + (isHi ? palette.highlight : palette.pinHalo) + ',' + (0.22 * fade).toFixed(3) + ')';
        ctx.beginPath();
        ctx.arc(x, y, pr * 2.4, 0, Math.PI * 2);
        ctx.fill();

        // Core pin.
        var coreCol = isHi ? palette.highlight : (isMajor ? palette.pinMajor : palette.pin);
        ctx.fillStyle = 'rgba(' + coreCol + ',' + fade.toFixed(3) + ')';
        ctx.beginPath();
        ctx.arc(x, y, pr, 0, Math.PI * 2);
        ctx.fill();

        // Hovered pin gets a thin white ring for confirmation.
        if (hovered === city) {
          ctx.strokeStyle = 'rgba(255,255,255,' + (0.85 * fade).toFixed(3) + ')';
          ctx.lineWidth = 1.4;
          ctx.beginPath();
          ctx.arc(x, y, pr + 3, 0, Math.PI * 2);
          ctx.stroke();
        }
      }
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
