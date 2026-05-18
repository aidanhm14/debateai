// /learn/guides{/slug?} — server-rendered long-tail guide pages.
//
// Catches the question-style queries debaters actually type:
//   "how to open as PM in Asian Parliamentary"
//   "WSDC reply speech structure"
//   "PF crossfire questions to ask"
//   "how to take a POI in BP"
//   "viva exam questions to expect"
//
// /learn/formats/{slug} pages already cover generic format queries
// ("APDA debate format"); these guides target the specific question
// queries which carry higher commercial intent and lower competition.
//
// Routing:
//   /learn/guides              → hub page, lists all guides
//   /learn/guides/{slug}       → individual guide
// Both rewrite to /api/learn/guides/* via netlify.toml.

import { GUIDE_BANK, getGuide, listGuides } from './lib/guide-bank.mjs';
import { FORMAT_BANK } from './lib/format-bank.mjs';

const SITE_ORIGIN = 'https://debateai.com';
const OG_IMAGE = `${SITE_ORIGIN}/og-image.png`;

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
    // Strip /api prefix if present, then match /learn/guides[/slug]
    const path = u.pathname.replace(/^\/api/, '');
    const hub = path.match(/^\/learn\/guides\/?$/i);
    if (hub) return { mode: 'hub' };
    const m = path.match(/^\/learn\/guides\/([a-z0-9-]+)\/?$/i);
    if (m) return { mode: 'guide', slug: m[1].toLowerCase() };
    return null;
  } catch { return null; }
}

function notFoundResponse() {
  const guides = listGuides();
  const body = `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Guide not found · Debate AI</title>
<meta name="robots" content="noindex">
<style>body{background:#000;color:#fff;font-family:system-ui,sans-serif;margin:0;padding:80px 24px;text-align:center;line-height:1.6}h1{font-size:2rem;margin-bottom:16px}p{color:rgba(255,255,255,.6);margin:0 auto 12px;max-width:560px}a{color:#ef4444;text-decoration:none;font-weight:700}a:hover{text-decoration:underline}</style>
</head><body>
<h1>Unknown guide</h1>
<p>Try one of: ${guides.map(g => `<a href="/learn/guides/${g.slug}">${esc(g.question)}</a>`).join(' · ')}</p>
<p><a href="/learn/guides">Or browse all guides →</a></p>
</body></html>`;
  return new Response(body, { status: 404, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}

function renderTakeaways(items) {
  return `<ul class="takeaway-list">
    ${items.map(item => `<li>${esc(item)}</li>`).join('')}
  </ul>`;
}

function renderSection(section) {
  return `<section class="guide-section">
    <h2>${esc(section.heading)}</h2>
    ${section.body.map(p => `<p>${esc(p)}</p>`).join('\n    ')}
  </section>`;
}

function renderExamples(examples) {
  if (!examples || !examples.length) return '';
  return `<section class="examples">
    <h2>Sample lines</h2>
    ${examples.map(ex => `
      <div class="example">
        <div class="ex-context">${esc(ex.context)}</div>
        <div class="ex-line">${esc(ex.line)}</div>
        <div class="ex-why">${esc(ex.why)}</div>
      </div>`).join('')}
  </section>`;
}

function renderRelated(currentSlug, relatedSlugs) {
  const related = (relatedSlugs || [])
    .map(slug => GUIDE_BANK[slug])
    .filter(g => g && g.slug !== currentSlug);
  if (!related.length) return '';
  return `<section class="related">
    <h2>Related guides</h2>
    <div class="related-grid">
      ${related.map(g => `<a class="related-link" href="/learn/guides/${g.slug}">
        <div class="related-label">${esc(g.formatName)}</div>
        <div class="related-name">${esc(g.question)}</div>
      </a>`).join('')}
    </div>
  </section>`;
}

function commonStyles() {
  return `
  *{box-sizing:border-box;margin:0;padding:0}
  body{background:#000;color:#fff;font-family:'Inter',system-ui,-apple-system,sans-serif;line-height:1.6;-webkit-font-smoothing:antialiased}
  a{color:inherit;text-decoration:none}
  .shell{max-width:820px;margin:0 auto;padding:90px 24px 80px}
  .eyebrow{display:inline-block;font-size:.7rem;font-weight:800;letter-spacing:.16em;text-transform:uppercase;color:#fbbf24;padding:5px 14px;border-radius:999px;background:rgba(251,191,36,.08);border:1px solid rgba(251,191,36,.32);margin-bottom:14px}
  h1{font-family:'Playfair Display',serif;font-style:italic;font-weight:900;font-size:clamp(1.9rem,4.4vw,3rem);line-height:1.08;letter-spacing:-.02em;margin-bottom:14px;color:#fff}
  .hook{font-size:1.1rem;color:rgba(255,255,255,.78);line-height:1.55;margin:0 0 28px;max-width:680px}
  .meta-row{display:flex;gap:14px;font-size:.72rem;font-weight:600;color:rgba(255,255,255,.5);letter-spacing:.08em;text-transform:uppercase;margin-bottom:36px}
  .meta-row .format-pill{padding:4px 11px;border-radius:999px;background:rgba(239,68,68,.08);border:1px solid rgba(239,68,68,.32);color:#fca5a5;text-transform:none;letter-spacing:0;font-weight:700;font-size:.75rem}
  .takeaways-block{padding:22px 24px;border-radius:14px;background:linear-gradient(180deg,rgba(34,197,94,.06),rgba(34,197,94,.02));border:1px solid rgba(34,197,94,.22);margin:0 0 40px}
  .takeaways-block .tk-head{font-size:.65rem;font-weight:800;letter-spacing:.18em;text-transform:uppercase;color:#86efac;margin-bottom:10px}
  ul.takeaway-list{padding-left:18px;margin:0}
  ul.takeaway-list li{font-size:.95rem;color:rgba(255,255,255,.85);line-height:1.55;margin-bottom:6px}
  ul.takeaway-list li:last-child{margin-bottom:0}
  ul.takeaway-list li::marker{color:#22c55e}
  h2{font-size:.78rem;font-weight:800;letter-spacing:.14em;text-transform:uppercase;color:rgba(255,255,255,.55);margin:38px 0 14px}
  .guide-section p{font-size:.98rem;color:rgba(255,255,255,.84);line-height:1.72;margin:0 0 14px}
  .guide-section p:last-child{margin-bottom:0}
  .examples{margin-top:36px}
  .example{padding:18px 22px;border-radius:12px;background:rgba(255,255,255,.025);border:1px solid rgba(255,255,255,.08);margin-bottom:14px}
  .ex-context{font-size:.7rem;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:rgba(255,255,255,.5);margin-bottom:8px}
  .ex-line{font-style:italic;color:#fff;line-height:1.55;font-size:.98rem;margin-bottom:10px;border-left:2px solid #ef4444;padding-left:14px}
  .ex-why{font-size:.86rem;color:rgba(255,255,255,.66);line-height:1.5}
  .cta-card{padding:28px;border-radius:16px;border:1px solid rgba(239,68,68,.32);background:linear-gradient(135deg,rgba(239,68,68,.10),rgba(245,158,11,.04));text-align:center;margin:48px 0 36px}
  .cta-card h3{font-family:'Inter',sans-serif;font-style:normal;font-size:1.2rem;font-weight:900;letter-spacing:-.01em;margin-bottom:8px}
  .cta-card p{font-size:.92rem;color:rgba(255,255,255,.68);margin-bottom:18px;max-width:520px;margin-left:auto;margin-right:auto}
  .cta-button{display:inline-flex;align-items:center;gap:8px;padding:13px 24px;border-radius:999px;background:#ef4444;color:#fff;font-weight:800;letter-spacing:.02em;font-size:.95rem;box-shadow:0 10px 30px -8px rgba(239,68,68,.5);transition:transform .15s,box-shadow .15s}
  .cta-button:hover{transform:translateY(-1px);box-shadow:0 14px 34px -8px rgba(239,68,68,.7)}
  .related-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:10px;margin-top:14px}
  .related-link{padding:14px 16px;border-radius:10px;border:1px solid rgba(255,255,255,.08);background:rgba(255,255,255,.02);transition:.15s}
  .related-link:hover{border-color:rgba(239,68,68,.32);background:rgba(239,68,68,.04)}
  .related-label{font-size:.62rem;font-weight:800;letter-spacing:.14em;text-transform:uppercase;color:#fca5a5;margin-bottom:4px}
  .related-name{font-size:.9rem;color:rgba(255,255,255,.88);line-height:1.4}
  footer{margin-top:60px;padding-top:24px;border-top:1px solid rgba(255,255,255,.06);display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px;font-size:.75rem;color:rgba(255,255,255,.4)}
  footer a:hover{color:#fff}
  `;
}

function renderGuidePage(guide) {
  const titleCore = `${guide.question} · Debate AI`;
  const title = titleCore.length > 65 ? titleCore.slice(0, 62) + '…' : titleCore;
  const description = guide.hook;
  const canonical = `${SITE_ORIGIN}/learn/guides/${guide.slug}`;

  const ldArticle = {
    '@context': 'https://schema.org',
    '@type': 'HowTo',
    name: guide.question,
    description: guide.hook,
    totalTime: `PT${(guide.readTime || '5 min').replace(/\D/g, '')}M`,
    step: guide.sections.map((s, i) => ({
      '@type': 'HowToStep',
      position: i + 1,
      name: s.heading,
      text: s.body.join(' '),
    })),
    keywords: guide.keywords.join(', '),
    inLanguage: 'en',
    publisher: {
      '@type': 'Organization',
      name: 'Debate AI',
      url: SITE_ORIGIN,
    },
  };

  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<meta name="keywords" content="${esc(guide.keywords.join(', '))}">
<link rel="canonical" href="${canonical}">
<meta property="og:title" content="${esc(titleCore)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${canonical}">
<meta property="og:type" content="article">
<meta property="og:image" content="${OG_IMAGE}">
<meta property="og:site_name" content="Debate AI">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(titleCore)}">
<meta name="twitter:description" content="${esc(description)}">
<meta name="twitter:image" content="${OG_IMAGE}">
<link rel="icon" href="/icons/icon-192.png">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&family=Playfair+Display:ital,wght@1,700;1,900&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/css/ui.css">
<script defer src="/js/track.js"></script>
<script type="application/ld+json">${jsonLd(ldArticle)}</script>
<style>${commonStyles()}</style>
</head>
<body>
<div id="daTopbar"></div>
<script defer src="/js/topbar.js"></script>

<main class="shell">
  <span class="eyebrow">Guide · ${esc(guide.formatName)}</span>
  <h1>${esc(guide.question)}</h1>
  <p class="hook">${esc(guide.hook)}</p>
  <div class="meta-row">
    <span class="format-pill">${FORMAT_BANK[guide.format]
      ? `<a href="/learn/formats/${esc(guide.format)}">${esc(guide.formatName)}</a>`
      : esc(guide.formatName)}</span>
    <span>${esc(guide.readTime)} read</span>
  </div>

  <div class="takeaways-block">
    <div class="tk-head">Quick takeaways</div>
    ${renderTakeaways(guide.takeaways)}
  </div>

  ${guide.sections.map(renderSection).join('\n  ')}

  ${renderExamples(guide.examples)}

  <div class="cta-card">
    <h3>${esc(guide.ctaLabel)} against the AI.</h3>
    <p>The AI knows the format, the structure, and the moves that win. Drop in and try the round.</p>
    <a class="cta-button" href="${esc(guide.ctaHref)}">${esc(guide.ctaLabel)} →</a>
  </div>

  ${renderRelated(guide.slug, guide.related)}

  <footer>
    <span>© 2026 Debate AI</span>
    <span><a href="/learn/guides">All guides</a> · <a href="/learn">Learn hub</a> · <a href="/debate-ai">New round</a></span>
  </footer>
</main>
</body></html>`;
}

function renderHubPage() {
  const guides = listGuides();
  const title = 'Debate guides · Format-specific tactics, drills, and scripts · Debate AI';
  const description = "Short, format-accurate guides on the moves that actually win debate rounds. Asian Parli PMC openings, WSDC reply speeches, PF crossfire, BP POIs, viva oral exams.";
  const canonical = `${SITE_ORIGIN}/learn/guides`;

  const ldCollection = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: 'Debate guides',
    description,
    url: canonical,
    hasPart: guides.map(g => ({
      '@type': 'Article',
      name: g.question,
      url: `${SITE_ORIGIN}/learn/guides/${g.slug}`,
      description: g.hook,
    })),
  };

  // Group guides by formatName for sectioned display.
  const byFormat = {};
  guides.forEach(g => {
    if (!byFormat[g.formatName]) byFormat[g.formatName] = [];
    byFormat[g.formatName].push(g);
  });

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
<meta property="og:type" content="website">
<meta property="og:image" content="${OG_IMAGE}">
<meta property="og:site_name" content="Debate AI">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(description)}">
<meta name="twitter:image" content="${OG_IMAGE}">
<link rel="icon" href="/icons/icon-192.png">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&family=Playfair+Display:ital,wght@1,700;1,900&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/css/ui.css">
<script defer src="/js/track.js"></script>
<script type="application/ld+json">${jsonLd(ldCollection)}</script>
<style>
${commonStyles()}
  .hub-h1{font-size:clamp(2.1rem,5vw,3.2rem)}
  .hub-intro{font-size:1.05rem;color:rgba(255,255,255,.72);margin-bottom:48px;max-width:640px}
  .hub-group{margin-bottom:34px}
  .hub-group-head{display:flex;align-items:baseline;gap:12px;margin-bottom:14px}
  .hub-group-head h2{margin:0;padding:0;font-family:'Inter',sans-serif;font-style:normal;font-size:.78rem;font-weight:800;letter-spacing:.14em;text-transform:uppercase;color:#fca5a5}
  .hub-group-head a{font-size:.74rem;color:rgba(255,255,255,.45);font-weight:600}
  .hub-group-head a:hover{color:#fff}
  .hub-grid{display:grid;grid-template-columns:1fr;gap:8px}
  .hub-card{display:block;padding:18px 22px;border-radius:12px;border:1px solid rgba(255,255,255,.08);background:rgba(255,255,255,.02);transition:.15s}
  .hub-card:hover{border-color:rgba(239,68,68,.32);background:rgba(239,68,68,.05);transform:translateY(-1px)}
  .hub-card .q{font-size:1.05rem;font-weight:700;color:#fff;margin-bottom:6px;line-height:1.35}
  .hub-card .h{font-size:.88rem;color:rgba(255,255,255,.62);line-height:1.5}
  .hub-card .read{display:inline-block;margin-top:8px;font-size:.7rem;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:rgba(255,255,255,.4)}
  @media (min-width:680px){ .hub-grid{grid-template-columns:1fr 1fr} }
</style>
</head>
<body>
<div id="daTopbar"></div>
<script defer src="/js/topbar.js"></script>

<main class="shell">
  <span class="eyebrow">Debate AI · Guides</span>
  <h1 class="hub-h1">The guides.</h1>
  <p class="hub-intro">Short, format-accurate write-ups on the moves that actually win rounds. Each one ends with a CTA to practice the move on Debate AI. Five published; more coming.</p>

  ${Object.entries(byFormat).map(([formatName, formatGuides]) => `
    <section class="hub-group">
      <div class="hub-group-head">
        <h2>${esc(formatName)}</h2>
        ${FORMAT_BANK[formatGuides[0].format]
          ? `<a href="/learn/formats/${esc(formatGuides[0].format)}">Format reference →</a>`
          : ''}
      </div>
      <div class="hub-grid">
        ${formatGuides.map(g => `<a class="hub-card" href="/learn/guides/${esc(g.slug)}">
          <div class="q">${esc(g.question)}</div>
          <div class="h">${esc(g.hook)}</div>
          <span class="read">${esc(g.readTime)} read</span>
        </a>`).join('')}
      </div>
    </section>
  `).join('')}

  <footer>
    <span>© 2026 Debate AI</span>
    <span><a href="/learn">Learn hub</a> · <a href="/learn/formats/apda">Format reference</a> · <a href="/debate-ai">New round</a></span>
  </footer>
</main>
</body></html>`;
}

export default async (request) => {
  const parsed = extractSlugFromUrl(request.url);
  if (!parsed) return notFoundResponse();

  let html;
  if (parsed.mode === 'hub') {
    html = renderHubPage();
  } else {
    const guide = getGuide(parsed.slug);
    if (!guide) return notFoundResponse();
    html = renderGuidePage(guide);
  }

  return new Response(html, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      // 1-day edge cache. Content is fully static per slug; only
      // changes when guide-bank.mjs is updated and redeployed.
      'Cache-Control': 'public, max-age=86400, s-maxage=86400',
    },
  });
};

export const config = {
  // Two entries so the bare hub URL (/api/learn/guides) and the
  // slug pages (/api/learn/guides/asian-parli-pm-opening) both
  // resolve. Wildcard alone is unreliable for the bare-path case
  // on Netlify v2.
  path: ['/api/learn/guides', '/api/learn/guides/*'],
};
