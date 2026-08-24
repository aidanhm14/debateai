/* ── ballot-read.js ───────────────────────────────────────────────────
   How much of a finished ballot to show. One control, every surface.

   A judged round produces the same decision at three depths: the call
   in a couple of sentences, the reason for decision, and the long-form
   full ballot. Every surface printed all three stacked, so a reader
   who wanted the verdict got a short RFD immediately followed by a
   thousand words. The text is not the problem; printing all of it at
   once is. The reader picks a depth and gets exactly one complete read
   at that depth.

     summary  the call and the clash it turned on
     ballot   the judge's reason for decision (default, and what a
              ballot has always meant)
     full     every argument walked, the drops, how it flips

   NOT the same control as the judge-delivery LENGTH picked before a
   round (lib/judge-delivery.mjs, Short / Medium / Extensive). That one
   decides how long the judge WRITES. This one decides how much of what
   was written is on screen, per reader, after the fact. They compose:
   a round judged Short simply has no long-form beat, so picking Full
   here lands on the reason for decision rather than on nothing. The
   vocabularies are kept deliberately different so the two controls
   never read as the same setting.

   The choice is a preference, not round state: it persists under
   `da-ballot-read` and rides prefs-sync, so a reader who wants the
   short version gets it on every round and on their phone.

   USAGE, markup surfaces (live-round, judge, voice-rfd, rounds):
     <div id="host"></div>                        control mounts here
     <div id="body" data-ballot-read="ballot">    content container
       <div data-read-tier="summary">…</div>      ONLY at summary
       <div data-read-tier="ballot">…</div>       ONLY at ballot
       <div data-read-tier="full">…</div>         ONLY at full
       <div data-read-min="ballot">…</div>        ballot AND full
       <div data-read-max="ballot">…</div>        summary AND ballot
       <div>…</div>                               every depth
     </div>
     BallotRead.mount(host, body, { surface: 'live-round' });

   USAGE, React surfaces (practice): put BallotRead.get() in state and
   pass the same data attributes through el(); the rules are CSS, so
   they cost nothing when a surface does not use them.

   Mounts are pruned when their elements leave the document, so a
   surface that rebuilds its whole ballot (live-round does) can call
   mount() on every render without leaking listeners. */
(function () {
  'use strict';
  if (window.BallotRead) return;

  var KEY = 'da-ballot-read';
  var LEVELS = ['summary', 'ballot', 'full'];
  var RANK = { summary: 0, ballot: 1, full: 2 };
  var DEFAULT = 'ballot';

  var COPY = {
    summary: { label: 'Summary', hint: 'The call and the clash it turned on' },
    ballot:  { label: 'Ballot',  hint: 'The judge’s reason for decision' },
    full:    { label: 'Full',    hint: 'Every argument, the drops, and how it flips' }
  };

  var current = null;
  var mounts = [];
  var subscribers = [];

  function clean(v) { return RANK[v] != null ? v : DEFAULT; }

  function get() {
    if (current === null) {
      var v = DEFAULT;
      try { v = localStorage.getItem(KEY) || DEFAULT; } catch (e) {}
      current = clean(v);
    }
    return current;
  }

  /* Mirrors the CSS exactly, so a React surface branching in JS and a
     markup surface driven by attributes can never disagree about what
     a depth shows. */
  function atLeast(level, tier) { return RANK[clean(level)] >= RANK[clean(tier)]; }
  function isAt(level, tier) { return clean(level) === clean(tier); }

  function apply(el, level) {
    if (el && el.setAttribute) el.setAttribute('data-ballot-read', clean(level || get()));
  }

  function paintControl(control, level) {
    if (!control) return;
    var btns = control.querySelectorAll('[data-read-set]');
    for (var i = 0; i < btns.length; i++) {
      btns[i].setAttribute('aria-pressed',
        btns[i].getAttribute('data-read-set') === level ? 'true' : 'false');
    }
    var hint = control.querySelector('[data-read-hint]');
    if (hint) hint.textContent = COPY[level].hint;
  }

  function set(level, meta) {
    level = clean(level);
    var changed = level !== get();
    current = level;
    try { localStorage.setItem(KEY, level); } catch (e) {}
    mounts = mounts.filter(function (m) {
      var alive = (m.content && document.contains(m.content)) ||
                  (m.control && document.contains(m.control));
      if (!alive) return false;
      apply(m.content, level);
      paintControl(m.control, level);
      return true;
    });
    for (var i = 0; i < subscribers.length; i++) {
      try { subscribers[i](level); } catch (e) {}
    }
    if (changed && meta !== false) {
      try {
        if (window.gtag) gtag('event', 'ballot_read_depth', {
          depth: level,
          surface: (meta && meta.surface) || 'unknown'
        });
      } catch (e) {}
    }
    return level;
  }

  function controlHtml(opts) {
    opts = opts || {};
    var level = get();
    var lab = opts.label === false ? '' :
      '<span class="ballot-read-lab">' + (opts.label || 'Read') + '</span>';
    var btns = LEVELS.map(function (l) {
      return '<button type="button" class="ballot-read-btn" data-read-set="' + l + '"' +
        ' aria-pressed="' + (l === level ? 'true' : 'false') + '"' +
        ' title="' + COPY[l].hint + '">' + COPY[l].label + '</button>';
    }).join('');
    return '<div class="ballot-read" role="group" aria-label="How much of the ballot to read">' +
      lab + '<span class="ballot-read-seg">' + btns + '</span>' +
      (opts.hint === false ? '' : '<span class="ballot-read-hint" data-read-hint>' + COPY[level].hint + '</span>') +
      '</div>';
  }

  /* Mount a control into `control` and drive `content`. Safe to call
     again after a re-render: the stale pair is dropped rather than
     left subscribed. */
  function mount(control, content, opts) {
    opts = opts || {};
    if (control && !control.querySelector('[data-read-set]')) {
      control.innerHTML = controlHtml(opts);
    }
    apply(content, get());
    paintControl(control, get());
    if (control && !control.__breadWired) {
      control.__breadWired = true;
      control.addEventListener('click', function (e) {
        var btn = e.target && e.target.closest ? e.target.closest('[data-read-set]') : null;
        if (!btn || !control.contains(btn)) return;
        e.preventDefault();
        set(btn.getAttribute('data-read-set'), { surface: opts.surface || '' });
      });
    }
    mounts = mounts.filter(function (m) {
      if (m.control === control && m.content === content) return false;
      return (m.content && document.contains(m.content)) ||
             (m.control && document.contains(m.control));
    });
    mounts.push({ control: control, content: content, surface: opts.surface || '' });
    return get();
  }

  function subscribe(fn) {
    if (typeof fn !== 'function') return function () {};
    subscribers.push(fn);
    return function () {
      var i = subscribers.indexOf(fn);
      if (i >= 0) subscribers.splice(i, 1);
    };
  }

  /* First `n` sentences of a body of text. The fallback summary for a
     ballot written before the judge was asked for one of its own:
     every RFD prompt on this site requires the judge to open with the
     deciding issue, so the opening sentences ARE the short version.
     Never invents, never pads; returns '' when there is nothing. */
  function firstSentences(text, n) {
    var t = String(text || '').trim();
    if (!t) return '';
    n = n || 2;
    var parts = t.match(/[^.!?]+[.!?]+(\s|$)/g);
    if (!parts || !parts.length) return t.length > 320 ? t.slice(0, 300).trim() + '…' : t;
    return parts.slice(0, n).join('').trim();
  }

  var css =
    '.ballot-read{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin:0 0 14px}' +
    '.ballot-read-lab{font-size:.6rem;font-weight:800;letter-spacing:.14em;text-transform:uppercase;opacity:.62}' +
    '.ballot-read-seg{display:inline-flex;padding:3px;border-radius:999px;' +
      'border:1px solid rgba(127,127,127,.3);background:rgba(127,127,127,.09)}' +
    '.ballot-read-btn{appearance:none;-webkit-appearance:none;border:0;background:transparent;font:inherit;' +
      'font-size:.74rem;font-weight:700;line-height:1.1;padding:7px 15px;border-radius:999px;' +
      'cursor:pointer;color:inherit;opacity:.6;transition:opacity .12s ease,background .12s ease}' +
    '.ballot-read-btn:hover{opacity:.95}' +
    // #dc2626 rather than the page accent: white on #ef4444 measures
    // 3.99:1 and fails AA at this size, #dc2626 is 4.83:1. Same
    // correction the /spar sign-in gate took on 2026-08-18.
    '.ballot-read-btn[aria-pressed="true"]{background:#dc2626;color:#fff;opacity:1;' +
      'box-shadow:0 2px 12px rgba(220,38,38,.3)}' +
    '.ballot-read-btn:focus-visible{outline:2px solid var(--accent,#ef4444);outline-offset:2px}' +
    '.ballot-read-hint{font-size:.72rem;opacity:.72;flex:1 1 auto;min-width:0}' +
    '@media (max-width:520px){.ballot-read-hint{display:none}.ballot-read-btn{padding:7px 12px}}' +
    /* exactly one tier shows at a time */
    '[data-ballot-read="summary"] [data-read-tier="ballot"],[data-ballot-read="summary"] [data-read-tier="full"],' +
    '[data-ballot-read="ballot"] [data-read-tier="summary"],[data-ballot-read="ballot"] [data-read-tier="full"],' +
    '[data-ballot-read="full"] [data-read-tier="summary"],[data-ballot-read="full"] [data-read-tier="ballot"],' +
    /* everything below the reader's floor is hidden */
    '[data-ballot-read="summary"] [data-read-min="ballot"],[data-ballot-read="summary"] [data-read-min="full"],' +
    '[data-ballot-read="ballot"] [data-read-min="full"],' +
    /* and everything a deeper read replaces */
    '[data-ballot-read="ballot"] [data-read-max="summary"],[data-ballot-read="full"] [data-read-max="summary"],' +
    '[data-ballot-read="full"] [data-read-max="ballot"]{display:none!important}';

  function injectCss() {
    if (document.getElementById('ballot-read-css')) return;
    var s = document.createElement('style');
    s.id = 'ballot-read-css';
    s.textContent = css;
    (document.head || document.documentElement).appendChild(s);
  }
  if (document.head) injectCss();
  else document.addEventListener('DOMContentLoaded', injectCss);

  window.BallotRead = {
    LEVELS: LEVELS.slice(),
    KEY: KEY,
    get: get,
    set: set,
    atLeast: atLeast,
    isAt: isAt,
    apply: apply,
    mount: mount,
    controlHtml: controlHtml,
    subscribe: subscribe,
    firstSentences: firstSentences,
    copy: COPY
  };
})();
