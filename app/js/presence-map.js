/* presence-map.js
 *
 * Flat 2D world map showing REAL live presence: everyone seen on
 * Debatable in the last 30 minutes, city-level, from /api/presence-live
 * (the anonymous track.js beat; coords are server-rounded to ~11 km).
 *
 * Designed as a BACKGROUND layer: faint dotted continents (from
 * /js/world-data.js's land raster), glowing red pins at real
 * locations, no interaction, pointer-events none. Honest by
 * construction: a pin only exists if a real visitor produced it, and
 * when there are zero live visitors the map is just quiet land dots —
 * no fake liveness.
 *
 * Used in:
 *   - app/spar.html    — full-page background behind the matchmaking UI
 *   - app/landing.html — background of the first screen (hero)
 *
 * Public API:
 *   PresenceMap.mount(containerEl, opts?) → { stop(), refresh() }
 *
 *   opts.palette   — 'auto' (default; reads data-theme/data-lighting on
 *                    <html>) | 'light' | 'dark'
 *   opts.landAlpha — opacity of the land dots (default 0.5 — the layer
 *                    itself is expected to sit at low opacity too)
 *   opts.pinScale  — pin size multiplier (default 1)
 *   opts.refreshMs — repoll cadence (default 120000; skipped while the
 *                    tab is hidden)
 *   opts.onData    — function(payload|null) called after every fetch,
 *                    so the page can render an honest caption ("N on
 *                    Debatable in the last 30 minutes") somewhere in its
 *                    own DOM. payload.online30 is the real count.
 *
 * Requires /js/world-data.js (waits for 'world-data:ready' if needed).
 */
(function (global) {
  'use strict';

  var API = '/api/presence-live';
  // Crop empty poles: the map reads better as a wide band. Antarctica
  // and the high Arctic carry no debaters and a lot of vertical space.
  var LAT_TOP = 75, LAT_BOTTOM = -58;

  function resolvePalette(want) {
    if (want === 'light' || want === 'dark') return want;
    try {
      var root = document.documentElement;
      var t = root.getAttribute('data-theme') || root.getAttribute('data-lighting') || '';
      if (t.indexOf('dark') !== -1) return 'dark';
      if (t.indexOf('light') !== -1) return 'light';
      if (global.matchMedia && global.matchMedia('(prefers-color-scheme: dark)').matches) return 'dark';
    } catch (e) {}
    return 'light';
  }

  var PALETTES = {
    light: { land: '27,26,23', pin: '192,57,43', halo: '192,57,43' },
    dark:  { land: '246,245,240', pin: '239,68,68', halo: '239,68,68' },
  };

  var MAP_ASPECT = 360 / (LAT_TOP - LAT_BOTTOM); // ~2.7:1

  // Fit-contain the map inside the canvas (centered) so continents
  // never stretch; the letterbox bands are just empty background.
  function fitRect(w, h) {
    var rw = Math.min(w, h * MAP_ASPECT);
    var rh = rw / MAP_ASPECT;
    return { x: (w - rw) / 2, y: (h - rh) / 2, w: rw, h: rh };
  }

  function project(lng, lat, rect) {
    return {
      x: rect.x + ((lng + 180) / 360) * rect.w,
      y: rect.y + ((LAT_TOP - lat) / (LAT_TOP - LAT_BOTTOM)) * rect.h,
    };
  }

  function mount(container, opts) {
    if (!container) return { stop: function () {}, refresh: function () {} };
    opts = opts || {};
    var landAlpha = opts.landAlpha == null ? 0.5 : opts.landAlpha;
    var pinScale = opts.pinScale || 1;
    var refreshMs = Math.max(30000, opts.refreshMs || 120000);
    var onData = typeof opts.onData === 'function' ? opts.onData : null;
    var pal = PALETTES[resolvePalette(opts.palette || 'auto')];
    var reduceMotion = false;
    try { reduceMotion = global.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) {}

    var canvas = document.createElement('canvas');
    canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block;pointer-events:none';
    canvas.setAttribute('aria-hidden', 'true');
    container.appendChild(canvas);
    var ctx = canvas.getContext('2d');

    var pins = [];
    var stopped = false;
    var rafId = null;
    var pollTimer = null;
    var land = null;

    function size() {
      var r = container.getBoundingClientRect();
      var dpr = Math.min(2, global.devicePixelRatio || 1);
      canvas.width = Math.max(1, Math.round(r.width * dpr));
      canvas.height = Math.max(1, Math.round(r.height * dpr));
      canvas._dpr = dpr;
    }

    function drawLand(rect) {
      if (!land) return;
      var dotR = Math.max(0.6, (rect.w / 1400)) * canvas._dpr * 0.75;
      ctx.fillStyle = 'rgba(' + pal.land + ',' + landAlpha + ')';
      for (var i = 0; i < land.length; i++) {
        var pt = land[i];
        if (pt.lat > LAT_TOP || pt.lat < LAT_BOTTOM) continue;
        // 2026-07-02: checkerboard thinning — draw every other cell of
        // the 2°/cell raster (world-data.js LAND_STEP) so the backdrop
        // reads as texture, not a busy dot field. Parity comes from the
        // grid coords, not the array index, so the skip is spatially
        // even (a proper halftone) instead of row-striped.
        var col = Math.round((pt.lng + 180) / 2 - 0.5);
        var row = Math.round((90 - pt.lat) / 2 - 0.5);
        if ((col + row) & 1) continue;
        var p = project(pt.lng, pt.lat, rect);
        ctx.beginPath();
        ctx.arc(p.x, p.y, dotR, 0, 6.2832);
        ctx.fill();
      }
    }

    function drawPins(now, rect) {
      var base = Math.max(2.4, rect.w / 320) * pinScale;
      for (var i = 0; i < pins.length; i++) {
        var pin = pins[i];
        var p = project(pin.lng, pin.lat, rect);
        // Gentle breathing pulse, phase-offset per pin; static when
        // reduced motion is on.
        var pulse = reduceMotion ? 1 : 0.85 + 0.15 * Math.sin(now / 900 + i * 1.7);
        // Soft halo.
        var haloR = base * 3.2 * pulse;
        var grad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, haloR);
        grad.addColorStop(0, 'rgba(' + pal.halo + ',0.35)');
        grad.addColorStop(1, 'rgba(' + pal.halo + ',0)');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(p.x, p.y, haloR, 0, 6.2832);
        ctx.fill();
        // Core.
        ctx.fillStyle = 'rgba(' + pal.pin + ',0.95)';
        ctx.beginPath();
        ctx.arc(p.x, p.y, base * 0.55 * pulse, 0, 6.2832);
        ctx.fill();
      }
    }

    function frame(now) {
      if (stopped) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      var rect = fitRect(canvas.width, canvas.height);
      drawLand(rect);
      drawPins(now || 0, rect);
      // Only animate while there are pins to pulse; a pinless map is
      // static land and needs no rAF loop.
      if (pins.length && !reduceMotion && !document.hidden) {
        rafId = requestAnimationFrame(frame);
      } else {
        rafId = null;
      }
    }

    function kick() {
      if (rafId == null && !stopped) frame(performance.now());
    }

    function fetchPins() {
      fetch(API).then(function (r) { return r.ok ? r.json() : null; }).then(function (d) {
        if (stopped) return;
        pins = (d && Array.isArray(d.pins)) ? d.pins.filter(function (p) {
          return typeof p.lat === 'number' && typeof p.lng === 'number';
        }) : [];
        if (onData) { try { onData(d); } catch (e) {} }
        kick();
      }).catch(function () {
        if (onData) { try { onData(null); } catch (e) {} }
      });
    }

    function whenData(cb) {
      if (global.DebateWorldData) return cb();
      global.addEventListener('world-data:ready', function once() {
        global.removeEventListener('world-data:ready', once);
        cb();
      });
    }

    size();
    whenData(function () {
      if (stopped) return;
      land = global.DebateWorldData.land || [];
      kick();
    });
    fetchPins();
    pollTimer = setInterval(function () {
      if (!document.hidden) fetchPins();
    }, refreshMs);

    var ro = null;
    if (global.ResizeObserver) {
      ro = new ResizeObserver(function () { size(); kick(); });
      ro.observe(container);
    }
    // Belt and suspenders: RO callbacks only deliver on rendering
    // frames, which never happen in a hidden/occluded tab. The window
    // resize event and the visibility flip both fire regardless, so a
    // tab that mounted while hidden fixes its canvas the moment it is
    // actually seen.
    function onResize() { size(); kick(); }
    global.addEventListener('resize', onResize);
    function onVis() { if (!document.hidden) { size(); kick(); } }
    document.addEventListener('visibilitychange', onVis);

    return {
      stop: function () {
        stopped = true;
        if (rafId != null) cancelAnimationFrame(rafId);
        if (pollTimer) clearInterval(pollTimer);
        if (ro) ro.disconnect();
        global.removeEventListener('resize', onResize);
        document.removeEventListener('visibilitychange', onVis);
        try { container.removeChild(canvas); } catch (e) {}
      },
      refresh: fetchPins,
    };
  }

  global.PresenceMap = { mount: mount };
})(window);
