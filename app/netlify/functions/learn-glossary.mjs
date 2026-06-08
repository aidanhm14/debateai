// /learn/glossary — single-page debate glossary.
//
// One canonical URL with anchor IDs for each term. Pattern matches
// Stripe Docs and other long-form glossaries: deep content on one
// page, DefinedTermSet + DefinedTerm JSON-LD for entity-level SEO,
// in-page filter for usability.
//
// Each term has its own anchor (/learn/glossary#kritik) so any guide
// or fundamentals page can link to a specific definition. Cross-links
// to the relevant /learn/guides/ or /learn/fundamentals/ deep pages
// when one exists.
//
// Visual register: editorial white, same as /learn/guides + /learn/fundamentals.
// Two-column on desktop (definitions are short), single column on mobile.

import { GLOSSARY_BANK, GLOSSARY_CATEGORIES, listTerms, groupedByCategory } from './lib/glossary-bank.mjs';

const SITE_ORIGIN = 'https://debateit.com';
const OG_IMAGE = `${SITE_ORIGIN}/og-image.png?v=debateit1`;

const HTML_ESCAPE = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
function esc(s) {
  if (s === null || s === undefined) return '';
  return String(s).replace(/[&<>"']/g, c => HTML_ESCAPE[c]);
}
function jsonLd(obj) {
  return JSON.stringify(obj).replace(/</g, '\\u003c');
}

function styles() {
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

  .shell{max-width:1040px;margin:0 auto;padding:42px 28px 96px}

  .top-nav{
    display:flex;justify-content:space-between;align-items:center;
    margin-bottom:48px;
    font-family:Georgia,serif;font-size:14px;color:#6b6b6b;
  }
  .top-nav a{color:#6b6b6b;border-bottom:none}
  .top-nav a:hover{color:#1a1a1a}

  .crumb{
    font:600 11px/1.4 Georgia,serif;
    color:#6b6b6b;letter-spacing:.14em;text-transform:uppercase;
    margin-bottom:16px;
  }
  .crumb a{color:#6b6b6b;border-bottom:none}
  .crumb a:hover{color:#1a1a1a}

  h1{
    font:700 42px/1.15 Georgia,serif;letter-spacing:-.014em;
    color:#1a1a1a;margin-bottom:14px;
  }
  .hook{
    font:italic 19px/1.55 Georgia,serif;
    color:#3a3a3a;margin:0 0 32px;max-width:660px;
  }

  /* Filter bar. */
  .gloss-filter{
    margin:0 0 28px;padding:14px 18px;
    background:#fafafa;
    border:1px solid #eaeaea;border-radius:8px;
    display:flex;flex-wrap:wrap;gap:10px;align-items:center;
  }
  .gloss-filter input{
    flex:1;min-width:200px;
    font:16px/1.4 Georgia,serif;
    padding:8px 12px;background:#fff;
    border:1px solid #d4d4d4;border-radius:6px;
    color:#1a1a1a;
  }
  .gloss-filter input:focus{outline:none;border-color:#c12c1f}
  .gloss-filter-info{font-size:13px;color:#6b6b6b;font-family:Georgia,serif}

  /* Category navigation. */
  .gloss-cats{
    display:flex;flex-wrap:wrap;gap:14px 22px;
    margin:0 0 36px;padding-bottom:18px;
    border-bottom:1px solid #eaeaea;
  }
  .gloss-cats a{
    font-size:14px;color:#1a1a1a;border-bottom:1px dotted #bbb;
  }
  .gloss-cats a:hover{color:#c12c1f;border-bottom-color:#c12c1f}

  .gloss-section{margin:0 0 48px}
  .gloss-section h2{
    font:700 24px/1.2 Georgia,serif;letter-spacing:-.006em;
    color:#1a1a1a;margin:0 0 18px;
    padding-bottom:6px;border-bottom:1px solid #eaeaea;
  }

  /* Two-column term list on desktop, single on mobile. */
  .gloss-list{
    list-style:none;padding:0;margin:0;
    display:grid;grid-template-columns:1fr;gap:18px 28px;
  }
  @media(min-width:780px){.gloss-list{grid-template-columns:1fr 1fr}}

  .gloss-term{
    padding:0;
    border:none;
    scroll-margin-top:24px;
  }
  .gloss-term h3{
    font:700 17px/1.35 Georgia,serif;letter-spacing:-.004em;
    color:#1a1a1a;margin:0 0 6px;
  }
  .gloss-term h3 a{color:#1a1a1a;border-bottom:none;opacity:0;transition:opacity .12s}
  .gloss-term:hover h3 a,.gloss-term:focus-within h3 a{opacity:.5}
  .gloss-term h3 a:hover{opacity:1;color:#c12c1f}
  .gloss-term .abbr{
    font:600 11px/1 Georgia,serif;
    color:#888;margin-left:8px;letter-spacing:.04em;
  }
  .gloss-def{
    font-size:15px;line-height:1.6;color:#3a3a3a;
    margin:0 0 6px;
  }
  .gloss-example{
    font:italic 14px/1.55 Georgia,serif;
    color:#6b6b6b;margin:0 0 8px;
  }
  .gloss-example::before{content:"e.g. ";color:#888;font-style:normal;font-weight:600;font-size:11px;letter-spacing:.04em;text-transform:uppercase}
  .gloss-more{
    font-size:13px;color:#6b6b6b;
  }
  .gloss-more a{
    color:#6b6b6b;border-bottom:1px solid #d4d4d4;font-size:13px;
  }
  .gloss-more a:hover{color:#c12c1f;border-bottom-color:#c12c1f}

  .gloss-empty{
    grid-column:1/-1;
    padding:18px;text-align:center;font-style:italic;color:#888;font-size:14px;
  }

  footer.gloss-footer{
    margin-top:64px;padding-top:24px;
    border-top:1px solid #eaeaea;
    display:flex;justify-content:space-between;flex-wrap:wrap;gap:12px;
    font-size:13px;color:#6b6b6b;
  }
  footer.gloss-footer a{color:#6b6b6b;border-bottom:none}
  footer.gloss-footer a:hover{color:#1a1a1a}

  @media (max-width:680px){
    .shell{padding:28px 18px 64px}
    h1{font-size:30px}
    .hook{font-size:17px}
    body{font-size:16px}
    .gloss-section h2{font-size:20px}
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

function relatedTermsLine(item) {
  const parts = [];
  if (item.relatedSlugs && item.relatedSlugs.length) {
    const links = item.relatedSlugs
      .map(s => GLOSSARY_BANK[s])
      .filter(Boolean)
      .map(t => `<a href="#${esc(t.slug)}">${esc(t.term)}</a>`);
    if (links.length) parts.push(`See also: ${links.join(', ')}`);
  }
  if (item.guideSlug && item.guideRoute) {
    const route = item.guideRoute === 'fundamentals' ? '/learn/fundamentals/' : '/learn/guides/';
    parts.push(`Deep guide: <a href="${route}${esc(item.guideSlug)}">${esc(item.guideSlug.replace(/-/g, ' '))} →</a>`);
  }
  if (!parts.length) return '';
  return `<div class="gloss-more">${parts.join(' &middot; ')}</div>`;
}

function renderTermItem(item) {
  const abbr = item.abbreviation && item.abbreviation !== item.term
    ? `<span class="abbr">${esc(item.abbreviation)}</span>`
    : '';
  return `<li id="${esc(item.slug)}" class="gloss-term" data-term="${esc(item.term.toLowerCase())}">
    <h3>${esc(item.term)}${abbr} <a href="#${esc(item.slug)}" aria-label="Anchor link">#</a></h3>
    <p class="gloss-def">${esc(item.definition)}</p>
    ${item.example ? `<p class="gloss-example">${esc(item.example)}</p>` : ''}
    ${relatedTermsLine(item)}
  </li>`;
}

function renderPage() {
  const terms = listTerms();
  const grouped = groupedByCategory();
  const title = 'Debate glossary · 65 essential terms · DebateIt';
  const description = 'Definitions of every key debate term across APDA, BP, Worlds, Asian Parli, Policy, LD, Public Forum, and procedural theory. Claim, warrant, impact, weighing, POI, kritik, topicality, framework, and more.';
  const canonical = `${SITE_ORIGIN}/learn/glossary`;

  // DefinedTermSet wraps the whole glossary. Each term is a DefinedTerm
  // with its own URL fragment. Helps Google understand the page as a
  // structured reference, not narrative content.
  const ldTermSet = {
    '@context': 'https://schema.org',
    '@type': 'DefinedTermSet',
    name: 'Debate glossary',
    description,
    url: canonical,
    hasDefinedTerm: terms.map(t => ({
      '@type': 'DefinedTerm',
      '@id': `${canonical}#${t.slug}`,
      name: t.term,
      description: t.definition,
      url: `${canonical}#${t.slug}`,
      inDefinedTermSet: canonical,
    })),
    inLanguage: 'en',
  };

  const ldBreadcrumb = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'DebateIt', item: SITE_ORIGIN + '/' },
      { '@type': 'ListItem', position: 2, name: 'Learn', item: SITE_ORIGIN + '/learn' },
      { '@type': 'ListItem', position: 3, name: 'Glossary', item: canonical },
    ],
  };

  const catNav = Object.entries(GLOSSARY_CATEGORIES)
    .filter(([cat]) => (grouped[cat] || []).length > 0)
    .map(([cat, label]) => {
      const count = (grouped[cat] || []).length;
      return `<a href="#cat-${esc(cat)}">${esc(label)} <span style="color:#888">(${count})</span></a>`;
    })
    .join('');

  const sections = Object.entries(GLOSSARY_CATEGORIES)
    .filter(([cat]) => (grouped[cat] || []).length > 0)
    .map(([cat, label]) => `
      <section id="cat-${esc(cat)}" class="gloss-section">
        <h2>${esc(label)}</h2>
        <ul class="gloss-list">
          ${grouped[cat].map(renderTermItem).join('')}
        </ul>
      </section>`)
    .join('');

  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<meta name="keywords" content="debate glossary, debate terms, what is a kritik, what is topicality, what is POI in debate, what is the PMR, debate vocabulary, debate dictionary, debate definitions, parliamentary debate terms, policy debate terms">
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
<script type="application/ld+json">${jsonLd(ldTermSet)}</script>
<script type="application/ld+json">${jsonLd(ldBreadcrumb)}</script>
<style>${styles()}</style>
</head>
<body>
<main class="shell">
  ${topNav()}

  <div class="crumb"><a href="/">DebateIt</a> · <a href="/learn">Learn</a> · Glossary</div>

  <h1>Glossary.</h1>

  <p class="hook">${terms.length} essential debate terms across every major format. Anchor link any one and share. Each entry links to the relevant deep guide where one exists.</p>

  <div class="gloss-filter">
    <input type="search" id="gloss-q" placeholder="Filter terms by name…" aria-label="Filter terms" autocomplete="off">
    <div class="gloss-filter-info"><span id="gloss-count">${terms.length}</span> of ${terms.length}</div>
  </div>

  <nav class="gloss-cats" aria-label="Categories">${catNav}</nav>

  ${sections}

  <footer class="gloss-footer">
    <span>© 2026 DebateIt</span>
    <span>
      <a href="/learn">Learn</a> ·
      <a href="/learn/fundamentals">Fundamentals</a> ·
      <a href="/learn/guides">Guides</a>
    </span>
  </footer>
</main>
<script>
// In-page filter. Hides terms not matching the search input. Filter
// runs on every keystroke; debouncing is overkill at 65 entries.
(function(){
  var input = document.getElementById('gloss-q');
  var count = document.getElementById('gloss-count');
  var terms = document.querySelectorAll('.gloss-term');
  var sections = document.querySelectorAll('.gloss-section');
  if (!input || !terms.length) return;
  input.addEventListener('input', function(){
    var q = input.value.trim().toLowerCase();
    var visible = 0;
    terms.forEach(function(t){
      var name = (t.getAttribute('data-term') || '').toLowerCase();
      var def = (t.querySelector('.gloss-def') || {}).textContent || '';
      var match = !q || name.includes(q) || def.toLowerCase().includes(q);
      t.style.display = match ? '' : 'none';
      if (match) visible++;
    });
    count.textContent = visible;
    // Hide sections that now have no visible terms.
    sections.forEach(function(s){
      var hasVisible = Array.from(s.querySelectorAll('.gloss-term')).some(function(t){ return t.style.display !== 'none'; });
      s.style.display = hasVisible ? '' : 'none';
    });
  });
})();
</script>
</body></html>`;
}

export default async (request) => {
  // Path-only function; no slug parsing needed. Always render the
  // single canonical page.
  const html = renderPage();
  return new Response(html, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'public, max-age=86400, s-maxage=86400',
    },
  });
};

export const config = {
  path: '/api/learn/glossary',
};
