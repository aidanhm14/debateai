// /programs{/state?} — server-rendered US debate-program directory.
//
// SEO cluster targeting "debate teams in {state}" / "{state} debate
// programs" queries that nobody serves well. Data is baked at build
// time from public Tabroom records (lib/programs-data.mjs) — school
// names, states, formats, activity only. No coach names, no emails,
// ZERO Firestore reads (fully static data, long edge cache).
//
// Register: light editorial (warm paper + Crimson Pro + red accent),
// matching the site's marketing surfaces, not the dark /debate dossiers.
// Content is fully server-rendered; no client JS required.
//
// Routing (netlify.toml): /programs -> /api/programs,
//                         /programs/* -> /api/programs/:splat.
// Sitemap: sitemap-programs.mjs emits the index + state URLs.

import { PROGRAMS, STATE_NAMES } from './lib/programs-data.mjs';

const SITE_ORIGIN = 'https://debateai.com';
const OG_IMAGE = `${SITE_ORIGIN}/og-image.png?v=cards6`;
const UPDATED = 'July 2026';

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ESC[c]);

function slugify(name) {
  return String(name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

// ── data views (computed once per cold start) ────────────────────────
const BY_STATE = new Map(); // st -> programs[]
for (const p of PROGRAMS) {
  if (!BY_STATE.has(p.st)) BY_STATE.set(p.st, []);
  BY_STATE.get(p.st).push(p);
}
for (const list of BY_STATE.values()) list.sort((a, b) => (b.act || 0) - (a.act || 0));

const SLUG_TO_ST = new Map(); // 'california' -> 'CA'
for (const [st, name] of Object.entries(STATE_NAMES)) {
  if (BY_STATE.has(st)) SLUG_TO_ST.set(slugify(name), st);
}
const STATES_SORTED = [...BY_STATE.keys()].sort((a, b) => BY_STATE.get(b).length - BY_STATE.get(a).length);
const TOTAL = PROGRAMS.length;

function topFormats(list, n = 3) {
  const c = {};
  for (const p of list) for (const f of p.fmts || []) c[f] = (c[f] || 0) + 1;
  return Object.entries(c).sort((a, b) => b[1] - a[1]).slice(0, n).map(([k]) => k);
}

// ── shared shell ─────────────────────────────────────────────────────
function shell({ title, desc, canonical, jsonLd, body }) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${canonical}">
<link rel="icon" href="/favicon.ico" sizes="any">
<meta property="og:type" content="website">
<meta property="og:url" content="${canonical}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:image" content="${OG_IMAGE}">
<meta name="twitter:card" content="summary_large_image">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Crimson+Pro:wght@400;500;600;700;800;900&display=swap">
${jsonLd ? `<script type="application/ld+json">${JSON.stringify(jsonLd)}</script>` : ''}
<style>
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
:root{--paper:#faf9f4;--card:#fff;--ink:#1d1915;--dim:rgba(29,25,21,.72);--ghost:rgba(29,25,21,.5);--line:rgba(29,25,21,.12);--red:#c0392b;--red-soft:rgba(192,57,43,.08)}
body{background:var(--paper);color:var(--ink);font-family:'Crimson Pro',Georgia,'Times New Roman',serif;line-height:1.55;-webkit-font-smoothing:antialiased}
a{color:inherit;text-decoration:none}
.topnav{display:flex;align-items:center;justify-content:space-between;padding:14px 22px;border-bottom:1px solid var(--line);background:rgba(250,249,244,.94);position:sticky;top:0;z-index:40;backdrop-filter:blur(8px)}
.topnav .brand{font-weight:900;font-size:1.05rem;letter-spacing:-.02em}
.topnav .brand em{color:var(--red);font-style:normal}
.topnav .links{display:flex;gap:18px;font-size:.85rem;font-weight:600;color:var(--dim)}
.topnav .links a:hover{color:var(--red)}
.wrap{max-width:1060px;margin:0 auto;padding:44px 22px 90px}
.crumb{font-size:.78rem;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:var(--red);margin-bottom:16px}
.crumb a{color:var(--red);border-bottom:1px solid rgba(192,57,43,.3)}
h1{font-size:clamp(2rem,5vw,3.1rem);font-weight:800;letter-spacing:-.028em;line-height:1.04;margin-bottom:16px;max-width:820px}
h1 em{color:var(--red);font-style:normal}
.lede{font-size:1.08rem;color:var(--dim);max-width:680px;margin-bottom:26px}
.lede a{color:var(--red);font-weight:600;border-bottom:1px solid rgba(192,57,43,.3)}
.cta-row{display:flex;gap:10px;flex-wrap:wrap;margin-bottom:40px}
.btn{display:inline-block;padding:11px 20px;border-radius:11px;font-size:.92rem;font-weight:700;border:1px solid var(--line);background:var(--card);transition:all .15s}
.btn:hover{border-color:var(--red);color:var(--red)}
.btn--primary{background:var(--red);border-color:transparent;color:#fff}
.btn--primary:hover{filter:brightness(1.08);color:#fff}
.state-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:12px}
.state-card{display:flex;align-items:baseline;justify-content:space-between;gap:10px;padding:16px 18px;background:var(--card);border:1px solid var(--line);border-radius:13px;transition:border-color .15s,transform .15s}
.state-card:hover{border-color:var(--red);transform:translateY(-2px)}
.state-card b{font-size:1.02rem;font-weight:700}
.state-card span{font-size:.85rem;color:var(--ghost);white-space:nowrap}
.plist{display:flex;flex-direction:column;gap:10px;margin-top:8px}
.prow{display:flex;align-items:center;gap:14px;padding:14px 18px;background:var(--card);border:1px solid var(--line);border-radius:13px}
.prow .pname{font-weight:700;font-size:1.02rem;flex:1;min-width:0}
.prow .pfmts{display:flex;gap:5px;flex-wrap:wrap}
.prow .pfmts span{font-size:.68rem;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:var(--red);background:var(--red-soft);border-radius:6px;padding:3px 8px}
.prow .pact{font-size:.8rem;color:var(--ghost);white-space:nowrap}
.sec-h{font-size:1.3rem;font-weight:800;letter-spacing:-.015em;margin:44px 0 14px}
.note{margin-top:44px;padding:18px 20px;background:var(--card);border:1px solid var(--line);border-radius:13px;font-size:.9rem;color:var(--dim);max-width:760px}
.note b{color:var(--ink)}
.note a{color:var(--red);font-weight:600;border-bottom:1px solid rgba(192,57,43,.3)}
footer{margin-top:70px;padding-top:22px;border-top:1px solid var(--line);display:flex;justify-content:space-between;flex-wrap:wrap;gap:12px;font-size:.82rem;color:var(--ghost)}
footer a{color:var(--ghost)} footer a:hover{color:var(--red)}
@media(max-width:640px){.prow{flex-wrap:wrap}.prow .pact{width:100%}}
</style>
</head>
<body>
<nav class="topnav">
  <a class="brand" href="/">Debate<em>It</em></a>
  <div class="links"><a href="/judge">AI Judge</a><a href="/coaches">Coaches</a><a href="/schools">For schools</a><a href="/spar">Debate live</a></div>
</nav>
<main class="wrap">
${body}
<footer>
  <span>Debatable · debateai.com</span>
  <span><a href="/programs">All states</a> · <a href="/schools">For schools</a> · <a href="/learn">Learn the formats</a></span>
</footer>
</main>
</body>
</html>`;
}

// ── index page ───────────────────────────────────────────────────────
function renderIndex() {
  const canonical = `${SITE_ORIGIN}/programs`;
  const stateCards = STATES_SORTED.map((st) => {
    const list = BY_STATE.get(st);
    const name = STATE_NAMES[st] || st;
    return `<a class="state-card" href="/programs/${slugify(name)}"><b>${esc(name)}</b><span>${list.length} program${list.length === 1 ? '' : 's'}</span></a>`;
  }).join('');

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: 'US High School Debate Programs by State',
    url: canonical,
    description: `A directory of ${TOTAL} active competitive debate programs across ${STATES_SORTED.length} US states, compiled from public tournament records.`,
    isPartOf: { '@type': 'WebSite', name: 'Debatable', url: SITE_ORIGIN },
  };

  const body = `
<div class="crumb">Debate Atlas</div>
<h1>Where debate <em>actually lives</em> in America.</h1>
<p class="lede">${TOTAL} active competitive debate programs across ${STATES_SORTED.length} states, mapped from public tournament records. Find the teams near you, see which formats they run, and if your school is not on the map yet, <a href="/schools">that is fixable</a>.</p>
<div class="cta-row">
  <a class="btn btn--primary" href="/schools">Start a program →</a>
  <a class="btn" href="/judge">Get an AI ballot on any round</a>
  <a class="btn" href="/coaches">Find a coach</a>
</div>
<h2 class="sec-h">Browse by state</h2>
<div class="state-grid">${stateCards}</div>
<div class="note">
  <b>About this data.</b> Compiled from public Tabroom.com tournament records (program names, formats, and activity), geocoded and refreshed ${UPDATED}. It is a sample of the active circuit, not a full census; the real footprint is larger. School names and locations only; no personal contact information is published. Missing or misplaced program? <a href="mailto:aidandavidhollinger@gmail.com">Tell us</a> and we will fix it.
</div>`;

  return shell({
    title: `US Debate Programs by State · ${TOTAL} Active Teams Mapped · Debatable`,
    desc: `A directory of ${TOTAL} active high school and college debate programs across ${STATES_SORTED.length} US states, compiled from public tournament records. Find debate teams near you.`,
    canonical,
    jsonLd,
    body,
  });
}

// ── state page ───────────────────────────────────────────────────────
function renderState(st) {
  const list = BY_STATE.get(st);
  const name = STATE_NAMES[st] || st;
  const slug = slugify(name);
  const canonical = `${SITE_ORIGIN}/programs/${slug}`;
  const fmts = topFormats(list);
  const active = list.filter((p) => (p.t || 0) >= 3).length;

  const rows = list.map((p) => {
    const chips = (p.fmts || []).slice(0, 5).map((f) => `<span>${esc(f)}</span>`).join('');
    const act = p.t ? `seen at ${p.t} tournament${p.t === 1 ? '' : 's'}` : 'on the circuit';
    return `<div class="prow"><div class="pname">${esc(p.n)}</div><div class="pfmts">${chips}</div><div class="pact">${act}</div></div>`;
  }).join('');

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: `Debate programs in ${name}`,
    url: canonical,
    numberOfItems: list.length,
    itemListElement: list.slice(0, 30).map((p, i) => ({
      '@type': 'ListItem', position: i + 1, name: p.n,
    })),
  };

  const body = `
<div class="crumb"><a href="/programs">Debate Atlas</a> · ${esc(name)}</div>
<h1>Debate teams in <em>${esc(name)}</em>.</h1>
<p class="lede">${list.length} competitive debate program${list.length === 1 ? '' : 's'} in ${esc(name)} appear in public tournament records${fmts.length ? `, with ${fmts.join(', ')} the most common format${fmts.length === 1 ? '' : 's'}` : ''}. ${active} ${active === 1 ? 'has' : 'have'} been seen at three or more tournaments. Every one of them practices against the same problem: rounds need opponents, judges, and prep partners that are hard to find outside tournament weekends.</p>
<div class="cta-row">
  <a class="btn btn--primary" href="/spar">Debate someone live →</a>
  <a class="btn" href="/judge">Free AI ballot on any round</a>
  <a class="btn" href="/schools">Bring Debatable to your school</a>
</div>
<h2 class="sec-h">The programs</h2>
<div class="plist">${rows}</div>
<div class="note">
  <b>About this list.</b> Public Tabroom.com tournament records, refreshed ${UPDATED}. A sample of the active circuit in ${esc(name)}, not a census. School and program names only; no personal information. Your program missing or misplaced? <a href="mailto:aidandavidhollinger@gmail.com">Tell us</a>. Coaching in ${esc(name)}? Add yourself to the <a href="/coaches">coach directory</a>.
</div>`;

  return shell({
    title: `Debate Teams in ${name} · ${list.length} Programs on the Circuit · Debatable`,
    desc: `${list.length} active competitive debate programs in ${name}, from public tournament records${fmts.length ? `. Most common formats: ${fmts.join(', ')}` : ''}. Find debate teams near you.`,
    canonical,
    jsonLd,
    body,
  });
}

// ── handler ──────────────────────────────────────────────────────────
export default async (request) => {
  const url = new URL(request.url);
  const path = url.pathname.replace(/^\/api\/programs/, '').replace(/^\/programs/, '').replace(/^\/+|\/+$/g, '');

  const headers = {
    'Content-Type': 'text/html; charset=utf-8',
    // static baked data: cache hard at the edge, revalidate daily
    'Cache-Control': 'public, max-age=3600, s-maxage=86400',
  };

  if (!path) return new Response(renderIndex(), { status: 200, headers });

  const st = SLUG_TO_ST.get(path.toLowerCase());
  if (st) return new Response(renderState(st), { status: 200, headers });

  return new Response(shell({
    title: 'State not found · Debatable',
    desc: 'That state page does not exist.',
    canonical: `${SITE_ORIGIN}/programs`,
    jsonLd: null,
    body: `<div class="crumb"><a href="/programs">Debate Atlas</a></div><h1>No page for that state.</h1><p class="lede">Browse every state with mapped programs on the <a href="/programs">Debate Atlas index</a>.</p>`,
  }), { status: 404, headers: { ...headers, 'Cache-Control': 'public, max-age=300' } });
};

export const config = {
  path: ['/api/programs', '/api/programs/*'],
};
