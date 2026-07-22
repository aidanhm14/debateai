// /learn/formats/{slug} — server-rendered format reference page.
//
// 9 pages, one per competitive debate format (APDA / BP / WSDC / Asian
// Parli / PF / LD / Policy / Congress / MUN). Each renders ~400-500
// words of body content drawn from lib/format-bank.mjs, plus speech
// structure, judging criteria, sample motions, what-wins / what-fails
// lists, and a "Try this format against the AI" CTA.
//
// SEO play: these are the long-tail entries for queries like
// "APDA debate format", "Public Forum structure", "Asian Parli rules".
// Each page carries Schema.org Course markup so Google can render
// rich snippets.
//
// Routing:
//   /learn/formats/{slug}    → rewritten by netlify.toml to here
//   /api/learn/formats/{slug} → direct function path

import { FORMAT_BANK, getFormat } from './lib/format-bank.mjs';
import { listGuides } from './lib/guide-bank.mjs';

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

function extractSlugFromUrl(url) {
  try {
    const u = new URL(url);
    const m = u.pathname.match(/\/learn\/formats\/([a-z]+)\/?$/i);
    return m ? m[1].toLowerCase() : null;
  } catch { return null; }
}

function notFoundResponse() {
  const body = `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Format not found · Debatable</title>
<meta name="robots" content="noindex">
<style>body{background:#000;color:#fff;font-family:system-ui,sans-serif;margin:0;padding:80px 24px;text-align:center}h1{font-size:2rem;margin-bottom:8px}p{color:rgba(255,255,255,.6);margin:0 0 20px}a{color:#ef4444;text-decoration:none;font-weight:700}</style>
</head><body>
<h1>Unknown debate format</h1>
<p>Try one of: ${Object.keys(FORMAT_BANK).map(s => `<a href="/learn/formats/${s}">${esc(FORMAT_BANK[s].name)}</a>`).join(' · ')}</p>
<p><a href="/debate-it">Or start a round →</a></p>
</body></html>`;
  return new Response(body, { status: 404, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}

function renderStructureTable(rows) {
  return `<table class="structure">
    <thead><tr><th>Speech</th><th>Time</th><th>Side</th></tr></thead>
    <tbody>${rows.map(r => `
      <tr>
        <td><span class="speech-code">${esc(r.code)}</span> ${esc(r.name)}</td>
        <td>${esc(r.time)}</td>
        <td>${esc(r.side)}</td>
      </tr>`).join('')}
    </tbody>
  </table>`;
}

function renderBulletList(items, className) {
  return `<ul class="${className || 'bullet-list'}">
    ${items.map(item => `<li>${esc(item)}</li>`).join('')}
  </ul>`;
}

function renderRelatedLinks(currentSlug) {
  const others = Object.values(FORMAT_BANK).filter(f => f.slug !== currentSlug).slice(0, 6);
  return others.map(f => `<a class="related-link" href="/learn/formats/${f.slug}">
    <div class="related-label">${esc(f.alias)}</div>
    <div class="related-name">${esc(f.name)}</div>
  </a>`).join('');
}

function renderFormatGuides(formatSlug) {
  // Guides whose `format` field matches this format slug. These catch
  // the question-style queries the format reference page itself can't
  // rank for ("how to open as PM" vs the generic "Asian Parli format").
  const guides = listGuides().filter(g => g.format === formatSlug);
  if (!guides.length) return '';
  return `<h2>Guides for this format</h2>
  <div class="related-grid">
    ${guides.map(g => `<a class="related-link" href="/learn/guides/${esc(g.slug)}">
      <div class="related-label">Guide · ${esc(g.readTime)}</div>
      <div class="related-name">${esc(g.question)}</div>
    </a>`).join('')}
  </div>`;
}

// Each format-bank slug maps to a hand-curated /topics/{slug} pillar page
// with substantially more content (FAQ schema, motion archive, Indian-circuit
// emphasis). Google was seeing two separate URLs targeting the same queries
// — both with self-canonicals — and splitting authority. By pointing the
// /learn/formats/ canonical at the corresponding /topics/ URL we consolidate
// SEO weight into the deeper page while keeping /learn/formats accessible
// as a tighter mechanics reference (and as the link target from /learn).
//
const TOPICS_CANONICAL = {
  apda: 'apda',
  bp: 'british-parliamentary',
  worlds: 'world-schools',
  asian: 'asian-parliamentary',
  pf: 'public-forum',
  ld: 'lincoln-douglas',
  policy: 'policy',
  congress: 'congress',
  mun: 'mun',
};

function renderPage(format) {
  const titleCore = `${format.name} debate format · Structure, judging, sample motions`;
  const title = titleCore.length > 65
    ? titleCore.slice(0, 62).replace(/\s+\S*$/, '') + '…'
    : titleCore;
  const description = `${format.name} (${format.alias}): ${format.pitch} Speech structure, judging criteria, sample motions, what wins and what fails.`;
  const topicsSlug = TOPICS_CANONICAL[format.slug];
  const canonical = topicsSlug
    ? `${SITE_ORIGIN}/topics/${topicsSlug}`
    : `${SITE_ORIGIN}/learn/formats/${format.slug}`;

  const ldCourse = {
    '@context': 'https://schema.org',
    '@type': 'Course',
    name: `${format.name} (${format.alias}) Debate Format`,
    description,
    provider: {
      '@type': 'Organization',
      name: 'Debatable',
      url: SITE_ORIGIN,
    },
    educationalLevel: 'High school / College',
    keywords: format.keywords.join(', '),
    inLanguage: 'en',
  };

  const motionEncoded = encodeURIComponent(format.sampleMotions[0] || '');

  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<meta name="keywords" content="${esc(format.keywords.join(', '))}">
<link rel="canonical" href="${canonical}">
<meta property="og:title" content="${esc(titleCore)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${canonical}">
<meta property="og:type" content="article">
<meta property="og:image" content="${OG_IMAGE}">
<meta property="og:site_name" content="Debatable">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(titleCore)}">
<meta name="twitter:description" content="${esc(description)}">
<meta name="twitter:image" content="${OG_IMAGE}">
<link rel="icon" href="/icons/icon-192.png">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&family=Playfair+Display:ital,wght@1,700;1,900&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/css/ui.css">
<script defer src="/js/track.js"></script><script defer src="/js/home-magnet.js"></script>
<script type="application/ld+json">${jsonLd(ldCourse)}</script>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{background:#000;color:#fff;font-family:'Inter',system-ui,-apple-system,sans-serif;line-height:1.6;-webkit-font-smoothing:antialiased}
  a{color:inherit;text-decoration:none}
  .shell{max-width:820px;margin:0 auto;padding:90px 24px 80px}
  .eyebrow{display:inline-block;font-size:.7rem;font-weight:800;letter-spacing:.16em;text-transform:uppercase;color:#fbbf24;padding:5px 14px;border-radius:999px;background:rgba(251,191,36,.08);border:1px solid rgba(251,191,36,.32);margin-bottom:14px}
  h1{font-family:'Playfair Display',serif;font-style:italic;font-weight:900;font-size:clamp(2rem,5vw,3.4rem);line-height:1.05;letter-spacing:-.02em;margin-bottom:14px;color:#fff}
  .alias{font-family:'Inter',sans-serif;font-style:normal;font-weight:900;color:#ef4444;font-size:.6em;margin-left:8px;vertical-align:middle}
  .pitch{font-size:1.1rem;color:rgba(255,255,255,.78);line-height:1.55;margin:0 0 36px;max-width:680px}
  h2{font-size:.75rem;font-weight:800;letter-spacing:.16em;text-transform:uppercase;color:rgba(255,255,255,.55);margin:42px 0 14px}
  .summary-grafs p{font-size:.98rem;color:rgba(255,255,255,.82);line-height:1.7;margin:0 0 14px}
  .summary-grafs p:last-child{margin-bottom:0}
  table.structure{width:100%;border-collapse:collapse;margin:0;font-size:.88rem}
  table.structure th{text-align:left;font-size:.62rem;font-weight:800;letter-spacing:.14em;text-transform:uppercase;color:rgba(255,255,255,.5);padding:8px 12px;border-bottom:1px solid rgba(255,255,255,.12)}
  table.structure td{padding:10px 12px;border-bottom:1px solid rgba(255,255,255,.06);color:rgba(255,255,255,.85)}
  table.structure td:first-child{font-weight:600}
  .speech-code{display:inline-block;font-size:.62rem;font-weight:800;letter-spacing:.06em;padding:2px 7px;border-radius:6px;background:rgba(239,68,68,.1);color:#fca5a5;border:1px solid rgba(239,68,68,.28);margin-right:8px;font-family:'Inter',monospace}
  ul.bullet-list,ul.motion-list,ul.tip-list{padding-left:18px;margin:0}
  ul.bullet-list li,ul.motion-list li,ul.tip-list li{font-size:.92rem;color:rgba(255,255,255,.85);line-height:1.6;margin-bottom:8px}
  ul.tip-list.wins li::marker{color:#22c55e}
  ul.tip-list.fails li::marker{color:#ef4444}
  .cta-card{padding:28px;border-radius:16px;border:1px solid rgba(239,68,68,.32);background:linear-gradient(135deg,rgba(239,68,68,.10),rgba(245,158,11,.04));text-align:center;margin:48px 0 36px}
  .cta-card h3{font-family:'Inter',sans-serif;font-style:normal;font-size:1.25rem;font-weight:900;letter-spacing:-.01em;margin-bottom:8px}
  .cta-card p{font-size:.92rem;color:rgba(255,255,255,.68);margin-bottom:18px;max-width:520px;margin-left:auto;margin-right:auto}
  .cta-button{display:inline-flex;align-items:center;gap:8px;padding:13px 24px;border-radius:999px;background:#ef4444;color:#fff;font-weight:800;letter-spacing:.02em;font-size:.95rem;box-shadow:0 10px 30px -8px rgba(239,68,68,.5);transition:transform .15s,box-shadow .15s}
  .cta-button:hover{transform:translateY(-1px);box-shadow:0 14px 34px -8px rgba(239,68,68,.7)}
  .related-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:10px;margin-top:14px}
  .related-link{padding:12px 14px;border-radius:10px;border:1px solid rgba(255,255,255,.08);background:rgba(255,255,255,.02);transition:.15s}
  .related-link:hover{border-color:rgba(239,68,68,.32);background:rgba(239,68,68,.04)}
  .related-label{font-size:.62rem;font-weight:800;letter-spacing:.14em;text-transform:uppercase;color:#fca5a5;margin-bottom:3px}
  .related-name{font-size:.86rem;color:rgba(255,255,255,.85);line-height:1.4}
  .deep-dive{font-size:.95rem;color:rgba(255,255,255,.72);margin:22px 0 0;line-height:1.6}
  .deep-dive a{color:#fca5a5;border-bottom:1px solid rgba(239,68,68,.35);transition:.15s}
  .deep-dive a:hover{color:#fff;border-bottom-color:#fff}
  footer{margin-top:60px;padding-top:24px;border-top:1px solid rgba(255,255,255,.06);display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px;font-size:.75rem;color:rgba(255,255,255,.4)}
  footer a:hover{color:#fff}
</style>
</head>
<body>
<div id="daTopbar"></div>
<script defer src="/js/topbar.js"></script>

<main class="shell">
  <span class="eyebrow">Debate format · Reference</span>
  <h1>${esc(format.name)} <span class="alias">${esc(format.alias)}</span></h1>
  <p class="pitch">${esc(format.pitch)}</p>

  <section class="summary-grafs">
    ${format.summary.map(p => `<p>${esc(p)}</p>`).join('\n    ')}
  </section>

  <h2>Speech structure</h2>
  ${renderStructureTable(format.structure)}

  <h2>How judges score it</h2>
  ${renderBulletList(format.judging, 'bullet-list')}

  <h2>What wins this format</h2>
  <ul class="tip-list wins">${format.thingsThatWin.map(item => `<li>${esc(item)}</li>`).join('')}</ul>

  <h2>What loses this format</h2>
  <ul class="tip-list fails">${format.thingsToAvoid.map(item => `<li>${esc(item)}</li>`).join('')}</ul>

  <h2>Sample motions</h2>
  <ul class="motion-list">${format.sampleMotions.map(m => `<li>${esc(m)}</li>`).join('')}</ul>

  ${topicsSlug ? `<p class="deep-dive">Want the full ${esc(format.alias)} motion archive, strategy notes, and FAQ? Read the <a href="/topics/${topicsSlug}">${esc(format.name)} topic guide</a>.</p>` : ''}

  ${renderFormatGuides(format.slug)}

  <div class="cta-card">
    <h3>Try a ${esc(format.alias)} round against the AI.</h3>
    <p>The AI knows the structure, the judging criteria, and the moves that win this format specifically. Pick a side, give a speech, get a judge ballot.</p>
    <a class="cta-button" href="/debate-it?format=${esc(format.slug)}&motion=${motionEncoded}">Start a ${esc(format.alias)} round →</a>
  </div>

  <h2>Other formats</h2>
  <div class="related-grid">
    ${renderRelatedLinks(format.slug)}
  </div>

  <footer>
    <span>© 2026 Debatable</span>
    <span><a href="/">Home</a> · <a href="/debate-it">New round</a> · <a href="/today">Today's motion</a></span>
  </footer>
</main>
</body></html>`;
}

export default async (request) => {
  const slug = extractSlugFromUrl(request.url);
  if (!slug) return notFoundResponse();
  const format = getFormat(slug);
  if (!format) return notFoundResponse();

  const html = renderPage(format);
  return new Response(html, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      // 1-day edge cache. Content is fully static per slug; only changes
      // when we update format-bank.mjs and redeploy.
      'Cache-Control': 'public, max-age=86400, s-maxage=86400',
    },
  });
};

export const config = {
  // Wildcard then URL-parse the slug from request.url. Netlify v2's
  // :param syntax has been flaky for deep paths in this codebase
  // (4 segments: /api + /learn + /formats + /{slug}); the wildcard
  // path is well-trodden by today.mjs and r.mjs so this pattern is
  // proven to deploy.
  path: '/api/learn/formats/*',
};
