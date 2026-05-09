// ──────────────────────────────────────────────────────────────────
// Cross-page fade transitions for the multi-HTML-document app.
//
// Each page is its own .html file so we can't use SPA-style transitions.
// Instead this script:
//   1. Fades the body in on initial load (so the new page doesn't pop)
//   2. Intercepts clicks on internal <a> links, fades the body out,
//      THEN navigates — gives the impression of a smooth handoff
//      instead of an abrupt cut.
//
// Drop <script defer src="/js/page-transition.js"></script> on any page
// that should participate. Respects prefers-reduced-motion so the
// transition is a no-op for users who don't want motion.
//
// External links, anchor links, target=_blank, download, modifier-clicks,
// and cross-origin nav are all left untouched — they should not feel
// like an in-app transition.
// ──────────────────────────────────────────────────────────────────
(function () {
  'use strict';

  // Skip when the user has explicitly opted out of motion.
  var reduced = false;
  try { reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) {}
  if (reduced) return;

  var FADE_OUT_MS = 160;
  var FADE_IN_MS  = 220;

  // Inject the transition styles. Doing this with a <style> instead of
  // a stylesheet so the script is fully self-contained — one drop-in
  // file, nothing else to wire.
  var style = document.createElement('style');
  style.textContent =
    '.pt-out { opacity: 0 !important; transition: opacity ' + FADE_OUT_MS + 'ms ease-out !important; }\n' +
    '.pt-in  { opacity: 0; }\n' +
    '.pt-in.pt-in-done { opacity: 1; transition: opacity ' + FADE_IN_MS + 'ms ease-in; }\n' +
    /* Subtle top loading bar that runs across the screen during the
       fade-out window. Helps the user feel the click registered while
       the next page is being fetched. */
    '.pt-bar {\n' +
    '  position: fixed; top: 0; left: 0; right: 0; height: 2px;\n' +
    '  background: linear-gradient(90deg, transparent 0%, #ef4444 50%, transparent 100%);\n' +
    '  transform: translateX(-100%);\n' +
    '  transition: transform ' + (FADE_OUT_MS + 80) + 'ms ease-in;\n' +
    '  z-index: 99999; pointer-events: none;\n' +
    '}\n' +
    '.pt-bar.pt-bar-active { transform: translateX(100%); }\n';
  document.head.appendChild(style);

  // ── Fade-in on initial page load ────────────────────────────────
  function fadeIn() {
    // Some pages (debate-ai, voice-debate) wrap everything in a #root
    // mount, so set the class on body and let opacity cascade.
    document.body.classList.add('pt-in');
    // Two RAFs so the browser commits the opacity:0 starting state
    // before we trigger the transition to 1.
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        document.body.classList.add('pt-in-done');
      });
    });
    setTimeout(function () {
      document.body.classList.remove('pt-in', 'pt-in-done');
    }, FADE_IN_MS + 80);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', fadeIn);
  } else {
    // Document already parsed (e.g. defer fired late). Fade in now.
    fadeIn();
  }

  // ── Reset on bfcache restore ────────────────────────────────────
  // When the user hits Back, browsers may serve the prior page from
  // bfcache with the pt-out class still on body — making it invisible.
  // pageshow fires for both fresh loads and bfcache restores; the
  // persisted flag lets us tell them apart and clean up only when
  // restoring.
  window.addEventListener('pageshow', function (e) {
    if (e.persisted) {
      document.body.classList.remove('pt-out');
      var bar = document.querySelector('.pt-bar');
      if (bar) bar.parentNode && bar.parentNode.removeChild(bar);
    }
  });

  // ── Intercept clicks to internal links ──────────────────────────
  document.addEventListener('click', function (e) {
    if (e.defaultPrevented) return;
    if (e.button !== 0) return;                       // only primary click
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return; // new-tab modifiers

    var a = e.target && e.target.closest && e.target.closest('a');
    if (!a) return;

    var href = a.getAttribute('href');
    if (!href) return;

    // Anchor-only / non-navigation schemes — let the browser handle.
    if (href.charAt(0) === '#') return;
    if (/^(mailto:|tel:|sms:|javascript:|data:)/i.test(href)) return;

    if (a.target && a.target !== '' && a.target !== '_self') return;
    if (a.hasAttribute('download')) return;
    if (a.hasAttribute('data-no-transition')) return;

    // Cross-origin → skip. Resolving via a.href gives the absolute URL.
    var url;
    try { url = new URL(a.href, location.href); }
    catch (_) { return; }
    if (url.origin !== location.origin) return;

    // Same path + same query → likely an in-page anchor or a re-click;
    // let the browser handle without a transition.
    if (url.pathname === location.pathname && url.search === location.search) {
      return;
    }

    e.preventDefault();

    // Top progress bar runs while the next page loads.
    var bar = document.createElement('div');
    bar.className = 'pt-bar';
    document.body.appendChild(bar);
    requestAnimationFrame(function () { bar.classList.add('pt-bar-active'); });

    // Fade body out.
    document.body.classList.add('pt-out');

    // Navigate after the fade so the next page's fade-in feels
    // continuous rather than a hard cut. If the next page takes
    // longer than the fade to load, the bar bridges the gap.
    setTimeout(function () {
      location.href = a.href;
    }, FADE_OUT_MS);
  });
})();
