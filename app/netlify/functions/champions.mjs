// /champions — Friday Night Finals roll of honor.
//
// Cult-build surface: every Friday Night Final winner pins here
// permanently. Empty-state today (Final #1 = Fri 26 Jun 2026), grows
// as winners land. Same shape + SEO posture as /today and /rounds —
// server-rendered, edge-cached, indexable.
//
// Reads from the `champions` Firestore collection (admin SDK). One doc
// per Final, descending by `finalsAt` (when the bracket was judged).
// Schema:
//   champions/{id} {
//     finalsAt: Timestamp,        // when the Final was judged
//     finalNumber: number,        // 1, 2, 3, … — pinned in copy
//     winnerName: string,         // first-name + last-initial, opt-in
//     runnerName?: string,        // optional, same rule
//     motion: string,             // the impromptu/prepared motion
//     formatName: string,         // 'APDA', 'BP', etc
//     rfdSnippet?: string,        // 2-3 sentences from Aidan's live RFD
//     roundId?: string,           // optional link to /r/{roundId}
//     uid?: string,               // server-only, never rendered
//   }

import { getDb } from './lib/firestore.mjs';

const SITE_ORIGIN = 'https://debateai.com';
const OG_IMAGE = `${SITE_ORIGIN}/og-image.png?v=debateit1`;

// In-memory cache. Champions land at most once a week, so a 10-min
// edge cache + this 10-min process cache keep Firestore reads near
// zero even under sustained traffic.
let championsCache = { fetchedAt: 0, list: [] };
const CHAMPIONS_TTL_MS = 10 * 60 * 1000;
const CHAMPIONS_LIMIT = 50;

async function fetchChampions() {
  const now = Date.now();
  if (championsCache.list.length && now - championsCache.fetchedAt < CHAMPIONS_TTL_MS) {
    return championsCache.list;
  }
  try {
    const db = getDb();
    const snap = await db.collection('champions')
      .orderBy('finalsAt', 'desc')
      .limit(CHAMPIONS_LIMIT)
      .get();
    const list = (snap.docs || []).map(d => {
      const data = d.data() || {};
      const ts = data.finalsAt;
      const finalsAt = ts && typeof ts.toDate === 'function' ? ts.toDate() : (ts ? new Date(ts) : null);
      return {
        id: d.id,
        finalsAt,
        finalNumber: data.finalNumber || null,
        winnerName: data.winnerName || '',
        runnerName: data.runnerName || '',
        motion: data.motion || '',
        formatName: data.formatName || '',
        rfdSnippet: data.rfdSnippet || '',
        roundId: data.roundId || '',
      };
    }).filter(c => c.winnerName && c.motion);
    championsCache = { fetchedAt: now, list };
    return list;
  } catch (err) {
    console.warn('[champions] Firestore fetch failed:', err.message);
    // Soft-fail to empty. The empty state is the canonical pre-launch
    // experience anyway, so a Firestore blip just leaves us there.
    return championsCache.list;
  }
}

const HTML_ESCAPE = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
function esc(s) {
  if (s === null || s === undefined) return '';
  return String(s).replace(/[&<>"']/g, c => HTML_ESCAPE[c]);
}

function jsonLd(obj) {
  return JSON.stringify(obj).replace(/</g, '\\u003c');
}

function prettyDate(d) {
  if (!d) return '';
  try {
    return d.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' });
  } catch { return ''; }
}

// Hardcoded "next Final" config — bumps as Aidan schedules each one.
// Living here (not in env vars or Firestore) so the page renders the
// same for every visitor without an extra read; flip-and-deploy when
// the next bracket lands.
const NEXT_FINAL = {
  number: 1,
  date: 'Friday, June 26, 2026',
  time: '8:30 PM ET / 5:30 AM IST Sat',
  format: 'APDA 1v1, impromptu, 8 minutes per side',
  discordUrl: 'https://discord.gg/WMHZW9BKvJ',
};

function renderChampionCard(c) {
  const numLabel = c.finalNumber ? `Final #${c.finalNumber}` : '';
  const meta = [numLabel, prettyDate(c.finalsAt), c.formatName].filter(Boolean).map(esc).join(' · ');
  const link = c.roundId ? `/r/${esc(c.roundId)}` : null;
  const inner = `
    <div class="champ-meta">${meta}</div>
    <div class="champ-headline">
      <span class="champ-winner">${esc(c.winnerName)}</span>
      <span class="champ-vs"> def. </span>
      <span class="champ-runner">${esc(c.runnerName || 'a worthy opponent')}</span>
    </div>
    <div class="champ-motion">${esc(c.motion)}</div>
    ${c.rfdSnippet ? `<div class="champ-rfd"><span class="champ-rfd-label">Judge's note</span> ${esc(c.rfdSnippet)}</div>` : ''}
  `;
  return link
    ? `<a class="champ-card champ-card-link" href="${link}">${inner}<div class="champ-foot">Read the round →</div></a>`
    : `<div class="champ-card">${inner}</div>`;
}

function renderEmptyState() {
  return `<section class="empty-state">
    <div class="empty-eyebrow">Coming up</div>
    <h2 class="empty-title">Final #${NEXT_FINAL.number} · ${esc(NEXT_FINAL.date)}</h2>
    <p class="empty-time">${esc(NEXT_FINAL.time)}</p>
    <p class="empty-format">${esc(NEXT_FINAL.format)}</p>
    <p class="empty-body">
      Two debaters. One motion. Founder judges live. Winner pins to this page permanently
      and takes the Lifetime tier. Audience seats are unlimited.
    </p>
    <a class="empty-cta" href="${esc(NEXT_FINAL.discordUrl)}" target="_blank" rel="noopener">
      Sign up in the Discord →
    </a>
    <p class="empty-fineprint">
      React with 🥊 in <code>#friday-night-finals</code>. First two through the door are in,
      next two are backups.
    </p>
  </section>`;
}

function renderPage(champions) {
  const hasAny = champions && champions.length > 0;
  const title = hasAny
    ? `Friday Night Finals · Champions of DebateIt`
    : `Friday Night Finals · The bracket starts ${NEXT_FINAL.date}`;
  const description = hasAny
    ? `${champions.length} Friday Night Final winners on DebateIt. One impromptu round a week, judged live by the founder. Winners pin permanently.`
    : `Friday Night Finals begin ${NEXT_FINAL.date}. Two debaters, one motion, founder-judged live on Discord. Winners pin to a permanent champions page.`;
  const canonical = `${SITE_ORIGIN}/champions`;

  const ldArticle = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: 'Friday Night Finals · Champions',
    description,
    url: canonical,
    publisher: {
      '@type': 'Organization',
      name: 'DebateIt',
      url: SITE_ORIGIN,
      logo: { '@type': 'ImageObject', url: `${SITE_ORIGIN}/icons/icon-192.png` },
    },
    hasPart: hasAny ? champions.slice(0, 10).map(c => ({
      '@type': 'Article',
      headline: `${c.winnerName} wins Final${c.finalNumber ? ' #' + c.finalNumber : ''}`,
      datePublished: c.finalsAt ? c.finalsAt.toISOString() : undefined,
      about: c.motion,
      author: { '@type': 'Person', name: c.winnerName },
    })) : undefined,
  };

  return `<!doctype html>
<html lang="en" data-force-theme="crimson"><head>
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
<link rel="icon" href="/icons/icon-192.png">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&family=Playfair+Display:ital,wght@0,700;0,900;1,700;1,900&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/css/ui.css">
<script defer src="/js/track.js"></script>
<script type="application/ld+json">${jsonLd(ldArticle)}</script>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{background:#000;color:#fff;font-family:'Inter',system-ui,-apple-system,sans-serif;line-height:1.6;-webkit-font-smoothing:antialiased}
  a{color:inherit;text-decoration:none}
  .shell{max-width:880px;margin:0 auto;padding:90px 24px 80px}
  .eyebrow{display:inline-flex;align-items:center;gap:8px;font-size:.7rem;font-weight:800;letter-spacing:.16em;text-transform:uppercase;color:#fbbf24;padding:5px 14px;border-radius:999px;background:rgba(251,191,36,.08);border:1px solid rgba(251,191,36,.32);margin-bottom:14px}
  .eyebrow-dot{width:7px;height:7px;border-radius:50%;background:#fbbf24;box-shadow:0 0 12px #fbbf24}
  h1{font-family:'Playfair Display',serif;font-weight:900;font-size:clamp(2.2rem,5vw,3.4rem);line-height:1.05;letter-spacing:-.02em;margin-bottom:14px;color:#fff}
  .hero-sub{font-size:1.05rem;line-height:1.7;color:rgba(255,255,255,.78);max-width:640px;margin-bottom:48px}

  /* Empty state — pre-Final #1 surface */
  .empty-state{padding:34px 32px;border-radius:18px;border:1px solid rgba(251,191,36,.32);background:linear-gradient(180deg,rgba(251,191,36,.07),rgba(251,191,36,.02));margin-bottom:48px;text-align:center}
  .empty-eyebrow{font-size:.62rem;font-weight:800;letter-spacing:.18em;text-transform:uppercase;color:#fbbf24;margin-bottom:10px}
  .empty-title{font-family:'Playfair Display',serif;font-weight:900;font-size:clamp(1.6rem,3.5vw,2.2rem);line-height:1.15;color:#fff;margin-bottom:6px}
  .empty-time{font-size:.92rem;font-weight:700;color:#fbbf24;margin-bottom:4px;letter-spacing:.01em}
  .empty-format{font-size:.86rem;color:rgba(255,255,255,.72);margin-bottom:18px}
  .empty-body{font-size:.95rem;line-height:1.65;color:rgba(255,255,255,.82);max-width:540px;margin:0 auto 22px}
  .empty-cta{display:inline-flex;align-items:center;gap:6px;padding:13px 26px;border-radius:999px;background:#5865f2;color:#fff;font-weight:800;letter-spacing:.02em;font-size:.95rem;box-shadow:0 10px 30px -8px rgba(88,101,242,.55);transition:transform .15s,box-shadow .15s}
  .empty-cta:hover{transform:translateY(-1px);box-shadow:0 14px 34px -8px rgba(88,101,242,.7)}
  .empty-fineprint{font-size:.78rem;color:rgba(255,255,255,.55);margin-top:18px;line-height:1.55}
  .empty-fineprint code{background:rgba(255,255,255,.06);padding:1px 6px;border-radius:4px;font-size:.74rem;color:#fff}

  /* Champion card — once winners land */
  .champ-grid{display:grid;grid-template-columns:1fr;gap:16px;margin-bottom:40px}
  @media(min-width:680px){.champ-grid{grid-template-columns:1fr 1fr}}
  .champ-card{display:block;padding:22px 24px;border-radius:14px;border:1px solid rgba(251,191,36,.22);background:linear-gradient(180deg,rgba(251,191,36,.05),rgba(251,191,36,.01));transition:.15s}
  .champ-card-link{cursor:pointer}
  .champ-card-link:hover{border-color:rgba(251,191,36,.55);background:linear-gradient(180deg,rgba(251,191,36,.10),rgba(251,191,36,.03));transform:translateY(-1px)}
  .champ-meta{font-size:.62rem;font-weight:800;letter-spacing:.14em;text-transform:uppercase;color:#fbbf24;margin-bottom:10px}
  .champ-headline{font-family:'Playfair Display',serif;font-weight:700;font-style:italic;font-size:1.32rem;line-height:1.25;margin-bottom:12px}
  .champ-winner{color:#fff;font-weight:900;font-style:normal}
  .champ-vs{color:rgba(255,255,255,.42);font-style:normal;font-weight:400;font-size:.92rem;font-family:'Inter',sans-serif}
  .champ-runner{color:rgba(255,255,255,.72);font-style:normal;font-weight:500}
  .champ-motion{font-size:.92rem;color:rgba(255,255,255,.85);line-height:1.55;margin-bottom:12px}
  .champ-rfd{font-size:.82rem;color:rgba(255,255,255,.65);line-height:1.55;padding:10px 12px;border-radius:8px;background:rgba(0,0,0,.28);border:1px solid rgba(255,255,255,.06)}
  .champ-rfd-label{display:block;font-size:.6rem;font-weight:800;letter-spacing:.14em;text-transform:uppercase;color:rgba(251,191,36,.85);margin-bottom:4px}
  .champ-foot{font-size:.72rem;color:#fbbf24;margin-top:12px;font-weight:700;letter-spacing:.04em}

  /* "How this works" rail beneath the grid */
  .how-rail{padding-top:32px;border-top:1px solid rgba(255,255,255,.08);margin-top:8px}
  .how-rail h3{font-size:.7rem;font-weight:800;letter-spacing:.16em;text-transform:uppercase;color:rgba(255,255,255,.65);margin-bottom:14px}
  .how-list{display:grid;grid-template-columns:1fr;gap:14px}
  @media(min-width:680px){.how-list{grid-template-columns:1fr 1fr 1fr}}
  .how-item{padding:14px 16px;border-radius:10px;border:1px solid rgba(255,255,255,.08);background:rgba(255,255,255,.02)}
  .how-num{display:inline-block;font-family:'Playfair Display',serif;font-weight:900;font-size:1.1rem;color:#fbbf24;margin-bottom:4px}
  .how-text{font-size:.85rem;line-height:1.55;color:rgba(255,255,255,.82)}
  .how-text strong{color:#fff;font-weight:700}

  footer{margin-top:60px;padding-top:24px;border-top:1px solid rgba(255,255,255,.06);display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px;font-size:.75rem;color:rgba(255,255,255,.4)}
  footer a:hover{color:#fff}

  /* Honest-status watermark. Pre-Final-#1 the page reads as a stub
     (empty-state card + how-it-works rail), which is fine but doesn't
     explain WHY it's empty. The watermark frames it directly: an
     event needs people committed before it can run. Auto-removed via
     server-render gate once the first champion lands. Gold to match
     the page accent (#fbbf24); low alpha so it sits behind content
     without fighting it. */
  .page-watermark{
    position:fixed;inset:0;
    display:flex;flex-direction:column;
    align-items:center;justify-content:center;
    pointer-events:none;user-select:none;
    z-index:0;
    transform:rotate(-12deg);
    text-align:center;
    overflow:hidden;
  }
  .page-watermark span{
    display:block;
    font-family:'Playfair Display',serif;
    font-weight:900;
    font-size:clamp(2.4rem,8vw,5.6rem);
    color:rgba(251,191,36,.07);
    letter-spacing:-.025em;
    line-height:1.04;
    text-transform:lowercase;
    white-space:nowrap;
  }
  /* Main content sits above the watermark so text stays readable. */
  .shell{position:relative;z-index:1}
  /* A sliver of honest copy above the empty card so the watermark is
     reinforced by an in-flow line rather than only hovering as a
     background mark. Same auto-remove gate as the watermark. */
  .empty-honest{
    margin:0 auto 18px;max-width:540px;text-align:center;
    font-size:.8rem;line-height:1.55;color:rgba(251,191,36,.78);
    font-weight:600;letter-spacing:.01em;
  }
  .empty-honest strong{color:#fbbf24;font-weight:800}
</style>
</head>
<body>
${hasAny ? '' : `<div class="page-watermark" aria-hidden="true">
  <span>we need more users</span>
  <span>to organize this event</span>
</div>`}
<div id="daTopbar"></div>
<script defer src="/js/topbar.js"></script>

<main class="shell">
  <span class="eyebrow"><span class="eyebrow-dot"></span>Friday Night Finals</span>
  <h1>Champions.</h1>
  <p class="hero-sub">
    One bracket every Friday. Two debaters. One impromptu motion. The founder judges live.
    Winners pin here permanently. The list grows every week the room shows up.
  </p>

  ${hasAny ? `<div class="champ-grid">
    ${champions.map(renderChampionCard).join('\n')}
  </div>` : `<p class="empty-honest"><strong>Status:</strong> we need more users to organize this event. Final #1 happens when the room shows up.</p>${renderEmptyState()}`}

  <section class="how-rail" aria-label="How Friday Night Finals work">
    <h3>How it works</h3>
    <div class="how-list">
      <div class="how-item">
        <span class="how-num">1</span>
        <div class="how-text">Sign up in <strong>#friday-night-finals</strong> on Discord. First two reactors are in; next two are backups.</div>
      </div>
      <div class="how-item">
        <span class="how-num">2</span>
        <div class="how-text">Motion drops in voice at speech-1 minus 15. Eight minutes a side, single round, no prelim.</div>
      </div>
      <div class="how-item">
        <span class="how-num">3</span>
        <div class="how-text">Founder reads the RFD live. Winner takes the Lifetime tier and pins to this page forever.</div>
      </div>
    </div>
  </section>

  <footer>
    <span>© 2026 DebateIt</span>
    <span><a href="/">Home</a> · <a href="/debate-it">New round</a> · <a href="/today">Today's motion</a> · <a href="${esc(NEXT_FINAL.discordUrl)}" target="_blank" rel="noopener">Discord</a></span>
  </footer>
</main>
</body></html>`;
}

export default async () => {
  const champions = await fetchChampions();
  const html = renderPage(champions);
  return new Response(html, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      // 10-min edge cache. Champions land at most once a week, so 10
      // minutes is more than tight enough to look "live" while keeping
      // function invocations + Firestore reads negligible.
      'Cache-Control': 'public, max-age=600, s-maxage=600',
    },
  });
};

export const config = {
  path: ['/api/champions'],
};
