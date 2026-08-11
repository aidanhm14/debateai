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
import { indexableAsyncRound, FORMAT_NAMES, TURN_SPEC } from './lib/async-rounds.mjs';

const SITE_ORIGIN = 'https://itsdebatable.com';
const OG_IMAGE = `${SITE_ORIGIN}/og-image.png?v=floor1`;

function notFoundResponse(request) {
  const id = extractIdFromUrl(request.url);
  const safeId = esc(id || '');
  const body = `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Round not found · Debatable</title>
<meta name="robots" content="noindex">
<link rel="stylesheet" href="/css/ui.css">
<style>body{background:#000;color:#fff;font-family:Inter,system-ui,sans-serif;margin:0;padding:80px 24px;text-align:center}h1{font-size:2rem;margin-bottom:8px}p{color:rgba(255,255,255,.6);margin:0 0 20px}a{color:#ef4444;text-decoration:none;font-weight:700}</style>
</head><body>
<h1>That round isn't here</h1>
<p>The round at <code>/r/${safeId}</code> was either removed or never existed.</p>
<a href="/practice">Start a new round →</a>
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
    // Hyphens are allowed so async_rounds seed ids ('seed-' + motion
    // slug) resolve here too; those never render, they redirect to the
    // live /rounds surface.
    const m = u.pathname.match(/\/r\/([a-z0-9][a-z0-9-]{3,79})\/?$/i);
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

// One stylesheet for both round templates (published practice rounds
// and completed async rounds) so the two pages read as one surface.
const PAGE_CSS = `
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
  .verdict-points{font-size:.78rem;color:rgba(255,255,255,.55);margin-top:8px}
  .speeches{display:flex;flex-direction:column;gap:24px;margin-bottom:40px}
  .speech{padding:18px 22px;border-radius:14px;border:1px solid rgba(255,255,255,.08);background:rgba(255,255,255,.02)}
  .speech[data-who=ai]{border-color:rgba(239,68,68,.18);background:rgba(239,68,68,.03)}
  .speech[data-who=user]{border-color:rgba(34,197,94,.18);background:rgba(34,197,94,.03)}
  .speech-head{display:flex;justify-content:space-between;align-items:baseline;margin-bottom:12px;flex-wrap:wrap;gap:8px}
  .speech-num{font-size:.62rem;font-weight:800;letter-spacing:.14em;text-transform:uppercase;color:rgba(255,255,255,.68)}
  .speech-who{font-size:.78rem;font-weight:700;letter-spacing:.04em}
  .speech-body p{margin:0 0 10px;font-size:.94rem;line-height:1.65;color:rgba(255,255,255,.88)}
  .speech-body p:last-child{margin-bottom:0}
  .speech-body p.no-transcript{color:rgba(255,255,255,.68);font-size:.85rem}
  .waived-note{font-size:.8rem;color:rgba(255,255,255,.68);margin:-24px 0 40px;text-align:center}
  .vote-strip{padding:12px 18px;border-radius:12px;border:1px solid rgba(255,255,255,.1);background:rgba(255,255,255,.03);font-size:.85rem;color:rgba(255,255,255,.7);text-align:center;margin-bottom:32px}
  .vote-strip strong{color:#fff}
  .vote-strip a{color:#ef4444;font-weight:700}
  .rfd{padding:22px 24px;border-radius:14px;border:1px solid rgba(251,191,36,.22);background:rgba(251,191,36,.04);margin-bottom:40px}
  .rfd h2{font-size:.7rem;font-weight:800;letter-spacing:.16em;text-transform:uppercase;color:#fbbf24;margin-bottom:14px}
  .rfd-body p{margin:0 0 10px;font-size:.9rem;line-height:1.65;color:rgba(255,255,255,.78)}
  .dims{padding:20px 24px 14px;border-radius:14px;border:1px solid rgba(255,255,255,.1);background:rgba(255,255,255,.02);margin-bottom:40px}
  .dims h2{font-size:.7rem;font-weight:800;letter-spacing:.16em;text-transform:uppercase;color:rgba(255,255,255,.5);margin-bottom:4px}
  .dims-key{font-size:.78rem;color:rgba(255,255,255,.55);margin-bottom:12px}
  .dims-key strong,.dim-track b{font-weight:700}
  .dims-prop{color:#86efac}
  .dims-opp{color:#fca5a5}
  .dim-row{display:grid;grid-template-columns:110px 1fr;gap:12px;align-items:center;margin:8px 0}
  .dim-label{font-size:.8rem;font-weight:600;color:rgba(255,255,255,.75)}
  .dim-track{display:flex;align-items:center;gap:10px}
  .dim-track b{font-size:.8rem;font-variant-numeric:tabular-nums;min-width:20px}
  .dim-track b.dims-prop{text-align:right}
  .dim-bar{flex:1;height:7px;border-radius:99px;overflow:hidden;display:flex;background:rgba(239,68,68,.65)}
  .dim-bar i{display:block;height:100%;background:#22c55e}
  .clash{padding:20px 24px 8px;border-radius:14px;border:1px solid rgba(255,255,255,.1);background:rgba(255,255,255,.02);margin-bottom:40px}
  .clash h2{font-size:.7rem;font-weight:800;letter-spacing:.16em;text-transform:uppercase;color:rgba(255,255,255,.5);margin-bottom:4px}
  .clash-key{font-size:.78rem;color:rgba(255,255,255,.5);margin-bottom:14px;line-height:1.55}
  .clash-row{padding:12px 0;border-top:1px solid rgba(255,255,255,.07)}
  .clash-head{display:flex;align-items:baseline;gap:10px;flex-wrap:wrap;margin-bottom:6px}
  .clash-claim{font-size:.88rem;font-weight:700;color:rgba(255,255,255,.88)}
  .clash-by{font-size:.68rem;font-weight:800;letter-spacing:.1em;text-transform:uppercase}
  .clash-tag{font-size:.66rem;font-weight:800;letter-spacing:.08em;text-transform:uppercase;padding:3px 9px;border-radius:999px;border:1px solid currentColor}
  .clash-tag[data-l="dropped"]{color:#fca5a5}
  .clash-tag[data-l="conceded"]{color:#fbbf24}
  .clash-tag[data-l="rebutted"]{color:#86efac}
  .clash-tag[data-l="self-contradiction"]{color:#c4b5fd}
  .clash-q{margin:4px 0;padding-left:12px;border-left:2px solid rgba(255,255,255,.15);font-size:.82rem;line-height:1.6;color:rgba(255,255,255,.62)}
  .clash-q b{display:block;font-size:.64rem;font-weight:800;letter-spacing:.1em;text-transform:uppercase;color:rgba(255,255,255,.68);margin-bottom:2px}
  .clash-note{font-size:.8rem;color:rgba(255,255,255,.55);margin-top:6px}
  .cta-card{padding:24px;border-radius:16px;border:1px solid rgba(239,68,68,.32);background:linear-gradient(135deg,rgba(239,68,68,.08),rgba(245,158,11,.04));text-align:center;margin-bottom:32px}
  .cta-card h3{font-size:1.2rem;font-weight:900;letter-spacing:-.01em;margin-bottom:8px}
  .cta-card p{font-size:.88rem;color:rgba(255,255,255,.65);margin-bottom:16px;max-width:480px;margin-left:auto;margin-right:auto}
  .cta-row{display:flex;gap:10px;justify-content:center;flex-wrap:wrap}
  .cta-button{display:inline-flex;align-items:center;gap:8px;padding:12px 22px;border-radius:999px;background:#ef4444;color:#fff;font-weight:800;letter-spacing:.02em;font-size:.92rem;box-shadow:0 10px 30px -8px rgba(239,68,68,.5);transition:transform .15s,box-shadow .15s}
  .cta-button:hover{transform:translateY(-1px);box-shadow:0 14px 34px -8px rgba(239,68,68,.7)}
  .cta-button--ghost{background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.18);box-shadow:none}
  .cta-button--ghost:hover{box-shadow:none;background:rgba(255,255,255,.1)}
  footer{margin-top:60px;padding-top:24px;border-top:1px solid rgba(255,255,255,.06);display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px;font-size:.75rem;color:rgba(255,255,255,.68)}
  footer a:hover{color:#fff}
`;

// Exported for render harnesses/tests; Netlify only uses default+config.
export function renderPage(id, doc) {
  const motion = doc.motion || '';
  const titleCore = motion.length > 60 ? motion.slice(0, 57) + '…' : motion;
  const title = `${titleCore} · Debatable`;
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
      name: 'Debatable',
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
<meta property="og:title" content="${esc(titleCore)} · Debatable">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${canonical}">
<meta property="og:type" content="article">
<meta property="og:image" content="${OG_IMAGE}">
<meta property="og:site_name" content="Debatable">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(titleCore)} · Debatable">
<meta name="twitter:description" content="${esc(description)}">
<meta name="twitter:image" content="${OG_IMAGE}">
<link rel="icon" href="/icons/icon-192.png">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&family=Playfair+Display:ital,wght@1,700;1,900&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/css/ui.css">
<script defer src="/js/track.js"></script><script defer src="/js/home-magnet.js"></script>
<script type="application/ld+json">${jsonLd(ldArticle)}</script>
<style>${PAGE_CSS}</style>
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
    <a class="cta-button" href="/practice?motion=${motionEncoded}">Argue this motion →</a>
  </div>

  <footer>
    <span>© 2026 Debatable</span>
    <span><a href="/">Home</a> · <a href="/practice">New round</a> · <a href="/champions">Champions</a> · <a href="/community#rounds">Browse rounds</a></span>
  </footer>
</main>
</body></html>`;
}

// ── Async rounds (recorded speeches traded on /rounds) ─────────────
// Completed public human-opened async rounds render here too, at the
// same /r/{id} namespace, because /rounds is client-rendered with a
// single canonical to /rounds — without this page a finished public
// round is invisible to Google. Transcripts only: the audio/video
// turns live in Netlify Blobs and stay on the interactive page.

const TURN_SIDE = { 1: 'prop', 2: 'opp', 3: 'prop' };

// Judge's scorecard axes. async-sweep writes {prop,opp} ints 1-10 per
// axis; all four must validate or the block is dropped whole, so
// ballots judged before the schema carried dimensions render unchanged.
const DIM_AXES = [
  ['clarity', 'Clarity'],
  ['reasoning', 'Reasoning'],
  ['responsiveness', 'Clash'],
  ['weighing', 'Weighing'],
];

function validDims(b) {
  const dm = b && b.dimensions;
  if (!dm || typeof dm !== 'object') return null;
  const out = [];
  for (const [key, label] of DIM_AXES) {
    const a = dm[key];
    const prop = Number(a && a.prop);
    const opp = Number(a && a.opp);
    if (!Number.isFinite(prop) || !Number.isFinite(opp)) return null;
    out.push({
      label,
      prop: Math.max(0, Math.min(10, prop)),
      opp: Math.max(0, Math.min(10, opp)),
    });
  }
  return out;
}

// The clash map, rendered as the flow the ballot was built on. Advisory
// by construction: it carries no score and no winner, and every row shows
// the quotes it rests on so a reader can overrule it on sight. Rows were
// already quote-verified against the transcript server-side; anything that
// failed never reached the doc.
const CLASH_TAG = {
  rebutted: 'Answered',
  conceded: 'Conceded',
  'self-contradiction': 'Contradicts their own',
  dropped: 'Dropped',
};

function renderClashRow(c, propName, oppName) {
  const label = CLASH_TAG[c.label] ? c.label : 'rebutted';
  const byProp = c.by === 'prop';
  const who = byProp ? propName : oppName;
  const answering = byProp ? oppName : propName;
  const resp = (c.responseQuote || '').trim();
  return `<div class="clash-row">
      <div class="clash-head">
        <span class="clash-by ${byProp ? 'dims-prop' : 'dims-opp'}">${byProp ? 'Prop' : 'Opp'}</span>
        <span class="clash-claim">${esc(c.claim)}</span>
        <span class="clash-tag" data-l="${label}">${CLASH_TAG[label]}</span>
      </div>
      <p class="clash-q"><b>${esc(who)} said</b>${esc(c.claimQuote)}</p>
      ${resp ? `<p class="clash-q"><b>${esc(answering)} said</b>${esc(resp)}</p>` : ''}
      ${c.note ? `<p class="clash-note">${esc(c.note)}</p>` : ''}
    </div>`;
}

function fmtClock(sec) {
  const s = Math.max(0, Math.round(Number(sec) || 0));
  if (!s) return '';
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function describeAsyncDoc(d) {
  const formatTxt = FORMAT_NAMES[d.format] || d.format || 'debate';
  const propName = (d.prop && d.prop.name) || 'Proposition';
  const oppName = (d.opp && d.opp.name) || 'Opposition';
  const w = d.ballot && d.ballot.winner;
  const verdict = w === 'prop' ? `${propName} takes the ballot`
    : w === 'opp' ? `${oppName} takes the ballot`
    : 'awaiting ballot';
  return `Recorded ${formatTxt} round on "${d.motion}". ${propName} (Prop) vs ${oppName} (Opp), AI judge on the flow. Verdict: ${verdict}.`;
}

function renderAsyncTurn(t, i) {
  const side = TURN_SIDE[t.n] || (i % 2 === 0 ? 'prop' : 'opp');
  const spec = TURN_SPEC[t.n];
  const label = spec ? spec.label : `Turn ${t.n || i + 1}`;
  const clock = fmtClock(t.durationSec);
  const name = t.name || (side === 'prop' ? 'Prop' : 'Opp');
  const tone = side === 'prop' ? '#86efac' : '#fca5a5';
  const body = (t.transcript || '').trim();
  const bodyHtml = body
    ? `<p>${esc(body).replace(/\n+/g, '</p><p>')}</p>`
    : '<p class="no-transcript">Spoken turn with no transcript. Listen on the live round page.</p>';
  return `<article class="speech" data-who="${side === 'prop' ? 'user' : 'ai'}">
  <header class="speech-head">
    <span class="speech-num">${esc(label)} · ${side === 'prop' ? 'Prop' : 'Opp'}${clock ? ` · ${clock}` : ''}</span>
    <span class="speech-who" style="color:${tone}">${esc(name)}${t.ai && !/\bAI\b/.test(name) ? ' · AI' : ''}</span>
  </header>
  <div class="speech-body">${bodyHtml}</div>
</article>`;
}

export function renderAsyncPage(id, d) {
  const motion = d.motion || '';
  const titleCore = motion.length > 60 ? motion.slice(0, 57) + '…' : motion;
  const title = `${titleCore} · Debatable`;
  const description = describeAsyncDoc(d);
  const canonical = `${SITE_ORIGIN}/r/${id}`;
  const formatTxt = FORMAT_NAMES[d.format] || d.format || '';
  const propName = (d.prop && d.prop.name) || 'Proposition';
  const oppName = (d.opp && d.opp.name) || 'Opposition';
  const motionEncoded = encodeURIComponent(motion);
  const roundHref = `/rounds?r=${encodeURIComponent(id)}`;
  const turns = (d.turns || []).slice(0, 12);
  const publishedIso = new Date(d.completedAt || Date.now()).toISOString();

  const articleBody = turns.map(t => (t.transcript || '').trim()).filter(Boolean).join('\n\n');
  const ldArticle = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: motion,
    description,
    author: { '@type': 'Person', name: propName },
    publisher: {
      '@type': 'Organization',
      name: 'Debatable',
      url: SITE_ORIGIN,
      logo: { '@type': 'ImageObject', url: `${SITE_ORIGIN}/icons/icon-192.png` },
    },
    datePublished: publishedIso,
    mainEntityOfPage: { '@type': 'WebPage', '@id': canonical },
    articleBody: articleBody.slice(0, 30000),
  };

  const b = d.ballot || null;
  const winnerSide = b && (b.winner === 'prop' || b.winner === 'opp') ? b.winner : null;
  const points = b && (typeof b.propPoints === 'number' || typeof b.oppPoints === 'number')
    ? `<span class="verdict-points">Speaker points: Prop <strong>${esc(b.propPoints)}</strong> · Opp <strong>${esc(b.oppPoints)}</strong></span>` : '';
  const verdictBlock = winnerSide
    ? `<section class="verdict ${winnerSide === 'prop' ? 'user' : 'ai'}">
    <span class="verdict-label">Judge's decision</span>
    <span class="verdict-winner">${winnerSide === 'prop' ? esc(propName) + ' wins for Prop' : esc(oppName) + ' wins for Opp'}</span>
    ${points}
  </section>`
    : '';

  const rfdBlock = b && b.rfd
    ? `<section class="rfd">
    <h2>Judge's reasoning</h2>
    <div class="rfd-body"><p>${esc(b.rfd).replace(/\n+/g, '</p><p>')}</p></div>
  </section>`
    : '';

  const dims = validDims(b);
  const dimBlock = dims
    ? `<section class="dims" aria-label="Judge's scorecard">
    <h2>Judge's scorecard</h2>
    <p class="dims-key"><strong class="dims-prop">${esc(propName)}</strong> vs <strong class="dims-opp">${esc(oppName)}</strong> · each axis 1 to 10</p>
    ${dims.map(x => {
      const share = (x.prop + x.opp) ? Math.round(x.prop / (x.prop + x.opp) * 100) : 50;
      return `<div class="dim-row"><span class="dim-label">${x.label}</span><span class="dim-track"><b class="dims-prop">${x.prop}</b><span class="dim-bar"><i style="width:${share}%"></i></span><b class="dims-opp">${x.opp}</b></span></div>`;
    }).join('\n    ')}
  </section>`
    : '';

  const clashRows = (d.clashMap && Array.isArray(d.clashMap.clashes) ? d.clashMap.clashes : []).slice(0, 8);
  const clashBlock = clashRows.length
    ? `<section class="clash" aria-label="Clash map">
    <h2>Clash map</h2>
    <p class="clash-key">Every argument that carried weight, and what the other side did with it. Advisory: it does not decide the round or move a single point. Read the quotes and disagree with any row.</p>
    ${clashRows.map(c => renderClashRow(c, propName, oppName)).join('\n    ')}
  </section>`
    : '';

  const votes = d.votes || {};
  const voteTotal = (Number(votes.prop) || 0) + (Number(votes.opp) || 0);
  const voteStrip = voteTotal > 0
    ? `<section class="vote-strip">Crowd ballot so far: <strong>Prop ${Number(votes.prop) || 0}</strong> · <strong>Opp ${Number(votes.opp) || 0}</strong> · <a href="${roundHref}">cast yours →</a></section>`
    : '';

  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${canonical}">
<meta property="og:title" content="${esc(titleCore)} · Debatable">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${canonical}">
<meta property="og:type" content="article">
<meta property="og:image" content="${OG_IMAGE}">
<meta property="og:site_name" content="Debatable">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(titleCore)} · Debatable">
<meta name="twitter:description" content="${esc(description)}">
<meta name="twitter:image" content="${OG_IMAGE}">
<link rel="icon" href="/icons/icon-192.png">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/css/ui.css">
<script defer src="/js/track.js"></script><script defer src="/js/home-magnet.js"></script>
<script type="application/ld+json">${jsonLd(ldArticle)}</script>
<style>${PAGE_CSS}</style>
</head>
<body>
<div id="daTopbar"></div>
<script defer src="/js/topbar.js"></script>

<main class="shell">
  <span class="eyebrow">Public round · recorded</span>
  <h1>${esc(motion)}</h1>
  <p class="byline">
    <strong>${esc(propName)}</strong> (Prop) vs <strong>${esc(oppName)}</strong> (Opp)
    ${formatTxt ? ` · ${esc(formatTxt)}` : ''}
     · spoken turns, AI-judged
  </p>

  ${verdictBlock}

  <section class="speeches" aria-label="Round transcript">
    ${turns.map(renderAsyncTurn).join('\n')}
  </section>
  ${d.replyWaived ? '<p class="waived-note">The reply window closed unused, so the round went to ballot on two speeches.</p>' : ''}

  ${dimBlock}

  ${clashBlock}

  ${rfdBlock}

  ${voteStrip}

  <div class="cta-card">
    <h3>Hear it argued out loud.</h3>
    <p>The recorded speeches, the ballot, and the crowd vote live on the round page. Or take the motion yourself; the AI argues back.</p>
    <div class="cta-row">
      <a class="cta-button" href="${roundHref}">Listen to this round →</a>
      <a class="cta-button cta-button--ghost" href="/practice?motion=${motionEncoded}">Argue this motion →</a>
    </div>
  </div>

  <footer>
    <span>© 2026 Debatable</span>
    <span><a href="/">Home</a> · <a href="/rounds">Browse rounds</a> · <a href="/practice">New round</a> · <a href="/champions">Champions</a></span>
  </footer>
</main>
</body></html>`;
}

function htmlResponse(html) {
  return new Response(html, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      // Allow brief edge caching but keep Google-crawl freshness.
      'Cache-Control': 'public, max-age=300, s-maxage=300',
    },
  });
}

export default async (request) => {
  const id = extractIdFromUrl(request.url);
  if (!id) return notFoundResponse(request);

  const db = getDb();

  let doc = null;
  try {
    const snap = await db.collection('public_rounds').doc(id).get();
    if (snap.exists) doc = snap.data();
  } catch (err) {
    console.error('r.mjs read failed:', err.message);
    return notFoundResponse(request);
  }

  if (doc) {
    // Fire-and-forget view increment. Don't await — the response
    // shouldn't wait on a write that doesn't affect what the user sees.
    try {
      db.collection('public_rounds').doc(id).update({
        viewCount: FieldValue.increment(1),
      }).catch(() => {});
    } catch (e) { /* swallow */ }
    return htmlResponse(renderPage(id, doc));
  }

  // Fallback: async_rounds. Indexable rounds (see indexableAsyncRound)
  // render as full pages; anything else that exists 302s to the live
  // /rounds surface, which already handles open windows, unlisted
  // rounds, and AI-seeded challenges without offering them to Google.
  let asyncDoc = null;
  try {
    const snap = await db.collection('async_rounds').doc(id).get();
    if (snap.exists) asyncDoc = snap.data();
  } catch (err) {
    console.error('r.mjs async read failed:', err.message);
  }
  if (!asyncDoc) return notFoundResponse(request);
  if (!indexableAsyncRound(id, asyncDoc)) {
    if (asyncDoc.hidden) return notFoundResponse(request);
    return new Response(null, {
      status: 302,
      headers: { Location: `/rounds?r=${encodeURIComponent(id)}` },
    });
  }
  return htmlResponse(renderAsyncPage(id, asyncDoc));
};

export const config = {
  // Function lives under /api/* for routing reliability (consistent with
  // every other Netlify function in this repo). The public URL `/r/{id}`
  // is rewritten to this path via a status=200 redirect in netlify.toml,
  // so users see /r/abc123 in the address bar.
  path: '/api/r/:id',
};
