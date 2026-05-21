// /debate{/slug?} — server-rendered "debate dossier" pages.
//
// These are the issue-debate landing pages (AI regulation, AI vs jobs,
// ban TikTok, UBI, nuclear, ...). Each is a self-contained argument
// workspace, not a blog post: motion hero + practice panel, a clash
// compass, a pro/con argument arena, a sample-round transcript with
// judge notes, a judge ballot, and related motions + drills.
//
// Data lives in lib/debate-bank.mjs (single source of truth). This file
// only renders. Content is server-rendered into the initial HTML (no
// client hydration) so Googlebot gets the full page on first request —
// that is the whole SEO point of these URLs. The small inline script is
// progressive enhancement only (sticky CTA reveal); the page is fully
// readable and actionable with JS off.
//
// Routing (netlify.toml): /debate -> /api/debate, /debate/* -> /api/debate/*.
// Visual register: dark cinematic "intelligence brief", deliberately
// distinct from the light /learn surfaces and the marketing landing.

import { MOTION_BANK, getMotion, listMotions } from './lib/debate-bank.mjs';

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
function trainerHref(motion, side) {
  const m = encodeURIComponent(motion.title);
  const s = side ? `&side=${side}` : '';
  // Hand off to the live voice round (voice-debate.html), prefilled so the
  // user is one tap from Connect. Background = the dossier's own framing +
  // central clash, piped into the AI's system prompt for the live round.
  // Drills pass a bare { title } object, so subtitle/clash may be absent.
  const bgParts = [];
  if (motion.subtitle) bgParts.push(motion.subtitle);
  if (motion.clash && motion.clash.question) bgParts.push(`The round turns on this: ${motion.clash.question}`);
  const bg = bgParts.length ? `&background=${encodeURIComponent(bgParts.join(' '))}` : '';
  return `/voice-debate?motion=${m}${s}${bg}&handoff=dossier`;
}

function extractFromUrl(url) {
  try {
    const u = new URL(url);
    const path = u.pathname.replace(/^\/api/, '');
    if (/^\/debate\/?$/i.test(path)) return { mode: 'hub' };
    const m = path.match(/^\/debate\/([a-z0-9-]+)\/?$/i);
    if (m) return { mode: 'motion', slug: m[1].toLowerCase() };
    return null;
  } catch { return null; }
}

function notFoundResponse() {
  const motions = listMotions();
  const body = `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Motion not found · Debate AI</title>
<meta name="robots" content="noindex">
<style>
  body{background:#080C14;color:#e8edf6;font:17px/1.7 -apple-system,BlinkMacSystemFont,system-ui,sans-serif;margin:0;padding:64px 24px;text-align:center}
  h1{font:800 30px/1.2 system-ui;margin-bottom:14px}
  a{color:#ff5d5d;text-decoration:none}
  a:hover{text-decoration:underline}
  .list{max-width:640px;margin:18px auto 0;line-height:2}
</style>
</head><body>
<h1>That motion is not on file.</h1>
<p>Open one of these instead.</p>
<div class="list">${motions.map(m => `<a href="/debate/${m.slug}">${esc(m.title)}</a>`).join(' · ')}</div>
<p style="margin-top:28px"><a href="/debate">All motions →</a></p>
</body></html>`;
  return new Response(body, { status: 404, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}

function commonStyles() {
  return `
  *{box-sizing:border-box;margin:0;padding:0}
  :root{
    --bg:#080C14; --ink:#e8edf6; --dim:#9aa7bd; --ghost:#6b7689;
    --pro:#36d399; --pro-soft:rgba(54,211,153,.13); --pro-line:rgba(54,211,153,.45);
    --con:#ff5d5d; --con-soft:rgba(255,93,93,.12); --con-line:rgba(255,93,93,.42);
    --gold:#f5b301;
    --card:rgba(255,255,255,.045); --card-2:rgba(255,255,255,.025);
    --line:rgba(255,255,255,.085); --line-2:rgba(255,255,255,.14);
    --red:#ef4444;
  }
  html{scroll-behavior:smooth}
  body{
    background:
      radial-gradient(1100px 620px at 18% -8%, rgba(120,140,200,.10), transparent 60%),
      radial-gradient(900px 500px at 92% 4%, rgba(239,68,68,.08), transparent 55%),
      linear-gradient(180deg, #0a0f1a 0%, #080C14 42%, #05070d 100%);
    background-attachment:fixed;
    color:var(--ink);
    font:17px/1.65 -apple-system,BlinkMacSystemFont,"SF Pro Text",system-ui,sans-serif;
    -webkit-font-smoothing:antialiased;
    min-height:100vh;
  }
  /* barely-there blueprint grid */
  body::before{
    content:"";position:fixed;inset:0;pointer-events:none;z-index:0;
    background-image:linear-gradient(rgba(255,255,255,.022) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.022) 1px,transparent 1px);
    background-size:46px 46px;
    mask-image:radial-gradient(circle at 50% 22%, #000 0%, transparent 78%);
  }
  a{color:var(--red);text-decoration:none}
  a:hover{text-decoration:underline}
  .shell{max-width:1180px;margin:0 auto;padding:34px 40px 140px;position:relative;z-index:1}

  .topnav{display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:46px}
  .topnav .nav-group{display:flex;align-items:center;gap:8px}
  .topnav a{display:inline-flex;align-items:center;gap:7px;font:700 13px/1 system-ui;letter-spacing:.01em;color:var(--dim);border:1px solid var(--line);background:var(--card);padding:9px 14px;border-radius:11px;transition:color .14s,border-color .14s,background .14s,transform .14s}
  .topnav a:hover{color:var(--ink);border-color:var(--line-2);background:rgba(255,255,255,.07);text-decoration:none;transform:translateY(-1px)}
  .topnav a .ar{color:var(--ghost);font-size:14px;transition:color .14s}
  .topnav a:hover .ar{color:var(--ink)}
  .topnav a.nav-cta{color:#fff;border-color:var(--con-line);background:linear-gradient(180deg,rgba(239,68,68,.16),rgba(239,68,68,.06))}
  .topnav a.nav-cta .ar{color:rgba(255,255,255,.7)}
  .topnav a.nav-cta:hover{border-color:var(--red);background:linear-gradient(180deg,rgba(239,68,68,.26),rgba(239,68,68,.1))}
  .topnav a.nav-cta:hover .ar{color:#fff}

  .label{font:800 11px/1 system-ui;letter-spacing:.16em;text-transform:uppercase}
  .stamp{display:inline-flex;align-items:center;gap:8px;font:800 10.5px/1 system-ui;letter-spacing:.18em;text-transform:uppercase;color:var(--dim);
    border:1px solid var(--line-2);border-radius:999px;padding:7px 13px}
  .stamp .dot{width:6px;height:6px;border-radius:50%;background:var(--red);box-shadow:0 0 8px var(--red)}

  /* ---------- HERO ---------- */
  .hero{display:grid;grid-template-columns:minmax(0,1.15fr) 360px;gap:56px;align-items:start;margin-bottom:18px}
  .hero-eye{color:var(--ghost);margin:22px 0 18px;font:800 12px/1.4 system-ui;letter-spacing:.18em;text-transform:uppercase}
  .hero-eye b{color:var(--red);font-weight:800}
  h1{font:800 60px/0.98 "SF Pro Display",-apple-system,system-ui,sans-serif;letter-spacing:-.025em;margin-bottom:20px;
    background:linear-gradient(180deg,#fff 0%,#cdd6e6 100%);-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent}
  .hero-sub{font-size:19px;line-height:1.5;color:var(--dim);max-width:580px;margin-bottom:26px}
  .chips{display:flex;flex-wrap:wrap;gap:9px}
  .chip{display:inline-flex;flex-direction:column;gap:3px;border:1px solid var(--line);background:var(--card-2);border-radius:12px;padding:9px 13px;min-width:0}
  .chip .k{font:800 9.5px/1 system-ui;letter-spacing:.14em;text-transform:uppercase;color:var(--ghost)}
  .chip .v{font-size:13.5px;color:var(--ink);font-weight:600}

  .panel{position:sticky;top:24px;border:1px solid var(--line-2);border-radius:20px;padding:24px;
    background:linear-gradient(180deg,rgba(239,68,68,.08),rgba(255,255,255,.03));
    box-shadow:0 24px 60px -24px rgba(0,0,0,.7), inset 0 1px 0 rgba(255,255,255,.05)}
  .panel h3{font:800 18px/1.2 "SF Pro Display",system-ui;margin-bottom:4px}
  .panel .ph-sub{font-size:13px;color:var(--dim);margin-bottom:18px}
  .btn{display:flex;align-items:center;justify-content:space-between;width:100%;border-radius:12px;padding:13px 16px;margin-bottom:9px;
    font:800 14px/1 system-ui;letter-spacing:.01em;border:1px solid var(--line-2);background:var(--card);color:var(--ink);cursor:pointer;transition:transform .12s,border-color .12s,background .12s}
  .btn:hover{text-decoration:none;transform:translateY(-1px)}
  .btn .arr{opacity:.5;font-weight:700}
  .btn-pro{border-color:var(--pro-line);background:var(--pro-soft)} .btn-pro:hover{border-color:var(--pro);background:rgba(54,211,153,.2)}
  .btn-con{border-color:var(--con-line);background:var(--con-soft)} .btn-con:hover{border-color:var(--con);background:rgba(255,93,93,.2)}
  .btn-ghost{background:transparent;color:var(--dim)} .btn-ghost:hover{color:var(--ink);border-color:var(--line-2)}
  .panel .fine{font-size:11.5px;color:var(--ghost);text-align:center;margin-top:12px;letter-spacing:.02em}

  /* ---------- SECTION HEADERS ---------- */
  .sec{margin-top:80px}
  .sec-eye{font:800 11px/1 system-ui;letter-spacing:.2em;text-transform:uppercase;color:var(--ghost);display:flex;align-items:center;gap:14px;margin-bottom:22px}
  .sec-eye::after{content:"";flex:1;height:1px;background:linear-gradient(90deg,var(--line-2),transparent)}

  /* ---------- CLASH COMPASS ---------- */
  .compass{border:1px solid var(--line-2);border-radius:24px;padding:30px 32px 26px;background:var(--card-2);position:relative;overflow:hidden}
  .compass::before{content:"";position:absolute;left:50%;top:0;width:280px;height:1px;transform:translateX(-50%);background:linear-gradient(90deg,transparent,var(--red),transparent);opacity:.6}
  .compass-q{font:600 23px/1.34 "SF Pro Display",system-ui;letter-spacing:-.01em;text-align:center;max-width:760px;margin:6px auto 26px;color:#fff}
  .poles{display:grid;grid-template-columns:1fr 1fr;gap:18px}
  .pole{border-radius:16px;padding:18px 20px;border:1px solid var(--line)}
  .pole.p{background:var(--pro-soft);border-color:var(--pro-line)}
  .pole.c{background:var(--con-soft);border-color:var(--con-line)}
  .pole .ph{font:800 12px/1 system-ui;letter-spacing:.14em;text-transform:uppercase;margin-bottom:12px}
  .pole.p .ph{color:var(--pro)} .pole.c .ph{color:var(--con)}
  .pole ul{list-style:none}
  .pole li{position:relative;padding:5px 0 5px 18px;font-size:14.5px;color:var(--ink)}
  .pole li::before{content:"";position:absolute;left:0;top:13px;width:9px;height:1px}
  .pole.p li::before{background:var(--pro)} .pole.c li::before{background:var(--con)}
  .axis{display:flex;align-items:center;gap:14px;margin-top:24px}
  .axis .ln{flex:1;height:1px;background:linear-gradient(90deg,var(--pro-line),var(--line-2) 45%,var(--con-line))}
  .axis .core{font:800 11.5px/1.4 system-ui;letter-spacing:.04em;color:var(--ink);text-align:center;
    border:1px solid var(--line-2);border-radius:999px;padding:9px 16px;background:#0b1019;
    box-shadow:0 0 0 4px rgba(245,179,1,.06),0 0 22px rgba(245,179,1,.16);max-width:340px}

  /* ---------- ARGUMENT ARENA ---------- */
  .arena{display:grid;grid-template-columns:1fr auto 1fr;gap:24px;align-items:start}
  .side-head{display:flex;align-items:center;gap:10px;margin-bottom:14px}
  .side-tag{font:800 12px/1 system-ui;letter-spacing:.14em;text-transform:uppercase;padding:7px 12px;border-radius:8px}
  .col-pro .side-tag{color:#04130c;background:var(--pro)} .col-con .side-tag{color:#160404;background:var(--con)}
  .thesis{font-size:14.5px;line-height:1.5;color:var(--dim);font-style:italic;margin-bottom:16px;min-height:0}
  .acard{border:1px solid var(--line);background:var(--card);border-radius:16px;padding:16px 17px;margin-bottom:14px;transition:transform .12s,border-color .12s,box-shadow .12s}
  .acard:hover{transform:translateY(-2px);box-shadow:0 18px 40px -26px rgba(0,0,0,.8)}
  .col-pro .acard{border-left:2px solid var(--pro-line)} .col-pro .acard:hover{border-color:var(--pro-line)}
  .col-con .acard{border-left:2px solid var(--con-line)} .col-con .acard:hover{border-color:var(--con-line)}
  .acard-h{font:800 13px/1.2 system-ui;letter-spacing:.04em;margin-bottom:12px;display:flex;align-items:baseline;gap:8px}
  .acard-h .n{font-size:11px;color:var(--ghost)}
  .col-pro .acard-h{color:var(--pro)} .col-con .acard-h{color:var(--con)}
  .row{display:grid;grid-template-columns:62px 1fr;gap:10px;padding:5px 0;font-size:14px;line-height:1.45}
  .row .t{font:800 9.5px/1.5 system-ui;letter-spacing:.1em;text-transform:uppercase;color:var(--ghost);padding-top:2px}
  .row .x{color:var(--ink)}
  details.weak{margin-top:11px;border-top:1px dashed var(--line-2);padding-top:10px}
  details.weak summary{list-style:none;cursor:pointer;font:800 10px/1 system-ui;letter-spacing:.12em;text-transform:uppercase;color:var(--gold);display:flex;align-items:center;gap:7px}
  details.weak summary::-webkit-details-marker{display:none}
  details.weak summary::before{content:"▸";font-size:9px;transition:transform .15s}
  details.weak[open] summary::before{transform:rotate(90deg)}
  details.weak .wbody{font-size:13.5px;line-height:1.5;color:var(--dim);margin-top:8px}
  .vs{display:flex;align-items:center;justify-content:center;padding-top:46px}
  .vs span{font:900 13px/1 system-ui;letter-spacing:.1em;color:var(--ghost);border:1px solid var(--line-2);border-radius:50%;width:46px;height:46px;display:flex;align-items:center;justify-content:center;background:#0b1019;
    box-shadow:0 0 24px rgba(0,0,0,.6)}

  /* ---------- TRANSCRIPT ---------- */
  .transcript{max-width:880px;margin:0 auto;position:relative;padding-left:8px}
  .turn{position:relative;padding:0 0 4px 28px;margin-bottom:22px}
  .turn::before{content:"";position:absolute;left:0;top:6px;bottom:-22px;width:2px;background:var(--line)}
  .turn:last-child::before{display:none}
  .turn::after{content:"";position:absolute;left:-4px;top:6px;width:10px;height:10px;border-radius:50%;border:2px solid var(--bg)}
  .turn.pro::after{background:var(--pro)} .turn.con::after{background:var(--con)}
  .turn.pro::before{background:linear-gradient(var(--pro-line),var(--line))}
  .turn.con::before{background:linear-gradient(var(--con-line),var(--line))}
  .turn-head{display:flex;align-items:center;gap:10px;margin-bottom:8px;flex-wrap:wrap}
  .turn-spk{font:800 11px/1 system-ui;letter-spacing:.12em;text-transform:uppercase}
  .turn.pro .turn-spk{color:var(--pro)} .turn.con .turn-spk{color:var(--con)}
  .badge{font:800 9.5px/1 system-ui;letter-spacing:.06em;text-transform:uppercase;padding:5px 9px;border-radius:6px;border:1px solid var(--line-2);color:var(--dim)}
  .turn.pro .badge{color:var(--pro);border-color:var(--pro-line);background:var(--pro-soft)}
  .turn.con .badge{color:var(--con);border-color:var(--con-line);background:var(--con-soft)}
  .turn-body{border:1px solid var(--line);background:var(--card);border-radius:14px;padding:15px 17px;font-size:15.5px;line-height:1.6;color:var(--ink)}
  .jnote{display:flex;gap:10px;margin-top:10px;padding:10px 13px;border-radius:10px;background:rgba(245,179,1,.06);border:1px solid rgba(245,179,1,.18)}
  .jnote .jk{font:800 9px/1.5 system-ui;letter-spacing:.12em;text-transform:uppercase;color:var(--gold);white-space:nowrap}
  .jnote .jx{font-size:13.5px;line-height:1.5;color:#d8c89a;font-style:italic}

  /* ---------- BALLOT ---------- */
  .ballot{border:1px solid var(--line-2);border-radius:24px;padding:32px;background:
    radial-gradient(600px 200px at 80% -20%, rgba(245,179,1,.07), transparent 60%),var(--card-2)}
  .ballot-top{display:flex;align-items:center;gap:16px;flex-wrap:wrap;margin-bottom:22px;padding-bottom:22px;border-bottom:1px solid var(--line)}
  .winner{font:800 11px/1 system-ui;letter-spacing:.14em;text-transform:uppercase;padding:10px 16px;border-radius:10px}
  .winner.pro{color:#04130c;background:var(--pro)} .winner.con{color:#160404;background:var(--con)}
  .margin{font-size:13px;color:var(--dim)}
  .ballot-grid{display:grid;grid-template-columns:1fr 1fr;gap:22px 32px}
  .bcell .bk{font:800 10px/1 system-ui;letter-spacing:.14em;text-transform:uppercase;color:var(--ghost);margin-bottom:8px}
  .bcell p{font-size:15px;line-height:1.6;color:var(--ink)}
  .bcell.full{grid-column:1/-1}
  .fb{font-size:14.5px;line-height:1.55;color:var(--dim)}
  .fb b{color:var(--ink)}
  .drill{grid-column:1/-1;border:1px dashed var(--line-2);border-radius:14px;padding:16px 18px;background:rgba(255,255,255,.02);margin-top:4px}
  .drill .bk{color:var(--gold)}
  .rematch{display:flex;gap:10px;flex-wrap:wrap;margin-top:22px;padding-top:22px;border-top:1px solid var(--line)}
  .rematch a{flex:1;min-width:160px;text-align:center}

  /* ---------- RELATED + DRILLS ---------- */
  .grid2{display:grid;grid-template-columns:1.3fr 1fr;gap:40px}
  .rel-list{list-style:none}
  .rel-list li{border-bottom:1px solid var(--line);padding:0}
  .rel-list li:last-child{border-bottom:none}
  .rel-list a{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:15px 4px;color:var(--ink)}
  .rel-list a:hover{text-decoration:none;color:#fff;padding-left:8px;transition:padding .12s}
  .rel-list a:hover .rarr{color:var(--red)}
  .rel-list .rt{font:600 16px/1.35 "SF Pro Display",system-ui}
  .rel-list .rarr{color:var(--ghost)}
  .drills{list-style:none}
  .drill-item{border:1px solid var(--line);background:var(--card);border-radius:13px;padding:13px 15px;margin-bottom:10px;display:flex;justify-content:space-between;align-items:center;gap:12px;color:var(--ink)}
  .drill-item:hover{text-decoration:none;border-color:var(--line-2);background:rgba(255,255,255,.06)}
  .drill-item .dl{font-size:14px;font-weight:600;line-height:1.35}
  .drill-item .dx{color:var(--ghost);font-size:18px}

  footer.dfoot{margin-top:80px;padding-top:24px;border-top:1px solid var(--line);display:flex;justify-content:space-between;flex-wrap:wrap;gap:12px;font-size:13px;color:var(--ghost)}
  footer.dfoot a{color:var(--ghost)} footer.dfoot a:hover{color:var(--ink);text-decoration:none}

  /* ---------- RIGHT RAIL ---------- */
  .rail{position:fixed;right:18px;top:50%;transform:translateY(-50%);z-index:20;display:flex;flex-direction:column;gap:8px}
  .rail a{display:flex;align-items:center;gap:0;height:42px;width:42px;overflow:hidden;border:1px solid var(--line-2);border-radius:12px;background:#0b1019cc;backdrop-filter:blur(6px);
    color:var(--dim);transition:width .18s,color .12s,border-color .12s;white-space:nowrap}
  .rail a:hover{width:160px;color:var(--ink);border-color:var(--red);text-decoration:none}
  .rail a .ic{min-width:42px;text-align:center;font-size:15px}
  .rail a .tx{font:800 11px/1 system-ui;letter-spacing:.04em;text-transform:uppercase;opacity:0;transition:opacity .12s}
  .rail a:hover .tx{opacity:1}

  /* ---------- STICKY BOTTOM CTA ---------- */
  .sticky{position:fixed;left:0;right:0;bottom:0;z-index:30;transform:translateY(120%);transition:transform .26s ease;
    background:linear-gradient(180deg,rgba(8,12,20,.6),rgba(5,7,13,.96));border-top:1px solid var(--line-2);backdrop-filter:blur(10px)}
  .sticky.show{transform:translateY(0)}
  .sticky-in{max-width:1180px;margin:0 auto;padding:13px 40px;display:flex;align-items:center;justify-content:space-between;gap:16px}
  .sticky .sq{font:700 14.5px/1.3 "SF Pro Display",system-ui;color:var(--ink)}
  .sticky .sq b{color:var(--dim);font-weight:500;display:block;font-size:12px;margin-top:2px}
  .sticky .sbtns{display:flex;gap:10px;flex-shrink:0}
  .sticky .sbtns a{font:800 13px/1 system-ui;letter-spacing:.02em;padding:12px 20px;border-radius:10px;border:1px solid var(--line-2)}
  .sticky .sbtns a:hover{text-decoration:none;transform:translateY(-1px)}
  .sticky .s-pro{color:var(--pro);border-color:var(--pro-line);background:var(--pro-soft)}
  .sticky .s-con{color:var(--con);border-color:var(--con-line);background:var(--con-soft)}

  /* ---------- HUB ---------- */
  .hub-h1{font-size:56px;margin-bottom:18px}
  .hub-intro{font-size:19px;line-height:1.5;color:var(--dim);max-width:640px;margin-bottom:48px}
  .hub-group-eye{font:800 11px/1 system-ui;letter-spacing:.2em;text-transform:uppercase;color:var(--ghost);display:flex;align-items:center;gap:14px;margin:44px 0 18px}
  .hub-group-eye::after{content:"";flex:1;height:1px;background:linear-gradient(90deg,var(--line-2),transparent)}
  .hub-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:16px}
  .hub-card{border:1px solid var(--line);background:var(--card);border-radius:18px;padding:22px;display:block;color:var(--ink);transition:transform .14s,border-color .14s,box-shadow .14s}
  .hub-card:hover{transform:translateY(-3px);border-color:var(--line-2);text-decoration:none;box-shadow:0 24px 50px -30px rgba(0,0,0,.8)}
  .hub-card .hc-eye{font:800 10px/1 system-ui;letter-spacing:.14em;text-transform:uppercase;color:var(--red);margin-bottom:9px}
  .hub-card .hc-t{font:800 19px/1.22 "SF Pro Display",system-ui;letter-spacing:-.01em;margin-bottom:8px}
  .hub-card .hc-clash{font-size:13.5px;line-height:1.5;color:var(--dim)}
  .hub-card .hc-meta{margin-top:14px;display:flex;gap:8px;flex-wrap:wrap}
  .hub-card .hc-chip{font:800 9px/1 system-ui;letter-spacing:.1em;text-transform:uppercase;color:var(--ghost);border:1px solid var(--line);border-radius:6px;padding:5px 8px}

  /* ---------- RESPONSIVE ---------- */
  @media (max-width:900px){
    .shell{padding:26px 22px 160px}
    .hero{grid-template-columns:1fr;gap:30px}
    .panel{position:static}
    h1{font-size:44px} .hub-h1{font-size:40px}
    .arena{grid-template-columns:1fr;gap:14px}
    .vs{display:none}
    .col-con{margin-top:8px}
    .ballot-grid{grid-template-columns:1fr}
    .grid2{grid-template-columns:1fr;gap:30px}
    .poles{grid-template-columns:1fr}
    .rail{display:none}
  }
  @media (max-width:560px){
    h1{font-size:36px} .compass-q{font-size:19px}
    .sticky-in{padding:11px 18px} .sticky .sq b{display:none}
  }
  `;
}

function topNav() {
  return `<nav class="topnav">
    <a class="nav-home" href="/"><span class="ar">←</span> Debate AI</a>
    <span class="nav-group">
      <a href="/debate">All motions</a>
      <a class="nav-cta" href="/debate-ai">Practice <span class="ar">→</span></a>
    </span>
  </nav>`;
}

function rail(motion) {
  return `<div class="rail" aria-label="Round controls">
    <a href="#sample" title="Sample round"><span class="ic">▶</span><span class="tx">Sample round</span></a>
    <a href="${esc(trainerHref(motion))}" title="Practice"><span class="ic">🎙</span><span class="tx">Practice</span></a>
    <a href="/community" title="Discuss"><span class="ic">💬</span><span class="tx">Discuss</span></a>
    <a href="#top" title="Top"><span class="ic">↑</span><span class="tx">Top</span></a>
  </div>`;
}

function argCard(side, a) {
  return `<div class="acard">
    <div class="acard-h"><span class="n">${esc(side.toUpperCase())} ${a.n}</span> ${esc(a.title)}</div>
    <div class="row"><span class="t">Claim</span><span class="x">${esc(a.claim)}</span></div>
    <div class="row"><span class="t">Warrant</span><span class="x">${esc(a.warrant)}</span></div>
    <div class="row"><span class="t">Impact</span><span class="x">${esc(a.impact)}</span></div>
    <details class="weak"><summary>Attack this</summary><div class="wbody">${esc(a.weakSpot)}</div></details>
  </div>`;
}

function renderMotionPage(m) {
  const titleCore = `${m.title} Both Sides, Argued · Debate AI`;
  const title = `${m.title} · Debate AI`;
  const canonical = `${SITE_ORIGIN}/debate/${m.slug}`;
  const proHref = trainerHref(m, 'pro');
  const conHref = trainerHref(m, 'con');
  const anyHref = trainerHref(m);

  const ld = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Article',
        headline: `${m.title} Both Sides, Argued`,
        description: m.description,
        about: m.category,
        keywords: m.keywords.join(', '),
        author: { '@type': 'Organization', name: 'Debate AI', url: SITE_ORIGIN },
        publisher: { '@type': 'Organization', name: 'Debate AI', logo: { '@type': 'ImageObject', url: `${SITE_ORIGIN}/icons/icon-512.png` } },
        url: canonical, mainEntityOfPage: canonical, inLanguage: 'en', image: OG_IMAGE,
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Debate AI', item: `${SITE_ORIGIN}/` },
          { '@type': 'ListItem', position: 2, name: 'Debate', item: `${SITE_ORIGIN}/debate` },
          { '@type': 'ListItem', position: 3, name: m.title, item: canonical },
        ],
      },
    ],
  };

  const related = (m.related || []).map(s => MOTION_BANK[s]).filter(Boolean);

  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(m.description)}">
<meta name="keywords" content="${esc(m.keywords.join(', '))}">
<link rel="canonical" href="${canonical}">
<meta property="og:title" content="${esc(titleCore)}">
<meta property="og:description" content="${esc(m.description)}">
<meta property="og:url" content="${canonical}">
<meta property="og:type" content="article">
<meta property="og:image" content="${OG_IMAGE}">
<meta property="og:site_name" content="Debate AI">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(titleCore)}">
<meta name="twitter:description" content="${esc(m.description)}">
<meta name="twitter:image" content="${OG_IMAGE}">
<meta name="theme-color" content="#080C14">
<link rel="icon" href="/icons/icon-192.png">
<script defer src="/js/track.js"></script>
<script type="application/ld+json">${jsonLd(ld)}</script>
<style>${commonStyles()}</style>
</head>
<body>
<a id="top"></a>
${rail(m)}
<main class="shell">
  ${topNav()}

  <section class="hero">
    <div>
      <span class="stamp"><span class="dot"></span> Debate Dossier</span>
      <div class="hero-eye"><b>${esc(m.category)}</b> · Live Motion</div>
      <h1>${esc(m.title)}</h1>
      <p class="hero-sub">${esc(m.subtitle)}</p>
      <div class="chips">
        <div class="chip"><span class="k">Format</span><span class="v">${esc(m.formats)}</span></div>
        <div class="chip"><span class="k">Difficulty</span><span class="v">${esc(m.difficulty)}</span></div>
        <div class="chip"><span class="k">Main clash</span><span class="v">${esc(m.mainClash)}</span></div>
        <div class="chip"><span class="k">Best for</span><span class="v">${esc((m.bestFor || []).join(', '))}</span></div>
      </div>
    </div>
    <aside class="panel">
      <h3>Ready to argue this?</h3>
      <div class="ph-sub">Pick a side. The AI takes the other.</div>
      <a class="btn btn-pro" href="${esc(proHref)}">Take Pro <span class="arr">→</span></a>
      <a class="btn btn-con" href="${esc(conHref)}">Take Con <span class="arr">→</span></a>
      <a class="btn btn-ghost" href="${esc(anyHref)}">Let the AI pick my side <span class="arr">→</span></a>
      <a class="btn btn-ghost" href="#sample">Watch the sample round <span class="arr">↓</span></a>
      <div class="fine">3-minute round · AI opponent · judge ballot after</div>
    </aside>
  </section>

  <section class="sec">
    <div class="sec-eye">The round turns on this</div>
    <div class="compass">
      <div class="compass-q">${esc(m.clash.question)}</div>
      <div class="poles">
        <div class="pole p">
          <div class="ph">${esc(m.clash.pro.label)}</div>
          <ul>${m.clash.pro.points.map(p => `<li>${esc(p)}</li>`).join('')}</ul>
        </div>
        <div class="pole c">
          <div class="ph">${esc(m.clash.con.label)}</div>
          <ul>${m.clash.con.points.map(p => `<li>${esc(p)}</li>`).join('')}</ul>
        </div>
      </div>
      <div class="axis"><span class="ln"></span><span class="core">${esc(m.clash.axis)}</span><span class="ln"></span></div>
    </div>
  </section>

  <section class="sec">
    <div class="sec-eye">Argument arena · prep both sides</div>
    <div class="arena">
      <div class="col-pro">
        <div class="side-head"><span class="side-tag">Pro</span></div>
        <div class="thesis">${esc(m.pro.thesis)}</div>
        ${m.pro.args.map(a => argCard('Pro', a)).join('')}
      </div>
      <div class="vs"><span>VS</span></div>
      <div class="col-con">
        <div class="side-head"><span class="side-tag">Con</span></div>
        <div class="thesis">${esc(m.con.thesis)}</div>
        ${m.con.args.map(a => argCard('Con', a)).join('')}
      </div>
    </div>
  </section>

  <section class="sec" id="sample">
    <div class="sec-eye">Sample round · flowed with judge notes</div>
    <div class="transcript">
      ${m.round.map(t => `<div class="turn ${t.side}">
        <div class="turn-head"><span class="turn-spk">${esc(t.speech)}</span>${t.badge ? `<span class="badge">${esc(t.badge)}</span>` : ''}</div>
        <div class="turn-body">${esc(t.text)}</div>
        ${t.note ? `<div class="jnote"><span class="jk">Judge</span><span class="jx">${esc(t.note)}</span></div>` : ''}
      </div>`).join('')}
    </div>
  </section>

  <section class="sec">
    <div class="sec-eye">Judge ballot</div>
    <div class="ballot">
      <div class="ballot-top">
        <span class="winner ${m.ballot.side}">${esc(m.ballot.winner)} wins</span>
        <span class="margin">${esc(m.ballot.margin)} margin</span>
      </div>
      <div class="ballot-grid">
        <div class="bcell full"><div class="bk">Reason for decision</div><p>${esc(m.ballot.rfd)}</p></div>
        <div class="bcell full"><div class="bk">Key clash</div><p>${esc(m.ballot.keyClash)}</p></div>
        <div class="bcell"><div class="bk">Pro · feedback</div><p class="fb">${esc(m.ballot.proFeedback)}</p></div>
        <div class="bcell"><div class="bk">Con · feedback</div><p class="fb">${esc(m.ballot.conFeedback)}</p></div>
        <div class="drill"><div class="bk">One drill before the rematch</div><p class="fb">${esc(m.ballot.drill)}</p></div>
      </div>
      <div class="rematch">
        <a class="btn btn-pro" href="${esc(proHref)}">Run the rematch as Pro <span class="arr">→</span></a>
        <a class="btn btn-con" href="${esc(conHref)}">Run the rematch as Con <span class="arr">→</span></a>
      </div>
    </div>
  </section>

  <section class="sec">
    <div class="grid2">
      <div>
        <div class="sec-eye" style="margin-top:0">Related motions</div>
        <ul class="rel-list">
          ${related.map(r => `<li><a href="/debate/${esc(r.slug)}"><span class="rt">${esc(r.title)}</span><span class="rarr">→</span></a></li>`).join('')}
        </ul>
      </div>
      <div>
        <div class="sec-eye" style="margin-top:0">Drills</div>
        <ul class="drills">
          ${(m.drills || []).map(d => `<a class="drill-item" href="${esc(trainerHref({ title: d.motion }))}"><span class="dl">${esc(d.label)}</span><span class="dx">→</span></a>`).join('')}
        </ul>
      </div>
    </div>
  </section>

  <footer class="dfoot">
    <span>© 2026 Debate AI</span>
    <span><a href="/debate">All motions</a> · <a href="/topics">Format guides</a> · <a href="/learn">Learn</a> · <a href="/debate-ai">Practice</a></span>
  </footer>
</main>

<div class="sticky" id="stickyCta">
  <div class="sticky-in">
    <div class="sq">${esc(m.title)}<b>3-minute round · AI opponent · judge ballot after</b></div>
    <div class="sbtns">
      <a class="s-pro" href="${esc(proHref)}">Take Pro</a>
      <a class="s-con" href="${esc(conHref)}">Take Con</a>
    </div>
  </div>
</div>

<script>
(function(){
  var bar=document.getElementById('stickyCta');
  if(!bar)return;
  var shown=false;
  function onScroll(){
    var y=window.pageYOffset||document.documentElement.scrollTop;
    var max=(document.documentElement.scrollHeight-window.innerHeight);
    var nearEnd=y>620 && y<max-340;
    if(nearEnd!==shown){shown=nearEnd;bar.classList.toggle('show',shown);}
  }
  window.addEventListener('scroll',onScroll,{passive:true});
  onScroll();
})();
</script>
</body></html>`;
}

function renderHubPage() {
  const motions = listMotions();
  const title = 'Debate Both Sides of the Big Questions · Debate AI';
  const description = "Argument dossiers on the questions people actually search: AI regulation, AI and jobs, AI in school, AI art, TikTok, social media for minors, UBI, nuclear. Both sides, a sample round, a judge ballot. Then argue it yourself.";
  const canonical = `${SITE_ORIGIN}/debate`;

  const ld = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'CollectionPage',
        name: "Debate Both Sides of the Big Questions",
        description, url: canonical, inLanguage: 'en',
        isPartOf: { '@type': 'WebSite', name: 'Debate AI', url: `${SITE_ORIGIN}/` },
        hasPart: motions.map(m => ({ '@type': 'Article', name: m.title, url: `${SITE_ORIGIN}/debate/${m.slug}`, description: m.description })),
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Debate AI', item: `${SITE_ORIGIN}/` },
          { '@type': 'ListItem', position: 2, name: 'Debate', item: canonical },
        ],
      },
    ],
  };

  const aiSlugs = ['should-ai-be-regulated', 'will-ai-replace-human-jobs', 'should-students-be-allowed-to-use-ai', 'should-ai-generated-art-be-copyrighted', 'should-the-us-ban-tiktok', 'should-social-media-be-banned-for-minors'];
  const ai = aiSlugs.map(s => MOTION_BANK[s]).filter(Boolean);
  const econ = motions.filter(m => !aiSlugs.includes(m.slug));

  const card = m => `<a class="hub-card" href="/debate/${esc(m.slug)}">
    <div class="hc-eye">${esc(m.category)}</div>
    <div class="hc-t">${esc(m.title)}</div>
    <div class="hc-clash">${esc(m.mainClash)}. ${esc(m.clash.question)}</div>
    <div class="hc-meta"><span class="hc-chip">${esc(m.difficulty)}</span><span class="hc-chip">${esc(m.formats)}</span></div>
  </a>`;

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
<meta name="theme-color" content="#080C14">
<link rel="icon" href="/icons/icon-192.png">
<script defer src="/js/track.js"></script>
<script type="application/ld+json">${jsonLd(ld)}</script>
<style>${commonStyles()}</style>
</head>
<body>
<a id="top"></a>
<main class="shell">
  ${topNav()}
  <span class="stamp"><span class="dot"></span> Debate Dossiers</span>
  <h1 class="hub-h1" style="margin-top:20px">Pick a fight.</h1>
  <p class="hub-intro">${esc(description)}</p>

  <div class="hub-group-eye">AI &amp; technology</div>
  <div class="hub-grid">${ai.map(card).join('')}</div>

  <div class="hub-group-eye">Economy &amp; society</div>
  <div class="hub-grid">${econ.map(card).join('')}</div>

  <footer class="dfoot">
    <span>© 2026 Debate AI</span>
    <span><a href="/topics">Format guides</a> · <a href="/learn">Learn</a> · <a href="/debate-ai">Practice</a> · <a href="/">Home</a></span>
  </footer>
</main>
</body></html>`;
}

export default async (request) => {
  const parsed = extractFromUrl(request.url);
  if (!parsed) return notFoundResponse();

  let html;
  if (parsed.mode === 'hub') {
    html = renderHubPage();
  } else {
    const m = getMotion(parsed.slug);
    if (!m) return notFoundResponse();
    html = renderMotionPage(m);
  }

  return new Response(html, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'public, max-age=86400, s-maxage=86400',
    },
  });
};

export const config = {
  path: ['/api/debate', '/api/debate/*'],
};
