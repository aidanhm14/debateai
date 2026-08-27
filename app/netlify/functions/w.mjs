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
// Only `published === true` recordings render. Everything else 404s
// identically, so the endpoint does not leak which ids exist, and Google
// never sees a URL for a round the debaters did not agree to publish.
//
// WATCHING REQUIRES A SIGNED-IN ACCOUNT (2026-08-23). This page used to
// play with no JavaScript at all: <video src="/w/{id}/play"> followed the
// 302 by itself. That is exactly why the gate had to land here and not
// only on /api/recordings — a media element cannot carry an Authorization
// header, so leaving this path open would have left a second door around
// the gate, which is the "one selector wide" failure this log keeps
// recording. So the Daily-backed player is replaced by the poster plus a
// sign-in panel that routes to /watch?r={id}, where the JS player holds a
// real token, and /play refuses outright.
//
// What that costs, stated rather than discovered later: `contentUrl` is
// gone from the VideoObject for Daily-backed rounds, so those are valid
// schema but not rich-result eligible. Near-zero today, because the same
// rounds already lacked a representative thumbnail (see thumbsFor), which
// disqualified them anyway. A round with a `youtubeId` keeps its embed
// and its full markup: that video is already public on YouTube, so
// gating our copy of it would be theatre rather than a gate.

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

// Fallback only, and the weakest link in the markup. Google wants a
// thumbnail that represents the video, and a brand card does not, so a
// recording with nothing better is valid schema but not rich-result
// eligible. Deliberately NOT an SVG: Google's supported thumbnail formats
// for VideoObject are bmp/gif/jpeg/png/webp, and SVG is not one.
//
// Two things override it, in order: an explicit `thumbnailUrl` on the
// doc, or a `youtubeId`, which is the realistic path (see thumbsFor).
const FALLBACK_THUMB = `${SITE_ORIGIN}/og-image.png?v=floor1`;

// YouTube publishes a real still per video at a stable, predictable URL,
// so an uploaded round gets a genuine representative thumbnail for free.
// maxres does not exist for every video and hq always does, so both are
// listed: schema.org takes an array and Google picks what resolves.
// Ordered high to low because the first that resolves is the one used.
function thumbsFor(d, youtubeId) {
  if (d.thumbnailUrl) return [d.thumbnailUrl];
  if (youtubeId) {
    return [
      `https://i.ytimg.com/vi/${youtubeId}/maxresdefault.jpg`,
      `https://i.ytimg.com/vi/${youtubeId}/hqdefault.jpg`,
    ];
  }
  return [FALLBACK_THUMB];
}

// Only ever trust an id that matches YouTube's shape. This value is
// interpolated into an iframe src and into structured data, so a
// malformed one would be an injection point rather than a broken embed.
function safeYoutubeId(raw) {
  const s = String(raw || '');
  return /^[A-Za-z0-9_-]{11}$/.test(s) ? s : '';
}

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

function humanViews(count) {
  const n = Math.max(0, Number(count) || 0);
  return n.toLocaleString('en-US') + (n === 1 ? ' view' : ' views');
}

// The refusal /play now answers with. It is a page rather than a bare
// status because the thing that follows this URL is sometimes a person in
// an address bar, and "401" on its own tells them nothing about what to
// do next.
function playGated(id) {
  const body = `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Sign in to watch · Debatable</title>
<meta name="robots" content="noindex">
<style>body{background:#0b0b0d;color:#f4f4f2;font-family:system-ui,sans-serif;margin:0;padding:80px 24px;text-align:center}
h1{font-size:1.6rem;margin-bottom:8px}p{color:rgba(244,244,242,.68);margin:0 0 20px}
a{color:#ef4444;text-decoration:none;font-weight:700}</style>
</head><body>
<h1>Rounds are for members</h1>
<p>Watching a full round takes a free account. It takes about ten seconds.</p>
<a href="/watch?r=${encodeURIComponent(id)}">Sign in and watch &rarr;</a>
</body></html>`;
  return new Response(body, {
    status: 401,
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

// DORMANT since the sign-in gate above: nothing calls this, and reopening
// the no-JS path is one line in the handler. Kept rather than deleted
// because it holds the mp4Url-beats-Daily preference and the
// never-cache-an-expiring-link rule, both of which were measured.
//
// A short-lived Daily access link, minted per request. Never cached at the
// edge: the URL it returns expires, so a CDN copy would hand a visitor a
// dead link long after it stopped working.
// eslint-disable-next-line no-unused-vars
async function playRedirect(id, d) {
  // A rehosted transcode wins when there is one. Daily encodes the raw
  // recording at whatever bitrate it likes (measured 3.1 Mbps on a real
  // round, which is more than many viewers can sustain, so the player
  // never leaves the spinner). `mp4Url` is a stable, already-public,
  // bitrate-capped copy, so unlike the Daily link it does not expire and
  // CAN be cached at the edge.
  const stored = d && typeof d.mp4Url === 'string' ? d.mp4Url : '';
  if (stored) {
    return new Response(null, {
      status: 302,
      headers: {
        Location: stored,
        'Cache-Control': 'public, max-age=300, s-maxage=3600',
        'Referrer-Policy': 'no-referrer',
      },
    });
  }
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
  const youtubeId = safeYoutubeId(d.youtubeId);
  const thumbs = thumbsFor(d, youtubeId);
  const thumb = thumbs[0];
  const teaser = d.teaser === true;
  const viewCount = Math.max(0, Number(d.viewCount) || 0);

  const facts = [formatName, dateHuman, durHuman].filter(Boolean);
  const displayFacts = teaser ? facts : facts.concat(humanViews(viewCount));
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
    thumbnailUrl: thumbs,
    // Both when we have both. contentUrl is the authoritative full round
    // (the Daily mp4 behind the stable /play address); embedUrl is the
    // YouTube player. Google accepts either and prefers having both.
    // contentUrl ONLY for a round that is genuinely fetchable at that
    // address. Publishing a contentUrl that answers 401 to every crawl
    // is a claim we do not honour, which is worse than omitting it.
    ...(youtubeId ? { embedUrl: `https://www.youtube.com/embed/${youtubeId}` } : {}),
    // uploadDate is required by Google. Omit the key entirely rather than
    // publish a guessed date for a recording with no start timestamp.
    ...(uploadDate ? { uploadDate } : {}),
    ...(Number(d.duration) > 0 ? { duration: isoDuration(d.duration) } : {}),
    ...(viewCount > 0 ? {
      interactionStatistic: {
        '@type': 'InteractionCounter',
        interactionType: { '@type': 'WatchAction' },
        userInteractionCount: viewCount,
      },
    } : {}),
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

  const factRow = displayFacts.length
    ? `<div class="facts">${displayFacts.map((f, i) => `<span${!teaser && i === displayFacts.length - 1 ? ' id="viewCount"' : ''}>${esc(f)}</span>`).join('')}</div>`
    : '';

  const viewPayload = jsonLd({ action: 'view', id });

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
<meta property="og:video" content="${youtubeId ? `https://www.youtube.com/embed/${youtubeId}` : playUrl}">
<meta property="og:site_name" content="Debatable">
<meta name="twitter:card" content="player">
<meta name="twitter:title" content="${esc(shortTitle)}">
<meta name="twitter:description" content="${esc(description.slice(0, 200))}">
<meta name="twitter:image" content="${esc(thumb)}">
<link rel="icon" href="/favicon.ico" sizes="any">
<link rel="icon" type="image/svg+xml" href="/favicon.svg">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Crimson+Pro:wght@400;600;700;800;900&display=swap">
${teaser ? '' : `<script type="application/ld+json">${jsonLd(ldVideo)}</script>`}
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
/* aspect-ratio rather than a padding-top box: the iframe is always 16:9
   and this keeps the space reserved before it loads, so the page does not
   shift under the reader. */
.embed{margin-top:22px;aspect-ratio:16/9;background:#000;border:1px solid var(--border);
  border-radius:var(--radius);overflow:hidden}
.embed iframe{width:100%;height:100%;border:0;display:block}
/* The gate. The poster carries the round so the page still LOOKS like a
   video, with the ask sitting over it rather than replacing it. */
.gate{position:relative;margin-top:22px;aspect-ratio:16/9;border:1px solid var(--border);
  border-radius:var(--radius);overflow:hidden;background:#000 center/cover no-repeat}
.gate::after{content:"";position:absolute;inset:0;background:rgba(8,8,10,.72)}
.gate-in{position:absolute;inset:0;z-index:2;display:flex;flex-direction:column;
  align-items:center;justify-content:center;gap:10px;text-align:center;padding:22px}
.gate-in h2{margin:0;font-size:clamp(18px,3vw,24px);font-weight:800}
.gate-in p{margin:0;max-width:420px;font-size:15px}
.gate-btn{margin-top:6px;display:inline-block;background:var(--red);color:#fff;
  padding:11px 22px;border-radius:11px;font-size:16px;font-weight:800;text-decoration:none}
.gate-btn:hover{background:#dc2626;text-decoration:none}
/* Dropping soon. Same frame, a watermark instead of an ask, because
   there is nothing to sign in FOR yet. */
.soon-mark{position:absolute;inset:0;z-index:2;display:flex;align-items:center;justify-content:center}
.soon-mark span{font-size:clamp(20px,4.4vw,38px);font-weight:900;letter-spacing:.16em;
  text-transform:uppercase;color:rgba(255,255,255,.9);transform:rotate(-8deg);
  border:3px solid rgba(255,255,255,.55);border-radius:12px;padding:10px 22px}
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

  ${teaser
    ? `<div class="gate" style="background-image:url('${esc(thumb)}')">
      <div class="soon-mark"><span>Dropping soon</span></div>
    </div>
  <p class="note">This round is queued for release. It goes up here when it does.</p>`
    : youtubeId
    ? // The YouTube player when the round is on the channel, so the watch
      // time counts there instead of being split away from it. nocookie
      // is the same player without the tracking cookie on first load.
      `<div class="embed"><iframe id="roundYoutube" src="https://www.youtube-nocookie.com/embed/${youtubeId}?enablejsapi=1&amp;origin=${encodeURIComponent(SITE_ORIGIN)}"
      title="${esc(shortTitle)}" loading="lazy" allowfullscreen
      allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
      referrerpolicy="strict-origin-when-cross-origin"></iframe></div>
  <p class="note">The full round, opening speech through to the end. Nothing is cut.</p>`
    : // The gate. Poster plus the ask, routing to the hub player, which is
      // the surface that can actually hold a token.
      `<div class="gate" style="background-image:url('${esc(thumb)}')">
      <div class="gate-in">
        <h2>Sign in to watch the round</h2>
        <p>Full rounds are for members. An account is free and takes about ten seconds.</p>
        <a class="gate-btn" href="/watch?r=${encodeURIComponent(id)}">Sign in and watch</a>
      </div>
    </div>
  <p class="note">The full round, opening speech through to the end. Nothing is cut.</p>`}

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
${youtubeId && !teaser ? `<script>
(function(){
  var pending = false;
  var payload = ${viewPayload};
  var key = 'da-replay-view:' + payload.id;
  function recordView(){
    if (pending) return;
    try { if (sessionStorage.getItem(key)) return; } catch(e){}
    pending = true;
    fetch('/api/recordings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      keepalive: true
    }).then(function(r){
      if (!r.ok) throw new Error('view');
      return r.json();
    }).then(function(j){
      try { sessionStorage.setItem(key, '1'); } catch(e){}
      var node = document.getElementById('viewCount');
      if (node) node.textContent = Number(j.viewCount || 0).toLocaleString() + (Number(j.viewCount) === 1 ? ' view' : ' views');
    }).catch(function(){ pending = false; });
  }

  window.onYouTubeIframeAPIReady = function(){
    new YT.Player('roundYoutube', {
      events: { onStateChange: function(e){
        if (e.data === YT.PlayerState.PLAYING) recordView();
      } }
    });
  };
  var api = document.createElement('script');
  api.src = 'https://www.youtube.com/iframe_api';
  document.head.appendChild(api);
})();
</script>` : ''}
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

  if (play) {
    const d = snap.data() || {};
    // A teaser has no file behind it, so this is a 404 rather than a
    // gate: there is nothing an account would unlock.
    if (d.teaser === true) return notFound();
    // Everything else refuses. A <video> cannot send a token, so this
    // path cannot be opened for a signed-in viewer without opening it for
    // everyone; the signed-in viewer gets their link from
    // /api/recordings?link=1 on the hub instead.
    return playGated(id);
  }

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
