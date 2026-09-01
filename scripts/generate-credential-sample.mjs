// The sample credential shown on /credentials, regenerated from source
// rather than kept as a hand-made PNG.
//
// Why this script exists at all. The old app/assets/credential-sample-cover.png
// was a flat image and it went stale in FOUR separate ways at once, on the one
// public surface whose whole job is to look like proof:
//   - eyebrow read "DEBATEIT", a brand retired 2026-07-18
//   - issuer read "DebateIt / debateai.com", a brand and a domain that 301s
//   - verify URL read "debateai.com/verify/...", same retired domain
//   - the statement quoted the 25-30 speaker-points scale, retired 2026-08-18
//     when speaker points moved to 1-100 (see the soul.md entry)
//   - format read "APDA", and competitive format names are off every public
//     surface as of 2026-08-27 (casual 1v1 only)
// A flat PNG cannot be caught by a grep, a price guard, or a brand sweep, so
// it survived every one of those changes. Keeping the sample as CODE means the
// next sweep can find these strings, and `git diff` shows a copy change.
//
// This mirrors what verify.html actually renders (scale-aware score, the same
// statement shape) so the marketing sample and the real credential cannot
// drift apart again. If the real card changes, change SAMPLE here too.
//
// Usage: node scripts/generate-credential-sample.mjs
//        writes app/assets/credential-sample-cover.png (1275x1650, US Letter @150dpi)
import { writeFileSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const TMP = '/tmp/cert-build';
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = `${ROOT}/app/assets/credential-sample-cover.png`;

// Deliberately a 1-100 score with no 25-30 calibration clause: on the live
// scale the old parenthetical just restated the same number. The motion is
// plain-language rather than "This House would ..." because the public product
// is casual 1v1 and does not put parliamentary phrasing in front of strangers.
const SAMPLE = {
  eyebrow: 'DEBATABLE &middot; COMMUNICATION CREDENTIAL',
  tier: 'Elite Communicator',
  name: 'A. Demo',
  statement: 'Demonstrated elite-level live communication in English by debating an AI opponent under time pressure, taking interruptions, and responding under judge evaluation. Communication Score 91 / 100, top 5% worldwide.',
  motion: 'Social media platforms should verify user identity.',
  format: 'Casual 1v1',
  side: 'Pro',
  date: 'May 24, 2026',
  score: '91 / 100',
  verify: 'itsdebatable.com/verify/dx7k9a2m',
};

const html = (c) => `<!doctype html><html><head><meta charset="utf-8">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Source+Serif+4:opsz,wght@8..60,400;8..60,600;8..60,700&family=Archivo:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<style>
*{margin:0;padding:0;box-sizing:border-box}
:root{--ink:#1a1a1a;--soft:#4a4a4a;--ghost:#8a8a8a;--red:#a51c1c;--gold:#9a7b2f;--rule:#d8d8d8}
html,body{width:1275px;height:1650px;overflow:hidden;background:#fff;
  font-family:'Archivo','Inter',-apple-system,system-ui,sans-serif;color:var(--ink);
  -webkit-font-smoothing:antialiased}
.page{width:1275px;height:1650px;padding:52px;background:#fff}
.frame{width:100%;height:100%;border:3px solid var(--red);padding:9px}
.inner{width:100%;height:100%;border:1px solid var(--gold);padding:74px 96px;
  display:flex;flex-direction:column}
.eyebrow{text-align:center;font-size:15px;font-weight:800;letter-spacing:.30em;
  color:var(--gold);margin-top:34px}
.tier{text-align:center;font-family:'Source Serif 4',Georgia,'Times New Roman',serif;
  font-weight:600;font-size:74px;line-height:1;color:var(--ink);
  letter-spacing:-.01em;margin-top:78px}
.awarded{text-align:center;font-size:14px;font-weight:700;letter-spacing:.22em;
  color:var(--ghost);margin-top:74px}
.name{text-align:center;font-family:'Source Serif 4',Georgia,serif;font-weight:600;
  font-size:56px;line-height:1.1;color:var(--ink);margin-top:16px}
.statement{margin:64px auto 0;max-width:840px;text-align:center;font-size:19px;
  line-height:1.72;color:var(--soft)}
.motion{margin:56px auto 0;max-width:800px;text-align:center;
  font-family:'Source Serif 4',Georgia,serif;font-size:23px;line-height:1.5;color:var(--ink)}
/* Two spacers, not one. With a single bottom spacer the whole text block
   pins to the top and leaves ~450px of dead white above the meta row; the
   0.5/1 ratio sits the block optically centred with the larger gap below,
   which is where a certificate expects its breathing room. */
.spacer{flex:1}
.spacer-top{flex:.5}
.meta{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;
  border-top:1px solid var(--rule);border-bottom:1px solid var(--rule);
  padding:30px 0;margin-bottom:74px}
.meta div{text-align:center}
.mlabel{font-size:12px;font-weight:700;letter-spacing:.16em;color:var(--ghost);
  text-transform:uppercase}
.mvalue{font-size:22px;font-weight:500;color:var(--ink);margin-top:10px}
.foot{display:flex;align-items:flex-end;justify-content:space-between}
.flabel{font-size:12px;font-weight:700;letter-spacing:.16em;color:var(--ghost);
  text-transform:uppercase}
/* Two-tone wordmark: "Debat" in ink, "able" in brand red. */
.mark{font-family:'Source Serif 4',Georgia,serif;font-weight:700;font-size:38px;
  line-height:1;margin-top:12px;letter-spacing:-.01em}
.mark i{font-style:normal;color:var(--red)}
.domain{font-size:15px;color:var(--ghost);margin-top:8px}
.vurl{font-size:18px;color:var(--ink);margin-top:12px}
</style></head><body>
<div class="page"><div class="frame"><div class="inner">
  <div class="spacer-top"></div>
  <div class="eyebrow">${c.eyebrow}</div>
  <div class="tier">${c.tier}</div>
  <div class="awarded">AWARDED TO</div>
  <div class="name">${c.name}</div>
  <div class="statement">${c.statement}</div>
  <div class="motion">&ldquo;${c.motion}&rdquo;</div>
  <div class="spacer"></div>
  <div class="meta">
    <div><div class="mlabel">Format</div><div class="mvalue">${c.format}</div></div>
    <div><div class="mlabel">Side</div><div class="mvalue">${c.side}</div></div>
    <div><div class="mlabel">Date</div><div class="mvalue">${c.date}</div></div>
    <div><div class="mlabel">Comm. Score</div><div class="mvalue">${c.score}</div></div>
  </div>
  <div class="foot">
    <div>
      <div class="flabel">Issued by</div>
      <div class="mark">Debat<i>able</i></div>
      <div class="domain">itsdebatable.com</div>
    </div>
    <div style="text-align:right">
      <div class="flabel">Verify at</div>
      <div class="vurl">${c.verify}</div>
    </div>
  </div>
</div></div></div>
</body></html>`;

mkdirSync(TMP, { recursive: true });
const f = `${TMP}/credential-sample.html`;
writeFileSync(f, html(SAMPLE));
execFileSync(CHROME, ['--headless=new', '--disable-gpu', '--hide-scrollbars',
  '--force-device-scale-factor=1', '--window-size=1275,1650',
  '--virtual-time-budget=8000', `--screenshot=${OUT}`, `file://${f}`], { stdio: 'ignore' });
console.log(`wrote ${OUT}`);
