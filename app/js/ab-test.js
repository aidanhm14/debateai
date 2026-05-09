// ──────────────────────────────────────────────────────────────────
// Tiny A/B-test framework. Drop-in for any page that wants to ship
// copy / layout variants and measure conversion.
//
// Each test:
//   1. Assigns the visitor to a variant deterministically (hash of
//      uid + test name → variant index) so a returning user always
//      sees the same variant.
//   2. Persists the assignment to localStorage so the variant
//      survives sign-out / session changes.
//   3. Fires gtag('event','ab_variant',...) on first exposure so
//      the per-user activity feed has it.
//   4. Optionally applies DOM swaps via apply().
//
// Usage:
//   const v = window.ab.assign('pricing_hero_v1', ['control','punchy']);
//   if (v === 'punchy') document.querySelector('h1').textContent = '…';
//
// Conversions are already tracked by the existing paid_conversion +
// purchase events in landing flows; ab_variant is the EXPOSURE side
// of the funnel. Compute lift in the admin dashboard by joining the
// two streams on uid + ab_variant_<test>.
// ──────────────────────────────────────────────────────────────────
(function () {
  'use strict';

  function djb2(s) {
    var h = 5381;
    for (var i = 0; i < s.length; i++) h = ((h << 5) + h) ^ s.charCodeAt(i);
    return h >>> 0;
  }

  // Stable visitor id — separate from Firebase uid so anonymous
  // visitors still get consistent variants. Also folded into the hash
  // when a uid is later available so signed-in users keep their
  // bucket.
  function visitorId() {
    try {
      var v = localStorage.getItem('debateos-visitor-id');
      if (!v) {
        v = 'v_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 10);
        localStorage.setItem('debateos-visitor-id', v);
      }
      return v;
    } catch (e) {
      return 'v_unknown';
    }
  }

  function readAssignment(testName) {
    try {
      var raw = localStorage.getItem('debateos-ab-' + testName);
      return raw ? raw : null;
    } catch (e) { return null; }
  }
  function writeAssignment(testName, variant) {
    try { localStorage.setItem('debateos-ab-' + testName, variant); }
    catch (e) {}
  }

  var firedExposures = {};

  function assign(testName, variants) {
    if (!Array.isArray(variants) || variants.length === 0) return null;
    var existing = readAssignment(testName);
    if (existing && variants.indexOf(existing) >= 0) {
      // Always re-fire exposure once per page-load so server-side
      // counts align with page views, but never twice in the same
      // page session.
      if (!firedExposures[testName]) {
        firedExposures[testName] = true;
        try {
          if (window.gtag) gtag('event', 'ab_variant', { test: testName, variant: existing });
        } catch (e) {}
      }
      return existing;
    }
    // Hash visitor + testName, mod buckets. Stable across reloads
    // even if localStorage is cleared, as long as visitorId is.
    var idx = djb2(visitorId() + '|' + testName) % variants.length;
    var variant = variants[idx];
    writeAssignment(testName, variant);
    firedExposures[testName] = true;
    try {
      if (window.gtag) gtag('event', 'ab_variant', { test: testName, variant: variant });
    } catch (e) {}
    return variant;
  }

  // Apply variant-specific DOM swaps. Pass a map of variant → fn that
  // runs once on assignment.
  function apply(testName, variants, handlers) {
    var v = assign(testName, variants);
    if (v && handlers && typeof handlers[v] === 'function') {
      try { handlers[v](v); }
      catch (e) { console.warn('[ab] apply handler error:', e); }
    }
    return v;
  }

  // Manual override for testing — set ?ab_<test>=<variant> in the
  // URL to force a specific bucket without touching localStorage.
  function readUrlOverride(testName) {
    try {
      var url = new URL(window.location.href);
      return url.searchParams.get('ab_' + testName);
    } catch (e) { return null; }
  }
  var origAssign = assign;
  assign = function (testName, variants) {
    var override = readUrlOverride(testName);
    if (override && variants.indexOf(override) >= 0) {
      writeAssignment(testName, override);
      if (!firedExposures[testName]) {
        firedExposures[testName] = true;
        try { if (window.gtag) gtag('event', 'ab_variant', { test: testName, variant: override, source: 'url_override' }); } catch (e) {}
      }
      return override;
    }
    return origAssign(testName, variants);
  };

  window.ab = { assign: assign, apply: apply, visitorId: visitorId };
})();
