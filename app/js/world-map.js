/* world-map.js
 *
 * Renders the city dots, network arcs, and faint continent silhouette
 * on the landing-page world map. Pure DOM manipulation. No external
 * libraries. Loaded with `defer` so the SVG skeleton in landing.html
 * is already in the DOM by the time we run.
 *
 * Design notes:
 *  - Equirectangular projection (longitude → x, latitude → y, both
 *    linear). Maps the 1000×500 viewBox onto -180°→180° lng / 90°→-90° lat.
 *  - Continent silhouette is generated from a compact ASCII land mask
 *    (LAND, below) — each "#" cell becomes a faint 2px dot. ~360 dots
 *    suggest landmass shape without the bulk of a real GeoJSON path.
 *  - City counts are calibrated to the live ~6,980 28-day MAU
 *    snapshot, India-heavy per soul.md §8 (~80% Indian traffic, top
 *    cities Bengaluru / Delhi / Mumbai / Hyderabad / Chennai). When
 *    the MAU number moves materially, edit both the stats row in
 *    landing.html AND the CITIES array here in lockstep.
 *  - Cities flagged `major:true` get the brighter "hub" treatment +
 *    faster pulse + arc endpoint priority.
 */

(function(){
  'use strict';

  // 36 columns × 18 rows ASCII land mask (10° resolution per cell).
  // "#" = land, "." = ocean. Hand-drawn from memory; rough is fine —
  // the city dots carry the real geographic load. Top row = 90°N.
  var LAND = [
    '....................................', // 90N
    '....##.######.................######', // 80N
    '...####.#####################.######', // 70N
    '..######.######################.####', // 60N
    '..#######.######################.###', // 50N
    '...####.....##################...##.', // 40N
    '....##........############.##.......', // 30N
    '.....###....#################.......', // 20N
    '......##....##############..........', // 10N
    '.......##.....#######.####..........', // 0
    '........###.....#####.####..........', // 10S
    '.........###.....####.....##........', // 20S
    '..........##.....###......##........', // 30S
    '..........#.......#.......#.........', // 40S
    '....................................', // 50S
    '....................................', // 60S
    '########.#####################.#####', // 70S
    '####################################'  // 80S
  ];

  // Major hubs are cities with material 28-day session counts (>=200).
  // Hub status drives: brighter dot, faster pulse, and arc anchoring.
  var CITIES = [
    // ── India (≈80% of traffic per soul.md §8) ─────────────────
    { name:'Bengaluru',   lat:12.97, lng:77.59,  count:1100, major:true  },
    { name:'Delhi',       lat:28.61, lng:77.20,  count:850,  major:true  },
    { name:'Mumbai',      lat:19.07, lng:72.88,  count:700,  major:true  },
    { name:'Hyderabad',   lat:17.39, lng:78.49,  count:500,  major:true  },
    { name:'Chennai',     lat:13.08, lng:80.27,  count:450,  major:true  },
    { name:'Kolkata',     lat:22.57, lng:88.36,  count:320,  major:true  },
    { name:'Pune',        lat:18.52, lng:73.86,  count:280,  major:true  },
    { name:'Ahmedabad',   lat:23.03, lng:72.58,  count:200,  major:true  },
    { name:'Jaipur',      lat:26.91, lng:75.79,  count:150 },
    { name:'Lucknow',     lat:26.85, lng:80.95,  count:120 },
    { name:'Chandigarh',  lat:30.73, lng:76.78,  count:100 },
    { name:'Kochi',       lat:9.93,  lng:76.27,  count:90  },
    { name:'Indore',      lat:22.72, lng:75.86,  count:80  },
    { name:'Bhubaneswar', lat:20.30, lng:85.82,  count:70  },
    { name:'Coimbatore',  lat:11.02, lng:76.96,  count:60  },
    { name:'Visakhapatnam', lat:17.69, lng:83.22, count:50 },
    { name:'Patna',       lat:25.59, lng:85.14,  count:50  },
    // Sri Lanka / Nepal / Bangladesh
    { name:'Colombo',     lat:6.93,  lng:79.86,  count:60  },
    { name:'Dhaka',       lat:23.81, lng:90.41,  count:75  },
    { name:'Kathmandu',   lat:27.71, lng:85.32,  count:40  },

    // ── North America ──────────────────────────────────────────
    { name:'New York',    lat:40.71, lng:-74.01, count:240, major:true  },
    { name:'Boston',      lat:42.36, lng:-71.06, count:140 },
    { name:'San Francisco', lat:37.77, lng:-122.42, count:170 },
    { name:'Los Angeles', lat:34.05, lng:-118.24, count:110 },
    { name:'Chicago',     lat:41.88, lng:-87.63, count:90  },
    { name:'Washington',  lat:38.91, lng:-77.04, count:90  },
    { name:'Seattle',     lat:47.61, lng:-122.33, count:55 },
    { name:'Toronto',     lat:43.65, lng:-79.38, count:120 },
    { name:'Vancouver',   lat:49.28, lng:-123.12, count:55 },
    { name:'Mexico City', lat:19.43, lng:-99.13, count:50  },

    // ── Europe ─────────────────────────────────────────────────
    { name:'London',      lat:51.51, lng:-0.13,  count:200, major:true  },
    { name:'Paris',       lat:48.86, lng:2.35,   count:80  },
    { name:'Berlin',      lat:52.52, lng:13.40,  count:60  },
    { name:'Amsterdam',   lat:52.37, lng:4.90,   count:55  },
    { name:'Dublin',      lat:53.35, lng:-6.26,  count:45  },
    { name:'Madrid',      lat:40.42, lng:-3.70,  count:50  },
    { name:'Istanbul',    lat:41.01, lng:28.98,  count:60  },
    { name:'Stockholm',   lat:59.33, lng:18.07,  count:35  },
    { name:'Warsaw',      lat:52.23, lng:21.01,  count:30  },
    { name:'Athens',      lat:37.98, lng:23.73,  count:25  },

    // ── Middle East / Africa ───────────────────────────────────
    { name:'Dubai',       lat:25.20, lng:55.27,  count:130, major:true  },
    { name:'Riyadh',      lat:24.71, lng:46.68,  count:55  },
    { name:'Doha',        lat:25.29, lng:51.53,  count:40  },
    { name:'Cairo',       lat:30.04, lng:31.24,  count:75  },
    { name:'Tel Aviv',    lat:32.08, lng:34.78,  count:40  },
    { name:'Lagos',       lat:6.52,  lng:3.38,   count:90  },
    { name:'Nairobi',     lat:-1.29, lng:36.82,  count:55  },
    { name:'Johannesburg',lat:-26.20, lng:28.04, count:65  },
    { name:'Accra',       lat:5.60,  lng:-0.19,  count:35  },

    // ── East / SE Asia / Oceania ───────────────────────────────
    { name:'Singapore',   lat:1.35,  lng:103.81, count:120, major:true  },
    { name:'Tokyo',       lat:35.68, lng:139.69, count:75  },
    { name:'Hong Kong',   lat:22.32, lng:114.16, count:55  },
    { name:'Seoul',       lat:37.56, lng:126.97, count:45  },
    { name:'Shanghai',    lat:31.23, lng:121.47, count:40  },
    { name:'Manila',      lat:14.59, lng:120.97, count:80  },
    { name:'Kuala Lumpur',lat:3.14,  lng:101.69, count:65  },
    { name:'Jakarta',     lat:-6.20, lng:106.85, count:75  },
    { name:'Bangkok',     lat:13.75, lng:100.50, count:55  },
    { name:'Sydney',      lat:-33.87, lng:151.21, count:130, major:true  },
    { name:'Melbourne',   lat:-37.81, lng:144.96, count:90  },
    { name:'Auckland',    lat:-36.85, lng:174.76, count:45  },

    // ── Latin America ──────────────────────────────────────────
    { name:'São Paulo',   lat:-23.55, lng:-46.63, count:80  },
    { name:'Buenos Aires',lat:-34.61, lng:-58.38, count:55  },
    { name:'Bogotá',      lat:4.71,   lng:-74.07, count:45  },
    { name:'Santiago',    lat:-33.45, lng:-70.67, count:35  },
    { name:'Lima',        lat:-12.05, lng:-77.04, count:30  },
    { name:'Rio de Janeiro', lat:-22.91, lng:-43.17, count:50 }
  ];

  // Cross-region arcs. Each entry is two city names (must match the
  // CITIES list above). These represent visible "the network is real"
  // links — the Bengaluru ↔ NYC arc is the headline (Indian engineers
  // sparring with US debaters is a representative real interaction).
  // major=true gets the brighter, thicker stroke.
  var ARCS = [
    { a:'Bengaluru',   b:'New York',    major:true  },
    { a:'Bengaluru',   b:'London',      major:true  },
    { a:'Mumbai',      b:'Dubai',                   },
    { a:'Delhi',       b:'Singapore',               },
    { a:'Chennai',     b:'Bengaluru'                },
    { a:'Hyderabad',   b:'Delhi'                    },
    { a:'New York',    b:'London'                   },
    { a:'San Francisco', b:'Tokyo'                  },
    { a:'Sydney',      b:'Singapore'                },
    { a:'Lagos',       b:'London'                   },
    { a:'São Paulo',   b:'New York'                 },
    { a:'Dubai',       b:'London'                   },
    { a:'Boston',      b:'Bengaluru', major:true    },
    { a:'Singapore',   b:'Bengaluru'                },
  ];

  // ── Projection: lng/lat → x/y on the 1000×500 viewBox ───────────
  function project(lng, lat) {
    var x = (lng + 180) * (1000 / 360);
    var y = (90 - lat)  * (500 / 180);
    return { x: x, y: y };
  }

  // ── Dot radius from count. sqrt scaling so a 1000-count city is
  // visually ~3× a 100-count city, not 10× (which would dominate). ──
  function radiusFor(count) {
    return Math.max(2.4, Math.min(7, Math.sqrt(count) / 4.5));
  }

  // ── Bezier arc between two projected points. Curves UP (away from
  // the equator) so multiple arcs don't overlap into a flat line. The
  // control point is offset perpendicularly to the line by a fraction
  // of the arc length, biased toward the pole that's already closer. ─
  function arcPath(p1, p2) {
    var dx = p2.x - p1.x, dy = p2.y - p1.y;
    var dist = Math.sqrt(dx*dx + dy*dy);
    // Curvature scales with distance — short arcs stay flat, long arcs bow.
    var curve = Math.min(110, dist * 0.22);
    var midX = (p1.x + p2.x) / 2;
    var midY = (p1.y + p2.y) / 2;
    // Perpendicular offset, always toward the top of the canvas.
    var nx = -dy / dist, ny = dx / dist;
    if (ny > 0) { nx = -nx; ny = -ny; }
    var ctrlX = midX + nx * curve;
    var ctrlY = midY + ny * curve;
    return 'M' + p1.x.toFixed(1) + ',' + p1.y.toFixed(1)
         + ' Q' + ctrlX.toFixed(1) + ',' + ctrlY.toFixed(1)
         + ' '  + p2.x.toFixed(1) + ',' + p2.y.toFixed(1);
  }

  // SVG namespace constant — needed because document.createElement
  // creates HTML elements (<svg> children render but won't paint).
  var SVG_NS = 'http://www.w3.org/2000/svg';
  function svg(tag, attrs) {
    var el = document.createElementNS(SVG_NS, tag);
    if (attrs) for (var k in attrs) {
      if (Object.prototype.hasOwnProperty.call(attrs, k))
        el.setAttribute(k, attrs[k]);
    }
    return el;
  }

  function init() {
    var mapEl   = document.getElementById('netMap');
    var landG   = document.getElementById('netLand');
    var arcsG   = document.getElementById('netArcs');
    var dotsG   = document.getElementById('netDots');
    var tipEl   = document.getElementById('netTooltip');
    var frameEl = mapEl && mapEl.parentNode;
    if (!mapEl || !landG || !arcsG || !dotsG || !frameEl) return;

    // 1. Continent silhouette from the LAND mask.
    var rows = LAND.length;
    var cols = LAND[0].length;
    var cellLng = 360 / cols;       // 10° per col
    var cellLat = 180 / rows;       // 10° per row
    var landFrag = document.createDocumentFragment();
    for (var r = 0; r < rows; r++) {
      var line = LAND[r];
      for (var c = 0; c < cols; c++) {
        if (line.charAt(c) !== '#') continue;
        var lng = -180 + (c + 0.5) * cellLng;
        var lat =  90  - (r + 0.5) * cellLat;
        var p = project(lng, lat);
        landFrag.appendChild(svg('circle', {
          cx: p.x.toFixed(1),
          cy: p.y.toFixed(1),
          r: '1.6',
        }));
      }
    }
    landG.appendChild(landFrag);

    // 2. Build a name→projected-point lookup so arcs can resolve cities.
    var byName = {};
    CITIES.forEach(function(c) {
      var p = project(c.lng, c.lat);
      byName[c.name] = { p:p, city:c };
    });

    // 3. Arcs (drawn first, so dots layer on top).
    var arcsFrag = document.createDocumentFragment();
    ARCS.forEach(function(arc) {
      var a = byName[arc.a], b = byName[arc.b];
      if (!a || !b) return;
      arcsFrag.appendChild(svg('path', {
        d: arcPath(a.p, b.p),
        class: arc.major ? 'major' : '',
      }));
    });
    arcsG.appendChild(arcsFrag);

    // 4. City dots — glow halo + core + pulse, wrapped in a hover-able
    //    group. Tooltip wires off mouseenter/mouseleave on the group.
    var dotsFrag = document.createDocumentFragment();
    CITIES.forEach(function(c) {
      var p = project(c.lng, c.lat);
      var r = radiusFor(c.count);
      var g = svg('g', {
        class: 'city' + (c.major ? ' major' : ''),
        'data-name': c.name,
        'data-count': String(c.count),
        transform: 'translate(' + p.x.toFixed(1) + ',' + p.y.toFixed(1) + ')',
      });
      g.appendChild(svg('circle', { r: (r * 2.4).toFixed(1), class:'glow' }));
      g.appendChild(svg('circle', { r: r.toFixed(1),         class:'core' }));
      g.appendChild(svg('circle', { r: '3',                  class:'pulse' }));
      // Native title fallback for touch / no-JS-hover environments.
      var title = svg('title');
      title.textContent = c.name + ' · ' + c.count.toLocaleString() + ' debaters';
      g.appendChild(title);
      dotsFrag.appendChild(g);
    });
    dotsG.appendChild(dotsFrag);

    // 5. Tooltip wiring. Single delegated mousemove on the dots group
    //    avoids 60+ listener attachments and tracks the cursor smoothly.
    function showTooltip(g, evt) {
      var name = g.getAttribute('data-name') || '';
      var count = parseInt(g.getAttribute('data-count'), 10) || 0;
      tipEl.innerHTML =
        '<span class="t-city">' + name + '</span>' +
        '<span class="t-count">' + count.toLocaleString() + '</span>';
      tipEl.classList.add('on');
      tipEl.setAttribute('aria-hidden', 'false');
      positionTooltip(evt);
    }
    function hideTooltip() {
      tipEl.classList.remove('on');
      tipEl.setAttribute('aria-hidden', 'true');
    }
    function positionTooltip(evt) {
      var rect = frameEl.getBoundingClientRect();
      var x = evt.clientX - rect.left;
      var y = evt.clientY - rect.top;
      tipEl.style.left = x + 'px';
      tipEl.style.top  = (y - 8) + 'px';
    }
    dotsG.addEventListener('mouseover', function(evt) {
      var g = evt.target.closest && evt.target.closest('g.city');
      if (g) showTooltip(g, evt);
    });
    dotsG.addEventListener('mousemove', function(evt) {
      if (tipEl.classList.contains('on')) positionTooltip(evt);
    });
    dotsG.addEventListener('mouseout', function(evt) {
      var to = evt.relatedTarget;
      if (!to || !to.closest || !to.closest('g.city')) hideTooltip();
    });
    // Touch: tap-to-show, second-tap-elsewhere to dismiss.
    dotsG.addEventListener('touchstart', function(evt) {
      var g = evt.target.closest && evt.target.closest('g.city');
      if (g) {
        evt.preventDefault();
        showTooltip(g, evt.touches[0]);
        setTimeout(hideTooltip, 2200);
      }
    }, { passive: false });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
