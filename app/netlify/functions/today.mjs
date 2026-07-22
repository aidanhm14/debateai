// /today (and /today/{date}) — daily motion page.
//
// The content engine half of the SEO play: a fresh, indexable URL each
// day, motion as <h1>, "why this is the motion now" framing as the
// article body, gov/opp hints, and a "Try this motion against the AI"
// CTA back into the funnel. Each day's URL is permanent — Google
// crawls /today/2026-05-14 once, indexes it forever, the page never
// 404s.
//
// No cron, no Firestore writes: the motion is a pure function of the
// date (see lib/daily-motion-bank.mjs). 21 motions in the bank, hashed
// across days so consecutive days don't cluster in the same domain.
//
// Routing:
//   /today          → today's motion (current UTC date)
//   /today/{date}   → that date's motion (YYYY-MM-DD; ±5 years bounded)

import {
  DAILY_MOTIONS,
  dailyMotionFor,
  parseDailyDate,
  formatDailyDate,
  prettyDate,
} from './lib/daily-motion-bank.mjs';
import { getDb } from './lib/firestore.mjs';

const SITE_ORIGIN = 'https://itsdebatable.com';
const OG_IMAGE = `${SITE_ORIGIN}/og-image.png?v=floor1`;

// In-memory cache for the "recent public rounds" panel. Same content
// for every /today render in any given minute, so caching keeps the
// per-request Firestore reads negligible at scale.
let recentRoundsCache = { fetchedAt: 0, rounds: [] };
const RECENT_ROUNDS_TTL_MS = 5 * 60 * 1000;
const RECENT_ROUNDS_LIMIT = 6;

async function fetchRecentPublicRounds() {
  const now = Date.now();
  if (recentRoundsCache.rounds.length && now - recentRoundsCache.fetchedAt < RECENT_ROUNDS_TTL_MS) {
    return recentRoundsCache.rounds;
  }
  try {
    const db = getDb();
    const snap = await db.collection('public_rounds')
      .orderBy('publishedAt', 'desc')
      .limit(RECENT_ROUNDS_LIMIT)
      .get();
    const rounds = (snap.docs || []).map(d => {
      const data = d.data() || {};
      return {
        id: d.id,
        motion: data.motion || '',
        displayName: data.displayName || '',
        formatName: data.formatName || data.format || '',
        sideLabel: data.sideLabel || data.side || '',
        winner: data.winner || null,
      };
    }).filter(r => r.motion && r.id);
    recentRoundsCache = { fetchedAt: now, rounds };
    return rounds;
  } catch (err) {
    console.warn('[today] recent public_rounds fetch failed:', err.message);
    // Don't crash the page if the aggregator query blips. Return whatever
    // we last cached (could be empty) and the panel just won't render.
    return recentRoundsCache.rounds;
  }
}

// Daily leaderboard cache. Same date in any given minute renders the
// same top-N entries, so caching keeps Firestore reads negligible at
// peak (e.g. when someone shares /today on Reddit and 500 visitors hit
// it in the same 60s).
const dailyBoardCache = new Map(); // dateStr → { fetchedAt, entries }
const DAILY_BOARD_TTL_MS = 60 * 1000;
const DAILY_BOARD_LIMIT = 25;

async function fetchDailyBoard(dateStr) {
  const now = Date.now();
  const hit = dailyBoardCache.get(dateStr);
  if (hit && now - hit.fetchedAt < DAILY_BOARD_TTL_MS) {
    return hit.entries;
  }
  try {
    const db = getDb();
    const snap = await db
      .collection('daily_entries')
      .doc(dateStr)
      .collection('entries')
      .orderBy('score', 'desc')
      .limit(DAILY_BOARD_LIMIT)
      .get();
    const entries = (snap.docs || []).map((d) => {
      const data = d.data() || {};
      return {
        uid: data.uid || d.id,
        displayName: data.displayName || 'A debater',
        photoURL: data.photoURL || '',
        score: typeof data.score === 'number' ? data.score : null,
        aiScore: typeof data.aiScore === 'number' ? data.aiScore : null,
        sideLabel: data.sideLabel || data.side || '',
        formatName: data.formatName || data.format || '',
        decision: data.decision || '',
        won: !!data.won,
        submittedAt: data.submittedAt || 0,
      };
    }).filter((e) => e.score !== null);
    dailyBoardCache.set(dateStr, { fetchedAt: now, entries });
    // Cap cache size — if /today/ARCHIVE is hit a lot we don't want
    // to grow forever. 30 most-recent dates is generous.
    if (dailyBoardCache.size > 30) {
      const oldest = [...dailyBoardCache.keys()].sort()[0];
      dailyBoardCache.delete(oldest);
    }
    return entries;
  } catch (err) {
    console.warn('[today] daily-board fetch failed:', err.message);
    return [];
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

function extractDateFromUrl(url) {
  try {
    const u = new URL(url);
    // Two valid forms: /today (no date) and /today/{date}. Also accept
    // /api/today/{date} for the case where the request hits the function
    // path directly rather than going through the public rewrite.
    const m = u.pathname.match(/\/today\/?([0-9]{4}-[0-9]{2}-[0-9]{2})?$/);
    if (!m) return null;
    return m[1] || null; // null means "use today"
  } catch { return null; }
}

function renderRecentRoundsPanel(rounds) {
  if (!rounds || rounds.length === 0) return '';
  const cards = rounds.map(r => {
    const winnerBadge = r.winner === 'user' ? '<span class="winner-badge user">Human wins</span>'
                      : r.winner === 'ai' ? '<span class="winner-badge ai">AI wins</span>'
                      : '';
    const meta = [r.formatName, r.sideLabel].filter(Boolean).map(esc).join(' · ');
    return `<a class="round-link" href="/r/${esc(r.id)}">
      <div class="round-meta">${esc(r.displayName || 'A debater')}${meta ? ' · ' + meta : ''}</div>
      <div class="round-motion">${esc((r.motion || '').slice(0, 140))}</div>
      ${winnerBadge}
    </a>`;
  }).join('\n');
  return `<section class="recent-rounds" aria-label="Recently argued on the platform">
    <h3>Recently argued on the platform</h3>
    <div class="round-grid">
      ${cards}
    </div>
  </section>`;
}

// Daily leaderboard panel — top scores from anyone who debated today's
// motion via the /today CTA. The empty-state copy is the same shape
// debaters see on a real round form ("be the first") so it doesn't
// read as broken; the populated state ranks 1..N by speaker points.
function renderDailyBoardPanel(entries, isToday) {
  if (!isToday) return ''; // archive pages don't show a leaderboard
  if (!entries || entries.length === 0) {
    return `<section class="daily-board" aria-label="Today's leaderboard">
      <h3>Today's leaderboard</h3>
      <p class="daily-board-empty">Nobody has debated this motion yet today. Take it now and you're at #1 until someone bests you.</p>
    </section>`;
  }
  const rows = entries.map((e, idx) => {
    const rank = idx + 1;
    const rankClass = rank <= 3 ? `rank-${rank}` : '';
    const initials = (e.displayName || '?')
      .split(/\s+/).map((s) => s[0]).filter(Boolean).slice(0, 2).join('').toUpperCase();
    const avatar = e.photoURL
      ? `<img class="daily-row-avatar" src="${esc(e.photoURL)}" alt="" loading="lazy" referrerpolicy="no-referrer">`
      : `<span class="daily-row-avatar daily-row-avatar--text">${esc(initials)}</span>`;
    const meta = [e.formatName, e.sideLabel].filter(Boolean).map(esc).join(' · ');
    const scoreLabel = Number.isInteger(e.score) ? String(e.score) : e.score.toFixed(1);
    const wonBadge = e.won
      ? '<span class="winner-badge user" style="margin:0">Won</span>'
      : (e.won === false && typeof e.won === 'boolean'
        ? '<span class="winner-badge ai" style="margin:0">Lost</span>'
        : '');
    return `<li class="daily-row ${rankClass}">
      <span class="daily-rank">${rank}</span>
      ${avatar}
      <span class="daily-who">
        <span class="daily-name">${esc(e.displayName || 'A debater')}</span>
        ${meta ? `<span class="daily-meta">${meta}</span>` : ''}
      </span>
      <span class="daily-score">${esc(scoreLabel)}</span>
      ${wonBadge}
    </li>`;
  }).join('\n');
  return `<section class="daily-board" aria-label="Today's leaderboard">
    <h3>Today's leaderboard</h3>
    <ol class="daily-list">
      ${rows}
    </ol>
  </section>`;
}

function renderPage(date, dateStr, motion, recentRounds, dailyBoard) {
  const titleCore = `${motion.motion} · Today's debate motion`;
  const title = titleCore.length > 65 ? titleCore.slice(0, 62) + '…' : titleCore;
  const description = `${motion.motion} Debate it against the AI. ${motion.frame.slice(0, 100)}`;
  const canonical = `${SITE_ORIGIN}/today/${dateStr}`;
  const motionEncoded = encodeURIComponent(motion.motion);
  const pretty = prettyDate(date);
  // Streak/daily-completion plumbing only renders on the live "today"
  // page — past/future archive entries don't drive streaks.
  const todayStr = formatDailyDate(new Date());
  const isToday = dateStr === todayStr;
  // CTA appends ?dm=<date> so the debate-ai save flow can credit the
  // streak when the round completes. Off-today archive links don't.
  const ctaHref = isToday
    ? `/debate-it?motion=${motionEncoded}&dm=${dateStr}`
    : `/debate-it?motion=${motionEncoded}`;

  const ldArticle = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: motion.motion,
    description,
    author: { '@type': 'Organization', name: 'Debatable' },
    publisher: {
      '@type': 'Organization',
      name: 'Debatable',
      url: SITE_ORIGIN,
      logo: { '@type': 'ImageObject', url: `${SITE_ORIGIN}/icons/icon-192.png` },
    },
    datePublished: date.toISOString(),
    mainEntityOfPage: { '@type': 'WebPage', '@id': canonical },
    articleBody: motion.frame,
    keywords: [motion.domain, 'debate motion', 'debate prep', 'AI debate'],
  };

  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
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
<script defer src="/js/track.js"></script>
<script type="application/ld+json">${jsonLd(ldArticle)}</script>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{background:#000;color:#fff;font-family:'Inter',system-ui,-apple-system,sans-serif;line-height:1.6;-webkit-font-smoothing:antialiased}
  a{color:inherit;text-decoration:none}
  .shell{max-width:780px;margin:0 auto;padding:90px 24px 80px}
  .eyebrow{display:inline-flex;align-items:center;gap:8px;font-size:.7rem;font-weight:800;letter-spacing:.16em;text-transform:uppercase;color:#ef4444;padding:5px 14px;border-radius:999px;background:rgba(239,68,68,.08);border:1px solid rgba(239,68,68,.32);margin-bottom:14px}
  .eyebrow-dot{width:7px;height:7px;border-radius:50%;background:#ef4444;box-shadow:0 0 12px #ef4444}
  .date-line{font-size:.82rem;color:rgba(255,255,255,.5);margin-bottom:24px;letter-spacing:.02em}
  h1{font-family:'Inter',system-ui,-apple-system,sans-serif;font-weight:900;font-size:clamp(2rem,4.8vw,3.2rem);line-height:1.08;letter-spacing:-.025em;margin-bottom:28px;color:#fff}
  .domain-tag{display:inline-block;font-size:.62rem;font-weight:800;letter-spacing:.14em;text-transform:uppercase;color:#fbbf24;padding:4px 10px;border-radius:999px;background:rgba(251,191,36,.08);border:1px solid rgba(251,191,36,.28);margin-bottom:22px}
  .frame{font-size:1.05rem;line-height:1.7;color:rgba(255,255,255,.85);margin:0 0 24px}
  .background-block{margin:0 0 36px}
  .background-block h2{font-size:.7rem;font-weight:800;letter-spacing:.16em;text-transform:uppercase;color:rgba(255,255,255,.55);margin:0 0 14px}
  .background-block p{font-size:.98rem;line-height:1.7;color:rgba(255,255,255,.78);margin:0 0 14px}
  .background-block p:last-child{margin-bottom:0}
  .side-grid{display:grid;grid-template-columns:1fr;gap:18px;margin:0 0 40px}
  @media(min-width:680px){.side-grid{grid-template-columns:1fr 1fr}}
  .side-card{padding:18px 22px;border-radius:14px;border:1px solid;background:rgba(255,255,255,.02)}
  .side-card.gov{border-color:rgba(34,197,94,.22);background:rgba(34,197,94,.04)}
  .side-card.opp{border-color:rgba(239,68,68,.22);background:rgba(239,68,68,.04)}
  .side-label{font-size:.62rem;font-weight:800;letter-spacing:.16em;text-transform:uppercase;margin-bottom:8px}
  .side-card.gov .side-label{color:#22c55e}
  .side-card.opp .side-label{color:#ef4444}
  .side-hint{font-size:.95rem;line-height:1.55;color:rgba(255,255,255,.88)}
  .cta-card{padding:28px;border-radius:16px;border:1px solid rgba(239,68,68,.32);background:linear-gradient(135deg,rgba(239,68,68,.10),rgba(245,158,11,.04));text-align:center;margin-bottom:36px}
  .cta-card h2{font-family:'Inter',sans-serif;font-style:normal;font-size:1.25rem;font-weight:900;letter-spacing:-.01em;margin-bottom:8px}
  .cta-card p{font-size:.92rem;color:rgba(255,255,255,.68);margin-bottom:18px;max-width:520px;margin-left:auto;margin-right:auto}
  .cta-button{display:inline-flex;align-items:center;gap:8px;padding:13px 24px;border-radius:999px;background:#ef4444;color:#fff;font-weight:800;letter-spacing:.02em;font-size:.95rem;box-shadow:0 10px 30px -8px rgba(239,68,68,.5);transition:transform .15s,box-shadow .15s}
  .cta-button:hover{transform:translateY(-1px);box-shadow:0 14px 34px -8px rgba(239,68,68,.7)}
  .archive{margin-top:48px;padding-top:24px;border-top:1px solid rgba(255,255,255,.08)}
  .archive h3{font-size:.7rem;font-weight:800;letter-spacing:.16em;text-transform:uppercase;color:rgba(255,255,255,.55);margin-bottom:14px}
  .archive-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:10px}
  .archive-link{padding:10px 14px;border-radius:10px;border:1px solid rgba(255,255,255,.08);background:rgba(255,255,255,.02);transition:.15s}
  .archive-link:hover{border-color:rgba(239,68,68,.32);background:rgba(239,68,68,.04)}
  .archive-date{font-size:.62rem;color:rgba(255,255,255,.4);letter-spacing:.06em;text-transform:uppercase;margin-bottom:3px}
  .archive-motion{font-size:.82rem;color:rgba(255,255,255,.85);line-height:1.4}
  .recent-rounds{margin-top:48px;padding-top:24px;border-top:1px solid rgba(255,255,255,.08)}
  .recent-rounds h3{font-size:.7rem;font-weight:800;letter-spacing:.16em;text-transform:uppercase;color:rgba(255,255,255,.55);margin-bottom:14px}
  .round-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:10px}
  .round-link{display:block;padding:12px 14px;border-radius:10px;border:1px solid rgba(139,92,246,.20);background:rgba(139,92,246,.04);transition:.15s;position:relative;text-decoration:none}
  .round-link:hover{border-color:rgba(139,92,246,.5);background:rgba(139,92,246,.08)}
  .round-meta{font-size:.62rem;color:rgba(255,255,255,.5);letter-spacing:.04em;margin-bottom:4px}
  .round-motion{font-size:.85rem;color:rgba(255,255,255,.88);line-height:1.45}
  .winner-badge{display:inline-block;margin-top:8px;font-size:.58rem;font-weight:800;letter-spacing:.14em;text-transform:uppercase;padding:2px 8px;border-radius:999px}
  .winner-badge.user{background:rgba(34,197,94,.14);color:#86efac;border:1px solid rgba(34,197,94,.32)}
  .winner-badge.ai{background:rgba(239,68,68,.14);color:#fca5a5;border:1px solid rgba(239,68,68,.32)}
  /* Daily leaderboard — top scores from anyone who debated today's
     motion. Lives between the CTA card and the recent-rounds panel.
     Read-only here; submissions happen from debate-ai's saveRound
     when ?dm=YYYY-MM-DD matches today's UTC date. */
  .daily-board{margin-top:48px;padding-top:24px;border-top:1px solid rgba(255,255,255,.08)}
  .daily-board h3{font-size:.7rem;font-weight:800;letter-spacing:.16em;text-transform:uppercase;color:rgba(255,255,255,.55);margin-bottom:14px}
  .daily-board-empty{font-size:.92rem;color:rgba(255,255,255,.5);line-height:1.5;padding:14px 0}
  .daily-list{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:6px}
  .daily-row{display:grid;grid-template-columns:34px 28px 1fr auto auto;align-items:center;gap:12px;padding:10px 14px;border-radius:10px;border:1px solid rgba(255,255,255,.06);background:rgba(255,255,255,.02)}
  .daily-row.rank-1{border-color:rgba(251,191,36,.32);background:rgba(251,191,36,.04)}
  .daily-row.rank-2{border-color:rgba(203,213,225,.28);background:rgba(203,213,225,.04)}
  .daily-row.rank-3{border-color:rgba(217,119,6,.28);background:rgba(217,119,6,.04)}
  .daily-rank{font-size:.82rem;font-weight:800;color:rgba(255,255,255,.5);text-align:center}
  .daily-row.rank-1 .daily-rank{color:#fbbf24}
  .daily-row.rank-2 .daily-rank{color:#cbd5e1}
  .daily-row.rank-3 .daily-rank{color:#d97706}
  .daily-row-avatar{width:28px;height:28px;border-radius:50%;object-fit:cover;border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.04);display:inline-flex;align-items:center;justify-content:center;font-size:.66rem;font-weight:800;color:rgba(255,255,255,.65);letter-spacing:.02em}
  .daily-row-avatar--text{font-family:'Inter',sans-serif}
  .daily-who{display:flex;flex-direction:column;min-width:0}
  .daily-name{font-size:.92rem;font-weight:600;color:rgba(255,255,255,.92);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .daily-meta{font-size:.66rem;color:rgba(255,255,255,.5);letter-spacing:.02em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .daily-score{font-size:1.05rem;font-weight:800;color:#fff;font-variant-numeric:tabular-nums;letter-spacing:-.01em}
  @media(max-width:520px){
    .daily-row{grid-template-columns:24px 24px 1fr auto;gap:8px;padding:8px 10px}
    .daily-row-avatar{width:24px;height:24px}
    .daily-name{font-size:.85rem}
    .daily-row .winner-badge{display:none}
  }
  /* Day-run pill — daily-return surface above the motion. Hydrated
     client-side from localStorage so the SSR shell renders fine for
     crawlers + the personalized "Day N" lands once JS boots. Tone is
     practice-log, not gamified — restrained color tokens, no emoji,
     no "STREAK!" hype. */
  .streak-bar{display:flex;align-items:center;gap:10px;margin-bottom:16px;flex-wrap:wrap;min-height:30px}
  .streak-pill{display:inline-flex;align-items:center;gap:7px;padding:6px 14px;border-radius:999px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.18);font-size:.78rem;color:rgba(255,255,255,.82);font-weight:500;letter-spacing:.01em}
  .streak-pill.done{background:rgba(34,197,94,.07);border-color:rgba(34,197,94,.30);color:rgba(187,247,208,.95)}
  .streak-share{padding:6px 14px;border-radius:999px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.18);color:rgba(255,255,255,.85);font-size:.72rem;font-weight:600;cursor:pointer;letter-spacing:.04em;transition:.15s;font-family:inherit}
  .streak-share:hover{background:rgba(255,255,255,.08);border-color:rgba(255,255,255,.32)}
  footer{margin-top:60px;padding-top:24px;border-top:1px solid rgba(255,255,255,.06);display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px;font-size:.75rem;color:rgba(255,255,255,.4)}
  footer a:hover{color:#fff}
</style>
</head>
<body>
<div id="daTopbar"></div>
<script defer src="/js/topbar.js"></script>

<main class="shell">
  ${isToday ? `<div class="streak-bar" data-today="${esc(dateStr)}" data-motion="${esc(motion.motion)}">
    <span class="streak-pill" data-streak-pill>
      <span class="streak-text">Day 1. Today's motion is the first.</span>
    </span>
    <button type="button" class="streak-share" data-streak-share hidden>Share</button>
  </div>` : ''}
  <span class="eyebrow"><span class="eyebrow-dot"></span>Motion of the day</span>
  <div class="date-line">${esc(pretty)}</div>
  <h1>${esc(motion.motion)}</h1>
  <span class="domain-tag">${esc(motion.domain)}</span>

  <p class="frame">${esc(motion.frame)}</p>

  ${motion.background ? `<section class="background-block">
    <h2>Background</h2>
    ${motion.background.split('\n\n').map(p => `<p>${esc(p)}</p>`).join('\n    ')}
  </section>` : ''}

  <div class="side-grid">
    <div class="side-card gov">
      <div class="side-label">Government opens with</div>
      <div class="side-hint">${esc(motion.govHint)}</div>
    </div>
    <div class="side-card opp">
      <div class="side-label">Opposition responds with</div>
      <div class="side-hint">${esc(motion.oppHint)}</div>
    </div>
  </div>

  <div class="cta-card">
    <h2>Take it. Against the AI.</h2>
    <p>Pick a side. Three minutes per speech. The AI takes the other side in your chosen format. Judge ballot at the end.</p>
    <a class="cta-button" href="${ctaHref}">Open on this motion →</a>
  </div>

  <section class="archive">
    <h3>This week's motions</h3>
    <div class="archive-grid">
      ${[-1, -2, -3, 1, 2, 3].map(offset => {
        const dayMs = 24 * 60 * 60 * 1000;
        const otherDate = new Date(date.getTime() + offset * dayMs);
        // Skip future dates beyond ~3 days — too speculative for a SEO link
        if (otherDate.getTime() > Date.now() + 3 * dayMs) return '';
        const otherStr = formatDailyDate(otherDate);
        const otherMotion = dailyMotionFor(otherDate);
        return `<a class="archive-link" href="/today/${otherStr}">
          <div class="archive-date">${esc(prettyDate(otherDate))}</div>
          <div class="archive-motion">${esc(otherMotion.motion)}</div>
        </a>`;
      }).join('\n')}
    </div>
  </section>

  ${renderDailyBoardPanel(dailyBoard, isToday)}

  ${renderRecentRoundsPanel(recentRounds)}

  <footer>
    <span>© 2026 Debatable</span>
    <span><a href="/">Home</a> · <a href="/debate-it">New round</a> · <a href="/champions">Champions</a> · <a href="/learn">Learn</a></span>
  </footer>
</main>
${isToday ? `<script>
(function(){
  // Wordle-shape streak hydration. Reads localStorage written by
  // debate-it.html's saveRound after the user completes today's motion,
  // then re-skins the pill + reveals the share button. SSR shell stays
  // crawlable as a static "Day 1" pill if JS never runs.
  var bar=document.querySelector('.streak-bar');
  if(!bar)return;
  var TODAY=bar.dataset.today;
  var MOTION=bar.dataset.motion;
  var KEY='debateos-daily-streak';
  var s={streak:0,lastDate:null,allCompleted:[]};
  try{var raw=localStorage.getItem(KEY);if(raw)s=Object.assign(s,JSON.parse(raw))}catch(e){}
  if(!Array.isArray(s.allCompleted))s.allCompleted=[];
  var doneToday=s.allCompleted.indexOf(TODAY)!==-1;
  var pill=bar.querySelector('[data-streak-pill]');
  var txt=pill&&pill.querySelector('.streak-text');
  var shareBtn=bar.querySelector('[data-streak-share]');
  if(!txt)return;
  if(doneToday){
    pill.classList.add('done');
    txt.textContent=s.streak<=1?'Day 1. Today\\'s motion taken.':'Day '+s.streak+'. Today\\'s motion taken.';
    if(shareBtn)shareBtn.hidden=false;
  }else if(s.streak>0){
    txt.textContent='Day '+s.streak+'. Take today\\'s motion to keep the run.';
  }
  if(shareBtn){
    shareBtn.addEventListener('click',async function(){
      var n=s.streak||0;
      var line=n>0?'Day '+n+'. Today\\'s motion taken.':'Day 1. First motion taken.';
      var text='Debatable · '+TODAY+'\\n"'+MOTION+'"\\n'+line+'\\nhttps://itsdebatable.com/today';
      try{
        if(navigator.share){
          await navigator.share({text:text});
        }else if(navigator.clipboard&&navigator.clipboard.writeText){
          await navigator.clipboard.writeText(text);
          shareBtn.textContent='Copied';
          setTimeout(function(){shareBtn.textContent='Share'},1500);
        }
        if(typeof gtag==='function')gtag('event','daily_streak_shared',{streak:n});
      }catch(e){}
    });
  }
})();
</script>` : ''}
<script defer src="/js/home-magnet.js"></script></body></html>`;
}

export default async (request) => {
  const rawDate = extractDateFromUrl(request.url);
  let date;
  if (rawDate) {
    const parsed = parseDailyDate(rawDate);
    if (!parsed) {
      // Invalid date → 404 (don't let bots flood Google with garbage URLs)
      return new Response('Invalid date', { status: 404, headers: { 'Content-Type': 'text/plain' } });
    }
    date = parsed;
  } else {
    date = new Date();
  }
  const dateStr = formatDailyDate(date);
  const motion = dailyMotionFor(date);
  // Pull recent public rounds + today's daily leaderboard in parallel.
  // Both soft-fail if Firestore is flaky; the page still renders.
  const todayStr = formatDailyDate(new Date());
  const isToday = dateStr === todayStr;
  const [recentRounds, dailyBoard] = await Promise.all([
    fetchRecentPublicRounds(),
    isToday ? fetchDailyBoard(dateStr) : Promise.resolve([]),
  ]);
  const html = renderPage(date, dateStr, motion, recentRounds, dailyBoard);
  return new Response(html, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      // Cache aggressively at the edge — same date always renders the
      // same motion. 1 hour edge cache is more than enough margin
      // against any clock drift between origin and edge. The leader-
      // board panel hydrates from a separate 60s-TTL in-memory cache,
      // so edge-cached HTML can be stale by up to an hour — acceptable
      // for a leaderboard that updates throughout the day; freshness
      // returns when the edge TTL turns over.
      'Cache-Control': 'public, max-age=3600, s-maxage=3600',
    },
  });
};

export const config = {
  // Two paths so direct hits work regardless of which rewrite path the
  // user came in through. The netlify.toml rewrite covers /today and
  // /today/{date}; the function paths cover the case where requests
  // land on the API URL directly.
  path: ['/api/today', '/api/today/:date'],
};
