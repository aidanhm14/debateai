// Renders the title card, the end card and every caption as transparent PNGs
// through the browser, so the type is real Helvetica Neue (the wordmark face)
// rather than whatever ffmpeg's drawtext can reach. One PNG per card per
// framing; assemble.mjs overlays them.
import { chromium } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(HERE, 'out', 'cards');
fs.mkdirSync(OUT, { recursive: true });

const RED = '#ef4444';
const FRAMES = { desktop: { w: 1920, h: 1080 }, phone: { w: 1080, h: 1920 } };

function css(frame) {
  const p = frame === 'phone';
  return `
  *{box-sizing:border-box;margin:0;padding:0}
  html,body{width:100%;height:100%;background:transparent;font-family:"Helvetica Neue",Helvetica,Arial,sans-serif;-webkit-font-smoothing:antialiased}
  .stage{position:relative;width:100%;height:100%;overflow:hidden}
  /* full cards */
  .full{position:absolute;inset:0;background:#0b0b0c;color:#fff;display:flex;flex-direction:column;align-items:flex-start;justify-content:center;padding:${p ? '0 96px' : '0 160px'}}
  .full.light{background:#f7f6f2;color:#111}
  .mark{font-weight:700;letter-spacing:-.045em;color:${RED};font-size:${p ? '128px' : '136px'};line-height:.95}
  .mark small{display:block;font-size:${p ? '30px' : '26px'};letter-spacing:.14em;text-transform:uppercase;color:#7d7d84;font-weight:600;margin-top:22px}
  .h{font-weight:700;letter-spacing:-.035em;font-size:${p ? '84px' : '96px'};line-height:1.02;max-width:${p ? '900px' : '1400px'};margin-top:38px}
  .h em{font-style:normal;color:${RED}}
  .sub{font-size:${p ? '38px' : '40px'};line-height:1.3;color:#b6b6bd;margin-top:28px;max-width:${p ? '880px' : '1100px'};font-weight:500}
  .full.light .sub{color:#5a5a62}
  .url{font-weight:700;font-size:${p ? '54px' : '64px'};letter-spacing:-.02em;margin-top:34px}
  .url b{color:${RED};font-weight:700}
  /* caption bar */
  .cap{position:absolute;left:${p ? '48px' : '72px'};bottom:${p ? '220px' : '84px'};display:inline-flex;align-items:center;gap:${p ? '18px' : '18px'};background:rgba(10,10,12,.86);color:#fff;border-radius:${p ? '22px' : '18px'};padding:${p ? '26px 34px' : '22px 30px'};font-size:${p ? '46px' : '40px'};font-weight:600;line-height:1.15;letter-spacing:-.015em;max-width:${p ? '984px' : '1180px'};box-shadow:0 12px 40px rgba(0,0,0,.35)}
  .cap .n{display:inline-flex;align-items:center;justify-content:center;flex:0 0 auto;width:${p ? '58px' : '50px'};height:${p ? '58px' : '50px'};border-radius:50%;background:${RED};color:#fff;font-weight:700;font-size:${p ? '30px' : '26px'}}
  .cap.top{bottom:auto;top:${p ? '150px' : '84px'}}
  .cap.center{left:50%;transform:translateX(-50%);white-space:nowrap}
  `;
}

function html(card, frame) {
  const f = FRAMES[frame];
  let body = '';
  if (card.kind === 'title') {
    body = `<div class="full${card.light ? ' light' : ''}"><div class="mark">Debatable<small>itsdebatable.com</small></div><div class="h">${card.text}</div>${card.sub ? `<div class="sub">${card.sub}</div>` : ''}</div>`;
  } else if (card.kind === 'end') {
    body = `<div class="full"><div class="mark">Debatable</div><div class="h">${card.text}</div>${card.sub ? `<div class="sub">${card.sub}</div>` : ''}<div class="url">its<b>debatable</b>.com</div></div>`;
  } else {
    body = `<div class="cap${card.pos ? ' ' + card.pos : ''}">${card.n ? `<span class="n">${card.n}</span>` : ''}<span>${card.text}</span></div>`;
  }
  return `<!doctype html><html><head><meta charset="utf-8"><style>${css(frame)}</style></head><body><div class="stage" style="width:${f.w}px;height:${f.h}px">${body}</div></body></html>`;
}

export async function renderCards(cards, frames = ['desktop', 'phone']) {
  const browser = await chromium.launch({ channel: 'chromium' });
  const made = [];
  for (const frame of frames) {
    const f = FRAMES[frame];
    const context = await browser.newContext({ viewport: { width: f.w, height: f.h }, deviceScaleFactor: 1 });
    const page = await context.newPage();
    for (const card of cards) {
      await page.setContent(html(card, frame));
      await page.evaluate(() => document.fonts.ready);
      const file = path.join(OUT, `${card.id}-${frame}.png`);
      await page.screenshot({ path: file, omitBackground: card.kind === 'caption' });
      made.push(file);
    }
    await context.close();
  }
  await browser.close();
  return made;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const spec = JSON.parse(fs.readFileSync(process.argv[2] || path.join(HERE, 'cards.json'), 'utf8'));
  const made = await renderCards(spec.cards, spec.frames);
  console.log(made.map((m) => path.basename(m)).join('\n'));
}
