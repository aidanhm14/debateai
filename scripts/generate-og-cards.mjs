// Generate Direction-A split share cards for every section. HTML + headless Chrome.
import { writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const APP = '/Users/aidanhm/app';
const TMP = '/tmp/og-build';

// shot: file path · pos: object positioning of the screenshot in the right panel
// light: true if the screenshot is light-themed (needs a stronger left scrim)
//
// NOTE: 'home', 'live' and 'voice' are NOT here — they're the AI-debate
// scene cards (the voice-debate "Cassidy" stage: glowing debater + orb)
// made by scripts/generate-og-cards-scene.mjs. Kept out of this list so a
// re-run can't clobber them with a flat screenshot.
const CARDS = [
  { key: 'leaderboard', shot: `${APP}/landing-shot-leaderboard.jpg`, light: true,
    pos: { w: 900, top: 50, left: 54 },
    eyebrow: 'The leaderboard', tag: 'Climb the board across every format.',
    feat: 'Ranked rounds · speaker points · win streaks' },
  { key: 'schools', shot: `${TMP}/shot-schools.png`, light: false,
    pos: { w: 1040, top: 60, left: 60 },
    eyebrow: 'For schools & educators', tag: 'Varsity-grade prep for every program.',
    feat: 'Bring it to your school · run a round today' },
  { key: 'pricing', shot: `${TMP}/shot-pricing.png`, light: true,
    pos: { w: 1060, top: 76, left: 58 },
    eyebrow: 'Pricing', tag: 'Every tier is free right now.',
    feat: 'In beta · future plans from $5 / year' },
  { key: 'app', shot: `${TMP}/shot-app.png`, light: false,
    pos: { w: 1060, top: 50, left: 60 },
    eyebrow: 'Case prep workspace', tag: 'Paste a case. Get line-by-line feedback.',
    feat: 'Case gen · philosophy · drills · 6 brains' },
];

const html = (c) => `<!doctype html><html><head><meta charset="utf-8">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Crimson+Pro:wght@400;500;600;700;800;900&family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<style>
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:1200px;height:630px;overflow:hidden;font-family:'Inter',-apple-system,system-ui,sans-serif}
.card{width:1200px;height:630px;position:relative;background:radial-gradient(120% 105% at 16% 42%,#2a1014 0%,#150a0d 46%,#0a0709 100%);overflow:hidden}
.right{position:absolute;top:0;right:0;width:760px;height:630px;overflow:hidden}
.shot{position:absolute;top:${c.pos.top}%;left:${c.pos.left}%;transform:translate(-50%,-50%);width:${c.pos.w}px;height:auto;filter:saturate(1.04) contrast(1.02)}
.fade{position:absolute;inset:0;background:
  linear-gradient(90deg,#0a0709 0%,#0a0709 ${c.light ? 21 : 20}%,rgba(10,7,9,${c.light ? .72 : .74}) ${c.light ? 41 : 40}%,rgba(10,7,9,0) ${c.light ? 66 : 65}%),
  linear-gradient(0deg,rgba(10,7,9,.5),transparent 26%)}
.rim{position:absolute;inset:0;box-shadow:inset 0 0 130px 26px rgba(239,68,68,.09)}
.glow{position:absolute;top:-130px;left:-90px;width:560px;height:520px;background:radial-gradient(circle,rgba(239,68,68,.22),transparent 64%);filter:blur(6px)}
.left{position:absolute;z-index:5;top:0;left:0;width:600px;height:630px;padding:0 48px 0 60px;display:flex;flex-direction:column;justify-content:center}
.pill{display:inline-flex;align-items:center;gap:9px;align-self:flex-start;border:1px solid rgba(239,68,68,.42);background:rgba(239,68,68,.10);color:#fca5a5;font-size:14px;font-weight:600;letter-spacing:2.4px;text-transform:uppercase;padding:8px 15px;border-radius:999px;margin-bottom:26px}
.dot{width:8px;height:8px;border-radius:50%;background:#ef4444;box-shadow:0 0 12px #ef4444}
.brand{font-family:'Crimson Pro',Georgia,serif;font-size:96px;font-weight:900;color:#fff;letter-spacing:-2px;line-height:.9;display:flex;align-items:flex-start}
.brand .p{color:#ef4444}
.brand sup{font-size:.22em;font-weight:500;opacity:.5;margin-top:.9em;margin-left:4px;letter-spacing:0}
.tag{margin-top:20px;font-family:'Crimson Pro',Georgia,serif;font-size:34px;font-weight:600;color:#ece7ea;line-height:1.18;letter-spacing:-.2px;max-width:480px}
.feat{margin-top:28px;font-family:'Inter',sans-serif;font-size:17px;font-weight:600;color:#9a929c;letter-spacing:.2px}
</style></head><body><div class="card">
  <div class="right"><img class="shot" src="file://${c.shot}"><div class="rim"></div><div class="fade"></div></div>
  <div class="glow"></div>
  <div class="left">
    <span class="pill"><span class="dot"></span>${c.eyebrow}</span>
    <div class="brand">Debate<span class="p">It</span><sup>&trade;</sup></div>
    <div class="tag">${c.tag}</div>
    <div class="feat">${c.feat}</div>
  </div>
</div></body></html>`;

for (const c of CARDS) {
  const f = `${TMP}/card-${c.key}.html`;
  writeFileSync(f, html(c));
  execFileSync(CHROME, ['--headless=new', '--disable-gpu', '--hide-scrollbars',
    '--force-device-scale-factor=1', '--window-size=1200,630', '--virtual-time-budget=4000',
    `--screenshot=${TMP}/og-${c.key}.png`, `file://${f}`], { stdio: 'ignore' });
  console.log('rendered og-' + c.key + '.png');
}
