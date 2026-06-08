// /learn/fundamentals{/slug?} — deep-content pages for each of the
// six debate fundamentals summarized on /learn.
//
// Sister surface to /learn/guides. Guides cover format-specific
// tactical moves; fundamentals cover the format-agnostic concepts
// that underlie every debate round. Each page is the canonical
// ranking target for its specific concept query.
//
// Routing:
//   /learn/fundamentals              → hub page (lists all 6)
//   /learn/fundamentals/{slug}       → individual fundamental
// Both rewrite to /api/learn/fundamentals/* via netlify.toml.
//
// Visual register: editorial white. Same Georgia-serif aesthetic as
// /learn/guides for design consistency across the deep-content
// surfaces. Self-contained colors so the page renders correctly
// regardless of any theme system.

import { FUNDAMENTALS_BANK, getFundamental, listFundamentals } from './lib/fundamentals-bank.mjs';
import { GUIDE_BANK } from './lib/guide-bank.mjs';

const SITE_ORIGIN = 'https://debateit.com';
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
    const path = u.pathname.replace(/^\/api/, '');
    const hub = path.match(/^\/learn\/fundamentals\/?$/i);
    if (hub) return { mode: 'hub' };
    const m = path.match(/^\/learn\/fundamentals\/([a-z0-9-]+)\/?$/i);
    if (m) return { mode: 'fundamental', slug: m[1].toLowerCase() };
    return null;
  } catch { return null; }
}

function notFoundResponse() {
  const items = listFundamentals();
  const body = `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Fundamental not found · DebateIt</title>
<meta name="robots" content="noindex">
<style>
  body{background:#ffffff;color:#1a1a1a;font:17px/1.7 Georgia,'Iowan Old Style','Constantia','Times New Roman',serif;margin:0;padding:64px 24px;text-align:center;-webkit-font-smoothing:antialiased}
  h1{font:700 32px/1.2 Georgia,serif;margin-bottom:14px}
  p{color:#3a3a3a;max-width:560px;margin:0 auto 14px;line-height:1.6}
  a{color:#c12c1f;text-decoration:none;border-bottom:1px solid currentColor}
  a:hover{color:#1a1a1a}
</style>
</head><body>
<h1>Fundamental not found.</h1>
<p>Try one of these.</p>
<p>${items.map(g => `<a href="/learn/fundamentals/${g.slug}">${esc(g.question)}</a>`).join(' · ')}</p>
<p style="margin-top:28px"><a href="/learn/fundamentals">All fundamentals →</a></p>
</body></html>`;
  return new Response(body, { status: 404, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}

function commonStyles() {
  // Same editorial white aesthetic as learn-guides.mjs. Georgia
  // serif body, charcoal text, brand red used only on inline links.
  // Stripped chrome: no chips, no gradient cards, no shadowed CTAs.
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

  .top-nav{
    display:flex;justify-content:space-between;align-items:center;
    margin-bottom:56px;
    font-family:Georgia,serif;font-size:14px;color:#6b6b6b;
  }
  .top-nav a{color:#6b6b6b;border-bottom:none}
  .top-nav a:hover{color:#1a1a1a}

  .crumb{
    font:600 11px/1.4 Georgia,serif;
    color:#6b6b6b;letter-spacing:.14em;text-transform:uppercase;
    margin-bottom:18px;
  }
  .crumb a{color:#6b6b6b;border-bottom:none}
  .crumb a:hover{color:#1a1a1a}

  h1{
    font:700 38px/1.18 Georgia,serif;letter-spacing:-.012em;
    color:#1a1a1a;margin-bottom:18px;
  }

  .hook{
    font:italic 19px/1.55 Georgia,serif;
    color:#3a3a3a;margin:0 0 32px;max-width:600px;
  }

  .meta{
    font-size:13px;color:#6b6b6b;
    margin-bottom:44px;padding-bottom:28px;
    border-bottom:1px solid #eaeaea;
  }
  .meta a{color:#6b6b6b;border-bottom:1px dotted #bbbbbb}
  .meta a:hover{color:#1a1a1a;border-bottom-color:#1a1a1a}

  .insort{margin:0 0 44px}
  .insort-head{
    font:600 11px/1.4 Georgia,serif;letter-spacing:.14em;text-transform:uppercase;
    color:#6b6b6b;margin-bottom:12px;
  }
  .insort ul{list-style:none;padding:0;margin:0}
  .insort li{
    padding:5px 0 5px 22px;position:relative;
    color:#1a1a1a;font-size:16px;line-height:1.55;
  }
  .insort li::before{
    content:"";position:absolute;left:0;top:13px;
    width:12px;height:1px;background:#c12c1f;
  }

  h2{
    font:700 22px/1.3 Georgia,serif;letter-spacing:-.006em;
    color:#1a1a1a;margin:42px 0 14px;
  }

  .guide-section p{color:#1a1a1a;margin-bottom:14px}
  .guide-section p:last-child{margin-bottom:0}

  .examples{margin-top:42px}
  .examples h2{margin-bottom:18px}
  .example{
    margin:18px 0 24px;padding-left:20px;
    border-left:2px solid #c12c1f;
  }
  .ex-context{
    font:italic 14px/1.5 Georgia,serif;
    color:#6b6b6b;margin-bottom:8px;
  }
  .ex-line{
    font:18px/1.55 Georgia,serif;
    color:#1a1a1a;margin-bottom:10px;
  }
  .ex-why{font-size:15px;line-height:1.6;color:#3a3a3a}

  .cta{
    margin:48px 0 36px;padding-top:32px;
    border-top:1px solid #eaeaea;
  }
  .cta-line{font-size:17px;line-height:1.6;color:#1a1a1a;margin-bottom:6px}
  .cta-link{
    font:italic 18px/1.5 Georgia,serif;
    color:#c12c1f;border-bottom:1px solid currentColor;
  }

  .related{
    margin-top:48px;padding-top:28px;
    border-top:1px solid #eaeaea;
  }
  .related-head{
    font:600 11px/1.4 Georgia,serif;letter-spacing:.14em;text-transform:uppercase;
    color:#6b6b6b;margin-bottom:12px;
  }
  .related ul{list-style:none;padding:0;margin:0}
  .related li{padding:5px 0;font-size:16px;line-height:1.5}
  .related li a{color:#1a1a1a;border-bottom:1px solid #d4d4d4}
  .related li a:hover{color:#c12c1f;border-bottom-color:#c12c1f}

  footer.guide-footer{
    margin-top:64px;padding-top:24px;
    border-top:1px solid #eaeaea;
    display:flex;justify-content:space-between;flex-wrap:wrap;gap:12px;
    font-size:13px;color:#6b6b6b;
  }
  footer.guide-footer a{color:#6b6b6b;border-bottom:none}
  footer.guide-footer a:hover{color:#1a1a1a}

  /* Hub page styles. */
  .hub-h1{font-size:44px}
  .hub-intro{
    font:italic 19px/1.55 Georgia,serif;
    color:#3a3a3a;margin:0 0 48px;max-width:620px;
  }
  .hub-list{list-style:none;padding:0;margin:0}
  .hub-li{padding:14px 0;border-bottom:1px solid #eaeaea}
  .hub-li:last-child{border-bottom:none}
  .hub-q{
    display:block;font:600 18px/1.4 Georgia,serif;
    color:#1a1a1a;border-bottom:none;margin-bottom:4px;
  }
  .hub-q:hover{color:#c12c1f}
  .hub-h{font-size:15px;line-height:1.55;color:#3a3a3a;margin-bottom:4px;font-style:italic}
  .hub-read{
    font:11px/1 Georgia,serif;color:#888888;
    letter-spacing:.1em;text-transform:uppercase;
    margin-top:6px;display:inline-block;
  }

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
  return `<nav class="top-nav">
    <a href="/">← DebateIt</a>
    <a href="/learn">Learn</a>
    <a href="/debate-it">Practice →</a>
  </nav>`;
}

function renderFundamentalPage(item) {
  const titleCore = `${item.question} · DebateIt`;
  const title = titleCore.length > 65 ? titleCore.slice(0, 62) + '…' : titleCore;
  const description = item.hook;
  const canonical = `${SITE_ORIGIN}/learn/fundamentals/${item.slug}`;

  // HowTo schema treats the sections as ordered steps. Combined with
  // the per-page canonical, this is the strongest single-concept
  // ranking surface we can build for the query.
  const ldHowTo = {
    '@context': 'https://schema.org',
    '@type': 'HowTo',
    name: item.question,
    description: item.hook,
    totalTime: `PT${(item.readTime || '5 min').replace(/\D/g, '')}M`,
    step: item.sections.map((s, i) => ({
      '@type': 'HowToStep',
      position: i + 1,
      name: s.heading,
      text: s.body.join(' '),
    })),
    keywords: item.keywords.join(', '),
    inLanguage: 'en',
    publisher: {
      '@type': 'Organization',
      name: 'DebateIt',
      url: SITE_ORIGIN,
    },
  };

  const ldBreadcrumb = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'DebateIt', item: SITE_ORIGIN + '/' },
      { '@type': 'ListItem', position: 2, name: 'Learn', item: SITE_ORIGIN + '/learn' },
      { '@type': 'ListItem', position: 3, name: 'Fundamentals', item: SITE_ORIGIN + '/learn/fundamentals' },
      { '@type': 'ListItem', position: 4, name: item.question, item: canonical },
    ],
  };

  const relatedItems = (item.related || [])
    .map(slug => GUIDE_BANK[slug])
    .filter(Boolean);

  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<meta name="keywords" content="${esc(item.keywords.join(', '))}">
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
<script type="application/ld+json">${jsonLd(ldHowTo)}</script>
<script type="application/ld+json">${jsonLd(ldBreadcrumb)}</script>
<style>${commonStyles()}</style>
</head>
<body>
<main class="shell">
  ${topNav()}

  <div class="crumb"><a href="/learn">Learn</a> · <a href="/learn/fundamentals">Fundamentals</a></div>

  <h1>${esc(item.question)}</h1>

  <p class="hook">${esc(item.hook)}</p>

  <div class="meta">Debate fundamentals · ${esc(item.readTime)} read</div>

  <div class="insort">
    <div class="insort-head">In short</div>
    <ul>${item.takeaways.map(t => `<li>${esc(t)}</li>`).join('')}</ul>
  </div>

  ${item.sections.map(s => `<section class="guide-section">
    <h2>${esc(s.heading)}</h2>
    ${s.body.map(p => `<p>${p}</p>`).join('\n    ')}
  </section>`).join('\n  ')}

  ${item.examples && item.examples.length ? `<section class="examples">
    <h2>Examples</h2>
    ${item.examples.map(ex => `<div class="example">
      <div class="ex-context">${esc(ex.context)}</div>
      <div class="ex-line">${esc(ex.line)}</div>
      <div class="ex-why">${esc(ex.why)}</div>
    </div>`).join('')}
  </section>` : ''}

  <div class="cta">
    <p class="cta-line">Want to practice this against an AI that knows the format?</p>
    <a class="cta-link" href="${esc(item.ctaHref)}">${esc(item.ctaLabel)} →</a>
  </div>

  ${relatedItems.length ? `<section class="related">
    <div class="related-head">Apply this in a format-specific guide</div>
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
  const items = listFundamentals();
  const title = 'Debate fundamentals · Six core concepts · DebateIt';
  const description = "Six concepts that win every debate round, regardless of format. Claim/warrant/impact, weighing, rebuttal, signposting, cross-examination, and speaker register. Each one a deep guide.";
  const canonical = `${SITE_ORIGIN}/learn/fundamentals`;

  const ldCollection = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: 'Debate fundamentals',
    description,
    url: canonical,
    hasPart: items.map(g => ({
      '@type': 'Article',
      name: g.question,
      url: `${SITE_ORIGIN}/learn/fundamentals/${g.slug}`,
      description: g.hook,
    })),
  };

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

  <div class="crumb"><a href="/">DebateIt</a> · <a href="/learn">Learn</a> · Fundamentals</div>

  <h1 class="hub-h1">Fundamentals.</h1>

  <p class="hub-intro">Six concepts that win every debate round, regardless of format. Each one a deep guide. Read these once before you compete; come back when you stall.</p>

  <ul class="hub-list">
    ${items.map(g => `<li class="hub-li">
      <a class="hub-q" href="/learn/fundamentals/${esc(g.slug)}">${esc(g.question)}</a>
      <div class="hub-h">${esc(g.hook)}</div>
      <span class="hub-read">${esc(g.readTime)} read</span>
    </li>`).join('')}
  </ul>

  <footer class="guide-footer">
    <span>© 2026 DebateIt</span>
    <span><a href="/learn">Learn</a> · <a href="/learn/guides">Guides</a> · <a href="/learn/glossary">Glossary</a></span>
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
    const item = getFundamental(parsed.slug);
    if (!item) return notFoundResponse();
    html = renderFundamentalPage(item);
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
  path: ['/api/learn/fundamentals', '/api/learn/fundamentals/*'],
};
