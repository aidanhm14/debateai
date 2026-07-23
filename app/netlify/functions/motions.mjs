// /motions{/slug?} — server-rendered motion prep sheets.
//
// Sister surface to /debate/{slug}, aimed at a different searcher. The
// dossiers at /debate answer consumer questions ("Should AI be
// regulated?") for readers who are not debaters. These pages hold real
// competitive motions in tournament phrasing and answer the question a
// debater types the night before a tournament: how do I run this, on
// either side?
//
// Content lives in lib/motion-library.mjs. This file only renders.
// Everything is in the initial HTML with no client hydration, because
// server-rendered content is the entire point of these URLs. No inline
// script at all; the page is fully usable with JS off.
//
// Routing (netlify.toml): /motions -> /api/motions,
//                         /motions/* -> /api/motions/:splat
//
// Visual register: the light editorial surface (warm paper, Fraunces
// headings, Inter body) shared with /debate and the /learn cluster.

import {
  getLibraryMotion,
  listLibraryMotions,
  listLibrarySlugs,
  FORMAT_LABELS,
  motionsByFormat,
} from './lib/motion-library.mjs';

const SITE_ORIGIN = 'https://itsdebatable.com';
const OG_IMAGE = `${SITE_ORIGIN}/og-image.png?v=floor1`;

const HTML_ESCAPE = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
function esc(s) {
  if (s === null || s === undefined) return '';
  return String(s).replace(/[&<>"']/g, c => HTML_ESCAPE[c]);
}
function jsonLd(obj) {
  return JSON.stringify(obj).replace(/</g, '\\u003c');
}

// Side labels differ by format and debaters notice when you get them
// wrong. The trainer itself only understands gov/opp, so the display
// label and the query param are deliberately separate.
const SIDE_LABELS = {
  apda:   ['Government', 'Opposition'],
  bp:     ['Proposition', 'Opposition'],
  asian:  ['Government', 'Opposition'],
  worlds: ['Proposition', 'Opposition'],
  ld:     ['Affirmative', 'Negative'],
  pf:     ['Pro', 'Con'],
  policy: ['Affirmative', 'Negative'],
};
function sideLabels(fmt) {
  return SIDE_LABELS[fmt] || ['Proposition', 'Opposition'];
}

const FORMAT_NAME = Object.fromEntries(FORMAT_LABELS);

// Hand off to the live voice round, prefilled so the user is one tap
// from Connect. Background carries the summary plus the central clash
// so the AI opens with the right framing instead of a cold read.
function trainerHref(m, side) {
  const parts = [];
  if (m.summary) parts.push(m.summary);
  if (m.clash && m.clash.question) parts.push(`The round turns on this: ${m.clash.question}`);
  const bg = parts.length ? `&background=${encodeURIComponent(parts.join(' '))}` : '';
  const s = side ? `&side=${side}` : '';
  return `/voice-debate?motion=${encodeURIComponent(m.motion)}${s}${bg}&handoff=motions`;
}

// Related slugs are authored freely, including forward references to
// motions not yet in the bank. Resolve to real entries only, then
// backfill from the same format so no page ships with a thin or empty
// related block. Dead internal links are worse than fewer links.
function relatedFor(m) {
  const have = new Set(listLibrarySlugs());
  const out = (m.related || []).filter(s => have.has(s) && s !== m.slug);
  if (out.length < 4) {
    const fill = motionsByFormat(m.format)
      .map(x => x.slug)
      .filter(s => s !== m.slug && !out.includes(s));
    for (const s of fill) {
      if (out.length >= 4) break;
      out.push(s);
    }
  }
  if (out.length < 4) {
    const any = listLibraryMotions()
      .map(x => x.slug)
      .filter(s => s !== m.slug && !out.includes(s));
    for (const s of any) {
      if (out.length >= 4) break;
      out.push(s);
    }
  }
  return out.slice(0, 4).map(s => getLibraryMotion(s)).filter(Boolean);
}

function extractFromUrl(url) {
  try {
    const u = new URL(url);
    const path = u.pathname.replace(/^\/api/, '');
    if (/^\/motions\/?$/i.test(path)) return { mode: 'hub' };
    const m = path.match(/^\/motions\/([a-z0-9-]+)\/?$/i);
    if (m) return { mode: 'motion', slug: m[1].toLowerCase() };
    return null;
  } catch { return null; }
}

function styles() {
  return `
  @import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600&display=swap');
  *{box-sizing:border-box;margin:0;padding:0}
  :root{
    --bg:#fbfaf7; --ink:#1b1b21; --dim:#5f5f6a; --ghost:#8c8c97;
    --pro:#15803d; --pro-soft:rgba(21,128,61,.08); --pro-line:rgba(21,128,61,.34);
    --con:#dc2626; --con-soft:rgba(220,38,38,.07); --con-line:rgba(220,38,38,.32);
    --card:#ffffff;
    --line:rgba(20,20,30,.10); --line-2:rgba(20,20,30,.17);
    --red:#dc2626;
    --serif:'Fraunces',Georgia,'Times New Roman',serif;
    --sans:'Inter',-apple-system,BlinkMacSystemFont,system-ui,sans-serif;
  }
  html{scroll-behavior:smooth}
  body{
    background:
      radial-gradient(1000px 560px at 15% -10%, rgba(120,140,200,.05), transparent 60%),
      radial-gradient(820px 460px at 90% 2%, rgba(220,38,38,.035), transparent 55%),
      var(--bg);
    background-attachment:fixed;
    color:var(--ink);
    font:17px/1.65 var(--sans);
    -webkit-font-smoothing:antialiased;-moz-osx-font-smoothing:grayscale;
    min-height:100vh;
  }
  em,i{font-style:normal}
  a{color:var(--red);text-decoration:none}
  a:hover{text-decoration:underline}
  .shell{max-width:1120px;margin:0 auto;padding:32px 36px 120px;position:relative;z-index:1}

  .topnav{display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:42px}
  .topnav .g{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
  .topnav a{display:inline-flex;align-items:center;gap:7px;font:700 13px/1 var(--sans);color:var(--dim);border:1px solid var(--line);background:var(--card);padding:9px 14px;border-radius:11px;transition:color .14s,border-color .14s,background .14s,transform .14s}
  .topnav a:hover{color:var(--ink);border-color:var(--line-2);background:rgba(20,20,30,.04);text-decoration:none;transform:translateY(-1px)}
  .topnav a.cta{color:#fff;border-color:transparent;background:linear-gradient(180deg,#ef4444,#dc2626);box-shadow:0 8px 20px -10px rgba(220,38,38,.6)}
  .topnav a.cta:hover{background:linear-gradient(180deg,#dc2626,#b91c1c)}

  .stamp{display:inline-flex;align-items:center;gap:8px;font:800 10.5px/1 var(--sans);letter-spacing:.18em;text-transform:uppercase;color:var(--dim);border:1px solid var(--line-2);border-radius:999px;padding:7px 13px}
  .stamp .dot{width:6px;height:6px;border-radius:50%;background:var(--red);box-shadow:0 0 8px var(--red)}

  /* hero */
  .hero{display:grid;grid-template-columns:minmax(0,1.15fr) 340px;gap:52px;align-items:start}
  .eye{color:var(--ghost);margin:20px 0 16px;font:800 12px/1.4 var(--sans);letter-spacing:.18em;text-transform:uppercase}
  .eye b{color:var(--red);font-weight:800}
  h1{font:500 clamp(30px,4.4vw,45px)/1.14 var(--serif);letter-spacing:-.015em;margin-bottom:18px;color:var(--ink)}
  .sub{font-size:18px;line-height:1.55;color:var(--dim);max-width:600px;margin-bottom:24px}
  .chips{display:flex;flex-wrap:wrap;gap:9px}
  .chip{display:inline-flex;flex-direction:column;gap:3px;border:1px solid var(--line);background:var(--card);border-radius:12px;padding:9px 13px;box-shadow:0 1px 2px rgba(20,20,30,.03)}
  .chip .k{font:800 9.5px/1 var(--sans);letter-spacing:.14em;text-transform:uppercase;color:var(--ghost)}
  .chip .v{font-size:13.5px;color:var(--ink);font-weight:600}

  .panel{position:sticky;top:22px;border:1px solid var(--line-2);border-radius:20px;padding:22px;
    background:linear-gradient(180deg,rgba(220,38,38,.05),#fff);
    box-shadow:0 24px 60px -32px rgba(20,20,30,.28)}
  .panel h3{font:500 19px/1.25 var(--serif);margin-bottom:4px}
  .panel .ps{font-size:13px;color:var(--dim);margin-bottom:16px}
  .btn{display:flex;align-items:center;justify-content:space-between;gap:10px;width:100%;border-radius:12px;padding:12px 15px;margin-bottom:9px;
    font:800 14px/1 var(--sans);border:1px solid var(--line-2);background:var(--card);color:var(--ink);transition:transform .12s,border-color .12s,background .12s}
  .btn:hover{text-decoration:none;transform:translateY(-1px)}
  .btn .arr{opacity:.5;font-weight:700}
  .btn-pro{border-color:var(--pro-line);background:var(--pro-soft);color:var(--pro)} .btn-pro:hover{border-color:var(--pro);background:rgba(21,128,61,.13)}
  .btn-con{border-color:var(--con-line);background:var(--con-soft);color:var(--con)} .btn-con:hover{border-color:var(--con);background:rgba(220,38,38,.12)}
  .btn-ghost{background:transparent;color:var(--dim)} .btn-ghost:hover{color:var(--ink)}
  .panel .fine{font-size:11.5px;color:var(--ghost);text-align:center;margin-top:11px}

  /* sections */
  .sec{margin-top:70px}
  .sec-eye{font:800 11px/1 var(--sans);letter-spacing:.2em;text-transform:uppercase;color:var(--ghost);display:flex;align-items:center;gap:14px;margin-bottom:20px}
  .sec-eye::after{content:"";flex:1;height:1px;background:linear-gradient(90deg,var(--line-2),transparent)}

  /* reading the motion */
  .read{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px}
  .rcard{border:1px solid var(--line);background:var(--card);border-radius:16px;padding:20px;box-shadow:0 1px 2px rgba(20,20,30,.03)}
  .rcard .rh{font:800 10.5px/1 var(--sans);letter-spacing:.15em;text-transform:uppercase;color:var(--red);margin-bottom:11px}
  .rcard p{font-size:15px;line-height:1.6;color:var(--ink)}

  /* case arena */
  .arena{display:grid;grid-template-columns:1fr 1fr;gap:26px;align-items:start}
  .side-head{display:flex;align-items:center;gap:10px;margin-bottom:12px}
  .side-tag{font:800 12px/1 var(--sans);letter-spacing:.14em;text-transform:uppercase;padding:7px 12px;border-radius:8px;color:#fff}
  .col-pro .side-tag{background:var(--pro)} .col-con .side-tag{background:var(--con)}
  .line{font-size:15px;line-height:1.55;color:var(--dim);margin-bottom:16px;padding-left:12px;border-left:2px solid var(--line-2)}
  .acard{border:1px solid var(--line);background:var(--card);border-radius:16px;padding:16px 17px;margin-bottom:13px;box-shadow:0 1px 2px rgba(20,20,30,.03);transition:transform .12s,border-color .12s,box-shadow .12s}
  .acard:hover{transform:translateY(-2px);box-shadow:0 18px 40px -28px rgba(20,20,30,.3)}
  .col-pro .acard{border-left:2px solid var(--pro-line)} .col-con .acard{border-left:2px solid var(--con-line)}
  .acard-h{font:800 13px/1.25 var(--sans);margin-bottom:11px;display:flex;align-items:baseline;gap:8px}
  .acard-h .n{font-size:11px;color:var(--ghost)}
  .col-pro .acard-h{color:var(--pro)} .col-con .acard-h{color:var(--con)}
  .row{display:grid;grid-template-columns:64px 1fr;gap:10px;padding:5px 0;font-size:14px;line-height:1.5}
  .row .t{font:800 9.5px/1.6 var(--sans);letter-spacing:.1em;text-transform:uppercase;color:var(--ghost);padding-top:2px}

  /* clash */
  .clash{border:1px solid var(--line-2);border-radius:22px;padding:28px 30px;background:var(--card);position:relative;overflow:hidden;box-shadow:0 16px 40px -30px rgba(20,20,30,.22)}
  .clash::before{content:"";position:absolute;left:50%;top:0;width:260px;height:1px;transform:translateX(-50%);background:linear-gradient(90deg,transparent,var(--red),transparent);opacity:.6}
  .clash-q{font:500 22px/1.35 var(--serif);text-align:center;max-width:720px;margin:6px auto 24px;color:var(--ink)}
  .poles{display:grid;grid-template-columns:1fr 1fr;gap:16px}
  .pole{border-radius:14px;padding:17px 19px;border:1px solid var(--line);font-size:14.5px;line-height:1.55}
  .pole.p{background:var(--pro-soft);border-color:var(--pro-line)}
  .pole.c{background:var(--con-soft);border-color:var(--con-line)}
  .pole .ph{font:800 11.5px/1 var(--sans);letter-spacing:.14em;text-transform:uppercase;margin-bottom:10px}
  .pole.p .ph{color:var(--pro)} .pole.c .ph{color:var(--con)}

  /* mistakes */
  .mist{display:grid;grid-template-columns:1fr 1fr;gap:20px}
  .mcard{border:1px solid var(--line);background:var(--card);border-radius:16px;padding:20px}
  .mcard .mh{font:800 11.5px/1 var(--sans);letter-spacing:.14em;text-transform:uppercase;margin-bottom:13px}
  .mcard.p .mh{color:var(--pro)} .mcard.c .mh{color:var(--con)}
  .mcard ul{list-style:none}
  .mcard li{position:relative;padding:7px 0 7px 20px;font-size:14.5px;line-height:1.55;border-bottom:1px solid var(--line)}
  .mcard li:last-child{border-bottom:0}
  .mcard li::before{content:"";position:absolute;left:0;top:15px;width:10px;height:1px;background:var(--line-2)}

  /* related + hub cards */
  .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:14px}
  .mcardlink{display:block;border:1px solid var(--line);background:var(--card);border-radius:16px;padding:18px 19px;color:var(--ink);box-shadow:0 1px 2px rgba(20,20,30,.03);transition:transform .13s,border-color .13s,box-shadow .13s}
  .mcardlink:hover{text-decoration:none;transform:translateY(-2px);border-color:var(--line-2);box-shadow:0 18px 40px -28px rgba(20,20,30,.3)}
  .mcardlink .mt{font:500 17px/1.32 var(--serif);margin-bottom:8px;color:var(--ink)}
  .mcardlink .md{font-size:13.5px;line-height:1.5;color:var(--dim);margin-bottom:11px}
  .mcardlink .mf{font:800 10px/1 var(--sans);letter-spacing:.13em;text-transform:uppercase;color:var(--ghost)}

  /* hub */
  .hub-h1{font:500 clamp(34px,5vw,50px)/1.06 var(--serif);letter-spacing:-.02em;margin:18px 0 14px}
  .hub-intro{font-size:18px;line-height:1.6;color:var(--dim);max-width:660px;margin-bottom:14px}
  .group-eye{font:800 11px/1 var(--sans);letter-spacing:.2em;text-transform:uppercase;color:var(--ghost);margin:54px 0 18px;display:flex;align-items:center;gap:14px}
  .group-eye::after{content:"";flex:1;height:1px;background:linear-gradient(90deg,var(--line-2),transparent)}

  .foot{margin-top:80px;padding-top:22px;border-top:1px solid var(--line);display:flex;justify-content:space-between;gap:14px;flex-wrap:wrap;font-size:13px;color:var(--ghost)}

  @media (max-width:1000px){
    .hero{grid-template-columns:1fr;gap:30px}
    .panel{position:static}
    .read{grid-template-columns:1fr}
  }
  @media (max-width:760px){
    .shell{padding:22px 18px 90px}
    .arena,.poles,.mist{grid-template-columns:1fr}
    .clash{padding:22px 18px}
  }
  `;
}

function topNav() {
  return `<nav class="topnav">
  <div class="g">
    <a href="/">Home</a>
    <a href="/motions">All motions</a>
    <a href="/learn">Learn</a>
    <a href="/debate">Dossiers</a>
  </div>
  <div class="g">
    <a class="cta" href="/debate-it">Start a round <span aria-hidden="true">&rarr;</span></a>
  </div>
</nav>`;
}

function argCard(a, n) {
  return `<article class="acard">
  <div class="acard-h"><span class="n">${n}</span> ${esc(a.title)}</div>
  <div class="row"><div class="t">Claim</div><div>${esc(a.claim)}</div></div>
  <div class="row"><div class="t">Warrant</div><div>${esc(a.warrant)}</div></div>
  <div class="row"><div class="t">Impact</div><div>${esc(a.impact)}</div></div>
</article>`;
}

function motionCard(m) {
  return `<a class="mcardlink" href="/motions/${esc(m.slug)}">
  <div class="mt">${esc(m.motion)}</div>
  <div class="md">${esc(m.summary)}</div>
  <div class="mf">${esc(FORMAT_NAME[m.format] || m.format)} &middot; ${esc(m.difficulty)}</div>
</a>`;
}

function shell({ title, description, canonical, ld, bodyInner }) {
  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${canonical}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${canonical}">
<meta property="og:type" content="article">
<meta property="og:image" content="${OG_IMAGE}">
<meta property="og:site_name" content="Debatable">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(description)}">
<meta name="theme-color" content="#fbfaf7">
<link rel="icon" href="/icons/icon-192.png">
<script defer src="/js/track.js"></script>
<script type="application/ld+json">${jsonLd(ld)}</script>
<style>${styles()}</style>
</head>
<body>
<main class="shell">
${topNav()}
${bodyInner}
<footer class="foot">
  <span>&copy; 2026 Debatable</span>
  <span><a href="/motions">All motions</a> &middot; <a href="/learn">Learn</a> &middot; <a href="/topics/">Format guides</a> &middot; <a href="/debate-it">Practice</a></span>
</footer>
</main>
</body></html>`;
}

function renderMotionPage(m) {
  const [propLabel, oppLabel] = sideLabels(m.format);
  const fmtName = FORMAT_NAME[m.format] || m.format;
  const canonical = `${SITE_ORIGIN}/motions/${m.slug}`;
  const title = `${m.motion} | Both sides, clash, and case prep`;
  const description = `${m.summary} ${propLabel} and ${oppLabel} cases with claim, warrant, and impact, the clash that decides the round, and the mistakes that lose it.`;
  const related = relatedFor(m);

  const ld = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Article',
        headline: m.motion,
        description: m.summary,
        about: `${fmtName} debate motion`,
        keywords: (m.keywords || []).join(', '),
        inLanguage: 'en',
        mainEntityOfPage: { '@type': 'WebPage', '@id': canonical },
        publisher: { '@type': 'Organization', name: 'Debatable', url: SITE_ORIGIN },
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Home', item: SITE_ORIGIN },
          { '@type': 'ListItem', position: 2, name: 'Motions', item: `${SITE_ORIGIN}/motions` },
          { '@type': 'ListItem', position: 3, name: m.motion, item: canonical },
        ],
      },
    ],
  };

  const bodyInner = `
<span class="stamp"><span class="dot"></span> Motion prep</span>

<section class="hero">
  <div>
    <div class="eye"><b>${esc(fmtName)}</b> &middot; ${esc(m.domain)} &middot; ${esc(m.difficulty)}</div>
    <h1>${esc(m.motion)}</h1>
    <p class="sub">${esc(m.summary)}</p>
    <div class="chips">
      <div class="chip"><span class="k">Runs in</span><span class="v">${esc(m.formats)}</span></div>
      <div class="chip"><span class="k">Difficulty</span><span class="v">${esc(m.difficulty)}</span></div>
      <div class="chip"><span class="k">Sides</span><span class="v">${esc(propLabel)} / ${esc(oppLabel)}</span></div>
    </div>
  </div>
  <aside class="panel">
    <h3>Run this motion</h3>
    <p class="ps">Live voice round against an AI opponent, then a judge ballot.</p>
    <a class="btn btn-pro" href="${trainerHref(m, 'gov')}">Take ${esc(propLabel)} <span class="arr">&rarr;</span></a>
    <a class="btn btn-con" href="${trainerHref(m, 'opp')}">Take ${esc(oppLabel)} <span class="arr">&rarr;</span></a>
    <a class="btn btn-ghost" href="/debate-it?motion=${encodeURIComponent(m.motion)}">Typed mode <span class="arr">&rarr;</span></a>
    <p class="fine">No card. Sign in to keep your record.</p>
  </aside>
</section>

<section class="sec">
  <div class="sec-eye">Reading the motion</div>
  <div class="read">
    <div class="rcard"><div class="rh">What it asks</div><p>${esc(m.reading.asks)}</p></div>
    <div class="rcard"><div class="rh">Who proves what</div><p>${esc(m.reading.burden)}</p></div>
    <div class="rcard"><div class="rh">Ground worth taking</div><p>${esc(m.reading.ground)}</p></div>
  </div>
</section>

<section class="sec">
  <div class="sec-eye">Both cases</div>
  <div class="arena">
    <div class="col-pro">
      <div class="side-head"><span class="side-tag">${esc(propLabel)}</span></div>
      <p class="line">${esc(m.prop.line)}</p>
      ${m.prop.args.map((a, i) => argCard(a, `0${i + 1}`)).join('')}
    </div>
    <div class="col-con">
      <div class="side-head"><span class="side-tag">${esc(oppLabel)}</span></div>
      <p class="line">${esc(m.opp.line)}</p>
      ${m.opp.args.map((a, i) => argCard(a, `0${i + 1}`)).join('')}
    </div>
  </div>
</section>

<section class="sec">
  <div class="sec-eye">The clash that decides it</div>
  <div class="clash">
    <p class="clash-q">${esc(m.clash.question)}</p>
    <div class="poles">
      <div class="pole p"><div class="ph">How ${esc(propLabel)} wins it</div>${esc(m.clash.prop)}</div>
      <div class="pole c"><div class="ph">How ${esc(oppLabel)} wins it</div>${esc(m.clash.opp)}</div>
    </div>
  </div>
</section>

<section class="sec">
  <div class="sec-eye">Where rounds go wrong</div>
  <div class="mist">
    <div class="mcard p">
      <div class="mh">${esc(propLabel)} mistakes</div>
      <ul>${m.mistakes.prop.map(x => `<li>${esc(x)}</li>`).join('')}</ul>
    </div>
    <div class="mcard c">
      <div class="mh">${esc(oppLabel)} mistakes</div>
      <ul>${m.mistakes.opp.map(x => `<li>${esc(x)}</li>`).join('')}</ul>
    </div>
  </div>
</section>

<section class="sec">
  <div class="sec-eye">Prep something next to it</div>
  <div class="grid">${related.map(motionCard).join('')}</div>
</section>
`;

  return shell({ title, description, canonical, ld, bodyInner });
}

function renderHubPage() {
  const all = listLibraryMotions();
  const canonical = `${SITE_ORIGIN}/motions`;
  const title = 'Debate motions with both cases | Motion library';
  const description = `Real competitive motions in tournament phrasing, each with both cases, the clash that decides the round, and the mistakes that lose it. ${all.length} motions across BP, APDA, Asian Parliamentary, World Schools, LD, PF, and Policy.`;

  const ld = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'CollectionPage',
        name: 'Debate motion library',
        description,
        url: canonical,
        inLanguage: 'en',
        publisher: { '@type': 'Organization', name: 'Debatable', url: SITE_ORIGIN },
      },
      {
        '@type': 'ItemList',
        numberOfItems: all.length,
        itemListElement: all.map((m, i) => ({
          '@type': 'ListItem',
          position: i + 1,
          name: m.motion,
          url: `${SITE_ORIGIN}/motions/${m.slug}`,
        })),
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Home', item: SITE_ORIGIN },
          { '@type': 'ListItem', position: 2, name: 'Motions', item: canonical },
        ],
      },
    ],
  };

  const groups = FORMAT_LABELS.map(([key, label]) => {
    const items = motionsByFormat(key);
    if (!items.length) return '';
    return `<div class="group-eye">${esc(label)} &middot; ${items.length}</div>
<div class="grid">${items.map(motionCard).join('')}</div>`;
  }).join('');

  const bodyInner = `
<span class="stamp"><span class="dot"></span> Motion library</span>
<h1 class="hub-h1">Every motion, both sides.</h1>
<p class="hub-intro">Real motions in the phrasing tournaments actually use. Each one carries what the motion is asking, the case on both sides with claim, warrant, and impact, the clash the round turns on, and the mistakes that lose it. Then you run it against an AI opponent and get a ballot.</p>
<p class="hub-intro">Looking for issue explainers instead of tournament motions? Those live at <a href="/debate">the dossiers</a>. Format rules and structure live under <a href="/learn">Learn</a>.</p>
${groups}
`;

  return shell({ title, description, canonical, ld, bodyInner });
}

function notFoundResponse() {
  const all = listLibraryMotions().slice(0, 12);
  const body = `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Motion not found | Debatable</title>
<meta name="robots" content="noindex">
<style>
  body{background:#fbfaf7;color:#1b1b21;font:17px/1.7 'Inter',-apple-system,BlinkMacSystemFont,system-ui,sans-serif;margin:0;padding:64px 24px;text-align:center}
  h1{font:500 32px/1.15 'Fraunces',Georgia,serif;margin-bottom:14px}
  a{color:#dc2626;text-decoration:none}
  a:hover{text-decoration:underline}
  .list{max-width:680px;margin:18px auto 0;line-height:2.1;text-align:left}
</style>
</head><body>
<h1>That motion is not on file.</h1>
<p>Open one of these instead.</p>
<div class="list">${all.map(m => `<a href="/motions/${m.slug}">${esc(m.motion)}</a><br>`).join('')}</div>
<p style="margin-top:28px"><a href="/motions">All motions &rarr;</a></p>
</body></html>`;
  return new Response(body, { status: 404, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}

export default async (request) => {
  const parsed = extractFromUrl(request.url);
  if (!parsed) return notFoundResponse();

  let html;
  if (parsed.mode === 'hub') {
    html = renderHubPage();
  } else {
    const m = getLibraryMotion(parsed.slug);
    if (!m) return notFoundResponse();
    html = renderMotionPage(m);
  }

  return new Response(html, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'public, max-age=86400, s-maxage=86400',
    },
  });
};

export const config = {
  path: ['/api/motions', '/api/motions/*'],
};
