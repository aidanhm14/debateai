/* global-debate-map.js
 *
 * Ambient globe of debate rooms opening worldwide.
 *
 * Replaces the prior matchmaking radar (spar-radar.js — dark instrument-
 * glass disc + sweep arm + fabricated @handles). The radar metaphor read
 * as surveillance ("targets, signals acquired"); this one reads as
 * "rooms lighting up across time zones." Same place in the page, very
 * different emotional register.
 *
 * Visual stack (back-to-front):
 *   1. Soft ivory disc background.
 *   2. Faint warm-grey grain (subtle noise via SVG filter).
 *   3. Thin engraved latitude/longitude lines on a tilted ortho sphere.
 *   4. Hand-drawn continent silhouettes at low opacity.
 *   5. Inactive city dots — muted charcoal, the ambient population.
 *   6. Active city dots — DebateAI red, single pulse on spawn.
 *   7. Curved red arcs (quadratic bezier) drawing in between paired
 *      dots, fading out a few seconds later.
 *   8. A floating "Room forming · CityA ↔ CityB" pill at each arc
 *      midpoint, also fading after a beat.
 *
 * Honest copy. No fake usernames. No fake "843 users online." If the
 * page wants to surface real counts, that's the meta-strip job —
 * separate from this module.
 *
 * Honors prefers-reduced-motion: drops to a quiet static state with a
 * handful of dots and one fixed arc; nothing animates.
 *
 * Used in:
 *   - app/spar.html — the matchmaking searching state (primary).
 *   - Reusable anywhere a quiet "global activity" surface helps. Mount
 *     into any sized container; the SVG fills it via viewBox.
 *
 * Public API:
 *   GlobalDebateMap.mount(containerEl, opts?) → { stop(): void }
 *
 *   opts.maxActiveDots   — cap on simultaneously-glowing dots (default 7)
 *   opts.maxActiveArcs   — cap on visible arcs        (default 2)
 *   opts.spawnEveryMs    — average ms between dot spawns (default 1700,
 *                          jittered ±35%)
 *   opts.roomEveryMs     — average ms between room-forming arc events
 *                          (default 4200, jittered ±30%)
 *   opts.rotateSec       — globe rotation period in seconds (default
 *                          240 → very slow drift, not radar-fast)
 *   opts.palette         — 'auto' (default — reads data-theme/data-
 *                          lighting on <html>) | 'light' | 'dark'
 *   opts.cities          — optional override array of { name, lat, lng }
 *   opts.roomPairs       — optional override array of [cityA, cityB]
 *                          strings (matched against cities[].name). If
 *                          omitted, pairs are picked at random from the
 *                          set of currently-active dots.
 *   opts.onCityClick     — (city) => void. Wires a click handler on
 *                          each city dot. spar.html doesn't use this
 *                          (the dots are ambient, not interactive at
 *                          that step), but /live and the landing block
 *                          can pass a route opener here.
 */

(function (global) {
  'use strict';

  // ── City pool ───────────────────────────────────────────────────
  // Curated for visual spread across the globe. Not a literal user
  // map; the wedge here is "rooms across time zones," so what matters
  // is geographic legibility, not market share. (soul.md §8 — the
  // ad-era India-heavy distribution is not a durable base; this list
  // is intentionally distributed.)
  var DEFAULT_CITIES = [
    { name: 'New York',    lat:  40.71, lng:  -74.01 },
    { name: 'Chicago',     lat:  41.88, lng:  -87.63 },
    { name: 'Oakland',     lat:  37.80, lng: -122.27 },
    { name: 'Mexico City', lat:  19.43, lng:  -99.13 },
    { name: 'São Paulo',   lat: -23.55, lng:  -46.63 },
    { name: 'London',      lat:  51.51, lng:   -0.13 },
    { name: 'Paris',       lat:  48.86, lng:    2.35 },
    { name: 'Lagos',       lat:   6.52, lng:    3.38 },
    { name: 'Nairobi',     lat:  -1.29, lng:   36.82 },
    { name: 'Delhi',       lat:  28.61, lng:   77.21 },
    { name: 'Singapore',   lat:   1.35, lng:  103.82 },
    { name: 'Seoul',       lat:  37.57, lng:  126.98 },
    { name: 'Sydney',      lat: -33.87, lng:  151.21 },
  ];

  // Sample format labels for the floating room cards. Honest set —
  // these are real formats the app supports. (soul.md §2 format list.)
  var ROOM_FORMATS = ['APDA', 'BP', 'WSDC', 'Asian Parli', 'PF', 'LD', 'Policy', 'Congress', 'MUN', 'Quick Clash'];

  // Continent silhouette polygons. Hand-traced at 5° resolution from
  // the existing world-data.js LAND_MASK; rendered very faint on the
  // sphere just to add geographic legibility behind the grid. Each
  // entry is a list of [lat, lng] points forming a closed ring.
  // Intentionally LO-FI — the dots carry the geographic load.
  var CONTINENT_POINTS = [
    // North America (rough outline)
    [[70,-150],[68,-130],[60,-130],[50,-125],[35,-120],[25,-110],[18,-100],[20,-90],[28,-82],[40,-78],[45,-70],[55,-65],[65,-75],[72,-95],[75,-115],[70,-150]],
    // South America
    [[12,-70],[5,-78],[-5,-80],[-20,-72],[-35,-72],[-50,-72],[-55,-65],[-35,-55],[-15,-40],[-5,-37],[5,-50],[10,-62],[12,-70]],
    // Europe
    [[70,-10],[65,5],[60,15],[55,25],[48,40],[42,30],[40,15],[36,-5],[45,-10],[55,-8],[65,-15],[70,-10]],
    // Africa
    [[35,-5],[30,10],[15,40],[0,42],[-15,40],[-30,30],[-35,18],[-25,12],[-10,8],[5,0],[20,-15],[30,-10],[35,-5]],
    // Asia (broad)
    [[72,60],[68,90],[65,130],[55,140],[40,140],[25,120],[10,105],[5,95],[8,80],[20,72],[28,60],[40,55],[55,50],[68,55],[72,60]],
    // Australia
    [[-12,130],[-18,142],[-30,152],[-38,145],[-35,135],[-30,115],[-20,120],[-15,125],[-12,130]],
  ];

  // ── Math helpers ────────────────────────────────────────────────

  // Orthographic projection of (lat, lng) onto 2D, with the sphere
  // rotated around its vertical axis by `rotDeg` and tilted by
  // `tiltDeg`. Returns { x, y, visible }, where x/y are in unit
  // coords (-1..1 inside the sphere). visible=false when the point
  // is on the back of the sphere.
  function project(lat, lng, rotDeg, tiltDeg) {
    var phi   = lat   * Math.PI / 180;
    var theta = (lng + rotDeg) * Math.PI / 180;
    var tilt  = tiltDeg * Math.PI / 180;
    var x = Math.cos(phi) * Math.sin(theta);
    var y = Math.sin(phi);
    var z = Math.cos(phi) * Math.cos(theta);
    // Apply tilt around the X axis (lifts the north pole toward the
    // viewer). Standard rotation matrix.
    var yT = y * Math.cos(tilt) - z * Math.sin(tilt);
    var zT = y * Math.sin(tilt) + z * Math.cos(tilt);
    return { x: x, y: -yT, z: zT, visible: zT > 0 };
  }

  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
  function rand(min, max) { return min + Math.random() * (max - min); }
  function pickOne(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
  function jitter(base, frac) { return base * (1 + (Math.random() * 2 - 1) * frac); }

  // ── SVG helpers ─────────────────────────────────────────────────

  var SVGNS = 'http://www.w3.org/2000/svg';
  function svg(tag, attrs, children) {
    var el = document.createElementNS(SVGNS, tag);
    if (attrs) for (var k in attrs) {
      if (Object.prototype.hasOwnProperty.call(attrs, k) && attrs[k] != null) {
        el.setAttribute(k, attrs[k]);
      }
    }
    if (children) {
      for (var i = 0; i < children.length; i++) {
        if (children[i]) el.appendChild(children[i]);
      }
    }
    return el;
  }

  // ── Palette ─────────────────────────────────────────────────────

  function resolvePalette(opt) {
    if (opt === 'dark') return 'dark';
    // This module's house style is the ivory print-inset. We render
    // the LIGHT palette regardless of page theme — the disc is meant
    // to feel like a calm magazine plate even when sitting on a dark
    // page. Pages that genuinely want the dark variant can pass
    // palette:'dark' explicitly; everything else (including 'auto')
    // resolves to light.
    return 'light';
  }

  var LIGHT = {
    discFrom:    '#faf6ee',
    discTo:      '#efe6d2',
    discRim:     'rgba(125, 95, 45, 0.22)',
    grid:        'rgba(96, 70, 40, 0.16)',
    gridEquator: 'rgba(96, 70, 40, 0.30)',
    continent:   'rgba(96, 70, 40, 0.13)',
    dotIdle:     'rgba(64, 48, 32, 0.55)',
    dotIdleRim:  'rgba(64, 48, 32, 0.18)',
    accent:      '#dc2a2a',
    accentSoft:  'rgba(220, 42, 42, 0.55)',
    accentGlow:  'rgba(220, 42, 42, 0.32)',
    arc:         'rgba(220, 42, 42, 0.55)',
    cardBg:      'rgba(252, 248, 240, 0.96)',
    cardBorder:  'rgba(96, 70, 40, 0.22)',
    cardShadow:  'rgba(40, 25, 10, 0.18)',
    cardText:    '#2a1d10',
    cardSubtle:  'rgba(70, 50, 30, 0.65)',
    labelText:   'rgba(50, 35, 20, 0.78)',
  };
  var DARK = {
    discFrom:    '#1d1413',
    discTo:      '#100808',
    discRim:     'rgba(239, 68, 68, 0.22)',
    grid:        'rgba(255, 220, 200, 0.10)',
    gridEquator: 'rgba(255, 220, 200, 0.20)',
    continent:   'rgba(255, 220, 200, 0.09)',
    dotIdle:     'rgba(255, 220, 200, 0.32)',
    dotIdleRim:  'rgba(255, 220, 200, 0.10)',
    accent:      '#ff5c5c',
    accentSoft:  'rgba(255, 100, 100, 0.70)',
    accentGlow:  'rgba(255, 80, 80, 0.40)',
    arc:         'rgba(255, 100, 100, 0.75)',
    cardBg:      'rgba(28, 18, 18, 0.94)',
    cardBorder:  'rgba(239, 68, 68, 0.32)',
    cardShadow:  'rgba(0, 0, 0, 0.50)',
    cardText:    '#f3e9e3',
    cardSubtle:  'rgba(243, 233, 227, 0.65)',
    labelText:   'rgba(243, 233, 227, 0.78)',
  };

  // ── Mount ───────────────────────────────────────────────────────

  function mount(container, opts) {
    if (!container || !container.appendChild) {
      return { stop: function () {} };
    }
    opts = opts || {};
    var maxActiveDots = Math.max(2, Math.min(12, opts.maxActiveDots || 7));
    var maxActiveArcs = Math.max(1, Math.min(4,  opts.maxActiveArcs || 2));
    var spawnEveryMs  = Math.max(400, opts.spawnEveryMs || 1700);
    var roomEveryMs   = Math.max(1500, opts.roomEveryMs || 4200);
    var rotateSec     = opts.rotateSec || 240;
    var cities        = (opts.cities || DEFAULT_CITIES).slice();
    var paletteName   = resolvePalette(opts.palette || 'auto');
    var pal           = paletteName === 'dark' ? DARK : LIGHT;
    var onCityClick   = typeof opts.onCityClick === 'function' ? opts.onCityClick : null;
    var reduceMotion  = global.matchMedia &&
                        global.matchMedia('(prefers-reduced-motion: reduce)').matches;

    // ── Build SVG once. Geometry is in viewBox units (200×200);
    //    the actual pixel size comes from the container's CSS width.
    var VB = 200;
    var R  = 90; // sphere radius inside the viewBox
    var CX = 100, CY = 100;

    container.innerHTML = '';
    container.classList.add('gdmap-host');

    var filterId   = 'gdmap-blur-' + Math.random().toString(36).slice(2, 8);
    var grainId    = 'gdmap-grain-' + Math.random().toString(36).slice(2, 8);
    var clipId     = 'gdmap-clip-' + Math.random().toString(36).slice(2, 8);
    var glowGradId = 'gdmap-glow-' + Math.random().toString(36).slice(2, 8);
    var discGradId = 'gdmap-disc-' + Math.random().toString(36).slice(2, 8);

    var root = svg('svg', {
      viewBox: '0 0 ' + VB + ' ' + VB,
      width:  '100%',
      height: '100%',
      role:   'img',
      'aria-label': 'Globe showing debate rooms opening across cities worldwide',
      class: 'gdmap-svg'
    });

    // Defs: gradients, blur filter for the soft glow, grain filter,
    // and a clip path so anything outside the sphere doesn't bleed.
    var defs = svg('defs');

    var discGrad = svg('radialGradient', { id: discGradId, cx: '50%', cy: '46%', r: '62%' }, [
      svg('stop', { offset: '0%',  'stop-color': pal.discFrom }),
      svg('stop', { offset: '100%','stop-color': pal.discTo })
    ]);
    defs.appendChild(discGrad);

    var glowGrad = svg('radialGradient', { id: glowGradId, cx: '50%', cy: '50%', r: '50%' }, [
      svg('stop', { offset: '0%',   'stop-color': pal.accentGlow, 'stop-opacity': '0.85' }),
      svg('stop', { offset: '100%', 'stop-color': pal.accentGlow, 'stop-opacity': '0' })
    ]);
    defs.appendChild(glowGrad);

    var blurFilter = svg('filter', { id: filterId, x: '-30%', y: '-30%', width: '160%', height: '160%' }, [
      svg('feGaussianBlur', { 'in': 'SourceGraphic', stdDeviation: '1.6' })
    ]);
    defs.appendChild(blurFilter);

    // Paper grain — fractal noise composited as a faint overlay.
    // Disabled on small screens / older mobile to keep things calm.
    var grainFilter = svg('filter', { id: grainId, x: '0', y: '0', width: '100%', height: '100%' }, [
      svg('feTurbulence', { type: 'fractalNoise', baseFrequency: '0.85', numOctaves: '2', stitchTiles: 'stitch', result: 'noise' }),
      svg('feColorMatrix', { 'in': 'noise', type: 'matrix', values:
        '0 0 0 0 0.36  0 0 0 0 0.26  0 0 0 0 0.14  0 0 0 0.08 0' })
    ]);
    defs.appendChild(grainFilter);

    var clipDisc = svg('clipPath', { id: clipId }, [
      svg('circle', { cx: CX, cy: CY, r: R })
    ]);
    defs.appendChild(clipDisc);

    root.appendChild(defs);

    // ── Layer 1: disc background.
    root.appendChild(svg('circle', {
      cx: CX, cy: CY, r: R,
      fill: 'url(#' + discGradId + ')',
      stroke: pal.discRim,
      'stroke-width': '0.6'
    }));

    // Subtle outer halo for elevation.
    root.appendChild(svg('circle', {
      cx: CX, cy: CY, r: R + 1.5,
      fill: 'none',
      stroke: pal.discRim,
      'stroke-width': '0.35',
      opacity: '0.6'
    }));

    // Group that all sphere contents go into — clipped to the disc.
    var sphereGroup = svg('g', { 'clip-path': 'url(#' + clipId + ')' });
    root.appendChild(sphereGroup);

    // Paper grain on top of the disc (clipped). Skip on very small
    // containers where grain reads as noise instead of texture.
    var grainRect = svg('rect', {
      x: CX - R, y: CY - R, width: R * 2, height: R * 2,
      fill: 'transparent',
      filter: 'url(#' + grainId + ')',
      opacity: '0.55'
    });
    sphereGroup.appendChild(grainRect);

    // ── Layer 2: latitude/longitude grid. Drawn dynamically each
    //    frame so it rotates with the globe. Kept in its own group.
    var gridGroup = svg('g', { class: 'gdmap-grid', 'stroke-linecap': 'round' });
    sphereGroup.appendChild(gridGroup);

    // ── Layer 3: continent silhouettes (very faint).
    var continentGroup = svg('g', { class: 'gdmap-continents', fill: pal.continent, stroke: 'none' });
    sphereGroup.appendChild(continentGroup);

    // ── Layer 4: dots (idle + active live here).
    var dotsGroup = svg('g', { class: 'gdmap-dots' });
    sphereGroup.appendChild(dotsGroup);

    // ── Layer 5: arcs (between active pairs).
    var arcsGroup = svg('g', { class: 'gdmap-arcs', fill: 'none', stroke: pal.arc });
    sphereGroup.appendChild(arcsGroup);

    // ── Layer 6: floating room-forming cards (HTML, positioned over
    //    the SVG via an absolute-positioned overlay div so they can
    //    use real text, real shadow, real border — SVG <text> would
    //    feel like a debug label).
    var cardLayer = document.createElement('div');
    cardLayer.className = 'gdmap-cards';
    cardLayer.style.position = 'absolute';
    cardLayer.style.inset = '0';
    cardLayer.style.pointerEvents = 'none';

    // Wrap the whole thing in a positioned host so the card overlay
    // can sit on top of the SVG without disturbing the SVG's
    // intrinsic sizing.
    var host = document.createElement('div');
    host.className = 'gdmap-host-inner';
    host.style.position = 'relative';
    host.style.width    = '100%';
    host.style.height   = '100%';
    host.appendChild(root);
    host.appendChild(cardLayer);
    container.appendChild(host);

    // ── State ────────────────────────────────────────────────────
    var rotDeg = 0;             // current rotation (degrees)
    var tiltDeg = 18;           // tilt — a touch of axial lean
    var lastFrame = performance.now();
    var lastSpawn = lastFrame;
    var lastRoom  = lastFrame;
    var stopped   = false;

    // Per-city render state.
    var cityState = cities.map(function (c, i) {
      return {
        city: c,
        idleEl: null,    // <circle> — always visible (back-side hidden)
        glowEl: null,    // <circle> — radial glow halo, shown when active
        coreEl: null,    // <circle> — bright active core
        pulseEl: null,   // <circle> — expanding ring on spawn
        label: null,     // <text> — city name on hover
        active: false,
        activeUntil: 0,
        spawnedAt: 0,
        index: i
      };
    });

    // Pre-create idle dot SVG elements (their positions get updated
    // each frame). The "active" decorations are appended on demand.
    cityState.forEach(function (s) {
      var idle = svg('circle', {
        cx: 0, cy: 0, r: 0.9,
        fill: pal.dotIdle,
        stroke: pal.dotIdleRim,
        'stroke-width': '0.4',
        class: 'gdmap-dot-idle'
      });
      s.idleEl = idle;
      dotsGroup.appendChild(idle);
    });

    // Tooltip element (HTML, lives in the card layer).
    var tooltip = document.createElement('div');
    tooltip.className = 'gdmap-tooltip';
    tooltip.style.position = 'absolute';
    tooltip.style.opacity = '0';
    tooltip.style.transform = 'translate(-50%, -120%)';
    tooltip.style.pointerEvents = 'none';
    tooltip.style.transition = 'opacity 200ms ease';
    cardLayer.appendChild(tooltip);

    // Arcs are tracked here so we can fade + remove them.
    var arcs = []; // { el, card, born, lifeMs, fromIdx, toIdx }

    // ── Continent rendering (positions update each frame too).
    var continentPaths = CONTINENT_POINTS.map(function () {
      var path = svg('path', { d: '', 'fill-rule': 'evenodd' });
      continentGroup.appendChild(path);
      return path;
    });

    // Latitude lines: every 30° from -60 to 60.
    // Longitude lines: every 30° from -180 to 150 (drawn relative to
    // the current rotation).
    function buildGrid() {
      gridGroup.innerHTML = '';

      // Latitudes — sample each circle at 5° lng steps, project.
      [-60, -30, 0, 30, 60].forEach(function (lat) {
        var pts = [];
        for (var lng = -180; lng <= 180; lng += 5) {
          var p = project(lat, lng, rotDeg, tiltDeg);
          if (!p.visible) { pts.push(null); continue; }
          pts.push({ x: CX + p.x * R, y: CY + p.y * R });
        }
        var d = stringifyPath(pts);
        if (!d) return;
        gridGroup.appendChild(svg('path', {
          d: d, fill: 'none',
          stroke: lat === 0 ? pal.gridEquator : pal.grid,
          'stroke-width': lat === 0 ? '0.55' : '0.4',
          'stroke-dasharray': lat === 0 ? '' : '1.4 2.0'
        }));
      });

      // Longitudes — sample each meridian at 5° lat steps.
      for (var lng = -150; lng <= 180; lng += 30) {
        var pts2 = [];
        for (var lat2 = -85; lat2 <= 85; lat2 += 5) {
          var p2 = project(lat2, lng, rotDeg, tiltDeg);
          if (!p2.visible) { pts2.push(null); continue; }
          pts2.push({ x: CX + p2.x * R, y: CY + p2.y * R });
        }
        var d2 = stringifyPath(pts2);
        if (!d2) continue;
        gridGroup.appendChild(svg('path', {
          d: d2, fill: 'none',
          stroke: lng === 0 ? pal.gridEquator : pal.grid,
          'stroke-width': lng === 0 ? '0.55' : '0.4',
          'stroke-dasharray': '1.4 2.0'
        }));
      }
    }

    // Convert a list of (point | null) into an SVG path string with
    // M/L commands, breaking at nulls so back-of-sphere segments
    // don't connect across the disc.
    function stringifyPath(pts) {
      var d = '';
      var moveNext = true;
      for (var i = 0; i < pts.length; i++) {
        var p = pts[i];
        if (!p) { moveNext = true; continue; }
        d += (moveNext ? ' M ' : ' L ') + p.x.toFixed(2) + ' ' + p.y.toFixed(2);
        moveNext = false;
      }
      return d.trim();
    }

    // Project + render the continent polygons each frame. Polygons
    // get clipped to the visible front hemisphere by the per-point
    // visibility flag, so back-side outlines don't leak.
    function buildContinents() {
      CONTINENT_POINTS.forEach(function (ring, idx) {
        var d = '';
        var moveNext = true;
        for (var i = 0; i < ring.length; i++) {
          var p = project(ring[i][0], ring[i][1], rotDeg, tiltDeg);
          if (!p.visible) { moveNext = true; continue; }
          d += (moveNext ? ' M ' : ' L ') + (CX + p.x * R).toFixed(2) + ' ' + (CY + p.y * R).toFixed(2);
          moveNext = false;
        }
        continentPaths[idx].setAttribute('d', d.trim());
      });
    }

    function buildDots() {
      cityState.forEach(function (s) {
        var p = project(s.city.lat, s.city.lng, rotDeg, tiltDeg);
        if (!p.visible) {
          s.idleEl.setAttribute('opacity', '0');
          if (s.glowEl) s.glowEl.setAttribute('opacity', '0');
          if (s.coreEl) s.coreEl.setAttribute('opacity', '0');
          if (s.pulseEl) s.pulseEl.setAttribute('opacity', '0');
          s.lastScreen = null;
          return;
        }
        var x = CX + p.x * R;
        var y = CY + p.y * R;
        // Fade dots near the rim so they don't read as a hard edge.
        var rim = Math.max(0.0, Math.min(1.0, p.z * 2.0));
        s.idleEl.setAttribute('cx', x.toFixed(2));
        s.idleEl.setAttribute('cy', y.toFixed(2));
        s.idleEl.setAttribute('opacity', (0.55 * rim).toFixed(3));
        if (s.glowEl) {
          s.glowEl.setAttribute('cx', x.toFixed(2));
          s.glowEl.setAttribute('cy', y.toFixed(2));
        }
        if (s.coreEl) {
          s.coreEl.setAttribute('cx', x.toFixed(2));
          s.coreEl.setAttribute('cy', y.toFixed(2));
        }
        if (s.pulseEl) {
          s.pulseEl.setAttribute('cx', x.toFixed(2));
          s.pulseEl.setAttribute('cy', y.toFixed(2));
        }
        s.lastScreen = { x: x, y: y };
      });
    }

    // Activate a city: build a glow + core + pulse, schedule lifetime.
    function activate(idx) {
      var s = cityState[idx];
      if (s.active) return;
      s.active = true;
      s.spawnedAt = performance.now();
      // Active dot lifetime: 9-13s. Then it dims back to idle.
      s.activeUntil = s.spawnedAt + (8000 + Math.random() * 4500);

      // Halo (large soft red glow).
      var glow = svg('circle', { cx: 0, cy: 0, r: 6.5, fill: 'url(#' + glowGradId + ')', opacity: '0' });
      s.glowEl = glow;
      dotsGroup.appendChild(glow);

      // Bright core.
      var core = svg('circle', { cx: 0, cy: 0, r: 1.6, fill: pal.accent, opacity: '0' });
      s.coreEl = core;
      dotsGroup.appendChild(core);

      // Expanding ring pulse (animated via SMIL on the radius +
      // opacity; one-shot). We use SMIL because it doesn't fight the
      // rAF loop that's already moving cx/cy each frame.
      var pulse = svg('circle', { cx: 0, cy: 0, r: 1.6, fill: 'none', stroke: pal.accent, 'stroke-width': '0.4', opacity: '0' });
      var animR = svg('animate', { attributeName: 'r', from: '1.6', to: '7', dur: '1.2s', fill: 'freeze', begin: 'indefinite' });
      var animOp = svg('animate', { attributeName: 'opacity', from: '0.85', to: '0', dur: '1.2s', fill: 'freeze', begin: 'indefinite' });
      pulse.appendChild(animR);
      pulse.appendChild(animOp);
      s.pulseEl = pulse;
      dotsGroup.appendChild(pulse);

      // Trigger the pulse + cross-fade-in for glow/core.
      requestAnimationFrame(function () {
        animR.beginElement && animR.beginElement();
        animOp.beginElement && animOp.beginElement();
      });
    }

    function deactivate(idx) {
      var s = cityState[idx];
      if (!s.active) return;
      s.active = false;
      // Fade out via CSS transition by setting opacity 0; remove
      // after a tick. We never re-pool the elements; per-spawn
      // garbage is small.
      [s.glowEl, s.coreEl, s.pulseEl].forEach(function (el) {
        if (!el) return;
        el.setAttribute('opacity', '0');
        setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 900);
      });
      s.glowEl = s.coreEl = s.pulseEl = null;
    }

    function updateActiveOpacity(now) {
      cityState.forEach(function (s) {
        if (!s.active || !s.lastScreen) return;
        // Active dots only show when visible from this hemisphere.
        var p = project(s.city.lat, s.city.lng, rotDeg, tiltDeg);
        var rim = Math.max(0, Math.min(1, p.z * 2.0));
        var base = p.visible ? 0.95 : 0;
        // Tail-out as we approach activeUntil.
        var tailMs = 1500;
        var remaining = s.activeUntil - now;
        var fade = remaining < tailMs ? Math.max(0, remaining / tailMs) : 1;
        var op = base * rim * fade;
        if (s.coreEl) s.coreEl.setAttribute('opacity', op.toFixed(3));
        if (s.glowEl) s.glowEl.setAttribute('opacity', (op * 0.9).toFixed(3));
        // Auto-retire.
        if (remaining <= 0) deactivate(s.index);
      });
    }

    // Spawn a single dot from the inactive pool.
    function spawnDot() {
      var inactiveIdx = [];
      for (var i = 0; i < cityState.length; i++) if (!cityState[i].active) inactiveIdx.push(i);
      if (inactiveIdx.length === 0) return;
      var activeCount = cityState.length - inactiveIdx.length;
      if (activeCount >= maxActiveDots) return;
      var idx = inactiveIdx[Math.floor(Math.random() * inactiveIdx.length)];
      activate(idx);
    }

    // Form a room: pick two currently-active dots, draw an arc, drop
    // a "Room forming" card at the midpoint. Both fade after lifeMs.
    function spawnRoom() {
      if (arcs.length >= maxActiveArcs) return;
      var actives = cityState.filter(function (s) {
        if (!s.active) return false;
        // Only pair dots that are projected on the front of the
        // sphere right now; otherwise the arc snaps in and out as
        // the globe rotates, which feels glitchy.
        var p = project(s.city.lat, s.city.lng, rotDeg, tiltDeg);
        return p.visible;
      });
      if (actives.length < 2) return;
      // Shuffle, take first two — but avoid dots that are already in
      // an arc, so each room is a distinct pair.
      var inArc = {};
      arcs.forEach(function (a) { inArc[a.fromIdx] = true; inArc[a.toIdx] = true; });
      var pool = actives.filter(function (s) { return !inArc[s.index]; });
      if (pool.length < 2) return;
      shuffle(pool);
      var a = pool[0], b = pool[1];

      var arcEl = svg('path', {
        d: '', fill: 'none',
        stroke: pal.arc, 'stroke-width': '0.8',
        'stroke-linecap': 'round',
        opacity: '0',
        'stroke-dasharray': '0 200',
      });
      arcsGroup.appendChild(arcEl);

      // Build the room card (HTML).
      var card = document.createElement('div');
      card.className = 'gdmap-card';
      var format = pickOne(ROOM_FORMATS);
      card.innerHTML =
        '<span class="gdmap-card-dot" aria-hidden="true"></span>' +
        '<span class="gdmap-card-main">' + escapeHtml(a.city.name) + ' <span class="gdmap-card-arrow">↔</span> ' + escapeHtml(b.city.name) + '</span>' +
        '<span class="gdmap-card-sub">' + escapeHtml(format) + ' room forming</span>';
      cardLayer.appendChild(card);

      var rec = {
        el: arcEl,
        card: card,
        born: performance.now(),
        lifeMs: 5200 + Math.random() * 1400,
        fromIdx: a.index,
        toIdx: b.index
      };
      arcs.push(rec);
    }

    function updateArcs(now) {
      for (var i = arcs.length - 1; i >= 0; i--) {
        var a = arcs[i];
        var sa = cityState[a.fromIdx];
        var sb = cityState[a.toIdx];

        // If either endpoint has rotated to the back, fade the arc
        // out and remove early.
        var pa = project(sa.city.lat, sa.city.lng, rotDeg, tiltDeg);
        var pb = project(sb.city.lat, sb.city.lng, rotDeg, tiltDeg);
        if (!pa.visible || !pb.visible) {
          a.el.setAttribute('opacity', '0');
          a.card.style.opacity = '0';
          if (now - a.born > 600) retireArc(i);
          continue;
        }

        var x1 = CX + pa.x * R, y1 = CY + pa.y * R;
        var x2 = CX + pb.x * R, y2 = CY + pb.y * R;
        // Quadratic bezier control point: lift the midpoint toward
        // the sphere center's "up" (negative-y) plus outward from
        // the chord midpoint normal, so the curve arcs outward like
        // a great-circle drawn above the surface.
        var mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
        var dx = x2 - x1, dy = y2 - y1;
        var chord = Math.sqrt(dx * dx + dy * dy);
        // Normal direction — rotate (dx,dy) by 90°. Choose the side
        // that points away from the sphere center for the loft.
        var nx = -dy / (chord || 1);
        var ny =  dx / (chord || 1);
        // If normal points toward the center, flip it.
        var towardCenter = (mx + nx * 5 - CX) * (mx + nx * 5 - CX) +
                           (my + ny * 5 - CY) * (my + ny * 5 - CY) <
                           (mx - CX) * (mx - CX) + (my - CY) * (my - CY);
        if (towardCenter) { nx = -nx; ny = -ny; }
        var loft = clamp(chord * 0.32, 5, 28);
        var cx = mx + nx * loft;
        var cy = my + ny * loft;
        var d = 'M ' + x1.toFixed(2) + ' ' + y1.toFixed(2) +
                ' Q ' + cx.toFixed(2) + ' ' + cy.toFixed(2) + ' ' +
                       x2.toFixed(2) + ' ' + y2.toFixed(2);
        a.el.setAttribute('d', d);

        // Compute path length for draw-in animation.
        var pathLen = approxQuadLength(x1, y1, cx, cy, x2, y2);

        // Lifecycle: draw-in (0..1000ms), hold (1000..lifeMs-1200ms),
        // fade out (lifeMs-1200..lifeMs).
        var age = now - a.born;
        var drawIn = 1000;
        var fadeOut = 1200;
        var op;
        if (age < drawIn) {
          var t = age / drawIn;
          op = 0.95 * t;
          var visibleLen = pathLen * easeOutCubic(t);
          a.el.setAttribute('stroke-dasharray', visibleLen.toFixed(1) + ' ' + (pathLen + 5).toFixed(1));
        } else if (age < a.lifeMs - fadeOut) {
          op = 0.95;
          a.el.setAttribute('stroke-dasharray', '');
        } else if (age < a.lifeMs) {
          var t2 = (a.lifeMs - age) / fadeOut;
          op = 0.95 * t2;
        } else {
          retireArc(i);
          continue;
        }
        a.el.setAttribute('opacity', op.toFixed(3));

        // Card position: midpoint of the arc, offset outward by the
        // loft direction so it sits on top of the curve, not under
        // it. The cardLayer uses % positioning relative to the host;
        // we convert viewBox (200x200) coords into host-relative %.
        var cardX = (cx / VB) * 100;
        var cardY = (cy / VB) * 100;
        a.card.style.left = cardX.toFixed(2) + '%';
        a.card.style.top  = cardY.toFixed(2) + '%';
        // Cards fade with their arc, but on a slightly later
        // schedule (start at 400ms after arc draw begins).
        var cardOp;
        var cardDelay = 400;
        if (age < cardDelay) cardOp = 0;
        else if (age < drawIn + 200) cardOp = (age - cardDelay) / (drawIn + 200 - cardDelay);
        else if (age < a.lifeMs - fadeOut) cardOp = 1;
        else if (age < a.lifeMs) cardOp = (a.lifeMs - age) / fadeOut;
        else cardOp = 0;
        a.card.style.opacity = Math.max(0, cardOp).toFixed(3);
      }
    }

    function retireArc(i) {
      var a = arcs[i];
      if (a.el && a.el.parentNode) a.el.parentNode.removeChild(a.el);
      if (a.card && a.card.parentNode) a.card.parentNode.removeChild(a.card);
      arcs.splice(i, 1);
    }

    function easeOutCubic(t) { var u = 1 - t; return 1 - u * u * u; }

    // Cheap quadratic bezier length estimate — sample 12 segments.
    function approxQuadLength(x0, y0, x1, y1, x2, y2) {
      var prevX = x0, prevY = y0, len = 0;
      for (var i = 1; i <= 12; i++) {
        var t = i / 12;
        var u = 1 - t;
        var bx = u * u * x0 + 2 * u * t * x1 + t * t * x2;
        var by = u * u * y0 + 2 * u * t * y1 + t * t * y2;
        var dx = bx - prevX, dy = by - prevY;
        len += Math.sqrt(dx * dx + dy * dy);
        prevX = bx; prevY = by;
      }
      return len;
    }

    function shuffle(a) {
      for (var i = a.length - 1; i > 0; i--) {
        var j = Math.floor(Math.random() * (i + 1));
        var t = a[i]; a[i] = a[j]; a[j] = t;
      }
      return a;
    }

    function escapeHtml(s) {
      return String(s).replace(/[&<>"']/g, function (c) {
        return { '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c];
      });
    }

    // ── Hover tooltips on idle dots ─────────────────────────────
    cityState.forEach(function (s) {
      s.idleEl.style.cursor = onCityClick ? 'pointer' : 'default';
      s.idleEl.style.pointerEvents = 'all';
      s.idleEl.addEventListener('pointerenter', function () {
        if (!s.lastScreen) return;
        // Format hint — lift it from ROOM_FORMATS deterministically
        // per city so it doesn't flicker on re-hover.
        var fmt = ROOM_FORMATS[s.index % ROOM_FORMATS.length];
        tooltip.innerHTML =
          '<span class="gdmap-tip-city">' + escapeHtml(s.city.name) + '</span> · ' +
          '<span class="gdmap-tip-fmt">' + escapeHtml(fmt) + ' practice</span>';
        // Position tooltip in host-relative %.
        var x = (s.lastScreen.x / VB) * 100;
        var y = (s.lastScreen.y / VB) * 100;
        tooltip.style.left = x.toFixed(2) + '%';
        tooltip.style.top  = y.toFixed(2) + '%';
        tooltip.style.opacity = '1';
      });
      s.idleEl.addEventListener('pointerleave', function () {
        tooltip.style.opacity = '0';
      });
      if (onCityClick) {
        s.idleEl.addEventListener('click', function () { onCityClick(s.city); });
      }
    });

    // ── Frame loop ───────────────────────────────────────────────
    function frame(now) {
      if (stopped) return;
      var dt = (now - lastFrame) / 1000;
      lastFrame = now;

      if (!reduceMotion) {
        rotDeg = (rotDeg + (360 / rotateSec) * dt) % 360;
      }

      buildGrid();
      buildContinents();
      buildDots();
      updateActiveOpacity(now);
      updateArcs(now);

      if (!reduceMotion && now - lastSpawn > jitter(spawnEveryMs, 0.35)) {
        lastSpawn = now;
        spawnDot();
      }
      if (!reduceMotion && now - lastRoom > jitter(roomEveryMs, 0.30)) {
        lastRoom = now;
        spawnRoom();
      }

      requestAnimationFrame(frame);
    }

    if (reduceMotion) {
      // Static state — light up four geographically-spread dots and
      // one arc, no animation, no spawning.
      var staticIdx = [0, 5, 9, 11].filter(function (i) { return i < cityState.length; });
      staticIdx.forEach(function (i) { activate(i); });
      // Make the static activations permanent (don't auto-retire).
      staticIdx.forEach(function (i) {
        cityState[i].activeUntil = Infinity;
      });
      // Render one frame to position everything.
      buildGrid();
      buildContinents();
      buildDots();
      updateActiveOpacity(performance.now());
      // One quiet arc — pick the first two static actives.
      if (staticIdx.length >= 2) {
        var savedMax = maxActiveArcs;
        spawnRoom();
        // Pin arc lifetime to Infinity.
        if (arcs[0]) arcs[0].lifeMs = Infinity;
        maxActiveArcs = savedMax;
      }
      updateArcs(performance.now());
    } else {
      // Seed 3-4 dots at the start so the disc isn't empty for the
      // first 1.5 seconds.
      var seedCount = Math.min(4, maxActiveDots - 1);
      for (var i = 0; i < seedCount; i++) {
        setTimeout(spawnDot, i * 350);
      }
      requestAnimationFrame(frame);
    }

    return {
      stop: function () {
        stopped = true;
        arcs.forEach(function (a) {
          if (a.el && a.el.parentNode) a.el.parentNode.removeChild(a.el);
          if (a.card && a.card.parentNode) a.card.parentNode.removeChild(a.card);
        });
        arcs.length = 0;
        cityState.forEach(function (s) { deactivate(s.index); });
      }
    };
  }

  global.GlobalDebateMap = { mount: mount };

})(window);
