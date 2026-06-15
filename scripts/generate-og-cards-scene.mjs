// White+red (light theme) share-card candidates for the home/live/voice slot.
import { writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const TMP = '/tmp/og-build';

const CARDS = [
  { key: 'lightscene', shot: `${TMP}/vd-default.png`, objpos: '78% 42%',
    eyebrow: 'Debate an AI opponent', tag: 'Step up. The AI is standing by.',
    feat: 'Pick a motion · a side · go live on the mic' },
  { key: 'lightwebcam', shot: `${TMP}/shot-room.png`, objpos: 'left center',
    eyebrow: 'Live debates, AI-judged', tag: 'Debate real people. The AI judges it.',
    feat: 'Find an opponent · timed speeches · real RFD' },
];

const html = (c) => `<!doctype html><html><head><meta charset="utf-8">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Crimson+Pro:wght@400;500;600;700;800;900&family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<style>
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:1200px;height:630px;overflow:hidden;font-family:'Inter',-apple-system,system-ui,sans-serif}
.card{width:1200px;height:630px;position:relative;background:radial-gradient(120% 110% at 16% 36%,#fbf7f1 0%,#f4ede3 60%,#efe6d9 100%);overflow:hidden}
.right{position:absolute;top:0;right:0;width:800px;height:630px;overflow:hidden}
.shot{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;object-position:${c.objpos}}
.fade{position:absolute;inset:0;background:
  linear-gradient(90deg,#f7f1e8 0%,#f7f1e8 19%,rgba(247,241,232,.78) 40%,rgba(247,241,232,0) 64%),
  linear-gradient(0deg,rgba(247,241,232,.4),transparent 22%)}
.edge{position:absolute;top:0;bottom:0;left:0;width:600px;box-shadow:inset 60px 0 0 0 transparent}
.glow{position:absolute;top:-120px;left:-90px;width:520px;height:480px;background:radial-gradient(circle,rgba(200,30,30,.10),transparent 64%)}
.left{position:absolute;z-index:5;top:0;left:0;width:560px;height:630px;padding:0 40px 0 60px;display:flex;flex-direction:column;justify-content:center}
.pill{display:inline-flex;align-items:center;gap:9px;align-self:flex-start;border:1px solid rgba(200,30,30,.34);background:rgba(200,30,30,.08);color:#b81e1e;font-size:14px;font-weight:600;letter-spacing:2.2px;text-transform:uppercase;padding:8px 15px;border-radius:999px;margin-bottom:26px}
.dot{width:8px;height:8px;border-radius:50%;background:#c81e1e;box-shadow:0 0 10px rgba(200,30,30,.6)}
.brand{font-family:'Crimson Pro',Georgia,serif;font-size:96px;font-weight:900;color:#241d1b;letter-spacing:-2px;line-height:.9;display:flex;align-items:flex-start}
.brand .p{color:#c81e1e}
.brand sup{font-size:.22em;font-weight:500;opacity:.45;margin-top:.9em;margin-left:4px;letter-spacing:0}
.tag{margin-top:20px;font-family:'Crimson Pro',Georgia,serif;font-size:34px;font-weight:600;color:#33292a;line-height:1.18;letter-spacing:-.2px;max-width:470px}
.feat{margin-top:26px;font-family:'Inter',sans-serif;font-size:17px;font-weight:600;color:#8a7f78;letter-spacing:.2px}
</style></head><body><div class="card">
  <div class="right"><img class="shot" src="file://${c.shot}"><div class="fade"></div></div>
  <div class="glow"></div>
  <div class="left">
    <span class="pill"><span class="dot"></span>${c.eyebrow}</span>
    <div class="brand">Debate<span class="p">It</span><sup>&trade;</sup></div>
    <div class="tag">${c.tag}</div>
    <div class="feat">${c.feat}</div>
  </div>
</div></body></html>`;

for (const c of CARDS) {
  const f = `${TMP}/lc-${c.key}.html`;
  writeFileSync(f, html(c));
  execFileSync(CHROME, ['--headless=new','--disable-gpu','--hide-scrollbars','--force-device-scale-factor=1',
    '--window-size=1200,630','--virtual-time-budget=4000',`--screenshot=${TMP}/lc-${c.key}.png`,`file://${f}`], { stdio: 'ignore' });
  console.log('rendered lc-' + c.key + '.png');
}
