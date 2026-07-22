/* prefs-sync.js — settings follow the account, not the browser (2026-07-22)
 *
 * Every preference on this site lived in localStorage: theme, language,
 * TTS provider, judge paradigm, voice-round pacing, the "don't show me
 * that again" flags. A signed-in debater opening the site on a second
 * device got a factory reset even though their rounds, cases and files
 * now follow them. This mirrors a whitelist of those keys onto
 * user_profiles/{uid}.prefs and merges both ways on sign-in.
 *
 * Design notes worth keeping:
 *
 * - LAST WRITE WINS, PER KEY, BY TIMESTAMP — not "server wins". A blanket
 *   server-wins would undo a change made seconds earlier on this device
 *   (flip the theme, then sync fires and flips it back). Each key carries
 *   its own {v, t} so the newer edit survives whichever side it came from.
 *
 * - We hook localStorage.setItem rather than editing ~15 call sites across
 *   six single-file pages. Every page keeps writing localStorage exactly
 *   as it does today; this module notices the whitelisted ones and
 *   debounces a push. The hook always calls through to the real setItem
 *   first, inside a try, so a failure here can never break a page's own
 *   storage write.
 *
 * - SECRETS AND EXPERIMENTS ARE EXCLUDED, deliberately, and the exclusion
 *   is the point of the whitelist being explicit rather than a prefix
 *   match. debateos-anthropic-key is the user's own Anthropic key and has
 *   no business in our database. The da-*-ab / debateos-ab-* keys are A/B
 *   arm assignments; syncing those would move a visitor between arms
 *   mid-experiment and quietly corrupt the results. Device ids, anon
 *   usage counters and PWA install prompts are per-device by definition.
 */
(function () {
  'use strict';

  // Preferences, in the sense of "a choice the person made that should
  // still be true tomorrow on their phone".
  var SYNCED_KEYS = [
    // appearance
    'da-theme', 'debateos-theme', 'debateos-lighting', 'da-sfx-muted',
    // language
    'debateos-locale', 'debateos-ai-lang',
    // round setup
    'da-setup-mode', 'debateos-tts-provider', 'debateos-judge-paradigm',
    'debateos-judge-paradigm-custom', 'debateos-judge-pool',
    'debateos-skip-ai-countdown', 'debateos-auto-mic',
    'debateos-spar-format', 'debateos-spar-paradigm',
    'debateos-newvoice-diff', 'debateos-newvoice-pace', 'debateos-newvoice-theme',
    // consent + identity
    'debateos-corpus-contribute', 'debateos-use-case', 'debateos-use-case-confirmed',
    // "stop showing me this" — the most annoying thing to lose on a new device
    'debateos-da-onboarded', 'da-welcome-intro', 'debateos-feedback-given',
    'debateos-hindi-prompt-dismissed', 'debateos-support-snooze',
    // small user content
    'debateos-starred-motions'
  ];
  var KEYSET = {};
  SYNCED_KEYS.forEach(function (k) {KEYSET[k] = 1;});

  var META_KEY = 'debateos-prefs-meta';   // { key: timestamp } for local edits
  var PUSH_DEBOUNCE_MS = 1800;
  var pushTimer = null;
  var dirty = {};
  var currentUid = '';

  function readMeta() {
    try {return JSON.parse(localStorage.getItem(META_KEY) || '{}') || {};} catch (e) {return {};}
  }
  function writeMeta(m) {
    try {localStorage.setItem(META_KEY, JSON.stringify(m));} catch (e) {}
  }

  /* ── capture local edits ─────────────────────────────────────────── */
  try {
    var nativeSet = localStorage.setItem.bind(localStorage);
    localStorage.setItem = function (key, value) {
      nativeSet(key, value);
      try {
        if (KEYSET[key]) {
          var m = readMeta();
          m[key] = Date.now();
          writeMeta(m);
          dirty[key] = 1;
          schedulePush();
        }
      } catch (e) {}
    };
  } catch (e) {}

  function schedulePush() {
    if (!currentUid) return;
    if (pushTimer) clearTimeout(pushTimer);
    pushTimer = setTimeout(push, PUSH_DEBOUNCE_MS);
  }

  function db() {
    try {
      if (!window.firebase || !firebase.apps || !firebase.apps.length) return null;
      return firebase.firestore();
    } catch (e) {return null;}
  }

  function push() {
    pushTimer = null;
    var d = db();
    if (!d || !currentUid) return;
    var keys = Object.keys(dirty);
    if (!keys.length) return;
    dirty = {};
    var meta = readMeta();
    var patch = {};
    keys.forEach(function (k) {
      var v = null;
      try {v = localStorage.getItem(k);} catch (e) {}
      // A cleared preference is a preference: null means "unset", and it
      // has to travel or the other device keeps resurrecting the value.
      patch['prefs.' + k] = { v: v, t: meta[k] || Date.now() };
    });
    try {
      d.collection('user_profiles').doc(currentUid).set({ prefs: {} }, { merge: true }).then(function () {
        return d.collection('user_profiles').doc(currentUid).update(patch);
      }).catch(function () {});
    } catch (e) {}
  }

  /* ── merge on sign-in ────────────────────────────────────────────── */
  function pull(uid) {
    var d = db();
    if (!d) return;
    d.collection('user_profiles').doc(uid).get().then(function (doc) {
      var server = doc.exists && doc.data() && doc.data().prefs || {};
      var meta = readMeta();
      var changed = [];
      var toPush = {};

      SYNCED_KEYS.forEach(function (k) {
        var local = null;
        try {local = localStorage.getItem(k);} catch (e) {}
        var localT = meta[k] || 0;
        var remote = server[k];
        var remoteT = remote && remote.t || 0;

        if (remote && remoteT > localT) {
          // Server edit is newer: adopt it.
          try {
            if (remote.v === null || typeof remote.v === 'undefined') localStorage.removeItem(k);else
            localStorage.setItem(k, remote.v);
          } catch (e) {}
          meta[k] = remoteT;
          if (local !== remote.v) changed.push(k);
        } else if (local !== null && (!remote || localT > remoteT)) {
          // Local is newer, or the server has never seen this key at all
          // — which is every preference set before this file existed, so
          // the first sign-in after shipping adopts what the user already
          // had rather than waiting for them to change it again.
          if (!meta[k]) meta[k] = Date.now();
          toPush[k] = 1;
        }
      });

      writeMeta(meta);
      if (Object.keys(toPush).length) {
        dirty = Object.assign(dirty, toPush);
        push();
      }
      if (changed.length) applyLive(changed);
    }).catch(function () {});
  }

  /* Some preferences are visible immediately and would otherwise sit
   * wrong until the next navigation. Theme is the one people notice, so
   * it gets applied in place; everything else rides the event, which
   * pages can listen for if they want to re-read without a reload. */
  function applyLive(changed) {
    try {
      if (changed.indexOf('da-theme') !== -1 || changed.indexOf('debateos-lighting') !== -1) {
        var theme = null;
        try {theme = localStorage.getItem('da-theme');} catch (e) {}
        if (theme) {
          document.documentElement.setAttribute('data-theme', theme);
          document.documentElement.setAttribute('data-lighting', theme === 'light' ? 'light' : 'dark');
        }
      }
    } catch (e) {}
    try {
      window.dispatchEvent(new CustomEvent('prefs-synced', { detail: { changed: changed } }));
    } catch (e) {}
  }

  /* ── wait for auth ───────────────────────────────────────────────── */
  // Firebase is deferred on every page that loads it, and some pages
  // never load it at all. Poll briefly, then give up quietly: a page
  // without Firebase simply keeps its localStorage behaviour.
  var tries = 0;
  var waiting = setInterval(function () {
    tries++;
    var ready = false;
    try {ready = !!(window.firebase && firebase.apps && firebase.apps.length && firebase.auth);} catch (e) {}
    if (ready) {
      clearInterval(waiting);
      try {
        firebase.auth().onAuthStateChanged(function (u) {
          if (!u) {currentUid = '';return;}
          if (currentUid === u.uid) return;
          currentUid = u.uid;
          pull(u.uid);
        });
      } catch (e) {}
    } else if (tries > 40) {
      clearInterval(waiting);
    }
  }, 250);

  // Anything still queued when the tab goes away.
  try {
    window.addEventListener('pagehide', function () {if (pushTimer) push();});
  } catch (e) {}
})();
