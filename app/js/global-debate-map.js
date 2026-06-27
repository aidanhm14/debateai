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
 *   6. Active city dots — DebateIt red, single pulse on spawn.
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

  // Continent silhouette polygons, rendered very faint behind the grid
  // to give the sphere real geographic legibility. Each entry is a
  // closed ring of [lat, lng] points. Derived from Natural Earth 1:50m
  // land polygons (public domain), Douglas-Peucker simplified to ~1°
  // tolerance — recognizable coastlines (Afro-Eurasia, the Americas,
  // Antarctica, Greenland, Australia, plus the major islands) instead
  // of the old hand-traced 5° blobs. ~45 rings / ~800 vertices, on par
  // with the grid's per-frame projection cost. Regenerate via
  // scripts/build-continents.mjs if the silhouette ever needs retuning.
  var CONTINENT_POINTS = [
    [[77,107],[75.8,114.1],[74.2,109.4],[73.6,127],[70.8,131.3],[71.5,139.9],[72.4,139.1],[72.8,140.5],[70.9,159],[69.4,160.9],[69.4,178.6],[69,180],[65,180],[64.6,177.4],[62.6,179.5],[59.9,170.3],[59.9,163.5],[58.2,162],[57.6,163.2],[54.9,162.1],[51,156.8],[56.8,155.9],[62.6,164.5],[60.5,160.1],[61.4,156.7],[59.8,154.2],[59.1,155],[59,142.2],[54.7,135.1],[54.2,139.9],[52.2,141.4],[46.3,138.2],[39.8,127.5],[35.1,129.1],[34.4,126.5],[39.6,125.3],[38.9,121.1],[40.9,121.6],[39.2,118],[37.4,118.9],[37.5,122.4],[34.9,119.2],[31.7,121.9],[28.2,121.7],[22.8,115.9],[20.3,110.4],[21.7,108.5],[19.8,105.9],[13.4,109.3],[11.7,109.2],[8.6,105.2],[13.4,100.1],[9.2,99.2],[5.5,103],[1.3,104.2],[2.8,101.4],[7.8,98.3],[16.9,97.2],[16,94.2],[22.8,91.4],[21.5,87],[15.9,80.3],[10.4,79.9],[8,77.5],[21.4,72.6],[20.9,70.5],[25.4,66.4],[25.7,57.4],[27.1,56.5],[27.9,51.5],[30.1,50.1],[30,48],[24,51.8],[26.4,56.4],[24.2,56.8],[22.3,59.8],[17.2,55.3],[12.6,43.5],[16.8,42.6],[29.5,34.9],[27.6,33.9],[29.9,32.4],[18.6,37.5],[11.7,42.7],[10.4,44.6],[12,51.1],[10.6,51],[4.2,47.7],[-4.7,39.2],[-14.7,40.8],[-19.8,34.8],[-23.7,35.6],[-25.7,32.6],[-28.8,32.2],[-33.9,25.8],[-34.1,18.4],[-18.1,11.8],[-10.7,13.7],[-1.1,8.8],[3.7,9.4],[4.3,5.9],[6.3,4.3],[4.8,-9],[12.2,-16.6],[21.9,-17],[35.8,-5.9],[37.4,9.5],[36.9,11.1],[33.8,10.3],[30.3,19.1],[32.8,21.5],[31,33.8],[36.7,36.2],[36.7,27.6],[39.5,26.2],[42,33.5],[40.9,38.3],[42,41.7],[45.2,36.7],[47.3,39.1],[46.3,35],[45.1,36.3],[44.4,33.9],[45.3,32.5],[46.1,33.3],[46.6,30.7],[42.6,27.7],[41.1,28.8],[40.3,22.6],[37.7,24],[36.4,22.5],[41.7,19.5],[45.7,13.1],[44.1,12.6],[40.2,18.5],[40.4,16.9],[38,16.1],[40,15.4],[44.4,8.9],[43.1,3.1],[36.7,-2.1],[36.9,-8.9],[43,-9.4],[44,-1.4],[46,-1.2],[48.7,-4.6],[48.6,-1.6],[49.8,-1.9],[53.5,8.1],[57.1,8.5],[57.7,10.6],[55.5,9.7],[54,10.9],[54.4,19.7],[57.4,21.6],[57,24.1],[59.2,23.3],[60,29.1],[60.7,21.3],[63.2,21.5],[65.1,25.4],[65.7,22.2],[62.7,17.8],[61.3,17.1],[60.1,18.8],[56.1,15.9],[55.4,12.9],[59.5,10.4],[58.6,5.7],[62,5],[67.8,14.8],[71,24.5],[67.9,40.3],[66.8,41.1],[66.3,40],[66.6,33.2],[63.8,37],[65.1,37.2],[66.1,43.9],[68.6,43.5],[68.3,46.3],[66.7,46.3],[68.9,53.7],[68.3,59.9],[69.9,60.6],[68.1,68.5],[71,66.7],[72.8,69.2],[72.8,72.6],[71.4,71.8],[68.4,73.7],[66.3,71.3],[66.2,72.4],[67.8,75.1],[71.4,73.1],[72.8,74.7],[71.2,76.4],[71.8,81.5],[73.6,80.5],[77.1,104.7],[77,107]],
    [[69.5,-90.5],[67.2,-87.4],[69.9,-85.5],[69.7,-82.6],[67.6,-81.3],[62,-93.2],[58.9,-94.7],[57.1,-92.3],[55.1,-82.3],[51.2,-79.9],[52.6,-78.6],[54.7,-79.8],[56.5,-76.5],[58.8,-78.5],[59.9,-77.3],[62.3,-78.1],[62.4,-73.8],[61.1,-69.6],[58.2,-67.6],[60.3,-64.6],[56.3,-61.8],[54.6,-57.3],[52.1,-55.7],[50.2,-60],[50.2,-66.4],[46.8,-71.1],[49.2,-65.1],[46.2,-64.5],[47,-60.5],[45.9,-59.8],[43.5,-65.4],[44.5,-66.2],[45.3,-64.4],[45.1,-67.1],[43,-70.7],[41.6,-70],[39.5,-75.5],[37.2,-75.9],[39.2,-76.3],[35.6,-75.7],[31.4,-81.3],[25.2,-80.4],[30.1,-84.1],[29.7,-93.8],[28.3,-96.6],[22.4,-97.9],[19.3,-96.3],[18.7,-92],[21,-90.3],[21.5,-87.1],[15.9,-88.9],[15.3,-83.4],[11.1,-83.8],[8.8,-81.4],[8.6,-76.8],[12.4,-71.8],[9.1,-71.7],[12.2,-69.9],[10.6,-68.2],[10.7,-61.9],[6,-57.1],[4.2,-51.3],[-0.1,-50.4],[-2.7,-44.6],[-2.9,-40],[-5.1,-35.6],[-7.3,-34.7],[-13.1,-38.7],[-21.9,-40.9],[-24.9,-47.6],[-28.7,-48.9],[-34.4,-53.8],[-33.9,-58.4],[-36.9,-56.8],[-38.8,-62.3],[-41,-62.7],[-41.1,-65.1],[-42.6,-63.5],[-45.6,-67.3],[-48.1,-66],[-50.7,-69.1],[-52.3,-68.2],[-53.8,-71],[-52.3,-74.9],[-48.7,-75.6],[-46.9,-74.1],[-46.6,-75.6],[-42.4,-72.7],[-43.2,-74.3],[-19.8,-70.2],[-14.6,-76],[-6.1,-81.2],[-2.7,-79.8],[-1.1,-80.9],[3.8,-77.1],[8.3,-78.2],[8.9,-79.6],[7.2,-80.9],[9.9,-85.7],[13.3,-87.5],[18.3,-103.5],[31.6,-113.9],[30.2,-114.7],[23.4,-109.4],[24.7,-112.2],[33,-117.3],[34.6,-120.6],[40.3,-124.4],[48.2,-124.7],[47.1,-122.6],[49,-122.8],[50.8,-127.4],[58.1,-134.1],[60.9,-147.1],[59.2,-151.7],[61.3,-150.6],[56,-158.4],[54.4,-164.8],[58.9,-157],[58.7,-162],[61.5,-166.1],[64.8,-160.8],[65.7,-168.1],[66.1,-161.7],[68.4,-166.8],[71.4,-156.6],[68.9,-136.5],[70.5,-128.1],[67.4,-108.9],[68.8,-106.2],[67.6,-101.5],[68.6,-97.7],[67.3,-96.1],[69.1,-94.2],[70.1,-96.5],[71.9,-95.2],[69.7,-92.4],[69.5,-90.5]],
    [[-64.2,-58.6],[-64.8,-62],[-68,-65.7],[-70.7,-61.8],[-73.7,-60.8],[-76.6,-70.6],[-76.7,-77.2],[-77.9,-73.7],[-79.2,-78],[-83.2,-58.2],[-80.3,-28.5],[-79.5,-35.6],[-78.1,-35.3],[-75.1,-17.5],[-73.1,-15.4],[-70.9,-6.9],[-70.5,27.1],[-68.5,33.9],[-69.8,38.6],[-65.8,54.5],[-68,61.4],[-67.9,68.9],[-69.2,69.7],[-71.9,67.9],[-72.3,69.9],[-69.9,73.9],[-66.2,88],[-67.4,95.8],[-65.6,102.8],[-66.9,106.2],[-65.9,113.6],[-67.3,119.8],[-65.3,135.1],[-67,137.5],[-66.9,145.5],[-71.7,171.2],[-76.2,163.6],[-78.8,167],[-79.2,161.8],[-80.9,159.8],[-83.8,169.4],[-84.7,180],[-90,180],[-90,-180],[-84.1,-179.1],[-85,-143.1],[-83.7,-153.6],[-82,-152.9],[-81.1,-156.8],[-80.3,-146.4],[-79.1,-155.3],[-76.9,-158.4],[-77.4,-151.3],[-75.2,-144.9],[-73.7,-113.9],[-75.3,-100.6],[-72.6,-103.7],[-73.9,-74.9],[-72.5,-67.4],[-69.7,-68.5],[-66.9,-67.3],[-63.9,-57.6],[-64.2,-58.6]],
    [[83.5,-27.1],[82.7,-20.8],[82,-31.4],[81.3,-12.2],[80.2,-20],[80.1,-17.7],[78.8,-19.7],[77,-18.5],[76.6,-21.7],[74.3,-19.4],[72.3,-24.8],[70.7,-21.8],[71.4,-25.5],[70.2,-26.4],[70.1,-22.3],[65.5,-39.8],[60.1,-43.4],[60.9,-48.3],[63.6,-51.6],[67.2,-54],[69.9,-50.9],[69.6,-54.7],[70.8,-54.4],[70.6,-51.4],[71.7,-55.8],[72.6,-54.7],[75.5,-58.6],[76.1,-68.5],[77,-71.4],[77.4,-66.8],[78,-73.3],[79.4,-65.7],[80.1,-68],[81.8,-62.7],[81.7,-44.5],[82.6,-46.8],[83.6,-35.1],[83.5,-27.1]],
    [[-13.8,143.6],[-26.1,153.1],[-31.6,152.9],[-37.4,150],[-39,146.3],[-38,140.6],[-34.4,138.2],[-35.3,136.8],[-32.9,137.8],[-34.9,136],[-31.5,131.3],[-35.1,118],[-34.2,115],[-31.6,115.7],[-26.1,113.3],[-21.8,114.1],[-19.7,120.9],[-14.2,125.7],[-15,129.6],[-12.5,130.6],[-12.1,132.6],[-11.3,131.8],[-11.9,136.5],[-15,135.5],[-17.7,140.2],[-11,142.1],[-13.4,143.6],[-13.8,143.6]],
    [[73.2,-86.6],[73.8,-82.3],[72.1,-80.7],[71.6,-72.2],[70.1,-67.9],[69.2,-67],[68.7,-68.8],[66.9,-61.9],[65,-63.9],[66.3,-68],[63.4,-64.7],[63.7,-68.8],[61.9,-66.2],[64.7,-74.8],[64.2,-77.7],[65.3,-77.9],[65.5,-74],[67.7,-72.9],[70.2,-79],[70.8,-89.5],[71.2,-88.5],[71.2,-89.9],[73.1,-89.4],[73.8,-85.8],[73.2,-86.6]],
    [[83.1,-68.5],[82.4,-61.9],[79.3,-76.9],[78.5,-75.4],[76.2,-80.6],[76.5,-89.5],[77.9,-88.3],[77.5,-85],[78.4,-88],[79.3,-85.1],[80.3,-86.9],[80.5,-81.8],[81.9,-91.6],[83.2,-70.7],[83.1,-68.5]],
    [[-1.2,134.1],[-3.4,135.5],[-1.7,138.3],[-3.9,144.6],[-10.6,150.7],[-7.6,144.7],[-9.3,142.6],[-8.4,137.6],[-5.4,137.9],[-4.1,133],[-2.8,132],[-2.2,133.7],[-0.9,130.5],[-0.8,134],[-1.2,134.1]],
    [[37.1,141],[35.1,140.3],[33.5,135.8],[34.6,135.1],[33.9,131],[33.1,132],[31.4,130.2],[33.3,129.4],[38.2,139.4],[41.2,140.3],[40,141.9],[38.2,141],[37.1,141]],
    [[-5.9,105.8],[-4.2,102.6],[5.5,95.3],[1.4,102.5],[-4.3,105.9],[-5.9,105.8]],
    [[1.8,117.9],[0.9,119],[-4,116.1],[-2.9,110.2],[-0.5,109.1],[2,109.7],[3.1,113],[6.9,116.7],[5.4,119.2],[3.2,117.3],[2.3,118],[1.8,117.9]],
    [[70.7,57.5],[71.5,51.6],[75.1,55.6],[76.5,68.9],[74.3,58.5],[71.5,55.6],[70.7,57.5]],
    [[-13.6,50.1],[-24.9,47.1],[-25,44],[-16.2,44.4],[-12,49.2],[-12.9,49.8],[-13.6,50.1]],
    [[73.1,-114.2],[71.7,-108.2],[73.1,-108.4],[73.1,-106.5],[69.6,-101.1],[69.2,-116.1],[70,-117.3],[70.4,-112.4],[71.6,-119.4],[73.3,-115.2],[73.1,-114.2]],
    [[58.6,-3],[57.6,-4.1],[57.7,-2],[56,-3.1],[52.7,1.7],[51.3,1.4],[50,-5.2],[51.4,-3.4],[52,-5.3],[53.5,-4.6],[54,-2.9],[56.8,-6.1],[58.6,-4.2],[58.6,-3]],
    [[77.1,-94.7],[74.9,-79.8],[74.8,-92.4],[77.2,-96.7],[77.1,-94.7]],
    [[66.6,-175],[66,-169.9],[64.3,-173],[66.1,-178.7],[65,-180],[69,-180],[67.2,-174.9],[66.6,-175]],
    [[-40.9,173],[-41.3,174.2],[-43.9,173.1],[-46.6,169.3],[-46.2,166.7],[-40.5,172.8],[-40.9,173]],
    [[1.4,125.2],[0.2,120.2],[-1.4,120.9],[-0.6,123.3],[-1.9,121.5],[-5.3,123.2],[-2.6,121],[-5.4,119.4],[0.6,120],[1.6,125.1],[1.4,125.2]],
    [[-36.2,174.6],[-37.7,178.5],[-41.7,175.2],[-34.5,172.6],[-35.3,174.3],[-36.2,174.6]],
    [[71.4,-120.5],[71.9,-125.9],[73.7,-123.9],[74.3,-124.9],[74.4,-121.5],[73.5,-115.5],[71.8,-120.5],[71.4,-120.5]],
    [[79.7,18.3],[79,21.5],[76.8,15.9],[79.7,10.4],[80.1,17],[79.7,18.3]],
    [[22.8,-79.7],[20.3,-74.2],[19.9,-77.8],[22.6,-81.8],[21.9,-85],[23.1,-80.6],[22.8,-79.7]],
    [[-78,-45.2],[-80,-43.3],[-80.6,-54.2],[-77.8,-46.7],[-78,-45.2]],
    [[50.7,-56.1],[49.8,-56.8],[49.2,-53.5],[46.7,-53.1],[47.6,-59.3],[51.3,-55.6],[50.7,-56.1]],
    [[79.7,-87],[78.2,-90.8],[80.2,-96.7],[81.3,-92.4],[80.3,-87.8],[79.7,-87]],
    [[66.5,-14.5],[65.1,-13.6],[63.5,-18.7],[64,-22.8],[64.9,-24],[65.4,-22.2],[65.6,-24.3],[66.5,-16.2],[66.5,-14.5]],
    [[-53.8,-67.7],[-54.7,-65],[-55.5,-69.2],[-52.8,-74.7],[-54.1,-71.1],[-53.1,-68.2],[-53.8,-67.7]],
    [[-6.8,108.6],[-8.4,115.7],[-7.4,106.5],[-5.9,106.1],[-6.4,108.5],[-6.8,108.6]],
    [[76.2,-108.2],[76,-105.9],[75,-106.3],[75.2,-117.7],[76.5,-115.4],[75.5,-109.1],[76.4,-110.5],[76.7,-108.5],[76.2,-108.2]],
    [[50.7,143.6],[49,144.7],[49.3,143.2],[46.1,143.5],[46,142.1],[53.3,141.7],[54.4,142.7],[51.8,143.2],[50.7,143.6]],
    [[18.5,121.3],[17.1,122.5],[14.3,121.7],[12.5,124.1],[13.9,120.6],[18.5,120.7],[18.5,121.3]],
    [[-71,-68.5],[-72.5,-71.1],[-71.7,-75],[-71.2,-72.1],[-69,-71.2],[-70.5,-68.7],[-71,-68.5]],
    [[44.2,143.9],[43.3,145.5],[41.6,140],[45.6,142],[44.5,143.1],[44.2,143.9]],
    [[78.9,99.9],[80.3,91.2],[81.3,95.9],[79.8,100.2],[78.9,99.9]],
    [[8.4,126.4],[5.6,125.4],[7.8,123.6],[7.2,121.9],[9.8,125.4],[8.8,126.3],[8.4,126.4]],
    [[65.7,-85.2],[63.7,-80.1],[63.5,-87.2],[65.7,-85.9],[65.7,-85.2]],
    [[73.8,-100.4],[73.8,-97.4],[71.7,-96.7],[71.4,-99.3],[72.5,-102.5],[72.7,-100.4],[73.4,-101.5],[73.8,-100.4]],
    [[52.3,-6.8],[51.8,-10],[53.9,-9.7],[55.2,-6.7],[53.2,-6],[52.3,-6.8]],
    [[19.9,-72.6],[18.6,-68.3],[18,-73.9],[18.7,-72.3],[19.9,-73.2],[19.9,-72.6]],
    [[72.8,-93.2],[72.1,-95.4],[73.4,-96],[74.1,-92.4],[73.9,-90.5],[73,-92],[72.8,-93.2]],
    [[-40.8,145.4],[-40.9,148.3],[-43.2,147.9],[-43.5,146],[-40.7,144.7],[-40.8,145.4]],
    [[76.7,-98.5],[75,-98.2],[75.6,-102.5],[76.6,-98.6],[76.7,-98.5]],
    [[78.3,105.1],[77.9,99.4],[79.3,102.1],[78.7,105.4],[78.3,105.1]],
    [[6.2,81.2],[6.8,79.9],[9.8,80.1],[6.5,81.6],[6.2,81.2]],
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

    // Project + render the continent polygons each frame, clipped to the
    // visible front hemisphere. A naive "break the path at the horizon"
    // approach leaves each filled run to auto-close along a straight
    // chord, which carves big triangular wedges across the disc whenever
    // a continent (e.g. the Afro-Eurasia ring) straddles the limb. Instead
    // we clip each ring against the horizon circle properly: where the
    // coastline crosses the limb we drop a rim point, and we re-join an
    // exit to the next entry by walking the SHORT arc along the limb so
    // the fill hugs the sphere edge instead of cutting across it.
    var ARC_STEP = 0.18; // radians between inserted rim-arc samples

    function buildContinents() {
      CONTINENT_POINTS.forEach(function (ring, idx) {
        var n = ring.length;
        var P = new Array(n);
        var anyVis = false, anyHid = false;
        for (var i = 0; i < n; i++) {
          var p = project(ring[i][0], ring[i][1], rotDeg, tiltDeg);
          P[i] = p;
          if (p.z > 0) anyVis = true; else anyHid = true;
        }
        if (!anyVis) { continentPaths[idx].setAttribute('d', ''); return; }

        // Fully visible — straight closed polygon.
        if (!anyHid) {
          var df = 'M ' + (CX + P[0].x * R).toFixed(1) + ' ' + (CY + P[0].y * R).toFixed(1);
          for (var k = 1; k < n; k++) df += ' L ' + (CX + P[k].x * R).toFixed(1) + ' ' + (CY + P[k].y * R).toFixed(1);
          continentPaths[idx].setAttribute('d', df + ' Z');
          return;
        }

        // Rim crossing between a visible point A and hidden point B.
        // Interpolate the underlying unit vector (z→0), return its limb
        // angle. 3D vector for a projected point is (x, -y, z).
        function rimAngle(A, B) {
          var t = A.z / (A.z - B.z);
          var vx = A.x + (B.x - A.x) * t;
          var vy = (-A.y) + ((-B.y) - (-A.y)) * t;
          return Math.atan2(-vy, vx); // screen-space limb angle
        }
        function rimXY(ang) { return { x: CX + Math.cos(ang) * R, y: CY + Math.sin(ang) * R }; }

        // Walk the ring as a flat list of {x,y} (screen) and {ang} rim
        // markers, starting at an entry (hidden→visible) so runs line up.
        var start = 0;
        for (i = 0; i < n; i++) { if (P[i].z > 0 && P[(i - 1 + n) % n].z <= 0) { start = i; break; } }

        var seq = []; // {x,y} for vertices/rim points; rim points also carry .ang
        for (var s = 0; s < n; s++) {
          var ci = (start + s) % n;
          var cur = P[ci];
          var prev = P[(ci - 1 + n) % n];
          if (cur.z > 0 && prev.z > 0) {
            seq.push({ x: CX + cur.x * R, y: CY + cur.y * R });
          } else if (cur.z > 0 && prev.z <= 0) {
            var aEnter = rimAngle(cur, prev);
            var pe = rimXY(aEnter); pe.ang = aEnter; pe.rim = true;
            seq.push(pe);
            seq.push({ x: CX + cur.x * R, y: CY + cur.y * R });
          } else if (cur.z <= 0 && prev.z > 0) {
            var aExit = rimAngle(prev, cur);
            var px = rimXY(aExit); px.ang = aExit; px.rim = true;
            seq.push(px);
          }
          // both hidden → emit nothing
        }
        if (!seq.length) { continentPaths[idx].setAttribute('d', ''); return; }

        // Stitch: emit M/L through seq; between an exit-rim and the next
        // entry-rim (adjacent, cyclically) insert a short limb arc.
        var d = 'M ' + seq[0].x.toFixed(1) + ' ' + seq[0].y.toFixed(1);
        for (var j = 1; j <= seq.length; j++) {
          var prevPt = seq[j - 1];
          var pt = seq[j % seq.length];
          if (prevPt.rim && pt.rim) {
            // arc from prevPt.ang to pt.ang, short way
            var a0 = prevPt.ang, a1 = pt.ang;
            var delta = a1 - a0;
            while (delta > Math.PI) delta -= 2 * Math.PI;
            while (delta < -Math.PI) delta += 2 * Math.PI;
            var steps = Math.max(1, Math.ceil(Math.abs(delta) / ARC_STEP));
            for (var t2 = 1; t2 <= steps; t2++) {
              var a = a0 + delta * (t2 / steps);
              d += ' L ' + (CX + Math.cos(a) * R).toFixed(1) + ' ' + (CY + Math.sin(a) * R).toFixed(1);
            }
          } else if (j < seq.length) {
            d += ' L ' + pt.x.toFixed(1) + ' ' + pt.y.toFixed(1);
          }
        }
        continentPaths[idx].setAttribute('d', d + ' Z');
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

    // ── Visibility gates ──────────────────────────────────────────
    // 2026-05-27 perf pass: pause the rAF loop entirely when the host
    // scrolls offscreen or the tab goes hidden. The SVG-heavy redraw
    // (grid + continents + arc paths recomputed per frame) is not
    // cheap; running it for an offscreen disc burns CPU for no payoff.
    var offscreenPaused = false;
    var rafId = 0;
    if ('IntersectionObserver' in global) {
      try {
        var io = new IntersectionObserver(function (entries) {
          for (var i = 0; i < entries.length; i++) {
            var hit = entries[i].isIntersecting;
            if (hit) {
              offscreenPaused = false;
              if (!rafId && !stopped && !global.document.hidden) {
                lastFrame = performance.now();
                rafId = requestAnimationFrame(frame);
              }
            } else {
              offscreenPaused = true;
              if (rafId) { cancelAnimationFrame(rafId); rafId = 0; }
            }
          }
        }, { rootMargin: '120px', threshold: 0.01 });
        io.observe(container);
      } catch (e) {}
    }
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) {
        if (rafId) { cancelAnimationFrame(rafId); rafId = 0; }
      } else if (!offscreenPaused && !stopped && !rafId) {
        lastFrame = performance.now();
        rafId = requestAnimationFrame(frame);
      }
    });

    // ── Frame loop ───────────────────────────────────────────────
    function frame(now) {
      if (stopped || offscreenPaused || document.hidden) { rafId = 0; return; }
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
      rafId = requestAnimationFrame(frame);
    }

    return {
      stop: function () {
        stopped = true;
        if (rafId) { cancelAnimationFrame(rafId); rafId = 0; }
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
