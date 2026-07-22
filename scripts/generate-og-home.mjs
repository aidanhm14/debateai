// Self-contained 1200x630 share card for the home/live/voice slot
// (and the og-image.png long-tail default).
// Two stacked product surfaces next to the Debatable wordmark: the live
// debate room (two webcam seats + motion bar + clock) and a Floor
// prediction-market card (Kalshi/Polymarket-style probability chart +
// Yes/No prices) so the share image carries both halves of the product:
// people debating, and a live market on who wins.
import { writeFileSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const TMP = '/tmp/og-build';
const APP = '/Users/aidanhm/app';
// face02 / face07: the landing hero's two seats, picked so the
// backgrounds differ (not same-shoot clones). See landing.html.
const YOU = `file://${APP}/img/round/faces/face02.jpg`;
const OPP = `file://${APP}/img/round/faces/face07.jpg`;

const html = `<!doctype html><html><head><meta charset="utf-8">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Crimson+Pro:wght@400;500;600;700;800;900&family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<style>
*{margin:0;padding:0;box-sizing:border-box}
:root{--ink:#1d1915;--ink-soft:#4a423a;--red:#c83232;--chip:#2a241d;
  --card:#fffdf8;--line:rgba(29,25,21,.12);--seat:rgba(29,25,21,.045);
  --yes:#15803d;--no:#b91c1c}
html,body{width:1200px;height:630px;overflow:hidden;font-family:'Inter',-apple-system,system-ui,sans-serif}
.card{width:1200px;height:630px;position:relative;overflow:hidden;
  background:radial-gradient(125% 125% at 15% 26%,#fcf8f2 0%,#f5efe5 56%,#eee4d6 100%)}
.glow{position:absolute;top:-150px;left:-120px;width:560px;height:520px;background:radial-gradient(circle,rgba(200,30,30,.09),transparent 62%)}
.hair{position:absolute;left:0;right:0;top:0;height:6px;background:linear-gradient(90deg,#c81e1e,#e8453f 45%,rgba(200,30,30,0))}

/* ── CONTENT (left) ─────────────────────────── */
.left{position:absolute;z-index:5;top:0;left:0;width:452px;height:630px;padding:0 28px 0 64px;display:flex;flex-direction:column;justify-content:center}
.pill{display:inline-flex;align-items:center;gap:10px;align-self:flex-start;border:1px solid rgba(200,30,30,.34);background:rgba(200,30,30,.07);color:#b81e1e;font-size:13.5px;font-weight:600;letter-spacing:2.3px;text-transform:uppercase;padding:9px 15px;border-radius:999px;margin-bottom:26px}
.pdot{width:9px;height:9px;border-radius:50%;background:#c81e1e;box-shadow:0 0 11px rgba(200,30,30,.65)}
.brand{font-family:'Crimson Pro',Georgia,serif;font-size:78px;font-weight:900;color:var(--red);letter-spacing:-1.9px;line-height:.9;display:flex;align-items:flex-start}
.brand sup{font-size:.2em;font-weight:500;opacity:.42;margin-top:.95em;margin-left:5px;letter-spacing:0;color:var(--ink)}
.tag{margin-top:22px;font-family:'Crimson Pro',Georgia,serif;font-size:32px;font-weight:600;color:#322829;line-height:1.16;letter-spacing:-.3px;max-width:360px}
.feat{margin-top:22px;font-family:'Inter',sans-serif;font-size:16px;font-weight:600;color:#8a7f78;letter-spacing:.2px}

/* ── LIVE DEBATE ROOM (top right) ───────────── */
.room{position:absolute;z-index:4;top:56px;left:484px;width:652px;height:272px;
  display:flex;flex-direction:column;background:var(--card);border:1px solid var(--line);border-radius:18px;overflow:hidden;
  box-shadow:0 3px 8px rgba(29,25,21,.06),0 22px 48px -16px rgba(29,25,21,.24)}
.rtop{display:flex;align-items:center;gap:12px;padding:12px 18px;border-bottom:1px solid var(--line)}
.live{display:inline-flex;align-items:center;gap:6px;background:var(--red);color:#fff;font-size:11px;font-weight:800;letter-spacing:.1em;padding:5px 11px;border-radius:999px}
.live i{width:6px;height:6px;border-radius:50%;background:#fff}
.rname{font-weight:700;font-size:14.5px;color:var(--chip)}
.rwatch{margin-left:auto;color:var(--ink-soft);font-weight:500;font-size:13px}
.rwatch b{font-weight:700;color:var(--chip)}
.rtimer{font-weight:800;font-size:15px;color:var(--chip);background:var(--seat);border:1px solid var(--line);padding:4px 10px;border-radius:9px;font-variant-numeric:tabular-nums}
.motion{padding:10px 18px 0;font-size:16px;line-height:1.35;color:var(--ink-soft);font-family:'Crimson Pro',Georgia,serif;font-weight:600}
.motion b{font-family:'Inter',sans-serif;font-weight:700;font-size:11px;letter-spacing:.09em;text-transform:uppercase;color:var(--red);margin-right:9px}
.seats{flex:1;display:grid;grid-template-columns:1fr 1fr;gap:12px;padding:11px 18px 14px;min-height:0}
.seat{position:relative;overflow:hidden;background:var(--seat);border:1px solid var(--line);border-radius:12px}
.seat.you{box-shadow:inset 0 0 0 2.5px var(--red)}
.seat img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;filter:saturate(.97)}
.stag{position:absolute;top:8px;left:8px;z-index:2;padding:3px 8px;border-radius:7px;font-size:10px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;color:#fff;background:rgba(0,0,0,.55)}
.stag.pro{background:rgba(200,50,50,.9)}
.sbar{position:absolute;left:0;right:0;bottom:0;z-index:2;display:flex;align-items:center;justify-content:space-between;gap:8px;padding:20px 11px 9px;background:linear-gradient(transparent,rgba(0,0,0,.78))}
.swho{font-size:15px;font-weight:800;color:#fff;letter-spacing:-.01em}
.sstate{display:inline-flex;align-items:center;gap:6px;font-size:11.5px;font-weight:700;color:rgba(255,255,255,.94)}
.wave{display:inline-flex;align-items:flex-end;gap:2.5px;height:11px}
.wave i{width:3px;border-radius:2px;background:#fff}

/* ── THE FLOOR MARKET (bottom right) ────────── */
.mkt{position:absolute;z-index:4;top:344px;left:484px;width:652px;height:230px;
  display:flex;flex-direction:column;background:var(--card);border:1px solid var(--line);border-radius:18px;overflow:hidden;
  box-shadow:0 3px 8px rgba(29,25,21,.06),0 22px 48px -16px rgba(29,25,21,.24)}
.mtop{display:flex;align-items:center;gap:10px;padding:11px 18px 9px}
.mlab{display:inline-flex;align-items:center;gap:7px;font-size:11px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:var(--red)}
.mlab i{width:7px;height:7px;border-radius:50%;background:var(--red);box-shadow:0 0 9px rgba(200,30,30,.6)}
.mvol{margin-left:auto;font-size:12.5px;font-weight:600;color:#8a7f78}
.mrow{display:flex;align-items:center;gap:14px;padding:0 18px 2px}
.mq{flex:1;font-size:18.5px;font-weight:700;color:var(--chip);letter-spacing:-.2px}
.modds{display:flex;align-items:baseline;gap:7px}
.modds b{font-size:34px;font-weight:800;color:var(--yes);letter-spacing:-1px;font-variant-numeric:tabular-nums}
.modds span{font-size:12px;font-weight:700;color:var(--yes)}
.mup{font-size:12.5px;font-weight:700;color:var(--yes);background:rgba(21,128,61,.08);border:1px solid rgba(21,128,61,.22);padding:2px 8px;border-radius:7px}
.chart{position:relative;margin:4px 44px 0 18px;height:88px}
.chart svg{position:absolute;inset:0;width:100%;height:100%}
.ylab{position:absolute;right:-26px;font-size:10px;font-weight:600;color:#b3a89e}
.mbot{display:flex;align-items:center;gap:10px;padding:10px 18px 13px}
.buy{flex:1;display:flex;align-items:center;justify-content:center;gap:8px;font-size:14px;font-weight:800;padding:9px 0;border-radius:10px}
.buy small{font-weight:700;font-size:13px;opacity:.75}
.buy.yes{color:var(--yes);background:rgba(21,128,61,.09);border:1px solid rgba(21,128,61,.28)}
.buy.no{color:var(--no);background:rgba(185,28,28,.07);border:1px solid rgba(185,28,28,.26)}
.mnote{font-size:11.5px;font-weight:600;color:#a89d92;white-space:nowrap}
</style></head><body><div class="card">
  <div class="glow"></div><div class="hair"></div>
  <div class="left">
    <span class="pill"><span class="pdot"></span>Live debates, AI-judged</span>
    <div class="brand">Debatable<sup>&trade;</sup></div>
    <div class="tag">Debate real people. Live odds on every round.</div>
    <div class="feat">Find an opponent &middot; real RFD &middot; The Floor</div>
  </div>

  <div class="room">
    <div class="rtop">
      <span class="live"><i></i>LIVE</span>
      <span class="rname">Debate room</span>
      <span class="rwatch"><b>14</b> watching</span>
      <span class="rtimer">7:42</span>
    </div>
    <div class="motion"><b>Motion</b>This House would regulate AI tutors.</div>
    <div class="seats">
      <div class="seat you">
        <img src="${YOU}" alt="">
        <span class="stag pro">Proposition</span>
        <div class="sbar"><b class="swho">You</b><span class="sstate"><span class="wave"><i style="height:5px"></i><i style="height:8px"></i><i style="height:11px"></i><i style="height:6px"></i><i style="height:9px"></i></span>Speaking</span></div>
      </div>
      <div class="seat">
        <img src="${OPP}" alt="">
        <span class="stag">Opposition</span>
        <div class="sbar"><b class="swho">Opponent</b><span class="sstate">Up next</span></div>
      </div>
    </div>
  </div>

  <div class="mkt">
    <div class="mtop">
      <span class="mlab"><i></i>The Floor &middot; live market</span>
      <span class="mvol">2,400 credits in play</span>
    </div>
    <div class="mrow">
      <span class="mq">Proposition wins the round</span>
      <span class="mup">&#9650; 12 pts today</span>
      <span class="modds"><b>64%</b><span>chance</span></span>
    </div>
    <div class="chart">
      <svg viewBox="0 0 616 88" preserveAspectRatio="none">
        <defs>
          <linearGradient id="fade" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stop-color="#15803d" stop-opacity=".16"/>
            <stop offset="1" stop-color="#15803d" stop-opacity="0"/>
          </linearGradient>
        </defs>
        <line x1="0" y1="22" x2="616" y2="22" stroke="rgba(29,25,21,.07)" stroke-width="1"/>
        <line x1="0" y1="44" x2="616" y2="44" stroke="rgba(29,25,21,.07)" stroke-width="1"/>
        <line x1="0" y1="66" x2="616" y2="66" stroke="rgba(29,25,21,.07)" stroke-width="1"/>
        <path d="M0,62 L38,58 L76,60 L114,55 L152,56 L190,51 L228,53 L266,48 L304,50 L342,44 L380,47 L418,41 L456,43 L494,37 L532,40 L570,36 L600,32 L600,88 L0,88 Z" fill="url(#fade)"/>
        <path d="M0,62 L38,58 L76,60 L114,55 L152,56 L190,51 L228,53 L266,48 L304,50 L342,44 L380,47 L418,41 L456,43 L494,37 L532,40 L570,36 L600,32" fill="none" stroke="#15803d" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>
        <circle cx="600" cy="32" r="4.5" fill="#15803d" stroke="#fffdf8" stroke-width="2"/>
      </svg>
      <span class="ylab" style="top:14px">75</span>
      <span class="ylab" style="top:36px">50</span>
      <span class="ylab" style="top:58px">25</span>
    </div>
    <div class="mbot">
      <span class="buy yes">Yes <small>64&cent;</small></span>
      <span class="buy no">No <small>36&cent;</small></span>
      <span class="mnote">Play credits &middot; free to play</span>
    </div>
  </div>
</div></body></html>`;

mkdirSync(TMP, { recursive: true });
const f = `${TMP}/og-home-room.html`;
writeFileSync(f, html);
execFileSync(CHROME, ['--headless=new','--disable-gpu','--hide-scrollbars','--force-device-scale-factor=1',
  '--window-size=1200,630','--virtual-time-budget=6000',
  `--screenshot=${TMP}/og-home-room.png`, `file://${f}`], { stdio: 'ignore' });
console.log('rendered /tmp/og-build/og-home-room.png');
