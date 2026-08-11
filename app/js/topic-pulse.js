/* topic-pulse.js — live-discourse motions, shared by every motion surface.
 *
 * The motion banks on /practice, /live and /spar are hardcoded arrays.
 * They are good, and they are frozen: written once and increasingly framed
 * around whatever was contested the month someone typed them. This module
 * adds a live tier on top, harvested from X overnight by
 * scheduled-x-pulse.mjs and published only after an admin approves it.
 *
 * Design rules, because three pages depend on this:
 *   - ADDITIVE, never a replacement. Callers concat onto their own bank,
 *     so a failed fetch costs freshness and nothing else. There is no
 *     state in which this module can empty a motion picker.
 *   - Fetch once per page load, shared across callers, never retried in a
 *     loop. The endpoint is edge-cached for 10 minutes anyway.
 *   - Never throws. Every failure resolves to an empty list.
 */
(function () {
  'use strict';

  var LIMIT = 24;
  var cache = null;      // array once resolved
  var pending = null;    // promise while in flight

  function normalize(data) {
    if (!data || !Array.isArray(data.motions)) return [];
    return data.motions
      .filter(function (m) { return m && typeof m.motion === 'string' && m.motion.trim(); })
      .map(function (m) {
        return {
          motion: m.motion,
          bg: m.bg || '',
          format: m.format || '',
          headline: m.headline || '',
          domainLabel: m.domainLabel || '',
        };
      });
  }

  function load(opts) {
    if (cache) return Promise.resolve(cache);
    if (pending) return pending;

    var qs = '?limit=' + LIMIT;
    if (opts && opts.format) qs += '&format=' + encodeURIComponent(opts.format);

    pending = fetch('/api/topic-pulse' + qs)
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) { cache = normalize(d); return cache; })
      .catch(function () { cache = []; return cache; });

    return pending;
  }

  // Synchronous read of whatever has already loaded. Pickers are click
  // handlers and must not await, so they call this and simply get an
  // empty list until the fetch lands.
  function motions() { return cache || []; }

  // Motion strings only, for the surfaces whose banks are flat arrays.
  function texts() {
    return motions().map(function (m) { return m.motion; });
  }

  window.TopicPulse = { load: load, motions: motions, texts: texts };

  // Warm on load so the first click already has the live tier.
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { load(); });
  } else {
    load();
  }
})();
