// GET /r/:id — server-rendered public round page.
//
// The Quora/Genius play. Every published round becomes its own
// indexable URL with the motion as H1, the speeches as article body,
// the RFD as analysis, and a "Try this motion against the AI" CTA.
// Google crawls these; users land via search or share; the CTA bounces
// them into the funnel with motion pre-filled.
//
// Implementation notes:
//  - Server-rendered HTML (NOT a client-side fetch + hydrate). Googlebot
//    does run JS but for reliable, fast crawl we ship the content in the
//    initial response body.
//  - All user-supplied strings pass through `esc()`. The render template
//    is the only place those values touch raw HTML.
//  - viewCount increments are fire-and-forget so the response stays fast.
//  - 404 page returns 404 status so Google doesn't index missing URLs.

import { getDb, FieldValue } from './lib/firestore.mjs';
import { esc, jsonLd } from './lib/public-round.mjs';

const SITE_ORIGIN = 'https://debateit.com';
const OG_IMAGE = `${SITE_ORIGIN}/og-image.png`;

function notFoundResponse(request) {
  const id = extractIdFromUrl(request.url);
  const safeId = esc(id || '');
  const body = `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Round not found · DebateIt</title>
<meta name="robots" content="noindex">
<link rel="stylesheet" href="/css/ui.css">
<style>body{background:#000;color:#fff;font-family:Inter,system-ui,sans-serif;margin:0;padding:80px 24px;text-align:center}h1{font-size:2rem;margin-bottom:8px}p{color:rgba(255,255,255,.6);margin:0 0 20px}a{color:#ef4444;text-decoration:none;font-weight:700}</style>
</head><body>
<h1>That round isn't here</h1>
<p>The round at <code>/r/${safeId}</code> was either removed or never existed.</p>
<a href="/debate-it">Start a new round →</a>
</body></html>`;
  return new Response(body, {
    status: 404,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
}

function extractIdFromUrl(url) {
  try {
    const u = new URL(url);
    // Two valid sources of the ID: the user-facing /r/{id} URL (when the
    // request comes through the netlify.toml rewrite, which preserves
    // the original path), and the direct /api/r/{id} hit. Match either.
    const m = u.pathname.match(/\/r\/([a-z0-9]{4,32})\/?$/i);
    return m ? m[1] : null;
  } catch { return null; }
}

function describeDoc(d) {
  const sideTxt = d.sideLabel || d.side || '';
  const verdict = d.winner === 'user' ? 'the human debater won'
    : d.winner === 'ai' ? 'the AI debater won'
    : 'split decision';
  const formatTxt = d.formatName || d.format || 'debate';
  const sideClause = sideTxt ? ` arguing ${sideTxt}` : '';
  const opponent = d.voiceName ? ` against ${d.voiceName}` : '';
  return `AI-judged ${formatTxt} round on "${d.motion}".${sideClause ? ` ${(d.displayName || 'A debater').replace(/[.]$/, '')}${sideClause}${opponent}.` : ''} Verdict: ${verdict}.`;
}

function renderSpeechBlock(s, i) {
  const whoLabel = s.who === 'ai' ? 'AI opponent' : 'Human debater';
  const speakerLabel = s.speaker || (s.who === 'ai' ? 'AI' : 'You');
  const sideLabel = s.side ? ` · ${esc(s.side)}` : '';
  const tone = s.who === 'ai' ? '#fca5a5' : '#86efac';
  return `<article class="speech" data-who="${esc(s.who)}">
  <header class="speech-head">
    <span class="speech-num">Speech ${i + 1}</span>
    <span class="speech-who" style="color:${tone}">${esc(speakerLabel)}${sideLabel}</span>
  </header>
  <div class="speech-body">${esc(s.text).replace(/\n+/g, '</p><p>').replace(/^/, '<p>').concat('</p>')}</div>
</article>`;
}

function renderPage(id, doc) {
  const motion = doc.motion || '';
  const titleCore = motion.length > 60 ? motion.slice(0, 57) + '…' : motion;
  const title = `${titleCore} · DebateIt`;
  const description = describeDoc(doc);
  const canonical = `${SITE_ORIGIN}/r/${id}`;
  const byline = doc.displayName || 'Anonymous debater';
  const motionEncoded = encodeURIComponent(motion);

  // JSON-LD as Article — Google's strongest signal for long-form
  // content. articleBody is a flat concat of all speeches; we keep
  // word count realistic so it's parsed as substantive content.
  const articleBody = (doc.speeches || []).map(s => s.text).join('\n\n');
  const ldArticle = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: motion,
    description,
    author: {
      '@type': 'Person',
      name: byline,
    },
    publisher: {
      '@type': 'Organization',
      name: 'DebateIt',
      url: SITE_ORIGIN,
      logo: { '@type': 'ImageObject', url: `${SITE_ORIGIN}/icons/icon-192.png` },
    },
    datePublished: doc.publishedAt?.toDate?.()?.toISOString?.() || new Date().toISOString(),
    mainEntityOfPage: { '@type': 'WebPage', '@id': canonical },
    articleBody: articleBody.slice(0, 30000),
  };

  const speechesHtml = (doc.speeches || []).map(renderSpeechBlock).join('\n');

  const verdictBlock = doc.winner
    ? `<section class="verdict ${esc(doc.winner)}">
    <span class="verdict-label">Judge's decision</span>
    <span class="verdict-winner">${doc.winner === 'user' ? 'Human wins' : 'AI wins'}</span>
    ${doc.decision ? `<p class="verdict-decision">${esc(doc.decision)}</p>` : ''}
  </section>`
    : '';

  const rfdBlock = doc.rfd
    ? `<section class="rfd">
    <h2>Judge's reasoning</h2>
    <div class="rfd-body">${esc(doc.rfd).replace(/\n+/g, '</p><p>').replace(/^/, '<p>').concat('</p>')}</div>
  </section>`
    : '';

  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${canonical}">
<meta property="og:title" content="${esc(titleCore)} · DebateIt">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${canonical}">
<meta property="og:type" content="article">
<meta property="og:image" content="${OG_IMAGE}">
<meta property="og:site_name" content="DebateIt">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(titleCore)} · DebateIt">
<meta name="twitter:description" content="${esc(description)}">
<meta name="twitter:image" content="${OG_IMAGE}">
<link rel="icon" href="/icons/icon-192.png">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&family=Playfair+Display:ital,wght@1,700;1,900&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/css/ui.css">
<script defer src="/js/track.js"></script>
<script type="application/ld+json">${jsonLd(ldArticle)}</script>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{background:#000;color:#fff;font-family:'Inter',system-ui,-apple-system,sans-serif;line-height:1.6;-webkit-font-smoothing:antialiased}
  a{color:inherit;text-decoration:none}
  .shell{max-width:760px;margin:0 auto;padding:90px 24px 80px}
  .eyebrow{display:inline-block;font-size:.7rem;font-weight:800;letter-spacing:.16em;text-transform:uppercase;color:#ef4444;padding:5px 12px;border-radius:999px;background:rgba(239,68,68,.08);border:1px solid rgba(239,68,68,.32);margin-bottom:18px}
  h1{font-weight:900;font-size:clamp(1.8rem,4.2vw,2.8rem);line-height:1.12;letter-spacing:-.02em;margin-bottom:14px;color:#fff}
  .byline{font-size:.85rem;color:rgba(255,255,255,.55);margin-bottom:36px}
  .byline strong{color:#fff;font-weight:600}
  .verdict{padding:18px 22px;border-radius:14px;margin-bottom:32px;border:1px solid;text-align:center}
  .verdict.user{background:rgba(34,197,94,.06);border-color:rgba(34,197,94,.22)}
  .verdict.ai{background:rgba(239,68,68,.06);border-color:rgba(239,68,68,.22)}
  .verdict-label{display:block;font-size:.65rem;font-weight:800;letter-spacing:.16em;text-transform:uppercase;color:rgba(255,255,255,.5);margin-bottom:6px}
  .verdict-winner{display:block;font-size:1.4rem;font-weight:900;letter-spacing:-.01em;margin-bottom:10px}
  .verdict.user .verdict-winner{color:#22c55e}
  .verdict.ai .verdict-winner{color:#ef4444}
  .verdict-decision{font-size:.92rem;color:rgba(255,255,255,.75);max-width:560px;margin:0 auto;line-height:1.55}
  .speeches{display:flex;flex-direction:column;gap:24px;margin-bottom:40px}
  .speech{padding:18px 22px;border-radius:14px;border:1px solid rgba(255,255,255,.08);background:rgba(255,255,255,.02)}
  .speech[data-who=ai]{border-color:rgba(239,68,68,.18);background:rgba(239,68,68,.03)}
  .speech[data-who=user]{border-color:rgba(34,197,94,.18);background:rgba(34,197,94,.03)}
  .speech-head{display:flex;justify-content:space-between;align-items:baseline;margin-bottom:12px;flex-wrap:wrap;gap:8px}
  .speech-num{font-size:.62rem;font-weight:800;letter-spacing:.14em;text-transform:uppercase;color:rgba(255,255,255,.4)}
  .speech-who{font-size:.78rem;font-weight:700;letter-spacing:.04em}
  .speech-body p{margin:0 0 10px;font-size:.94rem;line-height:1.65;color:rgba(255,255,255,.88)}
  .speech-body p:last-child{margin-bottom:0}
  .rfd{padding:22px 24px;border-radius:14px;border:1px solid rgba(251,191,36,.22);background:rgba(251,191,36,.04);margin-bottom:40px}
  .rfd h2{font-size:.7rem;font-weight:800;letter-spacing:.16em;text-transform:uppercase;color:#fbbf24;margin-bottom:14px}
  .rfd-body p{margin:0 0 10px;font-size:.9rem;line-height:1.65;color:rgba(255,255,255,.78)}
  .cta-card{padding:24px;border-radius:16px;border:1px solid rgba(239,68,68,.32);background:linear-gradient(135deg,rgba(239,68,68,.08),rgba(245,158,11,.04));text-align:center;margin-bottom:32px}
  .cta-card h3{font-size:1.2rem;font-weight:900;letter-spacing:-.01em;margin-bottom:8px}
  .cta-card p{font-size:.88rem;color:rgba(255,255,255,.65);margin-bottom:16px;max-width:480px;margin-left:auto;margin-right:auto}
  .cta-button{display:inline-flex;align-items:center;gap:8px;padding:12px 22px;border-radius:999px;background:#ef4444;color:#fff;font-weight:800;letter-spacing:.02em;font-size:.92rem;box-shadow:0 10px 30px -8px rgba(239,68,68,.5);transition:transform .15s,box-shadow .15s}
  .cta-button:hover{transform:translateY(-1px);box-shadow:0 14px 34px -8px rgba(239,68,68,.7)}
  footer{margin-top:60px;padding-top:24px;border-top:1px solid rgba(255,255,255,.06);display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px;font-size:.75rem;color:rgba(255,255,255,.4)}
  footer a:hover{color:#fff}
</style>
</head>
<body>
<div id="daTopbar"></div>
<script defer src="/js/topbar.js"></script>

<main class="shell">
  <span class="eyebrow">Public round</span>
  <h1>${esc(motion)}</h1>
  <p class="byline">
    By <strong>${esc(byline)}</strong>
    ${doc.formatName ? ` · ${esc(doc.formatName)}` : ''}
    ${doc.sideLabel ? ` · ${esc(doc.sideLabel)}` : ''}
    ${doc.voiceName ? ` · vs ${esc(doc.voiceName)}` : ''}
  </p>

  ${verdictBlock}

  <section class="speeches" aria-label="Round transcript">
    ${speechesHtml}
  </section>

  ${rfdBlock}

  <div class="cta-card">
    <h3>Try this motion yourself.</h3>
    <p>Same motion. Pick your side. Three minutes per speech. The AI debates back. Judge tells you what landed.</p>
    <a class="cta-button" href="/debate-it?motion=${motionEncoded}">Argue this motion →</a>
  </div>

  <footer>
    <span>© 2026 DebateIt</span>
    <span><a href="/">Home</a> · <a href="/debate-it">New round</a> · <a href="/champions">Champions</a> · <a href="/community#rounds">Browse rounds</a></span>
  </footer>
</main>
</body></html>`;
}

export default async (request) => {
  const id = extractIdFromUrl(request.url);
  if (!id) return notFoundResponse(request);

  let doc = null;
  try {
    const db = getDb();
    const snap = await db.collection('public_rounds').doc(id).get();
    if (!snap.exists) return notFoundResponse(request);
    doc = snap.data();
  } catch (err) {
    console.error('r.mjs read failed:', err.message);
    return notFoundResponse(request);
  }

  // Fire-and-forget view increment. Don't await — the response shouldn't
  // wait on a write that doesn't affect what the user sees.
  try {
    const db = getDb();
    db.collection('public_rounds').doc(id).update({
      viewCount: FieldValue.increment(1),
    }).catch(() => {});
  } catch (e) { /* swallow */ }

  const html = renderPage(id, doc);
  return new Response(html, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      // Allow brief edge caching but keep Google-crawl freshness.
      'Cache-Control': 'public, max-age=300, s-maxage=300',
    },
  });
};

export const config = {
  // Function lives under /api/* for routing reliability (consistent with
  // every other Netlify function in this repo). The public URL `/r/{id}`
  // is rewritten to this path via a status=200 redirect in netlify.toml,
  // so users see /r/abc123 in the address bar.
  path: '/api/r/:id',
};
