/* build-continents.mjs
 *
 * Regenerates the CONTINENT_POINTS silhouette array in
 * app/js/global-debate-map.js (the SVG globe on /spar, /future,
 * /debate-chat).
 *
 * Source: Natural Earth 1:50m / 1:110m land polygons (public domain).
 * We rasterize the coastline rings, Douglas-Peucker simplify each to a
 * ~1° tolerance, drop the smallest islands, convert [lng,lat] →
 * [lat,lng] (the globe's projection order), and print a JS array literal
 * to paste back into global-debate-map.js.
 *
 * The 110m set gives clean, low-vertex silhouettes (good for a faint
 * background layer redrawn every animation frame); 50m is available if
 * more coastline fidelity is ever wanted. Continents render as filled
 * paths clipped to the visible hemisphere along the limb, so moderate
 * vertex counts read as recognizable shapes without the per-frame cost
 * of a full GeoJSON path.
 *
 * Usage:
 *   # fetch the source once (either resolution)
 *   curl -sL -o /tmp/ne_110m_land.json \
 *     https://raw.githubusercontent.com/martynafford/natural-earth-geojson/master/110m/physical/ne_110m_land.json
 *   node scripts/build-continents.mjs /tmp/ne_110m_land.json 1.0 8
 *     #                                <geojson>            <tol> <minBboxAreaDeg2>
 *
 * Then replace the CONTINENT_POINTS literal in
 * app/js/global-debate-map.js with the printed output.
 */
import fs from 'fs';

const SRC = process.argv[2] || '/tmp/ne_110m_land.json';
const TOL = parseFloat(process.argv[3] || '1.0');      // Douglas-Peucker tolerance (deg)
const MIN_AREA = parseFloat(process.argv[4] || '8');   // min bbox area (deg^2) to keep a ring

const geo = JSON.parse(fs.readFileSync(SRC, 'utf8'));

function perp(p, a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const len = Math.hypot(dx, dy) || 1e-9;
  return Math.abs((p[0] - a[0]) * dy - (p[1] - a[1]) * dx) / len;
}
function dp(points, tol) {
  if (points.length < 3) return points.slice();
  let dmax = 0, idx = 0;
  const a = points[0], b = points[points.length - 1];
  for (let i = 1; i < points.length - 1; i++) {
    const d = perp(points[i], a, b);
    if (d > dmax) { dmax = d; idx = i; }
  }
  if (dmax > tol) {
    const l = dp(points.slice(0, idx + 1), tol);
    const r = dp(points.slice(idx), tol);
    return l.slice(0, -1).concat(r);
  }
  return [a, b];
}

const rings = [];
function consider(ring) {
  let minX = 180, maxX = -180, minY = 90, maxY = -90;
  for (const [x, y] of ring) {
    if (x < minX) minX = x; if (x > maxX) maxX = x;
    if (y < minY) minY = y; if (y > maxY) maxY = y;
  }
  const area = (maxX - minX) * (maxY - minY);
  if (area < MIN_AREA) return;
  // Rings are CLOSED (first==last), which collapses DP's endpoint anchor.
  // Drop the duplicate, split at the vertex farthest from pt0, DP each
  // half, then re-close.
  let open = ring.slice();
  if (open.length > 1 && open[0][0] === open[open.length - 1][0] && open[0][1] === open[open.length - 1][1]) open.pop();
  if (open.length < 4) return;
  const p0 = open[0];
  let kIdx = 1, kMax = -1;
  for (let i = 1; i < open.length; i++) {
    const d = (open[i][0] - p0[0]) ** 2 + (open[i][1] - p0[1]) ** 2;
    if (d > kMax) { kMax = d; kIdx = i; }
  }
  const simp = dp(open.slice(0, kIdx + 1), TOL).slice(0, -1).concat(dp(open.slice(kIdx), TOL));
  if (simp.length < 4) return;
  if (simp[0][0] !== simp[simp.length - 1][0] || simp[0][1] !== simp[simp.length - 1][1]) simp.push(simp[0]);
  rings.push({ area, pts: simp });
}
for (const f of geo.features) {
  const g = f.geometry; if (!g) continue;
  if (g.type === 'Polygon') consider(g.coordinates[0]);
  else if (g.type === 'MultiPolygon') g.coordinates.forEach(p => consider(p[0]));
}

rings.sort((a, b) => b.area - a.area);
let total = 0;
const out = rings.map(r => {
  total += r.pts.length;
  return r.pts.map(([lng, lat]) => [Math.round(lat * 10) / 10, Math.round(lng * 10) / 10]);
});

process.stderr.write(`source=${SRC} tol=${TOL} minArea=${MIN_AREA} rings=${out.length} vertices=${total}\n`);

let js = '  var CONTINENT_POINTS = [\n';
for (const ring of out) js += '    ' + JSON.stringify(ring) + ',\n';
js += '  ];\n';
process.stdout.write(js);
