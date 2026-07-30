/* ─────────────────────────────────────────────────────────────
 * THE DRAFT — the pre-round bench reveal and step rail.
 *
 * WHAT A DEBATER SEES
 * Before a round: pick the style, propose a lens, then meet the bench.
 * Three steps on a rail so the setup reads as a sequence with an end
 * rather than a settings panel that might go on forever.
 *
 * WHAT THIS FILE DOES NOT DO, and this is the important half.
 * It does not choose the judges, and there is no code path here that
 * could. On a ranked round the bench is PINNED by the season charter,
 * this module fetches it read-only from /api/judge/charter, and it draws
 * the three seats as locked cards with the reason stated on them. That
 * is deliberately different from every other card on the page: the
 * pinned panel is what makes a ballot reviewable, and a debater picking
 * a friendlier juror is the same thumb on the scale as the operator
 * picking one, just pointed the other way. So the panel is presented as
 * something to argue TO, not something to shop for.
 *
 * Guest judges (pickable) appear only when the host page mounts with
 * ranked:false, which today means an unranked practice round: nothing
 * settles, no ladder moves, so there is nothing for a choice to corrupt.
 * The gate is the host page's `ranked` flag and the endpoint's own
 * entitlement checks, never a class name here.
 *
 * WHY IT TOUCHES NO MATCHMAKING
 * On /spar the format chips and lens presets keep their existing ids and
 * data attributes (`#styleChips [data-fmt]`, `#judgePresets
 * [data-preset]`) and their existing delegated handlers. This module
 * only adds the rail, the bench, and keyboard/aria behaviour on top. The
 * queue document, the consent handshake, and the ballot guard are
 * untouched, which is why a visual change to a live matchmaking surface
 * is a safe one.
 *
 * COPY RULE: strings here render to users. No em dashes.
 * ───────────────────────────────────────────────────────────── */
(function () {
  'use strict';

  var CHARTER_URL = '/api/judge/charter';
  var charterPromise = null;

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  /* One fetch per page load, shared by every mount. The charter is
     edge-cached and identical for everyone, so a second request would
     buy nothing. */
  function charter() {
    if (!charterPromise) {
      charterPromise = fetch(CHARTER_URL)
        .then(function (r) { if (!r.ok) throw new Error('charter ' + r.status); return r.json(); })
        .catch(function (err) {
          if (window.console) console.warn('judge-draft: charter unavailable', err);
          return null;
        });
    }
    return charterPromise;
  }

  /* The bench, drawn from the charter's own pinned jurors.
     A failed fetch renders a plain statement rather than inventing a
     panel: three made-up seats would be a false claim about who judges
     the round, which is worse than an empty panel. */
  function benchHtml(doc) {
    if (!doc || !doc.bench || !doc.bench.seated || !doc.bench.seated.length) {
      return '<p class="arc-locked-why" style="margin:0">The bench could not be read right now. '
        + 'The panel that judges this round is published at <a href="/judge-integrity" style="color:inherit;text-decoration:underline">judge integrity</a>.</p>';
    }
    var b = doc.bench;
    var season = (doc.season && doc.season.id) || '';

    var cards = b.seated.map(function (s) {
      var flags = '<span class="arc-badge arc-badge--mono">' + esc(s.model) + '</span>';
      if (s.overridden) {
        // A disclosed override has to be visible on the card. The whole
        // charter exists because a quiet one is the problem.
        flags += '<span class="arc-badge arc-badge--warn">Override, pinned was ' + esc(s.pinnedModel) + '</span>';
      }
      return '<div class="arc-opt arc-locked" style="cursor:default;border-left:3px solid ' + esc(s.color) + '">'
        + '<span class="arc-opt-glyph" aria-hidden="true" style="color:' + esc(s.color) + '">' + esc(s.glyph) + '</span>'
        + '<span class="arc-opt-name">' + esc(s.name) + '</span>'
        + '<span class="arc-opt-sub" style="color:var(--arc-faint)">' + esc(s.seat) + '</span>'
        + '<p class="arc-opt-body">' + esc(s.temper) + '</p>'
        + '<p class="arc-opt-body" style="color:var(--arc-faint)">' + esc(s.hardOnLine) + '</p>'
        + '<span class="arc-opt-meta">' + flags + '</span>'
        + '</div>';
    }).join('');

    var split = b.noMajority === 'unresolved'
      ? 'An even split is recorded as no result rather than broken in either direction. '
      : '';

    return '<div class="arc-grid" data-cols="3">' + cards + '</div>'
      + '<p class="arc-locked-why" style="margin:12px 0 0">'
      + 'Pinned for the season' + (season ? ' (' + esc(season) + ')' : '') + '. '
      + 'You cannot choose your judges and neither can we, which is the point. '
      + 'A majority carries. ' + split
      + '<a href="/judge-integrity" style="color:inherit;text-decoration:underline">Read the criteria before you speak.</a>'
      + '</p>';
  }

  /* Guest judges, unranked only. Rendered from the same personas the
     pinned bench uses so the vocabulary is one vocabulary. */
  function guestHtml(guests, selectedKey) {
    return '<div class="arc-grid" data-arc-menu="guest-judge" aria-label="Guest judge">'
      + guests.map(function (g) {
        return '<button type="button" class="arc-opt" data-arc-opt data-arc-value="' + esc(g.key) + '"'
          + ' data-arc-label="' + esc(g.name) + '"'
          + ' aria-checked="' + (g.key === selectedKey ? 'true' : 'false') + '"'
          + ' style="border-left:3px solid ' + esc(g.color) + '">'
          + '<span class="arc-opt-glyph" aria-hidden="true" style="color:' + esc(g.color) + '">' + esc(g.glyph) + '</span>'
          + '<span class="arc-opt-name">' + esc(g.name) + '</span>'
          + '<span class="arc-opt-sub">' + esc(g.lens) + '</span>'
          + '<p class="arc-opt-body">' + esc(g.pitch) + '</p>'
          + '</button>';
      }).join('')
      + '</div>'
      + '<p class="arc-locked-why" style="margin:12px 0 0;color:var(--arc-faint)">'
      + 'Practice rounds only. Nothing here moves the ladder or settles credits, which is why the pick is yours.'
      + '</p>';
  }

  /* Step rail state, derived from what is actually chosen rather than
     from a counter this module increments. A rail that can disagree with
     the form is worse than no rail. */
  function syncRail(host) {
    var rail = host.querySelector('[data-draft-rail]');
    if (!rail || !window.ArcadeMenu) return;
    var hasFormat = !!host.querySelector('#styleChips .on, #styleChips [aria-checked="true"]');
    var lens = host.querySelector('#paradigmInput');
    var hasLens = !!(lens && lens.value && lens.value.trim());
    var at = 0;
    if (hasFormat) at = 1;
    if (hasFormat && hasLens) at = 2;
    window.ArcadeMenu.steps(rail, at);
  }

  /* Mirror the host page's `.on` class onto aria-checked. spar.html
     drives selection through the class from its own queue wiring; screen
     readers need the state, and duplicating the wiring to get it would
     mean two things deciding what is selected. */
  function mirrorAria(host) {
    ['#styleChips', '#judgePresets'].forEach(function (sel) {
      var wrap = host.querySelector(sel);
      if (!wrap) return;
      Array.prototype.forEach.call(wrap.querySelectorAll('.arc-opt'), function (o) {
        o.setAttribute('aria-checked', o.classList.contains('on') ? 'true' : 'false');
      });
    });
  }

  var JudgeDraft = {
    /* Mount the bench panel and rail into a host element. Everything is
       additive: if this never runs, the page keeps its chips and its
       textarea and still queues a round. */
    mount: function (host, options) {
      if (!host) return;
      var opts = options || {};
      var ranked = opts.ranked !== false;
      var benchEl = host.querySelector('[data-draft-bench]');

      if (window.ArcadeMenu) window.ArcadeMenu.scan(host);
      mirrorAria(host);
      syncRail(host);

      // Keep the rail and aria honest as the user moves through it. Both
      // are delegated on the host, so re-rendered chips stay covered.
      host.addEventListener('click', function () {
        // After the host's own handler has run and toggled `.on`.
        setTimeout(function () { mirrorAria(host); syncRail(host); }, 0);
      });
      var lens = host.querySelector('#paradigmInput');
      if (lens) lens.addEventListener('input', function () { syncRail(host); });

      if (!benchEl) return;
      benchEl.innerHTML = '<p class="arc-locked-why" style="margin:0;color:var(--arc-faint)">Reading the bench.</p>';

      if (!ranked && Array.isArray(opts.guests) && opts.guests.length) {
        benchEl.innerHTML = guestHtml(opts.guests, opts.guest || '');
        if (window.ArcadeMenu) window.ArcadeMenu.scan(benchEl);
        return;
      }

      charter().then(function (doc) {
        benchEl.innerHTML = benchHtml(doc);
      });
    },

    /* Exposed so a page can render the bench somewhere else (a round
       page, a ballot) without re-implementing the fetch or the copy. */
    benchInto: function (el) {
      if (!el) return;
      charter().then(function (doc) { el.innerHTML = benchHtml(doc); });
    },

    charter: charter,
  };

  window.JudgeDraft = JudgeDraft;
})();
