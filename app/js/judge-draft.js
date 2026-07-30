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
 * Each seat draws as an avatar and opens a full paradigm: what that
 * juror rewards, what loses in front of them, how they weigh, how much
 * rope they give speed and jargon, and the rubric tests they are
 * hardest on. Everything in the sheet comes from /api/judge/charter, so
 * the paradigm on the card is the paradigm the endpoint publishes.
 * Reading is the whole interaction. Tapping a face opens a dialog and
 * changes nothing about who judges the round.
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

  /* ── AVATARS ────────────────────────────────────────────────────
   *
   * A monogram seal, not a portrait. Two things were ruled out first: a
   * generated headshot claims a person who does not exist, and a stock
   * silhouette reads as the placeholder icon every half-built product
   * ships. What is left is what a judge would actually stamp on a
   * ballot: an initial, a ring, and a motif taken from the thing that
   * juror is hardest on, in their own colour.
   *
   * Every mark is inline SVG built from the charter's own persona
   * fields. Nothing loads, nothing is requested, and an unnamed juror
   * family draws the fallback ring rather than borrowing a face. */
  var avatarSeq = 0;

  var MOTIFS = {
    /* Beams. The Architect looks for the missing one. */
    anthropic: '<path d="M13 44V15M35 44V15M13 22h22" stroke-width="1.4" opacity=".5"/>',
    /* Rows of seats. The Generalist judges from the back one. */
    openai: '<path d="M6 20a18 18 0 0 1 36 0M11 30a13 13 0 0 1 26 0" stroke-width="1.4" opacity=".45"/>',
    /* Ruled lines. The Registrar holds the flow as the record. */
    google: '<path d="M10 16h28M10 23h28M10 30h28M10 37h28" stroke-width="1.2" opacity=".38"/>',
    /* A cut across the case. The Contrarian goes at the weak step. */
    xai: '<path d="M8 40 40 8M20 44 44 20" stroke-width="1.4" opacity=".42"/>',
    unknown: '<circle cx="24" cy="24" r="15" stroke-width="1.2" stroke-dasharray="3 4" opacity=".4"/>',
  };

  /* The letter, taken from the archetype name rather than stored, so a
     renamed persona restamps itself. "The Architect" gives A. */
  function monogram(name) {
    var words = String(name || '?').replace(/^the\s+/i, '').trim().split(/\s+/);
    return (words[0] || '?').charAt(0).toUpperCase();
  }

  function avatarSvg(p, size) {
    var c = (p && p.color) || '#9ca3af';
    var motif = MOTIFS[p && p.key] || MOTIFS.unknown;
    var id = 'jbclip' + (++avatarSeq);
    var px = size || 46;
    /* Lenses pass a two-letter mark because three of them start with T,
       and a stamp that cannot tell Truth tester from Technical is not a
       stamp. Jurors keep a single letter; theirs do not collide. */
    var mark = (p && p.mark) || monogram(p && p.name);
    return '<svg class="jb-avatar" width="' + px + '" height="' + px + '" viewBox="0 0 48 48" aria-hidden="true" focusable="false">'
      + '<defs><clipPath id="' + id + '"><circle cx="24" cy="24" r="22.2"/></clipPath></defs>'
      + '<circle cx="24" cy="24" r="22.2" fill="' + esc(c) + '" fill-opacity=".09"/>'
      + '<g clip-path="url(#' + id + ')" fill="none" stroke="' + esc(c) + '">' + motif + '</g>'
      + '<text x="24" y="24" text-anchor="middle" dominant-baseline="central" fill="' + esc(c) + '"'
      + ' font-family="\'Crimson Pro\',\'EB Garamond\',Georgia,serif" font-size="' + (mark.length > 1 ? 17 : 23) + '" font-weight="600"'
      + ' letter-spacing="0.5">' + esc(mark) + '</text>'
      + '<circle cx="24" cy="24" r="22.2" fill="none" stroke="' + esc(c) + '" stroke-opacity=".5" stroke-width="1.2"/>'
      + '</svg>';
  }

  /* ── THE PARADIGM SHEET ─────────────────────────────────────────
   *
   * Written the way a paradigm is actually written: first person, a few
   * paragraphs, then the short practical lines every judge on Tabroom
   * ends up putting at the bottom (speed, evidence, drops). That shape
   * is deliberate. A grid of plus and minus bullets is the shape of a
   * generated spec sheet, and a debater reads it as one. Prose from
   * somebody with an opinion is the thing you actually adjust for.
   *
   * Same posture as the bench itself, which is why the closing line
   * says out loud that reading is the only move on offer. Opening a
   * paradigm picks nothing.
   *
   * Content comes from the charter, so a paradigm cannot drift from
   * the persona the endpoint publishes. A juror with no paradigm block
   * renders its temper and its hardest-on line and nothing invented. */
  var sheetEl = null;
  var sheetReturnFocus = null;

  function closeSheet() {
    if (!sheetEl) return;
    sheetEl.remove();
    sheetEl = null;
    document.removeEventListener('keydown', onSheetKey);
    if (sheetReturnFocus && sheetReturnFocus.focus) sheetReturnFocus.focus();
    sheetReturnFocus = null;
  }

  function onSheetKey(e) {
    if (e.key === 'Escape') { e.preventDefault(); closeSheet(); }
  }

  function openSheet(seat, tests, lensOpts) {
    closeSheet();
    sheetReturnFocus = document.activeElement;
    var par = seat.paradigm || {};
    var c = seat.color || '#9ca3af';

    /* Rubric tests this juror leans on, resolved against the charter's
       own test list so the wording matches the published rubric. */
    var hard = (seat.hardOn || []).map(function (k) {
      var t = (tests || []).filter(function (x) { return x.key === k; })[0];
      return t ? { label: t.label, body: t.body } : null;
    }).filter(Boolean);

    var wrap = document.createElement('div');
    wrap.className = 'jb-sheet-wrap';
    wrap.innerHTML =
      '<div class="jb-scrim" data-jb-close></div>'
      + '<div class="jb-sheet" role="dialog" aria-modal="true" aria-label="Paradigm, ' + esc(seat.name) + '" style="--jbc:' + esc(c) + '">'
      + '<button type="button" class="jb-close" data-jb-close aria-label="Close">&#10005;</button>'
      + '<div class="jb-sheet-head">'
      + avatarSvg(seat, 58)
      + '<div>'
      + '<h3 class="jb-sheet-name">' + esc(seat.name) + '</h3>'
      + '<div class="jb-sheet-seat">' + (lensOpts
        ? 'A lens your round can be judged through'
        : esc(seat.seat || 'Wing') + ' on your panel' + (seasonId ? ', ' + esc(seasonId) : '')) + '</div>'
      + '</div>'
      + '</div>'
      + '<div class="jb-note">'
      + (par.note && par.note.length
        ? par.note.map(function (para) { return '<p>' + esc(para) + '</p>'; }).join('')
        : '<p>' + esc(seat.temper || '') + '</p><p>' + esc(seat.hardOnLine || '') + '</p>')
      + '</div>'
      + (par.inPractice && par.inPractice.length
        ? '<dl class="jb-practice">'
          + par.inPractice.map(function (row) {
            return '<dt>' + esc(row.k) + '</dt><dd>' + esc(row.v) + '</dd>';
          }).join('')
          + '</dl>'
        : '')
      + (hard.length
        ? '<div class="jb-hard"><p class="jb-hard-h">Where I am strictest, in the rubric\'s own words</p>'
          + hard.map(function (t) {
            return '<p class="jb-test"><span class="jb-test-l">' + esc(t.label) + '.</span> ' + esc(t.body) + '</p>';
          }).join('')
          + '</div>'
        : '')
      + (lensOpts
        ? '<div class="jb-actions">'
          + '<button type="button" class="jb-propose" data-jb-pick="' + esc(lensOpts.lensKey) + '"'
          + (lensOpts.proposed ? ' disabled' : '') + '>'
          + (lensOpts.proposed ? 'Proposing this lens' : 'Propose this lens') + '</button>'
          + '<p class="jb-foot" style="margin:0">Proposing sends it into the round as your nomination. '
          + 'It binds only if your opponent picks the same card, and a lens can shift what the ballot weighs, never who wins.</p>'
          + '</div>'
        : '<p class="jb-foot">You are reading this instead of picking it. The bench is pinned for the season, so neither you nor we can shop for a friendlier juror. '
          + '<a href="/judge-integrity">Full criteria.</a></p>')
      + '</div>';

    document.body.appendChild(wrap);
    sheetEl = wrap;
    wrap.addEventListener('click', function (e) {
      if (e.target.closest && e.target.closest('[data-jb-close]')) closeSheet();
    });
    document.addEventListener('keydown', onSheetKey);
    var close = wrap.querySelector('.jb-close');
    if (close) close.focus();
  }

  /* Seats from the last charter read, so a click can find its juror
     without threading the whole document through the DOM. */
  var seatsByKey = {};
  var rubricTests = [];
  var seasonId = '';

  function rememberSeats(doc) {
    seatsByKey = {};
    rubricTests = (doc && doc.rubric && doc.rubric.tests) || [];
    seasonId = (doc && doc.season && doc.season.id) || '';
    var seated = (doc && doc.bench && doc.bench.seated) || [];
    seated.forEach(function (s) { seatsByKey[s.jurorId || s.key] = s; });
    return seated;
  }

  /* One click handler for every avatar on the page, bound once. */
  var clicksBound = false;
  function bindClicks() {
    if (clicksBound) return;
    clicksBound = true;
    document.addEventListener('click', function (e) {
      if (!e.target.closest) return;
      var pick = e.target.closest('[data-jb-pick]');
      if (pick && !pick.disabled) {
        e.preventDefault();
        pickLens(pick.getAttribute('data-jb-pick'));
        closeSheet();
        return;
      }
      var lensHit = e.target.closest('[data-jb-lens]');
      if (lensHit) {
        var l = lensByKey(lensHit.getAttribute('data-jb-lens'));
        if (l) { e.preventDefault(); openLensSheet(l); }
        return;
      }
      var hit = e.target.closest('[data-jb-seat]');
      if (!hit) return;
      var seat = seatsByKey[hit.getAttribute('data-jb-seat')];
      if (seat) { e.preventDefault(); openSheet(seat, rubricTests); }
    });
  }

  /* Styles ride with the module so any page that mounts a bench gets
     the whole component, markup and looks together. */
  var CSS = [
    '.jb-avatar{display:block;flex-shrink:0}',
    '.jb-card{cursor:pointer}',
    '.jb-card-top{display:flex;align-items:center;gap:11px}',
    '.jb-card-id{min-width:0}',
    '.jb-read{font-size:.8rem;font-weight:600;color:var(--jbc,#9ca3af);margin-top:2px}',
    '.jb-card .arc-opt-name{font-family:\'Crimson Pro\',\'EB Garamond\',Georgia,serif;font-size:1.08rem;font-weight:600}',
    '.jb-strip-name{font-family:\'Crimson Pro\',\'EB Garamond\',Georgia,serif}',
    '.jb-strip{display:flex;align-items:center;gap:10px;flex-wrap:wrap}',
    '.jb-strip-btn{display:flex;align-items:center;gap:7px;padding:5px 11px 5px 5px;border-radius:999px;',
    'background:var(--bg-card,rgba(255,255,255,.04));border:1px solid var(--border,rgba(255,255,255,.12));',
    'color:inherit;font:inherit;cursor:pointer;transition:border-color .16s ease,transform .16s ease}',
    '.jb-strip-btn:hover{border-color:var(--jbc,#9ca3af);transform:translateY(-1px)}',
    '.jb-strip-btn:focus-visible{outline:2px solid var(--accent,#ef4444);outline-offset:2px}',
    '.jb-strip-btn.is-on{border-color:var(--jbc,#9ca3af);box-shadow:inset 0 0 0 1px var(--jbc,#9ca3af)}',
    '.jb-actions{margin-top:18px;padding-top:14px;border-top:1px solid var(--border,rgba(255,255,255,.12))}',
    '.jb-propose{display:inline-block;margin-bottom:9px;padding:9px 16px;border-radius:999px;',
    'background:var(--jbc,#9ca3af);border:none;color:#0b0a09;font:inherit;font-size:.86rem;font-weight:700;cursor:pointer}',
    '.jb-propose[disabled]{background:transparent;border:1px solid var(--jbc,#9ca3af);color:var(--jbc,#9ca3af);cursor:default}',
    '.jb-strip-name{font-size:.74rem;font-weight:700;line-height:1.15}',
    '.jb-strip-seat{font-size:.62rem;font-weight:600;letter-spacing:.06em;text-transform:uppercase;opacity:.62}',
    '.jb-strip-note{font-size:.72rem;line-height:1.5;opacity:.7;margin:8px 0 0}',
    '.jb-sheet-wrap{position:fixed;inset:0;z-index:9000;display:flex;align-items:center;justify-content:center;padding:18px}',
    '.jb-scrim{position:absolute;inset:0;background:rgba(0,0,0,.66);backdrop-filter:blur(2px)}',
    '.jb-sheet{position:relative;max-width:520px;width:100%;max-height:86vh;overflow-y:auto;',
    'background:var(--bg-panel,var(--bg-card,#12100f));border:1px solid var(--border,rgba(255,255,255,.14));',
    'border-top:3px solid var(--jbc,#9ca3af);border-radius:16px;padding:22px 22px 18px;',
    'box-shadow:0 24px 60px rgba(0,0,0,.5);color:inherit}',
    '.jb-close{position:absolute;top:12px;right:12px;width:30px;height:30px;border-radius:50%;',
    'background:transparent;border:1px solid var(--border,rgba(255,255,255,.14));color:inherit;',
    'font-size:.8rem;cursor:pointer;opacity:.7}',
    '.jb-close:hover{opacity:1}',
    '.jb-sheet-head{display:flex;align-items:center;gap:13px;padding:0 34px 14px 0;',
    'border-bottom:1px solid var(--border,rgba(255,255,255,.12));margin-bottom:16px}',
    '.jb-sheet-seat{font-size:.76rem;opacity:.6;margin-top:2px}',
    '.jb-sheet-name{font-family:\'Crimson Pro\',\'EB Garamond\',Georgia,serif;font-size:1.5rem;',
    'font-weight:600;margin:0;letter-spacing:-.01em}',
    /* The paradigm itself, set as text somebody wrote rather than a
       panel of labelled fields. */
    '.jb-note{font-family:\'Crimson Pro\',\'EB Garamond\',Georgia,serif;font-size:1.02rem;line-height:1.62}',
    '.jb-note p{margin:0 0 11px}',
    '.jb-note p:last-child{margin-bottom:0}',
    '.jb-practice{margin:18px 0 0;padding:14px 0 2px;border-top:1px solid var(--border,rgba(255,255,255,.12));',
    'display:grid;grid-template-columns:auto 1fr;gap:7px 12px;font-size:.84rem;line-height:1.5}',
    '.jb-practice dt{font-weight:700;color:var(--jbc,#9ca3af);white-space:nowrap}',
    '.jb-practice dd{margin:0;opacity:.85}',
    '.jb-hard{margin-top:16px;padding-top:13px;border-top:1px solid var(--border,rgba(255,255,255,.12))}',
    '.jb-hard-h{font-size:.75rem;opacity:.55;margin:0 0 7px}',
    '.jb-test{font-size:.82rem;line-height:1.55;margin:0 0 6px;opacity:.8}',
    '.jb-test-l{font-weight:700;color:var(--jbc,#9ca3af)}',
    '.jb-foot{font-size:.76rem;line-height:1.55;opacity:.55;margin:16px 0 0}',
    '.jb-foot a{color:inherit;text-decoration:underline}',
    '@media (max-width:560px){.jb-sheet{padding:18px 16px 14px;max-height:92vh}',
    '.jb-sheet-name{font-size:1.3rem}.jb-note{font-size:1rem}',
    '.jb-practice{grid-template-columns:1fr;gap:2px 0}.jb-practice dd{margin-bottom:8px}}',
  ].join('');

  function injectCss() {
    if (document.getElementById('jb-css')) return;
    var s = document.createElement('style');
    s.id = 'jb-css';
    s.textContent = CSS;
    document.head.appendChild(s);
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
    injectCss();
    bindClicks();
    rememberSeats(doc);

    /* The card is a button now, and the only thing it does is open the
       paradigm. A locked card that opens nothing tells a debater who is
       judging them without telling them what that juror wants, which is
       the half of the information that changes how you speak. */
    var cards = b.seated.map(function (s) {
      var flags = '<span class="arc-badge arc-badge--mono">' + esc(s.model) + '</span>';
      if (s.overridden) {
        // A disclosed override has to be visible on the card. The whole
        // charter exists because a quiet one is the problem.
        flags += '<span class="arc-badge arc-badge--warn">Override, pinned was ' + esc(s.pinnedModel) + '</span>';
      }
      return '<button type="button" class="arc-opt jb-card" data-jb-seat="' + esc(s.jurorId || s.key) + '"'
        + ' aria-haspopup="dialog" style="--jbc:' + esc(s.color) + ';border-left:3px solid ' + esc(s.color) + '">'
        + '<span class="jb-card-top">'
        + avatarSvg(s, 46)
        + '<span class="jb-card-id">'
        + '<span class="arc-opt-name" style="padding-right:0">' + esc(s.name) + '</span>'
        + '<span class="arc-opt-sub" style="display:block;color:' + esc(s.color) + '">' + esc(s.seat) + '</span>'
        + '</span>'
        + '</span>'
        + '<p class="arc-opt-body">' + esc(s.temper) + '</p>'
        + '<p class="arc-opt-body" style="color:var(--arc-faint)">' + esc(s.hardOnLine) + '</p>'
        + '<span class="jb-read">Read their paradigm &#8594;</span>'
        + '<span class="arc-opt-meta">' + flags + '</span>'
        + '</button>';
    }).join('');

    var split = b.noMajority === 'unresolved'
      ? 'An even split is recorded as no result rather than broken in either direction. '
      : '';

    return '<div class="arc-grid" data-cols="3">' + cards + '</div>'
      + '<p class="arc-locked-why" style="margin:12px 0 0">'
      + 'Pinned for the season' + (season ? ' (' + esc(season) + ')' : '') + '. '
      + 'You cannot choose your judges and neither can we, which is the point. '
      + 'Read them instead. A majority carries. ' + split
      + 'This panel decides ranked async rounds. A live round is written by one judge in the room, '
      + 'through the lens the two of you agreed on, from the same published method. ' 
      + '<a href="/judge-integrity" style="color:inherit;text-decoration:underline">Read the criteria before you speak.</a>'
      + '</p>';
  }

  /* The compact form: three faces on a row, each one a door into the
     same paradigm sheet. Built for a surface where the bench is context
     rather than the subject, like the /spar queue where somebody is
     about to be matched and has a minute to work out who is listening. */
  function stripHtml(doc) {
    var seated = (doc && doc.bench && doc.bench.seated) || [];
    if (!seated.length) {
      return '<p class="jb-strip-note" style="margin:0">The bench could not be read right now. '
        + 'It is published at <a href="/judge-integrity" style="color:inherit">judge integrity</a>.</p>';
    }
    return '<div class="jb-strip">'
      + seated.map(function (s) {
        return '<button type="button" class="jb-strip-btn" data-jb-seat="' + esc(s.jurorId || s.key) + '"'
          + ' aria-haspopup="dialog" style="--jbc:' + esc(s.color) + '">'
          + avatarSvg(s, 30)
          + '<span style="text-align:left">'
          + '<span class="jb-strip-name" style="display:block;color:' + esc(s.color) + '">' + esc(s.name) + '</span>'
          + '<span class="jb-strip-seat" style="display:block">' + esc(s.seat) + '</span>'
          + '</span>'
          + '</button>';
      }).join('')
      + '</div>'
      + '<p class="jb-strip-note">Ranked async rounds are decided by this three-model panel, and no one picks it, us included. '
      + 'A live round is different: one judge writes the ballot in the room, from the same published method.</p>';
  }

  /* ── LENSES ─────────────────────────────────────────────────────
   *
   * The paradigms a LIVE round can be judged under, which is the set
   * that matters on /spar because a spar match becomes a live round.
   * Distinct from the bench above, and the distinction is not cosmetic:
   * the bench is who judges async rounds and is pinned, while the lens
   * is the one part of a live ballot the two debaters agree on.
   *
   * Picking here is a NOMINATION and nothing more. It rides into the
   * round, and it binds only when the opponent independently lands on
   * the same card, so nobody can be judged under a paradigm the other
   * side chose for them. That is why the card says proposed rather
   * than selected until the round says otherwise.
   *
   * Data comes from js/judge-lenses.js, the same array live-round.html
   * reads, so the paradigm you read in the queue is the paradigm that
   * reaches the ballot. */
  var lensPickKey = '';
  var lensHost = null;
  var onLensPick = null;

  function lenses() {
    return (window.JUDGE_LENSES && window.JUDGE_LENSES.length) ? window.JUDGE_LENSES : [];
  }

  function lensByKey(k) {
    var l = lenses();
    for (var i = 0; i < l.length; i++) if (l[i].key === k) return l[i];
    return l[0] || null;
  }

  /* A lens wears the same mark as a juror. Both are things you stand in
     front of, and one visual vocabulary is easier to learn than two. */
  function lensAsPersona(l) {
    var first = String(l.name || '?').replace(/^the\s+/i, '').split(/\s+/)[0] || '?';
    return {
      key: 'lens-' + l.key,
      name: l.name,
      color: l.accent,
      seat: 'Lens',
      mark: first.slice(0, 2).toUpperCase(),
    };
  }

  function lensHtml() {
    var list = lenses();
    if (!list.length) {
      return '<p class="jb-strip-note" style="margin:0">The paradigm cards could not be loaded. '
        + 'Your round is judged on the published method either way.</p>';
    }
    var picked = lensByKey(lensPickKey) || list[0];
    return '<div class="jb-strip">'
      + list.map(function (l) {
        var on = l.key === picked.key;
        return '<button type="button" class="jb-strip-btn' + (on ? ' is-on' : '') + '" data-jb-lens="' + esc(l.key) + '"'
          + ' aria-haspopup="dialog" style="--jbc:' + esc(l.accent) + '">'
          + avatarSvg(lensAsPersona(l), 30)
          + '<span style="text-align:left">'
          + '<span class="jb-strip-name" style="display:block;color:' + esc(l.accent) + '">' + esc(l.name) + '</span>'
          + '<span class="jb-strip-seat" style="display:block">' + (on ? 'Proposing' : 'Read') + '</span>'
          + '</span>'
          + '</button>';
      }).join('')
      + '</div>'
      + '<p class="jb-strip-note">One AI judge writes the ballot in your round. This is the lens it reads through, '
      + 'and it only counts if your opponent lands on the same card once you are in the room. '
      + 'Tap any of them to read the paradigm first.</p>';
  }

  function paintLenses() {
    if (lensHost) lensHost.innerHTML = lensHtml();
  }

  function pickLens(key) {
    var l = lensByKey(key);
    if (!l) return;
    lensPickKey = l.key;
    paintLenses();
    if (onLensPick) onLensPick(l.key);
  }

  /* The lens sheet reuses the juror sheet's shape, because a paradigm
     reads the same whoever wrote it. The only addition is the propose
     action, and the line under it that keeps the word honest. */
  function openLensSheet(l) {
    var face = lensAsPersona(l);
    var seat = {
      name: l.name,
      seat: 'Judge lens',
      color: l.accent,
      key: face.key,
      mark: face.mark,
      temper: l.tag,
      hardOnLine: '',
      paradigm: { note: l.note, inPractice: l.inPractice },
      hardOn: [],
    };
    openSheet(seat, [], {
      lensKey: l.key,
      proposed: lensPickKey === l.key,
    });
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

      // The face strip, where a host page wants the bench visible
      // without opening the full setup panel. Same seats, same sheet.
      var stripEl = host.querySelector('[data-draft-bench-strip]');
      if (stripEl) JudgeDraft.stripInto(stripEl);

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

    /* The avatar strip on its own, for surfaces where the bench is
       context rather than a section: a queue, a match card, a lobby. */
    stripInto: function (el) {
      if (!el) return;
      injectCss();
      bindClicks();
      charter().then(function (doc) {
        rememberSeats(doc);
        el.innerHTML = stripHtml(doc);
      });
    },

    /* The lens roster: the paradigms a live round can run under, with
       the current nomination marked. `onPick` fires with the lens key
       so the host page can persist it and carry it into the round. */
    lensesInto: function (el, options) {
      if (!el) return;
      var opts = options || {};
      injectCss();
      bindClicks();
      lensHost = el;
      onLensPick = typeof opts.onPick === 'function' ? opts.onPick : null;
      lensPickKey = opts.selected || lensPickKey || 'chair';
      paintLenses();
    },

    /* Open a juror's paradigm from anywhere on the page. Takes the
       juror id the charter published, so a caller cannot conjure a
       juror the bench does not seat. */
    openParadigm: function (jurorId) {
      var seat = seatsByKey[jurorId];
      if (seat) openSheet(seat, rubricTests);
    },

    charter: charter,
  };

  window.JudgeDraft = JudgeDraft;
})();
