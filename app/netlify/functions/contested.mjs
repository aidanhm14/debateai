// /contested — what is actually being argued right now.
//
// The public face of the X pulse. Every fault line here was harvested
// from live X posts overnight, converted into tournament motions, and
// APPROVED BY A HUMAN before it could reach this page. Nothing renders
// straight from the firehose.
//
// Two audiences, one page. A debater looking for something current to
// run gets motions in real tournament phrasing on either side. A search
// visitor typing "debate topics about X" gets a page that answers with
// the actual argument rather than a listicle.
//
// Honesty rules, and they are not decoration:
//   - The page says where this came from. "Sourced from public posts on
//     X" is stated in the lede, not buried, because a reader deciding
//     whether to trust a framing needs to know it came off a platform.
//   - Post links are rendered as receipts. A fault line nobody can trace
//     is a fault line we are asking readers to take on faith.
//   - Nothing here claims consensus, popularity, or that either side is
//     winning. Volume on a platform is not a warrant, and a page that
//     implied otherwise would teach the exact habit the product exists
//     to break.
//
// Server-rendered with no client hydration, matching /motions and
// /debate: the content IS the point of the URL. Routing lives in
// netlify.toml (/contested -> /api/contested).

import { getDb } from './lib/firestore.mjs';

const SITE_ORIGIN = 'https://itsdebatable.com';
const OG_IMAGE = `${SITE_ORIGIN}/og-image.png?v=floor1`;

const FORMAT_LABELS = {
  apda: 'APDA', bp: 'British Parli', asian: 'Asian Parli',
  worlds: 'World Schools', pf: 'Public Forum', ld: 'Lincoln-Douglas',
};

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function styles() {
  return `
  @import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600&display=swap');
  *{box-sizing:border-box;margin:0;padding:0}
  :root{
    --bg:#fbfaf7; --ink:#1b1b21; --dim:#5f5f6a; --ghost:#5f5f6a;
    --card:#ffffff; --line:rgba(20,20,30,.10); --line-2:rgba(20,20,30,.17);
    --red:#b91c1c; --pro:#15803d; --con:#b91c1c;
    --serif:'Fraunces',Georgia,'Times New Roman',serif;
    --sans:Crimson Pro,Georgia,serif;
  }
  body{
    background:
      radial-gradient(1000px 560px at 15% -10%, rgba(120,140,200,.05), transparent 60%),
      radial-gradient(820px 460px at 90% 2%, rgba(220,38,38,.035), transparent 55%),
      var(--bg);
    background-attachment:fixed; color:var(--ink);
    font:17px/1.65 var(--sans);
    -webkit-font-smoothing:antialiased;-moz-osx-font-smoothing:grayscale;min-height:100vh;
  }
  em,i{font-style:normal}
  a{color:var(--red);text-decoration:none}
  a:hover{text-decoration:underline}
  .shell{max-width:940px;margin:0 auto;padding:32px 36px 120px}
  .topnav{display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:42px}
  .topnav a{display:inline-flex;align-items:center;gap:7px;font:700 13px/1 var(--sans);color:var(--dim);border:1px solid var(--line);background:var(--card);padding:9px 14px;border-radius:11px}
  .topnav a:hover{color:var(--ink);border-color:var(--line-2);text-decoration:none}
  .topnav a.cta{color:#fff;border-color:transparent;background:linear-gradient(180deg,#dc2626,#b91c1c)}
  .eye{color:var(--ghost);margin:0 0 16px;font:800 12px/1.4 var(--sans);letter-spacing:.18em;text-transform:uppercase}
  h1{font:500 clamp(30px,4.4vw,45px)/1.14 var(--serif);letter-spacing:-.015em;margin-bottom:18px}
  .sub{font-size:18px;line-height:1.55;color:var(--dim);max-width:640px;margin-bottom:10px}
  .prov{font-size:13.5px;color:var(--ghost);max-width:640px;margin-bottom:34px}
  .fl{border:1px solid var(--line);background:var(--card);border-radius:16px;padding:24px;margin-bottom:22px;
      box-shadow:0 1px 2px rgba(20,20,30,.03)}
  .fl-top{display:flex;justify-content:space-between;gap:14px;align-items:baseline;flex-wrap:wrap}
  .dom{font:800 10px/1 var(--sans);letter-spacing:.16em;text-transform:uppercase;color:var(--ghost);
       border:1px solid var(--line-2);border-radius:999px;padding:6px 11px;white-space:nowrap}
  h2{font:500 clamp(21px,2.6vw,27px)/1.25 var(--serif);letter-spacing:-.01em;flex:1;min-width:260px}
  .why{color:var(--dim);font-size:15.5px;margin:12px 0 18px;line-height:1.6}
  .sides{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:12px;margin-bottom:18px}
  .side{border:1px solid var(--line);border-radius:12px;padding:13px 15px;background:rgba(20,20,30,.015)}
  .side .k{font:800 9.5px/1 var(--sans);letter-spacing:.14em;text-transform:uppercase;color:var(--ghost);margin-bottom:7px}
  .side .n{font-weight:700;font-size:15px;margin-bottom:7px}
  .side ul{list-style:none}
  .side li{font-size:13.5px;color:var(--dim);line-height:1.5;padding-left:13px;position:relative;margin-bottom:4px}
  .side li::before{content:"";position:absolute;left:0;top:9px;width:5px;height:1px;background:var(--line-2)}
  .side-a{border-left:3px solid var(--pro)}
  .side-b{border-left:3px solid var(--con)}
  .mots{border-top:1px solid var(--line);padding-top:16px}
  .mots .k{font:800 10px/1 var(--sans);letter-spacing:.16em;text-transform:uppercase;color:var(--ghost);margin-bottom:12px}
  .mot{display:flex;gap:12px;align-items:baseline;padding:8px 0;border-bottom:1px solid rgba(20,20,30,.05)}
  .mot:last-child{border-bottom:none}
  .mot .f{font:800 9.5px/1 var(--sans);letter-spacing:.1em;text-transform:uppercase;color:var(--ghost);min-width:88px;flex-shrink:0;padding-top:4px}
  .mot .t{font-size:15.5px;font-weight:600;line-height:1.45}
  .mot .bg{font-size:13px;color:var(--dim);line-height:1.55;margin-top:5px}
  .cites{margin-top:14px;font-size:12px;color:var(--ghost)}
  .cites a{color:var(--ghost);margin-right:10px;border-bottom:1px solid var(--line-2)}
  .cites a:hover{color:var(--ink);text-decoration:none}
  .empty{border:1px dashed var(--line-2);border-radius:16px;padding:40px 28px;text-align:center;color:var(--dim)}
  .foot{margin-top:60px;padding-top:24px;border-top:1px solid var(--line);font-size:13.5px;color:var(--ghost)}
  @media(max-width:640px){.shell{padding:22px 18px 90px}.mot{flex-direction:column;gap:2px}.mot .f{padding-top:0}}
  `;
}

function renderFaultLine(line) {
  const a = line.sideA || {};
  const b = line.sideB || {};

  const sideBlock = (side, cls, key) => {
    if (!side.label) return '';
    const items = (side.phrasing || []).map(p => `<li>${esc(p)}</li>`).join('');
    return `<div class="side ${cls}">
      <div class="k">${key}</div>
      <div class="n">${esc(side.label)}</div>
      ${items ? `<ul>${items}</ul>` : ''}
    </div>`;
  };

  const motions = (line.motions || []).map(m => `
    <div class="mot">
      <div class="f">${esc(FORMAT_LABELS[m.format] || m.format)}</div>
      <div>
        <div class="t">${esc(m.text)}</div>
        ${m.bg ? `<div class="bg">${esc(m.bg)}</div>` : ''}
      </div>
    </div>`).join('');

  // Receipts. Capped at six so the row stays readable; the point is that
  // the trail exists and is followable, not that every post is listed.
  const cites = (line.citations || []).slice(0, 6)
    .map((u, i) => `<a href="${esc(u)}" target="_blank" rel="noopener nofollow">post ${i + 1}</a>`)
    .join('');

  return `<article class="fl">
    <div class="fl-top">
      <h2>${esc(line.headline)}</h2>
      <span class="dom">${esc(line.domainLabel || '')}</span>
    </div>
    ${line.summary ? `<p class="why">${esc(line.summary)}</p>` : ''}
    <div class="sides">
      ${sideBlock(a, 'side-a', 'One side')}
      ${sideBlock(b, 'side-b', 'The other side')}
    </div>
    ${motions ? `<div class="mots"><div class="k">Run it as a motion</div>${motions}</div>` : ''}
    ${cites ? `<div class="cites">Traced to: ${cites}</div>` : ''}
  </article>`;
}

export default async (request) => {
  let faultLines = [];
  let updatedAt = null;

  try {
    const db = getDb();
    const doc = await db.collection('topic_pulse').doc('current').get();
    const data = doc.exists ? (doc.data() || {}) : {};
    faultLines = Array.isArray(data.faultLines) ? data.faultLines : [];
    updatedAt = data.updatedAt && typeof data.updatedAt.toMillis === 'function'
      ? data.updatedAt.toMillis() : null;
  } catch (err) {
    console.error('contested read failed:', err.message);
    // Fall through to the empty state. A page that 500s is worse than a
    // page that honestly says nothing has been published yet.
  }

  const canonical = `${SITE_ORIGIN}/contested`;
  const updatedLabel = updatedAt ? new Date(updatedAt).toISOString().slice(0, 10) : '';

  const title = 'What is being argued right now · Debatable';
  const description = 'Live fault lines from public posts on X, turned into competitive debate motions on either side. Reviewed before publishing, updated as the argument moves.';

  const body = faultLines.length
    ? faultLines.map(renderFaultLine).join('')
    : `<div class="empty">
         <p>Nothing published yet.</p>
         <p style="margin-top:8px;font-size:14px">Fault lines are harvested nightly and reviewed before they appear here. Check back tomorrow, or <a href="/practice">start a round</a> on a motion from the library.</p>
       </div>`;

  // ItemList rather than Article: this is a list of contested questions,
  // and describing it as an article would misrepresent authorship of
  // material that came off a platform.
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: 'Contested questions',
    description,
    url: canonical,
    numberOfItems: faultLines.length,
    itemListElement: faultLines.slice(0, 30).map((l, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: l.headline,
    })),
  };

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${canonical}">
<meta property="og:type" content="website">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${canonical}">
<meta property="og:image" content="${OG_IMAGE}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(description)}">
<script type="application/ld+json">${JSON.stringify(jsonLd)}</script>
<style>${styles()}</style>
</head>
<body>
<div class="shell">
  <nav class="topnav">
    <a href="/">Debatable</a>
    <span style="display:flex;gap:8px;flex-wrap:wrap">
      <a href="/motions">Motion library</a>
      <a href="/topics">Topics</a>
      <a class="cta" href="/practice">Start a round</a>
    </span>
  </nav>

  <p class="eye">Contested now${updatedLabel ? ` &middot; updated ${esc(updatedLabel)}` : ''}</p>
  <h1>What people are actually arguing about.</h1>
  <p class="sub">Not headlines. Disagreements, where serious people are landing on opposite sides, with the terms each side actually uses and a motion you can run tonight.</p>
  <p class="prov">Sourced from public posts on X and reviewed before publishing. Volume on a platform is not evidence, and nothing here says who is right. The point is to show you where the clash sits so you can argue either side of it.</p>

  ${body}

  <p class="foot">Harvested nightly, published only after review. Motions are written in tournament phrasing per format. Want one as a live round? <a href="/practice">Pick a side and start.</a></p>
</div>
<script defer src="/js/read-aloud.js"></script>
</body>
</html>`;

  return new Response(html, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      // Changes only when an admin approves something. An hour of stale
      // is invisible to a reader and keeps this off the function budget.
      'Cache-Control': 'public, max-age=3600, s-maxage=3600',
    },
  });
};

export const config = {
  path: '/api/contested',
};
