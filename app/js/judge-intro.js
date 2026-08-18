/* ─────────────────────────────────────────────────────────────
 * JUDGE INTRO — the "meet your judge" moment at the start of a round.
 *
 * A full-screen card that introduces the assigned judge: who they
 * are, how they hear a round, what wins in front of them and what it
 * costs. Presentation only. Nothing here picks the judge, and the
 * card renders whatever it is handed; assignment logic lives with
 * the caller (js/judge-roster.js draw or a lens key).
 *
 * Usage:
 *   JudgeIntro.show(judge, {
 *     eyebrow: 'Your judge this round',   // optional
 *     foot: 'Tap to continue',            // optional
 *     autoMs: 9000,                       // auto-dismiss; 0 = never
 *     onDone: fn,                         // fired once on dismiss
 *   })
 * `judge` is a roster entry: { name, glyph, color, tag, note[],
 * inPractice[{k,v}] }. Missing fields degrade gracefully.
 *
 * COPY RULE: strings render to users. No em dashes.
 * ───────────────────────────────────────────────────────────── */
(function () {
  'use strict';

  var CSS =
    '.ji-veil{position:fixed;inset:0;z-index:420;display:flex;align-items:center;justify-content:center;' +
    'padding:18px;background:rgba(8,7,6,.7);backdrop-filter:blur(4px);-webkit-backdrop-filter:blur(4px);' +
    'animation:jiFade .25s ease both}' +
    '[data-theme="light"] .ji-veil{background:rgba(24,21,18,.5)}' +
    '.ji-card{position:relative;width:min(94vw,430px);max-height:86vh;overflow:auto;border-radius:20px;' +
    'padding:26px 24px 20px;text-align:left;background:#111013;color:#f4f2ef;' +
    'border:1px solid color-mix(in srgb, var(--ji) 50%, transparent);' +
    'box-shadow:0 30px 80px rgba(0,0,0,.6),0 0 0 1px color-mix(in srgb, var(--ji) 16%, transparent);' +
    'animation:jiPop .5s cubic-bezier(.2,.9,.3,1.15) both}' +
    '[data-theme="light"] .ji-card{background:#fff;color:#181512}' +
    '.ji-eyebrow{font-size:.62rem;letter-spacing:.2em;text-transform:uppercase;font-weight:800;' +
    'color:color-mix(in srgb, var(--ji) 80%, #fff 20%);margin-bottom:14px;display:flex;align-items:center;gap:8px}' +
    '[data-theme="light"] .ji-eyebrow{color:color-mix(in srgb, var(--ji) 85%, #000 15%)}' +
    '.ji-eyebrow::after{content:"";flex:1;height:1px;background:color-mix(in srgb, var(--ji) 35%, transparent)}' +
    '.ji-id{display:flex;align-items:center;gap:14px;margin-bottom:12px}' +
    '.ji-face{width:58px;height:58px;flex:none;border-radius:50%;display:grid;place-items:center;' +
    'font-size:1.7rem;color:#fff;background:radial-gradient(circle at 32% 28%, color-mix(in srgb, var(--ji) 70%, #fff 30%), var(--ji) 62%, color-mix(in srgb, var(--ji) 55%, #000 45%));' +
    'box-shadow:0 8px 22px color-mix(in srgb, var(--ji) 45%, transparent);animation:jiRise .5s .1s cubic-bezier(.2,.9,.3,1.2) both}' +
    '.ji-name{font-size:1.45rem;font-weight:800;letter-spacing:-.02em;line-height:1.1;color:var(--ji);' +
    'animation:jiRise .5s .16s cubic-bezier(.2,.9,.3,1.2) both}' +
    '.ji-tag{font-size:.9rem;line-height:1.45;opacity:.92;margin:0 0 14px;animation:jiRise .5s .22s ease both}' +
    '.ji-note{font-size:.83rem;line-height:1.55;opacity:.78;margin:0 0 14px;animation:jiRise .5s .28s ease both}' +
    '.ji-rows{display:grid;gap:8px;margin-bottom:16px}' +
    '.ji-row{display:grid;grid-template-columns:86px 1fr;gap:10px;padding:9px 11px;border-radius:11px;' +
    'background:color-mix(in srgb, var(--ji) 9%, transparent);border:1px solid color-mix(in srgb, var(--ji) 18%, transparent);' +
    'animation:jiRise .45s ease both}' +
    '.ji-row:nth-child(1){animation-delay:.34s}.ji-row:nth-child(2){animation-delay:.42s}.ji-row:nth-child(3){animation-delay:.5s}' +
    '.ji-row b{font-size:.62rem;letter-spacing:.12em;text-transform:uppercase;font-weight:800;' +
    'color:color-mix(in srgb, var(--ji) 80%, #fff 20%);padding-top:2px}' +
    '[data-theme="light"] .ji-row b{color:color-mix(in srgb, var(--ji) 85%, #000 15%)}' +
    '.ji-row span{font-size:.8rem;line-height:1.45;opacity:.92}' +
    '.ji-go{display:block;width:100%;padding:12px;border:0;border-radius:12px;cursor:pointer;' +
    'font:inherit;font-size:.9rem;font-weight:800;color:#fff;background:var(--ji);' +
    'animation:jiRise .45s .58s ease both}' +
    '.ji-foot{font-size:.62rem;letter-spacing:.12em;text-transform:uppercase;font-weight:700;opacity:.5;' +
    'text-align:center;margin-top:10px;animation:jiFade .6s .7s ease both}' +
    '@keyframes jiFade{from{opacity:0}to{opacity:1}}' +
    '@keyframes jiPop{from{opacity:0;transform:scale(.92) translateY(16px)}to{opacity:1;transform:scale(1) translateY(0)}}' +
    '@keyframes jiRise{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}' +
    '.ji-veil.ji-out{animation:jiFadeOut .22s ease both}' +
    '@keyframes jiFadeOut{from{opacity:1}to{opacity:0}}' +
    '@media (prefers-reduced-motion:reduce){.ji-veil,.ji-card,.ji-face,.ji-name,.ji-tag,.ji-note,.ji-row,.ji-go,.ji-foot{animation-duration:.01ms;animation-delay:0ms}}';

  var styleDone = false;
  function ensureStyle() {
    if (styleDone) return;
    styleDone = true;
    var s = document.createElement('style');
    s.id = 'jiStyle';
    s.textContent = CSS;
    document.head.appendChild(s);
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  function show(judge, opts) {
    if (!judge) return null;
    opts = opts || {};
    ensureStyle();
    hide(true);

    var veil = document.createElement('div');
    veil.className = 'ji-veil';
    veil.id = 'jiVeil';
    veil.setAttribute('role', 'dialog');
    veil.setAttribute('aria-label', 'Your judge for this round');
    veil.style.setProperty('--ji', judge.color || '#b91f23');

    var rows = (judge.inPractice || []).map(function (r) {
      return '<div class="ji-row"><b>' + esc(r.k) + '</b><span>' + esc(r.v) + '</span></div>';
    }).join('');
    var note = (judge.note && judge.note.length) ? '<p class="ji-note">' + esc(judge.note[0]) + '</p>' : '';

    veil.innerHTML =
      '<div class="ji-card">' +
        '<div class="ji-eyebrow">' + esc(opts.eyebrow || 'Your judge this round') + '</div>' +
        '<div class="ji-id">' +
          '<div class="ji-face" aria-hidden="true">' + esc(judge.glyph || '◆') + '</div>' +
          '<div class="ji-name">' + esc(judge.name || 'The Judge') + '</div>' +
        '</div>' +
        '<p class="ji-tag">' + esc(judge.tag || '') + '</p>' +
        note +
        '<div class="ji-rows">' + rows + '</div>' +
        '<button class="ji-go" type="button">' + esc(opts.cta || 'Got it') + '</button>' +
        (opts.foot ? '<div class="ji-foot">' + esc(opts.foot) + '</div>' : '') +
      '</div>';

    var done = false;
    var timer = null;
    function dismiss() {
      if (done) return;
      done = true;
      if (timer) clearTimeout(timer);
      veil.classList.add('ji-out');
      setTimeout(function () { if (veil.parentNode) veil.parentNode.removeChild(veil); }, 240);
      if (typeof opts.onDone === 'function') { try { opts.onDone(); } catch (e) {} }
    }

    veil.querySelector('.ji-go').addEventListener('click', dismiss);
    veil.addEventListener('click', function (e) { if (e.target === veil) dismiss(); });
    var autoMs = opts.autoMs == null ? 9000 : opts.autoMs;
    if (autoMs > 0) timer = setTimeout(dismiss, autoMs);

    document.body.appendChild(veil);
    return { dismiss: dismiss };
  }

  function hide(instant) {
    var old = document.getElementById('jiVeil');
    if (old && old.parentNode) old.parentNode.removeChild(old);
  }

  window.JudgeIntro = { show: show, hide: hide };
})();
