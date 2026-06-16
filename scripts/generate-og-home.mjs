// Self-contained 1200x630 share card for the home/live/voice slot.
// No external screenshot dependency — pure CSS + headless Chrome, so it's
// reproducible. Replaces the washed-out webcam composite that read poorly
// on Twitter/X. Warm-paper brand bg + DebateIt wordmark + the live "orb".
import { writeFileSync, copyFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const TMP = '/tmp/og-build';
const APP = '/Users/aidanhm/app';

const html = `<!doctype html><html><head><meta charset="utf-8">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Crimson+Pro:wght@400;500;600;700;800;900&family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<style>
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:1200px;height:630px;overflow:hidden;font-family:'Inter',-apple-system,system-ui,sans-serif}
.card{width:1200px;height:630px;position:relative;overflow:hidden;
  background:radial-gradient(125% 125% at 16% 28%,#fcf8f2 0%,#f5efe5 55%,#eee4d6 100%)}
.vign{position:absolute;inset:0;background:radial-gradient(120% 120% at 82% 52%,rgba(150,25,25,.07),transparent 55%)}
.glow{position:absolute;top:-150px;left:-120px;width:600px;height:540px;background:radial-gradient(circle,rgba(200,30,30,.10),transparent 62%)}
.hair{position:absolute;left:0;right:0;top:0;height:6px;background:linear-gradient(90deg,#c81e1e,#e8453f 45%,rgba(200,30,30,0))}

/* ── ORB (right) ───────────────────────────── */
.orb-wrap{position:absolute;right:96px;top:50%;transform:translateY(-50%);width:480px;height:480px;display:flex;align-items:center;justify-content:center}
.ring{position:absolute;border-radius:50%;border:1.5px solid rgba(200,30,30,.16)}
.r1{width:480px;height:480px}
.r2{width:392px;height:392px;border-color:rgba(200,30,30,.22)}
.r3{width:308px;height:308px;border-color:rgba(200,30,30,.30)}
.orb{position:relative;width:248px;height:248px;border-radius:50%;
  background:
    radial-gradient(circle at 35% 30%, rgba(255,255,255,.9) 0%, rgba(255,205,198,.45) 13%, transparent 32%),
    radial-gradient(circle at 52% 54%, #ec4b44 0%, #c81e1e 46%, #911616 78%, #5f0d0d 100%);
  box-shadow:0 26px 64px rgba(140,20,20,.34), 0 0 100px rgba(200,30,30,.42),
    inset -20px -24px 56px rgba(55,5,5,.6), inset 16px 18px 44px rgba(255,175,165,.34)}
.orb::after{content:'';position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:360px;height:360px;border-radius:50%;background:radial-gradient(circle,rgba(200,30,30,.22),transparent 60%);z-index:-1}
.dot{position:absolute;width:14px;height:14px;border-radius:50%;background:#c81e1e;box-shadow:0 0 16px rgba(200,30,30,.7)}
.d1{top:24px;left:50%;margin-left:-7px}
.d2{bottom:60px;right:40px}
.d3{top:54%;left:30px;width:10px;height:10px;background:#e8453f}
/* voice equalizer beneath the orb */
.eq{position:absolute;left:50%;bottom:54px;transform:translateX(-50%);display:flex;align-items:flex-end;gap:8px;height:40px;opacity:.55}
.eq i{width:7px;border-radius:4px;background:linear-gradient(180deg,#e8453f,#911616)}

/* ── CONTENT (left) ────────────────────────── */
.left{position:absolute;z-index:5;top:0;left:0;width:600px;height:630px;padding:0 40px 0 72px;display:flex;flex-direction:column;justify-content:center}
.pill{display:inline-flex;align-items:center;gap:10px;align-self:flex-start;border:1px solid rgba(200,30,30,.34);background:rgba(200,30,30,.07);color:#b81e1e;font-size:14px;font-weight:600;letter-spacing:2.4px;text-transform:uppercase;padding:9px 16px;border-radius:999px;margin-bottom:30px}
.pdot{width:9px;height:9px;border-radius:50%;background:#c81e1e;box-shadow:0 0 11px rgba(200,30,30,.65)}
.brand{font-family:'Crimson Pro',Georgia,serif;font-size:104px;font-weight:900;color:#231c1a;letter-spacing:-2.5px;line-height:.88;display:flex;align-items:flex-start}
.brand .p{color:#c81e1e}
.brand sup{font-size:.2em;font-weight:500;opacity:.42;margin-top:1em;margin-left:5px;letter-spacing:0}
.tag{margin-top:24px;font-family:'Crimson Pro',Georgia,serif;font-size:36px;font-weight:600;color:#322829;line-height:1.16;letter-spacing:-.3px;max-width:460px}
.feat{margin-top:28px;font-family:'Inter',sans-serif;font-size:18px;font-weight:600;color:#8a7f78;letter-spacing:.2px}
</style></head><body><div class="card">
  <div class="vign"></div><div class="glow"></div><div class="hair"></div>
  <div class="orb-wrap">
    <div class="ring r1"></div><div class="ring r2"></div><div class="ring r3"></div>
    <div class="dot d1"></div><div class="dot d2"></div><div class="dot d3"></div>
    <div class="orb"></div>
    <div class="eq">
      <i style="height:14px"></i><i style="height:28px"></i><i style="height:40px"></i>
      <i style="height:22px"></i><i style="height:34px"></i><i style="height:16px"></i>
      <i style="height:30px"></i><i style="height:20px"></i>
    </div>
  </div>
  <div class="left">
    <span class="pill"><span class="pdot"></span>Live debates, AI-judged</span>
    <div class="brand">Debate<span class="p">It</span><sup>&trade;</sup></div>
    <div class="tag">Debate real people. The AI judges it.</div>
    <div class="feat">Find an opponent &middot; timed speeches &middot; real RFD</div>
  </div>
</div></body></html>`;

const f = `${TMP}/og-home-clean.html`;
writeFileSync(f, html);
execFileSync(CHROME, ['--headless=new','--disable-gpu','--hide-scrollbars','--force-device-scale-factor=1',
  '--window-size=1200,630','--virtual-time-budget=6000',
  `--screenshot=${TMP}/og-home-clean.png`, `file://${f}`], { stdio: 'ignore' });
console.log('rendered /tmp/og-build/og-home-clean.png');
