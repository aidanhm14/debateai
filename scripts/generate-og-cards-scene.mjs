// AI-debate share cards: the voice-debate "Cassidy" scene (two glowing
// debaters + orb, dark theme) for home/default, live, and voice.
import { writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const TMP = '/tmp/og-build';
const SCENE = `${TMP}/vd-dark.png`; // dark standing-by capture (2880x1800)

const CARDS = [
  { key: 'home', pos: { objpos: '78% 40%' },
    eyebrow: 'Debate an AI opponent', tag: 'Step up. The AI is standing by.',
    feat: 'Pick a motion · a side · go live on the mic' },
  { key: 'live', pos: { objpos: '78% 40%' },
    eyebrow: 'Live AI debate, judged', tag: 'An opponent that actually argues back.',
    feat: 'Timed speeches · a judge tracks the round · real RFD' },
  { key: 'voice', pos: { objpos: '78% 40%' },
    eyebrow: 'Voice round', tag: 'Speak. The AI fires back.',
    feat: 'Real-time · interruptible · APDA, BP, LD, PF, Policy' },
];

const html = (c) => `<!doctype html><html><head><meta charset="utf-8">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Crimson+Pro:wght@400;500;600;700;800;900&family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<style>
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:1200px;height:630px;overflow:hidden;font-family:'Inter',-apple-system,system-ui,sans-serif}
.card{width:1200px;height:630px;position:relative;background:#0a0608;overflow:hidden}
.right{position:absolute;top:0;right:0;width:820px;height:630px;overflow:hidden}
.shot{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;object-position:${c.pos.objpos}}
.fade{position:absolute;inset:0;background:
  linear-gradient(90deg,#0a0608 0%,#0a0608 17%,rgba(10,6,8,.74) 38%,rgba(10,6,8,0) 64%),
  linear-gradient(0deg,rgba(10,6,8,.4),transparent 22%)}
.glow{position:absolute;top:-120px;left:-80px;width:540px;height:500px;background:radial-gradient(circle,rgba(239,68,68,.20),transparent 64%);filter:blur(6px)}
.left{position:absolute;z-index:5;top:0;left:0;width:560px;height:630px;padding:0 40px 0 60px;display:flex;flex-direction:column;justify-content:center}
.pill{display:inline-flex;align-items:center;gap:9px;align-self:flex-start;border:1px solid rgba(239,68,68,.42);background:rgba(239,68,68,.12);color:#fca5a5;font-size:14px;font-weight:600;letter-spacing:2.2px;text-transform:uppercase;padding:8px 15px;border-radius:999px;margin-bottom:26px}
.dot{width:8px;height:8px;border-radius:50%;background:#ef4444;box-shadow:0 0 12px #ef4444}
.brand{font-family:'Crimson Pro',Georgia,serif;font-size:96px;font-weight:900;color:#fff;letter-spacing:-2px;line-height:.9;display:flex;align-items:flex-start}
.brand .p{color:#ef4444}
.brand sup{font-size:.22em;font-weight:500;opacity:.5;margin-top:.9em;margin-left:4px;letter-spacing:0}
.tag{margin-top:20px;font-family:'Crimson Pro',Georgia,serif;font-size:34px;font-weight:600;color:#ece7ea;line-height:1.18;letter-spacing:-.2px;max-width:470px}
.feat{margin-top:26px;font-family:'Inter',sans-serif;font-size:17px;font-weight:600;color:#b6abae;letter-spacing:.2px}
</style></head><body><div class="card">
  <div class="right"><img class="shot" src="file://${SCENE}"><div class="fade"></div></div>
  <div class="glow"></div>
  <div class="left">
    <span class="pill"><span class="dot"></span>${c.eyebrow}</span>
    <div class="brand">Debate<span class="p">It</span><sup>&trade;</sup></div>
    <div class="tag">${c.tag}</div>
    <div class="feat">${c.feat}</div>
  </div>
</div></body></html>`;

for (const c of CARDS) {
  const f = `${TMP}/sc-${c.key}.html`;
  writeFileSync(f, html(c));
  execFileSync(CHROME, ['--headless=new','--disable-gpu','--hide-scrollbars','--force-device-scale-factor=1',
    '--window-size=1200,630','--virtual-time-budget=4000',`--screenshot=${TMP}/sc-${c.key}.png`,`file://${f}`], { stdio: 'ignore' });
  console.log('rendered sc-' + c.key + '.png');
}
