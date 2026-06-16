// Self-contained 1200x630 share card for the home/live/voice slot
// (and the og-image.png long-tail default).
// Recreates the live debate room (two webcam seats + motion bar + live
// clock + AI-judge scores) next to the DebateIt wordmark. Real
// live-debate imagery — the brand's actual product surface — but laid
// out cleanly, instead of the old webcam composite that smeared a
// translucent paper wash across the photo and read muddy on Twitter/X.
import { writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const TMP = '/tmp/og-build';
const APP = '/Users/aidanhm/app';
const YOU = `file://${APP}/img/round/faces/face02.jpg`;
const OPP = `file://${APP}/img/round/faces/face07.jpg`;

const html = `<!doctype html><html><head><meta charset="utf-8">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Crimson+Pro:wght@400;500;600;700;800;900&family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<style>
*{margin:0;padding:0;box-sizing:border-box}
:root{--ink:#1d1915;--ink-soft:#4a423a;--red:#c83232;--chip:#2a241d;
  --card:#fffdf8;--line:rgba(29,25,21,.12);--seat:rgba(29,25,21,.045)}
html,body{width:1200px;height:630px;overflow:hidden;font-family:'Inter',-apple-system,system-ui,sans-serif}
.card{width:1200px;height:630px;position:relative;overflow:hidden;
  background:radial-gradient(125% 125% at 15% 26%,#fcf8f2 0%,#f5efe5 56%,#eee4d6 100%)}
.glow{position:absolute;top:-150px;left:-120px;width:560px;height:520px;background:radial-gradient(circle,rgba(200,30,30,.09),transparent 62%)}
.hair{position:absolute;left:0;right:0;top:0;height:6px;background:linear-gradient(90deg,#c81e1e,#e8453f 45%,rgba(200,30,30,0))}
.left{position:absolute;z-index:5;top:0;left:0;width:452px;height:630px;padding:0 28px 0 64px;display:flex;flex-direction:column;justify-content:center}
.pill{display:inline-flex;align-items:center;gap:10px;align-self:flex-start;border:1px solid rgba(200,30,30,.34);background:rgba(200,30,30,.07);color:#b81e1e;font-size:13.5px;font-weight:600;letter-spacing:2.3px;text-transform:uppercase;padding:9px 15px;border-radius:999px;margin-bottom:26px}
.pdot{width:9px;height:9px;border-radius:50%;background:#c81e1e;box-shadow:0 0 11px rgba(200,30,30,.65)}
.brand{font-family:'Crimson Pro',Georgia,serif;font-size:92px;font-weight:900;color:var(--ink);letter-spacing:-2.4px;line-height:.88;display:flex;align-items:flex-start}
.brand .p{color:var(--red)}
.brand sup{font-size:.2em;font-weight:500;opacity:.42;margin-top:1em;margin-left:5px;letter-spacing:0}
.tag{margin-top:22px;font-family:'Crimson Pro',Georgia,serif;font-size:33px;font-weight:600;color:#322829;line-height:1.16;letter-spacing:-.3px;max-width:360px}
.feat{margin-top:24px;font-family:'Inter',sans-serif;font-size:16.5px;font-weight:600;color:#8a7f78;letter-spacing:.2px}
.room{position:absolute;z-index:4;top:74px;left:484px;width:652px;height:482px;
  display:flex;flex-direction:column;background:var(--card);border:1px solid var(--line);border-radius:20px;overflow:hidden;
  box-shadow:0 3px 8px rgba(29,25,21,.06),0 26px 60px -16px rgba(29,25,21,.26)}
.rtop{display:flex;align-items:center;gap:12px;padding:14px 20px;border-bottom:1px solid var(--line)}
.live{display:inline-flex;align-items:center;gap:6px;background:var(--red);color:#fff;font-size:11px;font-weight:800;letter-spacing:.1em;padding:5px 11px;border-radius:999px}
.live i{width:6px;height:6px;border-radius:50%;background:#fff}
.rname{font-weight:700;font-size:15px;color:var(--chip)}
.rwatch{margin-left:auto;color:var(--ink-soft);font-weight:500;font-size:13.5px}
.rwatch b{font-weight:700;color:var(--chip)}
.rtimer{font-weight:800;font-size:16px;color:var(--chip);background:var(--seat);border:1px solid var(--line);padding:4px 11px;border-radius:9px;font-variant-numeric:tabular-nums}
.motion{padding:13px 20px 0;font-size:17px;line-height:1.4;color:var(--ink-soft);font-family:'Crimson Pro',Georgia,serif;font-weight:600}
.motion b{font-family:'Inter',sans-serif;font-weight:700;font-size:11px;letter-spacing:.09em;text-transform:uppercase;color:var(--red);margin-right:9px}
.speech{padding:6px 20px 0;font-size:13px;font-weight:500;color:var(--ink-soft);opacity:.85}
.speech b{font-weight:700;color:var(--chip)}
.seats{flex:1;display:grid;grid-template-columns:1fr 1fr;gap:13px;padding:13px 20px 16px;min-height:0}
.seat{position:relative;overflow:hidden;background:var(--seat);border:1px solid var(--line);border-radius:14px}
.seat.you{box-shadow:inset 0 0 0 2.5px var(--red)}
.seat img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;filter:saturate(.97)}
.stag{position:absolute;top:9px;left:9px;z-index:2;padding:3px 9px;border-radius:7px;font-size:10.5px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;color:#fff;background:rgba(0,0,0,.55)}
.stag.pro{background:rgba(200,50,50,.9)}
.sbar{position:absolute;left:0;right:0;bottom:0;z-index:2;display:flex;align-items:center;justify-content:space-between;gap:8px;padding:22px 12px 10px;background:linear-gradient(transparent,rgba(0,0,0,.78))}
.swho{font-size:16px;font-weight:800;color:#fff;letter-spacing:-.01em}
.sstate{display:inline-flex;align-items:center;gap:6px;font-size:12px;font-weight:700;color:rgba(255,255,255,.94)}
.wave{display:inline-flex;align-items:flex-end;gap:2.5px;height:12px}
.wave i{width:3px;border-radius:2px;background:#fff}
.judge{display:flex;align-items:center;gap:12px;padding:11px 20px;border-top:1px solid var(--line);background:rgba(29,25,21,.02)}
.jlab{display:inline-flex;align-items:center;gap:7px;font-size:11px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:var(--red)}
.jlab i{width:7px;height:7px;border-radius:50%;background:var(--red);box-shadow:0 0 9px rgba(200,30,30,.6)}
.jmet{margin-left:auto;display:flex;gap:9px}
.jmet span{font-size:12.5px;font-weight:600;color:var(--ink-soft);background:var(--seat);border:1px solid var(--line);padding:3px 9px;border-radius:7px}
.jmet b{color:var(--chip);font-weight:800}
</style></head><body><div class="card">
  <div class="glow"></div><div class="hair"></div>
  <div class="left">
    <span class="pill"><span class="pdot"></span>Live debates, AI-judged</span>
    <div class="brand">Debate<span class="p">It</span><sup>&trade;</sup></div>
    <div class="tag">Debate real people. The AI judges it.</div>
    <div class="feat">Find an opponent &middot; timed speeches &middot; real RFD</div>
  </div>
  <div class="room">
    <div class="rtop">
      <span class="live"><i></i>LIVE</span>
      <span class="rname">Debate room</span>
      <span class="rwatch"><b>6</b> watching</span>
      <span class="rtimer">7:42</span>
    </div>
    <div class="motion"><b>Motion</b>This House would regulate AI tutors.</div>
    <div class="speech"><b>Speech 3 of 4</b> &middot; Rebuttal &middot; POIs open until 1:00</div>
    <div class="seats">
      <div class="seat you">
        <img src="${YOU}" alt="">
        <span class="stag pro">Proposition</span>
        <div class="sbar"><b class="swho">You</b><span class="sstate"><span class="wave"><i style="height:5px"></i><i style="height:8px"></i><i style="height:12px"></i><i style="height:7px"></i><i style="height:9px"></i></span>Speaking</span></div>
      </div>
      <div class="seat">
        <img src="${OPP}" alt="">
        <span class="stag">Opposition</span>
        <div class="sbar"><b class="swho">Opponent</b><span class="sstate">Up next</span></div>
      </div>
    </div>
    <div class="judge">
      <span class="jlab"><i></i>AI judge &middot; flowing</span>
      <span class="jmet"><span>Clash <b>7.8</b></span><span>Warrants <b>6.9</b></span><span>Weighing <b>8.2</b></span></span>
    </div>
  </div>
</div></body></html>`;

const f = `${TMP}/og-home-room.html`;
writeFileSync(f, html);
execFileSync(CHROME, ['--headless=new','--disable-gpu','--hide-scrollbars','--force-device-scale-factor=1',
  '--window-size=1200,630','--virtual-time-budget=6000',
  `--screenshot=${TMP}/og-home-room.png`, `file://${f}`], { stdio: 'ignore' });
console.log('rendered /tmp/og-build/og-home-room.png');
