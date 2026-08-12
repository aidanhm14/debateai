// GET /w/:id       — server-rendered public page for one published recording.
// GET /w/:id/play   — 302 to a freshly minted Daily playback link.
//
// Why this exists, and why it is not /watch?r={id}.
//
// /watch is a hub: one canonical, one document, replays filled in by JS
// from /api/recordings. Sharing a replay handed out /watch?r={id}, a
// query string on a page whose canonical points at bare /watch, so every
// replay ever shared consolidated its link equity onto the hub and none
// of them existed as a crawlable URL. That also made VideoObject
// impossible: there was no per-video page to attach it to, and the only
// media URL we had was a Daily access link that expires within the hour,
// which Google cannot crawl and must never be published as contentUrl.
//
// This function fixes both ends:
//  - /w/{id} is a real URL with its own canonical, title, and body, so a
//    recording can rank and accumulate links on its own merits.
//  - /w/{id}/play is a STABLE url that mints a fresh Daily link per
//    request and redirects to it. That is what makes a legitimate
//    VideoObject.contentUrl possible: the address never changes even
//    though the signed URL behind it changes every time.
//
// It also means the page needs no JavaScript to play: <video src> follows
// the 302 on its own, including the Range requests it makes while seeking.
//
// Only `published === true` recordings render. Everything else 404s
// identically, so the endpoint does not leak which ids exist, and Google
// never sees a URL for a round the debaters did not agree to publish.

import { getDb } from './lib/firestore.mjs';
import { esc, jsonLd } from './lib/public-round.mjs';

const SITE_ORIGIN = 'https://itsdebatable.com';

// Inlined rather than imported from lib/async-rounds.mjs, which is where
// the same map lives. That module pulls in @netlify/blobs at the top
// level, and dragging a blob-storage client into every cold start of a
// page render to look up eight display strings is a bad trade. Keep in
// step with FORMAT_NAMES there if a format is added.
const FORMAT_NAMES = {
  quick: 'Quick Clash', apda: 'APDA', bp: 'British Parli', worlds: 'Worlds',
  asian: 'Asian Parli', pf: 'Public Forum', ld: 'Lincoln-Douglas', policy: 'Policy',
};
const DAILY_API = 'https://api.daily.co/v1';

// Fallback only. A per-recording still is what earns video rich results;
// Google wants a thumbnail that represents the video, and a brand card
// does not. `thumbnailUrl` on the recording doc overrides this the moment
// anything sets it, which is the one remaining step for rich-result
// eligibility. Deliberately NOT an SVG: Google's supported thumbnail
// formats for VideoObject are bmp/gif/jpeg/png/webp, and SVG is not one.
const FALLBACK_THUMB = `${SITE_ORIGIN}/og-image.png?v=floor1`;

function parsePath(url) {
  try {
    const u = new URL(url);
    // Matches both the public /w/{id} path (preserved by the netlify
    // rewrite) and a direct /api/w/{id} hit. Daily recording ids are
    // uuids, so the charset is deliberately tight.
    const m = u.pathname.match(/\/w\/([a-z0-9][a-z0-9-]{7,79})(\/play)?\/?$/i);
    if (!m) return { id: null, play: false };
    return { id: m[1], play: !!m[2] };
  } catch { return { id: null, play: false }; }
}

function notFound() {
  const body = `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Recording not found · Debatable</title>
<meta name="robots" content="noindex">
<style>body{background:#0b0b0d;color:#f4f4f2;font-family:system-ui,sans-serif;margin:0;padding:80px 24px;text-align:center}
h1{font-size:1.8rem;margin-bottom:8px}p{color:rgba(244,244,242,.68);margin:0 0 20px}
a{color:#ef4444;text-decoration:none;font-weight:700}</style>
</head><body>
<h1>That recording isn't here</h1>
<p>It was either never published, or the debaters took it down.</p>
<a href="/watch">Browse what is published &rarr;</a>
</body></html>`;
  return new Response(body, { status: 404, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}

// ISO 8601 duration. Schema.org wants PT#H#M#S, not a seconds count.
function isoDuration(seconds) {
  const s = Math.max(0, Math.round(Number(seconds) || 0));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  return 'PT' + (h ? h + 'H' : '') + (m ? m + 'M' : '') + (sec || (!h && !m) ? sec + 'S' : '');
}

function humanDuration(seconds) {
  const s = Math.max(0, Math.round(Number(seconds) || 0));
  const m = Math.floor(s / 60);
  if (m < 1) return 'Under a minute';
  if (m === 1) return '1 minute';
  if (m < 60) return m + ' minutes';
  const h = Math.floor(m / 60), rem = m % 60;
  return h + (h === 1 ? ' hour' : ' hours') + (rem ? ' ' + rem + ' min' : '');
}

function isoDate(startTs) {
  const ms = Number(startTs) > 0 ? Number(startTs) * 1000 : 0;
  const d = ms ? new Date(ms) : null;
  return d && !Number.isNaN(d.getTime()) ? d.toISOString() : null;
}

function humanDate(startTs) {
  const iso = isoDate(startTs);
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('en-US', {
    year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC',
  });
}

// A short-lived Daily access link, minted per request. Never cached at the
// edge: the URL it returns expires, so a CDN copy would hand a visitor a
// dead link long after it stopped working.
async function playRedirect(id) {
  if (!process.env.DAILY_API_KEY) {
    return new Response('Playback not configured', { status: 503 });
  }
  let link = '';
  try {
    const resp = await fetch(DAILY_API + '/recordings/' + encodeURIComponent(id) + '/access-link', {
      headers: { Authorization: 'Bearer ' + process.env.DAILY_API_KEY },
    });
    if (resp.ok) link = (await resp.json()).download_link || '';
  } catch { /* fall through to the 502 below */ }
  if (!link) return new Response('Playback link unavailable', { status: 502 });
  return new Response(null, {
    status: 302,
    headers: { Location: link, 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' },
  });
}

export function renderPage(id, d) {
  const canonical = `${SITE_ORIGIN}/w/${id}`;
  const playUrl = `${canonical}/play`;
  const motion = d.motion || '';
  const isStream = !!d.isStream;
  const title = motion || d.title || 'Debate round';
  const shortTitle = title.length > 62 ? title.slice(0, 59) + '…' : title;
  const pro = d.proName || '';
  const con = d.conName || '';
  const formatName = FORMAT_NAMES[d.format] || d.format || '';
  const dateHuman = humanDate(d.startTs);
  const durHuman = humanDuration(d.duration);
  const uploadDate = isoDate(d.startTs);
  const thumb = d.thumbnailUrl || FALLBACK_THUMB;

  const facts = [formatName, dateHuman, durHuman].filter(Boolean);
  const versus = pro && con ? `${pro} against ${con}` : '';

  const description = isStream
    ? `Full recording of ${title}. ${facts.join('. ')}.`
    : `Full recording of a debate round on "${title}".` +
      (versus ? ` ${versus}.` : '') +
      (facts.length ? ` ${facts.join('. ')}.` : '');

  const ldVideo = {
    '@context': 'https://schema.org',
    '@type': 'VideoObject',
    name: title,
    description,
    thumbnailUrl: [thumb],
    contentUrl: playUrl,
    // uploadDate is required by Google. Omit the key entirely rather than
    // publish a guessed date for a recording with no start timestamp.
    ...(uploadDate ? { uploadDate } : {}),
    ...(Number(d.duration) > 0 ? { duration: isoDuration(d.duration) } : {}),
    publisher: {
      '@type': 'Organization',
      name: 'Debatable',
      url: SITE_ORIGIN,
      logo: { '@type': 'ImageObject', url: `${SITE_ORIGIN}/icons/icon-192.png` },
    },
    mainEntityOfPage: { '@type': 'WebPage', '@id': canonical },
    isFamilyFriendly: true,
  };

  const ldBreadcrumb = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Debatable', item: `${SITE_ORIGIN}/` },
      { '@type': 'ListItem', position: 2, name: 'Watch people debate', item: `${SITE_ORIGIN}/watch` },
      { '@type': 'ListItem', position: 3, name: shortTitle, item: canonical },
    ],
  };

  const seatRow = versus
    ? `<div class="seats">
      <span class="seat"><b>Proposition</b>${esc(pro)}</span>
      <span class="vs">against</span>
      <span class="seat"><b>Opposition</b>${esc(con)}</span>
    </div>`
    : '';

  const factRow = facts.length
    ? `<div class="facts">${facts.map(f => `<span>${esc(f)}</span>`).join('')}</div>`
    : '';

  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(shortTitle)} · Watch the round · Debatable</title>
<meta name="description" content="${esc(description.slice(0, 300))}">
<link rel="canonical" href="${canonical}">
<meta property="og:type" content="video.other">
<meta property="og:title" content="${esc(shortTitle)}">
<meta property="og:description" content="${esc(description.slice(0, 300))}">
<meta property="og:url" content="${canonical}">
<meta property="og:image" content="${esc(thumb)}">
<meta property="og:video" content="${playUrl}">
<meta property="og:site_name" content="Debatable">
<meta name="twitter:card" content="player">
<meta name="twitter:title" content="${esc(shortTitle)}">
<meta name="twitter:description" content="${esc(description.slice(0, 200))}">
<meta name="twitter:image" content="${esc(thumb)}">
<link rel="icon" href="/favicon.ico" sizes="any">
<link rel="icon" type="image/svg+xml" href="/favicon.svg">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Crimson+Pro:wght@400;600;700;800;900&display=swap">
<script type="application/ld+json">${jsonLd(ldVideo)}</script>
<script type="application/ld+json">${jsonLd(ldBreadcrumb)}</script>
<style>
:root{color-scheme:dark;--bg:#0b0b0d;--surface:#141417;--border:rgba(255,255,255,.08);
  --text:#f4f4f2;--dim:rgba(244,244,242,.68);--red:#ef4444;--radius:14px}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--text);font-family:'Crimson Pro',Georgia,serif;
  font-size:18px;line-height:1.6;-webkit-font-smoothing:antialiased}
em,i{font-style:normal}
.wrap{max-width:900px;margin:0 auto;padding:0 20px 70px}
header{padding:40px 0 14px}
.eyebrow{font-size:13px;letter-spacing:.14em;text-transform:uppercase;color:var(--red);font-weight:700}
h1{font-size:clamp(26px,4.4vw,38px);font-weight:800;line-height:1.14;margin:10px 0 0}
.facts{display:flex;flex-wrap:wrap;gap:8px;margin-top:14px}
.facts span{background:var(--surface);border:1px solid var(--border);border-radius:999px;
  padding:3px 12px;font-size:14px;color:var(--dim)}
.seats{display:flex;flex-wrap:wrap;align-items:center;gap:12px;margin-top:14px;color:var(--dim);font-size:16px}
.seat b{display:block;font-size:11.5px;letter-spacing:.12em;text-transform:uppercase;color:var(--red);font-weight:700}
.vs{opacity:.55;font-size:14px}
video{width:100%;margin-top:22px;background:#000;border:1px solid var(--border);border-radius:var(--radius);display:block}
.note{color:var(--dim);font-size:15px;margin-top:12px}
h2{font-size:20px;font-weight:800;margin:38px 0 8px}
p{color:var(--dim);margin:0 0 12px}
a{color:var(--red);text-decoration:none;font-weight:700}
a:hover{text-decoration:underline}
.cta{margin-top:34px;padding:20px;background:var(--surface);border:1px solid var(--border);border-radius:var(--radius)}
.cta h2{margin-top:0}
footer{margin-top:44px;padding-top:20px;border-top:1px solid var(--border);color:var(--dim);font-size:15px}
</style>
</head>
<body>
<div class="wrap">
  <header>
    <div class="eyebrow">${isStream ? 'Stream replay' : 'Round replay'}</div>
    <h1>${esc(title)}</h1>
    ${factRow}
    ${seatRow}
  </header>

  <video controls playsinline preload="metadata" poster="${esc(thumb)}" src="${playUrl}"></video>
  <p class="note">The full round, opening speech through to the end. Nothing is cut.</p>

  <h2>What you are watching</h2>
  <p>${isStream
    ? 'A recorded stream from the arena, kept up so it can be watched after the fact.'
    : `Two people took opposite sides of one motion and argued it against a clock${formatName ? ' in ' + esc(formatName) : ''}. Neither of them picked the side they already agreed with, which is the point: you are watching a position defended on the merits rather than an opinion being restated.`}</p>
  <p>Rounds are only recorded when everyone in them agrees to it, and only published when that agreement holds, so this one is here because the debaters in it chose to put it up.</p>

  <div class="cta">
    <h2>Want a round of your own?</h2>
    <p>Get matched with an opponent, argue it out on the clock, and read the ballot at the end.</p>
    <a href="/spar">Find an opponent &rarr;</a>
  </div>

  <footer>
    <a href="/watch">All replays</a> &nbsp;·&nbsp;
    <a href="/live">Live rounds</a> &nbsp;·&nbsp;
    <a href="/leaderboard">Leaderboard</a> &nbsp;·&nbsp;
    <a href="/">Debatable</a>
  </footer>
</div>
</body></html>`;
}

export default async (req) => {
  if (req.method !== 'GET') return new Response('GET only', { status: 405 });
  const { id, play } = parsePath(req.url);
  if (!id) return notFound();

  let snap;
  try {
    snap = await getDb().collection('recordings').doc(id).get();
  } catch {
    return new Response('Temporarily unavailable', { status: 503 });
  }
  // Unpublished and missing answer identically. An unpublished round is a
  // round somebody declined to make public, so confirming it exists would
  // leak exactly the thing the consent gate is protecting.
  if (!snap.exists || (snap.data() || {}).published !== true) return notFound();

  if (play) return playRedirect(id);

  return new Response(renderPage(id, snap.data() || {}), {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      // A published recording's metadata does not change often, and a
      // stale-while-revalidate window keeps a viral replay off Firestore.
      'Cache-Control': 'public, max-age=60, s-maxage=300, stale-while-revalidate=600',
    },
  });
};

export const config = {
  path: '/api/w/*',
};
