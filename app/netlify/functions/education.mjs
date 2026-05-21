// /education + /education/{slug} — substantive-subject primers.
//
// The point: most debate motions are about subjects, not debate. A
// finance motion is lost or won on whether you can name a Pigovian tax
// in plain English. This hub is the domain-knowledge layer that sits
// next to /learn/formats (the debate-theory layer).
//
// Same shape as /learn/formats/{slug}: one function, one bank, all
// slugs share the renderer. Adding a topic = adding an entry to
// education-bank.mjs.
//
// Routing:
//   /education            → index (all topics)
//   /education/{slug}     → single primer (e.g. /education/finance)

import { EDUCATION_BANK, getEducationTopic, EDUCATION_SLUGS } from './lib/education-bank.mjs';

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
    // /learn/education            → null (index)
    // /learn/education/{slug}     → slug
    // /api/learn/education[/slug] → same shapes for direct function hits
    const m = u.pathname.match(/\/learn\/education\/?([a-z][a-z0-9-]*)?\/?$/i);
    if (!m) return undefined; // undefined = invalid path (vs null = index)
    return m[1] ? m[1].toLowerCase() : null;
  } catch { return undefined; }
}

function notFoundResponse() {
  const links = EDUCATION_SLUGS.map(s => `<a href="/learn/education/${s}">${esc(EDUCATION_BANK[s].name)}</a>`).join(' · ');
  const body = `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Topic not found · Education · Debate AI</title>
<meta name="robots" content="noindex">
<style>body{background:#000;color:#fff;font-family:system-ui,sans-serif;margin:0;padding:80px 24px;text-align:center}h1{font-size:2rem;margin-bottom:8px}p{color:rgba(255,255,255,.6);margin:0 0 20px}a{color:#a78bfa;text-decoration:none;font-weight:700}</style>
</head><body>
<h1>Unknown education topic</h1>
<p>Try one of: ${links}</p>
<p><a href="/learn/education">All topics</a> · <a href="/learn">Learn to argue</a> · <a href="/debate-ai">Start a round</a></p>
</body></html>`;
  return new Response(body, { status: 404, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}

// ───────── shared chrome (head + topbar + styles) ─────────

function renderHead(title, description, canonical, jsonLdBlocks) {
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
<meta property="og:site_name" content="Debate AI">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(description)}">
<meta name="twitter:image" content="${OG_IMAGE}">
<link rel="icon" href="/icons/icon-192.png">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&family=Playfair+Display:ital,wght@0,700;0,900;1,700;1,900&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/css/ui.css">
<script defer src="/js/track.js"></script>
${jsonLdBlocks.map(b => `<script type="application/ld+json">${jsonLd(b)}</script>`).join('\n')}
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{background:#000;color:#fff;font-family:'Inter',system-ui,-apple-system,sans-serif;line-height:1.6;-webkit-font-smoothing:antialiased}
  a{color:inherit;text-decoration:none}
  .shell{max-width:880px;margin:0 auto;padding:90px 24px 80px}
  .crumbs{font-size:.66rem;font-weight:700;letter-spacing:.16em;text-transform:uppercase;color:rgba(255,255,255,.42);margin-bottom:14px}
  .crumbs a{color:rgba(255,255,255,.6);transition:.15s}
  .crumbs a:hover{color:#a78bfa}
  .eyebrow{display:inline-flex;align-items:center;gap:8px;font-size:.7rem;font-weight:800;letter-spacing:.16em;text-transform:uppercase;color:#a78bfa;padding:5px 14px;border-radius:999px;background:rgba(139,92,246,.08);border:1px solid rgba(139,92,246,.32);margin-bottom:14px}
  .eyebrow-dot{width:7px;height:7px;border-radius:50%;background:#a78bfa;box-shadow:0 0 12px #a78bfa}
  h1{font-family:'Inter',sans-serif;font-weight:900;font-size:clamp(2rem,4.8vw,3.2rem);line-height:1.08;letter-spacing:-.025em;color:#fff;margin-bottom:18px}
  .lede{font-size:1.05rem;color:rgba(255,255,255,.78);max-width:680px;line-height:1.7;margin-bottom:36px}
  h2{font-family:'Inter',sans-serif;font-weight:800;font-size:1.4rem;letter-spacing:-.015em;margin:48px 0 18px;color:#fff}
  h2 .h2-num{display:inline-block;font-family:'Playfair Display',serif;font-weight:900;color:#a78bfa;margin-right:10px;font-size:.95em}
  .concept-list, .uses-list, .misc-list{display:grid;grid-template-columns:1fr;gap:14px}
  @media(min-width:680px){.concept-list{grid-template-columns:1fr 1fr}}
  .concept{padding:16px 18px;border-radius:12px;border:1px solid rgba(255,255,255,.10);background:rgba(255,255,255,.02)}
  .concept-term{font-weight:800;font-size:.92rem;color:#fff;margin-bottom:6px;letter-spacing:.01em}
  .concept-gloss{font-size:.88rem;line-height:1.6;color:rgba(255,255,255,.72)}
  .use{padding:16px 18px;border-radius:12px;border:1px solid rgba(139,92,246,.22);background:rgba(139,92,246,.04)}
  .use-shape{font-size:.62rem;font-weight:800;letter-spacing:.14em;text-transform:uppercase;color:#a78bfa;margin-bottom:6px}
  .use-example{font-size:.93rem;line-height:1.6;color:rgba(255,255,255,.85)}
  .misc{padding:14px 18px;border-radius:12px;border:1px solid rgba(255,255,255,.08);background:rgba(255,255,255,.02)}
  .misc-wrong{font-size:.85rem;color:rgba(252,165,165,.95);margin-bottom:6px;font-weight:600}
  .misc-wrong::before{content:"✗  ";color:#ef4444;font-weight:900}
  .misc-right{font-size:.88rem;line-height:1.6;color:rgba(255,255,255,.78)}
  .misc-right::before{content:"✓  ";color:#86efac;font-weight:900}
  .motion-list{display:flex;flex-direction:column;gap:8px;margin-top:8px}
  .motion-link{display:flex;align-items:center;justify-content:space-between;gap:14px;padding:12px 18px;border-radius:12px;border:1px solid rgba(255,255,255,.08);background:rgba(255,255,255,.02);transition:.15s}
  .motion-link:hover{border-color:rgba(239,68,68,.32);background:rgba(239,68,68,.04);transform:translateX(2px)}
  .motion-text{font-size:.92rem;line-height:1.45;color:rgba(255,255,255,.88);flex:1}
  .motion-arrow{font-size:.78rem;color:#ef4444;font-weight:800;letter-spacing:.04em;flex:0 0 auto}
  .read-list{display:grid;grid-template-columns:1fr;gap:14px;margin-top:8px}
  @media(min-width:680px){.read-list{grid-template-columns:1fr 1fr}}
  .read{padding:14px 18px;border-radius:12px;border:1px solid rgba(251,191,36,.20);background:rgba(251,191,36,.04)}
  .read-title{font-weight:800;font-size:.95rem;color:#fff;margin-bottom:3px;letter-spacing:.01em}
  .read-by{font-size:.78rem;color:#fbbf24;margin-bottom:8px;font-style:italic}
  .read-why{font-size:.85rem;line-height:1.55;color:rgba(255,255,255,.72)}
  .cta-card{padding:24px;border-radius:16px;border:1px solid rgba(239,68,68,.32);background:linear-gradient(135deg,rgba(239,68,68,.10),rgba(245,158,11,.04));text-align:center;margin-top:40px}
  .cta-card h3{font-size:1.2rem;font-weight:900;letter-spacing:-.01em;margin-bottom:8px}
  .cta-card p{font-size:.9rem;color:rgba(255,255,255,.68);margin-bottom:16px;max-width:520px;margin-left:auto;margin-right:auto}
  .cta-button{display:inline-flex;align-items:center;gap:8px;padding:12px 22px;border-radius:999px;background:#ef4444;color:#fff;font-weight:800;letter-spacing:.02em;font-size:.92rem;box-shadow:0 10px 30px -8px rgba(239,68,68,.5);transition:.15s}
  .cta-button:hover{transform:translateY(-1px);box-shadow:0 14px 34px -8px rgba(239,68,68,.7)}
  .related{margin-top:48px;padding-top:24px;border-top:1px solid rgba(255,255,255,.08)}
  .related h3{font-size:.7rem;font-weight:800;letter-spacing:.16em;text-transform:uppercase;color:rgba(255,255,255,.55);margin-bottom:14px}
  .related-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px}
  .related-link{padding:14px 16px;border-radius:12px;border:1px solid rgba(255,255,255,.08);background:rgba(255,255,255,.02);transition:.15s}
  .related-link:hover{border-color:rgba(139,92,246,.32);background:rgba(139,92,246,.05)}
  .related-eyebrow{font-size:.6rem;font-weight:800;letter-spacing:.14em;text-transform:uppercase;color:#a78bfa;margin-bottom:4px}
  .related-name{font-size:.92rem;font-weight:700;color:#fff}
  /* Hub-page card grid */
  .topic-grid{display:grid;grid-template-columns:1fr;gap:14px;margin-top:16px}
  @media(min-width:680px){.topic-grid{grid-template-columns:1fr 1fr}}
  .topic-card{display:block;padding:22px 24px;border-radius:16px;border:1px solid rgba(139,92,246,.22);background:linear-gradient(180deg,rgba(139,92,246,.06),rgba(139,92,246,.02));transition:.18s}
  .topic-card:hover{border-color:rgba(139,92,246,.55);background:linear-gradient(180deg,rgba(139,92,246,.10),rgba(139,92,246,.03));transform:translateY(-2px)}
  .topic-card-eyebrow{font-size:.62rem;font-weight:800;letter-spacing:.14em;text-transform:uppercase;color:#a78bfa;margin-bottom:8px}
  .topic-card-name{font-family:'Inter',sans-serif;font-weight:900;font-size:1.4rem;letter-spacing:-.015em;color:#fff;margin-bottom:10px;line-height:1.15}
  .topic-card-pitch{font-size:.92rem;line-height:1.55;color:rgba(255,255,255,.75)}
  .topic-card-foot{margin-top:14px;font-size:.72rem;font-weight:700;color:#a78bfa;letter-spacing:.04em}
  /* Quiz block — appears on per-primer pages, ignored on the hub. */
  .quiz-intro{font-size:.92rem;color:rgba(255,255,255,.7);line-height:1.6;margin-bottom:20px;max-width:640px}
  .quiz{display:flex;flex-direction:column;gap:18px;margin:0;padding:0;border:0}
  .qbox{padding:18px 20px;border-radius:14px;border:1px solid rgba(139,92,246,.18);background:rgba(139,92,246,.04);margin:0;display:block}
  .qbox legend{display:flex;align-items:flex-start;gap:10px;font-size:.96rem;font-weight:700;color:#fff;line-height:1.45;padding:0;margin:0 0 12px}
  .qnum{display:inline-flex;align-items:center;justify-content:center;flex:0 0 auto;width:24px;height:24px;border-radius:50%;background:rgba(139,92,246,.18);color:#c4b5fd;font-size:.72rem;font-weight:900;letter-spacing:.02em}
  .qopts{display:flex;flex-direction:column;gap:8px}
  .qopt{appearance:none;cursor:pointer;text-align:left;padding:11px 14px;border-radius:10px;border:1px solid rgba(255,255,255,.10);background:rgba(255,255,255,.02);color:rgba(255,255,255,.86);font:inherit;font-size:.88rem;line-height:1.45;transition:.15s;display:flex;align-items:center;gap:10px}
  .qopt::before{content:attr(data-letter);display:inline-flex;align-items:center;justify-content:center;width:22px;height:22px;border-radius:50%;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.10);font-size:.7rem;font-weight:800;color:rgba(255,255,255,.7);flex:0 0 auto;letter-spacing:0}
  .qopt:hover:not(:disabled){border-color:rgba(139,92,246,.42);background:rgba(139,92,246,.07);color:#fff}
  .qopt:disabled{cursor:default;opacity:.85}
  .qopt[data-state="correct"]{border-color:rgba(34,197,94,.55);background:rgba(34,197,94,.10);color:#dcfce7}
  .qopt[data-state="correct"]::before{background:#22c55e;color:#052e16;border-color:#22c55e}
  .qopt[data-state="wrong"]{border-color:rgba(239,68,68,.55);background:rgba(239,68,68,.10);color:#fee2e2}
  .qopt[data-state="wrong"]::before{background:#ef4444;color:#fff;border-color:#ef4444}
  .qopt[data-state="other-correct"]{border-color:rgba(34,197,94,.35);background:rgba(34,197,94,.04);color:rgba(220,252,231,.85)}
  .qopt[data-state="other-correct"]::before{background:rgba(34,197,94,.55);color:#052e16;border-color:rgba(34,197,94,.55)}
  .qfeedback{margin-top:14px;padding:12px 14px;border-radius:10px;background:rgba(0,0,0,.28);border:1px solid rgba(255,255,255,.06)}
  .qfb-line{font-size:.78rem;color:rgba(255,255,255,.55);margin-bottom:6px;font-weight:600;letter-spacing:.02em}
  .qfb-correct{display:inline-block;font-size:.6rem;font-weight:800;letter-spacing:.14em;text-transform:uppercase;color:#86efac;margin-right:8px}
  .qfb-why{font-size:.86rem;line-height:1.55;color:rgba(255,255,255,.82)}
  .qscore{margin-top:8px;padding:20px 22px;border-radius:14px;background:linear-gradient(135deg,rgba(139,92,246,.10),rgba(34,197,94,.06));border:1px solid rgba(139,92,246,.30);text-align:center}
  .qscore-line{font-size:1.1rem;font-weight:800;color:#fff;letter-spacing:-.01em;margin-bottom:4px}
  .qscore-line strong{font-size:1.4em;color:#c4b5fd;font-weight:900}
  .qscore-best{font-size:.78rem;color:rgba(255,255,255,.55);margin-bottom:14px}
  .qreset{appearance:none;cursor:pointer;padding:10px 20px;border-radius:999px;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.18);color:#fff;font:inherit;font-size:.82rem;font-weight:700;letter-spacing:.02em;transition:.15s}
  .qreset:hover{background:rgba(255,255,255,.12);border-color:rgba(255,255,255,.32)}
  footer{margin-top:60px;padding-top:24px;border-top:1px solid rgba(255,255,255,.06);display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px;font-size:.75rem;color:rgba(255,255,255,.4)}
  footer a:hover{color:#fff}
</style>
</head>
<body>
<div id="daTopbar"></div>
<script defer src="/js/topbar.js"></script>`;
}

// ───────── /education (hub) ─────────

function renderIndex() {
  const title = 'Education · Know the world before you argue it · Debate AI';
  const description = 'Subject primers and self-check quizzes on finance, feminist theory, international relations, and climate policy. Substantive world knowledge for debaters — the domain layer that wins motions.';
  const canonical = `${SITE_ORIGIN}/learn/education`;

  const ldCollection = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: 'Education · Know the world before you argue it',
    description,
    url: canonical,
    isPartOf: { '@type': 'WebPage', url: `${SITE_ORIGIN}/learn`, name: 'Learn to Argue' },
    publisher: {
      '@type': 'Organization',
      name: 'Debate AI',
      url: SITE_ORIGIN,
      logo: { '@type': 'ImageObject', url: `${SITE_ORIGIN}/icons/icon-512.png` },
    },
    hasPart: EDUCATION_SLUGS.map(slug => {
      const t = EDUCATION_BANK[slug];
      return {
        '@type': 'LearningResource',
        name: t.name,
        description: t.pitch,
        url: `${SITE_ORIGIN}/learn/education/${slug}`,
        learningResourceType: 'Primer',
        educationalLevel: 'High school / College',
        hasPart: {
          '@type': 'Quiz',
          name: `${t.name} self-check quiz`,
          numberOfQuestions: (t.quiz || []).length,
        },
      };
    }),
  };

  const ldBreadcrumbs = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Debate AI', item: SITE_ORIGIN + '/' },
      { '@type': 'ListItem', position: 2, name: 'Learn to Argue', item: `${SITE_ORIGIN}/learn` },
      { '@type': 'ListItem', position: 3, name: 'Education', item: canonical },
    ],
  };

  const cards = EDUCATION_SLUGS.map(slug => {
    const t = EDUCATION_BANK[slug];
    const qCount = (t.quiz || []).length;
    return `<a class="topic-card" href="/learn/education/${slug}">
      <div class="topic-card-eyebrow">${esc(t.eyebrow)}</div>
      <h2 class="topic-card-name" style="margin:0 0 10px">${esc(t.name)}</h2>
      <p class="topic-card-pitch">${esc(t.pitch)}</p>
      <div class="topic-card-foot">Primer + ${qCount}-question quiz →</div>
    </a>`;
  }).join('\n');

  return `${renderHead(title, description, canonical, [ldCollection, ldBreadcrumbs])}
<main class="shell">
  <nav class="crumbs"><a href="/">Debate AI</a> / <a href="/learn">Learn to Argue</a> / Education</nav>
  <span class="eyebrow"><span class="eyebrow-dot"></span>Education · Know the world</span>
  <h1>Subject primers for debaters.</h1>
  <p class="lede">Most motions are won or lost on whether you can do the actual subject out loud. This is the domain knowledge: finance, feminist theory, international relations, climate policy, and the concepts that come up in rounds. Read the primer, take the quiz, then argue a motion against the AI on the same topic.</p>

  <section class="topic-grid" aria-label="Education topics">
    ${cards}
  </section>

  <footer>
    <span>© 2026 Debate AI</span>
    <span><a href="/">Home</a> · <a href="/learn">Learn to Argue</a> · <a href="/topics">Topics hub</a> · <a href="/today">Today's motion</a></span>
  </footer>
</main>
</body></html>`;
}

// ───────── /education/{slug} (single primer) ─────────

function renderPrimer(slug) {
  const t = getEducationTopic(slug);
  if (!t) return null;

  const titleCore = `${t.name} for debaters · Concepts, quiz, motions`;
  const title = titleCore.length > 65 ? titleCore.slice(0, 62) + '…' : titleCore;
  const description = `${t.name} primer for debaters with a 5-question self-check quiz. ${t.pitch.slice(0, 140)}`;
  const canonical = `${SITE_ORIGIN}/learn/education/${t.slug}`;
  const motionEncoded = encodeURIComponent(t.sampleMotions[0] || '');
  const quiz = t.quiz || [];

  const ldArticle = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: `${t.name} for debaters`,
    description,
    author: { '@type': 'Organization', name: 'Debate AI', url: SITE_ORIGIN + '/' },
    publisher: {
      '@type': 'Organization',
      name: 'Debate AI',
      url: SITE_ORIGIN,
      logo: { '@type': 'ImageObject', url: `${SITE_ORIGIN}/icons/icon-512.png` },
    },
    mainEntityOfPage: canonical,
    url: canonical,
    inLanguage: 'en',
    keywords: t.keywords.join(', '),
    about: t.name,
  };

  const ldLearningResource = {
    '@context': 'https://schema.org',
    '@type': 'LearningResource',
    name: `${t.name} for debaters`,
    description: t.pitch,
    url: canonical,
    learningResourceType: 'Primer + quiz',
    educationalLevel: 'High school / College',
    teaches: t.concepts.map(c => c.term).join(', '),
    inLanguage: 'en',
    provider: { '@type': 'Organization', name: 'Debate AI', url: SITE_ORIGIN + '/' },
    isPartOf: { '@type': 'WebPage', url: `${SITE_ORIGIN}/learn/education`, name: 'Education' },
  };

  // Quiz schema. Each MCQ becomes a schema:Question with an acceptedAnswer
  // and suggestedAnswer[] for the wrong options. Gives Google a clean
  // structured representation so the page is eligible for
  // education-themed rich results.
  const ldQuiz = quiz.length ? {
    '@context': 'https://schema.org',
    '@type': 'Quiz',
    name: `${t.name} self-check quiz`,
    about: t.name,
    educationalLevel: 'High school / College',
    numberOfQuestions: quiz.length,
    hasPart: quiz.map((q, i) => ({
      '@type': 'Question',
      position: i + 1,
      name: q.q,
      eduQuestionType: 'Multiple choice',
      acceptedAnswer: { '@type': 'Answer', text: q.options[q.correct], comment: q.why },
      suggestedAnswer: q.options
        .map((opt, oi) => ({ opt, oi }))
        .filter(x => x.oi !== q.correct)
        .map(x => ({ '@type': 'Answer', text: x.opt })),
    })),
  } : null;

  const ldBreadcrumbs = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Debate AI', item: SITE_ORIGIN + '/' },
      { '@type': 'ListItem', position: 2, name: 'Learn to Argue', item: `${SITE_ORIGIN}/learn` },
      { '@type': 'ListItem', position: 3, name: 'Education', item: `${SITE_ORIGIN}/learn/education` },
      { '@type': 'ListItem', position: 4, name: t.name, item: canonical },
    ],
  };

  const concepts = t.concepts.map(c => `<div class="concept">
    <div class="concept-term">${esc(c.term)}</div>
    <div class="concept-gloss">${esc(c.gloss)}</div>
  </div>`).join('\n');

  const uses = t.debateUses.map(u => `<div class="use">
    <div class="use-shape">${esc(u.shape)}</div>
    <div class="use-example">${esc(u.example)}</div>
  </div>`).join('\n');

  const miscs = t.misconceptions.map(m => `<div class="misc">
    <div class="misc-wrong">${esc(m.wrong)}</div>
    <div class="misc-right">${esc(m.right)}</div>
  </div>`).join('\n');

  const motions = t.sampleMotions.map(m => `<a class="motion-link" href="/debate-ai?motion=${encodeURIComponent(m)}">
    <span class="motion-text">${esc(m)}</span>
    <span class="motion-arrow">Argue →</span>
  </a>`).join('\n');

  const reads = t.deeperReads.map(r => `<div class="read">
    <div class="read-title">${esc(r.title)}</div>
    <div class="read-by">by ${esc(r.by)}</div>
    <div class="read-why">${esc(r.why)}</div>
  </div>`).join('\n');

  const others = EDUCATION_SLUGS.filter(s => s !== slug).map(s => `<a class="related-link" href="/learn/education/${s}">
    <div class="related-eyebrow">${esc(EDUCATION_BANK[s].eyebrow)}</div>
    <div class="related-name">${esc(EDUCATION_BANK[s].name)}</div>
  </a>`).join('\n');

  const quizBox = quiz.length ? `
  <h2><span class="h2-num">04</span>Self-check quiz</h2>
  <p class="quiz-intro">Five questions to check what stuck. Click an option, the right answer and the why appear below. Your best score saves locally so you can come back and beat it.</p>
  <form class="quiz" data-quiz-slug="${esc(t.slug)}" data-quiz-total="${quiz.length}" onsubmit="return false">
    ${quiz.map((q, qi) => `
    <fieldset class="qbox" data-qi="${qi}">
      <legend><span class="qnum">${qi + 1}</span><span>${esc(q.q)}</span></legend>
      <div class="qopts">
        ${q.options.map((opt, oi) => `<button type="button" class="qopt" data-letter="${String.fromCharCode(65 + oi)}" data-correct="${oi === q.correct ? '1' : '0'}" data-qi="${qi}" data-oi="${oi}">${esc(opt)}</button>`).join('\n        ')}
      </div>
      <div class="qfeedback" hidden>
        <div class="qfb-line"><span class="qfb-correct">Correct answer</span><span>${esc(q.options[q.correct])}</span></div>
        <div class="qfb-why">${esc(q.why)}</div>
      </div>
    </fieldset>`).join('')}
    <div class="qscore" hidden>
      <div class="qscore-line">You scored <strong data-score>0</strong> / ${quiz.length}</div>
      <div class="qscore-best" data-best></div>
      <button type="button" class="qreset">Reset and try again</button>
    </div>
  </form>` : '';

  const headBlocks = [ldArticle, ldLearningResource, ldBreadcrumbs];
  if (ldQuiz) headBlocks.splice(2, 0, ldQuiz); // insert before breadcrumbs

  return `${renderHead(title, description, canonical, headBlocks)}
<main class="shell">
  <nav class="crumbs"><a href="/">Debate AI</a> / <a href="/learn">Learn to Argue</a> / <a href="/learn/education">Education</a> / ${esc(t.name)}</nav>
  <span class="eyebrow"><span class="eyebrow-dot"></span>${esc(t.eyebrow)}</span>
  <h1>${esc(t.name)}.</h1>
  <p class="lede">${esc(t.pitch)}</p>

  <h2><span class="h2-num">01</span>Core concepts</h2>
  <div class="concept-list">${concepts}</div>

  <h2><span class="h2-num">02</span>How this shows up in debates</h2>
  <div class="uses-list">${uses}</div>

  <h2><span class="h2-num">03</span>What people get wrong</h2>
  <div class="misc-list">${miscs}</div>
${quizBox}
  <h2><span class="h2-num">05</span>Sample motions</h2>
  <div class="motion-list">${motions}</div>

  <h2><span class="h2-num">06</span>Where to go deeper</h2>
  <div class="read-list">${reads}</div>

  <div class="cta-card">
    <h3>Argue a motion on ${esc(t.name)}.</h3>
    <p>Pick a side. The AI takes the other. Three minutes per speech, judge ballot at the end.</p>
    <a class="cta-button" href="/debate-ai?motion=${motionEncoded}">Argue this →</a>
  </div>

  <section class="related" aria-label="Other education topics">
    <h3>Other primers</h3>
    <div class="related-grid">${others}</div>
  </section>

  <footer>
    <span>© 2026 Debate AI</span>
    <span><a href="/">Home</a> · <a href="/learn/education">All primers</a> · <a href="/learn">Learn to Argue</a> · <a href="/today">Today's motion</a></span>
  </footer>
</main>
${quiz.length ? renderQuizScript() : ''}
</body></html>`;
}

// ───────── quiz interactivity ─────────
// Vanilla JS, no framework. Reads quiz state from the DOM (data-attrs
// set by the renderer), so a re-render serializes the whole UI without
// extra props plumbing. localStorage stores best score per slug under
// the key "da-edu-best-{slug}" — small payload (one int per topic).

function renderQuizScript() {
  return `<script>
(function(){
  var form = document.querySelector('form.quiz');
  if (!form) return;
  var slug = form.getAttribute('data-quiz-slug');
  var total = parseInt(form.getAttribute('data-quiz-total'), 10) || 0;
  var bestKey = 'da-edu-best-' + slug;
  var state = { answered: 0, correct: 0 };

  function showFeedback(qi, picked, isCorrect) {
    var box = form.querySelector('fieldset[data-qi="' + qi + '"]');
    if (!box) return;
    var opts = box.querySelectorAll('.qopt');
    opts.forEach(function(b){
      b.disabled = true;
      var correct = b.getAttribute('data-correct') === '1';
      var oi = parseInt(b.getAttribute('data-oi'), 10);
      if (oi === picked) {
        b.setAttribute('data-state', isCorrect ? 'correct' : 'wrong');
      } else if (correct) {
        b.setAttribute('data-state', isCorrect ? '' : 'other-correct');
      }
    });
    var fb = box.querySelector('.qfeedback');
    if (fb) fb.hidden = false;
  }

  function maybeShowScore() {
    if (state.answered < total) return;
    var scoreBox = form.querySelector('.qscore');
    if (!scoreBox) return;
    scoreBox.hidden = false;
    var scoreEl = scoreBox.querySelector('[data-score]');
    if (scoreEl) scoreEl.textContent = state.correct;
    var prevBest = 0;
    try { prevBest = parseInt(localStorage.getItem(bestKey) || '0', 10) || 0; } catch (e) {}
    var newBest = state.correct > prevBest ? state.correct : prevBest;
    try { localStorage.setItem(bestKey, String(newBest)); } catch (e) {}
    var bestEl = scoreBox.querySelector('[data-best]');
    if (bestEl) {
      bestEl.textContent = state.correct > prevBest && prevBest > 0
        ? 'New best, beating your previous ' + prevBest + '.'
        : (newBest > 0 ? 'Best score: ' + newBest + ' / ' + total + '.' : '');
    }
    scoreBox.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    try { if (typeof gtag === 'function') gtag('event', 'edu_quiz_complete', { slug: slug, score: state.correct, total: total }); } catch (e) {}
  }

  form.addEventListener('click', function(ev) {
    var btn = ev.target.closest('.qopt');
    if (!btn || btn.disabled) {
      // Reset button?
      var reset = ev.target.closest('.qreset');
      if (!reset) return;
      // Restore initial state without re-rendering.
      form.querySelectorAll('.qopt').forEach(function(b){
        b.disabled = false;
        b.removeAttribute('data-state');
      });
      form.querySelectorAll('.qfeedback').forEach(function(f){ f.hidden = true; });
      var sb = form.querySelector('.qscore'); if (sb) sb.hidden = true;
      state = { answered: 0, correct: 0 };
      try { if (typeof gtag === 'function') gtag('event', 'edu_quiz_reset', { slug: slug }); } catch (e) {}
      return;
    }
    var qi = parseInt(btn.getAttribute('data-qi'), 10);
    var oi = parseInt(btn.getAttribute('data-oi'), 10);
    var correct = btn.getAttribute('data-correct') === '1';
    showFeedback(qi, oi, correct);
    state.answered++;
    if (correct) state.correct++;
    maybeShowScore();
  });
})();
</script>`;
}

export default async (request) => {
  const slug = extractSlugFromUrl(request.url);
  if (slug === undefined) return notFoundResponse();

  // Index page
  if (slug === null) {
    const html = renderIndex();
    return new Response(html, {
      status: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'public, max-age=3600, s-maxage=3600',
      },
    });
  }

  const html = renderPrimer(slug);
  if (!html) return notFoundResponse();
  return new Response(html, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'public, max-age=3600, s-maxage=3600',
    },
  });
};

export const config = {
  path: ['/api/learn/education', '/api/learn/education/:slug'],
};
