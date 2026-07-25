// Shared A/B experiment telemetry.
//
// Pages assign sticky variants before paint, then register them on:
//   window.__abAssignments[test] = { variant: 'arm_name' }
//
// This file sends one combined impression event per page and session,
// then records clicks on elements carrying:
//   data-ab-test="test_name" data-ab-target="primary_action"
//
// When GA is present, gtag handles both GA4 and the track.js bridge.
// On pages without GA, track.js receives the same app_event directly.
(function () {
  'use strict';

  function emit(name, params) {
    try {
      if (typeof window.gtag === 'function') {
        window.gtag('event', name, params || {});
      } else if (typeof window.track === 'function') {
        window.track('app_event', Object.assign({ name: name }, params || {}));
      }
    } catch (e) {
      // Experiments must never interrupt the page.
    }
  }

  function registry() {
    var all = window.__abAssignments;
    return all && typeof all === 'object' ? all : {};
  }

  function assignmentString(all, deferred) {
    return Object.keys(all)
      .sort()
      .map(function (test) {
        var rec = all[test] || {};
        return !rec.forced &&
          Boolean(rec.deferImpression) === Boolean(deferred) &&
          /^[a-z0-9_]{2,64}$/.test(test) &&
          /^[a-z0-9_]{1,48}$/.test(rec.variant || '')
          ? test + '=' + rec.variant
          : '';
      })
      .filter(Boolean)
      .join('|');
  }

  function sendImpression(assignments, path) {
    if (!assignments) return;
    var impressionKey = '_da_ab_imp:' + path + ':' + assignments;
    var shouldSend = true;
    try {
      if (sessionStorage.getItem(impressionKey) === '1') shouldSend = false;
      else sessionStorage.setItem(impressionKey, '1');
    } catch (e) {}
    if (shouldSend) {
      emit('ab_impression', {
        assignments: assignments,
        experiment_count: assignments.split('|').length,
        path: path,
      });
    }
  }

  function observeDeferred(all, path) {
    var nodes = document.querySelectorAll('[data-ab-impression]');
    if (!nodes.length || typeof window.IntersectionObserver !== 'function') return;
    var observer = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (!entry.isIntersecting || entry.intersectionRatio < 0.5) return;
          var test = entry.target.getAttribute('data-ab-impression') || '';
          var rec = all[test] || {};
          if (!rec.deferImpression || rec.forced) return;
          var assignment = /^[a-z0-9_]{2,64}$/.test(test) && /^[a-z0-9_]{1,48}$/.test(rec.variant || '')
            ? test + '=' + rec.variant
            : '';
          sendImpression(assignment, path);
          observer.unobserve(entry.target);
        });
      },
      { threshold: 0.5 }
    );
    Array.prototype.forEach.call(nodes, function (node) { observer.observe(node); });
  }

  function boot() {
    var all = registry();
    var assignments = assignmentString(all, false);
    var path = location.pathname || '/';

    sendImpression(assignments, path);
    observeDeferred(all, path);

    document.addEventListener(
      'click',
      function (event) {
        var node = event.target && event.target.closest
          ? event.target.closest('[data-ab-test]')
          : null;
        if (!node) return;
        var test = node.getAttribute('data-ab-test') || '';
        var rec = registry()[test] || {};
        var variant = rec.variant || '';
        if (rec.forced || !/^[a-z0-9_]{2,64}$/.test(test) || !/^[a-z0-9_]{1,48}$/.test(variant)) return;
        emit('ab_conversion', {
          test: test,
          variant: variant,
          target: (node.getAttribute('data-ab-target') || 'click').slice(0, 64),
          path: path,
        });
      },
      true
    );
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    setTimeout(boot, 0);
  }
})();
