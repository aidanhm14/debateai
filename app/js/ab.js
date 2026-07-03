/* ──────────────────────────────────────────────────────────────────
   AB — a tiny, dependency-free A/B primitive.

   Run a measurable experiment anywhere in ~3 lines:

     var v = AB.variant('signin_pitch', ['a', 'b']);   // sticky 50/50
     if (v === 'b') { ...render the challenger... }
     btn.addEventListener('click', function () {
       AB.track('signin_click', 'signin_pitch');        // variant-tagged
     });

   - Assignment is sticky per visitor (localStorage), so nobody
     flip-flops between page loads.
   - Equal weights by default; pass [{name,weight}] to skew a split.
   - AB.variant() also fires one `ab_exposure` GA4 event per session per
     test, so the denominator (who was bucketed) is countable.
   - AB.track(event, testId, params) tags any downstream event with
     { test, variant } so the conversion is segmentable.
   - No network of its own; it rides GA4 (gtag). Safe if gtag is absent.

   Read results in GA4: `ab_exposure` (bucketed) vs your conversion
   event, both split by the `variant` param. Lock a winner in by
   hard-coding it and deleting the test.

   Mirrors the self-contained pattern already used by the micro-poll
   A/B (app/js/micro-poll.js); this is the shared version for the next
   test so each one is a 3-line job, not a hand-roll.
   ────────────────────────────────────────────────────────────── */
(function () {
  if (window.AB) return;
  var KEY = 'debateos-ab:';        // + testId -> variant name (sticky)
  var SEEN = 'debateos-ab-seen:';  // sessionStorage: one exposure/session/test

  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }

  function norm(variants) {
    // ['a','b']  or  [{name,weight}]  ->  [{name, weight}]
    var out = [];
    for (var i = 0; i < variants.length; i++) {
      var v = variants[i];
      if (typeof v === 'string') out.push({ name: v, weight: 1 });
      else if (v && v.name) out.push({ name: v.name, weight: v.weight > 0 ? v.weight : 1 });
    }
    return out;
  }
  function weightedPick(vs) {
    var total = 0, i;
    for (i = 0; i < vs.length; i++) total += vs[i].weight;
    var r = Math.random() * total;
    for (i = 0; i < vs.length; i++) { r -= vs[i].weight; if (r < 0) return vs[i].name; }
    return vs[vs.length - 1].name;
  }
  function ga(ev, params) {
    try { if (window.gtag) gtag('event', ev, params || {}); } catch (e) {}
  }

  window.AB = {
    // Assign (or read the sticky) variant for a test; fire one exposure
    // per session. Returns the variant name ('' if variants is empty).
    variant: function (testId, variants) {
      var vs = norm(variants || ['a', 'b']);
      if (!vs.length) return '';
      var names = [];
      for (var i = 0; i < vs.length; i++) names.push(vs[i].name);
      var chosen = lsGet(KEY + testId);
      if (!chosen || names.indexOf(chosen) === -1) {
        chosen = weightedPick(vs);
        lsSet(KEY + testId, chosen);
      }
      var seenKey = SEEN + testId, seen = false;
      try { seen = sessionStorage.getItem(seenKey) === '1'; } catch (e) {}
      if (!seen) {
        try { sessionStorage.setItem(seenKey, '1'); } catch (e) {}
        ga('ab_exposure', { test: testId, variant: chosen, page: location.pathname });
      }
      return chosen;
    },
    // Read the assigned variant without assigning ('' if none yet).
    get: function (testId) { return lsGet(KEY + testId) || ''; },
    // Fire a GA4 event tagged with the test + its assigned variant.
    track: function (event, testId, params) {
      var p = params || {};
      p.test = testId;
      p.variant = window.AB.get(testId);
      ga(event, p);
    }
  };
})();
