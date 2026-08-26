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
  var VERSION = 3;

  var STEPS = [
    { key: 'debateExperience', title: 'Do you already do competitive debate?',
      sub: 'This changes how much debate terminology and format detail we show you.',
      options: [
        { v: 'competitive', label: 'Yes, I compete' },
        { v: 'new', label: 'No, I am new to it' },
        { v: 'unsure', label: 'Not sure yet' },
      ] },
    // Asked only of someone who does not compete. "New to debate" says how
    // much vocabulary to use; it does not say whether they want to be
    // taught any, and the two answers want opposite things from a word
    // like "warrant". `when` is what keeps it off a competitor's screen.
    { key: 'debateIntent', title: 'Want to learn competitive debate, or just argue?',
      sub: 'Either is fine. It decides whether we name debate terms and explain them, or leave them out.',
      when: function (a) { return a.debateExperience && a.debateExperience !== 'competitive' && !a.debateIntent; },
      options: [
        { v: 'learn', label: 'Teach me competitive debate' },
        { v: 'argue', label: 'I just want to argue' },
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
    // The face step. `kind:'profile'` is the one step that is not a chip
    // list, so renderStep() branches on it. It is LAST on purpose: the
    // chip questions are cheap, and picking a face is the reward at the
    // end rather than a wall at the door. It is also the only step that
    // can be mounted on its own (see AVATAR_ONLY in checkUser), because
    // every account created before this shipped has already answered the
    // questions and would otherwise never be asked for a face.
    { key: 'profile', kind: 'profile',
      title: 'Pick your face',
      sub: 'This is what the leaderboard and every round shows. You can change it later in your profile.' },
  ];

  // The face step, reachable on its own for accounts that predate it.
  var PROFILE_STEP = STEPS[STEPS.length - 1];

  function lsKey(uid) { return 'debateos-onboarded-' + uid; }
  // Separate from the onboarding flag on purpose: every account that
  // existed before the face step shipped is already marked onboarded, so
  // reusing that flag would mean none of them are ever asked for a face.
  function avKey(uid) { return 'debateos-avatar-asked-' + uid; }
  function avAsked(uid) { try { return localStorage.getItem(avKey(uid)) === '1'; } catch (e) { return false; } }
  function avMark(uid) { try { localStorage.setItem(avKey(uid), '1'); } catch (e) {} }

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

  function applyIntent(value) {
    if (!/^(learn|argue)$/.test(value || '')) return;
    try { localStorage.setItem('debateos-intent', value); } catch (e) {}
    document.documentElement.setAttribute('data-debate-intent', value);
    if (window.DebatableAudience && window.DebatableAudience.setIntent) window.DebatableAudience.setIntent(value);
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
      '.ob-card{box-sizing:border-box;position:fixed;left:50%;top:50%;z-index:2147483501;transform:translate(-50%,-46%);opacity:0;transition:transform .3s ease,opacity .3s ease;width:min(420px,calc(100vw - 32px));border-radius:18px;background:#16090b;color:#fff;border:1px solid rgba(220,38,38,.42);box-shadow:0 30px 80px rgba(0,0,0,.5);font-family:"Archivo","Inter",system-ui,-apple-system,sans-serif;padding:22px 22px 16px}' +
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
      // face step
      '.ob-name{width:100%;box-sizing:border-box;border-radius:11px;border:1px solid rgba(255,255,255,.2);background:rgba(255,255,255,.05);color:#fff;font-family:inherit;font-size:.92rem;font-weight:600;padding:11px 13px;margin:0 0 12px}' +
      '.ob-name:focus{outline:none;border-color:#dc2626}' +
      '.ob-name::placeholder{color:rgba(255,255,255,.42);font-weight:500}' +
      '.ob-faces{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin:0 0 10px}' +
      '.ob-face{position:relative;padding:0;border-radius:12px;overflow:hidden;border:2px solid transparent;background:rgba(255,255,255,.05);cursor:pointer;aspect-ratio:1/1;line-height:0;transition:border-color .12s,transform .12s}' +
      '.ob-face:hover{transform:translateY(-2px)}' +
      '.ob-face svg,.ob-face img{width:100%;height:100%;display:block;object-fit:cover}' +
      '.ob-face.sel{border-color:#dc2626}' +
      '.ob-face-acts{display:flex;gap:8px;margin:0 0 2px}' +
      '.ob-mini{flex:1;border:1px solid rgba(255,255,255,.18);background:transparent;color:rgba(255,255,255,.82);border-radius:999px;padding:8px 10px;font-family:inherit;font-size:.78rem;font-weight:600;cursor:pointer}' +
      '.ob-mini:hover{border-color:rgba(255,255,255,.42);color:#fff}' +
      '[data-theme="light"] .ob-name{border-color:rgba(0,0,0,.2);background:rgba(0,0,0,.03);color:#1a1a1f}' +
      '[data-theme="light"] .ob-name::placeholder{color:rgba(0,0,0,.42)}' +
      '[data-theme="light"] .ob-face{background:rgba(0,0,0,.04)}' +
      '[data-theme="light"] .ob-mini{border-color:rgba(0,0,0,.2);color:rgba(0,0,0,.72)}' +
      '[data-theme="light"] .ob-mini:hover{border-color:rgba(0,0,0,.45);color:#1a1a1f}' +
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
  var card = null, backdrop = null, stepIdx = 0, answers = {}, activeUid = null, avatarOnly = false, sawFace = false, seen = {};
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
    // Only claim the face was asked if the step actually rendered. Someone
    // who skipped at question one never saw it and should still get the
    // focused ask on a later page.
    if (sawFace) avMark(activeUid);
    // Avatar-only mode is mounted at accounts that ALREADY answered the
    // questions. Writing an onboarding payload here would merge a
    // near-empty object over their real answers, so it writes nothing:
    // the face itself is persisted by avatar-account.js, not by this.
    if (avatarOnly) { unmount(); return; }
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
    applyIntent(answers.debateIntent);
    track('onboarding_complete', { experience: answers.debateExperience, intent: answers.debateIntent, age_range: answers.ageRange, role: answers.role, source: answers.source });
    save(answers);
  }

  function skip() {
    track('onboarding_skip', { step: stepIdx });
    var payload = Object.assign({}, answers, { version: VERSION, skipped: true, skippedAt: new Date() });
    save(payload);
  }

  // ── the face step ──────────────────────────────────────────────
  // DBAvatar is the site's portrait engine and avatar-account.js is what
  // copies a chosen face into user_profiles/{uid}.avatarIdentity, which is
  // what the leaderboard renders. Neither is loaded on most pages, so this
  // step pulls them in on demand. A failure is not fatal: the step is
  // dropped and the rest of onboarding runs untouched.
  var faceBatch = 0, faceConfigs = [], faceChoice = null;

  function loadScript(src, cb) {
    var el = document.createElement('script');
    el.src = src;
    el.addEventListener('load', function () { cb(true); }, { once: true });
    el.addEventListener('error', function () { cb(false); }, { once: true });
    document.head.appendChild(el);
  }
  function ensureAvatar(cb) {
    function withAccount() {
      // A missing account bridge only means the face syncs on the next page
      // that has it, so this never blocks the step.
      if (window.DBAvatarAccount) { cb(true); return; }
      loadScript('/js/avatar-account.js', function () { cb(true); });
    }
    if (window.DBAvatar) { withAccount(); return; }
    loadScript('/js/avatar.js', function (ok) {
      if (!ok || !window.DBAvatar) { cb(false); return; }
      withAccount();
    });
  }
  function escAttr(v) {
    return String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/"/g, '&quot;')
      .replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
  function hasLocalFace() {
    try { return !!(window.DBAvatar && DBAvatar.getUser && DBAvatar.getUser()); } catch (e) { return false; }
  }
  function authUser() {
    try { return firebase.auth().currentUser || null; } catch (e) { return null; }
  }

  function paintFaces() {
    var wrap = card && card.querySelector('.ob-faces');
    if (!wrap || !window.DBAvatar) return;
    faceConfigs = [];
    var html = '';
    for (var i = 0; i < 8; i++) {
      // Seeded off the uid so a face a user liked is still there if they
      // reopen at the same batch, rather than reshuffling under them.
      var cfg = DBAvatar.randomConfig(String(activeUid || 'anon') + ':' + faceBatch + ':' + i);
      faceConfigs.push(cfg);
      html += '<button type="button" class="ob-face" data-i="' + i + '" aria-label="Face option ' + (i + 1) + '">'
        + DBAvatar.svg(cfg, '100%') + '</button>';
    }
    wrap.innerHTML = html;
    var btns = wrap.querySelectorAll('.ob-face');
    for (var k = 0; k < btns.length; k++) {
      (function (btn) {
        btn.addEventListener('click', function () {
          var sel = wrap.querySelector('.ob-face.sel');
          if (sel) sel.classList.remove('sel');
          btn.classList.add('sel');
          faceChoice = faceConfigs[btn.getAttribute('data-i') | 0];
        });
      })(btns[k]);
    }
  }

  function renderProfileStep(step) {
    sawFace = true;
    var dots = '';
    for (var i = 0; i < activeSteps.length; i++) dots += '<i class="' + (i <= stepIdx ? 'on' : '') + '"></i>';
    var u = authUser();
    card.innerHTML =
      '<div class="ob-dots">' + dots + '</div>' +
      '<h2 class="ob-title">' + step.title + '</h2>' +
      '<p class="ob-sub">' + step.sub + '</p>' +
      '<input class="ob-name" type="text" maxlength="40" autocomplete="name" placeholder="Display name" value="'
        + escAttr(u && u.displayName ? u.displayName : '') + '">' +
      '<div class="ob-faces"></div>' +
      '<div class="ob-face-acts">' +
        '<button type="button" class="ob-mini" data-a="more">Show me more</button>' +
        '<button type="button" class="ob-mini" data-a="build">Build your own</button>' +
      '</div>' +
      '<div class="ob-foot">' +
        '<button type="button" class="ob-skip">Skip for now</button>' +
        '<button type="button" class="ob-next">Save</button>' +
      '</div>';

    faceChoice = null;
    if (window.DBAvatar) {
      paintFaces();
    } else {
      // Still loading, or blocked. Retry once, and if the engine never
      // arrives move past the step rather than showing an empty grid.
      ensureAvatar(function (ok) {
        if (!card) return;
        if (ok && window.DBAvatar) paintFaces();
        else advance();
      });
    }

    card.querySelector('.ob-skip').addEventListener('click', skip);
    card.querySelector('[data-a="more"]').addEventListener('click', function () {
      faceBatch++; faceChoice = null; paintFaces();
      track('onboarding_face_reroll', { batch: faceBatch });
    });
    card.querySelector('[data-a="build"]').addEventListener('click', function () {
      if (!window.DBAvatar || !DBAvatar.openBuilder) return;
      track('onboarding_face_builder', {});
      // The builder persists through setUser() before it calls back, so a
      // built face is already saved; record it and close out.
      DBAvatar.openBuilder({ onSave: function (saved) { faceChoice = saved; commitProfile(true); } });
    });
    card.querySelector('.ob-next').addEventListener('click', function () { commitProfile(false); });
  }

  function commitProfile(fromBuilder) {
    var input = card && card.querySelector('.ob-name');
    var name = input ? String(input.value || '').trim().slice(0, 40) : '';
    if (faceChoice && window.DBAvatar && !fromBuilder) {
      // setUser persists and fires debatable-avatar-change, which
      // avatar-account.js is listening for. That listener is what writes
      // avatarIdentity, so this one call is the whole sync.
      try { DBAvatar.setUser(faceChoice); } catch (e) {}
    }
    var u = authUser();
    if (name && u && u.updateProfile && name !== u.displayName) {
      try { u.updateProfile({ displayName: name }); } catch (e) {}
    }
    answers.profile = { face: !!faceChoice, named: !!name, builder: !!fromBuilder };
    if (name) answers.displayName = name;
    track('onboarding_face_saved', { face: !!faceChoice, builder: !!fromBuilder });
    advance();
  }

  // A step with a `when` predicate is only shown when the answers so far
  // call for it, and it is kept out of the dot count too. Past steps count
  // from `seen` rather than from the index: a step that was SKIPPED is
  // behind us but was never asked, so a dot for it would be a lie in the
  // other direction.
  function stepShows(step, at) {
    if (seen[at]) return true;
    if (at <= stepIdx) return false;
    return !step.when || step.when(answers);
  }

  function renderStep() {
    var step = activeSteps[stepIdx];
    seen[stepIdx] = 1;
    if (step.kind === 'profile') { renderProfileStep(step); return; }
    var dots = '';
    for (var i = 0; i < activeSteps.length; i++) {
      if (!stepShows(activeSteps[i], i)) continue;
      dots += '<i class="' + (i <= stepIdx ? 'on' : '') + '"></i>';
    }
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
            if (step.key === 'debateIntent') applyIntent(v);
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
    while (stepIdx < activeSteps.length && activeSteps[stepIdx].when && !activeSteps[stepIdx].when(answers)) stepIdx++;
    if (stepIdx >= activeSteps.length) { finish(); return; }
    track('onboarding_step', { step: stepIdx });
    renderStep();
  }

  function mount(uid, options) {
    if (card) return;
    activeUid = uid;
    stepIdx = 0;
    seen = {};
    answers = options && options.existing ? Object.assign({}, options.existing) : {};
    avatarOnly = !!(options && options.avatarOnly);
    sawFace = false;
    activeSteps = avatarOnly ? [PROFILE_STEP]
      : (options && options.experienceOnly ? STEPS.slice(0, 2) : STEPS);
    // Warm the portrait engine now so the last step is not a blank grid.
    ensureAvatar(function () {});
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
    // The avatar flag joins the early-out so a fully settled account still
    // costs zero reads per page, which is what the 2026-05-18 credit audit
    // asked of anything that runs sitewide.
    if (lsDone(user.uid) && experienceValue() && avAsked(user.uid)) return;
    ensureFirestore(function () {
      try {
        firebase.firestore().collection('user_profiles').doc(user.uid).get().then(function (snap) {
          var d = snap && snap.exists ? snap.data() : null;
          if (d && d.onboarding && d.onboarding.debateExperience) {
            applyExperience(d.onboarding.debateExperience);
            applyIntent(d.onboarding.debateIntent);
            lsMark(user.uid);
            // Questions are done. The face may not be: everyone who signed
            // up before the face step shipped lands here, and an account
            // with no avatarIdentity is exactly the row that renders as a
            // generated marble on the leaderboard.
            if (avAsked(user.uid)) return;
            if (d.avatarIdentity || hasLocalFace()) { avMark(user.uid); return; }
            setTimeout(function () {
              if (avAsked(user.uid)) return;
              mount(user.uid, { avatarOnly: true });
            }, 900);
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
