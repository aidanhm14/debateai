/* ──────────────────────────────────────────────────────────────────
   Micro-poll — a non-blocking, one-question feedback card.

   Drop <script defer src="/js/micro-poll.js"></script> on any page.
   Two ways it fires:

     1. On-scroll (automatic): once the visitor scrolls past a depth
        threshold on a page that has a poll configured, a small card
        slides up in the BOTTOM-LEFT corner (the bottom-right is
        already taken by the Feedback pill + the sign-in nudge, so we
        stay out of that cluster). One question, 2-4 tap answers, an
        optional "Something else" that expands a one-line box, and a
        × to dismiss.

     2. Manual (moment-of-value): window.DebateItPoll.ask('post_round')
        renders the same card immediately for a specific poll id. Used
        by the post-round ballot so we ask "was that useful?" right
        when the visitor just felt the value (or the letdown).

   It NEVER blocks the page. It is not a modal — no backdrop, no
   scroll lock, dismissible, and it stays out of the way of any open
   modal / sign-in nudge / go-live sheet.

   Throttle: shows at most once per session (sessionStorage), and
   after an answer or a dismissal it stays quiet for 21 days
   (localStorage). Answering suppresses that poll id for good.

   Answers POST to /api/poll-submit (writes to the private
   `poll_responses` Firestore collection) and fire a GA4
   `micro_poll_answer` event so responses are also visible in
   Analytics. Both are best-effort; a failed write never surfaces an
   error to the visitor.
   ────────────────────────────────────────────────────────────── */
(function () {
  if (window.__debateitMicroPoll) return;
  window.__debateitMicroPoll = true;

  var SESSION_SHOWN_KEY = 'debateos-poll-session-shown';
  var ANSWERED_PREFIX = 'debateos-poll-answered:';   // + pollId  -> '1' forever
  var QUIET_UNTIL_KEY = 'debateos-poll-quiet-until';  // ts; global cooloff
  var SID_KEY = 'debateos-anon-sid';

  var QUIET_MS = 21 * 24 * 60 * 60 * 1000; // 21-day cooloff after any show
  var SCROLL_DEPTH = 0.55;                 // fire once 55% of the page is read
  var MIN_DWELL_MS = 7000;                 // never on first paint; let them land
  var TIME_FALLBACK_MS = 55000;            // or after ~55s if they don't scroll far

  // ── Poll bank ─────────────────────────────────────────────────────
  // Each poll: id, question, up-to-4 options, and whether a low/soft
  // answer expands the "tell us more" one-liner. Keep questions to ONE
  // per page; the goal is a single honest data point, not a survey.
  var POLLS = {
    // Marketing / landing: WHO is showing up. Identity beats occasion here —
    // it reveals audience composition (competitors = the moat, coaches = the
    // growth unit) instead of a low-signal "just browsing" catch-all.
    intent: {
      q: 'Which one sounds most like you?',
      options: [
        { label: 'Competitive debater', value: 'competitor' },
        { label: 'Coach or teacher', value: 'coach' },
        { label: 'New to debate', value: 'newcomer' }
      ],
      other: 'Something else',
      otherPrompt: 'Then who are you?'
    },
    // Clarity check: does the page land? Cheap message-market read.
    clarity: {
      q: 'Was it clear what DebateIt actually does?',
      options: [
        { label: 'Yes, totally', value: 'clear' },
        { label: 'Sort of', value: 'partial' },
        { label: 'Not really', value: 'unclear' }
      ],
      other: '',
      otherPrompt: 'What was confusing?',
      probeOn: ['partial', 'unclear']  // expand the box on a soft/negative pick
    },
    // Pricing: what unlocks a paid decision (framed for the beta reality).
    pricing: {
      q: 'What would make DebateIt worth paying for?',
      options: [
        { label: 'More realistic AI', value: 'ai_quality' },
        { label: 'Live human rounds', value: 'humans' },
        { label: 'Better judging / RFDs', value: 'judging' }
      ],
      other: 'Something else',
      otherPrompt: 'What would it take?'
    },
    // Post-round (manual trigger): moment-of-value quality read.
    post_round: {
      q: 'Was that round useful?',
      options: [
        { label: '👍 Useful', value: 'useful' },
        { label: '😐 Meh', value: 'meh' },
        { label: '👎 Not really', value: 'not_useful' }
      ],
      other: '',
      otherPrompt: 'What was off, or what would have made it better?',
      probeOn: ['meh', 'not_useful']
    },
    // Generic catch-all for any page without a specific poll.
    generic: {
      q: 'One thing that would make DebateIt more useful?',
      options: [
        { label: 'More formats / drills', value: 'content' },
        { label: 'Smarter opponent', value: 'opponent' },
        { label: 'Faster / smoother', value: 'perf' }
      ],
      other: 'Something else',
      otherPrompt: 'Tell us more'
    }
  };

  // ── A/B/C/D: question framing ─────────────────────────────────────
  // The landing poll runs a multi-variant test across several framings.
  // Assignment is a sticky, uniform split per visitor; the chosen variant
  // name rides every event (shown / answer / dismiss, and the
  // /api/poll-submit payload as `qvariant`), so you can compare
  // show->answer rate AND the answer mix per framing. Widen or narrow the
  // test by editing the variants array. Plain, direct copy only — no
  // try-hard "reps solo / am I any good" phrasing.
  var POLL_AB = {
    intent: [
      { name: 'identity', cfg: POLLS.intent },   // "Which one sounds most like you?"
      { name: 'goal', cfg: {
        q: 'What do you want out of DebateIt?',
        options: [
          { label: 'Practice for tournaments', value: 'tournament' },
          { label: 'Reps on my own schedule', value: 'solo' },
          { label: 'Honest feedback on my speaking', value: 'judging' }
        ],
        other: 'Something else', otherPrompt: 'What are you here for?'
      } },
      { name: 'brought_you', cfg: {
        q: 'What brought you here today?',
        options: [
          { label: 'Prep for a real round', value: 'prep' },
          { label: 'Work on a specific skill', value: 'skill' },
          { label: 'See how it works', value: 'curious' }
        ],
        other: 'Something else', otherPrompt: 'What are you looking for?'
      } },
      { name: 'level', cfg: {
        q: 'Where are you with debate right now?',
        options: [
          { label: 'Competing', value: 'competitor' },
          { label: 'Learning', value: 'newcomer' },
          { label: 'Coaching', value: 'coach' }
        ],
        other: 'Something else', otherPrompt: 'Then where do you fit?'
      } },
      { name: 'worth_it', cfg: {
        q: 'What would make DebateIt worth coming back to?',
        options: [
          { label: 'A tougher opponent', value: 'opponent' },
          { label: 'Sharper judge feedback', value: 'judging' },
          { label: 'Real people to debate', value: 'humans' }
        ],
        other: 'Something else', otherPrompt: 'What would bring you back?'
      } }
    ]
  };
  var AB_KEY = 'debateos-poll-ab:'; // + pollId -> variant name (sticky per browser)

  function abPick(pollId) {
    var variants = POLL_AB[pollId];
    if (!variants || !variants.length) return { variant: '', cfg: POLLS[pollId] };
    var names = [];
    for (var i = 0; i < variants.length; i++) names.push(variants[i].name);
    var chosen;
    try {
      chosen = localStorage.getItem(AB_KEY + pollId);
      if (names.indexOf(chosen) === -1) {           // unset, or a retired variant ('a'/'b')
        chosen = names[Math.floor(Math.random() * names.length)];
        localStorage.setItem(AB_KEY + pollId, chosen);
      }
    } catch (e) { chosen = names[Math.floor(Math.random() * names.length)]; }
    var v = variants[names.indexOf(chosen)] || variants[0];
    return { variant: v.name, cfg: v.cfg };
  }

  // Which poll auto-fires on which path. First match wins; a `skip` entry
  // means no auto-poll on that path (it can still be triggered manually).
  var pathPolls = [
    { match: /^\/(spar|live|voice-debate)(?:\.html)?(?:[/?#]|$)/, skip: true }, // mid-flow; don't interrupt
    { match: /^\/(pricing)(?:\.html)?/, poll: 'pricing' },
    { match: /^\/(landing|index)?(?:\.html)?($|\?|#)/, poll: 'intent' },
    { match: /^\/(learn|topics|leaderboard|schools|professionals|future|us|india)(?:\.html)?/, poll: 'generic' },
    { match: /.*/, poll: null } // default: no auto-poll unless the page opts in
  ];

  function autoPollId() {
    // A page can force its auto-poll with <body data-micro-poll="clarity">.
    try {
      var forced = document.body.getAttribute('data-micro-poll');
      if (forced && POLLS[forced]) return forced;
    } catch (e) {}
    var path = location.pathname || '/';
    for (var i = 0; i < pathPolls.length; i++) {
      if (pathPolls[i].match.test(path)) {
        if (pathPolls[i].skip) return null;
        return pathPolls[i].poll;
      }
    }
    return null;
  }

  // ── State helpers ─────────────────────────────────────────────────
  function answered(pollId) {
    try { return localStorage.getItem(ANSWERED_PREFIX + pollId) === '1'; } catch (e) { return false; }
  }
  function markAnswered(pollId) {
    try { localStorage.setItem(ANSWERED_PREFIX + pollId, '1'); } catch (e) {}
  }
  function inQuietPeriod() {
    try {
      var until = parseInt(localStorage.getItem(QUIET_UNTIL_KEY), 10) || 0;
      return Date.now() < until;
    } catch (e) { return false; }
  }
  function armQuiet() {
    try { localStorage.setItem(QUIET_UNTIL_KEY, String(Date.now() + QUIET_MS)); } catch (e) {}
  }
  function shownThisSession() {
    try { return sessionStorage.getItem(SESSION_SHOWN_KEY) === '1'; } catch (e) { return false; }
  }
  function markShownThisSession() {
    try { sessionStorage.setItem(SESSION_SHOWN_KEY, '1'); } catch (e) {}
  }
  function sessionId() {
    try {
      var s = localStorage.getItem(SID_KEY);
      if (!s) {
        s = 's-' + Math.random().toString(36).slice(2) + Date.now().toString(36);
        localStorage.setItem(SID_KEY, s);
      }
      return s;
    } catch (e) { return 's-anon'; }
  }

  // Don't stack on top of anything that owns the screen or the bottom.
  function anotherSurfaceOpen() {
    try {
      if (document.body.classList.contains('signin-modal-open')) return true;
      if (document.querySelector('.ob-modal.is-open')) return true;
      if (document.querySelector('.intro-modal.is-open')) return true;
      if (document.querySelector('.da-golive')) return true;
      // The sign-in nudge is a different ask; never show both at once.
      if (document.querySelector('.signup-nudge.is-in')) return true;
    } catch (e) {}
    return false;
  }

  // ── Styles (injected once) ────────────────────────────────────────
  var styled = false;
  function injectStyle() {
    if (styled) return;
    styled = true;
    var s = document.createElement('style');
    s.textContent =
      '.micro-poll{position:fixed;left:18px;bottom:18px;z-index:2147483000;max-width:340px;width:calc(100vw - 36px);' +
        'box-sizing:border-box;background:#17171c;color:#fff;border:1px solid rgba(255,255,255,.12);border-radius:14px;' +
        'padding:14px 14px 13px;box-shadow:0 18px 44px rgba(0,0,0,.34);font-family:inherit;font-size:.82rem;line-height:1.4;' +
        'transform:translateY(14px);opacity:0;transition:transform .28s cubic-bezier(.2,.7,.3,1),opacity .28s ease;pointer-events:auto}' +
      '.micro-poll.is-in{transform:translateY(0);opacity:1}' +
      '.micro-poll .mp-head{display:flex;align-items:flex-start;gap:10px;margin-bottom:11px}' +
      '.micro-poll .mp-q{flex:1;color:#fff;font-weight:600;font-size:.9rem;line-height:1.32}' +
      '.micro-poll .mp-close{border:none;background:transparent;color:rgba(255,255,255,.5);cursor:pointer;font-size:1.15rem;' +
        'line-height:1;padding:0 2px;margin:-2px -2px 0 0;font-family:inherit}' +
      '.micro-poll .mp-close:hover{color:#fff}' +
      '.micro-poll .mp-opts{display:flex;flex-direction:column;gap:7px}' +
      '.micro-poll .mp-opt{appearance:none;text-align:left;border:1px solid rgba(255,255,255,.16);background:rgba(255,255,255,.04);' +
        'color:#fff;border-radius:10px;padding:9px 12px;cursor:pointer;font-family:inherit;font-size:.82rem;font-weight:500;' +
        'transition:border-color .15s ease,background .15s ease,transform .12s ease}' +
      '.micro-poll .mp-opt:hover{border-color:rgba(239,68,68,.6);background:rgba(239,68,68,.1)}' +
      '.micro-poll .mp-opt:active{transform:translateY(1px)}' +
      '.micro-poll .mp-other{border-style:dashed;color:rgba(255,255,255,.72)}' +
      '.micro-poll .mp-more{display:none;margin-top:9px}' +
      '.micro-poll .mp-more.is-open{display:block}' +
      '.micro-poll .mp-more textarea{width:100%;box-sizing:border-box;resize:none;min-height:56px;border-radius:10px;' +
        'border:1px solid rgba(255,255,255,.18);background:rgba(255,255,255,.05);color:#fff;font-family:inherit;font-size:.82rem;' +
        'padding:8px 10px;line-height:1.35}' +
      '.micro-poll .mp-more textarea:focus{outline:none;border-color:rgba(239,68,68,.6)}' +
      '.micro-poll .mp-more textarea::placeholder{color:rgba(255,255,255,.4)}' +
      '.micro-poll .mp-send{margin-top:8px;width:100%;border:none;border-radius:999px;background:#ef4444;color:#fff;' +
        'font-family:inherit;font-weight:700;font-size:.8rem;padding:9px 12px;cursor:pointer}' +
      '.micro-poll .mp-send:hover{background:#dc2626}' +
      '.micro-poll .mp-thanks{color:rgba(255,255,255,.85);font-size:.85rem;padding:2px 0 1px}' +
      '.micro-poll .mp-eyebrow{font-size:.58rem;font-weight:800;letter-spacing:.13em;text-transform:uppercase;' +
        'color:rgba(255,255,255,.42);margin-bottom:6px}' +
      // Light / stone themes: flip to the paper card treatment.
      '[data-theme="light"] .micro-poll,[data-theme="stone"] .micro-poll{background:#fff;color:#1a1a1f;' +
        'border-color:rgba(0,0,0,.1);box-shadow:0 16px 40px rgba(0,0,0,.12)}' +
      '[data-theme="light"] .micro-poll .mp-q,[data-theme="stone"] .micro-poll .mp-q{color:#1a1a1f}' +
      '[data-theme="light"] .micro-poll .mp-eyebrow,[data-theme="stone"] .micro-poll .mp-eyebrow{color:rgba(0,0,0,.4)}' +
      '[data-theme="light"] .micro-poll .mp-close,[data-theme="stone"] .micro-poll .mp-close{color:rgba(0,0,0,.42)}' +
      '[data-theme="light"] .micro-poll .mp-close:hover,[data-theme="stone"] .micro-poll .mp-close:hover{color:#1a1a1f}' +
      '[data-theme="light"] .micro-poll .mp-opt,[data-theme="stone"] .micro-poll .mp-opt{border-color:rgba(0,0,0,.14);' +
        'background:#faf9f5;color:#1a1a1f}' +
      '[data-theme="light"] .micro-poll .mp-opt:hover,[data-theme="stone"] .micro-poll .mp-opt:hover{' +
        'border-color:rgba(220,38,38,.5);background:#fff3f2}' +
      '[data-theme="light"] .micro-poll .mp-other,[data-theme="stone"] .micro-poll .mp-other{color:rgba(0,0,0,.6)}' +
      '[data-theme="light"] .micro-poll .mp-more textarea,[data-theme="stone"] .micro-poll .mp-more textarea{' +
        'border-color:rgba(0,0,0,.16);background:#faf9f5;color:#1a1a1f}' +
      '[data-theme="light"] .micro-poll .mp-more textarea::placeholder,[data-theme="stone"] .micro-poll .mp-more textarea::placeholder{color:rgba(0,0,0,.38)}' +
      '[data-theme="light"] .micro-poll .mp-thanks,[data-theme="stone"] .micro-poll .mp-thanks{color:rgba(0,0,0,.7)}' +
      '@media (max-width:520px){.micro-poll{left:8px;right:8px;bottom:8px;width:auto;max-width:none}}' +
      '@media (prefers-reduced-motion:reduce){.micro-poll{transition:opacity .2s ease}}';
    document.head.appendChild(s);
  }

  // ── Render ────────────────────────────────────────────────────────
  var card = null;

  function ga(ev, params) {
    try { if (window.gtag) gtag('event', ev, params || {}); } catch (e) {}
  }

  function submit(pollId, choice, text, qvariant) {
    var payload = {
      poll: pollId,
      choice: choice || '',
      text: (text || '').slice(0, 600),
      page: location.pathname || '/',
      variant: (document.documentElement.getAttribute('data-goals-ab') || ''),
      qvariant: qvariant || '',
      sessionId: sessionId()
    };
    ga('micro_poll_answer', { poll: pollId, choice: payload.choice, qvariant: qvariant || '', has_text: payload.text ? 1 : 0, page: payload.page });
    try {
      fetch('/api/poll-submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        keepalive: true
      }).catch(function () {});
    } catch (e) {}
    markAnswered(pollId);
  }

  function unmount() {
    if (!card) return;
    card.classList.remove('is-in');
    var ref = card;
    setTimeout(function () { if (ref && ref.parentNode) ref.parentNode.removeChild(ref); }, 300);
    card = null;
  }

  function showThanks() {
    if (!card) return;
    card.innerHTML = '<div class="mp-thanks">Thanks, that helps.</div>';
    setTimeout(unmount, 1400);
  }

  function render(pollId) {
    var pick = abPick(pollId);        // resolves the A/B framing (if any)
    var cfg = pick.cfg;
    var qvariant = pick.variant;
    if (!cfg) return false;
    injectStyle();

    card = document.createElement('div');
    card.className = 'micro-poll';
    card.setAttribute('role', 'dialog');
    card.setAttribute('aria-label', 'Quick feedback');

    var optsHtml = '';
    for (var i = 0; i < cfg.options.length; i++) {
      optsHtml += '<button type="button" class="mp-opt" data-value="' + cfg.options[i].value + '">' +
        cfg.options[i].label + '</button>';
    }
    if (cfg.other) {
      optsHtml += '<button type="button" class="mp-opt mp-other" data-value="other">' + cfg.other + ' →</button>';
    }

    card.innerHTML =
      '<div class="mp-eyebrow">30-second poll</div>' +
      '<div class="mp-head"><div class="mp-q">' + cfg.q + '</div>' +
        '<button type="button" class="mp-close" aria-label="Dismiss">×</button></div>' +
      '<div class="mp-opts">' + optsHtml + '</div>' +
      '<div class="mp-more"><textarea rows="2" placeholder="' + (cfg.otherPrompt || 'Tell us more') + '"></textarea>' +
        '<button type="button" class="mp-send">Send</button></div>';

    document.body.appendChild(card);
    requestAnimationFrame(function () { if (card) card.classList.add('is-in'); });

    var more = card.querySelector('.mp-more');
    var textarea = card.querySelector('.mp-more textarea');
    var pendingChoice = '';   // a real option held while the free-text box is open
    var sent = false;

    // Write exactly once per answer. Probe picks hold the choice until Send
    // (or dismiss) so we never write two docs for one answer, and never lose
    // a real negative pick even if the visitor skips the text.
    function sendOnce(choice, text) {
      if (sent) return;
      sent = true;
      submit(pollId, choice, text, qvariant);
    }

    var opts = card.querySelectorAll('.mp-opt');
    for (var j = 0; j < opts.length; j++) {
      opts[j].addEventListener('click', function () {
        var val = this.getAttribute('data-value');
        var probe = (cfg.probeOn && cfg.probeOn.indexOf(val) !== -1) || val === 'other';
        if (probe) {
          pendingChoice = (val === 'other') ? '' : val;
          more.classList.add('is-open');
          try { textarea.focus(); } catch (e) {}
        } else {
          sendOnce(val, '');
          showThanks();
        }
      });
    }

    card.querySelector('.mp-send').addEventListener('click', function () {
      var txt = (textarea.value || '').trim();
      if (!txt && !pendingChoice) { unmount(); return; }
      sendOnce(pendingChoice || 'other', txt);
      showThanks();
    });

    card.querySelector('.mp-close').addEventListener('click', function () {
      // Flush a real negative choice picked but not yet sent; otherwise plain dismiss.
      if (!sent && pendingChoice) sendOnce(pendingChoice, '');
      ga('micro_poll_dismiss', { poll: pollId, qvariant: qvariant, page: location.pathname });
      unmount();
    });

    ga('micro_poll_shown', { poll: pollId, qvariant: qvariant, page: location.pathname });
    return true;
  }

  // Gate + render. `force` (manual trigger) skips the scroll/session gate
  // but still respects "already answered this poll" and an open surface.
  function show(pollId, force) {
    if (card) return false;
    if (!POLLS[pollId]) return false;
    if (answered(pollId)) return false;
    if (anotherSurfaceOpen()) {
      if (force) { setTimeout(function () { show(pollId, true); }, 1500); }
      return false;
    }
    if (!force) {
      if (shownThisSession()) return false;
      if (inQuietPeriod()) return false;
    }
    markShownThisSession();
    armQuiet();
    return render(pollId);
  }

  // ── Public API ────────────────────────────────────────────────────
  // window.DebateItPoll.ask('post_round') — fire a specific poll now.
  window.DebateItPoll = {
    ask: function (pollId) { return show(pollId, true); },
    _polls: POLLS
  };

  // ── Auto (on-scroll) wiring ───────────────────────────────────────
  var autoId = autoPollId();
  if (!autoId) return;                 // page has no auto-poll
  if (answered(autoId)) return;
  if (shownThisSession() || inQuietPeriod()) return;

  var landedAt = Date.now();
  var fired = false;
  var scrolled = false;

  function scrollDepth() {
    var doc = document.documentElement;
    var body = document.body;
    var scrollTop = window.pageYOffset || doc.scrollTop || body.scrollTop || 0;
    var viewport = window.innerHeight || doc.clientHeight;
    var full = Math.max(doc.scrollHeight, body.scrollHeight, doc.offsetHeight);
    if (full <= viewport) return 1; // short page: treat as fully read
    return (scrollTop + viewport) / full;
  }

  function tryFire() {
    if (fired || card) return;
    if (Date.now() - landedAt < MIN_DWELL_MS) return; // never on first paint
    if (scrollDepth() < SCROLL_DEPTH) return;
    if (anotherSurfaceOpen()) return;                 // wait; the scroll handler retries
    fired = true;
    show(autoId, false);
  }

  function onScroll() { scrolled = true; tryFire(); }
  window.addEventListener('scroll', onScroll, { passive: true });

  // Time fallback: if they read a short page or don't scroll far but
  // stick around, still ask once (only if they've at least engaged).
  setTimeout(function () {
    if (fired || card) return;
    if (!scrolled && scrollDepth() < 0.2) return; // truly idle / bounced — leave them be
    tryFire();
    if (!fired) { fired = true; show(autoId, false); }
  }, TIME_FALLBACK_MS);
})();
