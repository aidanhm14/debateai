// /learn/guides{/slug?} — server-rendered long-tail guide pages.
//
// Catches question-style queries debaters search for: "how to open as
// PM in Asian Parli", "WSDC reply speech structure", "PF crossfire
// questions to ask", "how to take a POI in BP", "viva exam questions
// to expect", etc. Sister surface to /learn/formats/: format pages
// cover generic format-name queries, guides cover the high-intent
// question queries.
//
// Routing:
//   /learn/guides              → hub page
//   /learn/guides/{slug}       → individual guide
// Both rewrite to /api/learn/guides/* via netlify.toml.
//
// Visual register (2026-05-18 redesign, white): pure white paper,
// Georgia serif body, charcoal text, brand red used only on inline
// links. No eyebrow chips, no gradient cards, no shadowed CTA
// buttons. The previous version read like SaaS marketing-page
// boilerplate; this reads like long-form writing. Deliberate visual
// distance from the dark app surfaces — the guides are deliberate
// prose, not dashboard components. (Started cream #ffffff; user
// asked for white the same day, swap was cosmetic only.)

import { GUIDE_BANK, getGuide, listGuides } from './lib/guide-bank.mjs';
import { FORMAT_BANK } from './lib/format-bank.mjs';

const SITE_ORIGIN = 'https://debateai.com';
const OG_IMAGE = `${SITE_ORIGIN}/og-image.png?v=debateit1`;

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
<title>Guide not found · DebateIt</title>
<meta name="robots" content="noindex">
<style>
  body{background:#ffffff;color:#1a1a1a;font:17px/1.7 Georgia,'Iowan Old Style','Constantia','Times New Roman',serif;margin:0;padding:64px 24px;text-align:center;-webkit-font-smoothing:antialiased}
  h1{font:700 32px/1.2 Georgia,serif;margin-bottom:14px}
  p{color:#3a3a3a;max-width:560px;margin:0 auto 14px;line-height:1.6}
  a{color:#c12c1f;text-decoration:none;border-bottom:1px solid currentColor}
  a:hover{color:#1a1a1a}
</style>
</head><body>
<h1>Guide not found.</h1>
<p>Try one of these.</p>
<p>${guides.map(g => `<a href="/learn/guides/${g.slug}">${esc(g.question)}</a>`).join(' · ')}</p>
<p style="margin-top:28px"><a href="/learn/guides">All guides →</a></p>
</body></html>`;
  return new Response(body, { status: 404, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}

// Shared CSS. Single typeface (Georgia, system-available, no font
// load). All measurement-style numbers chosen so a cold reader on a
// laptop can read the whole page without scroll-fatigue: 680px column
// width, 17px body, 1.7 line-height, generous margins.
function commonStyles() {
  return `
  *{box-sizing:border-box;margin:0;padding:0}
  html,body{background:#ffffff}
  body{
    color:#1a1a1a;
    font:17px/1.7 Georgia,'Iowan Old Style','Constantia','Times New Roman',serif;
    -webkit-font-smoothing:antialiased;
    text-rendering:optimizeLegibility;
  }
  a{color:#c12c1f;text-decoration:none;border-bottom:1px solid currentColor;transition:color .12s}
  a:hover{color:#1a1a1a;border-bottom-color:#1a1a1a}

  .shell{max-width:680px;margin:0 auto;padding:42px 28px 96px}

  /* Top nav: minimal text links, matches /topics/{slug} pattern. */
  .top-nav{
    display:flex;justify-content:space-between;align-items:center;
    margin-bottom:56px;
    font-family:Georgia,serif;font-size:14px;
    color:#6b6b6b;
  }
  .top-nav a{color:#6b6b6b;border-bottom:none}
  .top-nav a:hover{color:#1a1a1a}

  /* Crumb line above H1. Quiet metadata, all-caps, tracked. */
  .crumb{
    font:600 11px/1.4 Georgia,serif;
    color:#6b6b6b;
    letter-spacing:.14em;
    text-transform:uppercase;
    margin-bottom:18px;
  }
  .crumb a{color:#6b6b6b;border-bottom:none}
  .crumb a:hover{color:#1a1a1a}

  h1{
    font:700 38px/1.18 Georgia,serif;
    letter-spacing:-.012em;
    margin-bottom:18px;
    color:#1a1a1a;
  }

  .hook{
    font:italic 19px/1.55 Georgia,serif;
    color:#3a3a3a;
    margin:0 0 32px;
    max-width:600px;
  }

  .meta{
    font-size:13px;color:#6b6b6b;
    margin-bottom:44px;
    padding-bottom:28px;
    border-bottom:1px solid #eaeaea;
  }
  .meta a{color:#6b6b6b;border-bottom:1px dotted #bbbbbb}
  .meta a:hover{color:#1a1a1a;border-bottom-color:#1a1a1a}

  /* In-short list: takeaways rendered as a tight em-dashed list, not
     a gradient card with green checkmarks. Reads like the headnotes
     at the top of a long-form essay. */
  .insort{margin:0 0 44px}
  .insort-head{
    font:600 11px/1.4 Georgia,serif;
    letter-spacing:.14em;text-transform:uppercase;
    color:#6b6b6b;margin-bottom:12px;
  }
  .insort ul{list-style:none;padding:0;margin:0}
  .insort li{
    padding:5px 0 5px 22px;
    position:relative;
    color:#1a1a1a;
    font-size:16px;line-height:1.55;
  }
  .insort li::before{
    content:"";
    position:absolute;left:0;top:13px;
    width:12px;height:1px;background:#c12c1f;
  }

  h2{
    font:700 22px/1.3 Georgia,serif;
    letter-spacing:-.006em;
    margin:42px 0 14px;
    color:#1a1a1a;
  }

  .guide-section p{
    color:#1a1a1a;
    margin-bottom:14px;
  }
  .guide-section p:last-child{margin-bottom:0}

  /* Sample lines block: each example is a pull-quote with a thin
     accent rule, not a card. Reads like a New Yorker margin note. */
  .examples{margin-top:42px}
  .examples h2{margin-bottom:18px}
  .example{
    margin:18px 0 24px;
    padding-left:20px;
    border-left:2px solid #c12c1f;
  }
  .ex-context{
    font:italic 14px/1.5 Georgia,serif;
    color:#6b6b6b;
    margin-bottom:8px;
  }
  .ex-line{
    font:18px/1.55 Georgia,serif;
    color:#1a1a1a;
    margin-bottom:10px;
  }
  .ex-why{
    font-size:15px;line-height:1.6;
    color:#3a3a3a;
  }

  /* CTA: a single inline link, not a button. Same visual weight as
     any other paragraph link, italicized for emphasis. */
  .cta{
    margin:48px 0 36px;
    padding-top:32px;
    border-top:1px solid #eaeaea;
  }
  .cta-line{
    font-size:17px;line-height:1.6;
    color:#1a1a1a;
    margin-bottom:6px;
  }
  .cta-link{
    font:italic 18px/1.5 Georgia,serif;
    color:#c12c1f;
    border-bottom:1px solid currentColor;
  }

  /* Related: plain list of titles, no card grid. */
  .related{
    margin-top:48px;
    padding-top:28px;
    border-top:1px solid #eaeaea;
  }
  .related-head{
    font:600 11px/1.4 Georgia,serif;
    letter-spacing:.14em;text-transform:uppercase;
    color:#6b6b6b;margin-bottom:12px;
  }
  .related ul{list-style:none;padding:0;margin:0}
  .related li{padding:5px 0;font-size:16px;line-height:1.5}
  .related li a{color:#1a1a1a;border-bottom:1px solid #d4d4d4}
  .related li a:hover{color:#c12c1f;border-bottom-color:#c12c1f}

  /* Footer: text links, no chrome. */
  footer.guide-footer{
    margin-top:64px;
    padding-top:24px;
    border-top:1px solid #eaeaea;
    display:flex;justify-content:space-between;flex-wrap:wrap;gap:12px;
    font-size:13px;color:#6b6b6b;
  }
  footer.guide-footer a{color:#6b6b6b;border-bottom:none}
  footer.guide-footer a:hover{color:#1a1a1a}

  /* Hub page (listing) styles. */
  .hub-h1{font-size:44px}
  .hub-intro{
    font:italic 19px/1.55 Georgia,serif;
    color:#3a3a3a;
    margin:0 0 48px;
    max-width:620px;
  }
  .hub-group{margin-bottom:42px}
  .hub-group-head{
    font:700 22px/1.3 Georgia,serif;
    letter-spacing:-.006em;
    margin:0 0 14px;
    padding-bottom:8px;
    border-bottom:1px solid #eaeaea;
    display:flex;align-items:baseline;justify-content:space-between;gap:14px;
    flex-wrap:wrap;
  }
  .hub-group-head a{
    font:400 14px/1.4 Georgia,serif;
    color:#6b6b6b;border-bottom:1px dotted #bbbbbb;
  }
  .hub-group-head a:hover{color:#1a1a1a;border-bottom-color:#1a1a1a}
  .hub-list{list-style:none;padding:0;margin:0}
  .hub-li{
    padding:14px 0;
    border-bottom:1px solid #eaeaea;
  }
  .hub-li:last-child{border-bottom:none}
  .hub-q{
    display:block;
    font:600 18px/1.4 Georgia,serif;
    color:#1a1a1a;
    border-bottom:none;
    margin-bottom:4px;
  }
  .hub-q:hover{color:#c12c1f}
  .hub-h{font-size:15px;line-height:1.55;color:#3a3a3a;margin-bottom:4px;font-style:italic}
  .hub-read{font:11px/1 Georgia,serif;color:#888888;letter-spacing:.1em;text-transform:uppercase;margin-top:6px;display:inline-block}

  @media (max-width:680px){
    .shell{padding:28px 18px 64px}
    h1{font-size:30px}
    .hub-h1{font-size:34px}
    .hook,.hub-intro{font-size:17px}
    body{font-size:16px}
    .top-nav{margin-bottom:36px}
    h2{font-size:20px}
  }
  `;
}

function topNav() {
  // Three text links so the user can navigate up to the parent
  // (/learn) without going all the way back to the homepage. Matches
  // the editorial nav pattern of /topics/{slug} but adds a middle
  // link because /learn is the logical parent of /learn/guides.
  return `<nav class="top-nav">
    <a href="/">← DebateIt</a>
    <a href="/learn">Learn</a>
    <a href="/debate-it">Practice →</a>
  </nav>`;
}

function renderGuidePage(guide) {
  const titleCore = `${guide.question} · DebateIt`;
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
      name: 'DebateIt',
      url: SITE_ORIGIN,
    },
  };

  const formatPart = FORMAT_BANK[guide.format]
    ? `<a href="/learn/formats/${esc(guide.format)}">${esc(guide.formatName)}</a>`
    : esc(guide.formatName);

  const relatedItems = (guide.related || [])
    .map(slug => GUIDE_BANK[slug])
    .filter(g => g && g.slug !== guide.slug);

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
<meta property="og:site_name" content="DebateIt">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(titleCore)}">
<meta name="twitter:description" content="${esc(description)}">
<meta name="twitter:image" content="${OG_IMAGE}">
<meta name="theme-color" content="#ffffff">
<link rel="icon" href="/icons/icon-192.png">
<script defer src="/js/track.js"></script>
<script type="application/ld+json">${jsonLd(ldArticle)}</script>
<style>${commonStyles()}</style>
</head>
<body>
<main class="shell">
  ${topNav()}

  <div class="crumb"><a href="/learn">Learn</a> · <a href="/learn/guides">Guides</a> · ${esc(guide.formatName)}</div>

  <h1>${esc(guide.question)}</h1>

  <p class="hook">${esc(guide.hook)}</p>

  <div class="meta">${formatPart} · ${esc(guide.readTime)} read</div>

  <div class="insort">
    <div class="insort-head">In short</div>
    <ul>${guide.takeaways.map(t => `<li>${esc(t)}</li>`).join('')}</ul>
  </div>

  ${guide.sections.map(s => `<section class="guide-section">
    <h2>${esc(s.heading)}</h2>
    ${s.body.map(p => `<p>${esc(p)}</p>`).join('\n    ')}
  </section>`).join('\n  ')}

  ${guide.examples && guide.examples.length ? `<section class="examples">
    <h2>Sample lines</h2>
    ${guide.examples.map(ex => `<div class="example">
      <div class="ex-context">${esc(ex.context)}</div>
      <div class="ex-line">${esc(ex.line)}</div>
      <div class="ex-why">${esc(ex.why)}</div>
    </div>`).join('')}
  </section>` : ''}

  <div class="cta">
    <p class="cta-line">Want to try this against an AI that knows the format?</p>
    <a class="cta-link" href="${esc(guide.ctaHref)}">${esc(guide.ctaLabel)} →</a>
  </div>

  ${relatedItems.length ? `<section class="related">
    <div class="related-head">Related</div>
    <ul>${relatedItems.map(g => `<li><a href="/learn/guides/${esc(g.slug)}">${esc(g.question)}</a></li>`).join('')}</ul>
  </section>` : ''}

  <footer class="guide-footer">
    <span>© 2026 DebateIt</span>
    <span><a href="/learn">Learn</a> · <a href="/learn/fundamentals">Fundamentals</a> · <a href="/learn/guides">Guides</a> · <a href="/learn/glossary">Glossary</a></span>
  </footer>
</main>
</body></html>`;
}

function renderHubPage() {
  const guides = listGuides();
  const title = 'Guides · DebateIt';
  const description = "Short, format-accurate write-ups on the moves that win specific debate speeches. Asian Parli PMC openings, WSDC reply structure, PF crossfire, BP POIs, viva oral exams.";
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

  // Group by formatName for sectioned display.
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
<meta property="og:site_name" content="DebateIt">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(description)}">
<meta name="twitter:image" content="${OG_IMAGE}">
<meta name="theme-color" content="#ffffff">
<link rel="icon" href="/icons/icon-192.png">
<script defer src="/js/track.js"></script>
<script type="application/ld+json">${jsonLd(ldCollection)}</script>
<style>${commonStyles()}</style>
</head>
<body>
<main class="shell">
  ${topNav()}

  <div class="crumb"><a href="/">DebateIt</a> · <a href="/learn">Learn</a> · Guides</div>

  <h1 class="hub-h1">Guides.</h1>

  <p class="hub-intro">Short, format-accurate write-ups on the moves that win specific debate speeches. ${guides.length} published.</p>

  ${Object.entries(byFormat).map(([formatName, formatGuides]) => `
    <section class="hub-group">
      <h2 class="hub-group-head">
        <span>${esc(formatName)}</span>
        ${FORMAT_BANK[formatGuides[0].format]
          ? `<a href="/learn/formats/${esc(formatGuides[0].format)}">format reference</a>`
          : ''}
      </h2>
      <ul class="hub-list">
        ${formatGuides.map(g => `<li class="hub-li">
          <a class="hub-q" href="/learn/guides/${esc(g.slug)}">${esc(g.question)}</a>
          <div class="hub-h">${esc(g.hook)}</div>
          <span class="hub-read">${esc(g.readTime)} read</span>
        </li>`).join('')}
      </ul>
    </section>
  `).join('')}

  <footer class="guide-footer">
    <span>© 2026 DebateIt</span>
    <span><a href="/learn">Learn</a> · <a href="/learn/fundamentals">Fundamentals</a> · <a href="/learn/glossary">Glossary</a></span>
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
      'Cache-Control': 'public, max-age=86400, s-maxage=86400',
    },
  });
};

export const config = {
  // Two entries so the bare hub URL and the slug pages both resolve.
  path: ['/api/learn/guides', '/api/learn/guides/*'],
};
