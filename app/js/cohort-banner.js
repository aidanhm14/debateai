/* ──────────────────────────────────────────────────────────────────
 * Founding-cohort banner.
 *
 * Slim recruitment strip pinned to the very top of any page that
 * includes this script. Self-injects CSS + DOM, idempotent (won't
 * double-stamp if loaded twice). Skip on /early itself so we don't
 * advertise the page from inside the page. Dismissible via
 * sessionStorage so it disappears for the rest of the visit but
 * comes back next session.
 *
 * Usage: <script src="/js/cohort-banner.js" defer></script>
 * Stamp it sitewide; the script bails out internally on /early.
 * ────────────────────────────────────────────────────────────── */

(function(){
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  if (window.__daCohortBannerStamped) return;
  window.__daCohortBannerStamped = true;

  // Don't render on the cohort page itself.
  if (/^\/early(?:[/?#]|$)/.test(window.location.pathname)) return;

  // Don't render if user dismissed earlier in the same session.
  try {
    if (sessionStorage.getItem('da-cohort-banner-dismissed') === '1') return;
  } catch (e) {}

  var CSS = '\
.cohort-banner{display:flex;align-items:center;gap:12px;padding:9px clamp(14px,3vw,24px);background-color:#c81e1e;background-image:linear-gradient(90deg,#b91c1c 0%,#ef4444 100%);color:#fff;font-family:Geist,Inter,-apple-system,system-ui,sans-serif;font-size:.86rem;font-weight:500;line-height:1.4;border-bottom:1px solid rgba(0,0,0,.18);position:fixed;top:0;left:0;right:0;z-index:10001}\
.cohort-banner-spacer{height:var(--cohort-banner-h,0px);flex:none}\
.cohort-banner-dot{width:7px;height:7px;border-radius:50%;background:#fff;flex-shrink:0;box-shadow:0 0 8px rgba(255,255,255,.6);animation:cbPulse 2s ease-in-out infinite}\
@keyframes cbPulse{0%,100%{opacity:.65}50%{opacity:1}}\
.cohort-banner-msg{flex:1;min-width:0}\
.cohort-banner-msg b{font-weight:700}\
.cohort-banner-cta{color:#fff!important;text-decoration:none;font-weight:700;letter-spacing:.01em;border-bottom:1px solid rgba(255,255,255,.5);padding-bottom:1px;white-space:nowrap}\
.cohort-banner-cta:hover{border-bottom-color:#fff}\
.cohort-banner-close{background:transparent;border:0;color:rgba(255,255,255,.75);cursor:pointer;font-size:1rem;line-height:1;padding:4px 6px;border-radius:3px}\
.cohort-banner-close:hover{color:#fff;background:rgba(255,255,255,.12)}\
.cohort-banner.is-dismissed{display:none}\
@media (max-width:560px){.cohort-banner{font-size:.78rem;padding:8px 12px;gap:8px}.cohort-banner-msg .cb-long{display:none}}\
';

  function injectCSS(){
    if (document.getElementById('da-cohort-banner-css')) return;
    var s = document.createElement('style');
    s.id = 'da-cohort-banner-css';
    s.textContent = CSS;
    document.head.appendChild(s);
  }

  function buildBanner(){
    var aside = document.createElement('aside');
    aside.className = 'cohort-banner';
    aside.id = 'cohortBanner';
    aside.setAttribute('role', 'region');
    aside.setAttribute('aria-label', 'Founding cohort signup');
    aside.innerHTML =
      '<span class="cohort-banner-dot" aria-hidden="true"></span>' +
      '<span class="cohort-banner-msg"><b>Help us run the first DebateIt online debates.</b><span class="cb-long"> One quick sign-up. First invites go to early signups.</span></span>' +
      '<a class="cohort-banner-cta" href="/early">Join the cohort →</a>' +
      '<button type="button" class="cohort-banner-close" aria-label="Dismiss founding cohort banner">×</button>';

    aside.querySelector('.cohort-banner-cta').addEventListener('click', function(){
      try { if (window.gtag) gtag('event', 'cohort_banner_click', { surface: window.location.pathname }); } catch (e) {}
    });
    aside.querySelector('.cohort-banner-close').addEventListener('click', function(){
      aside.classList.add('is-dismissed');
      try { sessionStorage.setItem('da-cohort-banner-dismissed', '1'); } catch (e) {}
      try { if (window.gtag) gtag('event', 'cohort_banner_dismiss', { surface: window.location.pathname }); } catch (e) {}
      // Pages that read --cohort-banner-h (topbar offset, hero padding)
      // need to retighten when the user dismisses. 0px collapses it.
      document.documentElement.style.setProperty('--cohort-banner-h', '0px');
    });

    // Stamp the banner (position:fixed) at the very top of <body>, plus an
    // in-flow spacer of the same height. Why fixed + spacer instead of sticky:
    // <html>/<body> carry overflow-x:hidden (computes to overflow-y:auto),
    // which makes <body> a scroll container and BREAKS position:sticky — the
    // banner scrolled away with the page while the topbar stayed offset, the
    // exact "scrolls away weirdly" bug. position:fixed pins to the viewport
    // regardless of ancestor overflow. The spacer (height = --cohort-banner-h)
    // reoccupies the flow space the in-flow banner used to hold, so every
    // page's content offset is byte-for-byte unchanged; only the banner now
    // actually stays pinned. Spacer collapses to 0 on dismiss with the var.
    var spacer = document.createElement('div');
    spacer.className = 'cohort-banner-spacer';
    spacer.setAttribute('aria-hidden', 'true');
    if (document.body.firstChild) {
      document.body.insertBefore(aside, document.body.firstChild);
      document.body.insertBefore(spacer, aside.nextSibling);
    } else {
      document.body.appendChild(aside);
      document.body.appendChild(spacer);
    }

    // Publish the banner height as --cohort-banner-h on :root. The fixed
    // topbar reads it (translateY) to sit just below the banner, and the
    // in-flow spacer reads it for its height.
    //
    // The banner is position:fixed (pinned to the viewport), so it never
    // scrolls away and the offset is simply its height — a STATIC value.
    // (A position:sticky attempt scrolled away because <body>'s overflow
    // makes it a scroll container and breaks sticky; an even earlier
    // version chased the topbar on every scroll frame via rAF and jittered.
    // Fixed + spacer is the only approach that both pins reliably AND keeps
    // content offset unchanged.) Only resize / line-wrap changes the
    // height, so we recompute there.
    // No scroll listener and no rAF: resize + ResizeObserver fire rarely,
    // so we publish synchronously and the topbar offset can never lag the
    // real banner height. (Writing --cohort-banner-h only moves the
    // topbar, not the banner, so the ResizeObserver can't loop.)
    function bannerHeight(){
      return aside.classList.contains('is-dismissed') ? 0 : aside.offsetHeight;
    }
    function publishOffset(){
      document.documentElement.style.setProperty('--cohort-banner-h', bannerHeight() + 'px');
    }
    publishOffset();
    window.addEventListener('resize', publishOffset);
    try { new ResizeObserver(publishOffset).observe(aside); } catch (e) {}

    try { if (window.gtag) gtag('event', 'cohort_banner_view', { surface: window.location.pathname }); } catch (e) {}
  }

  function init(){
    injectCSS();
    buildBanner();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
