// /rounds — public listing of all published debate rounds.
//
// Pairs with /r/{id} (singular page per round) to give the SEO carpet
// a discoverable index. Each round in the public_rounds collection
// gets a card here with motion, format, byline, and winner badge,
// linked to its /r/{id} page.
//
// Why this matters:
//   1. Google needs an indexable listing page to surface the /r/{id}
//      long-tail. A sitemap alone is OK; an actual hyperlinked listing
//      is much stronger for internal link equity.
//   2. Users who land on /rounds via search or share can browse to
//      adjacent rounds. /r/{id} alone is a dead-end leaf node.
//   3. The page is its own indexable URL for the keyword "AI debate
//      rounds" plus the rolling content of motion-titles below the H1.
//
// Routing:
//   /rounds         → rewritten by netlify.toml to /api/rounds
//   /api/rounds     → this function directly
//
// Cache: 5 minutes at the edge. New publishes appear with a small lag
// but the listing stays cheap at scale.

import { getDb } from './lib/firestore.mjs';

const SITE_ORIGIN = 'https://debateai.com';
const OG_IMAGE = `${SITE_ORIGIN}/og-image.png`;
const LIMIT = 24;

const HTML_ESCAPE = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
function esc(s) {
  if (s === null || s === undefined) return '';
  return String(s).replace(/[&<>"']/g, c => HTML_ESCAPE[c]);
}
function jsonLd(obj) {
  return JSON.stringify(obj).replace(/</g, '\\u003c');
}

// Same 5-min in-memory cache pattern today.mjs uses for its aggregator.
// Keeps Firestore reads near zero at scale; listing freshness lags by
// up to 5 minutes which is fine for an SEO listing.
let listingCache = { fetchedAt: 0, rounds: [] };
const CACHE_TTL_MS = 5 * 60 * 1000;

async function fetchRecentRounds() {
  const now = Date.now();
  if (listingCache.rounds.length && now - listingCache.fetchedAt < CACHE_TTL_MS) {
    return listingCache.rounds;
  }
  try {
    const db = getDb();
    const snap = await db.collection('public_rounds')
      .orderBy('publishedAt', 'desc')
      .limit(LIMIT)
      .get();
    const rounds = (snap.docs || []).map(d => {
      const data = d.data() || {};
      return {
        id: d.id,
        motion: data.motion || '',
        displayName: data.displayName || 'Anonymous',
        formatName: data.formatName || data.format || '',
        sideLabel: data.sideLabel || data.side || '',
        voiceName: data.voiceName || '',
        winner: data.winner || null,
        publishedAt: data.publishedAt?.toDate?.()?.toISOString?.() || null,
      };
    }).filter(r => r.motion && r.id);
    listingCache = { fetchedAt: now, rounds };
    return rounds;
  } catch (err) {
    console.warn('[/rounds] firestore query failed:', err.message);
    return listingCache.rounds;
  }
}

function renderRoundCard(r) {
  const winnerBadge = r.winner === 'user'
    ? '<span class="winner-badge user">Human wins</span>'
    : r.winner === 'ai'
      ? '<span class="winner-badge ai">AI wins</span>'
      : '';
  const meta = [r.formatName, r.sideLabel, r.voiceName ? 'vs ' + r.voiceName : ''].filter(Boolean).map(esc).join(' · ');
  const dateLabel = r.publishedAt
    ? new Date(r.publishedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    : '';
  return `<a class="round-card" href="/r/${esc(r.id)}">
    <div class="round-card-head">
      <span class="round-card-byline">${esc(r.displayName)}</span>
      ${dateLabel ? `<span class="round-card-date">${esc(dateLabel)}</span>` : ''}
    </div>
    <div class="round-card-motion">${esc((r.motion || '').slice(0, 180))}</div>
    <div class="round-card-meta">${meta || '&nbsp;'}</div>
    ${winnerBadge}
  </a>`;
}

function renderEmptyState() {
  return `<div class="empty-state">
    <div class="empty-eyebrow">No published rounds yet</div>
    <h2>Be the first.</h2>
    <p>Finish a debate round, publish it, get a permanent URL at <code>/r/{id}</code> with the motion as H1, the full transcript as article body, and a "Try this motion against the AI" CTA. Indexed by Google over time.</p>
    <a class="cta-button" href="/debate-ai">Start a round →</a>
  </div>`;
}

function renderPage(rounds) {
  const title = 'Public debate rounds · AI-judged transcripts';
  const description = 'Browse published debate rounds from the Debate AI community. Each round has the motion, full speeches, and the judge ballot. Indexable, sharable, and you can try the same motion yourself.';
  const canonical = `${SITE_ORIGIN}/rounds`;

  const ldList = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: 'Public debate rounds on Debate AI',
    description,
    numberOfItems: rounds.length,
    itemListElement: rounds.slice(0, 10).map((r, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      url: `${SITE_ORIGIN}/r/${r.id}`,
      name: r.motion.slice(0, 110),
    })),
  };

  const body = rounds.length ? rounds.map(renderRoundCard).join('\n') : renderEmptyState();
  const cardCount = rounds.length;

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
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/css/ui.css">
<script defer src="/js/track.js"></script>
<script type="application/ld+json">${jsonLd(ldList)}</script>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{background:#000;color:#fff;font-family:'Inter',system-ui,-apple-system,sans-serif;line-height:1.55;-webkit-font-smoothing:antialiased}
  a{color:inherit;text-decoration:none}
  .shell{max-width:1100px;margin:0 auto;padding:90px 24px 80px}
  .header-block{margin-bottom:36px}
  .eyebrow{display:inline-flex;align-items:center;gap:8px;font-size:.7rem;font-weight:800;letter-spacing:.16em;text-transform:uppercase;color:#a78bfa;padding:5px 14px;border-radius:999px;background:rgba(139,92,246,.08);border:1px solid rgba(139,92,246,.32);margin-bottom:14px}
  .eyebrow-dot{width:7px;height:7px;border-radius:50%;background:#a78bfa;box-shadow:0 0 12px #a78bfa}
  h1{font-family:'Inter',sans-serif;font-weight:900;font-size:clamp(2rem,4.8vw,3.2rem);line-height:1.08;letter-spacing:-.025em;color:#fff;margin-bottom:14px}
  .header-lede{font-size:1.05rem;color:rgba(255,255,255,.72);max-width:680px;line-height:1.6}
  .count-strip{margin:18px 0 0;font-size:.8rem;color:rgba(255,255,255,.5);font-variant-numeric:tabular-nums}
  .rounds-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:14px;margin-bottom:48px}
  .round-card{display:flex;flex-direction:column;padding:18px 20px;border-radius:14px;border:1px solid rgba(255,255,255,.10);background:rgba(255,255,255,.02);transition:.18s;position:relative}
  .round-card:hover{border-color:rgba(139,92,246,.42);background:rgba(139,92,246,.05);transform:translateY(-2px)}
  .round-card-head{display:flex;justify-content:space-between;align-items:baseline;margin-bottom:10px;font-size:.62rem;letter-spacing:.06em}
  .round-card-byline{font-weight:800;color:#c4b5fd;text-transform:uppercase}
  .round-card-date{color:rgba(255,255,255,.4)}
  .round-card-motion{font-size:.98rem;font-weight:600;color:rgba(255,255,255,.92);line-height:1.45;margin-bottom:12px;flex:1}
  .round-card-meta{font-size:.72rem;color:rgba(255,255,255,.55);margin-bottom:8px}
  .winner-badge{display:inline-block;align-self:flex-start;font-size:.58rem;font-weight:800;letter-spacing:.14em;text-transform:uppercase;padding:3px 10px;border-radius:999px;margin-top:4px}
  .winner-badge.user{background:rgba(34,197,94,.14);color:#86efac;border:1px solid rgba(34,197,94,.32)}
  .winner-badge.ai{background:rgba(239,68,68,.14);color:#fca5a5;border:1px solid rgba(239,68,68,.32)}
  .empty-state{padding:60px 32px;border-radius:18px;border:1px dashed rgba(139,92,246,.32);background:rgba(139,92,246,.04);text-align:center;max-width:680px;margin:0 auto}
  .empty-state .empty-eyebrow{font-size:.62rem;font-weight:800;letter-spacing:.14em;text-transform:uppercase;color:#a78bfa;margin-bottom:12px}
  .empty-state h2{font-size:1.6rem;font-weight:900;letter-spacing:-.015em;margin-bottom:14px}
  .empty-state p{font-size:.92rem;color:rgba(255,255,255,.72);line-height:1.6;max-width:520px;margin:0 auto 24px}
  .empty-state code{font-family:'Inter',monospace;background:rgba(255,255,255,.06);padding:2px 6px;border-radius:5px;font-size:.86em}
  .cta-button{display:inline-flex;align-items:center;gap:8px;padding:12px 22px;border-radius:999px;background:#ef4444;color:#fff;font-weight:800;letter-spacing:.02em;font-size:.92rem;box-shadow:0 10px 30px -8px rgba(239,68,68,.5);transition:.15s}
  .cta-button:hover{transform:translateY(-1px);box-shadow:0 14px 34px -8px rgba(239,68,68,.7)}
  footer{margin-top:60px;padding-top:24px;border-top:1px solid rgba(255,255,255,.06);display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px;font-size:.75rem;color:rgba(255,255,255,.4)}
  footer a:hover{color:#fff}
</style>
</head>
<body>
<div id="daTopbar"></div>
<script defer src="/js/topbar.js"></script>

<main class="shell">
  <header class="header-block">
    <span class="eyebrow"><span class="eyebrow-dot"></span>Public rounds</span>
    <h1>Debate rounds, published.</h1>
    <p class="header-lede">Real rounds that finished and got an AI ballot. Click any card for the full transcript, judge reasoning, and a one-tap "argue this motion yourself" CTA. New rounds appear here as users publish.</p>
    ${cardCount ? `<div class="count-strip">Showing the ${cardCount} most recent.</div>` : ''}
  </header>

  ${cardCount ? `<section class="rounds-grid" aria-label="Recent public debate rounds">
    ${body}
  </section>` : body}

  <div style="display:flex;justify-content:center;margin-top:24px;flex-wrap:wrap;gap:12px">
    <a class="cta-button" href="/debate-ai">Run your own round →</a>
    <a class="cta-button" href="/today" style="background:rgba(255,255,255,.06);color:#fff;box-shadow:none;border:1px solid rgba(255,255,255,.18)">Today's motion →</a>
  </div>

  <footer>
    <span>© 2026 Debate AI</span>
    <span><a href="/">Home</a> · <a href="/debate-ai">New round</a> · <a href="/today">Today's motion</a> · <a href="/learn/formats/apda">Format guides</a></span>
  </footer>
</main>
</body></html>`;
}

export default async (request) => {
  const rounds = await fetchRecentRounds();
  const html = renderPage(rounds);
  return new Response(html, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'public, max-age=300, s-maxage=300',
    },
  });
};

export const config = {
  // Wildcard for the same reason today.mjs uses it — Netlify v2 :param
  // syntax has been flaky for deep paths in this codebase, and the
  // listing only needs a single URL (no slug).
  path: '/api/rounds',
};
