// ──────────────────────────────────────────────────────────────────
// home-magnet.js — sitewide "find your way home" helper for Debatable.
//
// Drop <script src="/js/home-magnet.js" defer></script> on any page that
// is NOT the marketing home (/). It guarantees a top-of-page home link
// when the page has no shared topbar or authored home link of its own.
//
// The old first-visit popup is deliberately retired. Search pages are
// acquisition doors with their own direct product CTAs; sending someone
// through the main page adds a second sale between intent and a round.
// This module also tags CTA clicks on the three organic entry pages so
// their downstream funnels can be compared without changing the pages'
// distinct search intent.
//
// Self-contained, framework-free, idempotent.
// ──────────────────────────────────────────────────────────────────
(function () {
  'use strict';
  if (window.__ditHomeMagnet) return;
  window.__ditHomeMagnet = true;

  // Never run inside an iframe (extension side panel, embeds).
  try { if (window.top !== window.self) return; } catch (e) { return; }

  var HOME = '/';
  var path = (location.pathname || '/').replace(/\/+$/, '') || '/';
  var lower = path.toLowerCase();

  // The marketing home already has its own navigation and funnel tracker.
  if (path === '/' || /\/(landing|index)(\.html)?$/.test(lower)) {
    return;
  }

  function ready(fn) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', fn, { once: true });
    } else { fn(); }
  }

  // ── Guarantee a top-of-page home link ────────────────────────────
  function topHomeLinkExists() {
    // The shared topbar (#daTopbar, rendered by topbar.js) mounts a home
    // wordmark asynchronously — after this check would otherwise run. Treat
    // its presence as "a top home link exists" so we don't inject a
    // redundant bar above it.
    if (document.getElementById('daTopbar')) return true;
    var links = document.querySelectorAll(
      'a[href="/"],a[href="/landing"],a[href="/landing.html"],' +
      'a[href="https://itsdebatable.com/"],a[href="https://itsdebatable.com"]'
    );
    for (var i = 0; i < links.length; i++) {
      var a = links[i];
      if (a.closest('header,nav,[class*="topbar"],[class*="nav"],[id*="topbar"],[id*="nav"]')) return true;
      var r = a.getBoundingClientRect();
      if (r.top >= 0 && r.top < 220 && r.width > 0) return true;
    }
    return false;
  }

  function injectHomeBar() {
    if (document.getElementById('ditHomeBar')) return;
    // Two real, separate destinations. The old bar was one <a href="/"> whose
    // right edge read "Live debates →" — the label promised /live but the tap
    // went home. Now the home label goes home and the live label goes to /live.
    var bar = document.createElement('div');
    bar.id = 'ditHomeBar';
    bar.setAttribute('role', 'navigation');
    bar.setAttribute('aria-label', 'Debatable');
    bar.style.cssText = [
      'position:sticky', 'top:0', 'z-index:2147482000',
      'display:flex', 'align-items:center', 'gap:8px',
      'padding:8px 14px',
      'font:600 13px/1 DM Sans,Archivo,Georgia,serif',
      'color:#fff', 'background:#b91c1c',
      'box-shadow:0 1px 0 rgba(0,0,0,.10)'
    ].join(';');

    var home = document.createElement('a');
    home.href = HOME;
    home.setAttribute('aria-label', 'Go to the Debatable home page');
    home.style.cssText = 'display:inline-flex;align-items:center;gap:7px;color:#fff;text-decoration:none;padding:2px 2px;border-radius:7px';
    home.innerHTML =
      '<span aria-hidden="true" style="font-size:15px;line-height:1;transform:translateY(-1px)">←</span>' +
      '<strong style="font-weight:800;letter-spacing:-.01em">Debatable</strong>' +
      '<span style="opacity:.95;font-weight:600">home</span>';

    var live = document.createElement('a');
    live.href = '/live';
    live.setAttribute('aria-label', 'Browse live debates');
    live.style.cssText = 'margin-left:auto;display:inline-flex;align-items:center;gap:6px;color:#fff;text-decoration:none;font-weight:700;padding:5px 11px;border-radius:999px;background:rgba(0,0,0,.12)';
    live.innerHTML = 'Live debates <span aria-hidden="true">→</span>';

    function hover(el, on, off){
      el.addEventListener('mouseenter', function(){ el.style.background = on; });
      el.addEventListener('mouseleave', function(){ el.style.background = off; });
    }
    hover(home, 'rgba(255,255,255,.14)', 'transparent');
    hover(live, 'rgba(0,0,0,.22)', 'rgba(0,0,0,.12)');

    bar.appendChild(home);
    bar.appendChild(live);
    document.body.insertBefore(bar, document.body.firstChild);
  }

  function trackSeoEntryCtas() {
    var entry = lower.replace(/\.html$/, '');
    var entryPages = {
      '/debate-online': true,
      '/debate-strangers': true,
      '/online-debate-platforms': true
    };
    if (!entryPages[entry]) return;

    document.addEventListener('click', function (event) {
      var target = event.target;
      var cta = target && target.closest ? target.closest('[data-cta]') : null;
      if (!cta) return;
      var params = {
        entry_path: entry,
        target: String(cta.getAttribute('data-cta') || 'unknown').slice(0, 64),
        destination: String(cta.getAttribute('href') || '').slice(0, 160)
      };
      try {
        if (typeof window.gtag === 'function') {
          window.gtag('event', 'seo_entry_cta_click', params);
        } else if (typeof window.track === 'function') {
          window.track('app_event', Object.assign({ name: 'seo_entry_cta_click' }, params));
        }
      } catch (e) {}
    }, true);
  }

  // ── Run ──────────────────────────────────────────────────────────
  ready(function () {
    if (!topHomeLinkExists()) injectHomeBar();
    trackSeoEntryCtas();
  });
})();
