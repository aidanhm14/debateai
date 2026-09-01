/* Debatable avatar account sync.
 *
 * Joins the profile portrait and live masked-avatar stores into one
 * owner-only user_profiles/{uid}.avatarIdentity record. Public surfaces do
 * not read that profile document. They receive only publicIdentity(), a
 * compact sanitized renderer config copied into the user's own public round
 * or matchmaking write.
 */
(function (global) {
  'use strict';

  var PORTRAIT_KEY = 'debatable-avatar';
  var LIVE_KEY = 'debatable-live-avatar-v1';
  var LOOKS_KEY = 'debatable-avatar-looks-v1';
  /* 2026-09-01: the picked picture tile (js/pfp-set.js) joins the record.
     avatar.js's setPfp() wrote these two keys and dispatched the same
     change event this file already listens to, so the push fired and the
     record it pushed carried no pfp: a tile picked on a laptop rendered
     as a generated face on the phone. Both are RAW strings, not JSON, so
     they go through readRaw/writeRaw rather than read/write. */
  var PFP_KEY = 'debatable-pfp-v1';
  var PREF_KEY = 'debatable-avatar-pref';
  var META_KEY = 'debatable-avatar-sync-v1';
  var PORTRAIT_EVT = 'debatable-avatar-change';
  var LIVE_EVT = 'debatable-avatar-design';
  var READY_EVT = 'debatable-avatar-account-ready';
  /* v2 added pfpId + pref. A v1 record predates them and therefore makes
     NO statement about the picked picture, so applyRecord leaves the two
     local keys alone rather than clearing a pick every time an old cached
     client's record hydrates. Only a v2+ record may write or clear them. */
  var VERSION = 2;
  var applyingRemote = false;
  var currentUser = null;
  var db = null;
  var pushTimer = 0;

  /* The design keys this sync will carry. They MUST cover everything the
     designer offers, because every one of them is a sanitiser with a
     fallback: a key missing from this list is not rejected, it is
     silently replaced by the default and then written back over the
     user's own local storage by applyRecord().

     2026-08-24, from a report of "it's not saving my profile picture when
     I change it". These five lists had fallen behind js/cam-avatar.js by
     one release of options: three scenes, three colours, three outfits,
     four masks and three eye shapes existed in the designer and not here.
     Measured on the founder's account: picking the Oni mask, Gold, and
     the Neon scene and pressing Save left arena / crimson / blade in
     local storage within two seconds, and pushed the same fallbacks to
     the account. Nothing errored. The layer meant to protect the choice
     was the layer discarding it.

     Kept in step by scripts/test-avatar-design.mjs, which reads the
     designer's own option table and fails the commit if these disagree.
     At runtime we prefer that table directly when the designer is loaded,
     so a page that has both cannot drift even between commits. */
  var SCENES = ['arena','skyline','library','studio','orbit','forest','chamber','neon','void'];
  var ACCENTS = ['crimson','electric','violet','teal','rose','silver','gold','lime','ice'];
  var OUTFITS = ['ink','navy','plum','pine','slate','rust','bone','royal'];
  var MASKS = ['blade','classic','visor','wing','oni','plate','slim'];
  var EYES = ['focus','sharp','open','calm','round','keen','hooded'];
  function offered(group, fallbackList) {
    try {
      var table = global.DebateCam && global.DebateCam.designOptions;
      var opts = table && table[group];
      if (opts && opts.length) {
        return opts.map(function (o) { return o && o.key; }).filter(Boolean);
      }
    } catch (e) {}
    return fallbackList;
  }

  function read(key, fallback) {
    try { var raw = global.localStorage.getItem(key); return raw ? JSON.parse(raw) : fallback; }
    catch (e) { return fallback; }
  }
  function write(key, value) {
    try {
      if (value == null) global.localStorage.removeItem(key);
      else global.localStorage.setItem(key, JSON.stringify(value));
    } catch (e) {}
  }
  function valid(value, list, fallback) { return list.indexOf(value) >= 0 ? value : fallback; }
  function cleanDesign(d) {
    d = d || {};
    return {
      scene: valid(d.scene, offered('scene', SCENES), 'arena'),
      accent: valid(d.accent, offered('accent', ACCENTS), 'crimson'),
      outfit: valid(d.outfit, offered('outfit', OUTFITS), 'ink'),
      mask: valid(d.mask, offered('mask', MASKS), 'blade'),
      eyes: valid(d.eyes, offered('eyes', EYES), 'focus')
    };
  }
  function cleanPortrait(c) {
    if (!c || typeof c !== 'object' || Array.isArray(c)) return null;
    var out = {};
    Object.keys(c).slice(0, 20).forEach(function (key) {
      var n = Number(c[key]);
      if (Number.isFinite(n)) out[key] = Math.max(0, Math.min(20, Math.floor(n)));
    });
    return Object.keys(out).length ? out : null;
  }
  function cleanLooks(value) {
    value = value || {};
    var looks = Array.isArray(value.looks) ? value.looks : [];
    var seen = {};
    looks = looks.slice(0, 8).map(function (look, index) {
      look = look || {};
      var id = String(look.id || ('look-' + index)).replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64) || ('look-' + index);
      if (seen[id]) id += '-' + index;
      seen[id] = true;
      return {
        id: id,
        name: String(look.name || ('Look ' + (index + 1))).trim().slice(0, 32) || ('Look ' + (index + 1)),
        design: cleanDesign(look.design),
        updatedAtMs: Math.max(0, Number(look.updatedAtMs) || 0)
      };
    });
    var activeId = String(value.activeId || '').slice(0, 64);
    if (!looks.some(function (look) { return look.id === activeId; })) activeId = looks[0] ? looks[0].id : '';
    return { activeId: activeId, looks: looks, updatedAtMs: Math.max(0, Number(value.updatedAtMs) || 0) };
  }
  function readRaw(key) {
    try { return global.localStorage.getItem(key) || ''; } catch (e) { return ''; }
  }
  function writeRaw(key, value) {
    try {
      if (value) global.localStorage.setItem(key, String(value));
      else global.localStorage.removeItem(key);
    } catch (e) {}
  }
  /* The pfp branch has NO fallback on purpose (the avatar.js rule): there
     is no sensible default picture, so an unknown or unwearable id DROPS
     rather than putting a tile on somebody who never picked it. canWear,
     not has: the library also carries the photo tier the first-screen
     rail draws from, and those must never become an account's identity.
     The library is only consulted when this page happens to have it
     loaded; otherwise the shape-checked id is carried through, and
     render-time normPublicIdentity still gates wearing it, so a page
     without js/pfp-set.js cannot strip a pick it cannot verify. */
  function cleanPfpId(id) {
    if (typeof id !== 'string' || !/^[a-zA-Z0-9_-]{1,32}$/.test(id)) return null;
    try {
      var lib = global.DBPfp;
      if (lib) {
        var ok = lib.canWear ? lib.canWear(id) : lib.has(id);
        return ok ? id : null;
      }
    } catch (e) {}
    return id;
  }
  // Only the two values avatar.js ever writes. Anything else reads as
  // "never chose", which falls back to the pre-picker identity order.
  function cleanPref(value) {
    return value === 'pfp' || value === 'portrait' ? value : '';
  }
  function meta() { return read(META_KEY, {}) || {}; }
  function localRecord() {
    var portrait = cleanPortrait(read(PORTRAIT_KEY, null));
    var liveRaw = read(LIVE_KEY, null);
    var live = liveRaw ? cleanDesign(liveRaw) : null;
    var looks = cleanLooks(read(LOOKS_KEY, {}));
    return {
      version: VERSION,
      updatedAtMs: Math.max(0, Number(meta().updatedAtMs) || 0),
      portraitConfig: portrait,
      liveDesign: live,
      liveLooks: looks,
      pfpId: cleanPfpId(readRaw(PFP_KEY)),
      pref: cleanPref(readRaw(PREF_KEY))
    };
  }
  function hasIdentity(record) { return !!(record && (record.portraitConfig || record.liveDesign || record.pfpId)); }
  function touch() {
    var m = meta(); m.updatedAtMs = Date.now(); write(META_KEY, m);
  }
  function publicIdentity() {
    try {
      var signedIn = global.firebase && global.firebase.auth ? global.firebase.auth().currentUser : null;
      var owner = String(meta().uid || '');
      if (signedIn && owner && signedIn.uid !== owner) return null;
    } catch (e) {}
    if (global.DBAvatar && global.DBAvatar.getPublicIdentity) {
      var id = global.DBAvatar.getPublicIdentity();
      if (!id) return null;
      if (id.kind === 'live') return { kind:'live', design:cleanDesign(id.design) };
      if (id.kind === 'portrait') return { kind:'portrait', config:cleanPortrait(id.config) };
      if (id.kind === 'pfp') {
        // Drop, never default: an id the set does not wear returns null
        // and the caller falls back, rather than this layer inventing a
        // picture (or, as before this branch existed, falling through and
        // publishing the live or portrait identity the person deliberately
        // switched away from).
        var picked = cleanPfpId(id.id);
        return picked ? { kind:'pfp', id:picked } : null;
      }
    }
    var record = localRecord();
    // Same order as avatar.js getPublicIdentity: the kind chosen LAST wins,
    // then the pre-picker fallback order.
    if (record.pref === 'pfp' && record.pfpId) return { kind:'pfp', id:record.pfpId };
    if (record.pref === 'portrait' && record.portraitConfig) return { kind:'portrait', config:record.portraitConfig };
    if (record.liveDesign) return { kind:'live', design:record.liveDesign };
    if (record.portraitConfig) return { kind:'portrait', config:record.portraitConfig };
    return record.pfpId ? { kind:'pfp', id:record.pfpId } : null;
  }
  function dispatch(record) {
    try { global.dispatchEvent(new CustomEvent(PORTRAIT_EVT, { detail:record.portraitConfig || null })); } catch (e) {}
    try { global.dispatchEvent(new CustomEvent(LIVE_EVT, { detail:record.liveDesign || null })); } catch (e) {}
    try { global.dispatchEvent(new CustomEvent(READY_EVT, { detail:publicIdentity() })); } catch (e) {}
  }
  function applyRecord(remote) {
    remote = remote || {};
    var record = {
      version: VERSION,
      updatedAtMs: Math.max(0, Number(remote.updatedAtMs) || Date.now()),
      portraitConfig: cleanPortrait(remote.portraitConfig),
      liveDesign: remote.liveDesign ? cleanDesign(remote.liveDesign) : null,
      liveLooks: cleanLooks(remote.liveLooks),
      pfpId: cleanPfpId(remote.pfpId),
      pref: cleanPref(remote.pref)
    };
    applyingRemote = true;
    write(PORTRAIT_KEY, record.portraitConfig);
    write(LIVE_KEY, record.liveDesign);
    write(LOOKS_KEY, record.liveLooks);
    if (Number(remote.version) >= 2) {
      writeRaw(PFP_KEY, record.pfpId);
      writeRaw(PREF_KEY, record.pref);
    } else {
      // A v1 record makes no statement about the picked picture (see the
      // VERSION note above), so the local pick stands and the record we
      // report reflects it.
      record.pfpId = cleanPfpId(readRaw(PFP_KEY));
      record.pref = cleanPref(readRaw(PREF_KEY));
    }
    write(META_KEY, { updatedAtMs:record.updatedAtMs, uid:currentUser ? currentUser.uid : '' });
    dispatch(record);
    applyingRemote = false;
    return record;
  }
  function pushNow() {
    if (!currentUser || currentUser.isAnonymous || !db) return Promise.resolve(false);
    var record = localRecord();
    return db.collection('user_profiles').doc(currentUser.uid).set({
      avatarIdentity: record,
      avatarIdentityUpdatedAt: global.firebase.firestore.FieldValue.serverTimestamp()
    }, { merge:true }).then(function () {
      var m = meta(); m.uid = currentUser.uid; write(META_KEY, m);
      return true;
    }).catch(function (e) {
      console.warn('[avatar-account] sync failed', e && e.message);
      return false;
    });
  }
  function schedulePush() {
    if (applyingRemote) return;
    touch();
    clearTimeout(pushTimer);
    pushTimer = setTimeout(pushNow, 260);
  }
  function hydrate(user) {
    currentUser = user || null;
    if (!currentUser || currentUser.isAnonymous || !db) { dispatch(localRecord()); return; }
    db.collection('user_profiles').doc(currentUser.uid).get().then(function (snap) {
      var data = snap.exists ? (snap.data() || {}) : {};
      var remote = data.avatarIdentity || null;
      var local = localRecord();
      var remoteAt = remote ? Math.max(0, Number(remote.updatedAtMs) || 0) : 0;
      var localAt = local.updatedAtMs;
      var localOwner = String(meta().uid || '');
      // A browser may be shared by two accounts. An anonymous design can
      // become the first signed-in account's design, but never copy one
      // account's saved looks into a different account.
      if (localOwner && localOwner !== currentUser.uid) {
        // Force the current version so applyRecord affirmatively clears or
        // replaces the picked-picture keys too: this branch exists so one
        // account's identity cannot leak onto another on a shared browser,
        // and the pfp pick is part of that identity. Without the stamp a
        // v1 remote would leave the previous account's tile standing.
        var incoming = remote && hasIdentity(remote) ? remote : { updatedAtMs:remoteAt || Date.now() };
        applyRecord(Object.assign({}, incoming, { version: VERSION }));
        return;
      }
      if (remote && hasIdentity(remote) && (!hasIdentity(local) || remoteAt > localAt)) applyRecord(remote);
      else if (hasIdentity(local)) pushNow();
      else dispatch(local);
    }).catch(function (e) {
      console.warn('[avatar-account] hydrate failed', e && e.message);
      dispatch(localRecord());
    });
  }
  function boot(attempt) {
    attempt = attempt || 0;
    if (!global.firebase || !global.firebase.auth || !global.firebase.firestore) {
      if (attempt < 20) setTimeout(function () { boot(attempt + 1); }, 400);
      return;
    }
    try {
      db = global.firebase.firestore();
      global.firebase.auth().onAuthStateChanged(hydrate);
    } catch (e) {
      if (attempt < 20) setTimeout(function () { boot(attempt + 1); }, 400);
    }
  }

  global.addEventListener(PORTRAIT_EVT, schedulePush);
  global.addEventListener(LIVE_EVT, schedulePush);
  global.DBAvatarAccount = {
    localRecord: localRecord,
    publicIdentity: publicIdentity,
    applyRecord: applyRecord,
    sync: pushNow,
    hydrate: hydrate,
    READY_EVENT: READY_EVT
  };
  boot();
})(window);
