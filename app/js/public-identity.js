/* Stable public aliases for Debatable.
   Real account names stay available for private account and admin views.
   Community, matchmaking, and leaderboard surfaces can call:

     DBIdentity.forUser(firebaseUser) -> { name, username }
     DBIdentity.forId(uidOrSeed)      -> { name, username }
     DBIdentity.forBrowser()          -> { name, username }

   The same seed always returns the same pair, so aliases do not jump
   between renders. Browser-only guests keep one seed in localStorage. */
(function (global) {
  'use strict';

  var SEED_KEY = 'debatable-public-alias-seed';
  var FIRST = [
    'Ari', 'Amara', 'Anika', 'Aya', 'Benji', 'Cleo', 'Dev', 'Eli',
    'Farah', 'Inez', 'Jae', 'Kai', 'Kenji', 'Leila', 'Lina', 'Mara',
    'Mei', 'Mika', 'Nia', 'Nico', 'Noor', 'Omar', 'Priya', 'Ravi',
    'Ren', 'Rin', 'Samira', 'Sana', 'Sasha', 'Theo', 'Yuna', 'Zoya'
  ];
  var LAST = [
    'Arden', 'Ashby', 'Bell', 'Blake', 'Cedar', 'Chen', 'Cole', 'Dane',
    'Ellis', 'Frost', 'Gray', 'Hale', 'Hart', 'Iyer', 'Jain', 'Khan',
    'Lane', 'Lin', 'Mori', 'Nash', 'Park', 'Quinn', 'Reed', 'Rivera',
    'Rowan', 'Sato', 'Shah', 'Stone', 'Vale', 'West', 'Wren', 'Young'
  ];
  var ADJECTIVES = [
    'agile', 'bold', 'calm', 'clear', 'curious', 'direct', 'electric',
    'fair', 'fast', 'fearless', 'focused', 'keen', 'lucid', 'nimble',
    'quiet', 'rapid', 'ready', 'sharp', 'steady', 'witty'
  ];
  var NOUNS = [
    'ballot', 'bench', 'case', 'clash', 'closer', 'crossfire', 'flow',
    'forum', 'gavel', 'motion', 'opener', 'point', 'rebuttal', 'round',
    'speaker', 'speech', 'squad', 'stance', 'warrant', 'whip'
  ];

  function hash(value) {
    var s = String(value || 'debater');
    var h = 2166136261;
    for (var i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  function browserSeed() {
    try {
      var saved = global.localStorage && global.localStorage.getItem(SEED_KEY);
      if (saved) return saved;
      var fresh = '';
      if (global.crypto && global.crypto.getRandomValues) {
        var bytes = new Uint32Array(2);
        global.crypto.getRandomValues(bytes);
        fresh = bytes[0].toString(36) + bytes[1].toString(36);
      } else {
        fresh = Date.now().toString(36) + Math.random().toString(36).slice(2);
      }
      if (global.localStorage) global.localStorage.setItem(SEED_KEY, fresh);
      return fresh;
    } catch (e) {
      return 'guest-' + Math.random().toString(36).slice(2);
    }
  }

  function forId(id) {
    var seed = String(id || browserSeed());
    var nameHash = hash('name:' + seed);
    var userHash = hash('username:' + seed);
    var first = FIRST[nameHash % FIRST.length];
    var last = LAST[Math.floor(nameHash / FIRST.length) % LAST.length];
    var adjective = ADJECTIVES[userHash % ADJECTIVES.length];
    var noun = NOUNS[Math.floor(userHash / ADJECTIVES.length) % NOUNS.length];
    var suffix = String(hash('suffix:' + seed) % 10000).padStart(4, '0');
    return {
      name: first + ' ' + last,
      username: adjective + '_' + noun + '_' + suffix
    };
  }

  /* ── Chosen names ──────────────────────────────────────────────────
     Everything above generates a STABLE alias from a seed, which is the
     right default (a name that never jumps between renders) and the wrong
     answer the moment someone picks their own. Until 2026-08-12 forUser()
     only ever returned the generated pair, so a name set on /profile was
     read by exactly one write path (the voice-round leaderboard entry) and
     silently discarded by /spar, /practice, /live, /community and the
     notification pill. To a user that reads as "my name keeps resetting",
     because the alias they never chose is what came back.

     So the chosen name is now the FIRST thing forUser() looks at, and the
     cache lives in localStorage rather than only in Firestore. That is
     load-bearing rather than an optimisation: every one of those surfaces
     renders a name on first paint, long before a profile-doc read could
     resolve, and a blank-then-populate flash is the same bug wearing a
     shorter timescale. Firestore stays the cross-device source of truth
     and refills the cache through hydrate() on every sign-in.

     The cache is stamped with the uid it belongs to so a second account on
     a shared browser does not inherit the first one's name. A guest may
     still pick a name; it rides browserSeed() and uploads on sign-in. */
  var NAME_KEY = 'debatable-chosen-name';
  var USER_KEY = 'debatable-chosen-username';
  var OWNER_KEY = 'debatable-chosen-owner';

  var NAME_MAX = 32;
  var USERNAME_MAX = 20;

  function lsGet(key) {
    try { return (global.localStorage && global.localStorage.getItem(key)) || ''; }
    catch (e) { return ''; }
  }
  function lsSet(key, value) {
    try {
      if (!global.localStorage) return;
      if (value) global.localStorage.setItem(key, value);
      else global.localStorage.removeItem(key);
    } catch (e) {}
  }

  /* Names are rendered into other people's browsers, so the sanitiser is a
     security boundary and not a tidiness pass. Angle brackets and quotes go
     first because several call sites build markup by string concatenation
     (leaderboard rows, the spar rail, the DM list) and one of them WILL be
     the one that forgot to escape. Control characters and the bidi
     overrides go too: U+202E alone can make a name render backwards and
     drag the rest of the row with it. */
  function cleanName(value) {
    var s = String(value == null ? '' : value);
    s = s.replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028\u2029\u202a-\u202e\u2066-\u2069\ufeff]/g, '');
    s = s.replace(/[<>&"'`\\]/g, '');
    s = s.replace(/\s+/g, ' ').trim();
    return s.slice(0, NAME_MAX);
  }

  function cleanUsername(value) {
    var s = String(value == null ? '' : value).toLowerCase();
    s = s.replace(/[^a-z0-9_]/g, '');
    return s.slice(0, USERNAME_MAX);
  }

  /* A name is rejected rather than silently trimmed to nothing, because a
     save that reports success and stores '' is exactly the behaviour this
     whole change exists to remove. */
  function validateName(value) {
    var name = cleanName(value);
    if (!name) return { ok: false, name: '', error: 'Pick a name with at least two characters.' };
    if (name.replace(/\s/g, '').length < 2) return { ok: false, name: name, error: 'Pick a name with at least two characters.' };
    return { ok: true, name: name, error: '' };
  }

  function ownerOf(user) {
    return (user && user.uid) ? String(user.uid) : 'guest:' + browserSeed();
  }

  function cachedFor(owner) {
    var stamped = lsGet(OWNER_KEY);
    // An unstamped cache predates this field, so it belongs to whoever is
    // holding the browser now. Claiming it beats discarding a name someone
    // already set.
    if (stamped && stamped !== owner) return null;
    var name = cleanName(lsGet(NAME_KEY));
    if (!name) return null;
    return { name: name, username: cleanUsername(lsGet(USER_KEY)) };
  }

  function forUser(user) {
    var owner = ownerOf(user);
    var generated = forId(user && user.uid ? user.uid : browserSeed());
    var chosen = cachedFor(owner);
    if (!chosen) return generated;
    return {
      name: chosen.name,
      // A username is optional. Someone who only wanted to fix their
      // display name keeps the stable generated handle rather than being
      // forced to invent a second identifier.
      username: chosen.username || generated.username,
      chosen: true
    };
  }

  /* True when this account is still running on a generated alias, which is
     what the sign-in prompt gates on. */
  function needsName(user) {
    return !cachedFor(ownerOf(user));
  }

  function emit(detail) {
    try { global.dispatchEvent(new CustomEvent('dbidentity:change', { detail: detail })); }
    catch (e) {}
  }

  function profileDoc(user) {
    if (!user || !user.uid) return null;
    var fb = global.firebase;
    if (!fb || typeof fb.firestore !== 'function') return null;
    try { return fb.firestore().collection('user_profiles').doc(user.uid); }
    catch (e) { return null; }
  }

  function currentUser() {
    var fb = global.firebase;
    if (!fb || typeof fb.auth !== 'function') return null;
    try { return fb.auth().currentUser || null; } catch (e) { return null; }
  }

  /* Write order is deliberate: cache first, then Firestore. The user's next
     paint is what they judge the save on, and a slow or blocked Firestore
     (Safari ITP, an in-app browser, a strict blocker) must not be able to
     make the name look like it failed. A rejected write leaves the cache
     in place and resolves with ok:false so a caller can say so. */
  function setName(name, username, user) {
    var target = user || currentUser();
    var check = validateName(name);
    if (!check.ok) return Promise.resolve({ ok: false, error: check.error });
    // undefined means "leave the handle alone", which is what a caller with
    // no handle field (the /profile settings row) wants. An explicit empty
    // string is a deliberate clear.
    var existingHandle = (cachedFor(ownerOf(target)) || {}).username || '';
    var handle = (username === undefined || username === null)
      ? existingHandle
      : cleanUsername(username);

    lsSet(NAME_KEY, check.name);
    lsSet(USER_KEY, handle);
    lsSet(OWNER_KEY, ownerOf(target));
    emit({ name: check.name, username: handle, uid: target && target.uid });

    var ref = profileDoc(target);
    if (!ref) return Promise.resolve({ ok: true, name: check.name, username: handle, synced: false });
    return ref.set({
      displayNameOverride: check.name,
      usernameOverride: handle || null,
      displayNameUpdatedAt: new Date()
    }, { merge: true }).then(function () {
      return { ok: true, name: check.name, username: handle, synced: true };
    }).catch(function (err) {
      try { console.warn('[identity] name sync failed:', err && err.message); } catch (e) {}
      return { ok: true, name: check.name, username: handle, synced: false };
    });
  }

  function clearName(user) {
    lsSet(NAME_KEY, '');
    lsSet(USER_KEY, '');
    lsSet(OWNER_KEY, '');
    emit({ name: '', username: '', uid: user && user.uid });
    var ref = profileDoc(user || currentUser());
    if (!ref) return Promise.resolve({ ok: true });
    return ref.set({ displayNameOverride: null, usernameOverride: null }, { merge: true })
      .then(function () { return { ok: true }; })
      .catch(function () { return { ok: true, synced: false }; });
  }

  /* Pull the stored name down on sign-in so it follows the account across
     devices. A guest who picked a name before signing in is UPLOADED rather
     than overwritten: they chose that name on this device minutes ago, and
     an empty profile field is the absence of a choice, not a choice of
     nothing. */
  var hydrating = null;
  function hydrate(user) {
    var target = user || currentUser();
    var ref = profileDoc(target);
    if (!ref) return Promise.resolve(forUser(target));
    if (hydrating) return hydrating;
    hydrating = ref.get().then(function (snap) {
      var d = (snap && snap.exists && snap.data()) || {};
      var remote = cleanName(d.displayNameOverride);
      var remoteHandle = cleanUsername(d.usernameOverride);
      var owner = ownerOf(target);
      var local = cachedFor(owner);
      var localUnclaimed = !lsGet(OWNER_KEY) && cleanName(lsGet(NAME_KEY));

      if (remote) {
        lsSet(NAME_KEY, remote);
        lsSet(USER_KEY, remoteHandle);
        lsSet(OWNER_KEY, owner);
        emit({ name: remote, username: remoteHandle, uid: target && target.uid });
      } else if (local || localUnclaimed) {
        var carry = local || { name: cleanName(lsGet(NAME_KEY)), username: cleanUsername(lsGet(USER_KEY)) };
        return setName(carry.name, carry.username, target).then(function () { return forUser(target); });
      } else {
        // No stored name on either side. Drop a stale cache belonging to a
        // different account rather than showing this user someone else's.
        if (lsGet(OWNER_KEY) && lsGet(OWNER_KEY) !== owner) {
          lsSet(NAME_KEY, ''); lsSet(USER_KEY, ''); lsSet(OWNER_KEY, '');
        }
      }
      return forUser(target);
    }).catch(function (err) {
      try { console.warn('[identity] hydrate failed:', err && err.message); } catch (e) {}
      return forUser(target);
    }).then(function (result) {
      hydrating = null;
      return result;
    });
    return hydrating;
  }

  /* Suggestions for the picker. Seeded off the browser plus an offset so
     "shuffle" actually moves, and drawn from the same banks as the alias
     generator so a suggested name looks like it belongs on the board. */
  function suggest(n, offset) {
    var out = [];
    var base = String(offset || 0);
    for (var i = 0; i < (n || 4); i++) {
      out.push(forId(browserSeed() + ':s' + base + ':' + i).name);
    }
    return out;
  }

  /* ── The picker ────────────────────────────────────────────────────
     Lives here rather than in a page, because the name has to be settable
     from wherever someone first notices it is wrong: the topbar, a round,
     the leaderboard. One dialog, loaded by the same file every surface
     already pulls in for forUser().

     Everything is written through textContent and value, never innerHTML
     with user input, so the sanitiser in cleanName is defence in depth for
     the OTHER call sites rather than the only thing standing between a
     name and the DOM here. */
  var STYLE_ID = 'db-name-picker-css';
  /* Ordered deliberately: GEOMETRY first, then the light palette, then the
     dark palette. Everything is one flat sheet with no nesting, so the only
     thing separating a rule from its override is document order, and mixing
     the two concerns is what broke this once already: '.dbnp .dbnp-btn'
     carries a 'border' shorthand and a white 'color', and while it sat after
     the ghost-button colours at equal specificity it silently repainted the
     ghost's border transparent and its text white on a cream card. Keep new
     colour at the bottom.

     Colours are literal rather than theme tokens. --bg-card is a 3% BLACK
     TINT on the light theme, meant to sit on paper; over this dialog's dark
     backdrop it renders as a near-invisible smear with unreadable text, the
     same trap the 2026-05-20 light-theme contrast rebuild fixed on the
     profile dashboard. A modal needs opaque paint it controls itself. */
  var DARK = ':root[data-lighting="dark"] ,:root[data-theme="dark"] ,' +
    ':root[data-theme="crimson"] ,:root[data-theme="grey"] ,:root[data-theme="stone"] ';
  // Expands 'X{...}' into one rule per dark-theme ancestor selector.
  function dark(sel, body) {
    return DARK.split(',').map(function (p) { return p.trim() + ' ' + sel; }).join(',') + '{' + body + '}';
  }
  var CSS = [
    /* ── geometry ── */
    '.dbnp-back{position:fixed;inset:0;z-index:2147483000;display:grid;place-items:center;' +
      'padding:20px;background:rgba(8,8,10,.62);backdrop-filter:blur(3px)}',
    '.dbnp{width:100%;max-width:430px;border-radius:16px;padding:22px;' +
      'box-shadow:0 24px 60px -18px rgba(0,0,0,.55);border-style:solid;border-width:1px;' +
      'font-family:inherit;max-height:calc(100vh - 40px);overflow:auto}',
    '.dbnp .dbnp-eyebrow{font-size:.66rem;letter-spacing:.12em;text-transform:uppercase;' +
      'font-weight:800;margin:0 0 6px}',
    '.dbnp h2{margin:0 0 6px;font-size:1.18rem;font-weight:800;line-height:1.2}',
    '.dbnp p.dbnp-sub{margin:0 0 16px;font-size:.83rem;line-height:1.5;opacity:.75}',
    '.dbnp label{display:block;font-size:.72rem;font-weight:700;letter-spacing:.04em;' +
      'text-transform:uppercase;opacity:.7;margin:0 0 6px}',
    '.dbnp input{width:100%;box-sizing:border-box;padding:11px 13px;border-radius:10px;' +
      'font-size:.95rem;font-family:inherit;border-style:solid;border-width:1px}',
    '.dbnp .dbnp-hint{margin:6px 0 0;font-size:.72rem;opacity:.65;line-height:1.45}',
    '.dbnp .dbnp-err{margin:8px 0 0;font-size:.76rem;font-weight:600;min-height:1em}',
    '.dbnp .dbnp-field{margin:0 0 15px}',
    '.dbnp .dbnp-ideas{display:flex;flex-wrap:wrap;gap:6px;margin:9px 0 0}',
    '.dbnp .dbnp-chip{font:inherit;font-size:.75rem;font-weight:600;cursor:pointer;' +
      'padding:6px 11px;border-radius:999px;background:transparent;' +
      'border-style:solid;border-width:1px}',
    '.dbnp .dbnp-actions{display:flex;gap:9px;margin:18px 0 0;flex-wrap:wrap}',
    '.dbnp .dbnp-btn{font:inherit;font-size:.84rem;font-weight:800;cursor:pointer;' +
      'padding:11px 20px;border-radius:999px;border-style:solid;border-width:1px;' +
      'flex:1 1 auto}',
    '.dbnp .dbnp-btn--ghost{background:transparent;flex:0 0 auto}',
    '.dbnp .dbnp-btn[disabled]{opacity:.55;cursor:default}',

    /* ── light palette ── */
    '.dbnp{background:#fffdf8;color:#17171a;border-color:rgba(0,0,0,.1)}',
    '.dbnp .dbnp-eyebrow,.dbnp .dbnp-err{color:#c01717}',
    '.dbnp input{background:#fff;color:#17171a;border-color:rgba(0,0,0,.2)}',
    '.dbnp .dbnp-chip{color:#17171a;border-color:rgba(0,0,0,.2)}',
    '.dbnp .dbnp-btn{background:#b91c1c;color:#fff;border-color:transparent}',
    '.dbnp .dbnp-btn--ghost{background:transparent;color:#17171a;border-color:rgba(0,0,0,.24)}',
    '.dbnp input:focus{outline:none;border-color:#dc2626;' +
      'box-shadow:0 0 0 3px rgba(220,38,38,.22)}',
    '.dbnp .dbnp-chip:hover,.dbnp .dbnp-btn--ghost:hover{border-color:#dc2626;color:#dc2626;' +
      'background:rgba(220,38,38,.08)}',

    /* ── dark palette ── */
    dark('.dbnp', 'background:#17171b;color:#f5efe7;border-color:rgba(255,255,255,.14)'),
    dark('.dbnp .dbnp-eyebrow', 'color:#f87171'),
    dark('.dbnp .dbnp-err', 'color:#f87171'),
    dark('.dbnp input', 'background:rgba(255,255,255,.06);color:#f5efe7;' +
      'border-color:rgba(255,255,255,.22)'),
    dark('.dbnp .dbnp-chip', 'color:#f5efe7;border-color:rgba(255,255,255,.22)'),
    dark('.dbnp .dbnp-btn--ghost', 'color:#f5efe7;border-color:rgba(255,255,255,.26)'),
    dark('.dbnp .dbnp-chip:hover', 'color:#fca5a5;border-color:#f87171;' +
      'background:rgba(248,113,113,.14)'),
    dark('.dbnp .dbnp-btn--ghost:hover', 'color:#fca5a5;border-color:#f87171;' +
      'background:rgba(248,113,113,.14)')
  ].join('');

  function ensureStyle() {
    var doc = global.document;
    if (!doc || doc.getElementById(STYLE_ID)) return;
    var st = doc.createElement('style');
    st.id = STYLE_ID;
    st.textContent = CSS;
    (doc.head || doc.documentElement).appendChild(st);
  }

  var openDialog = null;

  function openEditor(opts) {
    var doc = global.document;
    if (!doc) return Promise.resolve(null);
    if (openDialog) return openDialog.promise;
    opts = opts || {};
    ensureStyle();

    var user = opts.user || currentUser();
    var owner = ownerOf(user);
    var existing = cachedFor(owner);
    var generated = forId(user && user.uid ? user.uid : browserSeed());
    var firstTime = !existing;

    var back = doc.createElement('div');
    back.className = 'dbnp-back';
    back.setAttribute('role', 'dialog');
    back.setAttribute('aria-modal', 'true');
    back.setAttribute('aria-label', 'Choose your display name');

    var card = doc.createElement('div');
    card.className = 'dbnp';

    var eyebrow = doc.createElement('p');
    eyebrow.className = 'dbnp-eyebrow';
    eyebrow.textContent = firstTime ? 'Pick your name' : 'Your name';

    var h = doc.createElement('h2');
    h.textContent = firstTime ? 'What should people call you?' : 'Change your name';

    var sub = doc.createElement('p');
    sub.className = 'dbnp-sub';
    sub.textContent = firstTime
      ? 'This is the name on your ballots, the leaderboard, and every round you play. Use your real name or a nickname. You can change it whenever you like.'
      : 'Shown on your ballots, the leaderboard, and every round you play.';

    var nameField = doc.createElement('div');
    nameField.className = 'dbnp-field';
    var nameLabel = doc.createElement('label');
    nameLabel.setAttribute('for', 'dbnpName');
    nameLabel.textContent = 'Name or nickname';
    var nameInput = doc.createElement('input');
    nameInput.id = 'dbnpName';
    nameInput.type = 'text';
    nameInput.maxLength = NAME_MAX;
    nameInput.autocomplete = 'nickname';
    nameInput.placeholder = generated.name;
    nameInput.value = (existing && existing.name) || '';
    var nameErr = doc.createElement('p');
    nameErr.className = 'dbnp-err';
    nameField.appendChild(nameLabel);
    nameField.appendChild(nameInput);
    nameField.appendChild(nameErr);

    // Suggestions exist so the empty field is never a wall. They are also
    // the escape hatch for anyone who wants to stay pseudonymous without
    // having to invent something.
    var ideas = doc.createElement('div');
    ideas.className = 'dbnp-ideas';
    var shuffleCount = 0;
    function paintIdeas() {
      ideas.textContent = '';
      suggest(3, shuffleCount).forEach(function (s) {
        var chip = doc.createElement('button');
        chip.type = 'button';
        chip.className = 'dbnp-chip';
        chip.textContent = s;
        chip.addEventListener('click', function () {
          nameInput.value = s;
          nameErr.textContent = '';
          nameInput.focus();
        });
        ideas.appendChild(chip);
      });
      var more = doc.createElement('button');
      more.type = 'button';
      more.className = 'dbnp-chip';
      more.textContent = 'Shuffle';
      more.addEventListener('click', function () { shuffleCount++; paintIdeas(); });
      ideas.appendChild(more);
    }
    paintIdeas();
    nameField.appendChild(ideas);

    var handleField = doc.createElement('div');
    handleField.className = 'dbnp-field';
    var handleLabel = doc.createElement('label');
    handleLabel.setAttribute('for', 'dbnpHandle');
    handleLabel.textContent = 'Handle (optional)';
    var handleInput = doc.createElement('input');
    handleInput.id = 'dbnpHandle';
    handleInput.type = 'text';
    handleInput.maxLength = USERNAME_MAX;
    handleInput.autocomplete = 'off';
    handleInput.placeholder = generated.username;
    handleInput.value = (existing && existing.username) || '';
    var handleHint = doc.createElement('p');
    handleHint.className = 'dbnp-hint';
    handleHint.textContent = 'Letters, numbers and underscores. Leave it blank to keep the one you were given.';
    handleField.appendChild(handleLabel);
    handleField.appendChild(handleInput);
    handleField.appendChild(handleHint);
    handleInput.addEventListener('input', function () {
      var caretAtEnd = handleInput.selectionStart === handleInput.value.length;
      var cleaned = cleanUsername(handleInput.value);
      if (cleaned !== handleInput.value) {
        handleInput.value = cleaned;
        if (caretAtEnd) handleInput.setSelectionRange(cleaned.length, cleaned.length);
      }
    });

    var actions = doc.createElement('div');
    actions.className = 'dbnp-actions';
    var save = doc.createElement('button');
    save.type = 'button';
    save.className = 'dbnp-btn';
    save.textContent = 'Save name';
    var later = doc.createElement('button');
    later.type = 'button';
    later.className = 'dbnp-btn dbnp-btn--ghost';
    later.textContent = firstTime ? 'Not now' : 'Cancel';
    actions.appendChild(save);
    actions.appendChild(later);

    card.appendChild(eyebrow);
    card.appendChild(h);
    card.appendChild(sub);
    card.appendChild(nameField);
    card.appendChild(handleField);
    card.appendChild(actions);
    back.appendChild(card);

    var resolveOuter;
    var promise = new Promise(function (res) { resolveOuter = res; });
    var lastFocus = doc.activeElement;

    function close(result) {
      if (!openDialog) return;
      openDialog = null;
      doc.removeEventListener('keydown', onKey, true);
      if (back.parentNode) back.parentNode.removeChild(back);
      try { if (lastFocus && lastFocus.focus) lastFocus.focus(); } catch (e) {}
      resolveOuter(result);
    }
    function onKey(e) {
      if (e.key === 'Escape') { e.stopPropagation(); close(null); }
      else if (e.key === 'Enter' && (e.target === nameInput || e.target === handleInput)) {
        e.preventDefault();
        commit();
      }
    }
    function commit() {
      var check = validateName(nameInput.value);
      if (!check.ok) {
        nameErr.textContent = check.error;
        nameInput.focus();
        return;
      }
      save.disabled = true;
      save.textContent = 'Saving';
      setName(check.name, handleInput.value, user).then(function (res) {
        // A failed cloud sync is NOT reported as a failed save. The name is
        // already live in this browser and the next hydrate will push it up;
        // telling someone their name did not save when it visibly did is the
        // worse of the two lies.
        close(res);
      });
    }

    save.addEventListener('click', commit);
    later.addEventListener('click', function () { close(null); });
    back.addEventListener('mousedown', function (e) { if (e.target === back) close(null); });
    doc.addEventListener('keydown', onKey, true);

    (doc.body || doc.documentElement).appendChild(back);
    openDialog = { promise: promise, close: close };
    try { nameInput.focus(); nameInput.select(); } catch (e) {}
    return promise;
  }

  global.DBIdentity = {
    forId: forId,
    forUser: forUser,
    forBrowser: function () { return forId(browserSeed()); },
    openEditor: openEditor,
    generatedFor: function (user) { return forId(user && user.uid ? user.uid : browserSeed()); },
    needsName: needsName,
    setName: setName,
    clearName: clearName,
    hydrate: hydrate,
    suggest: suggest,
    cleanName: cleanName,
    cleanUsername: cleanUsername,
    validateName: validateName,
    NAME_MAX: NAME_MAX,
    USERNAME_MAX: USERNAME_MAX
  };
})(window);
