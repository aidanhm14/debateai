/* ──────────────────────────────────────────────────────────────────
 * Background / floating-round promo.
 *
 * Small dismissible corner card that advertises the "debate while you
 * use other apps" feature (Document Picture-in-Picture float + the
 * launcher extension). Self-injects CSS + DOM, idempotent. One-time per
 * device (localStorage), so it never nags. Skips /float itself so we
 * don't advertise the page from inside the page. Slides in after a short
 * delay so it doesn't fight first paint.
 *
 * Usage: <script src="/js/float-promo.js" defer></script>
 * Leads with the in-app feature (works for everyone, no install); the
 * /float sub-tab covers the optional launcher extension.
 * ────────────────────────────────────────────────────────────── */

(function(){
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  if (window.__daFloatPromoStamped) return;
  window.__daFloatPromoStamped = true;

  // Don't render on the feature's own page.
  if (/^\/float(?:[/?#]|$)/.test(window.location.pathname)) return;

  // One-time per device — respect a prior dismissal.
  try { if (localStorage.getItem('da-float-promo-dismissed') === '1') return; } catch (e) {}

  var CSS = '\
.fp-card{position:fixed;right:18px;bottom:18px;z-index:10050;width:300px;max-width:calc(100vw - 28px);\
  background:#15101d;color:#ececf2;border:1px solid rgba(239,68,68,.34);border-radius:14px;\
  box-shadow:0 18px 50px rgba(0,0,0,.5);padding:14px 14px 13px;\
  font-family:"Crimson Pro",Inter,-apple-system,system-ui,sans-serif;\
  transform:translateY(16px);opacity:0;transition:transform .26s cubic-bezier(.2,.8,.2,1),opacity .26s}\
.fp-card.is-in{transform:none;opacity:1}\
.fp-card.is-out{transform:translateY(16px);opacity:0;pointer-events:none}\
.fp-eyebrow{display:inline-flex;align-items:center;gap:6px;font-size:.6rem;font-weight:800;letter-spacing:.14em;text-transform:uppercase;color:#ff8a8a}\
.fp-eyebrow i{width:6px;height:6px;border-radius:50%;background:#ef4444;box-shadow:0 0 8px #ef4444}\
.fp-h{font-weight:800;font-size:1.02rem;line-height:1.25;margin:7px 0 4px}\
.fp-b{font-size:.85rem;line-height:1.45;color:#b8bcc4;margin:0 0 11px}\
.fp-row{display:flex;align-items:center;gap:10px}\
.fp-cta{flex:1;text-align:center;text-decoration:none;font-size:.84rem;font-weight:700;color:#fff;\
  background:linear-gradient(135deg,#ef4444 0%,#dc2626 100%);padding:9px 12px;border-radius:9px}\
.fp-cta:hover{filter:brightness(1.06)}\
.fp-x{background:transparent;border:0;color:#8a8a96;cursor:pointer;font-size:1.05rem;line-height:1;padding:6px 8px;border-radius:7px}\
.fp-x:hover{color:#ececf2;background:rgba(255,255,255,.07)}\
@media (prefers-reduced-motion:reduce){.fp-card{transition:opacity .2s}.fp-card,.fp-card.is-out{transform:none}}\
@media (max-width:560px){.fp-card{right:10px;left:10px;bottom:10px;width:auto}}\
';

  function injectCSS(){
    if (document.getElementById('da-float-promo-css')) return;
    var s = document.createElement('style');
    s.id = 'da-float-promo-css';
    s.textContent = CSS;
    document.head.appendChild(s);
  }

  function dismiss(card){
    card.classList.add('is-out');
    try { localStorage.setItem('da-float-promo-dismissed', '1'); } catch (e) {}
    try { if (window.gtag) gtag('event', 'float_promo_dismiss', { surface: window.location.pathname }); } catch (e) {}
    setTimeout(function(){ try { card.remove(); } catch (e) {} }, 320);
  }

  function build(){
    var card = document.createElement('aside');
    card.className = 'fp-card';
    card.setAttribute('role', 'region');
    card.setAttribute('aria-label', 'Debate in the background');
    card.innerHTML =
      '<span class="fp-eyebrow"><i aria-hidden="true"></i>New</span>' +
      '<div class="fp-h">Debate while you work</div>' +
      '<p class="fp-b">Float a live round over your other apps and keep arguing while you do something else. No install.</p>' +
      '<div class="fp-row">' +
        '<a class="fp-cta" href="/float">See how it works</a>' +
        '<button type="button" class="fp-x" aria-label="Dismiss">×</button>' +
      '</div>';

    card.querySelector('.fp-cta').addEventListener('click', function(){
      try { localStorage.setItem('da-float-promo-dismissed', '1'); } catch (e) {}
      try { if (window.gtag) gtag('event', 'float_promo_click', { surface: window.location.pathname }); } catch (e) {}
    });
    card.querySelector('.fp-x').addEventListener('click', function(){ dismiss(card); });

    document.body.appendChild(card);
    // Slide in after a beat so it reads as a deliberate nudge, not a flash.
    setTimeout(function(){ card.classList.add('is-in'); }, 60);
    try { if (window.gtag) gtag('event', 'float_promo_view', { surface: window.location.pathname }); } catch (e) {}
  }

  function init(){
    injectCSS();
    // Hold the card back a few seconds so it doesn't land during first paint.
    setTimeout(build, 4500);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
