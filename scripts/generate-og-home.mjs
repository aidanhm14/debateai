// Self-contained 1200x630 share card for the home/live/voice slot.
//
// Type-first: the Debatable wordmark over the two-beat promise (meet a
// stranger, then find out where you rank), with a leaderboard rail pinned
// to the bottom edge. The rail is what the previous pure-wordmark card was
// missing: "compete on a leaderboard" is half the pitch and the card said
// nothing about it. Kept type-led rather than product-screenshot-led
// because the card renders at ~500px wide in a timeline, where a webcam
// mock turns to mush and a wordmark does not.
//
// Rail names and ratings are illustrative, same license the room mock takes
// with "14 watching". They are first-name-plus-initial so the card never
// reads as a claim about a specific real person.
//
// NO PHOTOGRAPHS ON THIS RAIL, and it is the same rule as the first-screen
// rounds board (AGENTS.md, 2026-08-12): a face next to an invented name and
// a fabricated rating asserts a round that never happened about someone
// whose photo we do not have a release for. Initial discs, same treatment
// the board uses for a camera-off seat. Do not "improve" this with avatars.
// Keeping it face-free also makes the card self-contained, so a missing
// asset can never render a broken-image icon into a published share card.
//
// Usage: node scripts/generate-og-home.mjs   (writes app/og-home.png)
// Rerunning this script is now safe: it regenerates the card that is
// actually live, so it no longer clobbers the deployed image with a
// different design.
import { writeFileSync, mkdirSync, copyFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const TMP = '/tmp/og-build';
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const APP = `${ROOT}/app`;

// Ranks 1-3 plus a "You" row sitting just outside the podium, so the card
// implies the climb rather than showing an already-won board.
const RAIL = [
  { rk: 1, ini: 'P', nm: 'Priya R.', pts: '1842' },
  { rk: 2, ini: 'M', nm: 'Marcus O.', pts: '1790' },
  { rk: 3, ini: 'H', nm: 'Hana T.', pts: '1755' },
  { rk: 4, ini: 'Y', nm: 'You', pts: '1703', me: 1 },
];

const html = `<!doctype html><html><head><meta charset="utf-8">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Crimson+Pro:wght@400;500;600;700;800;900&family=Inter:wght@400;500;600;700;800;900&display=swap" rel="stylesheet">
<style>
*{margin:0;padding:0;box-sizing:border-box}
:root{--ink:#1d1915;--red:#c83232;--chip:#2a241d;--line:rgba(29,25,21,.12);--mute:#8a7f78}
html,body{width:1200px;height:630px;overflow:hidden;font-family:'Inter',-apple-system,system-ui,sans-serif;-webkit-font-smoothing:antialiased}
.card{width:1200px;height:630px;position:relative;overflow:hidden;
  background:radial-gradient(125% 125% at 15% 26%,#fcf8f2 0%,#f5efe5 56%,#eee4d6 100%)}
.glow{position:absolute;top:-150px;left:-120px;width:560px;height:520px;background:radial-gradient(circle,rgba(200,30,30,.09),transparent 62%)}
.hair{position:absolute;left:0;right:0;top:0;height:6px;background:linear-gradient(90deg,#c81e1e,#e8453f 45%,rgba(200,30,30,0))}

/* Wordmark block is centered in the area above the rail, not the full
   card, so the rail does not visually drag the type off-center. */
.wrap{position:absolute;top:6px;left:0;right:0;bottom:86px;display:flex;flex-direction:column;align-items:center;justify-content:center}
.brand{font-family:'Crimson Pro',Georgia,serif;font-size:134px;font-weight:900;color:var(--red);letter-spacing:-4px;line-height:.9;display:flex;align-items:flex-start}
.brand sup{font-size:.17em;font-weight:500;opacity:.42;margin-top:1.1em;margin-left:5px;letter-spacing:0;color:var(--ink)}
.tag{margin-top:28px;font-family:'Crimson Pro',Georgia,serif;font-size:41px;font-weight:600;color:#322829;line-height:1.1;letter-spacing:-.3px;text-align:center}
.sub{margin-top:14px;font-family:'Crimson Pro',Georgia,serif;font-size:26px;font-weight:500;color:#6b6058;text-align:center}

/* ── LEADERBOARD RAIL ───────────────────────── */
.rail{position:absolute;left:0;right:0;bottom:0;height:86px;display:flex;align-items:center;justify-content:center;gap:30px;background:rgba(255,253,248,.82);border-top:1px solid var(--line)}
.rlab{display:inline-flex;align-items:center;gap:7px;font-size:11px;font-weight:800;letter-spacing:.11em;text-transform:uppercase;color:var(--red);margin-right:2px}
.rlab i{width:7px;height:7px;border-radius:50%;background:var(--red);box-shadow:0 0 9px rgba(200,30,30,.6)}
.ri{display:flex;align-items:center;gap:10px;font-size:16px;font-weight:700;color:var(--chip);font-variant-numeric:tabular-nums}
.ri em{font-style:normal;font-weight:800;color:#b3a89e;font-size:14px}
.ri.me,.ri.me em{color:var(--red)}
.ri s{text-decoration:none;font-weight:600;color:var(--mute);font-size:14px}
.disc{width:34px;height:34px;border-radius:50%;display:flex;align-items:center;justify-content:center;
  background:rgba(29,25,21,.06);border:1px solid var(--line);color:#8a7f78;font-size:14px;font-weight:800;letter-spacing:0}
.ri.me .disc{background:rgba(200,50,50,.09);border-color:rgba(200,50,50,.3);color:var(--red)}
</style></head><body><div class="card">
  <div class="glow"></div><div class="hair"></div>
  <div class="wrap">
    <div class="brand">Debatable<sup>&trade;</sup></div>
    <div class="tag">Meet a stranger. Debate them.</div>
    <div class="sub">Then find out where you rank.</div>
  </div>
  <div class="rail">
    <span class="rlab"><i></i>Leaderboard</span>
    ${RAIL.map(r => `<span class="ri${r.me ? ' me' : ''}"><em>${r.rk}</em><span class="disc">${r.ini}</span> ${r.nm} <s>${r.pts}</s></span>`).join('\n    ')}
  </div>
</div></body></html>`;

mkdirSync(TMP, { recursive: true });
const f = `${TMP}/og-home.html`;
writeFileSync(f, html);
execFileSync(CHROME, ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=1',
  '--window-size=1200,630', '--virtual-time-budget=7000',
  `--screenshot=${TMP}/og-home.png`, `file://${f}`], { stdio: 'ignore' });
copyFileSync(`${TMP}/og-home.png`, `${APP}/og-home.png`);
console.log('wrote app/og-home.png');
