/* ──────────────────────────────────────────────────────────────────
   Post-signup onboarding questions.

   Drop <script defer src="/js/onboarding.js"></script> on any page
   where signed-in users land. First time a real (non-anonymous)
   user shows up without onboarding answers on user_profiles/{uid},
   a short card asks: competitive experience, age range, background,
   formats, and how they
   found us. Every step is tappable-once; the whole thing is
   skippable. Answers merge-set into user_profiles/{uid}.onboarding
   so admin analytics can read them via the admin SDK.

   Age is a RANGE, never a DOB — same legal posture as the corpus
   18+ attestation on /profile (we don't collect birthdates). This
   answer is self-reported demographics; it does NOT feed the
   corpusAgeAttested consent flag, which stays its own explicit
   attestation on /profile.

   Re-show is prevented two ways: a per-uid localStorage flag
   (cheap, no read), and the Firestore doc itself (cross-device).
   Skipping writes skippedAt so a skip also never re-nags.
   ────────────────────────────────────────────────────────────── */
(function () {
  'use strict';
  if (window.__ditOnboarding) return;
  window.__ditOnboarding = true;

  var FIRESTORE_SDK = 'https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore-compat.js';
  var VERSION = 2;

  var STEPS = [
    { key: 'debateExperience', title: 'Do you already do competitive debate?',
      sub: 'This changes how much debate terminology and format detail we show you.',
      options: [
        { v: 'competitive', label: 'Yes, I compete' },
        { v: 'new', label: 'No, I am new to it' },
        { v: 'unsure', label: 'Not sure yet' },
      ] },
    { key: 'ageRange', title: 'How old are you?', sub: 'A range is all we ask. It keeps matchmaking age-appropriate.',
      options: [
        { v: '13-15', label: '13 to 15' },
        { v: '16-18', label: '16 to 18' },
        { v: '19-24', label: '19 to 24' },
        { v: '25+', label: '25 or older' },
        { v: 'na', label: 'Prefer not to say' },
      ] },
    { key: 'role', title: 'What best describes you?',
      options: [
        { v: 'hs_debater', label: 'High school debater' },
        { v: 'college_debater', label: 'College debater' },
        { v: 'coach', label: 'Coach or teacher' },
        { v: 'professional', label: 'Professional (law, sales, pitches)' },
        { v: 'new', label: 'New to debate' },
      ] },
    { key: 'formats', title: 'Which formats do you debate?', sub: 'Pick any that apply.', multi: true,
      // s: size tier ('lg' | 'sm', default medium) — the biggest circuits
      // render bigger so the wall of chips has a visual hierarchy.
      options: [
        { v: 'bp', label: 'BP', s: 'lg' },
        { v: 'asian_parli', label: 'Asian Parli' },
        { v: 'wsdc', label: 'WSDC', s: 'lg' },
        { v: 'apda', label: 'APDA' },
        { v: 'pf', label: 'Public Forum', s: 'lg' },
        { v: 'ld', label: 'LD' },
        { v: 'policy', label: 'Policy', s: 'lg' },
        { v: 'congress', label: 'Congress', s: 'sm' },
        { v: 'mun', label: 'MUN', s: 'sm' },
        { v: 'unsure', label: 'Not sure yet', s: 'sm' },
      ] },
    { key: 'source', title: 'How did you hear about Debatable?',
      options: [
        { v: 'friend', label: 'Friend or teammate' },
        { v: 'coach_school', label: 'Coach or school' },
        { v: 'search', label: 'Search' },
        { v: 'social', label: 'Social media' },
        { v: 'other', label: 'Somewhere else' },
      ] },
  ];

  function lsKey(uid) { return 'debateos-onboarded-' + uid; }
  function lsDone(uid) { try { return localStorage.getItem(lsKey(uid)) === '1'; } catch (e) { return false; } }
  function lsMark(uid) { try { localStorage.setItem(lsKey(uid), '1'); } catch (e) {} }
  function track(ev, meta) { try { if (window.gtag) gtag('event', ev, meta || {}); } catch (e) {} }
  function experienceValue() { try { return localStorage.getItem('debateos-experience') || ''; } catch (e) { return ''; } }
  function applyExperience(value) {
    if (!/^(competitive|new|unsure)$/.test(value || '')) return;
    try { localStorage.setItem('debateos-experience', value); } catch (e) {}
    document.documentElement.setAttribute('data-debate-experience', value);
    if (window.DebatableAudience && window.DebatableAudience.set) window.DebatableAudience.set(value);
  }

  function ensureFirestore(cb) {
    if (typeof window.firebase === 'undefined') return;
    if (window.firebase.firestore) { cb(); return; }
    var existing = document.getElementById('da-firestore-sdk');
    if (existing) { existing.addEventListener('load', cb, { once: true }); return; }
    var s = document.createElement('script');
    s.id = 'da-firestore-sdk';
    s.src = FIRESTORE_SDK;
    s.addEventListener('load', function () { if (window.firebase.firestore) cb(); }, { once: true });
    s.addEventListener('error', function () { /* offline / blocked — stay quiet */ });
    document.head.appendChild(s);
  }

  // ── styles ─────────────────────────────────────────────────────
  function injectStyle() {
    if (document.getElementById('ditOnboardCss')) return;
    var s = document.createElement('style');
    s.id = 'ditOnboardCss';
    s.textContent =
      '.ob-backdrop{position:fixed;inset:0;z-index:2147483500;background:rgba(8,6,7,.62);backdrop-filter:blur(4px);-webkit-backdrop-filter:blur(4px);opacity:0;transition:opacity .26s ease}' +
      '.ob-backdrop.is-in{opacity:1}' +
      '.ob-card{position:fixed;left:50%;top:50%;z-index:2147483501;transform:translate(-50%,-46%);opacity:0;transition:transform .3s ease,opacity .3s ease;width:min(420px,calc(100vw - 32px));border-radius:18px;background:#16090b;color:#fff;border:1px solid rgba(220,38,38,.42);box-shadow:0 30px 80px rgba(0,0,0,.5);font-family:"Archivo","Inter",system-ui,-apple-system,sans-serif;padding:22px 22px 16px}' +
      '.ob-card.is-in{transform:translate(-50%,-50%);opacity:1}' +
      '.ob-dots{display:flex;gap:5px;margin:0 0 12px}' +
      '.ob-dots i{width:18px;height:3px;border-radius:2px;background:rgba(255,255,255,.16)}' +
      '.ob-dots i.on{background:#dc2626}' +
      '.ob-title{font-size:1.18rem;font-weight:800;letter-spacing:-.015em;line-height:1.2;margin:0 0 4px}' +
      '.ob-sub{font-size:.85rem;line-height:1.45;color:rgba(255,255,255,.68);margin:0 0 14px}' +
      '.ob-opts{display:flex;flex-wrap:wrap;gap:8px;margin:0 0 6px}' +
      '.ob-opt{border:1px solid rgba(255,255,255,.18);background:rgba(255,255,255,.05);color:#fff;border-radius:999px;padding:9px 14px;font-family:inherit;font-size:.86rem;font-weight:600;cursor:pointer;transition:border-color .12s,background .12s}' +
      '.ob-opt:hover{border-color:rgba(255,255,255,.4)}' +
      '.ob-opt.sel{background:#dc2626;border-color:#dc2626}' +
      '.ob-opt--wide{flex:1 1 100%;text-align:left}' +
      '.ob-opt--lg{font-size:1.02rem;font-weight:700;padding:12px 19px}' +
      '.ob-opt--sm{font-size:.76rem;padding:7px 11px;opacity:.85}' +
      '.ob-foot{display:flex;align-items:center;justify-content:space-between;margin-top:12px}' +
      '.ob-skip{border:none;background:transparent;color:rgba(255,255,255,.68);cursor:pointer;font-family:inherit;font-size:.8rem;padding:6px 0}' +
      '.ob-skip:hover{color:#fff}' +
      '.ob-next{border:none;border-radius:999px;background:#fff;color:#1a1a1f;font-family:inherit;font-size:.84rem;font-weight:700;padding:9px 18px;cursor:pointer}' +
      '.ob-next:hover{background:#f3f3f0}' +
      '.ob-next[hidden]{display:none}' +
      '[data-theme="light"] .ob-card{background:#fff;color:#1a1a1f;border-color:rgba(220,38,38,.32)}' +
      '[data-theme="light"] .ob-sub{color:rgba(0,0,0,.64)}' +
      '[data-theme="light"] .ob-dots i{background:rgba(0,0,0,.14)}' +
      '[data-theme="light"] .ob-opt{border-color:rgba(0,0,0,.2);background:rgba(0,0,0,.03);color:#1a1a1f}' +
      '[data-theme="light"] .ob-opt:hover{border-color:rgba(0,0,0,.45)}' +
      '[data-theme="light"] .ob-opt.sel{background:#dc2626;border-color:#dc2626;color:#fff}' +
      '[data-theme="light"] .ob-skip{color:rgba(0,0,0,.64)}' +
      '[data-theme="light"] .ob-skip:hover{color:#1a1a1f}' +
      '[data-theme="light"] .ob-next{background:#dc2626;color:#fff}' +
      '[data-theme="light"] .ob-next:hover{background:#b91c1c}' +
      '@media (max-width:520px){.ob-card{top:auto;bottom:0;left:0;transform:translateY(16px);width:100vw;border-radius:18px 18px 0 0;border-left:none;border-right:none;border-bottom:none}.ob-card.is-in{transform:translateY(0)}}' +
      '@media (prefers-reduced-motion:reduce){.ob-card,.ob-backdrop{transition:none}}';
    document.head.appendChild(s);
  }

  // ── modal ──────────────────────────────────────────────────────
  var card = null, backdrop = null, stepIdx = 0, answers = {}, activeUid = null;
  var activeSteps = STEPS;

  function unmount() {
    var refs = [card, backdrop];
    if (card) card.classList.remove('is-in');
    if (backdrop) backdrop.classList.remove('is-in');
    setTimeout(function () { refs.forEach(function (el) { if (el && el.parentNode) el.parentNode.removeChild(el); }); }, 300);
    card = null; backdrop = null;
  }

  function save(payload) {
    // Close optimistically; a failed write just means we ask again on
    // another device. The localStorage flag stops re-asks here either way.
    lsMark(activeUid);
    unmount();
    try {
      firebase.firestore().collection('user_profiles').doc(activeUid).set({
        onboarding: payload,
      }, { merge: true }).catch(function (e) { console.warn('[onboarding] save failed', e && e.message); });
    } catch (e) {}
  }

  function finish() {
    answers.version = VERSION;
    answers.completedAt = new Date();
    applyExperience(answers.debateExperience);
    track('onboarding_complete', { experience: answers.debateExperience, age_range: answers.ageRange, role: answers.role, source: answers.source });
    save(answers);
  }

  function skip() {
    track('onboarding_skip', { step: stepIdx });
    var payload = Object.assign({}, answers, { version: VERSION, skipped: true, skippedAt: new Date() });
    save(payload);
  }

  function renderStep() {
    var step = activeSteps[stepIdx];
    var dots = '';
    for (var i = 0; i < activeSteps.length; i++) dots += '<i class="' + (i <= stepIdx ? 'on' : '') + '"></i>';
    var opts = '';
    for (var j = 0; j < step.options.length; j++) {
      var o = step.options[j];
      opts += '<button type="button" class="ob-opt' + (step.multi ? '' : ' ob-opt--wide') + (o.s ? ' ob-opt--' + o.s : '') + '" data-v="' + o.v + '">' + o.label + '</button>';
    }
    card.innerHTML =
      '<div class="ob-dots">' + dots + '</div>' +
      '<h2 class="ob-title">' + step.title + '</h2>' +
      (step.sub ? '<p class="ob-sub">' + step.sub + '</p>' : '<p class="ob-sub"></p>') +
      '<div class="ob-opts">' + opts + '</div>' +
      '<div class="ob-foot">' +
        '<button type="button" class="ob-skip">Skip for now</button>' +
        '<button type="button" class="ob-next"' + (step.multi ? '' : ' hidden') + '>Next</button>' +
      '</div>';
    card.querySelector('.ob-skip').addEventListener('click', skip);
    var picked = [];
    var btns = card.querySelectorAll('.ob-opt');
    for (var k = 0; k < btns.length; k++) {
      (function (btn) {
        btn.addEventListener('click', function () {
          var v = btn.getAttribute('data-v');
          if (step.multi) {
            var at = picked.indexOf(v);
            if (at >= 0) { picked.splice(at, 1); btn.classList.remove('sel'); }
            else { picked.push(v); btn.classList.add('sel'); }
          } else {
            answers[step.key] = v;
            if (step.key === 'debateExperience') applyExperience(v);
            advance();
          }
        });
      })(btns[k]);
    }
    var next = card.querySelector('.ob-next');
    if (next) next.addEventListener('click', function () {
      if (step.multi) answers[step.key] = picked.slice();
      advance();
    });
  }

  function advance() {
    stepIdx++;
    if (stepIdx >= activeSteps.length) { finish(); return; }
    track('onboarding_step', { step: stepIdx });
    renderStep();
  }

  function mount(uid, options) {
    if (card) return;
    activeUid = uid;
    stepIdx = 0;
    answers = options && options.existing ? Object.assign({}, options.existing) : {};
    activeSteps = options && options.experienceOnly ? [STEPS[0]] : STEPS;
    injectStyle();
    backdrop = document.createElement('div');
    backdrop.className = 'ob-backdrop';
    card = document.createElement('div');
    card.className = 'ob-card';
    card.setAttribute('role', 'dialog');
    card.setAttribute('aria-modal', 'true');
    card.setAttribute('aria-label', 'Tell us about yourself');
    document.body.appendChild(backdrop);
    document.body.appendChild(card);
    renderStep();
    // setTimeout, not rAF: rAF never fires in a hidden tab, which would
    // leave the card mounted at opacity 0 until the next repaint.
    setTimeout(function () {
      if (backdrop) backdrop.classList.add('is-in');
      if (card) card.classList.add('is-in');
    }, 30);
    track('onboarding_shown', { path: location.pathname });
  }

  // ── entry ──────────────────────────────────────────────────────
  function checkUser(user) {
    if (!user || user.isAnonymous) return;
    if (lsDone(user.uid) && experienceValue()) return;
    ensureFirestore(function () {
      try {
        firebase.firestore().collection('user_profiles').doc(user.uid).get().then(function (snap) {
          var d = snap && snap.exists ? snap.data() : null;
          if (d && d.onboarding && d.onboarding.debateExperience) {
            applyExperience(d.onboarding.debateExperience);
            lsMark(user.uid);
            return;
          }
          // Small settle delay so we never pop mid page-transition.
          setTimeout(function () {
            // Re-check: another tab may have finished meanwhile.
            if (experienceValue()) { lsMark(user.uid); return; }
            if (d && d.onboarding) mount(user.uid, { experienceOnly: true, existing: d.onboarding });
            else if (!lsDone(user.uid)) mount(user.uid);
          }, 900);
        }).catch(function () { /* offline / rules hiccup — try next visit */ });
      } catch (e) {}
    });
  }

  function start() {
    // Only pages that already ship firebase get the questions. No
    // self-bootstrap: without the SDK there is no signed-in state
    // to react to anyway.
    var tries = 0;
    var iv = setInterval(function () {
      tries++;
      if (window.firebase && firebase.auth && firebase.apps && firebase.apps.length) {
        clearInterval(iv);
        var seen = false;
        firebase.auth().onAuthStateChanged(function (user) {
          if (seen) return;
          if (user && !user.isAnonymous) { seen = true; checkUser(user); }
        });
        return;
      }
      if (tries > 80) clearInterval(iv); // ~8s: page has no firebase
    }, 100);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
